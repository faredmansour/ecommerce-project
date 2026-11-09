# Pricing API Contracts

## Status and current API

- CURRENT: the Pricing Foundation exposes `GET /api/pricing/quotes/:sellableId`, plus admin PriceBook and PriceDefinition list/create/update/deactivate routes under `/api/admin/pricing`. It does not yet provide every target DTO, immutable revision/idempotency guarantee, or checkout integration. `POST/PUT /api/products` still accepts Product.price; `POST /api/cart` accepts Cart item price; `POST /api/orders` accepts item prices and totalAmount; `/api/payments/intent` accepts client amount/currency.
- TARGET: Pricing exposes resolved commercial quotes and admin-only price-definition management in the existing modular monolith, with the stronger validation, audit, revision, concurrency, and error contracts below.
- DEFERRED: remaining target guarantees and Checkout authority integration; implemented Foundation routes are not to be mistaken for a complete Pricing/Checkout contract.

Current payment/Catalog/Cart/Order request numbers are legacy behavior, not target authority.

## Public quote contract

### Resolve one sellable

`GET /api/pricing/quotes/:sellableId?currency=EGP` (implemented Foundation route; target contract below is stricter than current behavior)

TARGET: Public read, subject to the same Catalog public visibility rule. The server selects the eligible default public PriceBook and captures `asOf`; clients cannot submit an amount, discount, total, or arbitrary inactive/private book. Currency is required or taken from an explicitly configured store context; it is never inferred from Product.price. CURRENT: the route is public and the resolver selects an active default PriceBook (or internal explicit book context), defaulting currency to EGP; Catalog visibility enforcement is not yet part of the resolver.

Response `ResolvedPrice`:

- `sellableId`
- `priceId`, `revision`, `priceBookId`
- `amountMinor`, `currency`
- `priceKind` (`base` or `sale`)
- optional `compareAtAmountMinor` (display-only)
- `resolvedAt`

For batch catalog views, the Catalog DTO may include a `priceSummary` supplied by Pricing instead of requiring a separate call per product. That summary does not give the frontend price authority.

### Errors

- `400 INVALID_CURRENCY` or `INVALID_SELLABLE_ID` for malformed context
- `404 SELLABLE_NOT_FOUND` or `PRICE_NOT_FOUND` for missing/hidden sellables or no active valid definition
- `409 AMBIGUOUS_PRICE` for conflicting overlapping eligible definitions
- `422 PRICE_BOOK_INACTIVE` / `CURRENCY_UNSUPPORTED` for a known but ineligible context
- Generic redacted 5xx responses; no database details or internal stack traces

## Admin price management (target)

Admin routes require the Phase 2 JWT/RBAC middleware and `admin` role. Customers and anonymous callers cannot create or mutate prices.

- `GET /api/admin/pricing/price-books` - list books
- `POST /api/admin/pricing/price-books` - create a book
- `PATCH /api/admin/pricing/price-books/:priceBookId` - update book metadata/default configuration
- `GET /api/admin/pricing/price-definitions` - filter by sellable, book, currency, status, and effective window
- `POST /api/admin/pricing/price-definitions` - create a revision/definition
- `PATCH /api/admin/pricing/price-definitions/:priceId` - revise metadata or deactivate; an amount change creates a retained revision
- `POST /api/admin/pricing/price-definitions/:priceId/deactivate` - deactivate without deleting history

Create/update DTOs validate ObjectIds (where Mongo IDs are used), enum values, integer `amountMinor`, ISO currency, effective dates, allowed book/sellable references, and compare-at constraints. Mutations record actor/reason and use an idempotency key for retryable creates plus a version/conditional-write check for concurrent edits. No physical DELETE route is proposed for price history.

## Request DTOs

`CreatePriceDefinitionRequest`:

```json
{
  "sellableType": "product",
  "sellableId": "<product-id>",
  "priceBookId": "<price-book-id>",
  "amountMinor": 129900,
  "currency": "EGP",
  "priceKind": "base",
  "effectiveFrom": "<UTC instant>",
  "effectiveTo": null,
  "compareAtAmountMinor": null,
  "changeReason": "Initial price"
}
```

`amountMinor` is an integer in the currency's minor unit. Requests never include an authoritative subtotal, discount, tax, shipping amount, or final total. A client cannot set Pricing ownership fields such as activation actor or audit timestamps.

## Current/target consumer boundary

CURRENT: existing Product, Cart, Order, and Payment APIs continue to expose/accept legacy numbers described in [pricing-engine.md](pricing-engine.md). TARGET: Product/catalog reads obtain display quotes from Pricing; Checkout resolves again on the backend, and frontend-supplied prices/totals are ignored for authority. The legacy APIs are migrated incrementally; they are not silently reinterpreted as Pricing APIs.
