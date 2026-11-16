// A tiny in-memory stand-in for Mongoose models, so tests can run whole flows (sign up, approve,
// issue a key, sign a request) without a MongoDB server.
//
// It supports only what the Phase 1 code uses: create, find (with sort/skip/limit/select),
// findOne, findById, findOneAndUpdate, updateOne, deleteOne, countDocuments and exists, with
// the filter operators $or, $ne, $gt and RegExp. That is deliberately small: it is a test aid,
// not a database. Use it from a test file like this:
//
//   jest.mock("../models/Merchant", () => require("./helpers/fakeModels").createFakeModel("Merchant", {...}));

const crypto = require("crypto");

const newId = () => crypto.randomBytes(12).toString("hex");

const equal = (a, b) => {
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    return String(a) === String(b);
};

const matchesCondition = (value, condition) => {
    if (condition instanceof RegExp) return condition.test(String(value ?? ""));
    if (condition !== null && typeof condition === "object" && !(condition instanceof Date)
        && Object.keys(condition).some((k) => k.startsWith("$"))) {
        return Object.entries(condition).every(([op, expected]) => {
            if (op === "$ne") return !equal(value, expected);
            if (op === "$gt") return value != null && value > expected;
            if (op === "$in") return expected.some((candidate) => value != null && equal(value, candidate));
            throw new Error(`fakeModels: unsupported operator ${op}`);
        });
    }
    if (condition === null) return value === null || value === undefined;
    return value !== undefined && value !== null && equal(value, condition);
};

const matches = (doc, filter = {}) =>
    Object.entries(filter).every(([key, condition]) => {
        if (key === "$or") return condition.some((sub) => matches(doc, sub));
        return matchesCondition(doc[key], condition);
    });

class FakeQuery {
    constructor(items) { this.items = items; }
    sort(spec) {
        const [[key, dir]] = Object.entries(spec);
        this.items = [...this.items].sort((a, b) => {
            const av = a[key] instanceof Date ? a[key].getTime() : a[key];
            const bv = b[key] instanceof Date ? b[key].getTime() : b[key];
            const order = av === bv ? a._seq - b._seq : (av < bv ? -1 : 1);
            return dir < 0 ? -order : order;
        });
        return this;
    }
    skip(n) { this.items = this.items.slice(n); return this; }
    limit(n) { this.items = this.items.slice(0, n); return this; }
    select() { return this; }
    then(resolve, reject) { return Promise.resolve(this.items).then(resolve, reject); }
}

const single = (lookup) => ({
    select() { return this; },
    then(resolve, reject) { return Promise.resolve().then(lookup).then(resolve, reject); }
});

const duplicateKeyError = () => Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });

// `uniques` is a list of functions (existingDoc, newDoc) => true when they conflict.
// `defaults` gives starting values (like schema defaults); `finalize` can adjust the finished
// document, for example to fill a nested default.
const createFakeModel = (name, { uniques = [], defaults = () => ({}), finalize = () => {} } = {}) => {
    let docs = [];
    let seq = 0;

    const wrap = (data) => {
        // `save` exists because services mutate a loaded document and call save(); the document
        // is the stored object itself, so changes are already persisted.
        Object.defineProperty(data, "save", { value: async () => data, enumerable: false, configurable: true });
        return data;
    };

    const Model = {
        modelName: name,
        __docs: () => docs,
        __reset: () => { docs = []; seq = 0; },

        create: async (data) => {
            const doc = { ...defaults(), ...data };
            finalize(doc);
            if (uniques.some((conflicts) => docs.some((existing) => conflicts(existing, doc)))) {
                throw duplicateKeyError();
            }
            const stored = wrap({ ...doc, _id: newId(), _seq: ++seq, createdAt: new Date(), updatedAt: new Date() });
            docs.push(stored);
            return stored;
        },
        find: (filter) => new FakeQuery(docs.filter((d) => matches(d, filter))),
        // A single-document lookup can be awaited directly or chained with select(), like Mongoose.
        findOne: (filter) => single(() => docs.find((d) => matches(d, filter)) || null),
        findById: (id) => single(() => docs.find((d) => equal(d._id, id)) || null),
        countDocuments: async (filter) => docs.filter((d) => matches(d, filter)).length,
        exists: async (filter) => (docs.some((d) => matches(d, filter)) ? { _id: "x" } : null),
        updateOne: async (filter, update) => {
            const doc = docs.find((d) => matches(d, filter));
            if (doc) Object.assign(doc, update.$set || {});
            return { matchedCount: doc ? 1 : 0 };
        },
        findOneAndUpdate: async (filter, update) => {
            const doc = docs.find((d) => matches(d, filter));
            if (doc) Object.assign(doc, update.$set || {});
            return doc || null;
        },
        deleteOne: async (filter) => {
            const index = docs.findIndex((d) => matches(d, filter));
            if (index >= 0) docs.splice(index, 1);
            return { deletedCount: index >= 0 ? 1 : 0 };
        }
    };
    return Model;
};

module.exports = { createFakeModel, newId };
