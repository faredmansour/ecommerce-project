const Joi = require("joi");

const orderItemSchema = Joi.object({
  product: Joi.string().pattern(/^[0-9a-fA-F]{24}$/),
  product_id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  name: Joi.string().trim().required(),
  price: Joi.number().min(0).precision(2).required(),
  quantity: Joi.number().integer().min(1).required(),
  image: Joi.string().allow("", null),
  category: Joi.string().allow("", null),
}).unknown(false);

const shippingAddressSchema = Joi.object({
  fullName: Joi.string().trim().required(),
  phone: Joi.string().trim().required(),
  line1: Joi.string().trim().required(),
  line2: Joi.string().allow("", null),
  city: Joi.string().trim().required(),
  state: Joi.string().allow("", null),
  postalCode: Joi.string().trim().allow("", null),
  country: Joi.string().trim().required(),
});

const createOrderSchema = Joi.object({
  items: Joi.array().items(orderItemSchema).min(1).required(),
  shippingAddress: shippingAddressSchema.required(),
  couponCode: Joi.string().allow("", null),
  paymentMethod: Joi.string().valid("card", "cod", "stripe").default("card"),
  totalAmount: Joi.number().min(0).precision(2).required(),
}).unknown(false);

const updateOrderStatusSchema = Joi.object({
  status: Joi.string().valid("pending", "shipped", "delivered").required(),
});

module.exports = { createOrderSchema, updateOrderStatusSchema };
