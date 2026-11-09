const path = require("path");
const net = require("net");
const root = path.resolve(__dirname, "..");
const dotenv = require(path.join(root, "node_modules/dotenv"));
// Prevent app.js from loading a developer environment file in this isolated run.
dotenv.config = () => ({ parsed: {} });

const mongoose = require(path.join(root, "node_modules/mongoose"));
const bcrypt = require(path.join(root, "node_modules/bcryptjs"));
const { MongoMemoryReplSet } = require(path.join(root, "node_modules/mongodb-memory-server"));

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "playwright-local-test-secret-0123456789abcdef";
process.env.JWT_EXPIRES_IN = "15m";
process.env.EMAIL_HOST = process.env.EMAIL_HOST || "127.0.0.1";
process.env.EMAIL_PORT = process.env.EMAIL_PORT || "8025";
process.env.EMAIL_FROM = process.env.EMAIL_FROM || "ALFREDO Store <no-reply@alfredo.test>";

function decodeQuotedPrintable(str) {
  return str.replace(/=\r?\n/g, "").replace(/=([a-fA-F0-9]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

class SmtpSandbox {
  constructor(port = 8025) {
    this.port = Number(port);
    this.emails = [];
    this.failMode = false;
    this.server = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        let buffer = "";
        let inData = false;
        let dataBuffer = "";
        let currentMail = { to: [], from: "", raw: "" };

        socket.write("220 127.0.0.1 Alfredo-Test-SMTP ready\r\n");

        socket.on("data", (chunk) => {
          buffer += chunk.toString("utf8");

          while (buffer.includes("\r\n")) {
            const lineEnd = buffer.indexOf("\r\n");
            const line = buffer.slice(0, lineEnd);
            buffer = buffer.slice(lineEnd + 2);

            if (inData) {
              if (line === ".") {
                inData = false;
                if (this.failMode) {
                  socket.write("451 Requested action aborted: local error in processing\r\n");
                } else {
                  currentMail.raw = dataBuffer;
                  currentMail.decoded = decodeQuotedPrintable(dataBuffer);
                  const tokenMatch = currentMail.decoded.match(/token=([a-f0-9]{64})/);
                  if (tokenMatch) currentMail.token = tokenMatch[1];

                  const headerEnd = dataBuffer.indexOf("\r\n\r\n");
                  let headers = "";
                  let body = dataBuffer;
                  if (headerEnd !== -1) {
                    headers = dataBuffer.slice(0, headerEnd);
                    body = dataBuffer.slice(headerEnd + 4);
                  }
                  const subjectMatch = headers.match(/^Subject:\s*(.*)$/im);
                  const toMatch = headers.match(/^To:\s*(.*)$/im);
                  const fromMatch = headers.match(/^From:\s*(.*)$/im);

                  currentMail.subject = subjectMatch ? subjectMatch[1].trim() : "";
                  currentMail.headerTo = toMatch ? toMatch[1].trim() : "";
                  currentMail.headerFrom = fromMatch ? fromMatch[1].trim() : "";
                  currentMail.body = body;
                  currentMail.receivedAt = new Date().toISOString();

                  this.emails.push(currentMail);
                  socket.write("250 2.0.0 OK: message queued\r\n");
                }
                currentMail = { to: [], from: "", raw: "" };
                dataBuffer = "";
              } else {
                dataBuffer += (line.startsWith("..") ? line.slice(1) : line) + "\r\n";
              }
              continue;
            }

            const upper = line.toUpperCase();
            if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
              socket.write("250-127.0.0.1 Hello\r\n250-8BITMIME\r\n250 OK\r\n");
            } else if (upper.startsWith("MAIL FROM:")) {
              if (this.failMode) {
                socket.write("451 Requested action aborted\r\n");
              } else {
                currentMail.from = line.slice(10).trim().replace(/^<|>$/g, "");
                socket.write("250 2.1.0 OK\r\n");
              }
            } else if (upper.startsWith("RCPT TO:")) {
              currentMail.to.push(line.slice(8).trim().replace(/^<|>$/g, ""));
              socket.write("250 2.1.5 OK\r\n");
            } else if (upper === "DATA") {
              if (this.failMode) {
                socket.write("451 Requested action aborted\r\n");
              } else {
                inData = true;
                dataBuffer = "";
                socket.write("354 Start mail input; end with <CRLF>.<CRLF>\r\n");
              }
            } else if (upper === "RSET") {
              currentMail = { to: [], from: "", raw: "" };
              inData = false;
              dataBuffer = "";
              socket.write("250 2.0.0 OK\r\n");
            } else if (upper === "QUIT") {
              socket.write("221 2.0.0 Service closing transmission channel\r\n");
              socket.end();
            } else if (upper.startsWith("NOOP")) {
              socket.write("250 2.0.0 OK\r\n");
            } else {
              socket.write("250 OK\r\n");
            }
          }
        });
      });

      this.server.listen(this.port, "127.0.0.1", () => resolve());
      this.server.on("error", reject);
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) this.server.close(resolve);
      else resolve();
    });
  }
}

let memoryDatabase;
let server;
let smtpSandbox;

async function start() {
  memoryDatabase = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(memoryDatabase.getUri());

  const Category = require(path.join(root, "models/categoryModel"));
  const Product = require(path.join(root, "models/productModel"));
  const User = require(path.join(root, "models/usermodel"));
  const Cart = require(path.join(root, "models/cartModel"));
  const Order = require(path.join(root, "models/orderModel"));
  const orderFixtureId = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");
  const category = await Category.create({ name: "Browser QA", description: "Deterministic isolated Playwright fixture" });
  const product = await Product.create({
    _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439012"),
    name: "Browser QA Mouse",
    description: "A deterministic fixture used only by isolated browser tests.",
    price: 49,
    category: category._id,
    stock: 8,
    status: "active",
    publicationState: "published",
  });
  await Product.create({
    _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439013"),
    name: "Browser QA Keyboard",
    description: "A second deterministic fixture used only by isolated browser tests.",
    price: 25,
    category: category._id,
    stock: 8,
    status: "active",
    publicationState: "published",
  });

  smtpSandbox = new SmtpSandbox(Number(process.env.EMAIL_PORT || 8025));
  await smtpSandbox.start();

  const password = await bcrypt.hash("Passw0rd!", 10);
  const customer = await User.create({
    name: "Browser QA Customer",
    email: "qa.customer@example.com",
    password,
    role: "user",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  const otherCustomer = await User.create({
    name: "Other QA Customer",
    email: "qa.other@example.com",
    password,
    role: "user",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  await Cart.create({
    user: customer._id,
    items: [{ product: product._id, product_id: String(product._id), name: product.name, price: product.price, category: category.name, quantity: 1 }],
  });
  const order = await Order.create({
    _id: orderFixtureId,
    user: customer._id,
    items: [{ product: product._id, product_id: String(product._id), name: product.name, price: product.price, quantity: 1 }],
    shippingAddress: { fullName: "Browser QA Customer", phone: "01000000000", line1: "Test Street", city: "Cairo", country: "EG" },
    paymentMethod: "cod",
    totalAmount: 49,
  });
  void otherCustomer;

  const app = require(path.join(root, "app"));
  const Token = require(path.join(root, "models/tokenModel"));

  // Test helper routes for browser test automation & verification
  app.get("/_test/emails", (req, res) => {
    res.json({ status: "success", count: smtpSandbox.emails.length, data: smtpSandbox.emails });
  });

  app.delete("/_test/emails", (req, res) => {
    smtpSandbox.emails = [];
    res.json({ status: "success", message: "Inbox cleared" });
  });

  app.post("/_test/smtp-mode", (req, res) => {
    smtpSandbox.failMode = Boolean(req.body?.fail);
    res.json({ status: "success", failMode: smtpSandbox.failMode });
  });

  app.post("/_test/expire-user-token", async (req, res) => {
    const { email } = req.body;
    await User.updateOne({ email }, { emailVerificationExpiresAt: new Date(Date.now() - 1000) });
    res.json({ status: "success" });
  });

  app.post("/_test/expire-reset-token", async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (user) {
      await Token.updateMany({ user: user._id, type: "reset" }, { expiresAt: new Date(Date.now() - 1000) });
    }
    res.json({ status: "success" });
  });

  app.post("/_test/reset-resend-cooldown", async (req, res) => {
    const { email } = req.body;
    await User.updateOne({ email }, { emailVerificationSentAt: new Date(Date.now() - 120_000) });
    res.json({ status: "success" });
  });

  app.post("/_test/seed-legacy-account", async (req, res) => {
    const { name, email, password: pwd } = req.body;
    const hashedPassword = await bcrypt.hash(pwd || "Passw0rd!", 10);
    // Legacy account created without emailVerified or googleSub
    const user = await User.create({
      name: name || "Legacy Customer",
      email,
      password: hashedPassword,
      role: "user",
      emailVerified: false,
    });
    res.json({ status: "success", data: { id: user._id, email: user.email } });
  });

  app.post("/_test/seed-google-account", async (req, res) => {
    const { name, email, googleSub } = req.body;
    const user = await User.create({
      name: name || "Google Customer",
      email,
      googleSub: googleSub || "google-sub-" + Date.now(),
      role: "user",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    res.json({ status: "success", data: { id: user._id, email: user.email } });
  });

  app.get("/_test/user-state/:email", async (req, res) => {
    const user = await User.findOne({ email: req.params.email }).select("+emailVerificationTokenHash +emailVerificationExpiresAt +googleSub");
    if (!user) return res.status(404).json({ status: "fail", message: "User not found" });
    const refreshTokens = await Token.countDocuments({ user: user._id, type: "refresh", revoked: false });
    const resetTokens = await Token.countDocuments({ user: user._id, type: "reset", revoked: false });
    res.json({
      status: "success",
      data: {
        id: user._id,
        email: user.email,
        emailVerified: user.emailVerified,
        emailVerifiedAt: user.emailVerifiedAt,
        hasVerificationToken: Boolean(user.emailVerificationTokenHash),
        isGoogleLinked: Boolean(user.googleSub),
        activeRefreshTokens: refreshTokens,
        activeResetTokens: resetTokens,
      },
    });
  });

  const { webhookService } = require(path.join(root, "controllers/paymentWebhookController"));
  await webhookService.queue.runtime.start();
  const port = Number(process.env.PORT || 8000);
  server = app.listen(port, "127.0.0.1");
  console.log(`Isolated test API listening on 127.0.0.1:${port}`);
}

async function stop() {
  if (server) await new Promise((resolve) => server.close(resolve));
  try { await require(path.join(root, "controllers/paymentWebhookController")).webhookService.queue.runtime.stop(); } catch { /* already stopped */ }
  if (smtpSandbox) await smtpSandbox.stop();
  await mongoose.disconnect();
  if (memoryDatabase) await memoryDatabase.stop();
  process.exit(0);
}

process.on("SIGINT", () => stop().catch(() => process.exit(1)));
process.on("SIGTERM", () => stop().catch(() => process.exit(1)));

start().catch((error) => {
  console.error(`Isolated browser API failed to start: ${error.message}`);
  process.exit(1);
});
