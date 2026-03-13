import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import api from "../../api.js";

/**
 * ARViewer — Standalone mobile-first AR product preview page.
 * Route: /ar/:exhibitionId/:slotName
 *
 * AR flow follows the official Three.js webxr_ar_hittest example:
 *   1. Create renderer + scene + reticle + controller
 *   2. Start animation loop BEFORE requesting session
 *   3. Request immersive-ar session
 *   4. Bind session → renderer
 *   5. Hit-test source lazily initialized inside render loop
 *   6. Controller 'select' event places model at reticle position
 *   7. ZERO mutations after placement — model stays anchored
 */
export default function ARViewer() {
  const { exhibitionId, slotName } = useParams();
  const navigate = useNavigate();
  const fallbackCanvasRef = useRef(null);
  const arCanvasRef = useRef(null);

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [arSupported, setArSupported] = useState(false);
  const [arActive, setArActive] = useState(false);
  const [arError, setArError] = useState(null);
  const [placed, setPlaced] = useState(false);

  // Check WebXR AR support
  useEffect(() => {
    if (navigator.xr) {
      navigator.xr
        .isSessionSupported("immersive-ar")
        .then((ok) => setArSupported(ok))
        .catch(() => setArSupported(false));
    }
  }, []);

  // Fetch product data
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(
          `/exhibitions/${exhibitionId}/slots/${slotName}`,
        );
        setProduct(data);
      } catch {
        setError("Product not found");
      } finally {
        setLoading(false);
      }
    })();
  }, [exhibitionId, slotName]);

  // ─── Fallback 3D preview (OrbitControls) — non-AR devices ───
  useEffect(() => {
    if (!product?.modelUrl || !fallbackCanvasRef.current || arActive) return;

    const canvas = fallbackCanvasRef.current;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0805);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.6;

    const cam = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
    cam.position.set(0, 0.5, 2.5);

    const controls = new OrbitControls(cam, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 0.5;
    controls.maxDistance = 8;
    controls.target.set(0, 0.3, 0);
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2;
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(3, 5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xfff5e6, 0.8);
    fill.position.set(-3, 3, -2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xc4a265, 0.6);
    rim.position.set(0, 2, -4);
    scene.add(rim);

    const loader = new GLTFLoader();
    loader.load(product.modelUrl, (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) model.scale.multiplyScalar(1.5 / maxDim);
      const b2 = new THREE.Box3().setFromObject(model);
      b2.getCenter(center);
      model.position.sub(center);
      scene.add(model);
      controls.target.copy(b2.getCenter(new THREE.Vector3()));
      controls.update();
    });

    let animId;
    const tick = () => {
      animId = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, cam);
    };
    tick();

    const onResize = () => {
      cam.aspect = canvas.clientWidth / canvas.clientHeight;
      cam.updateProjectionMatrix();
      renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
    };
  }, [product, arActive]);

  // ═══════════════════════════════════════════════════════════════
  // START AR — follows official Three.js webxr_ar_hittest pattern
  // ═══════════════════════════════════════════════════════════════
  async function startAR() {
    if (!navigator.xr || !product?.modelUrl) return;
    setArError(null);
    setPlaced(false);

    try {
      /* ── 1. Renderer ── */
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
      });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.xr.enabled = true;

      const arCanvas = renderer.domElement;
      arCanvas.style.cssText =
        "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:1000";
      document.body.appendChild(arCanvas);
      arCanvasRef.current = arCanvas;

      /* ── 2. Scene + lights ── */
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.01,
        20,
      );

      const hemiLight = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
      hemiLight.position.set(0.5, 1, 0.25);
      scene.add(hemiLight);
      const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
      dirLight.position.set(1, 3, 2);
      scene.add(dirLight);

      /* ── 3. Reticle ── */
      const reticle = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xc4a265 }),
      );
      reticle.matrixAutoUpdate = false;
      reticle.visible = false;
      scene.add(reticle);

      /* ── 4. Load model ── */
      let readyModel = null;
      let modelPlaced = false;

      const loader = new GLTFLoader();
      loader.load(
        product.modelUrl,
        (gltf) => {
          const m = gltf.scene;

          // Scale so largest axis = 1 m (visible in AR)
          const box = new THREE.Box3().setFromObject(m);
          const sz = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(sz.x, sz.y, sz.z);
          if (maxDim > 0) m.scale.multiplyScalar(1.0 / maxDim);

          // Bot­tom at y=0, centered on x/z
          const sb = new THREE.Box3().setFromObject(m);
          const c = sb.getCenter(new THREE.Vector3());
          m.position.set(-c.x, -sb.min.y, -c.z);

          // Wrap in a group so "group.position = surface" works
          const grp = new THREE.Group();
          grp.add(m);
          readyModel = grp;
        },
        undefined,
        (e) => console.error("Model load failed:", e),
      );

      /* ── 5. Controller (official pattern for tap-to-place) ── */
      const controller = renderer.xr.getController(0);
      controller.addEventListener("select", () => {
        if (modelPlaced || !readyModel) return;

        if (reticle.visible) {
          // Place at exact reticle world position
          readyModel.position.setFromMatrixPosition(reticle.matrix);
        } else {
          // Fallback: 1.5 m in front of XR camera
          const xrCam = renderer.xr.getCamera();
          const fwd = new THREE.Vector3(0, 0, -1.5);
          fwd.applyQuaternion(xrCam.quaternion);
          readyModel.position.copy(xrCam.position).add(fwd);
          readyModel.position.y -= 0.5;
        }

        scene.add(readyModel);
        modelPlaced = true;
        reticle.visible = false;
        setPlaced(true);
      });
      scene.add(controller);

      /* ── 6. Hit-test state (lazy) ── */
      let hitTestSource = null;
      let hitTestSourceRequested = false;

      /* ── 7. Start animation loop BEFORE session ── */
      renderer.setAnimationLoop((_, frame) => {
        if (frame) {
          const sess = renderer.xr.getSession();
          const refSpace = renderer.xr.getReferenceSpace();

          // Lazy-init hit-test on first XR frame
          if (!hitTestSourceRequested && sess) {
            sess
              .requestReferenceSpace("viewer")
              .then((vs) =>
                sess
                  .requestHitTestSource({ space: vs })
                  .then((src) => {
                    hitTestSource = src;
                  })
                  .catch(() => {}),
              )
              .catch(() => {});
            hitTestSourceRequested = true;
          }

          // Update reticle
          if (hitTestSource && !modelPlaced) {
            const hits = frame.getHitTestResults(hitTestSource);
            if (hits.length) {
              const pose = hits[0].getPose(refSpace);
              if (pose) {
                reticle.visible = true;
                reticle.matrix.fromArray(pose.transform.matrix);
              }
            } else {
              reticle.visible = false;
            }
          }
        }
        renderer.render(scene, camera);
      });

      /* ── 8. Request AR session (with retry) ── */
      let session;
      try {
        session = await navigator.xr.requestSession("immersive-ar", {
          optionalFeatures: ["hit-test"],
        });
      } catch {
        try {
          session = await navigator.xr.requestSession("immersive-ar");
        } catch (e2) {
          arCanvas.remove();
          arCanvasRef.current = null;
          renderer.dispose();
          throw new Error(
            `AR failed: ${e2.message}. Ensure Google Play Services for AR is installed.`,
          );
        }
      }

      /* ── 9. Bind ── */
      setArActive(true);
      renderer.xr.setReferenceSpaceType("local");
      await renderer.xr.setSession(session);

      session.addEventListener("end", () => {
        renderer.setAnimationLoop(null);
        renderer.dispose();
        if (arCanvasRef.current) {
          arCanvasRef.current.remove();
          arCanvasRef.current = null;
        }
        setArActive(false);
        setPlaced(false);
      });
    } catch (err) {
      console.error("AR Error:", err);
      setArError(err.message || "Failed to start AR.");
      setArActive(false);
      if (arCanvasRef.current) {
        arCanvasRef.current.remove();
        arCanvasRef.current = null;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div style={S.page}>
        <div style={S.mono}>Loading product...</div>
      </div>
    );
  }
  if (error || !product) {
    return (
      <div style={S.page}>
        <div style={{ ...S.mono, color: "rgba(255,255,255,.6)" }}>
          {error || "Product not found"}
        </div>
        <button onClick={() => navigate("/exhibitions")} style={S.linkBtn}>
          Browse exhibitions
        </button>
      </div>
    );
  }

  return (
    <div style={S.page}>
      {/* ─── Fallback 3D viewer (visible when AR not active) ─── */}
      {!arActive && (
        <>
          <canvas
            ref={fallbackCanvasRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              display: "block",
              cursor: "grab",
            }}
          />

          {/* Top bar */}
          <div style={S.topBar}>
            <div style={S.badge}>AR Preview</div>
            <div style={{ ...S.mono, fontSize: ".55rem", color: "rgba(255,255,255,.4)" }}>
              {product.exhibitionName}
            </div>
          </div>

          {/* Bottom card */}
          <div style={S.bottomCard}>
            <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: ".4rem" }}>
              <span style={{ ...S.mono, fontSize: ".6rem", letterSpacing: ".18em", textTransform: "uppercase", color: "rgba(255,255,255,.5)" }}>
                {product.artist || "Unknown Artist"}
              </span>
              {product.year && (
                <>
                  <span style={{ width: 3, height: 3, borderRadius: "50%", background: "#c4a265", opacity: .6, display: "inline-block" }} />
                  <span style={{ ...S.mono, fontSize: ".55rem", color: "rgba(255,255,255,.35)" }}>{product.year}</span>
                </>
              )}
            </div>

            <h1 style={{ fontSize: "1.6rem", fontWeight: 300, fontStyle: "italic", lineHeight: 1.2, color: "#f5f0e8", margin: 0 }}>
              {product.title || "Untitled"}
            </h1>

            {product.description && (
              <p style={{ fontSize: ".85rem", fontWeight: 300, lineHeight: 1.6, color: "rgba(255,255,255,.45)", margin: "0 0 .8rem" }}>
                {product.description}
              </p>
            )}

            <div style={{ display: "flex", alignItems: "baseline", gap: ".2rem", marginBottom: "1rem" }}>
              <span style={{ ...S.mono, fontSize: ".8rem", color: "#c4a265" }}>₹</span>
              <span style={{ fontSize: "1.5rem", fontWeight: 600, color: "#f5f0e8" }}>
                {product.price?.toLocaleString("en-IN") || "0"}
              </span>
            </div>

            {arError && (
              <div style={{ background: "rgba(220,80,80,.15)", border: "1px solid rgba(220,80,80,.3)", color: "#e8a0a0", ...S.mono, fontSize: ".55rem", padding: ".6rem .8rem", marginBottom: ".8rem", lineHeight: 1.5 }}>
                ⚠ {arError}
              </div>
            )}

            <div style={{ display: "flex", gap: ".6rem", marginBottom: ".8rem" }}>
              {arSupported ? (
                <button onClick={startAR} style={S.arBtn}>
                  📱 Place in your room
                </button>
              ) : (
                <div style={S.noAr}>
                  📱 Open this link on your phone for the full AR experience
                </div>
              )}
              <button
                onClick={() => navigate(`/checkout?title=${encodeURIComponent(product.title || "")}&artist=${encodeURIComponent(product.artist || "")}&price=${product.price || 0}`)}
                style={S.buyBtn}
              >
                Acquire →
              </button>
            </div>

            <div style={{ textAlign: "center", ...S.mono, fontSize: ".5rem", letterSpacing: ".12em", color: "rgba(255,255,255,.3)", textTransform: "uppercase" }}>
              {arSupported ? "Tap 'Place in your room' to start the AR camera" : "Drag to rotate · Scroll to zoom"}
            </div>
          </div>
        </>
      )}

      {/* AR is active — nothing to show here, XR canvas is in document.body */}
      {arActive && (
        <div style={{ position: "fixed", bottom: "2rem", left: 0, right: 0, textAlign: "center", zIndex: 1100, pointerEvents: "none" }}>
          <div style={{ display: "inline-block", background: "rgba(0,0,0,.65)", backdropFilter: "blur(8px)", color: placed ? "#c4a265" : "#fff", ...S.mono, fontSize: ".6rem", letterSpacing: ".1em", padding: ".6rem 1.2rem", borderRadius: "2rem", border: "1px solid rgba(196,162,101,.3)" }}>
            {placed ? "✓ Product placed — walk around to view" : "Point at a surface, then tap to place"}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Styles ── */
const S = {
  page: {
    width: "100vw",
    height: "100dvh",
    background: "#0a0805",
    position: "relative",
    overflow: "hidden",
    fontFamily: "'Cormorant Garamond', serif",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
  },
  mono: {
    fontFamily: "'DM Mono', monospace",
    letterSpacing: ".15em",
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    padding: "1.2rem 1.5rem",
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    zIndex: 10,
    background: "linear-gradient(to bottom, rgba(10,8,5,.8), transparent)",
  },
  badge: {
    fontFamily: "'DM Mono', monospace",
    fontSize: ".55rem",
    letterSpacing: ".2em",
    textTransform: "uppercase",
    background: "rgba(196,162,101,.2)",
    color: "#c4a265",
    padding: ".25rem .65rem",
    border: "1px solid rgba(196,162,101,.3)",
  },
  bottomCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: "2rem 1.5rem",
    paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
    background: "linear-gradient(to top, rgba(10,8,5,.95) 0%, rgba(10,8,5,.7) 60%, transparent)",
    zIndex: 10,
  },
  linkBtn: {
    background: "transparent",
    border: "1px solid rgba(196,162,101,.3)",
    color: "#c4a265",
    fontFamily: "'DM Mono', monospace",
    fontSize: ".65rem",
    letterSpacing: ".15em",
    textTransform: "uppercase",
    padding: ".5rem 1rem",
    cursor: "pointer",
  },
  arBtn: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: ".5rem",
    background: "linear-gradient(135deg, #c4a265, #9a7a45)",
    color: "#0a0805",
    border: "none",
    padding: ".85rem 1rem",
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: ".95rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  noAr: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: ".5rem",
    background: "rgba(196,162,101,.1)",
    border: "1px solid rgba(196,162,101,.25)",
    color: "#c4a265",
    padding: ".75rem .8rem",
    fontFamily: "'DM Mono', monospace",
    fontSize: ".55rem",
    letterSpacing: ".08em",
    lineHeight: 1.4,
    textAlign: "center",
  },
  buyBtn: {
    padding: ".85rem 1.2rem",
    background: "#f5f0e8",
    color: "#0a0805",
    border: "none",
    fontFamily: "'Cormorant Garamond', serif",
    fontSize: ".95rem",
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};
