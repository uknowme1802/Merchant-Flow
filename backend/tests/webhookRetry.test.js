jest.mock("../models/Webhook.js");
jest.mock("../models/WebhookDelivery.js");

const request = require("supertest");
const jwt = require("jsonwebtoken");
const Webhook = require("../models/Webhook");
const WebhookDelivery = require("../models/WebhookDelivery");
const app = require("../app");
const { triggerWebhooks, processDueRetries, nextRetryDate, MAX_ATTEMPTS } = require("../utils/webhookDispatcher");

const adminToken = () => jwt.sign({ id: "a1", email: "a@t.com", role: "admin" }, process.env.SECRET, { expiresIn: "15m" });
const activeHook = { _id: "w1", url: "https://x.test", secret: "s", active: true };
const withSecret = (hook) => ({ select: jest.fn().mockResolvedValue(hook) });

describe("webhook retries", () => {
    let originalFetch;
    beforeEach(() => { jest.resetAllMocks(); originalFetch = global.fetch; });
    afterEach(() => { global.fetch = originalFetch; });

    test("backoff schedule grows and stops after MAX_ATTEMPTS", () => {
        const now = Date.now();
        const minutes = (n) => Math.round((nextRetryDate(n).getTime() - now) / 60000);
        expect(minutes(1)).toBe(1);
        expect(minutes(2)).toBe(5);
        expect(minutes(3)).toBe(30);
        expect(minutes(4)).toBe(120);
        expect(nextRetryDate(MAX_ATTEMPTS)).toBeNull();
    });

    test("a failed first delivery is stored with attempts=1 and a scheduled retry", async () => {
        Webhook.find.mockReturnValue({ select: jest.fn().mockResolvedValue([activeHook]) });
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

        await triggerWebhooks("payment.success", { transactionId: "TXN-1" });

        const saved = WebhookDelivery.create.mock.calls[0][0];
        expect(saved.attempts).toBe(1);
        expect(saved.nextRetryAt).toBeInstanceOf(Date);
    });

    test("a successful first delivery schedules no retry", async () => {
        Webhook.find.mockReturnValue({ select: jest.fn().mockResolvedValue([activeHook]) });
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

        await triggerWebhooks("payment.success", { transactionId: "TXN-1" });

        expect(WebhookDelivery.create.mock.calls[0][0].nextRetryAt).toBeNull();
    });

    test("the worker retries a due delivery and records success", async () => {
        const due = { _id: "d1", webhookId: "w1", event: "payment.success", payload: { transactionId: "TXN-1" }, attempts: 1 };
        WebhookDelivery.findOneAndUpdate.mockResolvedValueOnce(due).mockResolvedValueOnce(null);
        Webhook.findById.mockReturnValue(withSecret(activeHook));
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

        const processed = await processDueRetries();

        expect(processed).toBe(1);
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(WebhookDelivery.updateOne).toHaveBeenCalledWith(
            { _id: "d1" },
            { $set: expect.objectContaining({ success: true, attempts: 2, nextRetryAt: null }) }
        );
    });

    test("the final failed attempt stops retrying", async () => {
        const last = { _id: "d2", webhookId: "w1", event: "payment.success", payload: {}, attempts: MAX_ATTEMPTS - 1 };
        WebhookDelivery.findOneAndUpdate.mockResolvedValueOnce(last).mockResolvedValueOnce(null);
        Webhook.findById.mockReturnValue(withSecret(activeHook));
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

        await processDueRetries();

        expect(WebhookDelivery.updateOne).toHaveBeenCalledWith(
            { _id: "d2" },
            { $set: expect.objectContaining({ success: false, attempts: MAX_ATTEMPTS, nextRetryAt: null }) }
        );
    });

    test("an earlier failed attempt reschedules the next retry", async () => {
        const early = { _id: "d5", webhookId: "w1", event: "payment.success", payload: {}, attempts: 1 };
        WebhookDelivery.findOneAndUpdate.mockResolvedValueOnce(early).mockResolvedValueOnce(null);
        Webhook.findById.mockReturnValue(withSecret(activeHook));
        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

        await processDueRetries();

        const update = WebhookDelivery.updateOne.mock.calls[0][1].$set;
        expect(update.attempts).toBe(2);
        expect(update.nextRetryAt).toBeInstanceOf(Date);
    });

    test("retries stop if the webhook was deleted", async () => {
        const due = { _id: "d3", webhookId: "gone", event: "payment.success", payload: {}, attempts: 1 };
        WebhookDelivery.findOneAndUpdate.mockResolvedValueOnce(due).mockResolvedValueOnce(null);
        Webhook.findById.mockReturnValue(withSecret(null));
        global.fetch = jest.fn();

        await processDueRetries();

        expect(global.fetch).not.toHaveBeenCalled();
        expect(WebhookDelivery.updateOne).toHaveBeenCalledWith(
            { _id: "d3" },
            { $set: expect.objectContaining({ nextRetryAt: null }) }
        );
    });

    test("POST /deliveries/:id/replay re-sends and resets the attempt counter", async () => {
        const delivery = { _id: "d4", webhookId: "w1", event: "payment.success", payload: {}, attempts: 5 };
        WebhookDelivery.findById.mockResolvedValue(delivery);
        Webhook.findById.mockReturnValue(withSecret(activeHook));
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

        const res = await request(app).post("/api/webhooks/deliveries/d4/replay")
            .set("Authorization", `Bearer ${adminToken()}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.data.success).toBe(true);
        expect(res.body.data.attempts).toBe(1);
    });

    test("replay of an unknown delivery is a 404; non-admins are refused", async () => {
        WebhookDelivery.findById.mockResolvedValue(null);
        const missing = await request(app).post("/api/webhooks/deliveries/nope/replay")
            .set("Authorization", `Bearer ${adminToken()}`);
        expect(missing.statusCode).toBe(404);

        const userToken = jwt.sign({ id: "u", email: "u@t.com", role: "user" }, process.env.SECRET);
        const denied = await request(app).post("/api/webhooks/deliveries/d4/replay")
            .set("Authorization", `Bearer ${userToken}`);
        expect(denied.statusCode).toBe(403);
    });
});
