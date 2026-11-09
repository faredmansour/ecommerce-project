const BaseProviderAdapter = require("./baseProviderAdapter");
const { PROVIDERS } = require("./providerIdentifiers");
const { WEBHOOK_VERIFICATION_STATUS } = require("./webhookContract");

class FawryProvider extends BaseProviderAdapter {
  constructor() {
    super(PROVIDERS.FAWRY);
  }

  buildRequestDescriptor(command) {
    return super.buildRequestDescriptor(command, "payment_reference_descriptor");
  }

  async verifyWebhook() {
    // Exact Fawry Server Notification V2 verification is NOT VERIFIED in project docs.
    return { status: WEBHOOK_VERIFICATION_STATUS.UNSUPPORTED_VERIFICATION };
  }
}

module.exports = FawryProvider;
