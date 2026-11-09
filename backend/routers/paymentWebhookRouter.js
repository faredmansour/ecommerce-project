const express = require("express");
const rateLimit = require("express-rate-limit");
const { receivePaymentWebhook } = require("../controllers/paymentWebhookController");

const router = express.Router();
const paymentWebhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { status: "fail", code: "WEBHOOK_RATE_LIMITED", message: "Webhook request rate exceeded." },
});

router.post("/:provider", paymentWebhookLimiter, receivePaymentWebhook);

module.exports = router;
