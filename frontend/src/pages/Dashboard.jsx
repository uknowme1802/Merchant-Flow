import { useState, useEffect } from "react";
import API from "../services/api";

import StatCard from "../components/StatCard"
import { DollarSign, CreditCard, RefreshCcw, Users } from "lucide-react"
import { useNavigate } from "react-router-dom"
import RevenueChart from "../components/charts/RevenueChart"
import TransactionChart from "../components/charts/TransactionChart"
import PaymentPieChart from "../components/charts/PaymentPieChart"
// import Transactions from "./Transactions";

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats]= useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(()=>{
    fetchStats();
    // API.get("/dashboard")
    // .then(res=>setStats(res.data))
    // .catch(err=>console.error(err))
  },[]);

  const fetchStats = async () =>{
    try{
      setLoading(true);

      const res = await API.get("/dashboard");
      setStats(res.data);
    } catch(err){
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-6 bg-gray-300 rounded w-1/4"></div>
        <div className="h-20 bg-gray-300 rounded"></div>
      </div>
    );
  }

  // if(!stats){
  //   return <p>Loading data...</p>
  // } 

  return (
    <div>

      <h1 className="text-2xl font-bold mb-6">
        Dashboard Overview
      </h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">

        <StatCard
          title="Total Revenue"
          value={`$${stats.totalRevenue}`}
          icon={<DollarSign />}
          onClick={()=> navigate("/analytics")}
        />

        <StatCard
          title="Success Transactions"
          value={stats.successCount}
          icon={<CreditCard />}
          onClick={()=> navigate("/transactions")}
        />

        <StatCard
          title="Failed Transactions"
          value={stats.failedCount}
          icon={<RefreshCcw />}
        />

        <StatCard
          title="Total Transactions"
          value={stats.TotalTransactions}
          icon={<Users />}
        />

      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">

        <RevenueChart />

        <TransactionChart />

        <PaymentPieChart />

      </div>

    </div>
  )
}