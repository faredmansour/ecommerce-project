import axios from "axios";
import { expireLocalSession } from "../lib/authSession.js";

const API_URL =
  import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:8000");

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Expire an invalid local session. ProtectedRoute owns navigation so it can
// preserve the page the customer was trying to reach; public requests should
// never force a guest into the login flow.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      expireLocalSession();
    }
    return Promise.reject(error);
  }
);

// ─── Auth ────────────────────────────────────────────────────────────────────
// Backend returns: { message, token, user: { id, name, email, role } }
export const authAPI = {
  register: (name, email, password, returnTo) =>
    api.post("/api/auth/register", { name, email, password, returnTo }),

  login: (email, password) =>
    api.post("/api/auth/login", { email, password }),

  googleStart: (returnTo = "/") => api.post("/api/auth/google/start", { returnTo }),
  googleLinkStart: (returnTo = "/account") => api.post("/api/auth/google/link/start", { returnTo }),
  googleExchange: (code) => api.post("/api/auth/google/exchange", { code }),
  appleStart: (returnTo = "/") => api.post("/api/auth/apple/start", { returnTo }),
  appleLinkStart: (returnTo = "/account") => api.post("/api/auth/apple/link/start", { returnTo }),
  appleExchange: (code) => api.post("/api/auth/apple/exchange", { code }),

  getMe: () => api.get("/api/auth/me"),
  verifyEmail: (token) => api.post("/api/auth/verify-email", { token }),
  resendVerification: (email, returnTo) => api.post("/api/auth/resend-verification", { email, returnTo }),
  forgotPassword: (email) => api.post("/api/auth/forgot-password", { email }),
  resetPassword: (token, password) => api.post("/api/auth/reset-password", { token, password }),
};

// ─── Products ────────────────────────────────────────────────────────────────
// Backend returns: { success, count, products: [...] }
// We normalise so callers receive { data: [...] }
export const productsAPI = {
  getAll: (category, search, params = {}) =>
    api
      .get("/api/products", { params: { category, search, ...params } })
      .then((res) => ({ data: res.data.products ?? res.data })),

  getById: (id) =>
    api
      .get(`/api/products/${id}`)
      .then((res) => ({ data: res.data.product ?? res.data })),

  create: (productData) =>
    api.post("/api/products", productData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  update: (id, productData) =>
    api.put(`/api/products/${id}`, productData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  remove: (id) => api.delete(`/api/products/${id}`),
};

// ─── Categories ──────────────────────────────────────────────────────────────
// Backend returns: [ { _id, name, description, ... }, ... ]
// We normalise so callers receive { data: [ "name1", "name2", ... ] }
export const categoriesAPI = {
  getAll: () =>
    api
      .get("/api/categories")
      .then((res) => {
        const raw = res.data;
        // If array of objects, extract the name field
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "object") {
          return { data: raw.map((c) => c.name) };
        }
        return { data: raw };
      }),

  getAllRaw: () => api.get("/api/categories"),

  create: (name, description) => api.post("/api/categories", { name, description }),
};

// ─── Cart ───────────────────────────────────────────────────────────────────
let cartSubscribers = [];

const notifyCartSubscribers = () => {
  cartSubscribers.forEach((callback) => callback());
};

export const cartAPI = {
  getAll: () => api.get("/api/cart"),
  add: (productId, quantity = 1, productData = {}) =>
    api.post("/api/cart", { product_id: productId, quantity, ...productData }).then((res) => {
      notifyCartSubscribers();
      return res;
    }),
  update: (itemId, quantity) =>
    api.patch(`/api/cart/${itemId}`, { quantity }).then((res) => {
      notifyCartSubscribers();
      return res;
    }),
  remove: (itemId) =>
    api.delete(`/api/cart/${itemId}`).then((res) => {
      notifyCartSubscribers();
      return res;
    }),
  subscribe: (callback) => {
    cartSubscribers.push(callback);
    return () => {
      cartSubscribers = cartSubscribers.filter((subscriber) => subscriber !== callback);
    };
  },
};

// ─── Wishlist ──────────────────────────────────────────────────────────────
export const wishlistAPI = {
  getAll: () => api.get("/api/wishlist"),
  add: (productId, productData = {}) =>
    api.post("/api/wishlist", { product_id: productId, ...productData }),
  remove: (productId) => api.delete(`/api/wishlist/${productId}`),
  toggle: (productId, productData = {}) =>
    api.post("/api/wishlist", { product_id: productId, ...productData }),
};

// ─── Orders ───────────────────────────────────────────────────────────────────
export const ordersAPI = {
  getAll: () => api.get("/api/orders"),
  getById: (id) => api.get(`/api/orders/${id}`),
  create: (orderData) => api.post("/api/orders", orderData),
  updateStatus: (orderId, status) => api.patch(`/api/orders/${orderId}/status`, { status }),
};

export const adminAPI = {
  getSummary: () => api.get("/api/admin/summary"),
  getAnalytics: () => api.get("/api/admin/analytics"),
};

// ─── Reviews ──────────────────────────────────────────────────────────────────
export const reviewsAPI = {
  getForProduct: (productId) => api.get(`/api/products/${productId}/reviews`),
  submit: (productId, reviewData) => api.post(`/api/products/${productId}/reviews`, reviewData),
};

// ─── Coupons ──────────────────────────────────────────────────────────────────
export const couponsAPI = {
  apply: (code) => api.post("/api/coupons/apply", { code }),
};

// ─── Payments ─────────────────────────────────────────────────────────────────
export const paymentsAPI = {
  createIntent: (orderId, idempotencyKey) =>
    api.post("/api/payments/intent", { orderId }, {
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  getById: (paymentId) => api.get(`/api/payments/${encodeURIComponent(paymentId)}`),
};

// ─── Addresses ─────────────────────────────────────────────────────────────────
export const addressesAPI = {
  getAll: () => api.get("/api/addresses"),
  create: (address) => api.post("/api/addresses", address),
  update: (addressId, address) => api.put(`/api/addresses/${addressId}`, address),
  remove: (addressId) => api.delete(`/api/addresses/${addressId}`),
};

export default api;
