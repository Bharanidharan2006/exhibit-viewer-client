import React, { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar.jsx";

function formatCard(val) {
  const v = val.replace(/\D/g, "").slice(0, 16);
  return v.match(/.{1,4}/g)?.join("  ") || v;
}
function formatExpiry(val) {
  const v = val.replace(/\D/g, "").slice(0, 4);
  return v.length >= 3 ? v.slice(0, 2) + " / " + v.slice(2) : v;
}

const REQUIRED = [
  "firstName",
  "lastName",
  "email",
  "address",
  "city",
  "state",
  "zip",
  "cardName",
  "cardNum",
  "expiry",
  "cvv",
];

export default function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const title = params.get("title") || "Artwork";
  const artist = params.get("artist") || "Artist";
  const price = Number(params.get("price") || 4200);
  const shipping = 120,
    auth = 80;
  const total = price + shipping + auth;

  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  const [coupon, setCoupon] = useState("");
  const [discount, setDiscount] = useState(0);
  const [success, setSuccess] = useState(false);

  const field = (name, val) => setForm((f) => ({ ...f, [name]: val }));

  const validate = () => {
    const errs = {};
    REQUIRED.forEach((k) => {
      if (!form[k]?.trim()) errs[k] = true;
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const applyCoupon = () => {
    const c = coupon.trim().toUpperCase();
    if (c === "COLLECT10") setDiscount(Math.round(total * 0.1));
    else if (c === "ART20") setDiscount(Math.round(total * 0.2));
    else {
      setCoupon("");
      setDiscount(0);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) setSuccess(true);
  };

  const inputStyle = (name) => ({
    border: "none",
    borderBottom: `1px solid ${errors[name] ? "#b94040" : "rgba(26,21,16,0.1)"}`,
    background: "transparent",
    padding: "0.6rem 0",
    fontSize: "1rem",
    fontWeight: 300,
    color: "#1a1510",
    outline: "none",
    width: "100%",
    fontFamily: "'Cormorant Garamond', serif",
    transition: "border-color 0.2s",
  });

  if (success)
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            border: "1px solid #c4a265",
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            fontSize: "2rem",
            marginBottom: "2rem",
          }}
        >
          ✦
        </div>
        <h1
          style={{
            fontSize: "2.5rem",
            fontStyle: "italic",
            fontWeight: 300,
            marginBottom: "1rem",
          }}
        >
          Your piece awaits.
        </h1>
        <p
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "0.7rem",
            letterSpacing: "0.2em",
            color: "#8a7f72",
            lineHeight: 1.8,
            maxWidth: 360,
          }}
        >
          CONFIRMATION SENT TO YOUR EMAIL
          <br />
          Your acquisition of <em>{title}</em> is secured.
          <br />
          Expect a call from our curator within 24 hours.
        </p>
        <button
          onClick={() => navigate("/exhibitions")}
          style={{
            marginTop: "2.5rem",
            fontFamily: "'DM Mono', monospace",
            fontSize: "0.65rem",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            padding: "0.8rem 2rem",
            border: "1px solid #c4a265",
            background: "transparent",
            color: "#9a7a45",
            cursor: "pointer",
          }}
        >
          ← Back to Exhibitions
        </button>
      </div>
    );

  return (
    <>
      <Navbar />
      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 400px",
            minHeight: "calc(100vh - 73px)",
            maxWidth: 1280,
            margin: "0 auto",
          }}
        >
          {/* LEFT — Form */}
          <div
            style={{
              padding: "4rem 4rem 4rem 3rem",
              borderRight: "1px solid rgba(196,162,101,0.2)",
            }}
          >
            {/* Contact */}
            <div className="section-label">01 — Contact</div>
            <h2
              style={{
                fontSize: "2rem",
                fontWeight: 300,
                fontStyle: "italic",
                marginBottom: "2.5rem",
              }}
            >
              Who should we reach out to?
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1.5rem",
                marginBottom: "3rem",
              }}
            >
              {[
                ["firstName", "First Name", "Elena"],
                ["lastName", "Last Name", "Vasquez"],
              ].map(([name, label, ph]) => (
                <div className="field" key={name}>
                  <label>{label}</label>
                  <input
                    style={inputStyle(name)}
                    placeholder={ph}
                    value={form[name] || ""}
                    onChange={(e) => field(name, e.target.value)}
                  />
                </div>
              ))}
              <div className="field" style={{ gridColumn: "1/-1" }}>
                <label>Email Address</label>
                <input
                  style={inputStyle("email")}
                  type="email"
                  placeholder="you@example.com"
                  value={form.email || ""}
                  onChange={(e) => field("email", e.target.value)}
                />
              </div>
              <div className="field" style={{ gridColumn: "1/-1" }}>
                <label>Phone (optional)</label>
                <input
                  style={inputStyle("phone")}
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={form.phone || ""}
                  onChange={(e) => field("phone", e.target.value)}
                />
              </div>
            </div>

            <div
              style={{
                height: 1,
                background: "rgba(196,162,101,0.2)",
                margin: "0 0 3rem",
              }}
            />

            {/* Shipping */}
            <div className="section-label">02 — Shipping</div>
            <h2
              style={{
                fontSize: "2rem",
                fontWeight: 300,
                fontStyle: "italic",
                marginBottom: "2.5rem",
              }}
            >
              Where shall we deliver?
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1.5rem",
                marginBottom: "3rem",
              }}
            >
              {[
                ["address", "Street Address", "123 Gallery Lane", "1/-1"],
                ["apt", "Apartment / Suite", "Apt 4B", "1/-1"],
                ["city", "City", "Mumbai"],
                ["state", "State", "MH"],
                ["zip", "Postal Code", "400001"],
              ].map(([name, label, ph, col]) => (
                <div
                  className="field"
                  key={name}
                  style={col ? { gridColumn: col } : {}}
                >
                  <label>{label}</label>
                  <input
                    style={inputStyle(name)}
                    placeholder={ph}
                    value={form[name] || ""}
                    onChange={(e) => field(name, e.target.value)}
                  />
                </div>
              ))}
              <div className="field">
                <label>Country</label>
                <select
                  style={{ ...inputStyle("country"), cursor: "pointer" }}
                  value={form.country || ""}
                  onChange={(e) => field("country", e.target.value)}
                >
                  <option value="">Select…</option>
                  {[
                    "India",
                    "United States",
                    "United Kingdom",
                    "France",
                    "Germany",
                    "Japan",
                    "Australia",
                    "Singapore",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div
              style={{
                height: 1,
                background: "rgba(196,162,101,0.2)",
                margin: "0 0 3rem",
              }}
            />

            {/* Payment */}
            <div className="section-label">03 — Payment</div>
            <h2
              style={{
                fontSize: "2rem",
                fontWeight: 300,
                fontStyle: "italic",
                marginBottom: "1.5rem",
              }}
            >
              Secure your acquisition
            </h2>
            <div
              style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}
            >
              {["VISA", "MC", "AMEX", "UPI"].map((c) => (
                <span
                  key={c}
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "0.55rem",
                    letterSpacing: "0.1em",
                    border: "1px solid rgba(26,21,16,0.1)",
                    padding: "0.2rem 0.5rem",
                    borderRadius: 3,
                    color: "#8a7f72",
                  }}
                >
                  {c}
                </span>
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1.5rem",
              }}
            >
              <div className="field" style={{ gridColumn: "1/-1" }}>
                <label>Cardholder Name</label>
                <input
                  style={inputStyle("cardName")}
                  placeholder="Elena Vasquez"
                  value={form.cardName || ""}
                  onChange={(e) => field("cardName", e.target.value)}
                />
              </div>
              <div className="field" style={{ gridColumn: "1/-1" }}>
                <label>Card Number</label>
                <input
                  style={inputStyle("cardNum")}
                  placeholder="1234  5678  9012  3456"
                  value={form.cardNum || ""}
                  onChange={(e) => field("cardNum", formatCard(e.target.value))}
                />
              </div>
              <div className="field">
                <label>Expiry</label>
                <input
                  style={inputStyle("expiry")}
                  placeholder="MM / YY"
                  value={form.expiry || ""}
                  onChange={(e) =>
                    field("expiry", formatExpiry(e.target.value))
                  }
                />
              </div>
              <div className="field">
                <label>CVV</label>
                <input
                  style={inputStyle("cvv")}
                  placeholder="•••"
                  maxLength={4}
                  value={form.cvv || ""}
                  onChange={(e) => field("cvv", e.target.value)}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginTop: "2rem",
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.6rem",
                letterSpacing: "0.1em",
                color: "#8a7f72",
              }}
            >
              🔒 256-bit SSL encryption — Your payment is fully protected
            </div>

            <button
              type="submit"
              style={{
                width: "100%",
                marginTop: "2.5rem",
                padding: "1.2rem",
                background: "#1a1510",
                color: "#f5f0e8",
                border: "none",
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "1.1rem",
                letterSpacing: "0.1em",
                cursor: "pointer",
                transition: "background 0.3s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#9a7a45")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "#1a1510")
              }
            >
              Complete Acquisition →
            </button>
          </div>

          {/* RIGHT — Summary */}
          <div
            style={{
              padding: "4rem 3rem",
              position: "sticky",
              top: 73,
              height: "calc(100vh - 73px)",
              overflowY: "auto",
            }}
          >
            <div className="section-label">Your Selection</div>

            <div
              style={{
                width: "100%",
                aspectRatio: "4/3",
                background:
                  "linear-gradient(135deg,#1a0e06,#6b3a1f,#c4743a,#e8a862,#1a3a2a)",
                marginBottom: "1.5rem",
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: "1rem",
                  left: "1rem",
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "0.6rem",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  background: "rgba(0,0,0,0.7)",
                  color: "#d4a96a",
                  padding: "0.3rem 0.7rem",
                  backdropFilter: "blur(8px)",
                }}
              >
                Original Work
              </div>
            </div>

            <div
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.65rem",
                letterSpacing: "0.2em",
                color: "#8a7f72",
                marginBottom: "0.4rem",
              }}
            >
              {artist}
            </div>
            <h3
              style={{
                fontSize: "1.5rem",
                fontWeight: 300,
                fontStyle: "italic",
                marginBottom: "1.5rem",
              }}
            >
              {title}
            </h3>

            <div
              style={{
                height: 1,
                background: "rgba(196,162,101,0.2)",
                margin: "0 0 1.5rem",
              }}
            />

            {[
              ["Artwork Price", `₹${price.toLocaleString("en-IN")}`],
              ["Insured Shipping", `₹${shipping.toLocaleString("en-IN")}`],
              ["Authentication", `₹${auth.toLocaleString("en-IN")}`],
            ].map(([label, val]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.9rem",
                }}
              >
                <span
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "0.65rem",
                    letterSpacing: "0.15em",
                    color: "#8a7f72",
                    textTransform: "uppercase",
                  }}
                >
                  {label}
                </span>
                <span style={{ fontSize: "1rem", fontWeight: 300 }}>{val}</span>
              </div>
            ))}

            {discount > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.9rem",
                }}
              >
                <span
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "0.65rem",
                    color: "#4a8c5c",
                  }}
                >
                  Discount
                </span>
                <span
                  style={{
                    fontSize: "1rem",
                    fontWeight: 300,
                    color: "#4a8c5c",
                  }}
                >
                  −₹{discount.toLocaleString("en-IN")}
                </span>
              </div>
            )}

            <div
              style={{
                height: 1,
                background: "rgba(196,162,101,0.2)",
                margin: "1rem 0",
              }}
            />

            {/* Coupon */}
            <div
              style={{ display: "flex", gap: "0.75rem", margin: "1.5rem 0" }}
            >
              <input
                placeholder="Collector code"
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                style={{
                  flex: 1,
                  border: "none",
                  borderBottom: "1px solid rgba(26,21,16,0.1)",
                  background: "transparent",
                  padding: "0.5rem 0",
                  fontFamily: "'Cormorant Garamond', serif",
                  fontSize: "0.9rem",
                  outline: "none",
                }}
              />
              <button type="button" onClick={applyCoupon} className="btn-ghost">
                Apply
              </button>
            </div>

            <div
              style={{
                height: 1,
                background: "rgba(196,162,101,0.2)",
                margin: "0 0 1.5rem",
              }}
            />

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "0.7rem",
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                }}
              >
                Total Due
              </span>
              <span style={{ fontSize: "1.5rem", fontWeight: 600 }}>
                ₹{(total - discount).toLocaleString("en-IN")}
              </span>
            </div>

            <div
              style={{
                marginTop: "2rem",
                padding: "1.5rem",
                border: "1px solid rgba(196,162,101,0.2)",
                background: "rgba(255,255,255,0.4)",
              }}
            >
              <div
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "0.62rem",
                  lineHeight: 2.1,
                  color: "#8a7f72",
                }}
              >
                ✦ &nbsp;Free returns within 14 days
                <br />
                ✦ &nbsp;Certificate of Authenticity included
                <br />
                ✦ &nbsp;Museum-grade packaging
                <br />✦ &nbsp;Artist directly compensated
              </div>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
