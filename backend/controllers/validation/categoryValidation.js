const Joi = require("joi");

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).message("parentCategoryId must be a valid id");

const createCategorySchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  slug: Joi.string().trim().min(2).max(180).pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: Joi.string().trim().min(1).max(3000).required(),
  parentCategoryId: objectId.allow(null),
  status: Joi.string().valid("active", "inactive", "archived"),
  displayOrder: Joi.number().integer().min(0).default(0),
  imageId: Joi.string().trim().max(255).allow("", null),
});

const updateCategorySchema = Joi.object({
  name: Joi.string().trim().min(2).max(120),
  slug: Joi.string().trim().min(2).max(180).pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: Joi.string().trim().max(3000).allow("", null),
  parentCategoryId: objectId.allow(null),
  status: Joi.string().valid("active", "inactive", "archived"),
  displayOrder: Joi.number().integer().min(0),
  imageId: Joi.string().trim().max(255).allow("", null),
}).min(1);

module.exports = { createCategorySchema, updateCategorySchema };
