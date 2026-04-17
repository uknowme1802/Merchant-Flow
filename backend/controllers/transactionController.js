const Transaction = require("../models/Transaction")
const redis = require("../config/redis");
const { getIO } = require("../socket");

exports.getTransactions= async (req,res,next)=>{
    try{
        const { page=1, limit =10, status } = req.query;
        console.log("getTransactions called with params:", {page, limit, status});
        const cacheKey = `transactions:${page}:${limit}:${status || "all"}`
        
        // Check cache if redis is available
        if(redis){
            const cachedData = await redis.get(cacheKey);        
            if(cachedData){
                console.log("Returning cached data for key:", cacheKey);
                return res.json(JSON.parse(cachedData))
            }
        }

        const query={};
        if(status) query.status=status;
        const transactions = await Transaction.find(query)
        .sort({createdAt: -1})
        .skip((page-1)*limit)
        .limit(Number(limit));

        const total = await Transaction.countDocuments(query);
        console.log(`Found ${transactions.length} transactions (total: ${total})`);
        console.log("Transactions:", JSON.stringify(transactions, null, 2));

        const response = {
            success: true,
            page:Number(page),
            total,
            data: transactions
        };
        
        // Cache the response if redis is available
        if(redis){
            await redis.set(cacheKey, JSON.stringify(response), "EX", 60)
            console.log("Cached data for key:", cacheKey);
        }

        res.json(response);
    } catch(err){
        console.error("Error in getTransactions:", err);
        next(err);
    }
};

exports.addTransaction= async (req,res, next)=>{
    try{
        console.log("Adding transaction with data:", req.body);
        const newTxn = new Transaction(req.body);
        await newTxn.save();
        console.log("Transaction saved successfully:", newTxn);
        
        // Clear ALL redis cache for transactions when a new one is added
        if(redis){
            try {
                const keys = await redis.keys("transactions:*");
                console.log("Found cache keys to clear:", keys);
                if(keys && keys.length > 0){
                    await redis.del(...keys);
                    console.log("Cache cleared successfully");
                }
            } catch (cacheErr) {
                console.warn("Warning: Could not clear cache:", cacheErr.message);
                // Don't fail the request if cache clearing fails
            }
        }

        const io = getIO();
        io.emit("newTransaction", newTxn);

        res.status(201).json({
            success: true,
            data: newTxn
        })
    } catch(err){
        console.error("Error adding transaction:", err.message);
        next(err);
    }
}