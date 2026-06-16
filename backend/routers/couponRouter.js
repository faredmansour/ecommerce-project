const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const validateRequest = require("../middlewares/validateRequest");
const couponController = require("../controllers/couponController");
const { applyCouponSchema } = require("../controllers/validation/couponValidation");

router.use(protect);
router.post("/apply", validateRequest(applyCouponSchema), couponController.applyCoupon);

module.exports = router;
