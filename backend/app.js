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
const uploadRouter = require("./routers/uploadRouter");
const adminRouter = require("./routers/adminRouter");

const app = express();

// --- Security & core middleware ---
app.use(helmet());
app.use(compression());

// CORS: allow a comma-separated list of origins from env, fall back to the dev client.
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

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

app.use(express.json({ limit: "10kb" }));

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
  logger.info(`${req.method} ${req.url}`);
  next();
});

// --- Health check ---
app.get("/health", (req, res) => {
  const dbStates = ["disconnected", "connected", "connecting", "disconnecting"];
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    db: dbStates[mongoose.connection.readyState] || "unknown",
  });
});

// --- API documentation ---
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get("/api/docs.json", (req, res) => res.json(swaggerSpec));

// --- Static uploads & routes ---
app.use("/uploadimage", express.static("uploadimage"));
app.use("/api", uploadRouter);

app.use("/api/auth", authRouter);
app.use("/api/products", productRouter);
app.use("/api/categories", categoryRouter);
app.use("/api/cart", cartRouter);
app.use("/api/wishlist", wishlistRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/addresses", addressRouter);
app.use("/api/coupons", couponRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/admin", adminRouter);

// --- Error handler (last) ---
app.use(errorHandler);

module.exports = app;
