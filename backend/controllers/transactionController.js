const Transaction = require("../models/Transaction")

exports.getTransactions= async (req,res)=>{
    try{
        const data = await Transaction.find().sort({createdAt: -1 });
        res.json(data);
    } catch(err){
        res.status(500).json({message:"Sever Error"})
    }
};

exports.addTransaction= async (req,res)=>{
    try{
        const newTxn = new Transaction(req.body);
        await newTxn.save();
        res.json(newTxn);
    } catch(err){
        res.status(500).json({message:"Error adding Transaction"})
    }
}