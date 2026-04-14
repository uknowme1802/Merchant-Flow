const {Server} = require("socket.io");
let io;

const initSocket = (server) =>{
    io = new Server(server , {
        cors: {
            origin: "https://merchant-flow-one.vercel.app",
            methods: ["GET", "POST"]
        }
    })
    io.on("connection", (socket)=>{
        console.log("⚡ Client connected:", socket.id);
        
        socket.on("disconnected",()=>{
            console.log("❌ Client disconnected", socket.id);
        })
    })
};

const getIO = () =>{
    if(!io){
        throw new Error("Socket.io not initialized");
    }
    return io;
};

module.exports = {initSocket, getIO};