const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const paymentController = require("../controllers/paymentController");
const { paymentIntentSchema } = require("../controllers/validation/paymentValidation");

router.use(protect);
router.post("/intent", validateRequest(paymentIntentSchema), paymentController.createPaymentIntent);

module.exports = router;
