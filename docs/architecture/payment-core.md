# PHASE 9 — Payment Core Audit

Status: Phase 9 Step 2 implements the Payment persistence and domain foundation only. Provider execution, end-to-end checkout, webhook processing, refunds, disputes, and reconciliation remain deferred.

## Classification and Source

Every statement is classified as CURRENT, TARGET, LEGACY, GAP, or DEFERRED. The authoritative payment-rules source reviewed for this audit is the local file `قواعد تطبيق طرق الدفع في المتاجر الإلكترونية.docx` in the user's Downloads folder; it is not stored in this repository. It is guidance, not legal advice or proof of PCI compliance. The rules require hosted card entry/tokenization, no PAN/CVV storage, PCI DSS 4.0.1 payment-page script/header controls, secure transport, signed webhooks, idempotency, server-authoritative amount/currency, fraud controls, 3DS2/SCA, append-only ledger, reservation timeouts, refunds/disputes/reconciliation, wallet/local/COD methods as appropriate, webhook retries/DLQ, and monitoring. The requirements are preserved across the linked Phase 9 contracts.

Relevant repository contracts:

- Phase 3 ownership, Order/Payment separation, transaction and event contracts.
- Phase 5 Money/PriceBook/PriceDefinition and Pricing authority.
- Phase 6 Inventory/Reservation invariants and compensation.
- Phase 7 client trust boundary and CheckoutQuote contract.
- Phase 8 immutable Order snapshot and Order state machine.
- [SECURITY_BASELINE.md](../../SECURITY_BASELINE.md) records current Phase 2 controls and deferred payment risks.
- [payment-architecture.md](payment-architecture.md), ADR 002, and ADR 003 establish provider abstraction and ledger-first target decisions.

## Current Runtime Audit

### Exact implemented path

```text
CheckoutPage
  -> paymentsAPI.createIntent(amount, currency="usd")
  -> authenticated POST /api/payments/intent
  -> paymentRouter: protect + strict empty-body validation
  -> legacy request containing amount/currency is rejected with 400
  -> Stripe is not called; checkout does not reach browser confirmation or Order creation
```

The Stripe PaymentIntent prototype remains in the frontend dependencies/configuration and documented legacy contract, but its amount-bearing endpoint is now fail-closed. It is still a direct Stripe integration, not a `PaymentProvider` adapter. It cannot resume until Order provides an accepted server-side commercial snapshot and a later step implements the provider flow.

CURRENT details:

- [backend/controllers/paymentController.js](../../backend/controllers/paymentController.js) fails closed with `ORDER_AMOUNT_UNAVAILABLE`; it does not call Stripe.
- [backend/routers/paymentRouter.js](../../backend/routers/paymentRouter.js) protects the legacy `POST /api/payments/intent` and owner-scoped `GET /api/payments/:paymentId` routes.
- [backend/controllers/validation/paymentValidation.js](../../backend/controllers/validation/paymentValidation.js) rejects unknown request fields, including the legacy client `amount` and `currency`; Payment ID path parameters must be UUIDv4 values.
- [frontend/src/services/api.jsx](../../frontend/src/services/api.jsx) posts the browser values to `/api/payments/intent`. [frontend/src/lib/stripe.js](../../frontend/src/lib/stripe.js) conditionally loads Stripe.js when `VITE_STRIPE_PUBLISHABLE_KEY` is configured.
- [frontend/src/pages/CheckoutPage.jsx](../../frontend/src/pages/CheckoutPage.jsx) displays a Stripe `CardElement`, creates the intent using browser-calculated `grandTotal`, calls `stripe.confirmCardPayment` from the browser, and only then submits the Order when the browser result says `succeeded`.
- COD is represented as an Order `paymentMethod` value; there is no COD Payment adapter, collection record, or settlement workflow.
- `Order` persists `paymentMethod` but no Payment ID/provider ID, payment state, amount/currency reference, refund, dispute, or ledger entry.
- Payment, append-only PaymentLedgerEntry, and PaymentIdempotency models plus repositories, a transactional internal PaymentService, core transition guard, and abstract PaymentProvider port now exist. The service accepts only an Order owner and its target server-side `commercialSnapshot`; it fails with `ORDER_AMOUNT_UNAVAILABLE` for current Orders, which store no such snapshot. No Payment creation endpoint invokes it, no provider adapter exists, and there is no webhook, refund, chargeback/dispute, or reconciliation runtime.
- `backend/tests/payment.test.js` covers the implemented foundation. No Stripe intent, webhook, refund, or reconciliation integration test is implemented.
- `backend/connection/config.env.example` includes optional `STRIPE_SECRET_KEY`; frontend uses `VITE_STRIPE_PUBLISHABLE_KEY`. Secrets are not part of this document. Never place secret keys in frontend or Git.

### Critical current risks

- GAP: The legacy intent request’s client amount/currency are now rejected. Current checkout cannot create a PaymentIntent until an Order supplies the accepted server-side amount/currency snapshot.
- GAP: The current checkout can also produce an internal amount mismatch even without tampering. `CheckoutPage` sends its browser-calculated `grandTotal` to Stripe, but its Order request sends `subtotal` as `totalAmount`; the Order controller separately calculates `discount`, while neither the Order schema nor request stores shipping or currency. Therefore the persisted Order does not represent the amount charged by the Stripe intent, and it is not a safe source for payment authority. Phase 8's target immutable commercial snapshot must supply one explicit authoritative total and currency before a later Payment implementation can bind to it.
- GAP: The Payment foundation persists internal Payment and creation idempotency records, but no provider PaymentIntent is created or correlated to them.
- GAP: The browser redirect/Stripe SDK status is used to decide when to create an Order; no verified webhook determines internal Payment state.
- GAP: Provider success followed by Order API failure can leave a provider payment without a stored Order. Order success/response loss can create duplicates on retry.
- GAP: No app-level idempotency prevents multiple intents/charges for one logical checkout. Stripe provider idempotency is not passed.
- GAP: `Math.round(amount * 100)` assumes a two-decimal currency and may not map correctly for currencies with other exponents. Order and Payment contain no currency.
- GAP: Errors return a generic controller response, but there is no durable payment attempt, recovery lookup, provider state reconciliation, webhook retry/DLQ, or operator repair path.
- GAP: No explicit payment-specific rate limit, fraud/risk scoring, card-testing defense, dispute workflow, refund workflow, or financial ledger.

## Target Payment Ownership

TARGET Payments owns Payment identity, provider reference, payment method metadata, authorization/capture/failure/cancellation, refunds/disputes/chargebacks, append-only financial ledger, webhook processing, idempotency, and reconciliation.

Payments does NOT own Catalog Product definitions, Pricing authority, Promotions, Cart, CheckoutQuote, Order lifecycle/snapshot, Inventory balances/reservations, Shipping execution, or Fulfillment tracking. It references the accepted Order and consumes its authoritative amount/currency. Order may hold Payment IDs and read-only status projections; it must not become the financial ledger.

TARGET refund effects are coordinated, not cross-written by Payment: Payment records the financial refund and emits a verified event; Order updates only its read-only refund/payment projection; Inventory decides any return/restock only after its own inspection/return policy; Tax and Promotions apply any required credit/coupon restoration under their own rules. A refund alone must not blindly restock inventory or re-open a coupon.

## Target Authority Chain

```text
Catalog sellable identity
  -> Pricing PriceBook/PriceDefinition resolution
  -> Promotions eligibility/discount
  -> Tax result (when an approved tax policy exists)
  -> Shipping result
  -> server-side CheckoutQuote
  -> immutable Order commercial snapshot
  -> Payment amountMinor + currency
  -> provider adapter
```

The client may select a method or provide checkout intent, but never supplies authoritative amount, currency, discount, shipping, tax, or total. Payment creation loads the accepted Order server-side and binds amount/currency and customer/order references. No fallback to `Product.price`; the authoritative payment amount is the accepted Order snapshot.

Phase 5 `Money` is `{ amountMinor, currency }` using non-negative integer minor units and explicit ISO currency. Provider adapters own any conversion required to provider-specific minor-unit conventions using currency metadata/exponents, not `* 100` assumptions. There is no implicit FX; if conversion is later approved, persist source/target currency, rate, source, timestamp, and resulting amounts.

## Target State and Cross-Domain Relationship

Payment state is distinct from Order, Fulfillment, and Reservation state:

- Order `confirmed` does not mean Fulfillment `delivered`.
- Payment `captured` does not mean Order `completed` or delivered.
- Reservation confirmation/commit is an Inventory transition and does not constitute payment capture.
- Failed/cancelled Payment may leave Order pending briefly while server workflow reconciles; then Order may cancel under its own transition policy and Inventory may release the Reservation exactly once.
- A browser redirect or SDK result is UX, never payment authority. Only a verified provider API response in a controlled server flow, signed provider webhook, or documented reconciliation can update internal Payment state.

State details are in [payment-state-machine.md](payment-state-machine.md); provider contracts in [payment-provider-contracts.md](payment-provider-contracts.md); webhook authority in [payment-webhooks.md](payment-webhooks.md).

## Security Requirements Preserved from Payment Rules

TARGET requirements:

- Use hosted fields/hosted checkout/provider Payment Element. Card PAN must go directly to provider; store only allowed provider tokens/references and minimal display metadata such as brand/last4/expiry where permitted. Never store PAN, CVV, PIN, or sensitive authentication data. Tokenization is provider-owned.
- Do not claim PCI DSS certification. PCI DSS 4.0.1 scope and SAQ eligibility must be assessed by the provider/QSA; hosted iframe does not remove merchant responsibility. Preserve requirements 6.4.3 and 11.6.1 (mandatory since 31 March 2025): authorized payment-page script inventory/purpose/integrity and detection of unauthorized script/header changes. Monitor at least weekly or use another cadence justified by documented risk analysis.
- Enforce TLS 1.2+ and HSTS at the edge/application. No mixed content. Current code uses `helmet()` globally; this audit does not assert deployment TLS, strict payment-page CSP, SRI, or PCI compliance.
- Maintain a payment-page third-party script inventory/authorization/reason and integrity controls; monitor unauthorized modifications. Use strict CSP and SRI where applicable, minimize tags/pixels, load the provider SDK asynchronously only on payment pages, and use provider-domain preconnect where appropriate. Current frontend imports `@stripe/stripe-js`; no payment-specific script inventory, explicit SRI control, or CSP validation was found.
- Webhooks require signature verification over provider-prescribed raw request bytes, timestamp/replay checks, provider event ID dedupe, and safe fast acknowledgement before asynchronous processing.
- Use client action and provider idempotency keys; server enforces amount/currency/order binding. Never trust a redirect or body field claiming payment success.
- Enable 3DS2/SCA where required by jurisdiction (including applicable EU PSD2/SCA obligations) and according to provider/risk rules; treat it as a global fraud-reduction standard. Authentication-required/challenge/frictionless/failure states remain distinct.
- Fraud controls should include provider risk scoring/Radar where configured, AVS/CVV results where available, card-testing rate/velocity controls, anomaly alerts and manual review for high-risk orders; CAPTCHA only where risk policy requires it.
- Keep provider secrets in server-side secret management, rotate regularly, use least privilege, never log secrets or sensitive card/payment payloads.
- Apply payment-specific rate limits/velocity controls in addition to global request limits. Phase 2 baseline's global production limiter is not a full card-testing/fraud control.
- Apply privacy/data-protection rules: minimize personal/payment metadata, encrypt in transit/at rest as required, apply retention limits, and audit sensitive access; jurisdictional GDPR/local-law compliance is not certified by this architecture document.

## Payment Experience and Performance Requirements

TARGET rules from the authoritative guide: checkout should be one page or at most two steps, support address autofill, load payment SDK only on the payment surface and asynchronously, preconnect to provider origins where appropriate, avoid analytics/advertising tags on payment pages, use clear pending/loading states and disable duplicate payment submission, support mobile input modes/autocomplete and large wallet controls, load-test peak demand, and confirm provider rate limits before seasonal events.

Phase 7's current target intentionally retains authenticated-only Cart/Checkout and defers guest checkout, while the payment-rules guide recommends Guest Checkout for conversion/autofill. This is a documented policy conflict, not a runtime fact: product/security owners must explicitly resolve it before implementation. Phase 9 does not silently override Phase 7's guest-auth policy.

The rules list Apple Pay, Google Pay, and at least one suitable local method in the launch checklist. The project runtime currently verifies none of those wallet/local capabilities; see `payment-provider-contracts.md`. Provider/account/country/device capability must be verified before any method is claimed or exposed.

See the detailed subcontracts for state, ledger, APIs, webhook retry/DLQ, reconciliation, testing, and migration. These remain TARGET/DEFERRED; no payment runtime is implemented by this audit.

## Phase 3–8 Consistency

| Phase/domain | Canonical owner | Payment boundary |
| --- | --- | --- |
| Phase 3 Architecture | Catalog: definition/identity; Pricing: commercial Money; Promotions: discounts; Inventory: availability/reservations; Cart: transient intent; Orders: immutable confirmed snapshot; Payments: provider state/ledger; Fulfillment: shipment execution | Payment uses an accepted Order amount/currency. It does not redefine these domains or collapse their states. |
| Phase 4 Catalog | Product/SKU identity, metadata, classification, lifecycle/publication, media | Payment references Order/sellable snapshots; it does not read mutable Product to set charge amount. |
| Phase 5 Pricing | PriceBook, PriceDefinition, deterministic ResolvedPrice, Money | Payment does not resolve prices. It charges accepted Order snapshot amountMinor/currency; no Product.price fallback. |
| Phase 6 Inventory | onHand/reserved/committed/available and Reservation lifecycle | Payment provides verified outcome/correlation; Checkout/Inventory owns reservation confirm/release commands. Payment is not stock authority. |
| Phase 7 Cart/Checkout | Cart identity/quantity; Checkout quote/repricing/coordination | Payment consumes Order/quote references from server workflow; never client grandTotal/currency. |
| Phase 8 Orders | Order identity/lifecycle and accepted immutable snapshot | Payment has references/projections only; financial state remains Payment-owned. |

CURRENT integration is incomplete at these boundaries: the old Stripe browser call still sends an amount but the API rejects it; the backend makes no Stripe call; Checkout cannot complete card payment; no current Order snapshot can initialize a Payment; provider-confirmed and webhook state do not exist. The new internal service and provider port are foundations only.

## COD Contract

CURRENT: Checkout can create an Order with `paymentMethod: "cod"`; there is no COD Payment adapter, cash collection event, courier settlement, or COD reconciliation. Order status `pending` is not a collection state.

TARGET: COD is a payment obligation/collection workflow, not card authorization/capture. At COD Order acceptance, Payment remains pending/due; Order may be confirmed according to Order policy, and Inventory commitment follows the accepted COD workflow. On verified delivery collection/settlement, append a `payment_captured`/collection ledger event and update the Payment projection. Failed delivery/cancel creates a separate cancellation and Inventory release/return workflow; no refund is implied where no money was collected. COD adjustments/partial collections require explicit policy and actor/audit record.

## Transaction Boundaries

| Operation | MongoDB transaction | External provider call | Compensation/reconciliation |
| --- | --- | --- | --- |
| Create Payment | Persist Payment attempt + request idempotency + local outbox where needed | Provider intent/create occurs outside transaction | Same key/provider lookup reconciles timeout; do not create a second intent blindly. |
| Authorize | State/ledger/event/outbox local transaction | Provider authorize/3DS action outside transaction | Unknown outcome queries provider; retry same key. |
| Capture | Conditional Payment state/balance + ledger/event local transaction after provider result | Capture call outside transaction | Reconcile unknown capture; append correction/refund only with evidence. |
| Cancel | Persist cancel request/transition record and idempotency locally | Provider void/cancel outside transaction | Confirm by provider lookup/webhook; Order/Inventory owners coordinate consequences. |
| Refund | Persist refund request/idempotency locally; append final ledger/state only on verified result | Provider refund outside transaction | Retry same provider key; reconcile unknown result; Payment owns mismatch. |
| Webhook processing | Verify then transactionally record event receipt, Payment transition, ledger, outbox | No provider call required in hot path; provider lookup may be asynchronous | Queue retry/DLQ and reconciliation for unknown/out-of-order state. |
| Reconciliation | Local report/case/payment correction + ledger/outbox transaction | Provider/bank APIs or report ingestion external | Append-only correction and operator audit; never rewrite history. |

MongoDB transactions cannot atomically include provider HTTP operations. Use a persisted attempt/state machine, stable idempotency keys, outbox/queue, and reconciliation. Do not claim a distributed transaction.

## Payment Application Services and Repositories

All contracts below are TARGET/DEFERRED; no runtime classes exist in the current repository.

| Service | Responsibility and boundary |
| --- | --- |
| `PaymentService` | Facade for authorized Payment commands/queries; takes authenticated actor or trusted service identity, returns safe DTOs; does not own Order/Inventory lifecycle. |
| `PaymentCreationService` | Input: Order ID, method selector, idempotency key. Loads accepted Order, derives amount/currency, persists Payment attempt/request identity, calls provider outside DB transaction, persists provider reference/result or unknown outcome. |
| `PaymentAuthorizationService` | Validates state and provider capabilities; sends auth/challenge continuation and records normalized response. 3DS result is provider-verified, not client status assertion. |
| `PaymentCaptureService` | Validates authorized remainder, captures via provider, appends ledger; provider call occurs outside transaction. |
| `PaymentCancellationService` | Validates pending/authorized state and permission; invokes provider void/cancel where supported; records request and verified result separately. |
| `RefundService` | Validates amount against captured-minus-refunded balance, invokes adapter, appends refund ledger, returns status/reference. |
| `WebhookProcessingService` | Verifies/normalizes provider event; durable receipt/dedupe; state transition and ledger/outbox in transaction; worker handles retries/DLQ. |
| `PaymentReconciliationService` | Compares internal Payment/ledger with provider transactions/refunds/disputes/settlement; creates auditable mismatch cases and safe corrections. |
| `PaymentQueryService` | Owner/operator-scoped read models and redaction; never exposes secrets or raw payloads. |

TARGET repositories:

- `PaymentRepository`: create/find by internal ID, Order, customer, scoped idempotency key; compare-and-transition state/version.
- `PaymentLedgerRepository`: append immutable entry; query by Payment/Order/time/provider reference; no update/delete methods.
- `RefundRepository`: create/find idempotent refund and provider reference; query Payment refund balance.
- `PaymentWebhookRepository`: insert unique provider/account/event ID receipt, request hash, processing status, attempt count, safe payload reference; claim/retry/DLQ state.
- `PaymentReconciliationRepository`: store immutable provider report/import reference and mismatch/correction cases with actor/evidence/status.

Repository writes participate in service-owned local transactions. No repository holds a transaction open across a provider call.

## Payment Events

TARGET/DEFERRED domain events: `PaymentCreated`, `PaymentPending`, `PaymentAuthorized`, `PaymentCaptured`, `PaymentFailed`, `PaymentCancelled`, `PaymentRefunded`, `PaymentPartiallyRefunded`, `PaymentDisputed`, and `PaymentReconciled`.

- Producer: Payment aggregate/service after verified transition and append-only ledger event.
- Payload concept: event ID/version, paymentId, orderId, provider/method, from/to status, amountMinor/currency where applicable, provider reference/event ID, occurrence time, correlation/idempotency reference; omit secrets/raw card data.
- Consumers: Order projection/confirmation orchestration, Inventory reservation orchestrator, notifications, reconciliation/read models. Consumers do not mutate Payment source state directly.
- Delivery: persist event/outbox in the same local transaction as Payment + ledger transition; at-least-once delivery with consumer dedupe by event ID. Provider/API calls are external.
- CURRENT: no Payment event publisher/outbox was found.

## Failure and Recovery Matrix

| Failure | CURRENT behavior | TARGET recovery |
| --- | --- | --- |
| Provider/network timeout | Controller returns generic 500; no Payment attempt/reference recovery | Mark outcome unknown, retry/lookup with same idempotency key, reconcile before new charge. |
| Duplicate request/double click | Can create multiple PaymentIntents; no provider/app key | Return same Payment attempt/result for same key and payload. |
| Duplicate webhook | No webhook route | Unique event receipt + idempotent state/ledger transition; ACK duplicate safely. |
| Delayed/out-of-order webhook | Not handled | Persist receipt, validate transition, defer/quarantine and reconcile. |
| Invalid signature/provider spoof | No endpoint/signature verifier | Reject, record security metric, no Payment/Order/Inventory mutation. |
| Decline/authentication failure | Browser displays Stripe error; no internal Payment state | Persist failed/requires-action event; Order/Inventory response by their owners. |
| Authorized but capture failed | No capture lifecycle | Preserve authorization, append failure, retry/void or reconcile by provider policy. |
| Payment succeeds, Order update/create fails | Browser can pay before Order API; orphan successful payment risk | Order must exist/correlate before provider initiation; durable saga reconciles and repairs without duplicate charge. |
| Order created, Payment initialization fails | COD order possible; card flow may not reach Order until after browser payment | Keep Order payment-pending/failed according to Order contract; release Reservation or allow explicit retry. |
| Refund timeout/provider unavailable | No refund API | Persist pending refund request; same key lookup/retry; reconcile before presenting result. |
| Amount/currency mismatch | Client amount accepted by PaymentIntent route | Quarantine; do not capture/confirm Order/Reservation; operator/reconciliation resolution. |
| Reservation expires then payment succeeds late | No reservation runtime | Payment remains verified; Inventory cannot recreate expired hold; reconciliation/refund/manual exception; preserve ledger. |
| Provider outage | Generic 500; no circuit breaker/failover policy | Circuit breaker stops new requests; retain safe pending attempts; failover only if idempotency and no duplicate-charge risk are proven. |

## Observability and Index Contract

TARGET metrics/logs: attempts by provider/method/country, authorization/capture success and decline rates, payment/provider latency, 3DS challenge/failure, webhook delivery/verification/processing latency, duplicate/replay/unknown event counts, queue age/retry/DLQ depth, reconciliation mismatch/value/age, refund failure, provider availability, and abandonment. Alert on success-rate drops, signature failures, aged pending/unknown payments, mismatch, DLQ growth, and duplicate-charge/refund signals. Log correlation IDs and redacted references only; no PAN/CVV, secrets, client secret, or full sensitive payload.

TARGET indexes, conditional on actual query plans:

- unique internal `paymentId` if not Mongo `_id`.
- unique `{provider, providerAccount, providerPaymentId}` when provider guarantees uniqueness.
- unique `{provider, providerAccount, providerEventId}` on webhook receipts.
- unique scoped idempotency `{operation, customerId/orderId, idempotencyKey}` with request hash.
- `{orderId, createdAt}` and `{customerId, createdAt}` for owner/operator queries.
- `{status, updatedAt}` for pending/reconciliation queues.
- unique provider refund reference scoped by provider/account; ledger `{paymentId, occurredAt}`.
- reconciliation state/time index only when operational query requires it.

Do not add all candidate indexes without query/selectivity/write-cost review. No database indexes are added by this audit.

## Non-Destructive Payment Migration

No migration is run. Current Payment state is not persisted internally; historical truth is limited to Orders (`paymentMethod`, amount/discount) and provider Stripe records if retrievable. Do not fabricate ledger events or claim an old Order was paid from a browser success page alone.

1. Read-only census: inspect legacy Orders and Stripe intents via authorized provider export/API only where available; classify linked, unlinked, unknown, amount/currency mismatch, and COD. Do not update production records.
2. Preserve Orders and provider references unchanged. Additive migration mapping may attach verified provider ID/order reference and provenance; do not infer missing amount/currency/state.
3. Backfill ledger entries only for facts verified from provider records/accounting evidence; mark source `legacy_import` and retain import/report reference, migration actor, timestamp, idempotency key, and confidence. Unknown remains UNKNOWN, never guessed.
4. Roll out new Payment alongside prototype with a feature flag; ensure one path owns each new charge. Never run old and new intent creation in parallel for one checkout.
5. Shadow-reconcile in test/sandbox, then route new Payments through PaymentService. Keep legacy read support until orders/refunds/disputes/reconciliation no longer depend on it.
6. Rollback disables new initiation but retains Payment/ledger/webhook records. Do not delete history, reissue charges from stale client amounts, or rewrite Order totals.
7. Retire direct Stripe controller path only after all clients, webhooks, provider refs, refunds, and support tools migrate under an approved later implementation phase.

## Cross-Phase Contradiction Check

- Phase 3: Orders own immutable accepted snapshot; Payments own financial state/ledger; Inventory owns reservation; Fulfillment owns shipment. This audit preserves all boundaries.
- Phase 5: Pricing owns PriceBook/PriceDefinition/ResolvedPrice and integer Money. Payment consumes Order snapshot and does not resolve Product.price or recalculate discount/tax/shipping.
- Phase 6: Inventory Reservation follows `reserved + committed <= onHand`, `available = onHand - reserved - committed`, `available >= 0`; Payment provides verified outcome only, with Checkout/Inventory owning transition commands.
- Phase 7: browser amount/total/currency and success state are not authority; Payment must use server Order total/currency and verified provider state.
- Phase 8: Order status/snapshot are Orders-owned; payment status/ledger/refunds/disputes remain Payment-owned. Order carries references/projections only.
- Payment-rules DOCX: hosted/tokenized fields, no card data, PCI DSS 4.0.1 controls, TLS/HSTS/CSP/SRI, webhook signing, idempotency, 3DS2, fraud/rate controls, ledger, reconciliation, refunds/disputes, wallets/local/COD, queue/retry/DLQ/monitoring are preserved as TARGET requirements. Provider capability is marked NOT VERIFIED unless current code/config establishes it.

No contradiction was found in the reviewed boundaries. This audit does not claim that deployment-level PCI/TLS/HSTS/CSP/SRI controls, merchant provider capabilities, legal tax treatment, or QSA assessment were verified.
