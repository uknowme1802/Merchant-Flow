jest.mock("../models/Webhook.js");
jest.mock("../models/WebhookDelivery");

const request = require("supertest");
const jwt = require("jsonwebtoken");
const Webhook = require("../models/Webhook");
const WebhookDelivery = require("../models/WebhookDelivery");
const app = require("../app");

describe("Webhook management (admin-only)", async()=>{
    beforeEach(()=>{
        jest.clearAllMocks();
        Webhook.EVENTS = ["checkout.created", "payment.success"];
        Webhook.generateSecret = jest.fn().mockReturnValue("auto-genreated-secret");
    });

    const buildAccessToken = (id, role) =>
        jwt.sign({
            id,
            email: "test@test.com", 
            role
        }, process.env.SECRET,
        { expiresIn: "15m"}
    );

    test("admin can create a webhook with an explicit secret", async() =>{
        Webhook.create.mockResolvedValue({
            _id: "wh-1",
            url: "https://example.com/hook",
            events: ["payment.success"],
            active: true,
            secret: "my-secret"
        });

        const adminToken = buildAccessToken("admin-1", "admin");

        const res = await request(app)
            .post("/api/webhooks")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({
                url: "https://example.com/hook",
                events: ["payment.success"],
                secret: "my-secret"
            })

        expect(res.statusCode).toBe(201);
        expect(res.body.data.secret).toBe("my-secret");
        expect(Webhook.create).toHaveBeenCalledWith(
            expect.objectContaining({url: "https://example.com/hook", events: ["payment-success"],
            secret: "my-secret"
            })
        )
    });
    
})