const dotenv = require("dotenv");
dotenv.config({ path: "./connection/config.env" });

const express = require("express");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const cors = require("cors");
const mongoose = require("mongoose");
const swaggerUi = require("swagger-ui-express");

const logger = require("./utils/logger");
const { logRequest, requestContext } = require("./utils/requestLogging");
const { createDatabaseOperationRegistry } = require("./services/databaseOperationRegistry");
const { createHttpRequestLifecycle } = require("./services/httpRequestLifecycle");
const swaggerSpec = require("./utils/swagger");
const errorHandler = require("./middlewares/errorHandler");

const productRouter = require("./routers/productRouter");
const categoryRouter = require("./routers/categoryRouter");
const authRouter = require("./routers/authRouter");
const cartRouter = require("./routers/cartRouter");
const wishlistRouter = require("./routers/wishlistRouter");
const ordersRouter = require("./routers/ordersRouter");
const addressRouter = require("./routers/addressRouter");
const couponRouter = require("./routers/couponRouter");
const paymentRouter = require("./routers/paymentRouter");
const paymentWebhookRouter = require("./routers/paymentWebhookRouter");
const uploadRouter = require("./routers/uploadRouter");
const brandRouter = require("./routers/brandRouter");
const adminRouter = require("./routers/adminRouter");
const pricingRouter = require("./routers/pricingRouter");
const { webhookService } = require("./controllers/paymentWebhookController");
const { blockInPreview, blockMutationsInPreview, isPreviewMode } = require("./middlewares/previewMode");

const app = express();

// Vercel runs this app as a serverless function, so the persistent server.js
// lifecycle is intentionally bypassed. Establish and reuse a MongoDB connection
// before handling each request; never start the persistent webhook worker here.
let vercelDatabaseConnectionPromise = null;

async function ensureVercelDatabaseConnection() {
  if (mongoose.connection.readyState === 1) return;

  if (!process.env.DB_URL) {
    throw Object.assign(new Error("DB_URL is not configured."), { code: "DATABASE_URL_MISSING" });
  }

  const jwtSecret = process.env.JWT_SECRET || "";
  if (jwtSecret.length < 32 || jwtSecret.toLowerCase().includes("change-me")) {
    throw Object.assign(new Error("JWT_SECRET is invalid."), { code: "JWT_SECRET_INVALID" });
  }

  if (!vercelDatabaseConnectionPromise) {
    vercelDatabaseConnectionPromise = mongoose.connect(process.env.DB_URL, {
      serverSelectionTimeoutMS: 10000,
    }).catch((error) => {
      vercelDatabaseConnectionPromise = null;
      throw error;
    });
  }

  await vercelDatabaseConnectionPromise;
}

if (process.env.VERCEL === "1" || process.env.VERCEL === "true") {
  app.use(async (req, res, next) => {
    try {
      await ensureVercelDatabaseConnection();
      return next();
    } catch (error) {
      const errorCode = typeof error?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(error.code)
        ? error.code
        : "DATABASE_UNAVAILABLE";
      logger.error(JSON.stringify({ event: "vercel.request_initialization_failed", errorCode }));
      return res.status(503).json({
        status: "error",
        code: errorCode,
        message: "The API is temporarily unavailable. Check server configuration.",
      });
    }
  });
}
app.use(requestContext);
const databaseOperationRegistry = createDatabaseOperationRegistry({ logger });
const requestLifecycle = createHttpRequestLifecycle({ operationRegistry: databaseOperationRegistry });
webhookService.queue.runtime.setOperationRegistry(databaseOperationRegistry);

// --- Security & core middleware ---
app.disable("x-powered-by");
app.use(requestLifecycle.middleware);
app.use(helmet());
app.use(compression());
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// CORS: allow configured origins and loopback aliases for local development.
const configuredOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const localDevelopmentOrigins = process.env.NODE_ENV === "production"
  ? []
  : [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
  ];
const allowedOrigins = [...new Set([...configuredOrigins, ...localDevelopmentOrigins])];

app.use(
  cors({
    origin(origin, callback) {
      // allow non-browser tools (curl/postman) that send no origin
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);

app.use(express.json({
  limit: "10kb",
  verify(req, res, buffer) {
    if (req.originalUrl.startsWith("/api/payments/webhooks/")) {
      req.rawBody = Buffer.from(buffer);
    }
  },
}));

// NoSQL-injection protection. Applied in place to req.body/req.params only —
// Express 5 makes req.query read-only, so reassigning it (the library default)
// would throw. Query strings are plain strings here, so this is sufficient.
app.use((req, res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body, { replaceWith: "_" });
  if (req.params) mongoSanitize.sanitize(req.params, { replaceWith: "_" });
  next();
});

// --- Rate limiting ---
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "error", message: "Too many requests, please try again later." },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "error", message: "Too many login attempts. Try again later." },
});

// Rate limiting should protect production traffic without blocking local dev while
// Vite/React refreshes and dashboard polling create many quick requests.
if (process.env.NODE_ENV === "production") {
  app.use("/api", globalLimiter);
  app.use("/api/auth", authLimiter);
}

// --- Request logging ---
app.use((req, res, next) => {
  logRequest(req, logger);
  next();
});

// --- Health check ---
app.get("/health", (req, res) => {
  const dbStates = ["disconnected", "connected", "connecting", "disconnecting"];
  const db = dbStates[mongoose.connection.readyState] || "unknown";
  const workerStatus = isPreviewMode()
    ? { state: "disabled", recoveryActive: false, activeEventCount: 0 }
    : webhookService.queue.getStatus();
  const healthy = db === "connected" && (isPreviewMode() || workerStatus.state === "running");
  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db,
    paymentWebhookWorker: workerStatus,
  });
});

// --- API documentation ---
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/api/docs.json", (req, res) => res.json(swaggerSpec));

// --- Static uploads & routes ---
app.use("/uploadimage", express.static("uploadimage"));
app.use("/api", uploadRouter);

app.use("/api/auth/google", blockInPreview("Google authentication"));
app.use("/api/auth/apple", blockInPreview("Apple authentication"));
app.use("/api/orders", blockMutationsInPreview("Order creation and management"));
app.use("/api/payments", blockInPreview("Payments"));
app.use("/api/auth", authRouter);
app.use("/api/products", productRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/brands", brandRouter);
app.use("/api/cart", cartRouter);
app.use("/api/wishlist", wishlistRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/addresses", addressRouter);
app.use("/api/coupons", couponRouter);
app.use("/api/payments/webhooks", blockInPreview("Payment webhooks"), paymentWebhookRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/pricing", pricingRouter);
app.use("/api/admin", adminRouter);

// --- Error handler (last) ---
app.use(errorHandler);

module.exports = app;
module.exports.requestLifecycle = requestLifecycle;
module.exports.databaseOperationRegistry = databaseOperationRegistry;
