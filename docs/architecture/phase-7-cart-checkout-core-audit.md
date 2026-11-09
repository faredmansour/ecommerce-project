# PHASE 7 — Cart & Checkout Core Audit

Status: Documentation-only forensic audit and target contract. No Cart/Checkout runtime behavior is changed by this document.

This audit separates:

- CURRENT: behavior observed in the repository at audit time.
- TARGET: the proposed authoritative Cart and Checkout architecture consistent with Phases 3–6.
- DEFERRED: runtime implementation, business policy choices, provider integration, and migration work not authorized in this audit.

## Executive Findings

CURRENT: Cart is an authenticated-user MongoDB document with item subdocuments. The browser sends product identity, display metadata, price, and quantity. Cart and Checkout totals are browser calculations. The backend has no Checkout application service or quote model: `POST /api/orders` creates an order directly from request payload, while `POST /api/payments/intent` creates a Stripe intent from a separate client amount/currency request.

Consequences:

- Cart prices, order line prices, order total, currency, coupon discount basis, and payment amount are not consistently server-authoritative.
- Shipping is calculated only in the frontend and is not included in the persisted order total. Tax is not implemented.
- Cart/Order flows do not resolve Phase 5 prices or reserve Phase 6 inventory.
- Card payment is confirmed in the browser before the order is submitted. An order creation failure after provider success can leave a successful payment without a corresponding order record.
- No checkout idempotency, payment recovery workflow, cart expiry, or duplicate-order prevention is implemented.

## 1. Current Cart Implementation

### Runtime components

| Concern | CURRENT implementation |
| --- | --- |
| Model/schema | [backend/models/cartModel.js](../../backend/models/cartModel.js): `Cart` has `user` (required, unique) and `items[]`; item fields are optional `product` ObjectId ref, required `product_id`, `name`, `price`, optional `image`/`category`, and `quantity` default 1 / min 1. Schema timestamps are enabled (`createdAt`, `updatedAt`). |
| Controller | [backend/controllers/cartController.js](../../backend/controllers/cartController.js): `getCart`, `addToCart`, `updateCartItem`, `removeCartItem`. Queries are scoped by `req.user.id`. It exports no `clearCart`; Order creation performs a separate `Cart.findOneAndDelete`. |
| Router/middleware | [backend/routers/cartRouter.js](../../backend/routers/cartRouter.js): router-wide `protect`; GET `/`, POST `/`, PATCH `/:id`, DELETE `/:id`; request validation on add/update and ObjectId validation on item path for update/delete. |
| Validation | [backend/controllers/validation/cartValidation.js](../../backend/controllers/validation/cartValidation.js): add requires 24-hex `product_id`, name, non-negative number `price`, positive integer quantity (default 1); update requires positive integer quantity. No maximum quantity is defined. |
| API/client | [frontend/src/services/api.jsx](../../frontend/src/services/api.jsx): `cartAPI.getAll/add/update/remove` calls `/api/cart`; JWT interceptor attaches the token. Mutations notify in-memory cart subscribers. |
| UI | [frontend/src/context/CartContext.jsx](../../frontend/src/context/CartContext.jsx), [frontend/src/pages/CartPage.jsx](../../frontend/src/pages/CartPage.jsx), [frontend/src/pages/CheckoutPage.jsx](../../frontend/src/pages/CheckoutPage.jsx), ProductCard and ProductDetailPage. |

### Persistence, guests, ownership, empty state

- Cart state persists in MongoDB, not local storage. The unique `user` index models one cart per user.
- Cart routes require authentication. ProductCard/ProductDetailPage redirect unauthenticated customers to login. CartContext clears in-memory state when unauthenticated. There is no guest cart or guest-to-user merge.
- `getCart` returns `{ data: [] }` when no Cart document exists. CartPage renders an empty state; CheckoutPage renders an empty-cart state after loading.
- Each cart read/mutation queries the cart using the authenticated user ID. Update/remove then operate on the subdocument ID within that owned cart.
- Update/remove validate the route item ID as an ObjectId before lookup, then resolve it only inside the caller-owned Cart. This is the current IDOR boundary; the Cart test suite does not include cross-user item-ID tests.
- CartContext catches a failed cart fetch by clearing the displayed cart, so a network failure can look like an empty cart. Checkout's initial `Promise.all` has no catch for a failed cart request; it runs `finally` and can render the empty state with an unhandled rejected request.
- There is no `expiresAt`, TTL index, abandoned-cart cleanup, or explicit cart lifecycle in runtime.

### Add/update behavior and validation limitations

- `addToCart` accepts `product_id`, `quantity`, `name`, `price`, `image`, and `category` from the request. It does not load Product, validate that the ID exists, verify that `product` matches `product_id`, or check Catalog status/publication.
- The optional `product` ObjectId field on CartItem is not populated by the controller. Product existence is therefore not established by the current Cart flow.
- The controller checks `if (!product_id || !name || !price)`. This rejects a zero price even though Joi allows `price: 0` and the schema permits a free item. Frontend callers commonly send `product.price || 0`.
- Existing items are found by exact `product_id` string equality and their quantity is incremented. Otherwise a new item is appended. There is no explicit variant/SKU identity, so distinct variants cannot be represented reliably.
- The check-then-update is application-level read/modify/save. It has no explicit optimistic version, atomic increment, transaction, unique item constraint, or idempotency key. A retried add increments quantity again; concurrent adds may race and there is no defined duplicate-item invariant under concurrent requests.
- `updateCartItem` validates a positive integer and sets the subdocument quantity. It does not check Product existence, status, price, or availability. CartPage removes a line when its decrement would reach zero.
- ProductDetailPage displays `Product.stock` as an “in stock/out of stock” label and quantity count, but its QuantityControl is not given a stock-based maximum and its Add to Cart button is disabled only while the request is in progress. ProductCard similarly adds quantity 1 without a stock check. This display does not enforce availability.
- `removeCartItem` filters by the embedded item's subdocument ID and saves the caller-owned Cart. There is no separate clear endpoint or controller function.
- Repeating update with the same quantity is effectively state-idempotent, but the API has no idempotency contract. Repeating remove after the item is gone still saves the filtered cart and returns success if the cart exists.
- Product routes archive/hide products rather than physically deleting them, but no cart cleanup or revalidation is triggered. A product can also be deactivated/hidden while a cart item remains. Cart and order handlers do not re-check it.

### Cart price and total behavior

- ProductCard and ProductDetailPage send `product.price` to Cart API; WishlistPage's add-to-cart path also passes the item's price. Backend stores it in `CartItem.price` as a Number.
- No currency, price book, price definition, or pricing revision is stored in Cart.
- CartPage calculates subtotal as `sum(item.price * item.quantity)`. It calculates shipping using frontend config and shows `subtotal + shipping`; Cart has no server-side subtotal/total calculation.
- Checkout independently calculates subtotal from the same Cart prices. It applies coupon arithmetic and shipping locally. Cart does not apply coupons, shipping methods, or tax.
- Currency display comes from frontend [frontend/src/config/site.config.js](../../frontend/src/config/site.config.js), currently USD. Product, Cart, and Order runtime values do not carry currency.

## 2. Current Checkout Trace

### Browser to API flow

1. [CheckoutPage](../../frontend/src/pages/CheckoutPage.jsx) redirects guests to `/login`; for an authenticated user it loads `GET /api/cart` and `GET /api/addresses`. Address load errors are converted to an empty list. Cart load errors are not handled in the Promise chain.
2. The browser selects or edits an address in React component state. It validates only that full name, phone, line 1, city, and country are non-empty. A new address is not saved by this page. The selected/supplied address is later posted as an Order snapshot.
3. Subtotal is computed from Cart item `price * quantity`. Shipping is computed from `siteConfig.freeShippingThreshold` and `siteConfig.shippingFee`. Coupon discount is computed in JavaScript; `grandTotal = max(0, subtotal - discount) + shipping`. There is no tax calculation.
4. Coupon Apply posts `{ code }` to authenticated `POST /api/coupons/apply`. [couponRouter](../../backend/routers/couponRouter.js) validates a string code; [couponController](../../backend/controllers/couponController.js) finds an active Coupon whose `expiresAt` is greater than now and returns the Coupon document. It does not calculate a quote or reserve coupon usage.
5. For COD, the browser posts an Order directly. For card, StripeCardForm posts `{ amount: grandTotal, currency: "usd" }` by default to authenticated `POST /api/payments/intent`, then calls `stripe.confirmCardPayment` in the browser. Only after the browser reports `paymentIntent.status === "succeeded"` does it call the Order API.
6. `submitOrder` posts `{ items, shippingAddress, paymentMethod, totalAmount: subtotal, couponCode? }` to `POST /api/orders`. Each item carries browser-originated `product_id`, `name`, `price`, `quantity`, `image`, and `category`; the payload also maps `product: i.product`, but Cart add does not persist that field, so it is normally undefined and omitted by JSON serialization.
7. [ordersRouter](../../backend/routers/ordersRouter.js) applies auth and `createOrderSchema`; [orderController.createOrder](../../backend/controllers/orderController.js) rejects admins, validates a supplied coupon's active/expiry state, calculates a discount from the submitted `totalAmount`, creates an Order with status `pending`, and deletes the user's Cart.
8. The browser refreshes CartContext and navigates to `/order-success/:orderId`. The backend stores no Checkout session, provider intent, payment result, or reservation reference with the Order.

### Current request validation and persistence

Exact submitted monetary fields:

- Order request: sends `totalAmount` equal to browser subtotal and an optional coupon code. It does not send a numeric discount, shipping amount, tax amount, grand total, or currency.
- PaymentIntent request: sends browser `grandTotal` as `amount` and browser-selected/default `usd` as `currency`.
- The Order route accepts `paymentMethod`, lines, shipping address, coupon code, and `totalAmount`; it does not accept or derive shipping, tax, or currency fields.
- Therefore card Order `totalAmount` and PaymentIntent amount may differ; COD has no PaymentIntent and the stored Order total still excludes the UI shipping amount and does not subtract the stored discount.

- `createOrderSchema` requires at least one item, an address, each item's valid-looking ObjectId string, name, non-negative price, positive integer quantity, valid payment method, and non-negative `totalAmount`. It does not compare the line sum to `totalAmount`, verify Product existence, or require item IDs to match a stored Cart.
- `Order` persists item price/quantity/name metadata, shipping address fields, optional coupon reference, payment method, client `totalAmount`, server-calculated `discount`, and status. It has no currency, shipping amount/method, tax, quote reference, reservation ID, Payment ID, or idempotency key.
- There is no separately persisted `subtotal` field; legacy `totalAmount` is populated from the client subtotal. The model stores neither a numeric shipping/tax amount nor payment/provider reference. Current Order `status` enum is exactly `pending`, `shipped`, `delivered`; it does not encode `paymentStatus`, and the current update API only changes this Order status.
- Order is created before payment for COD and after browser-side payment success for card. In either case `status` defaults to `pending`; this is not a verified payment state.
- Coupon discount is calculated from client-supplied `totalAmount`; fixed discounts are not capped to eligible subtotal in the controller, `minimumAmount` is not enforced there, and `totalAmount` is not reduced by the discount. The current schema stores discount separately.
- Cart is cleared only after `Order.create` succeeds. Cart deletion and Order creation are not in a MongoDB transaction. If cart deletion fails after order creation, controller returns 500 although the order may already exist; retrying can create another order.

### Payment path, errors, retries, refresh, timeouts

- [paymentRouter](../../backend/routers/paymentRouter.js) protects `POST /intent`; [paymentValidation](../../backend/controllers/validation/paymentValidation.js) accepts positive numeric amount and any three-character lowercase currency; [paymentController](../../backend/controllers/paymentController.js) sends `Math.round(amount * 100)` and that currency to Stripe.
- Payment amount and currency come from the client. The backend does not load an Order or resolve Pricing. The only persisted payment-side object is the provider's Stripe PaymentIntent; there is no internal Payment model/ledger in this path.
- Current payment controller/router exposes no webhook endpoint, no verified webhook processing, no payment-to-order linkage, and no server-side confirmation call. The browser's Stripe result is used to decide when to create the order.
- If payment succeeds but Order API call fails, the customer can have a successful provider payment without a stored Order. If Order creation succeeds but the response is lost, retry can create another order. No idempotency key or request correlation prevents these cases.
- Buttons set a local `placing` state and are disabled after React updates, but this is not a server-side duplicate-submission guarantee. There is no checkout request ID, idempotency record, or recovery endpoint.
- Cart persists across browser refresh; Checkout's coupon, address edits, payment method, and in-progress UI state are component state and are lost. There is no server checkout draft or PaymentIntent lookup/recovery route.
- No application timeout, reservation timer, payment failure compensation, or abandoned-checkout release exists. Network/provider timeout outcomes are not reconciled by this checkout flow.
- Error UI catches coupon apply, COD order submit, and Stripe/card errors. Cart update/remove errors are silently swallowed in CartPage. Axios clears auth state and redirects on 401. There is no consistent domain error contract for checkout conflict, stale quote, unavailable stock, or payment/order reconciliation.

## 3. Client Trust Boundary

| Value | Client controlled today? | Server recalculates today? | Current risk |
| --- | --- | --- | --- |
| Unit price | Yes. Sent to Cart and Order. | No. Order validation only checks non-negative numeric shape; Cart stores it. | Arbitrary prices can be persisted and used for totals. |
| Subtotal | Yes. Browser sums Cart snapshots and sends it as Order `totalAmount`. | No. Server does not compare it with lines or current Catalog/Pricing values. | Under/overstated order amount. |
| Discount | Browser calculates display/grand-total discount from returned Coupon fields. | Order controller separately calculates `discount`, but uses client `totalAmount` as its basis. | Different discount/order/payment totals; minimum and fixed-discount cap not consistently enforced. |
| Coupon discount | Coupon code is client-selected; no numeric discount field is needed in the request. | Server computes a discount from submitted amount, not a server quote. | Client controls the calculation basis; Coupon rules/usage are incomplete. |
| Shipping | Browser controls the fee via frontend config and calculates it locally; it is omitted from Order request. | No server Shipping calculation. | Payment may include shipping while Order total omits it. |
| Tax | No current tax value is sent or calculated. | No. | Tax is absent; do not silently assume tax is included or zero by policy. |
| Total | Browser computes `grandTotal` for display/payment and sends `subtotal` as Order `totalAmount`. | No. Server stores request `totalAmount`. | Order and Payment can represent different payable amounts. |
| Currency | Frontend formatting config is USD; payment API accepts client currency. | Payment API validates only 3 lowercase characters, not store/book eligibility. | Unsupported or inconsistent currency can reach Stripe; no stored Order currency. |
| Payment amount | Yes. Frontend passes its `grandTotal` to PaymentIntent API. | No Order lookup or server recomputation. | Direct amount tampering can create a PaymentIntent for a client-selected amount. |
| Quantity | Yes. Add/update/order payloads originate from browser. | Shape validation only: positive integer. No cart reconciliation or availability check. | Arbitrary but valid quantity can be ordered. |
| Availability | UI can display legacy Product.stock; request may still submit any quantity. | No stock read/reservation in Cart, Order, or Payment flow. | Oversell and stale/out-of-stock purchases. |
| Product identity | Yes. Browser submits `product_id` and optional `product`; Joi validates ObjectId shape. | No Product lookup in Cart or Order. | Nonexistent, inactive, or mismatched identities can be persisted. |

All authoritative checkout values must move to server-side ownership: sellable identity validation, quantity eligibility, Pricing-resolved unit prices, line/subtotals, promotion eligibility/discount, shipping quote, applicable tax, currency, final total, payment amount, inventory reservation, Order snapshot, and payment/order state transition.

## 4. Phase 5 Pricing Integration

### Actual Phase 5 runtime

- `PriceBook` persists active/inactive state, default flag, supported currency codes, and metadata.
- `PriceDefinition` persists product sellable ID, book, integer `amountMinor`, currency, base/sale kind, compare-at amount, active/inactive status, effective window, revision, actor/reason metadata.
- [backend/utils/money.js](../../backend/utils/money.js) normalizes 3-letter currency and accepts only non-negative integer minor amounts. It does not convert major units or perform checkout totals.
- [backend/services/pricingService.js](../../backend/services/pricingService.js) selects an active/default eligible book, enforces book currency support, selects active effective definitions (`effectiveFrom <= asOf`, `effectiveTo` absent or `> asOf`), gives an eligible sale definition precedence over base, reports ambiguous same-kind matches, and returns `PRICE_NOT_FOUND` rather than falling back to Product.price.
- The public `GET /api/pricing/quotes/:sellableId` route currently defaults currency to EGP. PriceBook/PriceDefinition admin routes are under `/api/admin/pricing`.
- Current resolver checks that a Product exists but does not check its active/publication state before returning a quote. It does not establish Checkout eligibility.
- The frontend Cart/Checkout does not call the Pricing API. It continues to display and submit legacy `Product.price`/`CartItem.price` values in major-unit Numbers with USD formatting.
- Legacy Product.price remains required and used by current Catalog display/sorting, but it is not Pricing authority. Phase 5 PriceBook/PriceDefinition quotes use minor units and explicit currency; the two representations are not interchangeable without a defined conversion/context.

### TARGET Cart and Checkout Pricing contract

```text
Cart identity + quantity
  -> Catalog validates the sellable identity/lifecycle
  -> Pricing resolver supplies a display quote for Cart UI (not Cart authority)
  -> Checkout resolves Pricing again at a captured server time
  -> authoritative quote values enter CheckoutQuote and immutable Order snapshot
```

- Cart requests must not accept authoritative unit price, line total, subtotal, discount, or currency. Any display quote is server-produced and cache-only.
- Checkout always calls the Pricing resolver using a server-selected eligible PriceBook, explicit store/customer currency context, and one captured `asOf` instant. It never uses Product.price as fallback.
- PriceDefinition status must be active and effective at quote time; ambiguous same-kind matches or missing/inactive book/currency fail with stable domain errors, not a legacy price fallback.
- If a price changes after Cart creation, Cart display refreshes and Checkout uses the current eligible definition. If it differs from a quote already presented, require explicit customer acceptance of the new quote before confirmation; do not silently charge a changed amount.
- If a definition expires before checkout acceptance, resolve again. If no eligible definition remains, reject quote/order with `PRICE_NOT_FOUND`; never use Product.price.
- If Catalog sellable becomes inactive, archived, hidden, or missing, reject that line at Checkout even though the current quote resolver presently only checks existence. Do not silently drop it.
- Currency changes invalidate prior display/checkout quotes and require a new quote in the server-approved currency. A client cannot select a currency unsupported by the active PriceBook/store policy.
- Promotion/coupon changes invalidate the discount and final quote; re-evaluate through Promotions and return a changed quote for acceptance. A PriceDefinition is not a promotion.

## 5. Phase 6 Inventory Integration

CURRENT: Cart and Checkout never read inventory. Product.stock is a legacy display/report value, not reservation authority. No Reservation model/service, atomic stock mutation, or inventory confirmation/release exists in runtime.

TARGET relationship:

```text
Cart (intent only)
  -> Checkout validates Catalog + Pricing + Promotions + Shipping/Tax inputs
  -> Inventory performs authoritative atomic reservation
  -> Checkout creates/updates an Order snapshot and requests Payment
  -> trusted Order/Payment outcome confirms or releases Reservation
```

- Availability may be shown as an advisory Cart/quote value, but it is not a hold. The reservation command immediately before order/payment progression is the authoritative availability check.
- Reservation belongs to Checkout/Inventory and references the authenticated owner, checkout ID, sellable lines, order/payment references, idempotency key, and expiry. Cart never owns a reservation.
- Use Phase 6 invariants exactly: `reserved + committed <= onHand`; `available = onHand - reserved - committed`; `available >= 0`.
- Multiple lines reserve all-or-nothing by default. A failed line aborts the whole multi-product reservation. Do not partially fulfill without explicit customer-approved policy.
- Concurrent checkout uses Phase 6 conditional MongoDB writes, optimistic version checks, unique idempotency constraints, and MongoDB transactions for inventory + reservation + ledger. Do not use read/calculate/write or Redis locks as authority.
- Duplicate checkout retries with the same idempotency key return the same checkout/order/reservation result. A new key represents a new customer action and must not silently duplicate a still-active checkout.
- Abandoned checkout or payment timeout retains a reservation only until its explicit TTL; an internal expiry process releases it atomically. A timeout with unknown provider outcome is reconciled; do not immediately release if payment may have succeeded until trusted provider state is checked or TTL policy settles it.
- Provider failure, user cancellation, or order rejection releases an active reservation exactly once. Late verified payment after expiry goes through reconciliation/refund/manual exception; it cannot recreate expired stock.
- For card orders, only verified server-side provider state associated with the Order may trigger inventory confirmation. Browser payment success/redirect is not authority.
- COD requires an explicit order-acceptance policy because payment occurs at delivery. Proposed contract: server-accepted COD Order may convert active reservation to committed inventory with a COD payment obligation; financial payment status remains pending until fulfillment reports collection. This is a business-state exception to card capture, not permission for the frontend to confirm stock. Phase 6/7 implementation must agree the exact transition before coding.

## 6. Target Cart Contract

### Ownership decision

Cart persists customer intent, not price authority. Persist only stable Catalog sellable identity and quantity as business input. The first simple-product migration can map one Product ID to one sellable; once variants exist, use the canonical Catalog SKU/sellable ID and retain parent Product/variant IDs as references for display/navigation.

| Cart data | Persist? | Authority |
| --- | --- | --- |
| `cartId`, `userId`, version/timestamps | Yes | Server-owned identity/concurrency metadata |
| `productId` | Yes, as Catalog reference | Catalog-owned reference, validated by server |
| `variantId` / `sku` / `sellableId` | Yes when modeled; canonical `sellableId` is the Inventory/Pricing key | Validated against Catalog; client value is a selector, not trusted identity |
| `quantity` | Yes | Client proposes; server validates positive bounded integer and atomically persists |
| `currency` | No as Cart-owned price state | Server/store/checkout context chooses currency; quote carries it |
| `unitPriceMinor`, `lineTotalMinor` | Not as authoritative Cart fields | Derived from current PriceBook/PriceDefinition; optional response-only display quote |
| `name`, image, category | Prefer Catalog-derived response fields; optional cache only | Never order or price authority |
| `subtotal`, discount, shipping, tax, total | No | Derived only by server Checkout quote |

### Price display, refresh, and invalidation

- Cart GET may return a `CartView` enriched with a server-resolved `displayQuote` per sellable (`unitPriceMinor`, `currency`, `priceId`, revision, `resolvedAt`). It is explicitly non-authoritative and may be stale.
- Prefer not to persist price snapshots on Cart. If a short-lived display cache is persisted for performance, stamp its price reference/time and invalidate on quantity/identity change, currency/context change, product lifecycle change, PriceDefinition update, book activation, and expiry. Checkout still re-resolves.
- Cart line total and cart subtotal are derived display values only. Client-provided copies are ignored.
- Merge duplicate lines by canonical sellable identity, not display product name or untrusted SKU text. Do not merge distinct variants.
- Cart mutations use owner-scoped commands, optimistic version/conditional writes, and bounded quantity limits. Add/update retries need an idempotency strategy so retrying the same add does not double quantity.
- Product deletion/deactivation does not delete historical Cart identity automatically; Cart read/Checkout marks the line unavailable and requires remove/replace. Checkout rejects unavailable lines.

## 7. Target Checkout Quote Contract

`CheckoutQuote` is a server-created, short-lived, immutable quote for the specified cart and destination/context. It is not a reservation and does not guarantee availability. Quote expiry and reservation expiry are separate policies.

| Field | Classification | Contract |
| --- | --- | --- |
| `quoteId` | Authority/identity | Server-generated unique quote ID; never supplied by client. |
| `cartId` | Source reference | Owned Cart used to produce the quote; server verifies customer ownership. |
| `currency` | Authority/context | Server-selected supported ISO currency from store/PriceBook context. |
| `items[]` | Snapshot + derived | Includes `productId`, nullable `variantId`, canonical `sellableId`/SKU when available, `quantity`, `unitPriceMinor`, `lineTotalMinor`, and PriceDefinition ID/revision/book reference. Product name/attributes may be snapshotted for display/order history, not authority. |
| `subtotalMinor` | Derived snapshot | Sum of eligible line totals before Promotions/Shipping/Tax. |
| `discountMinor` | Derived snapshot | Promotions result with applied promotion/coupon references and eligible basis; cannot exceed eligible amount. |
| `shippingMinor` | Derived snapshot | Result from Shipping quote/policy, not frontend config. |
| `taxMinor` | Derived snapshot | Result from Tax policy/service. Current behavior is not implemented; until configured, Checkout must use an explicit approved no-tax policy or report tax unavailable, never silently assume. |
| `totalMinor` | Derived authority | `subtotalMinor - discountMinor + shippingMinor + taxMinor` with currency-consistent integer arithmetic and domain validation. |
| `pricingVersion/reference` | Source reference | Per-line `priceId`, revision, PriceBook, and resolution instant; Checkout also records promotion/shipping/tax policy references when used. |
| `expiresAt` | Authority/lifecycle | Server-selected quote deadline. Expired quote cannot be confirmed; refresh and present changes. |

Field categories:

- Source data: owned Cart ID/lines/quantities, customer-selected coupon code, shipping destination/method, and server-configured currency/context.
- Derived data: item unit prices from Pricing, line totals, subtotal, discount, shipping, tax, total, and eligibility results.
- Snapshot data: quote lines, references/revisions, policy results, and resolved amounts at the quote's `asOf` time.
- Authority data: quote ID, server-selected currency, calculated amounts, expiry, and server-side acceptance state. Client never writes these values.

Quote calculation rejects missing/inactive sellables, missing/ambiguous/expired price, unsupported currency, invalid coupon/promotion, unserviceable destination, unavailable required tax/shipping policy, or expired cart context. Quote retrieval is idempotent/read-only by quote ID; quote creation/acceptance uses an idempotency key.

## 8. Promotions and Coupon Boundary

CURRENT: [Coupon model](../../backend/models/couponModel.js) contains unique uppercase code, percentage/fixed type, non-negative discount value, minimum amount, optional expiry, and active flag. It has no global usage count/limit, per-user use tracking, product/category eligibility, stacking metadata, redemption record, or reservation counter.

- Coupon Apply only looks up active, unexpired coupons and returns the document. Its expiry predicate requires `expiresAt > now`; a coupon without `expiresAt` does not match this query.
- Checkout checks `minimumAmount` in browser against local subtotal. Order controller does not enforce it.
- Browser computes displayed discount from the Coupon document. Order controller computes a separate discount from client `totalAmount`; the client does not submit a numeric discount, but controls its basis.
- There is no coupon usage concurrency protection. Repeated application has no redemption state; coupon code is just sent again on Order creation.

TARGET boundary:

```text
Pricing -> base/sale commercial price
Promotions -> coupon/promotion eligibility and discount rule
Checkout -> combines the validated Price, Promotions, Shipping, Tax, and Inventory results into one quote
Orders -> snapshot the accepted quote
Payments -> charge the server-authoritative Order amount/currency
```

- Promotions alone validates coupon active window, minimum eligible subtotal, customer/product/category eligibility, usage limits, per-user limits, and stacking policy; Checkout orchestrates it.
- Client supplies only coupon code(s), never a discount amount or eligibility assertion.
- Use a server-configured stacking policy; safest initial rule is one coupon/promotion per quote unless explicit rules permit combination.
- Enforce global/per-customer limits atomically. If limited uses must be protected during checkout, create an idempotent expiring redemption hold tied to Checkout/quote and commit it on the owning business transition; release on quote expiry/cancel/failure. Unique redemption keys and conditional counters prevent concurrent over-redemption.
- Coupon changes/expiry between quote and acceptance invalidate the quote and require repricing/reconfirmation. Exact policy for whether a redemption is held at quote creation or acceptance is a Promotions business decision and must be fixed before implementation.

## 9. Tax Boundary

CURRENT: tax is not implemented in the inspected Cart, Checkout, Order, or Payment flow. There is no tax field in Cart or Order schema, no tax calculation request, and no tax line in Checkout UI.

TARGET: Tax is a separate policy/domain. Checkout supplies the accepted cart lines, destination, currency, and discount result; Tax returns auditable tax lines/amount and policy/version references. Checkout composes integer-minor-unit totals, and Orders snapshots tax amount/breakdown and the applicable policy reference at acceptance. Tax jurisdiction, inclusive/exclusive pricing, taxable shipping, exemptions, and rounding are unresolved business/legal decisions; do not silently add tax or assume zero without an approved explicit policy.

## 10. Shipping Boundary

CURRENT:

- Shipping fee and free-shipping threshold exist only in `frontend/src/config/site.config.js` (`5.99` fee, `50` threshold, current USD display). CartPage and CheckoutPage compute them locally.
- Checkout shows a hard-coded estimated delivery string; the browser sends no shipping method, shipping quote ID, or shipping amount.
- The order request includes an address snapshot, but Order has no shipping cost/method/provider fields. `totalAmount` sent to Order is subtotal without the locally computed shipping fee.
- No server delivery-zone/rate validation or shipping provider integration was found. No tax calculation is associated with shipping.

TARGET ownership and contract:

- Cart stores no shipping cost; it may store no destination unless a separately approved saved-cart experience requires it.
- Checkout collects/validates destination and selected service option, then requests a Shipping quote after cart line and address validation.
- Shipping owns serviceability, delivery zone, available method, fee, delivery estimate, and quote validity. Checkout consumes a `shippingQuoteId`, `shippingMethodId`, `shippingMinor`, currency, serviceability result, delivery estimate, and expiry. A quote must bind the destination/line set and be revalidated if either changes.
- Checkout includes shipping in `CheckoutQuote.totalMinor`; Order snapshots accepted method, destination, fee/currency, and quote/policy reference. Fulfillment consumes the accepted service/method and address snapshot; it does not recalculate commercial totals.
- Shipping threshold/free-shipping rules are server policy, not duplicated frontend constants. Any promotion that discounts shipping is owned and applied by Promotions/Shipping policy with explicit precedence.
- Shipping provider interaction remains behind Shipping/Fulfillment adapters and is not a Cart responsibility.

## 11. Target Checkout Orchestration and Ownership

Recommended future sequence, consistent with Phase 3–6:

1. Authenticated customer requests quote for their own Cart with destination, currency context, coupon code, and shipping method selection. Client provides only selectors and intent.
2. Checkout validates Cart version/ownership and Catalog sellable identity, status, publication, and variant/SKU mapping.
3. Pricing resolves every line at one captured server `asOf`; Promotions evaluates eligibility and discount; Shipping resolves serviceability/rate; Tax resolves an approved policy result.
4. Checkout returns immutable `CheckoutQuote`, with explicit expiry and changed-price presentation rules. Availability displayed here is advisory.
5. Customer accepts an unexpired quote; Checkout validates quote ownership/version and uses idempotency key. Inventory atomically reserves all requested sellable quantities, all-or-nothing, in Phase 6 transaction boundaries.
6. Checkout creates an Order snapshot from the accepted quote and reservation reference. Payment intent is created only from the server Order total/currency. Do not call provider inside a MongoDB transaction.
7. Provider webhook is signature-verified and idempotent. Server reconciles provider event against Payment and Order references; then the server-side order/payment workflow confirms the reservation. Frontend redirect is UX only.
8. Failure, cancellation, timeout, or expiry releases reservation exactly once and persists state/ledger references. Late/ambiguous provider results enter reconciliation, not a second order/reservation.
9. COD uses a separately documented server-side order-acceptance transition and payment-due-at-delivery status; it cannot depend on a browser success signal.

Boundaries:

- Cart owns identity, quantity, and per-customer transient state only.
- Checkout owns quote orchestration, acceptance, and idempotent workflow state.
- Catalog owns product identity/definition/publication; SKU/variant is the future sellable identity.
- Pricing owns PriceBook/PriceDefinition and unit price resolution; never Product.price fallback.
- Promotions owns coupon/promotion definitions, eligibility, and discount application.
- Shipping owns shipping serviceability and charges; Fulfillment owns execution/tracking.
- Tax owns tax rules and calculations.
- Inventory owns availability, reservations, commitment, and ledger.
- Orders own immutable accepted commercial snapshots, not live recalculation.
- Payments own provider interaction/state/ledger and use the accepted Order amount/currency.

## 12. Security, API, and Reliability Contract

TARGET APIs (not implemented):

- `GET /api/v1/cart` and item mutation endpoints require JWT and operate only on the current user's cart.
- `POST /api/v1/checkout/quotes` requires authenticated owner, validates Cart/address/context selectors, and accepts an `Idempotency-Key`; it must reject price/total fields from clients.
- `GET /api/v1/checkout/quotes/:quoteId` is owner-scoped and returns the immutable quote and expiry.
- `POST /api/v1/checkout/quotes/:quoteId/confirm` requires owner and idempotency key; server validates quote expiry/version, then coordinates reservation/order/payment creation.
- Internal payment webhook route verifies provider signature, deduplicates provider event ID, and authorizes payment/order/reservation state transitions server-side. It is not callable as a customer confirmation endpoint.

Guest checkout policy:

- CURRENT: guest cart and guest checkout are unavailable; product/cart UI sends unauthenticated customers to login, and Cart endpoints require JWT.
- TARGET initial Phase 7 scope: retain authenticated-only Cart/Checkout so ownership remains bound to `userId` and existing Phase 2 authorization. Do not infer guest identity from an email or client-supplied user ID.
- FUTURE/DEFERRED: if guest shopping is approved, use an opaque server-issued guest-cart credential with expiry, rate limits, constrained read/write scope, and an explicit idempotent merge/reprice on login. Guest support is a product/security decision, not an implied property of the current Cart contract.

Security/reliability requirements:

- Never trust browser amount, discount, currency, product metadata, total, payment result, or availability claim.
- Derive actor/user ownership from JWT, not request body. Validate object IDs and bind each product/variant/SKU to Catalog.
- Use per-user/cart version checks and request idempotency for add/checkout/order/payment operations. Persist request hash/result; conflicting key reuse returns a stable conflict.
- Enforce bounded quantity/line-count/payload limits and rate limits on quote/payment creation.
- Return domain-safe errors for stale quote, changed price, invalid sellable, unavailable item, coupon failure, shipping-zone failure, and retryable conflict. Do not leak provider/Mongo stack data.
- Ensure quote/order/payment/Inventory transitions are recoverable after process crash through durable workflow state/outbox and idempotent consumers. Do not use client redirects as a recovery mechanism.

## 13. Audit Test Coverage and Phase 7 Gaps

CURRENT tests:

- `backend/tests/cart.test.js`: authentication required, add one valid item, reject one invalid item, and read cart contents. It does not test ownership isolation, nonexistent Product, price tampering, zero price, stock, duplicates, concurrent updates, retries, or guest behavior.
- `backend/tests/orders.test.js`: order can be created as pending, admins cannot create, admin status change/summary, and owner/admin read access. It does not assert server repricing, totals, coupons, shipping/tax, payment-order linkage, inventory, idempotency, or failed-payment recovery.
- `backend/tests/pricing.test.js`: PriceBook/PriceDefinition quote, missing product, malformed admin IDs, and no Product.price fallback. It does not test Cart/Checkout consumption or Catalog visibility in quote resolution.
- No tests exercise a full CheckoutPage-to-order-to-payment integration, duplicate checkout, payment succeeded/order failed, browser refresh/recovery, reservation expiry, or concurrent final-unit checkout.

TARGET future Phase 7 test contract:

- Cart: authenticated ownership; guest policy; product/variant identity existence and status; positive bounded quantity; deduplication by sellable; zero/missing price not client-controlled; stale product; retry idempotency; cart version conflict; concurrent add/update/remove; empty cart.
- Pricing: current effective definition, sale/base precedence, expired/inactive/missing/ambiguous price, unsupported currency, active Catalog eligibility, changed price acceptance, no Product.price fallback.
- Promotions: invalid/expired code, minimum basis, fixed/percentage cap, product/category/customer eligibility, stacking, global/per-user limits, concurrent redemption and retry.
- Shipping/Tax: unsupported destination, method/rate expiry, destination/cart change invalidation, tax policy missing/zero explicit policy, currency/rounding consistency.
- Checkout: client tampering for every trust-boundary field; exact server total reconciliation; stale quote and expiry; all-or-nothing Inventory reserve; insufficient stock; concurrent last unit; duplicate quote/confirm; payment intent amount equals Order snapshot; provider failure, timeout, late webhook, success webhook duplicate, order-write failure, cart-delete failure, retry and browser refresh recovery; COD path.
- Security/regression: unauthenticated, foreign cart/quote/order access, role restrictions, malformed IDs, unknown fields, redacted errors, Phase 2 auth protections, Phase 4 Catalog lifecycle, Phase 5 Pricing, Phase 6 Inventory invariants, immutable Order snapshot.

## 14. Deferred Decisions and Phase Boundary

This audit does not implement a Cart service, Checkout service, quote model, Promotions engine, Tax service, Shipping service, Inventory reservation, order/payment orchestration, or migrations. It changes no runtime API/schema/test behavior.

Before runtime implementation, product/business owners must decide: currency/store context, quote TTL, quantity caps, coupon stacking and redemption timing, tax jurisdiction/rounding, shipping zone/method/rate policy, COD commitment lifecycle, and price-change confirmation UX. These decisions cannot be inferred safely from the current frontend constants or legacy numbers.

## 15. Separate State Machines

CURRENT: these target state machines do not exist as runtime Checkout, Payment, or Reservation aggregates. The current Order status enum is only `pending`, `shipped`, `delivered`; PaymentIntent state lives at Stripe and is not persisted as an internal Payment aggregate; Cart has no lifecycle/status field.

TARGET: keep each lifecycle separate and link them with IDs/events, not one shared status field.

| State machine | Target states and legal transitions |
| --- | --- |
| Checkout | `open -> quoted -> accepted -> reserving -> order_pending_payment -> completed`; `open/quoted -> cancelled`; `quoted -> expired`; `reserving -> failed` on unavailable inventory; `order_pending_payment -> payment_failed` or `cancelled`; recovery/retry uses same checkout/idempotency identity. |
| Order | Use Phase 3 order lifecycle: `draft -> pending_payment -> confirmed -> processing -> packed -> shipped -> delivered -> completed`; `pending_payment -> cancelled`; refunds/cancellation follow explicit business policy. Order is the owner of the accepted immutable snapshot. |
| Payment | Use Phase 3 Payment lifecycle: `created -> pending -> authorized -> captured`; `pending -> failed/cancelled`; `authorized -> cancelled`; `captured -> partially_refunded/refunded/disputed`. Provider webhooks are verified, deduplicated inputs to this server-owned machine. |
| Reservation | Use Phase 6 reservation lifecycle: `created -> active`; `created -> cancelled` before allocation; `active -> confirmed/released/expired`; terminal states do not reopen. For COD, server-side order acceptance policy must specify confirmation/commitment without pretending payment was captured. |

These machines are coordinated by Checkout but are not interchangeable. An Order `pending` status does not mean payment succeeded, a Payment `succeeded` browser result does not mean Order is persisted, and Cart contents do not mean inventory is reserved.

## 16. Idempotency and Retries

CURRENT: no Cart idempotency keys, Checkout quote/idempotency record, Order-create idempotency, Reservation idempotency, or application PaymentIntent idempotency key is present in the inspected paths. Stripe call is made without a provider idempotency option. Repeated add increments quantity. Repeated Order POST can create another Order. The current cart/order tests do not test retries.

TARGET operations require distinct keys/scopes:

| Operation | Target idempotency scope and behavior |
| --- | --- |
| Cart mutation | `(userId, cartId, clientActionKey)` with canonical request hash. Exact retry returns prior result; same key/different payload conflicts. Quantity set can be state-idempotent, but add-delta must not increment twice. |
| Quote creation | `(userId, checkoutId, quoteRequestKey)`; exact retry returns the same quote ID/snapshot/expiry, not a second quote that changes price silently. New customer intent gets a new key. |
| Order creation/confirmation | `(userId, checkoutId, confirmKey)` with unique Checkout-to-Order mapping; exact retry returns same Order. Conflicting quote/version or key reuse returns a stable conflict. |
| Reservation | Use Phase 6 scoped idempotency key + request hash; retry returns original Reservation and performs no second stock movement. |
| Coupon redemption | Promotions-owned redemption key unique per coupon/customer/order or quote policy; concurrent duplicate requests consume one use only. |
| Payment initialization | Application payment-attempt key scoped to Order and method; pass provider idempotency key to Stripe and persist correlation. Retrying unknown provider outcome reconciles by the same key/reference instead of creating another charge. |

All records retain request hash, status/result, and timestamps. Transient database/provider failures may retry with the same key and bounded policy; business conflicts do not retry as new requests. A redirect or browser retry cannot create a new logical order/payment silently.

## 17. Concurrency and Transaction Boundaries

### CURRENT behavior

| Operation | Current persistence/atomicity |
| --- | --- |
| Cart add/update/remove | Controller reads a Cart, mutates a Mongoose document, and saves it. A Mongo document save is atomic as a write, but there is no explicit optimistic version command, transaction, or idempotency contract for the read/modify/write flow. Two tabs/devices can race; no behavior is tested. |
| Quote creation | No runtime quote operation or Quote model exists. |
| Coupon apply | Read-only lookup. No usage/redemption write exists, so there is no usage limit to protect currently. |
| Order creation + cart clear | `Order.create` and `Cart.findOneAndDelete` are separate database operations without a MongoDB session/transaction. Partial completion is possible. |
| Payment initialization | Stripe API call is an external operation. No internal Payment attempt is persisted and no database/provider atomic transaction exists. |
| Inventory reservation | No runtime inventory document/operation/transaction exists. |

No `startSession`/`withTransaction` checkout path was found in the inspected runtime. The Phase 2 security baseline also records payment/order partial-failure risks.

### TARGET transaction plan

| Operation | Target consistency boundary |
| --- | --- |
| Cart mutation | Prefer one atomic conditional write/version increment to a Cart document. Use a multi-document transaction only if a separate idempotency record/outbox must commit with it. Never rely on stale document replacement without version check. |
| Quote creation | Pricing/Promotions/Shipping/Tax are quote inputs and can change independently. Capture one `asOf` and references; persist immutable CheckoutQuote plus idempotency result atomically in a short local MongoDB transaction if stored separately. Do not hold a DB transaction open while calling external services. Quote is not an Inventory hold. |
| Reservation | Phase 6: conditional InventoryItem writes + Reservation + ledger + idempotency (+ outbox) in one MongoDB transaction. |
| Order creation | After acceptance, create Order snapshot and Checkout transition consistently with the reservation/checkout state in a local Mongo transaction where collections share MongoDB. If coupled with the Phase 6 reservation transaction, include reservation lines/ledger and Order only if deployment/domain design approves one local transaction; otherwise use durable saga/outbox compensation. No external API inside it. |
| Coupon usage | If limits are introduced, Promotions owns atomic redemption/counter and idempotency. Hold/commit/release transaction is local to Promotions/Checkout persistence; no provider call inside. |
| Payment initialization | Persist Payment attempt/idempotency state before or around the provider request, call Stripe outside MongoDB transaction, then persist provider reference/result. This is an external eventual-consistency boundary; reconcile timeout/unknown result and compensate (release reservation/cancel Order) idempotently. |

This target classification does not claim transactions exist in CURRENT runtime: a single Cart document save/Order insert is an atomic database write, but current Cart read/modify/save is not a designed concurrency protocol; Order insert and Cart delete are two independent writes; PaymentIntent creation is an external Stripe call; coupon lookup is read-only; there is no quote or reservation write today.

MongoDB transactions require supported replica-set deployment. If unavailable, do not silently substitute non-atomic stock reservation; document a valid single-document/outbox alternative before enabling checkout.

### Required concurrency cases

- Two tabs/devices editing one Cart: use per-cart version/conditional writes and return a conflict/refresh response rather than silently losing changes.
- Duplicate checkout or client retry: same idempotency identity returns one quote/order/reservation/payment attempt.
- Price changes between quote and confirm: verify quote expiry and PriceDefinition references; return refreshed quote and require acceptance.
- Inventory final-unit race: Phase 6 atomic conditional reservation lets at most one checkout reserve the last unit.
- Coupon last-use race: Promotions unique redemption/conditional counter allows only configured uses.
- Order create/cart clear race: one checkout-to-order idempotent mapping and local transactional/saga state prevents duplicate Orders.
- Payment retry/provider timeout: reuse application/provider idempotency key; webhook deduplication handles late/duplicate events.

## 18. Security Verification and API Separation

CURRENT controls verified from the Phase 2 baseline and runtime:

- Cart routes apply `protect`; cart queries use `req.user.id`; item mutation IDs are validated and looked up within the caller's Cart. This is a useful owner boundary, but cart item IDOR is not directly covered by current Cart tests.
- Add/update schemas validate ObjectId syntax and quantity shape. They do not validate product existence, lifecycle, price authority, stock, or maximum quantity.
- Order route applies `protect`; details enforce owner/admin access. Order create accepts client identity/prices/totals after shape validation.
- Payment and coupon routes require authentication. Payment amount/currency remain client-supplied.
- Production has a global `/api` rate limit of 100 requests/15 minutes and auth limiter; no dedicated Cart/Checkout/payment-create quota or distributed idempotency control was identified. Limits apply only when `NODE_ENV=production`.
- Controller catches use a generic internal error message; production shared error handling redacts 500s per [SECURITY_BASELINE.md](../../SECURITY_BASELINE.md). Validation errors may disclose field-level validation detail, not database/provider internals.
- Phase 2 baseline explicitly lists client-supplied Order items/totals, client PaymentIntent amount/currency, lack of signed webhooks/idempotency, and coupon-minimum risk as deferred findings.

TARGET API routes described in section 12 are proposals only. Current routes are `GET/POST /api/cart`, `PATCH/DELETE /api/cart/:id`, `POST /api/orders`, `POST /api/payments/intent`, `POST /api/coupons/apply`, and address routes; there is no current `/api/checkout` or quote endpoint. Keep all future quote/confirm/payment webhook APIs labeled NOT IMPLEMENTED until code exists.

Security invariants: validate and bind Cart ownership, quote ownership, Order ownership, sellable identity, and coupon eligibility server-side; reject unknown price/total fields; enforce positive bounded quantities; use CSRF/session controls appropriate to the auth model; rate-limit quote/payment creation; redact failures; and verify provider signatures. Client confirmation/replay is never payment or inventory authority.

## 19. Target Application Services, Repositories, and Events

All of these are TARGET/DEFERRED contracts, not current runtime classes:

| Application service | Responsibility |
| --- | --- |
| `CartService` | Owner-scoped add/set/remove/clear, canonical sellable merge, quantity limits, cart version, idempotent commands. |
| `CartPricingService` | Enrich CartView with non-authoritative display quotes from Phase 5; never persists a client price or owns Checkout amount. |
| `CheckoutService` | Orchestrate quote request/acceptance, ownership, idempotency, Inventory reservation, Order creation, Payment request, cancellation/recovery. |
| `CheckoutQuoteService` | Resolve Catalog/Pricing/Promotions/Shipping/Tax inputs at one server `asOf`, construct immutable CheckoutQuote and enforce expiry/reacceptance. |
| `CheckoutValidationService` | Validate Cart version, sellable lifecycle, quantity, quote freshness, destination, currency, coupon and payment/order invariants. |

TARGET repositories: `CartRepository` (find by user, versioned mutations, clear); `CheckoutRepository` (idempotency/checkout workflow); `CheckoutQuoteRepository` (save/find owner-scoped immutable quote); existing `PricingRepository`, `PromotionsRepository`, `InventoryRepository`, `OrderRepository`, `PaymentRepository`; and Shipping/Tax repositories only when those domains are approved. Repositories own persistence predicates and transaction-session participation; services orchestrate domain policies.

TARGET events, persisted via an outbox where transactional publication is required: `CartItemAdded`, `CartItemQuantityChanged`, `CartItemRemoved`, `CheckoutQuoteCreated`, `CheckoutQuoteExpired`, `CheckoutAccepted`, `OrderSnapshotCreated`, `PaymentAttemptRequested`, `PaymentVerified`, `CheckoutFailed`, and `CheckoutCancelled`. Reservation/Inventory events come from Phase 6. CURRENT: no Checkout event publisher/outbox was found; do not describe these events as implemented.

## 20. Order Snapshot Boundary

CURRENT Order stores client-supplied item identity/name/price/quantity, shipping address snapshot, payment method, client `totalAmount`, server-calculated `discount`, and basic status. It does not store currency, subtotal as a separate field, shipping/tax amounts, pricing/promotion references, CheckoutQuote, Reservation, or Payment reference. The current model is not a verified immutable commercial snapshot: the original request is accepted without loading Catalog/Pricing, and only status is intended to change in the current controller.

TARGET Order owns a point-in-time immutable accepted commercial snapshot, including sellable/product/variant identity, display name/selected attributes, quantity, unit amount in minor units, currency, line amount, applied discount/promotion references and amount, shipping method/address/amount, tax breakdown/amount where legally configured, total, quote/pricing references, and accepted timestamps. Include only fields required to reproduce the accepted transaction; do not copy the full mutable Product document. Later Catalog/Pricing changes never rewrite confirmed Order amounts. Payment references and Reservation IDs link separate owner domains; Order does not own provider state or Inventory balances.

## 21. Non-Destructive Cart/Checkout Data Migration

No migration runs in this audit. Target rollout must preserve historical meaning and avoid treating legacy client snapshots as trusted source data.

1. Inventory/read-only census: count legacy Cart item prices, missing Product refs, duplicates, malformed/stale items, Orders with client-derived values, coupon references, and existing Stripe intents where provider lookup permits. Do not rewrite records during census.
2. Cart compatibility: keep current `/api/cart` request/response behavior behind a versioned adapter while clients move to identity+quantity DTOs. Ignore or explicitly deprecate client `price`, `name`, `image`, `category`, and `total` fields; derive display data from Catalog/Pricing.
3. Legacy Cart prices: do not backfill PriceDefinitions or authoritative CheckoutQuote from CartItem.price; those values are client-originated display snapshots. Preserve them only for UI compatibility during a bounded transition, then stop reading them as money authority.
4. Product.price: use only the separately approved Phase 5 currency/scale mapping to create initial PriceDefinitions. Do not silently use Product.price during Checkout or as a fallback if a PriceDefinition is missing.
5. Legacy totals/orders: preserve existing Order documents and payment records unchanged; do not recalculate/reprice historical orders from current Product/Pricing or infer missing shipping/tax/currency. Any new fields are nullable/versioned for old records.
6. Rollout: add target DTO/service behind a feature flag; shadow-compare quote outputs without charging/reserving; migrate Cart UI; switch new Checkout traffic to server quotes; then turn off legacy price/total inputs. Keep versioned legacy APIs until consumers migrate.
7. Rollback: disable new quote/checkout path while retaining new quote/order/payment audit records. Never rewrite historical orders or treat stale Cart price as current authority. Resume legacy read-only display only with an explicit compatibility warning; do not re-enable legacy payment amount as production authority.
8. Backfill: no CheckoutQuote backfill is required for historical Cart state. If migration metadata is needed, make it additive, idempotent, owner-scoped, audited, and reversible; no provider charge or Inventory reservation is created by a backfill.

## 22. Verification Coverage Checklist

This checklist is a target test contract and not a claim about current tests.

- Cart: owner isolation/IDOR, unauthenticated access, malformed item IDs, nonexistent/inactive Product/SKU, quantity bounds, duplicate item normalization, zero price not accepted from client, price refresh, empty cart, concurrent add/update/remove, two tabs/devices, idempotent retry.
- Checkout: authoritative quote/repricing, price/total/discount/shipping/tax/currency tampering, coupon/minimum/stacking/limits, shipping serviceability, explicit tax policy, inventory shortage/reservation/expiry, quote expiry, duplicate checkout, multi-line atomicity, immutable Order snapshot, Cart clear failure, guest redirect/guest-cart policy.
- Payment: intent binds to accepted Order total/currency, no client amount authority, initialization idempotency, duplicate webhook, payment success then order failure, order success then response loss, provider timeout/unknown status, payment failure release, late success after reservation expiry, COD acceptance/collection, refund/cancel.
- Concurrency: duplicate checkout, final-unit inventory race, concurrent coupon last-use race, price revision during quote/confirm, duplicate Order create, payment retry across browser refresh.
- Security: cart/quote/order IDOR, ownership, unauthorized roles, price/total/payment amount manipulation, replay, rate-limit behavior, malformed IDs, unknown request fields, error redaction, Phase 2 auth baseline regression.
- Cross-phase: Catalog lifecycle/SKU identity, Phase 5 Money/PriceBook/PriceDefinition/no Product.price fallback, Phase 6 reservation invariants and idempotency, Promotions-vs-Pricing ownership, Order snapshot immutability, Payment webhook authority.
