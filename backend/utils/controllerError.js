const logger = require("./logger");
const { logControllerError } = require("./requestLogging");

module.exports = (error, req) => {
  logControllerError(req || {}, error, logger);
  return "Internal server error";
};