import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar.jsx";
import api from "../../api.js";

export default function Dashboard() {
  const [exhibitions, setExhibitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchMine = async () => {
    try {
      const { data } = await api.get("/exhibitions/mine");
      setExhibitions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMine();
  }, []);

  const togglePublish = async (id) => {
    try {
      const { data } = await api.patch(`/exhibitions/${id}/publish`);
      setExhibitions((prev) =>
        prev.map((e) =>
          e._id === id ? { ...e, isPublished: data.isPublished } : e,
        ),
      );
    } catch (err) {
      alert("Failed to update publish status");
    }
  };

  const deleteExhibition = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/exhibitions/${id}`);
      setExhibitions((prev) => prev.filter((e) => e._id !== id));
    } catch (err) {
      alert("Failed to delete exhibition");
    }
  };

  return (
    <>
      <Navbar />
      <div className="page">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: "3rem",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <div className="section-label" style={{ marginBottom: "0.5rem" }}>
              Your Exhibitions
            </div>
            <h1
              style={{
                fontSize: "2.5rem",
                fontWeight: 300,
                fontStyle: "italic",
              }}
            >
              Dashboard
            </h1>
          </div>
          <Link
            to="/business/create"
            className="btn-primary"
            style={{
              display: "inline-block",
              padding: "0.9rem 1.8rem",
              background: "var(--ink)",
              color: "var(--cream)",
              fontSize: "0.95rem",
              letterSpacing: "0.06em",
              textDecoration: "none",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            + New Exhibition
          </Link>
        </div>

        {loading && (
          <p
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.8rem",
              color: "var(--muted)",
              letterSpacing: "0.15em",
            }}
          >
            LOADING…
          </p>
        )}

        {!loading && exhibitions.length === 0 && (
          <div style={{ textAlign: "center", padding: "5rem 0" }}>
            <p
              style={{
                fontSize: "1.5rem",
                fontStyle: "italic",
                fontWeight: 300,
                marginBottom: "1rem",
                color: "var(--muted)",
              }}
            >
              No exhibitions yet
            </p>
            <Link
              to="/business/create"
              style={{
                color: "var(--gold)",
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.8rem",
                letterSpacing: "0.15em",
              }}
            >
              Create your first →
            </Link>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gap: "1px",
            background: "var(--border-sub)",
          }}
        >
          {exhibitions.map((ex) => (
            <div
              key={ex._id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: "2rem",
                alignItems: "center",
                padding: "1.5rem",
                background: "rgba(255,255,255,0.45)",
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: "1.3rem",
                    fontWeight: 300,
                    marginBottom: "0.3rem",
                  }}
                >
                  {ex.name}
                </h3>
                <div
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "0.72rem",
                    color: "var(--muted)",
                    letterSpacing: "0.12em",
                  }}
                >
                  {ex.slots.filter((s) => s.imageUrl || s.modelUrl).length}/{ex.slots.length}{" "}
                  slots filled &nbsp;·&nbsp;
                  {new Date(ex.createdAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>

              <div
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "0.72rem",
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: ex.isPublished ? "var(--success)" : "var(--muted)",
                  padding: "0.25rem 0.7rem",
                  border: `1px solid ${ex.isPublished ? "var(--success)" : "var(--border-sub)"}`,
                }}
              >
                {ex.isPublished ? "Live" : "Draft"}
              </div>

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <button
                  className="btn-ghost"
                  onClick={() => navigate(`/business/create?edit=${ex._id}`)}
                  style={{ fontSize: "0.72rem" }}
                >
                  Edit
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => togglePublish(ex._id)}
                  style={{ fontSize: "0.72rem" }}
                >
                  {ex.isPublished ? "Unpublish" : "Publish"}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => deleteExhibition(ex._id, ex.name)}
                  style={{
                    fontSize: "0.72rem",
                    color: "#b94040",
                    borderColor: "rgba(185,64,64,0.3)",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
