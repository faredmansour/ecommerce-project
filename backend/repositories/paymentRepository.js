const Payment = require("../models/paymentModel");

class PaymentRepository {
  create(payment, session) {
    return Payment.create([payment], { session }).then(([created]) => created);
  }

  findByPaymentId(paymentId, session) {
    return Payment.findOne({ paymentId }).session(session || null);
  }

  findBlockingPaymentForOrder(orderId, session) {
    return Payment.findOne({
      orderId,
      status: { $in: ["created", "pending", "requires_action", "authorized", "captured"] },
    }).select("paymentId status").session(session || null).lean();
  }

  findByProviderPaymentReference(provider, providerPaymentId, session) {
    return Payment.find({ provider, providerPaymentId }).select("paymentId orderId providerPaymentId").session(session || null).lean();
  }

  updateProviderPaymentReference(paymentId, provider, providerPaymentId) {
    return Payment.updateOne({
      paymentId,
      provider,
      status: "created",
      $or: [{ providerPaymentId: null }, { providerPaymentId }],
    }, { $set: { providerPaymentId } });
  }

  findVisibleByPaymentId(paymentId, { customerId, isAdmin = false } = {}) {
    const query = { paymentId };
    if (!isAdmin) query.customerId = customerId;
    return Payment.findOne(query).lean();
  }

}

module.exports = PaymentRepository;
