const PaymentService = require("../services/paymentService").PaymentService;
const { ProviderWebhookService, WEBHOOK_ERRORS } = require("../services/providerWebhookService");

function createPaymentWebhookController(webhookService = new ProviderWebhookService({
  paymentService: new PaymentService(),
})) {
  return async (req, res) => {
    try {
      const result = await webhookService.ingest({
        provider: req.params.provider,
        rawBody: req.rawBody,
        headers: req.headers,
        signature: req.query?.hmac,
      });
      return res.status(200).json({
        status: "success",
        data: { accepted: true, duplicate: result.duplicate },
      });
    } catch (error) {
      const response = WEBHOOK_ERRORS[error?.code];
      if (response) {
        return res.status(response.status).json({
          status: "fail",
          code: error.code,
          message: response.message,
        });
      }
      return res.status(500).json({
        status: "error",
        code: "WEBHOOK_PROCESSING_FAILED",
        message: "Webhook could not be processed.",
      });
    }
  };
}

const webhookService = new ProviderWebhookService({ paymentService: new PaymentService() });
const receivePaymentWebhook = createPaymentWebhookController(webhookService);

module.exports = { createPaymentWebhookController, webhookService, receivePaymentWebhook };
