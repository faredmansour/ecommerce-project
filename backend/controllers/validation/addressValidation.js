const Joi = require("joi");

const createAddressSchema = Joi.object({
  label: Joi.string().trim().allow("", null),
  fullName: Joi.string().trim().required(),
  phone: Joi.string().trim().required(),
  line1: Joi.string().trim().required(),
  line2: Joi.string().trim().allow("", null),
  city: Joi.string().trim().required(),
  state: Joi.string().trim().allow("", null),
  postalCode: Joi.string().trim().allow("", null),
  country: Joi.string().trim().required(),
  isDefault: Joi.boolean().default(false),
});

const updateAddressSchema = Joi.object({
  label: Joi.string().trim().allow("", null),
  fullName: Joi.string().trim(),
  phone: Joi.string().trim(),
  line1: Joi.string().trim(),
  line2: Joi.string().trim().allow("", null),
  city: Joi.string().trim(),
  state: Joi.string().trim().allow("", null),
  postalCode: Joi.string().trim().allow("", null),
  country: Joi.string().trim(),
  isDefault: Joi.boolean(),
}).min(1);

module.exports = { createAddressSchema, updateAddressSchema };
