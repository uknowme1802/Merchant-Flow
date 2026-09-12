const Transaction = require("../models/Transaction");

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const DAY_NAMES = ["sun","mon","tue","wed","thr","fri","sat"];

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

        const revenueByMonth={};
        MONTH_NAMES.forEach(m=>{ revenueByMonth[m]=0 });

        const volumeByDay ={};
        DAY_NAMES.forEach(d=>{ volumeByDay[d] =0 });

        transactions.forEach(tx => {
            const parsedDate = new Date(tx.date);
            if(Number.isNaN(parsedDate.getTime())){
                return;
            }

            const month = MONTH_NAMES[parsedDate.getMonth()];
            revenueByMonth[month] += tx.amount;

            const day = DAY_NAMES[parsedDate.getDay()];
            volumeByDay[day] += tx.amount;
        });

        const revenueChartData = MONTH_NAMES.map(month => ({
            month,
            revenue: revenueByMonth[month]
        }));

        const transactionChartData = DAY_NAMES.map(day=>({
            day,
            transactions: volumeByDay[day]
        }))

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