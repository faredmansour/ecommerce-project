# Concurrency and idempotency strategy

CURRENT: the runtime has targeted protections such as refresh-token rotation and unique constraints, but does not implement the future checkout, inventory reservation, or payment idempotency model. TARGET: the rules below define those contracts. DEFERRED: remaining concurrency controls are implemented with their owning domains.

## Concurrency risks
The main concurrency risks in this project are:
- concurrent cart edits by the same user
- concurrent stock checks and reservations
- multiple payment webhooks for the same provider event
- duplicate retry requests for order creation or payment confirmation
- repeated auth token refresh requests

## Concurrency model
### Cart updates
Use optimistic concurrency or per-user versioning on the cart aggregate. Race conditions that update quantity or remove lines at the same time must be resolved deterministically.

### Inventory reservation
Inventory must be treated as a reservation-based system. A product should not be treated as a simple numeric counter during checkout without reservation semantics.

### Payment events
Payment provider webhooks and retries must be idempotent. Each event should be matched to a unique event key or provider reference before state mutation.

### Auth token refresh
Refresh tokens must be single-use or revocable to prevent replay. Current phase 2 security requirements already require secure token rotation, hashing, and revocation semantics.

## Idempotency keys
For all externally initiated actions, require an idempotency key for:
- payment intent creation
- order confirmation
- refund requests
- webhook processing
- password reset requests

The key should be unique per client action and persisted with the request state to guarantee safe retries.

## Recommended implementation patterns
- Use MongoDB optimistic locking or a version field for cart updates.
- Use atomic increments and reservation tables for inventory.
- Use provider event idempotency keys and payment ledger deduplication.
- Use transaction-scoped request IDs for order creation and pay flows.

## Hard requirements
- Replaying the same payment webhook must not create duplicate payment records.
- Repeating a refresh call with the same token must not extend a session beyond the allowed security policies.
- Retrying checkout should not create multiple order records for the same user action if the request ID is the same.

## Operational rule
If a flow is not idempotent by design, the system must reject the duplicate or make it harmless before it reaches a mutation boundary.
