require("dotenv").config()
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const PORT = process.env.PORT;


const app =express();
connectDB();

app.use(cors());
app.use(express.json());
app.use(cors({
    origin: "*"
}));

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

app.listen(PORT, ()=>{console.log(`Server running at PORT: ${PORT}`)});