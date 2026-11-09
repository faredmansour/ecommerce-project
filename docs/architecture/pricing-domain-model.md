# Pricing Domain Model

## Status

- CURRENT: the runtime has a Phase 5 PriceBook/PriceDefinition persistence and price-resolution foundation. Product.price and request-supplied Cart/Order/payment amounts remain in legacy flows, and Checkout does not yet use resolved Pricing quotes as authority; Product has no currency field.
- TARGET: a modular-monolith Pricing context resolves explicit-currency prices for Catalog sellables.
- DEFERRED: full aggregate/revision guarantees, checkout integration, promotion/tax/shipping calculation, seller pricing, FX, and migration from Product.price.

`Product.price` is a CURRENT/LEGACY compatibility field, not the future authoritative commercial price source.

## Money

The target value object is `Money { amountMinor, currency }`.

- `amountMinor` is an integer count of the currency's smallest unit. Authoritative calculation must not use JavaScript floating-point arithmetic.
- `currency` is an uppercase ISO 4217 code. EGP is a first-class required business currency; USD may remain supported where configured.
- Currency precision comes from currency metadata. Do not hardcode a `* 100` conversion: zero-decimal currencies have a different exponent.
- PriceDefinition amounts and resolved prices must be non-negative safe integers; zero is valid for a free sellable. Negative prices are invalid. Discounts and refunds, when introduced by their owning domains, are represented as non-negative amounts with an explicit operation/type.
- Comparisons and addition require equal currencies. There is no implicit cross-currency comparison or conversion.
- Price times integer quantity is exact integer arithmetic, with safe-range validation. Currency conversion/FX is outside this phase.
- A price is already stored in minor units; do not round a PriceDefinition at read time.

The current Product/Cart/Order values are decimal-looking major-unit Numbers with no stored currency or agreed scale. The frontend formats them as USD, while the payment prototype defaults to USD and multiplies by 100. That current convention is not the target Money contract. The target default store currency is a business configuration decision; EGP must be supported explicitly.

### Rounding contract

Pricing resolves stored integer amounts and performs no floating-point rounding. Future percentage-based Promotions should represent rates as integer basis points and calculate a non-negative discount per eligible line using round-half-up to the smallest currency unit; the discount is capped at that line's eligible amount. Aggregate totals sum integer amounts. The Promotions and Tax contracts must adopt or explicitly revise this rule before implementation. Tax inclusion/exclusion and jurisdictional rounding remain future business decisions.

## PriceBook

The minimum target supports one configured default store PriceBook, with explicit supported currencies. A PriceBook is a selection scope, not a second source of money arithmetic.

Target fields:

- `priceBookId`
- `code` and `name`
- `status`: active or inactive
- `isDefault`
- `currencyCodes[]`
- `createdAt`, `updatedAt`

CURRENT: the Phase 5 Foundation persists PriceBooks and supports an active default book; the app is single-store. TARGET: one default store-wide book is sufficient. FUTURE: channel/region books can be added if business rules require them. Customer-specific books and seller-specific books are not required now; seller pricing is marketplace-future work.

Exactly one active default book is selected for the single-store quote context. An explicitly requested book must be active and eligible; do not silently fall back from an invalid/inactive book to another book.

## PriceDefinition

A PriceDefinition is a versioned, effective-dated commercial price for one sellable reference in one PriceBook and currency.

Target fields:

- `priceId`
- `sellableType`: product initially; SKU only after that future domain exists
- `sellableId`: stable Catalog product identity initially
- `priceBookId`
- `amountMinor`: non-negative integer
- `currency`: ISO 4217 code
- `priceKind`: `base` or `sale`
- `compareAtAmountMinor`: optional display/reference amount, never charged
- `status`: active or inactive
- `effectiveFrom`: inclusive UTC instant
- `effectiveTo`: optional exclusive UTC instant
- `revision`, `createdAt`, `updatedAt`
- `changedBy` and `changeReason` for administrative audit

A base price is the normal commercial selling amount. A sale price is a scheduled Pricing-owned selling amount with its own effective window. A compare-at amount is informational only; it may be supplied on the sale definition or derived from the eligible base price in the same book/currency. It must not be used as the payable amount. If supplied, it cannot be less than the sale amount.

`Product.original_price` is not a backend field today; it appears in mock/demo UI data only. It is not a target Pricing source.

Changing a price creates a new revision/definition and retains prior records for audit; do not destructively overwrite history. Deactivation is not deletion. Promotions and coupons are separate and do not become `priceKind` values.

## Price context

Required resolver context:

- sellable type and stable sellable ID
- currency
- server-selected active PriceBook (or its configured default)
- one server-captured `asOf` instant

Current single-store resolution does not require customer identity, segment, seller, channel, region, or FX. Those are explicit future context extensions, not inferred from client-supplied price data.

## Deterministic resolution

1. Validate the Catalog sellable exists and is eligible for the requested public/checkout use; Catalog owns that decision.
2. Select the explicitly eligible PriceBook or the configured active default book.
3. Select PriceDefinitions matching sellable, book, currency, active status, and `effectiveFrom <= asOf < effectiveTo` (with an absent `effectiveTo` meaning no end).
4. If exactly one eligible sale definition exists, it wins over the base definition. Otherwise resolve the single eligible base definition.
5. More than one eligible definition of the same kind for the same sellable/book/currency is a configuration error (`AMBIGUOUS_PRICE`), not an arbitrary tie-break. Prevent overlapping same-kind effective intervals on writes and detect them on reads.
6. If no eligible definition exists, return `PRICE_NOT_FOUND`. Unsupported currency/book context returns a controlled validation/not-found error. Never fall back to Product.price.
7. A valid sale may carry an explicit compare-at value; otherwise an eligible base price in the same book/currency may be returned as a reference. It never changes `amountMinor`.

This produces one `ResolvedPrice` or one stable error for the same data and context. There is no implicit currency conversion or seller/channel fallback.

## ResolvedPrice and snapshot inputs

A resolved quote contains `sellableId`, `priceId`/revision, `priceBookId`, `amountMinor`, `currency`, `priceKind`, optional `compareAtAmountMinor`, and the resolution instant. It is a quote, not an Order and not an Inventory reservation.

Checkout may snapshot `productId`/sellableId, SKU when introduced, name, unitPriceMinor, currency, quantity, and an optional priceId/priceBook reference. Promotions, taxes, shipping and final totals are snapshotted by their owning contracts at confirmation. Later Product or PriceDefinition changes do not alter a confirmed Order.

## Boundaries

- Pricing resolves a base/sale commercial price; it does not evaluate coupon eligibility or promotional rules.
- Promotions owns coupons, discount rules, eligibility, and discount amounts.
- Tax owns future tax calculation; no tax-inclusive/exclusive policy is established by current code.
- Shipping/Fulfillment owns shipping options and cost; shipping is not part of Product price.
- Checkout orchestrates the quote, Inventory reservation, optional promotion/tax/shipping results, final total, Order creation, and payment initiation.
- Cart may store the last displayed quote metadata for a UX comparison, but it never owns authoritative price or total. Checkout must resolve again and surface changed price before order confirmation.

## Future history and concurrency

Admin changes must be attributable to an actor, timestamp, previous/new definition, and reason. Price definitions are retained as revisions. Writes reject overlapping effective intervals for the same price book, sellable, currency, and kind; concurrent writes use a version/conditional update and re-check overlap. Checkout captures one `asOf` context and a resolved price revision for the order snapshot. Duplicate checkout/idempotency behavior belongs to Checkout and follows the existing concurrency contract.
