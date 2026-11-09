# PHASE 8 — Order Lifecycle Audit

Status: Documentation-only audit and target Order lifecycle contract. No runtime implementation, schema change, or migration is authorized in this step.

Every statement is classified as one of:

- CURRENT: verified runtime behavior.
- TARGET: intended Order contract for future implementation.
- LEGACY: existing stored/API behavior retained temporarily for compatibility.
- GAP: target behavior absent from runtime.
- DEFERRED: implementation or policy decision outside this documentation-only step or owned by another phase.

## 1. Executive Summary

CURRENT: Order is a Mongoose document created directly by `orderController.createOrder` from authenticated client input. Its `status` enum is `pending`, `shipped`, `delivered`. It stores line metadata and numeric major-unit prices, a shipping-address object, optional Coupon reference, `paymentMethod`, client `totalAmount`, and separately calculated `discount`. There is no public order number, separate payment state/reference, fulfillment record, reservation reference, lifecycle history, cancellation endpoint, or application idempotency record.

CURRENT: customers can list their own Orders and read one by Mongo `_id`; admins can list/read all and set any of the three enum statuses. Current tests cover basic creation, admin rejection/status change, and owner/admin reads, but not the complete lifecycle.

TARGET: Orders own the immutable accepted Order snapshot and Order status/history only. Catalog, Pricing, Promotions, Tax, Shipping, Inventory, Payments, and Fulfillment remain separate owners; Order references their accepted results without reconstructing the transaction from mutable live records.

## 2. Current Order Runtime Audit

### Model and item schema

[backend/models/orderModel.js](../../backend/models/orderModel.js) defines:

- `_id`: MongoDB ObjectId, generated internally; no distinct public `orderNumber`.
- `user`: required ObjectId reference to `users`.
- `items[]`: optional `product` ObjectId ref; required `product_id`, `name`, and numeric `price`; required `quantity` (minimum 1); optional `image` and `category`.
- `shippingAddress`: required `fullName`, `phone`, `line1`, `city`, `country`; optional `line2`, `state`, `postalCode`.
- `coupon`: optional ObjectId ref to Coupon.
- `paymentMethod`: required string.
- `totalAmount`: required Number.
- `discount`: Number default 0.
- `status`: enum `pending | shipped | delivered`, default `pending`.
- Mongoose `createdAt` and `updatedAt` timestamps.

There is no persisted `subtotal`, currency, `discountTotal`, shipping/tax amount, quote ID, price revision, payment reference/status, reservation ID, fulfillment/shipment ID, cancellation data, public number, lifecycle history, or idempotency key.

### Routes, authorization, validation, controller

[backend/routers/ordersRouter.js](../../backend/routers/ordersRouter.js) applies `protect` to the router and exposes:

| Method/path | CURRENT auth/access | Current behavior |
| --- | --- | --- |
| `GET /api/orders` | Authenticated; admins see all, customers only own | Calls `getOrders`; unpaginated list and populates user name/email. |
| `GET /api/orders/:id` | Authenticated; owner or current admin | ObjectId syntax middleware, `getOrderById`, owner check; `403` for another customer. |
| `POST /api/orders` | Authenticated; admin explicitly rejected | Joi `createOrderSchema`, then `createOrder`. |
| `PATCH /api/orders/:id/status` | Authenticated admin only | ObjectId validation, Joi status enum, then direct status update. |

[backend/controllers/validation/orderValidation.js](../../backend/controllers/validation/orderValidation.js) validates request shape:

- Order item `product_id` and optional `product` are 24-hex strings, name is required, price is a non-negative Number, quantity is a positive integer; image/category are optional strings.
- Address requires full name, phone, line1, city, and country; line2/state/postalCode are optional in this Order request schema.
- `items` must contain at least one item; `paymentMethod` is one of `card`, `cod`, `stripe`; `totalAmount` is a non-negative Number.
- Status update accepts any of `pending`, `shipped`, `delivered` without checking the current status or transition legality.
- These are shape checks only. The controller does not verify that `product_id`/`product` exists, is eligible, belongs to a Cart, or matches the submitted name/price/quantity.

[backend/middlewares/authMiddleware.js](../../backend/middlewares/authMiddleware.js) verifies the bearer JWT, reloads the User's current role from MongoDB, and sets `req.user`. `getOrderById` compares the Order owner with that user ID; admin is the only cross-owner reader. `createOrder` denies admin order placement. The status route is admin-gated. No customer cancel/update route exists.

### Exact create/read/update flow

```text
Client
  -> POST /api/orders
  -> ordersRouter: protect + validateRequest(createOrderSchema)
  -> orderController.createOrder
       -> rejects role=admin
       -> reads items/address/couponCode/paymentMethod/totalAmount from req.body
       -> optional Coupon.findOne(active, expiresAt > now)
       -> computes discount using submitted totalAmount
       -> Order.create(user=req.user.id, request items/address/total, status=pending)
       -> Cart.findOneAndDelete(user=req.user.id)
  -> 201 { status: "success", data: Order }
```

`Order.create` and `Cart.findOneAndDelete` are separate operations without a MongoDB session/transaction. If order creation succeeds and cart deletion fails, the catch returns `500` although the Order may already exist; retry can duplicate it. If validation or Order creation fails, the Cart is not deleted. There is no idempotency key or Checkout-to-Order unique mapping.

`getOrders` returns all matching documents without pagination. `getOrderById` loads by `_id`, populates the User name/email, then enforces owner/admin access. Invalid ObjectId syntax is rejected before Mongoose casting. The status update loads the Order, checks existence, assigns the requested enum value, and saves; it does not append history, validate a state transition, or coordinate Payment, Inventory, or Fulfillment.

### Frontend and administration

- [frontend/src/pages/CheckoutPage.jsx](../../frontend/src/pages/CheckoutPage.jsx) submits the Order after COD selection or after browser-side Stripe reports payment success. The submitted items and `totalAmount` are client-originated; `totalAmount` is the browser subtotal, not its shipping-inclusive grand total.
- [frontend/src/services/api.jsx](../../frontend/src/services/api.jsx) defines `ordersAPI.create`, `getAll`, `getById`, and `updateStatus` for those current routes.
- [frontend/src/pages/OrdersPage.jsx](../../frontend/src/pages/OrdersPage.jsx) lists orders from `GET /api/orders`, displays Mongo `_id` suffix as `Order #...`, displays status, total, payment method and address, and renders item snapshots. It computes “total spent” by summing `totalAmount` without currency separation.
- [frontend/src/pages/OrderSuccessPage.jsx](../../frontend/src/pages/OrderSuccessPage.jsx) reads the order by Mongo `_id`. It presents “Order confirmed”/“being prepared” copy even though the persisted state is only `pending`; a failed detail fetch still shows success copy with “Details unavailable.”
- [frontend/src/pages/AdminDashboard.jsx](../../frontend/src/pages/AdminDashboard.jsx) displays recent orders and provides a select with all three current statuses for every row. It calls `ordersAPI.updateStatus` directly; no transition-specific permissions or confirmation are applied in the UI.
- [backend/controllers/adminController.js](../../backend/controllers/adminController.js) derives revenue and item sales from existing `Order.totalAmount` and item `price * quantity`, including all order statuses. These figures inherit current client-derived values.

## 3. Current Dependencies and Ownership

| Dependency | CURRENT runtime behavior | Canonical owner / TARGET | Phase 8 boundary |
| --- | --- | --- | --- |
| User/Identity | Required `Order.user`; JWT principal and current DB role loaded by `protect`. | Identity owns user/role/session. | Order references customer identity; does not manage accounts. |
| Cart | `createOrder` accepts submitted lines and deletes user Cart after create; it does not reload or compare Cart lines. | Cart owns transient identity/quantity intent. | Phase 8 Order contract may consume a Checkout result, not mutate Cart behavior in this audit. |
| Catalog/Product | No Product lookup during Order creation; mutable names/prices are accepted from client. `product_id` is stored as a String; optional `product` ref is not guaranteed. | Catalog owns identity, metadata, classification, lifecycle/publication; future SKU/variant is sellable identity. | Order snapshots references/display data; Catalog implementation is not modified here. |
| Pricing | No call to `pricingService.resolvePrice`; item prices are client-supplied Numbers. | Phase 5 Pricing owns PriceBook/PriceDefinition/ResolvedPrice. | Order accepts a resolved quote snapshot later; Pricing runtime remains separate/deferred for integration. |
| Promotions/Coupon | Coupon apply returns a Coupon; `createOrder` rechecks active/expiry and computes discount on client `totalAmount`. No redemption record/cap/limit. | Promotions owns coupon rules and discount eligibility/application. | Order snapshots applied promotion references/amounts; no Promotions changes here. |
| Inventory | No stock lookup, reservation, commit, release, or ledger write. | Phase 6 Inventory owns availability/reservation/commitment/ledger. | Order references reservation/commit result; Inventory is not implemented here. |
| Checkout | No backend Checkout service or quote. Frontend composes checkout inputs. | Checkout coordinates quote acceptance and cross-domain orchestration. | Phase 8 defines Order boundary; Checkout implementation is not changed. |
| Payment | Order stores a payment method string only. Stripe intent is created separately from client amount; no payment model/reference/webhook in Order path. | Payments owns provider state, ledger, verification, refunds/disputes. | Phase 9+ owns Payment implementation; Order may hold references/projections only. |
| Address | Checkout embeds submitted address values in Order. It does not store Address ID. Address CRUD is authenticated and owner-scoped. | User/Profile owns editable Address; Order owns immutable address snapshot. | Phase 8 defines a richer snapshot; Address runtime is not changed. |
| Shipping/Fulfillment | Frontend computes fee/threshold; Order stores address but no shipping fee/method/shipment/tracking. | Shipping owns serviceability/rate; Fulfillment owns shipment lifecycle. | Order stores accepted references/snapshots; Shipping/Fulfillment remain separate/deferred. |
| Tax | No tax model, route, field, or calculation in inspected runtime. | Tax is a future separate responsibility. | Deferred; Order can snapshot tax only when an approved Tax policy exists. |

## 4. Target Order Aggregate and Identity

TARGET: `Order` is the aggregate root for customer purchase intent accepted by Checkout and the immutable commercial snapshot. It owns Order lifecycle and its status history. It does not own mutable Catalog data, current price, coupon definitions, Inventory balances, Payment ledger/state, or shipment execution.

| Identity field | TARGET contract |
| --- | --- |
| `orderId` | Internal immutable Mongo ObjectId/aggregate identity. Existing `_id` remains stable for compatibility. |
| `publicOrderNumber` | Separately generated, immutable, unique customer-support reference. Never expose or derive it from a sequential counter. Use sufficient randomness/entropy to resist enumeration; enforce unique index and retry collision safely. |
| `customerId` | Authenticated User ID for current supported checkout; immutable ownership. No guest identity is currently supported. |
| Guest identity | Deferred with guest checkout. If later approved, use a constrained guest-order access credential and verified contact, not a userId supplied by a caller. |
| `createdAt` | Server-created acceptance/draft timestamp according to lifecycle; immutable creation instant. |
| `updatedAt` | Operational update timestamp; may change when status/reference metadata changes, but does not rewrite snapshots. |

Mongo `_id` is an internal API/resource identifier. The current UI's six-character `_id` suffix is not a public order number and is potentially enumerable. Target public reference must be stable, unique, opaque, and distinct from Mongo `_id`.

## 5. Immutable OrderItem Snapshot

TARGET snapshot is produced from the accepted CheckoutQuote, not reconstructed later from Product or PriceBook. Each line contains only historical/fulfillment-relevant attributes; do not copy the full Product document.

| Field | TARGET purpose |
| --- | --- |
| `productId` | Stable Catalog Product reference for history/support. |
| `variantId` / `sku` | Optional until Catalog variants/SKUs exist; then persist canonical sellable identity, not display option text alone. |
| `productName` / selected attributes | Display snapshot and customer/support context. |
| `imageReference` or display image snapshot | Optional historical display reference; avoid treating mutable Product image as required reconstruction source. |
| `quantity` | Accepted positive integer quantity. |
| `unitPriceMinor`, `currency` | Accepted Pricing result in integer minor units and explicit ISO currency. |
| `lineSubtotalMinor` | `unitPriceMinor * quantity`, safe integer arithmetic. |
| `discountAllocationMinor` | Promotions allocation for this line; auditable and bounded by eligible line value. |
| `taxAllocationMinor` | Tax-owned line allocation only when an approved Tax policy applies. |
| `lineTotalMinor` | `lineSubtotalMinor - discountAllocationMinor + taxAllocationMinor`; shipping remains order-level unless an approved allocation policy exists. |
| Pricing reference | `priceId`, revision, PriceBook, and resolution timestamp sufficient to explain the accepted quote; reference is provenance, not a later recalculation source. |
| Catalog metadata | Snapshot only attributes needed for historical display, legal/audit evidence, or fulfillment; retain stable IDs/references as appropriate. |

The immutable flow is:

```text
Catalog Product / sellable identity
        -> CheckoutQuote (resolved price/promotion/tax/shipping context)
        -> OrderItem snapshot (accepted line values)
        -> immutable historical commercial record
```

## 6. Money and Currency Contract

TARGET Order monetary values use Phase 5 `Money { amountMinor, currency }`: integer minor units, explicit ISO 4217 currency, no JavaScript floating-point authority, and no implicit currency conversion. The browser never supplies authoritative monetary fields.

Required accepted-order totals:

- `subtotalMinor = sum(lineSubtotalMinor)`
- `discountTotalMinor = sum(line discount allocations)`
- `shippingTotalMinor = accepted Shipping quote amount`
- `taxTotalMinor = accepted Tax result`
- `grandTotalMinor = subtotalMinor - discountTotalMinor + shippingTotalMinor + taxTotalMinor`
- All components share one currency and use safe integer arithmetic. Invalid negative/overflow totals or inconsistent line/order currency are rejected.

`paidAmountMinor` and `refundedAmountMinor` are Payment-ledger facts, not Order-owned financial authority. If Order exposes them for display, they are read-only projections/references with source Payment IDs and update only from verified Payment events. `outstandingAmountMinor` is derived from Order total and verified payment/refund ledger state; it must not be used to replace Payment ledger. For split/partial settlement, Payment owns detailed allocations and Order exposes a projection only.

The accepted Order total comes from the server-authoritative CheckoutQuote. Pricing supplies unit commercial values, Promotions supplies discounts, Shipping supplies delivery amount, and Tax supplies applicable tax. Order snapshots these accepted values; it does not recalculate later from Product, PriceBook, PriceDefinition, Coupon, or frontend data.

## 7. Canonical Order Status State Machine

CURRENT: Order has only `pending`, `shipped`, `delivered`; the admin may set any allowed value from any current state. There is no cancellation state/history or transition authority. Payment and fulfillment states are absent from the model.

TARGET Order lifecycle (separate from Payment, Reservation, and Fulfillment):

```text
draft -> pending_payment -> confirmed -> processing -> completed
          |                   |
          +-------> cancelled <------ (only by explicit business policy)
```

| Transition | Initiator/authority | Rule |
| --- | --- | --- |
| `draft -> pending_payment` | Checkout service | Accepted quote and checkout snapshot are persisted; Order is awaiting required payment/acceptance. |
| `pending_payment -> confirmed` (paid method) | Server-side Order/Checkout service after verified Payment state | Provider webhook/verified server status matches Order ID, amount, and currency; required Reservation is confirmed. Browser success/redirect is insufficient. |
| `pending_payment -> confirmed` (COD) | Server-side Order service | COD order passes policy/eligibility and is accepted; Payment remains due/unpaid. The confirmation means Order accepted, not paid. Inventory commitment policy is explicit and audited. |
| `confirmed -> processing` | Authorized operations/Fulfillment workflow | Order accepted for fulfilment; required inventory is committed/allocated. |
| `processing -> completed` | Fulfillment service from verified delivery completion | Required fulfillment tasks are complete; financial collection/refund remains Payment-owned. |
| `draft/pending_payment -> cancelled` | Customer (only own order), authorized operator, or system expiry/failure workflow | Allowed before irreversible fulfillment/capture according to cancellation policy; reason, actor, and time required; payment/refund and reservation compensation are separate workflows. |
| `confirmed -> cancelled` | Authorized operator/system, or customer only if explicit policy permits | Phase 3 permits this only through valid business rules. Require a recorded reason and actor/time; verify fulfillment has not crossed the cancellation boundary; coordinate Payment void/refund and Inventory adjustment/release through their owning workflows. It is not a generic status edit. |
| `processing -> cancelled` | Not a normal direct transition | Only if an approved operational policy defines a safe stop before shipment; otherwise route through return/refund after fulfillment has begun. |

Invalid transitions include direct `draft -> completed`, `cancelled -> confirmed`, `completed -> processing`, and any customer status mutation. Cancelled and completed are terminal Order states; correction is an audited compensating event, not reopening the same Order. `refunded` is not an Order lifecycle status; refunds belong to Payment, and Order may expose a read-only payment/refund projection. Reversibility is prohibited for terminal state transitions; an operator correction creates an explicit audited correction/linked replacement where policy permits.

## 8. Payment and Fulfillment State Separation

TARGET conceptual shape:

```text
Order
 ├── orderStatus                 (Orders-owned state machine)
 ├── paymentReferences[]         (links only; Payments owns financial state)
 ├── paymentStatusProjection     (optional read-only derived display state)
 ├── fulfillmentReferences[]     (links only; Fulfillment owns execution)
 └── fulfillmentStatusProjection (optional read-only derived display state)
```

Do not create `Order.status = paid`. Payment owns intent/authorization/capture/failure/refund/dispute and its append-only ledger. Fulfillment owns pick/pack/ship/tracking/delivery. Order status reflects purchase acceptance and operational lifecycle; it is not a substitute for either domain. Phase 8 documents only Order-side references/projections; Payment implementation is Phase 9+ and Fulfillment implementation remains separately deferred.

## 9. Order Confirmation Authority and Creation Boundary

CURRENT: Order is created directly from body and set to `pending`. For card, the browser currently confirms Stripe before calling Order creation; no webhook or persisted Payment-to-Order link exists. For COD, the Order is created before money is collected. Neither current path yields a trusted “paid” Order state.

TARGET authoritative sequence, not implemented:

```text
Cart
 -> Checkout validates owner and sellable selection
 -> server CheckoutQuote from Catalog + Pricing + Promotions + Tax + Shipping
 -> Inventory reservation (Phase 6 contract)
 -> Order draft/accepted snapshot creation
 -> Payment initialization/authorization from server Order total/currency
 -> verified provider event / COD acceptance policy
 -> Order confirmation transition
 -> separate Fulfillment processing and Inventory commit/release
```

For card/prepaid methods, only verified server-side provider state tied to the persisted Order and matching amount/currency may satisfy payment prerequisites for confirmation. Browser redirect, SDK result, and frontend messaging are informational. For COD, server acceptance can confirm the Order with Payment due; it must not claim capture/paid. Future methods implement the PaymentProvider abstraction and report trusted state without changing Order ownership.

CURRENT dependencies do not form this flow. Phase 8 defines Order-side target boundaries only; Checkout, Pricing integration, Promotions, Tax, Shipping, Inventory, Payment, and Fulfillment implementations are not part of this audit step.

## 10. Snapshot Immutability

TARGET: before acceptance, a draft may be replaced/recalculated by Checkout. Once a quote is accepted and an Order enters `pending_payment`/confirmed, freeze the commercial and identity snapshot:

- customer/guest identity reference and acceptance time
- billing/shipping address snapshots needed by business and fulfillment
- OrderItems and sellable identity/selected attributes
- unit prices, line subtotal, discounts, tax, shipping, total, currency
- coupon/promotion IDs, applied values and version/reference
- Pricing/CheckoutQuote references and resolution time
- selected payment method as an accepted intent, not Payment status
- Inventory reservation reference and accepted quantities

Mutable operational fields are limited to Order lifecycle status/version, lifecycle-history entries, cancellation metadata, payment/fulfillment references or projections, and non-commercial internal notes with actor/audit rules. They must not rewrite item identity, accepted prices, address snapshots, discount/tax/shipping, currency, or grand total. Do not fetch live Product data to reconstruct historical transaction details.

## 11. Address Snapshot

CURRENT: Checkout sends address fields as JSON. Order embeds `fullName`, `phone`, `line1`, optional `line2`, `city`, optional `state`/`postalCode`, and `country`; it stores no Address ID. Saved Address reads/mutations are user-scoped. Order input schema currently permits missing postalCode even though Address model/schema requires it for stored addresses.

TARGET:

```text
Mutable customer Address
        -> Checkout validates selected/supplied destination
        -> OrderAddressSnapshot (copy of fulfillment/audit data)
```

Snapshot the recipient name, phone, country, region/governorate, city, area, street/address lines, building/floor/apartment when supplied, postal code when applicable, and delivery instructions where required. Preserve the accepted text/value even if the user later edits/deletes their Address. Billing address is separate and only captured if the payment/business/legal policy requires it; do not imply one exists today.

Egypt-specific area/building/floor/apartment readiness is an optional future address DTO extension, not a current runtime schema or mandatory localization assumption. Preserve generic country/region/city/address lines in the target core and make locale-specific structure additive.

## 12. Promotions, Inventory, Shipping, Fulfillment, Refund Boundaries

- Promotions: Order stores applied coupon/promotion identity, accepted discount allocation/total, and policy/version reference. Promotions owns eligibility, limits, and redemption; Pricing remains base/sale price authority.
- Inventory: Order stores Reservation ID/reference and accepted line/sellable quantities. Phase 6 reserves before order/payment progression according to its contract. Payment failure/cancellation/expiry triggers idempotent Reservation release; verified success or COD acceptance triggers the agreed server-side confirmation/commitment rule. Order never stores inventory balances.
- Shipping/Fulfillment: Order snapshots accepted ship-to address, selected shipping service/method and charge/reference. Fulfillment owns `fulfillmentStatus`, `shipmentId[]`, carrier/provider, tracking number, `shippedAt`, and `deliveredAt`. These are TARGET/DEFERRED references/projections, not current Order fields or Order-owned shipping execution.
- Cancellation: customer may request cancellation only for own eligible state; operator/system cancellation requires authorized actor, reason, timestamp, and lifecycle history. Payment refund/void and Inventory release are separate idempotent domain operations. Payment failure, inventory failure, and timeout may cause Order cancellation only through server workflow; they are not browser status writes.
- Refund/chargeback: Order may link Payment IDs, Refund IDs, dispute/chargeback references, and a derived financial summary. Payment remains authority for payment, partial refund, refund, and dispute amounts/status. Phase 8 does not implement refunds or chargeback processing.

## 13. Idempotency, Concurrency, and Transactions

CURRENT: there is no public order number/idempotency key; duplicate `POST /api/orders` may create multiple Orders. `Order.create` and cart deletion are separate writes. Status update loads and saves without version/transition guard. No Mongo session/transaction is used in Order controller. PaymentIntent is an external Stripe call before Order creation in card flow. No Order lifecycle history/outbox exists.

TARGET idempotency:

| Operation | Scope / duplicate behavior |
| --- | --- |
| Order creation | Checkout ID + customer + idempotency key; unique mapping. Same key/request hash returns the existing Order/result; different payload with same key conflicts. |
| Checkout completion | One durable completion command per accepted quote; retries resume the same Order/Reservation/Payment attempt. |
| Network timeout / duplicate browser submit | Caller retries same key; query/replay returns original result rather than creating another Order. |
| Payment/order race | Payment webhook has provider event ID dedupe; Order transition checks expected state/version and Payment/Reservation links. |
| Cancellation | One idempotent cancellation command; conflicting completion/payment/fulfillment state returns a stable transition conflict and invokes compensations only once. |

TARGET concurrency: conditional status/version updates; unique order public number, checkout/idempotency key, payment references, and event IDs; MongoDB transaction for local Order + OrderHistory + Checkout idempotency mutations where deployed as one replica-set database; Phase 6 transaction for Inventory/Reservation/Ledger; external provider calls remain outside MongoDB transactions with outbox/saga/reconciliation. Define races explicitly for payment success vs cancellation, fulfillment start vs cancellation, inventory final-unit contention, and duplicate order requests. Do not use Redis locks as authority absent a separate architecture decision.

TARGET transaction boundary summary:

| Operation | CURRENT atomicity | TARGET consistency boundary | External call? |
| --- | --- | --- | --- |
| Create Order | One `Order.create` document insert | Order snapshot + lifecycle history + idempotency mapping in short Mongo transaction if separate docs; otherwise one aggregate document with durable history policy | No |
| Create Order + clear Cart | Separate insert and delete; partial outcome possible | Prefer do not clear Cart before accepted Order; coordinate Checkout/Order/Cart with a local transaction or idempotent saga/compensation | No |
| Reserve Inventory + Order | No reservation or transaction | Phase 6 conditional Inventory + Reservation + ledger transaction; Order/Checkout linkage local transaction or durable saga with idempotent reconciliation | No provider call inside |
| Payment + Order | Stripe PaymentIntent independent of Order and DB | Persist Order/Payment attempt correlation, call provider externally, then reconcile verified event; not one Mongo/provider transaction | Yes, Stripe/provider |
| Cancel Order + release Inventory | No cancellation/release operation | Local conditional Order/cancel history plus Phase 6 idempotent release transaction coordinated by saga/outbox; avoid inconsistent terminal states | Maybe provider void/refund |
| Refund + Order update | No refund endpoint/Payment model | Payment ledger transaction is financial authority; Order projection updates from idempotent event | Yes, provider refund |

## 14. Order Events and Lifecycle History

CURRENT: no `OrderStatusHistory` schema, event publisher, outbox, or append-only lifecycle record. A status mutation overwrites `Order.status`.

TARGET Order history concept:

```text
OrderStatusHistory
 ├── fromStatus / toStatus
 ├── actorId / actorType
 ├── reason
 ├── occurredAt
 ├── correlationId / idempotencyKey
 └── metadata (safe domain references)
```

Embed bounded history in Order if aggregate size/retention remains controlled; use a separate append-only collection if history growth/query/retention demands it, linked by `orderId`. This is a scale decision; never make mutable history the authority over the current aggregate state.

TARGET domain events (not implemented):

| Event | Producer/payload concept | Consumers / delivery |
| --- | --- | --- |
| `OrderCreated` | Orders; orderId, public number, customer, quote/reference, created state | Payment/Checkout/notifications; after local persistence, outbox, at-least-once/idempotent. |
| `OrderConfirmed` | Orders after authoritative Payment or COD acceptance; orderId, status transition, payment/reservation refs | Inventory/Payment/notifications/Fulfillment; verified source refs, dedupe by event ID. |
| `OrderProcessingStarted` | Orders/Fulfillment command; orderId, actor, time | Fulfillment and customer notifications; idempotent transition event. |
| `OrderCompleted` | Orders from verified fulfillment completion | Fulfillment/read models/notifications; asynchronous, deduplicated. |
| `OrderCancelled` | Orders service; orderId, actor, reason, transition/correlation refs | Payment void/refund workflow, Inventory release, notifications; saga, each consumer idempotent. |
| `OrderExpired` | System/Checkout worker; orderId, expiry reason | Inventory release and Payment reconciliation; idempotent. |
| `OrderPaymentUpdated` | Projection/consumer reacting to verified Payment event; references and projection version | Order read model/notifications; Payment remains source of truth. |
| `OrderFulfillmentUpdated` | Projection/consumer from Fulfillment event; shipment reference/status/time | Customer/admin read models; Fulfillment remains source. |
| `OrderRefundUpdated` | Projection from Payment refund/dispute event; Payment/Refund references and amounts | Order history/read model; Payment ledger remains source. |

## 15. Application Services and Repositories

All following are TARGET/DEFERRED, not current runtime classes. Current implementation is route controller + direct Mongoose model access.

| Service | Responsibility, input/output, auth, transaction/dependencies |
| --- | --- |
| `OrderService` | Customer/admin order query and allowed lifecycle commands; accepts authenticated actor + command, returns owner-scoped Order DTO. Enforces authorization and expected state/version; depends on OrderRepository and lifecycle policy. |
| `OrderCreationService` | Accepts validated CheckoutQuote/Checkout ID and customer; returns one Order ID/public number. Rejects client totals; persists immutable snapshots/idempotency mapping. Local Order/History transaction; references Quote/Reservation/Payment, does not call provider. |
| `OrderConfirmationService` | Consumes verified Payment event or COD acceptance command; checks order/payment/Reservation references and expected state, appends history and emits event. Order transaction plus outbox; no authority over Payment ledger. |
| `OrderCancellationService` | Accepts actor, orderId, reason, idempotency key; owner/operator/system authorization and cancelability policy; records state/history, then coordinates Payment and Inventory compensations by saga. |
| `OrderQueryService` | Owner/admin authorization, paginated list/details and public-number lookup; projects payment/fulfillment refs without exposing provider secrets. Read-only repository operations. |
| `OrderHistoryService` | Appends and queries immutable lifecycle history; validates actor/reason/correlation; shares Order state transaction/outbox if local. |

TARGET repository interfaces:

- `OrderRepository.create(snapshot, session)`, `findById(id)`, `findByPublicOrderNumber(number)`, `findByCustomer(customerId, filters, cursor/page)`, `findByCheckoutId(checkoutId)`, `transitionStatus(orderId, expectedVersion/status, command, session)`, `appendHistory(orderId, entry, session)`, `cancel(orderId, expectedState, metadata, session)`.
- `OrderItemRepository` may be a component of OrderRepository while items remain within the Order aggregate; do not create an independent write repository that breaks aggregate atomicity. Separate it only if justified by size/query scale while preserving snapshot immutability.
- `OrderQueryRepository` supports owner/admin-scoped pagination, public-number lookup, status/date filters, and projections; query indexes must not bypass authorization.

Current: these repositories/services do not exist; controllers call Mongoose models directly.

## 16. API Contract: CURRENT vs TARGET

CURRENT routes from `ordersRouter`:

| Route | Auth | Request/response and behavior |
| --- | --- | --- |
| `GET /api/orders` | JWT; customer sees own orders, admin sees all | No request body or pagination; returns `{status, data: orders}` with User name/email populated. |
| `GET /api/orders/:id` | JWT; owner/admin | Mongo ObjectId; `200` Order, `400` malformed ID, `404` missing, `403` foreign owner. |
| `POST /api/orders` | JWT; admin blocked by controller | Request `{items, shippingAddress, couponCode?, paymentMethod, totalAmount}`; `201` persisted Order on success. No Product/Cart/Price/Inventory/Payment verification. |
| `PATCH /api/orders/:id/status` | JWT + admin | Request `{status}` limited to current enum; direct update, no transition history or policy. |

TARGET API contract (NOT IMPLEMENTED; version/path may be finalized during API design):

- `POST /api/v1/orders` should be invoked only by authenticated Checkout orchestration with accepted `quoteId`, `checkoutId`, Reservation reference, and `Idempotency-Key`; it must not accept authoritative item prices/totals.
- `GET /api/v1/orders` customer owner-scoped and paginated; admin/operator search requires a distinct permission and audit.
- `GET /api/v1/orders/:id` owner/admin scoped internal ID lookup with non-enumerable response/error policy.
- `GET /api/v1/orders/by-number/:orderNumber` owner-scoped support lookup; require authenticated customer or strong, scoped verification credential if guest orders are ever enabled.
- `POST /api/v1/orders/:id/cancel` owner-scoped command with reason/idempotency key; server validates state and coordinates Payment/Inventory compensation.
- Admin/operator transition endpoints are distinct from customer commands, use granular authorization, expected version, reason, and audit history. Do not expose a generic customer PATCH of `status`.

## 17. Authorization, IDOR, and Enumeration

CURRENT protections:

- JWT middleware reloads current User role from database; customer Order list is filtered by user ID.
- Detail read checks owner/admin and returns 403 for foreign order; admin is privileged cross-owner reader.
- Status mutation is admin-only; malformed Order path IDs fail validation before Mongoose cast.
- Create rejects admins, but does not prove submitted line product references exist or belong to an owned Cart.
- `GET /api/orders` is not paginated. UI uses Mongo `_id` suffix as public-facing reference; admins see complete `_id`. Current tests cover owner-vs-other and admin read but not malformed Order ID/error redaction, customer status mutation, admin policy granularity, enumeration, or line identity validation.

TARGET security requirements: owner-scoped list/detail/cancel; no foreign-user order mutation; separate operator permission/audit; validate all IDs and bind Order creation to server-owned Checkout/Quote; random non-enumerable public order number; rate-limit lookup/creation; redact internal provider/database errors; ensure idempotency replay returns only the same authorized owner's result; preserve Phase 2 token/role protections. Guest order access remains deferred with guest checkout.

## 18. Order History and Public Number

TARGET: append-only OrderStatusHistory records transition from/to, actor ID/type, reason, timestamp, command/correlation ID, and safe metadata. Current Order status is mutable and no history exists.

TARGET `publicOrderNumber` is generated server-side from a random/opaque namespace, immutable, unique-indexed, collision-retried, and independent of Mongo `_id`. It is stable for support and not sequential/enumerable. Current frontend's `_id` suffix is LEGACY display only; no migration may replace or mutate historical `_id`.

## 19. Marketplace Readiness

CURRENT: single-store; no seller/merchant fields or marketplace checkout. TARGET Order may later carry seller context and link parent Checkout to seller-specific suborders/fulfillment groups. Keep commercial snapshots and ownership explicit so future seller order splits, commissions, and settlement can be linked without turning Order into the Payment ledger. Seller authorization, disjoint seller inventory, commission, payout, tax settlement, and multi-tenant isolation are DEFERRED; do not add them in Phase 8.

## 20. Non-Destructive Order Migration

No schema migration or data mutation occurs in this audit.

1. Inventory/read-only census of existing Order count, status distributions, legacy item shape, orphaned User/Product/Coupon references, totals/discounts, and payment-provider references where available. Do not “repair” by recalculating prices from current Product/Pricing.
2. Compatibility period: preserve `_id`, `user`, `items`, `shippingAddress`, `coupon`, `paymentMethod`, `totalAmount`, `discount`, `status`, and timestamps for legacy API/read paths. Version response DTOs or add fields additively.
3. Historical truth: old `totalAmount` and item `price` have no guaranteed currency and are client-derived; mark as legacy/unknown provenance. Do not fabricate currency, shipping/tax, payment, or confirmation facts.
4. Additive backfill: generate a high-entropy opaque public order number once per existing `_id`, persist the mapping with a unique constraint, and make retries idempotent; preserve existing `_id`. The generated value is stable support identity, not sequential/enumerable and not recalculated transaction data.
5. New Order creation writes versioned immutable snapshot alongside legacy compatible fields while consumers migrate. Avoid dual-writing competing amounts; new Checkout quote is single authority.
6. Dual-read: read new fields when present; legacy rows use stored legacy fields as historical display only, with unknown currency/provenance surfaced appropriately. Never reprice old orders.
7. Rollback: disable new creation path/DTO adapter while retaining generated references/history and original snapshots. Do not delete history, rewrite old totals, or remove old fields until separately approved retention/cutover gate.
8. Remove legacy fields/routes only after all consumers, reports, support, refunds, and reconciliation workflows are migrated and rollback window is closed.

## 21. Index and Retention Contract

TARGET indexes, conditional on actual query shape and size:

- unique `{ publicOrderNumber: 1 }`.
- `{ user: 1, createdAt: -1 }` for owner order history/pagination.
- `{ status: 1, createdAt: -1 }` only if admin queue/status filtering requires it.
- unique `{ checkoutId: 1 }` or `{ user: 1, idempotencyKey: 1 }` for exactly-once Order creation, depending on finalized checkout identity.
- unique `{ providerPaymentReference: 1 }` only if Order stores a non-authoritative unique reference; Payment owns provider reference uniqueness and should generally be queried through PaymentRepository.
- `{ fulfillmentReference: 1 }` only if Order list/query workloads require it; Shipment identity/status belongs to Fulfillment.
- lifecycle history `{ orderId: 1, occurredAt: 1 }` if history is separate collection.

Do not add all candidate indexes indiscriminately; review selectivity/write cost and actual query plans. Current runtime has only implicit `_id` index for Order; no `orderNumber`, customer/date, status/date, payment, fulfillment, or idempotency indexes.

## 22. Phase 8 Test Contract

CURRENT `backend/tests/orders.test.js` covers: authenticated user creates pending Order, admin cannot place orders, admin can update status, dashboard summary/analytics shape, and owner/admin detail access. It does not cover the contract below. Existing Cart tests are minimal; there are no Order lifecycle/cancellation/payment/inventory integration tests.

TARGET future tests:

- Creation: valid accepted quote snapshot; invalid/nonexistent/inactive product; invalid quantity; expired/changed price; invalid coupon/address; currency mismatch; no client total/price authority; fixed/percent discount allocations and tax/shipping math; exact integer totals.
- Snapshot: all accepted line/address/price/discount/tax/shipping/currency fields persist; Product/Pricing/Coupon/Address mutation later does not change Order; never copy entire mutable Product document; legacy historical row unchanged.
- State machine: every allowed/invalid transition; actor authorization; Payment and Fulfillment status separation; cancellation reasons/history and terminal states; COD acceptance remains unpaid; no `paid` Order status.
- Payment/Inventory integration: only verified provider event confirms paid Order; amount/currency/order references match; reservation reference required according to policy; payment failure/cancel/timeout releases once; late payment after cancellation/expiry reconciles; no provider call inside Mongo transaction.
- Cancellation/refund: owner can cancel only eligible own Order; foreign owner forbidden; admin/operator permission audited; cancellation vs payment success race; refund/chargeback only referenced to Payment, not processed by Order.
- Idempotency/concurrency: duplicate Order request/same key reuses same result; different payload/key conflict; concurrent Checkout completion creates one Order; public number collision/retry; status version conflict; webhook duplicate; cancellation vs fulfillment race.
- Authorization: unauthenticated, own Order success, another customer's Order `403`, nonexistent Order `404`, malformed ObjectId `400`, foreign list/detail/cancel, customer status mutation, admin/operator policy, non-enumerable public lookup, rate limit, and redacted error response.
- Migration/index: public-number backfill is idempotent/unique; legacy order fields untouched; rollback preserves original snapshot; indexes match query/access patterns.

## 23. Phase Boundary and Deferred Work

This Phase 8 step defines Order runtime reality and future Order ownership only. It does not implement Order aggregate/service/repository, new schema, status transitions, cancellation, public order numbers, idempotency, history/events, Checkout integration, Payment integration/refunds, Inventory reservation, Shipping/Fulfillment, Tax, guest checkout, marketplace, or migration.

Payment/refund/chargeback processing belongs to Phase 9+; Inventory implementation is separate from the Phase 6 audit; Checkout/Pricing/Promotions/Shipping/Tax runtime changes remain owned by their approved phases. No Phase 9 or later implementation is started here.
