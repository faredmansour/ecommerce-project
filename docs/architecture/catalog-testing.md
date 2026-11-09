# Catalog testing strategy

## Scope

This document defines both CURRENT Foundation coverage and the target testing contract for future Catalog V2 work.

## Current Foundation coverage

The runtime suite covers slug normalization/generation/collision/stability, Product lifecycle and publication visibility, legacy Product reads and fields, category references and hierarchy cycles, Brand creation/reference/conflicts, admin-only mutations, and archive behavior. Variants, SKUs, attributes, and Pricing/Inventory authority tests remain deferred with those implementations.

## Unit tests

- product validation rules
- slug generation and normalization
- SKU validation and uniqueness
- variant rules and attribute consistency
- lifecycle transition validation
- category hierarchy constraints
- brand validation
- media metadata validation

## Integration tests

- product create/read/update flows
- category tree queries
- brand persistence
- search results and filter boundaries
- pagination and stable sort behavior
- admin authorization checks
- publication gating

## Security tests

- unauthorized admin create/update attempts
- customer cannot access admin-only routes
- invalid ObjectId rejection
- mass assignment protection
- regex abuse on search behavior
- excessive pagination bounds
- nested payload validation edge cases
- content sanitization and upload authorization boundaries

## Compatibility tests

- historical order snapshots remain immutable
- legacy product IDs map correctly during migration
- legacy category references still resolve to a compatibility adapter
- carts and wishlist records remain valid after product or category changes
- product unpublish/archive does not rewrite past order detail

## Contract requirement

The testing strategy must protect the separation between Catalog definition and Pricing/Inventory/Orders. Any product-level test that uses live commercial price or stock values as authoritative is invalid for Catalog V2.
