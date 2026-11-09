const Order = require("../models/orderModel");

class OrderPaymentSnapshotRepository {
  findOwnedOrderSnapshot(orderId, customerId, session) {
    return Order.findOne({ _id: orderId, user: customerId }).session(session || null).lean();
  }

  reserveOrderPayment({ orderId, customerId, paymentId }, session) {
    return Order.updateOne({
      _id: orderId,
      user: customerId,
      paymentMethod: { $in: ["card", "stripe"] },
      status: { $in: ["pending_payment", "pending"] },
      $or: [{ activePaymentId: null }, { activePaymentId: { $exists: false } }],
    }, {
      $set: { status: "pending_payment", activePaymentId: paymentId },
    }, { session });
  }

  completeOrderPayment({ orderId, customerId, paymentId, status }, session) {
    return Order.updateOne({
      _id: orderId,
      user: customerId,
      status: "pending_payment",
      $or: [
        { activePaymentId: paymentId },
        { activePaymentId: null },
        { activePaymentId: { $exists: false } },
      ],
    }, {
      $set: { status, activePaymentId: null },
    }, { session });
  }

  findOwnedOrderSnapshotForExecution(orderId, customerId) {
    return Order.findOne({ _id: orderId, user: customerId })
      .populate({ path: "user", select: "email" })
      .lean();
  }
}

module.exports = OrderPaymentSnapshotRepository;
