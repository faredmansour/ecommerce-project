const { createGracefulServerShutdown } = require("./gracefulServerShutdown");

function createApiServerLifecycle({
  connectDatabase,
  connectOptionalServices = async () => {},
  workerRuntime,
  requestLifecycle,
  databaseOperationRegistry,
  listen,
  disconnect,
  timeoutMs,
  logger,
  onTimeout,
  setTimeoutImpl,
  clearTimeoutImpl,
}) {
  let server = null;
  let stopping = false;
  let startupPromise = null;
  let shutdownPromise = null;

  const shutdownServer = createGracefulServerShutdown({
    getServer: () => server,
    workerRuntime,
    requestLifecycle,
    databaseOperationRegistry,
    getStartupOperation: () => startupPromise || Promise.resolve(),
    disconnect,
    timeoutMs,
    logger,
    onTimeout,
    setTimeoutImpl,
    clearTimeoutImpl,
  });

  function start() {
    if (startupPromise) return startupPromise;
    if (stopping) return Promise.resolve(false);

    const startupOperation = async () => {
      await connectDatabase();
      if (stopping) return false;

      await connectOptionalServices();
      if (stopping) return false;

      await workerRuntime.start();
      if (stopping) return false;

      server = listen();
      return true;
    };
    startupPromise = databaseOperationRegistry
      ? databaseOperationRegistry.run("startup", startupOperation)
      : startupOperation();

    return startupPromise;
  }

  function shutdown(signal) {
    if (shutdownPromise) return shutdownPromise;
    stopping = true;
    databaseOperationRegistry?.closeAdmission();
    shutdownPromise = shutdownServer(signal);
    return shutdownPromise;
  }

  return {
    start,
    shutdown,
    handleSignal: shutdown,
    getStatus() {
      return {
        stopping,
        startupActive: Boolean(startupPromise) && !server && !stopping,
        serverListening: Boolean(server?.listening),
      };
    },
  };
}

function registerShutdownSignalHandlers(processLike, lifecycle, onError) {
  const handleSignal = (signal) => {
    return lifecycle.handleSignal(signal).catch(onError);
  };
  processLike.on("SIGTERM", () => handleSignal("SIGTERM"));
  processLike.on("SIGINT", () => handleSignal("SIGINT"));
  return handleSignal;
}

module.exports = { createApiServerLifecycle, registerShutdownSignalHandlers };
