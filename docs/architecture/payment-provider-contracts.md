# Payment Provider Contracts — PORT FOUNDATION

Status: CURRENT abstract `PaymentProvider` port exists. No provider adapter is implemented. The old Stripe PaymentIntent prototype remains a direct legacy integration boundary and is currently fail-closed; it is not routed through this port.

## Provider Port

TARGET `PaymentProvider` interface. All amounts passed to the port are integer minor units with explicit ISO currency and server-verified Order context.

```text
createPayment(paymentCommand) -> ProviderPaymentResult
authorize(paymentReference, amountMinor, currency, idempotencyKey) -> ProviderPaymentResult
capture(paymentReference, amountMinor?, currency, idempotencyKey) -> ProviderPaymentResult
cancel(paymentReference, reason, idempotencyKey) -> ProviderPaymentResult
refund(paymentReference, amountMinor, currency, reason, idempotencyKey) -> ProviderRefundResult
submitDisputeEvidence(disputeReference, evidenceReference, idempotencyKey) -> ProviderDisputeResult
getPayment(paymentReference) -> ProviderPaymentSnapshot
verifyWebhook(rawBody, headers) -> VerifiedProviderEvent | VerificationFailure
mapProviderState(providerPayload) -> normalized ProviderEvent
capabilities(context) -> configured methods/currencies/capture modes
```

Port requirements:

- Adapter receives internal Payment/Order reference, server-selected amount/currency, server request/idempotency key, and allowed non-sensitive customer/metadata. Never accept arbitrary amount/currency from browser as source of truth.
- Return normalized provider reference, transaction/event IDs, normalized state, amount/currency, next action/challenge requirement, and safe provider error code. Do not return/store raw card data or log secrets/payloads.
- Provider-specific currency exponent/minor-unit mapping is inside adapter using authoritative currency metadata. No hardcoded `amount * 100` general rule.
- Every mutating operation accepts an idempotency reference; pass a corresponding provider idempotency key where provider supports it and persist mapping internally. Provider support/collision/retention semantics must be verified per provider before adoption.
- Adapter distinguishes retryable transport/timeout, definitive decline, authentication-required, provider configuration, and unknown-outcome errors. Unknown outcome triggers lookup/reconciliation with the same key/reference before retry.
- Provider capability is configured server-side by country, currency, merchant account, method, device, risk, and environment; do not infer availability from client request or generic adapter name.
- Payment domain validates state transitions and appends ledger events. Provider adapter never mutates Order or Inventory directly.

## Provider Capability Matrix

Only repository implementation and explicitly verified configuration are represented as implemented. A provider product's potential feature is not evidence that this project enables it.

| Method/provider | CURRENT project integration | Cards | 3DS2/SCA | Apple Pay | Google Pay | Local methods / BNPL | Full/partial refunds | Webhooks/signature | Audit result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Stripe | PaymentIntent prototype; frontend CardElement and `confirmCardPayment`; `automatic_payment_methods` enabled server-side | Card intent flow present, not Order-bound | NOT VERIFIED in project code/config | NOT VERIFIED; no wallet element/config evidence | NOT VERIFIED; no wallet element/config evidence | NOT VERIFIED / not configured | Not implemented in app | No webhook route or signature verification found | Prototype only; not a Payment Core adapter |
| Paymob | No runtime adapter/config found; listed as possible future provider in payment architecture | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Candidate only; provider capability requires product/account research |
| Kashier | No runtime adapter/config found; listed as possible future provider | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Candidate only; capability NOT VERIFIED |
| Fawry | No runtime adapter/config found; listed as possible future provider | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Fawry/local payment method NOT VERIFIED in project | NOT VERIFIED | NOT VERIFIED | Candidate only; capability NOT VERIFIED |
| InstaPay / local mobile wallets | No runtime adapter/config found | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | InstaPay, bank transfer, and local mobile-wallet support NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | Required market capability must be validated with selected provider/account; no project integration found |
| COD | Current Order accepts `paymentMethod: "cod"`; no PaymentProvider or collection/settlement record exists | Not applicable | Not applicable | Not applicable | Not applicable | COD selected as Order method only | NOT VERIFIED | Not applicable | LEGACY Order flag, not a fully implemented Payment method |
| Other wallets / local / BNPL | No adapter or route found | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED | DEFERRED pending verified provider/account capability and business approval |

The authoritative rules require Apple Pay/Google Pay and at least one suitable local method in the target release checklist, but no current project/provider-account evidence verifies any wallet/local/BNPL capability. Do not claim capability until verified against provider docs, merchant account, country/currency, device/browser flow, and test environment.

## Adapter Selection and Failover

TARGET: choose provider/method on the server from enabled capability configuration and accepted Order context. Persist selected provider and method on the Payment attempt. Failover/smart routing is deferred until provider capability, duplicate-charge prevention, idempotency equivalence, reconciliation, and customer consent are designed. A circuit breaker may stop new attempts during outage but must not reinterpret unknown outcomes as failures or create a second charge.

## Security Boundary

Provider secret credentials are server-side secrets only; never frontend, logs, repo, or Order snapshot. Hosted fields/checkout/payment element keeps PAN/CVV in provider control. Store only opaque provider token/reference and allowed display metadata. Webhook verification is the provider adapter's responsibility over raw request bytes and provider-specified signature/timestamp fields, with the Payment domain enforcing event deduplication and transition legality.
