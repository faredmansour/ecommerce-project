const { verifyGoogleIdToken } = require("../services/googleOidcService");

function mockedGoogleClient(payload) {
  return { verifyIdToken: jest.fn().mockResolvedValue({ getPayload: () => payload }) };
}

describe("Google ID-token claim verification", () => {
  const validPayload = {
    iss: "https://accounts.google.com",
    sub: "google-subject",
    email: "verified@example.test",
    email_verified: true,
    nonce: "expected-nonce",
  };

  it("asks Google's verifier to validate the configured audience and returns only verified identity fields", async () => {
    const client = mockedGoogleClient(validPayload);
    await expect(verifyGoogleIdToken({ client, idToken: "opaque-id-token", audience: "configured-client-id", nonce: "expected-nonce" }))
      .resolves.toEqual({ subject: "google-subject", email: "verified@example.test", name: "verified@example.test" });
    expect(client.verifyIdToken).toHaveBeenCalledWith({ idToken: "opaque-id-token", audience: "configured-client-id" });
  });

  it.each([
    ["wrong issuer", { iss: "https://attacker.invalid" }],
    ["missing subject", { sub: undefined }],
    ["unverified email", { email_verified: false }],
    ["wrong nonce", { nonce: "attacker-nonce" }],
  ])("rejects a token with %s", async (_name, override) => {
    const client = mockedGoogleClient({ ...validPayload, ...override });
    await expect(verifyGoogleIdToken({ client, idToken: "opaque-id-token", audience: "configured-client-id", nonce: "expected-nonce" }))
      .rejects.toMatchObject({ code: "GOOGLE_IDENTITY_INVALID" });
  });

  it("propagates Google's rejection of an invalid signature, audience, or expiration", async () => {
    const client = { verifyIdToken: jest.fn().mockRejectedValue(new Error("invalid signature or audience")) };
    await expect(verifyGoogleIdToken({ client, idToken: "invalid", audience: "configured-client-id", nonce: "expected-nonce" }))
      .rejects.toThrow("invalid signature or audience");
  });
});
