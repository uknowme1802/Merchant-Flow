const Transaction = require("../models/Transaction");

exports.getDashboardStats = async (req,res)=>{
    try{
        const transactions = await Transaction.find();
        const totalRevenue = transactions.reduce(
            (sum,tx) => sum+tx.amount,
            0
        );

        const successCount = transactions.filter(
            tx=>tx.status==="Success"
        ).length;

        const failedCount = transactions.filter(
            tx=>tx.status==="Failed"
        ).length

        res.json({
        totalRevenue,
        successCount,
        failedCount,
        totalTransactions: transactions.length
        });
    } catch(err){
        res.status(500).json({message: "Server Error"})
    }    
};