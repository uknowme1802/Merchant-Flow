import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import API from "../services/api";

const SESSION_CHECK_GAP_MS = 10000;


export default function DashboardLayout() {
  // If an admin reset this user's password, disabled them, changed their role or suspended their
  // merchant, the server has already ended the session. Asking when the tab is shown again sends
  // them to the login page straight away, instead of on their next click.
  useEffect(() => {
    let last = 0;
    const check = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < SESSION_CHECK_GAP_MS) return;
      last = Date.now();
      API.get("/auth/session").catch(() => {});
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  return (
    <div className="flex h-screen bg-[#F5F5FA]">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />

        <main className="p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}