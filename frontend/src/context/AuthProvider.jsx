import { useState } from "react";
import { AuthContext } from "./AuthContext";

// Read the saved session once, before the first render, so no effect is needed
const restoreUser = () => {
  try {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");

    if (storedUser && token) {
      return JSON.parse(storedUser);
    }
    return null;
  } catch (err) {
    console.error("Auth restore error:", err);
    localStorage.clear();
    return null;
  }
};

export const AuthProvider = ({ children }) => {

  const [user, setUser] = useState(restoreUser);

  const login = (userData, token, refreshToken) => {
    localStorage.setItem("user", JSON.stringify(userData));
    localStorage.setItem("token", token);
    if (refreshToken) localStorage.setItem("refreshToken", refreshToken);
    setUser(userData);
  };

  const logout = () => {
    // Revoke the refresh token on the server (best effort), then clear local state
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken) {
      fetch(`${import.meta.env.VITE_API_URL}/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: refreshToken }),
        keepalive: true,
      }).catch(() => {});
    }
    localStorage.clear();
    setUser(null);
    window.location.href = "/";
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};