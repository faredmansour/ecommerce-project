const Joi = require("joi");

const addWishlistItemSchema = Joi.object({
  product_id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  name: Joi.string().trim().required(),
  image: Joi.string().allow("", null),
  category: Joi.string().allow("", null),
});

module.exports = { addWishlistItemSchema };
