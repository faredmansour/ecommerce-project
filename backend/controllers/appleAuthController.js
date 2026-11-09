const crypto = require("crypto");
const User = require("../models/usermodel");
const OAuthTransaction = require("../models/oauthTransactionModel");
const OAuthExchange = require("../models/oauthExchangeModel");
const hashToken = require("../utils/hashToken");
const {
  createAppleAuthorizationUrl,
  exchangeAppleCode,
  getAppleConfig,
  verifyAppleIdToken,
} = require("../services/appleOidcService");

const FLOW_TTL_MS = 10 * 60 * 1000;
const EXCHANGE_TTL_MS = 60 * 1000;
const OAUTH_COOKIE = "alfredo_apple_oauth_state";
const EXCHANGE_COOKIE = "alfredo_apple_oauth_exchange";
const cookieAttributes = (path, maxAge) => `HttpOnly; SameSite=${process.env.NODE_ENV === "production" ? "None" : "Lax"}; Path=${path}; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
const getCookie = (req, name) => {
  const raw = req.headers.cookie || "";
  const pair = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return pair ? pair.slice(name.length + 1) : "";
};
const clearCookie = (res, name, path) => res.append("Set-Cookie", `${name}=; ${cookieAttributes(path, 0)}`);
const clearOAuthCookie = (res) => clearCookie(res, OAUTH_COOKIE, "/api/auth/apple");
const clearExchangeCookie = (res) => clearCookie(res, EXCHANGE_COOKIE, "/api/auth/apple/exchange");
const safeReturnTo = (value) => {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try {
    const url = new URL(value, "https://storefront.invalid");
    return url.origin === "https://storefront.invalid" ? `${url.pathname}${url.search}${url.hash}` : "/";
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

const beginAppleFlow = async (req, res, intent, user) => {
  const config = getAppleConfig();
  if (!config) {
    return res.status(503).json({ status: "fail", code: "APPLE_AUTH_NOT_CONFIGURED", message: "Apple sign-in is not configured." });
  }
  try {
    const state = crypto.randomBytes(32).toString("hex");
    const nonce = crypto.randomBytes(32).toString("hex");
    const exchangeBinding = crypto.randomBytes(32).toString("hex");
    const returnTo = safeReturnTo(req.body?.returnTo);
    await OAuthTransaction.create({
      provider: "apple",
      stateHash: hashToken(state),
      nonce,
      exchangeBindingHash: hashToken(exchangeBinding),
      intent,
      user: user?.id,
      authVersion: user ? req.user.sessionVersion || 0 : undefined,
      returnTo,
      expiresAt: new Date(Date.now() + FLOW_TTL_MS),
    });
    const authUrl = createAppleAuthorizationUrl({ config, state, nonce });
    res.append("Set-Cookie", `${OAUTH_COOKIE}=${state}; ${cookieAttributes("/api/auth/apple", Math.floor(FLOW_TTL_MS / 1000))}`);
    res.append("Set-Cookie", `${EXCHANGE_COOKIE}=${exchangeBinding}; ${cookieAttributes("/api/auth/apple/exchange", Math.ceil((FLOW_TTL_MS + EXCHANGE_TTL_MS) / 1000))}`);
    return res.status(200).json({ status: "success", data: { authUrl } });
  } catch {
    return res.status(503).json({ status: "fail", code: "APPLE_AUTH_UNAVAILABLE", message: "Apple sign-in is temporarily unavailable." });
  }
};

const appleSignInStart = (req, res) => beginAppleFlow(req, res, "sign_in");
const appleLinkStart = (req, res) => beginAppleFlow(req, res, "link", req.user);

const appleCallback = async (req, res) => {
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!/^[a-f0-9]{64}$/.test(state)) {
    clearOAuthCookie(res);
    clearExchangeCookie(res);
    return res.redirect(loginUrl("apple_invalid_state", "/"));
  }
  const config = getAppleConfig();
  if (!config) {
    clearOAuthCookie(res);
    clearExchangeCookie(res);
    return res.redirect(loginUrl("apple_unavailable", "/"));
  }
  const browserState = getCookie(req, OAUTH_COOKIE);
  if (!/^[a-f0-9]{64}$/.test(browserState) || !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(browserState))) {
    clearOAuthCookie(res);
    clearExchangeCookie(res);
    return res.redirect(loginUrl("apple_invalid_state", "/"));
  }

  let flow;
  try {
    flow = await OAuthTransaction.findOneAndDelete({
      provider: "apple",
      stateHash: hashToken(state),
      expiresAt: { $gt: new Date() },
    });
    clearOAuthCookie(res);
    if (!flow) {
      clearExchangeCookie(res);
      return res.redirect(loginUrl("apple_invalid_state", "/"));
    }
    if (req.query.error || typeof req.query.code !== "string" || req.query.code.length > 4096) {
      clearExchangeCookie(res);
      return res.redirect(flow.intent === "link"
        ? linkResultUrl("apple_failed", flow.returnTo)
        : loginUrl("apple_failed", flow.returnTo));
    }

    const idToken = await exchangeAppleCode({ code: req.query.code, config });
    const identity = await verifyAppleIdToken({ idToken, audience: config.clientId, nonce: flow.nonce });

    let user;
    if (flow.intent === "link") {
      user = await User.findById(flow.user).select("+appleSub");
      if (!user || !identity.emailVerified || !identity.email || user.email.toLowerCase() !== identity.email) {
        clearExchangeCookie(res);
        return res.redirect(linkResultUrl("apple_link_email_mismatch", flow.returnTo));
      }
      const existingIdentity = await User.findOne({ appleSub: identity.subject }).select("+appleSub");
      if (existingIdentity && String(existingIdentity._id) !== String(user._id)) {
        clearExchangeCookie(res);
        return res.redirect(linkResultUrl("apple_identity_already_linked", flow.returnTo));
      }
      const currentAuthVersion = flow.authVersion || 0;
      const versionFilter = currentAuthVersion === 0
        ? { $or: [{ authVersion: 0 }, { authVersion: { $exists: false } }] }
        : { authVersion: currentAuthVersion };
      try {
        user = await User.findOneAndUpdate(
          { _id: user._id, ...versionFilter },
          { $set: { appleSub: identity.subject, emailVerified: true, emailVerifiedAt: user.emailVerifiedAt || new Date() } },
          { returnDocument: "after", runValidators: true }
        );
        if (!user) {
          clearExchangeCookie(res);
          return res.redirect(linkResultUrl("apple_failed", flow.returnTo));
        }
      } catch (error) {
        if (error.code === 11000) {
          clearExchangeCookie(res);
          return res.redirect(linkResultUrl("apple_identity_already_linked", flow.returnTo));
        }
        throw error;
      }
    } else {
      user = await User.findOne({ appleSub: identity.subject }).select("+appleSub");
      if (!user) {
        if (!identity.emailVerified || !identity.email) {
          clearExchangeCookie(res);
          return res.redirect(loginUrl("apple_email_unavailable", flow.returnTo));
        }
        const sameEmail = await User.findOne({ email: identity.email });
        if (sameEmail) {
          clearExchangeCookie(res);
          return res.redirect(loginUrl("account_exists", flow.returnTo));
        }
        try {
          user = await User.create({
            name: "Apple User",
            email: identity.email,
            appleSub: identity.subject,
            role: "user",
            emailVerified: true,
            emailVerifiedAt: new Date(),
          });
        } catch (error) {
          if (error.code !== 11000) throw error;
          user = await User.findOne({ appleSub: identity.subject }).select("+appleSub");
          if (!user) {
            clearExchangeCookie(res);
            return res.redirect(loginUrl("account_exists", flow.returnTo));
          }
        }
      }
    }

    const exchangeCode = crypto.randomBytes(32).toString("hex");
    await OAuthExchange.create({
      provider: "apple",
      codeHash: hashToken(exchangeCode),
      bindingHash: flow.exchangeBindingHash,
      user: user._id,
      returnTo: safeReturnTo(flow.returnTo),
      expiresAt: new Date(Date.now() + EXCHANGE_TTL_MS),
    });
    const callbackUrl = new URL("/auth/callback", frontendUrl());
    callbackUrl.searchParams.set("provider", "apple");
    callbackUrl.searchParams.set("code", exchangeCode);
    return res.redirect(callbackUrl.toString());
  } catch {
    clearOAuthCookie(res);
    clearExchangeCookie(res);
    return res.redirect(flow?.intent === "link"
      ? linkResultUrl("apple_failed", flow.returnTo)
      : loginUrl("apple_failed", flow?.returnTo || "/"));
  }
};

const appleExchange = async (req, res, next) => {
  try {
    const binding = getCookie(req, EXCHANGE_COOKIE);
    if (!/^[a-f0-9]{64}$/.test(binding)) {
      return res.status(401).json({ status: "fail", code: "OAUTH_CODE_INVALID", message: "Sign-in could not be completed. Please try again." });
    }
    const exchange = await OAuthExchange.findOneAndDelete({
      provider: "apple",
      codeHash: hashToken(req.body.code),
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

module.exports = { appleSignInStart, appleLinkStart, appleCallback, appleExchange };
