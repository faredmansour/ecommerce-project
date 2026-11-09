import { test, expect } from "@playwright/test";

const STORE_URL = "http://127.0.0.1:5174";
const API_URL = "http://127.0.0.1:8010";

function recordUrls(testInfo, ...paths) {
  testInfo.annotations.push({ type: "Visited URLs", description: paths.map((path) => new URL(path, STORE_URL).toString()).join(" | ") });
}

test("guest browses, searches, changes cart, refreshes, then logs in and returns to checkout with merged quantities", async ({ page }, testInfo) => {
  recordUrls(testInfo, "/", "/category", "/category?search=Browser%20QA%20Mouse", "/product/507f1f77bcf86cd799439012", "/cart", "/login", "/checkout");

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: /choose your arena/i })).toBeVisible();
  await expect(page).not.toHaveURL(/\/login/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath("home-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("home-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole("link", { name: "SHOP", exact: true }).click();
  await expect(page).toHaveURL(/\/category$/);
  await expect(page.getByRole("link", { name: "Browser QA Mouse" }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("category-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("category-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  const search = page.getByRole("searchbox", { name: "Search products" }).first();
  await search.fill("Browser QA Mouse");
  await search.press("Enter");
  await expect(page).toHaveURL(/\/category\?search=Browser(%20|\+)QA(%20|\+)Mouse/);
  await expect(page.getByRole("heading", { name: /search:/i })).toBeVisible();
  await page.getByRole("link", { name: "Browser QA Mouse" }).first().click();
  await expect(page).toHaveURL(/\/product\/[a-f0-9]{24}$/);
  await expect(page.getByRole("heading", { name: "Browser QA Mouse" })).toBeVisible();
  await expect(page.getByText("A deterministic fixture used only by isolated browser tests.").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("product-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("product-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole("button", { name: "Add to Cart" }).first().click();
  await expect(page.getByRole("status").filter({ hasText: "Added to cart" })).toBeVisible();
  await page.getByRole("link", { name: /shopping bag/i }).click();
  await expect(page).toHaveURL(/\/cart$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole("heading", { name: "Shopping Cart" })).toBeVisible();
  await expect(page.getByText("Browser QA Mouse").first()).toBeVisible();
  const cartLine = page.locator("article").filter({ hasText: "Browser QA Mouse" }).first();
  await page.getByRole("button", { name: "Increase Browser QA Mouse quantity" }).click();
  await expect(cartLine.getByText("2", { exact: true })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("article").filter({ hasText: "Browser QA Mouse" }).first().getByText("2", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath("cart-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Checkout" }).last()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("cart-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("region", { name: "Cart items" }).getByRole("link", { name: "Continue Shopping" }).click();
  await expect(page).toHaveURL(/\/category$/);
  await page.getByRole("link", { name: /shopping bag/i }).click();
  await expect(page.locator("article").filter({ hasText: "Browser QA Mouse" }).first().getByText("2", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Checkout" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath("checkout-login-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("checkout-login-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Email").fill("qa.customer@example.com");
  await page.getByRole("textbox", { name: "Password" }).fill("Passw0rd!");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await expect(page.getByText("Browser QA Mouse").first()).toBeVisible();
  await expect(page.getByText("Qty 3", { exact: true })).toBeVisible();
  const cart = await page.request.get(`${API_URL}/api/cart`, {
    headers: { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem("token"))}` },
  });
  expect(cart.status()).toBe(200);
  const cartBody = await cart.json();
  expect(cartBody.data).toHaveLength(1);
  expect(cartBody.data[0].quantity).toBe(3);
});

test("guest can register at checkout and return with the saved cart", async ({ page }, testInfo) => {
  recordUrls(testInfo, "/", "/category", "/product/507f1f77bcf86cd799439012", "/cart", "/login", "/register", "/checkout");
  await page.goto("/category");
  const mouseCard = page.getByRole("article").filter({ hasText: "Browser QA Mouse" }).first();
  await mouseCard.getByRole("button", { name: "Add to Cart" }).click();
  await page.getByRole("link", { name: /shopping bag/i }).click();
  await page.getByRole("button", { name: "Checkout" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole("link", { name: "Register" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByLabel("Full name").fill("Browser QA Registration");
  const registerEmail = `qa.register.${Date.now()}@example.com`;
  await page.getByLabel("Email").fill(registerEmail);
  await page.getByLabel("Password", { exact: true }).fill("Passw0rd!");
  await page.getByLabel("Confirm password").fill("Passw0rd!");
  await page.getByRole("button", { name: "Create Account" }).click();

  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await expect(page.getByText(/If the address can be verified, you’ll receive a link/i)).toBeVisible();

  // Retrieve verification token from isolated SMTP sandbox
  const emailsRes = await page.request.get(`${API_URL}/_test/emails`);
  expect(emailsRes.status()).toBe(200);
  const emailsData = await emailsRes.json();
  const regMail = emailsData.data.find(
    (m) => m.to.includes(registerEmail.toLowerCase()) || m.headerTo.includes(registerEmail.toLowerCase())
  );
  expect(regMail).toBeDefined();
  const token = regMail.token || regMail.decoded?.match(/token=([a-f0-9]{64})/)?.[1];
  expect(token).toBeTruthy();

  // Navigate to verification link
  await page.goto(`/verify-email?token=${token}`);
  await expect(page).toHaveURL(new RegExp(`/login\\?verified=1&returnTo=%2Fcheckout`));
  await expect(page.getByText("Email verified. Sign in to continue.")).toBeVisible();

  // Log in with verified account
  await page.getByLabel("Email").fill(registerEmail);
  await page.getByRole("textbox", { name: "Password" }).fill("Passw0rd!");
  await page.getByRole("button", { name: "Login" }).click();

  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await expect(page.getByText("Qty 1", { exact: true })).toBeVisible();
});

test("guest cart empty state, multiple products, quantity changes, removals, and totals work", async ({ page }, testInfo) => {
  recordUrls(testInfo, "/cart", "/category", "/product/507f1f77bcf86cd799439012", "/product/507f1f77bcf86cd799439013", "/cart");
  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();

  await page.goto("/category");
  const mouseCard = page.getByRole("article").filter({ hasText: "Browser QA Mouse" }).first();
  await mouseCard.getByRole("button", { name: "Add to Cart" }).click();
  await page.goto("/category");
  const keyboardCard = page.getByRole("article").filter({ hasText: "Browser QA Keyboard" }).first();
  await keyboardCard.getByRole("button", { name: "Add to Cart" }).click();
  await page.goto("/cart");

  const lines = page.getByRole("region", { name: "Cart items" }).locator("article");
  await expect(lines).toHaveCount(2);
  const summary = page.getByRole("complementary", { name: "Order summary" });
  await expect(summary.getByText("$74.00", { exact: true }).last()).toBeVisible();

  await page.getByRole("button", { name: "Increase Browser QA Mouse quantity" }).click();
  await expect(summary.getByText("$123.00", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Decrease Browser QA Mouse quantity" }).click();
  await expect(summary.getByText("$74.00", { exact: true }).last()).toBeVisible();

  await page.getByRole("button", { name: "Remove Browser QA Keyboard" }).click();
  await expect(lines).toHaveCount(1);
  await expect(summary.getByText("$49.00", { exact: true }).last()).toBeVisible();
  await page.getByRole("button", { name: "Remove Browser QA Mouse" }).click();
  await expect(page.getByRole("heading", { name: "Your cart is empty" })).toBeVisible();
});

test("public page stays put after a public API 401; protected checkout redirects once to login", async ({ page }, testInfo) => {
  recordUrls(testInfo, "/category?search=Browser%20QA", "/checkout?step=identity", "/login");
  await page.addInitScript(() => {
    localStorage.setItem("token", "intentionally-invalid-test-token");
    localStorage.setItem("user", JSON.stringify({ id: "test-user", name: "Expired Session", role: "user" }));
  });
  await page.route("**/api/products**", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Invalid token" }) }));
  await page.goto("/category?search=Browser%20QA");
  await expect(page.getByText("Invalid token")).toBeVisible();
  await expect(page).toHaveURL(/\/category\?search=Browser%20QA$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("token"))).toBeNull();
  await page.unroute("**/api/products**");
  await page.goto("/checkout?step=identity");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("customer data, orders, payments, wallet path, and admin APIs remain protected", async ({ request }, testInfo) => {
  testInfo.annotations.push({ type: "Visited URLs", description: ["/api/auth/me", "/api/orders", "/api/orders/507f1f77bcf86cd799439011", "/api/addresses", "/api/cart", "/api/payments/00000000-0000-4000-8000-000000000000", "/api/wallet", "/api/admin/summary"].map((path) => new URL(path, API_URL).toString()).join(" | ") });
  const protectedPaths = [
    "/api/auth/me",
    "/api/orders",
    "/api/orders/507f1f77bcf86cd799439011",
    "/api/addresses",
    "/api/cart",
    "/api/payments/00000000-0000-4000-8000-000000000000",
    "/api/admin/summary",
  ];
  for (const path of protectedPaths) {
    const response = await request.get(`${API_URL}${path}`);
    expect(response.status(), `${path} must require authentication`).toBe(401);
  }
  const wallet = await request.get(`${API_URL}/api/wallet`);
  expect(wallet.status()).toBe(404);

  const login = await request.post(`${API_URL}/api/auth/login`, { data: { email: "qa.other@example.com", password: "Passw0rd!" } });
  expect(login.status()).toBe(200);
  const token = (await login.json()).data.accessToken;
  const orderId = "507f1f77bcf86cd799439011";
  const foreignOrder = await request.get(`${API_URL}/api/orders/${orderId}`, { headers: { Authorization: `Bearer ${token}` } });
  expect(foreignOrder.status()).toBe(403);
});
