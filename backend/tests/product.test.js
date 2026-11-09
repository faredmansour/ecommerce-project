const request = require("supertest");
const app = require("../app");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const User = require("../models/usermodel");
const Category = require("../models/categoryModel");
const Product = require("../models/productModel");

async function adminToken() {
  const user = await User.create({
    name: "Admin User",
    email: `admin-${Date.now()}@example.com`,
    password: await bcrypt.hash("Passw0rd!", 10),
    role: "admin",
  });
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "15m" });
}

async function createCategory(token, payload = { name: "Electronics", description: "Gadgets" }) {
  const res = await request(app)
    .post("/api/categories")
    .set("Authorization", `Bearer ${token}`)
    .send(payload);
  return res.body;
}

async function createBrand(token, payload = { name: "TechBrand", description: "Example brand" }) {
  const res = await request(app)
    .post("/api/brands")
    .set("Authorization", `Bearer ${token}`)
    .send(payload);
  return res.body;
}

describe("Products", () => {
  it("lists products with pagination metadata", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body).toHaveProperty("page");
    expect(res.body).toHaveProperty("pages");
  });

  it("allows guests to browse categories, search products, and open product details", async () => {
    const category = await Category.create({ name: "Guest Catalog", description: "Public category" });
    const product = await Product.create({
      name: "Guest Search Product",
      description: "Public product details",
      price: 125,
      category: category._id,
      stock: 4,
    });

    const categories = await request(app).get("/api/categories");
    const search = await request(app).get("/api/products").query({ search: "Guest Search Product" });
    const details = await request(app).get(`/api/products/${product._id}`);

    expect(categories.status).toBe(200);
    expect(categories.body.map((item) => item._id)).toContain(String(category._id));
    expect(search.status).toBe(200);
    expect(search.body.products.map((item) => item.name)).toContain(product.name);
    expect(details.status).toBe(200);
    expect(details.body.product).toMatchObject({ name: product.name, description: product.description, price: product.price });
  });

  it("hides non-public lifecycle states while retaining legacy products", async () => {
    const category = await Category.create({ name: "Visibility Test", description: "Visibility test category" });
    const visible = await Product.create({
      name: "Visible Product",
      description: "Published product",
      price: 100,
      category: category._id,
      stock: 10,
    });
    const hiddenStates = [
      { name: "Draft Product", status: "draft", publicationState: "published" },
      { name: "Unpublished Product", status: "active", publicationState: "unpublished" },
      { name: "Archived Product", status: "archived", publicationState: "published" },
    ];
    for (const state of hiddenStates) {
      await Product.create({
        ...state,
        description: "Not publicly visible",
        price: 100,
        category: category._id,
        stock: 10,
      });
    }

    const legacyId = new mongoose.Types.ObjectId();
    await Product.collection.insertOne({
      _id: legacyId,
      name: "Legacy Product",
      description: "Legacy description",
      price: 100,
      category: category._id,
      image: "/uploads/example.jpg",
      stock: 10,
      rating: 4.5,
      reviews_count: 3,
      createdAt: new Date(),
    });

    const listing = await request(app).get("/api/products");
    const names = listing.body.products.map((product) => product.name);
    expect(listing.status).toBe(200);
    expect(names).toContain(visible.name);
    expect(names).toContain("Legacy Product");
    expect(names).not.toContain("Draft Product");
    expect(names).not.toContain("Unpublished Product");
    expect(names).not.toContain("Archived Product");

    const legacyRead = await request(app).get(`/api/products/${legacyId}`);
    expect(legacyRead.status).toBe(200);
    expect(legacyRead.body.product).toMatchObject({
      price: 100,
      stock: 10,
      rating: 4.5,
      reviews_count: 3,
      image: "/uploads/example.jpg",
      status: "active",
      publicationState: "published",
    });
  });

  it("rejects malformed product IDs before database lookup", async () => {
    const res = await request(app).get("/api/products/not-an-object-id");
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid id/i);
  });

  it("verifies search and pagination bounds with deterministic invalid inputs", async () => {
    const category = await Category.create({ name: "Query Test", description: "Query test category" });
    await Product.create({
      name: "[Special] Camera",
      description: "Literal search test",
      price: 20,
      category: category._id,
      stock: 1,
    });

    const normalSearch = await request(app).get("/api/products").query({ search: "Camera" });
    expect(normalSearch.status).toBe(200);
    expect(normalSearch.body.products.length).toBeGreaterThanOrEqual(1);

    const emptySearch = await request(app).get("/api/products").query({ search: "" });
    expect(emptySearch.status).toBe(200);

    const maxLengthSearch = await request(app).get("/api/products").query({ search: "a".repeat(120) });
    expect(maxLengthSearch.status).toBe(200);

    const excessiveSearch = await request(app).get("/api/products").query({ search: "a".repeat(121) });
    expect(excessiveSearch.status).toBe(400);

    const regexMetacharacters = await request(app).get("/api/products").query({ search: "[Special]*.+?$^()" });
    expect(regexMetacharacters.status).toBe(200);

    const pathological = await request(app).get("/api/products").query({ search: "(?:.*.*.*.*.*)" });
    expect(pathological.status).toBe(200);

    const normalPage = await request(app).get("/api/products").query({ page: 1, limit: 10 });
    expect(normalPage.status).toBe(200);
    expect(normalPage.body.page).toBe(1);
    expect(normalPage.body.limit).toBe(10);

    const tooMany = await request(app).get("/api/products").query({ limit: 999999999 });
    expect(tooMany.status).toBe(200);
    expect(tooMany.body.limit).toBeLessThanOrEqual(1000);

    const invalidLimit = await request(app).get("/api/products").query({ limit: "abc" });
    expect(invalidLimit.status).toBe(400);

    const zeroLimit = await request(app).get("/api/products").query({ limit: 0 });
    expect(zeroLimit.status).toBe(400);

    const negativeLimit = await request(app).get("/api/products").query({ limit: -5 });
    expect(negativeLimit.status).toBe(400);

    const invalidPage = await request(app).get("/api/products").query({ page: "abc" });
    expect(invalidPage.status).toBe(400);

    const zeroPage = await request(app).get("/api/products").query({ page: 0 });
    expect(zeroPage.status).toBe(400);

    const negativePage = await request(app).get("/api/products").query({ page: -5 });
    expect(negativePage.status).toBe(400);

    const validCategory = await request(app).get("/api/products").query({ category: category._id.toString() });
    expect(validCategory.status).toBe(200);

    const invalidCategory = await request(app).get("/api/products?category=not-an-id");
    expect(invalidCategory.status).toBe(400);

    const literalSearch = await request(app).get("/api/products").query({ search: "[Special]" });
    expect(literalSearch.status).toBe(200);
    expect(literalSearch.body.products.map((product) => product.name)).toContain("[Special] Camera");
  });

  it("lets an admin create a product", async () => {
    const token = await adminToken();
    const category = await createCategory(token);
    const categoryId = category._id;

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Wireless Mouse")
      .field("description", "Ergonomic wireless mouse")
      .field("price", "29.99")
      .field("stock", "100")
      .field("category", categoryId);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.product.name).toBe("Wireless Mouse");
    expect(res.body.product.price).toBe(29.99);
  });

  it("rejects product creation without a category (400)", async () => {
    const token = await adminToken();
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "No Category")
      .field("price", "10");
    expect(res.status).toBe(400);
  });

  it("rejects invalid lifecycle and publication states", async () => {
    const token = await adminToken();
    const invalidLifecycle = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Invalid State", description: "Invalid lifecycle", price: 10, category: "507f1f77bcf86cd799439011", status: "selling" });
    const invalidPublication = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Invalid Publication", description: "Invalid publication", price: 10, category: "507f1f77bcf86cd799439011", publicationState: "public" });

    expect(invalidLifecycle.status).toBe(400);
    expect(invalidPublication.status).toBe(400);
  });

  it("rejects a product reference to a nonexistent category", async () => {
    const token = await adminToken();
    const malformed = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Malformed Category Product")
      .field("description", "Invalid ID format")
      .field("price", "10")
      .field("category", "not-an-object-id");
    const nonexistent = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Missing Category Product")
      .field("description", "Invalid reference")
      .field("price", "10")
      .field("category", "507f1f77bcf86cd799439011");

    expect(malformed.status).toBe(400);
    expect(nonexistent.status).toBe(400);
    expect(nonexistent.body.message).toMatch(/category reference/i);
  });

  it("keeps categoryIds aligned with the legacy primary category", async () => {
    const token = await adminToken();
    const primary = await Category.create({ name: "Primary Category", description: "Primary" });
    const secondary = await Category.create({ name: "Secondary Category", description: "Secondary" });
    const replacement = await Category.create({ name: "Replacement Category", description: "Replacement" });
    const created = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Classified Product",
        description: "Category mapping",
        price: 20,
        category: String(primary._id),
        categoryIds: [String(secondary._id)],
      });

    expect(created.status).toBe(201);
    expect(created.body.product.categoryIds.map(String)).toEqual([
      String(primary._id),
      String(secondary._id),
    ]);

    const updated = await request(app)
      .put(`/api/products/${created.body.product._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ category: String(replacement._id) });

    expect(updated.status).toBe(200);
    expect(updated.body.product.categoryIds.map(String)).toEqual([
      String(replacement._id),
      String(secondary._id),
    ]);
  });

  it("forbids non-admins from creating products (403)", async () => {
    await request(app).post("/api/auth/register").send({
      name: "Normal User",
      email: "user@example.com",
      password: "Passw0rd!",
    });
    await User.updateOne({ email: "user@example.com" }, { emailVerified: true });
    const token = (await request(app).post("/api/auth/login").send({ email: "user@example.com", password: "Passw0rd!" })).body.data.accessToken;
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Hack")
      .field("price", "10")
      .field("category", "507f1f77bcf86cd799439011");
    expect(res.status).toBe(403);
  });

  it("generates a unique product slug and keeps lifecycle defaults compatible", async () => {
    const token = await adminToken();
    const category = await createCategory(token, { name: "Catalog Slug Test", description: "Catalog slug category" });
    const categoryId = category._id;

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Wireless Keyboard 2025")
      .field("description", "Mechanical keyboard")
      .field("price", "89.99")
      .field("category", categoryId)
      .field("shortDescription", "Premium keyboard")
      .field("highlights", JSON.stringify(["hot-swappable", "bluetooth"]))
      .field("status", "active")
      .field("publicationState", "published");

    expect(res.status).toBe(201);
    expect(res.body.product.slug).toBe("wireless-keyboard-2025");
    expect(res.body.product.canonicalName).toBe("Wireless Keyboard 2025");
    expect(res.body.product.status).toBe("active");
    expect(res.body.product.publicationState).toBe("published");
  });

  it("normalizes product names and deterministically suffixes generated duplicate slugs", async () => {
    const token = await adminToken();
    const category = await createCategory(token, { name: "Normalized Slug Test", description: "Slug test" });
    const createByName = (name) => request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .field("name", name)
      .field("description", "Slug normalization")
      .field("price", "12")
      .field("category", category._id);

    const normalized = await createByName("  Caf\u00e9 & Tea / Set  ");
    const first = await createByName("Slug Collision");
    const second = await createByName("Slug Collision");

    expect(normalized.status).toBe(201);
    expect(normalized.body.product.slug).toBe("cafe-tea-set");
    expect(first.body.product.slug).toBe("slug-collision");
    expect(second.body.product.slug).toBe("slug-collision-2");
  });

  it("rejects duplicate explicit product slugs and keeps the original slug stable on update", async () => {
    const token = await adminToken();
    const category = await createCategory(token, { name: "Slug Duplicate Test", description: "Duplicate test" });
    const categoryId = category._id;

    const first = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Duplicate Name")
      .field("description", "Original")
      .field("price", "21")
      .field("category", categoryId);

    const duplicate = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Duplicate Name")
      .field("description", "Second")
      .field("price", "22")
      .field("category", categoryId)
      .field("slug", "duplicate-name");

    expect(first.status).toBe(201);
    expect(duplicate.status).toBe(409);

    const updated = await request(app)
      .put(`/api/products/${first.body.product._id}`)
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Duplicate Name Updated")
      .field("description", "Updated");

    expect(updated.status).toBe(200);
    expect(updated.body.product.slug).toBe("duplicate-name");
  });

  it("supports category slug hierarchy and rejects invalid parent references", async () => {
    const token = await adminToken();

    const parent = await createCategory(token, { name: "Parent Category", description: "Parent", slug: "parent-category" });
    const child = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Child Category", description: "Child", parentCategoryId: parent._id, slug: "child-category" });

    expect(child.status).toBe(201);
    expect(child.body.slug).toBe("child-category");

    const duplicateSlug = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Duplicate Slug Category", description: "Duplicate", slug: "child-category" });
    expect(duplicateSlug.status).toBe(409);

    const selfParent = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Self Parent", description: "Bad", parentCategoryId: "000000000000000000000000", slug: "self-parent" });

    expect(selfParent.status).toBe(400);

    const malformedParent = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Malformed Parent", description: "Bad ID", parentCategoryId: "not-an-object-id" });
    expect(malformedParent.status).toBe(400);

    const actualSelfParent = await request(app)
      .put(`/api/categories/${parent._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ parentCategoryId: parent._id });
    expect(actualSelfParent.status).toBe(400);

    const twoNodeCycle = await request(app)
      .put(`/api/categories/${parent._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ parentCategoryId: child.body._id });
    expect(twoNodeCycle.status).toBe(400);

    const third = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Third Category", description: "Third", parentCategoryId: child.body._id });
    const longerCycle = await request(app)
      .put(`/api/categories/${parent._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ parentCategoryId: third.body._id });
    expect(third.status).toBe(201);
    expect(longerCycle.status).toBe(400);
  });

  it("creates a brand with a generated slug and allows product brand references", async () => {
    const token = await adminToken();
    const brand = await createBrand(token, { name: "Alfredo Brand", description: "Brand for catalog" });
    const category = await createCategory(token, { name: "Brand Catalog", description: "Brand category" });
    const categoryId = category._id;

    expect(brand.slug).toBe("alfredo-brand");

    const product = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .field("name", "Brand Product")
      .field("description", "Has a brand")
      .field("price", "45")
      .field("category", categoryId)
      .field("brandId", brand._id);

    expect(product.status).toBe(201);
    expect(product.body.product.brandId).toBe(String(brand._id));
  });

  it("rejects malformed and nonexistent product brand references", async () => {
    const token = await adminToken();
    const category = await Category.create({ name: "Brand Reference Test", description: "Brand references" });
    const createProduct = (brandId) => request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Brand Reference Product",
        description: "Brand validation",
        price: 30,
        category: String(category._id),
        brandId,
      });

    const malformed = await createProduct("not-an-object-id");
    const nonexistent = await createProduct("507f1f77bcf86cd799439011");

    expect(malformed.status).toBe(400);
    expect(nonexistent.status).toBe(400);
    expect(nonexistent.body.message).toMatch(/invalid brandid/i);
  });

  it("rejects an explicit duplicate brand slug on update", async () => {
    const token = await adminToken();
    const first = await createBrand(token, { name: "First Brand", slug: "first-brand" });
    const second = await createBrand(token, { name: "Second Brand", slug: "second-brand" });

    const renamed = await request(app)
      .put(`/api/brands/${second._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Second Brand Renamed" });

    const update = await request(app)
      .put(`/api/brands/${second._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ slug: first.slug });

    expect(renamed.status).toBe(200);
    expect(renamed.body.slug).toBe("second-brand");
    expect(update.status).toBe(409);
  });

  it("restricts product, category, and brand mutations to admins", async () => {
    const token = await adminToken();
    const category = await Category.create({ name: "Authorization Test", description: "Authorization" });
    const product = await Product.create({
      name: "Authorization Product",
      description: "Authorization",
      price: 10,
      category: category._id,
    });
    const brand = await createBrand(token, { name: "Authorization Brand", slug: "authorization-brand" });
    await request(app).post("/api/auth/register").send({
      name: "Catalog Customer",
      email: `catalog-customer-${Date.now()}@example.com`,
      password: "Passw0rd!",
    });
    const customerEmail = (await User.findOne({ name: "CATALOG CUSTOMER" })).email;
    await User.updateOne({ email: customerEmail }, { emailVerified: true });
    const customerToken = (await request(app).post("/api/auth/login").send({ email: customerEmail, password: "Passw0rd!" })).body.data.accessToken;
    const categoryPayload = { name: "Unauthorized Category", description: "Forbidden" };
    const brandPayload = { name: "Unauthorized Brand" };

    const anonymousCategory = await request(app).post("/api/categories").send(categoryPayload);
    const customerCategory = await request(app).post("/api/categories").set("Authorization", `Bearer ${customerToken}`).send(categoryPayload);
    const customerCategoryUpdate = await request(app).put(`/api/categories/${category._id}`).set("Authorization", `Bearer ${customerToken}`).send({ status: "archived" });
    const customerCategoryDelete = await request(app).delete(`/api/categories/${category._id}`).set("Authorization", `Bearer ${customerToken}`);
    const anonymousBrand = await request(app).post("/api/brands").send(brandPayload);
    const customerBrand = await request(app).post("/api/brands").set("Authorization", `Bearer ${customerToken}`).send(brandPayload);
    const customerBrandUpdate = await request(app).put(`/api/brands/${brand._id}`).set("Authorization", `Bearer ${customerToken}`).send({ status: "archived" });
    const customerBrandDelete = await request(app).delete(`/api/brands/${brand._id}`).set("Authorization", `Bearer ${customerToken}`);
    const customerProductUpdate = await request(app).put(`/api/products/${product._id}`).set("Authorization", `Bearer ${customerToken}`).send({ status: "archived", publicationState: "hidden" });
    const customerProductDelete = await request(app).delete(`/api/products/${product._id}`).set("Authorization", `Bearer ${customerToken}`);

    expect(anonymousCategory.status).toBe(401);
    expect(customerCategory.status).toBe(403);
    expect(customerCategoryUpdate.status).toBe(403);
    expect(customerCategoryDelete.status).toBe(403);
    expect(anonymousBrand.status).toBe(401);
    expect(customerBrand.status).toBe(403);
    expect(customerBrandUpdate.status).toBe(403);
    expect(customerBrandDelete.status).toBe(403);
    expect(customerProductUpdate.status).toBe(403);
    expect(customerProductDelete.status).toBe(403);
  });

  it("archives products without deleting their identities or legacy data", async () => {
    const token = await adminToken();
    const category = await Category.create({ name: "Archive Test", description: "Archive test category" });
    const product = await Product.create({
      name: "Preserved Product",
      description: "Must retain references",
      price: 100,
      category: category._id,
      image: "/uploads/preserved.jpg",
      stock: 10,
    });

    const archived = await request(app)
      .delete(`/api/products/${product._id}`)
      .set("Authorization", `Bearer ${token}`);
    const stored = await Product.findById(product._id);

    expect(archived.status).toBe(200);
    expect(stored).not.toBeNull();
    expect(stored.status).toBe("archived");
    expect(stored.publicationState).toBe("hidden");
    expect(stored.price).toBe(100);
    expect(stored.stock).toBe(10);
    expect(String(stored.category)).toBe(String(category._id));
    expect(stored.image).toBe("/uploads/preserved.jpg");
  });

  it("preserves the current image when an uploaded product update is rejected", async () => {
    const token = await adminToken();
    const category = await Category.create({ name: "Image Update Test", description: "Image update" });
    const uploadDir = path.resolve(__dirname, "..", "uploadimage");
    const oldFilename = "catalog-image-preserve.png";
    const oldImagePath = path.join(uploadDir, oldFilename);
    const existingUploads = new Set(await fs.promises.readdir(uploadDir));
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");
    const product = await Product.create({
      name: "Image Preservation Product",
      description: "Old image must remain on rejected updates",
      price: 10,
      category: category._id,
      image: `/uploadimage/${oldFilename}`,
    });

    await fs.promises.writeFile(oldImagePath, png);
    try {
      const update = await request(app)
        .put(`/api/products/${product._id}`)
        .set("Authorization", `Bearer ${token}`)
        .field("brandId", "507f1f77bcf86cd799439011")
        .attach("image", png, { filename: "replacement.png", contentType: "image/png" });
      const stored = await Product.findById(product._id);

      expect(update.status).toBe(400);
      expect(stored.image).toBe(`/uploadimage/${oldFilename}`);
      expect(fs.existsSync(oldImagePath)).toBe(true);
    } finally {
      await fs.promises.unlink(oldImagePath).catch(() => {});
      const currentUploads = await fs.promises.readdir(uploadDir);
      await Promise.all(currentUploads
        .filter((filename) => !existingUploads.has(filename) && /^[a-f0-9]{48}\.png$/.test(filename))
        .map((filename) => fs.promises.unlink(path.join(uploadDir, filename)).catch(() => {})));
    }
  });
});
