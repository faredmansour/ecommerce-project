const PAYMENT_STATES = Object.freeze([
  "created",
  "pending",
  "requires_action",
  "authorized",
  "captured",
  "failed",
  "cancelled",
]);

const transitions = Object.freeze({
  created: ["pending", "failed"],
  pending: ["pending", "requires_action", "authorized", "captured", "failed", "cancelled"],
  requires_action: ["pending", "authorized", "captured", "failed", "cancelled"],
  authorized: ["captured", "failed", "cancelled"],
  captured: [],
  failed: [],
  cancelled: [],
});

const trustedSources = new Set(["payment_service", "provider_api", "provider_webhook", "reconciliation"]);

function assertPaymentTransition(fromStatus, toStatus, { source, verified = false } = {}) {
  if (!PAYMENT_STATES.includes(fromStatus) || !PAYMENT_STATES.includes(toStatus)) {
    const error = new Error("Unsupported payment state.");
    error.code = "PAYMENT_STATE_INVALID";
    error.statusCode = 400;
    throw error;
  }

  if (!transitions[fromStatus].includes(toStatus)) {
    const error = new Error(`Invalid payment transition: ${fromStatus} -> ${toStatus}.`);
    error.code = "PAYMENT_STATE_CONFLICT";
    error.statusCode = 409;
    throw error;
  }

  if (toStatus === "pending" && fromStatus === "created") {
    if (source !== "payment_service") {
      const error = new Error("Only the Payment service can start a payment attempt.");
      error.code = "PAYMENT_TRANSITION_FORBIDDEN";
      error.statusCode = 403;
      throw error;
    }
    return true;
  }

  if (!trustedSources.has(source) || !verified) {
    const error = new Error("A verified provider or reconciliation result is required.");
    error.code = "PAYMENT_EVIDENCE_REQUIRED";
    error.statusCode = 403;
    throw error;
  }

  return true;
}

module.exports = { PAYMENT_STATES, assertPaymentTransition };
