import { useState, useEffect } from "react";
import API from "../services/api";
import Button from "../components/ui/Button";
import toast from "react-hot-toast";

export default function AdminPaymentCode(){
    const [amount, setAmount] = useState("");
    const [utr, setUtr] = useState("");
    const [saving, setSaving] = useState(false);

    const [payments, setPayments] =useState([]);
    const [loading, setLoading] = useState(true);

    const fetchPayments = async () => {
        try {
            const res = await API.get("/valid-payments");
            setPayments(res.data.data);
        } catch{
            toast.error("Failed to load Payment codes")
        } finally{
            setLoading(false);
        }
    };

    useEffect(()=>{
        let ignore = false;

        const load = async () => {
            try {
                const res = await API.get("/valid-payments");
                if(!ignore){
                    setPayments(res.data.data)
                }
            } catch {
                if(!ignore) toast.error("Failed to load payment codes");
            } finally{
                if(!ignore)  setLoading(false);
            }
        };
        load();
        return() =>{ ignore = true; }
    },[]);

    const handleUtrChange = (e) => {
        setUtr(e.target.value.replace(/\D/g, "").slice(0,12));
    };

    const saveUtr = async()=>{
        const numericAmount = Number(amount);
        if(!amount|| Number.isNaN(numericAmount) || numericAmount<=0){
            toast.error("Enter an valid amount");
            return;
        }
        if(utr.length!== 12){
            toast.error("UTR must be exactly 12 digits");
            return;
        }

        setSaving(true);
        try {
            await API.post("/valid-payments", {amount: numericAmount, utr});
            toast.success("Payment code saved");
            setAmount("");
            setUtr("");
            fetchPayments();
        } catch (error){
            toast.error(error.response?.data?.message || "Failed to save");
        } finally{
            setSaving(false);
        }
    }

    return(
        <div className="max-w-lg">
            <h1 className="text-xl font-bold mb-4">Payment codes</h1>

            <div className="bg-white border rounded-lg p-6 mb-6">
                <div className="space-y-3">
                    <input type="number" className="w-full p-2 border rounded" placeholder="Amount" value={amount} onChange={(e)=>setAmount(e.target.value)} />

                    <input className="w-full p-2 border rounded tracking-widest" placeholder="12-digit UTR" inputMode="numeric" value={utr} onChange={handleUtrChange} />

                    <Button onClick={saveUtr}
                    disabled={saving}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded">
                        {saving ? "Saving...":"Save UTR"}
                    </Button>
                </div>
            </div>

            <div className="bg-white border rounded-lg p-4">
                <h2 className="font-semibold mb-3 text-sm text-gray-600">
                    Existing Codes
                </h2>

                {loading ? (
                    <p className="text-sm text-gray-500">Loading...</p>
                ):payments.length === 0? (
                    <p className="text-sm text-gray-500">No payment codes added yet</p>
                ):(
                    <div className="space-y-1">
                        <div className="grid grid-cols-[1fr_auto_auto] gap-4 text-xs text-gray-400 uppercase pb-2 border-b">
                            <span>UTR</span>
                            <span className="text-right">Amount</span>
                            <span className="w-20 text-right">Status</span>
                        </div>
                        {payments.map((p) => (
                            <div key={p._id} className="grid grid-cols-[1fr_auto_auto] gap-4 items-center text-sm border-b py-2">
                                <span className="font mono">{p.utr}</span>
                                <span className="text-right">₹{p.amount}</span>
                                <span className={`w-20 text-right ${p.used ? "text-gray-400": "text-green-600"}`}>
                                    {p.used ? "Used" : "Available"}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}