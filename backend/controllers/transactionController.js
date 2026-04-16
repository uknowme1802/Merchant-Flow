const Transaction = require("../models/Transaction")
const redis = require("../config/redis");
const { getIO } = require("../socket");

exports.getTransactions= async (req,res,next)=>{
    try{
        const { page=1, limit =10, status } = req.query;
        // const data = await Transaction.find().sort({createdAt: -1 });
        const cacheKey = `transactions:${page}:${limit}:${status || "all"}`
        

        if(redis){
            const cachedData = await redis.get(cacheKey);
            if(cachedData){
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

        const response = {
            success: true,
            page:Number(page),
            total,
            data: transactions
        };
        
        if(redis){
            await redis.set(cacheKey, JSON.stringify(response), "EX", 60)
        }

        res.json(response);
    } catch(err){
        next(err);
    }
};

exports.addTransaction= async (req,res, next)=>{
    try{
        const newTxn = new Transaction(req.body);
        await newTxn.save();
        const key = await redis.key("transactions:*");
        if(keys.length>0){
            await redis.del(keys);
        }

        const io = getIO();
        io.emit("newTransaction", newTxn);

        res.status(201).json({
            success: true,
            data: newTxn
        })
    } catch(err){
        next(err);
    }
}