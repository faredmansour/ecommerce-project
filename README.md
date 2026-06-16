# Alfredo E-commerce Project

A full-stack e-commerce application with an Express/MongoDB backend and a React/Vite frontend.

## Project Structure

- `backend/` — Express API, MongoDB models, authentication, admin routes, product and category management.
- `frontend final project/` — React app built with Vite, product browsing, cart, wishlist, authentication.

## Getting Started

### Backend
1. Open terminal in `backend/`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `backend/connection/config.env` with:
   ```env
   PORT=8000
   DB_URL="mongodb://127.0.0.1:27017/e-comerce1"
   JWT_SECRET=mySuperSecretKey123
   JWT_EXPIRES_IN=7d
   ```
4. Run backend server:
   ```bash
   npm run dev
   ```

### Frontend
1. Open terminal in `frontend final project/`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run frontend server:
   ```bash
   npm run dev
   ```

### From project root
Install the backend and frontend independently, then use these convenience scripts:
```bash
npm run start:backend
npm run start:frontend
npm run build:frontend
npm run seed
```

## API Endpoints

### Auth
- `POST /api/auth/register` — Register a new user
- `POST /api/auth/login` — Login and receive JWT token

### Categories
- `GET /api/categories` — Get all categories
- `GET /api/categories/:id` — Get category by ID
- `POST /api/categories` — Create category (admin)
- `PUT /api/categories/:id` — Update category (admin)
- `DELETE /api/categories/:id` — Delete category (admin)

### Products
- `GET /api/products` — Get all products
- `GET /api/products/:id` — Get product by ID
- `POST /api/products` — Create product with image upload (admin)
- `PUT /api/products/:id` — Update product (admin)
- `DELETE /api/products/:id` — Delete product (admin)

## Notes
- `backend/connection/config.env` is excluded from Git with `.gitignore`.
- The frontend folder currently remains named `frontend final project` to preserve the existing structure.

## Recommended Improvements
- Rename frontend folder to `frontend` and standardize paths.
- Add pain-free deployment scripts and GitHub Actions for CI.
- Add unit and integration tests for backend and frontend.

## GitHub Setup
1. Initialize git at root:
   ```bash
   git init
   git add .
   git commit -m "Initial project setup"
   ```
2. Create a GitHub repo and push:
   ```bash
   git remote add origin <repository-url>
   git push -u origin main
   ```
