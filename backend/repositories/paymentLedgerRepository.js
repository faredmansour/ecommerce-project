const PaymentLedgerEntry = require("../models/paymentLedgerEntryModel");

class PaymentLedgerRepository {
  append(entry, session) {
    return PaymentLedgerEntry.create([entry], { session }).then(([created]) => created);
  }

  findForPayment(paymentId, session) {
    return PaymentLedgerEntry.find({ paymentId }).session(session || null).sort({ recordedAt: 1 }).lean();
  }
}

module.exports = PaymentLedgerRepository;
