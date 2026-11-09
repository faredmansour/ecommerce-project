const Joi = require("joi");
const { PROVIDERS } = require("../providers/providerIdentifiers");
const { PAYMENT_STATES } = require("../utils/paymentStateMachine");

const verifiedWebhookEvidenceSchema = Joi.object({
  provider: Joi.string().valid(...Object.values(PROVIDERS)).required(),
  providerEventId: Joi.string().trim().min(1).max(200).required(),
  paymentReference: Joi.string().guid({ version: ["uuidv4"] }).required(),
  providerPaymentReference: Joi.string().trim().min(1).max(200).required(),
  status: Joi.string().valid(...PAYMENT_STATES).required(),
  amountMinor: Joi.number().integer().min(0).unsafe(false).required(),
  currency: Joi.string().pattern(/^[A-Z]{3}$/).required(),
  occurredAt: Joi.date().allow(null).optional(),
  processedAt: Joi.date().required(),
}).unknown(false);

function fromVerifiedWebhookReceipt(receipt) {
  if (!receipt || receipt.verificationStatus !== "VERIFIED" || receipt.processingStatus !== "PROCESSED") {
    const error = new Error("Only verified and processed webhook receipts can be reconciliation evidence.");
    error.code = "INVALID_EVIDENCE";
    throw error;
  }
  const { value, error } = verifiedWebhookEvidenceSchema.validate({
    provider: receipt.provider,
    providerEventId: receipt.providerEventId,
    paymentReference: receipt.paymentReference,
    providerPaymentReference: receipt.providerPaymentReference,
    status: receipt.canonicalStatus,
    amountMinor: receipt.amountMinor,
    currency: receipt.currency,
    occurredAt: receipt.occurredAt,
    processedAt: receipt.processedAt,
  }, { abortEarly: false, convert: false });
  if (error) {
    const invalid = new Error("Verified webhook receipt is not valid reconciliation evidence.");
    invalid.code = "INVALID_EVIDENCE";
    throw invalid;
  }
  return Object.freeze({
    provider: value.provider,
    providerEventId: value.providerEventId,
    paymentReference: value.paymentReference,
    providerPaymentReference: value.providerPaymentReference,
    status: value.status,
    amountMinor: value.amountMinor,
    currency: value.currency,
    observedAt: value.occurredAt || value.processedAt,
    evidenceSource: "verified_webhook",
    verificationState: "VERIFIED",
  });
}

module.exports = { fromVerifiedWebhookReceipt, verifiedWebhookEvidenceSchema };
