const Order = require("../models/orderModel");
const Cart = require("../models/cartModel");
const Coupon = require("../models/couponModel");

const getOrders = async (req, res) => {
  try {
    const query = req.user.role === "admin" ? {} : { user: req.user.id };
    const orders = await Order.find(query).populate("user", "name email");
    res.status(200).json({ status: "success", data: orders });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate("user", "name email");
    if (!order) return res.status(404).json({ status: "fail", message: "Order not found" });
    if (req.user.role !== "admin" && order.user._id.toString() !== req.user.id) {
      return res.status(403).json({ status: "fail", message: "Access denied" });
    }
    res.status(200).json({ status: "success", data: order });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

const createOrder = async (req, res) => {
  try {
    const { items, shippingAddress, couponCode, paymentMethod, totalAmount } = req.body;
    if (!items || !items.length) {
      return res.status(400).json({ status: "fail", message: "Order items are required" });
    }

    let discount = 0;
    let coupon = null;
    if (couponCode) {
      coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), active: true, expiresAt: { $gt: new Date() } });
      if (!coupon) return res.status(400).json({ status: "fail", message: "Invalid or expired coupon" });
      if (coupon.discountType === "percentage") {
        discount = (totalAmount * coupon.discountValue) / 100;
      } else {
        discount = coupon.discountValue;
      }
    }

    const order = await Order.create({
      user: req.user.id,
      items,
      shippingAddress,
      coupon: coupon?._id,
      paymentMethod,
      totalAmount,
      discount,
      status: "pending",
    });

    await Cart.findOneAndDelete({ user: req.user.id });
    res.status(201).json({ status: "success", data: order });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["pending", "shipped", "delivered"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ status: "fail", message: "Invalid status" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ status: "fail", message: "Order not found" });

    order.status = status;
    await order.save();
    res.status(200).json({ status: "success", data: order });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

module.exports = {
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
};
