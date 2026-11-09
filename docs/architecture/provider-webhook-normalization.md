# Provider Webhook Normalization

Status: IMPLEMENTED FOUNDATION / TEST-GATED PAYMOB CALLBACK. Step 6 adds raw-body ingress and verified canonicalization; Step 7 persists the canonical event before returning, then processes it from a MongoDB-backed receipt queue with atomic claims, bounded retry, durable dead letters, and transactional Payment/ledger/processed-state application. Kashier remains disabled. Paymob implements the official transaction processed callback HMAC contract (SHA-512, ordered 20-field `obj` concatenation) and only enables verification when the Step 12 TEST gate is on; Fawry remains `UNSUPPORTED_VERIFICATION`. The default provider registry is still disabled. Provider event names and signature formats stay in adapters; Payment Core receives only normalized verified events.

## Target Processing Pipeline

```text
Provider Webhook (raw bytes + selected headers)
      ↓
Provider allowlist / disabled registry check
      ↓
Adapter verifyWebhook → explicit VERIFIED result
      ↓
Adapter normalizeWebhookEvent → strict canonical event
      ↓
Payment + owned Order snapshot + reference/amount/currency validation
      ↓
Unique receipt + Payment state + append-only ledger in one transaction
```

Never let webhook controllers set `Payment.status` directly. Validate signature, account/environment, provider payment/transaction reference, internal Payment and Order references, exact amount/currency, and legal transition. An unmatched, unknown, mismatched, expired, or out-of-order event is persisted/quarantined and reconciled; it is never treated as paid because the provider used a success-like event name.

## Normalized Event Contract (IMPLEMENTED FOUNDATION)

An adapter must produce a normalized event envelope only after returning explicit `VERIFIED`. Current providers are disabled, so production ingress does not produce events. The safe canonical envelope is persisted as the receipt's executable work item and accepts only:

- provider identifier, provider event ID, provider payment reference;
- internal Payment reference resolved by the provider adapter;
- canonical event type and one currently supported Payment state (`pending`, `requires_action`, `authorized`, `captured`, `failed`, `cancelled`);
- positive integer `amountMinor`, explicit supported ISO currency, and optional verified occurrence time.

Ingress calculates SHA-256 over the exact raw bytes. It stores only the hash, canonical event type, provider event identity, internal Payment ID, and verification/processing status; raw payload, signatures, credentials, and arbitrary provider metadata are not persisted. Refund/dispute/unknown lifecycle values are rejected or deferred.

Canonical `Payment.status` can change only through the Payment state machine and supported statuses. Refunds/disputes and their ledger transitions remain deferred; an adapter must not invent them to force-fit a provider status.

## Provider Status Mapping

### Paymob TEST callback verification and correlation

The supported request is Paymob's POST `{type: "TRANSACTION", obj}` callback with `hmac` in the query string. It signs the 20 documented values in order: `amount_cents`, `created_at`, `currency`, `error_occured`, `has_parent_transaction`, `id`, `integration_id`, `is_3d_secure`, `is_auth`, `is_capture`, `is_refunded`, `is_standalone_payment`, `is_voided`, `order.id`, `owner`, `pending`, `source_data.pan`, `source_data.sub_type`, `source_data.type`, `success`. Values are concatenated without separators; booleans are lowercase; SHA-512 output is lowercase hex and checked timing-safely. Missing/null fields are rejected because Paymob does not specify null serialization. Only initial card pending, failed, or captured outcomes are accepted. `obj.order.id` resolves only through a stored `SESSION_CREATED` execution attempt; the attempt's internal Payment ID and Paymob intention ID become canonical references. The existing PaymentService then verifies Payment/Order/customer binding and exact integer amount/currency before transactional state and ledger changes. See [payment-provider-contracts.md](payment-provider-contracts.md#phase-10-step-13--paymob-test-transaction-callback).

```text
provider payload/status
      ↓ provider-specific adapter
signature/account/reference/amount/currency binding
      ↓ normalized event
canonical Payment state machine
      ↓ valid transition only
append-only Payment ledger
```

Provider-specific statuses remain in the adapter/event evidence, not Order, Checkout, or core Payment business rules. Map only documented states. Unsupported values map to `unknown` and trigger a status query/reconciliation; they do not map to success or failure by default.

Examples to guide future mapping (not implemented):

| Provider evidence | Candidate normalized meaning | Required guard |
|---|---|---|
| Paymob transaction callback `success=true`, `pending=false` | captured/authorized depending on transaction flags | Verify HMAC, integration/account, `obj.id`, exact amount/currency, and auth/capture flags |
| Paymob `pending=true` or callback for action not final | pending | Do not fulfill or mark captured |
| Kashier webhook event `pay` with `data.status=SUCCESS` | captured or authorized by operation/detail | Event name alone is not success; verify signature and inspect `data.status`/operation |
| Kashier `PENDING` | pending | Continue status reconciliation; do not create another provider order |
| FawryPay `orderStatus=PAID` or notification | captured/collected candidate | Verify exact Server Notification V2 signature contract and match reference, amount, currency; polling/result page alone is not authority |
| Any provider timeout, malformed event, mismatch, or undocumented status | unknown | Preserve receipt and reconcile; no automatic provider switch |

## Provider Signature and Delivery Evidence

**Paymob — VERIFIED at provider documentation level**: transaction callbacks are server-to-server and official integration documentation requires HMAC verification. Paymob's official agent guidance specifies SHA-512, exact documented field ordering, `body.obj` sourcing, fail-closed comparison, and unique-constraint-backed event idempotency. There are multiple callback types; implement only the applicable official callback contract, independently verify field order/encoding from its current page, and use timing-safe comparison. Do not copy card-token or payout callback rules onto transaction callbacks.

**Kashier — VERIFIED at provider documentation level**: transaction webhooks use `x-kashier-signature`, HMAC-SHA256, `data.signatureKeys`, and the Payment API Key associated with that payment mode. The exact canonicalization URL-encodes values, not the full key/value pair string. Kashier says check `data.status` (`SUCCESS`, `FAILURE`, `PENDING`), acknowledges `200` and `409`, retries unacknowledged events, and expects duplicate-safe processing. Verify keys/account/mode and current retry contract at implementation time.

**FawryPay — NOT VERIFIED for exact Server Notification V2 contract in this audit**: official API docs describe signed charge requests and a response signature as SHA-256 concatenation with `secureKey`, and reference Server Notification V2 callbacks. Those request/response signing instructions are not enough to establish the exact notification authentication and replay contract. Obtain the current V2 notification specification and test vectors from Fawry before treating callback data as authoritative. Keep that distinction explicit; do not label it “HMAC” without evidence.

## Deduplication and Deferred Reliability Work

- IMPLEMENTED: persist a provider-scoped event receipt with a unique provider event ID and payload hash before HTTP acknowledgment. Same ID/same hash is idempotent; same ID/different hash conflicts without Payment/ledger mutation. Multi-account scoping remains deferred; current registry models one provider scope.
- Deduplicate financial effects by provider event identity and operation key, not merely by HTTP delivery. Provider event ID, transaction ID, merchant reference, and internal Payment ID are different identities.
- Enforce signed timestamp/replay limits where provider provides them. If no timestamp mechanism exists, use provider event IDs, payment reference binding, and operation idempotency; do not fabricate timestamp semantics.
- IMPLEMENTED: receipt ingestion is separate from processing. The MongoDB receipt collection is the durable queue; `PaymentWebhookWorker` claims with atomic conditional update and lease, and `recover()` discovers received, due retryable, and stale processing records. The Payment transaction renews/locks the receipt inside the transaction, while claim tokens fence stale workers after a reclaim.
- IMPLEMENTED: Payment state transition, append-only ledger entry, and receipt `PROCESSED` state commit atomically. A rollback leaves the claimed event retryable; a post-commit crash sees `PROCESSED` and cannot duplicate the ledger transition.
- IMPLEMENTED: retry classification, bounded exponential backoff (1 second base, 15 minute cap), five attempts, durable dead-letter state, and internal verified-receipt reprocessing contract.
- IMPLEMENTED: the API process starts one `PaymentWebhookWorkerRuntime` after MongoDB connects. It performs startup recovery, signals newly persisted receipts for immediate background processing, and periodically recovers eligible records. Recovery failures are exposed as `recovery_degraded`; periodic recovery continues and a successful recovery restores `running`.
- IMPLEMENTED: each API process runs one runtime; multiple API instances are supported because all instances use MongoDB atomic event claims and claim leases. Recovery may run concurrently across instances, but a given receipt can be claimed by only one current claim token. Recovery is at-least-once; transactional state/ledger writes and event idempotency protect committed effects.
- OPERATIONS: the existing Render web service and backend container both start `node server.js`; no separately deployed worker or broker is configured. Scale the API service as required by the hosting platform; there is no application-defined instance limit. `/health` reports runtime state, active local event count, and the last recovery result without credentials or customer details. It returns HTTP 503 with `status: degraded` unless MongoDB is connected and the worker is `running`.
- OPERATIONS: `PAYMENT_WEBHOOK_SHUTDOWN_TIMEOUT_MS` defaults to 10000 milliseconds and is set to the same value by the checked-in Render and Docker Compose configurations. SIGTERM/SIGINT share one shutdown promise: HTTP intake is closed first, the worker stops scheduling and starting work, then active work is drained up to the deadline before MongoDB disconnects. At deadline, open HTTP connections are closed and unfinished worker operations are reported as unfinished; their durable receipt remains recoverable after the existing claim lease expires. Repeated signals reuse the same shutdown promise.
- OPERATIONS: the timeout is an application deadline, not proof it fits the hosting platform's termination grace period. Verify that Render's configured grace period exceeds the application timeout before production rollout.
- OPERATIONS: investigate `DEAD_LETTER` records through restricted operational database access and reconcile provider evidence before any authorized internal reprocessing. No operator route or production DLQ console is currently configured; do not reprocess ambiguous financial outcomes automatically.
- DEFERRED: managed broker, operator authentication/audit route, alerting, and production DLQ tooling. No in-memory queue is used or claimed as durable.
- No provider callback may directly mutate Order, Inventory, Pricing, or Fulfillment. Send idempotent commands through their owning domain services.

## Security Requirements

- Preserve raw request bytes if the provider signs the raw body; never verify a parsed-and-reserialized JSON object unless the provider's official scheme explicitly signs canonical fields instead.
- Secrets remain server-side, are stored in approved secret management, rotated, and never logged. Logs use allowlisted IDs, status classes, correlation IDs, and redacted error codes only.
- Enforce payload-size/content-type limits, route-specific rate/velocity protection, TLS, provider source/account binding where supported, and strict schema validation.
- Never persist PAN/CVV, wallet PIN/OTP, raw payment credentials, full client secrets, or unredacted provider payloads containing such values.

## Phase 10 Step 11: environment-scoped secret resolution

Kashier keeps its existing SHA-256 HMAC over the URL-encoded values named by `data.signatureKeys`, with `x-kashier-signature`, raw request bytes, format validation, and timing-safe comparison. The HMAC key is resolved only from `KASHIER_TEST_API_KEY` or `KASHIER_LIVE_API_KEY` under trusted `KASHIER_ENVIRONMENT`; matching `..._API_KEY_VERSION` metadata identifies the active key. No webhook field may select an environment or version. The unscoped `KASHIER_API_KEY` is not a fallback.

Rotation metadata can name a previous version, its operator-supplied validity deadline, and revoked versions, but contains no key values. Because reviewed Kashier documentation does not establish overlapping-key acceptance, only the active key is tried. Previous versions are never accepted, even before their metadata deadline; expired and revoked versions are rejected. Operations must coordinate replacement and deployment without relying on an application-defined grace period. The resolver does not cache secrets. Fawry continues to return `UNSUPPORTED_VERIFICATION`; Paymob uses its separate TEST-only HMAC secret.

Phase 10 Step 12 preserves Paymob's `UNSUPPORTED_VERIFICATION` status. The TEST checkout URL/return path is customer experience only and cannot confirm a Payment or create ledger entries; Paymob callback ingestion remains blocked until its exact signature contract is implemented and verified.
