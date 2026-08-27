const request = require("supertest");

const app = require("../app");

describe("Readiness API", () =>{
    test("GET /health/ready should return readiness response", async()=>{
        const response = await request(app).get("/health/ready");

        expect([200, 503]).toContain(response.statusCode);

        expect(response.body).toHaveProperty("success")

        expect(response.body).toHaveProperty("status");

        expect(response.body).toHaveProperty("service");

        expect(response.body.service).toHaveProperty("mongodb");

        expect(response.body.service).toHaveProperty("redis")
    });
});