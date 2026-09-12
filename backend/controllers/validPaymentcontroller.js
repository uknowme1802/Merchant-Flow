const ValidPayment = require("../models/ValidPayment");

const UTR_REGEX = /^\d{12}$/;

exports.createValidPayment = async (req,res,next) => {
    try {
        const { amount, utr} = req.body;

        const numericAmount = Number(amount);
        if(!amount|| Number.isNaN(numericAmount)|| numericAmount<=0){
            return res.status(400).json({
                success: false,
                message: "A valid number is required!"
            })
        }

        if (!utr || typeof utr!=="string" || !UTR_REGEX.test(utr.trim())){
            return res.status(400).json({
                success: false,
                message: "UTR must be exactly 12 digits!"
            });
        }

        const payment = await ValidPayment.create({
            utr: utr.trim(),
            amount: numericAmount
        });

        res.status(201).json({
            success: true,
            data: payment
        });
    } catch (err){
        if(err.code===11000){
            return res.status(409).json({
                success: false,
                message: "This UTR has already been used!"
            })
        }
        next(err);
    }
}

exports.listValidPayments = async (req, res, next)=> {
    try{ 
        const payments =await ValidPayment.find().sort({createdAt:-1});
        res.json({
            success: true,
            data: payments
        })
    } catch (err){
        next(err);
    }
}