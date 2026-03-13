import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar.jsx";
import api from "../../api.js";

export default function Exhibitions() {
  const [exhibitions, setExhibitions] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchExhibitions = async (q = "") => {
    setLoading(true);
    try {
      const { data } = await api.get(
        `/exhibitions${q ? `?search=${encodeURIComponent(q)}` : ""}`,
      );
      setExhibitions(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExhibitions();
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchExhibitions(search);
  };

  return (
    <>
      <Navbar />
      <div className="page">
        {/* Hero */}
        <div style={{ textAlign: "center", padding: "3rem 0 4rem" }}>
          <div
            className="section-label"
            style={{ justifyContent: "center", marginBottom: "1rem" }}
          >
            Virtual Exhibitions
          </div>
          <h1
            style={{
              fontSize: "clamp(2.5rem, 5vw, 4rem)",
              fontWeight: 300,
              fontStyle: "italic",
              lineHeight: 1.1,
              marginBottom: "2.5rem",
            }}
          >
            Explore art without
            <br />
            leaving your space
          </h1>

          {/* Search bar */}
          <form
            onSubmit={handleSearch}
            style={{
              display: "flex",
              maxWidth: 480,
              margin: "0 auto",
              gap: "0",
            }}
          >
            <input
              type="text"
              placeholder="Search exhibitions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                padding: "0.9rem 1.2rem",
                border: "1px solid var(--border)",
                borderRight: "none",
                background: "rgba(255,255,255,0.6)",
                fontSize: "0.95rem",
                fontFamily: "'Cormorant Garamond', serif",
                fontWeight: 300,
                outline: "none",
                color: "var(--ink)",
              }}
            />
            <button
              type="submit"
              style={{
                padding: "0.9rem 1.5rem",
                background: "var(--ink)",
                color: "var(--cream)",
                border: "none",
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.62rem",
                letterSpacing: "0.15em",
                cursor: "pointer",
              }}
            >
              SEARCH
            </button>
          </form>
        </div>

        {/* Results */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "4rem 0" }}>
            <p
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.65rem",
                color: "var(--muted)",
                letterSpacing: "0.2em",
              }}
            >
              LOADING EXHIBITIONS…
            </p>
          </div>
        ) : exhibitions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 0" }}>
            <p
              style={{
                fontSize: "1.5rem",
                fontStyle: "italic",
                fontWeight: 300,
                color: "var(--muted)",
              }}
            >
              No exhibitions found{search ? ` for "${search}"` : ""}.
            </p>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {exhibitions.map((ex) => (
              <ExhibitionCard
                key={ex._id}
                exhibition={ex}
                onEnter={() => navigate(`/exhibition/${ex._id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ExhibitionCard({ exhibition, onEnter }) {
  // Use the first filled slot's image as cover, fallback to gradient
  const coverSlot = exhibition.slots?.find((s) => s.imageUrl);

  return (
    <div
      style={{
        border: "1px solid var(--border-sub)",
        background: "rgba(255,255,255,0.45)",
        overflow: "hidden",
        transition: "transform 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-3px)";
        e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {/* Cover image */}
      <div
        style={{
          width: "100%",
          aspectRatio: "16/9",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {coverSlot ? (
          <img
            src={coverSlot.imageUrl}
            alt={exhibition.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background:
                "linear-gradient(135deg, #1a0e06, #6b3a1f, #c4743a, #e8a862, #1a3a2a)",
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            top: "1rem",
            left: "1rem",
            fontFamily: "'DM Mono', monospace",
            fontSize: "0.55rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            background: "rgba(0,0,0,0.65)",
            color: "var(--gold-light)",
            padding: "0.25rem 0.65rem",
            backdropFilter: "blur(6px)",
          }}
        >
          Virtual Exhibition
        </div>
      </div>

      <div style={{ padding: "1.5rem" }}>
        {/* Owner name */}
        <div
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "0.58rem",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: "0.5rem",
          }}
        >
          {exhibition.owner?.name || "Arteria Gallery"}
        </div>

        <h2
          style={{
            fontSize: "1.4rem",
            fontWeight: 300,
            marginBottom: "0.5rem",
          }}
        >
          {exhibition.name}
        </h2>

        {exhibition.description && (
          <p
            style={{
              fontSize: "0.95rem",
              fontWeight: 300,
              color: "var(--muted)",
              lineHeight: 1.6,
              marginBottom: "1rem",
            }}
          >
            {exhibition.description}
          </p>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "1.2rem",
          }}
        >
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.58rem",
              color: "var(--muted)",
            }}
          >
            {exhibition.slots?.filter((s) => s.imageUrl || s.modelUrl).length || 0} works
          </span>

          <button
            onClick={onEnter}
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.62rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              padding: "0.55rem 1.2rem",
              background: "var(--ink)",
              color: "var(--cream)",
              border: "none",
              cursor: "pointer",
              position: "relative",
              overflow: "hidden",
              transition: "transform 0.15s",
            }}
          >
            Enter →
          </button>
        </div>
      </div>
    </div>
  );
}
