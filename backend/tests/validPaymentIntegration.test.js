jest.mock("../models/ValidPayment.js");

const request = require("supertest");
const jwt = require("jsonwebtoken");
const ValidPayment = require("../models/ValidPayment");
const app = require("../app");

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
            used: false
        });

        const adminToken = buildAccessToken("admin-1","admin");

        const res= await request(app)
            .post("/api/valid-payments")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({amount: 500, utr: "968574859685"});

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(ValidPayment.create).toHaveBeenCalledWith({utr: "968574859685", amount: 500});
    })

    test("a regular user cannot create a valid payment pair", async()=> {
        const userToken = buildAccessToken("user-1", "user");

        const res = await request(app)
            .post("/api/valid-payments")
            .set("Authorization", `Bearer ${userToken}`)
            .send({amount: 500, utr:"968574859685"})

        expect(res.statusCode).toBe(403);
        expect(ValidPayment.create).not.toHaveBeenCalled();
    });

    test("rejects a UTR that isn't exactly 12 digits", async()=>{
        const adminToken = buildAccessToken("admin-1", "admin");

        const res = await request(app)
            .post("/api/valid-payments")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({amount: 500, utr: "123"});

        expect(res.statusCode).toBe(400);
        expect(ValidPayment.create).not.toHaveBeenCalled();
    })

    test("rejects a duplicate UTR with 409", async () =>{
        const duplicateErr = new Error("duplicate key");
        duplicateErr.code = 11000;
        ValidPayment.create.mockRejectedValue(duplicateErr);

        const adminToken = buildAccessToken("admin-1", "admin");

        const res = await request(app)
            .post("/api/valid-payments")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({amount: 500, utr: "968574859685"});

        expect(res.statusCode).toBe(409);
    })

    test("admin can list all valid payments", async () => {
        ValidPayment.find.mockReturnValue({
            sort: jest.fn().mockResolvedValue([
                { utr: "968574859685", amount: 500, used: false }
            ])
        });

        const adminToken = buildAccessToken("admin-1", "admin");

        const res = await request(app)
            .get("/api/valid-payments")
            .set("Authorization", `Bearer ${adminToken}`)

        expect(res.statusCode).toBe(200);
        expect(res.body.data).toHaveLength(1);
    })
})