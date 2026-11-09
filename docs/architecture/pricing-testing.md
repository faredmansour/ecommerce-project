# Pricing Testing Contract

## Status

CURRENT: the Phase 5 Pricing Foundation has focused tests for PriceBook creation, PriceDefinition creation, quote resolution, missing Product references, malformed admin IDs, and no fallback to Product.price. Existing Cart/Order/Payment tests still cover legacy client-supplied values. TARGET: the tests below protect complete Pricing ownership and deterministic resolution. DEFERRED: remaining contract coverage, especially effective-window overlap concurrency, revisions, idempotency, and Checkout integration.

## Money tests

- Amounts use integer minor units and an explicit ISO currency.
- EGP and configured currencies use their correct minor-unit exponent, including zero-decimal handling.
- Zero price is valid where the sellable is free; negative PriceDefinition values are rejected.
- Currency mismatch arithmetic/comparison is rejected; no implicit FX conversion occurs.
- Multiplication by integer quantity remains exact and rejects out-of-range values.
- Future percentage adjustments use integer basis points, round-half-up at line level, and cannot exceed the eligible line amount.

## PriceBook / PriceDefinition tests

- Create a valid active PriceBook and a default book; reject duplicate/default ambiguity.
- Create valid base and sale definitions with currency and effective windows.
- Reject malformed currency, non-integer/negative amounts, invalid status/kind, invalid sellable/book references, invalid date ordering, and compare-at below sale price.
- Verify exact effective boundary semantics: `effectiveFrom` inclusive and `effectiveTo` exclusive.
- Inactive and expired definitions are not eligible.
- Same-kind overlapping definitions are rejected; concurrent writes cannot persist an overlap.
- Revisions retain prior price values/audit metadata; deactivation is non-destructive.

## Resolution tests

- One valid base definition resolves to a stable quote.
- One eligible sale definition overrides the eligible base for the same book, currency, and sellable.
- Compare-at is display-only and never becomes the payable amount.
- Explicit eligible PriceBook and configured default selection are deterministic.
- Missing price returns `PRICE_NOT_FOUND`; inactive book/unsupported currency return controlled errors.
- Currency mismatch never selects a price from a different currency.
- Multiple overlapping same-kind candidates return `AMBIGUOUS_PRICE`, not an arbitrary price.
- Resolution does not fall back to legacy Product.price.

## Security and API tests

- Anonymous/customer callers cannot mutate PriceBooks or PriceDefinitions; admin can.
- Public quote calls cannot submit trusted amount/discount/total or access an inactive/private book.
- Invalid ObjectIds, oversized/nested payloads, and unsupported currencies return controlled validation errors.
- Errors do not expose stack traces, secrets, or database internals.
- Retried mutations respect idempotency keys and concurrent updates respect version/overlap checks.

## Boundary / integration tests

- Product/Catalog supplies eligible sellable identity; Pricing resolves price; Inventory supplies availability/reservation independently.
- Promotions owns coupon and discount evaluation; Pricing does not apply coupons.
- Tax and Shipping are not folded into the PriceDefinition.
- Cart's cached/displayed quote is non-authoritative; Checkout re-resolves and detects a changed price before confirmation.
- Confirmed Order snapshots retain amount, currency, sellable identity, quantity, and source reference after later Product or PriceDefinition changes.
- Payment amount is derived from the Order snapshot, never Product.price or client total.

## Legacy compatibility tests

- Existing Product documents with numeric Product.price remain readable and unchanged during initial Pricing rollout.
- Existing Cart and Order APIs/data remain readable during staged migration.
- Historical orders are not migrated or recalculated.
- The compatibility adapter maps legacy Product.price only through an explicitly approved migration path; runtime resolution never silently falls back to it.
