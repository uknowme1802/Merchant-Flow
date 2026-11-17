// Phase 2a core, against a real (in-memory) MongoDB: bank selection, order creation and the
// UTR claim, including the races that mocked models cannot show.

const mongoose = require("mongoose");
const db = require("./helpers/realDb");
const BankCredit = require("../models/BankCredit");
const Order = require("../models/Order");
const { selectBank } = require("../services/bankSelectionService");
const { createOrder, expireIfDue, expireDueOrders, getOrderByPublicId } = require("../services/orderService");
const { addCredit, listCredits } = require("../services/bankCreditService");
const { claimPayment, CLAIM } = require("../services/claimService");
const { startOfIstDay } = require("../utils/istDay");

jest.setTimeout(60000);

beforeAll(db.connect);
afterEach(db.clear);
afterAll(db.disconnect);

const {
    nextUtr, makeMerchant, makeBank, mapBank, makeCredit: credit, makeOrderOn: createOrderOn, setupMerchantWithBank: setup
} = require("./helpers/realFixtures");

const orderInput = (overrides = {}) => ({ amountPaise: 50000, description: "", customerName: "", ...overrides });

describe("startOfIstDay", () => {
    it("returns midnight IST (18:30 UTC the day before)", () => {
        // 2026-11-17 02:00 UTC is 07:30 IST on the 17th, so the IST day began at 2026-11-16 18:30 UTC.
        expect(startOfIstDay(new Date("2026-11-17T02:00:00Z")).toISOString()).toBe("2026-11-16T18:30:00.000Z");
        // 2026-11-17 20:00 UTC is already 01:30 IST on the 18th.
        expect(startOfIstDay(new Date("2026-11-17T20:00:00Z")).toISOString()).toBe("2026-11-17T18:30:00.000Z");
    });
});

describe("selectBank", () => {
    it("returns the merchant's only eligible bank", async () => {
        const { merchant, bank } = await setup();
        expect(String((await selectBank(merchant, 50000))._id)).toBe(String(bank._id));
    });

    it("fails with 503 NO_BANK_AVAILABLE when nothing is mapped", async () => {
        const merchant = await makeMerchant();
        await expect(selectBank(merchant, 50000)).rejects.toMatchObject({ statusCode: 503, errorCode: "NO_BANK_AVAILABLE" });
    });

    it.each([
        ["inactive", { status: "inactive" }],
        ["unverified", { verified: false }],
        ["IMPS only", { methods: ["IMPS"] }]
    ])("skips a %s bank", async (_name, bankFields) => {
        const merchant = await makeMerchant();
        await mapBank(merchant, await makeBank(bankFields));
        await expect(selectBank(merchant, 50000)).rejects.toMatchObject({ statusCode: 503 });
    });

    it("skips a mapping that is switched off, and banks mapped to other merchants", async () => {
        const merchant = await makeMerchant();
        const other = await makeMerchant();
        await mapBank(merchant, await makeBank(), { active: false });
        await mapBank(other, await makeBank());
        await expect(selectBank(merchant, 50000)).rejects.toMatchObject({ statusCode: 503 });
    });

    it("picks the bank with the fewest orders today", async () => {
        const merchant = await makeMerchant();
        const busy = await makeBank();
        const quiet = await makeBank();
        await mapBank(merchant, busy);
        await mapBank(merchant, quiet);
        await createOrderOn(merchant, busy);
        await createOrderOn(merchant, busy);
        await createOrderOn(merchant, quiet);

        for (let i = 0; i < 5; i++) {
            expect(String((await selectBank(merchant, 50000))._id)).toBe(String(quiet._id));
        }
    });

    it("does not count yesterday's orders", async () => {
        const merchant = await makeMerchant();
        const a = await makeBank();
        const b = await makeBank();
        await mapBank(merchant, a);
        await mapBank(merchant, b);
        // Three old orders on bank a; one fresh order on bank b. Today bank a is the quiet one.
        const old = new Date(startOfIstDay().getTime() - 60 * 60 * 1000);
        for (let i = 0; i < 3; i++) {
            const o = await createOrderOn(merchant, a);
            await Order.collection.updateOne({ _id: o._id }, { $set: { createdAt: old } });
        }
        await createOrderOn(merchant, b);

        expect(String((await selectBank(merchant, 50000))._id)).toBe(String(a._id));
    });

    it("uses both banks when they are tied", async () => {
        const merchant = await makeMerchant();
        const a = await makeBank();
        const b = await makeBank();
        await mapBank(merchant, a);
        await mapBank(merchant, b);
        const seen = new Set();
        for (let i = 0; i < 40; i++) seen.add(String((await selectBank(merchant, 50000))._id));
        expect(seen.size).toBe(2);
    });

    it("prefers the bank that holds an unclaimed credit of this amount, even if it is busier", async () => {
        const merchant = await makeMerchant();
        const holder = await makeBank();
        const empty = await makeBank();
        await mapBank(merchant, holder);
        await mapBank(merchant, empty);
        await createOrderOn(merchant, holder);
        await createOrderOn(merchant, holder);
        await credit(holder, 50000);

        for (let i = 0; i < 5; i++) {
            expect(String((await selectBank(merchant, 50000))._id)).toBe(String(holder._id));
        }
        // A different amount gets no preference.
        expect(String((await selectBank(merchant, 70000))._id)).toBe(String(empty._id));
    });

    it("ignores a credit that is already claimed", async () => {
        const merchant = await makeMerchant();
        const holder = await makeBank();
        const empty = await makeBank();
        await mapBank(merchant, holder);
        await mapBank(merchant, empty);
        await createOrderOn(merchant, holder);
        const c = await credit(holder, 50000);
        await BankCredit.updateOne({ _id: c._id }, { claimedBy: new mongoose.Types.ObjectId() });

        expect(String((await selectBank(merchant, 50000))._id)).toBe(String(empty._id));
    });
});

describe("createOrder", () => {
    it("creates a pending order on the selected bank that expires in 15 minutes", async () => {
        const { merchant, bank } = await setup();
        const { order, created } = await createOrder(merchant, "sandbox", orderInput());

        expect(created).toBe(true);
        expect(order.status).toBe("pending");
        expect(order.orderId).toMatch(/^ord_[a-z0-9]{16}$/);
        expect(order.mode).toBe("sandbox");
        expect(String(order.bankId)).toBe(String(bank._id));
        const minutes = (order.expiresAt - Date.now()) / 60000;
        expect(minutes).toBeGreaterThan(14.5);
        expect(minutes).toBeLessThanOrEqual(15);
    });

    it("rejects a key from the other mode", async () => {
        const { merchant } = await setup(); // sandbox merchant
        await expect(createOrder(merchant, "live", orderInput())).rejects.toMatchObject({ statusCode: 403 });

        const prod = await makeMerchant({ mode: "production" });
        await mapBank(prod, await makeBank());
        await expect(createOrder(prod, "sandbox", orderInput())).rejects.toMatchObject({ statusCode: 403 });
        const { order } = await createOrder(prod, "live", orderInput());
        expect(order.mode).toBe("production");
    });

    it("rejects a merchant that is not active", async () => {
        const merchant = await makeMerchant({ status: "pending" });
        await mapBank(merchant, await makeBank());
        await expect(createOrder(merchant, "sandbox", orderInput())).rejects.toMatchObject({ statusCode: 403 });
    });

    it("enforces the merchant's min and max amount", async () => {
        const merchant = await makeMerchant({ config: { minAmountPaise: 10000, maxAmountPaise: 200000 } });
        await mapBank(merchant, await makeBank());

        await expect(createOrder(merchant, "sandbox", orderInput({ amountPaise: 9999 }))).rejects.toMatchObject({ statusCode: 422 });
        await expect(createOrder(merchant, "sandbox", orderInput({ amountPaise: 200001 }))).rejects.toMatchObject({ statusCode: 422 });
        await expect(createOrder(merchant, "sandbox", orderInput({ amountPaise: 10000 }))).resolves.toBeTruthy();
        await expect(createOrder(merchant, "sandbox", orderInput({ amountPaise: 200000 }))).resolves.toBeTruthy();
    });

    it("returns 503 when no bank is available, and creates nothing", async () => {
        const merchant = await makeMerchant();
        await expect(createOrder(merchant, "sandbox", orderInput())).rejects.toMatchObject({ statusCode: 503 });
        expect(await Order.countDocuments()).toBe(0);
    });

    it("lets many pending orders share a bank and an amount", async () => {
        const { merchant } = await setup();
        for (let i = 0; i < 5; i++) await createOrder(merchant, "sandbox", orderInput());
        expect(await Order.countDocuments({ amountPaise: 50000, status: "pending" })).toBe(5);
    });

    describe("merchantOrderId", () => {
        it("returns the existing order for a repeated id and amount", async () => {
            const { merchant } = await setup();
            const first = await createOrder(merchant, "sandbox", orderInput({ merchantOrderId: "INV-1" }));
            const again = await createOrder(merchant, "sandbox", orderInput({ merchantOrderId: "INV-1" }));
            expect(first.created).toBe(true);
            expect(again.created).toBe(false);
            expect(again.order.orderId).toBe(first.order.orderId);
            expect(await Order.countDocuments()).toBe(1);
        });

        it("refuses the same id with a different amount (409)", async () => {
            const { merchant } = await setup();
            await createOrder(merchant, "sandbox", orderInput({ merchantOrderId: "INV-1" }));
            await expect(createOrder(merchant, "sandbox", orderInput({ merchantOrderId: "INV-1", amountPaise: 99900 })))
                .rejects.toMatchObject({ statusCode: 409 });
        });

        it("keeps ids separate per merchant", async () => {
            const a = await setup();
            const b = await setup();
            await createOrder(a.merchant, "sandbox", orderInput({ merchantOrderId: "INV-1" }));
            const other = await createOrder(b.merchant, "sandbox", orderInput({ merchantOrderId: "INV-1" }));
            expect(other.created).toBe(true);
        });

        it("creates one order when the same id arrives many times at once", async () => {
            const { merchant } = await setup();
            const results = await Promise.all(
                Array.from({ length: 10 }, () => createOrder(merchant, "sandbox", orderInput({ merchantOrderId: "INV-RACE" })))
            );
            expect(await Order.countDocuments({ merchantOrderId: "INV-RACE" })).toBe(1);
            expect(results.filter((r) => r.created)).toHaveLength(1);
            expect(new Set(results.map((r) => r.order.orderId)).size).toBe(1);
        });

        it("allows many orders without an id", async () => {
            const { merchant } = await setup();
            await createOrder(merchant, "sandbox", orderInput());
            await createOrder(merchant, "sandbox", orderInput());
            expect(await Order.countDocuments()).toBe(2);
        });
    });
});

describe("expiry", () => {
    it("fails a pending order that is past its time when it is read", async () => {
        const { merchant, bank } = await setup();
        const o = await createOrderOn(merchant, bank, { expiresAt: new Date(Date.now() - 1000) });
        const read = await getOrderByPublicId(o.orderId);
        expect(read.status).toBe("failed");
        expect(read.statusReason).toBe("expired");
    });

    it("leaves a live order alone", async () => {
        const { merchant, bank } = await setup();
        const o = await createOrderOn(merchant, bank);
        expect((await expireIfDue(o)).status).toBe("pending");
    });

    it("never expires a successful order", async () => {
        const { merchant, bank } = await setup();
        const o = await createOrderOn(merchant, bank, { status: "success", expiresAt: new Date(Date.now() - 1000) });
        expect((await expireIfDue(o)).status).toBe("success");
    });

    it("sweeps all due pending orders and only those", async () => {
        const { merchant, bank } = await setup();
        await createOrderOn(merchant, bank, { expiresAt: new Date(Date.now() - 1000) });
        await createOrderOn(merchant, bank, { expiresAt: new Date(Date.now() - 1000) });
        await createOrderOn(merchant, bank);
        expect(await expireDueOrders()).toBe(2);
        expect(await Order.countDocuments({ status: "failed" })).toBe(2);
        expect(await Order.countDocuments({ status: "pending" })).toBe(1);
    });
});

describe("bank credits", () => {
    it("adds a credit and refuses a repeated UTR (409)", async () => {
        const bank = await makeBank();
        const utr = nextUtr();
        await addCredit({ bankId: bank._id, amountPaise: 50000, utr }, new mongoose.Types.ObjectId());
        await expect(addCredit({ bankId: bank._id, amountPaise: 99900, utr }, null)).rejects.toMatchObject({ statusCode: 409 });
        expect(await BankCredit.countDocuments()).toBe(1);
    });

    it("refuses a credit for an unknown bank (404)", async () => {
        await expect(addCredit({ bankId: new mongoose.Types.ObjectId(), amountPaise: 1, utr: nextUtr() }, null))
            .rejects.toMatchObject({ statusCode: 404 });
    });

    it("lists credits and filters by claimed state", async () => {
        const bank = await makeBank();
        const open = await credit(bank, 50000);
        const taken = await credit(bank, 60000);
        await BankCredit.updateOne({ _id: taken._id }, { claimedBy: new mongoose.Types.ObjectId() });

        expect((await listCredits({ page: 1, limit: 10 })).total).toBe(2);
        const unclaimed = await listCredits({ claimed: false, page: 1, limit: 10 });
        expect(unclaimed.data.map((c) => String(c._id))).toEqual([String(open._id)]);
        expect((await listCredits({ claimed: true, page: 1, limit: 10 })).total).toBe(1);
    });
});

describe("claimPayment", () => {
    it("moves the order to success and marks the credit claimed", async () => {
        const { merchant, bank } = await setup();
        const order = await createOrderOn(merchant, bank);
        const c = await credit(bank, 50000);

        const out = await claimPayment(order, c.utr);

        expect(out.result).toBe(CLAIM.SUCCESS);
        const o = await Order.findById(order._id);
        expect(o.status).toBe("success");
        expect(o.utr).toBe(c.utr);
        expect(String(o.claimedCreditId)).toBe(String(c._id));
        expect(o.paidAt).toBeInstanceOf(Date);
        const fresh = await BankCredit.findById(c._id);
        expect(String(fresh.claimedBy)).toBe(String(order._id));
        expect(fresh.claimedMode).toBe("sandbox");
    });

    it("finds nothing for an unknown UTR", async () => {
        const { merchant, bank } = await setup();
        const order = await createOrderOn(merchant, bank);
        expect((await claimPayment(order, nextUtr())).result).toBe(CLAIM.NOT_FOUND);
        expect((await Order.findById(order._id)).status).toBe("pending");
    });

    it("finds nothing when the amount differs", async () => {
        const { merchant, bank } = await setup();
        const order = await createOrderOn(merchant, bank);
        const c = await credit(bank, 50001);
        expect((await claimPayment(order, c.utr)).result).toBe(CLAIM.NOT_FOUND);
        expect((await BankCredit.findById(c._id)).claimedBy).toBeNull();
    });

    it("finds nothing when the money arrived in a different bank", async () => {
        const { merchant, bank } = await setup();
        const elsewhere = await makeBank();
        const order = await createOrderOn(merchant, bank);
        const c = await credit(elsewhere, 50000);
        expect((await claimPayment(order, c.utr)).result).toBe(CLAIM.NOT_FOUND);
        expect((await BankCredit.findById(c._id)).claimedBy).toBeNull();
    });

    it("cannot claim the same credit twice", async () => {
        const { merchant, bank } = await setup();
        const first = await createOrderOn(merchant, bank);
        const second = await createOrderOn(merchant, bank);
        const c = await credit(bank, 50000);

        expect((await claimPayment(first, c.utr)).result).toBe(CLAIM.SUCCESS);
        expect((await claimPayment(second, c.utr)).result).toBe(CLAIM.NOT_FOUND);
        expect((await Order.findById(second._id)).status).toBe("pending");
    });

    it("refuses an expired order and frees the credit for someone else", async () => {
        const { merchant, bank } = await setup();
        const expired = await createOrderOn(merchant, bank, { expiresAt: new Date(Date.now() - 1000) });
        const fresh = await createOrderOn(merchant, bank);
        const c = await credit(bank, 50000);

        expect((await claimPayment(expired, c.utr)).result).toBe(CLAIM.NOT_PENDING);
        expect((await BankCredit.findById(c._id)).claimedBy).toBeNull();
        expect((await claimPayment(fresh, c.utr)).result).toBe(CLAIM.SUCCESS);
    });

    it.each(["failed", "success"])("refuses an order that is already %s", async (status) => {
        const { merchant, bank } = await setup();
        const order = await createOrderOn(merchant, bank, { status });
        const c = await credit(bank, 50000);
        expect((await claimPayment(order, c.utr)).result).toBe(CLAIM.NOT_PENDING);
        expect((await BankCredit.findById(c._id)).claimedBy).toBeNull();
    });

    it("lets exactly one of many simultaneous orders win a UTR", async () => {
        const { merchant, bank } = await setup();
        const orders = [];
        for (let i = 0; i < 12; i++) orders.push(await createOrderOn(merchant, bank));
        const c = await credit(bank, 50000);

        const results = await Promise.all(orders.map((o) => claimPayment(o, c.utr)));

        expect(results.filter((r) => r.result === CLAIM.SUCCESS)).toHaveLength(1);
        expect(results.filter((r) => r.result === CLAIM.NOT_FOUND)).toHaveLength(11);
        expect(await Order.countDocuments({ status: "success" })).toBe(1);
        const winner = await Order.findOne({ status: "success" });
        expect(String((await BankCredit.findById(c._id)).claimedBy)).toBe(String(winner._id));
    });

    it("pays one order from only one credit when two UTRs are entered at once", async () => {
        const { merchant, bank } = await setup();
        const order = await createOrderOn(merchant, bank);
        const a = await credit(bank, 50000);
        const b = await credit(bank, 50000);

        const results = await Promise.all([claimPayment(order, a.utr), claimPayment(order, b.utr)]);

        expect(results.filter((r) => r.result === CLAIM.SUCCESS)).toHaveLength(1);
        expect(results.filter((r) => r.result === CLAIM.NOT_PENDING)).toHaveLength(1);
        // The losing claim was rolled back: exactly one credit stays claimed.
        expect(await BankCredit.countDocuments({ claimedBy: order._id })).toBe(1);
        expect(await BankCredit.countDocuments({ claimedBy: null })).toBe(1);
    });

    it("does not let a sweep and a claim both win", async () => {
        const { merchant, bank } = await setup();
        const order = await createOrderOn(merchant, bank, { expiresAt: new Date(Date.now() + 150) });
        const c = await credit(bank, 50000);
        await new Promise((r) => setTimeout(r, 200));

        const [claim] = await Promise.all([claimPayment(order, c.utr), expireDueOrders()]);

        // Time ran out, so the order can only be failed; the credit must be free again.
        expect(claim.result).toBe(CLAIM.NOT_PENDING);
        expect((await Order.findById(order._id)).status).toBe("failed");
        expect((await BankCredit.findById(c._id)).claimedBy).toBeNull();
    });
});

describe("late payment (the customer pays after the first order expired)", () => {
    it("routes the new order to the bank that holds the money, and the claim succeeds", async () => {
        const merchant = await makeMerchant();
        const bankA = await makeBank();
        const bankB = await makeBank();
        await mapBank(merchant, bankA);
        await mapBank(merchant, bankB);

        // First order was on bank A and expired. The customer paid it anyway; the admin enters the credit.
        const first = await createOrderOn(merchant, bankA, { expiresAt: new Date(Date.now() - 1000) });
        expect((await expireIfDue(first)).status).toBe("failed");
        const c = await credit(bankA, 50000);
        // Bank B has fewer orders today, so without the preference rule it would be chosen.
        await createOrderOn(merchant, bankA);
        await createOrderOn(merchant, bankA);

        const { order } = await createOrder(merchant, "sandbox", orderInput({ amountPaise: 50000 }));
        expect(String(order.bankId)).toBe(String(bankA._id));

        expect((await claimPayment(order, c.utr)).result).toBe(CLAIM.SUCCESS);
    });
});
