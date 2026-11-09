function createHttpRequestLifecycle({ operationRegistry } = {}) {
  let acceptingRequests = true;
  let activeRequests = 0;
  const idleWaiters = new Set();

  function releaseRequest() {
    activeRequests -= 1;
    if (activeRequests === 0) {
      for (const resolve of idleWaiters) resolve();
      idleWaiters.clear();
    }
  }

  function middleware(req, res, next) {
    if (!acceptingRequests) {
      res.status(503).json({
        status: "degraded",
        code: "SERVER_SHUTTING_DOWN",
        message: "The server is shutting down.",
      });
      return;
    }

    const databaseOperation = operationRegistry?.begin("http_request");
    if (operationRegistry && !databaseOperation) {
      res.status(503).json({
        status: "degraded",
        code: "SERVER_SHUTTING_DOWN",
        message: "The server is shutting down.",
      });
      return;
    }

    activeRequests += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      releaseRequest();
      databaseOperation?.complete();
    };

    res.once("finish", release);
    res.once("close", () => {
      if (res.writableFinished) release();
    });

    if (databaseOperation) databaseOperation.runInScope(next);
    else next();
  }

  function stopAccepting() {
    acceptingRequests = false;
  }

  function waitForIdle() {
    if (activeRequests === 0) return Promise.resolve();
    return new Promise((resolve) => idleWaiters.add(resolve));
  }

  function getStatus() {
    return { acceptingRequests, activeRequestCount: activeRequests };
  }

  return { middleware, stopAccepting, waitForIdle, getStatus };
}

module.exports = { createHttpRequestLifecycle };
