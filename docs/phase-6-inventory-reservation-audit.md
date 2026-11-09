# PHASE 6 — Inventory & Reservation Audit

Status: Documentation-only audit and contract design. No runtime inventory logic has been implemented in this phase.

This document uses three explicit classifications throughout:

- CURRENT: behavior verified in the repository at audit time.
- TARGET: the proposed Inventory contract for a future implementation phase.
- DEFERRED: implementation work and unresolved business policies that are not authorized here.

## Scope

This audit documents the current repository behavior for product stock, cart quantity, and order creation. It also defines the target architecture for a future inventory/reservation domain without changing any live runtime code.

## Executive Summary

The current system treats stock as a numeric catalog field on the product record, not as an authoritative inventory ledger or reservation state machine.

Current behavior:

- Product stock is a Number field on the product document.
- Product creation and product update accept stock directly from admin input.
- Cart items store quantity and snapshot metadata, but no reservation or stock availability check is enforced.
- Order creation accepts item payloads and totalAmount from the request; it does not decrement stock or reserve inventory.
- Admin dashboard uses Product.stock <= 5 as a reporting signal, not as a business control.
- Redis is configured as a cache layer only; it is not used for inventory locking or reservations.

This means the system currently has no oversell prevention, no atomic inventory decrement, no reservation expiration, and no failed-payment release loop.

## Current Ownership and Authority

### 1) Product stock ownership

Current stock ownership is catalog-level and operational, not domain-authoritative:

- [backend/models/productModel.js](../backend/models/productModel.js) defines stock as a numeric field with min 0 and a default of 0.
- [backend/controllers/productController.js](../backend/controllers/productController.js) creates and updates products using request data for stock.
- [backend/controllers/adminController.js](../backend/controllers/adminController.js) reads stock for low-stock reporting only.

This means Product.stock is the current persisted quantity exposed to the storefront and admin UI, but it is not authoritative checkout availability. It is not a reservation ledger and is not protected by inventory transaction logic.

### 2) Cart ownership

Cart behavior persists user shopping state, but it is not inventory-authoritative:

- [backend/models/cartModel.js](../backend/models/cartModel.js) stores quantity and item metadata.
- [backend/controllers/cartController.js](../backend/controllers/cartController.js) appends or updates quantities without checking live stock.

Cart quantity can grow without any validation against current product stock. The cart is a user intent bucket, not a reservation record.

### 3) Order ownership

Order creation is a snapshotting flow, not an inventory movement flow:

- [backend/models/orderModel.js](../backend/models/orderModel.js) stores item price, quantity, and product metadata as a historical snapshot.
- [backend/controllers/orderController.js](../backend/controllers/orderController.js) creates an order from request data and clears the cart.

The order model does not include inventory reservation references, stock movement history, or settlement state. In the current implementation it can be created as pending before payment completion; it is not a record of finalized stock movement.

## Current Runtime Behavior by Layer

### Product model

Evidence: [backend/models/productModel.js](../backend/models/productModel.js)

Observed behavior:

- price remains required for compatibility.
- stock is a Number field with `default: 0` and Mongoose `min: 0`.
- stock is mutable through product create/update endpoints.
- no inventory ledger, reservation object, or stock version field is defined.
- the field is returned as part of normal product reads; the storefront displays it as availability and admin pages display/manage it.
- `getProducts` and `getProductById` in productController return Product documents without excluding stock; `getDashboardSummary` in adminController reads it for low-stock reports.

Conclusion:

Product.stock is currently the sole stored stock value used for display and admin reporting. It is not an authoritative reservation-aware availability resource and does not protect checkout.

### Product create/update

Evidence: [backend/controllers/productController.js](../backend/controllers/productController.js)

Observed behavior:

- `createProduct` in productController destructures stock from req.body and passes it to Products.create.
- `updateProduct` in productController includes stock in updateData and passes it to Products.findByIdAndUpdate.
- `seed` in backend/seed.js inserts initial stock values with Products.insertMany.
- `createProductSchema` and `updateProductSchema` in controllers/validation/productValidation.js require a non-negative integer when stock is supplied through the admin Product API. The Mongoose field has min: 0; there is no MongoDB collection-level check constraint.
- there is no validation against a reservation ledger, no stock allocation check, and no concurrency guard.

Conclusion:

Stock edits are direct CRUD updates on the product record. Through the normal admin route negative values are rejected by Joi; Product document validation also has min: 0. Product update uses findByIdAndUpdate without runValidators, and direct database writes or code bypassing route validation are not constrained by a MongoDB check, so a negative persisted value is possible outside the validated API path. Concurrent admin edits have no expected-version or conflict policy. MongoDB makes an individual document write atomic, but that is not an availability predicate and does not prevent overselling.

### Cart add/update flow

Evidence: [backend/controllers/cartController.js](../backend/controllers/cartController.js)

Observed behavior:

- addToCart accepts product_id, quantity, name, price, image, category.
- it updates the cart by quantity without checking stock availability.
- updateCartItem changes item quantity with a basic minimum check only.
- removeCartItem simply deletes the item.

Conclusion:

Cart is client-initiated intent and quantity state. It does not reserve inventory or enforce sellability.

The frontend product detail currently renders Product.stock as an availability label/count. That is presentation based on the legacy field, not a cart or checkout guarantee. Neither the cart API nor its model reads stock.

### Order creation flow

Evidence: [backend/controllers/orderController.js](../backend/controllers/orderController.js)

Observed behavior:

- createOrder reads items, shippingAddress, couponCode, paymentMethod, totalAmount from req.body.
- if a coupon is passed, it is validated and the discount is calculated.
- Order.create is called immediately.
- Cart.findOneAndDelete removes the user cart.
- no Product.stock mutation occurs.
- no reservation is created before order creation.

Conclusion:

The server accepts order details from the request and writes them as a pending order record; this is not proof of completed payment or fulfillment. It does not verify stock availability or decrement stock. Oversell risk remains if a client sends quantities unsupported by stock or duplicate product lines.

### Checkout and payment interaction

Evidence: [frontend/src/pages/CheckoutPage.jsx](../frontend/src/pages/CheckoutPage.jsx), [backend/controllers/paymentController.js](../backend/controllers/paymentController.js), [backend/routers/paymentRouter.js](../backend/routers/paymentRouter.js)

CURRENT:

- Checkout submits order items and totalAmount to the Orders API; the backend creates the pending order and clears the cart.
- Card flow creates a Stripe PaymentIntent from a frontend-calculated amount and then the browser calls Stripe confirmation.
- The backend currently exposes an authenticated POST /api/payments/intent route, but no verified webhook route or inventory confirmation/release integration is present.
- No frontend payment success callback may be treated as an inventory authority signal.

TARGET: payment state is established server-side from a verified provider webhook or an equivalent trusted provider confirmation. Inventory confirmation is driven by the server-side Payment/Checkout orchestration after validating the payment/order relationship; browser redirects and client callbacks are informational only.

DEFERRED: payment provider integration, webhook processing, order/payment state transition integration, and inventory reservation coordination.

### Admin low-stock reporting

Evidence: [backend/controllers/adminController.js](../backend/controllers/adminController.js)

Observed behavior:

- getDashboardSummary queries Products.find({ stock: { $lte: 5 } }).sort({ stock: 1 }).limit(5).lean().
- this is a report, not enforced logic.

Conclusion:

Low-stock detection is informational only. It does not block purchases or allocate stock.

### Redis and cache layer

Evidence: [backend/server.js](../backend/server.js), [backend/utils/cache.js](../backend/utils/cache.js)

Observed behavior:

- Redis is optional and only connected if REDIS_URL exists.
- cache functions include get/set/invalidate for product listing cache.
- no locking, reservation, or stock versioning logic exists in the cache layer.

Conclusion:

Redis is a caching utility, not an inventory coordination mechanism. It cannot serve as the authoritative stock manager under the current architecture.

CURRENT concurrency/transaction findings: a repository search found no Mongoose session, startSession/withTransaction use, inventory lock, queue, scheduled worker, or reservation expiry job. Existing application writes use direct Mongoose model operations. There is no cross-document transaction around cart, order, payment, or stock. The optional Redis client is only used by cache functions and is not used for locking. No stock decrement occurs during order creation and there is no order cancellation state/route today; the current order status enum is pending, shipped, delivered.

## Missing Inventory Semantics

The current codebase does not implement any of the following:

1. Reservation ledger and explicit reservation lifecycle
2. Atomic conditional reservation with concurrent oversell prevention
3. Inventory and reservation transaction boundaries
4. Idempotency for retryable commands
5. Failed-payment, cancellation, timeout, and late-webhook behavior
6. Reservation expiry worker/claim protocol
7. Inventory movement audit trail
8. Sellable SKU/variant identity and warehouse scope
9. Manual stock adjustment with actor, reason, and audit history
10. Server-authoritative Checkout/Orders/Payments orchestration

These omissions mean the system is not ready to support reliable multi-user inventory protection.

## Risk Assessment

| Area | Current behavior | Risk |
| --- | --- | --- |
| Product stock | Numeric field updated directly from admin payloads | Stock can drift from real sellable availability |
| Cart | Quantity is incremented without stock availability checks | Overbooking before order placement |
| Order creation | Order can be created without stock validation | Oversell and inconsistent inventory |
| Payment lifecycle | No reservation confirmation/release boundary | Inventory may be unavailable or stale after failed/abandoned checkout |
| Concurrency | No atomic stock mutation or lock | Race conditions under simultaneous purchases |
| Reporting | Low-stock queries only | Alerts do not protect the business |

## Target Architecture for Future Inventory & Reservation

This is the design contract for a future phase. It is intentionally deferred and not implemented in this document phase.

### Proposed ownership model

Inventory becomes a dedicated domain with explicit authority:

- Catalog owns product definitions and static metadata.
- Pricing owns commercial price definitions and resolution; Promotions owns coupons and promotional rules.
- Inventory owns stock availability, reservations, and movement history.
- Cart owns user intent only.
- Orders own immutable order snapshots; payment state remains a separate Payments responsibility.
- Payments own confirmation/failure state transitions.

### Proposed core entities and identity

1. InventoryItem (aggregate root)
   - inventoryId
   - sellableId: stable Catalog SKU/variant identity; a simple Product identity is a migration bridge only
   - warehouseId: explicit scope, initially one default warehouse
   - onHand: physical units not yet dispatched, including reserved and committed units
   - reserved: temporary holds for active reservations
   - committed: confirmed order units not yet dispatched
   - version
   - createdAt / updatedAt
   - available is derived as onHand - reserved - committed; do not independently mutate a cached available counter

2. Reservation
   - reservationId
   - checkoutId and userId
   - lines: inventoryId, sellableId, warehouseId, quantity
   - status: created | active | confirmed | released | expired | cancelled
   - expiresAt, createdAt, updatedAt
   - orderId and payment reference when confirmed
   - idempotencyKey and requestHash

3. InventoryLedgerEntry (append-only)
   - ledgerEntryId
   - inventoryId, sellableId, warehouseId
   - eventType and signed quantity delta
   - before/after values for onHand, reserved, committed, and derived available
   - referenceType/referenceId (reservation, order, payment, adjustment, return, or correction)
   - actorId/actorType, reason, idempotencyKey, occurredAt, recordedAt

4. InventoryService
   - reserve(command): all-or-nothing reservation for the requested checkout lines
   - confirm(reservationId, orderId, paymentReference, idempotencyKey)
   - release(reservationId, reason, actor, idempotencyKey)
   - expire(reservationId, idempotencyKey)
   - adjust(inventoryId, delta, reason, actor, idempotencyKey)

5. Identity rules
   - Inventory is keyed by sellable identity, not display Product family. A Catalog ProductVariant SKU is the target sellable key when variants exist.
   - For the initial single-store/simple-product migration, one legacy Product ID maps to one sellable identity and one default warehouse.
   - Do not put price, PriceBook, PriceDefinition, order totals, or payment status on InventoryItem.
   - Future marketplace scoping can add sellerId/tenantId to the identity and unique keys without granting Inventory ownership of Catalog or Pricing data.

### Reservation lifecycle and legal transitions

The Reservation record lifecycle is distinct from the aggregate-level inventory allocation lifecycle named in the Phase 3 state-machine overview (`available`, `reserved`, `committed`, `released`, `expired`). The Phase 3 domain model's simplified available/reserved/committed quantities are refined here to `onHand`, `reserved`, and `committed`, with `available` derived. `created` is the pre-allocation state within the reserve transaction; success commits the reservation as `active`, while an aborted transaction persists neither reservation nor hold. An explicit cancellation before allocation may terminate a created request. Phase 6 adds this Reservation-level detail without changing aggregate ownership.

Legal transitions:

| From | To | Authority / condition |
| --- | --- | --- |
| created | active | Reserve command atomically allocates all requested lines |
| created | cancelled | Request is explicitly abandoned before allocation; no quantity was held |
| active | confirmed | Checkout authorizes order confirmation from verified server-side provider state, before expiry |
| active | released | Checkout/payment failure, authorized cancellation, or explicit release |
| active | expired | Expiry worker claims an elapsed TTL |
| confirmed | no transition | Reservation is terminal; pre-dispatch cancellation or post-dispatch return is a separate inventory/order operation |
| released / expired / cancelled | no transition | Terminal; correction is a new compensating event, not reopening the old reservation |

Duplicate commands in the same idempotency scope return the original result. Conflicting commands against terminal states return a stable conflict unless the command is an exact replay.

### Reservation lifecycle operation

- Cart remains intent only; checkout resolves Catalog sellable identity, Pricing quote, and policy, then requests inventory reservation.
- Reservation is active only after all requested lines are allocated and the transaction commits; partial reservation is rejected by default.
- Payment success is recognized only by verified server-side provider state/webhook, not by frontend callback.
- Confirmation moves quantity from reserved to committed and links the order/payment references.
- At fulfillment dispatch, decrement onHand and committed together; a pre-dispatch order cancellation decrements committed only. A return adds onHand only after inspection/acceptance.
- Provider failure, explicit cancellation, or expiry releases reserved quantities. Late payment after expiry enters a reconciliation/compensation path; it must not silently reconfirm expired stock.
- Orders own immutable commercial/order snapshots; inventory only stores references and quantities.
- Every balance transition appends a ledger entry in the same transaction.

### Required invariants

The future inventory contract must guarantee:

- `reserved + committed <= onHand` for each inventory item and warehouse.
- `available = onHand - reserved - committed` and `available >= 0` at all times.
- `onHand`, `reserved`, and `committed` are non-negative integers; all quantities use the same base unit for a sellable.
- A reservation may be confirmed, released, expired, or cancelled at most once; only active reservations hold quantity.
- Every committed/reserved/onHand change has exactly one corresponding append-only ledger event in the same transaction.
- Order snapshots are immutable and Inventory cannot rewrite price, discount, tax, shipping, currency, or order totals.
- Stock adjustment may not lower onHand below reserved + committed; physical count corrections require explicit reason and audited compensating event.

### Atomicity and concurrency strategy

TARGET: MongoDB is the authority for inventory writes. Do not use a read-stock / calculate-in-application / write-stock sequence.

- Each InventoryItem has a unique key on `(sellableId, warehouseId)` (plus `sellerId` if marketplace tenancy is introduced) and a version.
- Reservation uses an atomic conditional update whose predicate proves `onHand - reserved - committed >= requestedQuantity`, then increments `reserved` and version. A zero-match result is `INSUFFICIENT_STOCK` or a retryable version conflict. The condition and mutation happen in one database write.
- For multi-line checkout, InventoryItem conditional updates, Reservation creation, ledger entries, and idempotency record are committed in one MongoDB transaction. Any line failure aborts all lines. No partial reservation by default.
- Optimistic version checks detect competing changes and bound retries; retry only transient transaction/write conflicts with the same idempotency key and bounded backoff. Re-evaluate the atomic availability predicate on retry.
- Unique indexes prevent duplicate `(scope, idempotencyKey)` command records and duplicate ledger event keys. Unique identity indexes prevent two InventoryItems for one sellable/warehouse scope.
- MongoDB transaction support requires a replica set (including a supported single-node replica set in development). If the deployment cannot provide transaction semantics for multi-document operations, do not enable reservation; do not silently fall back to a read-then-write algorithm.
- Redis locks are not selected: Redis is optional/cache-only, a lock is not atomic with MongoDB writes, and lease expiry/process failure can split lock ownership from persisted state. Redis may remain a cache or non-authoritative coordination aid, never the stock authority.
- MongoDB transactions protect local multi-document atomicity; provider calls are never held inside a long-running database transaction. Use an outbox/compensation workflow for cross-boundary events.

### Transaction boundaries

| Operation | Required atomic writes |
| --- | --- |
| Reserve | conditional InventoryItem increments + Reservation active state + idempotency record + ledger entries for every line |
| Confirm | conditional active-to-confirmed Reservation transition + reserved decrement/committed increment + ledger entries + outbox event |
| Release/cancel | conditional active-to-terminal Reservation transition + reserved decrement + ledger entries + outbox event |
| Expire | conditional active-and-expired claim/transition + reserved decrement + ledger entries + outbox event |
| Manual adjustment | InventoryItem onHand/version mutation + immutable ledger entry + idempotency record |

All listed multi-document operations require a MongoDB transaction. A single InventoryItem document update is itself atomic, but that alone cannot atomically maintain a separate reservation, idempotency record, ledger, and outbox. No provider API call belongs inside these transactions. Transaction transient errors may be retried with the same idempotency key; validation/business conflicts are not retried blindly.

### Idempotency and retries

For `reserve`, `confirm`, `release`, `expire`, and `adjust`:

- Require a client-generated idempotency key for externally initiated commands; worker/system operations use a deterministic key derived from reservation and operation/version.
- Scope uniqueness by `(tenant-or-store, operation, actor/checkout context, idempotencyKey)`; persist a canonical request hash, status/result, and timestamps. Enforce uniqueness with a MongoDB unique index.
- An exact duplicate with the same key and request hash returns the stored original result without another balance or ledger mutation.
- Reuse of a key with a different request hash returns `409 IDEMPOTENCY_KEY_REUSED`.
- Unknown outcome after timeout is retried using the same key. Transient transaction failures retry a bounded number of times; exhausted retries return a retryable service error while preserving the same key for the caller.
- Duplicate confirm/release/expire that matches the already-recorded terminal outcome returns the original outcome; an incompatible transition returns `409 RESERVATION_STATE_CONFLICT`.
- Expiry workers may race; conditional active-state transition plus unique idempotency/event key ensures only one worker releases quantity.

### Append-only inventory ledger

Ledger entries are insert-only. No update/delete of historical entries; corrections add a compensating entry referencing the original. Required event types include `initial_stock`, `adjustment`, `reservation`, `release`, `expiration`, `confirmation`, `commitment`, `return`, `cancellation`, and `correction`.

Each entry includes `inventoryId`, `sellableId`, `warehouseId`, `eventType`, signed `quantity`, before/after snapshots for onHand/reserved/committed/available, `referenceType`, `referenceId`, `actorId` and actor type, `reason`, unique `idempotencyKey`/event key, and event/record timestamps. The ledger records both the business reference and the resulting balance state. Initial stock is represented by an explicit initial-stock event, not an unlogged default.

### Manual stock adjustment

Only an authenticated inventory administrator/service may adjust stock. Require a signed integer delta, reason code and human-readable reason, actor, warehouse/sellable identity, and idempotency key. Reject adjustments that violate quantity invariants or reduce onHand below reserved + committed. Corrections never rewrite old ledger entries; they append a correction referencing the discrepancy and source evidence. Catalog product edits must not directly write InventoryItem after cutover.

### Failure and partial-reservation policy

- Unknown/inactive sellable or missing inventory record: reject without reservation (`SELLABLE_NOT_FOUND` / `INVENTORY_NOT_FOUND`). Catalog owns sellable lifecycle; Inventory owns its scoped quantity.
- Insufficient quantity for any requested line: abort every line and return `409 INSUFFICIENT_STOCK` with safe per-line availability information; do not persist a partial active reservation by default.
- Duplicate product/SKU lines: normalize by sellable + warehouse before reserve; reject malformed/non-positive/non-integer quantities.
- Database conflict: retry only transient conflicts with same idempotency key; otherwise return a retryable error without partial writes.
- Payment failure/cancel: release active reservation exactly once.
- Expiry/payment race: one conditional transition wins. A late verified payment after expiry is not allowed to recreate inventory; route to payment reconciliation/refund/manual exception handling.
- Worker crash: transaction either commits the reservation transition and ledger together, or commits none; expired records remain discoverable for retry.
- Manual adjustment conflict: reject if it violates reserved/committed invariant; require explicit administrative correction workflow.
- Partial reservation: unsupported by default. A future partial-fill policy needs explicit per-line semantics and client consent before implementation.

### Application service, repository, and domain event contracts

TARGET application service commands:

- `reserve(command)` — authenticated customer/Checkout ownership, normalized lines, TTL, idempotency key; returns reservation ID, status, expiry, reserved lines, and safe availability summary.
- `confirm(reservationId, orderId, verifiedPaymentReference, idempotencyKey)` — callable only by server-side Checkout/Payments orchestration after verified provider state.
- `release(reservationId, reason, actor, idempotencyKey)` — Checkout/Payments/system; validates ownership and active state.
- `expire(reservationId, idempotencyKey)` — internal worker only; atomically claims expired active reservations.
- `adjust(inventoryId, delta, reason, actor, idempotencyKey)` — admin-authorized command with audit reason.
- `getAvailability(sellableId, warehouse/context)` — read-only; returns derived availability and timestamp, never a promise/hold.

TARGET InventoryRepository contract:

- `findBySellableAndWarehouse(sellableId, warehouseId)`
- `reserveConditionally(inventoryId, quantity, session)`
- `transitionReservation(reservationId, expectedStatus, nextStatus, session)`
- `applyCommitOrRelease(inventoryId, quantity, operation, session)`
- `appendLedger(entry, session)`
- `findExpiredActive(asOf, limit)`
- `adjustConditionally(inventoryId, delta, expectedVersion, session)`
- `findIdempotentResult(scope, key)` / `storeIdempotentResult(record, session)`

Repository implementations own atomic predicates, unique-index expectations, and session participation; application services orchestrate but do not use read-then-write stock logic.

TARGET domain/outbox events are immutable facts: `InventoryStockInitialized`, `InventoryStockAdjusted`, `InventoryReservationActivated`, `InventoryReservationConfirmed`, `InventoryReservationReleased`, `InventoryReservationExpired`, `InventoryCommitted`, `InventoryReturned`, and `InventoryCorrected`. Persist event/outbox records in the same database transaction as state and ledger changes; consumers are at-least-once and idempotent. Current runtime has no such event publisher/outbox.

### TARGET API contract — NOT IMPLEMENTED

These are proposed API semantics, not current routes. Authentication uses the existing Phase 2 JWT contract. Customers may only reserve/read their own checkout context; only trusted server-side Checkout/Payments services may confirm or release for payment outcomes; inventory administrators may adjust stock. Never expose a browser-authorized endpoint that can confirm payment or set committed quantity.

| Endpoint | Access / ownership | Request | Response and errors |
| --- | --- | --- | --- |
| `GET /api/v1/inventory/availability/:sellableId` | Public or authenticated read according to Catalog visibility; no reservation ownership | Optional warehouse/context only; no quantity mutation | `{ sellableId, warehouseId, available, asOf }`; `400 INVALID_SELLABLE_ID`, `404 SELLABLE_NOT_FOUND` |
| `POST /api/v1/checkout/:checkoutId/reservations` | Authenticated customer owns checkout; `Idempotency-Key` required | `{ lines: [{ sellableId, warehouseId?, quantity }] }`; positive integer quantities, valid IDs, deduplicated lines | `201 { reservationId, status: active, expiresAt, lines }`; `401`, `403`, `404`, `409 INSUFFICIENT_STOCK`, `409 IDEMPOTENCY_KEY_REUSED`, `422 VALIDATION_ERROR`, `503 RETRYABLE_CONFLICT` |
| `GET /api/v1/inventory/reservations/:reservationId` | Authenticated owner or admin; internal service may use service identity | No body | Reservation DTO with owner-scoped safe fields; `401`, `403`, `404` |
| Internal `confirm/release/expire` commands | Service identity only; not browser-callable | Reservation/order/payment references, reason, idempotency key | Stable transition result; `409 RESERVATION_STATE_CONFLICT`, `404`, `422`, retryable `503` |
| `POST /api/v1/admin/inventory/:inventoryId/adjustments` | JWT + inventory-admin permission; actor derived from token | `{ delta, reasonCode, reason }` and `Idempotency-Key` | Adjustment + resulting quantities; `400`, `401`, `403`, `404`, `409 INSUFFICIENT_STOCK` / idempotency conflict, `422` |

All request DTOs reject unknown fields, malformed ObjectIds, non-integer/zero/negative quantities, invalid warehouse/sellable ownership, excessive lines, and client-supplied balances. Responses expose derived availability, not mutable model internals. Errors are stable, redacted, and do not include stack traces or database messages. Availability reads are advisory and never guarantee a hold.

### Multi-warehouse and marketplace readiness

InventoryItem keys include warehouse from the beginning, with one configured default warehouse in the first implementation. The initial reserve contract is single-warehouse and all-or-nothing. Warehouse selection, split sourcing, transfers, safety stock, backorders, and fulfillment allocation remain deferred. A later multi-warehouse allocator must reserve per warehouse in a transaction and return the actual allocation.

The current business is single-store, with no seller/merchant identity. Keep the modular monolith; do not add marketplace behavior now. The key can later include sellerId/tenantId, with unique scope `(tenantId, sellerId, sellableId, warehouseId)`, seller-scoped adjustment authorization, and disjoint stock pools. Commission, seller settlement, payouts, and marketplace payment orchestration remain deferred.

### Non-destructive Product.stock migration

Migration is deferred until Inventory writes and reads are implemented, observed, and validated. Never delete or rewrite Product.stock or order history as part of backfill.

1. Backfill: create one InventoryItem per eligible simple Product in the default warehouse, mapping `sellableId = Product._id` as a compatibility mapping and `onHand = validated Product.stock`; emit an `initial_stock` ledger entry with migration actor/source, timestamp, and idempotency key. Preserve the Product ID.
2. Validate/reconcile: compare source Product.stock with new onHand, report missing/duplicate/negative/invalid records, verify all ledger totals and invariants, and require explicit resolution for mismatches before cutover.
3. Optional dual-read: shadow-read Inventory availability while Product.stock remains serving; compare results and alert without changing checkout decisions.
4. Optional dual-write: only through one Inventory service/outbox path with idempotent reconciliation; do not let Product API and Inventory both independently mutate quantities. Prefer avoiding dual-write; if required, designate a single write authority and monitor drift.
5. Cutover: switch availability reads and all stock mutation commands to Inventory behind a reversible feature flag; stop Product.stock writes; preserve Product.stock as a read-only compatibility field while consumers migrate.
6. Rollback: switch reads back only if Inventory ledger is retained; reconcile Inventory changes into a reviewed Product.stock snapshot before any compatibility fallback. Never discard inventory events or overwrite confirmed orders. Rollback must not re-enable dual authorities.
7. Legacy deprecation: after all API/UI/seed/admin consumers have migrated and reconciliation is stable, deprecate Product.stock from DTOs and writes, then remove it only in a separately approved schema migration with backup and rollback plan.

### Inventory implementation testing contract — DEFERRED

Functional:

- availability derived from onHand/reserved/committed
- reserve success, insufficient stock, all-or-nothing multi-line failure
- confirm, release, expire, manual adjustment, return, and correction
- invalid sellable/warehouse and invalid quantity handling

Concurrency:

- simultaneous reservations against one item
- exact-stock reservation succeeds once and never exceeds onHand
- two requests racing for the final one unit: exactly one succeeds
- duplicate reserve with same key returns the same reservation and single ledger movement
- duplicate confirm and duplicate release are harmless replays
- release/expiry worker race releases only once
- transaction conflict retry and terminal-state transition races preserve invariants

Security:

- unauthenticated reserve/adjust/owner reads rejected
- another customer cannot inspect, release, or confirm a reservation
- customer cannot adjust stock; browser cannot confirm based on frontend payment success
- malformed IDs/unknown fields rejected before database casts
- errors do not leak internal stack, MongoDB errors, or secrets
- actor/reason are server-validated and cannot be spoofed through request body

Regression/compatibility:

- Product.stock remains available during the approved migration window and existing Catalog CRUD behavior is not accidentally converted into inventory authority
- Catalog identity/publication and SKU resolution remain separate from Inventory quantity
- Pricing PriceBook/PriceDefinition/ResolvedPrice ownership and Phase 5 resolver behavior remain unchanged; Inventory never accepts price/totals
- Phase 2 JWT, RBAC, token, webhook verification, and security rules remain intact
- Orders retain immutable snapshots; payment amount comes from server-authoritative Order and verified payment state, not inventory or frontend
- migration backfill is idempotent, non-destructive, reconcilable, and rollback-tested

### Documentation and cross-phase consistency

- Phase 3 architecture contracts define canonical ownership and transaction/concurrency principles; this audit adds Inventory-specific detail without changing those boundaries.
- Phase 4 Catalog owns Product identity/metadata/classification/lifecycle/publication/media. ProductVariant/SKU is the target sellable identity; Inventory owns only quantity/availability. Product.stock remains legacy compatibility until migration.
- Phase 5 Pricing owns commercial price, PriceBook, PriceDefinition, and resolution. Inventory does not redefine or persist price, discount, currency, or order totals.
- Orders own immutable order snapshots; Payments own payment state/ledger. Inventory stores references only and commits only after server-authoritative verified payment/order orchestration; client payment success is not authority.
- The architecture index must link this Phase 6 audit. Its target details refine, rather than replace, the canonical ownership documents.
- CURRENT/TARGET/DEFERRED labels are mandatory when quoting code behavior versus proposed contracts.

### Future transaction boundary

The future design should avoid direct product stock mutation from the cart or order routes. Instead, all stock changes must pass through an inventory service that performs atomic operations and records ledger events.

## Deferred Decisions

The following are explicitly deferred and are not implemented in this phase:

- introducing a new inventory collection or dedicated reservation model
- modifying Product.stock semantics in live runtime code
- adding reservation expiration jobs
- creating payment-confirmation inventory transitions
- implementing concurrency-safe checkout orchestration
- moving cart quantity validation to the inventory service

## Contract Status

| Area | Current state | Target state | Status |
| --- | --- | --- | --- |
| Product.stock | Numeric legacy field exposed by Product reads and admin UI; admin create/update writes | Inventory aggregate keyed by sellable and warehouse | Deferred |
| Cart quantity | User-driven without stock validation | Reservation-bound quantity eligibility | Deferred |
| Order creation | Snapshot-only order creation | Confirmed stock deduction after payment | Deferred |
| Reservation | None | Explicit lifecycle, TTL, idempotency, atomic transitions | Deferred |
| Ledger | None | Append-only, before/after balances, actor/reason/reference | Deferred |
| Redis / queue | Optional product cache; no inventory worker/queue | MongoDB is authority; Redis lock is not selected | Deferred |

## Conclusion

The repository currently has stock as a catalog metric and not as a reservation-aware inventory system. The code does not enforce availability during cart updates or order placement, and there is no atomic stock movement or release mechanism.

The correct architecture for the next inventory phase is to create a dedicated inventory domain with reservation and ledger records, then route all stock-affecting flows through that service. This document is the contract definition only; no runtime code has been changed as part of this audit.
