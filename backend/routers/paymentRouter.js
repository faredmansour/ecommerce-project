const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const paymentController = require("../controllers/paymentController");

router.use(protect);
router.post("/intent", paymentController.createPaymentIntent);

module.exports = router;
