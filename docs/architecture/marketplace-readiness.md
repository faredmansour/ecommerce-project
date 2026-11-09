# Marketplace readiness and growth constraints

## Goal
Assess whether the current architecture is suitable for a future marketplace or multi-seller expansion without forcing a full microservice split.

## Current suitability
The existing implementation is already structured as a modular monolith and therefore can support future marketplace features if the business logic is separated by bounded context and aggregate ownership.

CURRENT: the product is a single-store application and has no seller/marketplace model. TARGET: retain the modular monolith and explicit Catalog, Pricing, Inventory, Orders, Payments, and Fulfillment ownership. DEFERRED: seller, commission, payout, and multi-tenant capabilities are not part of the current phases.

## Required additions for marketplace expansion
- Seller or merchant context
- Catalog ownership and access control per vendor
- Commission or fee calculations
- Payouts and settlement ledger
- Different pricing policies per seller or channel
- Shipping and fulfillment ownership by store or partner
- Tax and VAT policy config per region or marketplace segment

## What becomes critical in a marketplace version
- product ownership and seller authorization
- disjoint inventory and pricing per merchant
- order ownership boundaries
- distributed operational support for refunds, disputes, and payouts
- multi-tenant admin isolation

## Recommended design choice
Do not split into microservices at this phase. Keep one deployable service with modular boundaries, and hold marketplace-specific features behind domain modules that can later be extracted only if business growth justifies it.

## Warning signs to avoid
- catalog and seller logic mixed into a single object model
- order totals computed from live catalog data instead of snapshot data
- a single payment model that assumes only one merchant or one payout flow
- global admin roles without clear ownership boundaries

## Contract-level readiness
The architecture is ready for this future direction if:
- product and order ownership are explicit
- pricing is separate from catalog identity
- payment settlement is ledger-first
- fulfillment is isolated from product metadata
- admin boundaries are explicit and auditable
