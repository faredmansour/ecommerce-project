# Egypt Payment Method Architecture

Status: Phase 10 Step 9 adds an internal method taxonomy and read-only availability service. No method is executable by the current application; provider boundary classes remain disabled. The service is not exposed to customers. See [provider-capability-matrix.md](provider-capability-matrix.md) for documentation evidence and [egypt-payment-providers.md](egypt-payment-providers.md) for provider analysis.

## CURRENT IMPLEMENTATION — Phase 10 Step 9

`PaymentMethod` and `Provider` are separate concepts. The canonical method IDs are `card`, `meeza`, `mobile_wallet`, `apple_pay`, `google_pay`, `instapay`, `bnpl`, `cod`, and `fawry_reference`. Their provider relationships and documentation evidence live in the backend's immutable method registry. Provider configuration and enablement remain independent.

The internal `PaymentMethodAvailabilityService` accepts only `{ currency, country, amountMinor, deviceContext? }`. It validates integer minor units and evaluates Egypt (`EG`) and EGP eligibility, documented method/provider evidence, provider runtime enablement/configuration, and Apple Pay/Google Pay device capability. It returns only normalized method descriptors with `AVAILABLE`, `UNAVAILABLE`, or `UNSUPPORTED` status and a safe reason code. `UNSUPPORTED` is reserved for method/provider combinations explicitly unsupported or lacking any documented/unverified candidate; a documented but unverified method remains `UNAVAILABLE` with `CAPABILITY_NOT_VERIFIED`.

All current provider runtimes are disabled and have no available methods, so provider-backed methods return `UNAVAILABLE`; no method is returned as executable from documentation alone. No provider selection, Payment creation, provider execution, customer API, frontend exposure, or financial side effect occurs. No provider amount limits are established, so none are invented. COD merchant collection remains unverified and unavailable.

## Availability Contract

Payment methods must be resolved server-side for the current checkout context:

```text
country
+ currency
+ provider/account/environment
+ device/browser capability
+ customer eligibility/consent
+ Order amount and properties
+ provider method limits and merchant configuration
= available payment methods
```

This is a dynamic availability decision, not a hard-coded global list. The browser may request a method identifier for a displayed option, but the server must resolve it against the active Order, supported currency, provider account, and enabled capability. It cannot select a provider credential, change amount/currency, or override eligibility. Keep method policy/version and provider/account decision references for audit.

**EGP** is the first target currency for Egypt. Under the project Money contract, 1 EGP = 100 piastres, so `amountMinor` is expressed in piastres for EGP. Preserve integer minor units internally and perform any conversion to provider-specific decimal or minor-unit conventions in the adapter with explicit EGP metadata and tested formatting/rounding. Never derive the payment amount from browser totals or assume all providers use identical minor-unit conventions.

## Cards and Meeza

- Prefer provider-hosted checkout/hosted fields so card PAN and CVV go directly to the provider. Do not accept or persist raw PAN, CVV/CVC, PIN, track data, wallet OTP, or wallet PIN.
- Tokenization is provider-owned. Persist only permitted opaque provider token/reference and minimal allowed display data after documented customer consent and retention rules.
- Treat Meeza as provider-specific card-brand capability, not a universal payment method. Kashier's official docs say send Meeza as ordinary `card`; Meeza is detected as a card brand. Paymob and Fawry Meeza acquiring support remain `NOT VERIFIED` in reviewed current Egypt documentation.
- A redirect, SDK result, or browser-side challenge callback is not payment authority. Verify provider status through authenticated server lookup or signed callback before changing Payment state.
- **TARGET / GAP**: the current Phase 9 runtime supports only generic `card` and no provider. It does not establish an EGP acquiring route or 3DS2 configuration.

## Mobile Wallets

Official documentation verifies wallet channels across the candidates, but actual wallet brands and methods vary by provider and account:

- Paymob examples for Egypt list Vodafone Cash, Orange Cash, e& money, and WE Pay.
- Kashier documents wallet request-to-pay flows, including Egyptian mobile wallets.
- FawryPay documents wallet QR and request-to-pay.

Never store OTP, wallet PIN, wallet credentials, or wallet-app authentication material. Model a wallet attempt as an asynchronous Payment operation with an initial pending/requested state, provider reference, optional provider expiry, status inquiry, and verified server callback. If the customer has not approved before the provider request expires, do not mark it failed solely from a browser timer; confirm with the provider or apply an explicit expiry policy.

## InstaPay

- **VERIFIED for Kashier only**: official documentation describes InstaPay as an Egyptian QR collection (`GENERATE_QR`) or request-to-pay (`INITIATE_R2P`) flow. It uses a provider/bank-mediated customer approval and standard Kashier server webhook. Provider/acquirer routing is provisioned on the merchant account. The docs say this rail does not support tokenization, recurring payments, or authorize/capture; refund/cancel are separate documented post-payment operations.
- **NOT VERIFIED**: direct Paymob or FawryPay InstaPay merchant integration was not established by the reviewed official documentation.
- Treat QR/R2P as pending until a verified provider event or server-side status query confirms final status and matches amount, currency, internal Order, and provider reference. A QR display, screenshot, redirect, or customer assertion is not proof of payment.
- Persist only method state, provider references, safe payer-address metadata if operationally required, and expiry. Avoid retaining unnecessary payer identifiers.

## Apple Pay and Google Pay

- Paymob official documentation lists Apple Pay for EGY and lists Google Pay in its Pixel methods with the EGY endpoint. Confirm account/method provisioning, current browser/device support, certificates/domain requirements, and live integration ID before claiming either at checkout.
- Kashier documents Apple Pay with domain verification/certificate steps and explicitly says Google Pay is not supported.
- Fawry Apple Pay and Google Pay support is `NOT VERIFIED` in reviewed official sources.
- Wallet tokenization and device authentication remain in the Apple/Google/provider flow. The merchant should receive normalized provider status and references, not raw wallet/card credentials.
- Merchant validation/domain verification are provider-specific setup tasks. They do not replace signed webhook/status verification or server-side amount binding.

## BNPL and Installments

Keep pay-later/financing outside the core payment method vocabulary except for normalized `paymentMethodType` and provider references. The selected financing provider owns eligibility, plan disclosure, authorization/financing decision, and repayment schedule; the merchant Payment record owns only the merchant's amount, provider attempt, financial state, and verified events.

Target flow:

1. Server confirms the accepted Order amount/currency and presents methods available for this customer/Order/provider account.
2. Customer explicitly selects an eligible plan and accepts required financing disclosures/consent.
3. Provider-hosted or provider-controlled eligibility/authentication collects any sensitive financing data.
4. Adapter records the provider financing/transaction reference and normalized pending/authorized/captured/failed result.
5. Refund/cancel eligibility and settlement are confirmed against provider-specific rules; do not infer plan cancellation from Order cancellation.

Paymob and Kashier list Egypt BNPL/installment products. Fawry lists BNPL/bank installment products and a Yellow Card installment path, but account-specific eligibility and some sample API identifiers need confirmation. No such method is implemented in the project.

## Cash on Delivery

COD is not an online provider authorization. Preserve separate Order acceptance/fulfillment and Payment collection lifecycle. Target sequence:

```text
accepted Order
  -> COD amount due / collection obligation
  -> fulfillment and delivery attempt
  -> verified cash/card collection OR failed delivery
  -> courier/merchant settlement and reconciliation
```

Payment becomes captured only after verified collection/settlement evidence, not when Order is accepted, shipped, or marked delivered by a browser. A failed delivery or customer refusal is coordinated by Order/Inventory policy and must not silently mutate payment ledger history. Define collector identity, amount variance, partial collection, cash custody, remittance fees, and evidence before implementation. Current `Order.paymentMethod = "cod"` is only a legacy flag; there is no COD Payment, collection record, or settlement workflow.

Fawry's Online Checkout page advertises cash/card on delivery, but that vendor marketing does not establish this store's courier contract or COD settlement process. Paymob/Kashier provider-backed COD is `NOT VERIFIED` in reviewed documentation.

## Expiry

Use an optional canonical `expiresAt` only when a payment session, payment link, QR/R2P request, authorization hold, or payment reference has an actual provider-defined expiry. Persist the provider expiry and its source; do not invent a timeout or extend it on the frontend.

| Provider concept | Official evidence | Architecture treatment |
|---|---|---|
| Paymob intention/session | Intention API exposes `expiration` (example 3600 seconds); method-specific availability varies | Normalize returned/requested expiry to UTC `expiresAt`; verify exact expiration semantics by method |
| Kashier session | Session response contains `expireAt`; InstaPay requires a `validity` period | Store session expiry and QR/R2P validity separately if their semantics differ; query provider after expiry race |
| FawryPay reference | Charge requests may include `paymentExpiry`; response contains `expirationTime` | Persist exact provider expiry/reference and treat expired reference as terminal only after provider confirmation |
| Payment links / BNPL authorization | Link expiry fields exist for some products; BNPL authorization lifetime is merchant/product dependent | Keep optional; do not infer from session expiry or assume one expiry rule for all methods |

Expired/unknown customer actions must reconcile with provider state before creating a second charge. Expiration is not proof of a failed financial transaction if the provider result is ambiguous.

## EGP and Amount Representation

- EGP must be explicit on the accepted server-side Order snapshot and Payment.
- The authoritative amount is integer `amountMinor` in the project's money convention (100 piastres per EGP). Provider adapters convert only at the provider boundary and must test exact values, rounding, fees, and zero/negative/maximum limits. Official examples demonstrate EGP, but provider amount limits, decimal precision, rounding rules, and merchant-level bounds remain `NOT VERIFIED` until confirmed for the specific account and method.
- Current public provider examples show EGP but do not establish this merchant's minimum/maximum amounts, fee treatment, settlement currency, rounding edge cases, or account-level limits. These remain `NOT VERIFIED` until provider confirmation.
- Do not add FX in this phase. If cross-currency payments are approved later, persist the quote/rate/source/time and both currencies/amounts under a separate contract.
