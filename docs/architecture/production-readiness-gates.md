# Production Readiness Gates — MongoDB and Paymob

Status: Workstream B diagnostic report, documentation only. Evidence gathered 2026-11-03. No runtime behavior, credentials, or business records were changed. Neither gate passes for production.

## Executive result

| Gate | Result | Evidence summary |
|---|---|---|
| MongoDB production topology and transactions | **CONDITIONAL** | Local development MongoDB is standalone and cannot transact. A disposable one-member in-memory replica-set probe passed commit, rollback, and unique idempotency checks; four existing Payment/Paymob test suites passed. Production topology and transaction support were not supplied or verified. |
| Exact Paymob capture semantics | **FAIL — current adapter is not capture-ready** | The intended adapter is TEST-only EGP card Intention API / Unified Checkout, but the merchant Integration ID and its transaction type are not configured locally. Current code maps signed `success=true` to `captured` without validating the configured `integration_id` or the documented `is_captured`/`captured_amount` fields. Official references do not align on these capture fields and HMAC coverage. No real Sandbox transaction or Merchant Dashboard inspection was available. Keep execution and confirmation fail-closed. |

This report distinguishes architecture capability from observed tests and from production evidence. A successful in-memory replica-set test is not production verification. Mocked Paymob tests are not a Paymob Sandbox transaction.

## Part A — MongoDB

### Configuration and observed topology

- `backend/server.js` loads `./connection/config.env` through dotenv and calls `mongoose.connect(process.env.DB_URL)` without explicit Mongoose connection options. The URI is not reproduced here. The local configuration resolves to database `e-commerce` on loopback and `NODE_ENV=development`; credentials and URI text were not printed.
- `backend/connection/config.env.example` uses a loopback MongoDB URI without `replicaSet` options. `docker-compose.yml` supplies the backend a `host.docker.internal` MongoDB URI and does not declare a MongoDB replica-set service or replica-set configuration. This Compose value is not evidence of a production topology.
- `render.yaml` declares `DB_URL` as `sync: false`; no connected Render environment or production database was inspected. No production URI, cluster export, infrastructure record, or transaction test result was available.
- Read-only `hello` against the configured local development server reported no `setName` and no `msg: isdbgrid`: **standalone**. The server reported MongoDB **8.3.4**. It is writable primary, but that does not make it transaction-capable.
- The installed runtime reports Mongoose **9.7.0** and its nested MongoDB Node driver **7.2.0**. The lockfile also contains a top-level `mongodb@5.9.2`; it is distinct from Mongoose's nested driver. Verify direct-driver usage and dependency intent before relying on a single version label.
- `backend/app.js` `/health` returns HTTP 200 regardless of database readiness and includes a separate `db` state field. Render uses `/health` for its health check. It is not a transaction-capability or database-readiness gate.

### Transaction usage and tests

Current Payment transactions use `mongoose.startSession()` and `session.withTransaction()` in `backend/services/paymentService.js` and `backend/services/paymentReconciliationService.js`. Webhook receipt, Payment transition, ledger append, and processed receipt are committed together by the Payment service. These paths require a transaction-capable topology and are not supported by the observed local standalone server.

A separate controlled probe used a disposable in-memory one-member `MongoMemoryReplSet` database and no application collections or business records. It passed:

1. Transaction start and writes to two collections.
2. Commit visibility in both collections.
3. Intentional abort with both writes rolled back.
4. Unique idempotency-key index retained one durable result.

The existing test setup (`backend/tests/setup.js`) also starts a one-member in-memory replica set. Targeted tests passed: `payment.test.js`, `paymentWebhooks.test.js`, `paymobWebhook.test.js`, and `paymobExecution.test.js` — **4 suites, 53 tests**. These tests establish behavior in a test replica set and use mocks for Paymob interactions. They do not verify production topology, external payment behavior, or Inventory runtime behavior.

The first attempt to launch the in-memory Mongo process inside the restricted process-spawn sandbox failed with `EPERM`. Re-running the same disposable probe and requested tests with process-spawn permission succeeded; no persistent database was used.

### Required Inventory transaction boundary

When Inventory runtime is separately authorized and the deployed Mongo topology has passed verification, one short Inventory-owned transaction should include:

- conditional InventoryItem balance updates for every line, each checking `onHand - reserved - committed >= requested`;
- Reservation creation/state update;
- idempotency command record;
- append-only Inventory ledger entries; and
- outbox event persistence.

The transaction commits all five categories or none. An insufficient line, duplicate-key conflict, or validation failure aborts the whole multi-line reservation. A retry with the same key and same request hash returns the prior result; a different hash conflicts. Transient transaction errors use bounded driver-supported retry/recovery and remain observable. Do not implement independent dual writes to Product stock.

Provider HTTP requests must remain outside MongoDB transactions. Payment, Order, Inventory, and Fulfillment coordination uses short owning-domain transactions plus durable outbox/saga commands, idempotent consumers, and reconciliation. Do not hold a transaction open while waiting on a provider or courier.

### Production evidence required from infrastructure owner

Before transactional Inventory runtime is activated, obtain and review:

1. The production/staging MongoDB deployment type and sanitized topology evidence: replica-set membership and name, or sharded-cluster/mongos configuration; server version and feature compatibility version.
2. A successful transaction-capability probe in a production-equivalent environment using the application's actual MongoDB service identity and network path. The probe must demonstrate multi-document commit and abort/rollback without touching business collections.
3. Connection policy: TLS/authentication mode, read/write concern, retryWrites/transaction retry expectations, server-selection/socket/connect timeouts, pool sizing, transaction lifetime/size limits, and failover behavior.
4. Deployment-owner confirmation that the service connects to the verified cluster in every production region/environment and that backups/restore and failover procedures cover the chosen topology.

**MongoDB gate: CONDITIONAL.** A supported local test topology is proven, but local development is standalone and production evidence is missing. Do not infer production readiness.

## Part B — Paymob

### Integration and configuration found

- `backend/providers/paymobProvider.js` implements the Egypt Intention API at Paymob's `https://accept.paymob.com/v1/intention/`. It permits EGP card commands, supplies one configured numeric Integration ID in `payment_methods`, and builds the Paymob Unified Checkout hosted URL. This identifies the adapter's intended flow, not the merchant's actual Dashboard integration configuration.
- TEST execution requires `PAYMOB_ENVIRONMENT=TEST` and `PAYMOB_TEST_EXECUTION_ENABLED=true`; TEST-scoped keys and Integration ID are required. Paymob LIVE execution is explicitly rejected by `backend/services/providerExecutionService.js`. Webhook verification is likewise limited to explicit TEST opt-in. Default provider registry configuration leaves providers disabled.
- The inspected local environment has no Paymob environment, execution opt-in, TEST or LIVE Integration ID, TEST Secret Key, or TEST HMAC secret configured. The example file documents blank TEST values and disabled execution. No merchant Dashboard was available to identify the exact Integration ID, integration type (purchase versus Auth), profile, enabled methods, or callback wiring.
- Session creation stores the Paymob intention ID as `Payment.providerPaymentId` and `intention_order_id` as the execution attempt's `providerReference`; callback correlation looks up the persisted `SESSION_CREATED` attempt by `obj.order.id`. The intention/session response is `pending`, not capture evidence.

### Official documentation findings

The official [Create Intention API](https://developers.paymob.com/paymob-docs/intention-apis/create-intention) requires an Integration ID whose mode matches the Secret Key and identifies `payment_methods` as the Integration ID(s). The [Transaction callbacks guide](https://developers.paymob.com/paymob-docs/developers/transaction-callbacks) distinguishes server-to-server POST transaction-processed callbacks from browser-facing GET response redirects and says not to use the redirect to update order status.

Paymob's [Auth/Cap guide](https://developers.paymob.com/paymob-docs/payments-and-features/core-features/auth-cap) says authorization reserves funds and capture collects them; the [Capture guide](https://developers.paymob.com/paymob-docs/payments-and-features/managing-payments/capture) states that capture applies to card integrations configured for Auth transaction type. Therefore the exact configured Integration ID's transaction type matters.

The current [Transaction callbacks guide](https://developers.paymob.com/paymob-docs/developers/transaction-callbacks) calls `success` the transaction status, and separately describes `is_captured` as whether the transaction has been captured and `captured_amount` as total captured amount. Paymob's [Transaction Inquiry by ID](https://developers.paymob.com/paymob-docs/developers/transaction-inquiry-apis/by-transaction-id) also exposes `integration_id`, `integration_type`, `is_live`, `is_capture`, `is_captured`, and `captured_amount`. The [transaction inquiry overview](https://developers.paymob.com/paymob-docs/payments-and-features/core-features/transaction-inquiry-and-reports) says callbacks are primary and inquiry is a manual/fallback mechanism.

There is an evidence gap: the maintained [Paymob transaction HMAC reference](https://github.com/PaymobAccept/Paymob-AI-Integration-Skill/blob/main/skills/paymob-integration/references/hmac-verification.md) specifies a 20-field SHA-512 concatenation including `success`, `is_auth`, `is_capture`, and `is_standalone_payment`, but does not include `is_captured` or `captured_amount`. The standard callback page and sample expose those newer capture fields. The official callback example also includes a nested gateway record marked `CAPTURED` while the outer fields show `is_captured: false` and `captured_amount: null`. The available public contract therefore does not establish whether these newer fields are signed or how their example maps to a captured initial-payment callback. Do not guess.

Semantics as documented:

| Field | Documented meaning / limitation |
|---|---|
| `success` | Transaction success boolean; does not on its own specify funds captured. |
| `pending` | Indicates a still-pending transaction; it must not be treated as captured. |
| `is_auth` | Identifies an authorization action; authorization holds funds without transferring them. |
| `is_capture` | Identifies a capture transaction/action; it is not the same named field as `is_captured`. |
| `is_standalone_payment` | Identifies a standalone transaction rather than a parent-linked action. It does not independently state capture amount. |
| `is_captured`, `captured_amount` | Callback/inquiry docs describe captured state and aggregate captured amount; current standard HMAC field list does not cover them. Exact signed-evidence behavior is unresolved. |
| Browser response redirect | GET query parameters for customer messaging; not authoritative payment evidence. |

### Callback implementation review

References below identify current code; no code was modified.

- **Ingress and method:** `backend/routers/paymentWebhookRouter.js` registers POST `/:provider`; `backend/controllers/paymentWebhookController.js` reads `req.query.hmac`. `backend/app.js` retains raw JSON bytes only for webhook ingress and sets a 10 KB JSON body limit.
- **HMAC:** `PaymobProvider.verifyWebhook` in `backend/providers/paymobProvider.js` reads `body.obj`, requires a 128-character lowercase hex query signature, rejects missing/null/nonprimitive signed values, concatenates the documented 20 fields in order, computes HMAC-SHA-512, and compares with `crypto.timingSafeEqual`. This matches the published 20-field reference. It uses the TEST HMAC secret only when TEST execution is explicitly enabled.
- **Capture decision gap:** the verifier's safe payload forwards `success`, `is_auth`, `is_capture`, `is_standalone_payment`, `pending`, and void/refund flags, but drops `is_captured` and `captured_amount`. `normalizeWebhookEvent` maps `pending ? pending : success ? captured : failed`; for captured it rejects authorization, void/refund, or non-standalone events, but does not require documented capture-state/amount evidence. It also does not reject `is_capture === true` as a distinct subsequent action.
- **Integration/mode binding gap:** the HMAC field list validates that `integration_id` is signed as part of the message, but the adapter does not compare its value to the configured `PAYMOB_TEST_INTEGRATION_ID`. It also does not check callback `is_live` against TEST mode. A valid HMAC is not a substitute for binding the callback to the exact configured integration and environment.
- **Redirect separation:** only the POST transaction endpoint is routed; no browser GET callback is used to update Payment. This agrees with Paymob's redirect guidance.
- **Reference and commercial matching:** normalization resolves `obj.order.id` only through a persisted `SESSION_CREATED` attempt. The transactional Payment service verifies Payment/provider references, Order ownership/snapshot, exact amount and currency, state transition, ledger append, and processed receipt.
- **Idempotency and durability:** `PaymentWebhookEvent` has a unique `(provider, providerEventId)` index. Verified receipts are durably inserted before acknowledgment; a worker uses claims/leases/retries and commits Payment/ledger/processed receipt together. Mocked duplicate and retry tests pass; they do not prove Paymob delivery semantics.
- **HMAC null/type edge:** missing or null signed fields fail closed. Primitive values are stringified for HMAC; tests cover adapter behavior, but no merchant payload with real null shape has been validated.
- **Payload/operations:** raw callback bodies are not persisted as webhook event payloads; the normalized safe payload omits card/source data before durable processing. The 10 KB parser cap and 60 requests per IP per 15 minutes webhook rate limit need validation against real callback size and Paymob retry/source-IP behavior before activation.

### Required Paymob operator actions

Before any TEST activation or capture confirmation:

1. Merchant operator supplies the exact TEST Integration ID and confirms in Dashboard its method, currency/region, transaction type (purchase/standalone versus Auth/Cap), profile/account, and callback configuration. Keep all keys and HMAC secrets out of tickets and reports.
2. Paymob confirms in writing which fields prove a captured standalone purchase for this Integration ID, whether `is_captured`/`captured_amount` are covered by the transaction HMAC or another trusted inquiry response, how `is_capture` differs from `is_captured`, and what the published contradictory callback sample represents.
3. Perform a real Paymob Sandbox card transaction using merchant-owned TEST credentials and capture the actual POST notification callback; independently validate HMAC and compare callback data with a Paymob transaction inquiry by transaction/order ID. Confirm exact integration ID, TEST mode, no pending/auth-only state, and full captured amount/currency against the stored Payment/Order snapshot. A redirect or mocked test is insufficient.
4. After separate implementation authorization, make callback normalization fail closed on the verified capture contract, exact Integration ID/environment, full amount, and supported initial-payment action. Add inquiry fallback/reconciliation as required; then rerun the real Sandbox end-to-end test. Do not enable LIVE as part of this workstream.

**Paymob gate: FAIL for current capture confirmation.** The exact merchant Integration ID and mode are unavailable, and the current mapper can treat `success=true` as captured without the newer captured-state/amount fields or exact Integration ID binding. Do not enable TEST execution/webhook confirmation or LIVE payment activation on this evidence. Merchant-specific confirmation is necessary, but may not alone close the code contract gap.

## Required before implementation or production

**Before Inventory runtime implementation:** obtain production-equivalent topology evidence and a transaction probe using the actual service identity; verify transaction limits/retries and failure recovery; then separately authorize Inventory implementation. The approved 15-minute TTL, 10-minute grace, COD, stock, and late-capture policies are recorded in [Order & Inventory Decisions](order-inventory-decisions.md).

**Before production payment activation:** identify and verify the merchant's exact Paymob integration and capture contract; close the HMAC/capture and integration-binding gaps; complete a real Sandbox transaction plus inquiry comparison; confirm production callback URLs, secret/environment scoping, rate/body limits, monitoring, and reconciliation; and obtain explicit production enablement approval. No provider was enabled by this diagnostic.

## Validation record

- Read-only local Mongo `hello` and `buildInfo`; no business data read or changed.
- Disposable in-memory transaction probe: commit, rollback, unique idempotency checks passed.
- Targeted existing tests: 4 suites / 53 tests passed (`payment.test.js`, `paymentWebhooks.test.js`, `paymobWebhook.test.js`, `paymobExecution.test.js`). All Paymob interactions in these tests are mocked; no external Sandbox transaction was run.
- `git diff --check`: passed; existing repository line-ending notices only.
- Local Markdown links and whitespace: validated for the gate report and README.
