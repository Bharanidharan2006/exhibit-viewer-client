import React, { useEffect, useRef, useCallback, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import QRCode from "qrcode";

/**
 * Model3DViewer — In-page overlay for viewing 3D products
 * Renders an isolated Three.js scene with OrbitControls over a
 * semi-transparent black gradient background.
 *
 * Props:
 * - modelUrl:      string   — URL to the GLB/GLTF file
 * - data:          object   — product metadata (title, artist, price, etc.)
 * - exhibitionId:  string   — exhibition ID for AR link generation
 * - onClose:       function — called when the viewer is dismissed
 * - onBuy:         function — called when user clicks buy
 * - onLike:        function — called when user clicks like
 * - liking:        boolean
 */
export default function Model3DViewer({ modelUrl, data, exhibitionId, onClose, onBuy, onLike, liking }) {
  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const [showQR, setShowQR] = useState(false);
  const qrCanvasRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !modelUrl) return;

    const canvas = canvasRef.current;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = null; // transparent — the overlay div provides the background

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.6;
    rendererRef.current = renderer;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    camera.position.set(0, 0.5, 2.5);

    // Controls
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 0.5;
    controls.maxDistance = 8;
    controls.target.set(0, 0.3, 0);
    controls.update();

    // Lighting — studio setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(3, 5, 4);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xfff5e6, 0.8);
    fillLight.position.set(-3, 3, -2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xc4a265, 0.6);
    rimLight.position.set(0, 2, -4);
    scene.add(rimLight);

    // Load the model
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;

        // Auto-center and scale model to fit view
        const box = new THREE.Box3().setFromObject(model);
        const center = new THREE.Vector3();
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);

        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 1.5 / maxDim; // normalize to ~1.5 units
        model.scale.setScalar(scale);

        // Re-center after scaling — model floats centered in view
        box.setFromObject(model);
        box.getCenter(center);
        model.position.sub(center);

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        scene.add(model);

        // Adjust controls target to model center
        const newBox = new THREE.Box3().setFromObject(model);
        const newCenter = new THREE.Vector3();
        newBox.getCenter(newCenter);
        controls.target.copy(newCenter);
        controls.update();
      },
      undefined,
      (err) => {
        console.error("Failed to load 3D model:", err);
      },
    );

    // Animation loop
    let animId;
    function animate() {
      animId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Resize handler
    const onResize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [modelUrl]);

  // Handle escape key
  const handleKeyDown = useCallback(
    (e) => {
      if (e.code === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        display: "flex",
        animation: "fadeIn 0.3s ease",
      }}
    >
      {/* Semi-transparent gradient background */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at center, rgba(10,8,5,0.75) 0%, rgba(10,8,5,0.92) 100%)",
          backdropFilter: "blur(8px)",
        }}
      />

      {/* 3D Canvas area */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1.2rem 2rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.55rem",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                background: "rgba(196,162,101,0.2)",
                color: "#c4a265",
                padding: "0.25rem 0.65rem",
                border: "1px solid rgba(196,162,101,0.3)",
              }}
            >
              3D Product View
            </span>
            <span
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.55rem",
                letterSpacing: "0.15em",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              Drag to rotate · Scroll to zoom
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              border: "1px solid rgba(255,255,255,0.15)",
              background: "rgba(255,255,255,0.05)",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              color: "rgba(255,255,255,0.7)",
              fontSize: "0.9rem",
              backdropFilter: "blur(4px)",
            }}
          >
            ✕
          </button>
        </div>

        {/* Canvas */}
        <canvas
          ref={canvasRef}
          style={{
            flex: 1,
            width: "100%",
            display: "block",
            cursor: "grab",
          }}
        />
      </div>

      {/* Right info panel */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "min(360px, 30vw)",
          background: "rgba(245,240,232,0.97)",
          borderLeft: "1px solid rgba(196,162,101,0.2)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          animation: "panelIn 0.35s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <div style={{ padding: "2rem 1.8rem", flex: 1 }}>
          {/* Badge */}
          <div
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.58rem",
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "#c4a265",
              marginBottom: "1.5rem",
            }}
          >
            3D Product
          </div>

          {/* Artist + year */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "0.6rem",
            }}
          >
            <span
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.65rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#8a7f72",
              }}
            >
              {data.artist || "Unknown"}
            </span>
            <div
              style={{
                width: 3,
                height: 3,
                background: "#c4a265",
                borderRadius: "50%",
                opacity: 0.6,
              }}
            />
            <span
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.6rem",
                color: "#8a7f72",
                opacity: 0.6,
              }}
            >
              {data.year}
            </span>
          </div>

          {/* Title */}
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "1.8rem",
              fontWeight: 300,
              fontStyle: "italic",
              lineHeight: 1.15,
              marginBottom: "0.8rem",
              color: "#1a1510",
            }}
          >
            {data.title || "Untitled"}
          </h2>

          {/* Description */}
          <p
            style={{
              fontSize: "0.95rem",
              fontWeight: 300,
              lineHeight: 1.7,
              color: "#8a7f72",
              marginBottom: "1.4rem",
              fontFamily: "'Cormorant Garamond', serif",
            }}
          >
            {data.description}
          </p>

          {/* Meta strip */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              borderTop: "1px solid rgba(26,21,16,0.08)",
              borderBottom: "1px solid rgba(26,21,16,0.08)",
              marginBottom: "1.5rem",
            }}
          >
            {[
              ["Material", data.medium],
              ["Dimensions", data.dimensions],
              ["Type", "3D Product"],
            ].map(([label, val], i) => (
              <div
                key={label}
                style={{
                  padding: "0.7rem 0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom:
                    i < 2 ? "1px solid rgba(26,21,16,0.04)" : "none",
                }}
              >
                <span
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: "0.55rem",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    color: "#8a7f72",
                    opacity: 0.65,
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    fontSize: "0.88rem",
                    fontWeight: 300,
                    color: "#1a1510",
                    fontFamily: "'Cormorant Garamond', serif",
                  }}
                >
                  {val || "—"}
                </span>
              </div>
            ))}
          </div>

          {/* Price + Like */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "1.4rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: "0.25rem",
              }}
            >
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: "0.85rem",
                  color: "#9a7a45",
                }}
              >
                ₹
              </span>
              <span
                style={{
                  fontSize: "1.8rem",
                  fontWeight: 600,
                  color: "#1a1510",
                  lineHeight: 1,
                  fontFamily: "'Cormorant Garamond', serif",
                }}
              >
                {data.price?.toLocaleString("en-IN") || 0}
              </span>
            </div>
            <button
              onClick={onLike}
              disabled={liking}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                background: "transparent",
                border: "1px solid rgba(26,21,16,0.1)",
                padding: "0.5rem 0.9rem",
                cursor: "pointer",
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.65rem",
                letterSpacing: "0.1em",
                color: "#8a7f72",
                opacity: liking ? 0.6 : 1,
              }}
            >
              ♡ {data.likes ?? 0}
            </button>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.2rem" }}>
            <button
              onClick={onBuy}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#9a7a45")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "#1a1510")
              }
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.6rem",
                background: "#1a1510",
                color: "#f5f0e8",
                border: "none",
                padding: "0.9rem 1.2rem",
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "0.95rem",
                letterSpacing: "0.05em",
                cursor: "pointer",
                transition: "background 0.3s",
              }}
            >
              Acquire →
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "0.9rem 1rem",
                border: "1px solid rgba(26,21,16,0.1)",
                background: "transparent",
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "0.95rem",
                color: "#8a7f72",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>

          {/* See in your room (AR) */}
          {exhibitionId && data.slotName && (
            <button
              onClick={() => setShowQR(true)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                background: "linear-gradient(135deg, rgba(196,162,101,0.15), rgba(196,162,101,0.05))",
                border: "1px solid rgba(196,162,101,0.25)",
                padding: "0.75rem 1rem",
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.6rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#c4a265",
                cursor: "pointer",
                marginBottom: "1.2rem",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(196,162,101,0.2)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "linear-gradient(135deg, rgba(196,162,101,0.15), rgba(196,162,101,0.05))")
              }
            >
              📱 See in your room (AR)
            </button>
          )}

          <div
            style={{
              textAlign: "center",
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.55rem",
              letterSpacing: "0.1em",
              color: "#8a7f72",
              opacity: 0.65,
              paddingTop: "1rem",
              borderTop: "1px solid rgba(26,21,16,0.06)",
            }}
          >
            ✦ Authentic Product &nbsp;·&nbsp; Secure Checkout
            &nbsp;·&nbsp; Free Returns
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes panelIn { from { opacity:0; transform:translateX(24px) } to { opacity:1; transform:translateX(0) } }
        @keyframes qrFadeIn { from { opacity:0; transform:scale(0.9) } to { opacity:1; transform:scale(1) } }
      `}</style>

      {/* QR Code Modal */}
      {showQR && (
        <QRModal
          exhibitionId={exhibitionId}
          slotName={data.slotName}
          productTitle={data.title}
          onClose={() => setShowQR(false)}
        />
      )}
    </div>
  );
}

/** QR Code Modal — generates and displays a QR code linking to the AR page */
function QRModal({ exhibitionId, slotName, productTitle, onClose }) {
  const qrRef = useRef(null);
  const [arUrl, setArUrl] = useState("");

  useEffect(() => {
    const url = `${window.location.origin}/ar/${exhibitionId}/${slotName}`;
    setArUrl(url);

    if (qrRef.current) {
      QRCode.toCanvas(qrRef.current, url, {
        width: 220,
        margin: 2,
        color: {
          dark: "#1a1510",
          light: "#f5f0e8",
        },
      });
    }
  }, [exhibitionId, slotName]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 400,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "rgba(10,8,5,0.85)",
        backdropFilter: "blur(12px)",
        animation: "fadeIn 0.2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#f5f0e8",
          padding: "2.5rem",
          maxWidth: 340,
          width: "90vw",
          textAlign: "center",
          animation: "qrFadeIn 0.25s ease",
        }}
      >
        {/* Header */}
        <div
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "0.55rem",
            letterSpacing: "0.25em",
            textTransform: "uppercase",
            color: "#c4a265",
            marginBottom: "0.6rem",
          }}
        >
          See in your room
        </div>

        <div
          style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "1.2rem",
            fontWeight: 300,
            fontStyle: "italic",
            color: "#1a1510",
            marginBottom: "1.5rem",
          }}
        >
          {productTitle || "Product"}
        </div>

        {/* QR Code */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "1.2rem",
          }}
        >
          <canvas
            ref={qrRef}
            style={{
              border: "1px solid rgba(26,21,16,0.08)",
              padding: "0.5rem",
            }}
          />
        </div>

        {/* Instructions */}
        <div
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "0.55rem",
            letterSpacing: "0.1em",
            color: "#8a7f72",
            lineHeight: 1.7,
            marginBottom: "1rem",
          }}
        >
          Scan this QR code with your phone camera
          <br />
          to place this product in your room using AR
        </div>

        {/* URL */}
        <div
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "0.45rem",
            letterSpacing: "0.05em",
            color: "rgba(26,21,16,0.35)",
            wordBreak: "break-all",
            marginBottom: "1.5rem",
            padding: "0.5rem",
            background: "rgba(26,21,16,0.04)",
            border: "1px solid rgba(26,21,16,0.06)",
          }}
        >
          {arUrl}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "0.75rem",
            background: "#1a1510",
            color: "#f5f0e8",
            border: "none",
            fontFamily: "'DM Mono', monospace",
            fontSize: "0.6rem",
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
