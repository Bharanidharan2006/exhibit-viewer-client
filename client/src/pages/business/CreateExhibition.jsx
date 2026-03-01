import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/Navbar.jsx";
import api from "../../api.js";
import GALLERY_TEMPLATES from "../../galleryTemplates.js";

const STEPS = ["Choose Layout", "Fill Slots", "Publish"];

export default function CreateExhibition() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [selectedTemplate, setTemplate] = useState(null);
  const [exhibition, setExhibition] = useState(null); // created in DB after step 0
  const [basicInfo, setBasicInfo] = useState({ name: "", description: "" });
  const [slots, setSlots] = useState([]); // mirrors exhibition.slots
  const [uploading, setUploading] = useState({}); // { slotName: true/false }
  const [error, setError] = useState("");

  /* ── Step 0: choose template + fill basic info ── */
  const handleChooseTemplate = async (e) => {
    e.preventDefault();
    if (!selectedTemplate) return setError("Please select a layout");
    if (!basicInfo.name.trim()) return setError("Please enter a name");
    setError("");

    try {
      const { data } = await api.post("/exhibitions", {
        name: basicInfo.name,
        description: basicInfo.description,
        modelTemplate: selectedTemplate.id,
        slotCount: selectedTemplate.slotCount,
      });
      setExhibition(data);
      setSlots(data.slots);
      setStep(1);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create exhibition");
    }
  };

  /* ── Step 1: upload image + metadata per slot ── */
  const handleSlotUpload = async (slotName, file, meta) => {
    setUploading((u) => ({ ...u, [slotName]: true }));
    try {
      const fd = new FormData();
      if (file) fd.append("image", file);
      Object.entries(meta).forEach(([k, v]) => fd.append(k, v));

      const { data } = await api.post(
        `/exhibitions/${exhibition._id}/slots/${slotName}/upload`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } },
      );

      // Update local slots state
      setSlots((prev) =>
        prev.map((s) => (s.slotName === slotName ? { ...s, ...data.slot } : s)),
      );
    } catch (err) {
      alert(
        `Upload failed for ${slotName}: ${err.response?.data?.message || err.message}`,
      );
    } finally {
      setUploading((u) => ({ ...u, [slotName]: false }));
    }
  };

  /* ── Step 2: publish ── */
  const handlePublish = async () => {
    try {
      await api.patch(`/exhibitions/${exhibition._id}/publish`);
      navigate("/business/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Publish failed");
    }
  };

  return (
    <>
      <Navbar />
      <div className="page">
        {/* Step indicator */}
        <div
          style={{
            display: "flex",
            gap: "2rem",
            marginBottom: "3rem",
            alignItems: "center",
          }}
        >
          {STEPS.map((label, i) => (
            <React.Fragment key={label}>
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    border: `1px solid ${i <= step ? "var(--gold)" : "var(--border-sub)"}`,
                    background: i < step ? "var(--gold)" : "transparent",
                    display: "grid",
                    placeItems: "center",
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "0.6rem",
                    color:
                      i < step
                        ? "white"
                        : i === step
                          ? "var(--gold)"
                          : "var(--muted)",
                  }}
                >
                  {i < step ? "✓" : i + 1}
                </div>
                <span
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "0.62rem",
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                    color: i === step ? "var(--ink)" : "var(--muted)",
                  }}
                >
                  {label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  style={{ flex: 1, height: 1, background: "var(--border)" }}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {error && (
          <div className="error-msg" style={{ marginBottom: "1.5rem" }}>
            {error}
          </div>
        )}

        {/* ── STEP 0: Choose Layout ── */}
        {step === 0 && (
          <form onSubmit={handleChooseTemplate}>
            <div className="section-label">01 — Name Your Exhibition</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1.5rem",
                marginBottom: "3rem",
              }}
            >
              <div className="field">
                <label>Exhibition Name</label>
                <input
                  type="text"
                  placeholder="e.g. Monsoon Impressions 2024"
                  value={basicInfo.name}
                  onChange={(e) =>
                    setBasicInfo({ ...basicInfo, name: e.target.value })
                  }
                  required
                />
              </div>
              <div className="field">
                <label>Short Description (optional)</label>
                <input
                  type="text"
                  placeholder="What is this exhibition about?"
                  value={basicInfo.description}
                  onChange={(e) =>
                    setBasicInfo({ ...basicInfo, description: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="section-label">02 — Choose a Gallery Layout</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: "1.5rem",
                marginBottom: "3rem",
              }}
            >
              {GALLERY_TEMPLATES.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  template={tpl}
                  selected={selectedTemplate?.id === tpl.id}
                  onSelect={() => setTemplate(tpl)}
                />
              ))}
            </div>

            <button
              className="btn-primary"
              type="submit"
              style={{ maxWidth: 280 }}
            >
              <span>Continue → Fill Slots</span>
            </button>
          </form>
        )}

        {/* ── STEP 1: Fill Slots ── */}
        {step === 1 && slots && (
          <div>
            <div className="section-label">Upload artwork for each slot</div>
            <p
              style={{
                color: "var(--muted)",
                fontWeight: 300,
                marginBottom: "2.5rem",
                fontSize: "1.05rem",
              }}
            >
              You can leave slots empty — they'll appear as blank white surfaces
              in the gallery. You can also return and update these later.
            </p>

            <div style={{ display: "grid", gap: "1.5rem" }}>
              {slots.map((slot) => (
                <SlotEditor
                  key={slot.slotName}
                  slot={slot}
                  loading={uploading[slot.slotName]}
                  onSave={(file, meta) =>
                    handleSlotUpload(slot.slotName, file, meta)
                  }
                />
              ))}
            </div>

            <div style={{ display: "flex", gap: "1rem", marginTop: "3rem" }}>
              <button className="btn-ghost" onClick={() => setStep(0)}>
                ← Back
              </button>
              <button
                className="btn-primary"
                onClick={() => setStep(2)}
                style={{ flex: 1, maxWidth: 280 }}
              >
                <span>Continue → Review & Publish</span>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Publish ── */}
        {step === 2 && (
          <div style={{ maxWidth: 560 }}>
            <div className="section-label">Review & Go Live</div>
            <h2
              style={{
                fontSize: "2rem",
                fontWeight: 300,
                fontStyle: "italic",
                marginBottom: "1rem",
              }}
            >
              {exhibition?.name}
            </h2>
            <p
              style={{
                color: "var(--muted)",
                marginBottom: "0.5rem",
                fontWeight: 300,
              }}
            >
              {exhibition?.description}
            </p>
            <p
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.65rem",
                color: "var(--muted)",
                marginBottom: "2.5rem",
              }}
            >
              {slots.filter((s) => s.imageUrl).length} of {slots.length} slots
              filled
            </p>

            <div
              style={{
                padding: "1.5rem",
                border: "1px solid var(--border)",
                marginBottom: "2.5rem",
                background: "rgba(255,255,255,0.4)",
              }}
            >
              <div
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "0.6rem",
                  letterSpacing: "0.15em",
                  lineHeight: 2.2,
                  color: "var(--muted)",
                }}
              >
                ✦ &nbsp;Your exhibition will be immediately visible to all
                visitors
                <br />
                ✦ &nbsp;You can unpublish or update artwork anytime from the
                dashboard
                <br />✦ &nbsp;Visitors can browse, like, and purchase your
                listed artworks
              </div>
            </div>

            {error && (
              <div className="error-msg" style={{ marginBottom: "1rem" }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: "1rem" }}>
              <button className="btn-ghost" onClick={() => setStep(1)}>
                ← Edit Slots
              </button>
              <button
                className="btn-primary"
                onClick={handlePublish}
                style={{ flex: 1 }}
              >
                <span>Publish Exhibition →</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Template selection card ── */
function TemplateCard({ template, selected, onSelect }) {
  return (
    <div
      onClick={onSelect}
      style={{
        border: `1px solid ${selected ? "var(--gold)" : "var(--border-sub)"}`,
        background: selected
          ? "rgba(196,162,101,0.06)"
          : "rgba(255,255,255,0.4)",
        padding: "1.5rem",
        cursor: "pointer",
        transition: "all 0.2s",
        position: "relative",
      }}
    >
      {/* Preview image placeholder */}
      <div
        style={{
          width: "100%",
          aspectRatio: "16/9",
          marginBottom: "1rem",
          background:
            "linear-gradient(135deg, #2d1b0e, #6b3a1f, #c4743a, #e8a862)",
          position: "relative",
        }}
      >
        {template.previewImage && (
          <img
            src={template.previewImage}
            alt={template.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => (e.target.style.display = "none")}
          />
        )}
        {selected && (
          <div
            style={{
              position: "absolute",
              top: "0.5rem",
              right: "0.5rem",
              background: "var(--gold)",
              color: "white",
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.55rem",
              letterSpacing: "0.15em",
              padding: "0.2rem 0.6rem",
            }}
          >
            SELECTED
          </div>
        )}
      </div>
      <h3
        style={{ fontSize: "1.2rem", fontWeight: 300, marginBottom: "0.3rem" }}
      >
        {template.name}
      </h3>
      <p
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: "0.6rem",
          color: "var(--muted)",
          marginBottom: "0.8rem",
          lineHeight: 1.6,
        }}
      >
        {template.description}
      </p>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "0.62rem",
            color: "var(--muted)",
          }}
        >
          {template.slotCount} slots
        </span>
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "0.7rem",
            color: "var(--gold-deep)",
          }}
        >
          ₹{template.price.toLocaleString("en-IN")}
        </span>
      </div>
    </div>
  );
}

/* ── Individual slot editor ── */
function SlotEditor({ slot, onSave, loading }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(
    slot.imageUrl ? `${slot.imageUrl}` : null,
  );
  const [meta, setMeta] = useState({
    title: slot.title || "",
    artist: slot.artist || "",
    description: slot.description || "",
    price: slot.price || "",
    medium: slot.medium || "",
    dimensions: slot.dimensions || "",
    year: slot.year || new Date().getFullYear(),
  });
  const [saved, setSaved] = useState(false);

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setSaved(false);
  };

  const handleSave = async () => {
    await onSave(file, meta);
    setSaved(true);
  };

  return (
    <div
      style={{
        border: "1px solid var(--border-sub)",
        background: "rgba(255,255,255,0.4)",
        padding: "1.5rem",
      }}
    >
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start" }}>
        {/* Image upload area */}
        <label
          style={{
            width: 140,
            height: 140,
            flexShrink: 0,
            border: `2px dashed ${preview ? "var(--gold)" : "var(--border-sub)"}`,
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            position: "relative",
            overflow: "hidden",
            background: preview ? "transparent" : "rgba(0,0,0,0.02)",
          }}
        >
          {preview ? (
            <img
              src={preview}
              alt="preview"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ textAlign: "center", padding: "1rem" }}>
              <div
                style={{
                  fontSize: "1.5rem",
                  color: "var(--muted)",
                  marginBottom: "0.3rem",
                }}
              >
                +
              </div>
              <div
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "0.55rem",
                  color: "var(--muted)",
                  letterSpacing: "0.1em",
                }}
              >
                Upload
                <br />
                Image
              </div>
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFile}
          />
        </label>

        {/* Metadata fields */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.6rem",
              letterSpacing: "0.2em",
              color: "var(--gold)",
              marginBottom: "1rem",
              textTransform: "uppercase",
            }}
          >
            {slot.slotName}{" "}
            {saved && (
              <span style={{ color: "var(--success)", marginLeft: "1rem" }}>
                ✓ Saved
              </span>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.8rem",
            }}
          >
            {[
              { label: "Title", key: "title", placeholder: "Artwork title" },
              { label: "Artist", key: "artist", placeholder: "Artist name" },
              {
                label: "Price (₹)",
                key: "price",
                placeholder: "7500",
                type: "number",
              },
              { label: "Medium", key: "medium", placeholder: "Oil on canvas" },
              {
                label: "Dimensions",
                key: "dimensions",
                placeholder: "60 × 90 cm",
              },
              {
                label: "Year",
                key: "year",
                placeholder: "2024",
                type: "number",
              },
            ].map(({ label, key, placeholder, type }) => (
              <div className="field" key={key}>
                <label>{label}</label>
                <input
                  type={type || "text"}
                  placeholder={placeholder}
                  value={meta[key]}
                  onChange={(e) => {
                    setMeta({ ...meta, [key]: e.target.value });
                    setSaved(false);
                  }}
                />
              </div>
            ))}
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Description</label>
              <input
                type="text"
                placeholder="Short description of the artwork"
                value={meta.description}
                onChange={(e) => {
                  setMeta({ ...meta, description: e.target.value });
                  setSaved(false);
                }}
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={loading}
            style={{
              marginTop: "1rem",
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.62rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              padding: "0.5rem 1.2rem",
              border: "1px solid var(--gold)",
              background: "transparent",
              color: "var(--gold-deep)",
              cursor: "pointer",
              transition: "all 0.2s",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Saving…" : "Save Slot"}
          </button>
        </div>
      </div>
    </div>
  );
}
