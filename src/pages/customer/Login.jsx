import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import api from "../../api.js";

export default function CustomerLogin() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", {
        ...form,
        role: "customer",
      });
      login(data);
      navigate("/exhibitions");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <span className="auth-logo">
          Art<span>e</span>ria
        </span>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-sub">Visitor access</p>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={submit}>
          <div className="field-group">
            <div className="field">
              <label>Email</label>
              <input
                name="email"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={handle}
                required
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                name="password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={handle}
                required
              />
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            <span>{loading ? "Signing in…" : "Enter the Gallery →"}</span>
          </button>
        </form>

        <p className="auth-switch">
          No account? <Link to="/register">Register here</Link>
          <br />
          <br />
          Exhibitor? <Link to="/business/login">Sign in as business</Link>
        </p>
      </div>
    </div>
  );
}
