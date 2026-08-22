const { response } = require("express");
const http= require("http");
const { hostname } = require("os");

const PORT = process.env.PORT || 5000;

const options = {
    hostname:"127.0.0.1",
    port: PORT,
    path: "/",
    method: "GET",
    timeout: 5000
};

const request = http.request(options, (response)=>{
    if (response.statusCode>=200 && response.statusCode<500){
        console.log("Health check Passed");
        process.exit(0);
    }

    console.error(
        `Health check failed with status: ${response.statusCode}`
    );

    process.exit(0);
});

request.on("error", (error)=>{
    console.error("Health check error", error.message);
    process.exit(1);
});

request.on("timeout", ()=>{
    console.error("Health check timeout");
    request.destroy();
    process.exit(1)
});

request.end();