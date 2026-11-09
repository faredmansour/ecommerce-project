const crypto = require("crypto");
const mongoose = require("mongoose");
const { PAYMENT_STATES } = require("../utils/paymentStateMachine");

const RECONCILIATION_STATUSES = Object.freeze(["MATCHED", "MISMATCH", "UNKNOWN", "PENDING_REVIEW"]);
const DISCREPANCY_CODES = Object.freeze([
  "AMOUNT_MISMATCH",
  "CURRENCY_MISMATCH",
  "PROVIDER_REFERENCE_MISMATCH",
  "PAYMENT_STATE_MISMATCH",
  "ORDER_STATE_MISMATCH",
  "MISSING_PROVIDER_EVIDENCE",
  "MISSING_INTERNAL_PAYMENT",
  "MISSING_ORDER",
  "DUPLICATE_PROVIDER_REFERENCE",
  "UNSUPPORTED_PROVIDER_STATUS",
  "UNKNOWN_PROVIDER",
  "INVALID_EVIDENCE",
  "MISSING_LEDGER_EVIDENCE",
  "LEDGER_REFERENCE_MISMATCH",
  "LEDGER_TRANSITION_INVALID",
  "DUPLICATE_LEDGER_EVENT",
  "PROVIDER_INQUIRY_FAILED",
  "PROVIDER_PARENT_TRANSACTION_UNBOUND",
]);

const reconciliationRecordSchema = new mongoose.Schema({
  reconciliationId: { type: String, required: true, immutable: true, default: () => crypto.randomUUID(), match: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i },
  paymentId: { type: String, required: true, immutable: true, match: /^[0-9a-f-]{36}$/i },
  orderId: { type: mongoose.Schema.Types.ObjectId, default: null, immutable: true },
  provider: { type: String, default: null, immutable: true, maxlength: 40 },
  providerPaymentReference: { type: String, default: null, immutable: true, maxlength: 200 },
  providerTransactionReference: { type: String, default: null, immutable: true, maxlength: 200 },
  providerObservedOrderReference: { type: String, default: null, immutable: true, maxlength: 200 },
  internalPaymentState: { type: String, enum: [...PAYMENT_STATES, null], default: null, immutable: true },
  internalAmountMinor: { type: Number, default: null, immutable: true, validate: (value) => value === null || (Number.isSafeInteger(value) && value >= 0) },
  internalCurrency: { type: String, default: null, immutable: true, match: /^[A-Z]{3}$/ },
  orderState: { type: String, default: null, immutable: true, maxlength: 40 },
  orderAmountMinor: { type: Number, default: null, immutable: true, validate: (value) => value === null || (Number.isSafeInteger(value) && value >= 0) },
  orderCurrency: { type: String, default: null, immutable: true, match: /^[A-Z]{3}$/ },
  providerObservedState: { type: String, enum: [...PAYMENT_STATES, null], default: null, immutable: true },
  providerObservedAt: { type: Date, default: null, immutable: true },
  providerObservedAmountMinor: { type: Number, default: null, immutable: true, validate: (value) => value === null || (Number.isSafeInteger(value) && value >= 0) },
  providerObservedCurrency: { type: String, default: null, immutable: true, match: /^[A-Z]{3}$/ },
  providerObservedCapturedAmountMinor: { type: Number, default: null, immutable: true, validate: (value) => value === null || (Number.isSafeInteger(value) && value >= 0) },
  providerObservedIsCaptured: { type: Boolean, default: null, immutable: true },
  providerObservedPending: { type: Boolean, default: null, immutable: true },
  providerObservedSuccess: { type: Boolean, default: null, immutable: true },
  providerObservedErrorOccurred: { type: Boolean, default: null, immutable: true },
  providerObservedIsAuth: { type: Boolean, default: null, immutable: true },
  providerObservedIsCapture: { type: Boolean, default: null, immutable: true },
  providerObservedIsStandalonePayment: { type: Boolean, default: null, immutable: true },
  providerObservedIsVoided: { type: Boolean, default: null, immutable: true },
  providerObservedIsRefunded: { type: Boolean, default: null, immutable: true },
  providerObservedIntegrationId: { type: Number, default: null, immutable: true, validate: (value) => value === null || (Number.isSafeInteger(value) && value > 0) },
  providerObservedIntegrationType: { type: String, default: null, immutable: true, maxlength: 100 },
  providerObservedIsLive: { type: Boolean, default: null, immutable: true },
  providerObservedHasParentTransaction: { type: Boolean, default: null, immutable: true },
  providerObservedParentTransactionId: { type: String, default: null, immutable: true, maxlength: 200 },
  reconciliationStatus: { type: String, required: true, immutable: true, enum: RECONCILIATION_STATUSES },
  discrepancyCodes: { type: [{ type: String, enum: DISCREPANCY_CODES }], required: true, immutable: true, default: [] },
  evidenceSource: { type: String, required: true, immutable: true, enum: [
    "verified_webhook", "paymob_transaction_inquiry",
    "verified_webhook_and_paymob_transaction_inquiry", "none",
  ] },
  evidenceHash: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
  ledgerEvidenceHash: { type: String, required: true, immutable: true, match: /^[a-f0-9]{64}$/ },
  providerEventIds: { type: [String], immutable: true, default: [], validate: (ids) => ids.length <= 500 && ids.every((id) => typeof id === "string" && id.length <= 200) },
  ledgerEntryCount: { type: Number, required: true, immutable: true, min: 0, validate: Number.isSafeInteger },
  webhookEvidenceCount: { type: Number, required: true, immutable: true, min: 0, validate: Number.isSafeInteger },
  providerRecognized: { type: Boolean, required: true, immutable: true },
  providerConfigured: { type: Boolean, required: true, immutable: true },
  providerEnabled: { type: Boolean, required: true, immutable: true },
  providerStatusQueryAvailable: { type: Boolean, required: true, immutable: true },
  reconciledAt: { type: Date, required: true, immutable: true, default: Date.now },
}, { timestamps: true, strict: "throw" });

reconciliationRecordSchema.index({ paymentId: 1, evidenceHash: 1 }, { unique: true });
reconciliationRecordSchema.index({ reconciliationStatus: 1, reconciledAt: -1 });
reconciliationRecordSchema.pre("save", function preventReconciliationMutation() {
  if (!this.isNew) throw new Error("Payment reconciliation observations are immutable.");
});
for (const operation of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete", "findOneAndReplace"]) {
  reconciliationRecordSchema.pre(operation, function preventReconciliationQueryMutation() {
    throw new Error("Payment reconciliation observations are immutable.");
  });
}

const model = mongoose.models.PaymentReconciliationRecord || mongoose.model("PaymentReconciliationRecord", reconciliationRecordSchema);
module.exports = model;
module.exports.RECONCILIATION_STATUSES = RECONCILIATION_STATUSES;
module.exports.DISCREPANCY_CODES = DISCREPANCY_CODES;
