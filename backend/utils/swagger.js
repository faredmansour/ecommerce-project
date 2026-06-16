const swaggerJsdoc = require("swagger-jsdoc");

// Hand-authored OpenAPI 3 definition. Kept centralized (rather than scattered
// JSDoc) so the full API surface is documented in one place.
const definition = {
  openapi: "3.0.3",
  info: {
    title: "Alfredo E-Commerce API",
    version: "1.0.0",
    description:
      "REST API for the Alfredo e-commerce platform. Auth with JWT + refresh tokens, products, categories, cart, wishlist, orders, payments (Stripe), reviews, coupons and addresses.",
  },
  servers: [
    { url: "http://localhost:8000", description: "Local development" },
    { url: "{baseUrl}", description: "Custom", variables: { baseUrl: { default: "http://localhost:8000" } } },
  ],
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Products" },
    { name: "Categories" },
    { name: "Cart" },
    { name: "Wishlist" },
    { name: "Orders" },
    { name: "Addresses" },
    { name: "Coupons" },
    { name: "Payments" },
    { name: "Upload" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          status: { type: "string", example: "fail" },
          message: { type: "string" },
        },
      },
      Credentials: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "user@example.com" },
          password: { type: "string", example: "Passw0rd!" },
        },
      },
      RegisterInput: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", example: "Jane Doe" },
          email: { type: "string", format: "email" },
          password: { type: "string", description: "8+ chars, upper, lower, number, special" },
          role: { type: "string", enum: ["user", "admin"], default: "user" },
        },
      },
      Product: {
        type: "object",
        properties: {
          _id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          price: { type: "number" },
          category: { type: "string" },
          image: { type: "string" },
          stock: { type: "integer" },
          rating: { type: "number" },
          reviews_count: { type: "integer" },
        },
      },
      ProductInput: {
        type: "object",
        required: ["name", "price", "category"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          price: { type: "number" },
          category: { type: "string", description: "Category ObjectId" },
          stock: { type: "integer" },
          image: { type: "string", format: "binary" },
        },
      },
      CategoryInput: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
        },
      },
      CartItemInput: {
        type: "object",
        required: ["product_id", "name", "price"],
        properties: {
          product_id: { type: "string" },
          name: { type: "string" },
          price: { type: "number" },
          quantity: { type: "integer", default: 1 },
          image: { type: "string" },
          category: { type: "string" },
        },
      },
      WishlistItemInput: {
        type: "object",
        required: ["product_id", "name"],
        properties: {
          product_id: { type: "string" },
          name: { type: "string" },
          image: { type: "string" },
          category: { type: "string" },
        },
      },
      OrderInput: {
        type: "object",
        required: ["items", "shippingAddress", "totalAmount"],
        properties: {
          items: { type: "array", items: { $ref: "#/components/schemas/CartItemInput" } },
          shippingAddress: { $ref: "#/components/schemas/AddressInput" },
          couponCode: { type: "string" },
          paymentMethod: { type: "string", enum: ["card", "cod", "stripe"] },
          totalAmount: { type: "number" },
        },
      },
      AddressInput: {
        type: "object",
        required: ["fullName", "phone", "line1", "city", "country"],
        properties: {
          label: { type: "string" },
          fullName: { type: "string" },
          phone: { type: "string" },
          line1: { type: "string" },
          line2: { type: "string" },
          city: { type: "string" },
          state: { type: "string" },
          postalCode: { type: "string" },
          country: { type: "string" },
          isDefault: { type: "boolean" },
        },
      },
      ReviewInput: {
        type: "object",
        required: ["rating"],
        properties: {
          rating: { type: "integer", minimum: 1, maximum: 5 },
          title: { type: "string" },
          comment: { type: "string" },
        },
      },
    },
  },
  security: [],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        summary: "Liveness/readiness probe",
        responses: { 200: { description: "Service is healthy" } },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new user",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterInput" } } } },
        responses: { 201: { description: "Created" }, 400: { description: "Validation error" } },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Log in and receive access + refresh tokens",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/Credentials" } } } },
        responses: { 200: { description: "OK" }, 401: { description: "Invalid credentials" } },
      },
    },
    "/api/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Exchange a refresh token for a new access token",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } } } } },
        responses: { 200: { description: "OK" }, 401: { description: "Invalid/expired token" } },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Revoke a refresh token",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } } } } },
        responses: { 200: { description: "Logged out" } },
      },
    },
    "/api/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Request a password reset email",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } } } } },
        responses: { 200: { description: "Email sent if account exists" } },
      },
    },
    "/api/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Reset password using a token",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token", "password"], properties: { token: { type: "string" }, password: { type: "string" } } } } } },
        responses: { 200: { description: "Password updated" }, 400: { description: "Invalid token" } },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get the current authenticated user",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "OK" }, 401: { description: "Unauthorized" } },
      },
    },
    "/api/products": {
      get: {
        tags: ["Products"],
        summary: "List products (pagination, search, sort, filter)",
        parameters: [
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "search", in: "query", schema: { type: "string" } },
          { name: "sort", in: "query", schema: { type: "string", enum: ["price-asc", "price-desc", "rating", "name", "latest"] } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 12 } },
        ],
        responses: { 200: { description: "Paginated product list" } },
      },
      post: {
        tags: ["Products"],
        summary: "Create a product (admin)",
        security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { "multipart/form-data": { schema: { $ref: "#/components/schemas/ProductInput" } } } },
        responses: { 201: { description: "Created" }, 400: { description: "Validation error" }, 403: { description: "Forbidden" } },
      },
    },
    "/api/products/{id}": {
      get: { tags: ["Products"], summary: "Get a product by id", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK" }, 404: { description: "Not found" } } },
      put: {
        tags: ["Products"],
        summary: "Update a product (admin)",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { content: { "multipart/form-data": { schema: { $ref: "#/components/schemas/ProductInput" } } } },
        responses: { 200: { description: "Updated" }, 404: { description: "Not found" } },
      },
      delete: { tags: ["Products"], summary: "Delete a product (admin)", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Deleted" } } },
    },
    "/api/products/{id}/reviews": {
      get: { tags: ["Products"], summary: "List reviews for a product", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK" } } },
      post: {
        tags: ["Products"],
        summary: "Submit a review",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ReviewInput" } } } },
        responses: { 201: { description: "Created" }, 400: { description: "Already reviewed / invalid" } },
      },
    },
    "/api/categories": {
      get: { tags: ["Categories"], summary: "List categories", responses: { 200: { description: "OK" } } },
      post: { tags: ["Categories"], summary: "Create category (admin)", security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CategoryInput" } } } }, responses: { 201: { description: "Created" } } },
    },
    "/api/categories/{id}": {
      get: { tags: ["Categories"], summary: "Get category by id", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK" }, 404: { description: "Not found" } } },
      put: { tags: ["Categories"], summary: "Update category (admin)", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/CategoryInput" } } } }, responses: { 200: { description: "Updated" } } },
      delete: { tags: ["Categories"], summary: "Delete category (admin)", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "Deleted" } } },
    },
    "/api/cart": {
      get: { tags: ["Cart"], summary: "Get current user's cart", security: [{ bearerAuth: [] }], responses: { 200: { description: "OK" } } },
      post: { tags: ["Cart"], summary: "Add item to cart", security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CartItemInput" } } } }, responses: { 200: { description: "OK" } } },
    },
    "/api/cart/{id}": {
      patch: { tags: ["Cart"], summary: "Update cart item quantity", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["quantity"], properties: { quantity: { type: "integer", minimum: 1 } } } } } }, responses: { 200: { description: "OK" } } },
      delete: { tags: ["Cart"], summary: "Remove cart item", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK" } } },
    },
    "/api/wishlist": {
      get: { tags: ["Wishlist"], summary: "Get wishlist", security: [{ bearerAuth: [] }], responses: { 200: { description: "OK" } } },
      post: { tags: ["Wishlist"], summary: "Add item to wishlist", security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/WishlistItemInput" } } } }, responses: { 200: { description: "OK" } } },
    },
    "/api/wishlist/{productId}": {
      delete: { tags: ["Wishlist"], summary: "Remove wishlist item", security: [{ bearerAuth: [] }], parameters: [{ name: "productId", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK" } } },
    },
    "/api/orders": {
      get: { tags: ["Orders"], summary: "List orders (own, or all for admin)", security: [{ bearerAuth: [] }], responses: { 200: { description: "OK" } } },
      post: { tags: ["Orders"], summary: "Create an order", security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/OrderInput" } } } }, responses: { 201: { description: "Created" } } },
    },
    "/api/orders/{id}": {
      get: { tags: ["Orders"], summary: "Get order by id", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK" }, 403: { description: "Forbidden" } } },
    },
    "/api/orders/{id}/status": {
      patch: { tags: ["Orders"], summary: "Update order status (admin)", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["pending", "shipped", "delivered"] } } } } } }, responses: { 200: { description: "OK" } } },
    },
    "/api/addresses": {
      get: { tags: ["Addresses"], summary: "List addresses", security: [{ bearerAuth: [] }], responses: { 200: { description: "OK" } } },
      post: { tags: ["Addresses"], summary: "Create address", security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/AddressInput" } } } }, responses: { 201: { description: "Created" } } },
    },
    "/api/addresses/{id}": {
      put: { tags: ["Addresses"], summary: "Update address", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/AddressInput" } } } }, responses: { 200: { description: "OK" } } },
      delete: { tags: ["Addresses"], summary: "Delete address", security: [{ bearerAuth: [] }], parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: { description: "OK" } } },
    },
    "/api/coupons/apply": {
      post: { tags: ["Coupons"], summary: "Validate a coupon code", security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["code"], properties: { code: { type: "string" } } } } } }, responses: { 200: { description: "Valid" }, 404: { description: "Not found / expired" } } },
    },
    "/api/payments/intent": {
      post: { tags: ["Payments"], summary: "Create a Stripe payment intent", security: [{ bearerAuth: [] }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["amount"], properties: { amount: { type: "number" }, currency: { type: "string", default: "usd" } } } } } }, responses: { 200: { description: "clientSecret returned" } } },
    },
    "/api/upload": {
      post: { tags: ["Upload"], summary: "Upload an image", requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", properties: { image: { type: "string", format: "binary" } } } } } }, responses: { 200: { description: "Uploaded" } } },
    },
  },
};

const swaggerSpec = swaggerJsdoc({ definition, apis: [] });

module.exports = swaggerSpec;
