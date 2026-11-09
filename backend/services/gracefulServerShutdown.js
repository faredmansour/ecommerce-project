function createGracefulServerShutdown({
  server,
  getServer,
  workerRuntime,
  requestLifecycle,
  databaseOperationRegistry,
  getStartupOperation = () => Promise.resolve(),
  disconnect,
  timeoutMs,
  logger,
  onTimeout = () => {},
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new TypeError("Server shutdown timeout must be a positive integer.");
  }

  let shutdownPromise = null;

  return function shutdown(signal) {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = (async () => {
      const deadlineAt = Date.now() + timeoutMs;
      let timedOut = false;
      let deadlineReported = false;
      let httpForceCloseRequested = false;
      let httpServerClosed = false;
      let httpRequestsDrained = false;
      let workerDrainCompleted = false;
      let workerDrainTimedOut = false;
      let startupSettled = false;
      let unfinishedCount = 0;
      let unfinishedOperations = [];
      let mongoDisconnected = false;
      let shutdownError = null;
      let timeoutHandle;

      const reportDeadline = () => {
        if (deadlineReported) return;
        deadlineReported = true;
        timedOut = true;
        onTimeout();
        const workerStatus = workerRuntime.getStatus?.();
        const requestStatus = requestLifecycle?.getStatus?.();
        const operationStatus = databaseOperationRegistry?.getStatus?.();
        const knownRuntimeWork = Number(workerStatus?.recoveryActive === true) +
          (Number.isSafeInteger(workerStatus?.activeEventCount) ? workerStatus.activeEventCount : 0) +
          (Number.isSafeInteger(requestStatus?.activeRequestCount) ? requestStatus.activeRequestCount : 0);
        unfinishedCount = Math.max(
          knownRuntimeWork,
          Number.isSafeInteger(operationStatus?.activeOperationCount) ? operationStatus.activeOperationCount : 0
        );
        unfinishedOperations = operationStatus?.activeOperations || [];
        logger.warn(JSON.stringify({
          event: "server.shutdown_deadline_exceeded",
          signal,
          unfinishedCount,
          unfinishedOperations,
        }));
      };

      logger.info(JSON.stringify({ event: "server.shutdown_started", signal }));
      requestLifecycle?.stopAccepting();

      const activeServer = getServer ? getServer() : server;
      let serverCloseError = null;
      const serverClosed = new Promise((resolve) => {
        if (!activeServer) {
          httpServerClosed = true;
          resolve();
          return;
        }
        try {
          activeServer.close((error) => {
            serverCloseError = error || null;
            httpServerClosed = !error;
            resolve();
          });
        } catch (error) {
          serverCloseError = error;
          resolve();
        }
      });

      let workerStopped;
      try {
        workerStopped = Promise.resolve(workerRuntime.stop({
          timeoutMs: Math.max(0, deadlineAt - Date.now()),
          deadlineAt,
        }));
      } catch (error) {
        workerStopped = Promise.reject(error);
      }

      let requestDrain;
      try {
        requestDrain = Promise.resolve(requestLifecycle?.waitForIdle());
      } catch (error) {
        requestDrain = Promise.reject(error);
      }

      let startupOperation;
      try {
        startupOperation = Promise.resolve(getStartupOperation());
      } catch (error) {
        startupOperation = Promise.reject(error);
      }

      const deadline = new Promise((resolve) => {
        timeoutHandle = setTimeoutImpl(
          () => {
            reportDeadline();
            resolve({ timedOut: true });
          },
          Math.max(0, deadlineAt - Date.now())
        );
      });

      let workerResult = { timedOut: false, unfinishedCount: 0 };
      try {
        const databaseOperationsDrained = databaseOperationRegistry?.waitForIdle() || Promise.resolve();
        const completion = Promise.allSettled([
          serverClosed,
          workerStopped,
          requestDrain,
          startupOperation,
          databaseOperationsDrained,
        ])
          .then(([, result]) => ({
            timedOut: false,
            workerResult: result.status === "fulfilled" ? result.value : null,
          }));
        const outcome = await Promise.race([completion, deadline]);

        if (outcome?.timedOut || Date.now() >= deadlineAt) {
          reportDeadline();
          if (activeServer) {
            httpForceCloseRequested = true;
            logger.warn(JSON.stringify({ event: "server.http_force_close_requested", signal }));
            activeServer.closeAllConnections?.();
          }
        }

        const settledPhases = await Promise.allSettled([
          serverClosed,
          workerStopped,
          requestDrain,
          startupOperation,
          databaseOperationsDrained,
        ]);
        workerResult = settledPhases[1].status === "fulfilled"
          ? settledPhases[1].value
          : { timedOut: false, unfinishedCount: 0 };
        workerDrainTimedOut = Boolean(workerResult?.timedOut);
        if (Number.isSafeInteger(workerResult?.unfinishedCount)) {
          unfinishedCount = Math.max(unfinishedCount, workerResult.unfinishedCount);
        }
        httpRequestsDrained = settledPhases[2].status === "fulfilled";
        startupSettled = settledPhases[3].status === "fulfilled" || settledPhases[3].status === "rejected";

        const failedPhase = settledPhases.find((phase) => phase.status === "rejected");
        if (failedPhase) shutdownError = failedPhase.reason;
        if (settledPhases[2].status === "rejected") throw settledPhases[2].reason;
        if (workerDrainTimedOut) reportDeadline();

        await serverClosed;
        logger.info(JSON.stringify({
          event: "server.http_closed",
          closed: httpServerClosed,
          forceCloseRequested: httpForceCloseRequested,
        }));
        if (serverCloseError && !shutdownError) shutdownError = serverCloseError;
        if (serverCloseError && activeServer?.listening !== false) throw serverCloseError;

        await (workerRuntime.waitForIdle?.() || Promise.resolve());
        workerDrainCompleted = true;
        await (databaseOperationRegistry?.waitForIdle?.() || Promise.resolve());
        if (Date.now() >= deadlineAt) reportDeadline();

        await disconnect();
        mongoDisconnected = true;
        logger.info(JSON.stringify({ event: "server.mongodb_disconnected" }));
      } catch (error) {
        shutdownError = shutdownError || error;
      } finally {
        clearTimeoutImpl(timeoutHandle);
      }

      if (shutdownError) {
        logger.error(JSON.stringify({
          event: "server.shutdown_failed",
          errorCode: typeof shutdownError.code === "string" && /^[A-Z0-9_]{1,80}$/.test(shutdownError.code)
            ? shutdownError.code
            : "SERVER_SHUTDOWN_FAILED",
          httpServerClosed,
          httpRequestsDrained,
          workerDrainCompleted,
          startupSettled,
          mongoDisconnected,
        }));
        throw shutdownError;
      }

      const result = {
        timedOut,
        unfinishedCount,
        unfinishedOperations,
        httpServerClosed,
        httpForceCloseRequested,
        httpRequestsDrained,
        workerDrainCompleted,
        workerDrainTimedOut,
        startupSettled,
        mongoDisconnected,
      };

      if (timedOut) {
        logger.warn(JSON.stringify({
          event: "server.shutdown_timed_out",
          signal,
          ...result,
        }));
      } else {
        logger.info(JSON.stringify({
          event: "server.shutdown_completed",
          signal,
          ...result,
        }));
      }
      return result;
    })();

    return shutdownPromise;
  };
}

module.exports = { createGracefulServerShutdown };
