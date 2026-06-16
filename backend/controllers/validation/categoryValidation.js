const Joi = require("joi");

const createCategorySchema = Joi.object({
  name: Joi.string().trim().min(2).required(),
  description: Joi.string().trim().min(1).required(),
});

const updateCategorySchema = Joi.object({
  name: Joi.string().trim().min(2),
  description: Joi.string().trim().allow("", null),
}).min(1);

module.exports = { createCategorySchema, updateCategorySchema };
