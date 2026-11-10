import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "./layout/DashboardLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions"
import Analytics from "./pages/Analytics"
import Users from "./pages/Users";
import Security from "./pages/Security";
import Checkout from "./pages/Checkout";
import AdminPaymentCode from "./pages/AdminPaymentCode";
import Webhooks from "./pages/Webhooks";
import MerchantSignup from "./pages/MerchantSignup";
import MerchantAccount from "./pages/MerchantAccount";
import MerchantCredentials from "./pages/MerchantCredentials";
import MerchantTeam from "./pages/MerchantTeam";
import AdminMerchants from "./pages/AdminMerchants";



function ProtectedRoute({children}){
  const token = localStorage.getItem("user");
  return token?children:<Navigate to="/" />
}

function currentRole(){
  try { return JSON.parse(localStorage.getItem("user"))?.role } catch { return undefined }
}

// Merchant logins only see the merchant pages; everyone else keeps the existing screens.
function PlatformRoute({children}){
  return currentRole()==="merchant" ? <Navigate to="/merchant" /> : children
}

function RoleRoute({roles, children}){
  if(roles.includes(currentRole())) return children;
  return <Navigate to={currentRole()==="merchant" ? "/merchant" : "/dashboard"} />
}

function App(){
  return (
    <BrowserRouter>
      <Routes>
        
        <Route path="/" element={<Login />} />
        <Route path="/signup" element={<MerchantSignup />} />

        <Route element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route path="/dashboard" element={<PlatformRoute><Dashboard /></PlatformRoute>} />
          <Route path="/transactions" element={<PlatformRoute><Transactions /></PlatformRoute>} />
          <Route path="/analytics" element={<PlatformRoute><Analytics /></PlatformRoute>} />
          <Route path="/users" element={<RoleRoute roles={["admin"]}><Users /></RoleRoute>} />
          <Route path="/security" element={<PlatformRoute><Security /></PlatformRoute>} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/payment-code" element={<RoleRoute roles={["admin"]}><AdminPaymentCode /></RoleRoute>} />
          <Route path="/webhooks" element={<RoleRoute roles={["admin"]}><Webhooks /></RoleRoute>} />
          <Route path="/admin/merchants" element={<RoleRoute roles={["admin"]}><AdminMerchants /></RoleRoute>} />
          <Route path="/merchant" element={<RoleRoute roles={["merchant"]}><MerchantAccount /></RoleRoute>} />
          <Route path="/merchant/credentials" element={<RoleRoute roles={["merchant"]}><MerchantCredentials /></RoleRoute>} />
          <Route path="/merchant/team" element={<RoleRoute roles={["merchant"]}><MerchantTeam /></RoleRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;