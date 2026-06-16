const { createLogger, transports, format } = require("winston");
const path = require("path");

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
  transports: [
    new transports.Console(),
    new transports.File({ filename: path.join(__dirname, "..", "logs", "error.log"), level: "error" }),
    new transports.File({ filename: path.join(__dirname, "..", "logs", "combined.log") }),
  ],
});

module.exports = logger;
