import { test, expect } from "@playwright/test";

const API_URL = "http://127.0.0.1:8010";
const STORE_URL = "http://127.0.0.1:5174";
const TEST_ACCESS_TOKEN = "google-callback-test-access";
const PRODUCT_ID = "507f1f77bcf86cd799439012";

for (const provider of ["google", "apple"]) {
test(`${provider} callback exchanges its code, restores the session, and safely returns to checkout`, async ({ page }) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": STORE_URL,
    "Access-Control-Allow-Credentials": "true",
  };
  let cartItems = [];

  await page.addInitScript((productId) => {
    localStorage.setItem("guest-cart-v1", JSON.stringify([{ product_id: productId, quantity: 1 }]));
  }, PRODUCT_ID);

  await page.route(`${API_URL}/api/auth/${provider}/exchange`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.continue();
      return;
    }

    expect(route.request().postDataJSON()).toEqual({ code: "one-time-test-code" });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({
        status: "success",
        data: {
          accessToken: TEST_ACCESS_TOKEN,
          refreshToken: "google-callback-test-refresh",
          user: {
            id: "google-callback-user",
            name: "Google Test User",
            email: "google-test@example.com",
            role: "user",
            authProviders: { google: provider === "google", apple: provider === "apple" },
          },
          returnTo: "/checkout",
        },
      }),
    });
  });

  await page.route(`${API_URL}/api/products/${PRODUCT_ID}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        product: {
          _id: PRODUCT_ID,
          name: "Google callback test product",
          price: 49,
          category: "Browser QA",
          stock: 5,
          status: "active",
          publicationState: "published",
        },
      }),
    });
  });
  await page.route(`${API_URL}/api/cart`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.continue();
      return;
    }
    if (route.request().method() === "POST") {
      const requestBody = route.request().postDataJSON();
      cartItems = [{
        ...requestBody,
        _id: "google-callback-cart-entry",
        product_id: requestBody.product_id,
      }];
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({
        status: "success",
        data: route.request().method() === "POST" ? cartItems[0] : cartItems,
      }),
    });
  });
  await page.route(`${API_URL}/api/addresses`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify({ status: "success", data: [] }),
    });
  });

  await page.goto(`/auth/callback?${provider === "apple" ? "provider=apple&" : ""}code=one-time-test-code`);
  await expect(page).toHaveURL(`${STORE_URL}/checkout`);
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("token"))).toBe(TEST_ACCESS_TOKEN);
  expect(new URL(page.url()).searchParams.has("code")).toBe(false);
  await expect(page.getByText("one-time-test-code")).toHaveCount(0);
});
}

test("Google and Apple sign-up remain visible when configuration is absent and fail closed", async ({ page }) => {
  let startRequests = 0;
  await page.route(`${API_URL}/api/auth/*/start`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": STORE_URL,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "content-type",
        },
      });
      return;
    }

    startRequests += 1;
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      headers: {
        "Access-Control-Allow-Origin": STORE_URL,
        "Access-Control-Allow-Credentials": "true",
      },
      body: JSON.stringify({
        status: "fail",
        code: "AUTH_NOT_CONFIGURED",
        message: "Provider sign-in is not configured.",
      }),
    });
  });

  await page.goto("/register");
  const signUpButton = page.getByRole("button", { name: "Continue with Google" });
  await expect(signUpButton).toBeVisible();
  await signUpButton.click();
  await expect(page.getByRole("alert")).toHaveText("Provider sign-in is not configured.");
  const appleSignUpButton = page.getByRole("button", { name: "Continue with Apple" });
  await expect(appleSignUpButton).toBeVisible();
  await appleSignUpButton.click();
  const signUpAlerts = page.getByRole("alert");
  await expect(signUpAlerts).toHaveCount(2);
  await expect(signUpAlerts.nth(0)).toHaveText("Provider sign-in is not configured.");
  await expect(signUpAlerts.nth(1)).toHaveText("Provider sign-in is not configured.");
  await expect(page).toHaveURL(`${STORE_URL}/register`);

  await page.getByRole("link", { name: "Login" }).click();
  const signInButton = page.getByRole("button", { name: "Continue with Google" });
  await expect(signInButton).toBeVisible();
  await signInButton.click();
  await expect(page.getByRole("alert")).toHaveText("Provider sign-in is not configured.");
  const appleSignInButton = page.getByRole("button", { name: "Continue with Apple" });
  await expect(appleSignInButton).toBeVisible();
  await appleSignInButton.click();
  const signInAlerts = page.getByRole("alert");
  await expect(signInAlerts).toHaveCount(2);
  await expect(signInAlerts.nth(0)).toHaveText("Provider sign-in is not configured.");
  await expect(signInAlerts.nth(1)).toHaveText("Provider sign-in is not configured.");
  expect(startRequests).toBe(4);
});
