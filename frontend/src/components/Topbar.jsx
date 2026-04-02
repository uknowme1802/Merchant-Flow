import { Bell, User } from "lucide-react";
import { AuthContext } from "../context/AuthContext";
import { useState, useContext} from "react";

export default function Topbar() {

  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const {user, logout} = useContext(AuthContext);

  const toggleNotif = ()=>{
    setNotifOpen(!notifOpen);
    if (open) setOpen (false);
  };

  const toggleProfile = () =>{
    setOpen(!open);
    if (notifOpen) setNotifOpen(false);
  };

  return (
    <div className="flex justify-between items-center bg-white p-4 border-b">

      {/* Left */}
      <h2 className="text-lg font-semibold">Welcome, {user?.email||"Guest"} 👋</h2>

      {/* Right */}
      <div className="flex items-center gap-6">

        {/* Notifications */}
        <div className="relative">
          <Bell
            className="cursor-pointer"
            onClick={toggleNotif}
          />

          {notifOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white shadow-lg rounded-lg p-4">
              <p className="text-sm font-semibold mb-2">Notifications</p>
              <p className="text-sm text-gray-500">
                No new notifications
              </p>
            </div>
          )}
        </div>

        {/* Profile */}
        <div className="relative">
          <div
            onClick={toggleProfile}
            className="flex items-center gap-2 cursor-pointer"
          >
            <User />
            {/* <span className="text-sm">Admin</span> */}
            <div className="flex flex-col">
              <span className="text-sm font-medium">
                {user?.email || "User"}
              </span>

              <span className="text-xs text-gray-500 capitalize">
                {user?.role}
              </span>
            </div>
          </div>

          {open && (
            <div className="absolute right-0 mt-2 w-40 bg-white shadow-lg rounded-lg">

              <button className="block w-full text-left px-4 py-2 hover:bg-gray-100">
                Profile
              </button>

              <div className="px-4 py-2 text-xs text-gray-500 border-t">
                Role: <span className="capatilize">{user?.role}</span>
              </div>

              <button className="block w-full text-left px-4 py-2 hover:bg-gray-100"
              onClick={logout}
              >
                Logout
              </button>

            </div>
          )}
        </div>

      </div>
    </div>
  );
}