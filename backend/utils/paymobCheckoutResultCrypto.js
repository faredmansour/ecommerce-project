const crypto = require("crypto");

const VERSION = "v2";
const LEGACY_VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

function parseKeyring(env = process.env) {
  const raw = env.PAYMOB_CHECKOUT_RESULT_KEYRING;
  const activeKeyId = env.PAYMOB_CHECKOUT_RESULT_ACTIVE_KEY_ID;
  if (typeof raw !== "string" || !raw.trim() || typeof activeKeyId !== "string" || !activeKeyId.trim()) {
    return null;
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new Error("Paymob checkout encryption keyring is invalid."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      !/^[A-Za-z0-9_-]{1,32}$/.test(activeKeyId) || !parsed[activeKeyId]) {
    throw new Error("Paymob checkout encryption active key is unavailable.");
  }
  const keys = new Map();
  for (const [keyId, keyHex] of Object.entries(parsed)) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(keyId) || typeof keyHex !== "string" || !/^[a-f0-9]{64}$/i.test(keyHex)) {
      throw new Error("Paymob checkout encryption keyring is invalid.");
    }
    keys.set(keyId, Buffer.from(keyHex, "hex"));
  }
  return { activeKeyId, keys };
}

function getEncryptionConfiguration(env = process.env) {
  const keyring = parseKeyring(env);
  if (keyring) return { ...keyring, legacyKey: env.PAYMOB_CHECKOUT_RESULT_ENCRYPTION_KEY };
  throw new Error("Paymob checkout result encryption is not configured.");
}

function encryptWithKey(value, key, version, keyId = null) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const parts = [version];
  if (keyId) parts.push(keyId);
  parts.push(iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url"));
  return parts.join(":");
}

function encryptCheckoutUrl(value, env = process.env) {
  if (typeof value !== "string" || !/^https:\/\/eg\.checkout\.paymob\.com\//.test(value)) {
    throw new Error("Paymob checkout URL is invalid.");
  }
  const config = getEncryptionConfiguration(env);
  return encryptWithKey(value, config.keys.get(config.activeKeyId), VERSION, config.activeKeyId);
}

function decodeCiphertext(parts, key, version, keyId = null) {
  const [encodedIv, encodedTag, encodedData] = parts;
  if (!encodedIv || !encodedTag || !encodedData || !/^[A-Za-z0-9_-]+$/.test(encodedIv) ||
      !/^[A-Za-z0-9_-]+$/.test(encodedTag) || !/^[A-Za-z0-9_-]+$/.test(encodedData)) {
    throw new Error("Stored Paymob checkout result is malformed.");
  }
  const iv = Buffer.from(encodedIv, "base64url");
  const authTag = Buffer.from(encodedTag, "base64url");
  const ciphertext = Buffer.from(encodedData, "base64url");
  if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
    throw new Error("Stored Paymob checkout result is malformed.");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const value = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  if (!/^https:\/\/eg\.checkout\.paymob\.com\//.test(value)) {
    throw new Error("Stored Paymob checkout result is invalid.");
  }
  return { checkoutUrl: value, version, keyId };
}

function decryptCheckoutUrlWithMetadata(value, env = process.env) {
  if (typeof value !== "string") return { checkoutUrl: null, version: null, keyId: null };
  const parts = value.split(":");
  const version = parts[0];
  if (version === VERSION) {
    if (parts.length !== 5 || !/^[A-Za-z0-9_-]{1,32}$/.test(parts[1])) {
      throw new Error("Stored Paymob checkout result has an unsupported key version.");
    }
    const config = getEncryptionConfiguration(env);
    const key = config.keys.get(parts[1]);
    if (!key) throw new Error("Stored Paymob checkout result key is unavailable.");
    return decodeCiphertext(parts.slice(2), key, version, parts[1]);
  }
  if (version === LEGACY_VERSION) {
    if (parts.length !== 4) throw new Error("Stored Paymob checkout result is malformed.");
    const legacyHex = env.PAYMOB_CHECKOUT_RESULT_ENCRYPTION_KEY;
    if (typeof legacyHex !== "string" || !/^[a-f0-9]{64}$/i.test(legacyHex)) {
      throw new Error("Legacy Paymob checkout encryption key is unavailable.");
    }
    return decodeCiphertext(parts.slice(1), Buffer.from(legacyHex, "hex"), version, "legacy");
  }
  throw new Error("Stored Paymob checkout result has an unsupported key version.");
}

function decryptCheckoutUrl(value, env = process.env) {
  return decryptCheckoutUrlWithMetadata(value, env).checkoutUrl;
}

function shouldRotateCheckoutUrl(value, metadata, env = process.env) {
  if (typeof value !== "string") return false;
  const config = getEncryptionConfiguration(env);
  return metadata.version !== VERSION || metadata.keyId !== config.activeKeyId;
}

module.exports = {
  encryptCheckoutUrl,
  decryptCheckoutUrl,
  decryptCheckoutUrlWithMetadata,
  shouldRotateCheckoutUrl,
  getEncryptionConfiguration,
};
