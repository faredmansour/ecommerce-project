# Phase 3 Architecture Contracts

This directory captures the Phase 3 architecture and domain-contract baseline for the Alfredo e-commerce platform.

## Scope

This directory records architecture contracts and separates them from runtime implementation. The repository now includes a limited Phase 5 Pricing Foundation; this does not imply full Checkout, Payment, Promotions, Inventory, or marketplace implementation.

## Phase 3 gate policy

Phase 3 is an architecture-contract phase. The gate evaluates whether the architecture documents are accurate, internally consistent, and implementable in future phases. It does not require the target architecture to already exist in production code.

The required distinction is:
- CURRENT STATE: what exists in the repository today
- TARGET CONTRACT: the intended future architecture
- DEFERRED IMPLEMENTATION: work intentionally deferred to Phase 4+

Phase 3 passes when the documents accurately distinguish these three layers and provide a safe implementation contract for the next phases.

## Current vs target classification

This package intentionally distinguishes three layers:

A. Current repository reality: what exists in the codebase today.
B. Target architecture: the intended modular-monolith contract for future phases.
C. Deferred implementation: features intentionally not implemented in the current phase.

The current repository is not yet a fully designed domain model. The target contracts below describe the desired direction and must be treated as design constraints for future work, not as a statement that the code has already been refactored.

## Documents

- [overview.md](overview.md) — current vs target architecture summary
- [domain-boundaries.md](domain-boundaries.md) — bounded contexts, ownership, and responsibilities
- [domain-model.md](domain-model.md) — entity/value object/read model definitions
- [aggregates.md](aggregates.md) — aggregates, invariants, and mutation boundaries
- [application-services.md](application-services.md) — use-case contracts and orchestration rules
- [repositories.md](repositories.md) — domain-oriented repository contracts
- [api-contracts.md](api-contracts.md) — REST API evolution and migration strategy
- [state-machines.md](state-machines.md) — order, payment, reservation, shipment, refund lifecycles
- [domain-events.md](domain-events.md) — internal and external event contracts
- [transaction-boundaries.md](transaction-boundaries.md) — transaction scope and consistency rules
- [concurrency-idempotency.md](concurrency-idempotency.md) — duplicate prevention and concurrency controls
- [money-model.md](money-model.md) — canonical money, tax, discount, rounding, and currency rules
- [pricing-engine.md](pricing-engine.md) — current pricing audit and target Pricing Engine contract
- [pricing-domain-model.md](pricing-domain-model.md) — Money, PriceBook, PriceDefinition, and resolution rules
- [pricing-api-contracts.md](pricing-api-contracts.md) — current versus target Pricing API and DTO contracts
- [pricing-testing.md](pricing-testing.md) — future Pricing unit, integration, security, and compatibility tests
- [payment-architecture.md](payment-architecture.md) — future provider abstraction and ledger architecture
- [payment-core.md](payment-core.md) — Phase 9 current Payment audit, mandatory security rules, and cross-phase target boundary
- [payment-domain-model.md](payment-domain-model.md) — Payment aggregate identity, ownership, Money, and references
- [payment-state-machine.md](payment-state-machine.md) — Payment state transitions and transition authority
- [payment-provider-contracts.md](payment-provider-contracts.md) — provider port and verified capability matrix
- [payment-api-contracts.md](payment-api-contracts.md) — current Payment API and proposed target endpoints
- [payment-ledger.md](payment-ledger.md) — append-only financial ledger contract
- [payment-webhooks.md](payment-webhooks.md) — signed webhook verification, idempotency, queue, retry, and DLQ
- [payment-reconciliation.md](payment-reconciliation.md) — provider/internal/order/settlement reconciliation contract
- [payment-testing.md](payment-testing.md) — future Payment security, state, webhook, and recovery tests
- Phase 9 Step 2 adds the Payment/PaymentLedgerEntry/PaymentIdempotency foundation, repository/service boundary, transition guard, abstract provider port, and owner-scoped read API. It does not add a provider adapter or activate the legacy Stripe intent route; the Order snapshot gap blocks Payment creation.
- [marketplace-readiness.md](marketplace-readiness.md) — single-store vs marketplace-ready decision
- [frontend-contract.md](frontend-contract.md) — how the frontend should consume backend contracts
- [catalog-v2.md](catalog-v2.md) — Phase 4 catalog audit and target contract summary
- [catalog-domain-model.md](catalog-domain-model.md) — Catalog V2 product, variant, category, brand, and attribute model
- [catalog-api-contracts.md](catalog-api-contracts.md) — Catalog V2 API and DTO boundary contract
- [catalog-migration.md](catalog-migration.md) — safe migration and compatibility plan
- [catalog-indexes.md](catalog-indexes.md) — Catalog V2 index and query design
- [catalog-events.md](catalog-events.md) — Catalog V2 event schema and domain event contract
- [catalog-testing.md](catalog-testing.md) — unit, integration, security, and compatibility testing strategy
- [../phase-6-inventory-reservation-audit.md](../phase-6-inventory-reservation-audit.md) — current inventory audit and target reservation contract (documentation-only)
- [phase-7-cart-checkout-core-audit.md](phase-7-cart-checkout-core-audit.md) — current Cart/Checkout audit and target quote/orchestration contract (documentation-only)
- [order-lifecycle.md](order-lifecycle.md) — Phase 8 current Order audit and target lifecycle/snapshot contract (documentation-only)
- [adrs/](adrs/) — major architectural decisions

## Design principles

1. Controllers do not mutate aggregate internals directly.
2. Application services orchestrate commands and domain rules.
3. Persistence is domain-aware and aggregate-oriented.
4. Historical order data must be immutable across catalog changes.
5. Payment state must be append-only and ledger-based.
6. Security and ownership rules are not optional.
7. Do not over-engineer toward microservices or multi-tenant marketplace features before the core domain is stable.

## Canonical ownership

- Catalog owns product identity, definition, metadata, classification, category and brand references, media references, lifecycle, and publication.
- Pricing owns price definitions/books, commercial price resolution, compare-at/reference price, validity, and final commercial price authority.
- Promotions owns coupons, promotional rules, eligibility, and discount application to a Pricing-resolved amount.
- Inventory owns stock and availability quantities, reservations, commitments, and adjustments.
- Cart owns cart contents, quantities, and state.
- Orders own lifecycle and the immutable confirmed order snapshot.
- Payments own payment state, transactions, ledger, and provider interaction.
- Fulfillment owns shipments, tracking, and delivery lifecycle.

The current Product `price` and `stock` fields are legacy compatibility fields only. They are not future Pricing or Inventory authority.

## Decision summary

- Architecture style: modular monolith
- Persistence: MongoDB + Mongoose, with future aggregate boundaries and explicit indexes
- Auth: JWT + RBAC, keep current security baseline intact
- Money: integer minor units, canonical currency, no floating-point math
- Payment: provider abstraction with ledger and webhook verification
- Marketplace: remain single-store but marketplace-ready only if future seller features are required
- Frontend: consume typed DTOs and API versioning; do not redesign in this phase
