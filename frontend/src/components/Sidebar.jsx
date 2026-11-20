import { ArrowDownToLine, PanelLeftClose, PanelLeftOpen, LayoutDashboard, CreditCard, BarChart3, ShieldCheck, ShoppingCart, KeyRound, Webhook, Store, Landmark, Banknote, Send, Users as UsersIcon } from "lucide-react"
import { useContext, useState } from "react"
import { NavLink } from "react-router-dom"
import { AuthContext } from "../context/AuthContext"

const STORAGE_KEY = "sidebarCollapsed"
const readCollapsed = () => {
    try { return localStorage.getItem(STORAGE_KEY) === "1" } catch { return false }
}

const link = (collapsed) => ({isActive}) => `flex items-center ${collapsed ? "justify-center px-0" : "gap-3 px-3"} py-2 rounded-xl text-sm transition ${isActive ? "bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-600/30 hover:text-white" : "text-gray-600 font-medium hover:bg-gray-100 hover:text-gray-900"}`;

const MERCHANT_LINKS = [
    { to: "/merchant/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/merchant/transactions", label: "Transactions", icon: CreditCard },
    { to: "/merchant", label: "Account", icon: Store, end: true },
    { to: "/merchant/credentials", label: "API credentials", icon: KeyRound },
    { to: "/merchant/team", label: "Team", icon: UsersIcon }
];

// Admins see every entry; agents see the ones without `admin`.
const PLATFORM_LINKS = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/transactions", label: "Transactions", icon: CreditCard },
    { to: "/payin", label: "Payin", icon: ArrowDownToLine },
    { to: "/analytics", label: "Analytics", icon: BarChart3 },
    { to: "/admin/merchants", label: "Merchants", icon: Store, admin: true },
    { to: "/admin/banks", label: "Banks", icon: Landmark, admin: true },
    { to: "/admin/bank-credits", label: "Bank Credits", icon: Banknote, admin: true },
    { to: "/users", label: "Users", icon: UsersIcon, admin: true },
    { to: "/security", label: "Security", icon: ShieldCheck },
    { to: "/checkout", label: "Checkout", icon: ShoppingCart },
    { to: "/payment-code", label: "Payment Codes", icon: KeyRound, admin: true },
    { to: "/webhook-events", label: "Webhook Events", icon: Send },
    { to: "/webhooks", label: "Webhooks", icon: Webhook, admin: true }
];

export default function Sidebar(){
    const { user } = useContext(AuthContext);
    // Collapsed shows only the icons. The choice is remembered in this browser.
    const [collapsed, setCollapsed] = useState(readCollapsed);

    const toggle = () => {
        const next = !collapsed
        setCollapsed(next)
        try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0") } catch { /* the choice just is not remembered */ }
    }

    const links = user?.role === "merchant"
        ? MERCHANT_LINKS
        : PLATFORM_LINKS.filter((item) => !item.admin || user?.role === "admin");

    return(
        <div className={`${collapsed ? "w-[4.5rem] p-3" : "w-64 p-5"} shrink-0 bg-white border-r border-gray-200/70 h-full overflow-y-auto transition-[width] duration-200`}>
            <div className={`mb-8 flex items-center ${collapsed ? "justify-center" : "justify-between px-3"}`}>
                {!collapsed && <h1 className="text-xl font-bold tracking-tight text-indigo-600">Merchant Flow</h1>}
                <button type="button" onClick={toggle} aria-expanded={!collapsed}
                    aria-label={collapsed ? "Expand the menu" : "Collapse the menu"} title={collapsed ? "Expand the menu" : "Collapse the menu"}
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800">
                    {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
                </button>
            </div>
            <nav className="flex flex-col gap-1.5">
                {links.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end} className={link(collapsed)} title={collapsed ? item.label : undefined} aria-label={item.label}>
                        <item.icon size={18} className="shrink-0" /> {!collapsed && item.label}
                    </NavLink>
                ))}
            </nav>
        </div>
    )
}
