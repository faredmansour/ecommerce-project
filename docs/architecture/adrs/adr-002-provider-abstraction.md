# ADR 002: Abstract the payment provider behind a port

## Status
Accepted

## Context
The backend currently contains a Stripe integration prototype. The business requires a future payment provider abstraction, and the project must remain provider-agnostic in the domain model.

## Decision
Payment provider integrations are isolated behind a provider interface and are never referenced directly from the order or checkout domain logic.

## Why
- provider API changes become contained within an adapter
- the domain model remains clean and testable
- the project can support Stripe or another processor later without altering domain contracts
- this is required by the architecture and security baseline

## Consequences
Positive:
- stable domain contract for payments
- easier testing and provider swap-out
- better idempotency and webhook control

Negative:
- introduces an abstraction layer that must be maintained
- requires strict contract design and provider mapping rules

## Alternatives considered
- direct Stripe calls in the controller layer
- highly coupled order/payments integration
- provider logic embedded in the app service layer

## Decision rationale
Financial flows are sensitive enough to require a stable boundary. Hidden provider specifics are mandatory.
