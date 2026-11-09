const Joi = require("joi");

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).message("brandId must be a valid id");

const createBrandSchema = Joi.object({
  name: Joi.string().trim().min(2).max(150).required(),
  slug: Joi.string().trim().min(2).max(180).pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: Joi.string().trim().max(3000).allow("", null),
  logoId: Joi.string().trim().max(255).allow("", null),
  status: Joi.string().valid("active", "inactive", "archived"),
});

const updateBrandSchema = Joi.object({
  name: Joi.string().trim().min(2).max(150),
  slug: Joi.string().trim().min(2).max(180).pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: Joi.string().trim().max(3000).allow("", null),
  logoId: Joi.string().trim().max(255).allow("", null),
  status: Joi.string().valid("active", "inactive", "archived"),
}).min(1);

module.exports = { createBrandSchema, updateBrandSchema, objectId };
