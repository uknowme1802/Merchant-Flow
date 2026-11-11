jest.mock("../models/Transaction.js");

const request = require("supertest");
const jwt = require("jsonwebtoken");
const Transaction = require("../models/Transaction");
const app = require("../app");
const { isPrivateAddress, assertPublicUrl } = require("../utils/ssrf");

const token = (id, role = "user") =>
    jwt.sign({ id, email: "t@test.com", role }, process.env.SECRET, { expiresIn: "15m" });

describe("SSRF guard for webhook URLs", () => {
    test.each([
        "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1",
        "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"
    ])("%s is private", (ip) => expect(isPrivateAddress(ip)).toBe(true));

    test.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "93.184.216.34", "2606:4700:4700::1111"])(
        "%s is public", (ip) => expect(isPrivateAddress(ip)).toBe(false)
    );

    describe("assertPublicUrl", () => {
        const original = process.env.NODE_ENV;
        beforeEach(() => { process.env.NODE_ENV = "production"; });
        afterEach(() => { process.env.NODE_ENV = original; delete process.env.WEBHOOK_ALLOW_PRIVATE; });

        test("blocks cloud metadata, loopback and private IP literals", async () => {
            for (const url of ["http://169.254.169.254/latest/meta-data", "http://127.0.0.1:8080/x", "http://10.0.0.5/", "http://[::1]/"]) {
                await expect(assertPublicUrl(url)).rejects.toMatchObject({ status: 400 });
            }
        });

        test("blocks a hostname that resolves to loopback", async () => {
            await expect(assertPublicUrl("http://localhost:3000/hook")).rejects.toMatchObject({ status: 400 });
        });

        test("allows a public IP literal", async () => {
            await expect(assertPublicUrl("https://8.8.8.8/hook")).resolves.toBeUndefined();
        });

        test("WEBHOOK_ALLOW_PRIVATE=true permits local development receivers", async () => {
            process.env.WEBHOOK_ALLOW_PRIVATE = "true";
            await expect(assertPublicUrl("http://localhost:3000/hook")).resolves.toBeUndefined();
        });
    });
});

describe("transaction visibility and paging", () => {
    const chain = (rows = []) => {
        const q = { sort: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue(rows) };
        Transaction.find.mockReturnValue(q);
        Transaction.countDocuments.mockResolvedValue(rows.length);
        return q;
    };
    beforeEach(() => jest.resetAllMocks());

    test("a normal user only queries their own transactions", async () => {
        chain();
        await request(app).get("/api/transactions").set("Authorization", `Bearer ${token("user-7")}`);
        expect(Transaction.find).toHaveBeenCalledWith({ userId: "user-7" });
        expect(Transaction.countDocuments).toHaveBeenCalledWith({ userId: "user-7" });
    });

    test("an admin sees all transactions", async () => {
        chain();
        await request(app).get("/api/transactions").set("Authorization", `Bearer ${token("admin-1", "admin")}`);
        expect(Transaction.find).toHaveBeenCalledWith({});
    });

    test("a user cannot widen the query through the status filter", async () => {
        chain();
        await request(app).get("/api/transactions?status=Success").set("Authorization", `Bearer ${token("user-7")}`);
        expect(Transaction.find).toHaveBeenCalledWith({ userId: "user-7", status: "Success" });
    });

    test("an unknown status value is ignored rather than passed to the database", async () => {
        chain();
        await request(app).get("/api/transactions?status[$ne]=x").set("Authorization", `Bearer ${token("admin-1", "admin")}`);
        expect(Transaction.find).toHaveBeenCalledWith({});
    });

    test("page size is capped at 100 and garbage paging falls back to defaults", async () => {
        const q = chain();
        await request(app).get("/api/transactions?limit=100000&page=abc").set("Authorization", `Bearer ${token("admin-1", "admin")}`);
        expect(q.limit).toHaveBeenCalledWith(100);
        expect(q.skip).toHaveBeenCalledWith(0);
    });

    test("the dashboard is scoped the same way", async () => {
        Transaction.find.mockResolvedValue([]);
        await request(app).get("/api/dashboard").set("Authorization", `Bearer ${token("user-7")}`);
        expect(Transaction.find).toHaveBeenCalledWith({ userId: "user-7" });

        await request(app).get("/api/dashboard").set("Authorization", `Bearer ${token("admin-1", "admin")}`);
        expect(Transaction.find).toHaveBeenLastCalledWith({});
    });
});
