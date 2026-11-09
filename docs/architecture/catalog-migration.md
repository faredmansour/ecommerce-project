# Catalog migration strategy

## Goal

Move the repository from its current simple product/category model to the Catalog V2 domain contract without breaking existing orders, carts, wishlist records, reviews, category references, or product identities.

## Legacy compatibility phase

### Current live fields

The existing product model includes:

- _id
- name
- description
- price
- category
- image
- stock
- rating
- reviews_count
- createdAt

This data is still valid as a compatibility baseline during the migration.

CURRENT: `Product.price` is a legacy numeric compatibility field used by current runtime flows; `Product.stock` is likewise a legacy compatibility field. TARGET: Pricing owns commercial price authority and Inventory owns stock/availability authority. DEFERRED: migrate consumers before freezing or removing either field. Neither field may become future checkout/payment or inventory-reservation authority.

### Compatibility rules

1. Keep existing product IDs stable.
2. Preserve category references as legacy references until the new category tree is introduced.
3. Preserve media URLs until a media metadata map is introduced.
4. Do not rewrite existing order snapshots or historical order documents.
5. Do not delete legacy product records while the migration is in progress.

## Data migration plan

### Stage 1 — map current documents to target fields

- productId = existing _id
- slug = derive from name or create a deterministic legacy slug
- categoryIds = existing category reference
- brand = null for legacy records unless brand data is inserted separately
- publicationState = published if a legacy product is currently visible; otherwise unpublished or hidden according to the approved mapping
- status = active if the legacy product is treated as live
- product media = map the current image string into a media reference entry

### Stage 2 — create catalog metadata

- create attribute definitions for legacy fields when needed
- create a category tree structure from the flat category collection
- create a brand record only if a brand is known or later required
- create a product family entry if the product is part of a family pattern

### Stage 3 — dual-read compatibility

During the transition, the application can read from a compatibility adapter that:

- reads current product legacy fields
- maps to the target Product DTO
- keeps Catalog V2 authoritative for new writes

This dual-read adapter and V2-authoritative write cutover are TARGET/DEFERRED migration steps. The current Foundation runtime uses the existing Product document and adds fields without claiming Pricing or Inventory authority.

## Runtime cutover

DEFERRED IMPLEMENTATION: the following cutover sequence occurs only after Pricing and Inventory contracts are implemented.

Cutover should be staged and additive:

1. Catalog V2 definitions exist alongside legacy product model
2. New writes go to the V2 contract
3. Order snapshot compatibility remains unchanged
4. Legacy reads remain available until all consumers migrate
5. The old direct price and stock fields are frozen or isolated in the compatibility layer

## Cleanup

Cleanup should occur only after:

- all reads are migrated
- all writes are migrated
- inventory and pricing contracts are in place
- all references to legacy product price/stock are removed
- rollback plans are validated

## Rollback strategy

Rollback must be a revertible migration, not a destructive one.

- keep legacy product records until the cutover is proven stable
- keep mapping tables and compatibility adapters
- keep historical orders immutable
- if the new Catalog V2 contract fails, revert reads to the legacy model while preserving new write metadata in audit logs

## Critical no-go rules

- Never rewrite historical order snapshots
- Never mutate confirmed order totals because a product was renamed or unpublished
- Never delete the current product ID mapping without a reversible record
- Never merge live pricing or live inventory into Catalog V2 before the pricing and inventory bounded contexts are implemented
- Product, Category, and Brand removal must use archive/hide or deactivate semantics while references may exist; physical deletion is not the compatibility migration behavior
