const PaymentReconciliationRecord = require("../models/paymentReconciliationRecordModel");

class PaymentReconciliationRepository {
  findByEvidence(paymentId, evidenceHash, session) {
    return PaymentReconciliationRecord.findOne({ paymentId, evidenceHash }).session(session || null).lean();
  }

  create(record, session) {
    return PaymentReconciliationRecord.create([record], { session }).then(([created]) => created.toObject());
  }
}

module.exports = PaymentReconciliationRepository;
