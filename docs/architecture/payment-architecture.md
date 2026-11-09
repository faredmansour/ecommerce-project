# Payment architecture contract

## Goal
Define the target payment architecture without implementing a provider and without changing the current stack.

## CURRENT STATE
The project currently contains a prototype Stripe integration in [backend/controllers/paymentController.js](../../backend/controllers/paymentController.js). This is a current implementation detail, not the target architecture.

The current Product model also contains legacy `price`; it is not the final payment amount source. In the target flow, Payment receives the amount and currency from the confirmed Order snapshot, which was produced from Pricing authority.

It is intentionally treated as a prototype-only integration and must be wrapped behind a provider abstraction in a future phase.

## TARGET ARCHITECTURE
The target payment domain must include:
- Payment aggregate
- PaymentTransaction or PaymentLedgerEntry records
- PaymentProvider interface
- webhook verification and event processing
- append-only ledger semantics
- order association and server-authoritative amount/currency

Required provider implementations may include future examples such as:
- PaymobProvider
- KashierProvider
- FawryProvider
- CODProvider

These are future implementations, not part of this phase.

## Provider port interface
The provider contract must specify:
- createPaymentIntent(order, amountMinor, currency)
- confirmPayment(intentId)
- refund(paymentId, amountMinor, reason)
- verifyWebhook(rawBody, signature)
- mapProviderStateToInternalState(providerStatus)

The implementation is provider-specific and should not leak into order logic.

## Payment model
Payment must carry:
- paymentId
- orderId
- provider
- providerPaymentId or providerTransactionId
- amountMinor
- currency
- status
- idempotencyKey
- failureMetadata
- createdAt
- updatedAt

The payment state must not be reduced to paid/unpaid.

Target lifecycle:
- created
- pending
- authorized
- captured
- partially_refunded
- refunded
- failed
- cancelled
- disputed

## Required invariants
- payment state changes follow a strict finite state machine
- webhook processing is duplicate-safe
- providers are not the source of truth for internal ledger history
- raw payment credentials are never stored in the application database
- payment success is not equivalent to fulfillment success
- frontend redirect is not payment authority
- verified provider webhook is the authoritative event source
- payment amount must come from the server-authoritative order snapshot

## Sequence model
1. Catalog supplies product identity and definition; Inventory validates availability; Pricing calculates the authoritative commercial amount; Promotions, tax, and shipping policies complete the checkout calculation.
2. Order snapshot is created from validated server-side values.
3. Payment service creates provider intent for the server-authoritative amount.
4. Provider returns intent state and provider ID.
5. Application stores payment record and ledger entry.
6. Provider webhook or confirmation flow updates the ledger.
7. Order state transitions depend on verified payment status.

## Security constraints
- webhook verification must use signature validation
- all payment operations must pass through secure config and secret management
- never log raw card or payment payload data
- preserve HTTPS/TLS and strict infrastructure controls as required by the project security baseline
- hosted payment fields, hosted checkout, or provider payment element are required patterns
- raw card data and CVV values are never stored by the platform
- server-side amount and currency validation must be enforced
- duplicate, late, and replayed webhooks must be handled idempotently
- refunds, chargebacks, and reconciliation must be tracked in the ledger
- payment monitoring must track success, failure, latency, and reconciliation state

## Mandatory project payment rules preserved in the target contract
- no raw card storage
- no CVV storage
- signed webhook verification
- server-side amount/currency validation
- idempotency
- 3DS2 where applicable
- inventory reservation timeout
- refunds
- chargebacks
- reconciliation
- smallest-unit currency representation
- monitoring of success/rejection/latency
- frontend redirect is not payment authority
- verified provider event is authoritative
- payment-state transitions are ledger-backed and append-only

## Future implementation note
This is a design contract only. No provider implementation is introduced in this phase. Provider implementations are deferred to later implementation phases.
