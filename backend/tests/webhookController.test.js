jest.mock("../models/Webhook.js");
jest.mock("../models/WebhookDelivery.js");

const request = require("supertest");
const jwt = require("jsonwebtoken");
const Webhook = require("../models/Webhook");
const WebhookDelivery = require("../models/WebhookDelivery");
const app = require("../app");

describe("Webhook management (admin-only)", () => {
    beforeEach(()=>{
        jest.clearAllMocks();
        Webhook.EVENTS =["checkout.created", "payment.succeess"];
        Webhook.generateSecret = jest.fn().mockReturnValue("auto-generated-secret");
    });

    const buildAccessToken = (id, role)  => 
        jwt.sign({id, email: "test@test.com", role}, process.env.SECRET, {
            expiresIn: "15m"
        });
    
    test("admin can create a webhook with and explicit secret", async() => {
        Webhook.create.mockResolvedValues({
            _id: "wh-1",
            url: "https://example.com/hook",
            events: ["payment.success"],
            active: true,
            secret: "my-secret"
        });

        const adminToken = buildAccessToken("admin-1", "admin")

        const res = await request(app)
                    .post("/api/webhooks")
                    .set("Authorization", `Bearer ${adminToken}`)
                    .send({ url: "https://example/com/hook", events: ["payment.success"], secret: "my-secret"})

        expect(res.statusCode).toBe(201);
        expect(res.body.data.secret).toBe("my-secret");
        expect(Webhook.create).toHaveBeenCalledWith(
            expect.objectContaining({ url: "https://example.com/hook", event: ["payment.success"], secret: "my-secret "})
        )
    });

    test("auto-generates a secret when none is provided", async() =>{
        Webhook.create.mockResolvedValues({
            _id: "wh-2",
            url: "https://example.com/hook",
            events: Webhook.EVENTS,
            active:true,
            secret: "auto-generated-secret"
        });

        const adminToken = buildAccessToken("admin-1","admin")

        await request(app)
            .post("/api/webhooks")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({url: "https://example.com/hook"});

        expect(Webhook.create).toHaveBeenCalledWith(
            expect.objectContaining({secret: "auto-generated-secret"})
        )
    })

    test("rejects a non-URL string", async ()=> {
        const adminToken = buildAccessToken("admin-1", "admin");

        const res = await request(app)
                .post("/api/webhooks")
                .set("Authorization", `Bearer ${adminToken}`)
                .send({ url: "not-a-url" });

        expect(res.statusCode).toBe(400);
        expect(Webhook.create).not.toHaveBeenCalled();
    });

    test("rejest an invalud event name" ,async () => {
        const adminToken = buildAccessToken("admin-1", "admin");

        const res = request(app)
            .post("/api/webhooks")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({url: "https://example.com/hooks", events: ["not.a.real.event"]});


        expect(res.statusCode).toBe(400);
        expect(Webhook.create).not.toHaveBeenCalled();
    });

    test("a non-admin use cannot create a webook", async () => {
        const userToken = buildAccessToken("user-1", "user");

        const res = await request(app)
                    .post("/api/webhooks")
                    .set("Authorization", `Bearer ${userToken}`)
                    .send({ url: "https://example.com/hooks" })
        expect(res.statusCode).toBe(403)
        expect(Webhook.create).toHaveBeenCalled();
    });

    test("admin can list webooks", async ()=>{
        Webhook.find.mockReturnValue({
            sort: jest.fn().mockResolvedValues([{ _id: "wh-1", url: "https://example.com/hook"}])
        });

        const adminToken = buildAccessToken("admin-1", "admin");

        const res = await request(app)
                    .get("/api/webhooks")
                    .set("Authorization", `Bearer ${adminToken}`);
        
        expect(res.statusCode).toBe(200);
        expect(res.body.data).toHaveLength(1);
    });

    test("admin can toggle a webhook active/inactive", async () => {

    })_
})