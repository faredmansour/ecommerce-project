const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const couponController = require("../controllers/couponController");

router.use(protect);
router.post("/apply", couponController.applyCoupon);

module.exports = router;
