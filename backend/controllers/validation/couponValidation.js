const Joi = require("joi");

const applyCouponSchema = Joi.object({
  code: Joi.string().trim().required(),
});

module.exports = { applyCouponSchema };
