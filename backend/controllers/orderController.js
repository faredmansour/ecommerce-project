const Order = require("../models/orderModel");
const Cart = require("../models/cartModel");
const Coupon = require("../models/couponModel");
const controllerError = require("../utils/controllerError");
const { buildOrderCommercialSnapshot } = require("../services/orderCommercialSnapshotService");

const getOrders = async (req, res) => {
  try {
    const query = req.user.role === "admin" ? {} : { user: req.user.id };
    const orders = await Order.find(query).populate("user", "name email");
    res.status(200).json({ status: "success", data: orders });
  } catch (err) {
    res.status(500).json({ status: "error", message: controllerError(err, req) });
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
    res.status(500).json({ status: "error", message: controllerError(err, req) });
  }
};

const createOrder = async (req, res) => {
  try {
    if (process.env.NODE_ENV === "production" && process.env.PREVIEW_MODE === "true") {
      return res.status(403).json({ status: "fail", code: "PREVIEW_ORDERS_DISABLED", message: "This is a demonstration store. Real orders are disabled." });
    }
    if (req.user.role === "admin") {
      return res.status(403).json({ status: "fail", message: "Admins cannot place orders." });
    }

    const { items, shippingAddress, couponCode, paymentMethod, totalAmount } = req.body;
    if (!items || !items.length) {
      return res.status(400).json({ status: "fail", message: "Order items are required" });
    }

    let coupon = null;
    if (couponCode?.trim()) {
      coupon = await Coupon.findOne({ code: couponCode.trim().toUpperCase(), active: true, expiresAt: { $gt: new Date() } });
      if (!coupon) return res.status(400).json({ status: "fail", message: "Invalid or expired coupon" });
    }

    const commercial = await buildOrderCommercialSnapshot(items, { coupon, requestedTotalAmount: totalAmount });
    const order = await Order.create({
      user: req.user.id,
      items: commercial.items,
      shippingAddress,
      coupon: coupon?._id,
      paymentMethod,
      totalAmount: commercial.totalAmount,
      discount: commercial.discount,
      commercialSnapshot: commercial.commercialSnapshot,
      status: paymentMethod === "cod" ? "pending" : "pending_payment",
    });

    await Cart.findOneAndDelete({ user: req.user.id });
    res.status(201).json({ status: "success", data: order });
  } catch (err) {
    if (err.isOperational && err.statusCode) {
      return res.status(err.statusCode).json({
        status: "fail",
        ...(err.code ? { code: err.code } : {}),
        message: err.message,
      });
    }
    res.status(500).json({ status: "error", message: controllerError(err, req) });
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

    const canFulfill = order.status === "paid" ||
      (order.status === "pending" && order.paymentMethod === "cod");
    const allowedTransition =
      (status === "pending" && order.status === "pending" && order.paymentMethod === "cod") ||
      (status === "shipped" && canFulfill) ||
      (status === "delivered" && (canFulfill || order.status === "shipped"));
    if (["failed", "cancelled"].includes(order.status) || !allowedTransition) {
      return res.status(409).json({ status: "fail", message: "Order cannot move to the requested fulfillment state." });
    }

    order.status = status;
    await order.save();
    res.status(200).json({ status: "success", data: order });
  } catch (err) {
    res.status(500).json({ status: "error", message: controllerError(err, req) });
  }
};

module.exports = {
  getOrders,
  getOrderById,
  createOrder,
  updateOrderStatus,
};
