import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, RotateCw } from "lucide-react";
import toast from "react-hot-toast";
import API from "../services/api";
import Pagination from "./ui/Pagination";

const PAGE_SIZE = 15;
const SEARCH_DEBOUNCE_MS = 400;

const formatDate = (iso) =>
    new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

const formatTime = (iso) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function WebhookLogs() {
    const [search, setSearch] = useState("");
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(1);
    const [logs, setLogs] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [replaying, setReplaying] = useState(null);

    // Debounce typing so we don't hit the API on every keystroke
    useEffect(() => {
        const timer = setTimeout(() => {
            setQuery(search.trim());
            setPage(1);
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [search]);

    const loadLogs = useCallback(async () => {
        setLoading(true);
        setFailed(false);
        try {
            const params = { page, limit: PAGE_SIZE };
            if (query) params.transactionId = query;
            const res = await API.get("/webhooks/deliveries", { params });
            setLogs(res.data.data);
            setTotal(res.data.total);
        } catch {
            // API interceptor already toasts 401/403/500
            setFailed(true);
        } finally {
            setLoading(false);
        }
    }, [page, query]);

    useEffect(() => {
        loadLogs();
    }, [loadLogs]);

    const replay = async (id) => {
        setReplaying(id);
        try {
            const res = await API.post(`/webhooks/deliveries/${id}/replay`);
            if (res.data.data.success) {
                toast.success("Webhook re-sent and delivered");
            } else {
                toast.error(res.data.data.error || "Receiver still failing");
            }
            await loadLogs();
        } catch (error) {
            toast.error(error.response?.data?.message || "Replay failed");
        } finally {
            setReplaying(null);
        }
    };

    const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

    return (
        <div className="bg-white border rounded-lg p-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by transaction ID (e.g. TXN-...)"
                        aria-label="Search webhook logs by transaction ID"
                        className="w-full pl-9 p-2 border rounded font-mono text-sm"
                    />
                </div>
                <button
                    onClick={loadLogs}
                    className="px-3 py-2 border rounded bg-white hover:bg-gray-50 flex items-center justify-center gap-1 text-sm"
                >
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            <p className="text-xs text-gray-500 mb-2">
                {query
                    ? `${total} webhook ${total === 1 ? "delivery" : "deliveries"} for "${query}"`
                    : `${total} webhook ${total === 1 ? "delivery" : "deliveries"} in total`}
            </p>

            {loading ? (
                <p className="text-sm text-gray-500">Loading...</p>
            ) : failed ? (
                <p className="text-sm text-red-500">Couldn&apos;t load webhook logs.</p>
            ) : logs.length === 0 ? (
                <p className="text-sm text-gray-500">
                    {query ? "No webhooks were sent for this transaction." : "No webhooks have been sent yet."}
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                        <thead>
                            <tr className="text-gray-500 border-b">
                                <th className="py-2 pr-3 font-medium">Date &amp; time</th>
                                <th className="py-2 pr-3 font-medium">Transaction ID</th>
                                <th className="py-2 pr-3 font-medium">Event</th>
                                <th className="py-2 pr-3 font-medium">Sent to</th>
                                <th className="py-2 pr-3 font-medium text-right">Code</th>
                                <th className="py-2 pr-3 font-medium text-right">Attempts</th>
                                <th className="py-2 font-medium text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((d) => (
                                <tr key={d._id} className="border-b align-top">
                                    <td className="py-2 pr-3 whitespace-nowrap">
                                        {formatDate(d.createdAt)}
                                        <span className="block text-gray-400">{formatTime(d.createdAt)}</span>
                                    </td>
                                    <td className="py-2 pr-3 font-mono break-all">{d.transactionId ?? "-"}</td>
                                    <td className="py-2 pr-3 font-mono">{d.event}</td>
                                    <td className="py-2 pr-3 break-all">
                                        {d.webhook?.url ?? <span className="text-gray-400">(webhook deleted)</span>}
                                    </td>
                                    <td className="py-2 pr-3 text-right text-gray-500">{d.statusCode ?? "-"}</td>
                                    <td className="py-2 pr-3 text-right text-gray-500">{d.attempts ?? 1}</td>
                                    <td className="py-2 text-right whitespace-nowrap">
                                        <span className={d.success ? "text-green-600" : d.nextRetryAt ? "text-amber-600" : "text-red-600"}>
                                            {d.success ? "Delivered" : d.nextRetryAt ? "Retrying" : "Failed"}
                                        </span>
                                        {!d.success && d.nextRetryAt && (
                                            <span className="block text-gray-400">
                                                next {formatTime(d.nextRetryAt)}
                                            </span>
                                        )}
                                        {!d.success && (
                                            <button
                                                onClick={() => replay(d._id)}
                                                disabled={replaying === d._id}
                                                className="mt-1 inline-flex items-center gap-1 text-indigo-600 hover:underline disabled:opacity-50"
                                            >
                                                <RotateCw size={12} /> {replaying === d._id ? "Sending..." : "Replay"}
                                            </button>
                                        )}
                                        {!d.success && d.error && (
                                            <span className="block text-red-500 break-words">{d.error}</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && !failed && total > PAGE_SIZE && (
                <Pagination page={page} setPage={setPage} totalPages={totalPages} />
            )}
        </div>
    );
}
