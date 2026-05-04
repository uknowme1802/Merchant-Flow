# 🚀 MerchantFlow Dashboard

A **production-grade full-stack payment analytics platform** with authentication, role-based access control, real-time transaction updates, and scalable backend architecture.

---

## 🌐 Live Demo

* **Frontend (Vercel):** https://merchant-flow-one.vercel.app
* **Backend API (Render):** https://merchant-flow-seuw.onrender.com

---

# 🧠 Core Features

## 🔐 Authentication & Authorization

* JWT-based authentication (Access Token)
* Role-based access control (**Admin / User**)
* Protected API routes & frontend route guards
* Persistent login using localStorage

---

## 📊 Dashboard

* Revenue & transaction overview
* Dynamic charts (Revenue, Transactions)
* Real-time data updates (via WebSockets)
* Clean and responsive UI (Tailwind)

---

## 💳 Transactions Module

* View all transactions
* Search, filter, sort
* Pagination (server-side)
* CSV export (PapaParse)
* Admin-only transaction creation
* **Redis caching for faster reads ⚡**

---

## 👥 User Management (Admin Only)

* Create users with roles
* View users list
* Backend-enforced role restrictions

---

## ⚡ Real-Time System

* Socket.io integration
* Live transaction updates without refresh
* Event-driven architecture

---

## 🚀 Performance & Optimization

* Redis (Upstash) caching layer
* Reduced DB load using cache-first strategy
* API response optimization
* Render cold-start handling awareness

---

## 🛡️ Security

* Environment variables for secrets
* JWT validation middleware
* Role-based authorization middleware
* MongoDB Atlas IP whitelisting
* CORS configuration for frontend/backend isolation

---

## 📊 Logging & Monitoring

* Winston logger integration
* Structured logs (info + error)
* File-based logging (`logs/` directory)

---

## 🧪 Testing

* Jest + Supertest setup
* API testing (auth endpoints)
* Testable server architecture (`module.exports = app`)

---

## 🐳 Containerization

* Dockerized backend
* Portable deployment-ready setup

---

# ⚙️ Tech Stack

## Frontend

* React (Vite)
* Tailwind CSS
* Axios (with interceptors)
* Context API (Auth state management)
* Socket.io-client

## Backend

* Node.js
* Express.js
* MongoDB (Atlas)
* Redis (Upstash - cloud)
* JWT Authentication
* Socket.io
* Winston Logger

## Dev Tools

* Jest (Testing)
* Supertest (API testing)
* Docker (Containerization)

## Deployment

* Frontend: Vercel
* Backend: Render

---

# 🏗️ Architecture Highlights

* REST API + WebSocket hybrid system
* Layered backend structure (Controller → Service → DB)
* Middleware-driven security (Auth + Role + Rate limiting)
* Cache-aside strategy using Redis
* Stateless backend (cloud-ready)

---

# 🛠️ Local Setup

## 1️⃣ Clone Repository

```bash
git clone <your-repo-url>
cd merchantflow
```

---

## 2️⃣ Backend Setup

```bash
cd backend
npm install
```

### Create `.env`

```env
PORT=5000
MONGO_URI=your_mongodb_uri
SECRET=your_jwt_secret
REDIS_URL=redis://127.0.0.1:6379
```

### Run Backend

```bash
npm start
```

---

## 3️⃣ Frontend Setup

```bash
cd frontend
npm install
```

### Create `.env`

```env
VITE_CONFIG_URL=http://localhost:5000/api
```

### Run Frontend

```bash
npm run dev
```

---

# 🧪 Run Tests

```bash
cd backend
npm test
```

---

# 🐳 Run with Docker

```bash
cd backend
docker build -t merchantflow-backend .
docker run -p 5000:5000 merchantflow-backend
```

---

# 🚧 Future Enhancements

## 🔐 Security Improvements

* Password hashing with bcrypt
* Refresh token rotation (currently partial)
* Rate limiting per user/IP

## 📊 Product Enhancements

* Advanced analytics dashboard
* Payment method insights
* Transaction categorization

## ⚙️ DevOps (Not Implemented Yet)

* CI/CD pipelines (GitHub Actions)
* Docker Compose (full-stack)
* Nginx reverse proxy
* Monitoring (Prometheus/Grafana)

## 🧠 Scalability

* Microservices architecture
* Queue system (BullMQ / Kafka)
* Horizontal scaling support

---

# 💡 Key Learnings

* Handling **production deployment issues (Render + Vercel)**
* Debugging **CORS, environment variables, and build configs**
* Implementing **Redis caching in real-world scenarios**
* Managing **real-time systems with WebSockets**
* Building **secure and scalable backend APIs**

---

# 👨‍💻 Author

**Harshdeep**
Full-Stack Developer | Backend-Focused | Fintech Systems

---

# ⭐ Final Note

This project is designed as a **production-ready fintech dashboard**, demonstrating:

* Backend architecture skills
* Real-time system design
* Performance optimization
* Deployment debugging

👉 Built to reflect **real-world engineering practices**, not just tutorials.
