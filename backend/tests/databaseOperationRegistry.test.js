const { createDatabaseOperationRegistry } = require("../services/databaseOperationRegistry");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("Database operation registry", () => {
  it("registers a nested operation before the parent settles and drains both", async () => {
    const registry = createDatabaseOperationRegistry();
    const nestedWork = deferred();
    const parent = registry.run("http_request", async () => {
      registry.run("background_notification", () => nestedWork.promise);
    });

    await parent;
    registry.closeAdmission();
    expect(registry.getStatus().activeOperations.map(({ operationType }) => operationType))
      .toEqual(["background_notification"]);

    let drained = false;
    const drain = registry.waitForIdle().then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);

    nestedWork.resolve();
    await drain;
    expect(registry.getStatus().activeOperationCount).toBe(0);
  });

  it("allows an active parent to register a child after admission closes", async () => {
    const registry = createDatabaseOperationRegistry();
    const continueParent = deferred();
    const childWork = deferred();
    const parent = registry.run("startup", async () => {
      await continueParent.promise;
      return registry.run("webhook_recovery", () => childWork.promise);
    });

    registry.closeAdmission();
    let admissionError;
    try {
      registry.run("background_notification", async () => {});
    } catch (error) {
      admissionError = error;
    }
    expect(admissionError).toMatchObject({ code: "DATABASE_OPERATION_ADMISSION_CLOSED" });

    continueParent.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(registry.getStatus().activeOperations.map(({ operationType }) => operationType))
      .toEqual(["startup", "webhook_recovery"]);

    let drained = false;
    const drain = registry.waitForIdle().then(() => { drained = true; });
    childWork.resolve();
    await parent;
    await drain;
    expect(drained).toBe(true);
    await registry.waitForIdle();
  });

  it("rejects child registration after its parent settles", async () => {
    const registry = createDatabaseOperationRegistry();
    let rejectedChild;
    const parent = registry.run("payment_operation", () => {
      setImmediate(() => {
        try {
          registry.run("ledger_write", async () => {});
        } catch (error) {
          rejectedChild = error;
        }
      });
    });

    await parent;
    registry.closeAdmission();
    await new Promise((resolve) => setImmediate(resolve));

    expect(rejectedChild).toMatchObject({ code: "DATABASE_OPERATION_ADMISSION_CLOSED" });
    expect(registry.getStatus().activeOperationCount).toBe(0);
  });

  it("keeps a child tracked independently when its parent settles first", async () => {
    const registry = createDatabaseOperationRegistry();
    const childWork = deferred();
    const parent = registry.run("http_request", async () => {
      registry.run("background_operation", () => childWork.promise);
    });

    await parent;
    registry.closeAdmission();
    expect(registry.getStatus().activeOperations).toEqual([
      expect.objectContaining({ operationType: "background_operation" }),
    ]);

    const drain = registry.waitForIdle();
    let drained = false;
    drain.then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    childWork.resolve();
    await drain;
    expect(drained).toBe(true);
  });

  it("rejects an unrelated context after admission closes", async () => {
    const registry = createDatabaseOperationRegistry();
    let staleContextResult;
    const parent = registry.run("payment_operation", () => {
      setImmediate(() => {
        try {
          registry.run("stale_child", async () => {});
        } catch (error) {
          staleContextResult = error;
        }
      });
    });
    await parent;
    registry.closeAdmission();

    let unrelatedContextResult;
    try {
      registry.run("unrelated_operation", async () => {});
    } catch (error) {
      unrelatedContextResult = error;
    }
    await new Promise((resolve) => setImmediate(resolve));

    expect(unrelatedContextResult).toMatchObject({ code: "DATABASE_OPERATION_ADMISSION_CLOSED" });
    expect(staleContextResult).toMatchObject({ code: "DATABASE_OPERATION_ADMISSION_CLOSED" });
    expect(registry.getStatus().activeOperationCount).toBe(0);
  });

  it("records rejected operations and releases them from the drain barrier", async () => {
    const logger = { error: jest.fn() };
    const registry = createDatabaseOperationRegistry({ logger });
    const failure = Object.assign(new Error("private detail"), { code: "BACKGROUND_FAILURE" });

    await expect(registry.run("background_notification", async () => {
      throw failure;
    })).rejects.toBe(failure);
    await registry.waitForIdle();

    expect(registry.getStatus()).toMatchObject({
      activeOperationCount: 0,
      rejectedOperationCount: 1,
      lastOperationError: {
        type: "background_notification",
        errorCode: "BACKGROUND_FAILURE",
      },
    });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('"operationType":"background_notification"'));
    expect(logger.error.mock.calls[0][0]).not.toContain("private detail");
  });
});
