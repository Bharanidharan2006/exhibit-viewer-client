import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="nav">
      <Link to="/" className="nav-logo">
        Art<span>e</span>ria
      </Link>
      <div className="nav-links">
        {user?.role === "customer" && (
          <>
            <Link to="/exhibitions">Exhibitions</Link>
            <span style={{ color: "var(--border-sub)" }}>|</span>
            <span style={{ color: "var(--ink)", fontWeight: 400 }}>
              {user.name}
            </span>
            <button onClick={handleLogout}>Sign out</button>
          </>
        )}
        {user?.role === "business" && (
          <>
            <Link to="/business/dashboard">Dashboard</Link>
            <Link to="/business/create">New Exhibition</Link>
            <span style={{ color: "var(--border-sub)" }}>|</span>
            <span style={{ color: "var(--ink)", fontWeight: 400 }}>
              {user.name}
            </span>
            <button onClick={handleLogout}>Sign out</button>
          </>
        )}
        {!user && (
          <>
            <Link to="/login">Customer Login</Link>
            <Link to="/business/login">Exhibitor Login</Link>
          </>
        )}
      </div>
    </nav>
  );
}
