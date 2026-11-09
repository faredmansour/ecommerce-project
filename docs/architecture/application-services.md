# Application services and use cases

CURRENT: the runtime primarily uses route-level controllers and direct model access. TARGET: application services orchestrate commands within the modular monolith. DEFERRED: introducing these services is future implementation work; this document does not claim they already exist.

## Identity application service
Responsibilities:
- register user
- authenticate
- issue refresh token
- revoke tokens
- reset password
- enforce RBAC

Contracts:
- RegisterUserCommand
- LoginCommand
- RefreshTokenCommand
- ForgotPasswordCommand
- ResetPasswordCommand
- AssignRoleCommand

Important notes:
- keep JWT and refresh-token handling in the identity context
- retain secure hashing and token rotation behavior from the current implementation

## Catalog application service
Responsibilities:
- create product
- update product
- archive product
- list products with filtering and pagination
- resolve related images

Contracts:
- CreateProductCommand
- UpdateProductCommand
- ArchiveProductCommand
- SearchProductsQuery

## Pricing application service
TARGET responsibilities:
- resolve a sellable price from eligible PriceBook/PriceDefinition records
- validate effective dates, currency, and deterministic selection
- manage PriceBook and PriceDefinition revisions through admin commands

Pricing does not calculate coupons, tax, shipping, inventory availability, or a final order total. CURRENT: the Phase 5 `pricingService` module resolves price from PriceBook/PriceDefinition records, but it is not yet a full application-service/aggregate orchestration layer. DEFERRED: remaining target orchestration is specified by [pricing-engine.md](pricing-engine.md).

## Promotions application service
TARGET responsibilities:
- validate coupon/promotion eligibility
- calculate an eligible discount from Pricing-resolved amounts

Promotions owns discounts and coupon rules; it does not define the base price. CURRENT/DEFERRED: there is no authoritative Promotions service; the existing coupon prototype is described in [pricing-engine.md](pricing-engine.md).

## Cart application service
Responsibilities:
- get or create cart
- add item
- update quantity
- remove item
- apply promo or coupon before checkout

Contracts:
- AddCartItemCommand
- UpdateCartItemCommand
- RemoveCartItemCommand
- EstimateCartCommand

## Checkout application service
Responsibilities:
- convert cart to order draft
- resolve current Pricing quotes and validate Inventory availability
- coordinate future Promotions, Tax, and Shipping results
- compose authoritative checkout total
- create immutable order snapshot
- prepare payment intent

Contracts:
- StartCheckoutCommand
- ConfirmOrderCommand

Important rules:
- checkout is a transactional orchestration boundary
- once order is confirmed, downstream pricing cannot mutate it

## Payment application service
Responsibilities:
- create payment intent
- confirm payment result
- process provider webhook
- apply refund or partial refund
- reconcile ledger

Contracts:
- CreatePaymentIntentCommand
- ConfirmPaymentCommand
- ProcessProviderWebhookCommand
- RefundPaymentCommand

Important rules:
- this service is the only one allowed to interact with the provider adapter
- provider-specific details are behind a port/interface

## Fulfillment application service
Responsibilities:
- mark order ready for shipping
- create shipment
- update tracking
- complete delivery

## Review application service
Responsibilities:
- submit review
- update review
- moderate review
- aggregate rating summary

## Notification application service
Responsibilities:
- send order confirmations
- send password reset emails
- send payment status notifications
- send shipment status messages

## Administration application service
Responsibilities:
- list transactions and orders
- manage users and roles
- support moderation and operational audits

## Orchestration and concurrency boundaries
- Checkout orchestration must coordinate inventory reservation, pricing snapshot, order creation, and payment intent creation in a consistent boundary.
- Payment finalization must not be mixed with order status transitions in a single ad hoc transaction.
- Domain services are responsible for invariants; application services orchestrate calls and translate commands to domain events.
