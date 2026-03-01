import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import api from "../../api.js";

export default function BusinessLogin() {
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
        role: "business",
      });
      login(data);
      navigate("/business/dashboard");
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
        <h1 className="auth-title">Exhibitor Portal</h1>
        <p className="auth-sub">Business account access</p>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={submit}>
          <div className="field-group">
            <div className="field">
              <label>Email</label>
              <input
                name="email"
                type="email"
                placeholder="business@example.com"
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
            <span>{loading ? "Signing in…" : "Access Dashboard →"}</span>
          </button>
        </form>

        <p className="auth-switch">
          No account? <Link to="/business/register">Register as exhibitor</Link>
          <br />
          <br />
          Visitor? <Link to="/login">Sign in as customer</Link>
        </p>
      </div>
    </div>
  );
}
