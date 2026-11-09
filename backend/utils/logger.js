const { createLogger, transports, format } = require("winston");
const path = require("path");

const loggerTransports = [new transports.Console()];

// Serverless deployments have an ephemeral, read-only application filesystem.
// Keep logs on stdout/stderr there; retain file logs for traditional local/server
// deployments where the project directory is writable.
if (process.env.VERCEL !== "1" && process.env.VERCEL !== "true") {
  loggerTransports.push(
    new transports.File({ filename: path.join(__dirname, "..", "logs", "error.log"), level: "error" }),
    new transports.File({ filename: path.join(__dirname, "..", "logs", "combined.log") })
  );
}

const logger = createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.splat(),
    format.printf(({ timestamp, level, message, stack }) => {
      return `${timestamp} ${level}: ${stack || message}`;
    })
  ),
  transports: loggerTransports,
});

module.exports = logger;
