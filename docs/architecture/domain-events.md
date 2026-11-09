# Domain events

TARGET CONTRACT: domain events should capture meaning and support reaction without coupling aggregate internals across contexts. CURRENT: the runtime does not implement this event contract. DEFERRED: event publication and consumers are later implementation work.

## Identity events
- UserRegistered
- UserPasswordChanged
- PasswordResetRequested
- PasswordResetCompleted
- RoleAssigned
- RoleRemoved

## Catalog events
- ProductCreated
- ProductUpdated
- ProductPublished
- ProductArchived

## Pricing events
- PriceChanged

## Inventory events
- StockUpdated

## Cart events
- CartItemAdded
- CartItemRemoved
- CartQuantityUpdated
- CartCleared

## Order events
- CheckoutStarted
- OrderCreated
- OrderConfirmed
- OrderCancelled
- OrderStatusChanged
- OrderPaid
- OrderRefunded

## Payment events
- PaymentIntentCreated
- PaymentIntentSucceeded
- PaymentIntentFailed
- PaymentWebhookReceived
- PaymentLedgerAppended
- RefundInitiated
- RefundCompleted

## Fulfillment events
- ShipmentCreated
- ShipmentTracked
- ShipmentDelivered

## Review events
- ReviewSubmitted
- ReviewUpdated
- ReviewModerated

## Audit events
- SecurityEventRecorded
- AdminActionRecorded

## Event contract rules
- Events are immutable records of facts.
- Consumers must react to events but must not mutate source aggregates directly.
- Payment and checkout events require idempotent handling for duplicate deliveries.
- Audit events should be retained for accountability and investigation.
