# Payment State Machine — FOUNDATION AND TARGET

Status: The TEST checkout flow persists `created -> pending` only after a validated Paymob session is returned, binding its provider payment reference and appending the matching ledger event in one database transaction. A verified initial `pending` webhook may confirm the current state and bind the transaction reference; it does not imply capture. Refund/dispute/chargeback transitions remain TARGET/DEFERRED.

## State Ownership

Payment owns payment states. Order, Fulfillment, and Inventory Reservation use their own state machines. Do not set `Order.status = paid`; do not infer payment state from Order status, frontend redirect, Stripe.js callback, or fulfillment event.

Each Payment aggregate represents one logical provider attempt. A retry creates a new Payment ID linked to the same Order and optionally references the prior failed/cancelled Payment; it does not reopen a terminal attempt. At most one attempt for an Order/method may be active unless an explicit split-tender policy is approved. The state table below describes one Payment attempt; provider transactions/events remain separately auditable.

## States

- `created`: Payment record and idempotency request are persisted; no provider action is known complete.
- `pending`: provider intent/collection is initiated and awaiting authoritative result.
- `requires_action`: provider requires customer authentication/action, such as a 3DS2/SCA challenge; this is not authorized/captured and must not be presented as payment success.
- `authorized`: provider has verified/authorized funds but they are not yet captured/settled.
- `captured`: funds are captured/collected and recorded in the ledger.
- `failed`: an attempt/Payment cannot proceed under a definitive provider/business failure. A new attempt is a new linked attempt, not rewriting history.
- `cancelled`: pending/authorized payment was cancelled/voided by an authorized workflow and provider result is reconciled.
- `partially_refunded`: at least one verified refund exists and net captured funds remain.
- `refunded`: all refundable captured amount has been refunded; terminal for ordinary refund flow.
- `disputed`: provider/bank dispute or chargeback is open; resolution remains auditable.
- `chargeback_lost` (TARGET extension): a dispute was lost and the provider/bank removed funds; this is not a customer refund and must have its own ledger event/status semantics.

A dispute is a linked Payment-owned `DisputeCase`, not a replacement for the main Payment status/ledger. TARGET case states are `opened -> evidence_pending -> evidence_submitted -> won | lost`; a provider/bank chargeback reversal is a separate verified event. Store the response deadline, evidence references (for example delivery tracking/session evidence where lawfully retained), assigned actor, provider dispute reference, and all submissions/outcomes. Deadlines and evidence requirements are provider/jurisdiction specific and must be obtained from the provider; never invent them.

## Valid Transitions

| From | To | Actor/source | Required evidence and rule |
| --- | --- | --- | --- |
| `created` | `pending` | Payment application service | After successful TEST session creation, atomically bind the provider payment reference, apply the state change, and append the ledger event. A provider failure does not mark the Payment successful or pending. |
| `pending` | `pending` | Verified provider webhook | Accept a matching verified pending observation, bind the first transaction reference, and append an auditable same-state ledger event. This does not constitute authorization or capture. |
| `created` | `failed` | Service/reconciliation | Definitive pre-provider validation/configuration failure; record failure event and reason. Retry with same key returns result; a new permitted attempt gets a separate attempt identity. |
| `pending` | `authorized` | Verified provider API result or signed webhook | Provider reference, Order ID, amount and currency match; event is deduplicated. |
| `pending` | `requires_action` | Verified provider response/event | Provider marks customer authentication required; server issues only the safe next-action/client secret. |
| `requires_action` | `pending` | Verified provider challenge continuation | Customer interaction is submitted through provider-hosted/secure SDK; server awaits authoritative result. |
| `requires_action` | `authorized` / `captured` / `failed` | Verified provider API result or signed webhook | Map only provider-confirmed result; do not trust browser challenge completion alone. |
| `requires_action` | `cancelled` | Authorized server command/provider confirmation | Cancel/expire the authentication attempt; preserve provider reference and reason. |
| `pending` | `captured` | Verified provider capture result/webhook, or verified COD collection | Only if provider/method supports immediate capture; record capture ledger entry. For COD, this is actual collection, not Order acceptance. |
| `pending` | `failed` | Verified provider event or reconciliation | Definitive decline/failure; timeout alone is not definitive failure until provider state is reconciled or policy expires. |
| `pending` | `cancelled` | Authorized server command + provider confirmation | Cancellation requested; final state recorded only when provider void/cancel is verified or policy defines non-provider cancellation. |
| `authorized` | `captured` | Authorized server capture command + provider evidence | Capture amount/currency cannot exceed authorized remaining amount; idempotent and ledgered. |
| `authorized` | `cancelled` | Authorized server command + provider void confirmation | No capture occurred; record void/cancel provider reference. |
| `authorized` | `failed` | Verified provider/reconciliation event | Provider reports authorization invalid/expired or capture irrecoverably failed; preserve authorization history. |
| `captured` | `partially_refunded` | Refund service + verified provider result | Refund amount is positive and within remaining refundable balance; append refund ledger entry. |
| `captured` | `refunded` | Refund service + verified provider result | Full eligible captured amount refunded; append event, never overwrite capture. |
| `partially_refunded` | `partially_refunded` | Refund service + verified provider result | Additional partial refund leaves positive net captured balance; unique refund key. |
| `partially_refunded` | `refunded` | Refund service + verified provider result | Remaining refundable balance is refunded. |
| `captured` / `partially_refunded` | `disputed` | Signed provider webhook / reconciliation | Open dispute/chargeback references are recorded; capture/refund entries remain unchanged. |
| `disputed` | `captured` / `partially_refunded` | Verified dispute-won event | Funds remain/are restored; close linked DisputeCase and append resolution entry. |
| `disputed` | `chargeback_lost` | Verified dispute-lost/chargeback event | Provider/bank debits funds; record chargeback separately from customer refund and preserve original capture. |
| `chargeback_lost` | `captured` / `partially_refunded` | Verified chargeback reversal event | Provider/bank restores funds; append reversal entry, never rewrite the loss event. |
| `failed` / `cancelled` | no direct transition | — | Terminal for this Payment attempt. Any retry is a new Payment ID linked to the same Order and prior attempt. |
| `refunded` | no ordinary transition | — | Terminal for refund workflow. A later dispute/reversal is a new linked dispute/reversal ledger event, not mutation. |

## Invalid Transitions and Rules

- A frontend redirect or SDK `succeeded` value cannot transition Payment to `authorized`/`captured` internally.
- A browser-reported completed 3DS challenge cannot transition Payment by itself; `requires_action` resolves only from verified provider state/webhook or controlled server lookup.
- Client cannot request a transition by posting `status`, `paid`, amount, or provider event data to a customer endpoint.
- `created -> captured` is invalid without provider/method authorization evidence and an explicit provider flow supporting immediate capture.
- `failed/cancelled/refunded -> captured` is invalid for the same attempt. Recovery uses a new attempt or a separately modeled reversal event.
- Refunding more than the verified captured balance, wrong currency, wrong Order, or a duplicate refund key is rejected.
- A chargeback debit is not recorded as `refunded`; provider/bank dispute loss and any later reversal have their own event and amount references.
- Out-of-order provider events are stored/deduplicated and reconciled against current state; they are not applied blindly.
- Dispute opened, evidence submission, won/lost, chargeback, and reversal are individually recorded in the linked DisputeCase and ledger; a deadline passing alone is not evidence that the dispute was won or lost.
- Reconciliation never edits prior ledger entries. It appends a correction/reconciliation event and updates current derived state through valid transition rules.

## COD and Non-Card Methods

COD Payment remains `pending`/due after Order acceptance. Only verified collection at delivery, settlement import, or an authorized auditable operator action moves it to `captured`. A failed delivery can cause Order/Reservation cancellation/release according to their owners, but Payment remains a payment obligation state until settled/closed under policy. Wallet/local/BNPL transitions are adapter-specific and must map to this internal state machine with provider evidence.

## Capture Timing Policy

TARGET, subject to explicit merchant/provider capability and Order policy:

- Physical goods may use authorize-then-capture at the approved fulfillment milestone (commonly shipment) where the authorization remains valid and the provider/method supports it. Capture amount must match the accepted Order/allowed partial capture and be supported by authoritative fulfillment evidence.
- Digital goods may capture immediately after Order acceptance where delivery is immediate and provider/method policy permits.
- Wallets/local methods may have provider-defined synchronous capture/settlement semantics; map verified provider state through the same Payment machine rather than assuming card semantics.
- CURRENT Stripe PaymentIntent prototype creates a default intent and browser confirms it before Order creation; no internal capture timing policy or capture endpoint is implemented.
- Reserve/commit/release timing remains Inventory-owned under Phase 6. Payment capture is not itself a stock write; Order/Checkout coordinates both domains idempotently.

## Transaction and Event Rules

- Persist each state transition and corresponding append-only PaymentLedgerEntry in one local MongoDB transaction.
- Provider calls occur outside MongoDB transactions. Persist request/idempotency first, call provider, then persist result; unknown outcomes go to reconciliation.
- Webhook event IDs and provider transaction IDs are deduplicated. An event that arrives before the local provider reference is linked is quarantined/retried or reconciled, not treated as an unverified payment success.
- Order confirmation and Inventory Reservation transitions are coordinated by Checkout/Order workflows using durable events/outbox and idempotent commands. Payment does not mutate Order or Inventory aggregates directly.

Order status remains the independent legacy enum. The Payment foundation implements only its initial/core states; the full target machine is not implemented.

CURRENT foundation implementation is in `backend/utils/paymentStateMachine.js` and `backend/services/paymentService.js`. The model currently permits `created`, `pending`, `requires_action`, `authorized`, `captured`, `failed`, and `cancelled`. Each allowed internal transition is written with a ledger record in one MongoDB transaction. Provider-sourced transitions require an internal verified-evidence flag; no public API accepts that flag, and no webhook or provider adapter currently produces it. Refund and dispute states in the target table are not enabled in the runtime schema.
