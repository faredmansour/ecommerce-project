const EventEmitter = require("events");
const { createApiServerLifecycle, registerShutdownSignalHandlers } = require("../services/apiServerLifecycle");
const { createDatabaseOperationRegistry } = require("../services/databaseOperationRegistry");
const { createHttpRequestLifecycle } = require("../services/httpRequestLifecycle");
const { PaymentWebhookWorkerRuntime } = require("../services/paymentWebhookWorkerRuntime");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function createResponse() {
  const response = new EventEmitter();
  response.writableFinished = false;
  response.status = jest.fn(() => response);
  response.json = jest.fn(() => response);
  return response;
}

function createHarness(overrides = {}) {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const databaseOperationRegistry = overrides.databaseOperationRegistry ||
    createDatabaseOperationRegistry({ logger });
  const requestLifecycle = overrides.requestLifecycle ||
    createHttpRequestLifecycle({ operationRegistry: databaseOperationRegistry });
  const server = {
    listening: true,
    close: jest.fn((callback) => {
      server.listening = false;
      callback();
    }),
    closeAllConnections: jest.fn(),
  };
  const workerRuntime = {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue({ timedOut: false, unfinishedCount: 0 }),
    waitForIdle: jest.fn().mockResolvedValue(undefined),
    getStatus: jest.fn().mockReturnValue({ activeEventCount: 0, recoveryActive: false }),
  };
  const disconnect = jest.fn().mockResolvedValue(undefined);
  const listen = jest.fn(() => server);
  const lifecycle = createApiServerLifecycle({
    connectDatabase: overrides.connectDatabase || jest.fn().mockResolvedValue(undefined),
    connectOptionalServices: overrides.connectOptionalServices || jest.fn().mockResolvedValue(undefined),
    workerRuntime: overrides.workerRuntime || workerRuntime,
    requestLifecycle,
    databaseOperationRegistry,
    listen,
    disconnect,
    timeoutMs: 5000,
    logger,
    onTimeout: overrides.onTimeout,
    setTimeoutImpl: overrides.setTimeoutImpl,
    clearTimeoutImpl: overrides.clearTimeoutImpl,
  });
  return {
    lifecycle,
    requestLifecycle,
    databaseOperationRegistry,
    workerRuntime: overrides.workerRuntime || workerRuntime,
    disconnect,
    listen,
    server,
    logger,
  };
}

describe("API server lifecycle", () => {
  it("waits for an existing HTTP handler before MongoDB disconnect", async () => {
    const harness = createHarness();
    await harness.lifecycle.start();
    const response = createResponse();
    harness.requestLifecycle.middleware({}, response, jest.fn());

    const stopping = harness.lifecycle.shutdown("SIGTERM");
    await Promise.resolve();
    expect(harness.disconnect).not.toHaveBeenCalled();

    response.writableFinished = true;
    response.emit("finish");
    await expect(stopping).resolves.toMatchObject({
      httpRequestsDrained: true,
      workerDrainCompleted: true,
      startupSettled: true,
      mongoDisconnected: true,
    });
    expect(harness.disconnect).toHaveBeenCalledTimes(1);
  });

  it("waits for both active HTTP handlers and worker operations", async () => {
    const workerDrain = deferred();
    const workerRuntime = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue({ timedOut: false, unfinishedCount: 0 }),
      waitForIdle: jest.fn(() => workerDrain.promise),
      getStatus: jest.fn().mockReturnValue({ activeEventCount: 1, recoveryActive: false }),
    };
    const harness = createHarness({ workerRuntime });
    await harness.lifecycle.start();
    const response = createResponse();
    harness.requestLifecycle.middleware({}, response, jest.fn());

    const stopping = harness.lifecycle.shutdown("SIGTERM");
    response.writableFinished = true;
    response.emit("finish");
    await Promise.resolve();
    expect(harness.disconnect).not.toHaveBeenCalled();

    workerDrain.resolve();
    await expect(stopping).resolves.toMatchObject({
      httpRequestsDrained: true,
      workerDrainCompleted: true,
      mongoDisconnected: true,
    });
    expect(harness.disconnect).toHaveBeenCalledTimes(1);
  });

  it("does not disconnect while an HTTP request remains unsettled after timeout", async () => {
    let fireDeadline;
    const deadlineReached = deferred();
    const harness = createHarness({
      onTimeout: deadlineReached.resolve,
      setTimeoutImpl: (callback) => {
        fireDeadline = callback;
        return "shutdown-deadline";
      },
      clearTimeoutImpl: jest.fn(),
    });
    const forceCloseRequested = deferred();
    harness.server.closeAllConnections.mockImplementation(forceCloseRequested.resolve);
    await harness.lifecycle.start();
    const response = createResponse();
    harness.requestLifecycle.middleware({}, response, jest.fn());

    const stopping = harness.lifecycle.shutdown("SIGTERM");
    fireDeadline();
    await deadlineReached.promise;
    await forceCloseRequested.promise;
    expect(harness.server.closeAllConnections).toHaveBeenCalledTimes(1);
    expect(harness.disconnect).not.toHaveBeenCalled();

    response.writableFinished = true;
    response.emit("finish");
    await expect(stopping).resolves.toMatchObject({
      timedOut: true,
      httpRequestsDrained: true,
      mongoDisconnected: true,
    });
  });

  it("registers early signal handlers and waits for an in-progress MongoDB connection", async () => {
    const databaseConnection = deferred();
    let markConnecting;
    const connectionStarted = new Promise((resolve) => { markConnecting = resolve; });
    const connectDatabase = jest.fn(() => {
      markConnecting();
      return databaseConnection.promise;
    });
    const harness = createHarness({ connectDatabase });
    const signals = new EventEmitter();
    const onError = jest.fn();
    registerShutdownSignalHandlers(signals, harness.lifecycle, onError);
    const startup = harness.lifecycle.start();
    await connectionStarted;

    signals.emit("SIGTERM");
    const stopping = harness.lifecycle.handleSignal("SIGTERM");
    expect(harness.workerRuntime.start).not.toHaveBeenCalled();
    expect(harness.listen).not.toHaveBeenCalled();
    expect(harness.disconnect).not.toHaveBeenCalled();

    databaseConnection.resolve();
    await expect(startup).resolves.toBe(false);
    await expect(stopping).resolves.toMatchObject({
      startupSettled: true,
      mongoDisconnected: true,
    });
    expect(harness.workerRuntime.start).not.toHaveBeenCalled();
    expect(harness.listen).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not start the HTTP listener when shutdown begins during startup recovery", async () => {
    const workerRecovery = deferred();
    let markRecoveryStarted;
    const recoveryStarted = new Promise((resolve) => { markRecoveryStarted = resolve; });
    const workerRuntime = {
      start: jest.fn(() => {
        markRecoveryStarted();
        return workerRecovery.promise;
      }),
      stop: jest.fn().mockResolvedValue({ timedOut: false, unfinishedCount: 0 }),
      waitForIdle: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockReturnValue({ activeEventCount: 0, recoveryActive: true }),
    };
    const harness = createHarness({ workerRuntime });
    const startup = harness.lifecycle.start();
    await recoveryStarted;

    const stopping = harness.lifecycle.handleSignal("SIGTERM");
    workerRecovery.resolve();
    await expect(startup).resolves.toBe(false);
    await expect(stopping).resolves.toMatchObject({
      startupSettled: true,
      mongoDisconnected: true,
    });
    expect(harness.listen).not.toHaveBeenCalled();
  });

  it("reuses one shutdown promise for repeated SIGTERM and SIGINT", async () => {
    const harness = createHarness();
    await harness.lifecycle.start();
    const term = harness.lifecycle.handleSignal("SIGTERM");
    const interrupt = harness.lifecycle.handleSignal("SIGINT");

    expect(term).toBe(interrupt);
    await Promise.all([term, interrupt]);
    expect(harness.workerRuntime.stop).toHaveBeenCalledTimes(1);
    expect(harness.disconnect).toHaveBeenCalledTimes(1);
  });

  it("keeps background database work tracked after its HTTP response finishes", async () => {
    const backgroundWork = deferred();
    const harness = createHarness();
    await harness.lifecycle.start();
    const response = createResponse();
    harness.requestLifecycle.middleware({}, response, () => {
      harness.databaseOperationRegistry.run("background_notification", () => backgroundWork.promise);
    });

    response.writableFinished = true;
    response.emit("finish");
    expect(harness.requestLifecycle.getStatus().activeRequestCount).toBe(0);
    expect(harness.databaseOperationRegistry.getStatus().activeOperations)
      .toEqual([expect.objectContaining({ operationType: "background_notification" })]);

    const stopping = harness.lifecycle.shutdown("SIGTERM");
    let admissionError;
    try {
      harness.databaseOperationRegistry.run("background_notification", async () => {});
    } catch (error) {
      admissionError = error;
    }
    expect(admissionError).toMatchObject({ code: "DATABASE_OPERATION_ADMISSION_CLOSED" });
    await Promise.resolve();
    expect(harness.disconnect).not.toHaveBeenCalled();

    backgroundWork.resolve();
    await expect(stopping).resolves.toMatchObject({ mongoDisconnected: true });
    expect(harness.disconnect).toHaveBeenCalledTimes(1);
  });

  it("drains HTTP, startup, worker, and detached work through one registry", async () => {
    const databaseOperationRegistry = createDatabaseOperationRegistry();
    const workerWork = deferred();
    const detachedWork = deferred();
    const worker = {
      recover: jest.fn().mockResolvedValue([]),
      process: jest.fn(() => workerWork.promise),
    };
    const workerRuntime = new PaymentWebhookWorkerRuntime({
      worker,
      operationRegistry: databaseOperationRegistry,
      setIntervalImpl: () => ({ unref: jest.fn() }),
      clearIntervalImpl: jest.fn(),
    });
    const harness = createHarness({ databaseOperationRegistry, workerRuntime });
    await harness.lifecycle.start();
    expect(databaseOperationRegistry.getStatus().activeOperationCount).toBe(0);

    workerRuntime.notify("event-42");
    const response = createResponse();
    harness.requestLifecycle.middleware({}, response, jest.fn());
    databaseOperationRegistry.run("background_notification", () => detachedWork.promise);

    const stopping = harness.lifecycle.shutdown("SIGTERM");
    response.writableFinished = true;
    response.emit("finish");
    await Promise.resolve();
    expect(harness.disconnect).not.toHaveBeenCalled();

    workerWork.resolve();
    detachedWork.resolve();
    await expect(stopping).resolves.toMatchObject({
      httpRequestsDrained: true,
      workerDrainCompleted: true,
      startupSettled: true,
      mongoDisconnected: true,
    });
    expect(harness.disconnect).toHaveBeenCalledTimes(1);
  });

  it("allows an active webhook operation to finish nested payment work after shutdown begins", async () => {
    const processing = deferred();
    const paymentWork = deferred();
    const paymentStarted = deferred();
    const registry = createDatabaseOperationRegistry();
    const worker = {
      recover: jest.fn().mockResolvedValue([]),
      process: jest.fn(async () => {
        await processing.promise;
        return registry.run("payment_ledger_transaction", () => {
          paymentStarted.resolve();
          return paymentWork.promise;
        });
      }),
    };
    const workerRuntime = new PaymentWebhookWorkerRuntime({
      worker,
      operationRegistry: registry,
      setIntervalImpl: () => ({ unref: jest.fn() }),
      clearIntervalImpl: jest.fn(),
    });
    const harness = createHarness({ databaseOperationRegistry: registry, workerRuntime });
    await harness.lifecycle.start();
    workerRuntime.notify("webhook-payment");
    const stopping = harness.lifecycle.shutdown("SIGTERM");

    processing.resolve();
    await paymentStarted.promise;
    expect(registry.getStatus().activeOperations.map(({ operationType }) => operationType))
      .toContain("payment_ledger_transaction");
    expect(harness.disconnect).not.toHaveBeenCalled();

    paymentWork.resolve();
    await expect(stopping).resolves.toMatchObject({ mongoDisconnected: true });
    expect(harness.disconnect).toHaveBeenCalledTimes(1);
  });

  it("reports active work at the deadline without cancelling it, then disconnects after settlement", async () => {
    let fireDeadline;
    const deadlineReported = deferred();
    const operation = deferred();
    const harness = createHarness({
      onTimeout: deadlineReported.resolve,
      setTimeoutImpl: (callback) => {
        fireDeadline = callback;
        return "shutdown-deadline";
      },
    });
    await harness.lifecycle.start();
    harness.databaseOperationRegistry.run("payment_database_operation", () => operation.promise);

    const stopping = harness.lifecycle.shutdown("SIGTERM");
    fireDeadline();
    await deadlineReported.promise;
    await Promise.resolve();
    expect(harness.disconnect).not.toHaveBeenCalled();
    expect(harness.databaseOperationRegistry.getStatus().activeOperations)
      .toEqual([expect.objectContaining({ operationType: "payment_database_operation" })]);
    expect(harness.logger.warn.mock.calls.some(([line]) => (
      line.includes('"event":"server.shutdown_deadline_exceeded"') &&
      line.includes('"operationType":"payment_database_operation"')
    ))).toBe(true);

    operation.resolve();
    await expect(stopping).resolves.toMatchObject({
      timedOut: true,
      mongoDisconnected: true,
    });
    expect(harness.databaseOperationRegistry.getStatus().activeOperationCount).toBe(0);
    expect(harness.disconnect).toHaveBeenCalledTimes(1);
  });
});
