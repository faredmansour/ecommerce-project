# ADR 003: Use a ledger-first model for financial state

## Status
Accepted

## Context
Payment flows depend on correctness, replay safety, webhooks, and refund/reconciliation handling. A mutable status field alone is insufficiently safe.

## Decision
The payment domain must maintain an append-only ledger and treat financial state as a series of validated events and transitions rather than ad hoc updates.

## Why
- prevents duplicate or out-of-order processing
- provides auditability for financial actions
- supports refunds, disputes, and reconciliation in a controlled way
- preserves the security baseline and future provider abstraction

## Consequences
Positive:
- easier debugging and reconciliation
- stronger accountability and audit trails
- safer provider webhook processing

Negative:
- more storage and event model complexity
- requires discipline in event semantics

## Alternatives considered
- single mutable payment record only
- order status copy as the financial source of truth
- no durable ledger history

## Decision rationale
A ledger is the correct contract for money handling in an e-commerce system.
