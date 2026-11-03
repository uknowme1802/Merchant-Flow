import { useState, useEffect, useContext } from "react";
import API from "../services/api"
import Button from "../components/ui/Button";
import toast from "react-hot-toast";
import { AuthContext } from "../context/AuthContext";
import { Copy, Trash2 } from "lucide-react";

const EVENT_OPTIONS = ["checkout.created", "payment.success"];
const MIN_SECRET_LENGTH =16;

const isValidWebhookUrl = (value) => {
    try {
        const parsed = new URL(value);
        return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch {
        return false;
    }
};

const notifyError = (error, fallback) => {
    const status = error.response?.status;
    if(status=== 401 || status===403 || status === 500) return;
    toast.error(error.response?.data?.message || fallback)
};

export default function Webhooks () {
    const {user} = useContext(AuthContext);
    const isAdmin = user?.role === "admin";

    const [ webhooks, setWebhooks ] = useState([]);
    const [loading, setLoading] =useState(true);
    const [url, setUrl]  = useState("");
    const [selectedEvents, setSelectedEvents] = useState(EVENT_OPTIONS);
    const [secret, setSecret] = useState("");
    const [creating, setCreating] = useState(false);

    const [newSecret, setNewSecret] = useState(null); //shown only once upon creation
    const [expandedId, setExpandedId] = useState(null);
    const [deliveries, setDeliveries] = useState({});

    const fetchWebhooks = async()=>{
        try{
            const res = await API.get("/webhooks");
            setWebhooks(res.data.data);
        } catch(error){
            notifyError(error, "Failed to load Webhooks");
        } finally {
            setLoading(false);
        }
    };

    useEffect(()=>{
        if(!isAdmin) return;

        let ignore = false;

        const load = async () => {
            try{
                const res = await API.get("/webhooks");
                if(!ignore){
                    setWebhooks(res.data.data);
                }
            } catch(error){
                if(!ignore) notifyError(error, "Failed to load Webhooks");
            } finally {
                if(!ignore) setLoading(false);
            }
        };

        load();
        return () => { ignore = true; };
    },[isAdmin]);

    const toggleEvent = (event) => {
        setSelectedEvents((prev)=> prev.includes(event)?prev.filter((e)=>e!==event): [...prev, event])
    }

    const createWebhook = async () =>{
        const trimmedUrl = url.trim();
        const trimmedSecret = secret.trim();

        if(!isValidWebhookUrl(trimmedUrl)){
            toast.error("Enter a valid http(s) URL")
            return;
        }
        if (selectedEvents.length === 0){
            toast.error("Select at least one event");
            return;
        }
        if(trimmedSecret && trimmedSecret.length < MIN_SECRET_LENGTH){
            toast.error(`Secret must be at least ${MIN_SECRET_LENGTH} characters (or leave it empty to auto generated one)`);
            return;
        }
        
        setCreating(true);        
        try{
            const body = { url: trimmedUrl, events: selectedEvents };
            if(trimmedSecret) body.secret =trimmedSecret;

            const res = await API.post("/webhooks, body");

            setNewSecret({url: res.data.data.url, secret: res.data.data.secret});
            setUrl("");
            setSecret("");
            setSelectedEvents(EVENT_OPTIONS);
            toast.success("Webhook added");
            fetchWebhooks();
        } catch(error) {
            notifyError(error, "Failed to add webhook");
        } finally {
            setCreating(false);
        }
    };

    const copySecret = async()=> {
        try{
            await navigator.clipboard.writeText(newSecret.secret);
            toast.success("Secret copied");
        } catch {
            toast.error("Couldn't copy automatically -- select the text and copy it manually")
        }
    };

    const toggleActive = async (webhook) => {
        try{
            const res = await API.patch(`/webhooks/${webhook._id}`, { active: !webhook.active});
            setWebhooks((prev) => prev.map((w)=> (w._id===webhook._id?{...w, active: res.data.data.active}:w)));
        } catch (error){
            notifyError(error, "Failed to update Webhook");
        }
    }

    const removeWebhook = async(webhook) => {
        if(!window.confirm(`Delete this webhook?\n\n${webhook.url}`)) return;

        try{
            await API.delete(`/webhooks/${webhook._id}`);
            setWebhooks((prev)=> prev.filter((w) => w._id !==webhook._id));
            if( expandedId ===webhook._id) setExpandedId(null);
            toast.success("Webhook deleted");
        } catch(error) {
            notifyError(error, "Failed to delete Webhook");
        }
    };

    const loadDeliveries = async(id) =>{
        try{
            const res = await API.get(`/webhooks/${id}/deliveries`);
            setDeliveries((prev)=> ({...prev, [id]:res.data.data}));
        } catch(error){
            setDeliveries((prev)=>({...prev, [id]:null}));
            notifyError(error, "Failed to load deliveries")
        }
    };

    const toggleDeliveries = (id) =>{
        if(expandedId === id){
            setExpandedId(null);
            return;
        }

        setExpandedId(id);
        loadDeliveries(id);
    };

    if(!isAdmin){
        return <p className="text-sm text-gray-600">Admin access only</p>
    }

    return (
        <div className="max-w-2xl">
            <h1 className="text-xl font-bold mb-4">Webhooks</h1>

            {newSecret && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                <p className="text-sm font-semibold text-amber-800">
                    Webhook added -- copy your signing secret now
                </p>
                <p className="text-xs text-amber-700 mt-1 mb-3">
                    It won&apos;t be shown again. Your receiver uses it to verify the {" "}
                    <span className="font-mono">X-Webhook Signature</span> header on {" "}
                    <span className="font-mono break all">{newSecret.url}</span>
                </p>
                <div className="flex gap-2">
                    <input readOnly value= {newSecret.secret} onFocus={(e)=> e.target.select()} arial-label="Signing secret" className="flex-1 p-2 border rounded font-mono text-xs bg-white" />
                    <button onClick={copySecret} className="px-3 py-2 border rounded bg-white hover:bg-gray-50 flex items-center gap-1 text-sm">
                        <Copy size={14} /> Copy
                    </button>
                </div>
                <button onClick ={()=> setNewSecret(null)} className="text-xs text-amber-700 hover:underline mt-3">I&apos;ve saed it -dismiss</button>
                </div>
            )}

            <div className="bg-white border rounded-lg p-6 mb-6">
                <h2 className="font-semibold mb-3 text-sm text-gray-600">Add webhook</h2>
                <div className="space-y-3">
                    <input type="text" className="w-full p-2 border rounded" placeholder="https://example.com/webhook" value={url} onChange={(e)=>setUrl(e.target.value)} />
                    <div className="flex flex-wrap gap-4">
                        {EVENT_OPTIONS.map((event) => (
                            <label  key={event} className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={selectedEvents.includes(event)} onChange={()=>toggleEvent(event)} />

                                <span className="font-mono">{event}</span>
                            </label>
                        ))}
                    </div>

                    <input className="w-full p-2 border rounded font-mono text-sm" placeholder="Signing secret (optional-auto generated)" autoComplete="off" value={secret} onChange={(e)=>setSecret(e.target.value)} />

                <Button onClick={createWebhook} disabled={creating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded"> {creating? "Adding...":"Add Webhook"}

                </Button>
                </div>
            </div>

            <div className="bg-white border rounded-lg p-4">
                <h2 className="font-semibold mb-3 text-sm text-gray-600">Registered Webhooks</h2>

                {loading ?(
                    <p className="text-sm text-gray-500">Loading...</p>
                ) : webhooks.length===0? (
                    <p className="text-sm text-gray-500">No Webhooks Registered yet.</p>) : ( <div className="space-y-3">
                        { webhooks.map((w)=> {
                            const list = deliveries[w._id];

                            return (
                                <div key={w._id} className="border rounded-lg p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-mono break-all">{w.url}</p>
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {(w.events || []).map((event)=>( <span key={event} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">
                                                    {event}
                                                </span> ))}
                                            </div>
                                        </div>
                                        <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${w.active ? "bg-green-100 text-green-700": "bg-gray-100 text-gray-600"}`}>
                                            {w.active ? "Active": "Paused"}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 mt-3 text-sm">
                                        <button onClick ={()=> toggleActive(w)} className="text-indigo-600 hover:underline">
                                            {w.active?"Pause":"Resume"}
                                        </button>
                                        <button onClick={()=>toggleDeliveries(w._id)} className="text-indigo-600 hover:underline">
                                            {expandedId === w._id ? "Hide deliveries" : "View deliveries"}
                                        </button>
                                        <button onClick={()=> removeWebhook(w)} className="text-red-600 hover:underline ml-auto flex items-center gap-1"> 
                                            <Trash2 size={14} /> Delete
                                        </button>
                                    </div>

                                    { expandedId===w._id && (
                                        <div className="mt-3 border-t pt-3">
                                            <div className="flex items-center justify-between mb-2">
                                                <p className="text-xs text-gray-500">Last 25 delivery attemps</p>
                                                <button onClick={()=>loadDeliveries(w._id)} className="text-xs text-indigo-600 hover:underline">
                                                    Refresh
                                                </button>
                                            </div>

                                            {list === undefined ? ( <p className="text-xs text-gray-500">Loading...</p>): list === null ? ( <p className="text-xs text-red-500">Couldn&apos;t load deliveries.</p>) : list.length === 0 ? ( <p className="text-xs text-gray-500">No deliveries yet</p>)
                                            : (
                                                <div>
                                                    {list.map((d)=>( <div key={d._id} className="grid grid-cols-[1fr_auto_auto] gap-3 items-start text-xs border-b-py-2">
                                                        <div className="min-w-0">
                                                            <span className="font-mono">{d.event}</span>
                                                            <span className="block text-gray-400">
                                                               {new Date(d.createdAt).toLocaleString()}
                                                            </span>
                                                            {!d.success && d.error && (
                                                                <span className="block text-red-500 break-words">{d.error}</span>
                                                            )}
                                                        </div>
                                                        <span className="w-10 text-right text-gray-500">
                                                            {d.statusCode ?? "-"}
                                                        </span>
                                                        <span className={`w-20 text-right ${d.success ? "text-green-600" : "text-red-600" }`}>
                                                            {d.success ? "Delivered":"Failed"}
                                                        </span>
                                                    </div> ))}
                                                </div>
                                            ) }

                                        </div>
                                    ) }
                                </div>
                            )
                        }) }
                    </div> ) }
            </div>
        </div>
    )
}
