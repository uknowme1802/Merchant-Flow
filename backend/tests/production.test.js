const request = require("supertest");
const express = require("express");
const app = require("../app");
const { validateEnv } = require("../config/env");
const errorMiddleware = require("../middleware/errorMiddleware");
const { allowedOrigins } = require("../config/origins");

describe("request context and error handling", () => {
    test("every response carries an X-Request-Id", async () => {
        const res = await request(app).get("/health");
        expect(res.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    });

    test("a valid caller-supplied X-Request-Id is reused; an unsafe one is replaced", async () => {
        const good = await request(app).get("/health").set("X-Request-Id", "abc-123");
        expect(good.headers["x-request-id"]).toBe("abc-123");

        const bad = await request(app).get("/health").set("X-Request-Id", "x y<script>");
        expect(bad.headers["x-request-id"]).not.toContain("<");
    });

    test("unknown routes return a JSON 404 with the request ID", async () => {
        const res = await request(app).get("/api/does-not-exist");
        expect(res.statusCode).toBe(404);
        expect(res.body).toMatchObject({ success: false, message: "Route not found" });
        expect(res.body.requestId).toBeDefined();
    });

    test("malformed JSON is a 400, not a 500", async () => {
        const res = await request(app).post("/api/auth/login")
            .set("Content-Type", "application/json").send("{ not json");
        expect(res.statusCode).toBe(400);
    });

    test("request bodies over 100kb are rejected", async () => {
        const res = await request(app).post("/api/auth/login").send({ email: "a@b.com", password: "x".repeat(200 * 1024) });
        expect(res.statusCode).toBe(413);
    });

    describe("error middleware", () => {
        const buildApp = () => {
            const a = express();
            a.get("/boom", () => { throw new Error("secret db password in message"); });
            a.get("/teapot", () => { throw Object.assign(new Error("short and stout"), { statusCode: 418 }); });
            a.use(errorMiddleware);
            return a;
        };
        const original = process.env.NODE_ENV;
        afterEach(() => { process.env.NODE_ENV = original; });

        test("in production a 500 never leaks the internal error message", async () => {
            process.env.NODE_ENV = "production";
            const res = await request(buildApp()).get("/boom");
            expect(res.statusCode).toBe(500);
            expect(res.body.message).toBe("Internal Server error");
            expect(JSON.stringify(res.body)).not.toContain("secret db password");
        });

        test("in production a client error (4xx) keeps its message", async () => {
            process.env.NODE_ENV = "production";
            const res = await request(buildApp()).get("/teapot");
            expect(res.statusCode).toBe(418);
            expect(res.body.message).toBe("short and stout");
        });

        test("outside production the real message is shown for debugging", async () => {
            process.env.NODE_ENV = "test";
            const res = await request(buildApp()).get("/boom");
            expect(res.body.message).toContain("secret db password");
        });
    });
});

describe("startup configuration", () => {
    const good = { MONGO_URI: "mongodb://x", SECRET: "a".repeat(40), REFRESH_SECRET: "b".repeat(40) };

    test("refuses to start when a required variable is missing", () => {
        expect(() => validateEnv({ ...good, SECRET: "" })).toThrow(/SECRET/);
        expect(() => validateEnv({})).toThrow(/MONGO_URI, SECRET, REFRESH_SECRET/);
    });

    test("accepts a complete, strong configuration without warnings", () => {
        expect(validateEnv(good)).toEqual([]);
    });

    test("warns about short or identical secrets", () => {
        expect(validateEnv({ ...good, SECRET: "short", REFRESH_SECRET: "short" })).toEqual(
            expect.arrayContaining([expect.stringMatching(/32/), expect.stringMatching(/different/)])
        );
    });

    test("in production it also warns about a public /metrics and missing Redis", () => {
        const warnings = validateEnv({ ...good, NODE_ENV: "production" });
        expect(warnings.join(" ")).toMatch(/METRICS_TOKEN/);
        expect(warnings.join(" ")).toMatch(/REDIS_URL/);
    });
});

describe("CORS origins", () => {
    afterEach(() => { delete process.env.ALLOWED_ORIGINS; });

    test("defaults to the Vercel app and local dev", () => {
        expect(allowedOrigins()).toEqual(expect.arrayContaining(["https://merchant-flow-one.vercel.app", "http://localhost:5173"]));
    });

    test("ALLOWED_ORIGINS overrides the defaults", () => {
        process.env.ALLOWED_ORIGINS = "https://app.example.com, https://admin.example.com";
        expect(allowedOrigins()).toEqual(["https://app.example.com", "https://admin.example.com"]);
    });
});
