# Payment API Contracts — CURRENT vs TARGET

Status: The API retains a deferred Payment-creation route and exposes an authenticated Paymob TEST checkout route that accepts only an Order ID and idempotency key. LIVE execution remains disabled.

## CURRENT runtime API

| Method/path | Auth | Request | Current behavior/response |
| --- | --- | --- | --- |
| `POST /api/payments/intent` | JWT `protect` | `{ orderId }` and `Idempotency-Key`; amount, currency, provider, and all other body fields are rejected | Requires `PAYMOB_ENVIRONMENT=TEST` and `PAYMOB_TEST_EXECUTION_ENABLED=true`. Loads the owned Order snapshot, creates a Paymob Payment, initiates the TEST hosted checkout, and returns a checkout URL with the normalized Payment fields. Provider reference binding and `created -> pending` ledger transition are atomic after successful session creation. Replays do not create another provider session; an already-started Payment returns `409 PAYMENT_ALREADY_PROCESSED`. |
| `POST /api/payments` | JWT `protect` | `{ orderId }` and `Idempotency-Key` | Creates the existing deferred Payment record; it does not initiate a provider operation. |
| `GET /api/payments/:paymentId` | JWT `protect`; owner or current admin | UUIDv4 Payment ID | Owner-scoped repository lookup; returns safe DTO fields only. Foreign-owner and missing IDs return the same `404 PAYMENT_NOT_FOUND`. |

Additional CURRENT facts:

- Routes are mounted at `/api/payments`; customer checkout is TEST-only. There is no customer-facing authorize/capture/cancel/refund route.
- Payment amount and currency come from the owned Order snapshot. Execution results do not set `captured`; capture settlement remains subject to verified provider evidence and merchant-specific Paymob capture semantics.
- The Payment model and safe owner-scoped read route are implemented. No endpoint returns provider IDs, idempotency keys, metadata, or card data.
- The hosted checkout URL is returned as the provider-issued client handoff. Provider API keys, Secret Keys, and auth tokens are never returned.
- `STRIPE_SECRET_KEY` and `VITE_STRIPE_PUBLISHABLE_KEY` remain legacy configuration; no Stripe adapter or Stripe API call is used by the Payment foundation.
- Order checkout remains separate. PaymentService rejects Orders without an eligible server-side commercial snapshot; checkout never accepts client-provided price fields.

## TARGET API Principles

- Payment APIs accept an Order/Payment reference and operation intent, never authoritative `amount`, currency, discount, shipping, tax, or total from the client.
- A customer can create/query only their own eligible payment attempt. Capture/refund/dispute and provider reconciliation require server-side service or granular operator permission.
- A provider webhook uses a separate unauthenticated-by-customer route protected by signature verification, provider account binding, replay defense, and event idempotency.
- Internal payment IDs differ from Mongo `_id` if exposed, Order ID, public Order number, provider PaymentIntent ID, transaction ID, webhook event ID, and idempotency key.
- Every mutating request has idempotency semantics. API version and stable redacted error envelopes are required.

## TARGET endpoints — NOT IMPLEMENTED

Exact route versioning remains subject to API governance. Suggested resource contract:

| Method/path | Actor | Request | Response/behavior |
| --- | --- | --- | --- |
| `POST /api/v1/payments` | Authenticated customer/Checkout; Order owner | `{ orderId, paymentMethodType, returnUrl? }`, `Idempotency-Key`; no amount/currency | Server loads accepted Order and validates due amount, currency, state, owner, and method; persists Payment attempt; returns paymentId, normalized state, provider client action/secret only if required. |
| `GET /api/v1/payments/:paymentId` | Payment owner or authorized admin | None | Owner-scoped safe Payment DTO; never returns secret keys/raw card data. |
| `POST /api/v1/payments/:paymentId/authorize` | Internal Payment/Checkout service; customer only for provider challenge continuation if explicitly needed | Intent/action reference; idempotency key; no client amount | Server validates transition and provider binding; returns normalized state/client next action. |
| `POST /api/v1/payments/:paymentId/capture` | Internal service/operator with permission | Optional capture amount for authorized partial-capture policy; reason/idempotency | Server ensures amount <= authorized remainder and Order policy; provider call occurs outside DB transaction. |
| `POST /api/v1/payments/:paymentId/cancel` | Owner only while eligible, or internal service | reason, idempotency key | Requests provider cancel/void if supported; returns pending/normalized outcome; final state follows provider evidence. |
| `POST /api/v1/payments/:paymentId/refunds` | Internal service/operator; customer may request a refund but not dictate provider state | amountMinor, currency, reason, idempotency key | Validates against captured-minus-refunded balance; returns persisted refund reference/status. Partial/full support depends on verified adapter capability. |
| `POST /api/v1/payments/webhooks/:provider` | Provider callback; no customer JWT required | Raw signed request bytes + provider headers | Verify signature/timestamp/account, dedupe provider event ID, persist receipt, acknowledge quickly, process asynchronously/idempotently. |
| `GET /api/v1/admin/payments` | Admin/payment-ops permission | filters + pagination | Redacted operational read/reconciliation view with audit. |
| `POST /api/v1/admin/payments/:paymentId/reconcile` | Restricted payment-ops role | reason, provider lookup reference, idempotency | Runs controlled reconciliation; never accepts a caller assertion as payment truth. |

## TARGET errors and validation

- `400 INVALID_PAYMENT_ID`, `INVALID_CURRENCY`, `INVALID_METHOD`, `INVALID_AMOUNT_SHAPE` for malformed request fields.
- `401 UNAUTHENTICATED`, `403 PAYMENT_FORBIDDEN`, `404 PAYMENT_NOT_FOUND` for access/resource cases; avoid revealing whether a foreign Payment exists where enumeration risk applies.
- `409 ORDER_NOT_PAYABLE`, `PAYMENT_STATE_CONFLICT`, `IDEMPOTENCY_KEY_REUSED`, `DUPLICATE_PROVIDER_EVENT`, `AMOUNT_CURRENCY_MISMATCH` for conflicts.
- `422 METHOD_UNAVAILABLE`, `ORDER_AMOUNT_UNAVAILABLE`, `REFUND_EXCEEDS_CAPTURED`, `PROVIDER_EVENT_INVALID` for policy/validation failures.
- `429 RATE_LIMITED` for operation-specific velocity thresholds; `503 PROVIDER_UNAVAILABLE` or `PAYMENT_OUTCOME_UNKNOWN` for retry/reconciliation cases.
- Never expose provider credentials, raw payloads, stack traces, PAN/CVV, or internal database diagnostics.

Validation binds payment method/provider to server configuration, verifies Order ownership, snapshot amount/currency, expected Payment transition, idempotency key scope/request hash, and safe return URLs. A response/redirect never sets final Payment state.
