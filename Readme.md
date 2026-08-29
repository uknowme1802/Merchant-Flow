# 🚀 MerchantFlow Dashboard

A **full-stack payment analytics platform** with JWT authentication, role-based access control, real-time transaction updates, Redis caching, automated testing, Docker containerization, and CI/CD.

---

## 🌐 Live Demo

- **Frontend (Vercel):** https://merchant-flow-one.vercel.app
- **Backend API (Render):** https://merchant-flow-seuw.onrender.com
- **GitHub:** https://github.com/uknowme1802/Merchant-Flow

---

# 🧠 Core Features

## 🔐 Authentication & Authorization

- JWT-based authentication with short-lived access tokens
- Refresh tokens, stored server-side and checked on every refresh
- Refresh token revocation on logout
- Password hashing with bcrypt
- Role-based access control (**Admin / User**)
- Protected API routes + frontend route guards
- Persistent authentication state

---

## 📊 Dashboard

- Revenue overview
- Transaction statistics
- Dynamic revenue and transaction charts
- Real-time transaction updates
- Responsive, Tailwind CSS-based UI

---

## 💳 Transactions Module

- View, search, filter, and sort transactions
- Server-side pagination
- CSV export using PapaParse
- Admin-only transaction creation
- Redis caching for faster reads (cache-aside strategy)

---

## 👥 User Management

Admin users can:

- Create users and assign roles
- View all users

All role restrictions are enforced on the backend — not just hidden in the UI.

---

## ⚡ Real-Time System

- Socket.IO integration
- WebSocket-based transaction updates
- Live updates without a page refresh

---

## ⚡ Performance & Optimization

- Redis caching (cache-aside strategy) with graceful fallback if Redis is unreachable
- Reduced MongoDB queries via caching
- Server-side pagination
- Rate limiting on all routes, plus a stricter limiter on auth endpoints

---

## 🛡️ Security

- JWT authentication with access + refresh tokens
- Refresh token validation and revocation
- bcrypt password hashing
- Auth + role-based authorization middleware
- Global rate limiting, with a tighter limiter on `/api/auth/login` and `/api/auth/refresh`
- CORS configuration
- Secrets kept in environment variables, never committed

---

# 🩺 Health & Readiness

The backend exposes health monitoring endpoints for deployment and container orchestration.

### Health

```http
GET /health
```

### Readiness

```http
GET /health/ready
```

`/health/ready` checks live MongoDB and Redis connection status and returns `503` if either is down — this is what the Docker health check polls.

---

# 🧪 Testing

MerchantFlow uses **Jest + Supertest** for backend API testing.

### Current Test Coverage

- **Auth** — admin login, user login, invalid credentials
- **Health** — health endpoint
- **Readiness** — readiness endpoint

Run the suite:

```bash
cd backend
npm test
```

### Current Test Status

```text
Test Suites: 3 passed, 3 total
Tests:       5 passed, 5 total
```

### Testing Stack

- Jest, Supertest, cross-env
- Mocked MongoDB `User` model — no live DB required
- Redis disabled during test environment

The Express app is separated from the production HTTP server:

```javascript
module.exports = app;
```

This lets Supertest exercise the app directly without booting the real server.

> **Not yet covered:** `transactionController`, `userController`, and middleware (`adminMiddleware`, `roleMiddleware`) have no tests yet — only auth/health/readiness are currently tested.

---

# 🐳 Docker

The backend is containerized. The included `docker-compose.yml` builds and runs the **backend only** — bring your own MongoDB/Redis (e.g. Atlas + Upstash, or local containers) and point `.env` at them.

## Build & Run Manually

```bash
cd backend
docker build -t merchantflow-backend .
docker run -p 5000:5000 --env-file .env merchantflow-backend
```

## Docker Compose

```bash
cd backend
docker compose up -d
docker ps
docker inspect --format='{{.State.Health.Status}}' merchantflow-backend
```

Expected: `healthy`

```bash
docker compose down
```

## ❤️ Docker Health Check

```text
merchantflow-backend
        │
        ▼
/health/ready
        │
        ├── Ready     → healthy
        └── Not Ready → unhealthy
```

---

# 🔄 CI/CD

GitHub Actions runs two separate pipelines on every push/PR to `Main`:

```text
.github/workflows/
├── backend-ci.yml   → install, test, Docker build
└── frontend-ci.yml  → install, lint, build
```

## CI Flow

```text
Git Push
   │
   ▼
GitHub Actions
   │
   ├── backend-ci  → npm ci → npm test → docker build
   │
   └── frontend-ci → npm ci → npm run lint → npm run build
   │
   ├── PASS → Pipeline succeeds
   └── FAIL → Pipeline fails
```

---

# ⚙️ Tech Stack

## Frontend

React · Vite · Tailwind CSS · Redux Toolkit · React Router · Axios · Socket.IO Client · Recharts · PapaParse · react-hot-toast

## Backend

Node.js · Express 5 · MongoDB (Mongoose) · Redis (ioredis) · JWT · bcrypt · Socket.IO · express-rate-limit

## Testing

Jest · Supertest · cross-env

## DevOps

Docker · Docker Compose · GitHub Actions

## Deployment

Vercel (Frontend) · Render (Backend) · MongoDB Atlas · Redis (e.g. Upstash)

---

# 🏗️ Architecture

```text
                         ┌─────────────────────┐
                         │      React UI       │
                         │   Vite + Tailwind    │
                         └──────────┬──────────┘
                                    │
                         REST API / WebSocket
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    Express App       │
                         │       app.js         │
                         └──────────┬──────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
              ▼                     ▼                     ▼
        Middleware              Routes              Socket.IO
              │                     │
       ┌──────┼──────┐              ▼
       │      │      │        Controllers
       │      │      │              │
       ▼      ▼      ▼              ▼
     Auth    Role   Rate       Business Logic
   Middleware Check Limit           │
                                    ▼
                           ┌─────────────────┐
                           │   Data Layer     │
                           └───────┬─────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
              MongoDB Atlas                    Redis
```

---

# 📁 Project Structure

```text
Merchant-Flow/
│
├── .github/
│   └── workflows/
│       ├── backend-ci.yml
│       └── frontend-ci.yml
│
├── backend/
│   ├── config/
│   │   ├── db.js
│   │   └── redis.js
│   │
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── dashboardController.js
│   │   ├── transactionController.js
│   │   └── userController.js
│   │
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   ├── adminMiddleware.js
│   │   ├── roleMiddleware.js
│   │   ├── rateLimiter.js
│   │   ├── authRateLimiter.js
│   │   └── errorMiddleware.js
│   │
│   ├── models/
│   │   ├── User.js
│   │   └── Transaction.js
│   │
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── dashboardRoutes.js
│   │   ├── transactionRoutes.js
│   │   ├── userRoutes.js
│   │   └── healthRoutes.js
│   │
│   ├── tests/
│   │   ├── auth.test.js
│   │   ├── health.test.js
│   │   ├── readiness.test.js
│   │   └── setup.js
│   │
│   ├── app.js
│   ├── server.js
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── package.json
│   └── package-lock.json
│
└── frontend/
    ├── src/
    │   ├── components/
    │   ├── context/
    │   ├── layout/
    │   ├── pages/
    │   └── services/
    ├── public/
    ├── package.json
    └── vite.config.js
```

---

# 🛠️ Local Setup

## 1️⃣ Clone Repository

```bash
git clone https://github.com/uknowme1802/Merchant-Flow.git
cd Merchant-Flow
```

---

# 2️⃣ Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file:

```env
PORT=5000
MONGO_URI=your_mongodb_uri
SECRET=your_access_token_secret
REFRESH_SECRET=your_refresh_token_secret
REDIS_URL=your_redis_url
```

Start the backend:

```bash
npm start
```

```text
http://localhost:5000
```

---

# 3️⃣ Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
```

Create `.env`:

```env
VITE_API_URL=http://localhost:5000/api
```

Start the frontend:

```bash
npm run dev
```

```text
http://localhost:5173
```

---

# 🧪 Run Tests

```bash
cd backend
npm test
```

For additional Jest diagnostics:

```bash
npx jest --detectOpenHandles
```

---

# 🐳 Run with Docker Compose

```bash
cd backend
docker compose up -d
docker ps
docker inspect --format='{{.State.Health.Status}}' merchantflow-backend
```

Expected: `healthy`

```bash
docker compose down
```

---

# 🔑 Environment Variables

Never commit `.env` files to GitHub.

## Backend

```env
PORT=5000
MONGO_URI=your_mongodb_uri
SECRET=your_access_token_secret
REFRESH_SECRET=your_refresh_token_secret
REDIS_URL=your_redis_url
```

## Frontend

```env
VITE_API_URL=http://localhost:5000/api
```

Make sure `.env` is in `.gitignore`:

```gitignore
node_modules/
.env
.env.*
!.env.example
dist/
```

---

# 🔌 API Overview

## Authentication

```http
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
```

## Dashboard

```http
GET /api/dashboard
```

## Transactions

```http
GET /api/transactions
POST /api/transactions
```

## Users

```http
GET /api/users
POST /api/users
```

## Health

```http
GET /health
GET /health/ready
```

---

# 🚧 Future Enhancements

## 🔐 Security

- Refresh token rotation on every use (currently: refresh token stays valid until logout/expiry)
- Token reuse detection
- More granular permissions
- Structured/centralized logging (currently console-only)
- Security headers (e.g. Helmet)
- Audit logging

## 📊 Product Enhancements

- Advanced analytics dashboard
- Payment method insights
- Transaction categorization
- Revenue forecasting
- Exportable analytics reports

## ⚙️ DevOps

- Full-stack Docker Compose environment (Mongo + Redis containers alongside backend)
- Nginx reverse proxy
- Prometheus metrics / Grafana dashboards
- Centralized log aggregation
- Automated deployment pipelines

## 🧪 Testing

- Coverage for `transactionController`, `userController`, and middleware
- Frontend component/integration tests

## 🧠 Scalability

- Background job processing (e.g. BullMQ)
- Event streaming (e.g. Kafka)
- Microservices architecture
- Horizontal scaling
- Distributed caching

---

# 💡 Key Learnings

Building MerchantFlow involved solving several real-world engineering challenges:

- Production deployment with Render and Vercel
- Debugging CORS configuration
- Managing environment variables across environments
- MongoDB Atlas connectivity
- Redis integration with a cache-aside pattern
- JWT authentication and refresh-token lifecycle management
- Role-based authorization
- Real-time communication with Socket.IO
- API rate limiting
- Centralized error handling
- Automated API testing with mocked models
- Docker containerization and health checks
- GitHub Actions CI for both frontend and backend
- Separating Express application logic from the production server for testability

---

# 🎯 Engineering Highlights

### Backend

- Modular Express architecture (routes → middleware → controllers → models)
- Controller-based business logic
- MongoDB persistence via Mongoose
- Redis caching with graceful degradation
- JWT authentication + role-based authorization
- WebSocket communication via Socket.IO

### Reliability

- Health and readiness endpoints backed by real DB/Redis checks
- Graceful server shutdown on SIGTERM/SIGINT
- Centralized error middleware
- Rate limiting (global + auth-specific)
- Automated backend tests
- Docker health checks

### DevOps

- Dockerized backend with Compose support
- Environment-based configuration
- GitHub Actions CI for both frontend and backend
- Cloud deployment (Vercel + Render)

---

# 👨‍💻 Author

**Harshdeep**

Full-Stack Developer | Backend-Focused | Fintech Systems

---

# ⭐ Final Note

MerchantFlow is built to demonstrate **practical full-stack engineering practices** — backend architecture, REST APIs, authentication & authorization, real-time systems, Redis caching, database integration, automated testing, Docker containerization, CI/CD, and cloud deployment — rather than being a simple tutorial project.

> Built to show how a modern fintech-style application can be designed, tested, containerized, and deployed using production-oriented engineering practices.

---

⭐ **If you find this project useful, consider giving the repository a star.**