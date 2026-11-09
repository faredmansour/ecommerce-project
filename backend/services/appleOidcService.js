const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_AUTHORIZATION_ENDPOINT = `${APPLE_ISSUER}/auth/authorize`;
const APPLE_TOKEN_ENDPOINT = `${APPLE_ISSUER}/auth/token`;
const APPLE_JWKS_ENDPOINT = `${APPLE_ISSUER}/auth/keys`;
const APPLE_JWKS_TTL_MS = 60 * 60 * 1000;

let signingKeys;
let signingKeysFetchedAt = 0;
let signingKeysRequest;

function getAppleConfig(env = process.env) {
  const { APPLE_CLIENT_ID: clientId, APPLE_TEAM_ID: teamId, APPLE_KEY_ID: keyId, APPLE_PRIVATE_KEY: privateKey, APPLE_REDIRECT_URI: redirectUri } = env;
  if (!clientId || !teamId || !keyId || !privateKey || !redirectUri) return null;
  return {
    clientId,
    teamId,
    keyId,
    privateKey: privateKey.replace(/\\n/g, "\n"),
    redirectUri,
  };
}

function createAppleClientSecret(config) {
  return jwt.sign({}, config.privateKey, {
    algorithm: "ES256",
    issuer: config.teamId,
    subject: config.clientId,
    audience: APPLE_ISSUER,
    expiresIn: "5m",
    keyid: config.keyId,
  });
}

function createAppleAuthorizationUrl({ config, state, nonce }) {
  const url = new URL(APPLE_AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: "name email",
    state,
    nonce,
  }).toString();
  return url.toString();
}

async function fetchAppleSigningKeys(fetchImpl = globalThis.fetch, forceRefresh = false) {
  if (!forceRefresh && signingKeys && Date.now() - signingKeysFetchedAt < APPLE_JWKS_TTL_MS) return signingKeys;
  if (!signingKeysRequest) {
    signingKeysRequest = (async () => {
      const response = await fetchImpl(APPLE_JWKS_ENDPOINT, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Apple signing keys are unavailable.");
      const payload = await response.json();
      if (!Array.isArray(payload.keys)) throw new Error("Apple signing keys are invalid.");
      signingKeys = payload.keys.filter((key) => key.kty === "RSA" && key.use === "sig" && key.alg === "RS256" && typeof key.kid === "string");
      signingKeysFetchedAt = Date.now();
      return signingKeys;
    })().finally(() => {
      signingKeysRequest = null;
    });
  }
  return signingKeysRequest;
}

async function getAppleSigningKey(kid, fetchImpl) {
  let keys = await fetchAppleSigningKeys(fetchImpl);
  let signingKey = keys.find((key) => key.kid === kid);
  if (!signingKey) {
    keys = await fetchAppleSigningKeys(fetchImpl, true);
    signingKey = keys.find((key) => key.kid === kid);
  }
  if (!signingKey) throw new Error("Apple ID token signing key is unknown.");
  return crypto.createPublicKey({ key: signingKey, format: "jwk" });
}

function invalidIdentity() {
  const error = new Error("Apple identity could not be verified.");
  error.code = "APPLE_IDENTITY_INVALID";
  return error;
}

async function verifyAppleIdToken({ idToken, audience, nonce, fetchImpl = globalThis.fetch, now = Math.floor(Date.now() / 1000) }) {
  const parts = typeof idToken === "string" ? idToken.split(".") : [];
  if (parts.length !== 3 || parts.some((part) => !part)) throw invalidIdentity();

  let header;
  let payload;
  let signature;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    signature = Buffer.from(parts[2], "base64url");
  } catch {
    throw invalidIdentity();
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid || !signature.length) throw invalidIdentity();

  let signingKey;
  try {
    signingKey = await getAppleSigningKey(header.kid, fetchImpl);
  } catch {
    throw invalidIdentity();
  }
  const signatureValid = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    signingKey,
    signature
  );
  const validAudience = payload.aud === audience || (Array.isArray(payload.aud) && payload.aud.includes(audience));
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  if (
    !signatureValid
    || payload.iss !== APPLE_ISSUER
    || !validAudience
    || typeof payload.sub !== "string"
    || !payload.sub
    || !Number.isFinite(payload.exp)
    || payload.exp <= now
    || (payload.nbf !== undefined && (!Number.isFinite(payload.nbf) || payload.nbf > now))
    || payload.nonce !== nonce
    || (payload.email !== undefined && (!emailVerified || typeof payload.email !== "string"))
  ) {
    throw invalidIdentity();
  }

  return {
    subject: payload.sub,
    email: typeof payload.email === "string" ? payload.email.toLowerCase() : undefined,
    emailVerified,
  };
}

async function exchangeAppleCode({ code, config, fetchImpl = globalThis.fetch }) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: createAppleClientSecret(config),
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });
  const response = await fetchImpl(APPLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!response.ok) throw new Error("Apple authorization code could not be exchanged.");
  const tokens = await response.json();
  if (typeof tokens.id_token !== "string" || !tokens.id_token) throw new Error("Apple ID token is missing.");
  return tokens.id_token;
}

module.exports = {
  APPLE_AUTHORIZATION_ENDPOINT,
  APPLE_ISSUER,
  APPLE_JWKS_ENDPOINT,
  APPLE_TOKEN_ENDPOINT,
  createAppleAuthorizationUrl,
  createAppleClientSecret,
  exchangeAppleCode,
  getAppleConfig,
  verifyAppleIdToken,
};
