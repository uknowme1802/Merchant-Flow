# 🚀 MerchantFlow Dashboard

A full-stack payment analytics dashboard with role-based access control, real-time transaction management, and admin user controls.

## 🌐 Live Demo
Frontend: https://merchant-flow-one.vercel.app  
Backend API: https://merchant-flow-seuw.onrender.com

---

## 🧠 Features

### 🔐 Authentication & Authorization
- JWT-based authentication
- Role-based access (Admin / User)
- Protected routes

### 📊 Dashboard
- Revenue overview
- Transaction analytics
- Charts (Revenue, Transactions, Payment Methods)

### 💳 Transactions
- View transactions
- Search, filter, sort
- Pagination
- CSV export
- Admin-only transaction creation

### 👥 User Management (Admin)
- Create users with roles
- View users list
- Access control enforced

---

## ⚙️ Tech Stack

### Frontend
- React (Vite)
- Tailwind CSS
- Axios
- Context API

### Backend
- Node.js
- Express.js
- MongoDB (Atlas)
- JWT Authentication

### DevOps
- Frontend: Vercel
- Backend: Render
- CI/CD: GitHub

---

## 🔒 Security
- Environment variables for secrets
- JWT token validation
- Role-based middleware
- MongoDB Atlas network security

---

## 🛠️ Local Setup

### Backend
cd backend  
npm install  
npm start  

### Frontend
cd frontend  
npm install  
npm run dev  

---

## 🚀 Future Enhancements
- Password hashing (bcrypt)
- Refresh tokens
- WebSocket real-time updates
- Admin analytics insights