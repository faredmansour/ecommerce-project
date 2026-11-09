const logger = require("../utils/logger");
const { PaymentWebhookWorker } = require("./paymentWebhookWorker");

const DEFAULT_RECOVERY_INTERVAL_MS = 5000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10000;
const WORKER_STATES = Object.freeze([
  "not_started",
  "starting",
  "running",
  "stopping",
  "stopped",
  "recovery_degraded",
]);

function safeErrorCode(error, fallback) {
  return typeof error?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(error.code)
    ? error.code
    : fallback;
}

function waitForTasks(tasks, timeoutMs, setTimeoutImpl, clearTimeoutImpl) {
  if (tasks.length === 0) return Promise.resolve({ timedOut: false });

  let timeoutHandle;
  const timeout = new Promise((resolve) => {
    timeoutHandle = setTimeoutImpl(() => resolve({ timedOut: true }), timeoutMs);
  });
  return Promise.race([
    Promise.all(tasks).then(() => ({ timedOut: false })),
    timeout,
  ]).finally(() => clearTimeoutImpl(timeoutHandle));
}

class PaymentWebhookWorkerRuntime {
  constructor({
    worker = new PaymentWebhookWorker(),
    recoveryIntervalMs = DEFAULT_RECOVERY_INTERVAL_MS,
    shutdownTimeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
    setIntervalImpl = setInterval,
    clearIntervalImpl = clearInterval,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout,
    operationRegistry = null,
  } = {}) {
    if (!Number.isSafeInteger(recoveryIntervalMs) || recoveryIntervalMs < 1) {
      throw new TypeError("Webhook worker recovery interval must be a positive integer.");
    }
    if (!Number.isSafeInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 1) {
      throw new TypeError("Webhook worker shutdown timeout must be a positive integer.");
    }

    this.worker = worker;
    this.recoveryIntervalMs = recoveryIntervalMs;
    this.shutdownTimeoutMs = shutdownTimeoutMs;
    this.setIntervalImpl = setIntervalImpl;
    this.clearIntervalImpl = clearIntervalImpl;
    this.setTimeoutImpl = setTimeoutImpl;
    this.clearTimeoutImpl = clearTimeoutImpl;
    this.operationRegistry = operationRegistry;
    this.state = "not_started";
    this.timer = null;
    this.startPromise = null;
    this.stopPromise = null;
    this.recoveryPromise = null;
    this.activeEvents = new Map();
    this.lastRecoveryAt = null;
    this.lastRecoveryErrorCode = null;
  }

  setOperationRegistry(operationRegistry) {
    if (this.startPromise || this.recoveryPromise || this.activeEvents.size > 0) {
      throw new Error("Cannot change the operation registry while webhook work is active.");
    }
    this.operationRegistry = operationRegistry;
  }

  runOperation(type, operation) {
    if (this.operationRegistry) return this.operationRegistry.run(type, operation);
    try {
      return Promise.resolve(operation());
    } catch (error) {
      return Promise.reject(error);
    }
  }

  start() {
    if (this.startPromise) return this.startPromise;
    if (this.state !== "not_started") return Promise.resolve();

    this.state = "starting";
    logger.info(JSON.stringify({ event: "webhook.worker.started", state: this.state }));
    this.startPromise = (async () => {
      try {
        await this.recover();
      } catch {
        // recover records the safe error code and degraded state.
      }

      if (this.state === "starting") this.state = "running";
      if (this.state === "recovery_degraded") {
        logger.warn(JSON.stringify({
          event: "webhook.worker.degraded",
          errorCode: this.lastRecoveryErrorCode,
        }));
      }

      if (this.state === "starting" || this.state === "running" || this.state === "recovery_degraded") {
        this.timer = this.setIntervalImpl(() => {
          this.recover().catch((error) => {
            logger.warn(JSON.stringify({
              event: "webhook.worker.periodic_recovery_failure_observed",
              errorCode: safeErrorCode(error, "WEBHOOK_WORKER_RECOVERY_FAILED"),
            }));
          });
        }, this.recoveryIntervalMs);
        this.timer.unref?.();
      }
    })().finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  notify(eventId) {
    if (!["running", "recovery_degraded"].includes(this.state) || this.activeEvents.has(eventId)) return false;

    const task = this.operationRegistry
      ? this.operationRegistry.tryRun("webhook_event", () => (
        Promise.resolve().then(() => this.worker.process(eventId))
      ))
      : Promise.resolve().then(() => this.worker.process(eventId));
    if (!task) return false;

    const trackedTask = task
      .catch((error) => {
        logger.error(JSON.stringify({
          event: "webhook.worker.event_processing_failed",
          eventId,
          errorCode: safeErrorCode(error, "WEBHOOK_WORKER_PROCESSING_FAILED"),
        }));
      })
      .finally(() => {
        this.activeEvents.delete(eventId);
      });

    this.activeEvents.set(eventId, trackedTask);
    return true;
  }

  recover(options = {}) {
    if (!["starting", "running", "recovery_degraded"].includes(this.state)) return Promise.resolve([]);
    if (this.recoveryPromise) return this.recoveryPromise;

    const shouldContinue = options.shouldContinue || (() => !["stopping", "stopped"].includes(this.state));
    this.recoveryPromise = this.runOperation("webhook_recovery", () => this.worker.recover({
      ...options,
      shouldContinue: () => (
        !["stopping", "stopped"].includes(this.state) && shouldContinue()
      ),
    }))
      .then((results) => {
        this.lastRecoveryAt = new Date();
        this.lastRecoveryErrorCode = null;
        if (this.state === "starting" || this.state === "recovery_degraded") this.state = "running";
        logger.info(JSON.stringify({
          event: "webhook.worker.recovery_completed",
          recoveredCount: results.length,
        }));
        return results;
      })
      .catch((error) => {
        this.lastRecoveryAt = new Date();
        this.lastRecoveryErrorCode = safeErrorCode(error, "WEBHOOK_WORKER_RECOVERY_FAILED");
        if (this.state === "starting" || this.state === "running" || this.state === "recovery_degraded") {
          this.state = "recovery_degraded";
        }
        logger.error(JSON.stringify({
          event: "webhook.worker.recovery_failed",
          errorCode: this.lastRecoveryErrorCode,
        }));
        throw error;
      })
      .finally(() => {
        this.recoveryPromise = null;
      });

    return this.recoveryPromise;
  }

  async waitForIdle() {
    while (true) {
      const tasks = [
        ...(this.startPromise ? [this.startPromise] : []),
        ...(this.recoveryPromise ? [this.recoveryPromise] : []),
        ...this.activeEvents.values(),
      ];
      if (tasks.length === 0) return;
      await Promise.allSettled(tasks);
    }
  }

  stop({ timeoutMs = this.shutdownTimeoutMs, deadlineAt = Date.now() + timeoutMs } = {}) {
    if (this.stopPromise) return this.stopPromise;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || !Number.isFinite(deadlineAt)) {
      return Promise.reject(new TypeError("Webhook worker shutdown timeout must be a non-negative integer."));
    }
    if (this.state === "stopped") return Promise.resolve({ timedOut: false, unfinishedCount: 0 });

    this.state = "stopping";
    if (this.timer) this.clearIntervalImpl(this.timer);
    this.timer = null;

    const tasks = [
      ...(this.startPromise ? [this.startPromise.catch(() => {})] : []),
      ...(this.recoveryPromise ? [this.recoveryPromise.catch(() => {})] : []),
      ...this.activeEvents.values(),
    ];
    const remainingMs = Math.max(0, deadlineAt - Date.now());

    this.stopPromise = waitForTasks(tasks, remainingMs, this.setTimeoutImpl, this.clearTimeoutImpl)
      .then(({ timedOut }) => {
        const unfinishedCount = timedOut ? Number(this.recoveryPromise !== null) + this.activeEvents.size : 0;
        if (timedOut) {
          logger.warn(JSON.stringify({
            event: "webhook.worker.drain_timed_out",
            unfinishedCount,
          }));
          this.waitForIdle().then(() => {
            this.state = "stopped";
            logger.info(JSON.stringify({
              event: "webhook.worker.stopped",
              timedOut: true,
              unfinishedCount: 0,
            }));
          });
        } else {
          this.state = "stopped";
          logger.info(JSON.stringify({
            event: "webhook.worker.stopped",
            timedOut: false,
            unfinishedCount: 0,
          }));
        }
        return { timedOut, unfinishedCount };
      });

    return this.stopPromise;
  }

  getStatus() {
    return {
      state: this.state,
      recoveryActive: this.recoveryPromise !== null,
      activeEventCount: this.activeEvents.size,
      lastRecoveryAt: this.lastRecoveryAt?.toISOString() || null,
      lastRecoveryErrorCode: this.lastRecoveryErrorCode,
    };
  }
}

module.exports = {
  PaymentWebhookWorkerRuntime,
  DEFAULT_RECOVERY_INTERVAL_MS,
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  WORKER_STATES,
};
