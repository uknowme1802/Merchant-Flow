jest.mock("../models/Webhook.js");
jest.mock("../models/WebhookDelivery.js");

const request = require("supertest");
const jwt = require("jsonwebtoken");
const Webhook = require("../models/Webhook");
const WebhookDelivery = require("../models/WebhookDelivery");
const app = require("../app");
// const { build } = require("joi");

describe("Webhook management (admin-only)", () => {
    beforeEach(()=>{
        jest.clearAllMocks();
        Webhook.EVENTS =["checkout.created", "payment.success"];
        Webhook.generateSecret = jest.fn().mockReturnValue("auto-generated-secret");
    });

    const buildAccessToken = (id, role)  => 
        jwt.sign({id, email: "test@test.com", role}, process.env.SECRET, {
            expiresIn: "15m"
        });
    
    test("admin can create a webhook with and explicit secret", async() => {
        Webhook.create.mockResolvedValue({
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
                    .send({ url: "https://example.com/hook", events: ["payment.success"], secret: "my-secret"})

        expect(res.statusCode).toBe(201);
        expect(res.body.data.secret).toBe("my-secret");
        expect(Webhook.create).toHaveBeenCalledWith(
            expect.objectContaining({ url: "https://example.com/hook", events: ["payment.success"], secret: "my-secret"})
        )
    });

    test("auto-generates a secret when none is provided", async() =>{
        Webhook.create.mockResolvedValue({
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

    test("reject an invalid event name", async () => {
        const adminToken = buildAccessToken("admin-1", "admin");

        const res = await request(app)
            .post("/api/webhooks")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({url: "https://example.com/hooks", events: ["not.a.real.event"]});


        expect(res.statusCode).toBe(400);
        expect(Webhook.create).not.toHaveBeenCalled();
    });

    test("a non-admin user cannot create a webook", async () => {
        const userToken = buildAccessToken("user-1", "user");

        const res = await request(app)
                    .post("/api/webhooks")
                    .set("Authorization", `Bearer ${userToken}`)
                    .send({ url: "https://example.com/hooks" })
        expect(res.statusCode).toBe(403);
        expect(Webhook.create).not.toHaveBeenCalled();
    });

    test("admin can list webhooks", async ()=>{
        Webhook.find.mockReturnValue({
            sort: jest.fn().mockResolvedValue([{ _id: "wh-1", url: "https://example.com/hook"}])
        });

        const adminToken = buildAccessToken("admin-1", "admin");
        
        const res = await request(app)
                    .get("/api/webhooks")
                    .set("Authorization", `Bearer ${adminToken}`);
        
        expect(res.statusCode).toBe(200);
        expect(res.body.data).toHaveLength(1);
    });

    test("admin can toggle a webhook active/inactive", async () => {
        Webhook.findByIdAndUpdate.mockResolvedValue({_id: "wh-1", active: false });

        const adminToken = buildAccessToken("admin-1", "admin");

        const res = await request(app)
                    .patch("/api/webhooks/wh-1")
                    .set("Authorization", `Bearer ${adminToken}`)
                    .send({ active: false });

        expect(res.statusCode).toBe(200);
        expect(res.body.data.active).toBe(false);
    });

    test("toggling a non-existent webhook returns 404", async () =>{
        Webhook.findByIdAndUpdate.mockResolvedValue(null);

        const adminToken = buildAccessToken("admin-1","admin");

        const res = await request(app)
                    .patch("/api/webhooks/does-not-exist")
                    .set("Authorization", `Bearer ${adminToken}`)
                    .send({active: false});

        expect(res.statusCode).toBe(404);
    });

    test("admin can delete a webhook", async() => {
        Webhook.findByIdAndDelete.mockResolvedValue({ _id: "wh-1" });

        const adminToken = buildAccessToken("admin-1", "admin" );

        const res = await request(app)
                    .delete("/api/webhooks/wh-1")
                    .set("Authorization", `Bearer ${adminToken}`);

        expect(res.statusCode).toBe(200)
    });

    test("admin can view recent deliveries for a webhook", async () =>{
        WebhookDelivery.find.mockReturnValue({
            sort: jest.fn().mockReturnValue({
                limit: jest.fn().mockResolvedValue([
                    { event: "payment.success", success: true, statusCode: 200 }
                ])
            })
        });

        const adminToken = buildAccessToken("admin-1", "admin")

        const res = await request(app)
            .get("/api/webhooks/wh-1/deliveries")
            .set("Authorization", `Bearer ${adminToken}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.data).toHaveLength(1);
    });
});