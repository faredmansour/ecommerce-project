# Catalog domain model

CURRENT: the runtime has the additive Catalog Foundation described below. TARGET: the domain contracts in this document. DEFERRED: variants, SKUs, attributes, advanced media, and Pricing/Inventory authority.

## Product

### Payload contract

The target Product aggregate contains the canonical definition and discoverability metadata, not the live commercial state.

| Field | Type | Owner | Required | Notes |
| --- | --- | --- | --- | --- |
| productId | string | Catalog | Yes | Canonical aggregate ID |
| slug | string | Catalog | Yes | Unique, URL-safe |
| name | string | Catalog | Yes | Canonical display label |
| shortDescription | string | Catalog | No | Short summary |
| longDescription | string | Catalog | No | Detailed product description |
| status | enum | Catalog | Yes | draft, active, inactive, archived |
| publicationState | enum | Catalog | Yes | unpublished, published, hidden |
| brandId | ObjectId | Catalog | No | Brand reference |
| categoryIds | ObjectId[] | Catalog | Yes | category references |
| productType | string | Catalog | No | family or type |
| productFamily | string | Catalog | No | merchandising grouping |
| primaryImageId | string | Catalog | No | media reference |
| seoTitle | string | Catalog | No | SEO support |
| metaDescription | string | Catalog | No | SEO support |
| createdAt | Date | Catalog | Yes | domain creation |
| updatedAt | Date | Catalog | Yes | domain update |
| publishedAt | Date | Catalog | No | publication timestamp |
| unpublishedAt | Date | Catalog | No | hidden timestamp |

### Current state

The current Foundation Product record in [backend/models/productModel.js](../../backend/models/productModel.js) retains the legacy fields:

- name
- description
- price
- category
- image
- stock
- rating
- reviews_count
- createdAt

It also has additive Foundation fields: slug, canonicalName, status, publicationState, shortDescription, longDescription, highlights, categoryIds, brandId, primaryImageId, and updatedAt. `price` and `stock` are compatibility fields only, not target Pricing/Inventory authority. The runtime document is not yet the full Catalog V2 aggregate.

## ProductVariant

### Purpose

ProductVariant represents a sellable variation of a product. Variants are created by variant-defining attributes.

| Field | Type | Owner | Required | Notes |
| --- | --- | --- | --- | --- |
| variantId | string | Catalog | Yes | unique variant identity |
| productId | string | Catalog | Yes | parent product |
| sku | string | Catalog | Yes | unique sellable identifier |
| attributes | AttributeValue[] | Catalog | Yes | variant-defining attributes |
| optionGroups | OptionGroup[] | Catalog | No | same as attributes for UI |
| barcode | string | Catalog | No | GTIN/UPC if applicable |
| status | enum | Catalog | Yes | active, inactive, archived |
| mediaIds | string[] | Catalog | No | variant-specific media |
| specificationValues | object | Catalog | No | variant-specific specs |
| createdAt | Date | Catalog | Yes | |
| updatedAt | Date | Catalog | Yes | |

## SKU

### Recommended representation

A SKU is the sellable identity used in order snapshots, inventory, and downstream fulfillment. It may be represented in one of two controlled ways:

1. A field on ProductVariant: practical for a simpler implementation
2. A dedicated SKU aggregate: more robust long-term, especially if seller or marketplace complexity appears

### Architectural recommendation

For this repository, a field on ProductVariant is the least-complex and most compatible option. It keeps the product family and sellable identity aligned while avoiding a premature separate aggregate. This is still future work and should not be implemented in the current runtime.

## Category

### Target category model

| Field | Type | Owner | Required | Notes |
| --- | --- | --- | --- | --- |
| categoryId | string | Catalog | Yes | canonical ID |
| name | string | Catalog | Yes | category display name |
| slug | string | Catalog | Yes | unique URL-safe node |
| parentCategoryId | ObjectId | Catalog | No | parent relation |
| description | string | Catalog | No | descriptive text |
| imageId | string | Catalog | No | media reference |
| path | string[] | Catalog | No | ancestor path for fast tree queries |
| displayOrder | number | Catalog | No | ordering |
| status | enum | Catalog | Yes | active/inactive/archived |
| createdAt | Date | Catalog | Yes | |
| updatedAt | Date | Catalog | Yes | |

### Current state

The current Category record supports slug, parentCategoryId, lifecycle status, displayOrder, imageId, and timestamps. It does not yet provide a materialized path or category-tree read model.

## Brand

### Recommended target

Brand should be a first-class entity, not embedded in a product record. A separate Brand aggregate is the cleanest production model.

| Field | Type | Owner | Required | Notes |
| --- | --- | --- | --- | --- |
| brandId | string | Catalog | Yes | |
| name | string | Catalog | Yes | |
| slug | string | Catalog | Yes | unique |
| logoId | string | Catalog | No | media reference |
| description | string | Catalog | No | |
| status | enum | Catalog | Yes | active, inactive, archived |
| createdAt | Date | Catalog | Yes | |
| updatedAt | Date | Catalog | Yes | |

### Why separate?

Brand participates in navigation, marketing, SEO, and future marketplace or seller logic. Keeping it as a separate aggregate improves reference integrity and future extension.

## Attribute model

### Attribute definition

Each attribute should be expressed as a typed, filterable definition and optionally bound to variants.

| Field | Type | Notes |
| --- | --- | --- |
| attributeKey | string | normalized system key |
| name | string | display label |
| valueType | enum | string, number, boolean, enum, array |
| unit | string | optional |
| filterable | boolean | used in search/filter |
| searchable | boolean | indexing support |
| variantDefining | boolean | may create distinct variant |
| displayOrder | number | sorting |

### Attribute value

| Field | Type | Notes |
| --- | --- | --- |
| attributeKey | string | reference to definition |
| value | mixed | normalized value |
| unit | string | optional |
| displayLabel | string | friendly label |

### Differentiation

- Variant-defining: Color = Black, Size = M
- Descriptive/specification: Screen Size = 15.6 inches, Weight = 1.2 kg

## Media metadata

Catalog should not own raw upload logic or binary object storage. It should only own metadata references.

| Field | Type | Notes |
| --- | --- | --- |
| mediaId | string | stable reference |
| url | string | asset URL |
| mediaType | enum | image, video, document |
| altText | string | accessibility |
| ordering | number | gallery order |
| isPrimary | boolean | first visual asset |
| variantId | string | optional variant-specific association |
| metadata | object | provider info, width, height |

## Lifecycle and publication

Target lifecycle states:

- draft
- active
- inactive
- archived

Publication states:

- unpublished
- published
- hidden

### Important invariant

Catalog existence and storefront visibility are separate concerns. A catalog record may exist while not being visible to customers. Historical orders must remain unaffected when a product is unpublished or archived.

## Product publication rules

- Draft is internal and not customer-visible
- Active means product exists in catalog and can be discovered if publication permits
- Inactive means not publicly visible but still present in catalog
- Archived means historical and not usually surfaced, but not deleted from the system if domain retention requires it

## Public navigation visibility

- Public Product reads require `status=active` and `publicationState=published`.
- Public Category navigation exposes only `status=active` categories.
- Public Brand navigation and filtering expose only `status=active` brands.
- CURRENT: the runtime currently applies the Product rule but its Category and Brand public reads include inactive/archived records.
- DEFERRED: align Category and Brand runtime reads with the target rule in a later implementation change.

Product removal uses archive/hide semantics to preserve identity and references. Category and Brand removal likewise archives/deactivates records rather than physically deleting referenced entities.

## Product agnostic vs commercial rules

The Catalog aggregate may expose base merchandising data, but it is not allowed to own the server-authoritative final value for checkout. This remains a Pricing responsibility.
