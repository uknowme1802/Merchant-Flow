jest.mock("../models/Transaction.js");
jest.mock("../models/ValidPayment.js");
jest.mock("../models/User.js");
jest.mock("../models/Webhook.js");
jest.mock("../utils/webhookDispatcher.js");
jest.mock("../socket", () => ({ getIO: () => ({ emit: jest.fn() }) }));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const Transaction = require("../models/Transaction");
const ValidPayment = require("../models/ValidPayment");
const User = require("../models/User");
const Webhook = require("../models/Webhook");
const app = require("../app");

const token = (id, role = "user") =>
    jwt.sign({ id, email: "t@test.com", role }, process.env.SECRET, { expiresIn: "15m" });

describe("Input validation (Joi)", () => {
    beforeEach(() => jest.resetAllMocks());

    test("checkout rejects amounts with more than 2 decimals, zero, negatives and non-numbers", async () => {
        for (const amount of [10.123, 0, -5, "abc", undefined]) {
            const res = await request(app).post("/api/checkout")
                .set("Authorization", `Bearer ${token("u1")}`).send({ amount });
            expect(res.statusCode).toBe(400);
        }
        expect(Transaction.create).not.toHaveBeenCalled();
    });

    test("admin addTransaction strips unknown fields (no mass assignment)", async () => {
        Transaction.mockImplementation((doc) => ({ ...doc, save: jest.fn().mockResolvedValue() }));

        const res = await request(app).post("/api/transactions")
            .set("Authorization", `Bearer ${token("a1", "admin")}`)
            .send({ id: "TXN-1", amount: 100, status: "Pending", date: "2026-11-03", userId: "evil", isAdmin: true, _id: "forced" });

        expect(res.statusCode).toBe(201);
        const passed = Transaction.mock.calls[0][0];
        expect(passed).not.toHaveProperty("userId");
        expect(passed).not.toHaveProperty("isAdmin");
        expect(passed).not.toHaveProperty("_id");
        expect(passed.id).toBe("TXN-1");
    });

    test("admin addTransaction rejects an invalid status", async () => {
        const res = await request(app).post("/api/transactions")
            .set("Authorization", `Bearer ${token("a1", "admin")}`)
            .send({ id: "TXN-2", amount: 100, status: "Hacked", date: "2026-11-03" });
        expect(res.statusCode).toBe(400);
    });

    test("addTransaction returns 409 on a duplicate transaction ID", async () => {
        Transaction.mockImplementation((doc) => ({
            ...doc,
            save: jest.fn().mockRejectedValue(Object.assign(new Error("dup"), { code: 11000 }))
        }));
        const res = await request(app).post("/api/transactions")
            .set("Authorization", `Bearer ${token("a1", "admin")}`)
            .send({ id: "TXN-3", amount: 100, status: "Pending", date: "2026-11-03" });
        expect(res.statusCode).toBe(409);
    });

    test("createUser rejects a weak password and a bad email", async () => {
        const weak = await request(app).post("/api/users")
            .set("Authorization", `Bearer ${token("a1", "admin")}`).send({ email: "a@b.com", password: "123" });
        const badEmail = await request(app).post("/api/users")
            .set("Authorization", `Bearer ${token("a1", "admin")}`).send({ email: "nope", password: "longenough1" });
        expect(weak.statusCode).toBe(400);
        expect(badEmail.statusCode).toBe(400);
        expect(User).not.toHaveBeenCalled();
    });

    test("webhook secrets shorter than 16 characters are rejected", async () => {
        Webhook.EVENTS = ["checkout.created", "payment.success"];
        const res = await request(app).post("/api/webhooks")
            .set("Authorization", `Bearer ${token("a1", "admin")}`)
            .send({ url: "https://example.com/hook", secret: "short" });
        expect(res.statusCode).toBe(400);
        expect(Webhook.create).not.toHaveBeenCalled();
    });

    test("login with a missing password is rejected before hitting the database", async () => {
        const res = await request(app).post("/api/auth/login").send({ email: "a@b.com" });
        expect(res.statusCode).toBe(400);
        expect(User.findOne).not.toHaveBeenCalled();
    });
});

describe("Checkout idempotency", () => {
    beforeEach(() => jest.resetAllMocks());

    const existing = { _id: "o1", id: "TXN-existing", amount: 500, status: "Pending", userId: "u1" };

    test("a repeated Idempotency-Key returns the original order and creates nothing new", async () => {
        Transaction.findOne.mockResolvedValue(existing);

        const res = await request(app).post("/api/checkout")
            .set("Authorization", `Bearer ${token("u1")}`)
            .set("Idempotency-Key", "order-abc-1")
            .send({ amount: 500 });

        expect(res.statusCode).toBe(200);
        expect(res.headers["idempotent-replayed"]).toBe("true");
        expect(res.body.data.id).toBe("TXN-existing");
        expect(res.body.qrCode).toMatch(/^data:image\/png;base64,/);
        expect(Transaction.create).not.toHaveBeenCalled();
    });

    test("a new Idempotency-Key creates the order and stores the key", async () => {
        Transaction.findOne.mockResolvedValue(null);
        Transaction.create.mockResolvedValue(existing);

        const res = await request(app).post("/api/checkout")
            .set("Authorization", `Bearer ${token("u1")}`)
            .set("Idempotency-Key", "order-abc-2")
            .send({ amount: 500 });

        expect(res.statusCode).toBe(201);
        expect(Transaction.create).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "order-abc-2" }));
    });

    test("two simultaneous requests: the loser of the unique-index race gets the winner's order", async () => {
        Transaction.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
        Transaction.create.mockRejectedValue(Object.assign(new Error("dup"), { code: 11000 }));

        const res = await request(app).post("/api/checkout")
            .set("Authorization", `Bearer ${token("u1")}`)
            .set("Idempotency-Key", "order-abc-3")
            .send({ amount: 500 });

        expect(res.statusCode).toBe(200);
        expect(res.body.data.id).toBe("TXN-existing");
    });

    test("a malformed Idempotency-Key is rejected", async () => {
        const res = await request(app).post("/api/checkout")
            .set("Authorization", `Bearer ${token("u1")}`)
            .set("Idempotency-Key", "bad key with spaces!")
            .send({ amount: 500 });
        expect(res.statusCode).toBe(400);
    });

    test("no key: every request creates a new order (legacy behaviour)", async () => {
        Transaction.create.mockResolvedValue(existing);
        const res = await request(app).post("/api/checkout")
            .set("Authorization", `Bearer ${token("u1")}`).send({ amount: 500 });
        expect(res.statusCode).toBe(201);
        expect(Transaction.findOne).not.toHaveBeenCalled();
    });
});

describe("Atomic UTR verification", () => {
    beforeEach(() => jest.resetAllMocks());

    test("a concurrent verify of the SAME order that lost the claim still reports verified", async () => {
        const txn = { _id: "o1", amount: 500, status: "Pending", userId: "u1", save: jest.fn() };
        Transaction.findById
            .mockResolvedValueOnce(txn)
            .mockResolvedValueOnce({ ...txn, status: "Success", utr: "123456789012" });
        ValidPayment.findOneAndUpdate.mockResolvedValue(null);
        ValidPayment.findOne.mockResolvedValue({ used: true, usedBy: "o1" });

        const res = await request(app).post("/api/checkout/o1/verify")
            .set("Authorization", `Bearer ${token("u1")}`).send({ utr: "123456789012" });

        expect(res.statusCode).toBe(200);
        expect(res.body.verified).toBe(true);
        expect(txn.save).not.toHaveBeenCalled();
    });

    test("the same UTR cannot verify a different order once it was consumed", async () => {
        const txn = { _id: "o2", amount: 500, status: "Pending", userId: "u1", save: jest.fn().mockResolvedValue() };
        Transaction.findById.mockResolvedValue(txn);
        ValidPayment.findOneAndUpdate.mockResolvedValue(null);
        ValidPayment.findOne.mockResolvedValue({ used: true, usedBy: "o1" });

        const res = await request(app).post("/api/checkout/o2/verify")
            .set("Authorization", `Bearer ${token("u1")}`).send({ utr: "123456789012" });

        expect(res.body.verified).toBe(false);
        expect(res.body.alreadyUsed).toBe(true);
    });

    test("if marking the order Success fails, the payment code is released", async () => {
        const txn = { _id: "o3", amount: 500, status: "Pending", userId: "u1" };
        Transaction.findById.mockResolvedValue(txn);
        ValidPayment.findOneAndUpdate.mockResolvedValue({ _id: "vp1" });
        Transaction.findOneAndUpdate.mockRejectedValue(new Error("db down"));
        ValidPayment.updateOne.mockResolvedValue({});

        const res = await request(app).post("/api/checkout/o3/verify")
            .set("Authorization", `Bearer ${token("u1")}`).send({ utr: "123456789012" });

        expect(res.statusCode).toBe(500);
        expect(ValidPayment.updateOne).toHaveBeenCalledWith({ _id: "vp1" }, { $set: { used: false, usedBy: null } });
    });
});
