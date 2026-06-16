const Joi = require("joi");

const addToCartSchema = Joi.object({
  product_id: Joi.string().required(),
  quantity: Joi.number().integer().min(1).default(1),
  name: Joi.string().trim().required(),
  price: Joi.number().min(0).required(),
  image: Joi.string().allow("", null),
  category: Joi.string().allow("", null),
});

const updateCartItemSchema = Joi.object({
  quantity: Joi.number().integer().min(1).required(),
});

module.exports = { addToCartSchema, updateCartItemSchema };
