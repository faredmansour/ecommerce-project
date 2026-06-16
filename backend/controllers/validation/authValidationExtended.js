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
  role: Joi.string().valid("user", "admin").default("user"),
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

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
};
