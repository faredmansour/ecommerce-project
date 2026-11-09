const crypto = require("crypto");

const safeErrorCode = (error) =>
  typeof error?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(error.code)
    ? error.code
    : undefined;

const safeErrorType = (error) =>
  typeof error?.name === "string" && /^[A-Za-z][A-Za-z0-9]{0,79}$/.test(error.name)
    ? error.name
    : "Error";

const getSanitizedRoute = (req) => {
  const routePath = typeof req.route?.path === "string"
    ? `${req.baseUrl || ""}${req.route.path}`
    : req.path || "/";
  return routePath
    .split("/")
    .map((segment) => (segment.length >= 32 ? ":redacted" : segment))
    .join("/");
};

const requestContext = (req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader("X-Request-ID", req.requestId);
  next();
};

const logRequest = (req, logger) => {
  logger.info(`${req.requestId || "no-request-id"} ${req.method} ${getSanitizedRoute(req)}`);
};

const logRequestError = (req, statusCode, error, logger) => {
  const errorCode = safeErrorCode(error);
  logger.error(JSON.stringify({
    event: "request.error",
    requestId: req.requestId || "no-request-id",
    method: req.method,
    route: getSanitizedRoute(req),
    statusCode,
    errorType: safeErrorType(error),
    ...(errorCode ? { errorCode } : {}),
  }));
};

const logControllerError = (req, error, logger) => {
  logRequestError(req, 500, error, logger);
};

module.exports = {
  getSanitizedRoute,
  logControllerError,
  logRequest,
  logRequestError,
  requestContext,
};
