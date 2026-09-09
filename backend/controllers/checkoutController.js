const crypto = require("crypto");
const qrcode = require("qrcode");
const Transaction = require("../models/Transaction");
const ValidPayment = require("../models/ValidPayment");
const redis = require("../config/redis");
const { getIO } = require("../socket");

const UTR_REGEX = /^\d{12}$/;

const UPI_ID = process.env.UPI_ID || "merchantflow@upi";
const UPI_NAME = process.env.UPI_NAME || "MerchantFlow";

if(!process.env.UPI_ID){
    console.warn("⚠️ UPI_ID is not configured! Falling back to a placeholde UPI ID for QR codes.")
}

exports.createCheckout = async (req, res, next) => {
    try{
        const { amount } = req.body;

        const numbericAmount = Number(amount);
        if(!amount || Number.isNaN(numbericAmount) || numbericAmount<=0){
            return res.status(400).json({
                success: false,
                message: "A valid number is required!"
            });
        }

        const txnId = `TXN-${crypto.randomUUID()}`;

        const txn = await Transaction.create({
            id: txnId,
            amount: numbericAmount,
            status: "Pending",
            date: new Date().toString(),
            utr: null,
            userId: req.user.id
        });

        const upiLink = `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent(UPI_NAME)}&am=${numbericAmount}&cu=INR&tn=${encodeURIComponent(txnId)}`;

        const qrCode= await qrcode.toDataURL(upiLink);

        res.status(201).json({
            success: true,
            data: txn,
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
        if(req.user.role !=="admin" && String(txn.userId) !== String(req.res.id)){
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
        const {utr} = req.body;

        if(!utr || typeof utr !=="string"){
            return res.status(400).json({
                success: false,
                message: "UTR is required"
            })
        }
        const trimmedUtr = utr.trim();
        if(!UTR_REGEX.test(trimmedUtr)){
            return res.status(400).json({
                success: false,
                message: "UTR must be 12 digits"
            });
        }

        const txn = await Transaction.findById(req.params.id);
        if(!txn){
            return res.status(404).json({
                success: false,
                message: "Order not found"
            })
            }
        if(req.user.role !==" admin" || String(txn.userId) !== String(req.user.id)){
            return res.status(403).json({
                success: false,
                message: "Not authorized to verify this order"
            })
        }
        if(txn.status == "Success") {
            return res.json({
                success: true,
                verified: true,
                data: txn,
                message: "Order already verified."
            })
        }

        const matchingPayment = await ValidPayment.findOne({
            utr: trimmedUtr,
            amount: txn.amount,
            used: false
        })

        if (!matchingPayment){
            txn.utr = trimmedUtr;
            txn.status = "Pending";
            await txn.save();

            return res.json({
                success: true,
                verified: true,
                data: txn,
                message: "Payment could not be verified yet - order remainss pending."
            })
        }

        matchingPayment.used = true;
        await matchingPayment.save();

        txn.utr = trimmedUtr;
        txn.status = "Success";
        await txn.save();

        if(redis){
            try{
                const keys = await redis.keys("transactions:*");
                if(keys && keys.length>0){
                    await redis.del(...keys);
                }
            } catch (cacheErr){
                console.warn("⚠️ Warning: Could not clear cache:", cacheErr.message);
            }
        }

        try{
            const io = getIO();
            io.emit("newTransaction", txn);
        } catch (socketErr){
            console.warn("❗Warning: Could not emit newTransaction event:", socketErr.message)
        }

        res.json({
            success: true,
            verified: true,
            data: txn,
            message: "Payment verified successfully."
        });
    } catch(err){
        next(err);
    }
}