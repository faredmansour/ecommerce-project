# State machines

## CURRENT STATE

The current repository still uses a minimal status model, such as the order status enum in [backend/models/orderModel.js](../../backend/models/orderModel.js): pending, shipped, delivered.

This is current-state implementation, not the target lifecycle design.

## TARGET CONTRACT

Product lifecycle and inventory availability are separate concerns. `out_of_stock` is not a Catalog Product lifecycle state.

### Order lifecycle
Target lifecycle:
- draft
- pending_payment
- confirmed
- processing
- packed
- shipped
- delivered
- completed
- cancelled
- refunded

Example transitions:
- draft -> pending_payment on checkout initiation
- pending_payment -> confirmed after successful payment authorization/capture and order acceptance
- confirmed -> processing when fulfillment begins
- processing -> packed
- packed -> shipped
- shipped -> delivered
- delivered -> completed after fulfillment confirmation
- pending_payment -> cancelled by user or timeout
- confirmed -> cancelled only through valid business rules
- delivered -> refunded if policy allows

For every transition, the contract must define:
- actor
- use case / command
- invariant
- side effect
- emitted event

The target invariant is that historical Order data is immutable after confirmation; later product or pricing changes must not mutate confirmed order values.

### Payment lifecycle
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

Valid transitions:
- created -> pending
- pending -> authorized
- authorized -> captured
- captured -> partially_refunded
- captured -> refunded
- pending -> failed
- pending -> cancelled
- authorized -> cancelled
- captured -> disputed

The payment lifecycle must be append-only and ledger-based; it is not a single mutable status field.

### Inventory reservation lifecycle
Target lifecycle:
- available
- reserved
- committed
- released
- expired

Transitions:
- available -> reserved when checkout validates stock and holds quantity
- reserved -> committed when order is confirmed
- reserved -> released if checkout is cancelled or timed out
- reserved -> expired when reservation TTL elapses
- committed -> released only via refund or correction flows, not by normal sales logic

### Cart lifecycle
- empty
- active
- checked_out
- abandoned

### User lifecycle
- pending
- active
- suspended
- deleted

### Product lifecycle
- draft
- active
- inactive
- archived

### Inventory availability condition

Availability may be presented as available, low-stock, or out-of-stock based on Inventory-owned quantities. `out_of_stock` is a derived Inventory condition, not a Product lifecycle state. The detailed availability model remains deferred to the Inventory phase.

### Review lifecycle
- draft
- published
- hidden
- removed

## Future implementation note

These state machines are target contracts for future implementation phases. They do not imply that the repository already supports the full lifecycle model.
