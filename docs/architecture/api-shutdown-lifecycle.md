# API Shutdown Lifecycle

The API owns a single `DatabaseOperationRegistry` for its process lifetime. It is the disconnect barrier for MongoDB-dependent work:

- `http_request` is admitted synchronously by the earliest Express middleware and remains active until the response finishes. A premature socket close does not release it.
- `startup` owns database connection, optional service startup, worker startup, and listener creation as one awaited operation.
- `webhook_recovery` owns startup, scheduled, or explicit recovery work.
- `webhook_event` owns an event notification's processing promise, even after its originating HTTP response finishes.
- Explicit background database operations must use `registry.run(operationType, callback)` before invoking the work. While admission is open, registrations without an active registry scope are independent roots. A registration made within an active operation's `AsyncLocalStorage` scope is its child. After shutdown closes admission, new roots are rejected, but an active parent may still register its legitimate child work. An inactive, settled, or unrelated context cannot bypass admission. Child operations are independently tracked, so a child that outlives its parent remains in the disconnect barrier.

Shutdown closes the registry admission and request admission synchronously, stops worker scheduling, and drains requests, worker work, startup, and the registry before disconnecting MongoDB. Detached work must register before it starts and must not start database activity outside its registered operation. Work that must spawn database-dependent children after shutdown begins must do so while executing within its still-active registered parent operation.

The configured shutdown timeout is one absolute graceful-drain deadline. Expiration requests HTTP connection closure and reports active operation types and elapsed durations. It does not cancel promises. A non-settling database operation remains registered, so MongoDB disconnect remains blocked until that operation settles. The process may therefore remain alive beyond the deadline; no forced process exit is performed.

## Repository deployment evidence

- `render.yaml` configures `PAYMENT_WEBHOOK_SHUTDOWN_TIMEOUT_MS=10000` for the API. This is the application's graceful-drain deadline, not evidence of Render's process-termination grace period.
- `docker-compose.yml` configures the same application deadline and `restart: unless-stopped`; it does not specify `stop_grace_period`.
- `backend/Dockerfile` launches `node server.js` as its container command and does not declare a custom `STOPSIGNAL`.

The repository does not establish how long Render waits after SIGTERM before forcefully terminating the process, nor whether the Compose runtime's stop timeout is sufficient for active work. Before production acceptance, confirm the applicable Render service termination sequence and grace duration for the deployed plan, plus the exact Docker Engine/Compose stop timeout used in deployment. In particular, verify whether and when SIGKILL can occur while a MongoDB transaction or another registered operation remains active.
