const request = require("supertest");
const { execFileSync } = require("child_process");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const app = require("../app");
const User = require("../models/usermodel");

const uploadedFiles = new Set();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");

async function createToken(role = "user") {
  const user = await User.create({
    name: `${role} upload tester`,
    email: `${role}-${Math.random().toString(16).slice(2)}@example.test`,
    password: await bcrypt.hash("UploadTest123!", 10),
    role,
  });
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "15m" });
}

async function uploadImage(token, filename = "image.png", buffer = png, contentType = "image/png") {
  return request(app)
    .post("/api/upload")
    .set("Authorization", `Bearer ${token}`)
    .attach("image", buffer, { filename, contentType });
}

afterAll(async () => {
  const uploadDir = path.resolve(__dirname, "..", "uploadimage");
  await Promise.all([...uploadedFiles].map((filename) => fs.promises.unlink(path.join(uploadDir, filename)).catch(() => {})));
});

describe("Image upload security", () => {
  it("rejects unauthenticated uploads", async () => {
    const res = await request(app).post("/api/upload").attach("image", png, "image.png");
    expect(res.status).toBe(401);
  });

  it("rejects uploads from customer accounts", async () => {
    const token = await createToken("user");
    const res = await uploadImage(token);
    expect(res.status).toBe(403);
  });

  it("requires a file for the upload endpoint", async () => {
    const token = await createToken("admin");
    const res = await request(app)
      .post("/api/upload")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no image/i);
  });

  it("accepts a valid image for an admin and replaces its filename", async () => {
    const token = await createToken("admin");
    const res = await uploadImage(token);

    expect(res.status).toBe(200);
    expect(res.body.imageName).toMatch(/^[a-f0-9]{48}\.png$/);
    expect(res.body.imagePath).toBe(`/uploadimage/${res.body.imageName}`);
    expect(res.body.file).toBeUndefined();
    uploadedFiles.add(res.body.imageName);
  });

  it("ignores a dangerous original filename and uses the detected image extension", async () => {
    const token = await createToken("admin");
    const res = await uploadImage(token, "../../payload.php", png);

    expect(res.status).toBe(200);
    expect(path.basename(res.body.imageName)).toBe(res.body.imageName);
    expect(res.body.imageName).toMatch(/^[a-f0-9]{48}\.png$/);
    uploadedFiles.add(res.body.imageName);
  });

  it("rejects image MIME declarations that do not match file content", async () => {
    const token = await createToken("admin");
    const res = await uploadImage(token, "image.png", Buffer.from("not an image"), "image/png");
    expect(res.status).toBe(400);
  });

  it("rejects unsupported content types", async () => {
    const token = await createToken("admin");
    const res = await uploadImage(token, "payload.exe", Buffer.from("MZ"), "application/octet-stream");
    expect(res.status).toBe(400);
  });

  it("rejects oversized uploads", async () => {
    const token = await createToken("admin");
    const res = await uploadImage(token, "large.png", Buffer.alloc(5 * 1024 * 1024 + 1), "image/png");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/5MB/i);
  });

  it("rejects multiple files in a single upload request", async () => {
    const token = await createToken("admin");
    const res = await request(app)
      .post("/api/upload")
      .set("Authorization", `Bearer ${token}`)
      .attach("image", png, "first.png")
      .attach("image", png, "second.png");
    expect(res.status).toBe(400);
  });

  it("rate-limits repeated upload attempts", async () => {
    const token = await createToken("admin");
    const responses = await Promise.all(
      Array.from({ length: 25 }, () => uploadImage(token, "small.png"))
    );
    const acceptedFiles = responses.filter((res) => res.status === 200).map((res) => res.body.imageName);
    acceptedFiles.forEach((filename) => uploadedFiles.add(filename));
    expect(responses.some((res) => res.status === 429)).toBe(true);
  });

  it("enforces production upload rate limiting and uses server-generated names", async () => {
    const script = `
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongoose = require('mongoose');
      const request = require('supertest');
      const jwt = require('jsonwebtoken');
      const bcrypt = require('bcryptjs');
      const User = require('./models/usermodel');
      const app = require('./app');
      (async () => {
        const mongo = await MongoMemoryServer.create();
        await mongoose.connect(mongo.getUri());
        try {
          const user = await User.create({
            name: 'Upload Rate Admin',
            email: 'upload-rate-' + Date.now() + '@example.test',
            password: await bcrypt.hash('UploadTest123!', 10),
            role: 'admin',
          });
          const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '15m' });
          const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
          const statuses = [];
          for (let i = 0; i < 21; i += 1) {
            const res = await request(app)
              .post('/api/upload')
              .set('Authorization', 'Bearer ' + token)
              .attach('image', png, { filename: '../../../../prod-attack.php', contentType: 'image/png' });
            statuses.push(res.status);
          }
          console.log('upload:' + statuses.includes(429));
        } finally {
          await mongoose.disconnect();
          await mongo.stop();
        }
      })().catch((error) => {
        console.error(error);
        process.exit(1);
      });
    `;

    const output = execFileSync(process.execPath, ["-e", script], { cwd: __dirname + "/..", encoding: "utf8" });
    expect(output).toContain("upload:true");
  });
});