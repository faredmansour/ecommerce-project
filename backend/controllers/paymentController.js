const PaymentRepository = require("../repositories/paymentRepository");
const { PaymentService } = require("../services/paymentService");

const paymentRepository = new PaymentRepository();
const paymentService = new PaymentService();

function paymobTestExecutionEnabled() {
  return process.env.PAYMOB_ENVIRONMENT === "TEST" &&
    process.env.PAYMOB_TEST_EXECUTION_ENABLED === "true";
}

const createPayment = async (req, res, next) => {
  const idempotencyKey = req.get("Idempotency-Key");
  if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    return res.status(400).json({
      status: "fail",
      code: "INVALID_IDEMPOTENCY_KEY",
      message: "A valid Idempotency-Key header is required.",
    });
  }

  try {
    const payment = await paymentService.createFromOrderSnapshot({
      orderId: req.body.orderId,
      customerId: req.user.id,
      provider: "deferred",
      paymentMethodType: "card",
      idempotencyKey,
    });

    return res.status(201).json({
      status: "success",
      data: {
        paymentId: payment.paymentId,
        orderId: payment.orderId.toString(),
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        paymentMethodType: payment.paymentMethodType,
        status: payment.status,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      },
    });
  } catch (error) {
    if (error.isOperational && error.statusCode < 500) {
      return res.status(error.statusCode).json({
        status: "fail",
        code: error.code === "IDEMPOTENCY_KEY_REUSED" ? "IDEMPOTENCY_CONFLICT" : error.code,
        message: error.message,
      });
    }
    if (error.isOperational) {
      return res.status(503).json({
        status: "fail",
        code: error.code,
        message: "Payment checkout could not be started. Reconcile before retrying.",
      });
    }
    return next(error);
  }
};

const createPaymentIntent = async (req, res, next) => {
  if (!paymobTestExecutionEnabled()) {
    const liveMode = process.env.PAYMOB_ENVIRONMENT === "LIVE";
    return res.status(503).json({
      status: "fail",
      code: liveMode ? "PROVIDER_CONFIGURATION_ERROR" : "PROVIDER_DISABLED",
      message: liveMode
        ? "Paymob LIVE execution is unavailable."
        : "Paymob TEST checkout is disabled.",
    });
  }

  const idempotencyKey = req.get("Idempotency-Key");
  if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    return res.status(400).json({
      status: "fail",
      code: "INVALID_IDEMPOTENCY_KEY",
      message: "A valid Idempotency-Key header is required.",
    });
  }

  try {
    const payment = await paymentService.createFromOrderSnapshot({
      orderId: req.body.orderId,
      customerId: req.user.id,
      provider: "paymob",
      paymentMethodType: "card",
      idempotencyKey,
    });

    if (!["created", "pending"].includes(payment.status)) {
      return res.status(409).json({
        status: "fail",
        code: "PAYMENT_ALREADY_PROCESSED",
        message: "This payment already has a completed or unresolved provider attempt.",
      });
    }

    const checkout = await paymentService.executePayment({ paymentId: payment.paymentId });
    return res.status(201).json({
      status: "success",
      data: {
        paymentId: payment.paymentId,
        orderId: payment.orderId.toString(),
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        paymentMethodType: payment.paymentMethodType,
        status: checkout.status,
        checkoutUrl: checkout.checkoutUrl,
      },
    });
  } catch (error) {
    if (error.isOperational && error.statusCode < 500) {
      return res.status(error.statusCode).json({
        status: "fail",
        code: error.code === "IDEMPOTENCY_KEY_REUSED" ? "IDEMPOTENCY_CONFLICT" : error.code,
        message: error.message,
      });
    }
    if (error.isOperational) {
      return res.status(503).json({
        status: "fail",
        code: error.code,
        message: "Payment checkout could not be started. Reconcile before retrying.",
      });
    }
    return next(error);
  }
};

const getPayment = async (req, res, next) => {
  try {
    const payment = await paymentRepository.findVisibleByPaymentId(req.params.paymentId, {
      customerId: req.user.id,
      isAdmin: req.user.role === "admin",
    });
    if (!payment) {
      return res.status(404).json({ status: "fail", code: "PAYMENT_NOT_FOUND", message: "Payment not found." });
    }

    return res.status(200).json({
      status: "success",
      data: {
        paymentId: payment.paymentId,
        orderId: payment.orderId,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        paymentMethodType: payment.paymentMethodType,
        status: payment.status,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = { createPayment, createPaymentIntent, getPayment };
