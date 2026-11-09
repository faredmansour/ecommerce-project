# Aggregates and invariants

## Intended aggregate design

These aggregate boundaries are the target design for future implementation. The current repository still stores shopping and order data in simpler Mongoose models without an explicit aggregate-root layer.

CURRENT: the runtime Product model still includes legacy `price` and `stock` fields, and a limited Phase 5 Pricing Foundation exists. TARGET: Catalog does not own authoritative pricing or inventory. DEFERRED: full Pricing aggregate behavior, Inventory implementation, and migration of those compatibility fields.

## Aggregate contract rule

A controller must not directly mutate arbitrary child model data. The intended direction is:
- Controller or route handler
- Application service / use case
- Domain rules / aggregate
- Repository

This rule is part of the target contract and is not yet fully reflected in the repository implementation.

## Customer aggregate: User
Purpose:
- represent account and identity state
- contain profile and security metadata

Aggregate root:
- User

Contained entities:
- Address
- Token record
- Role assignment

Invariants:
- each email is unique within the active user namespace
- password hashes are never stored in plain text
- role changes are constrained to privileged actions
- reset and refresh tokens are hashed and revocable

## Catalog aggregate: Product
Aggregate root:
- Product

Contained entities:
- CategoryReference
- BrandReference
- MediaAssetReference

Invariants:
- lifecycle is draft, active, inactive, or archived; publication is unpublished, published, or hidden
- public catalog Products require active lifecycle and published publication state
- public navigation Categories and Brands require active status
- category and brand references must be valid
- Pricing supplies authoritative commercial price; Inventory supplies authoritative availability
- catalog writes do not mutate the final order snapshot

The legacy `Product.price` and `Product.stock` fields may remain during compatibility migration, but they are not target aggregate authority. Product does not own reservations, checkout, payment, or fulfillment state.

## Pricing aggregates

TARGET roots are PriceBook and PriceDefinition. A PriceDefinition is scoped to a sellable, book, currency, and effective interval; it stores integer-minor-unit Money, status, and revision/audit metadata. Pricing resolves one deterministic price but does not own promotions, tax, shipping, or order totals. CURRENT: Phase 5 added PriceBook/PriceDefinition persistence and a resolver, but not a full aggregate-root/repository implementation. DEFERRED: aggregate orchestration, immutable revision policy, and remaining target constraints.

Promotions owns Coupon, Promotion, and eligibility rules; it consumes resolved Pricing values and does not define base prices.

## Cart aggregate: Cart
Aggregate root:
- Cart

Contained entities:
- CartItem
- Promo snapshot

Invariants:
- one active cart per user
- item quantities are positive integers
- any cached/displayed price is non-authoritative; Checkout resolves price again
- cart totals are derived and cannot become source-of-truth payment totals

## Order aggregate: Order
Aggregate root:
- Order

Contained entities:
- OrderItem
- OrderAddressSnapshot
- OrderStatusHistory
- PaymentReference
- FulfillmentReference

Invariants:
- order items are immutable after creation
- totals are snapshot values set at order creation
- status transitions follow a controlled state machine
- payment and order states are separated but linked
- confirmed orders are the historical commercial truth and must not be mutated by catalog or pricing changes

OrderItem must represent the historical commercial truth at confirmation time, not a live object reference to the catalog item.
Where applicable, the confirmed snapshot includes product identity, SKU/variant when introduced, name, attributes when introduced, unit price, quantity, currency, discounts/promotions/coupons, tax, shipping, totals, address and billing data, seller data if introduced, and fulfillment selection. Catalog changes must not mutate it.

## Payment aggregate: Payment
Aggregate root:
- Payment

Contained entities:
- PaymentTransaction
- LedgerEntry
- Refund
- Dispute metadata

Invariants:
- ledger entries are append-only
- webhook processing is idempotent
- provider transaction id is unique
- transition sequence must be valid

## Review aggregate: Review
Aggregate root:
- Review

Contained entities:
- ReviewModeration

Invariants:
- a user can review a product at most once unless domain allows multiple reviews later
- rating is within the valid numeric range
- review creation triggers a rating recalculation workflow

## Inventory aggregate: InventoryItem
Aggregate root:
- InventoryItem

Contained entities:
- StockMovement
- Reservation

Invariants:
- stock never drops below zero on valid reservation logic
- reservation expiration is enforced
- stock movements are append-only and auditable

## Why these boundaries matter
The most important rule is: each aggregate owns its write invariants. A payment aggregate must not mutate order data as a side effect of financial processing. A cart aggregate must not decide final order totals without snapshotting. Inventory and pricing must not be treated as a single unguarded entity because they have different concurrency behavior and business rules.
