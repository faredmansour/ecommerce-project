const { AsyncLocalStorage } = require("async_hooks");

function safeErrorCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]{1,80}$/.test(error.code)
    ? error.code
    : "DATABASE_OPERATION_FAILED";
}

function createDatabaseOperationRegistry({ logger, clock = Date.now } = {}) {
  const context = new AsyncLocalStorage();
  const operations = new Map();
  const idleWaiters = new Set();
  let accepting = true;
  let nextId = 1;
  let rejectedOperationCount = 0;
  let lastOperationError = null;

  function getActiveParent() {
    const parent = context.getStore();
    return parent?.active && operations.get(parent.id) === parent ? parent : null;
  }

  function canStart() {
    return accepting || Boolean(getActiveParent());
  }

  function createRecord(type) {
    if (typeof type !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(type)) {
      throw new TypeError("Database operation type is invalid.");
    }

    const parent = getActiveParent();
    const record = {
      id: nextId++,
      type,
      parentId: parent?.active ? parent.id : null,
      startedAt: clock(),
      active: true,
    };
    operations.set(record.id, record);
    return record;
  }

  function settle(record) {
    if (!record.active) return;
    record.active = false;
    operations.delete(record.id);
    if (operations.size === 0) {
      for (const resolve of idleWaiters) resolve();
      idleWaiters.clear();
    }
  }

  function rejectIfClosed() {
    const error = new Error("Database operation admission is closed.");
    error.code = "DATABASE_OPERATION_ADMISSION_CLOSED";
    throw error;
  }

  function run(type, operation) {
    if (typeof operation !== "function") {
      throw new TypeError("Database operation must be a function.");
    }
    if (!canStart()) rejectIfClosed();

    const record = createRecord(type);
    let result;
    try {
      result = context.run(record, operation);
    } catch (error) {
      result = Promise.reject(error);
    }
    const promise = Promise.resolve(result);
    promise.then(
      () => settle(record),
      (error) => {
        rejectedOperationCount += 1;
        lastOperationError = { type: record.type, errorCode: safeErrorCode(error) };
        settle(record);
        logger?.error?.(JSON.stringify({
          event: "database.operation_failed",
          operationType: record.type,
          errorCode: lastOperationError.errorCode,
          elapsedMs: Math.max(0, clock() - record.startedAt),
        }));
      }
    );
    return promise;
  }

  function tryRun(type, operation) {
    if (!canStart()) return null;
    return run(type, operation);
  }

  function begin(type) {
    if (!canStart()) return null;
    const record = createRecord(type);
    return {
      runInScope(callback) {
        if (typeof callback !== "function") {
          throw new TypeError("Database operation scope requires a function.");
        }
        return context.run(record, callback);
      },
      complete() {
        settle(record);
      },
    };
  }

  function closeAdmission() {
    accepting = false;
  }

  function waitForIdle() {
    if (operations.size === 0) return Promise.resolve();
    return new Promise((resolve) => idleWaiters.add(resolve));
  }

  function getStatus() {
    const now = clock();
    return {
      accepting,
      activeOperationCount: operations.size,
      activeOperations: [...operations.values()].map((record) => ({
        operationType: record.type,
        elapsedMs: Math.max(0, now - record.startedAt),
      })),
      rejectedOperationCount,
      lastOperationError,
    };
  }

  return { run, tryRun, begin, closeAdmission, waitForIdle, getStatus };
}

module.exports = { createDatabaseOperationRegistry };
