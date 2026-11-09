# Egypt Payment Provider Architecture and Readiness Audit

Status: Phase 10 Step 1 documentation audit, updated for Step 2 foundation implementation. No provider is integrated or enabled in this repository. Provider facts below are from official public documentation reviewed on 2026-11-03; capabilities still require merchant-account, country, currency, device, and production onboarding confirmation.

## Phase 10 Step 10 — Configuration Readiness Boundary

Provider readiness uses the existing configuration field contract and does not activate a provider. Paymob, Kashier, and Fawry remain runtime `DISABLED` for every configuration state. Local `CONFIGURED` status means only that required references are present and pass local structural checks; it is not provider authentication, merchant onboarding, or proof that a method can execute.

Current field groups come from the existing provider configuration module: Paymob API base URL, public key, API key, integration ID, and iframe ID; Kashier API base URL, API key, secret key, and merchant ID; Fawry API base URL, merchant code, and security key. Method/account-specific requirements that existing documentation does not establish remain unresolved. API base URLs receive HTTPS structure checks; other fields receive presence checks only. No provider request is made.

Each provider requires explicit `<PROVIDER>_ENVIRONMENT=TEST|LIVE`, and values are taken only from matching `<PROVIDER>_<ENVIRONMENT>_<FIELD>` references. No environment fallback is permitted. Secret references are variable names; secret values are never returned or logged. Missing provider configuration is optional and does not block startup. No merchant credentials are supplied by this Step.

## Classification

- **CURRENT**: behavior found in this repository now.
- **IMPLEMENTED**: present in repository runtime.
- **TARGET**: intended architecture or business capability, not a claim of current implementation.
- **LEGACY**: retained older behavior or contract.
- **GAP**: a required integration or runtime contract is absent.
- **DEFERRED**: intentionally not implemented in this audit.
- **VERIFIED**: the provider's official public documentation explicitly describes the capability. This does not mean it is provisioned for this merchant or enabled in this project.
- **NOT VERIFIED**: reviewed official documentation did not establish the specific capability or account availability.
- **NOT SUPPORTED**: the provider's official documentation explicitly says the capability is unsupported.

## Executive Readiness Result

- **CURRENT / IMPLEMENTED**: Phase 9 supplies an internal Payment model, integer minor-unit amount, explicit currency, core state guard, append-only ledger foundation, database-backed create-payment idempotency, repositories/service, owner-scoped read API, an abstract `PaymentProvider` class, and foundation-only Paymob/Kashier/Fawry adapter boundary classes with canonical identifiers and documentation capability metadata.
- **CURRENT / GAP**: the Order model has no accepted `commercialSnapshot`; the internal Payment creation service therefore fails closed. There is no customer Payment creation endpoint or active provider integration; the adapter boundary classes are disabled and cannot make HTTP requests.
- **LEGACY / GAP**: the frontend still contains a direct Stripe prototype and sends client-calculated amount/currency to a fail-closed endpoint. It is not routed through `PaymentProvider`; checkout cannot complete a card payment.
- **TARGET**: use server-owned Order amount/currency, provider-neutral Payment identity and state, then a provider adapter which returns a normalized session/next action and provider references. Confirm final outcomes only from verified provider evidence.
- **DEFERRED**: Paymob/Kashier/Fawry payment processing, InstaPay, wallets, Apple Pay, Google Pay, BNPL, COD collection, production webhook verification/routes, refunds, settlement reconciliation, and provider credentials.
- **Readiness decision**: none of the three candidates can be selected for production solely from public product pages. Step 2 adds disabled adapter boundaries and a neutral result validator, but the port and adapters do not yet define or execute complete provider session/next-action contracts for these integration styles.

## Capability Matrix

The canonical provider capability table is [provider-capability-matrix.md](provider-capability-matrix.md). Its statuses refer to official vendor documentation only, not this project’s runtime or merchant-account entitlements.

## Provider Notes

### Paymob

- **VERIFIED**: current official docs describe an API intention/payment flow with Paymob Unified Checkout redirect or embedded Pixel, callbacks, and HMAC verification. Redirect is for customer experience; callbacks are the payment-status authority.
- **VERIFIED**: Egypt method documentation includes card payments, mobile wallets, bank installments/BNPL, kiosk cash references, and Egypt regional examples. Apple Pay is explicitly listed for EGY. Pixel documentation shows the EGY endpoint and card/Google Pay/Apple Pay method options.
- **VERIFIED**: Paymob documents card 3DS, authorization/capture, payment links, full/partial refund behavior, and test/live integration identifiers. Kiosk is explicitly not refundable; bank installment and Apple Pay methods have live-only integration IDs in their current method pages. This means sandbox coverage is not uniform across methods.
- **GAP**: exact merchant account eligibility, method enablement, current Egypt card-scheme coverage (including Meeza), callback HMAC algorithm/field selection for each callback type, provider idempotency semantics, settlement schedule/fees, and enabled currency/limits require account-specific confirmation.

### Kashier

- **VERIFIED**: Payment Sessions create a session ID/URL with order reference, amount, currency, method restrictions, redirect/embedded settings, expiry, and optional server webhook. `EGP` is used in official examples. Direct API is another option but collecting card data directly changes PCI scope; prefer hosted Payment Sessions for the initial architecture assessment.
- **VERIFIED**: card, Meeza as a card brand, wallets, Apple Pay, InstaPay (QR/R2P), bank installments, BNPL providers, Fawry/kiosk-like cash methods, payment links, authorize/capture/void, transaction lookup, refunds, and settlement/reconciliation are described across official docs. Google Pay is explicitly unsupported.
- **VERIFIED**: payment/refund webhook signatures use SHA-256 HMAC over `signatureKeys` values with the Payment API Key; events must be interpreted by status, not operation name. Official docs describe delivery retries and deduplication guidance.
- **GAP**: test mode only exercises card and wallet in Payment Sessions; Fawry and bank installments/other methods cannot be meaningfully validated in that sandbox according to current docs. Confirm live method activation, payment API rate limits, capture windows, refund permissions/balance rules, idempotency guarantees, and settlement reports before selection.

### Fawry Accept / FawryPay

- **VERIFIED**: official business pages list online card acceptance, FawryPay reference code, BNPL, bank installment, cash/card on delivery, and mobile wallets; business pages also list payment links, tokenization, Auth & Cap, velocity control, and reconciliation reports.
- **VERIFIED**: public developer guide describes server-side charge APIs, EGP examples, merchant and transaction references, expiry, a SHA-256 request signature, FawryPay mobile deep links/QR, status retrieval (including `UNPAID`, `PAID`, `EXPIRED`, `CANCELED`, `REFUNDED`), and Server Notification V2. E-wallet methods support QR/R2P. Fawry's developer site exposes separate staging and production URLs.
- **GAP**: reviewed documentation does not establish a hosted checkout session, exact card/Meeza or 3DS2 support, Google/Apple Pay, InstaPay, refund/partial-refund API behavior, provider-level idempotency, or the exact cryptographic/authentication rules for Server Notification V2. Some MyFawry Taqseet sample identifiers are explicitly marked as placeholders and must be confirmed. Do not infer these details from the Fawry brand/product page.

## PaymentProvider Port Audit

**IMPLEMENTED**: `backend/providers/paymentProvider.js` remains the backward-compatible abstract port. Paymob, Kashier, and Fawry adapters extend it and validate commands. Phase 10 Step 12 adds the only provider HTTP operation: explicitly enabled Paymob TEST-mode hosted checkout. The default registry remains disabled; Kashier/Fawry remain fail-closed; no production execution or Payment confirmation is enabled. There is no Stripe adapter in this port. Provider capability metadata distinguishes public-documentation evidence from execution/runtime status.

**GAP**: method names alone do not define a complete provider-neutral port. Paymob TEST session creation is an isolated adapter result, not a generalized PaymentSession contract. LIVE and all non-Paymob execution remain deferred. The port still lacks a verified Paymob raw-body callback result and status-query semantics for asynchronous rails.

**TARGET**: before provider processing is implemented, define and connect a provider-neutral `PaymentSession` / `ProviderPaymentResult` that carries only safe customer action data and stable internal/provider references; explicit operations and idempotency scope; normalized pending/authorized/captured/failed/cancelled outcomes; method/currency/capture capabilities; and provider-specific signature verification input requirements. Keep hosted checkout as the preferred card-entry approach. Do not pass raw card data through this service.

Provider-specific concepts to normalize without leaking provider vocabulary into Order/Checkout:

- session/checkout URL, embedded vs redirect mode, and expiry;
- QR/R2P request or Fawry reference-code action for asynchronous methods;
- provider order/payment/transaction/refund identifiers;
- pending, requires-action, authorized, captured, expired, failed, and unknown outcomes;
- callbacks/webhooks with provider-specific signature, replay, and event-ID semantics;
- full/partial capture and refund capability/balance limits;
- method and region/currency enablement from server configuration, never browser-selected provider credentials.

## Cross-Domain and Security Readiness

- **Order / Pricing**: current Payment creation must remain blocked until Phase 8 persists an accepted immutable commercial snapshot with server-derived amount and currency. The provider receives that accepted amount; never use browser totals, Catalog prices, or a second Pricing calculation.
- **Checkout**: the current direct Stripe UI is legacy and not provider-neutral. No checkout rewrite is part of this audit.
- **Inventory**: Payment success must later coordinate with Inventory's reservation owner; a provider callback must not write stock directly.
- **Hosted entry / PCI**: prefer Paymob Unified Checkout or Kashier Payment Sessions if account suitability is confirmed. Fawry hosted-session support is not verified from technical docs. A hosted page does not remove merchant responsibility for PCI DSS 4.0.1 requirements 6.4.3 and 11.6.1, payment-page script inventory/monitoring, TLS/HSTS, CSP/SRI, or third-party-script minimization.
- **Webhook authority**: never finalize Order from redirect/client callback. Preserve raw bytes where the provider signature scheme requires them, verify signature and account/environment, bind provider event to Payment/Order/amount/currency, deduplicate, persist durably, and process idempotently with bounded retries/DLQ.
- **Idempotency**: merchant database uniqueness and a stable operation key are mandatory even where a provider has request signatures or webhook retries. A signature is not proof of idempotency.
- **Fraud and operations**: local rate/velocity controls, provider risk tools, anomalous-country/amount review, alerting, settlement variance handling, refund/dispute operations, secret rotation, and production monitoring remain design/implementation prerequisites.
- **Rules source**: the mandatory local payment-rules DOCX is preserved as a design constraint; this readiness note does not certify PCI compliance or replace legal/QSA/provider review.

## Recommended Next Gate (No Selection or Integration Here)

Before choosing a provider or beginning a provider implementation, obtain and record:

1. Merchant legal/onboarding eligibility, acquiring entity, enabled countries/currencies and settlement bank/account.
2. Written method enablement for Meeza, wallets, Apple Pay, Google Pay, InstaPay, BNPL/installments, Fawry references, and COD where relevant.
3. Test credentials and production enablement matrix; identify which methods cannot be tested in sandbox.
4. Current API specifications for session creation, amount representation, unique merchant references, request idempotency, status inquiry, authorization/capture, cancellation, full/partial refund, and failure/unknown outcomes.
5. Exact webhook raw-body, signature, timestamp/replay, event identifier, retry, duplicate, and account/environment verification rules for each method.
6. Settlement report format/cadence, fees/chargebacks/refunds, reconciliation support, operational escalation, uptime/SLA, rate limits, and credential rotation process.
7. Legal/security review of PCI scope, hosted-entry configuration, payment-page script/header controls, privacy/retention, and Egypt-specific consumer/financial requirements.

No provider ranking is made in this audit. Public documentation establishes that all three are plausible candidates for parts of the Egypt roadmap, but their differences, account gating, test limitations, and unknowns prevent a safe production choice without merchant-specific evidence.

## Official Sources Reviewed

Provider capability claims above are limited to these official documentation/business pages. Documentation changes over time; re-verify before implementation.

### Paymob

- [Developer overview, methods, integration paths, and test/live overview](https://developers.paymob.com/paymob-docs/developers/quicklink-apis/overview)
- [API integration and Unified/Embedded checkout, callbacks, and HMAC](https://developers.paymob.com/paymob-docs/integration-paths/apis)
- [Pixel embedded checkout method support and EGY endpoint](https://developers.paymob.com/paymob-docs/developers/checkout-experiences/pixel-embedded)
- [Egypt bank installments](https://developers.paymob.com/paymob-docs/payments-and-features/payment-methods/bank-installments-egy)
- [Egypt kiosk/cash reference and refund limitation](https://developers.paymob.com/paymob-docs/payments-and-features/payment-methods/kiosk-egy)
- [Apple Pay regions, including EGY](https://developers.paymob.com/paymob-docs/payments-and-features/payment-methods/apple-pay-all-regions)
- [Payment-method refunds and partial refunds](https://developers.paymob.com/paymob-docs/developers/manage-payment-apis/refund)
- [Transaction callback payload and HMAC requirement](https://developers.paymob.com/paymob-docs/manage-callback/transaction-callbacks)
- [Core features including authorization/capture](https://developers.paymob.com/paymob-docs/payments-and-features/core-features/null)
- [Payment link API](https://developers.paymob.com/paymob-docs/developers/quicklink-apis/create-quicklink)
- [Intention API amount, EGP example, and expiration](https://developers.paymob.com/paymob-docs/intention-apis/create-intention)

### Kashier

- [Accept-payment integration options](https://developers.kashier.io/docs/accept-payments)
- [Payment Sessions and hosted/embedded behavior](https://developers.kashier.io/docs/accept-payments/payment-sessions)
- [Meeza card support](https://developers.kashier.io/docs/accept-payments/meeza)
- [Apple Pay and explicit Google Pay non-support](https://developers.kashier.io/docs/accept-payments/apple-pay)
- [InstaPay QR/R2P operations](https://developers.kashier.io/docs/accept-payments/instapay)
- [Wallet payments and idempotency guidance](https://developers.kashier.io/docs/direct-api/wallet-payments)
- [Authorize/capture](https://developers.kashier.io/docs/accept-payments/authorize-capture)
- [Full/partial refunds](https://developers.kashier.io/docs/accept-payments/refunds)
- [Webhook signature, delivery, retry, and idempotency guidance](https://developers.kashier.io/docs/webhooks)
- [Installment and BNPL provider examples](https://developers.kashier.io/docs/direct-api/installment-plans)
- [Settlement/live-mode notes](https://developers.kashier.io/docs/get-started/going-live)

### Fawry

- [Fawry Accept online checkout methods, tokenization, Auth & Cap, reconciliation, and security claims](https://www.fawry.com/business/acceptance/online-checkout/)
- [Fawry business Payment Link listing](https://www.fawry.com/business/)
- [FawryPay myFawry charge, references, QR/deep links, EGP, signatures, status, and webhook references](https://developers.fawrystaging.com/fawrypay/serverSideApis/myFawryPayment)
- [FawryPay wallet QR/R2P flow and request signature](https://developers.fawrystaging.com/fawrypay/serverSideApis/eWalletPayments)
- [MyFawry Taqseet (Yellow Card installment) guide and placeholder caveat](https://developers.fawrystaging.com/fawrypay/serverSideApis/myFawryTaqseetPayment)
- [Fawry Accept business capabilities](https://www.fawry.com/fawry-for-business/enterprises/commerce-enablement/)

### Phase 10 Step 11 — Kashier webhook secret rotation

Webhook verification uses the TEST/LIVE-scoped `KASHIER_<ENVIRONMENT>_API_KEY` selected only by trusted `KASHIER_ENVIRONMENT`, with an explicit `..._API_KEY_VERSION`. The former unscoped `KASHIER_API_KEY` is deprecated for webhook use, is not silently migrated, and cannot establish readiness by itself. Since safe overlapping-key verification is not established by the reviewed contract, previous-version metadata is not accepted by the verifier; key replacement and deployment must be coordinated operationally. This foundation does not enable Kashier.

Phase 10 Step 12 adds an opt-in TEST-only card Hosted Checkout adapter using the documented Intention API and Unified Checkout URL. It requires the Egypt Test Secret Key, Test Public Key, and Test card Integration ID. It is disabled unless `PAYMOB_TEST_EXECUTION_ENABLED=true` and `PAYMOB_ENVIRONMENT=TEST`; the default registry remains disabled and LIVE execution is unavailable. Session creation is pending customer action, not payment confirmation. Paymob webhook verification remains unsupported. The API docs do not establish provider idempotency, so a durable at-most-once reservation blocks duplicate/ambiguous execution pending reconciliation.
