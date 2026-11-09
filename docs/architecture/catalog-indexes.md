# Catalog index design

## Current state

The current Foundation schemas declare unique sparse Product and Category slug indexes, a unique Brand slug index, Product brand/category/lifecycle/publication/timestamp indexes, Category parent/status indexes, and a Brand status index. These are Mongoose schema declarations; production database index creation/synchronization must still be verified operationally. Variant SKU/barcode and category path indexes are not implemented.

## Required target index design

### Product indexes

| Index | Fields | Unique | Purpose |
| --- | --- | --- | --- |
| product_slug | slug | Yes | resolve by URL-safe slug |
| product_brand_status | brandId, status | No | brand browse and active filtering |
| product_category_status | categoryIds, status | No | catalog browse |
| product_status_published | status, publicationState | No | storefront visibility |
| product_created_at | createdAt | No | latest-first queries |
| product_updated_at | updatedAt | No | admin list sort |
| product_slug_brand | slug, brandId | Future scoped option | Consider only if seller/store scoping is introduced; the current single-store schema has a globally unique slug |

### Variant indexes

| Index | Fields | Unique | Purpose |
| --- | --- | --- | --- |
| variant_product_status | productId, status | No | product variant listing |
| variant_sku | sku | Yes | order and inventory matching |
| variant_barcode | barcode | Partial unique if present | GTIN lookups |

### Category indexes

| Index | Fields | Unique | Purpose |
| --- | --- | --- | --- |
| category_slug | slug | Yes | canonical lookup |
| category_parent | parentCategoryId | No | hierarchy traversal |
| category_status | status | No | admin and browse filtering |
| category_path | path | No | tree queries |

### Brand indexes

| Index | Fields | Unique | Purpose |
| --- | --- | --- | --- |
| brand_slug | slug | Yes | lookup |
| brand_status | status | No | active brand filtering |

## Query support and cardinality notes

- slug indexes are high-cardinality and ideal for direct lookup.
- status + publicationState compound indexes reduce the full-scan cost of storefront queries.
- category/status indexes support browse filtering while keeping the query bounded.
- variant_sku is critical because the inventory and order layers will likely refer to a sellable SKU identity.
- path and parentCategoryId indexes support category domination and tree traversal without recursive logic in the application layer.

## Important design constraint

CURRENT: Foundation index declarations are present in the Mongoose schemas. TARGET: retain the required lookup/query indexes and add scoped/variant indexes only when their owning domains are implemented. DEFERRED: production index rollout verification, variant indexes, and category path indexing.
