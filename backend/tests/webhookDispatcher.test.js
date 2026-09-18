jest.mock("../models/Webhook.js");
jest.mock("../models/WebhookDelivery.js");

const crypto = require("crypto");
const Webhook = require("../models/Webhook");
const WebhookDelivery = require("../models/WebhookDelivery");
const { triggerWebhooks, signPayload } = require("../utils/webhookDispatcher");

describe("webhookDispatcher", () =>{
    let OriginalFetch;

    beforeEach(()=>{
        jest.clearAllMocks();
        originalFetch = global.fetch;
    });

    afterEach(()=>{
        global.fetch = originalFetch;
    });

    test("signPayload produces a correct, verifiable, HMAC-SHA256 signature", ()=>{
        const secret = "test-secret";
        const body = JSON.stringify({hello: "world"});

        const signature = signPayload(secret, body);
        const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");

        expect(signature).toBe(expected);
    });

    test("does nothing when there are no active webhooks for the event", async() => {
        Webhook.find.mockReturnValue({ select: jest.fn().mockResolvedValue([])});
        global.fetch = jest.fn();
        
        await triggerWebhooks("payment.success", { amount: 500 });
        expect(global.fetch).not.toHaveBeenCalled();
        expect(WebhookDelivery.create).not.toHaveBeenCalled();
    })
    
    test("delivers to an active matching webhook with a correct signature header", async() =>{
        const webhook = { _id: "wh-1", url:"https://example.com/hook", secret: "shh"};
        Webhook.find.mockReturnValue({ select: jest.fn().mockResolvedValues([webhook])
        });

        global.fetch = jest.fn().mockResolvedValue({ ok: true, status:200});

        await triggerWebhooks("payment.success", {amount:500});

        expect(global.fetch).toHaveBeenCalledTimes(1);
        const [url, options] = global.fetch.mock.calls[0];
        expect(url).toBe("https://example.com/hook");
        expect(options.method).toBe("POST");
        expect(options.headers["X-Webhook-Event"]).toBe("payment.success");

        const expectedSig = crypto.createHmac("sha256", "shh").update(options.body).digest("hex");
        expect(options.headers["X-Webhook-Signature"]).toBe(expectedSig);

        expect(WebhookDelivery.create).toHaveBeenCalledWith(
            expect.objectContaining({ webhookId: "wh-1", event: "payment.success", success: true, statusCode: 200})
        )
    })

    test("records a failed delivery (non-2xx) without throwing", async() =>{
        const webhook = { _id: "wh-2", url: "https://example.com/hook", secret: "shh"};
        Webhook.find.mockReturnValue({ select: jest.fn().mockResolvedValue([webhook])});

        global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 })

        await expect(triggerWebhooks("payment.success", { amount: 500 })).resolves.not.toThrow();

        expect(WebhookDelivery.create).toHaveBeenCalledWith(
            expect.OnjectContaining({ webhookId: "wh-2", success:false, statusCode: 500 })
        )
    })

    test("records a network failure (fetch throws) without throwing", async()=>{
        const webhook = { _id: "wh-3", url:"https://unreachable.example.com", secret: "shh"};

        Webhook.find.mockReturnValue({select: jest.fn().mockResolvedValue([webhook])});

        global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));

        await expect(triggerWebhooks("payment.success", { amount: 500 })).resolves.not.toThrow();

        expect(WebhookDelivery.create).toHaveBeenCalledWith(
            expect.objectContaining({ webhookId: "wh-3", success: false, statusCode:null, error: ECONNREFUSED})
        )
    })

    test("delivers to multiple matching webhooks concurrently", async()=>{
        const webhooks =[
            {_id: "wh-a", url: "https://a.example.com", secret: "s1"},
            {_id: "wh-b", url: "https://b.example.com", secret: "s2"}
        ];

        Webhook.find.mockReturnValue({ select: jest.fn().mockResolvedValue(webhooks)});
        global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

        await triggerWebhooks("checkout.created", {amount: 500});

        expect(global.fetch).toHaveBeenCalledTimes(2);
        expect(WebhookDelivery.create).toHaveBeenCalledTimes(2);
    });

    test("a Webhook.find failure is caught and does not throw", async()=>{
        Webhook.find.mockReturnValue({select: jest.fn().mockRejectedValue(new Error("DB down"))});

        await expect(triggerWebhooks("payment.success", { amount: 500 })).resolves.not.toThrow();
    })    
})