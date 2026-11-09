const crypto = require("crypto");
const logger = require("../utils/logger");
const PaymentWebhookEventRepository = require("../repositories/paymentWebhookEventRepository");
const { PaymentService } = require("./paymentService");

const WEBHOOK_RETRY = Object.freeze({
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 15 * 60 * 1000,
  leaseMs: 60 * 1000,
  recoveryBatchSize: 50,
});

const PERMANENT_ERROR_CODES = new Set([
  "WEBHOOK_PAYMENT_REFERENCE_NOT_FOUND",
  "WEBHOOK_TRANSACTION_REFERENCE_CONFLICT",
  "WEBHOOK_ORDER_SNAPSHOT_INVALID",
  "PAYMENT_AMOUNT_MISMATCH",
  "PAYMENT_CURRENCY_MISMATCH",
  "WEBHOOK_STATE_CONFLICT",
  "WEBHOOK_MALFORMED_REQUEST",
  "WEBHOOK_UNSUPPORTED_EVENT",
]);

function safeLog(event, receipt, extra = {}) {
  logger.info(JSON.stringify({
    event,
    eventId: receipt?.eventId || null,
    provider: receipt?.provider || null,
    providerEventId: receipt?.providerEventId || null,
    paymentId: receipt?.paymentId || null,
    processingStatus: receipt?.processingStatus || null,
    attemptCount: Number.isSafeInteger(receipt?.attemptCount) ? receipt.attemptCount : null,
    ...extra,
  }));
}

function retryDelay(attemptCount, { baseDelayMs = WEBHOOK_RETRY.baseDelayMs, maxDelayMs = WEBHOOK_RETRY.maxDelayMs } = {}) {
  const exponent = Math.max(0, Math.min(attemptCount - 1, 30));
  return Math.min(baseDelayMs * (2 ** exponent), maxDelayMs);
}

class PaymentWebhookWorker {
  constructor({ repository = new PaymentWebhookEventRepository(), paymentService = new PaymentService(), clock = () => new Date(), config = WEBHOOK_RETRY } = {}) {
    this.repository = repository;
    this.paymentService = paymentService;
    this.clock = clock;
    this.config = config;
  }

  async process(eventId) {
    const now = this.clock();
    const prior = await this.repository.findByEventId(eventId);
    if (!prior) return { claimed: false, status: "NOT_FOUND" };
    if (prior.processingStatus === "PROCESSED") return { claimed: false, duplicate: true, status: "PROCESSED" };

    const exhausted = await this.repository.deadLetterExhausted(eventId, { now, maxAttempts: this.config.maxAttempts });
    if (exhausted) {
      safeLog("webhook.dead_lettered", exhausted, { errorCode: "WEBHOOK_MAX_ATTEMPTS_EXCEEDED" });
      return { claimed: false, status: "DEAD_LETTER" };
    }

    const claimToken = crypto.randomUUID();
    const claimed = await this.repository.claim(eventId, {
      now,
      leaseUntil: new Date(now.getTime() + this.config.leaseMs),
      claimToken,
      maxAttempts: this.config.maxAttempts,
    });
    if (!claimed) return { claimed: false, status: prior.processingStatus };

    safeLog("webhook.claimed", claimed);
    try {
      const result = await this.paymentService.processClaimedWebhook(eventId, claimToken, { leaseMs: this.config.leaseMs });
      if (result.duplicate) return { claimed: true, duplicate: true, status: "PROCESSED" };
      const processed = await this.repository.findByEventId(eventId);
      safeLog("webhook.processed", processed);
      return { claimed: true, duplicate: false, status: "PROCESSED", paymentId: result.paymentId };
    } catch (error) {
      if (error?.code === "WEBHOOK_CLAIM_LOST") return { claimed: false, status: "CLAIM_LOST" };
      const failedAt = this.clock();
      const permanent = PERMANENT_ERROR_CODES.has(error?.code);
      const deadLetter = permanent || claimed.attemptCount >= this.config.maxAttempts;
      const status = deadLetter ? "DEAD_LETTER" : "RETRYABLE_FAILURE";
      const backoffMs = retryDelay(claimed.attemptCount, this.config);
      const updated = await this.repository.markFailure(eventId, claimToken, {
        status,
        errorCode: typeof error?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(error.code)
          ? error.code
          : "WEBHOOK_PROCESSING_ERROR",
        now: failedAt,
        nextAttemptAt: deadLetter ? failedAt : new Date(failedAt.getTime() + backoffMs),
      });
      if (updated) {
        safeLog(deadLetter ? "webhook.dead_lettered" : "webhook.retry_scheduled", updated, {
          errorCode: updated.lastErrorCode,
          nextAttemptAt: updated.nextAttemptAt,
        });
      }
      return { claimed: true, status: updated?.processingStatus || "CLAIM_LOST", errorCode: updated?.lastErrorCode || null };
    }
  }

  async recover({ limit = this.config.recoveryBatchSize, shouldContinue = () => true } = {}) {
    const now = this.clock();
    const pending = await this.repository.findPendingWebhookEvents({ now, limit });
    const results = [];
    for (const event of pending) {
      if (!shouldContinue()) break;
      results.push(await this.process(event.eventId));
    }
    return results;
  }

  async reprocessWebhookEvent(eventId) {
    const now = this.clock();
    const event = await this.repository.requeueDeadLetter(eventId, { now });
    if (!event) return { requeued: false, status: "NOT_DEAD_LETTERED" };
    safeLog("webhook.reprocessed", event);
    return { requeued: true, eventId: event.eventId, status: event.processingStatus };
  }
}

module.exports = { PaymentWebhookWorker, WEBHOOK_RETRY, PERMANENT_ERROR_CODES, retryDelay };
