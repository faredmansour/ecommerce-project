# Payment Ledger — FOUNDATION AND TARGET

Status: CURRENT append-only ledger model/repository are implemented for Payment creation and core state transitions. Provider events, refunds, disputes, chargebacks, and reconciliation entries remain TARGET/DEFERRED.

## Ledger Contract

Payment financial state is derived from immutable ledger events plus valid state-machine transitions. The ledger is append-only: no updating/deleting an event to “fix” history. Corrections append a compensating/reconciliation entry referencing the original. Provider reports are evidence, not replacements for the internal ledger.

```text
PaymentLedgerEntry
 ├── entryId
 ├── paymentId
 ├── orderId
 ├── eventType
 ├── fromStatus / toStatus
 ├── amountMinor
 ├── currency
 ├── provider
 ├── providerPaymentId / providerTransactionId
 ├── providerEventId
 ├── idempotencyKey / requestId
 ├── actorType / actorId / source
 ├── occurredAt / recordedAt
 ├── reason / safe metadata
 └── previousEntry/reference/correlation IDs
```

Fields and constraints:

- `entryId`: immutable internal ledger identity.
- `paymentId`, `orderId`: required internal references; do not identify a Payment by provider ID alone.
- `eventType`: validated finite event classification.
- `fromStatus`/`toStatus`: transition context when state changes; never rewrite prior state entries.
- `amountMinor` and `currency`: integer amount and explicit ISO currency; zero/absent only where a non-financial event permits it. Provider fee, capture, refund and dispute amounts are typed separately.
- Provider fields: store only necessary references/event IDs, not raw card/payment secrets or entire unredacted payloads.
- `providerEventId` is unique within provider/account namespace for webhook dedupe. `idempotencyKey` is unique within operation/payment/customer scope. One idempotent retry maps to the original entry/result, not a second balance mutation.
- `actorType/source`: provider webhook, PaymentService, system/reconciliation, or authorized operator. User-originated intent is not provider proof.
- timestamps: provider occurrence time and server receipt/record time are distinct; store in UTC.
- reason and metadata are allowlisted/redacted. Never include PAN, CVV, secrets, or raw authentication payloads.

## Event Types

TARGET events include:

- `payment_created`, `payment_pending`
- `payment_authorized`, `payment_captured`
- `payment_failed`, `payment_cancelled`
- `refund_requested`, `refund_pending`, `refund_succeeded`, `refund_failed`
- `payment_partially_refunded`, `payment_refunded`
- `dispute_opened`, `dispute_evidence_submitted`, `dispute_won`, `dispute_lost`, `chargeback_recorded`, `chargeback_reversed`
- `provider_webhook_received`, `provider_webhook_rejected`
- `payment_reconciliation_matched`, `payment_reconciliation_mismatch`, `payment_correction`

An event records a fact/result, not a mutable command. Failed/unknown outcomes remain visible as separate events.

## Invariants

- Ledger entries are insert-only and auditable; no destructive corrections.
- A capture cannot exceed authorized/accepted amount under the Order/payment policy.
- Cumulative successful refunds cannot exceed cumulative captured funds, in the same currency.
- Every status transition has exactly one idempotent transition event; provider webhook replay cannot duplicate it.
- All money is integer minor units with one explicit currency per operation; no implicit FX or floating-point ledger arithmetic.
- Provider response/webhook and internal Payment state are reconciled by references; a mismatch creates a reconciliation case/event, not a silent overwrite.
- Order is a reference and snapshot owner, not financial ledger authority. Payment ledger determines captured/refunded/dispute totals.

## Persistence and Transaction Boundary

TARGET: persist a ledger entry atomically with the internal Payment state transition, request idempotency result, and webhook event receipt when those records share MongoDB. Use unique constraints on provider event identity and scoped idempotency identity. If the event/outbox is separate, persist it in the same local transaction; deliver consumers at least once with dedupe.

Provider API calls never occur inside a MongoDB transaction. Persist intent/request identity, call provider externally with stable idempotency key, then append result/reference entry. Unknown provider outcome is reconciled with `getPayment`/provider reporting before retry or compensation.

## Current Boundary

CURRENT `PaymentService` writes `payment_created` and each supported core transition with the Payment document and PaymentIdempotency record in one MongoDB transaction. Ledger records reject update/delete operations and use immutable fields. This is not yet a complete financial ledger: no provider transaction/webhook facts, capture integration, fees, refunds, disputes, chargebacks, or reconciliation records are implemented. The legacy Stripe endpoint does not write to the ledger and currently fails closed.
