const { OAuth2Client } = require("google-auth-library");

function getGoogleConfig(env = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const redirectUri = env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

function createGoogleClient(config) {
  return new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
}

async function verifyGoogleIdToken({ client, idToken, audience, nonce }) {
  const ticket = await client.verifyIdToken({ idToken, audience });
  const payload = ticket.getPayload();
  const validIssuer = ["accounts.google.com", "https://accounts.google.com"].includes(payload?.iss);
  if (!validIssuer || !payload?.sub || !payload?.email || payload.email_verified !== true || payload.nonce !== nonce) {
    const error = new Error("Google identity could not be verified.");
    error.code = "GOOGLE_IDENTITY_INVALID";
    throw error;
  }
  return {
    subject: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email,
  };
}

module.exports = { getGoogleConfig, createGoogleClient, verifyGoogleIdToken };
