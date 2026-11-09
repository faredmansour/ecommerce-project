const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/usermodel");
const Token = require("../models/tokenModel");
const sendEmail = require("../utils/email");
const AppError = require("../utils/appError");
const hashToken = require("../utils/hashToken");

const GENERIC_AUTH_NOTICE = "If that email can be verified, instructions have been sent.";
const isVerified = (user) => user.emailVerified === true || Boolean(user.googleSub || user.appleSub);
const htmlEscape = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
const safeReturnTo = (value) => {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try {
    const parsed = new URL(value, "https://storefront.invalid");
    return parsed.origin === "https://storefront.invalid" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/";
  } catch { return "/"; }
};
const verificationUrl = (token) => `${process.env.FRONTEND_URL || "http://localhost:5173"}/verify-email?token=${token}`;
const sendVerification = async (user, token) => sendEmail({
  to: user.email,
  subject: "Verify your ALFREDO account",
  text: `Verify your email using this link: ${verificationUrl(token)}`,
  html: `<p>Verify your email using this link:</p><p><a href="${htmlEscape(verificationUrl(token))}">Verify email</a></p>`,
});

const findStoredToken = async (token, type) => {
  const hashed = await Token.findOne({ token: hashToken(token), type, revoked: false });
  if (hashed) return hashed;
  // Temporary fallback lets existing plaintext tokens rotate/revoke during migration.
  return Token.findOne({ token, type, revoked: false });
};

const sessionVersionFilter = (sessionVersion) => sessionVersion === 0
  ? { $or: [{ sessionVersion: 0 }, { sessionVersion: { $exists: false } }] }
  : { sessionVersion };

const authVersionFilter = (authVersion) => authVersion === 0
  ? { $or: [{ authVersion: 0 }, { authVersion: { $exists: false } }] }
  : { authVersion };

const createAccessToken = (user) =>
  jwt.sign({ id: user._id, role: user.role, sessionVersion: user.authVersion || 0 }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
  });

const createRefreshToken = async (user) => {
  const refreshToken = crypto.randomBytes(40).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await Token.create({
    user: user._id,
    token: hashToken(refreshToken),
    type: "refresh",
    sessionVersion: user.authVersion || 0,
    expiresAt,
  });
  return refreshToken;
};

const buildAuthResponse = async (user) => {
  const accessToken = createAccessToken(user);
  const refreshToken = await createRefreshToken(user);
  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      authProviders: { google: Boolean(user.googleSub), apple: Boolean(user.appleSub) },
    },
  };
};

const registerController = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const returnTo = safeReturnTo(req.body.returnTo);
    const userExists = await User.findOne({ email });
    let user = userExists;
    let rawToken;
    const now = new Date();
    if (!user) {
      rawToken = crypto.randomBytes(32).toString("hex");
      user = await User.create({ name, email, password: await bcrypt.hash(password, 10), role: "user", emailVerified: false,
        emailVerificationTokenHash: hashToken(rawToken), emailVerificationExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
        emailVerificationSentAt: now, emailVerificationReturnTo: returnTo });
    } else if (!isVerified(user) && user.password && (!user.emailVerificationSentAt || now - user.emailVerificationSentAt > 60_000)) {
      rawToken = crypto.randomBytes(32).toString("hex");
      user.emailVerificationTokenHash = hashToken(rawToken);
      user.emailVerificationExpiresAt = new Date(now.getTime() + 30 * 60 * 1000);
      user.emailVerificationSentAt = now;
      user.emailVerificationReturnTo = returnTo;
      await user.save();
    }
    let deliveryFailed = false;
    if (rawToken) {
      try { await sendVerification(user, rawToken); } catch { deliveryFailed = true; }
    }
    const developmentVerificationUrl = process.env.NODE_ENV === "development" && rawToken && deliveryFailed
      ? verificationUrl(rawToken)
      : undefined;
    return res.status(202).json({
      status: "success",
      message: GENERIC_AUTH_NOTICE,
      ...(developmentVerificationUrl ? { developmentVerificationUrl } : {}),
    });
  } catch (err) {
    if (err?.code === 11000) return res.status(202).json({ status: "success", message: GENERIC_AUTH_NOTICE });
    next(err);
  }
};

const loginController = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const foundUser = await User.findOne({ email }).select("+googleSub");
    if (!foundUser) {
      return next(new AppError("Incorrect email or password", 400));
    }

    const isMatch = foundUser.password ? await bcrypt.compare(password, foundUser.password) : false;
    if (!isMatch) {
      return next(new AppError("Incorrect email or password", 400));
    }

    if (!isVerified(foundUser)) {
      return res.status(403).json({ status: "fail", code: "EMAIL_VERIFICATION_REQUIRED", message: "Verify your email before signing in." });
    }

    const authData = await buildAuthResponse(foundUser);
    res.status(200).json({ status: "success", data: authData });
  } catch (err) {
    next(err);
  }
};

const refreshTokenController = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const storedToken = await findStoredToken(refreshToken, "refresh");

    if (!storedToken || storedToken.expiresAt < new Date()) {
      return next(new AppError("Invalid or expired refresh token", 401));
    }

    const user = await User.findById(storedToken.user).select("+googleSub");
    if (!user) {
      return next(new AppError("User not found", 401));
    }
    if ((storedToken.sessionVersion || 0) !== (user.authVersion || 0)) {
      return next(new AppError("Invalid or expired refresh token", 401));
    }
    if (!isVerified(user)) return next(new AppError("Email verification is required", 401));

    const revokedToken = await Token.findOneAndUpdate(
      { _id: storedToken._id, revoked: false, expiresAt: { $gt: new Date() } },
      { revoked: true },
      { returnDocument: "after" }
    );
    if (!revokedToken) {
      return next(new AppError("Invalid or expired refresh token", 401));
    }
    const accessToken = createAccessToken(user);
    const newRefreshToken = await createRefreshToken(user);

    res.status(200).json({ status: "success", data: { accessToken, refreshToken: newRefreshToken } });
  } catch (err) {
    next(err);
  }
};

const logoutController = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const revokedToken = await Token.revoke(refreshToken, "refresh");
    if (!revokedToken) {
      return next(new AppError("Invalid refresh token", 400));
    }
    res.status(200).json({ status: "success", message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
};

const forgotPasswordController = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json({ status: "success", message: "If that email exists, a password reset link has been sent." });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await Token.updateMany({ user: user._id, type: "reset", revoked: false }, { revoked: true });
    await Token.create({
      user: user._id,
      token: hashToken(resetToken),
      type: "reset",
      sessionVersion: user.authVersion || 0,
      expiresAt,
    });

    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password?token=${resetToken}`;
    const message = `You requested a password reset. Use the following link to reset your password:\n\n${resetUrl}\n\nIf you did not request this, please ignore this email.`;

    try { await sendEmail({
      to: user.email,
      subject: "Password Reset Request",
      text: message,
      html: `<p>You requested a password reset. Use this link to reset your password: <a href="${htmlEscape(resetUrl)}">Reset password</a></p><p>If you did not request this, please ignore this email.</p>`,
    }); } catch { /* Do not disclose whether an account or mail delivery exists. */ }

    res.status(200).json({
      status: "success",
      message: "If that email exists, a password reset link has been sent.",
    });
  } catch (err) {
    next(err);
  }
};

const verifyEmailController = async (req, res) => {
  const token = req.body.token;
  const user = await User.findOneAndUpdate(
    { emailVerified: { $ne: true }, emailVerificationTokenHash: hashToken(token), emailVerificationExpiresAt: { $gt: new Date() } },
    { $set: { emailVerified: true, emailVerifiedAt: new Date() }, $unset: { emailVerificationTokenHash: 1, emailVerificationExpiresAt: 1, emailVerificationSentAt: 1, emailVerificationReturnTo: 1 } },
    { returnDocument: "before", select: "+emailVerificationReturnTo" }
  );
  if (!user) return res.status(400).json({ status: "fail", message: "This verification link is invalid or expired." });
  return res.status(200).json({ status: "success", message: "Email verified.", data: { returnTo: safeReturnTo(user.emailVerificationReturnTo) } });
};

const resendVerificationController = async (req, res) => {
  const { email } = req.body;
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const user = await User.findOneAndUpdate({
    email,
    emailVerified: { $ne: true },
    password: { $exists: true, $ne: null },
    $or: [{ emailVerificationSentAt: { $exists: false } }, { emailVerificationSentAt: { $lt: new Date(now.getTime() - 60_000) } }],
  }, { $set: {
      emailVerificationTokenHash: hashToken(token), emailVerificationExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      emailVerificationSentAt: now, emailVerificationReturnTo: safeReturnTo(req.body.returnTo),
    } }, { returnDocument: "after", select: "email" });
  let deliveryFailed = false;
  if (user) {
    try { await sendVerification(user, token); } catch { deliveryFailed = true; }
  }
  const developmentVerificationUrl = process.env.NODE_ENV === "development" && user && deliveryFailed
    ? verificationUrl(token)
    : undefined;
  return res.status(200).json({
    status: "success",
    message: GENERIC_AUTH_NOTICE,
    ...(developmentVerificationUrl ? { developmentVerificationUrl } : {}),
  });
};

const resetPasswordController = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const resetToken = await findStoredToken(token, "reset");

    if (!resetToken || resetToken.expiresAt < new Date()) {
      return next(new AppError("Invalid or expired reset token", 400));
    }

    const user = await User.findById(resetToken.user);
    if (!user) {
      return next(new AppError("Invalid or expired reset token", 400));
    }

    const currentSessionVersion = user.authVersion || 0;
    if ((resetToken.sessionVersion || 0) !== currentSessionVersion) {
      return next(new AppError("Invalid or expired reset token", 400));
    }

    const consumedToken = await Token.findOneAndUpdate(
      {
        _id: resetToken._id,
        revoked: false,
        expiresAt: { $gt: new Date() },
        ...sessionVersionFilter(currentSessionVersion),
      },
      { revoked: true },
      { returnDocument: "after" }
    );
    if (!consumedToken) {
      return next(new AppError("Invalid or expired reset token", 400));
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const updatedUser = await User.findOneAndUpdate(
      { _id: user._id, ...authVersionFilter(currentSessionVersion) },
      { $set: { password: passwordHash }, $inc: { authVersion: 1 } },
      { returnDocument: "after" }
    );
    if (!updatedUser) {
      return next(new AppError("Invalid or expired reset token", 400));
    }

    await Token.updateMany({ user: user._id, type: "reset", revoked: false }, { revoked: true });
    await Token.updateMany({ user: user._id, type: "refresh", revoked: false }, { revoked: true });

    res.status(200).json({ status: "success", message: "Password has been reset successfully." });
  } catch (err) {
    next(err);
  }
};

const getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("name email role createdAt +googleSub +appleSub");
    if (!user) {
      return next(new AppError("User not found", 404));
    }
    res.status(200).json({ status: "success", data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      authProviders: { google: Boolean(user.googleSub), apple: Boolean(user.appleSub) },
    } });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  buildAuthResponse,
  registerController,
  loginController,
  refreshTokenController,
  logoutController,
  forgotPasswordController,
  resetPasswordController,
  verifyEmailController,
  resendVerificationController,
  getCurrentUser,
};
