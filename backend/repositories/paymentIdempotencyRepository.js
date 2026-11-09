const PaymentIdempotency = require("../models/paymentIdempotencyModel");

class PaymentIdempotencyRepository {
  find(customerId, operation, idempotencyKey, session) {
    return PaymentIdempotency.findOne({ customerId, operation, idempotencyKey }).session(session || null).lean();
  }

  create(record, session) {
    return PaymentIdempotency.create([record], { session }).then(([created]) => created);
  }
}

module.exports = PaymentIdempotencyRepository;
