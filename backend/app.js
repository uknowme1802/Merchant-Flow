require("dotenv").config();

const express = require("express");
const cors = require("cors");

const rateLimiter = require("./middleware/rateLimiter");
const errorMiddleware = require("./middleware/errorMiddleware");

const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const userRoutes = require("./routes/userRoutes");
const healthRoutes = require("./routes/healthRoutes");
const twoFactorRoutes  = require("./routes/twoFactorRoutes");

const app = express();

app.use(express.json());

app.use(cors({
    origin: [
        "https://merchant-flow-one.vercel.app",
        "http://localhost:5173"
    ]
}))

app.use(rateLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/users", userRoutes);
app.use("/api/2fa", twoFactorRoutes);
app.use("/health", healthRoutes);

app.get("/", (req,res)=>{
    res.send("API Running...");
})

app.use(errorMiddleware);
module.exports = app;