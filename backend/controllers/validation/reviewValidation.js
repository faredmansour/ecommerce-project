const Joi = require("joi");

const submitReviewSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  title: Joi.string().trim().max(120).allow("", null),
  comment: Joi.string().trim().max(2000).allow("", null),
});

module.exports = { submitReviewSchema };
