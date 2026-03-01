import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext.jsx";
import api from "../../api.js";

export default function BusinessRegister() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", {
        ...form,
        role: "business",
      });
      login(data);
      navigate("/business/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
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
        <h1 className="auth-title">List your exhibition</h1>
        <p className="auth-sub">Create a business account</p>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={submit}>
          <div className="field-group">
            <div className="field">
              <label>Business / Gallery Name</label>
              <input
                name="name"
                type="text"
                placeholder="Gallery name"
                value={form.name}
                onChange={handle}
                required
              />
            </div>
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
                placeholder="Min. 8 characters"
                value={form.password}
                onChange={handle}
                required
                minLength={8}
              />
            </div>
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            <span>
              {loading ? "Creating account…" : "Create Exhibitor Account →"}
            </span>
          </button>
        </form>

        <p className="auth-switch">
          Already registered? <Link to="/business/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
