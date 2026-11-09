# Payment Testing Contract — IMPLEMENTED FOUNDATION AND TARGET

Status: `backend/tests/payment.test.js` verifies the Payment foundation. Provider adapter, Stripe intent, webhook, refund, dispute, and reconciliation integration tests remain future work.

## Payment Core

- Create Payment from eligible accepted Order; derive amountMinor/currency from Order; reject client amount/currency overrides.
- Valid/invalid state transitions; immutable original amount; capture cannot exceed authorization; refund cannot exceed captured remainder; multi-currency operations rejected.
- Provider adapter maps states/errors consistently; provider unknown outcome triggers lookup/reconciliation rather than duplicate intent.
- 3DS2/SCA frictionless success, challenge required, challenge completion, challenge abandonment/timeout, authentication failure, and verified provider callback/webhook ordering; browser-reported completion alone cannot advance Payment.
- Capture/refund/cancel request calls provider outside Mongo transaction and persists correlation/results idempotently.
- COD remains due until verified collection; Order accepted does not equal Payment captured.

## Security and PCI Boundary

- No PAN/CVV/full card data enters API body, logs, database, test fixtures, or snapshots.
- Hosted payment element/hosted checkout behavior; unauthorized script/header modification detection policy; CSP/SRI configuration and third-party script inventory verification (deployment/browser security tests as appropriate).
- Secret keys absent from frontend bundles, source control, responses, and logs; secret rotation/config fail-closed behavior.
- Amount/currency/Order ID/provider/method tampering rejected or ignored in favor of server Order.
- Customer cannot read another Payment, authorize/capture, cancel ineligible payment, or issue unauthorized refund; operator access role-scoped/audited.
- Rate-limit/card-testing velocity; replay; malformed IDs; provider spoofing; redacted provider/database error responses.

## Idempotency and Concurrency

- Same key + same request returns prior result without a second provider mutation/ledger entry.
- Same key + different request returns conflict.
- Timeout before provider response: retry same provider key; reconcile unknown outcome; never create a second charge.
- Concurrent create/authorize/capture/cancel/refund commands enforce expected state/version and unique operation keys.
- Double-click, two tabs/devices, retry after refresh, webhook/operation race, and reconciliation race remain single-effect.
- Partial captures/refunds and cumulative bounds stay within authorized/captured balance.

## Webhooks

- Valid signature, correct raw-body verification, active signing secret/key rotation, allowed timestamp window.
- Invalid signature, stale/replayed timestamp, wrong provider account/environment, malformed/oversized payload rejected and security-logged without leaking details.
- Duplicate same event ID/same hash is acknowledged idempotently; same event ID/different hash quarantined.
- Delayed, out-of-order, unknown-version/type, unmatched Payment, wrong amount/currency/Order reference, and provider event before local persistence are safely quarantined/reconciled.
- Persisted receipt acknowledged quickly; worker retry/backoff; crash after acknowledgement; poison event; DLQ after retry exhaustion; authorized idempotent DLQ replay.
- Payment ledger and downstream Order/Inventory commands update once, with outbox/event dedupe.

## Ledger, Refund, Dispute, and Reconciliation

- Ledger append-only; transitions produce immutable entries; corrections append compensating entries; unique provider event and idempotency constraints.
- Full refund, partial refund, multiple partial refunds, refund timeout, duplicate refund request, provider failure, refund out-of-order webhook, and over-refund rejection.
- Dispute opened/evidence/won/lost/chargeback/reversal preserve original capture/refund entries and use Payment-owned state.
- Provider/internal/Order/settlement match; missing webhook recovery; provider success/internal pending; internal capture/provider failure; amount/currency mismatch; duplicate charge; refund mismatch; unmatched provider payment.

## Cross-Domain Integration

- Payment amount/currency equals accepted immutable Order snapshot, never Product.price, Cart price, Checkout browser total, or client-supplied amount.
- Payment success/order transition and Payment success/Inventory reservation races; reservation expiry followed by late success; failed payment releases Inventory once.
- Order is not delivered merely because Payment captured; Payment is not captured merely because Order is confirmed for COD.
- Tax/shipping/promotion effects are already represented in Order snapshot; Payment does not recalculate them.

All tests above are TARGET/DEFERRED. They do not claim current coverage or implementation.

CURRENT coverage includes integer minor-unit persistence, strict DTO field rejection, missing Order snapshot failure, Order ownership and eligibility, exact idempotent replay/conflict, transactional Payment-plus-ledger transitions, invalid/unverified state changes, append-only ledger mutation rejection, legacy amount rejection, malformed Payment IDs, and owner-scoped safe DTO behavior. These tests do not establish production PCI compliance or provider behavior.
