# Catalog V2 contract

## Purpose

This document distinguishes the current Catalog Foundation runtime from the target Catalog V2 contract and deferred implementation. The Foundation runtime implements additive identity, slug, lifecycle/publication, category hierarchy, and Brand fields; it does not implement the full Catalog V2 model, Checkout-integrated Pricing authority, or Inventory authority.

## Decision boundary

Catalog is the authoritative owner of product definition, identity, metadata, classification, media references, lifecycle, and discovery state.

Catalog does not own:

- pricing and current commercial amount
- inventory quantity, reservation, release, and stock movements
- cart state
- order history
- payment authorization or settlement
- shipping execution
- coupon promotion evaluation
- checkout orchestration

## Current-state audit

### Current repository reality

The live product model is a single Mongo document exposed in [backend/models/productModel.js](../../backend/models/productModel.js):

- name: String, required
- description: String, required
- price: Number, required, min 0
- category: ObjectId ref to Categories, required
- image: String, nullable
- stock: Number, default 0, min 0
- rating: Number, default 0, min 0, max 5
- reviews_count: Number, default 0
- createdAt / updatedAt: Date
- Foundation additions: slug, canonicalName, status, publicationState, shortDescription, longDescription, highlights, categoryIds, brandId, primaryImageId

`price` and `stock` are CURRENT/LEGACY COMPATIBILITY fields used by existing runtime flows. They are not target Pricing or Inventory authority.

The live category model in [backend/models/categoryModel.js](../../backend/models/categoryModel.js) supports Foundation slugs, parent references, lifecycle status, display order, image references, and timestamps, in addition to the legacy fields:

- name: String, required
- description: String, required
- createdAt: Date

The live lookup and search logic in [backend/controllers/productController.js](../../backend/controllers/productController.js) performs:

- category filter by ObjectId
- search by name and description with regex escaping
- sort by price, rating, name, latest
- page and limit validation
- cache key generation and invalidation

The live product API in [backend/routers/productRouter.js](../../backend/routers/productRouter.js) exposes public listing and ID reads plus admin create/update/delete routes. Product DELETE archives and hides rather than physically deleting. Validation is Joi-based and includes the Foundation fields. The live Brand model and `/api/brands` routes provide basic Brand CRUD. Category and Brand DELETE operations archive records.

Public Product reads require active status and published publication state; legacy records without the new fields remain readable. Current public Category and Brand reads still include inactive/archived records, unlike the target navigation contract below.

### Current state classification

| Area | Status | Notes |
| --- | --- | --- |
| Product identity | CURRENT FOUNDATION | Stable Mongo `_id` remains the product identity; slug and canonicalName are additive; variants are not modeled |
| Product definition | CURRENT FOUNDATION | Legacy Product document plus additive Catalog metadata |
| Category hierarchy | CURRENT FOUNDATION | Parent reference and category slug are implemented; no materialized path/tree read model |
| Brand | CURRENT FOUNDATION | First-class Brand model and basic routes are implemented |
| SKU | CURRENT | Not modeled explicitly; SKU is not a separate concern |
| Variants | CURRENT | Not modeled explicitly |
| Attributes | CURRENT | Not modeled explicitly |
| Media | CURRENT | Single string image field; no media metadata model |
| Price ownership | CURRENT / LEGACY | `Product.price` is present and used by legacy runtime flows; Pricing is the future authority |
| Inventory ownership | CURRENT / LEGACY | `Product.stock` is present for legacy compatibility; Inventory is the future authority |
| Search contract | CURRENT | name + description search and category filters only |
| Publication lifecycle | CURRENT FOUNDATION | Product lifecycle/publication fields and public Product gating are implemented; transition workflows remain basic |
| SEO metadata | CURRENT | Not modeled explicitly |

## Target Catalog V2 contract

### Product identity

A product in Catalog V2 is the canonical definition of a sellable offering. It must have:

- productId: canonical internal identifier
- slug: URL-safe, unique within store or seller scope
- canonicalName: display-safe product name
- productType: generic family classification
- brandId: reference to Brand
- categoryIds: one or more category references
- status: lifecycle state such as draft, active, inactive, archived
- publicationState: storefront visibility state such as unpublished, published, hidden

### Product content

The product record must separate definition content from commercial state:

- shortDescription
- longDescription
- highlights
- specifications
- attributes[]
- richContentMetadata
- seoTitle
- metaDescription

### Product media references

Catalog owns references to Files & Media assets, not raw upload processing or stored media assets. Product media references may include:

- mediaId
- url
- kind
- altText
- ordering
- isPrimary
- variantId or null
- metadata reference / storage provider info

### Product classification

The target model supports:

- department
- category
- subcategory
- parentCategoryId
- brandId
- productType
- productFamily

This supports future category depth without requiring premature marketplace complexity.

## Target domain boundary

The target architecture is a modular monolith with distinct bounded contexts:

- Catalog owns definition, identity, and publication
- Pricing owns current commercial price logic
- Inventory owns stock, reservations, and movements
- Orders own historical snapshot state
- Payments own provider and ledger state
- Fulfillment owns shipping/tracking state

Public navigation contract: Products require `status=active` and `publicationState=published`; Categories and Brands exposed in public navigation/filtering require `status=active`. Inactive and archived Category/Brand records remain available to authorized administration, not public navigation.

## Product v Variant v SKU

Catalog V2 must explicitly define:

- Product: canonical catalog definition and family
- ProductVariant: a concrete variant of the product, created by variant-defining attributes
- SKU: a unique sellable identity for a variant or base product; may be represented as a field on a variant or as a separate SKU entity depending on implementation.

### Recommended pattern

Use a hybrid model:

- Product is the family and definition
- ProductVariant is the actual variant record and holds variant attributes
- SKU is the sellable identifier for an orderable variant

This is the safest path for future Inventory V2 because inventory is attached to the sellable variant/SKU, not to the generic product definition.

## Key architectural rule

The Product record must never become the place where the live availability and authoritative commercial price are stored. Catalog can expose merchandising metadata and references, but the authoritative shopping value must be computed elsewhere.

CURRENT: `Product.price` and `Product.stock` remain compatibility fields in the runtime. TARGET: Pricing owns price authority and Inventory owns availability. DEFERRED: pricing/inventory engines and migration of legacy consumers.

## Gap summary

The current repository is operationally functional but not yet aligned with Catalog V2. The largest gaps are:

- no product family model
- no variant model
- no SKU model or SKU ownership boundary
- no attribute metadata system
- no Inventory authority service or Checkout integration with the Phase 5 Pricing resolver; no ownership-aware compatibility adapters
- no product image metadata model
- no first-class SEO metadata domain
- no runtime domain-event publication for catalog state changes

## Implementation phase

The Foundation runtime is additive and compatibility-focused. Variants, SKUs, attributes, advanced media/SEO metadata, event infrastructure, Checkout-integrated Pricing authority, Inventory authority, and full Catalog DTO/API separation remain deferred. The Phase 5 Pricing resolver and quote/admin foundation exist, but legacy Cart/Order/Payment flows are not yet integrated with them.
