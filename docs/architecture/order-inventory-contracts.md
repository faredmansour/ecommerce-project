# Order & Inventory Reservation Coordination Contract

Status: Proposed architecture contract, documentation only. No runtime Order, Inventory, Checkout, or Payment behavior is implemented by this document.

This document resolves coordination gaps between [Order Lifecycle](order-lifecycle.md), the [Phase 6 Inventory audit](../phase-6-inventory-reservation-audit.md), and the Phase 10 Payment boundary. `CURRENT` describes inspected repository behavior; `TARGET` describes a future contract and requires a separately approved implementation task. It does not enable a payment provider.

## 1. Executive summary

**CURRENT:** `Order` has `pending_payment`, `pending`, `shipped`, and `delivered` enum values. New code creates an Order in `pending_payment` from server-resolved product/pricing data and stores an immutable `commercialSnapshot`; no Order lifecycle service exists. The admin status controller can still set `pending`, `shipped`, or `delivered` directly without transition checks or history. `Product.stock` is a mutable catalog field. There is no InventoryItem, Reservation, inventory ledger, expiry worker, or stock-safe reservation operation. Payment is created from the Order snapshot, and verified webhook processing updates Payment and its ledger, but it does not transition Order or Inventory. Payment reconciliation is read-only.

**TARGET:** Checkout is a durable saga coordinator, not a cross-provider database transaction. It creates a stable checkout identity and immutable Order snapshot, acquires an all-or-nothing Reservation, then creates Payment and requests provider execution. A trusted capture event is first durably processed by Payments. The coordinator then confirms/commits the active Reservation and performs an optimistic, audited Order transition to `confirmed`. Fulfillment starts only after these prerequisites. Local state changes are transactional within their owning aggregate; an outbox, idempotent commands, and reconciliation repair work across aggregates and external providers.

## 2. Repository findings and discrepancies

| Area | CURRENT finding | Contract implication |
|---|---|---|
| Order schema | `backend/models/orderModel.js`: `pending_payment`, `pending`, `shipped`, `delivered`; no `confirmed`, `draft`, `expired`, `cancelled`, version, reservation link, or lifecycle history. Snapshot and item fields are immutable. | Proposed states below are target states only. Do not infer a confirmation state from `pending`. |
| Order create | `backend/controllers/orderController.js` creates the Order after `buildOrderCommercialSnapshot`; that service resolves active Product identity and PriceBook values and ignores client amounts. Cart deletion is a separate write. No idempotency key, transaction, reservation, or service-owned transition. | Future Checkout must own durable identity/idempotency and recover partial progress. Cart clearing is not evidence of accepted checkout. |
| Status mutation | Admin route/controller accepts `pending`, `shipped`, or `delivered` and assigns directly. It does not enforce legal transitions or coordinate payment, reservation, or fulfillment. | Replace only in a future approved runtime implementation with `OrderLifecycleService`; this task does not change it. |
| Product/inventory | `backend/models/productModel.js` stores mutable `stock`; catalog CRUD can write it. Cart does not enforce stock. Phase 6 audit describes a future InventoryItem/Reservation/ledger, not runtime. | Product stock is not checkout authority. No oversell safety claim is currently valid. |
| Payment | Payment binds amount/currency to Order `commercialSnapshot`, uses idempotency, and owns its state/ledger. Provider webhook receipts are durably queued and processed. Current Paymob execution attempt has an internal Payment ID, but callback correlation depends on persisted provider reference. | Payment remains financial source of truth. No browser redirect, callback controller, or Payment state alone writes Order status. |
| Reconciliation | `PaymentReconciliationService` compares Payment, Order snapshot, ledger, and verified/processed webhook evidence. It does not query providers, inspect Reservations, mutate state, or repair records. | Add a later cross-domain consistency scan; keep current financial reconciliation read-only. |
| Existing documentation conflict | Order Lifecycle's target sequence says reserve, then Order draft/acceptance; Phase 6 says Reservation references Order and describes `active -> confirmed` before Order confirmation. Neither defines how a Reservation gets an Order identity if reservation precedes Order creation, nor the exact cross-aggregate commit order. | This contract chooses Order draft first, then Reservation keyed by Order plus Checkout ID. Reservation activation is a precondition for Payment initiation; `confirmed` Inventory status means the reservation has been committed to the Order allocation, not that fulfillment dispatched it. |

Existing tests cover snapshot creation/immutability, owner checks, Payment snapshot binding/idempotency, durable webhook ingestion/retries, and read-only Payment reconciliation. Cart tests cover CRUD/authentication only. There are no Order state-machine, Reservation, stock contention, expiry, checkout saga, or cross-domain recovery tests because those behaviors do not exist. No tests are added in this documentation task.

## 3. Target Order lifecycle

Order status is the state of commercial acceptance and fulfillment progression. Payment and Reservation have their own state machines. Capture is not fulfillment; reservation commitment is not shipment; refund is not an Order status.

### States

| State | Meaning |
|---|---|
| `draft` | Checkout has persisted an immutable candidate Order and stable checkout identity. No stock hold is yet guaranteed. Not customer-confirmed and not eligible for payment execution. |
| `pending_payment` | Required Reservation is active, or is `expiry_pending` within its approved resolution grace, and the Order awaits the selected payment/collection condition. A failed/requires-action attempt may remain here while policy permits another attempt. |
| `confirmed` | Order accepted under the chosen method's policy. For prepaid methods, trusted capture is recorded and required Reservation has been committed. Approved COD policy is accepted for collection, not paid, with Reservation committed before confirmation (see Decision A2-02). |
| `processing` | Fulfillment has accepted the Order and begun work. Fulfillment owns detailed pick/pack state. |
| `shipped` | Fulfillment reports carrier handoff. This is an Order projection/transition driven by a trusted Fulfillment command. |
| `completed` | Fulfillment reports delivery/fulfillment completion. Payment collection/refund status remains Payment-owned. |
| `cancelled` | Terminal business cancellation accepted by an authorized actor/workflow, with reason and compensation references. It does not mean a captured payment was refunded. |
| `expired` | Terminal checkout expiration before Order confirmation. Reservation is expired/released. A late capture remains a Payment fact and enters compensation/review; it does not reopen this Order. |

### Allowed transitions and authority

Every transition uses an expected current state/version, authorization derived from identity/service credentials, an idempotency/correlation ID, timestamp, actor, and reason where applicable. Persist transition history atomically with the Order update.

| From → To | Owner/initiator | Preconditions |
|---|---|---|
| `draft → pending_payment` | `CheckoutOrchestrationService` via `OrderLifecycleService` | Immutable server-built snapshot exists; active Reservation belongs to this Order/customer/checkout, covers exact normalized sellable quantities, and has not expired. Persist Reservation reference. |
| `draft → cancelled` | Customer (own Order) or authorized operator/system via Order service | No active payment execution that could charge, or execution is first safely stopped/reconciled; release any active Reservation idempotently. |
| `draft → expired` | Checkout expiry worker via Order service | Checkout deadline elapsed; conditional state/version claim; Reservation release/expiry command is recorded or durably scheduled. |
| `pending_payment → confirmed` prepaid | Payment-to-Order coordinator; Order service owns transition | Verified, durably processed Payment is `captured`; payment customer/order/amount/currency/provider references match immutable Order; active or eligible `expiry_pending` Reservation is atomically confirmed (reserved → committed) and linked; Order still eligible and expected version matches. |
| `pending_payment → confirmed` COD | Checkout/Order service after Inventory commit | COD is eligible and server accepted it; no assertion of electronic capture. Approved policy commits the active Reservation before Order confirmation; collection is recorded separately during delivery. |
| `pending_payment → cancelled` | Customer for own Order before prohibited execution boundary; authorized operator/system | No unresolved/possibly captured provider attempt. Release active Reservation. If attempt is ambiguous, reconcile first; do not claim cancellation has stopped the charge. |
| `pending_payment → expired` | Expiry worker | Reservation is `expired`/released after its deadline or resolution grace and no capture command won the race; atomically record terminal Order expiry. A concurrent verified capture is serialized by Order version/state and compensated if expiry wins. |
| `confirmed → processing` | Fulfillment workflow / authorized operations | Order confirmed; inventory allocation committed under approved policy; fulfillment accepts work. No browser command. |
| `confirmed → cancelled` | Authorized operator or policy-approved customer request, resolved by Order workflow | Fulfillment has not crossed cancellation boundary; Payment void/refund requirement is separately resolved/tracked; committed stock is restored only through Inventory's audited cancellation operation, never by reopening Reservation. |
| `processing → shipped` | Fulfillment service | Carrier handoff verified and shipment reference recorded. |
| `processing → cancelled` | Fulfillment/authorized operations only, exceptional | Safe stop before shipment is confirmed; cancellation/refund and committed-stock compensation are tracked. Otherwise use return workflow after shipment. |
| `shipped → completed` | Fulfillment service | Delivery/completion evidence meets the approved fulfillment policy. |

Forbidden: direct client status mutation; `draft → confirmed` or `draft → processing`; any transition out of `cancelled`, `expired`, or `completed`; `shipped → cancelled` as an ordinary cancellation; Payment failure directly cancelling Order without policy/orchestration; capture alone confirming Order; refund setting Order to `refunded`; and admin arbitrary enum assignment. Post-shipment returns/refunds and corrections are separate linked workflows, not backward Order transitions.

### Payment failure, cancellation, timeout, refunds

- Provider decline/failure is a Payment event. It does not mean Order cancellation by itself. Because `failed` is terminal in the current Payment state machine, any approved retry uses a new Payment ID/idempotency key linked to the same eligible Order; it never reopens the old Payment. Keep `pending_payment` while retry is policy-allowed; cancel/expire only through a separate idempotent Order command and release Reservation once. The current Paymob execution-attempt uniqueness per Order does not support this target retry model and requires separate design approval.
- Execution timeout/unknown outcome is not failure. Keep Order blocked from another charge until provider inquiry or operator reconciliation resolves the same Payment attempt. Never create a second attempt merely because the first response timed out.
- Customer cancellation is an owner-authorized request/command; it is allowed only while the state and provider attempt make it safe. Admin cancellation requires an authorized role, reason, and audit trail. System expiration is a worker command with a deadline and conditional claim.
- Refunds/voids remain Payment-owned. A confirmed/processing/shipped Order may remain in its lifecycle state while refund is pending/partial/complete. Expose any financial summary as a read-only Payment projection. An Order cancellation command may require a successful/accepted void or refund according to policy, but must not fabricate that result.

## 4. Target Inventory Reservation contract

This refines, and does not replace, the Phase 6 target invariant `reserved + committed <= onHand`. For each InventoryItem `(sellableId, warehouseId)`:

```text
available = onHand - reserved - committed
0 <= reserved + committed <= onHand
available >= 0
```

All quantities are non-negative safe integers in one base unit. `available` is derived, never independently edited. Product.stock is a legacy catalog projection until an approved non-destructive migration/cutover; it is not added into or subtracted from this invariant.

### Reservation identity, lines, ownership

A Reservation has an opaque immutable `reservationId`; immutable `checkoutId`; immutable `orderId` once bound; authenticated `customerId`; normalized, unique lines of `{inventoryItemId, sellableId, warehouseId, quantity}`; status; `createdAt`, immutable `initialExpiresAt`, effective `expiresAt` (equal to initial unless a separately approved one-time server extension is applied), optional `resolutionDeadline` and `extensionCount`; terminal timestamp; idempotency scope/key and canonical request hash; version; and audit/correlation references. `extensionCount` is zero under the recommended default. Any approved extension must preserve the initial deadline and append actor/reason/previous/new deadline evidence. Do not store prices or payment secrets. Reservation creation is internal to Checkout's server-authorized command, not a browser-controlled stock mutation.

The unique business identity is one Reservation per `(checkoutId, customerId, reservation operation/idempotency key)`; once Order is created, bind it immutably to that Order. A Reservation cannot be transferred to another customer, checkout, or Order. A repeated same-key/same-hash request returns the original result; same key/different hash is `IDEMPOTENCY_KEY_REUSED`. A new key cannot create a second live Reservation for the same checkout. Historical terminal records remain auditable.

### Reservation states and transitions

| State | Allowed transition | Owner and effect |
|---|---|---|
| `active` | `confirmed` | Inventory service, called only by trusted prepaid Payment-to-Order coordinator with capture evidence or COD coordinator with approved acceptance evidence; atomically decrease `reserved`, increase `committed`, append ledger/outbox event. Terminal for this hold. |
| `active` | `released` | Inventory service on safe payment failure/cancellation; atomically decrease `reserved` once and append ledger/outbox. |
| `active` | `expired` | Internal expiry worker after `expiresAt <= now`; same atomic release as `released`, but distinct reason/event. |
| `active` | `expiry_pending` | Internal expiry worker when a provider attempt is pending, requires action, authorized, or unknown at `expiresAt`; retain reserved quantity and block new execution during a bounded resolution grace. |
| `expiry_pending` | `confirmed` | Trusted coordinator after matching verified capture during grace, while Order is eligible; move reserved to committed once. |
| `expiry_pending` | `released` / `expired` | Verified terminal failure releases immediately; unresolved attempt at approved `resolutionDeadline` expires/releases. |
| `active` | `cancelled` | Only for an explicit pre-payment checkout cancellation if kept distinct from release; must decrement reserved exactly once. Prefer `released` with reason to avoid redundant business state unless operations need the distinction. |
| `confirmed`, `released`, `expired`, `cancelled` | none | Terminal. Correction/reallocation is a new command and ledger event; no reopening or second commit. |

Do not persist `created` as a held reservation state: a transaction either creates the Reservation and all line holds as `active`, or commits none. `expiry_pending` retains the hold and is nonterminal with an approved finite `resolutionDeadline`. `confirmed`, `released`, `expired`, and `cancelled` are terminal. Duplicate exact confirm/release/expiry calls return the recorded result; conflicting terminal commands return stable `RESERVATION_STATE_CONFLICT`.

### Availability, contention, and ledger

For each line, Inventory repository performs one atomic conditional write proving `onHand - reserved - committed >= requestedQuantity`, then increments `reserved` and version. For multi-line requests, all item updates, Reservation, idempotency record, ledger, and outbox event commit in one short Mongo transaction; any insufficient line aborts every line. Do not use read-then-write checks or Redis locks as authority. Transient write conflicts may retry boundedly with the same key and re-evaluate the predicate. Unique indexes cover InventoryItem scope, Reservation checkout/idempotency, and ledger event idempotency.

Every quantity change has exactly one append-only ledger event in the same transaction, with before/after `onHand`, `reserved`, `committed`, derived availability, item and reservation references, event/reason, actor, idempotency key, and timestamps. Dispatch decrements `onHand` and `committed` together. Pre-dispatch cancellation of committed stock reduces `committed`; accepted returns increase `onHand` after inspection. These are separate Inventory commands, not Reservation reopening.

Authorization: customer may initiate/inspect only own Checkout/Reservation through Checkout DTOs. Only trusted service identity may confirm, release, or expire. Inventory admin may adjust stock with actor/reason/idempotency audit. Never accept customer-supplied `customerId`, `orderId` binding, balances, status, or payment result as authority.

## 5. Coordination sequence and transaction boundaries

The sequence resolves the earlier Order-before/after-Reservation ambiguity by creating an unpayable `draft` Order first. The durable `checkoutId` exists before both and lets retries recover either side. Payment execution cannot begin while the Order is draft or Reservation is not active.

1. Customer submits checkout command with owned cart/selected sellables, destination, method, and `Idempotency-Key`; browser totals and stock values are ignored. COD records collection intent and is not an electronic Payment.
2. Checkout authenticates owner, reloads cart/authoritative Product sellability and Pricing, validates address and approved policies, normalizes duplicate lines, and builds a server-side immutable quote/snapshot. Quote expiry/pricing policy must be approved; after Order acceptance the snapshot does not change.
3. In a short local transaction, create/recover the stable `checkoutId`, `draft` Order with immutable commercial snapshot, idempotency request hash, and initial lifecycle history. The Order is not yet payable or confirmed. This establishes `orderId` for Reservation identity.
4. Call Inventory `reserve` outside any provider call. Inventory atomically reserves all lines under `(checkoutId, orderId, customerId)`. On success, bind returned Reservation reference and transition Order `draft → pending_payment` using expected version. Persist a saga step/outbox record so a crash between reservation and Order linkage is retried idempotently. If linking fails permanently, release Reservation and cancel/expire draft through recovery.
5. For prepaid methods, create Payment from the immutable Order snapshot with scoped idempotency. COD creates no electronic Payment; its separate collection obligation is created at dispatch under approved policy. A failed local Payment creation leaves prepaid Order pending-payment with active Reservation and retryable saga state; release or retry only by explicit policy. No client amount/currency/provider is trusted.
6. For prepaid methods, persist Payment execution attempt/correlation before external provider call; make the provider call outside Mongo transaction. Timeout is `UNKNOWN`, not a safe retry. Use existing execution attempt semantics and future approved inquiry/recovery; do not start another charge until resolved. COD has no provider execution.
7. Provider callback is signature-verified, normalized, deduplicated, and durably queued. A normalized `captured` event is accepted only when the provider's capture semantics for the configured method are approved; generic success/authorization is not assumed to mean capture. Worker atomically applies Payment state + ledger + durable Payment event/outbox. Duplicate callback is a replay; out-of-order/conflicting event is deferred/quarantined and reconciled, not used to roll back a terminal fact.
8. For prepaid, Payment-to-Order coordinator consumes only a verified, processed capture fact. Check Payment/Order ID, owner, provider binding, amount, currency, status, and correlation. Capture may be accepted only if Order remains eligible and Reservation is `active` or `expiry_pending` within its resolution deadline. Browser redirect never participates. COD follows a separate accepted-Order path without a capture event.
9. For prepaid, coordinator calls Inventory confirm/commit with an idempotency key derived from the capture event/Order. For COD, approved acceptance policy initiates the same Inventory commit without any capture. Inventory's atomic transition is the sole owner of reserved-to-committed. Then OrderLifecycleService conditionally transitions `pending_payment → confirmed`, recording evidence and Reservation references and history. Durable saga/outbox retries these local steps after crashes.
10. Fulfillment may transition `confirmed → processing` only after committed allocation is visible. Dispatch/delivery updates come from Fulfillment. Refunds, voids, and returns stay in their owning domains.

No transaction spans Payment provider HTTP. Use short owning-domain transactions and a durable outbox/saga with at-least-once delivery, consumer idempotency, leases/retries/DLQ, correlation IDs, and reconciliation. The local configured Mongo server was queried read-only via `hello`; it returned no replica-set name and no mongos marker, consistent with standalone. Existing Payment services use Mongo sessions/transactions, so those transactions cannot succeed against this observed local topology. Tests use a one-member replica set. Production topology remains unknown. If Inventory and Order share a transaction-capable MongoDB deployment, an implementation may use one local transaction for Reservation commit plus Order confirmation only if domain ownership and transaction-size review approves it; the contract does not require this. The default is separate idempotent commands with recoverable intermediate states.

### Concurrency and race rules

- **Two checkouts contend for final unit:** conditional inventory update allows exactly one; other gets `INSUFFICIENT_STOCK`; no partial multi-line hold.
- **Duplicate checkout submit:** same customer/key/hash returns same Checkout/Order/Reservation/Payment progress; changed hash conflicts.
- **Payment capture vs expiry/cancel:** Order transition uses compare-and-set state/version. The winner determines eligible path. If expiry/cancellation wins but trusted capture is later discovered, keep the Payment captured and Order terminal; initiate policy-approved void/refund/manual exception and alert. Do not revive Reservation or Order.
- **Callback before provider reference persisted:** target requires a durable verified-provider inbox/quarantine path that can retain an unmatched event without an internal `paymentId`; the current normalized `PaymentWebhookEvent` requires Payment references and does not provide this capability. Persist only safe normalized identifiers/status, event identity, verification result, payload hash, and timestamps—never raw body/secrets. If it cannot be correlated to an internal Payment/attempt using an independently verified stable reference, keep it unmatched and acknowledge/retain according to provider retry policy. Do not guess by amount/customer or mutate Payment. Recovery may bind only after verified provider inquiry/manual evidence and audit.
- **Duplicate callbacks:** provider/event unique key plus Payment transition idempotency prevents duplicate ledger/outbox effects. Downstream consumers dedupe by event ID.
- **Out-of-order events:** do not apply a transition that violates Payment's state machine. Retain evidence, defer/reconcile; do not infer recency solely from delivery order.
- **Inventory commit fails after capture:** Payment remains captured. Do not confirm Order or fulfill. Retry the same commit command; if hold expired/released or invariant cannot be restored, create high-priority reconciliation case and policy-directed refund/void/manual stock exception. No silent oversell or automatic new reservation.
- **Crash between local saga steps:** recover from persisted command/outbox state; each command is idempotent and records result. Never make a fresh provider charge as a recovery shortcut.

## 6. Expiration and recovery

The A3-approved policy sets a server-owned `initialExpiresAt` 15 minutes after Reservation creation, with no automatic extension. If payment is UNKNOWN or still processing at that deadline, the Reservation enters `expiry_pending`: retain reserved quantity, block new payment execution, and set `resolutionDeadline` 10 minutes later. This grace resolves the existing attempt only and does not authorize another attempt. A matching verified capture during grace may commit only while the Order remains eligible and all required checks pass; verified failure releases. At grace expiry, release idempotently; later capture is handled as a manual-review/compensation case. See [Decision A2-01](order-inventory-decisions.md#a2-01--reservation-ttl-and-expiration).

An internal scheduled/queue worker owns expiration; it is not a browser timer. It queries due active Reservations in bounded batches and atomically either releases a Reservation with no unresolved attempt, or moves an ambiguous/in-flight attempt to `expiry_pending` while retaining reserved quantity. At `resolutionDeadline`, it expires/releases unresolved holds. Duplicate jobs and workers are harmless through conditional state/version claim and unique event key. A crash either commits transition+ledger together or leaves the record discoverable for retry.

After successful Reservation expiry, an unpaid `pending_payment` Order transitions to `expired` via an idempotent coordinator command. Expiry must not release a Reservation while a verified capture command is already serialized as the winner. An ambiguous attempt remains held only through approved resolution grace; after that, release and treat later capture as late. Do not re-reserve/reconfirm automatically: retain captured Payment evidence and initiate approved compensation or manual exception workflow.

Failed release/expiry is retried from durable outbox/worker state and visible to reconciliation. Monitor aged active holds, failed release count, expired Orders with active Reservations, captured Payments with non-confirmed Orders, confirmed Orders without committed Reservations, and duplicate/mismatched references. Cross-domain reconciliation is read-only by default: classify `UNKNOWN`, `MISMATCH`, or `PENDING_REVIEW`; repairs are explicit idempotent commands with actor, evidence, reason, and ledger/history effects. Existing Payment reconciliation remains observational.

## 7. Proposed service interfaces

Proposed signatures are conceptual; DTO field details and stable error mapping are implementation work. All commands reject unknown/client-controlled authority fields. All IDs are validated before database casts. Transactions are local to the owning service as described.

### `CheckoutOrchestrationService`

| Method | Input → output | Preconditions/state changes | Idempotency/errors/boundary |
|---|---|---|---|
| `startCheckout({customerId, cartRef, destination, paymentMethod, idempotencyKey})` | Validated server quote/checkout identity → `{checkoutId, orderId, status, snapshot, reservation, payment?}` | Authenticated customer owns cart; reload sellables/prices; creates/retrieves draft Order, reserves stock, links Reservation, sets pending-payment; initializes an electronic Payment only for prepaid methods. COD skips electronic Payment and creates its collection obligation at dispatch. | Key scoped to customer+operation with request hash. Same request resumes; changed request conflicts. `CART_EMPTY`, `SELLABLE_UNAVAILABLE`, `PRICE_INVALID`, `INSUFFICIENT_STOCK`, ownership/validation errors. Short Order transaction plus Inventory transaction; saga across them. |
| `resumeCheckout({checkoutId, customerId})` | IDs → current safe progress DTO | Owner check; read durable saga/Order/Reservation/Payment state; dispatch only idempotent incomplete local commands, never blind repeat external charge. | Read/retry safe; `NOT_FOUND`, `FORBIDDEN`, `STATE_CONFLICT`, `EXECUTION_UNKNOWN`. No cross-domain transaction. |
| `cancelCheckout({checkoutId, customerId, idempotencyKey, reason})` | Command → terminal/progress DTO | Own checkout; transition allowed; resolve ambiguous payment attempt before claiming stop; release active hold. | Same key replay; conflict for different request/state. `PAYMENT_OUTCOME_UNKNOWN`, `STATE_CONFLICT`. Order and Inventory local transactions plus saga/outbox. |

### `InventoryReservationService`

| Method | Input → output | Preconditions/state changes | Idempotency/errors/boundary |
|---|---|---|---|
| `reserve({checkoutId, orderId, customerId, lines, expiresAt, idempotencyKey})` | Normalized unique sellable/warehouse/quantity lines → `{reservationId,status,expiresAt,lines}` | Trusted Checkout identity; positive bounded quantities; Order/checkout/customer binding valid; atomically allocate all lines and create active Reservation + ledger + outbox. | Same key/hash returns same Reservation; another live Reservation for checkout rejected. `INSUFFICIENT_STOCK`, `INVENTORY_NOT_FOUND`, `IDEMPOTENCY_KEY_REUSED`, `RESERVATION_ALREADY_EXISTS`. Single Mongo transaction; expiration is supplied by approved server policy only. |
| `confirm({reservationId, orderId, paymentReference?, acceptanceEvidence, commandId})` | IDs/evidence → terminal Reservation result | Trusted prepaid coordinator with matching capture or COD coordinator with approved acceptance decision; same Order; active or eligible `expiry_pending`; atomically reserved→committed and append ledger/outbox. | `commandId` uniquely replays; never commit twice. `RESERVATION_EXPIRED`, `RESERVATION_STATE_CONFLICT`, `ORDER_BINDING_MISMATCH`. Inventory transaction. |
| `release({reservationId, orderId, reason, actor, commandId})` | Command → released result | Trusted Checkout/system/admin according to reason; matching Order; active state. | Idempotent; terminal exact replay succeeds, conflicting terminal state returns conflict. `RESERVATION_STATE_CONFLICT`, `ORDER_BINDING_MISMATCH`. Inventory transaction. |
| `expireDue({now, limit, workerId})` | Worker batch → claimed results | Internal worker; release due active holds without unresolved payment, otherwise enter `expiry_pending`; release unresolved holds at approved grace deadline. Recheck state/version/deadline. | Reservation ID + expiry generation/event key dedupes concurrent jobs. `RETRYABLE_CONFLICT` is retried; per-reservation transaction with ledger/outbox. |
| `getOwned({reservationId, customerId})` | IDs → safe Reservation DTO | Customer ownership or admin/service authorization. | Read-only; `NOT_FOUND` hides foreign object as policy requires. No state change. |

### `OrderLifecycleService`

| Method | Input → output | Preconditions/state changes | Idempotency/errors/boundary |
|---|---|---|---|
| `createDraft({checkoutId, customerId, immutableSnapshot, idempotencyKey})` | Authoritative accepted candidate data → `{orderId,status,version}` | Server Checkout only; validated quote/address/method; immutable snapshot and history event persisted. | Unique checkout/customer key+hash; exact retry returns same Order. `IDEMPOTENCY_KEY_REUSED`, `INVALID_SNAPSHOT`. One Order/history/idempotency transaction. |
| `linkReservation({orderId, reservationId, expectedVersion, commandId})` | IDs/version → Order | Reservation active and exact line/owner/checkout match; draft only; set reservation reference and pending-payment. | Unique command; CAS on version/status. `RESERVATION_MISMATCH`, `STATE_CONFLICT`. Order-local transaction; saga spans Inventory. |
| `confirmFromPayment({orderId, paymentId, captureEventId, expectedVersion})` | Trusted internal event → Order status/version | Processed captured Payment matches owner/order/snapshot amount/currency and Reservation is committed; Order pending-payment; capture event deduped. | Event ID unique; CAS. `PAYMENT_EVIDENCE_MISMATCH`, `RESERVATION_NOT_COMMITTED`, `STATE_CONFLICT`. Order/history/outbox transaction. |
| `confirmCod({orderId, policyDecisionId, expectedVersion})` | Server policy result → Order | COD allowed, Reservation committed before confirmation under approved policy; no claim of electronic payment. | Decision ID idempotency; CAS. `COD_NOT_ELIGIBLE`, `RESERVATION_NOT_COMMITTED`, `STATE_CONFLICT`. Order-local transaction plus Inventory command. |
| `cancel({orderId, actor, reason, commandId, expectedVersion})` | Authorized command → status/progress | Eligible state; customer owns Order or actor has operation role; payment attempt resolved or compensation scheduled; release/adjust Inventory through its service. | Command ID replay; `FORBIDDEN`, `PAYMENT_OUTCOME_UNKNOWN`, `STATE_CONFLICT`. Order local txn + saga/outbox. |
| `expire({orderId, reservationId, deadline, commandId, expectedVersion})` | Internal expiry fact → terminal Order | Deadline elapsed; unpaid, no capture winner; Reservation expiration/release recorded; conditional transition. | Unique command, CAS. `STATE_CONFLICT`, `PAYMENT_OUTCOME_UNKNOWN`. Order local txn + saga. |
| `advanceFulfillment({orderId, from, to, fulfillmentReference, commandId})` | Trusted Fulfillment event → status/version | Allowed processing/shipped/completed transition and evidence present. | Fulfillment event ID dedupe, CAS. `STATE_CONFLICT`, `INVALID_FULFILLMENT_EVIDENCE`. Order/history/outbox transaction. |

### Payment-to-Order coordination interface

`PaymentOrderCoordinator.handlePaymentEvent({paymentId, orderId, paymentEventId, canonicalStatus, amountMinor, currency, providerReference})` accepts only a durable Payments outbox event produced after a verified, processed Payment state transition. It checks the immutable Order snapshot and Payment references, then invokes the appropriate Order/Inventory idempotent commands. It never writes Payment or ledger state, never accepts browser-supplied status, and never makes provider HTTP calls. A capture event commits Reservation then confirms Order; failure is retried/reconciled with the same event ID. Failed/cancelled Payment may request reservation release only through approved Order policy. Each owning-service mutation is transactional locally; delivery is at least once and consumers dedupe by event ID. Stable outcomes: `APPLIED`, `DUPLICATE`, `DEFERRED`, `NEEDS_RECONCILIATION`; mismatches are quarantined and alerted, not silently repaired.

## 8. Failure and recovery matrix

| Failure/race | Required result |
|---|---|
| Reservation fails | No payment execution. Keep draft only if retryable; otherwise cancel/expire draft. No partial holds. Return safe insufficient-stock result. |
| Payment creation fails after reservation | No provider call. For prepaid, retain pending Order/active hold only within approved retry window; resume same Payment idempotency or release/cancel through saga. COD creates no electronic Payment. |
| Provider execution times out | Mark attempt unknown; keep Order pending and Reservation under explicit policy; reconcile same attempt before another charge. Never interpret timeout as decline. |
| Provider reports verified failure | Payment state/ledger updates; Order remains pending if retry allowed via a new Payment ID after verified no-capture result, otherwise explicit cancellation and one Reservation release. |
| Payment succeeds after Reservation expires | Keep Payment captured fact. Do not confirm Order or reacquire stock automatically. Run approved void/refund/manual exception and alert. |
| Callback before provider reference persisted | Durable verified receipt is unmatched/quarantined. No guessed correlation or state mutation. Resolve using verified stable reference/inquiry or operator evidence. |
| Duplicate callbacks | Acknowledge deduped receipt; one Payment/ledger fact and one downstream command effect. |
| Out-of-order events | Retain evidence; apply only legal Payment transitions; defer/conflict goes to reconciliation. Never use delivery order as truth. |
| Cancellation races with capture | Conditional version/state winner determines Order path. If cancellation/expiry wins and capture is later established, compensate financially; never reopen terminal Order/Reservation. |
| Inventory commit fails after capture | Payment remains captured, Order not confirmed/fulfilled. Retry same commit; if unrecoverable, high-priority review and approved refund/manual exception. |
| Reservation release fails | Keep durable pending saga task; retry idempotently, alert on age; do not mark recovery complete until Inventory confirms terminal release. |
| Order update fails after Reservation commit | Keep committed Reservation and captured Payment; outbox retries Order transition. Reconciliation detects and pages if stale. Do not release committed stock or duplicate capture. |

## 9. Security and reliability invariants

- Prices, totals, currency, sellable identity, and accepted quantities are server-derived; Order snapshot is immutable after acceptance.
- Customer ownership is checked on every Checkout/Order read and command. Service identity is used for internal Payment/Inventory transitions; roles and actor are not accepted from request bodies.
- Browser redirect/result is informational. Only a verified callback or separately approved trusted provider status can establish Payment evidence; durable worker processing precedes coordination.
- A Reservation can belong to one checkout/customer/Order only, and can move reserved quantity to committed at most once. Released/expired reservations cannot commit later.
- Payment capture, Order confirmation, Inventory commitment, and fulfillment are separate durable facts with explicit links and idempotent transitions.
- No provider call runs inside a Mongo transaction. External outcomes use attempt records, outbox/saga, bounded retries, and reconciliation.
- Audit state transitions with actor/service, from/to, reason, timestamp, idempotency/correlation/event IDs, and safe metadata. Never log secrets, card data, raw callback bodies, or sensitive payment payloads.

## 10. Unresolved business decisions

Approved initial-release policies are recorded in [Workstream A3 Decision Register](order-inventory-decisions.md). Separate policies remain unresolved for quote validity, cancellation/refund, Payment retry limits, split/partial payments, backorders, substitutions, and multi-warehouse. Partial shipment is explicitly unsupported initially. Production MongoDB topology/transaction support and configured Paymob capture semantics remain technical verification gates. Coordinated scenarios and invalid combinations are in [Order/Reservation/Payment State Matrix](order-inventory-state-matrix.md).

## 11. Future implementation sequence

After approval, implement in separately reviewed increments: (1) approve decisions and reconcile Phase 6/8 state vocabularies; (2) design/migrate InventoryItem, Reservation, idempotency, ledger, indexes, and non-destructive Product.stock backfill; (3) implement atomic Inventory service and expiry worker with concurrency tests; (4) implement Order lifecycle/history/CAS and remove arbitrary status writes; (5) implement Checkout durable identity/saga/outbox and resume/cancel/expiry; (6) implement Payment event outbox and coordinator with callback-before-reference quarantine/recovery; (7) add Fulfillment boundary; (8) sandbox and recovery tests, operational dashboards, reconciliation, rollout/rollback. Do not combine these steps with provider enablement or Step 15 without separate approval.

## 12. Validation and contract status

This is architecture documentation only. No runtime tests or provider sandbox transactions are claimed. Contract review must ensure every transition above has an owner/precondition, every cross-domain failure has a durable recovery path, and the three facts—Payment captured, Reservation committed, Order confirmed—remain separately auditable and converge through idempotent coordination. Changes are subject to `git diff --check`.
