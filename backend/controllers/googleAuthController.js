const crypto = require("crypto");
const User = require("../models/usermodel");
const OAuthTransaction = require("../models/oauthTransactionModel");
const OAuthExchange = require("../models/oauthExchangeModel");
const hashToken = require("../utils/hashToken");
const { getGoogleConfig, createGoogleClient, verifyGoogleIdToken } = require("../services/googleOidcService");

const FLOW_TTL_MS = 10 * 60 * 1000;
const EXCHANGE_TTL_MS = 60 * 1000;
const OAUTH_COOKIE = "alfredo_oauth_state";
const EXCHANGE_COOKIE = "alfredo_oauth_exchange";
const cookieAttributes = (path, maxAge) => `HttpOnly; SameSite=${process.env.NODE_ENV === "production" ? "None" : "Lax"}; Path=${path}; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
const getOAuthCookie = (req) => {
  const raw = req.headers.cookie || "";
  const pair = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${OAUTH_COOKIE}=`));
  return pair ? pair.slice(OAUTH_COOKIE.length + 1) : "";
};
const getExchangeCookie = (req) => {
  const raw = req.headers.cookie || "";
  const pair = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${EXCHANGE_COOKIE}=`));
  return pair ? pair.slice(EXCHANGE_COOKIE.length + 1) : "";
};
const clearOAuthCookie = (res) => res.append("Set-Cookie", `${OAUTH_COOKIE}=; ${cookieAttributes("/api/auth/google", 0)}`);
const clearExchangeCookie = (res) => res.append("Set-Cookie", `${EXCHANGE_COOKIE}=; ${cookieAttributes("/api/auth/google/exchange", 0)}`);
const safeReturnTo = (value) => {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try {
    const url = new URL(value, "https://storefront.invalid");
    if (url.origin !== "https://storefront.invalid") return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
};

const frontendUrl = () => {
  const configured = process.env.FRONTEND_URL || (process.env.CLIENT_URL || "http://localhost:5173").split(",")[0].trim();
  try { return new URL(configured).origin; } catch { return "http://localhost:5173"; }
};

const resultUrl = (path, errorCode, returnTo) => {
  const url = new URL(path, frontendUrl());
  url.searchParams.set("providerError", errorCode);
  url.searchParams.set("returnTo", safeReturnTo(returnTo));
  return url.toString();
};
const loginUrl = (errorCode, returnTo) => resultUrl("/login", errorCode, returnTo);
const linkResultUrl = (errorCode, returnTo) => resultUrl("/account", errorCode, returnTo);

const createTransaction = async ({ state, nonce, codeVerifier, exchangeBindingHash, intent, user, authVersion, returnTo }) => OAuthTransaction.create({
  provider: "google",
  stateHash: hashToken(state), nonce, codeVerifier, exchangeBindingHash, intent, user,
  authVersion,
  returnTo: safeReturnTo(returnTo),
  expiresAt: new Date(Date.now() + FLOW_TTL_MS),
});

const beginGoogleFlow = async (req, res, intent, user) => {
  const config = getGoogleConfig();
  if (!config) return res.status(503).json({ status: "fail", code: "GOOGLE_AUTH_NOT_CONFIGURED", message: "Google sign-in is not configured." });
  try {
    const state = crypto.randomBytes(32).toString("hex");
    const nonce = crypto.randomBytes(32).toString("hex");
    const exchangeBinding = crypto.randomBytes(32).toString("hex");
    const client = createGoogleClient(config);
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    await createTransaction({
      state,
      nonce,
      codeVerifier,
      exchangeBindingHash: hashToken(exchangeBinding),
      intent,
      user,
      authVersion: user ? req.user.sessionVersion || 0 : undefined,
      returnTo: req.body?.returnTo || req.query?.returnTo,
    });
    const authUrl = client.generateAuthUrl({
      response_type: "code",
      scope: ["openid", "email", "profile"],
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    res.append("Set-Cookie", `${OAUTH_COOKIE}=${state}; ${cookieAttributes("/api/auth/google", Math.floor(FLOW_TTL_MS / 1000))}`);
    res.append("Set-Cookie", `${EXCHANGE_COOKIE}=${exchangeBinding}; ${cookieAttributes("/api/auth/google/exchange", Math.ceil((FLOW_TTL_MS + EXCHANGE_TTL_MS) / 1000))}`);
    return res.status(200).json({ status: "success", data: { authUrl } });
  } catch {
    return res.status(503).json({ status: "fail", code: "GOOGLE_AUTH_UNAVAILABLE", message: "Google sign-in is temporarily unavailable." });
  }
};

const googleSignInStart = (req, res) => beginGoogleFlow(req, res, "sign_in");
const googleLinkStart = (req, res) => beginGoogleFlow(req, res, "link", req.user.id);

const googleCallback = async (req, res) => {
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!/^[a-f0-9]{64}$/.test(state)) {
    clearOAuthCookie(res);
    clearExchangeCookie(res);
    return res.redirect(loginUrl("invalid_state", "/"));
  }
  const config = getGoogleConfig();
  if (!config) {
    clearOAuthCookie(res);
    clearExchangeCookie(res);
    return res.redirect(loginUrl("google_unavailable", "/"));
  }
  const browserState = getOAuthCookie(req);
  const stateMatchesBrowser = /^[a-f0-9]{64}$/.test(browserState)
    && crypto.timingSafeEqual(Buffer.from(state), Buffer.from(browserState));
  if (!stateMatchesBrowser) {
    clearOAuthCookie(res);
    clearExchangeCookie(res);
    return res.redirect(loginUrl("invalid_state", "/"));
  }

  let flow;
  try {
    flow = await OAuthTransaction.findOneAndDelete({
      $and: [
        { stateHash: hashToken(state) },
        { $or: [{ provider: "google" }, { provider: { $exists: false } }] },
      ],
      expiresAt: { $gt: new Date() },
    });
    clearOAuthCookie(res);
    if (!flow) {
      clearExchangeCookie(res);
      return res.redirect(loginUrl("invalid_state", "/"));
    }
    if (req.query.error || typeof req.query.code !== "string" || req.query.code.length > 4096) {
      clearExchangeCookie(res);
      return res.redirect(flow.intent === "link"
        ? linkResultUrl("google_failed", flow.returnTo)
        : loginUrl("google_failed", flow.returnTo));
    }

    const client = createGoogleClient(config);
    const { tokens } = await client.getToken({ code: req.query.code, codeVerifier: flow.codeVerifier });
    if (!tokens.id_token) {
      clearExchangeCookie(res);
      return res.redirect(loginUrl("google_failed", flow.returnTo));
    }
    const identity = await verifyGoogleIdToken({ client, idToken: tokens.id_token, audience: config.clientId, nonce: flow.nonce });

    let user;
    if (flow.intent === "link") {
      user = await User.findById(flow.user).select("+googleSub");
      if (!user || user.email.toLowerCase() !== identity.email) {
        clearExchangeCookie(res);
        return res.redirect(linkResultUrl("link_email_mismatch", flow.returnTo));
      }
      const existingIdentity = await User.findOne({ googleSub: identity.subject }).select("+googleSub");
      if (existingIdentity && String(existingIdentity._id) !== String(user._id)) {
        clearExchangeCookie(res);
        return res.redirect(linkResultUrl("identity_already_linked", flow.returnTo));
      }
      const currentAuthVersion = flow.authVersion || 0;
      const authVersionFilter = currentAuthVersion === 0
        ? { $or: [{ authVersion: 0 }, { authVersion: { $exists: false } }] }
        : { authVersion: currentAuthVersion };
      try {
        user = await User.findOneAndUpdate(
          { _id: user._id, ...authVersionFilter },
          { $set: { googleSub: identity.subject, emailVerified: true, emailVerifiedAt: user.emailVerifiedAt || new Date() } },
          { returnDocument: "after", runValidators: true }
        );
        if (!user) {
          clearExchangeCookie(res);
          return res.redirect(linkResultUrl("google_failed", flow.returnTo));
        }
      } catch (error) {
        if (error.code === 11000) {
          clearExchangeCookie(res);
          return res.redirect(linkResultUrl("identity_already_linked", flow.returnTo));
        }
        throw error;
      }
    } else {
      user = await User.findOne({ googleSub: identity.subject }).select("+googleSub");
      if (!user) {
        const sameEmail = await User.findOne({ email: identity.email });
        if (sameEmail) return res.redirect(loginUrl("account_exists", flow.returnTo));
        user = await User.create({ name: identity.name, email: identity.email, googleSub: identity.subject, role: "user", emailVerified: true, emailVerifiedAt: new Date() });
      } else if (user.emailVerified !== true) {
        user.emailVerified = true;
        user.emailVerifiedAt = new Date();
        await user.save();
      }
    }

    const exchangeCode = crypto.randomBytes(32).toString("hex");
    await OAuthExchange.create({
      provider: "google",
      codeHash: hashToken(exchangeCode),
      bindingHash: flow.exchangeBindingHash,
      user: user._id,
      returnTo: safeReturnTo(flow.returnTo),
      expiresAt: new Date(Date.now() + EXCHANGE_TTL_MS),
    });
    const callbackUrl = new URL("/auth/callback", frontendUrl());
    callbackUrl.searchParams.set("code", exchangeCode);
    return res.redirect(callbackUrl.toString());
  } catch {
    clearOAuthCookie(res);
    clearExchangeCookie(res);
    return res.redirect(flow?.intent === "link"
      ? linkResultUrl("google_failed", flow.returnTo)
      : loginUrl("google_failed", flow?.returnTo || "/"));
  }
};

const googleExchange = async (req, res, next) => {
  try {
    const binding = getExchangeCookie(req);
    if (!/^[a-f0-9]{64}$/.test(binding)) {
      return res.status(401).json({ status: "fail", code: "OAUTH_CODE_INVALID", message: "Sign-in could not be completed. Please try again." });
    }
    const exchange = await OAuthExchange.findOneAndDelete({
      $and: [
        { codeHash: hashToken(req.body.code) },
        { $or: [{ provider: "google" }, { provider: { $exists: false } }] },
      ],
      bindingHash: hashToken(binding),
      expiresAt: { $gt: new Date() },
    });
    if (!exchange) return res.status(401).json({ status: "fail", code: "OAUTH_CODE_INVALID", message: "Sign-in could not be completed. Please try again." });
    clearExchangeCookie(res);
    const user = await User.findById(exchange.user).select("+googleSub +appleSub");
    if (!user) return res.status(401).json({ status: "fail", code: "OAUTH_CODE_INVALID", message: "Sign-in could not be completed. Please try again." });
    const { buildAuthResponse } = require("./authController");
    const authData = await buildAuthResponse(user);
    return res.status(200).json({ status: "success", data: { ...authData, returnTo: exchange.returnTo } });
  } catch (error) {
    return next(error);
  }
};

module.exports = { googleSignInStart, googleLinkStart, googleCallback, googleExchange, safeReturnTo };
