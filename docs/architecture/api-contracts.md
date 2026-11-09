# API contract boundaries

## CURRENT API
The current server composes routes in the Express app and defines a Swagger contract in the app-level documentation file. The current repository still exposes direct route-oriented APIs and a prototype Stripe flow.

This section describes the current implementation only. It does not imply the API has already been refactored into domain DTO contracts.

## TARGET API CONTRACT
The future API contract should preserve the current route grouping and add explicit versioning, DTO boundaries, and authoritative server-side validation.

### Required contract principles
- Request and response DTOs distinguish external API shape from domain model shape.
- IDs and timestamps remain consistent and versioned.
- Errors return domain-safe messages and do not leak internals.
- Authenticated endpoints preserve the current JWT and RBAC enforcement pattern.
- Client values must never be treated as authoritative for a payable amount.
- Payment and checkout flows require idempotency keys and request correlation IDs.

### Public API groups

#### Auth
- POST /api/auth/register
- POST /api/auth/login
- POST /api/auth/logout
- POST /api/auth/refresh-token
- POST /api/auth/forgot-password
- POST /api/auth/reset-password

#### Catalog
- GET /api/products
- GET /api/products/:id
- POST /api/products
- PATCH /api/products/:id
- DELETE /api/products/:id

CURRENT compatibility note: the current Product document may expose legacy `price` and `stock`. These values are not authoritative future checkout inputs. The existing Product DELETE route is an archive/hide compatibility operation and must not physically remove referenced product identity during migration.

#### Cart
- GET /api/cart
- POST /api/cart/items
- PUT /api/cart/items/:itemId
- DELETE /api/cart/items/:itemId

#### Orders
- GET /api/orders
- GET /api/orders/:id
- POST /api/orders
- PATCH /api/orders/:id/status

#### Payments
- POST /api/payments/create-intent
- POST /api/payments/confirm
- POST /api/payments/webhook
- GET /api/payments/:id

#### Reviews
- GET /api/reviews/:productId
- POST /api/reviews
- PATCH /api/reviews/:id
- DELETE /api/reviews/:id

#### Uploads
- POST /api/upload

## Authority and pricing contract

The current Pricing quote and admin foundation routes, plus target request/response DTOs and error semantics, are distinguished in [pricing-api-contracts.md](pricing-api-contracts.md). The complete target contract is not yet implemented.

The client may send selection data and optional discount codes, but the following values are not authoritative:
- price
- subtotal
- discount
- tax
- shipping
- total

The server must recompute the authoritative payable value from catalog, pricing, promotion, tax, shipping, and inventory rules and then persist that value into the Order snapshot before the payment step.
Catalog supplies product identity and definition; Inventory supplies authoritative availability; Pricing supplies authoritative commercial prices. A legacy `Product.price` or `Product.stock` value must not be used as future checkout or payment authority.

## Versioning and migration strategy
The architecture should support versioned public contracts without forcing a monolith split. A practical default is:
- v1 prefix for all public endpoints
- stable DTO contract with explicit deprecation policy
- current endpoints remain stable during Phase 4+ migration

## Contract governance
- Change requests require both API and domain contract approval.
- Payment and auth contracts are higher-risk and require strict review.
- Frontend integration depends on contract stability; all consumer DTOs should be documented.

## FUTURE IMPLEMENTATION
The API contract currently remains route-oriented and implementation-specific. DTO-first domain contracts, route versioning, explicit idempotency, and provider webhook contracts belong to later implementation phases.
