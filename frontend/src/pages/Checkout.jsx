import { useState } from "react";
import API from "../services/api";
import Button from "../components/ui/Button";
import toast from "react-hot-toast";

export default function Checkout() {
    const [step, setStep] = useState("amount");
    const [amount, setAmount] = useState("");
    const [order, setOrder] = useState(null);
    const [qrCode, setQrCode] = useState(null);

    const [paidClicked, setPaidClicked] =useState(false);
    const [utr, setUtr] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [pendingMessage, setPendingMessage] = useState("");
    
    const startCheckout = async () => {
        const numericAmount = Number(amount);
        if(!amount || Number.isNaN(numericAmount) || numericAmount<=0){
            toast.error("Enter the valid Amount!");
            return;
        }

        try{
            const res = await API.post("/checkout", {amount: numericAmount});
            setOrder(res.data.data);
            setQrCode(res.data.qrCode);
            setStep("pay");
        } catch (error) {
            toast.error(error.response?.data?.message || "Failed to start checkout")
        }
    }

    const handleUtrChange = (e) => {
        const digitsOnly = e.target.value.replace(/\D/g, "").slice(0,12);
        setUtr(digitsOnly);
    }

    const submitUtr = async () => {
        if(utr.length !==12){
            toast.error("UTR must be exactly 12-digits");
            return;
        }

        setVerifying(true);
        setPendingMessage("");
        try {
            const res = await API.post(`/checkout/${order._id}/verify`, {utr});

            if(res.data.verified){
                setOrder(res.data.data);
                setStep("Success");
            } else {
                setPendingMessage(res.data.message || "Payment could not be verified yet");
            }
        } catch (error){
            toast.error(error.response?.data?.message || "Verificaton Failed")
        } finally{
            setVerifying(false);
        }
    }

    const startOver = () => {
        setStep("amount");
        setAmount("");
        setOrder(null);
        setQrCode(null);
        setPaidClicked(false);
        setUtr("");
        setPendingMessage("");
    };

    return (
        <div className="max-w-md mx-auto">
            <h1 className="text-xl font-bold mb-4 text-center">Checkout</h1>
            <div className="bg-white border rounded-lg p-6 shadow-sm">
                {step === "amount" && (
                    <div className="space-y-3">
                        <p className="text-sm text-gray-600">
                            Enter the amount to pay
                        </p>
                        <input type="number" className="w-full p-2 border rounded" placeholder="Amount (e.g. 500)" 
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)} />
                        <Button onClick={startCheckout} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded">Submit</Button>
                    </div>
                )}

                {step === "pay" && (
                    <div className="space-y-4">
                        <div className="bg-gray-50 border rounded-lg p-4 flex flex-col items-center text-center">
                            <p className="text-sm text-gray-500 mb-1">Amount to Pay</p>
                            <p className="text-2xl font-bold text-indigo-600 mb-4">₹{order.amount}</p>

                            <img src={qrCode} alt="UPI QR Code" className="w-48 h-48 border rounded bg-white" />

                            <p className="text-xs text-gray-400 mt-2">Scan with any UPI app</p>
                        </div>

                        {!paidClicked && (
                            <Button onClick={()=>setPaidClicked(true)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded">
                                Paid
                            </Button>
                        )}

                        {paidClicked && (
                            <div className="space-y-3">
                                <input type="text" className="w-full p-2 border rounded text-center tracking-widest" placeholder="Enter 12-digit UTR" inputMode="numeric"
                                value={utr}
                                onChange={handleUtrChange}
                                disabled={verifying}/> 
                                {pendingMessage && (<p className="text-xs text-amber-600 text-center">
                                    {pendingMessage}
                                </p>  )}
                                <Button onClick={submitUtr}
                                disabled={verifying}
                                className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded flex items-center justify-center gap-2">
                                    {
                                        verifying && (
                                            <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        )
                                    }

                                    { verifying? "Verifying..." : "Submit"}
                                </Button>
                            </div>
                        )}

                        <button onClick={startOver} className="w-full text-sm text-gray-500 hover:underline">
                            Cancel and start over
                        </button>
                    </div>
                )}

                {step === "success" && (
                    <div className="text-center space-y-3">
                        <p className="text-gree-600 font-semibold text-lg">
                            ✅Payment Successfull
                        </p>

                        <Button onClick={startOver} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded">
                            New Order
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}