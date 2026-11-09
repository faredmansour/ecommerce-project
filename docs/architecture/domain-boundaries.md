# Domain boundaries

## Current reality vs target contract

This document describes the intended future bounded contexts for the project. It does not claim that the repository has already been refactored into this structure.

## Bounded contexts and ownership

## Canonical ownership matrix

| Data | Owner | Mutator | Snapshot? | Notes |
| --- | --- | --- | --- | --- |
| Product definition | Catalog | Catalog | No | Live product metadata is catalog-owned |
| Current commercial price | Pricing | Pricing | No | Pricing is authoritative for current value |
| Inventory | Inventory | Inventory | No | Reservation and availability are inventory-owned |
| Cart | Cart | Cart | Temporary | Cart is transient shopping state |
| Order | Orders | Orders | Yes | Confirmed orders are historical truth |
| Payment | Payments | Payments | Yes/ledger | Payment ledger is financial source of truth |
| Shipment | Fulfillment | Fulfillment | Yes where historical | Tracking history is captured |
| Coupon | Promotions | Promotions | Yes in order | Coupon effects are preserved in order snapshot |
| Address | User/Profile | User | Snapshot into order | Shipping address is copied at confirmation |

This matrix is the canonical ownership model for future implementation. It does not imply that the current repository already uses this exact separation.

### Legacy Product compatibility fields

CURRENT STATE: the live Product document contains numeric `price` and `stock` fields, and the legacy runtime may read or write them. These are compatibility fields, not target ownership assignments.

TARGET CONTRACT: Pricing owns authoritative commercial prices and calculations. Inventory owns stock, availability, reservations, commitments, and adjustments. Catalog owns Product definition and may retain the legacy fields only during a staged compatibility period.

DEFERRED IMPLEMENTATION: migrate consumers to Pricing and Inventory contracts before freezing or removing the legacy Product fields. Checkout and Payments must never treat `Product.price` as authoritative; inventory reservation must never use `Product.stock` as its future source of truth.

### 1. Identity & Access
Responsibility:
- user registration and authentication
- refresh token lifecycle
- password reset flows
- session validity and role resolution
- permission evaluation

Owns:
- User
- Role
- Permission assignment
- Refresh token / reset token records
- admin role assignment and revocation

Does not own:
- catalog pricing decisions
- checkout pricing totals
- shipping settlement
- payment provider account states

Main entities:
- User
- Role
- Permission
- SessionToken
- PasswordResetToken

Important invariants:
- user identity is unique by email
- refresh tokens are single-use or revocable on rotation
- password reset tokens are short-lived and single-use
- admin operations require explicit role check

Dependencies:
- AuditEvent
- Notification

### 2. Users / Profiles
Responsibility:
- profile metadata
- address ownership
- profile preferences and account state

Owns:
- profile fields
- shipping/billing info references
- customer preferences

Does not own:
- transaction history is not profile-owned in the aggregate sense
- payment ledger belongs to Payments

### 3. Catalog / Categories / Products
Responsibility:
- product and category definition
- product publication status
- browse/search indexing
- product media references

Owns:
- Category
- Product
- ProductMediaReference
- ProductVariant
- Brand

Does not own:
- commercial price or price calculations; legacy `Product.price` is compatibility-only
- inventory availability
- stock quantity or reservations; legacy `Product.stock` is compatibility-only
- order-level pricing snapshot
- shipping

Main invariants:
- category appends/product references must be valid
- product name/slug uniqueness is domain-specific and may be scoped per seller
- product publish state must not expose unpublished items in storefront queries
- Product lifecycle is draft, active, inactive, or archived; inventory availability is separate
- public Products require active lifecycle and published publication state
- public navigation Categories and Brands require active status

### 4. Pricing & Promotions
Pricing responsibility:
- commercial price definitions and price books
- effective dates, currency, comparison/reference prices, and price validity
- deterministic price resolution and commercial price calculation

Pricing owns:
- PriceBook
- PriceDefinition
- ResolvedPrice contract

Promotions responsibility:
- coupon and promotion definitions
- eligibility evaluation and discount application to a Pricing-resolved amount

Promotions owns:
- Promotion
- Coupon
- PromotionEligibility

Does not own:
- payment settlement
- inventory counts
- tax law enforcement beyond policy config

Important invariants:
- Pricing money uses integer minor units and explicit currency; authoritative prices are not floating-point values
- Pricing resolves base/sale price only and does not own coupon/promotion rules
- Promotions cannot make a discount exceed the eligible amount or bypass coupon validity constraints

### 5. Inventory
Responsibility:
- stock levels and reservations
- stock movement history
- availability checks

Owns:
- InventoryItem
- InventoryReservation
- StockMovement

Does not own:
- category/product stored definition itself
- order payment state

Important invariants:
- never oversell reserved quantity
- reservation expires
- commit/release actions are idempotent within their order/payment context

### 6. Cart & Wishlist
Responsibility:
- transient shopping state for a user
- cart item quantity management
- wishlist membership

Owns:
- Cart
- CartItem
- Wishlist
- WishlistItem

Does not own:
- order-level commitment
- payment state

### 7. Checkout & Orders
Responsibility:
- order creation from a cart or direct checkout draft
- order status transitions
- order snapshotting at confirmation time
- line items and totals made immutable after order creation

Owns:
- Order
- OrderItem
- OrderAddressSnapshot
- OrderStatusHistory

Does not own:
- product price mutations after order creation
- inventory by reference to live catalog stock if the order is already placed

Important invariants:
- order totals are snapshots
- order items are immutable once placed
- cancelled orders do not re-use same order identity

### 8. Payments & Ledger
Responsibility:
- provider abstraction
- payment intent creation and state transitions
- append-only transaction ledger
- refund and dispute state tracking

Owns:
- Payment
- PaymentTransaction
- PaymentMethod
- PaymentLedgerEntry
- Refund

Does not own:
- shipping/fulfillment operational steps
- cart content

Important invariants:
- raw card data is never processed by the platform
- webhook events are verified and idempotent
- payment state transitions follow a strict ledger model

### 9. Fulfillment & Shipping
Responsibility:
- shipment creation and tracking
- carrier status updates
- packaging flow

Owns:
- Shipment
- ShipmentItem
- TrackingRecord

Does not own:
- product definition
- order totals after confirmation

### 10. Reviews & Ratings
Responsibility:
- review creation and moderation
- product rating aggregation

Owns:
- Review
- ReviewModeration

Does not own:
- catalog product pricing or supplier information

### 11. Files & Media
Responsibility:
- media upload, validation, storage, and cleanup
- signed URLs or direct provider uploads if later adopted

Owns:
- ProductImage / stored media metadata
- MediaAsset
- UploadToken or upload session state

Does not own:
- catalog entity lifecycle beyond the reference to the asset

### 12. Administration & Operations
Responsibility:
- reporting, analytics, moderation, operational dashboards
- user/admin role operations
- bulk operations and support workflows

Owns:
- admin operation metadata
- business reports
- operational tasks

Does not own:
- source-of-truth payment ledger or order transaction semantics

### 13. Audit & Security Events
Responsibility:
- record security-relevant and business-critical events
- support accountability and investigations

Owns:
- AuditEvent
- SecurityEvent

Does not own:
- business process semantics outside the event record

### 14. Notifications
Responsibility:
- notifications to user or operator
- template and delivery status

Owns:
- Notification
- NotificationChannel

Does not own:
- payment settlement outcome beyond sending a notification

## Domain boundary summary

- Identity & Access governs authentication and authorization.
- Catalog owns product description and structure.
- Pricing owns price calculation logic.
- Inventory owns available quantity and reservations.
- Cart owns shopping intent.
- Orders owns final purchase agreement and immutable snapshot.
- Payments owns financial state and provider ledger.
- Fulfillment owns shipment lifecycle.
- Reviews owns customer feedback.
- Audit owns event record and investigation trails.

No domain should own another domain's source of truth except at the edges of an explicit integration contract.

## Current, target, and deferred status

- CURRENT: Product contains legacy numeric `price` and `stock`; current routes and consumers may still use these fields.
- TARGET: Catalog owns definition and publication; Pricing owns commercial price authority; Inventory owns quantity and availability; Orders own the immutable confirmed snapshot; Payments own financial state; Fulfillment owns shipment lifecycle.
- DEFERRED: Pricing and Inventory engines, reservation workflows, and migration of legacy Product fields are later implementation work.
