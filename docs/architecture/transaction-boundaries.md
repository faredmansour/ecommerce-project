# Transaction and consistency boundaries

CURRENT: the runtime uses a single MongoDB datastore but does not yet implement all target aggregate transaction boundaries. TARGET: the rules below define local consistency and orchestration. DEFERRED: transactional checkout, reservation, and payment workflows are later implementation work.

## Core rule
A single business operation may touch multiple aggregates, but the software must separate:
- transactional writes that require atomicity
- eventual consistency boundaries that accept temporary drift
- external-provider flows that require retries and deduplication

## Transactional areas

### 1. Identity writes
Use a transaction for:
- user creation with initial profile metadata
- role assignment and revocation
- token invalidation on logout or rotation

### 2. Cart writes
Use a transaction for:
- adding quantity and updating totals
- removing items and persisting final state

### 3. Checkout orchestration
This is the highest-risk multi-aggregate boundary.
A transaction should cover:
- cart validation
- inventory reservation
- order creation
- payment intent creation if the database and provider operations are coordinated

If provider coordination cannot be atomic, create a compensating transaction or explicit state machine after the initial persistence boundary.

### 4. Payment finalization
Payment finalization is not a simple CRUD path. It must be treated as:
- primary state write to payment/ledger
- provider webhook processing with idempotency keys
- order state update after verification

### 5. Fulfillment updates
Order state and shipment records can be updated in a local transaction, but carrier-provided tracking data should be treated as asynchronously incoming data.

## Consistency strategy
- Use strong consistency only within a single aggregate and local transactional boundary.
- Use eventual consistency for external payment provider events and asynchronous notifications.
- Respect idempotency keys for duplicate webhook delivery.
- Avoid long-running transactions across provider APIs.

## Recommended pattern
- Application service orchestrates the workflow.
- Domain service enforces invariants.
- Repository writes stay within aggregate boundaries.
- Outbox or event bus records should be used for cross-boundary propagation when the timeline is non-blocking.

## Specific to this project
Given the current codebase uses MongoDB and a modular monolith, the architecture should not create distributed transactions across services. Instead, it should localize atomicity within a single datastore and isolate external-provider behavior behind an adapter contract.
