# Paymob Capture Evidence Contract

Status: Phase 10.3 implementation note. Research checked 2026-11-05 against the linked current Paymob sources. **Merchant-specific capture semantics remain BLOCKED** because the configured Integration ID/type and a matching Sandbox inquiry response have not been verified. No capture transition is enabled.

## Decision summary

The public Paymob materials resolve the HMAC field-list question: the current Transaction HMAC guide defines 20 fields and does **not** sign `is_captured` or `captured_amount`. Paymob's transaction callback page lists those fields in the callback object, and its transaction inquiry API schema also exposes them. Thus they are not inquiry-only, but callback appearances are outside the documented Transaction HMAC and cannot independently authorize a capture transition.

The safe candidate evidence path is: verify the Transaction Processed callback using the documented HMAC, use only its signed transaction ID and order/integration references to correlate, then query that transaction through Paymob's authenticated Transaction Inquiry API and validate the response against the stored Payment and the merchant-confirmed Integration contract. The inquiry schema provides `is_captured`, `captured_amount`, `is_live`, `integration_id`, `integration_type`, amount, currency, pending/success, void/refund and parent-transaction fields. Paymob documents Bearer-token authorization for inquiry, with the token generated from an API Key.

This is a **candidate contract**, not final proof for this merchant. The public examples conflict, and the merchant's actual purchase versus Auth/Cap Integration configuration is unknown. Until Paymob Support and the merchant owner resolve the questions below, `success=true`, callback-only capture fields, nested gateway/acquirer data, a redirect, or a mocked test must not mark Payment `captured`.

## Implementation inspected

| Area | Current file and function | Finding |
|---|---|---|
| Intention setup | `backend/providers/paymobProvider.js` — `requireTestConfiguration`, `buildIntentionPayload`, `PaymobProvider.createPayment` | TEST-only EGP card flow; sends the configured numeric Integration ID in `payment_methods`, creates an Intention, and returns hosted Unified Checkout. The actual merchant ID/type is not present in the inspected local environment. |
| Execution gate and reference persistence | `backend/services/providerExecutionService.js` — `executePayment`; `backend/models/paymentExecutionAttemptModel.js`; `backend/repositories/paymentExecutionAttemptRepository.js` | Paymob LIVE is rejected. TEST execution requires explicit opt-in. The Intention ID and `intention_order_id` are stored; the attempt is marked `SESSION_CREATED`. Session creation itself is pending, not capture. |
| Callback ingress | `backend/app.js`; `backend/routers/paymentWebhookRouter.js`; `backend/controllers/paymentWebhookController.js` | JSON raw bytes are retained for POST webhook paths; the controller takes `hmac` from the query string. Only POST `/:provider` is routed. No browser redirect route updates Payment. |
| HMAC verification | `backend/providers/paymobProvider.js` — `PaymobProvider.verifyWebhook` | Reads POST `body.obj`, concatenates the documented 20 fields in order, SHA-512 HMAC, lowercase-hex input, and timing-safe comparison. Missing/null signed values fail closed. HMAC secret is TEST-scoped behind explicit TEST opt-in. |
| Callback normalization | `backend/providers/paymobProvider.js` — `PaymobProvider.normalizeWebhookEvent` | Binds signed callback `integration_id` to configured TEST ID, rejects generic success without capture evidence and defers capture actions without inquiry. The signed transaction ID is carried separately from event identity. |
| Durable webhook path | `backend/services/providerWebhookService.js` — `ProviderWebhookService.ingest`; `backend/services/paymentService.js` — `receiveVerifiedWebhook`, `processClaimedWebhook`; `backend/services/paymentWebhookWorker.js` | Receipts are uniquely keyed by provider/event ID and processed via durable claims/retries. The worker binds the validated callback transaction reference to `Payment.providerTransactionId` once, rejects a different later reference, and writes the reference, Payment transition, ledger, and processed receipt transactionally. It does not perform Paymob inquiry. |
| Payment states | `backend/utils/paymentStateMachine.js` — `assertPaymentTransition` | `authorized` may move to `captured`; `captured`, `failed`, and `cancelled` are terminal. There is no partial-capture or refunded Payment state. |
| Tests | `backend/tests/paymobWebhook.test.js`, `backend/tests/paymobExecution.test.js`, `backend/tests/paymobInquiry.test.js` | All provider calls are mocked. These tests exercise request/authentication, expiry, response binding, and fail-closed rules; they do not prove merchant configuration or external Paymob semantics. |

## Official Paymob evidence

The current [Intention API documentation](https://developers.paymob.com/paymob-docs/intention-apis/create-intention) says the `payment_methods` values are Integration IDs and that the ID's Test/Live mode must match the Secret Key. The adapter's intention payload selects an ID, but public Intention documentation does not reveal which transaction type the merchant configured behind that ID.

The [Auth/Cap guide](https://developers.paymob.com/paymob-docs/payments-and-features/core-features/auth-cap) says authorization places a temporary hold and capture collects the authorized amount or part of it. The [Capture guide](https://developers.paymob.com/paymob-docs/payments-and-features/managing-payments/capture) says capture is supported for card integrations with Auth transaction type. A successful authorization therefore cannot be treated as capture.

The [Transaction Processed Callback guide](https://developers.paymob.com/paymob-docs/developers/transaction-callbacks), last updated June 1, 2026, distinguishes server-to-server POST callbacks from client-side GET redirects and says not to use the redirect to update order status. It describes `success` as transaction status and lists `is_captured` and `captured_amount` as capture-related callback keys.

The current [HMAC Transaction Callback guide](https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac/hmac/hmac-transaction-callback), last updated June 1, 2026, specifies SHA-512 over these 20 keys in the documented order: `amount_cents`, `created_at`, `currency`, `error_occured`, `has_parent_transaction`, transaction `id`, `integration_id`, `is_3d_secure`, `is_auth`, `is_capture`, `is_refunded`, `is_standalone_payment`, `is_voided`, `order.id`, `owner`, `pending`, `source_data.pan`, `source_data.sub_type`, `source_data.type`, and `success`. It omits `is_captured` and `captured_amount`. No separate callback signature mechanism covering those omitted fields was found in the reviewed official material.

The [Transaction Inquiry by ID API](https://developers.paymob.com/paymob-docs/developers/transaction-inquiry-apis/by-transaction-id), last updated June 28, 2026, uses `GET /api/acceptance/transactions/{transaction_id}` and a Bearer auth token. Its documentation says to obtain that token through [Authentication Request (Generate Auth Token)](https://developers.paymob.com/paymob-docs/developers/authentication-request-generate-auth-token-1), whose body takes an API Key. Inquiry response attributes include `pending`, `success`, `is_auth`, `is_capture`, `is_standalone_payment`, `integration_id`, `integration_type`, `is_live`, `is_voided`, `is_refunded`, `is_captured`, `captured_amount`, currency, amount, order, and parent transaction. This provides an authenticated server-to-server evidence source independent of the unsigned callback fields; it does not remove the need to confirm this merchant's integration semantics.

The [Transaction inquiry overview](https://developers.paymob.com/paymob-docs/payments-and-features/core-features/transaction-inquiry-and-reports), last updated August 4, 2026, describes callbacks as primary and inquiry as a manual/fallback mechanism when a callback is missed. This architecture proposes using inquiry as the capture confirmation source because the current callback HMAC does not cover the two capture-specific fields.

### Ambiguities not resolved by public sources

1. The callback guide's outer object lists `is_captured` and `captured_amount`; the HMAC guide omits them. The docs do not say whether an alternate HMAC version, callback type, or additional signature covers either field.
2. The official callback example shows outer `is_captured: false` and `captured_amount: null`, while nested gateway data contains a `CAPTURED` status and positive gateway capture totals. The docs do not explain whether the outer fields are stale, transaction-level, or otherwise different. Do not substitute nested gateway data for a canonical Paymob contract.
3. `is_capture` describes a capture action/transaction; `is_captured` describes capture state. The exact mapping between authorization parent, capture child, and the inquiry response for the merchant's configured Integration ID is not documented in the reviewed material.
4. The adapter's hosted checkout uses an Integration ID but the merchant's actual transaction type and whether a one-step standalone purchase is automatically captured are not visible locally.

## Candidate capture decision table

The table is a fail-closed target contract. Inquiry fields are accepted only from an authenticated HTTPS Paymob inquiry response, and only after the merchant/provider confirms their meaning for the configured Integration ID. Callback fields omitted from the published HMAC are never used as capture proof.

| Outcome | Required trusted evidence | Payment / Order handling |
|---|---|---|
| Authorized, not captured | Authenticated inquiry binds exact transaction/integration/order/environment; `pending=false`; authorization state is confirmed; no full capture amount (`is_captured` false or captured amount zero) under the provider-confirmed contract. | `authorized`; never confirm the Order or release fulfillment. Await a verified capture action or terminal resolution. |
| Fully captured | Authenticated inquiry binds transaction ID, configured Integration ID, mode, Order reference, amount, and currency; terminal non-pending successful state; provider-confirmed capture indicators show the complete Order amount captured; no void/refund conflict. For standalone purchase versus Auth/Cap, apply the merchant-confirmed branch below. | Record captured financial fact only after all checks. Existing Payment state may become `captured`; Order confirmation remains a separate eligible, reservation-dependent command. |
| Failed | Authenticated inquiry is final (`pending=false`, `success=false`) and confirms no captured amount/state and no contradictory authorization/capture. | `failed`; no Order confirmation. If any capture evidence exists or fields conflict, use manual review instead. |
| Pending / processing | Callback or authenticated inquiry indicates `pending=true`, or inquiry is not yet final. | Keep `pending`/`authorized` as evidenced. Do not confirm Order, create a new attempt, or infer failure from timeout. |
| Partially captured | Authenticated inquiry reports a positive captured amount below the Order amount, or provider confirms a partial capture action. | Preserve the partial financial fact and open manual review. Do not mark the full Payment captured or confirm/fulfill the initial-release Order. Partial capture is not represented by current Payment state. |
| Refunded | Authenticated inquiry confirms a prior capture plus refund state/amount. | Preserve the capture and record refund separately. Never erase/rewrite capture evidence. If refund precedes Order confirmation, hold for reconciliation/manual decision. |
| Voided | Authenticated inquiry confirms void/cancellation and no captured amount. | Do not confirm; record terminal void/cancel evidence through a future authorized transition. If void and capture conflict, manual review. |
| Unknown / inquiry unavailable | No authenticated inquiry result, unknown transaction, authorization failure, missing fields, or an unsupported provider status. | Keep outcome `UNKNOWN`/review; never mark captured, never retry an ambiguous charge automatically. |
| Callback and inquiry conflict | Signed callback and authenticated inquiry disagree on ID, integration, environment, order, amount/currency, pending/final state, or capture/refund/void status. | Quarantine for manual review and reconcile. Do not pick the more favorable value or confirm the Order. A later fresh inquiry may inform the case but does not erase conflicting evidence. |

For **standalone/purchase**, merchant/provider confirmation must establish whether full capture is evidenced by `is_standalone_payment=true`, `is_auth=false`, and authenticated inquiry `is_captured=true` with `captured_amount` equal to the Order amount, and clarify any additional required conditions. For **Auth/Cap**, authorization alone is never sufficient; Support must identify the canonical capture transaction/parent reference and explain how inquiry reports cumulative captured amount and partial captures. Do not assume the two branches share callback flags.

Capture means payment collection by the provider; it does not by itself prove settlement/payout to the merchant.

## Integration binding requirements

Before a future adapter can produce trusted `captured` evidence, it must validate all of the following. A missing value or mismatch is rejected/quarantined and cannot advance Payment or Order.

| Binding | Required check |
|---|---|
| Provider | Route, adapter, and inquiry client all identify Paymob. Do not accept another provider's references or credentials. |
| Environment | Use an explicitly scoped TEST or LIVE configuration; reject LIVE while runtime policy disables it. Match authenticated inquiry `is_live` to the configured environment. Never let callback data select the environment. |
| Exact Integration ID | Compare signed callback `integration_id` and authenticated inquiry `integration_id` to the server-configured ID. Require it to be the merchant-approved ID for this method/mode. Missing or mismatch is a security/reconciliation error. |
| Callback authentication | For Transaction Processed POST, verify only the official 20-field HMAC contract with the correct environment-specific HMAC secret. `is_captured`/`captured_amount` are not trusted from this HMAC because they are absent from its published field list. Reject GET redirects as evidence. |
| Inquiry authentication | Call Transaction Inquiry by transaction ID over HTTPS using the Bearer token generated from the merchant API Key. Do not log or persist the API Key or token. Treat non-2xx, malformed, stale, or unbound responses as unknown. |
| Stored references | Require callback transaction `obj.id` to equal inquiry `id`. Resolve callback `order.id` only through the persisted Paymob attempt; require inquiry `order.id` and provider references to match that same attempt and stored Payment. Persist transaction ID only as verified evidence. |
| Amount and currency | Compare authenticated inquiry amount and currency to the immutable Payment and Order snapshot in integer minor units. For full capture, provider-confirmed captured amount must equal the required amount. Any partial, over, or mismatch outcome is review-only. |
| State and action | Require the merchant-confirmed final success/capture contract, not generic `success=true`. Reject pending, auth-only, refund, void, unsupported action, or inconsistent parent/child evidence from automatic confirmation. |

## Minimum merchant and Paymob evidence

Request from the account owner/operator—**never request API keys, Secret Keys, Public Keys, HMAC secrets, auth tokens, or credential-bearing screenshots**:

1. Exact numeric TEST Integration ID and the mode, currency, card method, account/profile, and dashboard callback configuration. Provide values/screenshots with merchant personal details and secrets redacted.
2. Integration transaction type: purchase/standalone or Auth/Cap; whether authorization and capture are separate; automatic-capture behavior; and whether the integration permits partial capture.
3. Paymob Support answer to the ambiguities above: Are `is_captured` and `captured_amount` included in any supported Transaction Processed HMAC variant? If yes, give the current exact signed field list/order and a signature test vector. If no, confirm the authenticated inquiry response is the authoritative source for these fields. Explain the conflicting callback example and the parent/child inquiry model for Auth/Cap.
4. One successful merchant Sandbox transaction's redacted Intention response identifiers, Transaction Processed callback, and Transaction Inquiry by transaction ID response from that same transaction. Retain fields needed to compare ID, order, integration, `is_live`, transaction type, amount, currency, `pending`, success, auth/capture, captured amount, refund/void, and parent references. Redact names, email, phone, address, tokens, PAN beyond a minimal masked suffix, and unrelated merchant data. HMAC signature may be retained if useful; never include the HMAC secret.
5. A corresponding no-capture/authorization-only case if the Integration is Auth/Cap, plus a failure or pending example where available. Do not substitute mocked fixtures for provider responses.

## Capture activation requirements still outstanding

The Phase 10.3 inquiry probe is a manual reconciliation observation only. The following requirements remain before any inquiry evidence can authorize a Payment transition:

1. Keep provider execution and webhook processing disabled by default. Keep LIVE unavailable until its own approval and verification.
2. Treat a verified Transaction Processed callback as an authenticated event/correlation trigger, not capture proof where capture fields are outside HMAC. Use the signed transaction ID to make an authenticated inquiry outside database transactions.
3. Validate provider, environment, exact Integration ID, callback/inquiry transaction ID, stored attempt/order linkage, and exact amount/currency before normalization. Persist safe normalized inquiry evidence/hash and correlation identifiers without raw payloads or secrets.
4. Normalize to `captured` only from a merchant-confirmed inquiry capture contract and full expected amount. If Paymob cannot establish capture through authenticated inquiry for the configured Integration type, retain `UNKNOWN` and require manual review; do not invent a wider HMAC field list.
5. Represent partial capture/refund/void as explicit evidence or reconciliation outcomes; the current Payment state machine has no partial/refunded states. Do not coerce these into full `captured` or silently rewrite terminal state.
6. Keep HMAC event idempotency and transactional Payment/ledger receipt application. Inquiry network calls stay outside Mongo transactions; persist inquiry result through a bounded idempotent command and reconcile races/conflicts.
7. Add tests from official HMAC vectors and merchant-redacted callback/inquiry pairs, plus missing/mismatched integration, environment, amount, currency, pending, auth-only, partial, refunded, voided, duplicate, and callback/inquiry conflict cases. Mocked tests remain supplemental; complete a real Sandbox E2E verification before TEST activation.

## Approval and gate status

- **Public HMAC field-list question:** resolved. The reviewed Transaction HMAC guide omits `is_captured` and `captured_amount`; do not treat those callback fields as HMAC-authenticated under the documented contract.
- **Authenticated inquiry evidence path:** documented. Paymob's inquiry API uses a Bearer token generated from an API Key and returns the relevant capture, integration, environment, transaction, order, amount, and currency fields.
- **Merchant-specific capture semantics:** **BLOCKED** pending exact Integration ID/type, Paymob Support answers, and matching Sandbox inquiry/callback evidence.
- **Transaction reference binding:** implemented for verified callbacks. The transaction ID is persisted only when the worker validates the matching Payment, Order snapshot, amount, currency, and allowed transition; it cannot be overwritten by a conflicting callback. This is correlation evidence, not capture evidence.
- **Authenticated inquiry implementation:** **IMPLEMENTED; SANDBOX-UNVERIFIED**. The code requires `PAYMOB_ENVIRONMENT=TEST`, `PAYMOB_TEST_TRANSACTION_INQUIRY_ENABLED=true`, the fixed TEST host, `PAYMOB_TEST_API_KEY`, and `PAYMOB_TEST_INTEGRATION_ID`. It does not fall back to generic `PAYMOB_API_KEY`; the existing local config declares that generic name and is intentionally unchanged. No request is made by tests.
- **Production payment activation:** remains blocked. This report does not enable providers, assert live readiness, or substitute public docs/mocks for merchant verification.

## Validation

No Sandbox request or transaction was made for this phase. Automated tests use mocked responses only. A merchant-owned Sandbox inquiry is still required before interpreting capture behavior or changing payment activation.

## Phase 10.1 remediation status

The Phase 10.1 implementation requires the callback's signed `integration_id` to match `PAYMOB_TEST_INTEGRATION_ID`. A successful authorization is normalized as `authorized`, not `captured`. A generic successful callback without capture evidence is rejected, and an identified capture action was deferred because authenticated transaction inquiry was not yet implemented. This is intentionally fail-closed; no callback path currently marks a Paymob payment captured.

Before any Paymob capture can be enabled, obtain the merchant-approved Integration ID and exact Integration type, confirm standalone versus Auth/Cap semantics, and provide redacted Sandbox callback/inquiry evidence tying transaction, integration, order, amount, and currency together. Implement and test authenticated inquiry outside database transactions before accepting capture evidence. Production remains disabled; no live payment or provider request was performed for this phase.

## Phase 10.2 status

The callback's signed transaction ID is now stored as a distinct immutable webhook receipt field and bound once to `Payment.providerTransactionId` during the same MongoDB transaction as the validated Payment transition and ledger entry. A later callback with a different transaction ID is rejected and cannot overwrite the persisted reference. Duplicate callbacks retain the existing provider-event idempotency behavior.

Authoritative capture interpretation remains blocked. Confirm the exact Integration ID/mode/type and purchase-versus-Auth/Cap semantics, and supply Paymob Support confirmation plus redacted Sandbox callback/inquiry pairs that establish transaction/parent linkage, capture status and amount. No capture is enabled; LIVE remains disabled.

## Phase 10.3 — Transaction Inquiry (Sandbox only)

The read-only inquiry path uses Paymob's documented `POST /api/auth/tokens` API Key flow and `GET /api/acceptance/transactions/{transaction_id}` endpoint at the fixed `https://accept.paymob.com` host. The request sends `{"api_key": ...}` only to authentication and uses the returned token as `Authorization: Bearer ...` for inquiry. The JWT `exp` claim controls an in-memory per-adapter cache with a 30-second early-expiry margin; concurrent requests share one authentication request. Missing/unparseable expiry, transport failures, non-2xx responses, and malformed bodies fail closed. No token, key, or provider response body is logged or persisted.

Inquiry is reachable only from reconciliation when both `PAYMOB_ENVIRONMENT=TEST` and `PAYMOB_TEST_TRANSACTION_INQUIRY_ENABLED=true`. It requires `PAYMOB_TEST_API_KEY`, `PAYMOB_TEST_API_BASE_URL=https://accept.paymob.com`, and `PAYMOB_TEST_INTEGRATION_ID`. There is deliberately no fallback to the unscoped `PAYMOB_API_KEY` from the local configuration: the checked-in code's exact TEST-scoped names are distinct from the local generic names. Do not copy, rename, or reveal credentials without confirming their environment and secret-management policy.

The current official Inquiry response attributes relevant to this verifier are:

| Response field | Verification rule |
|---|---|
| `id` | Required positive integer; exact string-equivalent match with stored `Payment.providerTransactionId`. |
| `integration_id`, `is_live`, `integration_type` | All required; ID must equal configured TEST Integration ID, `is_live` must be exactly `false`, and type must be a non-empty string. The merchant-approved type is not currently configured, so this value is observed but not authorized as a merchant policy. |
| `order.id` | Required positive integer; must equal the persisted Paymob execution attempt's `providerReference`. |
| `amount_cents`, `currency` | Required; exact match to the immutable Payment amount and currency. If `amount_cents_int` is also present, it must be a safe integer equal to `amount_cents`. |
| `pending`, `success`, `error_occured`, `is_auth`, `is_capture`, `is_standalone_payment` | Required booleans. `success=true` alone is never sufficient; successful status with `error_occured=true` is rejected. Contradictory or unsupported combinations fail closed. A capture-action transaction must have a parent; standalone and parent-linked flags cannot conflict. |
| `is_captured`, `captured_amount` | Required boolean and non-negative safe integer. Captured requires `is_captured=true`, `pending=false`, `success=true`, and `captured_amount === amount_cents`; uncaptured requires amount zero. If `captured_amount_int` is also present, it must be a safe integer equal to `captured_amount`. Partial capture, missing values, or conflict is rejected for manual review. |
| `is_voided`, `is_refunded` | Required booleans; either true is rejected from the supported initial-payment evidence path. |
| `has_parent_transaction`, `parent_transaction` | Parent flag required. If true, parent must be a numeric string distinct from this transaction; because the current Payment record does not bind that parent ID, the inquiry is stored as `PENDING_REVIEW`, not accepted as a capture transition. If false, a non-empty parent reference is inconsistent and rejected. |
| `updated_at`, `created_at` | Used only as the observation timestamp when parseable; otherwise observation time is local. |

The supported status derivation is `pending=true` → `pending`; otherwise a consistent `success=false` → `failed`; otherwise a consistent successful `is_auth=true` and not captured → `authorized`; otherwise a successful full capture with either standalone/no-parent flags or capture-action/parent flags → observed `captured`. Every other combination is invalid. The parent-linked branch remains `PENDING_REVIEW` because the stored Payment has no expected parent ID.

Only the normalized fields above are retained in immutable reconciliation records, including the response Order reference and capture/integration/mode flags. The query runs before any MongoDB transaction. Inquiry evidence may report a capture candidate, but reconciliation is observational: it never changes Payment or Order state. `providerEnabled` and `providerStatusQueryAvailable` remain false; no Capture, Void, Refund, or other financial operation was added.

### Remaining merchant-specific capture questions

1. Is the configured TEST Integration a standalone purchase or Auth/Cap, and what is its exact provider-confirmed Integration type?
2. For standalone purchase, does the authenticated inquiry show `is_standalone_payment=true`, `is_auth=false`, `is_captured=true`, and full `captured_amount` for this merchant's actual successful Sandbox transaction?
3. For Auth/Cap, which transaction ID is stored for the authorization and capture child, how does `parent_transaction` identify their relationship, and does inquiry report cumulative or per-transaction capture amount?
4. Does the merchant's redacted inquiry response confirm `captured_amount` and `amount_cents` are both expressed in cents for the configured currency and integration?
5. Are any additional merchant-specific terminal, settlement, or capture conditions required before the merchant regards a transaction as captured?

Do not activate Paymob card payments until an actual Sandbox Inquiry response, correlated with the merchant's Integration ID and callback, answers the relevant questions. Mocks and the public response schema are not substitutes.
