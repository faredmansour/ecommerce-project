const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const paymentController = require("../controllers/paymentController");
const {
  validatePaymentCreationRequest,
  paymentIdParamsSchema,
} = require("../controllers/validation/paymentValidation");

const paymentCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { status: "fail", code: "PAYMENT_RATE_LIMITED", message: "Too many payment creation requests. Try again later." },
});

router.use(protect);
router.post("/", paymentCreationLimiter, validatePaymentCreationRequest, paymentController.createPayment);
router.post("/intent", paymentCreationLimiter, validatePaymentCreationRequest, paymentController.createPaymentIntent);
router.get("/:paymentId", validateRequest(paymentIdParamsSchema, "params"), paymentController.getPayment);

module.exports = router;
