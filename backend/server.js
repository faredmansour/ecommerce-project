const dotenv = require("dotenv");
dotenv.config({ path: "./connection/config.env" });

const mongoose = require("mongoose");
const app = require("./app");
const logger = require("./utils/logger");
const { connectRedis } = require("./utils/cache");
const { webhookService } = require("./controllers/paymentWebhookController");
const { DEFAULT_SHUTDOWN_TIMEOUT_MS } = require("./services/paymentWebhookWorkerRuntime");
const {
  createApiServerLifecycle,
  registerShutdownSignalHandlers,
} = require("./services/apiServerLifecycle");

const port = process.env.PORT || 8000;
const shutdownTimeoutMs = process.env.PAYMENT_WEBHOOK_SHUTDOWN_TIMEOUT_MS === undefined
  ? DEFAULT_SHUTDOWN_TIMEOUT_MS
  : Number(process.env.PAYMENT_WEBHOOK_SHUTDOWN_TIMEOUT_MS);

let lifecycleInstance = null;

function safeErrorCode(error, fallback) {
  return typeof error?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(error.code)
    ? error.code
    : fallback;
}

function start() {
  if (lifecycleInstance) return lifecycleInstance;

  const lifecycle = createApiServerLifecycle({
    connectDatabase: async () => {
      if (!Number.isSafeInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 1) {
        throw Object.assign(new Error("Webhook worker shutdown timeout is invalid."), { code: "INVALID_SHUTDOWN_TIMEOUT" });
      }

      if (!process.env.DB_URL) {
        throw Object.assign(new Error("DB_URL is not set."), { code: "DATABASE_URL_MISSING" });
      }

      const jwtSecret = process.env.JWT_SECRET || "";
      if (jwtSecret.length < 32 || jwtSecret.toLowerCase().includes("change-me")) {
        throw Object.assign(new Error("JWT_SECRET is invalid."), { code: "JWT_SECRET_INVALID" });
      }

      await mongoose.connect(process.env.DB_URL);
      logger.info("DB connection success");
    },
    connectOptionalServices: async () => {
      if (process.env.REDIS_URL) await connectRedis();
    },
    workerRuntime: webhookService.queue.runtime,
    requestLifecycle: app.requestLifecycle,
    databaseOperationRegistry: app.databaseOperationRegistry,
    listen: () => app.listen(port, () => {
      logger.info(`Server is running on port ${port}`);
    }),
    disconnect: () => mongoose.disconnect(),
    timeoutMs: shutdownTimeoutMs,
    logger,
    onTimeout: () => { process.exitCode = 1; },
  });

  registerShutdownSignalHandlers(process, lifecycle, () => { process.exitCode = 1; });
  lifecycleInstance = lifecycle;

  lifecycle.start().catch((error) => {
    logger.error(JSON.stringify({
      event: "server.startup_failed",
      errorCode: safeErrorCode(error, "SERVER_STARTUP_FAILED"),
    }));
    lifecycle.shutdown("STARTUP_FAILURE").catch(() => { process.exitCode = 1; });
  });

  return lifecycle;
}

if (require.main === module) start();

module.exports = { start };
