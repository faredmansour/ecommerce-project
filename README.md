# Alfredo E-Commerce

A full-stack e-commerce application: an **Express 5 / MongoDB** REST API and a **React (Vite) + Tailwind** single-page front end.

[![Node CI](https://github.com/faredmansour/ecommerce-project/actions/workflows/nodejs-ci.yml/badge.svg)](https://github.com/faredmansour/ecommerce-project/actions)

## Features

**Backend**
- JWT auth with **access + refresh tokens**, logout (token revocation), and email-based password reset
- Role-based access control (`user` / `admin`)
- Products with **pagination, search, sort, and category filtering**
- Cart, Wishlist, Orders (with coupon discounts), Reviews & ratings, Addresses (default address)
- **Stripe** payment intents
- Security: Helmet, CORS allow-list, rate limiting (global + auth), NoSQL-injection sanitization
- Performance: gzip compression, optional **Redis** response caching, optional **Cloudinary** image hosting
- **Joi** request validation on every write endpoint
- **Swagger / OpenAPI** docs at `/api/docs`
- `/health` liveness endpoint
- Winston structured logging
- **Jest + Supertest** test suite (in-memory MongoDB)

**Frontend**
- Product browsing, product detail with reviews, cart, wishlist
- **Full checkout flow**: address selection, coupon apply, Stripe card payment or Cash on Delivery
- Admin dashboard
- Dark mode

## Project Structure

```
ecommerce-project/
├── backend/                 # Express API
│   ├── app.js               # Express app (middleware, routes) — exported, no listen
│   ├── server.js            # Entry point: DB connect + listen
│   ├── controllers/         # Route handlers + validation/ (Joi schemas)
│   ├── models/              # Mongoose models
│   ├── routers/             # Express routers
│   ├── middlewares/         # auth, RBAC, validateRequest, error handler, multer
│   ├── utils/               # logger, cache (Redis), cloudinary, email, swagger
│   └── tests/               # Jest + Supertest
├── frontend/                # React + Vite SPA
├── render.yaml              # One-click Render deployment blueprint
└── .github/workflows/       # CI
```

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### Backend
```bash
cd backend
npm install
cp connection/config.env.example connection/config.env   # then fill in values
npm run dev        # nodemon
# or: npm start
```

The API runs at `http://localhost:8000`. Interactive docs: `http://localhost:8000/api/docs`.

See [`backend/connection/config.env.example`](backend/connection/config.env.example) for all environment variables. Only `DB_URL` and `JWT_SECRET` are required; Redis, Stripe, Cloudinary and SMTP are optional and degrade gracefully when unset.

### Frontend
```bash
cd frontend
npm install
cp .env.example .env        # set VITE_API_URL and optional VITE_STRIPE_PUBLISHABLE_KEY
npm run dev
```

The app runs at `http://localhost:5173`.

### Seed sample data
```bash
cd backend && node seed.js     # or, from root: npm run seed
```

## Testing
```bash
cd backend
npm test
```
Tests spin up an in-memory MongoDB (no external database needed). The first run downloads the MongoDB binary once and caches it.

## Deployment

### Render (blueprint)
This repo includes [`render.yaml`](render.yaml). In the Render dashboard choose **New + → Blueprint**, point it at this repo, and fill in the secret env vars (`DB_URL`, `STRIPE_SECRET_KEY`, etc.). It provisions the API as a web service and the front end as a static site.

### Docker (backend)
```bash
cd backend
docker build -t alfredo-api .
docker run -p 8000:8000 --env-file connection/config.env alfredo-api
```

## API Endpoints

Base URL: `/api`. Full schemas and try-it-out at **`/api/docs`**.

### Auth (`/api/auth`)
| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/register` | public | Register, returns access + refresh tokens |
| POST | `/login` | public | Login |
| POST | `/refresh` | public | Exchange refresh token for a new access token |
| POST | `/logout` | public | Revoke a refresh token |
| POST | `/forgot-password` | public | Request password-reset email |
| POST | `/reset-password` | public | Reset password with token |
| GET | `/me` | auth | Current user |

### Products (`/api/products`)
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/` | public | List (`?category=&search=&sort=&page=&limit=`) |
| GET | `/:id` | public | Get one |
| POST | `/` | admin | Create (multipart image) |
| PUT | `/:id` | admin | Update |
| DELETE | `/:id` | admin | Delete |
| GET | `/:id/reviews` | public | List reviews |
| POST | `/:id/reviews` | auth | Submit review |

### Categories (`/api/categories`)
`GET /`, `GET /:id` (public); `POST /`, `PUT /:id`, `DELETE /:id` (admin).

### Cart (`/api/cart`) — auth
`GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`.

### Wishlist (`/api/wishlist`) — auth
`GET /`, `POST /`, `DELETE /:productId`.

### Orders (`/api/orders`) — auth
`GET /`, `GET /:id`, `POST /`; `PATCH /:id/status` (admin).

### Addresses (`/api/addresses`) — auth
`GET /`, `POST /`, `PUT /:id`, `DELETE /:id`.

### Coupons (`/api/coupons`) — auth
`POST /apply`.

### Payments (`/api/payments`) — auth
`POST /intent` — create a Stripe payment intent.

### Misc
`GET /health`, `POST /api/upload`, `GET /api/docs`.

A Postman collection is available at [`backend/Alfredo_API.postman_collection.json`](backend/Alfredo_API.postman_collection.json).

## License
MIT
