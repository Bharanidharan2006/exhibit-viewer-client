import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import { io } from "socket.io-client";
import api from "../../api.js";
import GALLERY_TEMPLATES from "../../galleryTemplates.js";
import Model3DViewer from "../../components/Model3DViewer.jsx";
import Minimap from "../../components/Minimap.jsx";
import { createVisitorLabel, createVisitorDot, visitorColor } from "../../components/VisitorLabel.js";
import { useAuth } from "../../context/AuthContext.jsx";

export default function Viewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const { user } = useAuth();

  const [overlayData, setOverlayData] = useState(null);
  const [modelViewerData, setModelViewerData] = useState(null); // { modelUrl, data }
  const [liking, setLiking] = useState(false);
  const [exhibitionName, setExhibitionName] = useState("");

  // Socket state
  const [visitors, setVisitors] = useState([]);
  const [visitorCount, setVisitorCount] = useState(1);
  const [showVisitors, setShowVisitors] = useState(true);
  const showVisitorsRef = useRef(true); // For accessing in requestAnimationFrame
  const [playerPos, setPlayerPos] = useState({ x: 0, z: 0 });
  const otherVisitorsMap = useRef(new Map()); // socketId -> { mesh, label, targetPos, targetRot }
  const socketRef = useRef(null);
  const lastBroadcastRef = useRef(0);

  const overlayOpenRef = useRef(false);
  const modelViewerOpenRef = useRef(false);
  const hoveredSlotRef = useRef(null);
  const exhibitionRef = useRef(null);

  useEffect(() => {
    overlayOpenRef.current = overlayData !== null;
    if (overlayData !== null) document.exitPointerLock();
  }, [overlayData]);

  useEffect(() => {
    modelViewerOpenRef.current = modelViewerData !== null;
    if (modelViewerData !== null) document.exitPointerLock();
  }, [modelViewerData]);

  useEffect(() => {
    let renderer;
    const cleanupFns = [];

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
      renderer.toneMappingExposure = 1.8; // higher = brighter overall
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

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

      const EYE_HEIGHT = 1.6;
      let PLAYER_SPEED = 2.5;
      camera.position.set(0, EYE_HEIGHT, 0);

      /* ── Lighting ── */
      // Strong ambient so no surface is ever fully dark
      scene.add(new THREE.AmbientLight(0xffffff, 1.5));

      // Hemisphere for warm ceiling / cool floor bounce
      scene.add(new THREE.HemisphereLight(0xffffff, 0xdddddd, 1.2));

      // Main key light from above
      const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
      dirLight.position.set(8, 14, 6);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.set(2048, 2048);
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 80;
      dirLight.shadow.camera.left = dirLight.shadow.camera.bottom = -30;
      dirLight.shadow.camera.right = dirLight.shadow.camera.top = 30;
      dirLight.shadow.bias = -0.001;
      scene.add(dirLight);

      // Fill from the opposite side — kills harsh shadows on walls
      const fillLight = new THREE.DirectionalLight(0xffffff, 1.2);
      fillLight.position.set(-8, 10, -8);
      scene.add(fillLight);

      // Front fill so walls facing the camera stay bright
      const frontLight = new THREE.DirectionalLight(0xffffff, 0.8);
      frontLight.position.set(0, 6, 10);
      scene.add(frontLight);

      /* ── Collections ── */
      const colliders = [];
      const slots = {};        // SLOT_n → artwork surfaces
      const productSlots = {}; // SLOT_P_n → 3D product pedestals

      /* ── Floor detection ──────────────────────────────────────────────────
         THE KEY FIX: cast from INSIDE the gallery (20% above the bottom),
         not from y=999 which hits the roof first.
      ─────────────────────────────────────────────────────────────────────── */
      function findFloorY(meshes) {
        // Build bounding box of all physical meshes
        const box = new THREE.Box3();
        meshes.forEach((m) => box.expandByObject(m));

        const center = new THREE.Vector3();
        box.getCenter(center);

        const roomHeight = box.max.y - box.min.y;

        // Start the ray from 20% up from the bottom — safely inside the room
        // so the first downward hit is the floor, not the ceiling.
        const startY = box.min.y + roomHeight * 0.2;

        const ray = new THREE.Raycaster(
          new THREE.Vector3(center.x, startY, center.z),
          new THREE.Vector3(0, -1, 0),
        );

        const hits = ray.intersectObjects(meshes, false);

        if (hits.length > 0) {
          console.log(
            `✓ Floor found: Y=${hits[0].point.y.toFixed(3)} on mesh "${hits[0].object.name}"`,
          );
          return hits[0].point.y;
        }

        // If the ray still misses (very unusual), fall back to bounding box bottom
        console.warn("Floor ray missed — using bounding box min Y as fallback");
        return box.min.y;
      }

      /* ── Spawn position ───────────────────────────────────────────────────
         Also compute the spawn XZ from the bounding box centre rather than
         hardcoding (0, 0) which may be outside the gallery entirely.
      ─────────────────────────────────────────────────────────────────────── */
      function computeSpawnXZ(meshes) {
        const box = new THREE.Box3();
        meshes.forEach((m) => box.expandByObject(m));
        const center = new THREE.Vector3();
        box.getCenter(center);
        // Spawn near the front of the gallery (85% toward the +Z wall)
        const spawnZ = center.z + (box.max.z - center.z) * 0.6;
        return { x: center.x, z: spawnZ };
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

          if (child.name.startsWith("SLOT_P_")) {
            // 3D product pedestal slot — transparent so the product shows through
            // but still raycastable for interaction
            productSlots[child.name] = child;
            child.material = new THREE.MeshStandardMaterial({
              color: 0x000000,
              transparent: true,
              opacity: 0,
              depthWrite: false,
            });
            child.userData.interactive = true;
            child.userData.slotName = child.name;
            child.userData.isProductSlot = true;
          } else if (child.name.startsWith("SLOT_")) {
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

        if (allMeshes.length > 0) {
          const floorY = findFloorY(allMeshes);
          const { x: spawnX, z: spawnZ } = computeSpawnXZ(allMeshes);

          playerRig.position.set(spawnX, floorY, spawnZ);
          camera.position.set(0, EYE_HEIGHT, 0);

          console.log(
            `✓ Player spawned at (${spawnX.toFixed(2)}, ${floorY.toFixed(2)}, ${spawnZ.toFixed(2)})`,
          );

          // Scale speed to gallery size
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = new THREE.Vector3();
          box.getSize(size);
          PLAYER_SPEED = Math.max(1.2, Math.min(size.x * 0.065, 4.0));
        }

        // Load artwork into image slots
        exhibition.slots.forEach((slotData) => {
          // Handle image slots (SLOT_n)
          const mesh = slots[slotData.slotName];
          if (mesh && slotData.imageUrl) {
            textureLoader.load(slotData.imageUrl, (texture) => {
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.flipY = template.flipY ?? false;
              mesh.material = mesh.material.clone();
              mesh.material.map = texture;
              mesh.material.needsUpdate = true;
              mesh.userData.artData = {
                slotName: slotData.slotName,
                slotType: slotData.slotType || "image",
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
          }

          // Handle product slots (SLOT_P_n)
          const productMesh = productSlots[slotData.slotName];
          if (productMesh) {
            // Store product data for interaction
            productMesh.userData.artData = {
              slotName: slotData.slotName,
              slotType: "model3d",
              modelUrl: slotData.modelUrl,
              title: slotData.title,
              artist: slotData.artist,
              description: slotData.description,
              price: slotData.price,
              medium: slotData.medium,
              dimensions: slotData.dimensions,
              year: slotData.year,
              likes: slotData.likes,
            };

            // Load the 3D product model inline at the pedestal position
            if (slotData.modelUrl) {
              const productLoader = new GLTFLoader();
              productLoader.load(slotData.modelUrl, (productGltf) => {
                const productModel = productGltf.scene;

                // Get pedestal bounding box to position and scale the product
                productMesh.updateMatrixWorld(true);
                const pedestalBox = new THREE.Box3().setFromObject(productMesh);
                const pedestalCenter = new THREE.Vector3();
                pedestalBox.getCenter(pedestalCenter);
                const pedestalSize = new THREE.Vector3();
                pedestalBox.getSize(pedestalSize);

                // Scale product to fit within pedestal bounds
                const productBox = new THREE.Box3().setFromObject(productModel);
                const productSize = new THREE.Vector3();
                productBox.getSize(productSize);
                const maxProductDim = Math.max(productSize.x, productSize.y, productSize.z);
                const maxPedestalDim = Math.max(pedestalSize.x, pedestalSize.z) * 0.8;
                const scale = maxPedestalDim / maxProductDim;
                productModel.scale.setScalar(scale);

                // Re-compute bounding box after scaling
                productBox.setFromObject(productModel);
                const productCenter = new THREE.Vector3();
                productBox.getCenter(productCenter);

                productModel.traverse((child) => {
                  if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                  }
                });

                // Rotation group centered at the pedestal cube's center
                // Product is centered inside the cube, not sitting on top
                const rotationGroup = new THREE.Group();
                rotationGroup.position.set(
                  pedestalCenter.x,
                  pedestalCenter.y,
                  pedestalCenter.z,
                );

                // Center product relative to group (at pedestal origin)
                productModel.position.set(
                  -productCenter.x,
                  -productCenter.y,
                  -productCenter.z,
                );

                rotationGroup.add(productModel);
                scene.add(rotationGroup);

                // Store reference for rotation animation
                productMesh.userData.rotationGroup = rotationGroup;
              });
            }
          }
        });
      });

      /* ── Crosshair raycaster ── */
      const centerRay = new THREE.Raycaster();
      const CENTER = new THREE.Vector2(0, 0);
      let showingHint = false;

      function updateCrosshair() {
        if (!pointerLocked) return;
        centerRay.setFromCamera(CENTER, camera);

        // Check both art slots and product slots
        const artMeshList = Object.values(slots).filter((m) => m.userData.artData);
        const productMeshList = Object.values(productSlots).filter((m) => m.userData.artData);
        const allInteractive = [...artMeshList, ...productMeshList];

        const hits = centerRay.intersectObjects(allInteractive);
        const crosshair = document.getElementById("vr-crosshair");
        const hint = document.getElementById("vr-hint");
        const hintText = document.getElementById("vr-hint-text");

        if (hits.length > 0 && hits[0].distance < 8) {
          hoveredSlotRef.current = hits[0].object;
          const isProduct = hits[0].object.userData.isProductSlot;
          if (crosshair) crosshair.classList.add("on-art");
          if (hintText) {
            hintText.textContent = isProduct ? "View 3D product" : "Inspect artwork";
          }
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
        if (!renderer.xr.isPresenting && !overlayOpenRef.current && !modelViewerOpenRef.current) {
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
        if ((overlayOpenRef.current || modelViewerOpenRef.current) && e.code !== "Escape") return;
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
              const artData = hoveredSlotRef.current.userData.artData;
              if (artData.slotType === "model3d" && artData.modelUrl) {
                // Open 3D product viewer
                setModelViewerData({
                  modelUrl: artData.modelUrl,
                  data: { ...artData },
                });
              } else {
                // Open art overlay
                setOverlayData({ ...artData });
              }
            }
            break;
          case "Escape":
            setOverlayData(null);
            setModelViewerData(null);
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

      /* ── Collision & floor stick ── */
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

          if (!overlayOpenRef.current && !modelViewerOpenRef.current) {
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

        // Rotate product models slowly
        Object.values(productSlots).forEach((mesh) => {
          if (mesh.userData.rotationGroup) {
            mesh.userData.rotationGroup.rotation.y += delta * 0.3;
          }
        });

        /* ── Live Visitor Presence Loop ── */
        if (socketRef.current && socketRef.current.connected) {
          const now = Date.now();
          // Broadcast local position at 10Hz to save bandwidth
          if (now - lastBroadcastRef.current > 100) {
            socketRef.current.emit("position-update", {
              position: {
                x: playerRig.position.x,
                y: playerRig.position.y,
                z: playerRig.position.z,
              },
              rotation: camera.rotation.y + playerRig.rotation.y,
            });
            lastBroadcastRef.current = now;
            setPlayerPos({ x: playerRig.position.x, z: playerRig.position.z });
          }

          // Lerp other visitors and enforce culling
          const visitorsArr = Array.from(otherVisitorsMap.current.values());

          // Sort by distance (closest first)
          visitorsArr.sort((a, b) => {
            const distA = playerRig.position.distanceToSquared(a.targetPos);
            const distB = playerRig.position.distanceToSquared(b.targetPos);
            return distA - distB;
          });

          visitorsArr.forEach((v, idx) => {
            // Cull: Only show nearest 20 visitors and respect toggle
            if (idx < 20 && showVisitorsRef.current) {
              if (!v.mesh.parent) scene.add(v.mesh);
              // Smoothly interpolate position for 10hz updates -> 60fps render
              v.mesh.position.lerp(v.targetPos, 0.15);
            } else {
              if (v.mesh.parent) v.mesh.parent.remove(v.mesh);
            }
          });
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

    /* ── Socket.io Connection & Events ── */
    // Use VITE_API_URL or fallback to localhost:5000 in dev
    const SOCKET_URL = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace("/api", "")
      : "http://localhost:5000";

    const socket = io(SOCKET_URL, { withCredentials: true });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-exhibition", {
        exhibitionId: id,
        userId: user?._id || socket.id,
        name: user?.name || "Anonymous",
      });
    });

    socket.on("visitor-count", (count) => {
      setVisitorCount(count);
    });

    socket.on("current-visitors", (currentVisitors) => {
      currentVisitors.forEach((v) => addVisitor(v));
      updateVisitorsState();
    });

    socket.on("visitor-joined", (visitor) => {
      addVisitor(visitor);
      updateVisitorsState();
    });

    socket.on("visitor-left", ({ socketId }) => {
      removeVisitor(socketId);
      updateVisitorsState();
    });

    socket.on("visitor-moved", ({ socketId, position, rotation }) => {
      const v = otherVisitorsMap.current.get(socketId);
      if (v) {
        v.targetPos.copy(position);
        v.targetRot = rotation;
      }
    });

    function addVisitor(v) {
      if (otherVisitorsMap.current.has(v.socketId)) return;
      
      const vcol = visitorColor(v.userId || v.socketId);
      const mesh = createVisitorDot(vcol);
      const label = createVisitorLabel(v.name, vcol);
      
      mesh.position.copy(v.position);
      // Place label about 1.8m high relative to dot
      label.position.set(0, 1.8, 0); 
      mesh.add(label);
      
      // Store in map but don't add to scene yet (will be managed by distance sorting in render loop)
      otherVisitorsMap.current.set(v.socketId, {
        ...v,
        mesh,
        label,
        targetPos: new THREE.Vector3().copy(v.position),
        targetRot: v.rotation,
      });
    }

    function removeVisitor(socketId) {
      const v = otherVisitorsMap.current.get(socketId);
      if (v) {
        if (v.mesh.parent) v.mesh.parent.remove(v.mesh);
        otherVisitorsMap.current.delete(socketId);
      }
    }

    function updateVisitorsState() {
      // Create a plain array for the React minimap state
      setVisitors(Array.from(otherVisitorsMap.current.values()).map(v => ({
        socketId: v.socketId,
        name: v.name,
        position: v.targetPos,
      })));
    }

    return () => {
      if (renderer) {
        renderer.setAnimationLoop(null);
        renderer.dispose();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      document.exitPointerLock();
      cleanupFns.forEach((fn) => fn());
    };
  }, [id]);

  const handleLike = useCallback(async () => {
    const currentData = overlayData || modelViewerData?.data;
    if (!currentData || liking) return;
    setLiking(true);
    try {
      const { data } = await api.post(
        `/exhibitions/${id}/slots/${currentData.slotName}/like`,
      );
      if (overlayData) {
        setOverlayData((prev) => ({ ...prev, likes: data.likes }));
      }
      if (modelViewerData) {
        setModelViewerData((prev) => ({
          ...prev,
          data: { ...prev.data, likes: data.likes },
        }));
      }
      if (hoveredSlotRef.current?.userData?.artData) {
        hoveredSlotRef.current.userData.artData.likes = data.likes;
      }
    } catch (err) {
      console.error("Like failed:", err);
    } finally {
      setLiking(false);
    }
  }, [overlayData, modelViewerData, id, liking]);

  const handleBuy = useCallback(() => {
    const currentData = overlayData || modelViewerData?.data;
    if (!currentData) return;
    const params = new URLSearchParams({
      title: currentData.title || "",
      artist: currentData.artist || "",
      price: currentData.price || 0,
    });
    // Pass the image URL for checkout page display
    if (currentData.imageUrl) params.set("image", currentData.imageUrl);
    navigate(`/checkout?${params.toString()}`);
  }, [overlayData, modelViewerData, navigate]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
      }}
    >
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
          className="ch-ring"
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
          id="vr-hint-text"
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
          opacity: (overlayData || modelViewerData) ? 0 : 1,
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

      {overlayData && (
        <ArtOverlay
          data={overlayData}
          onClose={() => setOverlayData(null)}
          onLike={handleLike}
          onBuy={handleBuy}
          liking={liking}
        />
      )}

      {modelViewerData && (
        <Model3DViewer
          modelUrl={modelViewerData.modelUrl}
          data={modelViewerData.data}
          exhibitionId={id}
          onClose={() => setModelViewerData(null)}
          onLike={handleLike}
          onBuy={handleBuy}
          liking={liking}
        />
      )}

      {/* Live Visitors Minimap */}
      <Minimap
        visitors={visitors}
        playerPos={playerPos}
        visitorCount={visitorCount}
        visible={showVisitors}
        onToggle={() => {
          setShowVisitors((prev) => {
            showVisitorsRef.current = !prev;
            return !prev;
          });
        }}
      />
    </div>
  );
}

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
            }}
          >
            ✕
          </button>
        </div>

        {/* Image area */}
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
            ].map(([label, val], i) => (
              <div
                key={label}
                style={{
                  flex: 1,
                  padding: "0.85rem 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.3rem",
                  borderRight: i < 2 ? "1px solid rgba(26,21,16,0.08)" : "none",
                  paddingLeft: i > 0 ? "1rem" : 0,
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
            >
              Buy Now →
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
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes panelIn { from { opacity:0; transform:translateY(24px) scale(0.97) } to { opacity:1; transform:translateY(0) scale(1) } }
        #vr-crosshair.on-art .ch-ring { transform:translate(-50%,-50%) scale(1.5) !important; border-color:#c4a265 !important; }
      `}</style>
    </div>
  );
}
