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
  getCurrentUser,
} = require("../controllers/authController");
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
} = require("../controllers/validation/authValidationExtended");

router.post("/register", validateRequest(registerSchema), registerController);
router.post("/login", validateRequest(loginSchema), loginController);
router.post("/refresh", validateRequest(refreshTokenSchema), refreshTokenController);
router.post("/logout", validateRequest(refreshTokenSchema), logoutController);
router.post("/forgot-password", validateRequest(passwordResetRequestSchema), forgotPasswordController);
router.post("/reset-password", validateRequest(passwordResetSchema), resetPasswordController);
router.get("/me", protect, getCurrentUser);

module.exports = router;
