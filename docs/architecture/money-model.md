# Monetary model and financial rules

## CURRENT STATE
The current repository uses raw Number values in product, cart, order, and coupon models. In particular, `Product.price` exists and is used by legacy runtime flows as a CURRENT/LEGACY COMPATIBILITY FIELD. It is not the future authoritative commercial price source.

## TARGET CONTRACT
All monetary values must be represented in minor units to avoid floating-point error.
Examples:
- 19.99 USD is stored as 1999
- 4.50 EUR is stored as 450
- EGP 125.50 is stored as 12550 piastres

The architecture must not use JavaScript floating-point values as authoritative money representation.

## Money model
Money must be represented as:
- amountMinor
- currency

Pricing owns and produces authoritative commercial Money values. Checkout consumes Pricing results; Orders snapshot confirmed values; Payments use the amount and currency from that snapshot. Catalog may retain `Product.price` temporarily for backward compatibility, but no new checkout or payment architecture may treat it as authoritative. See [pricing-domain-model.md](pricing-domain-model.md) for PriceBook, PriceDefinition, resolution, currency precision, and rounding contracts.

The architecture must define value-level rules for:
- unit price
- subtotal
- tax
- shipping
- discount
- promotion effects
- coupon effects
- final total
- provider conversion
- refund amount
- exchange-rate handling where applicable

## Pricing authority
The client-provided values below are never authoritative:
- price
- subtotal
- discount
- tax
- shipping
- total

Pricing calculates and resolves commercial prices; Promotions owns coupon/promotion eligibility and discount application; future Tax and Shipping contexts calculate their own amounts. Checkout composes server-authoritative values. Payment receives the payable amount from the confirmed Order snapshot.

## Order totals vs live catalog prices
Order totals must be snapshots captured at order creation. A later product price change must not retroactively alter an already confirmed order.

## Payment ledger
The payment ledger is the source of truth for all financial state changes. It must store:
- action type
- amountMinor
- currency
- related order
- related payment intent or transaction
- provider event id if applicable
- createdAt

## Refunds and disputes
Refunds are financial events, not order state adjustments alone. Refund entries must be stored as ledger events and propagated as payment state changes.

## Taxes and shipping
Tax and shipping should not be folded into raw product price because they are separate business concerns. They may be calculated in a pricing service but must be persisted as snapshot fields on the order when the order is created.

## Risk controls
- no direct arithmetic between cart and payment state without a checked transformation layer
- promotions and coupons must evaluate under validated and time-bounded rules
- money operations need unit tests that assert exact integer arithmetic
- EGP must be supported as a first-class currency in the target model

## Future implementation note
DEFERRED IMPLEMENTATION: migration from Number-based legacy fields and implementation of Pricing are future work, not runtime changes in the architecture-contract phase.
