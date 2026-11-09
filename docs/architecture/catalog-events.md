# Catalog events

## Event boundary

TARGET CONTRACT: Catalog emits lifecycle and content events. CURRENT: the runtime does not implement domain-event publication or an event bus. DEFERRED: event persistence/publication and consumers; this document specifies the future event contracts only.

## Event schema

Each event should contain:

- eventId
- eventName
- aggregateId
- aggregateType
- correlationId
- causationId
- timestamp
- schemaVersion
- payload
- producer
- consumers

## Proposed events

### ProductCreated

- aggregateType: Product
- payload: productId, slug, brandId, categoryIds, status, publicationState

### ProductUpdated

- aggregateType: Product
- payload: changedFields, previousValues summary if safe

### ProductPublished

- aggregateType: Product
- payload: productId, publishedAt, storefront visibility

### ProductUnpublished

- aggregateType: Product
- payload: productId, unpublishedAt, storefront visibility

### ProductArchived

- aggregateType: Product
- payload: productId, archivedAt, reason

### ProductRestored

- aggregateType: Product
- payload: productId, restoredAt

### VariantCreated

- aggregateType: ProductVariant
- payload: variantId, productId, sku, attributeValues

### VariantUpdated

- aggregateType: ProductVariant
- payload: variantId, changedFields

### CategoryCreated

- aggregateType: Category
- payload: categoryId, slug, parentCategoryId

### CategoryUpdated

- aggregateType: Category
- payload: categoryId, changedFields

### CategoryArchived

- aggregateType: Category
- payload: categoryId, archive reason

### BrandCreated

- aggregateType: Brand
- payload: brandId, slug, name

### BrandUpdated

- aggregateType: Brand
- payload: brandId, changedFields

## Idempotency requirements

- Event publishers must detect duplicate delivery by event ID or dedupe key
- Consumers must process events exactly-once or at least once with idempotent write semantics
- A product lifecycle transition should not emit repeated events for the same effective state change

## Consumer responsibilities

- Search/read models may be re-indexed after ProductUpdated or ProductPublished
- Pricing may react to product definition changes if it uses a product reference model
- Orders must not re-read live catalog data for historical order truth

## Architecture note

This is the target contract only. No event bus, event table, or event middleware is implemented in the current repository.
