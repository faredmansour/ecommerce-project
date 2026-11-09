# Payment Webhooks — TARGET / NOT IMPLEMENTED

Status: TARGET/DEFERRED security and processing contract. The Payment model/ledger foundation exists, but current runtime exposes no Payment webhook endpoint, signature verifier, queue, or webhook worker.

## Authority and Processing Flow

```text
Provider
  -> provider-specific webhook endpoint (raw body preserved)
  -> signature/account/timestamp verification
  -> bounded schema and event-type validation
  -> durable event receipt + provider-event idempotency check
  -> fast 2xx acknowledgement
  -> queue/outbox worker
  -> Payment state transition + append-only ledger
  -> Order/Inventory events through owning services
  -> reconciliation if state is unknown/inconsistent
```

A webhook is authoritative only after successful cryptographic verification and binding to the expected provider account, Payment, Order, amount, and currency. A provider-signed event is evidence; the Payment service validates whether the event is legal for the current state. Frontend return URLs/redirects and client SDK results are never webhook substitutes.

## Verification Requirements

- Preserve exact raw request bytes for provider signature verification; do not JSON-parse/reserialize before computing/verifying the signature.
- Use the provider's documented signature algorithm/key rotation mechanism (HMAC or other signed scheme), constant-time comparison where applicable, correct endpoint secret, and account/environment binding.
- Validate signed timestamp and an allowed clock-skew/replay window where the provider provides one. Reject stale or malformed signatures; do not accept unsigned status fields.
- Validate provider event schema, event type/version, provider account, `providerEventId`, Payment/provider reference, Order reference, exact amountMinor/currency, and expected environment.
- Do not trust metadata alone to establish Order ownership; resolve the internal Payment by a unique provider reference and verify all bindings.
- Never log raw card/payment credentials, full payloads containing sensitive data, signatures, webhook secrets, or client secrets. Log allowlisted event/reference IDs and redacted reason codes.
- Webhook route bypasses normal customer JWT because providers cannot supply a customer token; signature verification, rate controls, payload limits, and event dedupe are mandatory alternate authentication controls.

## Duplicate, Out-of-Order, Unknown, and Invalid Events

| Condition | TARGET behavior |
| --- | --- |
| Duplicate event ID, same payload hash | Return success after confirming receipt; do not append duplicate financial mutation or notify downstream twice. |
| Same event ID, different payload hash | Reject/quarantine and alert as provider/security inconsistency; do not mutate Payment. |
| Out-of-order event | Persist receipt; apply only if valid from current Payment state. Otherwise defer/reconcile; never move state backward by timestamp alone. |
| Unknown event type/version | Persist minimal redacted receipt and acknowledge only if safe to prevent endless provider retries; route to quarantine/DLQ and alert. No state mutation. |
| Invalid signature/timestamp/account | Reject with non-2xx according to provider retry contract; rate-limit and security-log without revealing verification details. |
| Payment not found yet | Store as unmatched pending event for bounded retry/reconciliation, or quarantine after policy; do not create an unverified Payment from webhook body alone. |
| Amount/currency/Order mismatch | Do not transition Payment/Order/Inventory; create reconciliation/security case and alert. |
| Internal transient failure after durable receipt | Acknowledge only after durable receipt and retry asynchronously; if receipt cannot be persisted, return provider-compatible retryable error. |

## Acknowledgement, Queue, Retry, and DLQ

TARGET: perform signature verification, payload size/schema check, dedupe receipt, and durable enqueue/Outbox write synchronously; return `2xx` quickly after durable acceptance. Process state transition in background with bounded retry/backoff. Do not acknowledge an event that has neither been durably recorded nor safely delegated.

- Retry transient DB/service failures with the same provider event ID and idempotency identity.
- Use bounded exponential backoff and provider-specific retry window; do not spin or make provider API calls in request thread.
- After retry exhaustion, route to a dead-letter queue (DLQ) retaining event ID, safe payload/hash, failure class, attempt count, and timestamps subject to retention/security policy.
- DLQ replay is an authorized operator action, idempotent and audited; it re-verifies stored event provenance and current Payment state.
- Alert on signature failures, queue depth/age, retry exhaustion, DLQ growth, out-of-order/mismatch events, and webhook latency.
- Queue workers are at-least-once; unique event constraints and idempotent Payment transitions make duplicate delivery harmless.

## Current Gap

CURRENT: no `/api/payments/webhook` or provider-specific webhook route exists. There is no raw-body verification, event receipt model, queue, retry/DLQ, replay tooling, or webhook test. The Payment ledger foundation currently records only internal creation/state transitions. The legacy client Stripe request is rejected before Stripe is called. All webhook controls above are TARGET/DEFERRED.
