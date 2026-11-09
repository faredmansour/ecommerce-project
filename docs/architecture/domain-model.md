# Domain model

## Current reality vs target model

This is the target domain model for future implementation. It does not yet match the current repository exactly. The current code still uses direct controller logic and Mongoose documents rather than aggregate-root orchestration.

## Current, target, and deferred status

- CURRENT: Product has legacy `price` and `stock` fields that existing runtime flows may use for compatibility. They are not future sources of truth.
- TARGET: Catalog owns Product identity, definition, metadata, classification, references, lifecycle, and publication. Pricing owns commercial price authority. Inventory owns quantities and availability. Orders own the immutable confirmed snapshot. Payments own payment state and ledger. Fulfillment owns shipment lifecycle.
- DEFERRED: full Pricing aggregate/application-service behavior, Inventory engine, authoritative Checkout and Order snapshot orchestration, and migration or retirement of legacy Product fields remain future work. The Phase 5 Pricing Foundation exists but is not yet integrated into checkout/payment authority.

## Core concept
This project is best modeled as a modular monolith with several bounded contexts that share a single deployment and persistence boundary. The core domain is commerce, with subdomains for identity, catalog, cart, order, payment, and fulfillment.

## Target contract: authority and snapshot semantics

This document describes the target domain model. It does not claim that the repository already implements this structure.

The authoritative commercial sequence is:
1. Client proposes selection, quantities, and optional promotion codes.
2. Server validates catalog and product state.
3. Pricing resolves the authoritative commercial unit price in integer minor units and currency.
4. Promotions evaluates coupons and promotional discounts against the resolved price; future Tax and Shipping contexts provide their own amounts for Checkout to compose.
5. Order snapshot is created from that validated result.
6. Payment amount is derived from the server-authoritative order snapshot.
7. Historical Order data becomes immutable after confirmation.

Order is the historical commercial truth after confirmation. Product, pricing, and catalog data may change later, but the Order must retain the values that were accepted when the order was confirmed.

## Aggregate roots

### User
Attributes:
- id
- email
- passwordHash
- status
- roles
- createdAt
- updatedAt

Consists of:
- profile details
- addresses
- verification metadata
- refresh session records

Behavior:
- register
- authenticate
- reset password
- update profile
- assign role

### Product
Attributes:
- id
- categoryId
- name
- slug
- description
- status: draft, active, inactive, archived
- publicationState: unpublished, published, hidden
- brandId
- categoryIds
- primaryImageId
- createdAt
- updatedAt

Current compatibility fields, not target authority:
- `price`: legacy numeric value; Pricing owns future commercial price authority
- `stock`: legacy numeric value; Inventory owns future stock and availability authority
- `image`: legacy image path; Catalog target uses media references
- `rating` and `reviews_count`: legacy denormalized display values; Reviews owns review and rating aggregation authority

Consists of:
- category reference
- brand reference
- review references
- media references

Behavior:
- publish
- archive
- update catalog metadata and classification
- add image

### Cart
Attributes:
- id
- userId
- items
- updatedAt

Consists of:
- cart items
- coupon references

Behavior:
- add item
- update quantity
- remove item
- clear
- estimate totals

### Order
Attributes:
- id
- userId
- orderNumber
- status
- items
- shippingAddress
- totals
- paymentStatus reference/projection; Payments owns payment state
- createdAt
- updatedAt

Consists of:
- order items
- address snapshot
- coupon snapshot
- payment references
- fulfillment references

Behavior:
- create
- confirm
- cancel
- ship
- complete

### Payment
Attributes:
- id
- orderId
- provider
- providerPaymentId
- amountMinor
- currency
- status
- createdAt
- updatedAt

Consists of:
- intents
- transactions
- ledger entries
- refunds

Behavior:
- create intent
- authorize
- capture
- fail
- refund
- reconcile webhook

### Review
Attributes:
- id
- userId
- productId
- rating
- comment
- createdAt

Behavior:
- create
- update
- moderate
- delete

## Value objects
- Money { amountMinor, currency }
- Address
- InventoryQuantity
- CouponCode
- PaymentStatus
- OrderStatus
- ProductStatus
- Role
- AuthTokenHash

## Historical order snapshot requirements

A confirmed Order must capture all values needed to reproduce the commercial transaction, including where applicable:
- product identity or SKU/variant identity
- product name and selected attributes
- unit price at confirmation time
- quantity
- currency
- discounts and promotion effects
- coupon effects
- tax
- shipping cost
- final total
- shipping address snapshot
- billing information required by the business
- seller information if marketplace support is added later
- fulfillment/shipping selections

Changing product or pricing data after confirmation must not alter the historical Order data.
The confirmed Order owns this immutable snapshot; Catalog, Pricing, Inventory, Payments, and Fulfillment must not rewrite it.

## Target inventory model

### InventoryItem
- id
- sellableId (Catalog SKU/variant identity; Product ID is a simple-product compatibility mapping)
- warehouseId
- onHand
- reserved
- committed
- available (derived as onHand - reserved - committed; not independently mutated)
- version
- lastAdjustedAt

### InventoryReservation
- id
- inventoryItemId
- checkoutId and userId; orderId/payment reference when confirmed
- quantity
- status: created, active, confirmed, released, expired, or cancelled
- createdAt
- expiresAt
- updatedAt

Inventory balance categories (available, reserved, and committed) are distinct from Reservation entity lifecycle states. See [phase-6-inventory-reservation-audit.md](../phase-6-inventory-reservation-audit.md) for legal Reservation transitions, invariants, atomic write strategy, and ledger requirements.

Required behavior:
- reserve stock atomically
- release expired or cancelled active reservations
- confirm a reservation only after server-authoritative payment/order acceptance
- decrement onHand and committed together on fulfillment dispatch
- prevent overselling with atomic updates and concurrency checks
- support idempotent retries for duplicate checkout requests

## Events
- UserRegistered
- PasswordResetRequested
- PasswordResetCompleted
- ProductPublished
- ProductArchived
- CartItemAdded
- CartItemUpdated
- CheckoutStarted
- OrderCreated
- OrderPaid
- PaymentFailed
- ShipmentCreated
- ShipmentDelivered
- ReviewSubmitted
- AuditLogged

## Repositories by aggregate
- UserRepository
- ProductRepository
- CategoryRepository
- CartRepository
- OrderRepository
- PaymentRepository
- ReviewRepository
- InventoryRepository
- AuditRepository

## Transactional boundary rules
- An order is finalized by one transaction boundary, not by a series of independent writes.
- Payment state transitions must be ledger-backed with idempotent webhook processing.
- Inventory quantity changes belong to Inventory and must not be treated as free-form Product counter updates without reservation logic. `Product.stock` is legacy compatibility only.
- Password reset and refresh token flows must remain hash-based and revocable.

## Important business rules
- Pricing enforces permitted commercial price rules; Catalog metadata does not determine the payable amount.
- Promotions owns coupon/promotion eligibility and discount application; Pricing does not own coupon rules.
- Tax and shipping are separate future calculations and are not part of Product.price or PriceDefinition.
- Order totals must be snapshots taken at checkout, not live recomputed values.
- Payment success is not equal to fulfillment success.
- A user may have at most one active cart, but cart state must be resilient to race conditions.
- Reviews are product-scoped and typically unique per user per product.

## Domain dictionary
- Catalog: sold products and their metadata
- Checkout: conversion of cart to order intent
- Payment provider: third-party processor abstraction
- Ledger: append-only financial event history
- Reservation: temporary hold preventing oversell
- Snapshot: immutable order or pricing state frozen at decision time
