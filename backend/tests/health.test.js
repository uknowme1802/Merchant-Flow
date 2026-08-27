const request = require("supertest");
const app = require("../app");

describe("Health API", ()=>{
    test("GET / health should return healthy status", async()=>{
        const response = await request(app)
        .get("/health");

        expect(response.statusCode).toBe(200);

        expect(response.body.success).toBe(true);

        expect(response.body.service).toBe("Merchant-Flow Backend")
        
        expect(response.body.status).toBe("healthy")
    })
})