const AppError = require("../utils/appError");
const logger = require("../utils/logger");

const buildErrorResponse = (err) => {
  return {
    status: err.status || "error",
    message: err.message || "An unexpected error occurred",
    ...(err.details ? { details: err.details } : {}),
  };
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || (err.statusCode >= 500 ? "error" : "fail");

  logger.error(`${req.method} ${req.originalUrl} ${err.statusCode} ${err.message}`);

  if (process.env.NODE_ENV !== "production") {
    return res.status(err.statusCode).json({
      ...buildErrorResponse(err),
      stack: err.stack,
      error: err,
    });
  }

  res.status(err.statusCode).json(buildErrorResponse(err));
};
