# Frontend contract and API integration model

## Current frontend shape
The frontend currently has a central API service and context providers for authentication and cart state. This should remain the integration boundary, but the underlying contract should be clearer and more explicit.

CURRENT: the frontend consumes existing route-oriented responses. TARGET: it consumes stable domain DTOs. DEFERRED: typed/schema-validated per-domain adapters and migration to versioned DTOs.

## Target contract model
The frontend should depend on:
- typed or schema-validated request DTOs
- consistent error envelope handling
- auth/session state from identity context
- cart and checkout data from domain-oriented API responses
- payment status hydration from a payment-safe state contract

## Frontend responsibilities
- render customer flows for auth, products, cart, checkout, review, and order tracking
- consume API contracts rather than directly depend on internal model names
- map service responses to UI state without leaking backend storage details

## Backend boundaries the frontend should not depend on
- provider SDK objects
- provider internal states
- raw token storage semantics
- database collection or model names
- domain internals that are not part of the public contract

## Recommended front-end API adapter design
- use service modules per bounded context: auth, catalog, cart, order, payment, review
- central response normalization in the client layer
- keep auth token handling in one consistent interceptor
- ensure 401 handling remains globally consistent with the current security baseline

## Stability concerns
Because the frontend and backend are in a single repo but separate apps, contract drift is a risk. The architecture should require API contract review when any domain contract changes.

## Integration policy
- API contract changes should be versioned and documented.
- Frontend code should not rely on undocumented object shapes.
- Payment and auth flows require explicit contract review because they are higher risk than product browsing.
