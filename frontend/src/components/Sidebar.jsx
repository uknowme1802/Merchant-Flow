import { LayoutDashboard, CreditCard, BarChart3, ShieldCheck, ShoppingCart, KeyRound, Webhook, Store, Landmark, Banknote, Send, Users as UsersIcon } from "lucide-react"
import { useContext } from "react"
import { NavLink } from "react-router-dom"
import { AuthContext } from "../context/AuthContext"

const link = ({isActive}) => `flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition ${isActive ? "bg-indigo-600 text-white font-semibold shadow-sm shadow-indigo-600/30 hover:text-white" : "text-gray-600 font-medium hover:bg-gray-100 hover:text-gray-900"}`;

const MERCHANT_LINKS = [
    { to: "/merchant", label: "Account", icon: Store, end: true },
    { to: "/merchant/credentials", label: "API credentials", icon: KeyRound },
    { to: "/merchant/team", label: "Team", icon: UsersIcon }
];

// Admins see every entry; agents see the ones without `admin`.
const PLATFORM_LINKS = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/transactions", label: "Transactions", icon: CreditCard },
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

    const links = user?.role === "merchant"
        ? MERCHANT_LINKS
        : PLATFORM_LINKS.filter((item) => !item.admin || user?.role === "admin");

    return(
        <div className="w-64 shrink-0 bg-white border-r border-gray-200/70 h-full p-5 overflow-y-auto">
            <h1 className="px-3 text-xl font-bold tracking-tight text-indigo-600 mb-8">Merchant Flow</h1>
            <nav className="flex flex-col gap-1.5">
                {links.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end} className={link}>
                        <item.icon size={18} /> {item.label}
                    </NavLink>
                ))}
            </nav>
        </div>
    )
}
