jest.mock("../models/Transaction.js");
jest.mock("../models/ValidPayment.js");

const request = require("supertest");
const jwt = require("jsonwebtoken");
const Transaction = require("../models/Transaction");
const ValidPayment = require("../models/ValidPayment");
const app = require("../app");

describe("Checkout flow (QR generation + 12-digits UTR verification",()=> {
    beforeEach(()=> {
        jest.clearAllMocks();
    })

    const buildAccessToken = (id, role = "user") => 
        jwt.sign({id, email: "buyer@test.com", role }, process.env.SECRET, {expiresIn:"15m"});

        test("POST /api/checkout creates a Pending order and returns a real QR data URL", async () => {
            const created= {
                _id:"order-1",
                id: "TXN-abc",
                amount: 500,
                status: "Pending",
                utr: null,
                userId: "user-1"
            };
            Transaction.create.mockResolvedValue(created);

            const token = buildAccessToken("user-1");

            const res = await request(app)
                .post("/api/checkout")
                .set("Authorization", `Bearer ${token}`)
                .send({amount: 500});

            expect(res.statusCode).toBe(201);
            expect(res.body.data.status).toBe("Pending");
            expect(res.body.qrCode).toMatch(/^data:image\/png;base64,/);
        });

        test("verify rejects the utr that isn't exactly 12 digits", async () => {
            const token = buildAccessToken("user-1")
            const res = await request(app)
                .post("/api/checkout/order-2/verify")
                .set("Authorization", `Bearer ${token}`)
                .send({utr: "12345"})

            expect(res.statusCode).toBe(400);
            expect(res.body.message).toMatch(/12 digits/); //fail before checking DB
            expect(Transaction.findById).not.toHaveBeenCalled();
        })

        test("verify succeeds when a valid 12-digits UTR + amount match an unused ValidPayment", async ()=> {
            const txn = {
                _id: "order-3",
                amount:500,
                status: "Pending",
                userId: "user-1",
                utr: null,
                save:jest.fn().mockResolvedValue(true)
            }

            const matchingPayment = {
                utr:"968574859685",
                amount: 500,
                used:false,
                save: jest.fn().mockResolvedValue(true)
            };

            Transaction.findById.mockResolvedValue(txn);
            ValidPayment.findOne.mockResolvedValue(matchingPayment);

            const token = buildAccessToken("user-1");

            const res = await request(app)
                .post("/api/checkout/order-3/verify")
                .set("Authorization", `Bearer ${token}`)
                .send({utr: "968574859685"});

            expect(res.statusCode).toBe(200);
            expect(res.body.verified).toBe(true);
            expect(txn.status).toBe("Success");
            expect(matchingPayment.used).toBe(true);
        });

        test("Verify stays Pending when the 12-digit UTR doesn't match any ValidPayment", async() => {
            const txn={
                _id: "order-4",
                amount: 500,
                status:"Pending",
                userId:"user-1",
                utr:null,
                save: jest.fn().mockResolvedValue(true)
            };

            Transaction.findById.mockResolvedValue(txn);
            ValidPayment.findOne.mockResolvedValue(null);

            const token = buildAccessToken("user-1")

            const res = await request(app)
                .post("/api/checkout/order-4/verify")
                .set("Authorization", `Bearer ${token}`)
                .send({utr: "000000000000"});

            expect(res.statusCode).toBe(200);
            expect(res.body.verified).toBe(false);
            expect(txn.status).toBe("Pending");
        })
})

describe("Checkout-already-used UTR gets a distinct message", ()=>{
    beforeEach(()=>{
        jest.clearAllMocks();
    });

    const buildAccessToken= (id, role ="user") =>
        jwt.sign({ id, email:"buyer@test.com", role}, process.env.SECRET, {
            expiresIn: "15m"
        });

    test("a UTR thats exists but is already used returns alreadyUsed:true with its own message", async () => {
        const txn = {
            _id: "order-used",
            amount: 500,
            status: "Pending",
            userId: "user-1",
            utr: null,
            save: jest.fn().mockResolvedValue(true)
        };

        const usedRecord = {
            utr: "968574859685",
            amount: 500,
            used: true
        };

        Transaction.findById.mockResolvedValue(txn);
        ValidPayment.findOne.mockResolvedValue(usedRecord);

        const token = buildAccessToken("user-1");

        const res = await request(app)
            .post("/api/checkout/order-used/verify")
            .set("Authorization", `Bearer ${token}`)
            .send({utr: "968574859685"});

        expect(res.statusCode).toBe(200);
        expect(res.body.verified).toBe(false);
        expect(res.body.alreadyUsed).toBe(true);
        expect(y=txn.status).toBe("Pending");
    });
    test("admin (no leading/trailing space bug) can verify another user's order", async () => {
        const txn = {
            _id: "order-admin-check",
            amount: 500,
            status: "Pending",
            utr: null,
            userId : "some-other-user",
            save: jest.fn().mockResolvedValue(true)
        };

        const matchingPayment = {
            utr: "9685748596850",
            amount: 500,
            used: false,
            save: jest.fn().mockResolvedValue(true)
        };

        Transaction.findById.mockResolvedValue(txn);
        ValidPayment.findOne.mockResolvedValue(matchingPayment);

        const adminToken = buildAccessToken("admin-1","admin");

        const res = await request(app)
            .post("/api/checkout/order-admin-check/verify")
            .set("Authorization", `Bearer ${adminToken}`)
            .send({utr: "968574859685"});

        expect(res.statusCode).toBe(200);
        expect(res.body.verified).toBe(true);
    })
})