const crypto = require("crypto");
const PaymobProvider = require("../providers/paymobProvider");
const { WEBHOOK_VERIFICATION_STATUS } = require("../providers/webhookContract");

const SECRET = "offline-test-hmac-secret";
const env = {
  PAYMOB_ENVIRONMENT: "TEST",
  PAYMOB_TEST_EXECUTION_ENABLED: "true",
  PAYMOB_TEST_HMAC_SECRET: SECRET,
  PAYMOB_TEST_INTEGRATION_ID: "12345",
};

function transaction(overrides = {}) {
  return { type: "TRANSACTION", obj: {
    amount_cents: 12550, created_at: "2026-11-03T10:00:00Z", currency: "EGP", error_occured: false,
    has_parent_transaction: false, id: 987654321, integration_id: 12345, is_3d_secure: true,
    is_auth: false, is_capture: false, is_refunded: false, is_standalone_payment: true,
    is_voided: false, order: { id: 7654321 }, owner: 7654, pending: false,
    source_data: { pan: "2346", sub_type: "MasterCard", type: "card" }, success: true,
    ...overrides,
  } };
}

function hmac(payload) {
  const o = payload.obj;
  const values = [o.amount_cents, o.created_at, o.currency, o.error_occured, o.has_parent_transaction,
    o.id, o.integration_id, o.is_3d_secure, o.is_auth, o.is_capture, o.is_refunded,
    o.is_standalone_payment, o.is_voided, o.order.id, o.owner, o.pending,
    o.source_data.pan, o.source_data.sub_type, o.source_data.type, o.success];
  return crypto.createHmac("sha512", SECRET).update(values.map(String).join("")).digest("hex");
}

describe("Paymob TEST transaction callback", () => {
  it("verifies the documented SHA-512 transaction HMAC in constant-time comparison flow", async () => {
    const payload = transaction();
    const provider = new PaymobProvider({ env });
    const result = await provider.verifyWebhook({ rawBody: Buffer.from(JSON.stringify(payload)), signature: hmac(payload) });
    expect(result).toMatchObject({ status: WEBHOOK_VERIFICATION_STATUS.VERIFIED, payload: { type: "TRANSACTION", obj: { id: payload.obj.id, order: { id: payload.obj.order.id } } } });
    expect(result.payload.obj.integration_id).toBe(12345);
    expect(result.payload.obj).not.toHaveProperty("source_data");
  });

  it.each([undefined, "bad", "f".repeat(128)])("rejects a missing, malformed, or invalid signature (%s)", async (signature) => {
    const provider = new PaymobProvider({ env });
    await expect(provider.verifyWebhook({ rawBody: Buffer.from(JSON.stringify(transaction())), signature }))
      .resolves.toMatchObject({ status: signature === undefined ? WEBHOOK_VERIFICATION_STATUS.MISSING_SIGNATURE :
        signature.length !== 128 ? WEBHOOK_VERIFICATION_STATUS.MALFORMED_REQUEST : WEBHOOK_VERIFICATION_STATUS.INVALID_SIGNATURE });
  });

  it("rejects tampered signed data and signatures created with another secret", async () => {
    const payload = transaction();
    const provider = new PaymobProvider({ env });
    const valid = hmac(payload);
    payload.obj.amount_cents += 1;
    await expect(provider.verifyWebhook({ rawBody: Buffer.from(JSON.stringify(payload)), signature: valid }))
      .resolves.toMatchObject({ status: WEBHOOK_VERIFICATION_STATUS.INVALID_SIGNATURE });
    const wrongKey = crypto.createHmac("sha512", "another-key").update("wrong").digest("hex");
    await expect(provider.verifyWebhook({ rawBody: Buffer.from(JSON.stringify(transaction())), signature: wrongKey }))
      .resolves.toMatchObject({ status: WEBHOOK_VERIFICATION_STATUS.INVALID_SIGNATURE });
  });

  it("binds the configured integration and maps a verified authorization without calling it captured", async () => {
    const findPaymobSessionByOrderReference = jest.fn().mockResolvedValue({ paymentId: "d9428888-122b-4a1e-8b30-9a8c22c55103", providerPaymentId: "pi_test_saved" });
    const provider = new PaymobProvider({ env, attemptRepository: { findPaymobSessionByOrderReference } });
    const event = await provider.normalizeWebhookEvent(transaction({ is_auth: true }));
    expect(findPaymobSessionByOrderReference).toHaveBeenCalledWith("7654321");
    expect(event).toMatchObject({ providerEventId: "987654321", providerTransactionReference: "987654321", paymentReference: "d9428888-122b-4a1e-8b30-9a8c22c55103", providerPaymentReference: "pi_test_saved", status: "authorized", amountMinor: 12550, currency: "EGP" });
  });

  it.each([
    [{ pending: true }, "pending"],
    [{ success: false }, "failed"],
  ])("normalizes supported pending/failure callbacks", async (overrides, expectedStatus) => {
    const attempts = { findPaymobSessionByOrderReference: jest.fn().mockResolvedValue({ paymentId: "d9428888-122b-4a1e-8b30-9a8c22c55103", providerPaymentId: "pi_test_saved" }) };
    const provider = new PaymobProvider({ env, attemptRepository: attempts });
    const event = await provider.normalizeWebhookEvent(transaction(overrides));
    expect(event.status).toBe(expectedStatus);
  });

  it("rejects refund actions and retains unmatched Paymob order references for deferred binding", async () => {
    const attempts = { findPaymobSessionByOrderReference: jest.fn().mockResolvedValue(null) };
    const provider = new PaymobProvider({ env, attemptRepository: attempts });
    await expect(provider.normalizeWebhookEvent(transaction({ is_refunded: true }))).rejects.toThrow(/outside the supported/);
    await expect(provider.normalizeWebhookEvent(transaction({ is_capture: true }))).rejects.toThrow(/authenticated transaction inquiry/);
    const unmatched = await provider.normalizeWebhookEvent(transaction({ is_auth: true }));
    expect(unmatched.providerOrderReference).toBe("7654321");
    expect(unmatched).not.toHaveProperty("paymentReference");
    expect(unmatched).not.toHaveProperty("providerPaymentReference");
  });

  it("rejects integration mismatches, generic success without capture evidence, and missing transaction references", async () => {
    const provider = new PaymobProvider({
      env,
      attemptRepository: { findPaymobSessionByOrderReference: jest.fn().mockResolvedValue({ paymentId: "payment-1", providerPaymentId: "provider-1" }) },
    });
    const wrongIntegration = transaction({ integration_id: 12346 });
    const verifiedWrongIntegration = await provider.verifyWebhook({
      rawBody: Buffer.from(JSON.stringify(wrongIntegration)),
      signature: hmac(wrongIntegration),
    });
    await expect(provider.normalizeWebhookEvent(verifiedWrongIntegration.payload))
      .rejects.toThrow(/does not match the configured merchant integration/);
    await expect(provider.normalizeWebhookEvent(transaction()))
      .rejects.toThrow(/does not include sufficient capture evidence/);
    await expect(provider.normalizeWebhookEvent(transaction({ id: undefined })))
      .rejects.toThrow(/callback is incomplete/);
  });

  it("fails closed when the configured merchant integration is unavailable", async () => {
    const provider = new PaymobProvider({
      env: { ...env, PAYMOB_TEST_INTEGRATION_ID: undefined },
      attemptRepository: { findPaymobSessionByOrderReference: jest.fn() },
    });
    await expect(provider.normalizeWebhookEvent(transaction()))
      .rejects.toThrow(/integration is unavailable/);
  });
});
