class PaymentProvider {
  async createPayment() {
    throw new Error("PaymentProvider.createPayment must be implemented by an adapter.");
  }

  async authorize() {
    throw new Error("PaymentProvider.authorize must be implemented by an adapter.");
  }

  async capture() {
    throw new Error("PaymentProvider.capture must be implemented by an adapter.");
  }

  async cancel() {
    throw new Error("PaymentProvider.cancel must be implemented by an adapter.");
  }

  async refund() {
    throw new Error("PaymentProvider.refund must be implemented by an adapter.");
  }

  async getPayment() {
    throw new Error("PaymentProvider.getPayment must be implemented by an adapter.");
  }

  async verifyWebhook() {
    throw new Error("PaymentProvider.verifyWebhook must be implemented by an adapter.");
  }

  async normalizeWebhookEvent() {
    throw new Error("PaymentProvider.normalizeWebhookEvent must be implemented by an adapter.");
  }
}

module.exports = PaymentProvider;
