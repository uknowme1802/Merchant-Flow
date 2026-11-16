jest.mock("../middleware/rateLimiter", () => (req, res, next) => next());
jest.mock("../middleware/signupRateLimiter", () => (req, res, next) => next());
jest.mock("../models/Merchant", () => require("./helpers/mockModels").Merchant);
jest.mock("../models/User", () => require("./helpers/mockModels").User);
jest.mock("../models/MerchantCredential", () => require("./helpers/mockModels").MerchantCredential);
jest.mock("../models/AuditLog", () => require("./helpers/mockModels").AuditLog);
jest.mock("../models/BankAccount", () => require("./helpers/mockModels").BankAccount);
jest.mock("../models/MerchantBankMapping", () => require("./helpers/mockModels").MerchantBankMapping);

const request = require("supertest");
const app = require("../app");
const { AuditLog, BankAccount, MerchantBankMapping, resetAll } = require("./helpers/mockModels");
const { registerMerchant, adminToken, userToken } = require("./helpers/merchantFlow");

beforeEach(() => resetAll());
afterEach(() => jest.restoreAllMocks());

const harshdeep = {
    holderName: "Harshdeep",
    accountNumber: "742586481045",
    bankName: "YES BANK",
    upiId: "Harshdeep@ysbank",
    ifsc: "YESB0000001"
};

const asAdmin = (method, path) => request(app)[method](path).set("Authorization", `Bearer ${adminToken()}`);
const createBank = (body = harshdeep) => asAdmin("post", "/api/admin/banks").send(body);

describe("bank accounts", () => {
    test("an admin can add a bank account", async () => {
        const res = await createBank();

        expect(res.statusCode).toBe(201);
        expect(res.body.bank).toMatchObject({
            bankId: expect.stringMatching(/^bank_[a-z0-9]{8}$/),
            holderName: "Harshdeep",
            bankName: "YES BANK",
            accountNumber: "742586481045",
            ifsc: "YESB0000001",
            upiId: "harshdeep@ysbank",
            methods: ["UPI"],
            status: "active",
            verified: false
        });
    });

    test("only admins can use the bank routes", async () => {
        const res = await request(app).post("/api/admin/banks")
            .set("Authorization", `Bearer ${userToken()}`).send(harshdeep);
        expect(res.statusCode).toBe(403);
        expect((await request(app).get("/api/admin/banks")).statusCode).toBe(401);
    });

    test.each([
        ["a short account number", { accountNumber: "123" }],
        ["a letter in the account number", { accountNumber: "74258648104A" }],
        ["a malformed IFSC", { ifsc: "YESB1000001" }],
        ["a UPI id without a handle", { upiId: "harshdeep" }],
        ["min above max", { minPaise: 500, maxPaise: 100 }],
        ["an unknown field is stripped, but a bad method is refused", { methods: ["CASH"] }]
    ])("rejects %s", async (_label, change) => {
        const res = await createBank({ ...harshdeep, ...change });
        expect(res.statusCode).toBe(400);
        expect(await BankAccount.countDocuments({})).toBe(0);
    });

    test("the IFSC is stored in upper case", async () => {
        const res = await createBank({ ...harshdeep, ifsc: "yesb0000001" });
        expect(res.statusCode).toBe(201);
        expect(res.body.bank.ifsc).toBe("YESB0000001");
    });

    test("the same account cannot be added twice", async () => {
        await createBank();
        const again = await createBank();
        expect(again.statusCode).toBe(409);
        expect(await BankAccount.countDocuments({})).toBe(1);
    });

    test("an admin can list, search, update and verify", async () => {
        const { body } = await createBank();
        const id = body.bank.id;

        const list = await asAdmin("get", "/api/admin/banks?search=yes");
        expect(list.body.total).toBe(1);
        expect((await asAdmin("get", "/api/admin/banks?search=nomatch")).body.total).toBe(0);

        const upd = await asAdmin("patch", `/api/admin/banks/${id}`).send({ level: "Level2", status: "inactive" });
        expect(upd.statusCode).toBe(200);
        expect(upd.body.bank).toMatchObject({ level: "Level2", status: "inactive" });

        const verified = await asAdmin("post", `/api/admin/banks/${id}/verify`);
        expect(verified.body.bank.verified).toBe(true);
    });

    test("an empty update is refused and a malformed id is a 400", async () => {
        const { body } = await createBank();
        expect((await asAdmin("patch", `/api/admin/banks/${body.bank.id}`).send({})).statusCode).toBe(400);
        expect((await asAdmin("patch", "/api/admin/banks/not-an-id").send({ level: "x" })).statusCode).toBe(400);
    });

    test("every change is audited, without breaking on the bank details", async () => {
        const { body } = await createBank();
        await asAdmin("post", `/api/admin/banks/${body.bank.id}/verify`);

        const actions = AuditLog.__docs().map((d) => d.action);
        expect(actions).toEqual(expect.arrayContaining(["bank.created", "bank.verified"]));
    });
});

describe("merchant bank mapping", () => {
    test("an admin can map a bank to a merchant, and it shows on the merchant", async () => {
        const { merchant } = await registerMerchant(app);
        const { body } = await createBank();

        const res = await asAdmin("post", `/api/admin/merchants/${merchant._id}/banks`).send({ bankId: body.bank.id });
        expect(res.statusCode).toBe(201);
        expect(res.body.mapping.bank.bankName).toBe("YES BANK");

        const list = await asAdmin("get", `/api/admin/merchants/${merchant._id}/banks`);
        expect(list.body.data).toHaveLength(1);
        expect(list.body.data[0].bank.accountNumber).toBe("742586481045");
    });

    test("one bank can be shared by many merchants but mapped to a merchant only once", async () => {
        const first = await registerMerchant(app);
        const second = await registerMerchant(app, { email: "other@acme.example" });
        const { body } = await createBank();

        expect((await asAdmin("post", `/api/admin/merchants/${first.merchant._id}/banks`).send({ bankId: body.bank.id })).statusCode).toBe(201);
        expect((await asAdmin("post", `/api/admin/merchants/${second.merchant._id}/banks`).send({ bankId: body.bank.id })).statusCode).toBe(201);
        expect((await asAdmin("post", `/api/admin/merchants/${first.merchant._id}/banks`).send({ bankId: body.bank.id })).statusCode).toBe(409);
        expect(await MerchantBankMapping.countDocuments({})).toBe(2);
    });

    test("a mapping's own limits cannot be looser than the bank's", async () => {
        const { merchant } = await registerMerchant(app);
        const { body } = await createBank({ ...harshdeep, minPaise: 1000, maxPaise: 500000 });

        const loose = await asAdmin("post", `/api/admin/merchants/${merchant._id}/banks`)
            .send({ bankId: body.bank.id, maxPaise: 900000 });
        expect(loose.statusCode).toBe(400);

        const strict = await asAdmin("post", `/api/admin/merchants/${merchant._id}/banks`)
            .send({ bankId: body.bank.id, minPaise: 2000, maxPaise: 100000 });
        expect(strict.statusCode).toBe(201);
    });

    test("unknown merchant or bank is a 404", async () => {
        const { merchant } = await registerMerchant(app);
        const { body } = await createBank();

        expect((await asAdmin("post", `/api/admin/merchants/${"d".repeat(24)}/banks`).send({ bankId: body.bank.id })).statusCode).toBe(404);
        expect((await asAdmin("post", `/api/admin/merchants/${merchant._id}/banks`).send({ bankId: "d".repeat(24) })).statusCode).toBe(404);
    });

    test("a mapped bank cannot be deleted, an unmapped one can", async () => {
        const { merchant } = await registerMerchant(app);
        const { body } = await createBank();
        const mapped = await asAdmin("post", `/api/admin/merchants/${merchant._id}/banks`).send({ bankId: body.bank.id });

        expect((await asAdmin("delete", `/api/admin/banks/${body.bank.id}`)).statusCode).toBe(409);

        const removed = await asAdmin("delete", `/api/admin/merchants/${merchant._id}/banks/${mapped.body.mapping.id}`);
        expect(removed.statusCode).toBe(200);
        expect((await asAdmin("delete", `/api/admin/banks/${body.bank.id}`)).statusCode).toBe(200);
        expect(await BankAccount.countDocuments({})).toBe(0);
    });
});

describe("bulk bank mapping", () => {
    const bulk = (body) => asAdmin("post", "/api/admin/bank-mappings/bulk").send(body);
    const setup = async () => {
        const first = await registerMerchant(app);
        const second = await registerMerchant(app, { email: "other@acme.example" });
        const a = await createBank();
        const b = await createBank({ ...harshdeep, accountNumber: "111122223333", upiId: "second@ysbank" });
        return {
            merchantIds: [String(first.merchant._id), String(second.merchant._id)],
            bankIds: [a.body.bank.id, b.body.bank.id],
            first
        };
    };

    test("maps every chosen bank to every chosen merchant", async () => {
        const { merchantIds, bankIds, first } = await setup();

        const res = await bulk({ merchantIds, bankIds });
        expect(res.statusCode).toBe(201);
        expect(res.body).toMatchObject({ created: 4, skipped: 0 });
        expect(await MerchantBankMapping.countDocuments({})).toBe(4);

        const list = await asAdmin("get", `/api/admin/merchants/${first.merchant._id}/banks`);
        expect(list.body.data).toHaveLength(2);

        const entry = AuditLog.__docs().find((d) => d.action === "bank.bulk_mapped");
        expect(entry.metadata).toMatchObject({ created: 4, skipped: 0 });
        expect(entry.metadata.mids).toHaveLength(2);
    });

    test("pairs that already exist are skipped, so it can be repeated", async () => {
        const { merchantIds, bankIds } = await setup();
        await asAdmin("post", `/api/admin/merchants/${merchantIds[0]}/banks`).send({ bankId: bankIds[0] });

        const res = await bulk({ merchantIds, bankIds });
        expect(res.body).toMatchObject({ created: 3, skipped: 1 });

        const again = await bulk({ merchantIds, bankIds });
        expect(again.statusCode).toBe(200);
        expect(again.body).toMatchObject({ created: 0, skipped: 4 });
        expect(await MerchantBankMapping.countDocuments({})).toBe(4);
    });

    test("an unknown merchant or bank is a 404 and nothing is mapped", async () => {
        const { merchantIds, bankIds } = await setup();

        expect((await bulk({ merchantIds: [...merchantIds, "d".repeat(24)], bankIds })).statusCode).toBe(404);
        expect((await bulk({ merchantIds, bankIds: [...bankIds, "d".repeat(24)] })).statusCode).toBe(404);
        expect(await MerchantBankMapping.countDocuments({})).toBe(0);
    });

    test.each([
        ["no merchants", (s) => ({ merchantIds: [], bankIds: s.bankIds })],
        ["no banks", (s) => ({ merchantIds: s.merchantIds, bankIds: [] })],
        ["a malformed id", (s) => ({ merchantIds: ["nope"], bankIds: s.bankIds })],
        ["the same merchant twice", (s) => ({ merchantIds: [s.merchantIds[0], s.merchantIds[0]], bankIds: s.bankIds })]
    ])("rejects %s", async (_label, build) => {
        expect((await bulk(build(await setup()))).statusCode).toBe(400);
    });

    test("only admins can bulk map", async () => {
        const { merchantIds, bankIds } = await setup();
        const res = await request(app).post("/api/admin/bank-mappings/bulk")
            .set("Authorization", `Bearer ${userToken()}`).send({ merchantIds, bankIds });
        expect(res.statusCode).toBe(403);
    });
});

describe("the Active switch of a mapping", () => {
    const setup = async () => {
        const { merchant } = await registerMerchant(app);
        const { body } = await createBank();
        const mapped = await asAdmin("post", `/api/admin/merchants/${merchant._id}/banks`).send({ bankId: body.bank.id });
        return { merchant, url: `/api/admin/merchants/${merchant._id}/banks/${mapped.body.mapping.id}` };
    };

    test("turns a mapping off and on again, and audits each change", async () => {
        const { merchant, url } = await setup();

        const off = await asAdmin("patch", url).send({ active: false });
        expect(off.statusCode).toBe(200);
        expect(off.body.mapping.active).toBe(false);
        expect(off.body.mapping.bank.bankName).toBe("YES BANK");

        const list = await asAdmin("get", `/api/admin/merchants/${merchant._id}/banks`);
        expect(list.body.data[0].active).toBe(false);

        expect((await asAdmin("patch", url).send({ active: true })).body.mapping.active).toBe(true);

        const entries = AuditLog.__docs().filter((d) => d.action === "bank.mapping_updated");
        expect(entries).toHaveLength(2);
        expect(entries[0].metadata).toMatchObject({ before: { active: true }, after: { active: false } });
    });

    test("setting the value it already has writes no audit entry", async () => {
        const { url } = await setup();
        expect((await asAdmin("patch", url).send({ active: true })).statusCode).toBe(200);
        expect(AuditLog.__docs().some((d) => d.action === "bank.mapping_updated")).toBe(false);
    });

    test("needs a real boolean, the right merchant and an admin", async () => {
        const { url } = await setup();
        const other = await registerMerchant(app, { email: "other@acme.example" });

        expect((await asAdmin("patch", url).send({ active: "no" })).statusCode).toBe(400);
        expect((await asAdmin("patch", url).send({})).statusCode).toBe(400);
        expect((await asAdmin("patch", url.replace(/merchants\/[a-f0-9]+/, `merchants/${other.merchant._id}`)).send({ active: false })).statusCode).toBe(404);
        const denied = await request(app).patch(url).set("Authorization", `Bearer ${userToken()}`).send({ active: false });
        expect(denied.statusCode).toBe(403);
    });
});
