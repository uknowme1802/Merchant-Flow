# 🚀 MerchantFlow Dashboard

A **production-grade full-stack payment analytics platform** with JWT authentication, role-based access control, real-time transaction updates, Redis caching, automated testing, Docker containerization, and CI/CD.

---

## 🌐 Live Demo

- **Frontend (Vercel):** https://merchant-flow-one.vercel.app
- **Backend API (Render):** https://merchant-flow-seuw.onrender.com
- **GitHub:** https://github.com/uknowme1802/Merchant-Flow

---

# 🧠 Core Features

## 🔐 Authentication & Authorization

- JWT-based authentication
- Short-lived access tokens
- Refresh token support
- Refresh token validation and revocation
- Secure logout
- Password hashing with bcrypt
- Role-based access control (**Admin / User**)
- Protected API routes
- Frontend route guards
- Persistent authentication state

---

## 📊 Dashboard

- Revenue overview
- Transaction statistics
- Dynamic revenue charts
- Transaction charts
- Real-time transaction updates
- Responsive dashboard UI
- Tailwind CSS-based interface

---

## 💳 Transactions Module

- View transactions
- Search transactions
- Filter transactions
- Sort transactions
- Server-side pagination
- CSV export using PapaParse
- Admin-only transaction creation
- Redis caching for faster reads
- Cache-first data retrieval strategy

---

## 👥 User Management

Admin users can:

- Create users
- Assign user roles
- View users
- Manage user access

All role restrictions are enforced on the backend.

---

## ⚡ Real-Time System

- Socket.IO integration
- WebSocket-based transaction updates
- Live updates without page refresh
- Event-driven architecture

---

## ⚡ Performance & Optimization

- Redis caching using Upstash
- Cache-aside strategy
- Reduced MongoDB queries
- Server-side pagination
- API response optimization
- Rate limiting
- Render cold-start awareness

---

## 🛡️ Security

- JWT authentication
- Access token expiration
- Refresh token validation
- Refresh token revocation
- bcrypt password hashing
- Authentication middleware
- Role-based authorization middleware
- Rate limiting
- CORS configuration
- Environment variables for secrets
- MongoDB Atlas security configuration

---

# 🩺 Health & Readiness

The backend provides health monitoring endpoints for deployment and container orchestration.

### Health

```http
GET /health
```

### Readiness

```http
GET /health/ready
```

The readiness endpoint verifies that the application is ready to serve requests and can be used by Docker health checks and deployment platforms.

---

# 📊 Logging & Monitoring

- Winston logger integration
- Structured logging
- Info and error logs
- File-based logging
- Application error middleware
- Docker health checks

---

# 🧪 Testing

MerchantFlow uses **Jest + Supertest** for backend API testing.

### Current Test Coverage

#### Authentication

- Admin login
- User login
- Invalid credentials

#### Health

- Health endpoint

#### Readiness

- Readiness endpoint

Run the complete test suite:

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

- Jest
- Supertest
- cross-env
- Mocked MongoDB User model
- Redis disabled during test environment

The Express application is separated from the production HTTP server using:

```javascript
module.exports = app;
```

This allows Supertest to test the application without starting the production server.

---

# 🐳 Docker

The backend is containerized using Docker.

## Build Docker Image

```bash
cd backend

docker build -t merchantflow-backend .
```

## Run Docker Container

```bash
docker run -p 5000:5000 merchantflow-backend
```

---

# 🐳 Docker Compose

MerchantFlow also includes Docker Compose configuration.

Start the backend:

```bash
docker compose up -d
```

Check running containers:

```bash
docker ps
```

Check backend health:

```bash
docker inspect --format='{{.State.Health.Status}}' merchantflow-backend
```

Expected:

```text
healthy
```

Stop the container:

```bash
docker compose down
```

---

## ❤️ Docker Health Check

The backend container includes a health check that verifies:

```http
GET /health/ready
```

Docker periodically checks the application readiness status.

```text
merchantflow-backend
        │
        ▼
/health/ready
        │
        ├── Ready → healthy
        │
        └── Not Ready → unhealthy
```

---

# 🔄 CI/CD

GitHub Actions is configured to automatically validate the backend.

The CI pipeline runs backend tests on pushes and pull requests.

## CI Flow

```text
Git Push
   │
   ▼
GitHub Actions
   │
   ▼
Install Dependencies
   │
   ▼
Run Jest Tests
   │
   ├── PASS → Pipeline succeeds
   │
   └── FAIL → Pipeline fails
```

Backend CI configuration:

```text
.github/
└── backend-ci.yml
```

---

# ⚙️ Tech Stack

## Frontend

- React
- Vite
- Tailwind CSS
- Axios
- Context API
- React Router
- Socket.IO Client
- PapaParse

## Backend

- Node.js
- Express.js
- MongoDB
- MongoDB Atlas
- Redis
- Upstash Redis
- JWT
- bcrypt
- Socket.IO
- Winston

## Testing

- Jest
- Supertest
- cross-env

## DevOps

- Docker
- Docker Compose
- GitHub Actions

## Deployment

- Vercel — Frontend
- Render — Backend
- MongoDB Atlas — Database
- Upstash — Redis

---

# 🏗️ Architecture

MerchantFlow follows a modular backend architecture.

```text
                         ┌─────────────────────┐
                         │      React UI       │
                         │   Vite + Tailwind   │
                         └──────────┬──────────┘
                                    │
                         REST API / WebSocket
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    Express App      │
                         │       app.js        │
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
   Middleware Limit  Limit           │
                                    ▼
                           ┌─────────────────┐
                           │   Data Layer    │
                           └───────┬─────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
              MongoDB Atlas                  Redis
                                              Upstash
```

---

# 📁 Project Structure

```text
Merchant-Flow/
│
├── .github/
│   └── backend-ci.yml
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
│   │   ├── errorMiddleware.js
│   │   ├── rateLimiter.js
│   │   └── roleMiddleware.js
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

Backend:

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
VITE_CONFIG_URL=http://localhost:5000/api
```

Start the frontend:

```bash
npm run dev
```

Frontend:

```text
http://localhost:5173
```

---

# 🧪 Run Tests

From the backend directory:

```bash
npm test
```

For additional Jest diagnostics:

```bash
npx jest --detectOpenHandles
```

---

# 🐳 Run with Docker Compose

From the backend directory:

```bash
docker compose up -d
```

Check containers:

```bash
docker ps
```

Check health:

```bash
docker inspect --format='{{.State.Health.Status}}' merchantflow-backend
```

Expected:

```text
healthy
```

Stop:

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
VITE_CONFIG_URL=http://localhost:5000/api
```

Make sure `.env` is included in `.gitignore`:

```gitignore
node_modules/
.env
.env.*
!.env.example
coverage/
logs/
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

- Refresh token rotation
- Token reuse detection
- More granular permissions
- Advanced rate limiting
- Security headers
- Audit logging

## 📊 Product Enhancements

- Advanced analytics dashboard
- Payment method insights
- Transaction categorization
- Revenue forecasting
- Exportable analytics reports

## ⚙️ DevOps

- Full-stack Docker Compose environment
- Nginx reverse proxy
- Prometheus metrics
- Grafana dashboards
- Centralized log aggregation
- Automated deployment pipelines

## 🧠 Scalability

- Background job processing
- BullMQ
- Kafka event streaming
- Microservices architecture
- Horizontal scaling
- Distributed caching

---

# 💡 Key Learnings

Building MerchantFlow involved solving several real-world engineering challenges:

- Production deployment with Render and Vercel
- Debugging CORS configuration
- Managing environment variables
- MongoDB Atlas connectivity
- Redis and Upstash integration
- Redis cache implementation
- JWT authentication
- Refresh token management
- Role-based authorization
- Real-time communication with Socket.IO
- API rate limiting
- Centralized error handling
- Automated API testing
- Docker containerization
- Docker health checks
- GitHub Actions CI
- Separating Express application logic from the production server
- Debugging cloud deployment and build issues

---

# 🎯 Engineering Highlights

MerchantFlow demonstrates practical full-stack engineering principles:

### Backend

- Modular Express architecture
- Middleware-driven request processing
- Controller-based business logic
- MongoDB persistence
- Redis caching
- JWT authentication
- Role-based authorization
- WebSocket communication

### Reliability

- Health endpoints
- Readiness checks
- Graceful server shutdown
- Centralized error handling
- Rate limiting
- Automated tests
- Docker health checks

### DevOps

- Dockerized backend
- Docker Compose
- Environment-based configuration
- GitHub Actions
- Automated test execution
- Cloud deployment

---

# 👨‍💻 Author

**Harshdeep**

Full-Stack Developer | Backend-Focused | Fintech Systems

---

# ⭐ Final Note

MerchantFlow is designed to demonstrate **real-world full-stack engineering practices**, rather than being a simple tutorial project.

The project combines:

- Backend architecture
- REST APIs
- Authentication & authorization
- Real-time systems
- Redis caching
- Database integration
- Automated testing
- Docker containerization
- CI/CD
- Cloud deployment
- Production debugging

> Built to demonstrate how a modern fintech-style application can be designed, tested, containerized, and deployed using production-oriented engineering practices.

---

⭐ **If you find this project useful, consider giving the repository a star.**
