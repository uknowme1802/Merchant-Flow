jest.mock("../models/Transaction.js");

const request = require("supertest");
const jwt = require("jsonwebtoken");
const Transaction = require("../models/Transaction");
const app = require("../app");


describe("Dashboard stats - real data aggregation for charts", ()=>{
    beforeEach(()=>{
        jest.clearAllMocks();
    });

    const buildAccessToken = (id, role = "user")=>
        jwt.sign({id, email: "test@test.com", role}, process.env.SECRET, {
            expiresIn: "15m"
        })
    
        test("aggregates revenue ny month and volume by weekday real transaction dates", async () => {
            Transaction.find.mockResolvedValue([
                {amount: 100, status: "Success", date:"2026-01-15T10:00:00.000Z"},
                {amount: 200, status: "Pending", date:"2026-02-16T10:00:00.000Z"},
                {amount: 300, status: "Success", date:"2026-01-25T10:00:00.000Z"},
                {amount: 400, status: "Failed", date:"not-a-real-date"},
            ])

            const token = buildAccessToken("user-1");

            const res=await request(app)
                .get("/api/dashboard")
                .set("Authorization", `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.totalRevenue).toBe(1000);
            expect(res.body.successCount).toBe(2);
            expect(res.body.failedCount).toBe(1);
            expect(res.body.totalTransactions).toBe(4);

            const jan = res.body.revenueChartData.find(m => m.month==="Jan");
            const feb = res.body.revenueChartData.find(m => m.month==="Feb");
            expect(jan.revenue).toBe(400);
            expect(feb.revenue).toBe(200);

            const mon = res.body.transactionChartData.find(d=>d.day ==="mon");
            const thr = res.body.transactionChartData.find(d=>d.day === "thr");
            const sun = res.body.transactionChartData.find(d=>d.day ==="sun");

            expect(mon.transactions).toBe(200);
            expect(thr.transactions).toBe(100);
            expect(sun.transactions).toBe(300);

            expect(res.body.revenueChartData).toHaveLength(12);
            expect(res.body.transactionChartData).toHaveLength(7);
        });

        test("handles zero transaction without crashing" , async ()=>{
            Transaction.find.mockResolvedValue([]);

            const token = buildAccessToken("user-1");

            const res = await request(app)
                .get("/api/dashboard")
                .set("Authorization", `Bearer ${token}`);

            expect(res.statusCode).toBe(200);
            expect(res.body.totalRevenue).toBe(0);
            expect(res.body.revenueChartData.every(m=>m.revenue===0)).toBe(true);
        });
});