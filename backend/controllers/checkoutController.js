const crypto = require("crypto");
const qrcode = require("qrcode");
const Transaction = require("../models/Transaction");
const ValidPayment = require("../models/ValidPayment");
const redis = require("../config/redis");
const { getIO } = require("../socket");
const { triggerWebhooks } = require("../utils/webhookDispatcher");
const { paymentVerifications } = require("../utils/metrics");

const UPI_ID = process.env.UPI_ID || "merchantflow@upi";
const UPI_NAME = process.env.UPI_NAME || "MerchantFlow";
const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9_\-:.]{1,128}$/;

if(!process.env.UPI_ID){
    console.warn("⚠️ UPI_ID is not configured! Falling back to a placeholde UPI ID for QR codes.")
}

const buildUpiQr = async (txn) => {
    const upiLink = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_NAME)}&am=${txn.amount}&cu=INR&tn=${encodeURIComponent(txn.id)}`;
    return qrcode.toDataURL(upiLink);
};

const clearTransactionCache = async () => {
    if(!redis) return;
    try{
        const keys = await redis.keys("transactions:*");
        if(keys && keys.length>0){
            await redis.del(...keys);
        }
    } catch (cacheErr){
        console.warn("⚠️ Warning: Could not clear cache:", cacheErr.message);
    }
};

exports.createCheckout = async (req, res, next) => {
    try{
        const { amount } = req.body;

        // Optional Idempotency-Key: a retried request (double click, network retry) returns the
        // original order instead of creating a duplicate.
        const idempotencyKey = req.get("Idempotency-Key");
        if(idempotencyKey !== undefined && !IDEMPOTENCY_KEY_REGEX.test(idempotencyKey)){
            return res.status(400).json({
                success: false,
                message: "Idempotency-Key must be 1-128 characters: letters, numbers, _ - : ."
            });
        }

        const replay = async () => {
            const existing = await Transaction.findOne({ userId: req.user.id, idempotencyKey });
            if(!existing) return false;

            res.set("Idempotent-Replayed", "true");
            res.status(200).json({
                success: true,
                data: existing,
                qrCode: await buildUpiQr(existing),
                upiId: UPI_ID
            });
            return true;
        };

        if(idempotencyKey && await replay()) return;

        const txnId = `TXN-${crypto.randomUUID()}`;

        let txn;
        try {
            txn = await Transaction.create({
                id: txnId,
                amount,
                status: "Pending",
                date: new Date().toISOString(),
                utr: null,
                userId: req.user.id,
                ...(idempotencyKey ? { idempotencyKey } : {})
            });
        } catch(createErr){
            // Two identical requests raced: the unique index let one win, so return that order.
            if(createErr.code === 11000 && idempotencyKey && await replay()) return;
            throw createErr;
        }

        const qrCode = await buildUpiQr(txn);

        triggerWebhooks("checkout.created", {
            transactionId: txn.id,
            orderId: txn._id,
            amount: txn.amount,
            status: txn.status
        });

        res.status(201).json({
            success: true,
            data: txn,
            qrCode,
            upiId: UPI_ID
        });
    } catch(err){
        next(err);
    }
};

exports.getCheckoutStatus = async (req, res, next) => {
    try {
        const txn = await Transaction.findById(req.params.id);

        if(!txn){
            return res.status(404).json({
                success: false,
                message: "Order not found"
            })
        }
        if(req.user.role !=="admin" && String(txn.userId) !== String(req.user.id)){
            return res.status(403).json({
                success: false,
                message:"Not authorized to view this order"
            })
        }
        res.json({
            success: true,
            data: txn
        })
    } catch(err) {
        next(err);
    }
}

exports.verifyPayment = async (req, res, next) => {
    try {
        const { utr: trimmedUtr } = req.body;

        const txn = await Transaction.findById(req.params.id);
        if(!txn){
            return res.status(404).json({
                success: false,
                message: "Order not found"
            })
        }
        if(req.user.role !=="admin" && String(txn.userId) !== String(req.user.id)){
            return res.status(403).json({
                success: false,
                message: "Not authorized to verify this order"
            })
        }
        if(txn.status === "Success") {
            return res.json({
                success: true,
                verified: true,
                data: txn,
                message: "Order already verified."
            })
        }

        // Atomically claim the payment code: only one request can flip used:false -> true,
        // so a UTR can never be consumed twice even under concurrent requests.
        const claimed = await ValidPayment.findOneAndUpdate(
            { utr: trimmedUtr, amount: txn.amount, used: false },
            { $set: { used: true, usedBy: txn._id } },
            { returnDocument: "after" }
        );

        if(!claimed){
            const existing = await ValidPayment.findOne({ utr: trimmedUtr, amount: txn.amount });

            if(existing && existing.used){
                // A concurrent request for this same order may have just completed it.
                if(existing.usedBy && String(existing.usedBy) === String(txn._id)){
                    const current = await Transaction.findById(txn._id);
                    if(current && current.status === "Success"){
                        return res.json({
                            success: true,
                            verified: true,
                            data: current,
                            message: "Order already verified."
                        });
                    }
                }

                paymentVerifications.inc({ outcome: "already_used" });
                txn.utr = trimmedUtr;
                txn.status ="Pending";
                await txn.save();

                return res.json({
                    success:true,
                    verified: false,
                    alreadyUsed: true,
                    data: txn,
                    message: "This UTR has already been used!"
                })
            }

            paymentVerifications.inc({ outcome: "pending" });
            txn.utr = trimmedUtr;
            txn.status = "Pending";
            await txn.save();

            return res.json({
                success: true,
                verified: false,
                data: txn,
                message: "Payment could not be verified yet - order remainss pending."
            })
        }

        // Code claimed. Mark the order Success only if it isn't already (guards concurrent verifies).
        let updated;
        try {
            updated = await Transaction.findOneAndUpdate(
                { _id: txn._id, status: { $ne: "Success" } },
                { $set: { status: "Success", utr: trimmedUtr } },
                { returnDocument: "after" }
            );
        } catch(updateErr){
            // Give the code back so the payer can retry.
            await ValidPayment.updateOne({ _id: claimed._id }, { $set: { used: false, usedBy: null } });
            throw updateErr;
        }

        if(!updated){
            const current = await Transaction.findById(txn._id);
            return res.json({
                success: true,
                verified: true,
                data: current,
                message: "Order already verified."
            });
        }

        paymentVerifications.inc({ outcome: "verified" });

        await clearTransactionCache();

        try{
            const io = getIO();
            io.emit("newTransaction", updated);
        } catch (socketErr){
            console.warn("❗Warning: Could not emit newTransaction event:", socketErr.message)
        }

        triggerWebhooks("payment.success", {
            transactionId: updated.id,
            orderId: updated._id,
            amount: updated.amount,
            utr: updated.utr,
            status: updated.status
        });

        res.json({
            success: true,
            verified: true,
            data: updated,
            message: "Payment verified successfully."
        });
    } catch(err){
        next(err);
    }
}
