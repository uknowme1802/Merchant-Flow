// const { required } = require("joi");
const mongoose = require("mongoose");
const { roundMoney } = require("../utils/money");

const transactionSchema = new mongoose.Schema({
    id:{
        type: String,
        required: true
    },
    amount :{
        type: Number,
        required: true,
        set: roundMoney
    },
    status: {
        type: String,
        enum:["Success","Pending","Failed"],
        required: true
    },
    date: {
        type: String,
        required: true
    },
    utr: {
        type: String,
        required: null
    },
    userId:{
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },
    // Client-supplied Idempotency-Key so a retried checkout request returns the same order
    idempotencyKey: {
        type: String,
        default: undefined
    }
}, { timestamps: true });

transactionSchema.index({ id: 1 }, { unique: true });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index(
    { userId: 1, idempotencyKey: 1 },
    { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

module.exports = mongoose.model("Transaction", transactionSchema);