jest.mock("../models/User.js");

const request = require("supertest");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const app = require("../app");

describe("2FA against a legacy user (no twofactor field at all)", () => {
    beforeEach(()=>{
        jest.clearAllMocks();
    });

    const buildAccessToken = (id) => 
        jwt.sign({id, email: "legacy@test.com", role: "admin"}, process.env.SECRET, { expiresIn: "15m"});

    test("GET /2fa/status does not 500 for a pre-existing user with no twofacto field", async () => {
        const legacyUser = {
            _id:"legacy-id-1",
            email:"legacy@test.com",
            role: "admin"
        };

        User.findById.mockResolvedValue(legacyUser);

        const token = buildAccessToken("legacy-id-1");

        const res = await request(app)
                    .get("/api/2fa/status")
                    .set("Authorization", `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.enabled).toBe(false);
    });

    test("POST /2fa/setup does not 500 for a legacy use (write path, not just read)", async () => {
        const legacyUser = {
            _id: "legacy-id-2",
            email: "legacy2@test.com",
            role: "admin",
            save: jest.fn().mockResolvedValue(true),
            markModified: jest.fn()
        };

        User.findById.mockResolvedValue(legacyUser);

        const token = buildAccessToken("legacy-id-2");

        const res=await request(app)
            .post("/api/2fa/setup")
            .set("Authorization", `Bearer ${token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty("qrCode");
        expect(res.body).toHaveProperty("secret");
        expect(legacyUser.save).toHaveBeenCalled();
    });
});