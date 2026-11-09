# Payment Reconciliation — TARGET / NOT IMPLEMENTED

Status: TARGET/DEFERRED operational and financial control. Current runtime has Payment/ledger foundation records but no provider event history or reconciliation process.

## Authority Sources

Compare independent facts; do not make a provider report the mutable internal ledger or treat Order as financial authority:

```text
Internal Payment + append-only ledger
        vs
Provider payment/refund/dispute state and transaction report
        vs
Order accepted amount/currency and read-only payment references
        vs
Settlement/payout/bank report where available
```

Payment Ledger records internal financial transitions. Provider API/webhooks and settlement reports are external evidence. Order holds the accepted commercial snapshot and links; it does not calculate whether money settled. Inventory has separate Reservation/commitment facts.

## Reconciliation Cadence and Scope

TARGET: perform frequent event-driven lookup for unknown/timed-out provider calls and scheduled daily reconciliation at minimum, plus periodic settlement-level reconciliation. Cadence, timezone, provider report format, and retention are provider/account-specific decisions. Do not claim a current scheduled job exists.

Reconciliation input should include provider account/environment, date window, provider transaction/intent/refund/dispute IDs, internal Payment IDs, Order IDs, amountMinor/currency, status, event IDs, settlement/bank references, and report generation time. Restrict access to payment-ops roles, redact secrets, and preserve the original source/report digest/reference.

## Mismatch Handling

| Mismatch | TARGET action |
| --- | --- |
| Provider succeeded, internal Payment pending/absent | Verify provider/account/event signature or query trusted API/report; bind by unique provider reference, exact amount/currency and Order; append reconciliation entry, repair Payment projection, then emit the owning Order/Inventory command idempotently. Never infer from browser redirect. |
| Internal state captured, provider reports failed/absent | Freeze automated downstream financial assumptions; investigate transaction/reference, append mismatch case, query provider/settlement, and apply an authorized compensating ledger event only after evidence. Do not delete original capture entry. |
| Amount/currency mismatch | Do not mark Order paid/confirm Reservation from mismatched result. Quarantine, alert, compare Order snapshot and provider request, resolve with provider evidence and operator approval. |
| Missing webhook | Query provider by persisted reference and compare reports; append verified reconciliation outcome. Webhook delivery is not the only recovery mechanism. |
| Duplicate provider payment | Detect same Order/method and multiple provider references; flag duplicate charge, retain both references, initiate Payment-owned refund workflow only after verification/approval. |
| Refund mismatch | Compare refund request, provider refund ID, captured balance, currency, and settlement; retry with original idempotency key or create reconciliation case. Do not overstate Order's refunded projection. |
| Dispute/chargeback mismatch | Record provider dispute/chargeback evidence and deadlines in Payment domain; notify Order/operations through event; retain append-only financial history. |
| Provider event with no local Order/Payment | Quarantine as unmatched, search by secure provider reference, do not create an Order from provider payload. Escalate after bounded matching window. |

Every manual resolution records operator, reason, evidence/report reference, source status, chosen correction, timestamp, and correlation ID. Reconciliation must be idempotent and repeatable; it must not rewrite snapshots or ledger history.

## Operational Metrics and Controls

TARGET metrics: internal/provider count and amount deltas; missing/delayed events; pending age; unmatched references; duplicate payment/refund; amount/currency mismatch; settlement variance; reconciliation duration; unresolved case count/age; provider latency/availability. Alert on unexplained mismatch, aged pending state, DLQ backlog, failed refund, or settlement variance thresholds. Dashboard access is restricted and audited.

## Current Gap

CURRENT: Payment and PaymentLedgerEntry models exist for internal foundation events. No provider event store, reconciliation repository, scheduled job, settlement import, unmatched-payment workflow, or reconciliation tests exist. Current Order analytics sum client-originated `Order.totalAmount`; they are not financial reconciliation.
