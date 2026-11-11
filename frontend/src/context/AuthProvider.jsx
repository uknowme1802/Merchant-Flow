import { useState, useEffect } from "react";
import { AuthContext } from "./AuthContext";

export const AuthProvider = ({ children }) => {

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem("user");
      const token = localStorage.getItem("token");

      if (storedUser && token) {
        setUser(JSON.parse(storedUser));
      } else {
        setUser(null);
      }

    } catch (err) {
      console.error("Auth restore error:", err);
      localStorage.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

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

  if (loading) {
    return null; // or loader
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};