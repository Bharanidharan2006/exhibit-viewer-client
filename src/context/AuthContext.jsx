import React, { createContext, useContext, useState, useEffect } from "react";
import api from "../api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [ready, setReady] = useState(false); // true once we've checked localStorage

  // Rehydrate from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("arteria_session");
    if (stored) {
      try {
        const { user, token } = JSON.parse(stored);
        setUser(user);
        setToken(token);
        api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      } catch {
        /* bad JSON */
      }
    }
    setReady(true);
  }, []);

  const login = ({ user, token }) => {
    setUser(user);
    setToken(token);
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    localStorage.setItem("arteria_session", JSON.stringify({ user, token }));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    delete api.defaults.headers.common["Authorization"];
    localStorage.removeItem("arteria_session");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, ready }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
