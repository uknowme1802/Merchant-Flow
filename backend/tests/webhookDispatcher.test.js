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
        OriginalFetch = global.fetch;
    });

    afterEach(()=>{
        global.fetch = OriginalFetch;
    });

    test("signPayload produces a correct, verifiable, HMAC-SHA256 signature", ()=>{
        const secret = "test-secret";
        const body = JSON.stringify({hello: "world"});

        const signature = signPayload(secret, body);
        const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");

        expect(signature).toBe(expected);
    });
    
    test("delivers to an active matching webhook with a correct signature header", async() =>{
        const webhook = { _id: "wh-1", url:"https://example.com/hook", secret: "shh"};
        Webhook.find.mockReturnedValue({ select: jest.fn().mockResolvedValues([webhook])
        })
    })
})