const {Server} = require("socket.io");
const { allowedOrigins } = require("./config/origins");
const logger = require("./utils/logger");
let io;

const initSocket = (server) =>{
    io = new Server(server , {
        cors: {
            origin: allowedOrigins(),
            methods: ["GET", "POST"]
        }
    })
    io.on("connection", (socket)=>{
        logger.debug("Socket client connected", { id: socket.id });
        
        socket.on("disconnect",()=>{
            logger.debug("Socket client disconnected", { id: socket.id });
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