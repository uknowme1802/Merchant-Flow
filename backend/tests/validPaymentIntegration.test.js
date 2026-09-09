jest.mock("../models/ValidPayment.js");

const request = require("supertest");
const jwt = require("jsonwebtoken");
const ValidPayment = require("../models/ValidPayment");
const app = require("../app");
const { build } = require("joi");

describe("Admin ValidPayment management (GUI-created UTR + amount pairs)",() => {
    beforeEach(()=>{
        jest.clearAllMocks();
    });

    const buildAccessToken = (id, role) =>
        jwt.sign({id, email: "test@test.com", role}, process.env.SECRET, {expiresIn: "15m"});

    test("admin can create a valid UTR + amount pair", async () => {
        ValidPayment.create.mockResolvedValue({
            _id: "vp-1",
            utr: "968574859685",
            amount: 500,
            used:false
        });

        const adminToken = buildAccessToken("admin-1","admin");

        const res= await request(app)
            .post("/api/valid-payments")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({amount: 500, utr: "968574859685"});

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(ValidPayment.create).toHavebeenCalledWith({utr: "968574859685", amount: 500});
    })

    test("a regular user cannot create a valid payment pair", async()=> {
        const userToken = buildAccessToken("user-1", "user");

        const res = await request(app)
            .post("/api/valid-payments")
            .set("Authorization", `Bearer ${token}`)
    })
})