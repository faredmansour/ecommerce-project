const crypto = require("crypto");
const mongoose = require("mongoose");
const Joi = require("joi");
const PaymentRepository = require("../repositories/paymentRepository");
const PaymentLedgerRepository = require("../repositories/paymentLedgerRepository");
const PaymentIdempotencyRepository = require("../repositories/paymentIdempotencyRepository");
const OrderPaymentSnapshotRepository = require("../repositories/orderPaymentSnapshotRepository");
const PaymentWebhookEventRepository = require("../repositories/paymentWebhookEventRepository");
const PaymentExecutionAttemptRepository = require("../repositories/paymentExecutionAttemptRepository");
const { ProviderExecutionService } = require("./providerExecutionService");
const { assertPaymentTransition } = require("../utils/paymentStateMachine");
const { normalizeCurrency } = require("../utils/money");
const { isSupportedPaymentCurrency } = require("../utils/paymentCurrency");
const { PROVIDERS } = require("../providers/providerIdentifiers");

const createPaymentCommandSchema = Joi.object({
  orderId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  customerId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
  provider: Joi.string().lowercase().pattern(/^[a-z][a-z0-9_-]{1,39}$/).required(),
  paymentMethodType: Joi.string().valid("card").default("card"),
  idempotencyKey: Joi.string().pattern(/^[A-Za-z0-9._:-]{8,128}$/).required(),
}).unknown(false);

const transitionCommandSchema = Joi.object({
  paymentId: Joi.string().guid({ version: ["uuidv4"] }).required(),
  toStatus: Joi.string().required(),
  source: Joi.string().valid("payment_service", "provider_api", "provider_webhook", "reconciliation").required(),
  verified: Joi.boolean().default(false),
  reasonCode: Joi.string().max(80).allow(null, "").default(null),
}).unknown(false);

const EVENT_BY_STATUS = Object.freeze({
  pending: "payment_pending",
  requires_action: "payment_requires_action",
  authorized: "payment_authorized",
  captured: "payment_captured",
  failed: "payment_failed",
  cancelled: "payment_cancelled",
});
const CARD_ORDER_METHODS = new Set(["card", "stripe"]);
const WEBHOOK_EVENT_STATUSES = Object.freeze(["pending", "requires_action", "authorized", "captured", "failed", "cancelled"]);

function makeError(code, message, statusCode) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
}

function hashRequest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readOrderSnapshot(order, { requireEligibleState = true } = {}) {
  const snapshot = order?.commercialSnapshot;
  if (requireEligibleState && !["pending_payment", "pending"].includes(order?.status)) {
    throw makeError("INVALID_ORDER_STATE", "The Order is not available for Payment creation.", 409);
  }
  if (!snapshot || !Number.isSafeInteger(snapshot.grandTotalMinor) || typeof snapshot.currency !== "string") {
    throw makeError("INVALID_COMMERCIAL_SNAPSHOT", "The Order has no valid server-side commercial snapshot.", 422);
  }
  if (snapshot.grandTotalMinor < 1) {
    throw makeError("INVALID_PAYMENT_AMOUNT", "The Order snapshot does not contain a positive payable amount.", 422);
  }

  let currency;
  try {
    currency = normalizeCurrency(snapshot.currency);
  } catch {
    throw makeError("INVALID_PAYMENT_CURRENCY", "The Order payment currency is invalid.", 422);
  }
  if (!isSupportedPaymentCurrency(currency)) {
    throw makeError("INVALID_PAYMENT_CURRENCY", "The Order payment currency is unsupported.", 422);
  }

  if (!CARD_ORDER_METHODS.has(order.paymentMethod)) {
    throw makeError("PAYMENT_METHOD_UNAVAILABLE", "This Order payment method is not available for Payment creation.", 422);
  }

  return { amountMinor: snapshot.grandTotalMinor, currency };
}

async function finalizeOrderPayment(orders, payment, paymentStatus, session) {
  if (!["captured", "failed", "cancelled"].includes(paymentStatus)) return;
  const result = await orders.completeOrderPayment({
    orderId: payment.orderId,
    customerId: payment.customerId,
    paymentId: payment.paymentId,
    status: paymentStatus === "captured" ? "paid" : paymentStatus,
  }, session);
  if (result.matchedCount !== 1) {
    throw makeError("PAYMENT_ORDER_STATE_CONFLICT", "Order is not eligible for this Payment outcome.", 409);
  }
}

class PaymentService {
  constructor({ paymentRepository, ledgerRepository, idempotencyRepository, orderSnapshotRepository, providerExecutionService, webhookEventRepository, executionAttemptRepository } = {}) {
    this.payments = paymentRepository || new PaymentRepository();
    this.ledger = ledgerRepository || new PaymentLedgerRepository();
    this.idempotency = idempotencyRepository || new PaymentIdempotencyRepository();
    this.orders = orderSnapshotRepository || new OrderPaymentSnapshotRepository();
    this.providerExecution = providerExecutionService || new ProviderExecutionService({
      paymentRepository: this.payments,
      orderSnapshotRepository: this.orders,
    });
    this.webhookEvents = webhookEventRepository || new PaymentWebhookEventRepository();
    this.executionAttempts = executionAttemptRepository || new PaymentExecutionAttemptRepository();
  }

  async executePayment(command) {
    const result = await this.providerExecution.executePayment(command);
    if (result.provider === PROVIDERS.PAYMOB) {
      await this.recordProviderExecution(result);
    }
    return result;
  }

  async recordProviderExecution(result) {
    if (result.provider !== PROVIDERS.PAYMOB || result.environment !== "TEST" ||
        result.status !== "pending" || typeof result.providerPaymentId !== "string" ||
        !result.providerPaymentId || result.paymentMethodType !== "card" ||
        typeof result.checkoutUrl !== "string") {
      throw makeError("PROVIDER_EXECUTION_INVALID", "Paymob TEST checkout result is invalid.", 502);
    }

    const session = await mongoose.startSession();
    let updatedPayment;
    try {
      await session.withTransaction(async () => {
        const payment = await this.payments.findByPaymentId(result.paymentId, session);
        if (!payment || payment.provider !== PROVIDERS.PAYMOB ||
            payment.amountMinor !== result.amountMinor || payment.currency !== result.currency ||
            payment.paymentMethodType !== result.paymentMethodType ||
            payment.orderId.toString() !== result.orderId) {
          throw makeError("PROVIDER_EXECUTION_INVALID", "Paymob checkout result does not match the Payment.", 409);
        }

        if (payment.status === "pending" && payment.providerPaymentId === result.providerPaymentId) {
          updatedPayment = payment;
          return;
        }
        if (payment.status !== "created" ||
            (payment.providerPaymentId && payment.providerPaymentId !== result.providerPaymentId)) {
          throw makeError("PAYMENT_ALREADY_PROCESSED", "Payment is not available for provider execution.", 409);
        }

        assertPaymentTransition(payment.status, "pending", { source: "payment_service" });
        payment.providerPaymentId = result.providerPaymentId;
        payment.status = "pending";
        await payment.save({ session });
        await this.ledger.append({
          paymentId: payment.paymentId,
          orderId: payment.orderId,
          eventType: EVENT_BY_STATUS.pending,
          fromStatus: "created",
          toStatus: "pending",
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          provider: payment.provider,
          idempotencyKey: `provider-execution:${payment.provider}:${payment.paymentId}`,
          actorType: "payment_service",
          reasonCode: "PROVIDER_SESSION_CREATED",
        }, session);
        updatedPayment = payment;
      });
    } finally {
      await session.endSession();
    }
    return updatedPayment;
  }

  async receiveVerifiedWebhook(command) {
    const schema = Joi.object({
      provider: Joi.string().valid("paymob", "kashier", "fawry").required(),
      providerEventId: Joi.string().trim().min(1).max(200).required(),
      providerTransactionReference: Joi.when("provider", {
        is: "paymob",
        then: Joi.string().trim().min(1).max(200).required(),
        otherwise: Joi.forbidden(),
      }),
      paymentReference: Joi.string().guid({ version: ["uuidv4"] }),
      providerPaymentReference: Joi.string().trim().min(1).max(200),
      providerOrderReference: Joi.when("provider", {
        is: "paymob",
        then: Joi.string().trim().min(1).max(200),
        otherwise: Joi.forbidden(),
      }),
      eventType: Joi.string().valid(...WEBHOOK_EVENT_STATUSES.map((status) => `payment_${status}`)).required(),
      status: Joi.string().valid(...WEBHOOK_EVENT_STATUSES).required(),
      amountMinor: Joi.number().integer().positive().unsafe(false).required(),
      currency: Joi.string().custom((currency, helpers) => (
        isSupportedPaymentCurrency(currency) ? currency : helpers.error("any.invalid")
      )).required(),
      payloadHash: Joi.string().pattern(/^[a-f0-9]{64}$/).required(),
      occurredAt: Joi.date().optional(),
    }).unknown(false);
    const { value, error } = schema.validate(command, { abortEarly: false, convert: false });
    const hasBinding = Boolean(value.paymentReference && value.providerPaymentReference);
    const deferredBinding = value.provider === "paymob" && Boolean(value.providerOrderReference) &&
      !value.paymentReference && !value.providerPaymentReference;
    if (error || value.eventType !== `payment_${value.status}` || (!hasBinding && !deferredBinding) ||
        (Boolean(value.paymentReference) !== Boolean(value.providerPaymentReference))) {
      throw makeError("WEBHOOK_MALFORMED_REQUEST", "Verified webhook event is invalid.", 400);
    }

    try {
      const created = await this.webhookEvents.create({
        provider: value.provider,
        providerEventId: value.providerEventId,
        providerTransactionReference: value.providerTransactionReference || null,
        paymentId: value.paymentReference || null,
        paymentReference: value.paymentReference || null,
        providerPaymentReference: value.providerPaymentReference || null,
        providerOrderReference: value.providerOrderReference || null,
        bindingPending: deferredBinding,
        bindingDeadlineAt: deferredBinding ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
        eventType: value.eventType,
        canonicalStatus: value.status,
        amountMinor: value.amountMinor,
        currency: value.currency,
        occurredAt: value.occurredAt || null,
        payloadHash: value.payloadHash,
        verificationStatus: "VERIFIED",
        processingStatus: "RECEIVED",
        nextAttemptAt: new Date(),
      });
      return { duplicate: false, eventId: created.eventId, paymentId: created.paymentId };
    } catch (caught) {
      if (caught?.code === 11000) {
        const receipt = await this.webhookEvents.findByProviderEvent(value.provider, value.providerEventId);
        if (receipt?.payloadHash === value.payloadHash) return { duplicate: true, eventId: receipt.eventId, paymentId: receipt.paymentId };
        if (receipt) throw makeError("WEBHOOK_EVENT_CONFLICT", "Provider event identity was reused with different content.", 409);
      }
      throw caught;
    }
  }

  async processClaimedWebhook(eventId, claimToken, { leaseMs = 60 * 1000 } = {}) {
    const session = await mongoose.startSession();
    let result;
    try {
      await session.withTransaction(async () => {
        const receipt = await this.webhookEvents.findByEventId(eventId, session);
        if (!receipt) throw makeError("WEBHOOK_EVENT_NOT_FOUND", "Webhook event is unavailable.", 404);
        if (receipt.processingStatus === "PROCESSED") {
          result = { duplicate: true, eventId, paymentId: receipt.paymentId, status: "PROCESSED" };
          return;
        }
        if (receipt.processingStatus !== "PROCESSING" || receipt.claimToken !== claimToken) {
          throw makeError("WEBHOOK_CLAIM_LOST", "Webhook processing claim is no longer current.", 409);
        }
        // Touch the receipt inside the same transaction as Payment and ledger.
        // Holding this document write through commit prevents an expired lease
        // from being concurrently reclaimed while this transaction is active.
        const renewedClaim = await this.webhookEvents.renewClaimInTransaction(
          eventId,
          claimToken,
          session,
          new Date(Date.now() + leaseMs)
        );
        if (!renewedClaim) throw makeError("WEBHOOK_CLAIM_LOST", "Webhook processing claim is no longer current.", 409);

        let paymentReference = receipt.paymentReference;
        let providerPaymentReference = receipt.providerPaymentReference;
        if (!paymentReference || !providerPaymentReference) {
          if (receipt.provider !== "paymob" || !receipt.providerOrderReference) {
            throw makeError("WEBHOOK_PAYMENT_REFERENCE_NOT_FOUND", "Verified webhook references no matching Payment.", 404);
          }
          const attempt = await this.executionAttempts.findPaymobSessionByOrderReference(receipt.providerOrderReference, session);
          if (!attempt?.paymentId || !attempt?.providerPaymentId) {
            throw makeError("WEBHOOK_PROVIDER_BINDING_PENDING", "Verified webhook is waiting for the provider session response to be persisted.", 409);
          }
          paymentReference = attempt.paymentId;
          providerPaymentReference = attempt.providerPaymentId;
          const bound = await this.webhookEvents.bindPaymobReferences(eventId, claimToken, session, {
            paymentReference,
            providerPaymentReference,
          });
          if (!bound) throw makeError("WEBHOOK_CLAIM_LOST", "Webhook binding claim is no longer current.", 409);
        }

        const payment = await this.payments.findByPaymentId(paymentReference, session);
        if (!payment) {
          throw makeError("WEBHOOK_PAYMENT_REFERENCE_NOT_FOUND", "Verified webhook references no matching Payment.", 404);
        }
        if (payment.provider === receipt.provider && !payment.providerPaymentId) {
          throw makeError("WEBHOOK_PROVIDER_BINDING_PENDING", "Verified webhook is waiting for the local provider session binding.", 409);
        }
        if (payment.provider !== receipt.provider || payment.providerPaymentId !== providerPaymentReference) {
          throw makeError("WEBHOOK_PAYMENT_REFERENCE_NOT_FOUND", "Verified webhook references no matching Payment.", 404);
        }
        if (receipt.occurredAt) {
          const processedReceipts = await this.webhookEvents.findVerifiedProcessedForPayment(payment.paymentId, session);
          const hasNewerEvidence = processedReceipts.some((processedReceipt) =>
            processedReceipt.canonicalStatus !== receipt.canonicalStatus &&
            processedReceipt.occurredAt &&
            processedReceipt.occurredAt.getTime() >= receipt.occurredAt.getTime()
          );
          if (hasNewerEvidence) {
            throw makeError("WEBHOOK_STATE_CONFLICT", "Verified webhook is older than previously applied provider evidence.", 409);
          }
        }
        if (receipt.providerTransactionReference &&
            payment.providerTransactionId &&
            payment.providerTransactionId !== receipt.providerTransactionReference) {
          throw makeError("WEBHOOK_TRANSACTION_REFERENCE_CONFLICT", "Verified webhook transaction reference conflicts with the persisted Payment.", 409);
        }
        if (payment.status === "captured" || payment.status === "failed" || payment.status === "cancelled") {
          throw makeError("WEBHOOK_STATE_CONFLICT", "Verified webhook is not valid for the current Payment state.", 409);
        }

        const order = await this.orders.findOwnedOrderSnapshot(payment.orderId, payment.customerId, session);
        let orderMoney;
        try {
          if (!order) throw new Error("missing");
          orderMoney = readOrderSnapshot(order);
        } catch {
          throw makeError("WEBHOOK_ORDER_SNAPSHOT_INVALID", "Payment Order is not valid for webhook processing.", 409);
        }
        if (payment.amountMinor !== orderMoney.amountMinor || payment.currency !== orderMoney.currency ||
            receipt.amountMinor !== payment.amountMinor) {
          throw makeError("PAYMENT_AMOUNT_MISMATCH", "Verified webhook amount does not match Payment and Order.", 409);
        }
        if (receipt.currency !== payment.currency || receipt.currency !== orderMoney.currency) {
          throw makeError("PAYMENT_CURRENCY_MISMATCH", "Verified webhook currency does not match Payment and Order.", 409);
        }

        try {
          assertPaymentTransition(payment.status, receipt.canonicalStatus, { source: "provider_webhook", verified: true });
        } catch {
          throw makeError("WEBHOOK_STATE_CONFLICT", "Verified webhook transition is not allowed.", 409);
        }

        const fromStatus = payment.status;
        if (receipt.providerTransactionReference && !payment.providerTransactionId) {
          payment.providerTransactionId = receipt.providerTransactionReference;
        }
        payment.status = receipt.canonicalStatus;
        await payment.save({ session });
        await this.ledger.append({
          paymentId: payment.paymentId,
          orderId: payment.orderId,
          eventType: receipt.eventType,
          fromStatus,
          toStatus: receipt.canonicalStatus,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          provider: payment.provider,
          idempotencyKey: `webhook:${receipt.provider}:${receipt.providerEventId}`,
          actorType: "provider_webhook",
          reasonCode: "VERIFIED_PROVIDER_WEBHOOK",
          occurredAt: receipt.occurredAt || new Date(),
        }, session);
        await finalizeOrderPayment(this.orders, payment, receipt.canonicalStatus, session);
        const processed = await this.webhookEvents.markProcessed(eventId, claimToken, session, new Date());
        if (!processed) throw makeError("WEBHOOK_CLAIM_LOST", "Webhook processing claim is no longer current.", 409);
        result = { duplicate: false, eventId, paymentId: payment.paymentId, status: payment.status };
      });
    } finally {
      await session.endSession();
    }
    return result;
  }

  async createFromOrderSnapshot(command) {
    const { value, error } = createPaymentCommandSchema.validate(command, { abortEarly: false });
    if (error) throw makeError("INVALID_PAYMENT_COMMAND", "Payment creation command is invalid.", 400);

    const customerId = new mongoose.Types.ObjectId(value.customerId);
    const orderId = new mongoose.Types.ObjectId(value.orderId);
    const session = await mongoose.startSession();
    let createdPayment;
    let requestHash;

    try {
      await session.withTransaction(async () => {
        const order = await this.orders.findOwnedOrderSnapshot(orderId, customerId, session);
        if (!order) throw makeError("ORDER_NOT_FOUND", "Order not found.", 404);
        const money = readOrderSnapshot(order, { requireEligibleState: false });
        requestHash = hashRequest({
          orderId: orderId.toString(),
          customerId: customerId.toString(),
          provider: value.provider,
          paymentMethodType: value.paymentMethodType,
          ...money,
        });

        const existing = await this.idempotency.find(customerId, "create_payment", value.idempotencyKey, session);
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw makeError("IDEMPOTENCY_KEY_REUSED", "Idempotency key was already used for a different payment request.", 409);
          }
          createdPayment = await this.payments.findByPaymentId(existing.paymentId, session);
          if (!createdPayment) throw makeError("PAYMENT_RECORD_MISSING", "Idempotent Payment record is unavailable.", 409);
          return;
        }

        if (!["pending_payment", "pending"].includes(order.status)) {
          throw makeError("INVALID_ORDER_STATE", "The Order is not available for Payment creation.", 409);
        }

        const blockingPayment = await this.payments.findBlockingPaymentForOrder(orderId, session);
        if (blockingPayment) {
          throw makeError("ACTIVE_PAYMENT_EXISTS", "An unresolved or captured Payment already exists for this Order.", 409);
        }

        const paymentId = crypto.randomUUID();
        const reservation = await this.orders.reserveOrderPayment({ orderId, customerId, paymentId }, session);
        if (reservation.matchedCount !== 1) {
          throw makeError("ACTIVE_PAYMENT_EXISTS", "Another Payment attempt is already active for this Order.", 409);
        }
        const payment = await this.payments.create({
          paymentId,
          orderId,
          customerId,
          provider: value.provider,
          amountMinor: money.amountMinor,
          currency: money.currency,
          paymentMethodType: value.paymentMethodType,
          status: "created",
          idempotencyKey: value.idempotencyKey,
          idempotencyRequestHash: requestHash,
          metadata: { channel: "web" },
        }, session);

        await this.idempotency.create({
          customerId,
          operation: "create_payment",
          idempotencyKey: value.idempotencyKey,
          requestHash,
          paymentId,
        }, session);

        await this.ledger.append({
          paymentId,
          orderId,
          eventType: "payment_created",
          fromStatus: null,
          toStatus: "created",
          amountMinor: money.amountMinor,
          currency: money.currency,
          provider: value.provider,
          idempotencyKey: value.idempotencyKey,
          actorType: "payment_service",
        }, session);
        createdPayment = payment;
      });
    } catch (error) {
      if (error?.code === 11000) {
        const existing = await this.idempotency.find(customerId, "create_payment", value.idempotencyKey);
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw makeError("IDEMPOTENCY_KEY_REUSED", "Idempotency key was already used for a different payment request.", 409);
          }
          const replay = await this.payments.findByPaymentId(existing.paymentId);
          if (replay) return replay;
        }
      }
      throw error;
    } finally {
      await session.endSession();
    }

    return createdPayment;
  }

  async transition({ paymentId, toStatus, source, verified = false, reasonCode = null }) {
    const { value, error } = transitionCommandSchema.validate({ paymentId, toStatus, source, verified, reasonCode });
    if (error) throw makeError("INVALID_PAYMENT_COMMAND", "Payment transition command is invalid.", 400);

    const session = await mongoose.startSession();
    let updatedPayment;
    try {
      await session.withTransaction(async () => {
        const payment = await this.payments.findByPaymentId(value.paymentId, session);
        if (!payment) throw makeError("PAYMENT_NOT_FOUND", "Payment not found.", 404);
        assertPaymentTransition(payment.status, value.toStatus, { source: value.source, verified: value.verified });
        const fromStatus = payment.status;
        payment.status = value.toStatus;
        await payment.save({ session });
        await this.ledger.append({
          paymentId: payment.paymentId,
          orderId: payment.orderId,
          eventType: EVENT_BY_STATUS[value.toStatus],
          fromStatus,
          toStatus: value.toStatus,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          provider: payment.provider,
          idempotencyKey: payment.idempotencyKey,
          actorType: value.source,
          reasonCode: value.reasonCode,
        }, session);
        await finalizeOrderPayment(this.orders, payment, value.toStatus, session);
        updatedPayment = payment;
      });
    } finally {
      await session.endSession();
    }
    return updatedPayment;
  }
}

module.exports = { PaymentService, createPaymentCommandSchema, readOrderSnapshot };
