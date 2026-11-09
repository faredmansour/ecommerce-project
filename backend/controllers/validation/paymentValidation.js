const Joi = require("joi");

const paymentCreationSchema = Joi.object({
  orderId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
}).unknown(false);

const validatePaymentCreationRequest = (req, res, next) => {
  const { error, value } = paymentCreationSchema.validate(req.body, { abortEarly: false, convert: false });
  if (error) {
    return res.status(400).json({
      status: "fail",
      code: "INVALID_PAYMENT_REQUEST",
      message: "Payment creation request is invalid.",
    });
  }
  req.body = value;
  return next();
};

// The checkout amount and currency are loaded from the owned Order snapshot.
const paymentIntentSchema = paymentCreationSchema;

const paymentIdParamsSchema = Joi.object({
  paymentId: Joi.string().guid({ version: ["uuidv4"] }).required(),
}).unknown(false);

module.exports = { paymentCreationSchema, validatePaymentCreationRequest, paymentIntentSchema, paymentIdParamsSchema };
