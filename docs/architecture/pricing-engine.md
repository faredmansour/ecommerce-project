# Phase 5 Pricing Engine Contract

## Scope and status

This document records current pricing behavior and the target Pricing Engine contract. A limited Phase 5 Pricing Foundation is implemented in runtime; this document does not claim that full Checkout pricing authority is implemented.

- CURRENT: PriceBook and PriceDefinition Mongoose models, a `pricingService` resolver, public quote route, admin management routes, validation, and focused tests exist. Legacy Product, Cart, Order, Coupon, frontend, and Stripe flows still use independent numeric values; Checkout does not yet resolve Pricing quotes or use them as payable authority.
- TARGET: Pricing owns commercial price definitions and deterministic price resolution. Checkout coordinates Pricing with Catalog, Inventory, Promotions, Tax, Shipping, Orders, and Payments.
- DEFERRED: full Pricing aggregate/repository and immutable-revision guarantees, checkout/payment integration, price migration, Promotions, tax, shipping calculation, and authoritative Order snapshot implementation.

## Current pricing audit

| Concern | Current source and behavior | Persistence / consumer |
| --- | --- | --- |
| Catalog price | `Product.price` is a required Mongoose `Number`, minimum zero. Product create/update accept request prices; no currency or decimal scale is stored. | Product document; public Product responses and price sorting; admin edits it directly. |
| Seed and examples | `backend/seed.js` stores decimal values such as `1299.99`. Frontend mock products use decimal `price` and `original_price`. | Seeded Product documents and frontend mock data. |
| Display | `ProductCard`, `ProductDetailPage`, Cart, Checkout, Order, Account, and Admin pages format numeric values using `Intl.NumberFormat`. | `frontend/src/lib/format.js` reads the USD `siteConfig`; Product responses do not carry currency. |
| Compare-at price | The UI reads `original_price` to display a discount. It exists in mock data/UI handling, but not in the Product schema or Product validation. | No authoritative backend persistence or validation. |
| Cart | Frontend sends `product_id`, `name`, `price`, quantity, image, and category. Backend validates the submitted number, does not reload Product, and stores the submitted `price` in `CartItem.price`. | `Cart.items[].price` is a numeric client-provided snapshot; Cart UI sums `price * quantity`. |
| Checkout | React computes subtotal from Cart item prices, shipping from frontend `siteConfig`, coupon discount with JavaScript numbers, and `grandTotal`. Minimum coupon amount is also checked in the UI. | No backend checkout calculation or tax calculation. Shipping is not persisted in the Order model. |
| Order creation | The frontend sends Cart item prices and `totalAmount: subtotal`. Backend validates and stores those supplied items and total without resolving current Product prices. | `Order.items[].price` and `Order.totalAmount` are numeric snapshots of request values; `discount` is stored separately. |
| Coupon | Backend checks code, active flag, and expiry. It calculates a percentage/fixed `discount` from client-supplied `totalAmount`, but does not subtract it from stored `totalAmount` or enforce `minimumAmount`. | Coupon definition is persisted; Order stores a coupon reference and separate numeric discount. Coupon application endpoint returns the Coupon document. |
| Payment | Frontend sends its computed `grandTotal` and currency to `/api/payments/intent`. Backend accepts that amount, defaults currency to USD, and sends `Math.round(amount * 100)` to Stripe. It does not load an Order or resolve Product prices. | Stripe PaymentIntent only; no persisted internal Payment aggregate or ledger. |
| Reporting | Revenue uses Order.totalAmount and/or `Order.items[].price * quantity`. These originate from the current client-supplied order payload. | Admin analytics and account/order views display existing Order numbers. |
| Tests and API docs | Tests, Swagger, and Postman examples use numeric Product, Cart, Order, and payment amounts. | They document current request behavior, not an authoritative Pricing contract. |

### Current flow map

```text
Product.price (major-unit Number, no currency)
  -> frontend Product display and sorting
  -> frontend sends price to Cart API
  -> CartController persists CartItem.price
  -> frontend computes subtotal, shipping, discount, and grand total
  -> frontend sends item prices and subtotal to Order API
  -> OrderController stores supplied items/total and separately calculates coupon discount
  -> frontend separately sends grand total to PaymentIntent API
  -> PaymentController multiplies by 100 and calls Stripe
```

CURRENT behavior is not authoritative or internally consistent: COD Orders store the submitted subtotal without frontend shipping or coupon reduction; Card PaymentIntent receives the frontend grand total while the Order stores the subtotal and a separate discount. These are audit findings, not changes made in this phase.

## Ownership contract

- Catalog owns product identity, definition, classification, lifecycle, publication, and media references. `Product.price` remains CURRENT/LEGACY compatibility only.
- Pricing owns price books, price definitions, effective dates, comparison prices, price validity, resolution, and the resolved commercial unit price.
- Promotions owns coupon/promotion eligibility and discount rules. It consumes resolved Pricing values; it does not define base prices.
- Inventory owns stock, availability, reservations, commitments, and release.
- Cart owns item references, quantities, and cart state; a displayed price is not Cart authority.
- Checkout orchestrates authoritative quotes and the final total.
- Orders own the immutable confirmed commercial snapshot.
- Payments consume the amount and currency from that Order snapshot.

No new Checkout/payment request may trust Product.price, CartItem.price, client discount, subtotal, shipping, tax, or total as authoritative.

## Target resolution overview

The resolver accepts a sellable reference and a server-selected or eligible PriceBook context, then returns one deterministic `ResolvedPrice`. The detailed data model, precedence, currency and error rules are in [pricing-domain-model.md](pricing-domain-model.md). The future API boundary is in [pricing-api-contracts.md](pricing-api-contracts.md).

Target orchestration: Catalog validates sellable identity/publication; Pricing resolves the current price; Inventory validates/reserves availability; Promotions may apply eligible discounts; future Tax and Shipping calculations contribute their own amounts; Checkout composes the total; Orders snapshot it; Payments use the snapshot. Checkout may coordinate reads/reservations transactionally or with idempotent compensation; Pricing does not own Inventory or final order state.

## Legacy migration boundary

Do not remove or migrate Product.price in this audit phase. A later reversible migration may map a legacy Product.price to an initial PriceDefinition only after currency and mapping rules are approved. New Pricing resolution must never silently fall back to Product.price. Existing orders remain unchanged and must not be re-priced from either Product or Pricing data.

## Deferred work

This document is an architecture contract, not the runtime implementation. The limited Phase 5 Foundation already includes PriceBook/PriceDefinition models, a resolver, quote/admin routes, validation, and focused tests. Still deferred are full aggregate/revision and event guarantees, price migration, tax and Promotions engines, shipping calculation, Checkout integration, authoritative Order snapshots, and Payment integration.
