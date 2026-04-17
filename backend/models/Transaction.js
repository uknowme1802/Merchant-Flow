// const { required } = require("joi");
const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
    id:{
        type: String,
        required: true
    },
    amount :{
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum:["Success","Pending","Failed"],
        required: true
    },
    date: {
        type: String,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model("Transaction", transactionSchema);