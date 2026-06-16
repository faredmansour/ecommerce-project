const Joi = require("joi");

const paymentIntentSchema = Joi.object({
  amount: Joi.number().positive().required(),
  currency: Joi.string().lowercase().length(3).default("usd"),
});

module.exports = { paymentIntentSchema };
