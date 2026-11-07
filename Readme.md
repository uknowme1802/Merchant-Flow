# 🚀 MerchantFlow Dashboard

A **full-stack payment analytics platform** with JWT authentication, optional TOTP two-factor auth, role-based access control, UPI-style checkout with UTR verification, signed outbound webhooks with delivery logs, real-time transaction updates, Redis caching, automated testing, Docker containerization, and CI/CD.

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
- **Two-factor authentication (TOTP)** - optional per user; QR-code setup (otplib + qrcode), enable/disable from the Security page, and a second verification step at login

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

## 🛒 Checkout & Payment Verification

- Any logged-in user can create a checkout order for an amount: a `Pending` transaction (`TXN-<uuid>`) is created and a **UPI QR code** is generated
- The payer submits the 12-digit **UTR** to `POST /api/checkout/:id/verify`
- The UTR + amount is matched against admin-registered **Valid Payment Codes**; a match marks the order `Success` and consumes the code (one-time use)
- Unknown or already-used UTRs leave the order `Pending`
- Non-admins can only view/verify their own orders
- **Idempotent checkout:** send an `Idempotency-Key` header and a repeated request (double click, network retry) returns the original order instead of creating a duplicate; the frontend sends one per checkout attempt
- **Race-safe verification:** a payment code is claimed with a single atomic update, so one UTR can never be consumed twice, even by concurrent requests
- Amounts must be greater than 0 with at most 2 decimals; they are rounded on write and summed in integer minor units (paise) so totals never drift
- On success: the Redis transaction cache is cleared, a `newTransaction` Socket.IO event is emitted, and a `payment.success` webhook fires

### Admin: Payment Codes

Admins register valid `{ utr, amount }` pairs (a stand-in for a bank/PSP feed) under **Payment Codes** (`/payment-code`).

---

## 🔔 Webhooks (Admin)

Admins can register endpoints to be notified about payment events.

- **Events:** `checkout.created`, `payment.success` (also fired when an admin creates a `Success` transaction)
- **Signed deliveries:** every request carries `X-Webhook-Signature` (HMAC-SHA256 of the raw body using the webhook secret) and `X-Webhook-Event`
- Secrets are auto-generated (or supplied / generated in the UI), hidden from list responses, and returned on creation
- Enable/disable or delete webhooks at any time
- Configurable timeout (`WEBHOOK_TIMEOUT_MS`, default 5000 ms); dispatch is fire-and-forget and never breaks the originating request
- **Delivery logs tab:** date/time, transaction ID, event, endpoint, HTTP status/error; searchable by transaction ID (case-insensitive, regex-escaped) with pagination
- Every delivery is stored with its `transactionId`, payload, status code, success flag, error and attempt count
- **Automatic retries with backoff** (1 min, 5 min, 30 min, 2 h; 5 attempts by default via `WEBHOOK_MAX_ATTEMPTS`). Retries are stored in MongoDB and run by a background worker, so they survive restarts, and each retry is claimed atomically so several instances never double-send
- **Replay** any delivery from the logs tab (`POST /api/webhooks/deliveries/:id/replay`) to start a fresh retry cycle
- Delivery logs expire automatically after 30 days (`WEBHOOK_LOG_RETENTION_DAYS`)

Payload shape:

```json
{
  "event": "payment.success",
  "data": { "transactionId": "TXN-...", "orderId": "...", "amount": 500, "utr": "123456789012", "status": "Success" },
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

Verifying a signature on the receiver:

```javascript
const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-webhook-signature"]));
```

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

## 📈 Observability & API Docs

- **Prometheus metrics** at `GET /metrics` (optionally protected with `METRICS_TOKEN`): HTTP latency histogram by route/method/status, webhook delivery outcomes, payment verification outcomes, plus Node process metrics
- **Grafana dashboard** (auto-provisioned): request rate, p50/p95/p99 latency, 5xx ratio, payment and webhook outcomes, memory
- **OpenAPI 3 docs** with Swagger UI at `/api-docs` (raw spec at `/api-docs.json`), written for merchants integrating with the API
- **Helmet** security headers on every response

---

## 🛡️ Security

- JWT authentication with access + refresh tokens
- Refresh token validation and revocation
- bcrypt password hashing
- Auth + role-based authorization middleware
- Helmet security headers
- **Joi validation on every write endpoint**: unknown fields are stripped (no mass assignment), emails/passwords/amounts/UTRs/URLs are checked, webhook secrets must be 16+ characters
- Optional TOTP two-factor authentication
- HMAC-signed webhook payloads
- Global rate limiting (100 req / 15 min), with a tighter limiter (10 req / 15 min) on auth endpoints
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

- **Auth** - admin login, user login, invalid credentials
- **Two-factor** - setup/enable/disable integration, legacy users without 2FA fields
- **Checkout** - order creation, ownership checks, UTR verification flows
- **Valid payments** - admin code creation/listing, access control
- **Dashboard** - stats integration
- **Webhooks** - controller (create/list/toggle/delete, delivery log search & pagination), dispatcher (signing, timeouts, delivery recording), transaction-triggered webhooks
- **Hardening** - Joi validation, mass-assignment stripping, checkout idempotency (including the concurrent-request race), atomic UTR claim and rollback
- **Webhook retries** - backoff schedule, worker, replay endpoint
- **Money** - integer minor-unit helpers
- **Observability** - `/metrics` output and token protection, OpenAPI document, security headers
- **Health / Readiness** - health and readiness endpoints

Run the suite:

```bash
cd backend
npm test
```

### Current Test Status

```text
Test Suites: 15 passed, 15 total
Tests:       83 passed, 83 total
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

> **Not yet covered:** `userController`, transaction listing/caching, and middleware (`adminMiddleware`, `roleMiddleware`) have no dedicated tests. There are no frontend tests.

---

# 🐳 Docker

The backend is containerized. The included `docker-compose.yml` builds and runs the **backend only** — bring your own MongoDB/Redis (e.g. Atlas + Upstash, or local containers) and point `.env` at them.

## Build & Run Manually

```bash
cd backend
docker build -t merchantflow-backend .
docker run -p 5000:5000 --env-file .env merchantflow-backend
```

## Full Stack with Monitoring (Docker Compose)

From the repo root, one command starts the API, MongoDB, Redis, Prometheus and Grafana:

```bash
docker compose -f docker-compose.monitoring.yml up -d --build
```

| Service | URL |
|---------|-----|
| API | http://localhost:5000 |
| Swagger docs | http://localhost:5000/api-docs |
| Metrics | http://localhost:5000/metrics |
| Prometheus | http://localhost:9090 |
| Grafana (admin / `GRAFANA_PASSWORD`, default `admin`) | http://localhost:3000, dashboard **MerchantFlow API** |

Set `SECRET` and `REFRESH_SECRET` in your shell or a root `.env` before using this outside local development.

## Backend-only Docker Compose

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

GitHub Actions runs two pipelines on every push/PR to `Main`, plus a scheduled keep-alive job:

```text
.github/workflows/
├── backend-ci.yml        → install, test, Docker build
├── frontend-ci.yml       → install, lint, build
└── keep-render-alive.yml → pings the Render /health endpoint every 5 minutes
```

A `Jenkinsfile` at the repo root runs the same stages (backend tests, frontend lint/build, Docker image) on Jenkins.

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

React 19 · Vite · Tailwind CSS · Redux Toolkit · React Router 7 · Axios · Recharts · PapaParse · lucide-react · react-hot-toast

## Backend

Node.js · Express 5 · MongoDB (Mongoose) · Redis (ioredis) · JWT · bcryptjs · otplib (TOTP) · qrcode · Socket.IO · express-rate-limit · Joi · Winston · Morgan

## Testing

Jest · Supertest · cross-env

## DevOps

Docker · Docker Compose · GitHub Actions · Jenkins · Prometheus · Grafana

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
├── .github/workflows/
│   ├── backend-ci.yml
│   ├── frontend-ci.yml
│   └── keep-render-alive.yml
│
├── Jenkinsfile
├── docker-compose.monitoring.yml (API + MongoDB + Redis + Prometheus + Grafana)
├── monitoring/          (prometheus.yml, Grafana provisioning + dashboard)
│
├── backend/
│   ├── config/            db.js, redis.js
│   ├── controllers/       auth, twoFactor, checkout, dashboard, transaction,
│   │                      user, validPayment, webhook
│   ├── middleware/        auth, admin, role, validate, rateLimiter, authRateLimiter, error
│   ├── models/            User, Transaction, ValidPayment, Webhook, WebhookDelivery
│   ├── routes/            auth, twoFactor, checkout, dashboard, transaction,
│   │                      user, validPayment, webhook, health
│   ├── docs/              openapi.yaml (served at /api-docs)
│   ├── scripts/           seedAdmin.js, checkConnection.js
│   ├── tests/             15 Jest suites + setup.js
│   ├── utils/             ApiError.js, webhookDispatcher.js (send + retry worker), metrics.js, money.js
│   ├── validators/        schemas.js (Joi)
│   ├── constants/         webhookEvents.js
│   ├── app.js             Express app (exported for tests)
│   ├── server.js          HTTP server + Socket.IO + graceful shutdown
│   ├── socket.js          Socket.IO init / getIO
│   ├── healthcheck.js
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── components/    Sidebar, Topbar, StatCard, TransactionTable,
    │   │                  TransactionFilters, WebhookLogs, charts/, ui/
    │   ├── context/       AuthContext, AuthProvider
    │   ├── layout/        DashboardLayout
    │   ├── pages/         Login, Dashboard, Transactions, Analytics, Users,
    │   │                  Security, Checkout, AdminPaymentCode, Webhooks
    │   └── services/      api.js (Axios instance)
    ├── vercel.json        SPA rewrite
    └── vite.config.js
```

### Frontend Routes

| Route | Page | Access |
|-------|------|--------|
| `/` | Login (with 2FA step) | Public |
| `/dashboard`, `/transactions`, `/analytics` | Stats, transactions, charts | Authenticated |
| `/checkout` | Create order, QR, verify UTR | Authenticated |
| `/security` | Enable/disable 2FA | Authenticated |
| `/users` | User management | Admin |
| `/payment-code` | Valid payment codes | Admin |
| `/webhooks` | Webhooks + delivery logs | Admin |

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

Optional variables are listed under [Environment Variables](#-environment-variables).

Seed an admin account (optional; requires `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` to be set):

```bash
node scripts/seedAdmin.js
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

# Optional
UPI_ID=merchant@upi               # payee in checkout QR codes (placeholder if unset)
UPI_NAME=MerchantFlow             # payee name in QR codes
WEBHOOK_TIMEOUT_MS=5000           # outbound webhook timeout
WEBHOOK_MAX_ATTEMPTS=5            # total send attempts (first send + retries)
WEBHOOK_RETRY_INTERVAL_MS=30000   # how often the retry worker runs
WEBHOOK_LOG_RETENTION_DAYS=30     # delivery logs older than this are deleted
METRICS_TOKEN=                    # if set, /metrics requires 'Authorization: Bearer <token>'
SEED_ADMIN_EMAIL=admin@example.com    # used by scripts/seedAdmin.js
SEED_ADMIN_PASSWORD=change-me         # used by scripts/seedAdmin.js
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

`Auth` = Bearer access token required · `Admin` = admin role required.

## Authentication

```http
POST /api/auth/login
POST /api/auth/2fa/verify-login
POST /api/auth/refresh
POST /api/auth/logout
```

## Two-Factor (Auth)

```http
GET  /api/2fa/status
POST /api/2fa/setup
POST /api/2fa/enable
POST /api/2fa/disable
```

## Dashboard (Auth)

```http
GET /api/dashboard
```

## Transactions (Auth; POST is Admin)

```http
GET  /api/transactions?page=1&limit=10&status=Success
POST /api/transactions
```

## Checkout (Auth)

```http
POST /api/checkout              # create order + UPI QR (optional Idempotency-Key header)
GET  /api/checkout/:id          # order status (owner or admin)
POST /api/checkout/:id/verify   # body: { "utr": "123456789012" }
```

## Valid Payment Codes (Admin)

```http
GET  /api/valid-payments
POST /api/valid-payments
```

## Users (Admin)

```http
GET  /api/users
POST /api/users
```

## Webhooks (Admin)

```http
GET    /api/webhooks
POST   /api/webhooks                  # { url, events?, secret? }
PATCH  /api/webhooks/:id              # { active: true|false }
DELETE /api/webhooks/:id
GET    /api/webhooks/:id/deliveries   # last 25 for one webhook
GET    /api/webhooks/deliveries?transactionId=TXN-&page=1&limit=20
POST   /api/webhooks/deliveries/:id/replay   # re-send now, fresh retry cycle
```

## Health, Metrics & Docs

```http
GET /health
GET /health/ready
GET /metrics
GET /api-docs
GET /api-docs.json
```

## Real-Time Events (Socket.IO)

- `newTransaction` - emitted when a payment is verified or an admin adds a transaction

---

# 🚧 Future Enhancements

## 🔐 Security

- Webhook retries with backoff and manual replay of failed deliveries
- 2FA backup/recovery codes
- Refresh token rotation on every use (currently: refresh token stays valid until logout/expiry)
- Token reuse detection
- More granular permissions
- Structured/centralized logging (currently console-only)
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
- Centralized log aggregation
- Automated deployment pipelines

## 🧪 Testing

- Coverage for `userController`, transaction listing/caching, and middleware
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
- Designing signed, logged outbound webhooks (HMAC, timeouts, delivery history)
- TOTP two-factor authentication
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