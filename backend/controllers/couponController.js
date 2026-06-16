const Coupon = require("../models/couponModel");

const applyCoupon = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ status: "fail", message: "Coupon code is required" });
    }

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), active: true, expiresAt: { $gt: new Date() } });
    if (!coupon) {
      return res.status(404).json({ status: "fail", message: "Coupon not found or expired" });
    }

    res.status(200).json({ status: "success", data: coupon });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

module.exports = { applyCoupon };
