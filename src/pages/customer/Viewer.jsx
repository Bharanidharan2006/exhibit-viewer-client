import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import api from "../../api.js";
import GALLERY_TEMPLATES from "../../galleryTemplates.js";

export default function Viewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);

  // Overlay state (managed in React, not DOM manipulation)
  const [overlayData, setOverlayData] = useState(null); // null = hidden
  const [liking, setLiking] = useState(false);
  const [exhibitionName, setExhibitionName] = useState("");

  // Refs shared between React and Three.js loop
  const overlayOpenRef = useRef(false);
  const hoveredSlotRef = useRef(null);
  const exhibitionRef = useRef(null);

  // Keep overlayOpenRef in sync with React state
  useEffect(() => {
    overlayOpenRef.current = overlayData !== null;
    if (overlayData !== null) document.exitPointerLock();
  }, [overlayData]);

  /* ─────────────────────────────────────────────
     Three.js initialisation inside useEffect
     Runs once after mount, cleans up on unmount
  ───────────────────────────────────────────── */
  useEffect(() => {
    let renderer, animationId;
    const cleanupFns = []; // collect event listener removers

    async function init() {
      // 1. Fetch exhibition data
      let exhibition;
      try {
        const { data } = await api.get(`/exhibitions/${id}`);
        exhibition = data;
        exhibitionRef.current = data;
        setExhibitionName(data.name);
      } catch {
        navigate("/exhibitions");
        return;
      }

      // 2. Find matching template for GLB path
      const template = GALLERY_TEMPLATES.find(
        (t) => t.id === exhibition.modelTemplate,
      );
      if (!template) {
        navigate("/exhibitions");
        return;
      }

      /* ── Scene ── */
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf2f2f2);

      /* ── Renderer ── */
      renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current,
        antialias: true,
      });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.xr.enabled = true;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      // Append VR button
      const vrBtn = VRButton.createButton(renderer);
      document.body.appendChild(vrBtn);
      cleanupFns.push(() => vrBtn.remove());

      /* ── Camera ── */
      const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000,
      );

      /* ── Player rig ── */
      const playerRig = new THREE.Object3D();
      scene.add(playerRig);
      playerRig.add(camera);

      let EYE_HEIGHT = 1.6;
      let PLAYER_SPEED = 2.5;
      camera.position.set(0, EYE_HEIGHT, 0);

      /* ── Lighting ── */
      const hemi = new THREE.HemisphereLight(0xffeedd, 0x444433, 0.6);
      scene.add(hemi);

      const dirLight = new THREE.DirectionalLight(0xfff5e0, 1.4);
      dirLight.position.set(8, 14, 6);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.set(2048, 2048);
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 80;
      dirLight.shadow.camera.left = dirLight.shadow.camera.bottom = -30;
      dirLight.shadow.camera.right = dirLight.shadow.camera.top = 30;
      dirLight.shadow.bias = -0.001;
      scene.add(dirLight);

      const fillLight = new THREE.DirectionalLight(0xd0e8ff, 0.4);
      fillLight.position.set(-6, 8, -8);
      scene.add(fillLight);

      /* ── Collision & slots collections ── */
      const colliders = [];
      const slots = {};

      /* ── Floor detection ── */
      function findFloorY(meshes) {
        const cx =
          meshes.reduce((s, m) => {
            const p = new THREE.Vector3();
            m.getWorldPosition(p);
            return s + p.x;
          }, 0) / meshes.length;
        const cz =
          meshes.reduce((s, m) => {
            const p = new THREE.Vector3();
            m.getWorldPosition(p);
            return s + p.z;
          }, 0) / meshes.length;
        const ray = new THREE.Raycaster(
          new THREE.Vector3(cx, 999, cz),
          new THREE.Vector3(0, -1, 0),
        );
        const hits = ray.intersectObjects(meshes, false);
        return hits.length > 0 ? hits[0].point.y : 0;
      }

      /* ── Load GLB ── */
      const textureLoader = new THREE.TextureLoader();
      const loader = new GLTFLoader();

      loader.load(template.glbFile, (gltf) => {
        const allMeshes = [];

        gltf.scene.traverse((child) => {
          if (!child.isMesh) return;
          child.castShadow = true;
          child.receiveShadow = true;

          if (child.name.startsWith("SLOT_")) {
            slots[child.name] = child;
            child.material = new THREE.MeshStandardMaterial({
              color: 0xffffff,
            });
            child.userData.interactive = true;
            child.userData.slotName = child.name;
          } else {
            child.updateMatrixWorld(true);
            colliders.push(child);
            allMeshes.push(child);
          }
        });

        scene.add(gltf.scene);

        // Place player
        if (allMeshes.length > 0) {
          const floorY = findFloorY(allMeshes);
          playerRig.position.set(0, floorY, 0);
          camera.position.set(0, EYE_HEIGHT, 0);
          // Scale speed to scene
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = new THREE.Vector3();
          box.getSize(size);
          PLAYER_SPEED = Math.max(1.2, Math.min(size.x * 0.065, 4.0));
        }

        // Load artwork into slots from exhibition data
        exhibition.slots.forEach((slotData) => {
          const mesh = slots[slotData.slotName];
          if (!mesh || !slotData.imageUrl) return;

          textureLoader.load(slotData.imageUrl, (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.flipY = false;
            mesh.material = mesh.material.clone();
            mesh.material.map = texture;
            mesh.material.needsUpdate = true;

            // Attach full slot data to mesh for overlay
            mesh.userData.artData = {
              slotName: slotData.slotName,
              title: slotData.title,
              artist: slotData.artist,
              description: slotData.description,
              price: slotData.price,
              medium: slotData.medium,
              dimensions: slotData.dimensions,
              year: slotData.year,
              likes: slotData.likes,
            };
          });
        });
      });

      /* ── Crosshair raycaster ── */
      const centerRay = new THREE.Raycaster();
      const CENTER = new THREE.Vector2(0, 0);
      let showingHint = false;

      function updateCrosshair() {
        if (!pointerLocked) return;

        centerRay.setFromCamera(CENTER, camera);
        const meshList = Object.values(slots).filter((m) => m.userData.artData);
        const hits = centerRay.intersectObjects(meshList);

        const crosshair = document.getElementById("vr-crosshair");
        const hint = document.getElementById("vr-hint");

        if (hits.length > 0 && hits[0].distance < 8) {
          hoveredSlotRef.current = hits[0].object;
          if (crosshair) crosshair.classList.add("on-art");
          if (hint && !showingHint) {
            hint.style.display = "flex";
            showingHint = true;
          }
        } else {
          hoveredSlotRef.current = null;
          if (crosshair) crosshair.classList.remove("on-art");
          if (hint && showingHint) {
            hint.style.display = "none";
            showingHint = false;
          }
        }
      }

      /* ── Pointer lock ── */
      let pointerLocked = false;

      const onCanvasClick = () => {
        if (!renderer.xr.isPresenting && !overlayOpenRef.current) {
          canvasRef.current.requestPointerLock();
        }
      };
      canvasRef.current.addEventListener("click", onCanvasClick);
      cleanupFns.push(() =>
        canvasRef.current?.removeEventListener("click", onCanvasClick),
      );

      const onLockChange = () => {
        pointerLocked = document.pointerLockElement === canvasRef.current;
        const ch = document.getElementById("vr-crosshair");
        if (ch) ch.style.display = pointerLocked ? "flex" : "none";
      };
      document.addEventListener("pointerlockchange", onLockChange);
      cleanupFns.push(() =>
        document.removeEventListener("pointerlockchange", onLockChange),
      );

      /* ── Mouse look ── */
      let pitch = 0,
        yaw = 0;
      const onMouseMove = (e) => {
        if (!pointerLocked || renderer.xr.isPresenting) return;
        yaw -= e.movementX * 0.002;
        pitch -= e.movementY * 0.002;
        pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, pitch));
        playerRig.rotation.y = yaw;
        camera.rotation.x = pitch;
      };
      document.addEventListener("mousemove", onMouseMove);
      cleanupFns.push(() =>
        document.removeEventListener("mousemove", onMouseMove),
      );

      /* ── Keyboard ── */
      const keys = { w: false, a: false, s: false, d: false };
      const onKeyDown = (e) => {
        if (overlayOpenRef.current && e.code !== "Escape") return;
        switch (e.code) {
          case "KeyW":
            keys.w = true;
            break;
          case "KeyS":
            keys.s = true;
            break;
          case "KeyA":
            keys.a = true;
            break;
          case "KeyD":
            keys.d = true;
            break;
          case "KeyE":
            if (hoveredSlotRef.current?.userData?.artData) {
              setOverlayData({ ...hoveredSlotRef.current.userData.artData });
            }
            break;
          case "Escape":
            setOverlayData(null);
            break;
        }
      };
      const onKeyUp = (e) => {
        switch (e.code) {
          case "KeyW":
            keys.w = false;
            break;
          case "KeyS":
            keys.s = false;
            break;
          case "KeyA":
            keys.a = false;
            break;
          case "KeyD":
            keys.d = false;
            break;
        }
      };
      document.addEventListener("keydown", onKeyDown);
      document.addEventListener("keyup", onKeyUp);
      cleanupFns.push(() => {
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keyup", onKeyUp);
      });

      /* ── Collision raycaster ── */
      const collisionRay = new THREE.Raycaster();
      const floorRay = new THREE.Raycaster();

      function stickToFloor() {
        const origin = playerRig.position.clone();
        origin.y += 2.0;
        floorRay.set(origin, new THREE.Vector3(0, -1, 0));
        const hits = floorRay.intersectObjects(colliders, false);
        if (hits.length > 0) {
          const targetY = hits[0].point.y;
          if (
            targetY > playerRig.position.y ||
            playerRig.position.y - targetY < 0.5
          ) {
            playerRig.position.y = targetY;
          }
        }
      }

      /* ── VR teleport ── */
      const controller = renderer.xr.getController(0);
      scene.add(controller);
      const teleportRay = new THREE.Raycaster();
      const tempMatrix = new THREE.Matrix4();
      const vrFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      vrFloor.rotation.x = -Math.PI / 2;
      scene.add(vrFloor);

      controller.addEventListener("selectstart", () => {
        if (!renderer.xr.isPresenting) return;
        tempMatrix.identity().extractRotation(controller.matrixWorld);
        teleportRay.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        teleportRay.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
        const hits = teleportRay.intersectObject(vrFloor);
        if (hits.length > 0) {
          playerRig.position.set(
            hits[0].point.x,
            playerRig.position.y,
            hits[0].point.z,
          );
        }
      });

      /* ── Animation loop ── */
      const clock = new THREE.Clock();
      const direction = new THREE.Vector3();
      const velocity = new THREE.Vector3();
      let bobTime = 0;

      function animate() {
        const delta = clock.getDelta();

        if (!renderer.xr.isPresenting) {
          updateCrosshair();

          if (!overlayOpenRef.current) {
            direction.z = Number(keys.s) - Number(keys.w);
            direction.x = Number(keys.d) - Number(keys.a);
            direction.normalize();

            const moving = keys.w || keys.a || keys.s || keys.d;
            velocity.x = direction.x * PLAYER_SPEED * delta;
            velocity.z = direction.z * PLAYER_SPEED * delta;

            const moveVec = new THREE.Vector3(velocity.x, 0, velocity.z);
            moveVec.applyAxisAngle(
              new THREE.Vector3(0, 1, 0),
              playerRig.rotation.y,
            );

            if (moveVec.length() > 0) {
              const rayOrigin = playerRig.position.clone();
              rayOrigin.y += EYE_HEIGHT * 0.6;
              collisionRay.set(rayOrigin, moveVec.clone().normalize());
              const hits = collisionRay.intersectObjects(colliders, false);
              if (hits.length === 0 || hits[0].distance > 0.5) {
                playerRig.position.add(moveVec);
              }
            }

            stickToFloor();

            if (moving) {
              bobTime += delta * 8;
              camera.position.y = EYE_HEIGHT + Math.sin(bobTime) * 0.04;
            } else {
              bobTime = 0;
              camera.position.y = EYE_HEIGHT;
            }
          }
        }

        renderer.render(scene, camera);
      }

      renderer.setAnimationLoop(animate);

      /* ── Resize ── */
      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("resize", onResize);
      cleanupFns.push(() => window.removeEventListener("resize", onResize));
    }

    init();

    // Cleanup on unmount
    return () => {
      if (renderer) {
        renderer.setAnimationLoop(null);
        renderer.dispose();
      }
      document.exitPointerLock();
      cleanupFns.forEach((fn) => fn());
    };
  }, [id]); // re-init if exhibition id changes

  /* ─────────────────────────────────────────────
     Like handler — calls backend
  ───────────────────────────────────────────── */
  const handleLike = useCallback(async () => {
    if (!overlayData || liking) return;
    setLiking(true);
    try {
      const { data } = await api.post(
        `/exhibitions/${id}/slots/${overlayData.slotName}/like`,
      );
      // Update overlay + the mesh's userData so it stays correct if re-opened
      setOverlayData((prev) => ({ ...prev, likes: data.likes }));
      if (hoveredSlotRef.current?.userData?.artData) {
        hoveredSlotRef.current.userData.artData.likes = data.likes;
      }
    } catch (err) {
      console.error("Like failed:", err);
    } finally {
      setLiking(false);
    }
  }, [overlayData, id, liking]);

  /* ─────────────────────────────────────────────
     Buy handler
  ───────────────────────────────────────────── */
  const handleBuy = useCallback(() => {
    if (!overlayData) return;
    const params = new URLSearchParams({
      title: overlayData.title || "",
      artist: overlayData.artist || "",
      price: overlayData.price || 0,
    });
    navigate(`/checkout?${params.toString()}`);
  }, [overlayData, navigate]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Three.js canvas */}
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />

      {/* Exhibition name */}
      <div
        style={{
          position: "fixed",
          top: "1.5rem",
          left: "1.5rem",
          fontFamily: "'DM Mono', monospace",
          fontSize: "0.6rem",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.6)",
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(8px)",
          padding: "0.4rem 0.9rem",
          zIndex: 10,
        }}
      >
        {exhibitionName}
      </div>

      {/* Back button */}
      <button
        onClick={() => navigate("/exhibitions")}
        style={{
          position: "fixed",
          top: "1.5rem",
          right: "1.5rem",
          zIndex: 10,
          fontFamily: "'DM Mono', monospace",
          fontSize: "0.6rem",
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          background: "rgba(0,0,0,0.5)",
          color: "rgba(255,255,255,0.75)",
          border: "1px solid rgba(255,255,255,0.15)",
          padding: "0.45rem 1rem",
          backdropFilter: "blur(8px)",
          cursor: "pointer",
        }}
      >
        ← Exit Gallery
      </button>

      {/* Crosshair */}
      <div
        id="vr-crosshair"
        style={{
          display: "none",
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          pointerEvents: "none",
          zIndex: 50,
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "1px solid rgba(255,255,255,0.6)",
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            transition: "transform 0.15s, border-color 0.15s",
          }}
          className="ch-ring"
        />
        <div
          style={{
            width: 3,
            height: 3,
            background: "rgba(255,255,255,0.9)",
            borderRadius: "50%",
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
          }}
        />
      </div>

      {/* Interact hint */}
      <div
        id="vr-hint"
        style={{
          display: "none",
          position: "fixed",
          bottom: "2.5rem",
          left: "50%",
          transform: "translateX(-50%)",
          alignItems: "center",
          gap: "0.75rem",
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(196,162,101,0.3)",
          padding: "0.6rem 1.2rem 0.6rem 0.9rem",
          borderRadius: "2rem",
          zIndex: 60,
          color: "#fff",
          fontFamily: "'DM Mono', monospace",
          fontSize: "0.65rem",
          letterSpacing: "0.15em",
        }}
      >
        <span
          style={{
            background: "#c4a265",
            color: "#1a1510",
            padding: "0.1rem 0.5rem",
            borderRadius: 4,
            fontSize: "0.7rem",
          }}
        >
          E
        </span>
        <span
          style={{
            color: "rgba(255,255,255,0.75)",
            textTransform: "uppercase",
          }}
        >
          Inspect artwork
        </span>
      </div>

      {/* Controls hint */}
      <div
        style={{
          position: "fixed",
          bottom: "2rem",
          right: "2rem",
          zIndex: 60,
          background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(196,162,101,0.3)",
          padding: "1.2rem 1.5rem",
          opacity: overlayData ? 0 : 1,
          transition: "opacity 0.3s",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: "0.55rem",
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "#c4a265",
            marginBottom: "0.8rem",
          }}
        >
          Navigation
        </div>
        {[
          ["W A S D", "Move"],
          ["Mouse", "Look"],
          ["E", "Inspect art"],
          ["Esc", "Close"],
        ].map(([key, label]) => (
          <div
            key={key}
            style={{
              display: "flex",
              gap: "1rem",
              alignItems: "center",
              marginBottom: "0.4rem",
            }}
          >
            <span
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.55rem",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.85)",
                padding: "0.1rem 0.4rem",
                borderRadius: 3,
                minWidth: 55,
                textAlign: "center",
              }}
            >
              {key}
            </span>
            <span
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: "0.6rem",
                color: "rgba(255,255,255,0.55)",
              }}
            >
              {label}
            </span>
          </div>
        ))}
        <div
          style={{
            marginTop: "0.8rem",
            fontFamily: "'DM Mono', monospace",
            fontSize: "0.58rem",
            color: "#c4a265",
            textAlign: "right",
          }}
        >
          Click to begin →
        </div>
      </div>

      {/* Art Overlay — React-managed */}
      {overlayData && (
        <ArtOverlay
          data={overlayData}
          onClose={() => setOverlayData(null)}
          onLike={handleLike}
          onBuy={handleBuy}
          liking={liking}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Art Overlay Component
───────────────────────────────────────────── */
function ArtOverlay({ data, onClose, onLike, onBuy, liking }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(10,8,5,0.72)",
          backdropFilter: "blur(6px)",
          animation: "fadeIn 0.3s ease",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          background: "rgba(245,240,232,0.97)",
          width: "min(520px, 90vw)",
          maxHeight: "90vh",
          overflowY: "auto",
          border: "1px solid rgba(196,162,101,0.25)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
          animation: "panelIn 0.35s cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.9rem 1.4rem",
            borderBottom: "1px solid rgba(26,21,16,0.08)",
          }}
        >
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.58rem",
              letterSpacing: "0.25em",
              textTransform: "uppercase",
              color: "#c4a265",
            }}
          >
            Original Work
          </span>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              border: "1px solid rgba(26,21,16,0.1)",
              background: "transparent",
              display: "grid",
              placeItems: "center",
              cursor: "pointer",
              color: "#8a7f72",
              fontSize: "0.8rem",
              transition: "border-color 0.2s",
            }}
          >
            ✕
          </button>
        </div>

        {/* Image placeholder */}
        <div
          style={{
            width: "100%",
            aspectRatio: "16/9",
            background:
              "linear-gradient(135deg,#1a0e06,#3d1f0a,#7a4520,#c47a35,#e8a862,#c4956a,#3a2515,#1a1208)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              bottom: "0.9rem",
              left: "1.2rem",
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.6rem",
              letterSpacing: "0.2em",
              color: "rgba(232,213,170,0.75)",
              textTransform: "uppercase",
              background: "rgba(0,0,0,0.5)",
              padding: "0.25rem 0.65rem",
              backdropFilter: "blur(8px)",
            }}
          >
            {data.medium || "Original"}
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 2,
              background:
                "linear-gradient(90deg,transparent,#c4a265,transparent)",
            }}
          />
        </div>

        {/* Content */}
        <div style={{ padding: "1.8rem 1.8rem 1.5rem" }}>
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

          <h2
            style={{
              fontSize: "2rem",
              fontWeight: 300,
              fontStyle: "italic",
              lineHeight: 1.15,
              marginBottom: "0.8rem",
              color: "#1a1510",
            }}
          >
            {data.title || "Untitled"}
          </h2>
          <p
            style={{
              fontSize: "1rem",
              fontWeight: 300,
              lineHeight: 1.7,
              color: "#8a7f72",
              marginBottom: "1.4rem",
            }}
          >
            {data.description}
          </p>

          {/* Meta strip */}
          <div
            style={{
              display: "flex",
              borderTop: "1px solid rgba(26,21,16,0.08)",
              borderBottom: "1px solid rgba(26,21,16,0.08)",
              marginBottom: "1.5rem",
            }}
          >
            {[
              ["Medium", data.medium],
              ["Dimensions", data.dimensions],
              ["Edition", "Original"],
            ].map(([label, val]) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  padding: "0.85rem 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.3rem",
                  borderRight: "1px solid rgba(26,21,16,0.08)",
                  paddingLeft: label !== "Medium" ? "1rem" : 0,
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
                    fontSize: "0.92rem",
                    fontWeight: 300,
                    color: "#1a1510",
                  }}
                >
                  {val || "—"}
                </span>
              </div>
            ))}
          </div>

          {/* Price + like */}
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
                  fontSize: "2rem",
                  fontWeight: 600,
                  color: "#1a1510",
                  lineHeight: 1,
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
                transition: "all 0.2s",
                opacity: liking ? 0.6 : 1,
              }}
            >
              ♡ {data.likes ?? 0}
            </button>
          </div>

          {/* Actions */}
          <div
            style={{ display: "flex", gap: "0.9rem", marginBottom: "1.2rem" }}
          >
            <button
              onClick={onBuy}
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.75rem",
                background: "#1a1510",
                color: "#f5f0e8",
                border: "none",
                padding: "1rem 1.5rem",
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "1rem",
                letterSpacing: "0.05em",
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
              Acquire This Work →
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "1rem 1.2rem",
                border: "1px solid rgba(26,21,16,0.1)",
                background: "transparent",
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: "1rem",
                color: "#8a7f72",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>

          <div
            style={{
              textAlign: "center",
              fontFamily: "'DM Mono', monospace",
              fontSize: "0.58rem",
              letterSpacing: "0.1em",
              color: "#8a7f72",
              opacity: 0.65,
              paddingTop: "1rem",
              borderTop: "1px solid rgba(26,21,16,0.06)",
            }}
          >
            ✦ Certificate of Authenticity &nbsp;·&nbsp; Secure Checkout
            &nbsp;·&nbsp; Free Returns
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes panelIn { from { opacity: 0; transform: translateY(24px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        #vr-crosshair.on-art .ch-ring { transform: translate(-50%,-50%) scale(1.5) !important; border-color: #c4a265 !important; }
      `}</style>
    </div>
  );
}
