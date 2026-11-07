const request = require("supertest");
const app = require("../app");

describe("Observability & API docs", () => {
    afterEach(() => { delete process.env.METRICS_TOKEN; });

    test("GET /metrics exposes Prometheus metrics including request latency", async () => {
        await request(app).get("/health");
        const res = await request(app).get("/metrics");

        expect(res.statusCode).toBe(200);
        expect(res.headers["content-type"]).toMatch(/text\/plain/);
        expect(res.text).toContain("http_request_duration_seconds");
        expect(res.text).toContain('route="/health/"');
        expect(res.text).toContain("webhook_deliveries_total");
        expect(res.text).toContain("payment_verifications_total");
    });

    test("GET /metrics requires the bearer token when METRICS_TOKEN is set", async () => {
        process.env.METRICS_TOKEN = "secret-token";

        const denied = await request(app).get("/metrics");
        expect(denied.statusCode).toBe(401);

        const ok = await request(app).get("/metrics").set("Authorization", "Bearer secret-token");
        expect(ok.statusCode).toBe(200);
    });

    test("GET /api-docs.json serves a valid OpenAPI document covering the main routes", async () => {
        const res = await request(app).get("/api-docs.json");

        expect(res.statusCode).toBe(200);
        expect(res.body.openapi).toMatch(/^3\./);
        expect(res.body.paths).toHaveProperty("/api/checkout/{id}/verify");
        expect(res.body.paths).toHaveProperty("/api/webhooks/deliveries");
    });

    test("responses carry security headers from helmet", async () => {
        const res = await request(app).get("/health");
        expect(res.headers["x-content-type-options"]).toBe("nosniff");
        expect(res.headers["x-powered-by"]).toBeUndefined();
    });
});
