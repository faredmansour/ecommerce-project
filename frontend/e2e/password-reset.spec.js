import { test, expect } from "@playwright/test";

const API_URL = "http://127.0.0.1:8010";
const CUSTOMER_EMAIL = "qa.customer@example.com";
const ORIGINAL_PASSWORD = "Passw0rd!";
const NEW_PASSWORD = "FreshPassword1!";

async function getEmails(page) {
  const response = await page.request.get(`${API_URL}/_test/emails`);
  expect(response.status()).toBe(200);
  return (await response.json()).data;
}

function getLatestResetToken(emails) {
  const email = emails.filter((message) =>
    [...(message.to || []), message.headerTo || ""].some((recipient) =>
      recipient.toLowerCase().includes(CUSTOMER_EMAIL)
    ) && /reset/i.test(message.subject)
  ).at(-1);
  expect(email).toBeDefined();
  return email.token || email.decoded?.match(/token=([a-f0-9]{64})/)?.[1];
}

test("valid reset link survives StrictMode URL cleanup and invalidates prior sessions", async ({ page }, testInfo) => {
  const initialLogin = await page.request.post(`${API_URL}/api/auth/login`, {
    data: { email: CUSTOMER_EMAIL, password: ORIGINAL_PASSWORD },
  });
  expect(initialLogin.status()).toBe(200);
  const previousSession = (await initialLogin.json()).data;

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(CUSTOMER_EMAIL);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toHaveText("If that email exists, a password reset link has been sent.");

  const token = getLatestResetToken(await getEmails(page));
  expect(token).toBeTruthy();
  await page.goto(`/reset-password?token=${token}`);
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole("button", { name: "Update password" })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("reset-form-ready.png"), fullPage: true });

  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByLabel("Confirm password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("status")).toHaveText("Password updated successfully.");
  await page.screenshot({ path: testInfo.outputPath("reset-success.png"), fullPage: true });

  const oldAccess = await page.request.get(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${previousSession.accessToken}` },
  });
  const oldCart = await page.request.get(`${API_URL}/api/cart`, {
    headers: { Authorization: `Bearer ${previousSession.accessToken}` },
  });
  const oldRefresh = await page.request.post(`${API_URL}/api/auth/refresh`, {
    data: { refreshToken: previousSession.refreshToken },
  });
  expect(oldAccess.status()).toBe(401);
  expect(oldCart.status()).toBe(401);
  expect(oldRefresh.status()).toBe(401);

  const oldPasswordLogin = await page.request.post(`${API_URL}/api/auth/login`, {
    data: { email: CUSTOMER_EMAIL, password: ORIGINAL_PASSWORD },
  });
  const newPasswordLogin = await page.request.post(`${API_URL}/api/auth/login`, {
    data: { email: CUSTOMER_EMAIL, password: NEW_PASSWORD },
  });
  expect(oldPasswordLogin.status()).toBe(400);
  expect(newPasswordLogin.status()).toBe(200);
  const newAccess = (await newPasswordLogin.json()).data.accessToken;
  expect((await page.request.get(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${newAccess}` },
  })).status()).toBe(200);

  const reused = await page.request.post(`${API_URL}/api/auth/reset-password`, {
    data: { token, password: NEW_PASSWORD },
  });
  expect(reused.status()).toBe(400);
});

test("invalid, expired, and revoked reset links are rejected", async ({ page }) => {
  await page.goto("/reset-password?token=invalid-reset-token");
  await page.getByLabel("New password").fill(NEW_PASSWORD);
  await page.getByLabel("Confirm password").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByRole("alert")).toHaveText(/invalid or expired/i);

  const firstRequest = await page.request.post(`${API_URL}/api/auth/forgot-password`, {
    data: { email: CUSTOMER_EMAIL },
  });
  expect(firstRequest.status()).toBe(200);
  const firstToken = getLatestResetToken(await getEmails(page));
  const secondRequest = await page.request.post(`${API_URL}/api/auth/forgot-password`, {
    data: { email: CUSTOMER_EMAIL },
  });
  expect(secondRequest.status()).toBe(200);
  const secondToken = getLatestResetToken(await getEmails(page));
  expect(firstToken).not.toBe(secondToken);

  const revoked = await page.request.post(`${API_URL}/api/auth/reset-password`, {
    data: { token: firstToken, password: NEW_PASSWORD },
  });
  expect(revoked.status()).toBe(400);

  await page.request.post(`${API_URL}/_test/expire-reset-token`, { data: { email: CUSTOMER_EMAIL } });
  const expired = await page.request.post(`${API_URL}/api/auth/reset-password`, {
    data: { token: secondToken, password: NEW_PASSWORD },
  });
  expect(expired.status()).toBe(400);
});
