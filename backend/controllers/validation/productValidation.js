const Joi = require("joi");

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).message("category must be a valid id");

const createProductSchema = Joi.object({
  name: Joi.string().trim().min(2).required(),
  description: Joi.string().trim().min(1).required(),
  price: Joi.number().min(0).required(),
  category: objectId.required(),
  stock: Joi.number().integer().min(0).default(0),
});

const updateProductSchema = Joi.object({
  name: Joi.string().trim().min(2),
  description: Joi.string().trim().allow("", null),
  price: Joi.number().min(0),
  category: objectId,
  stock: Joi.number().integer().min(0),
}).min(1);

module.exports = { createProductSchema, updateProductSchema };
