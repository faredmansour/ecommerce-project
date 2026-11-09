const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const {
  registerController,
  loginController,
  refreshTokenController,
  logoutController,
  forgotPasswordController,
  resetPasswordController,
  verifyEmailController,
  resendVerificationController,
  getCurrentUser,
} = require("../controllers/authController");
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  emailVerificationSchema,
  verificationResendSchema,
  googleStartSchema,
  googleExchangeSchema,
} = require("../controllers/validation/authValidationExtended");
const googleAuthController = require("../controllers/googleAuthController");
const appleAuthController = require("../controllers/appleAuthController");

router.post("/register", validateRequest(registerSchema), registerController);
router.post("/login", validateRequest(loginSchema), loginController);
router.post("/refresh", validateRequest(refreshTokenSchema), refreshTokenController);
router.post("/logout", validateRequest(refreshTokenSchema), logoutController);
router.post("/forgot-password", validateRequest(passwordResetRequestSchema), forgotPasswordController);
router.post("/reset-password", validateRequest(passwordResetSchema), resetPasswordController);
router.post("/verify-email", validateRequest(emailVerificationSchema), verifyEmailController);
router.post("/resend-verification", validateRequest(verificationResendSchema), resendVerificationController);
router.post("/google/start", validateRequest(googleStartSchema), googleAuthController.googleSignInStart);
router.get("/google/callback", googleAuthController.googleCallback);
router.post("/google/exchange", validateRequest(googleExchangeSchema), googleAuthController.googleExchange);
router.post("/google/link/start", protect, validateRequest(googleStartSchema), googleAuthController.googleLinkStart);
router.post("/apple/start", validateRequest(googleStartSchema), appleAuthController.appleSignInStart);
router.get("/apple/callback", appleAuthController.appleCallback);
router.post("/apple/exchange", validateRequest(googleExchangeSchema), appleAuthController.appleExchange);
router.post("/apple/link/start", protect, validateRequest(googleStartSchema), appleAuthController.appleLinkStart);
router.get("/me", protect, getCurrentUser);

module.exports = router;
