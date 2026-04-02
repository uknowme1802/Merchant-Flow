import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DashboardLayout from "./layout/DashboardLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions"
import Analytics from "./pages/Analytics"
import Users from "./pages/Users";

function ProtectedRoute({children}){
  const token = localStorage.getItem("user");
  return token?children:<Navigate to="/" />
}

function App(){
  return (
    <BrowserRouter>
      <Routes>
        
        <Route path="/" element={<Login />} />

        <Route element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route path="/dashboard" element={<Dashboard/>}/>
          <Route path="/transactions" element={<Transactions/>}/>
          <Route path="/analytics" element={<Analytics/>}/>
          <Route path = "/users" element={<Users />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;