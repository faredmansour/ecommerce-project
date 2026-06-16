const Joi = require("joi");

const addWishlistItemSchema = Joi.object({
  product_id: Joi.string().required(),
  name: Joi.string().trim().required(),
  image: Joi.string().allow("", null),
  category: Joi.string().allow("", null),
});

module.exports = { addWishlistItemSchema };
