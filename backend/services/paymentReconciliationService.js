const crypto = require("crypto");
const mongoose = require("mongoose");
const Joi = require("joi");
const logger = require("../utils/logger");
const PaymentRepository = require("../repositories/paymentRepository");
const PaymentLedgerRepository = require("../repositories/paymentLedgerRepository");
const OrderPaymentSnapshotRepository = require("../repositories/orderPaymentSnapshotRepository");
const PaymentWebhookEventRepository = require("../repositories/paymentWebhookEventRepository");
const PaymentReconciliationRepository = require("../repositories/paymentReconciliationRepository");
const PaymentReconciliationRecord = require("../models/paymentReconciliationRecordModel");
const { fromVerifiedWebhookReceipt } = require("./providerStatusEvidence");
const { PROVIDERS } = require("../providers/providerIdentifiers");
const { getProviderCapabilities } = require("../providers/providerCapabilities");
const { readProviderConfig } = require("../providers/providerConfig");
const PaymobProvider = require("../providers/paymobProvider");
const { PAYMENT_STATES, assertPaymentTransition } = require("../utils/paymentStateMachine");

const paymentIdSchema = Joi.string().guid({ version: ["uuidv4"] }).required();
const ORDER_STATES = new Set(["pending_payment", "pending", "paid", "failed", "cancelled", "shipped", "delivered"]);
const HARD_MISMATCH_CODES = new Set([
  "AMOUNT_MISMATCH",
  "CURRENCY_MISMATCH",
  "PROVIDER_REFERENCE_MISMATCH",
  "MISSING_INTERNAL_PAYMENT",
  "MISSING_ORDER",
  "DUPLICATE_PROVIDER_REFERENCE",
  "MISSING_LEDGER_EVIDENCE",
  "LEDGER_REFERENCE_MISMATCH",
  "LEDGER_TRANSITION_INVALID",
  "DUPLICATE_LEDGER_EVENT",
]);
const REVIEW_CODES = new Set(["PAYMENT_STATE_MISMATCH", "ORDER_STATE_MISMATCH", "INVALID_EVIDENCE", "PROVIDER_PARENT_TRANSACTION_UNBOUND"]);
const UNKNOWN_CODES = new Set(["MISSING_PROVIDER_EVIDENCE", "UNSUPPORTED_PROVIDER_STATUS", "UNKNOWN_PROVIDER", "PROVIDER_INQUIRY_FAILED"]);

function reconciliationError(code, message, statusCode = 400) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizedState(payment) {
  return payment && PAYMENT_STATES.includes(payment.status) ? payment.status : null;
}

function validateLedger(payment, order, ledger) {
  const discrepancies = new Set();
  if (ledger.length === 0) discrepancies.add("MISSING_LEDGER_EVIDENCE");
  const seen = new Set();
  let previousState = null;

  for (const entry of ledger) {
    const eventIdentity = `${entry.idempotencyKey}:${entry.eventType}`;
    if (seen.has(eventIdentity)) discrepancies.add("DUPLICATE_LEDGER_EVENT");
    seen.add(eventIdentity);

    if (!payment || entry.paymentId !== payment.paymentId || entry.orderId?.toString() !== payment.orderId?.toString() ||
        entry.provider !== payment.provider || (order && entry.orderId?.toString() !== order._id.toString())) {
      discrepancies.add("LEDGER_REFERENCE_MISMATCH");
    }
    if (payment && entry.amountMinor !== payment.amountMinor) discrepancies.add("AMOUNT_MISMATCH");
    if (payment && entry.currency !== payment.currency) discrepancies.add("CURRENCY_MISMATCH");

    if (entry.eventType === "payment_created") {
      if (previousState !== null || entry.fromStatus !== null || entry.toStatus !== "created") {
        discrepancies.add("LEDGER_TRANSITION_INVALID");
      }
    } else {
      const source = entry.actorType;
      if (!PAYMENT_STATES.includes(entry.fromStatus) || !PAYMENT_STATES.includes(entry.toStatus) ||
          entry.fromStatus !== previousState || entry.eventType !== `payment_${entry.toStatus}`) {
        discrepancies.add("LEDGER_TRANSITION_INVALID");
      } else {
        try {
          assertPaymentTransition(entry.fromStatus, entry.toStatus, { source, verified: true });
        } catch {
          discrepancies.add("LEDGER_TRANSITION_INVALID");
        }
      }
    }
    previousState = entry.toStatus;
  }

  if (payment && previousState !== payment.status) discrepancies.add("PAYMENT_STATE_MISMATCH");
  return [...discrepancies];
}

function selectProviderState(evidence) {
  const terminal = new Set(["captured", "failed", "cancelled"]);
  const terminalStates = new Set(evidence.map((item) => item.status).filter((status) => terminal.has(status)));
  if (terminalStates.size > 1) return { status: null, observedAt: null, conflict: true };
  if (terminalStates.size === 1) {
    const status = [...terminalStates][0];
    const latest = [...evidence].filter((item) => item.status === status)
      .sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime() || left.providerEventId.localeCompare(right.providerEventId)).at(-1);
    return { status, observedAt: latest.observedAt, conflict: false };
  }
  const latest = [...evidence].sort((left, right) => (
    left.observedAt.getTime() - right.observedAt.getTime() || left.providerEventId.localeCompare(right.providerEventId)
  )).at(-1);
  return { status: latest?.status || null, observedAt: latest?.observedAt || null, conflict: false };
}

function classify(discrepancies) {
  if (discrepancies.some((code) => HARD_MISMATCH_CODES.has(code))) return "MISMATCH";
  if (discrepancies.some((code) => REVIEW_CODES.has(code))) return "PENDING_REVIEW";
  if (discrepancies.some((code) => UNKNOWN_CODES.has(code))) return "UNKNOWN";
  return "MATCHED";
}

class PaymentReconciliationService {
  constructor({ paymentRepository, ledgerRepository, orderSnapshotRepository, webhookEventRepository, reconciliationRepository, paymobProvider, env = process.env } = {}) {
    this.payments = paymentRepository || new PaymentRepository();
    this.ledger = ledgerRepository || new PaymentLedgerRepository();
    this.orders = orderSnapshotRepository || new OrderPaymentSnapshotRepository();
    this.webhooks = webhookEventRepository || new PaymentWebhookEventRepository();
    this.reconciliations = reconciliationRepository || new PaymentReconciliationRepository();
    this.env = env;
    this.paymob = paymobProvider || new PaymobProvider({ env });
  }

  async reconcilePayment(paymentId) {
    const { value, error } = paymentIdSchema.validate(paymentId, { convert: false });
    if (error) throw reconciliationError("INVALID_RECONCILIATION_COMMAND", "Reconciliation command is invalid.");

    logger.info(JSON.stringify({ event: "reconciliation.started", paymentId: value }));
    let inquiry = null;
    let inquiryErrorCode = null;
    if (this.env?.PAYMOB_ENVIRONMENT === "TEST" &&
        this.env?.PAYMOB_TEST_TRANSACTION_INQUIRY_ENABLED === "true") {
      const candidate = await this.payments.findByPaymentId(value);
      if (candidate?.provider === PROVIDERS.PAYMOB && candidate.providerTransactionId) {
        try {
          inquiry = await this.paymob.inquirePayment(candidate);
        } catch (error) {
          inquiryErrorCode = typeof error?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(error.code)
            ? error.code
            : "PROVIDER_INQUIRY_FAILED";
          logger.warn(JSON.stringify({
            event: "reconciliation.provider_inquiry_failed",
            paymentId: value,
            provider: PROVIDERS.PAYMOB,
            errorCode: inquiryErrorCode,
          }));
        }
      }
    }
    const session = await mongoose.startSession();
    let result;
    let evidenceHash;
    try {
      await session.withTransaction(async () => {
        const payment = await this.payments.findByPaymentId(value, session);
        // Keep all transaction operations sequential; MongoDB does not support
        // parallel operations on a single transaction session reliably.
        const ledger = await this.ledger.findForPayment(value, session);
        const receipts = await this.webhooks.findVerifiedProcessedForPayment(value, session);
        const order = payment ? await this.orders.findOwnedOrderSnapshot(payment.orderId, payment.customerId, session) : null;
        const discrepancies = new Set();
        const inquiryMatchesPayment = Boolean(inquiry && payment &&
          payment.provider === PROVIDERS.PAYMOB &&
          payment.providerTransactionId === inquiry.providerTransactionId &&
          payment.amountMinor === inquiry.amountMinor &&
          payment.currency === inquiry.currency);
        const trustedInquiry = inquiryMatchesPayment ? inquiry : null;

        if (!payment) discrepancies.add("MISSING_INTERNAL_PAYMENT");
        if (payment && !order) discrepancies.add("MISSING_ORDER");
        if (!payment) {
          discrepancies.add("MISSING_PROVIDER_EVIDENCE");
        }
        if (inquiryErrorCode) discrepancies.add("PROVIDER_INQUIRY_FAILED");
        if (inquiry && !inquiryMatchesPayment) discrepancies.add("PROVIDER_REFERENCE_MISMATCH");
        if (trustedInquiry && !trustedInquiry.parentRelationshipVerified) {
          discrepancies.add("PROVIDER_PARENT_TRANSACTION_UNBOUND");
        }

        const knownProvider = payment && Object.values(PROVIDERS).includes(payment.provider);
        const deferredProvider = payment?.provider === "deferred";
        if (payment && !knownProvider && !deferredProvider) discrepancies.add("UNKNOWN_PROVIDER");
        const capabilities = knownProvider ? getProviderCapabilities(payment.provider) : null;
        const providerConfigured = knownProvider ? readProviderConfig(payment.provider).configured : false;
        const providerEnabled = capabilities?.runtime?.enabled === true;
        // A sandbox inquiry observation does not enable provider operations or payment transitions.
        const providerStatusQueryAvailable = capabilities?.runtime?.operations?.getPayment === "VERIFIED";

        const orderSnapshot = order?.commercialSnapshot;
        const validOrderMoney = orderSnapshot && Number.isSafeInteger(orderSnapshot.grandTotalMinor) &&
          orderSnapshot.grandTotalMinor >= 0 && typeof orderSnapshot.currency === "string";
        if (payment && order && !ORDER_STATES.has(order.status)) discrepancies.add("ORDER_STATE_MISMATCH");
        if (payment && order) {
          const expectedOrderState = {
            captured: new Set(["paid", "shipped", "delivered"]),
            failed: new Set(["failed"]),
            cancelled: new Set(["cancelled"]),
          }[payment.status];
          if (expectedOrderState && !expectedOrderState.has(order.status)) discrepancies.add("ORDER_STATE_MISMATCH");
          if (!expectedOrderState && !["pending_payment", "pending"].includes(order.status)) {
            discrepancies.add("ORDER_STATE_MISMATCH");
          }
        }
        if (payment && order && !validOrderMoney) {
          discrepancies.add("AMOUNT_MISMATCH");
          discrepancies.add("CURRENCY_MISMATCH");
        } else if (payment && order && validOrderMoney) {
          if (payment.amountMinor !== orderSnapshot.grandTotalMinor) discrepancies.add("AMOUNT_MISMATCH");
          if (payment.currency !== orderSnapshot.currency) discrepancies.add("CURRENCY_MISMATCH");
        }

        validateLedger(payment, order, ledger).forEach((code) => discrepancies.add(code));

        const trustedEvidence = [];
        for (const receipt of receipts) {
          try {
            const evidence = fromVerifiedWebhookReceipt(receipt);
            if (!knownProvider || evidence.provider !== payment?.provider || evidence.paymentReference !== payment?.paymentId) {
              discrepancies.add("PROVIDER_REFERENCE_MISMATCH");
            }
            if (payment?.providerPaymentId && evidence.providerPaymentReference !== payment.providerPaymentId) {
              discrepancies.add("PROVIDER_REFERENCE_MISMATCH");
            }
            if (knownProvider && !payment?.providerPaymentId) discrepancies.add("PROVIDER_REFERENCE_MISMATCH");
            trustedEvidence.push(evidence);
          } catch {
            discrepancies.add("INVALID_EVIDENCE");
          }
        }

        let providerObservedState = trustedInquiry?.status || null;
        let providerObservedAt = trustedInquiry?.observedAt || null;
        let providerObservedAmountMinor = trustedInquiry?.amountMinor ?? null;
        let providerObservedCurrency = trustedInquiry?.currency || null;
        if (trustedEvidence.length === 0 && !trustedInquiry) {
          discrepancies.add("MISSING_PROVIDER_EVIDENCE");
        } else {
          const refs = new Set(trustedEvidence.map((item) => item.providerPaymentReference));
          const amounts = new Set(trustedEvidence.map((item) => item.amountMinor));
          const currencies = new Set(trustedEvidence.map((item) => item.currency));
          if (trustedInquiry) {
            amounts.add(trustedInquiry.amountMinor);
            currencies.add(trustedInquiry.currency);
          }
          if (refs.size > 1) discrepancies.add("PROVIDER_REFERENCE_MISMATCH");
          if (amounts.size > 1) discrepancies.add("AMOUNT_MISMATCH");
          if (currencies.size > 1) discrepancies.add("CURRENCY_MISMATCH");
          if (amounts.size === 1) providerObservedAmountMinor = [...amounts][0];
          if (currencies.size === 1) providerObservedCurrency = [...currencies][0];

          const selectedState = trustedEvidence.length > 0 ? selectProviderState(trustedEvidence) : null;
          if (selectedState?.conflict) discrepancies.add("PAYMENT_STATE_MISMATCH");
          if (trustedInquiry && selectedState?.status && selectedState.status !== trustedInquiry.status) {
            discrepancies.add("PAYMENT_STATE_MISMATCH");
          }
          if (!trustedInquiry && selectedState) {
            providerObservedState = selectedState.status;
            providerObservedAt = selectedState.observedAt;
          }
          if (providerObservedState && payment && providerObservedState !== payment.status) {
            discrepancies.add("PAYMENT_STATE_MISMATCH");
          }
          if (providerObservedState && !PAYMENT_STATES.includes(providerObservedState)) {
            discrepancies.add("UNSUPPORTED_PROVIDER_STATUS");
          }

          if (payment && providerObservedAmountMinor !== null && providerObservedAmountMinor !== payment.amountMinor) {
            discrepancies.add("AMOUNT_MISMATCH");
          }
          if (validOrderMoney && providerObservedAmountMinor !== null && providerObservedAmountMinor !== orderSnapshot.grandTotalMinor) {
            discrepancies.add("AMOUNT_MISMATCH");
          }
          if (payment && providerObservedCurrency !== null && providerObservedCurrency !== payment.currency) {
            discrepancies.add("CURRENCY_MISMATCH");
          }
          if (validOrderMoney && providerObservedCurrency !== null && providerObservedCurrency !== orderSnapshot.currency) {
            discrepancies.add("CURRENCY_MISMATCH");
          }
        }

        if (payment?.providerPaymentId) {
          const matchingPayments = await this.payments.findByProviderPaymentReference(payment.provider, payment.providerPaymentId, session);
          if (matchingPayments.length > 1) discrepancies.add("DUPLICATE_PROVIDER_REFERENCE");
        }

        const discrepancyCodes = [...discrepancies].sort();
        const status = classify(discrepancyCodes);
        const ledgerEvidenceHash = digest(ledger.map((entry) => ({
          paymentId: entry.paymentId,
          orderId: entry.orderId?.toString(),
          eventType: entry.eventType,
          fromStatus: entry.fromStatus,
          toStatus: entry.toStatus,
          amountMinor: entry.amountMinor,
          currency: entry.currency,
          provider: entry.provider,
          idempotencyKey: entry.idempotencyKey,
          actorType: entry.actorType,
          recordedAt: entry.recordedAt,
        })));
        evidenceHash = digest({
          payment: payment ? {
            paymentId: payment.paymentId,
            orderId: payment.orderId.toString(),
            provider: payment.provider,
            providerPaymentId: payment.providerPaymentId,
            status: payment.status,
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            updatedAt: payment.updatedAt,
          } : null,
          order: order ? {
            id: order._id.toString(),
            status: order.status,
            snapshot: orderSnapshot || null,
          } : null,
          ledgerEvidenceHash,
          webhookEvidence: receipts.map((receipt) => ({
            provider: receipt.provider,
            providerEventId: receipt.providerEventId,
            providerPaymentReference: receipt.providerPaymentReference,
            status: receipt.canonicalStatus,
            amountMinor: receipt.amountMinor,
            currency: receipt.currency,
            payloadHash: receipt.payloadHash,
            processedAt: receipt.processedAt,
          })),
          transactionInquiryEvidence: trustedInquiry ? {
            providerTransactionId: trustedInquiry.providerTransactionId,
            orderReference: trustedInquiry.orderReference,
            status: trustedInquiry.status,
            amountMinor: trustedInquiry.amountMinor,
            currency: trustedInquiry.currency,
            capturedAmountMinor: trustedInquiry.capturedAmountMinor,
            isCaptured: trustedInquiry.isCaptured,
            pending: trustedInquiry.pending,
            success: trustedInquiry.success,
            errorOccurred: trustedInquiry.errorOccurred,
            integrationId: trustedInquiry.integrationId,
            integrationType: trustedInquiry.integrationType,
            isLive: trustedInquiry.isLive,
            hasParentTransaction: trustedInquiry.hasParentTransaction,
            parentTransactionId: trustedInquiry.parentTransactionId,
            isAuth: trustedInquiry.isAuth,
            isCapture: trustedInquiry.isCapture,
            isStandalonePayment: trustedInquiry.isStandalonePayment,
            isVoided: trustedInquiry.isVoided,
            isRefunded: trustedInquiry.isRefunded,
            observedAt: trustedInquiry.observedAt,
          } : null,
          inquiryErrorCode,
          providerConfigured,
          providerEnabled,
          providerStatusQueryAvailable,
          status,
          discrepancyCodes,
        });

        const existing = await this.reconciliations.findByEvidence(value, evidenceHash, session);
        if (existing) {
          result = existing;
          return;
        }

        const record = await this.reconciliations.create({
          paymentId: value,
          orderId: payment?.orderId || null,
          provider: payment?.provider || null,
          providerPaymentReference: payment?.providerPaymentId || null,
          providerTransactionReference: trustedInquiry?.providerTransactionId || payment?.providerTransactionId || null,
          providerObservedOrderReference: trustedInquiry?.orderReference || null,
          internalPaymentState: normalizedState(payment),
          internalAmountMinor: Number.isSafeInteger(payment?.amountMinor) ? payment.amountMinor : null,
          internalCurrency: typeof payment?.currency === "string" ? payment.currency : null,
          orderState: order?.status || null,
          orderAmountMinor: Number.isSafeInteger(orderSnapshot?.grandTotalMinor) ? orderSnapshot.grandTotalMinor : null,
          orderCurrency: typeof orderSnapshot?.currency === "string" ? orderSnapshot.currency : null,
          providerObservedState,
          providerObservedAt,
          providerObservedAmountMinor,
          providerObservedCurrency,
          providerObservedCapturedAmountMinor: trustedInquiry?.capturedAmountMinor ?? null,
          providerObservedIsCaptured: trustedInquiry?.isCaptured ?? null,
          providerObservedPending: trustedInquiry?.pending ?? null,
          providerObservedSuccess: trustedInquiry?.success ?? null,
          providerObservedErrorOccurred: trustedInquiry?.errorOccurred ?? null,
          providerObservedIsAuth: trustedInquiry?.isAuth ?? null,
          providerObservedIsCapture: trustedInquiry?.isCapture ?? null,
          providerObservedIsStandalonePayment: trustedInquiry?.isStandalonePayment ?? null,
          providerObservedIsVoided: trustedInquiry?.isVoided ?? null,
          providerObservedIsRefunded: trustedInquiry?.isRefunded ?? null,
          providerObservedIntegrationId: trustedInquiry?.integrationId ?? null,
          providerObservedIntegrationType: trustedInquiry?.integrationType ?? null,
          providerObservedIsLive: trustedInquiry?.isLive ?? null,
          providerObservedHasParentTransaction: trustedInquiry?.hasParentTransaction ?? null,
          providerObservedParentTransactionId: trustedInquiry?.parentTransactionId ?? null,
          reconciliationStatus: status,
          discrepancyCodes,
          evidenceSource: trustedInquiry && trustedEvidence.length > 0
            ? "verified_webhook_and_paymob_transaction_inquiry"
            : trustedInquiry ? "paymob_transaction_inquiry"
              : trustedEvidence.length > 0 ? "verified_webhook" : "none",
          evidenceHash,
          ledgerEvidenceHash,
          providerEventIds: trustedEvidence.map((item) => item.providerEventId),
          ledgerEntryCount: ledger.length,
          webhookEvidenceCount: trustedEvidence.length,
          providerRecognized: Boolean(knownProvider),
          providerConfigured,
          providerEnabled,
          providerStatusQueryAvailable,
          reconciledAt: new Date(),
        }, session);
        result = record;
      });
    } catch (error) {
      if (error?.code === 11000 && evidenceHash) {
        result = await this.reconciliations.findByEvidence(value, evidenceHash);
        if (result) return this.logAndReturn(result);
      }
      throw error;
    } finally {
      await session.endSession();
    }
    return this.logAndReturn(result);
  }

  logAndReturn(record) {
    const event = record.reconciliationStatus === "MATCHED" ? "reconciliation.matched"
      : record.reconciliationStatus === "MISMATCH" ? "reconciliation.mismatch"
        : record.reconciliationStatus === "PENDING_REVIEW" ? "reconciliation.pending_review"
          : "reconciliation.unknown";
    logger.info(JSON.stringify({
      event,
      reconciliationId: record.reconciliationId,
      paymentId: record.paymentId,
      provider: record.provider,
      status: record.reconciliationStatus,
      discrepancyCodes: record.discrepancyCodes,
    }));
    return record;
  }
}

module.exports = {
  PaymentReconciliationService,
  reconciliationError,
  validateLedger,
  selectProviderState,
  classify,
};
