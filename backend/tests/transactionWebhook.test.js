jest.mock("../models/Transaction.js");
jest.mock("../utils/webhookDispatcher.js");
jest.mock("../socket", () => ({ getIO: () => ({ emit: jest.fn() }) }));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const Transaction = require("../models/Transaction");
const { triggerWebhooks } = require("../utils/webhookDispatcher");
const app = require("../app");

describe("Admin-created transactions and webhooks", () => {
    beforeEach(() => jest.clearAllMocks());

    const adminToken = () =>
        jwt.sign({ id: "admin-1", email: "a@test.com", role: "admin" }, process.env.SECRET, { expiresIn: "15m" });

    const mockSave = (doc) => {
        Transaction.mockImplementation(() => ({ ...doc, save: jest.fn().mockResolvedValue() }));
    };

    test("a Success transaction automatically fires payment.success with its transaction ID", async () => {
        mockSave({ _id: "o1", id: "TXN-100", amount: 750, status: "Success", utr: "123456789012" });

        const res = await request(app)
            .post("/api/transactions")
            .set("Authorization", `Bearer ${adminToken()}`)
            .send({ id: "TXN-100", amount: 750, status: "Success", date: "2026-11-03" });

        expect(res.statusCode).toBe(201);
        expect(triggerWebhooks).toHaveBeenCalledWith(
            "payment.success",
            expect.objectContaining({ transactionId: "TXN-100", amount: 750, status: "Success" })
        );
    });

    test("a Pending transaction does not fire payment.success", async () => {
        mockSave({ _id: "o2", id: "TXN-101", amount: 750, status: "Pending", utr: null });

        const res = await request(app)
            .post("/api/transactions")
            .set("Authorization", `Bearer ${adminToken()}`)
            .send({ id: "TXN-101", amount: 750, status: "Pending", date: "2026-11-03" });

        expect(res.statusCode).toBe(201);
        expect(triggerWebhooks).not.toHaveBeenCalled();
    });
});
