const Joi = require("joi");

const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).message("Must be a valid Mongo object id");

const createPriceBookSchema = Joi.object({
  code: Joi.string().trim().min(2).max(60).required(),
  name: Joi.string().trim().min(2).max(180).required(),
  status: Joi.string().valid("active", "inactive").default("active"),
  isDefault: Joi.boolean().default(false),
  currencyCodes: Joi.array().items(Joi.string().trim().uppercase().length(3).pattern(/^[A-Z]{3}$/)).min(1).required(),
});

const updatePriceBookSchema = Joi.object({
  code: Joi.string().trim().min(2).max(60),
  name: Joi.string().trim().min(2).max(180),
  status: Joi.string().valid("active", "inactive"),
  isDefault: Joi.boolean(),
  currencyCodes: Joi.array().items(Joi.string().trim().uppercase().length(3).pattern(/^[A-Z]{3}$/)).min(1),
}).min(1);

const createPriceDefinitionSchema = Joi.object({
  sellableType: Joi.string().valid("product").required(),
  sellableId: objectId.required(),
  priceBookId: objectId.required(),
  amountMinor: Joi.number().integer().min(0).required(),
  currency: Joi.string().trim().uppercase().length(3).pattern(/^[A-Z]{3}$/).required(),
  priceKind: Joi.string().valid("base", "sale").required(),
  compareAtAmountMinor: Joi.number().integer().min(0).allow(null),
  status: Joi.string().valid("active", "inactive").default("active"),
  effectiveFrom: Joi.date().iso().required(),
  effectiveTo: Joi.date().iso().greater(Joi.ref("effectiveFrom")).allow(null),
  changeReason: Joi.string().trim().max(255).allow("", null),
}).custom((value, helpers) => {
  if (value.compareAtAmountMinor !== null && value.compareAtAmountMinor !== undefined && value.compareAtAmountMinor < value.amountMinor) {
    return helpers.message("compareAtAmountMinor cannot be less than amountMinor");
  }
  return value;
});

const updatePriceDefinitionSchema = Joi.object({
  sellableType: Joi.string().valid("product"),
  sellableId: objectId,
  priceBookId: objectId,
  amountMinor: Joi.number().integer().min(0),
  currency: Joi.string().trim().uppercase().length(3).pattern(/^[A-Z]{3}$/),
  priceKind: Joi.string().valid("base", "sale"),
  compareAtAmountMinor: Joi.number().integer().min(0).allow(null),
  status: Joi.string().valid("active", "inactive"),
  effectiveFrom: Joi.date().iso(),
  effectiveTo: Joi.date().iso().greater(Joi.ref("effectiveFrom")).allow(null),
  changeReason: Joi.string().trim().max(255).allow("", null),
}).min(1).custom((value, helpers) => {
  if (value.compareAtAmountMinor !== null && value.compareAtAmountMinor !== undefined && value.amountMinor !== undefined && value.compareAtAmountMinor < value.amountMinor) {
    return helpers.message("compareAtAmountMinor cannot be less than amountMinor");
  }
  return value;
});

module.exports = {
  createPriceBookSchema,
  updatePriceBookSchema,
  createPriceDefinitionSchema,
  updatePriceDefinitionSchema,
};
