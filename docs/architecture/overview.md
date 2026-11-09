# Overview

## A. Current architecture discovered

The repository is currently a modular Express app in the backend directory with route-level controllers and Mongoose schemas. The app is organized as follows:

This section describes the implementation that exists today in the repository and must not be read as a fully domain-driven architecture.

- app.js: middleware composition, CORS, security middleware, route registration, error handler
- server.js: database connection and process startup
- routers/: Express route modules
- controllers/: business logic handlers
- models/: Mongoose persistence models
- middlewares/: auth, RBAC, multer, validation, error handling
- utils/: logger, cache, cloudinary, email, swagger
- tests/: Jest + Supertest with in-memory MongoDB
- frontend/src: React + Vite UI with contexts and service adapters

The current implementation already includes:

- JWT-based auth and role checks
- product browsing/search/pagination/category filtering
- cart, wishlist, reviews, addresses, coupons and orders
- upload route with server-generated filenames and content validation
- Redis optional cache
- Cloudinary optional media hosting
- Stripe payment intent prototype
- OpenAPI doc generation

## B. Target architecture

The target architecture is a modular monolith. It keeps one deployable application while isolating the domain into bounded contexts and explicit application services.

This is the intended future architecture, not the current implementation. The code and the data model still reflect a simpler controller-driven structure.

### Why this matches the project

- There is already a single backend service and single frontend app.
- The code is not yet a true microservice boundary; splitting now would create premature operational complexity.
- Domain concerns are recognizable: Identity, Catalog, Cart, Orders, Payments, Fulfillment, Reviews, Admin.
- The project already has a security baseline and a single MongoDB data store, which fits a modular monolith well.

### Target module layout

- Identity & Access
- Catalog & Categories
- Pricing & Promotions
- Inventory
- Cart & Wishlist
- Checkout & Orders
- Payments & Ledger
- Fulfillment & Shipping
- Reviews & Ratings
- Files & Media
- Admin & Analytics
- Audit & Security Events

## Authority chain and commercial truth

The target authority flow for a purchase is:

Client selection
→ Catalog identity and definition validation
→ Inventory availability validation
→ Pricing evaluation
→ Promotions/Coupon evaluation
→ Tax/shipping policy evaluation
→ authoritative checkout total
→ Order snapshot
→ Payment amount

Catalog does not own commercial price or inventory availability. The current Product `price` and `stock` fields are legacy compatibility values used by the existing runtime; future checkout and payment flows must use Pricing and Inventory authority instead.

Important rule: the client-provided fields below are never authoritative:
- price
- subtotal
- discount
- tax
- shipping
- total

The server must recompute all authoritative commercial values and store the confirmed result in the Order snapshot. The payment flow receives the server-authoritative payable amount, not a client-calculated value.

## Current vs target separation

The contract must clearly keep these separate:
- CURRENT STATE: route/controller/mongoose implementation that exists today
- TARGET CONTRACT: intended modular-monolith domain contract for future implementation
- DEFERRED IMPLEMENTATION: provider implementations, checkout lifecycle, inventory reservation, pricing engine, payment ledger, repository/domain service refactor, and event infrastructure

## Current vs target

### Already in place

- Express + MongoDB persistence model
- JWT auth model and RBAC route controls
- Product/category routes and list/search behavior
- Cart, wishlist, order and address flows
- Core admin routes and analytics summaries
- Redacted production error handling

### Must remain as-is in Phase 3

- single deployable service
- JWT + RBAC pattern
- MongoDB persistence model
- current API conventions and existing route names
- current security baseline

### C. Deferred implementation work

The following are deliberately future work and are not yet implemented in the repository:

- domain boundary separation
- aggregate invariants enforcement
- money-as-integer model
- immutable order snapshots
- payment ledger and provider abstraction
- inventory reservation and stock management
- multi-seller readiness if needed
- explicit application services and repositories

## Architectural decisions in this phase

- Modular monolith without microservices
- Domain/application/persistence separation
- MongoDB aggregate roots with explicit invariants
- Payment provider abstraction, not hard-coded Stripe-only behavior
- Money representation issued in minor units with currency metadata
- Idempotency and concurrent mutation protections built into the domain contract

## Key constraint

The current Phase 2 security baseline must be preserved. The architecture contract must not weaken role checks, token handling, object validation, upload restrictions, or production error redaction.
