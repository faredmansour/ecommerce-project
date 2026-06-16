import API from "./axios";

// POST /api/auth/register
export const registerUser = (userData) => {
  return API.post("/auth/register", userData);
};

// POST /api/auth/login
export const loginUser = (credentials) => {
  return API.post("/auth/login", credentials);
};
