# Provider Reconciliation, Expiry, Refund, and Reliability Contract

Status: CURRENT FOUNDATION plus FUTURE / DEFERRED operations. Step 8 implements an internal payment reconciliation observation service using internal records and verified, processed webhook receipts only. It does not query providers, ingest settlement data, or correct financial state. All operational provider capabilities remain disabled.

## Current Implementation (Phase 10 Step 8)

See [payment-reconciliation.md](payment-reconciliation.md) for the complete contract. The current service compares the Order commercial snapshot, Payment, append-only ledger, and trusted webhook evidence. It persists immutable normalized reconciliation observations. Paymob, Kashier, and Fawry remain disabled; status-query capability is unavailable. No provider HTTP requests, settlement import, public/admin API, scheduled reconciliation job, or deployed reconciliation worker exists.

## Future Provider Integration

The expiry, refunds, settlement matching, safe failover, and operational guidance below are target contracts only. Provider status API polling and settlement reconciliation require separately verified provider contracts and implementation.

## Expiration

Represent provider expiry as optional UTC `expiresAt` only when the provider supplies an explicit timestamp or a documented duration bound to a session/reference. Preserve provider source/reference and the relevant action type; session expiry is not necessarily authorization expiry.

| Provider | Official expiry evidence | Account/method caveat |
|---|---|---|
| Paymob | Intention API documents `expiration` (example: 3600 seconds). | Confirm semantics and whether each method supports/obeys it. Kiosk, wallet, BNPL, and card flows can have different lifetimes. |
| Kashier | Payment Session response includes `expireAt`; InstaPay collection requires a `validity` period. | Keep Payment Session expiry distinct from InstaPay QR/R2P validity and card authorization hold expiry. |
| FawryPay | Charge request can include `paymentExpiry`; responses include `expirationTime` for reference-based flow. | Verify behavior per payment method and production account. |

Expiration race handling: a browser timer or local `expiresAt` does not prove provider failure. Query provider or await a verified event. If payment is still ambiguous, retain `pending`/unknown operational status and reconcile; do not automatically create another charge or route to another provider.

## Refund Boundary

Payment Core is the future authority for the original captured amount, cumulative successful refunds, refund-operation idempotency, provider refund reference, currency, and append-only refund ledger facts. Order owns its own read-only refund projection; Inventory decides inspection/restock; Tax/Promotions apply their own adjustments. A refund must not directly mutate Order/Inventory/Tax/Promotion state.

Provider evidence from current public documentation:

| Provider | Current documentation evidence | Still to confirm |
|---|---|---|
| Paymob | Full/partial refunds are supported for successful transactions except Kiosk; partial refunds may be repeated up to the original amount and return to the original method. | API/dashboard availability per method, async result/status event details, refund reference/fees/timing and merchant permissions. |
| Kashier | Full/partial refund endpoint documented; response can be `SUCCESS`, `FAILURE`, or `PENDING`. Refunds use available balance, excluding pending balance. | Per-method/provider restrictions, per-refund idempotency behavior, cutoff windows, and fees. |
| FawryPay | Official guide includes `REFUNDED` status and webhook references to refund events. | Merchant refund API, full vs partial behavior, refund reference/status flow, asynchronous result, refund webhook contract, and method eligibility are NOT VERIFIED in this review. |

Target refund fields: internal `refundId`, internal `paymentId`, original provider transaction reference, provider refund reference, integer `amountMinor`, currency, reason code, scoped idempotency key/request hash, normalized status, timestamps, and append-only ledger linkage. Multiple partial refunds must satisfy `sum(successful refunds) <= verified captured amount` in the same currency. Failed/unknown refund attempts stay visible and reconcile with the original operation identity.

## Settlement and Reconciliation

Compare independent sources; do not treat one source as a rewrite of the other:

```text
Payment + immutable Payment ledger
        vs
Provider transaction / refund / dispute records
        vs
Accepted Order commercial snapshot
        vs
Provider settlement report / acquiring bank payout
```

Provider-neutral reconciliation record should include:

- provider, merchant account/environment, report/source reference, generated-at/imported-at timestamps;
- internal Payment/Order IDs and provider order/payment/transaction/refund references;
- operation and provider status, event IDs, amountMinor/currency;
- gross amount, provider fees, refunds, chargebacks/adjustments, net settlement, settlement reference, payout date/batch, and bank reference where present;
- matching rule/version, mismatch class, evidence digest, assigned operator, resolution reason, and append-only corrective event reference.

**Cadence is NOT VERIFIED for this merchant.** Public pages establish reports/tools, not settlement frequency, bank cut-off, payout date, fee schedule, reserves, or chargeback netting for the intended account. Confirm with each provider; never hard-code a daily settlement assumption even though the mandatory project rule requires at least daily reconciliation in the target operating process. Reconciliation may be event-driven for unknown outcomes plus scheduled daily/settlement-cycle comparison after provider terms are known.

Mismatch classes: provider success/internal pending; internal capture/provider pending or absent; unmatched provider reference; duplicate transaction; amount/currency mismatch; fee/net payout variance; refund mismatch; chargeback/dispute mismatch; expired local session/provider still pending; provider event with no internal Order. Quarantine and alert; append a verified corrective fact only after evidence. Never delete or rewrite a ledger entry.

## Safe Failover

```text
Primary provider attempt
      ↓
classify response: definitive decline / retryable transport / unknown outcome
      ↓
definitive decline → permitted new attempt under policy and customer intent
retryable pre-submission failure → retry same operation key if safe
unknown/timeout after possible submission → query/reconcile original provider reference
      ↓
only after no-charge state is established → consider another provider
```

Do not automatically fail over on timeout, missing callback, or connection loss after submission. Same Order + new provider can create a duplicate charge if the first provider succeeded but the result was lost. Require explicit retry policy, cross-provider duplicate detection, provider idempotency evidence, customer consent, and reconciliation before routing.

## Failure Matrix (TARGET)

| Condition | Payment behavior | Operations behavior |
|---|---|---|
| Declined with definitive provider evidence | Normalize to failed; retain provider reason/reference | Offer a new attempt only under policy; use a new Payment attempt identity |
| Timeout before request is sent | Keep current state; retry same idempotency operation if transport proves no submission | Record retry count/correlation without exposing details |
| Timeout after possible submission | Do not create a new provider attempt or switch provider | Query original reference and reconcile |
| Provider pending / async wallet or reference | Remain pending; no fulfillment based on redirect | Poll/query within provider limits and await verified event |
| Duplicate request | Return/reuse original internal operation by scoped idempotency key | Alert only on conflicting request hash/provider response |
| Duplicate webhook | Verify then deduplicate provider event identity | Acknowledge according to provider contract; no second ledger effect |
| Invalid signature/account/mode | No Payment or Order mutation | Reject/quarantine and security-log redacted event reference |
| Missing webhook | Do not infer failure/success from absence | Query provider/report; age and alert pending items |
| Amount/currency/order mismatch | No capture/Order/Inventory success transition | Quarantine and open reconciliation/security case |
| Expired provider session/reference | Do not rely on frontend timer | Confirm final provider state; handle late success through controlled policy |
| Refund failure/pending | Preserve original captured facts and refund attempt state | Retry only with safe refund operation identity; reconcile available balance and response |
| Settlement mismatch | Do not rewrite Payment ledger or Order amount | Compare gross/fees/refunds/chargebacks/net payout; assign operator and append resolution |
| Provider unavailable before submission | Keep Payment from being represented as charged | Circuit-break new attempts only; show safe retry guidance |

## Idempotency Evidence and Mapping

Internal uniqueness remains mandatory regardless of provider behavior:

```text
internal action key + request hash + Payment ID
               ↕ explicit mapping where provider supports it
provider idempotency/reference behavior
```

- Paymob provider API idempotency key support/retention semantics: **NOT VERIFIED** in reviewed docs. Use a unique internal merchant reference and Paymob order/transaction references for correlation; do not label that as provider deduplication.
- Kashier documents request idempotency guidance and webhook replay behavior, but a general create-payment idempotency-key contract and retention/collision semantics were **NOT VERIFIED**. Confirm exact operation guarantees before relying on provider dedupe.
- FawryPay requires a merchant reference and request signature, but request dedupe semantics/retention were **NOT VERIFIED**.
- Signatures authenticate request/event contents; they do not prevent duplicate payment creation by themselves.

## Observability Contract (TARGET)

Metrics by provider, method, currency, environment, and outcome: authorization/capture success, decline, pending age, timeout, provider latency/availability, wallet/QR expiration, webhook delivery/verification/latency, duplicate/replay/mismatch, refund outcome/age, settlement gross/fee/net variance, reconciliation age, and checkout abandonment/method conversion. Use no PAN/CVV, wallet OTP/PIN, secrets, client secrets, or raw credential-bearing payloads in telemetry. Set thresholds after baseline/account traffic exists.

## Future Test Contract

- Adapter contract tests: create/session, authorize, capture, cancel, refund where supported, status inquiry, expiration, normalized errors, amount/currency conversion, provider IDs.
- Security: invalid signature, wrong mode/account, stale/replayed event, altered amount/currency/order, missing reference, secret/log redaction, oversized/unknown payload.
- Reliability: timeouts before/after submission, provider pending, late/duplicate/out-of-order webhook, idempotent retry, ambiguous outcome and safe failover denial.
- Refund/reconciliation: full/partial/multiple refunds, pending/failure, excess amount, provider balance/fees, settlement mismatches and append-only corrections.
- Method-specific: Meeza card, 3DS challenge/abandonment, each configured wallet, Apple/Google device/domain setup, InstaPay QR/R2P expiry, Fawry reference/deep link, installment/BNPL eligibility, COD failed delivery and cash remittance.

All remain future tests. Public documentation and test-mode success do not prove production merchant configuration or financial settlement behavior.

At Step 11, an environment-scoped Kashier webhook secret boundary was added without changing reconciliation inputs or observations. Only receipts that passed verification and processing can contribute trusted webhook evidence; missing/previous/revoked secrets fail before durable receipt creation. Step 13 adds a Paymob TEST-only callback verification path; Fawry remains unsupported and default provider enablement remains disabled.
