# Egypt Provider Capability Matrix

Status: Phase 10 Step 1 documentation-only audit. Capability status means public official documentation evidence as reviewed 2026-11-03; it does not mean the project has an account or an enabled integration.

Each capability cell contains exactly one status:

- `VERIFIED` — explicit official provider documentation/product page evidence.
- `NOT VERIFIED` — the reviewed official documentation did not establish the precise capability or contract.
- `NOT SUPPORTED` — the provider explicitly documents that it is unsupported.
- `DEFERRED` — not implemented or enabled in this repository.

| Capability | Paymob | Kashier | Fawry |
|---|---|---|---|
| Cards | VERIFIED | VERIFIED | VERIFIED |
| Meeza | NOT VERIFIED | VERIFIED | NOT VERIFIED |
| 3DS2 | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Mobile Wallets | VERIFIED | VERIFIED | VERIFIED |
| Apple Pay | VERIFIED | VERIFIED | NOT VERIFIED |
| Google Pay | VERIFIED | NOT SUPPORTED | NOT VERIFIED |
| InstaPay | NOT VERIFIED | VERIFIED | NOT VERIFIED |
| Fawry | NOT VERIFIED | NOT VERIFIED | VERIFIED |
| BNPL | VERIFIED | VERIFIED | VERIFIED |
| Installments | VERIFIED | VERIFIED | VERIFIED |
| COD | NOT VERIFIED | NOT VERIFIED | VERIFIED |
| Hosted Checkout | VERIFIED | VERIFIED | NOT VERIFIED |
| Payment Links | VERIFIED | VERIFIED | VERIFIED |
| Authorization | VERIFIED | VERIFIED | VERIFIED |
| Capture | VERIFIED | VERIFIED | VERIFIED |
| Refund | VERIFIED | VERIFIED | NOT VERIFIED |
| Partial Refund | VERIFIED | VERIFIED | NOT VERIFIED |
| Webhooks | VERIFIED | VERIFIED | VERIFIED |
| Webhook Signature | VERIFIED | VERIFIED | NOT VERIFIED |
| Idempotency | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| Settlement/Reconciliation | VERIFIED | VERIFIED | VERIFIED |

## Repository Runtime Status (Phase 10 Steps 2, 9, 10, and 12)

The matrix above records official public-documentation evidence only. The provider runtime registry at `backend/providers/providerCapabilities.js` stores these documentary statuses separately from runtime enablement. The Step 9 method registry at `backend/services/paymentMethodRegistry.js` relates canonical method IDs to provider documentary evidence; `PaymentMethodAvailabilityService` separately evaluates runtime state. Paymob, Kashier, and Fawry adapters are foundation boundaries only: each has `runtime.enabled = false`, no available methods, and all operations are `DEFERRED`. Therefore no provider-backed method is `AVAILABLE`, regardless of documentation status. No merchant account, credentials, hosted session, payment request, webhook verification, refund, or reconciliation is activated by this availability boundary.

Step 9 uses `VERIFIED`, `NOT_VERIFIED`, and `NOT_SUPPORTED` as documentation capability states, separate from runtime `ENABLED`, `DISABLED`, and `UNCONFIGURED`. Missing proof remains `NOT_VERIFIED`; the service never promotes it. It supports only Egypt (`EG`) and EGP in this initial availability context. Provider-specific amount limits are not verified and are not encoded. Meeza maps to the card capability only for providers whose audit explicitly verifies Meeza; Google Pay is not attributed to Kashier; COD remains unavailable because the merchant collection/fulfillment workflow is unverified.

Step 10 adds local configuration readiness states (`MISSING`, `INVALID`, `INCOMPLETE`, `CONFIGURED`) separate from runtime status. Readiness uses explicit TEST/LIVE-scoped environment variable references and never changes this matrix's runtime facts. Even fully configured values leave all three runtimes disabled and all provider-backed methods unavailable. No credentials or secrets are present in this repository documentation.

## Evidence and Qualification

These qualifications are important when using the matrix:

- A `VERIFIED` entry is provider-documentation evidence only. Confirm merchant-specific enablement, permitted country/currency, method limits, device restrictions, test support, and production configuration with the provider.
- Generic 3D Secure documentation does not verify support for the specific 3DS2 protocol version. Accordingly, all `3DS2` cells remain `NOT VERIFIED`; do not infer protocol version from a generic 3DS claim.
- Paymob kiosk/cash reference payments are verified, but Paymob-to-Fawry routing specifically is `NOT VERIFIED`.
- Kashier's payment docs explicitly list Fawry/cash-style kiosk methods, but routing through the Fawry provider specifically is `NOT VERIFIED`.
- Fawry's current official Online Checkout page markets COD/cash-or-card on delivery; the merchant's courier, collection, custody, remittance, failed-delivery, and liability workflow is still not verified for this store.
- Paymob lists balance/transaction reporting and settlement operations; Kashier lists settlement/reconciliation tools; Fawry lists reconciliation reports. None of the reviewed public sources establishes this merchant's settlement cadence, payout day, fees, reserve, or bank cut-off. Those remain `NOT VERIFIED` account facts.
- Idempotency in this matrix refers to documented provider API guarantees for a caller-supplied request idempotency key and its retention/collision semantics. Webhook duplicate guidance or a signed merchant reference does not establish that API guarantee; therefore each provider remains `NOT VERIFIED` here.
- Fawry pages mention refund statuses and refund webhook notifications, but the review did not establish a full/partial refund API contract. Both refund rows remain `NOT VERIFIED`.
- The Paymob Google Pay status relies on official Pixel documentation listing Google Pay with the EGY endpoint. Confirm live merchant enablement before planning launch.
- The Fawry Taqseet guide warns that sample method/plan identifiers are placeholders requiring confirmation. Product presence is verified, but details remain merchant-onboarding dependent.

## Provider Sources

### Paymob

- [Official Egypt payment methods and integration overview](https://developers.paymob.com/paymob-docs/developers/quicklink-apis/overview)
- [Official API checkout, callback, and HMAC overview](https://developers.paymob.com/paymob-docs/integration-paths/apis)
- [Official Pixel method list and EGY endpoint](https://developers.paymob.com/paymob-docs/developers/checkout-experiences/pixel-embedded)
- [Bank installments in Egypt](https://developers.paymob.com/paymob-docs/payments-and-features/payment-methods/bank-installments-egy)
- [Kiosk/cash references and refund limitation](https://developers.paymob.com/paymob-docs/payments-and-features/payment-methods/kiosk-egy)
- [Apple Pay available regions](https://developers.paymob.com/paymob-docs/payments-and-features/payment-methods/apple-pay-all-regions)
- [Refund and partial refund contract](https://developers.paymob.com/paymob-docs/developers/manage-payment-apis/refund)
- [Transaction callback payload](https://developers.paymob.com/paymob-docs/developers/transaction-callbacks)
- [Authorization/capture and transaction reporting overview](https://developers.paymob.com/paymob-docs/payments-and-features/core-features/null)
- [Payment Link API](https://developers.paymob.com/paymob-docs/developers/quicklink-apis/create-quicklink)

### Kashier

- [Integration option index](https://developers.kashier.io/docs/accept-payments)
- [Payment Sessions](https://developers.kashier.io/docs/accept-payments/payment-sessions)
- [Meeza cards](https://developers.kashier.io/docs/accept-payments/meeza)
- [Apple Pay and Google Pay non-support statement](https://developers.kashier.io/docs/accept-payments/apple-pay)
- [InstaPay QR and R2P collection](https://developers.kashier.io/docs/accept-payments/instapay)
- [Wallet flow and idempotency guidance](https://developers.kashier.io/docs/direct-api/wallet-payments)
- [Authorize/capture](https://developers.kashier.io/docs/accept-payments/authorize-capture)
- [Refunds](https://developers.kashier.io/docs/accept-payments/refunds)
- [Webhook authentication, retries, and replay guidance](https://developers.kashier.io/docs/webhooks)
- [Bank installment and BNPL providers](https://developers.kashier.io/docs/direct-api/installment-plans)
- [Live-mode settlement/testing notes](https://developers.kashier.io/docs/get-started/going-live)

### Fawry

- [Online Checkout methods and business capabilities](https://www.fawry.com/business/acceptance/online-checkout/)
- [Business acceptance and Payment Link offering](https://www.fawry.com/business/)
- [FawryPay charge, references, QR/deep link, status query, and signature fields](https://developers.fawrystaging.com/fawrypay/serverSideApis/myFawryPayment)
- [Wallet QR/R2P APIs](https://developers.fawrystaging.com/fawrypay/serverSideApis/eWalletPayments)
- [MyFawry installment guide](https://developers.fawrystaging.com/fawrypay/serverSideApis/myFawryTaqseetPayment)
- [Fawry Accept business capability page](https://www.fawry.com/fawry-for-business/enterprises/commerce-enablement/)

Phase 10 Step 12 implements Paymob TEST-mode card hosted-session creation behind `PAYMOB_TEST_EXECUTION_ENABLED=true` plus `PAYMOB_ENVIRONMENT=TEST`. Step 13 adds TEST-gated transaction processed callback verification using Paymob's documented HMAC-SHA-512 contract and stored execution-attempt correlation. The default registry remains disabled; LIVE execution and Kashier/Fawry are unavailable. The documented API does not establish request idempotency, so ambiguous attempts are blocked rather than retried.
