import API from "./axios";

// GET /api/products
export const getProducts = () => {
  return API.get("/products");
};

// GET /api/products/:id
export const getProductById = (id) => {
  return API.get(`/products/${id}`);
};

// POST /api/products  (admin only)
export const createProduct = (productData) => {
  return API.post("/products", productData);
};

// PUT /api/products/:id  (admin only)
export const updateProduct = (id, productData) => {
  return API.put(`/products/${id}`, productData);
};

// DELETE /api/products/:id  (admin only)
export const deleteProduct = (id) => {
  return API.delete(`/products/${id}`);
};
