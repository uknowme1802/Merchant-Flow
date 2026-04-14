require("dotenv").config()
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const PORT = process.env.PORT;

const rateLimiter = require("./middleware/rateLimiter");
const errorMiddleware = require("./middleware/errorMiddleware");

const http = require("http");
const initSocket = require("./socket");

const app =express();
connectDB();
app.use(express.json());
app.use(cors({
    origin: "https://merchant-flow-one.vercel.app"
    
}));
app.use(rateLimiter);

//Routes
const authRoutes= require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const userRoutes = require("./routes/userRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/users", userRoutes);

app.get("/", (req,res)=>{
    res.send("API Running...👌");
});

app.use(errorMiddleware)

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, ()=>{console.log(`Server running at PORT: ${PORT}`)});