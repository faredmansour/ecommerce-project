# Payment Domain Model — FOUNDATION AND TARGET

Status: CURRENT foundation models and internal service are implemented; an Order-backed Payment cannot be created from current Orders because the accepted commercial snapshot is absent. Provider execution and the remaining aggregate capabilities stay TARGET/DEFERRED. The legacy Stripe prototype remains direct and is not abstracted.

## Payment Ownership

Payment owns financial intent/authorization/capture/failure/cancellation/refund/dispute state, provider integration, idempotency, append-only ledger, webhook processing, and reconciliation. It references—but does not own—Order lifecycle, Pricing, Inventory, Cart, Shipping, or Fulfillment.

## Payment Aggregate

```text
Payment
 ├── paymentId
 ├── orderId
 ├── customerId
 ├── provider
 ├── providerPaymentId
 ├── providerTransactionReferences[]
 ├── amountMinor
 ├── currency
 ├── paymentMethodType
 ├── attemptNumber / previousPaymentId (for a new retry attempt; immutable linkage)
 ├── status
 ├── idempotencyReference
 ├── createdAt / updatedAt
 ├── metadata (allowlisted, non-sensitive)
 └── ledgerEntries[] (append-only records, inline or referenced)
```

TARGET fields and ownership:

| Field | Rule |
| --- | --- |
| `paymentId` | Internal immutable Payment aggregate ID; never use provider ID as database primary identity. |
| `orderId` | Required reference to the Order whose accepted total is being settled. Validate ownership and payment eligibility server-side. |
| `customerId` | Authenticated customer reference derived by server from Order/Checkout; never trust a request-body user ID. |
| `provider` | Server-selected adapter key, such as a future `stripe`, `paymob`, or another approved provider. Client cannot choose arbitrary adapter/configuration. |
| `providerPaymentId` | Provider intent/transaction ID, indexed and unique within provider namespace when guaranteed by provider. It is not the internal `paymentId`. |
| `providerTransactionReferences[]` | Authorization/capture/refund/dispute references, each typed and linked to provider event/ledger entry. Avoid duplicate untyped provider IDs. |
| `amountMinor`, `currency` | Immutable accepted amount/currency sourced from the Order snapshot. Adjustments/refunds are separate ledger/refund records, not mutation of original amount. |
| `paymentMethodType` | Non-sensitive method classification (`card`, wallet/local method, `cod` obligation); no PAN/CVV. Preserve customer consent and provider token reference only where permitted. |
| `attemptNumber` / `previousPaymentId` | Optional retry lineage. Each Payment aggregate is one attempt; a failed/cancelled attempt is terminal and a retry gets a new `paymentId` linked to the prior attempt. Do not overwrite or reopen the old attempt. |
| `status` | Current derived Payment state from valid transitions/ledger; not `Order.status` and never client-set. |
| `idempotencyReference` | Server-stored action key/request identity mapped to provider idempotency where supported; unique scope and request hash. |
| `metadata` | Allowlisted operational context such as currency exponent, risk decision reference, country/method, or reconciliation marker; no sensitive authentication/card data. |

CURRENT foundation fields are implemented in `backend/models/paymentModel.js`. The initial runtime supports only `card` as a Payment method type and the core states through `cancelled`; refund/dispute fields and behaviors are deferred. `paymentId` is a generated UUIDv4 separate from Mongo `_id`, Order ID, and provider references. Metadata is strict and limited to safe request/correlation/channel fields.

CURRENT service input is an internal command only. It loads the Order by both Order ID and authenticated customer ID, and requires `status: pending_payment` plus `commercialSnapshot.grandTotalMinor` and `commercialSnapshot.currency`. The current Order model has neither target field, so creation fails closed and writes no Payment. Do not pass browser-supplied money to this service.

## Identifier Separation

- Internal Payment ID: system-owned immutable primary reference.
- Internal Order ID: system-owned aggregate reference.
- Public Order number: customer support identifier owned by Orders; separate from Mongo `_id` and Payment ID.
- Provider payment/intent ID: external processor reference, unique only within provider semantics.
- Provider event/transaction ID: deduplication/audit reference for one provider event/action.
- Idempotency key: client action or server workflow identity; not an entity ID and not a provider ID.

Never expose provider identifiers as authorization tokens or infer customer ownership from them. Every lookup is scoped through Order/Payment ownership and role policy.

## Money Contract

TARGET Payment stores `amountMinor` and ISO 4217 `currency` from the accepted Order snapshot. It does not recompute amount from Product, PriceBook, PriceDefinition, Coupon, Cart, Shipping configuration, or browser request. Provider conversion is an adapter operation using currency metadata; do not hardcode major-unit `* 100` across currencies. FX is unsupported unless separately approved and recorded.

Original amount is immutable. Capture, partial capture, refund, partial refund, fee, chargeback, and correction amounts are distinct append-only financial events with explicit operation, amount, and currency. No mixed-currency arithmetic.

## Payment ↔ Order ↔ Inventory

```text
Checkout acceptance -> Order snapshot (commercial authority)
                     -> Payment (financial state/ledger)
                     -> Inventory Reservation (availability state)
```

Payment stores `orderId` and Reservation reference where needed for correlation, but it does not mutate inventory balances. A verified Payment event may cause Checkout/Order orchestration to request Inventory confirmation/release under Phase 6 rules. Payment does not rewrite Order amounts/status directly except through an authorized Order command/event projection.

COD is a Payment obligation/collection workflow, not a card authorization. At Order acceptance, COD can be pending collection; collection/settlement is recorded later in Payment ledger. An Order may be confirmed for fulfillment while Payment remains due, per approved COD policy.

## Non-Sensitive Payment Method Data

TARGET may retain:

- provider token/payment-method reference (opaque, provider-scoped, protected)
- display brand and last four digits where provider supplies and policy permits
- expiration month/year where permitted and operationally necessary
- method type, wallet type, country/channel, 3DS result reference, and provider risk reference

Never store full card number/PAN, CVV/CVC, PIN, magnetic stripe/chip data, or sensitive authentication data. Hosted fields/hosted checkout/provider Payment Element keeps raw card entry in provider-controlled scope. Tokenization reduces scope; it does not by itself certify PCI compliance.

## Deferred Model Decisions

- Exact provider/adaptor list and method availability by country/currency.
- One Payment per Order versus multiple attempts/partial tenders. Recommended: one logical Payment aggregate with multiple immutable attempts/transactions linked to one Order, subject to Order's accepted amount and idempotency policy.
- Manual versus automatic capture. Physical goods may require authorize-then-capture near shipment; digital goods may capture immediately. This is merchant/provider policy and must be explicit per method/order type.
- COD collection timing, delivery failure, settlement, and refund policy.
- Retention, encryption/key management, and token-reference deletion policy.

All are TARGET/DEFERRED; no schema/model is added in Phase 9 audit.
