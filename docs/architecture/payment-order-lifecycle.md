# Payment and Order Lifecycle

## Order states

| State | Meaning | Allowed next states |
|---|---|---|
| `pending_payment` | Card/Stripe order awaiting a verified payment outcome | `paid`, `failed`, `cancelled` |
| `pending` | COD order awaiting fulfillment; also retained for legacy card orders until an attempt is reserved | `pending_payment` when a card attempt is reserved; COD may advance to `shipped` |
| `paid` | A verified captured payment has been applied | `shipped` |
| `failed` | The active payment attempt reached a verified failure | Terminal |
| `cancelled` | The active payment attempt reached a verified cancellation | Terminal |
| `shipped` | Fulfillment started after a paid card order or for a COD order | `delivered` |
| `delivered` | Fulfillment completed | Terminal |

`paid` is not accepted from the client or administrator status endpoint. The payment service sets it only in the same transaction that applies a verified `captured` Payment transition and appends its ledger event. Existing COD orders continue to be created as `pending`.

## Payment states

```text
created -> pending -> requires_action / authorized -> captured
                         |                  |          |
                         +------------------+-> failed / cancelled
```

Only the existing payment state machine may apply Payment transitions. `captured`, `failed`, and `cancelled` are terminal. An authorization is not capture and does not permit order fulfillment.

## Attempt reservation and idempotency

Creating a Payment transactionally reserves the Order for that Payment by storing its internal Payment ID and setting the order to `pending_payment`. This conditional update serializes distinct idempotency keys for the same order. Repeating the same customer/operation/idempotency-key request returns the same Payment. A different key receives `ACTIVE_PAYMENT_EXISTS` while an attempt is active.

Before reserving, the service also checks for an existing unresolved or captured Payment, protecting pre-reservation legacy records.

The reservation is cleared only when a verified terminal outcome is committed. A verified capture changes the order to `paid`; verified failure/cancellation changes it to the matching terminal Order state. The Payment, Order, ledger entry, and webhook receipt are updated transactionally. A failed/cancelled Order cannot be retried automatically; a future manual retry/reopen policy needs an explicit lifecycle design.

Legacy card orders in `pending` remain eligible only when their immutable commercial snapshot is valid. Reserving an attempt atomically moves them to `pending_payment`. Orders without a supported card method, with an invalid snapshot, or in a fulfillment/terminal state are rejected.

## Paymob capture gate

The configured TEST integration ID must be present and equal to the integration ID in the signed callback. A pending callback remains pending. A verified authorization is recorded as `authorized`. A generic success callback without capture evidence is rejected. A callback identifying a capture action is not treated as capture because the documented HMAC does not authenticate `is_captured` or `captured_amount`, and the repository does not yet have an authenticated transaction-inquiry implementation.

Until the merchant confirms its Integration ID/type and supplies matching Sandbox callback/inquiry evidence, Paymob capture cannot transition a Payment to `captured` or an Order to `paid`. TEST execution and LIVE execution remain disabled unless separately approved/configured.
