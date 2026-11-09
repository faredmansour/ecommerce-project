const AppError = require("../utils/appError");
const logger = require("../utils/logger");
const { logRequestError } = require("../utils/requestLogging");

const buildErrorResponse = (err, message) => {
  return {
    status: err.status || "error",
    message,
    ...(err.details ? { details: err.details } : {}),
  };
};

module.exports = (err, req, res, next) => {
  if (err.type === "entity.parse.failed" && req.path.startsWith("/api/payments/webhooks/")) {
    logRequestError(req, 400, err, logger);
    return res.status(400).json({
      status: "fail",
      code: "WEBHOOK_MALFORMED_REQUEST",
      message: "Webhook request is malformed.",
    });
  }

  err.statusCode = err.statusCode || 500;
  err.status = err.status || (err.statusCode >= 500 ? "error" : "fail");

  logRequestError(req, err.statusCode, err, logger);

  if (process.env.NODE_ENV !== "production") {
    return res.status(err.statusCode).json({
      ...buildErrorResponse(err, err.message || "An unexpected error occurred"),
      stack: err.stack,
      error: err,
    });
  }

  const safeMessage = err.isOperational && err.statusCode < 500
    ? err.message
    : "Internal server error";
  res.status(err.statusCode).json(buildErrorResponse(err, safeMessage));
};
