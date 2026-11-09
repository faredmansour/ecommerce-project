const Joi = require("joi");

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).message("category must be a valid id");

const createProductSchema = Joi.object({
  name: Joi.string().trim().min(2).required(),
  canonicalName: Joi.string().trim().min(2).max(200),
  description: Joi.string().trim().min(1).required(),
  shortDescription: Joi.string().trim().max(300).allow("", null),
  longDescription: Joi.string().trim().max(5000).allow("", null),
  highlights: Joi.alternatives().try(Joi.array().items(Joi.string().trim().max(200)).max(20), Joi.string()),
  slug: Joi.string().trim().min(2).max(200).pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: Joi.string().valid("draft", "active", "inactive", "archived"),
  publicationState: Joi.string().valid("unpublished", "published", "hidden"),
  price: Joi.number().min(0).required(),
  category: objectId.required(),
  categoryIds: Joi.array().items(objectId).max(10),
  brandId: objectId.allow(null),
  stock: Joi.number().integer().min(0).default(0),
  image: Joi.string().allow("", null),
  primaryImageId: Joi.string().trim().max(255).allow("", null),
});

const updateProductSchema = Joi.object({
  name: Joi.string().trim().min(2),
  canonicalName: Joi.string().trim().min(2).max(200),
  description: Joi.string().trim().allow("", null),
  shortDescription: Joi.string().trim().max(300).allow("", null),
  longDescription: Joi.string().trim().max(5000).allow("", null),
  highlights: Joi.alternatives().try(Joi.array().items(Joi.string().trim().max(200)).max(20), Joi.string()),
  slug: Joi.string().trim().min(2).max(200).pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: Joi.string().valid("draft", "active", "inactive", "archived"),
  publicationState: Joi.string().valid("unpublished", "published", "hidden"),
  price: Joi.number().min(0),
  category: objectId,
  categoryIds: Joi.array().items(objectId).max(10),
  brandId: objectId.allow(null),
  stock: Joi.number().integer().min(0),
  image: Joi.string().allow("", null),
  primaryImageId: Joi.string().trim().max(255).allow("", null),
}).min(1);

module.exports = { createProductSchema, updateProductSchema };
