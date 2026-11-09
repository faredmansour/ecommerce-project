const Joi = require("joi");

const registerSchema = Joi.object({
  name: Joi.string().trim().min(3).max(30).required(),
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string()
    .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$"))
    .message(
      "Password must be at least 8 characters long and include uppercase, lowercase, number, and special character"
    )
    .required(),
  returnTo: Joi.string().max(2048).optional(),
});

const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().required(),
});

const refreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

const passwordResetRequestSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
});

const passwordResetSchema = Joi.object({
  token: Joi.string().required(),
  password: Joi.string()
    .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$"))
    .message(
      "Password must be at least 8 characters long and include uppercase, lowercase, number, and special character"
    )
    .required(),
});

const emailVerificationSchema = Joi.object({ token: Joi.string().max(256).required() });
const verificationResendSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  returnTo: Joi.string().max(2048).optional(),
});

const googleStartSchema = Joi.object({
  returnTo: Joi.string().max(2048).optional(),
});

const googleExchangeSchema = Joi.object({
  code: Joi.string().pattern(/^[a-f0-9]{64}$/).required(),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  emailVerificationSchema,
  verificationResendSchema,
  googleStartSchema,
  googleExchangeSchema,
};
