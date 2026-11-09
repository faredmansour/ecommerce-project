# ADR 001: Use a modular monolith rather than a microservice split

## Status
Accepted

## Context
The project is currently a single deployable backend and frontend in one repository with a MongoDB data store. It has clear domains such as auth, catalog, cart, and orders, and an existing security baseline that must be preserved. The goal is to support future growth without introducing unnecessary distributed complexity.

## Decision
Keep a single deployable modular monolith and enforce bounded contexts with explicit aggregate contracts and application-service boundaries.

## Why
- It matches the current codebase and deployment model.
- It avoids unnecessary latency and operational complexity.
- It allows future extraction of modules only when business scale or team ownership makes it necessary.
- It preserves the existing security model and simplifies future contract review.

## Consequences
Positive:
- simpler deployment and operations
- easier code ownership and local transactions
- lower migration risk

Negative:
- less isolation for high-volume components in the future
- future extraction from monolith requires deliberate refactoring

## Alternatives considered
- full microservice split
- service-oriented partial decomposition without clear boundaries
- keeping everything in one unstructured app layer

## Decision rationale
A modular monolith is the right architecture for the project’s current reality and the required future growth path.
