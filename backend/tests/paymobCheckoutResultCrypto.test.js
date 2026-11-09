const {
  encryptCheckoutUrl,
  decryptCheckoutUrl,
  decryptCheckoutUrlWithMetadata,
  shouldRotateCheckoutUrl,
} = require("../utils/paymobCheckoutResultCrypto");

const URL = "https://eg.checkout.paymob.com/?publicKey=pk_test_public&clientSecret=egy_csk_test_session";
const KEY_A = "a1".repeat(32);
const KEY_B = "b2".repeat(32);

function env(activeKeyId, keys) {
  return {
    PAYMOB_CHECKOUT_RESULT_ACTIVE_KEY_ID: activeKeyId,
    PAYMOB_CHECKOUT_RESULT_KEYRING: JSON.stringify(keys),
  };
}

describe("Paymob checkout result encryption", () => {
  it("encrypts and decrypts a checkout URL using versioned AES-GCM metadata", () => {
    const config = env("key-a", { "key-a": KEY_A });
    const encrypted = encryptCheckoutUrl(URL, config);
    expect(encrypted.startsWith("v2:key-a:")).toBe(true);
    expect(encrypted).not.toContain("csk_test_session");
    expect(decryptCheckoutUrl(encrypted, config)).toBe(URL);
  });

  it("rejects invalid key lengths, malformed hexadecimal keys, and invalid active IDs", () => {
    expect(() => encryptCheckoutUrl(URL, env("key-a", { "key-a": "ab" }))).toThrow(/keyring is invalid/);
    expect(() => encryptCheckoutUrl(URL, env("key-a", { "key-a": "g1".repeat(32) }))).toThrow(/keyring is invalid/);
    expect(() => encryptCheckoutUrl(URL, env("missing", { "key-a": KEY_A }))).toThrow(/active key is unavailable/);
    expect(() => encryptCheckoutUrl(URL, { PAYMOB_CHECKOUT_RESULT_ENCRYPTION_KEY: KEY_A }))
      .toThrow(/encryption is not configured/);
  });

  it("rejects decrypt with a wrong key, modified ciphertext, and modified authentication tag", () => {
    const configA = env("key-a", { "key-a": KEY_A });
    const encrypted = encryptCheckoutUrl(URL, configA);
    expect(() => decryptCheckoutUrl(encrypted, env("key-b", { "key-b": KEY_B }))).toThrow();

    const parts = encrypted.split(":");
    const data = parts[4];
    parts[4] = `${data.startsWith("A") ? "B" : "A"}${data.slice(1)}`;
    expect(() => decryptCheckoutUrl(parts.join(":"), configA)).toThrow();

    const tagParts = encrypted.split(":");
    const tag = tagParts[3];
    tagParts[3] = `${tag.startsWith("A") ? "B" : "A"}${tag.slice(1)}`;
    expect(() => decryptCheckoutUrl(tagParts.join(":"), configA)).toThrow();
  });

  it("rejects missing or unsupported ciphertext versions", () => {
    expect(() => decryptCheckoutUrl("v3:key-a:a:b:c", env("key-a", { "key-a": KEY_A }))).toThrow(/unsupported key version/);
    expect(() => decryptCheckoutUrl("", env("key-a", { "key-a": KEY_A }))).toThrow(/unsupported key version/);
  });

  it("decrypts with a retained old key and identifies ciphertext for lazy rotation to the active key", () => {
    const oldConfig = env("old-key", { "old-key": KEY_A });
    const oldCiphertext = encryptCheckoutUrl(URL, oldConfig);
    const rotatedConfig = env("new-key", { "old-key": KEY_A, "new-key": KEY_B });
    const metadata = decryptCheckoutUrlWithMetadata(oldCiphertext, rotatedConfig);
    expect(metadata).toMatchObject({ checkoutUrl: URL, version: "v2", keyId: "old-key" });
    expect(shouldRotateCheckoutUrl(oldCiphertext, metadata, rotatedConfig)).toBe(true);
    const newCiphertext = encryptCheckoutUrl(metadata.checkoutUrl, rotatedConfig);
    expect(newCiphertext.startsWith("v2:new-key:")).toBe(true);
    expect(decryptCheckoutUrl(newCiphertext, rotatedConfig)).toBe(URL);
  });

  it("fails closed for malformed URLs without including checkout secrets in errors", () => {
    expect(() => encryptCheckoutUrl("https://evil.test/?clientSecret=never-log", env("key-a", { "key-a": KEY_A })))
      .toThrow("Paymob checkout URL is invalid.");
  });
});
