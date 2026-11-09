const { PaymentWebhookQueue } = require("../services/paymentWebhookQueue");
const { PaymentWebhookWorkerRuntime } = require("../services/paymentWebhookWorkerRuntime");
const { createGracefulServerShutdown } = require("../services/gracefulServerShutdown");

function createIntervalHarness() {
  const callbacks = [];
  const clearIntervalImpl = jest.fn();
  const setIntervalImpl = jest.fn((callback) => {
    callbacks.push(callback);
    return { unref: jest.fn() };
  });
  return { callbacks, clearIntervalImpl, setIntervalImpl };
}

describe("Payment webhook worker runtime", () => {
  it("recovers durable work on startup and periodically", async () => {
    const worker = { recover: jest.fn().mockResolvedValue([]), process: jest.fn() };
    const intervals = createIntervalHarness();
    const runtime = new PaymentWebhookWorkerRuntime({
      worker,
      recoveryIntervalMs: 10,
      setIntervalImpl: intervals.setIntervalImpl,
      clearIntervalImpl: intervals.clearIntervalImpl,
    });

    await runtime.start();
    expect(worker.recover).toHaveBeenCalledTimes(1);
    expect(intervals.setIntervalImpl).toHaveBeenCalledWith(expect.any(Function), 10);

    intervals.callbacks[0]();
    await Promise.resolve();
    await Promise.resolve();
    expect(worker.recover).toHaveBeenCalledTimes(2);
    await runtime.stop();
  });

  it("processes a newly received event without blocking the enqueue path", async () => {
    const worker = { recover: jest.fn().mockResolvedValue([]), process: jest.fn().mockResolvedValue({ status: "PROCESSED" }) };
    const runtime = new PaymentWebhookWorkerRuntime({ worker });
    await runtime.start();

    expect(runtime.notify("event-1")).toBe(true);
    expect(worker.process).not.toHaveBeenCalled();
    await runtime.stop();
    expect(worker.process).toHaveBeenCalledWith("event-1");
  });

  it("prevents overlapping recovery executions", async () => {
    let resolveRecovery;
    const worker = {
      recover: jest.fn(() => new Promise((resolve) => { resolveRecovery = resolve; })),
      process: jest.fn(),
    };
    const intervals = createIntervalHarness();
    const runtime = new PaymentWebhookWorkerRuntime({
      worker,
      setIntervalImpl: intervals.setIntervalImpl,
      clearIntervalImpl: intervals.clearIntervalImpl,
    });

    const starting = runtime.start();
    const overlapping = runtime.recover();
    expect(worker.recover).toHaveBeenCalledTimes(1);
    expect(runtime.getStatus().state).toBe("starting");
    resolveRecovery([]);
    await Promise.all([starting, overlapping]);
    await runtime.stop();
  });

  it("reports startup recovery failure as degraded and recovers on a later successful cycle", async () => {
    const worker = {
      recover: jest.fn()
        .mockRejectedValueOnce(Object.assign(new Error("internal"), { code: "RECOVERY_UNAVAILABLE" }))
        .mockResolvedValueOnce([]),
      process: jest.fn(),
    };
    const intervals = createIntervalHarness();
    const runtime = new PaymentWebhookWorkerRuntime({
      worker,
      setIntervalImpl: intervals.setIntervalImpl,
      clearIntervalImpl: intervals.clearIntervalImpl,
    });

    await runtime.start();
    expect(runtime.getStatus()).toMatchObject({
      state: "recovery_degraded",
      lastRecoveryErrorCode: "RECOVERY_UNAVAILABLE",
    });
    await runtime.recover();
    expect(runtime.getStatus()).toMatchObject({
      state: "running",
      lastRecoveryErrorCode: null,
    });
    await runtime.stop();
  });

  it("waits for active event processing before graceful shutdown completes", async () => {
    let finishProcessing;
    let processingStarted;
    const started = new Promise((resolve) => { processingStarted = resolve; });
    const worker = {
      recover: jest.fn().mockResolvedValue([]),
      process: jest.fn(() => new Promise((resolve) => {
        finishProcessing = resolve;
        processingStarted();
      })),
    };
    const intervals = createIntervalHarness();
    const runtime = new PaymentWebhookWorkerRuntime({
      worker,
      setIntervalImpl: intervals.setIntervalImpl,
      clearIntervalImpl: intervals.clearIntervalImpl,
    });

    await runtime.start();
    runtime.notify("event-2");
    await started;
    let stopped = false;
    const stopping = runtime.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    expect(runtime.getStatus().state).toBe("stopping");
    expect(intervals.clearIntervalImpl).toHaveBeenCalledTimes(1);

    finishProcessing({ status: "PROCESSED" });
    await stopping;
    expect(stopped).toBe(true);
    expect(runtime.getStatus().state).toBe("stopped");
  });

  it("does not schedule new notifications after shutdown", async () => {
    const worker = { recover: jest.fn().mockResolvedValue([]), process: jest.fn() };
    const runtime = new PaymentWebhookWorkerRuntime({ worker });
    await runtime.start();
    await runtime.stop();

    expect(runtime.notify("event-after-stop")).toBe(false);
    expect(worker.process).not.toHaveBeenCalled();
  });

  it("does not start later recovered events after shutdown begins", async () => {
    let finishFirst;
    let markFirstStarted;
    const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
    const processed = [];
    const worker = {
      process: jest.fn(),
      recover: jest.fn(async ({ shouldContinue }) => {
        if (!shouldContinue()) return [];
        const results = [await worker.process("first-event")];
        if (shouldContinue()) results.push(await worker.process("second-event"));
        return results;
      }),
    };
    worker.process = jest.fn((eventId) => {
      processed.push(eventId);
      if (eventId === "first-event") {
        markFirstStarted();
        return new Promise((resolve) => { finishFirst = resolve; });
      }
      return Promise.resolve();
    });
    const runtime = new PaymentWebhookWorkerRuntime({ worker, shutdownTimeoutMs: 100 });
    const starting = runtime.start();
    await firstStarted;
    expect(runtime.notify("new-event")).toBe(false);
    const stopping = runtime.stop();
    finishFirst();
    await Promise.all([starting, stopping]);
    expect(processed).toEqual(["first-event"]);
  });

  it("bounds shutdown and reports unfinished event processing without claiming success", async () => {
    let finishProcessing;
    let fireTimeout;
    const clearTimeoutImpl = jest.fn();
    const worker = {
      recover: jest.fn().mockResolvedValue([]),
      process: jest.fn(() => new Promise((resolve) => { finishProcessing = resolve; })),
    };
    const runtime = new PaymentWebhookWorkerRuntime({
      worker,
      shutdownTimeoutMs: 20,
      setTimeoutImpl: (callback) => {
        fireTimeout = callback;
        return "worker-deadline";
      },
      clearTimeoutImpl,
    });
    await runtime.start();
    runtime.notify("unfinished-event");
    await Promise.resolve();

    const stopping = runtime.stop();
    fireTimeout();
    const result = await stopping;
    expect(result).toEqual({ timedOut: true, unfinishedCount: 1 });
    expect(clearTimeoutImpl).toHaveBeenCalledWith("worker-deadline");
    expect(runtime.getStatus().state).toBe("stopping");
    expect(runtime.notify("event-after-timeout")).toBe(false);

    finishProcessing({ status: "PROCESSED" });
    await runtime.waitForIdle();
    expect(runtime.getStatus().state).toBe("stopped");
  });

  it("uses one shared shutdown promise for repeated termination signals", async () => {
    const server = { close: jest.fn((callback) => callback()), closeAllConnections: jest.fn() };
    const workerRuntime = {
      stop: jest.fn().mockResolvedValue({ timedOut: false, unfinishedCount: 0 }),
      waitForIdle: jest.fn().mockResolvedValue(undefined),
    };
    const disconnect = jest.fn().mockResolvedValue(undefined);
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const clearTimeoutImpl = jest.fn((handle) => clearTimeout(handle));
    const shutdown = createGracefulServerShutdown({
      server,
      workerRuntime,
      disconnect,
      timeoutMs: 100,
      logger,
      clearTimeoutImpl,
    });

    const sigterm = shutdown("SIGTERM");
    const sigint = shutdown("SIGINT");
    expect(sigterm).toBe(sigint);
    await Promise.all([sigterm, sigint]);
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(workerRuntime.stop).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(workerRuntime.waitForIdle).toHaveBeenCalledTimes(1);
    expect(clearTimeoutImpl).toHaveBeenCalledTimes(1);
  });

  it("does not disconnect while timed-out webhook work is still active and waits for HTTP close", async () => {
    let fireTimeout;
    let finishHttpClose;
    let finishWorkerDrain;
    let markWorkerDrainStarted;
    let workerDrained = false;
    const workerDrainStarted = new Promise((resolve) => { markWorkerDrainStarted = resolve; });
    const server = {
      close: jest.fn((callback) => { finishHttpClose = callback; }),
      closeAllConnections: jest.fn(() => finishHttpClose()),
    };
    const workerRuntime = {
      stop: jest.fn().mockResolvedValue({ timedOut: true, unfinishedCount: 1 }),
      waitForIdle: jest.fn(() => new Promise((resolve) => {
        markWorkerDrainStarted();
        finishWorkerDrain = () => {
          workerDrained = true;
          resolve();
        };
      })),
    };
    const disconnect = jest.fn().mockResolvedValue(undefined);
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const onTimeout = jest.fn();
    const shutdown = createGracefulServerShutdown({
      server,
      workerRuntime,
      disconnect,
      timeoutMs: 100,
      logger,
      onTimeout,
      setTimeoutImpl: (callback) => {
        fireTimeout = callback;
        return "deadline";
      },
      clearTimeoutImpl: jest.fn(),
    });

    const stopping = shutdown("SIGTERM");
    fireTimeout();
    await workerDrainStarted;
    expect(server.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(workerRuntime.waitForIdle).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
    expect(workerDrained).toBe(false);

    finishWorkerDrain();
    await expect(stopping).resolves.toMatchObject({
      timedOut: true,
      unfinishedCount: 1,
      httpServerClosed: true,
      httpForceCloseRequested: true,
      workerDrainCompleted: true,
      workerDrainTimedOut: true,
      mongoDisconnected: true,
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining("server.shutdown_completed"));
  });

  it("finishes graceful shutdown only after active work settles", async () => {
    let finishProcessing;
    let processingStarted;
    const started = new Promise((resolve) => { processingStarted = resolve; });
    const worker = {
      recover: jest.fn().mockResolvedValue([]),
      process: jest.fn(() => new Promise((resolve) => {
        finishProcessing = resolve;
        processingStarted();
      })),
    };
    const runtime = new PaymentWebhookWorkerRuntime({ worker });
    await runtime.start();
    runtime.notify("active-event");
    await started;

    const server = { close: jest.fn((callback) => callback()), closeAllConnections: jest.fn() };
    const disconnect = jest.fn().mockResolvedValue(undefined);
    const shutdown = createGracefulServerShutdown({
      server,
      workerRuntime: runtime,
      disconnect,
      timeoutMs: 1000,
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    });

    let completed = false;
    const stopping = shutdown("SIGTERM").then((result) => {
      completed = true;
      return result;
    });
    await Promise.resolve();
    expect(disconnect).not.toHaveBeenCalled();
    expect(completed).toBe(false);

    finishProcessing({ status: "PROCESSED" });
    await expect(stopping).resolves.toMatchObject({
      timedOut: false,
      httpServerClosed: true,
      workerDrainCompleted: true,
      mongoDisconnected: true,
    });
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("routes durable queue notifications to the running worker runtime", async () => {
    const runtime = { notify: jest.fn(), start: jest.fn(), stop: jest.fn(), getStatus: jest.fn() };
    const queue = new PaymentWebhookQueue({
      repository: { findByEventId: jest.fn().mockResolvedValue({ eventId: "event-3", verificationStatus: "VERIFIED" }) },
      runtime,
    });

    await expect(queue.enqueue("event-3")).resolves.toMatchObject({ eventId: "event-3", durable: true });
    expect(runtime.notify).toHaveBeenCalledWith("event-3");
  });
});
