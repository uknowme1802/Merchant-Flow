require("dotenv").config()

const connectDB = require("./config/db");
const PORT = process.env.PORT;



const http = require("http");
const {initSocket} = require("./socket");


connectDB();

const app = require("./app")
const server = http.createServer(app);
initSocket(server);

server.listen(PORT, ()=>{console.log(`Server running at PORT: ${PORT}`)});

const gracefulShutdown = (signal) => {
    console.log(`${signal} recevied! Shuting down the server`);

    server.close(()=>{
        console.log("HTTP server closed.");

        process.exit(0);
    })
};

process.on("SIGTERM", ()=>{
    gracefulShutdown("SIGTERM");
});

process.on("SIGINT",()=>{
    gracefulShutdown("SIGINT");
});
