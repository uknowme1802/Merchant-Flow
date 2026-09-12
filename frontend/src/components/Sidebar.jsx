import { LayoutDashboard, CreditCard, BarChart3, Shield, ShieldCheck, ShoppingCart } from "lucide-react"
import { useContext } from "react"
import { NavLink } from "react-router-dom"
import { AuthContext } from "../context/AuthContext"


export default function Sidebar(){
    const { user } = useContext(AuthContext);
    return(
        <div className="w-64 bg-white border-r h-full p-6">
            <h1 className="text-2xl font-bold text-indigo-600 mb-10">Merchant Flow</h1>
            <nav className="flex flex-col gap-4">
                <NavLink to="/dashboard" className={({isActive})=>`flex items-center gap-3 p-2 rounded-lg ${isActive? 
                        "bg-indigo-100 text-indigo-600": "text-gray-600"}`}>
                            <LayoutDashboard size={18} /> Dashboard
                </NavLink>

                <NavLink to="/transactions" className={({isActive})=>`flex items-center gap-3 p-2 rounded-lg ${isActive? 
                        "bg-indigo-100 text-indigo-600": "text-gray-600"}`}>
                            <CreditCard size={18} /> Transactions
                </NavLink>

                <NavLink to="/analytics" className={({isActive})=>`flex items-center gap-3 p-2 rounded-lg ${isActive? 
                        "bg-indigo-100 text-indigo-600": "text-gray-600"}`}>
                            <BarChart3 size={18} /> Analytics
                </NavLink>

                {user?.role === "admin" && (
                    <NavLink to="/users" className={({isActive})=>`flex items-center gap-3 p-2 rounded-lg ${isActive? 
                        "bg-indigo-100 text-indigo-600": "text-gray-600"}`}>
                            <LayoutDashboard size={18} /> Users
                    </NavLink>
                )}

                <NavLink to="/security" className={({isActive})=>`flex items-center gap-3 p-2 rounded-lg ${isActive?
                    "bg-indigo-100 text-indigo-600": "text-gray-600"
                }`}>
                    <ShieldCheck size={18} /> Security
                </NavLink>

                <NavLink to="/checkout" className={({isActive}) => `flex items-center gap-3 p-2 rounded-lg ${isActive?
                    "bg-indigo-100 text-indigo-600":"text-gray-600"
                }`}>
                    <ShoppingCart size={18} /> Payment Codes
                </NavLink>
            </nav>
        </div>
    )
}