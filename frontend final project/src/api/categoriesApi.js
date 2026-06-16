import API from "./axios";

// GET /api/categories
export const getCategories = () => {
  return API.get("/categories");
};

// GET /api/categories/:id
export const getCategoryById = (id) => {
  return API.get(`/categories/${id}`);
};

// POST /api/categories  (admin only)
export const createCategory = (categoryData) => {
  return API.post("/categories", categoryData);
};

// PUT /api/categories/:id  (admin only)
export const updateCategory = (id, categoryData) => {
  return API.put(`/categories/${id}`, categoryData);
};

// DELETE /api/categories/:id  (admin only)
export const deleteCategory = (id) => {
  return API.delete(`/categories/${id}`);
};
