# Repository and persistence contracts

## Persistence model
The current app uses Mongoose models and a single MongoDB data store. The future architecture should preserve this deployment pattern while clarifying repository boundaries and aggregate ownership.

CURRENT: the runtime uses direct Mongoose models and Product contains legacy `price` and `stock` values. TARGET: repository contracts follow bounded-context ownership. DEFERRED: repository implementations and migration to Pricing/Inventory authority.

## Repository interfaces

### UserRepository
Responsibilities:
- save and load users
- find by email
- find active refresh tokens for a user
- store login session metadata

Methods:
- findById(id)
- findByEmail(email)
- save(user)
- listRoles(userId)
- revokeTokens(userId)

### ProductRepository
Responsibilities:
- load product by id or slug
- query by category, status, publication, and text filter
- compose price-based filtering/sorting from Pricing results rather than owning price authority
- update published state
- manage image refs

Methods:
- findById(id)
- search(filters, paging)
- save(product)
- archive(id)

### PricingRepository
TARGET responsibilities:
- load PriceBooks and eligible PriceDefinitions by sellable, currency, and effective instant
- persist immutable price revisions and activation metadata
- reject overlapping same-kind effective intervals atomically

Possible methods:
- findActiveBook(context)
- findEligibleDefinitions(sellable, context)
- createRevision(definition, expectedVersion)
- deactivate(priceId, actor, reason)

CURRENT/DEFERRED: this repository is not implemented.

### PromotionsRepository
TARGET responsibilities:
- load coupons/promotions and their eligibility rules
- provide validated rules to the Promotions application service

Promotions persists discount policies; it does not own base PriceDefinitions. CURRENT/DEFERRED: authoritative Promotions repository is not implemented.

### CartRepository
Responsibilities:
- load active cart for user
- persist cart item changes
- support atomic cart update

Methods:
- findByUserId(userId)
- save(cart)
- clear(userId)

### OrderRepository
Responsibilities:
- create order and status history
- load order by id or user
- persist order state transitions

Methods:
- create(order)
- findById(id)
- findByUserId(userId, paging)
- save(order)

### PaymentRepository
Responsibilities:
- persist payment intent and transaction states
- persist ledger entries
- record provider-specific identifiers

Methods:
- findByOrderId(orderId)
- save(payment)
- appendLedger(paymentId, entry)
- findByProvider(ref)

### InventoryRepository
Responsibilities:
- read Inventory-owned availability (not legacy `Product.stock`)
- reserve stock
- release reservation
- capture stock movement

Methods:
- getAvailableQty(productId)
- reserve(productId, qty, reservationId)
- commitReservation(reservationId)
- releaseReservation(reservationId)

### ReviewRepository
Responsibilities:
- create and update review
- find product review summary
- enforce uniqueness rules

Methods:
- findByUserAndProduct(userId, productId)
- save(review)
- findByProduct(productId)

### AuditRepository
Responsibilities:
- append immutable audit events
- read by entity and time

## Data access rules
- Repository implementations may use Mongo collections, but they must respect aggregate and transaction boundaries.
- Write operations must not cross aggregate roots without explicit application orchestration.
- Domain events and ledger entries are append-only and should be treated as neither mutable nor replaceable.
- Query models may be optimized for read access without making them write origin for business state.

## Recommended pattern: Mongo with explicit aggregate repositories
- Use aggregate root repositories for writes.
- Keep read models separate for search and browsing if performance demands it.
- Keep provider-specific payment data behind payment adapters and not mixed into the order model.
- Use transactions for order + reservation + payment intent initialization where required by the chosen DB pattern.
