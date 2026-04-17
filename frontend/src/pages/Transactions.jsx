import { useState, useEffect, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import API from "../services/api";
import Papa from "papaparse" 

import TransactionTable from "../components/TransactionTable";
import TransactionFilters from "../components/TransactionFilters";
import Pagination from "../components/ui/Pagination";

import toast from "react-hot-toast";

export default function Transactions(){
  const {user} = useContext(AuthContext);
  const [transactions, setTransactions]=useState([]);
  const [search, setSearch]=useState("")
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("All");
  const [sort, setSort] = useState("");
  const [page, setPage] = useState(1);
  const [lastUpdated, setLastUpdated] = useState(null);

  const pageSize = 5;
  useEffect(()=>{
    fetchTransactions();
    // API.get("/transactions")
    // .then(res=>setTransactions(res.data))
    // .catch(err=>console.error(err))
  },[]);

  // if(!transactions){
  //   return <p>Transactions loading...</p>
  // }
  const fetchTransactions = async () =>{
    try{
      setLoading(true);
      const res = await API.get("/transactions");
      setTransactions(res.data.data);
      setLastUpdated(new Date().toLocaleTimeString());
    }catch(err){
      console.error(err)
      toast.error("Failed to load Transactions")
    } finally{
      setLoading(false);
    }
  }
  
  //Skeleton code
  if (loading){
    return (
      <div className="p-6">
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-gray-300 rounded w-1/4"></div>
        <div className="h-20 bg-gray-300 rounded"></div>
        <div className="h-20 bg-gray-300 rounded"></div>
      </div>
    </div>
    )
  }

  if(!transactions || !transactions.length){
    return <p>No transactions Found</p>
  }

  let filtered=transactions.filter(tx=>tx.id.toLowerCase().includes(search.toLowerCase()));

  const exportCSV = () =>{
    const csv=Papa.unparse(transactions);
    const blob = new Blob([csv],{type: "text/csv;charset=utf-8;"});
    const url = window.URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download","transaction.csv");
    document.body.appendChild(link);
    link.click();
  }

  //Status
  if (status !="All"){
    filtered=filtered.filter(tx=>tx.status===status);
  }

  if (sort==="amount"){
    filtered.sort((a,b)=>b.amount-a.amount);
  }

  if (sort==="date"){
    filtered.sort((a,b)=>new Date(b.date)-new Date(a.date));
  }

  //Pagination
  const totalPages=Math.ceil(filtered.length/pageSize);
  const paginated=filtered.slice(
    (page-1)*pageSize,
    page*pageSize
  );

  const addTransaction = async() =>{
    try{
      await API.post("/transactions",{
        id: "Txn" + Math.floor(Math.random() * 10000),
        amount:Math.floor(Math.random()*1000),
        status: "Success",
        date: new Date().toISOString().split("T")[0]
      });
      toast.success("Tranaction added!")
      fetchTransactions();
    } catch(err){
      console.error(err);
      if(err.response?.status === 403){
        toast.error("Only admin can add transactions");
      } else {
        toast.error(err.response?.data?.message || "Failed to add transaction");
      }
    }
  }; 

  return(
    <div>
      <h1 className="text-2xl font-bold mb-6">Transactions</h1>

      {user?.role==="admin" &&(
        <button onClick={addTransaction}
        className="mb-4 bg-green-600 text-white px-4 py-2 rounded">
          +Add Transaction
        </button>
      )}
      <button onClick={exportCSV} className="bg-blue-600 text-white px-4 py-2 rounded">
        Export CSV
      </button>

      <p className="text-sm text-gray-500 mb-4">
        Last updated: {lastUpdated}
      </p>
      
      <TransactionFilters 
      search={search} 
      setSearch={setSearch}
      status={status}
      setStatus={setStatus}
      sort={sort}
      setSort={setSort}
      />
      
      <TransactionTable transactions={paginated} />

      <Pagination
      page={page}
      setPage={setPage}
      totalPages={totalPages}
      />
    </div>
  )
}