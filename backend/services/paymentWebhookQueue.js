const PaymentWebhookEventRepository = require("../repositories/paymentWebhookEventRepository");
const { PaymentWebhookWorkerRuntime } = require("./paymentWebhookWorkerRuntime");

// The receipt collection is authoritative; runtime memory tracks only active
// local work and can be rebuilt by scanning MongoDB.
class PaymentWebhookQueue {
  constructor({ repository = new PaymentWebhookEventRepository(), worker, runtime } = {}) {
    this.repository = repository;
    this.runtime = runtime || new PaymentWebhookWorkerRuntime({
      worker,
    });
  }

  async enqueue(eventId) {
    const event = await this.repository.findByEventId(eventId);
    if (!event || event.verificationStatus !== "VERIFIED") {
      throw new Error("Only a durably stored verified webhook can be enqueued.");
    }
    this.runtime.notify(event.eventId);
    return { eventId: event.eventId, durable: true };
  }

  process(eventId) {
    return this.runtime.runOperation("webhook_event", () => this.runtime.worker.process(eventId));
  }

  recover(options) {
    return this.runtime.recover(options);
  }

  start() {
    return this.runtime.start();
  }

  stop(options) {
    return this.runtime.stop(options);
  }

  getStatus() {
    return this.runtime.getStatus();
  }
}

module.exports = { PaymentWebhookQueue };
