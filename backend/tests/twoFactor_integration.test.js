jest.mock("../models/User.js");

const request = require("supertest");
const bcrypt = require("bcryptjs");
const {authenticator} = require("otplib");
const User = require("../models/User");
const app = require("../app");
const { verify } = require("jsonwebtoken");
const { addAbortListener } = require("supertest/lib/test");
const { refreshToken } = require("../controllers/authController");

describe("2fa end-to-end flow",()=>{
    beforeEach(()=>{
        jest.clearAllMocks()
    })

    test("full flow: setup -> enable -> login requires 2FA -> verify-login succeeds", async ()=>{
        const secret = authenticator.generateSecret();

        const mockUser = {
            _id: "user-id-123",
            id: "user-id-123",
            email: "twofa@test.com",
            role: "user",
            password: await bcrypt.hash("Password123!",10),
            refreshToken: null,
            twoFactor: { enabled: true, secret, tempSecret: null },
            save:jest.fn().mockResolvedValue(true)
        };

        User.findOne.mockReturnValue({
            select: jest.fn().mockResolvedValue(mockUser)
        })

        const loginRes = await request(app)
                        .post("/api/auth/login")
                        .send({ email: "twofa@test.com", password: "Password123!"});

        expect(loginRes.statusCode).toBe(200);
        expect(loginRes.body.twoFactorRequired).toBe(true);
        expect(loginRes.body).toHaveProperty("pendingToken");
        expect(loginRes.body).not.toHaveProperty("accessToken");

        User.findById.mockReturnValue({
            select: jest.fn().mockResolvedValue(mockUser)
        })

        const validCode = authenticator.generate(secret);

        const verifyRes = await request(app)
                        .post("/api/auth/2fa/verify-login")
                        .send({
                            pendingToken: loginRes.body.pendingToken,
                            token: validCode
                        })
        
        expect(verifyRes.statusCode).toBe(200);
        expect(verifyRes.body.success).toBe(true);
        expect(verifyRes.body).toHaveProperty("accessToken");
        expect(verifyRes.body).toHaveProperty("refreshToken");
        expect(verifyRes.body.user.email).toBe("twofa@test.com");
    })

    test("verify-login rejects and invalid code", async ()=>{
        const secret = authenticator.generateSecret();
        const mockUser = {
            _id: "user-id-456",
            email: "twofa@test.com",
            role: "user",
            twoFactor: {enabled: true, secret, tempSecret: null },
            save: jest.fn().mockResolvedValue(true)
        };

        const jwt = require("jsonwebtoken");
        const pendingToken = jwt.sign({
            id: mockUser._id,
            type: "2fa_pending"
        },
        process.env.SECRET,
        { expiresIn: "5m"});

    User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
    });

    const res = await request(app)
    .post("/api/auth/2fa/verify-login")
    .send({pendingToken, token: "000000"});

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    })
    test("login without 2fa enabled still returns tokens directly (no regression)", async ()=>{
        const mockUser = {
            _id: "user-id-789",
            email: "no2fa@test.com",
            role: "user",
            password: await bcrypt.hash("Password123!", 10),
            refreshToken:null,
            twoFactor: { enabled: false, secret: null, tempSecret: null },
            save: jest.fn().mockResolvedValue(true)
        };

        User.findOne.mockReturnValue({
            select: jest.fn().mockResolvedValue(mockUser)
        })

        const res = await request(app)
        .post("/api/auth/login")
        .send({ email: "no2fa@test.com", password: "Password123!"});

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty("accessToken");
        expect(res.body).toHaveProperty("refreshToken");
        expect(res.body.twoFactorRequired).toBeUndefined();
    })
})