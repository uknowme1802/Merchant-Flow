import { useState, useEffect } from "react";
import API from "../services/api";
import Button from "../components/ui/Button";
import toast from "react-hot-toast";

export default function Security(){
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);

    const [qrCode, setQrCode] = useState(null);
    const [manualSecret, setManualSecret] = useState(null);
    const [setupCode, setSetupCode] = useState("");

    const [disableCode, setDisableCode] = useState("");

    useEffect(()=>{
        let ignore = false;
        const load = async () => {
            try{
                const res = await API.get("/2fa/status");
                if(!ignore){
                    setEnabled(res.data.enabled);
                }
            } catch {
                toast.error("Failed to load 2FA status");
            } finally {
                if(!ignore) setLoading(false);
            }
        };

        load();
        return () => {ignore=true;}
    },[]);

    const startSetup = async () => {
        try {
            const res = await API.post("/2fa/setup");
            setQrCode(res.data.qrCode);
            setManualSecret(res.data.secret);
        } catch (error){
            toast.error(error.response?.data?.message || "failed to start 2FA setup")
        }
    }

    const confirmEnable = async () => {
        if(!setupCode){
            toast.error("Enter the code from your AUthenticator App");
            return;
        }
        try{
            await API.post("/2fa/enable", {token: setupCode});
            toast.success("Two-Factor authentication enabled")
            setEnabled(true);
            setQrCode(null);
            setManualSecret(null);
            setSetupCode("");
        } catch (error){
            toast.error(error.response?.data?.message || "Invalid code")
        }
    }

    const disable = async () => {
        if(!disableCode){
            toast.error("Enter your current authenticator code to disable 2FA");
            return;
        }

        try{
            await API.post("/2fa/disable", {token: disableCode});
            toast.success("Two-factor authentication disabled");
            setEnabled(false);
            setDisableCode("");
        } catch (error){
            toast.error(error.response?.data?.message || "Invalid code");
        }
    };

    if(loading){
        return <p>Loading security settings...</p>
    }

    return (
        <div className="max-w-md">
            <h1 className="text-xl font-bold mb-4">Security</h1>

            <div className="bg-white border rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="font-semibold">Two-Factor Authentication</h2>
                        <p className="text-sm text-gray-500">
                            { enabled 
                            ? "Enabled- an authenticator code is required for login" : "Add an extra layer of security using an authenticator app (e.g. Google Authenticator)."}
                        </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                        {enabled? "ON": "OFF"}
                    </span>
                </div>
                {!enabled && !qrCode && (
                    <Button onClick={startSetup} className="bg-indigo-600 text-white px-4 py-2 rounded">Setup 2 FA</Button>
                )} 

                {!enabled && qrCode && (
                    <div className="mt-4 space-y-3">
                        <p className="text-sm text-gray-600">
                            Scan this qr code with Google authenticator (or any TOTP app):
                        </p>
                        <img src={qrCode} alt="2FA QR Code" className="border rounded" />
                        <p className="text-xs text-gray-500 break-all">
                            Can&apos;t scan? Enter this key manually: <span className="font-mono">{manualSecret}</span>
                        </p>

                        <input className="w-full p-2 border rounded text-center tracking-widest"
                        placeholder="Enter 6-digit code"
                        maxLength={6}
                        value={setupCode}
                        onChange={(e)=> setSetupCode(e.target.value.replace(/\D/g, ""))}
                        />
                        <Button onClick={confirmEnable} className="bg-green-600 text-white px-4 py-2 rounded w-full">
                            Confirm and Enable
                        </Button>
                    </div>
                )}

                {enabled && (
                    <div className="mt-4 space-y-3">
                        <p className="text-sm text-gray-600">
                            Enter a current authenticator code to disable 2FA
                        </p>
                        <input className="w-full p-2 border rounded text-center tracking-widest" placeholder="Enter the 6-digits code" maxLength={6}
                        value={disableCode}
                        onChange={(e)=> setDisableCode(e.target.value.replace(/\D/g,""))}/>
                        <Button onClick={disable} className="bg-red-600 text-white px-4 py-2 rounded w-full">Disable 2FA</Button>
                    </div>
                )}
            </div>
        </div>
    )
}
