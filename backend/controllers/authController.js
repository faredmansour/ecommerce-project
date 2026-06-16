const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/usermodel");
const Token = require("../models/tokenModel");
const sendEmail = require("../utils/email");
const AppError = require("../utils/appError");

const createAccessToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
  });

const createRefreshToken = async (user) => {
  const refreshToken = crypto.randomBytes(40).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await Token.create({ user: user._id, token: refreshToken, type: "refresh", expiresAt });
  return refreshToken;
};

const buildAuthResponse = async (user) => {
  const accessToken = createAccessToken(user);
  const refreshToken = await createRefreshToken(user);
  return {
    accessToken,
    refreshToken,
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  };
};

const registerController = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const userExists = await User.findOne({ email });
    if (userExists) {
      return next(new AppError("This user already exists", 400));
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({ name, email, password: hashedPassword, role });
    const authData = await buildAuthResponse(newUser);

    res.status(201).json({ status: "success", data: authData });
  } catch (err) {
    next(err);
  }
};

const loginController = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const foundUser = await User.findOne({ email });
    if (!foundUser) {
      return next(new AppError("Incorrect email or password", 400));
    }

    const isMatch = await bcrypt.compare(password, foundUser.password);
    if (!isMatch) {
      return next(new AppError("Incorrect email or password", 400));
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
    const storedToken = await Token.findOne({ token: refreshToken, type: "refresh", revoked: false });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      return next(new AppError("Invalid or expired refresh token", 401));
    }

    const user = await User.findById(storedToken.user);
    if (!user) {
      return next(new AppError("User not found", 401));
    }

    await Token.revoke(refreshToken, "refresh");
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
      return res.status(200).json({
        status: "success",
        message: "If that email exists, a password reset link has been sent.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await Token.create({ user: user._id, token: resetToken, type: "reset", expiresAt });

    const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/reset-password?token=${resetToken}`;
    const message = `You requested a password reset. Use the following link to reset your password:\n\n${resetUrl}\n\nIf you did not request this, please ignore this email.`;

    await sendEmail({
      to: user.email,
      subject: "Password Reset Request",
      text: message,
      html: `<p>${message.replace(/\n/g, "<br />")}</p>`,
    });

    res.status(200).json({
      status: "success",
      message: "If that email exists, a password reset link has been sent.",
    });
  } catch (err) {
    next(err);
  }
};

const resetPasswordController = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const resetToken = await Token.findOne({ token, type: "reset", revoked: false });

    if (!resetToken || resetToken.expiresAt < new Date()) {
      return next(new AppError("Invalid or expired reset token", 400));
    }

    const user = await User.findById(resetToken.user);
    if (!user) {
      return next(new AppError("User not found", 404));
    }

    user.password = await bcrypt.hash(password, 10);
    await user.save();
    await Token.revoke(token, "reset");
    await Token.updateMany({ user: user._id, type: "refresh", revoked: false }, { revoked: true });

    res.status(200).json({ status: "success", message: "Password has been reset successfully." });
  } catch (err) {
    next(err);
  }
};

const getCurrentUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("name email role createdAt");
    if (!user) {
      return next(new AppError("User not found", 404));
    }
    res.status(200).json({ status: "success", data: user });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  registerController,
  loginController,
  refreshTokenController,
  logoutController,
  forgotPasswordController,
  resetPasswordController,
  getCurrentUser,
};
