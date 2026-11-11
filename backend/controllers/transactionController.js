const Transaction = require("../models/Transaction")
const redis = require("../config/redis");
const { clearTransactionCache } = require("../utils/cache");
const logger = require("../utils/logger");
const { getIO } = require("../socket");
const { triggerWebhooks } = require("../utils/webhookDispatcher");
// const { cache } = require("react");

const VALID_STATUSES = ["Success", "Pending", "Failed"];

exports.getTransactions= async (req,res,next)=>{
    try{
        // Clamp paging so a client cannot request an unbounded page size
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
        const status = VALID_STATUSES.includes(req.query.status) ? req.query.status : undefined;

        // Admins see every transaction; everyone else only sees their own orders
        const isAdmin = req.user.role === "admin";
        const cacheKey = `transactions:${isAdmin ? "all" : req.user.id}:${page}:${limit}:${status || "all"}`
        
        // Check cache if redis is available
            if(redis){
                try {
                    const cachedData = await redis.get(cacheKey);        
                    if(cachedData){
                        // console.log("Returning cached data for key:", cacheKey);
                        return res.json(JSON.parse(cachedData))
                    }
                } catch(cacheErr){
                    logger.warn("Redis cache read failed", { error: cacheErr.message })
                }
            }

        const query={};
        if(!isAdmin) query.userId = req.user.id;
        if(status) query.status=status;
        const transactions = await Transaction.find(query)
        .sort({createdAt: -1})
        .skip((page-1)*limit)
        .limit(limit);

        const total = await Transaction.countDocuments(query);
        // console.log(`Found ${transactions.length} transactions (total: ${total})`);
        // console.log("Transactions:", JSON.stringify(transactions, null, 2));

        const response = {
            success: true,
            page:Number(page),
            total,
            data: transactions
        };
        
        // Cache the response if redis is available
        if(redis){
            try {
            await redis.set(cacheKey, JSON.stringify(response), "EX", 60)
            // console.log("Cached data for key:", cacheKey);
            } catch (cacheErr){
                logger.warn("Redis cache write failed", { error: cacheErr.message })
            }
        }

        res.json(response);
    } catch(err){
        // console.error("Error in getTransactions:", err);
        next(err);
    }
};

exports.addTransaction= async (req,res, next)=>{
    try{
        // console.log("Adding transaction with data:", req.body);
        const newTxn = new Transaction(req.body);
        await newTxn.save();
        // console.log("Transaction saved successfully:", newTxn);
        
        await clearTransactionCache();

        const io = getIO();
        io.emit("newTransaction", newTxn);

        if(newTxn.status === "Success"){
            triggerWebhooks("payment.success", {
                transactionId: newTxn.id,
                orderId: newTxn._id,
                amount: newTxn.amount,
                utr: newTxn.utr,
                status: newTxn.status
            });
        }

        res.status(201).json({
            success: true,
            data: newTxn
        })
    } catch(err){
        // console.error("Error adding transaction:", err.message);
        if(err.code === 11000){
            return res.status(409).json({
                success: false,
                message: "A transaction with this ID already exists"
            });
        }
        next(err);
    }
}