# Catalog API contracts

## Current API discovery

The currently implemented routes are in [backend/routers/productRouter.js](../../backend/routers/productRouter.js) and [backend/routers/categoryRouter.js](../../backend/routers/categoryRouter.js):

### Current product endpoints

- GET /api/products
- GET /api/products/:id
- POST /api/products
- PUT /api/products/:id
- DELETE /api/products/:id
- GET /api/products/:id/reviews
- POST /api/products/:id/reviews

### Current category endpoints

- GET /api/categories
- GET /api/categories/:id
- POST /api/categories
- PUT /api/categories/:id
- DELETE /api/categories/:id

### Current Brand endpoints

- GET /api/brands
- GET /api/brands/:id
- POST /api/brands
- PUT /api/brands/:id
- DELETE /api/brands/:id

### Current runtime characteristics

- Product listing and ID reads are public and support category/search filters; Product reads require active status and published publication state, with compatibility handling for legacy documents missing those fields.
- Product create/update/delete are admin-only.
- Validation is schema-checked with Joi.
- Product and Category slugs and Category parent references exist, but no slug lookup endpoint or category-tree endpoint exists.
- No variant endpoint exists in the current runtime.
- Brand has basic public reads and admin CRUD routes.
- Current Category and Brand public reads include inactive/archived records; target public navigation must filter to active records.
- Product, Category, and Brand DELETE compatibility routes archive/deactivate rather than physically deleting referenced records.

## Target API contract

### Products

| Operation | Method | Path | Role | Notes |
| --- | --- | --- | --- | --- |
| List products | GET | /api/catalog/products | Public | pagination + filters |
| Get by id | GET | /api/catalog/products/:productId | Public | details view |
| Get by slug | GET | /api/catalog/products/slug/:slug | Public | SEO/UI lookup |
| Create | POST | /api/catalog/products | Admin | create product definition |
| Update | PATCH | /api/catalog/products/:productId | Admin | partial update |
| Publish | POST | /api/catalog/products/:productId/publish | Admin | set published state |
| Unpublish | POST | /api/catalog/products/:productId/unpublish | Admin | hide from storefront |
| Archive | POST | /api/catalog/products/:productId/archive | Admin | archive lifecycle |
| Restore | POST | /api/catalog/products/:productId/restore | Admin | if archived |
| Create variant | POST | /api/catalog/products/:productId/variants | Admin | create variant |
| Update variant | PATCH | /api/catalog/products/:productId/variants/:variantId | Admin | variant maintenance |

### Categories

| Operation | Method | Path | Role | Notes |
| --- | --- | --- | --- | --- |
| List categories | GET | /api/catalog/categories | Public | category tree or flat list |
| Get category | GET | /api/catalog/categories/:categoryId | Public | details |
| Get hierarchy | GET | /api/catalog/categories/tree | Public | tree view |
| Create | POST | /api/catalog/categories | Admin | category creation |
| Update | PATCH | /api/catalog/categories/:categoryId | Admin | category metadata |
| Activate | POST | /api/catalog/categories/:categoryId/activate | Admin | allow visibility |
| Deactivate | POST | /api/catalog/categories/:categoryId/deactivate | Admin | hide from browse |

### Brands

| Operation | Method | Path | Role | Notes |
| --- | --- | --- | --- | --- |
| List brands | GET | /api/catalog/brands | Public | storefront browsing |
| Get brand | GET | /api/catalog/brands/:brandId | Public | brand details |
| Create brand | POST | /api/catalog/brands | Admin | first-class entity |
| Update brand | PATCH | /api/catalog/brands/:brandId | Admin | metadata update |

## DTO boundaries

Persistence-layer documents and API DTOs must be kept separate.

CURRENT compatibility: Product persistence/API responses may still contain legacy `price` and `stock`. They are not authoritative future pricing or inventory values. TARGET DTOs may expose a price summary only when it is supplied by Pricing, and availability only when supplied by Inventory.

### ProductListItem

- productId
- slug
- name
- brandName
- categoryNames
- primaryImageUrl
- status
- publicationState
- priceSummary or pricing reference only if explicitly provided by Pricing

### ProductDetails

- productId
- slug
- name
- brand
- category tree
- shortDescription
- longDescription
- highlights
- attributes
- variants
- media
- seo metadata
- publication state
- lifecycle state

### ProductAdminView

- all ProductDetails data
- audit metadata
- creator/editor user refs
- internal status flags
- validation warnings

### ProductVariant

- variantId
- sku
- option summary
- status
- media list
- specification values

### CategoryView

- categoryId
- slug
- name
- parentCategoryId
- depth
- status
- children

### BrandView

- brandId
- name
- slug
- logo
- description
- status

## Validation requirements

Server-authoritative validation must check:

- slug format and uniqueness
- category relationship validity
- brand existence
- ObjectId validity
- attribute payload integrity
- variant attribute consistency
- array length and nested object boundaries
- publication/lifecycle transition rules

## Public visibility contract

- Products: `status=active` and `publicationState=published`.
- Categories used in public navigation: `status=active` only.
- Brands used in public navigation or filtering: `status=active` only.
- CURRENT: Category/Brand runtime reads have not yet been filtered by status; this is a known difference from the target contract.
- DEFERRED: apply active-only Category/Brand read filtering without removing admin access to inactive or archived records.

## Authorization rules

- public reads: customer and guest allowed
- admin writes: admin role only
- product or category mutation cannot happen through customer-facing routes
- all admin operations must preserve RBAC from Phase 2

## Error model

The target API should continue to use structured API errors with:

- code
- message
- field errors when the payload is invalid
- correlationId for tracing

## Idempotency rules

- create operations must not be retried without unique idempotency keys for external clients
- publish and archive transitions must use state transition guards
- duplicate variant creation with equivalent attributes must either fail or be deduplicated by domain rule

## Compatibility with current runtime

The current runtime exposes the legacy `/api/products`, `/api/categories`, and `/api/brands` routes, not the fully separated `/api/catalog/*` target API. Target DTO separation, route versioning, and richer workflows remain deferred; this contract does not authorize Product.price or Product.stock as future commercial authority.
