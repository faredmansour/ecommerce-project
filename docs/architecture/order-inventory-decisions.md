# Order & Inventory Decisions

Status: Workstream A3 formal approval record. The initial-release policies listed as APPROVED below were explicitly approved by the project owner in Workstream A3. MongoDB transaction capability and Paymob capture semantics remain technical production gates, not approved business-policy decisions. This document records policy only; it does not implement runtime behavior.

Companion documents: [Order & Inventory Contracts](order-inventory-contracts.md) defines the detailed target service boundaries; [Order/Reservation/Payment State Matrix](order-inventory-state-matrix.md) defines coordinated scenarios; [Phase 6 Inventory audit](../phase-6-inventory-reservation-audit.md) records current runtime and Inventory target behavior.

## Repository findings and contradictions

| Source | Observed fact | Consequence / reconciliation |
|---|---|---|
| `backend/models/orderModel.js` | Runtime enum is `pending_payment`, `pending`, `shipped`, `delivered`; no history/version/reservation reference. | Target states are not runtime states. No implicit rename or transition is safe. |
| `backend/controllers/orderController.js`, `backend/routers/ordersRouter.js` | Admin-only `PATCH /api/orders/:id/status` accepts `pending`, `shipped`, `delivered`; controller directly assigns status without checking source state, evidence, or history. | It bypasses the proposed lifecycle service. Keep read compatibility; replace writes with audited commands in a future implementation. |
| Payment runtime | `paymentStateMachine.js` states: `created`, `pending`, `requires_action`, `authorized`, `captured`, `failed`, `cancelled`. `Payment` accepts only method type `card`; controller hardcodes provider `deferred`. Verified webhook worker commits Payment + ledger, not Order/Inventory. | COD collection is not represented by a Payment today. A Payment `captured` fact does not currently confirm an Order. |
| Payment reconciliation | Reads Payment, Order snapshot, ledger and verified processed webhooks; no Reservation input, provider query, repair, or deployed scheduler. | Future cross-domain consistency scan is required; current service remains read-only. |
| Product stock | `Product.stock` is mutable through admin create/update, exposed in product DTOs/UI, and used by admin low-stock reporting. It is not used as a reservation-safe checkout predicate. | Backfill and cutover must account for live stock edits and UI consumers; no dual authority. |
| Mongo topology | `server.js` passes `DB_URL` to `mongoose.connect`. Both local and example config use `mongodb://127.0.0.1:27017/e-commerce` with no explicit replica-set option. A read-only Mongo `hello` check of the local configured server returned no `setName` and no `isdbgrid` marker, consistent with standalone; tests use a one-member `MongoMemoryReplSet`. Payment creation, webhook processing, and reconciliation use `startSession()/withTransaction()`. | The observed local server is standalone, so multi-document transactions required by current Payment code and future Inventory are unavailable there. Tests demonstrate transactions only on a replica set. No production URI/topology is present, so production replica-set/sharded support, version, write concern, and transaction limits remain infrastructure verification items. |
| Prior architecture | Phase 6 defines `available = onHand - reserved - committed`; earlier Order Lifecycle flow put reservation before Order identity, while Reservation references Order. | Workstream A resolved identity ordering as draft Order first, then Reservation. The current quantity invariant remains the canonical one and is clarified below. |
| Paymob Step 14 | Official capture semantics for the configured Integration ID remain unresolved; generic `success=true` is not sufficient. | Keep the Step 14 fail-closed restriction; no Payment-to-Order confirmation until exact capture evidence is verified. |

CURRENT runtime evidence must not be read as endorsement of the target. Target design cannot be called approved from documentation alone.

## Decision register

| ID | Category | Decision | Status | Approval / gate |
|---|---|---|---|---|
| A2-01 | Business + technical | Reservation TTL, extension, and expiry grace | **APPROVED:** 15-minute TTL; additional 10-minute resolution grace for UNKNOWN/processing; no automatic extension | Owner-approved initial-release policy |
| A2-02 | Business | COD confirmation, allocation, and collection | **APPROVED:** commit Reservation before confirming COD Order; collect on delivery through separate CODCollection; full collection only | Owner-approved initial-release policy |
| A2-03 | Technical + business | Stock quantities, dispatch, partial shipment, return | **APPROVED:** Phase 6 invariant; dispatch decrements onHand and committed; no partial shipment initially; returns only after inspection | Owner-approved initial-release policy |
| A2-04 | Infrastructure | MongoDB transaction capability | Local configured Mongo is observed standalone; production topology and multi-document transaction support must be verified before transactional Inventory activation | **OPEN PRODUCTION GATE:** platform/infrastructure verification |
| A2-05 | Business + provider | Late capture compensation | **APPROVED:** preserve capture evidence; never reopen terminal Order/Reservation; manual review/compensation | Owner-approved policy; provider refund/void capability remains to verify |
| A2-06 | Technical + operations | Order migration and admin status writes | Preserve legacy values and evidence; route future writes through audited lifecycle commands; disable unrestricted direct assignment at cutover | Required: order operations owner for transition map |
| A2-07 | Infrastructure + operations | Product.stock migration/cutover | **APPROVED:** Inventory becomes source of truth after successful migration; Product.stock is legacy only | Owner-approved policy; migration/cutover execution remains future work |
| A2-08 | Business + technical | Retry after terminal Payment failure | Recommend retry only after verified no-capture failure, via a new idempotent Payment attempt linked to the same eligible Order; never reopen a terminal Payment | Required: Payments owner + commerce policy |

The approved entries above govern the initial release. A2-06 (Order migration/admin writes) and A2-08 (Payment retry policy) remain unresolved recommendations and are not approved by A3. The MongoDB and Paymob items are technical gates and must not be represented as business-policy approvals.

## A2-01 — Reservation TTL and expiration

**Problem.** Holds must be finite to avoid abandoned checkouts consuming availability, but a provider attempt may remain pending or unknown near the deadline. Releasing an ambiguous hold too early can leave a later captured payment without allocated stock.

| Option | Advantages | Disadvantages |
|---|---|---|
| Fixed, non-extendable TTL; release at deadline | Simple, bounded holds; easy worker logic | Higher late-capture risk during 3DS, provider delay, or network uncertainty |
| Extendable TTL on every checkout/client request | Flexible customer experience | Abuse and indefinite stock hoarding; client must not control extension |
| Single bounded extension for verified `requires_action`; uncertainty grace for `pending`/`authorized`/`UNKNOWN` | Balances customer action with bounded stock hold; no browser authority | More states/jobs/monitoring; requires provider evidence and approved grace values |

**APPROVED initial-release policy:** the server sets immutable `createdAt` and `initialExpiresAt` when Reservation is created; initial TTL is 15 minutes and effective `expiresAt` equals that deadline. No automatic extension is allowed, and the customer cannot extend it. If payment is `UNKNOWN` or still processing at `expiresAt`, enter `expiry_pending`, retain quantity in `reserved`, block new payment execution, and set `resolutionDeadline` to 10 minutes later. The grace period is for resolving the existing attempt only; it is not permission to create another payment attempt. A verified capture during grace may commit only while the Order remains eligible and all required checks pass. Verified terminal failure releases. At grace expiry, release through an idempotent operation; any later capture is a manual-review/compensation case. A provider call or client activity never extends a hold.

At a boundary race, Mongo conditional state/version transition decides the winner. Callback `occurredAt` alone is not proof that capture occurred before expiry. Expiry worker owns claims; duplicate jobs are harmless by `(reservationId, expiryGeneration/commandId)` uniqueness and active/due compare-and-set. A worker interruption leaves due records discoverable; transaction commits Reservation status, quantity, ledger, and outbox together or commits none.

## A2-02 — Cash on Delivery

**Problem.** COD is a collection method, not electronic authorization/capture. The existing Order stores `paymentMethod: cod`; there is no COD Payment adapter or collection record, and current Payment schema only accepts `paymentMethodType: card`.

| Policy | Advantages | Disadvantages |
|---|---|---|
| Confirm/commit at Order acceptance; collect on delivery | Reserves customer commitment and stock; simple fulfillment contract | More stock tied up in refused/fraudulent orders |
| Keep Reservation active until dispatch | Limits long committed stock | Expiry cannot apply cleanly to accepted orders; pick/dispatch races and oversell risk |
| Confirm only at dispatch | Less committed stock | Customer lacks accepted-order state; operational work may begin without accepted Order |

**APPROVED initial-release policy:** after checkout eligibility passes and the all-or-nothing Reservation is active, commit it before confirming the COD Order as `confirmed`. COD creates no electronic Payment and is not an electronic capture. Create a distinct `CODCollection` obligation in the Payments/collections boundary for collection during delivery, with immutable `collectionId`, `orderId`, `shipmentId`, amount due/currency from the Order snapshot, due/collected/refused/uncollected status, attempt and collection timestamps, collector identity, evidence reference, and idempotency key. Record collection as an authenticated courier/operator event; do not treat Order confirmation or delivery as collected money. Delivery refusal/failure is not collection. Returned goods increase `onHand` only after physical receipt and inspection. Initial scope supports full-amount COD only; partial collection is unsupported.

**Collection representation options:** create a normal card Payment before collection (rejected: it misrepresents an electronic attempt and current Payment schema is card-only); create no durable collection obligation (simple but loses amount-due and failed-attempt audit); create a distinct CODCollection record (recommended: separate cash due/collected/refused evidence without polluting the electronic Payment state machine; requires new Payment/collections domain support).

Proposed CODCollection lifecycle is `due → collected` on verified full cash handoff, or `due → failed_attempt/refused → due` for a permitted redelivery attempt; once delivery retries are exhausted, close as `uncollected` with Order/return disposition. `collected` is terminal for collection amount; courier remittance to merchant is a separate settlement status (`pending`, `settled`, `mismatch`) and must reconcile by collection ID. Each handoff/attempt has a unique event/idempotency ID. Partial/short collection is rejected initially, not rounded or treated as full collection.

If delivery is refused or fails, no collection is recorded. Fulfillment tracks the return-to-warehouse path and failed-attempt count; after retries are exhausted, the Order may be cancelled under policy. Shipped quantities remain deducted from `onHand` until physically received and inspected; accepted goods create a return event. Before dispatch, cancellation removes `committed`; after dispatch, cancellation alone cannot restore stock. Repeated delivery failures, reattempt count, COD customer eligibility, refusal fees, return shipping charges, and rescheduling require business policy approval.

## A2-03 — Complete stock lifecycle

Definitions: `onHand` is physical sellable quantity inside the warehouse, including held and committed units until the goods physically leave. `reserved` is a temporary hold included in onHand. `committed` is accepted Order allocation not yet dispatched, also included in onHand. `available = onHand - reserved - committed` is the quantity that may be newly reserved. Shipment reduces both onHand and committed by the shipped quantity, so it is counted neither as physical stock nor as an outstanding warehouse commitment afterward. This preserves availability across dispatch and prevents double deduction.

**Invariant alternatives:** subtract only `reserved` from `onHand` (simpler, but double-counts committed units as sellable and oversells); decrement `onHand` at commitment and keep a separate shipped counter (can work, but changes the meaning of onHand and complicates physical reconciliation); retain the Phase 6 model (recommended): `onHand` is physical in-warehouse units, including held/committed, and availability subtracts both `reserved` and `committed`. Dispatch decrements `onHand` and `committed` together, preserving `available` and avoiding double deduction.

The complete quantity transition table is in [the State Matrix](order-inventory-state-matrix.md). All stock mutations belong to Inventory and append one idempotent ledger fact atomically with the owning balance update. Refunds change financial records only; they never add stock. A return adds onHand only after physical receipt and inspection acceptance.

**APPROVED initial-release policy:** use all-or-nothing reservation and do not support partial shipment. Each Order is dispatched once as a whole. Any later partial-fulfillment capability requires a separate approval and line-level allocation/dispatch quantities with per-shipment idempotency.

## A2-04 — MongoDB transaction strategy

**Options:** single-document denormalized inventory counters (fewer transaction requirements but cannot atomically maintain multi-line Reservation/ledger/idempotency); read-then-write without transactions (unsafe under races and rejected); replica-set/sharded Mongo transaction (recommended because the current service architecture already uses sessions and transactions and it makes all-or-nothing multi-line reserve enforceable). Costs are transaction latency and infrastructure/operational requirements.

Multi-line reserve must use one Mongo transaction over conditional InventoryItem updates, Reservation, idempotency record, ledger, and outbox; an insufficient line aborts all changes. Each write also checks `onHand - reserved - committed >= requested`. A duplicate command with same key/hash returns the stored result; changed hash conflicts. On abort, no reservation/ledger/outbox mutation survives. Retry only labeled transient transaction/write-conflict errors, boundedly, with the same idempotency key and re-evaluated stock predicate. Do not retry validation, insufficient-stock, duplicate-key conflict with a changed request, or arbitrary errors.

Mongo transactions require a supported replica set or sharded deployment/configuration. The test suite uses a one-member `MongoMemoryReplSet`, and existing Payment code uses `withTransaction`; neither proves production topology. A read-only `hello` check of the local configured server returned no `setName` and no `isdbgrid`, consistent with standalone; no production URI/topology is in the repository. The local standalone does not support the multi-document transactions already used by Payment services. **Infrastructure gate:** verify production cluster type/version, transaction limits, write concern, failover behavior, and monitoring before Inventory writes are enabled. If transactions are unavailable, do not fall back to read-then-write or permit partial multi-line holds.

Local Mongo transaction may atomically persist state + ledger + outbox within one owning domain. It cannot include provider HTTP. Provider execution follows durable Payment attempt/outbox creation and runs externally. A verified webhook is durably recorded, then Payment/ledger/outbox update commits locally. At-least-once saga consumers invoke idempotent Inventory/Order commands; recovery scans retry or quarantine incomplete steps. Never hold a database transaction open around provider latency.

## A2-05 — Late capture and compensation

**APPROVED:** manual review/compensation is required for late capture. Automatic refund/void and replacement Reservation are not authorized by this policy; they require separately verified provider capabilities and explicit business approval. No choice may erase capture evidence.

Verified capture is an immutable financial fact and must be persisted to Payment/ledger even if Order is cancelled/expired or Reservation was released. It does not itself create stock, reopen a terminal Order/Reservation, or authorize fulfillment. A checkout timeout remains unresolved during `expiry_pending`; capture resolved while the hold remains and Order is eligible may commit. After the grace deadline or a competing cancel/expiry operation wins, classify `CAPTURE_AFTER_TERMINAL_ORDER` and open a high-priority reconciliation case. Conditional Order/Reservation version transitions serialize cancellation vs capture: if capture/commit/confirmation wins first, cancellation is a separate refund/committed-stock compensation; if cancellation wins first, later capture cannot reopen it.

Technical recovery: retry the same idempotent Inventory commit/Order command only while the Reservation remains eligible; otherwise retain the Payment fact, freeze fulfillment, record evidence/correlation, and alert. Business compensation: default to manual review until finance/provider owners approve automatic void/refund, timing, fees, customer communication, and accounting treatment. Automatic refund is allowed only after the configured provider's refund capability/idempotency/status contract is verified; no provider is currently enabled. A replacement Reservation is a new inventory allocation only when fresh stock is available, order/customer policy permits it, and the customer accepts any revised delivery terms. It never reopens the old Reservation. If unavailable, keep the Order terminal and resolve financially through approved compensation.

Audit record: original Payment/capture/event IDs and hashes, Order and Reservation IDs/states/versions, provider references, amount/currency, timestamps, inventory availability snapshot, reason code, all operator actions, chosen remedy, refund/void references, and final disposition. Only authorized Payments/finance operators may choose/refund; Inventory operators may correct stock only with separate role and reason. No user or generic admin status route can resolve this incident.

## A2-06 — Order states, migration, and admin operations

| Existing runtime state | Target state | Migration/action | Notes |
|---|---|---|---|
| `pending_payment` | `pending_payment` only after prerequisites; otherwise legacy review | Preserve raw value. Validate immutable snapshot, payment attempts, and Reservation linkage. Do not allow execution/confirmation until reconciled. | Current new Orders have snapshots but no Reservation. |
| `pending` | Undetermined; map to `confirmed` only with business acceptance evidence, otherwise migration review | Preserve raw legacy status and source. No bulk rename. | May include COD or manually edited Orders; status alone proves neither acceptance nor collection. |
| `shipped` | `shipped` only with shipment/handoff evidence | Preserve and attach evidence; otherwise migration review. | Does not prove payment collection or Inventory dispatch ledger exists. |
| `delivered` | `completed` only with delivery evidence | Preserve and attach evidence; otherwise migration review. | Does not prove COD collection, refund status, or prior stock deduction. |
| `draft` | `draft` | New target state; no legacy equivalent. | Unpayable and unconfirmed. |
| `confirmed` | `confirmed` | New target state only through approved lifecycle transition or evidence-backed migration. | Prepaid: verified capture + committed Reservation; COD: approved acceptance + committed Reservation. |
| `processing` | `processing` | New target state from trusted Fulfillment acceptance. | Not inferred from generic `pending`. |
| `completed` | `completed` | New target state from delivery/completion evidence. | Legacy `delivered` mapped only with evidence. |
| `cancelled` | `cancelled` | New target state through audited cancel workflow; legacy cancellation only from separate evidence. | Terminal; compensation separate. |
| `expired` | `expired` | New target state from expiry worker and Reservation terminal fact. | No old equivalent; never infer from age alone without policy/evidence. |

Migration uses a shadow classification report and an explicit evidence-backed mapping per Order; preserve the original status in immutable migration provenance. Unresolved rows stay in a restricted legacy/migration-review lane and cannot be charged, fulfilled, or auto-confirmed. Do not automatically rename stored states or calculate financial truth from status labels.

Admin transition contract (future runtime): actor is an authenticated role with least privilege; each command carries reason, expected source state/version, evidence reference, and idempotency key; append history/outbox in the same Order transaction. Fulfillment service owns `confirmed → processing → shipped → completed`; only documented pre-shipment cancellation paths may cancel; finance/payment compensation is separate. Generic status assignment is never a privileged transition.

**Admin write options:** keep current arbitrary assignment (rejected: bypasses ownership, payment/inventory and audit preconditions); immediately remove the route (safe but breaks current admin client); preserve read DTOs and route legacy writes through a compatibility adapter that accepts only an explicit command with preconditions, evidence, reason, actor, expected version, and idempotency (recommended for migration); freeze writes for unmappable legacy rows. Migration compatibility preserves GET/list DTO status strings during the read window. At cutover unrestricted writes must be frozen; route requires a lifecycle service. This document does not change the current route.

Privileged transition policy (target):

| Authorized actor | Source → target | Preconditions | Audit and idempotency |
|---|---|---|---|
| Checkout service identity | `draft → pending_payment` | Immutable server snapshot and active Reservation bound to same checkout/customer/Order; not expired | Checkout idempotency key/hash, Reservation ID, actor/service, expected version, history/outbox |
| Payment-to-Order coordinator | `pending_payment → confirmed` prepaid | Verified processed capture matches owner/Order/amount/currency; Reservation committed; Order eligible | Payment event ID, Payment and Reservation IDs, references, expected version; dedupe by event ID |
| Checkout/Order service identity | `pending_payment → confirmed` COD | COD eligibility/policy decision approved; Reservation committed; no electronic capture claim | Policy decision ID, Order/Reservation IDs, expected version, actor/service, history/outbox |
| Customer owning Order or order-operations role | `draft/pending_payment → cancelled` | No unresolved possible capture; active hold released. If captured, cancellation completion waits for separate compensation policy. | Actor/customer ID, reason, expected version, Payment/Reservation evidence; unique cancellation command ID |
| Expiry worker service identity | `draft/pending_payment → expired` | Deadline reached; no capture won; Reservation expired/released after any approved grace | Worker identity, deadline/generation, state versions, event ID; duplicate job returns same result |
| Fulfillment service identity or authorized fulfillment operator | `confirmed → processing` | Confirmed Order and committed allocation; fulfillment task accepted | Actor, task/reference, expected version, command ID |
| Fulfillment service identity or shipping operator role | `processing → shipped` | Carrier handoff evidence; Inventory dispatch succeeded exactly once | Shipment/dispatch IDs, actor, timestamps, expected version, unique command |
| Fulfillment service identity or delivery operator role | `shipped → completed` | Verified delivery evidence; COD full collection recorded or explicit collection exception linked | Delivery/collection evidence IDs, actor, expected version, command ID |
| Elevated order-operations role, exceptional | `confirmed/processing → cancelled` before dispatch only | Fulfillment stop acknowledged; Payment compensation and committed-stock release are separately tracked | Actor, elevated permission, reason, evidence, version, idempotency key; dual approval may be required by policy |
| Fulfillment/operations role, exceptional | `processing → cancelled` before dispatch only | Fulfillment stop and Inventory committed-stock cancellation recorded; after dispatch use return workflow | Actor, stop evidence, Inventory command ID, reason, expected version, idempotency key |

No admin role may set a raw target state. These role mappings and any dual-approval threshold require operations approval and must map to actual RBAC permissions in a later implementation.

## A2-07 — Product.stock migration

**Migration options:** one-time cutover is simple but raises reconciliation/rollback risk; dual-read/shadow comparison (recommended as temporary observation) detects drift without creating two authorities; independent dual-write (rejected except a strictly time-bounded adapter calling one Inventory authority) risks permanent divergence and duplicate changes. Current Product create/update accept stock; Product reads expose it, the product-detail UI displays it, and admin low-stock reporting queries it. It is not used for atomic reservation. Recommended migration: (1) inventory census, schema validation, and quarantine invalid/missing/negative/non-integer values; do not clamp or silently turn missing into zero; (2) prevent concurrent legacy stock edits during final snapshot using a maintenance/write freeze or a single-writer migration window; (3) idempotently create initial InventoryItem + `initial_stock` ledger event per eligible product with source/version; (4) compare counts, totals, and source mapping and resolve every mismatch; (5) shadow-read and report drift while Product remains read source; (6) cut over all stock writes to Inventory service and all availability reads to Inventory behind a reversible flag; Product.stock becomes read-only compatibility projection; (7) remove Product stock consumers only after stable reconciliation.

Do not dual-write independently from Catalog and Inventory. If a temporary compatibility write adapter is unavoidable, it must synchronously call the one Inventory authority and be time-bounded, idempotent, monitored, and removed at cutover. Rollback keeps Inventory ledger and restores a reviewed snapshot; reconcile movements before any Product projection fallback. Never switch to stale Product.stock or discard ledger. Invalid source records remain unsellable/quarantined pending operator correction with an audit trail.

## A2-08 — Retry after a failed prepaid Payment

The Payment state machine makes `failed` terminal. A retry must not reopen a Payment or reuse an idempotency key for a different operation. Recommend allowing a new Payment attempt only after a verified terminal no-capture failure/cancellation, while the Order remains `pending_payment`, the Reservation remains active (or valid in `expiry_pending`), and method/policy allow retry. Each attempt has a new Payment ID/key and immutable link to the same Order; Payment execution attempts must be unique per Payment attempt rather than globally one per Order. UNKNOWN/authorized outcomes are not retryable until resolved. If Reservation expires or Order becomes terminal, the new attempt is rejected. Retry count/backoff/customer eligibility are business approvals.

**Options:** no retry (simple, high abandonment); retry under one Payment identity (conflicts with terminal Payment semantics and audit); new Payment attempt per Order (clear ledger/history, but requires attempt limits and duplicate-charge controls). Recommend the third. Owner approval is required for retry limits and eligible failure codes; Payments architecture approval is required for attempt cardinality.

## Provider-specific constraint

Paymob `success=true` does not establish capture for this design. Step 14 records unresolved semantics for the configured Unified Checkout Integration ID and an HMAC field-set concern. Keep all payment-to-Order confirmation blocked until provider-specific capture fields/contract are verified for that Integration ID and independently normalized to trusted `captured` evidence. This is not a business-policy approval and does not enable Paymob.

## Approval record

Workstream A3 explicitly approved the initial-release policies marked APPROVED in this register. It did not approve the unresolved A2-06 Order migration/admin-write mapping or A2-08 Payment retry policy, and it did not resolve separate cancellation/refund or COD refusal operations policy. Production MongoDB topology/transaction support and configured Paymob capture semantics remain technical release gates. This record does not claim runtime implementation or production readiness.
