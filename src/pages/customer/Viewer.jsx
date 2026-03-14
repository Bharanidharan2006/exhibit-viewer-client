import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { VRButton } from "three/examples/jsm/webxr/VRButton.js";
import { io } from "socket.io-client";
import api from "../../api.js";
import GALLERY_TEMPLATES from "../../galleryTemplates.js";
import Model3DViewer from "../../components/Model3DViewer.jsx";
import ShopkeeperChat from "../../components/ShopkeeperChat.jsx";
import Minimap from "../../components/Minimap.jsx";
import {
  createVisitorLabel,
  createVisitorDot,
  visitorColor,
} from "../../components/VisitorLabel.js";
import { useAuth } from "../../context/AuthContext.jsx";

export default function Viewer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const { user } = useAuth();

  const [overlayData, setOverlayData] = useState(null);
  const [modelViewerData, setModelViewerData] = useState(null);
  const [liking, setLiking] = useState(false);
  const [exhibitionName, setExhibitionName] = useState("");
  const [shopkeeperNearby, setShopkeeperNearby] = useState(false);
  const [shopkeeperDismissed, setShopkeeperDismissed] = useState(false);
  const shopkeeperDismissedRef = useRef(false);
  const shopkeeperChatOpenRef = useRef(false);

  // Socket state
  const [visitors, setVisitors] = useState([]);
  const [visitorCount, setVisitorCount] = useState(1);
  const [showVisitors, setShowVisitors] = useState(true);
  const showVisitorsRef = useRef(true);
  const [playerPos, setPlayerPos] = useState({ x: 0, z: 0 });
  const otherVisitorsMap = useRef(new Map());
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

  // Sync shopkeeper chat ref — but we also set it directly in handlers
  // for immediate effect before React re-renders
  useEffect(() => {
    const isOpen = shopkeeperNearby && !shopkeeperDismissed;
    shopkeeperChatOpenRef.current = isOpen;
    if (isOpen) document.exitPointerLock();
  }, [shopkeeperNearby, shopkeeperDismissed]);

  useEffect(() => {
    return () => {
      window.__shopkeeperModel = null;
    };
  }, []);

  useEffect(() => {
    let renderer;
    const cleanupFns = [];

    async function init() {
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

      window.__playerRig = null;

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
      renderer.toneMappingExposure = 1.8;
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
      scene.add(new THREE.AmbientLight(0xffffff, 0.8));
      scene.add(new THREE.HemisphereLight(0xffffff, 0xdddddd, 1));

      const dirLight = new THREE.DirectionalLight(0xffffff, 1);
      dirLight.position.set(8, 14, 6);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.set(2048, 2048);
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 80;
      dirLight.shadow.camera.left = dirLight.shadow.camera.bottom = -30;
      dirLight.shadow.camera.right = dirLight.shadow.camera.top = 30;
      dirLight.shadow.bias = -0.001;
      scene.add(dirLight);

      const fillLight = new THREE.DirectionalLight(0xffffff, 1.2);
      fillLight.position.set(-8, 10, -8);
      scene.add(fillLight);

      const frontLight = new THREE.DirectionalLight(0xffffff, 0.8);
      frontLight.position.set(0, 6, 10);
      scene.add(frontLight);

      /* ── Collections ── */
      const colliders = [];
      const slots = {};
      const productSlots = {};
      let keeperSlot = null;

      /* ── Floor detection ── */
      function findFloorY(meshes) {
        const box = new THREE.Box3();
        meshes.forEach((m) => box.expandByObject(m));
        const center = new THREE.Vector3();
        box.getCenter(center);
        const roomHeight = box.max.y - box.min.y;
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
        console.warn("Floor ray missed — using bounding box min Y as fallback");
        return box.min.y;
      }

      /* ── Spawn position ── */
      function computeSpawnXZ(meshes) {
        const box = new THREE.Box3();
        meshes.forEach((m) => box.expandByObject(m));
        const center = new THREE.Vector3();
        box.getCenter(center);
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
          } else if (child.name === "SLOT_KEEPER") {
            keeperSlot = child;
            child.material = new THREE.MeshStandardMaterial({
              color: 0x000000,
              transparent: true,
              opacity: 0,
              depthWrite: false,
            });
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
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = new THREE.Vector3();
          box.getSize(size);
          PLAYER_SPEED = Math.max(1.2, Math.min(size.x * 0.065, 4.0));
        }

        // Load image slots
        exhibition.slots.forEach((slotData) => {
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

          // Load 3D product slots
          const productMesh = productSlots[slotData.slotName];
          if (productMesh) {
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

            if (slotData.modelUrl) {
              const productLoader = new GLTFLoader();
              productLoader.load(slotData.modelUrl, (productGltf) => {
                const productModel = productGltf.scene;

                productMesh.updateMatrixWorld(true);
                const pedestalBox = new THREE.Box3().setFromObject(productMesh);
                const pedestalCenter = new THREE.Vector3();
                pedestalBox.getCenter(pedestalCenter);
                const pedestalSize = new THREE.Vector3();
                pedestalBox.getSize(pedestalSize);

                const productBox = new THREE.Box3().setFromObject(productModel);
                const productSize = new THREE.Vector3();
                productBox.getSize(productSize);
                const maxProductDim = Math.max(
                  productSize.x,
                  productSize.y,
                  productSize.z,
                );
                const maxPedestalDim =
                  Math.max(pedestalSize.x, pedestalSize.z) * 0.8;
                const scale = maxPedestalDim / maxProductDim;
                productModel.scale.setScalar(scale);

                productBox.setFromObject(productModel);
                const productCenter = new THREE.Vector3();
                productBox.getCenter(productCenter);

                productModel.traverse((child) => {
                  if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                  }
                });

                const rotationGroup = new THREE.Group();
                rotationGroup.position.set(
                  pedestalCenter.x,
                  pedestalCenter.y,
                  pedestalCenter.z,
                );
                productModel.position.set(
                  -productCenter.x,
                  -productCenter.y,
                  -productCenter.z,
                );
                rotationGroup.add(productModel);
                scene.add(rotationGroup);
                productMesh.userData.rotationGroup = rotationGroup;
              });
            }
          }
        });

        /* ── Load AI Shopkeeper ── */
        if (exhibition.aiShopkeeper?.enabled && keeperSlot) {
          keeperSlot.updateMatrixWorld(true);
          const keeperBox = new THREE.Box3().setFromObject(keeperSlot);
          const keeperCenter = new THREE.Vector3();
          keeperBox.getCenter(keeperCenter);
          const keeperFloorY = keeperBox.min.y;

          const shopkeeperLoader = new GLTFLoader();
          const shopkeeperUrl =
            (import.meta.env.VITE_API_URL
              ? import.meta.env.VITE_API_URL.replace("/api", "")
              : "http://localhost:5000") + "/public/shopkeeper.glb";

          shopkeeperLoader.load(
            shopkeeperUrl,
            (shopGltf) => {
              const shopModel = shopGltf.scene;
              const shopBox = new THREE.Box3().setFromObject(shopModel);
              const shopSize = new THREE.Vector3();
              shopBox.getSize(shopSize);
              const shopScale = 1.7 / shopSize.y;
              shopModel.scale.setScalar(shopScale);
              shopBox.setFromObject(shopModel);
              const bottomOffset = shopBox.min.y;
              shopModel.position.set(
                keeperCenter.x - (shopBox.min.x + shopBox.max.x) / 2,
                keeperFloorY - bottomOffset,
                keeperCenter.z - (shopBox.min.z + shopBox.max.z) / 2,
              );
              shopModel.traverse((child) => {
                if (child.isMesh) {
                  child.castShadow = true;
                  child.receiveShadow = true;
                  child.userData.interactive = true;
                  child.userData.isShopkeeper = true;
                }
              });
              scene.add(shopModel);
              window.__shopkeeperModel = shopModel;
              console.log(
                `✓ Shopkeeper placed at (${keeperCenter.x.toFixed(2)}, ${keeperFloorY.toFixed(2)}, ${keeperCenter.z.toFixed(2)})`,
              );
            },
            undefined,
            (err) => console.warn("Could not load shopkeeper model:", err),
          );
        } else if (exhibition.aiShopkeeper?.enabled && !keeperSlot) {
          console.warn(
            "AI Shopkeeper enabled but no SLOT_KEEPER mesh found in gallery model",
          );
        }
      });

      /* ── Crosshair raycaster ── */
      const centerRay = new THREE.Raycaster();
      const CENTER = new THREE.Vector2(0, 0);
      let showingHint = false;

      function updateCrosshair() {
        if (!pointerLocked) return;
        centerRay.setFromCamera(CENTER, camera);

        const artMeshList = Object.values(slots).filter(
          (m) => m.userData.artData,
        );
        const productMeshList = Object.values(productSlots).filter(
          (m) => m.userData.artData,
        );
        const interactiveMeshes = [...artMeshList, ...productMeshList];

        if (window.__shopkeeperModel) {
          window.__shopkeeperModel.traverse((child) => {
            if (child.isMesh && child.userData.interactive)
              interactiveMeshes.push(child);
          });
        }

        const hits = centerRay.intersectObjects(interactiveMeshes);
        const crosshair = document.getElementById("vr-crosshair");
        const hint = document.getElementById("vr-hint");
        const hintText = document.getElementById("vr-hint-text");

        if (hits.length > 0 && hits[0].distance < 8) {
          const obj = hits[0].object;
          hoveredSlotRef.current = obj;
          if (crosshair) crosshair.classList.add("on-art");
          if (hintText) {
            if (obj.userData.isShopkeeper)
              hintText.textContent = "Talk to Shopkeeper";
            else if (obj.userData.isProductSlot)
              hintText.textContent = "View 3D product";
            else hintText.textContent = "Inspect artwork";
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
        if (
          overlayOpenRef.current ||
          modelViewerOpenRef.current ||
          shopkeeperChatOpenRef.current
        )
          return;

        if (pointerLocked && hoveredSlotRef.current) {
          const obj = hoveredSlotRef.current;
          if (obj.userData.isShopkeeper) {
            // FIX: set ref immediately — don't wait for useEffect
            shopkeeperChatOpenRef.current = true;
            setShopkeeperNearby(true);
            setShopkeeperDismissed(false);
            shopkeeperDismissedRef.current = false;
            return;
          } else if (obj.userData.artData) {
            const artData = obj.userData.artData;
            if (artData.slotType === "model3d" && artData.modelUrl) {
              setModelViewerData({
                modelUrl: artData.modelUrl,
                data: { ...artData },
              });
            } else {
              setOverlayData({ ...artData });
            }
            return;
          }
        }
        canvasRef.current.requestPointerLock();
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
        if (
          (overlayOpenRef.current ||
            modelViewerOpenRef.current ||
            shopkeeperChatOpenRef.current) &&
          e.code !== "Escape"
        )
          return;
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
            if (hoveredSlotRef.current) {
              const obj = hoveredSlotRef.current;
              if (obj.userData.isShopkeeper) {
                console.log("⌨️ E key on Shopkeeper → opening chat");
                // FIX: set ref immediately — don't wait for useEffect
                shopkeeperChatOpenRef.current = true;
                setShopkeeperNearby(true);
                setShopkeeperDismissed(false);
                shopkeeperDismissedRef.current = false;
              } else if (obj.userData.artData) {
                const artData = obj.userData.artData;
                if (artData.slotType === "model3d" && artData.modelUrl) {
                  setModelViewerData({
                    modelUrl: artData.modelUrl,
                    data: { ...artData },
                  });
                } else {
                  setOverlayData({ ...artData });
                }
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

          if (
            !overlayOpenRef.current &&
            !modelViewerOpenRef.current &&
            !shopkeeperChatOpenRef.current
          ) {
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

        // Rotate product models
        Object.values(productSlots).forEach((mesh) => {
          if (mesh.userData.rotationGroup) {
            mesh.userData.rotationGroup.rotation.y += delta * 0.3;
          }
        });

        /* ── Live visitor presence ── */
        if (socketRef.current?.connected) {
          const now = Date.now();
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

          const visitorsArr = Array.from(otherVisitorsMap.current.values());
          visitorsArr.sort(
            (a, b) =>
              playerRig.position.distanceToSquared(a.targetPos) -
              playerRig.position.distanceToSquared(b.targetPos),
          );
          visitorsArr.forEach((v, idx) => {
            if (idx < 20 && showVisitorsRef.current) {
              if (!v.mesh.parent) scene.add(v.mesh);
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

    /* ── Socket.io ── */
    const SOCKET_URL = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace("/api", "")
      : undefined; // undefined makes socket.io connect to the current host (relies on Vite proxy during dev)

    const socket = io(SOCKET_URL, {
      withCredentials: true,
      extraHeaders: {
        "ngrok-skip-browser-warning": "true",
      },
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-exhibition", {
        exhibitionId: id,
        userId: user?._id || socket.id,
        name: user?.name || "Anonymous",
      });
    });

    socket.on("visitor-count", (count) => setVisitorCount(count));
    socket.on("current-visitors", (currentVisitors) => {
      currentVisitors.forEach(addVisitor);
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
      label.position.set(0, 1.8, 0);
      mesh.add(label);
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
      setVisitors(
        Array.from(otherVisitorsMap.current.values()).map((v) => ({
          socketId: v.socketId,
          name: v.name,
          position: v.targetPos,
        })),
      );
    }

    return () => {
      if (renderer) {
        renderer.setAnimationLoop(null);
        renderer.dispose();
      }
      if (socketRef.current) socketRef.current.disconnect();
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
      if (overlayData)
        setOverlayData((prev) => ({ ...prev, likes: data.likes }));
      if (modelViewerData)
        setModelViewerData((prev) => ({
          ...prev,
          data: { ...prev.data, likes: data.likes },
        }));
      if (hoveredSlotRef.current?.userData?.artData)
        hoveredSlotRef.current.userData.artData.likes = data.likes;
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
          opacity: overlayData || modelViewerData ? 0 : 1,
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
          ["E", "Interact"],
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

      {/* Art overlay */}
      {overlayData && (
        <ArtOverlay
          data={overlayData}
          onClose={() => setOverlayData(null)}
          onLike={handleLike}
          onBuy={handleBuy}
          liking={liking}
        />
      )}

      {/* 3D model viewer */}
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

      {/* ── FIX: ShopkeeperChat is here in Viewer, NOT inside ArtOverlay ── */}
      <ShopkeeperChat
        exhibitionId={id}
        visible={shopkeeperNearby && !shopkeeperDismissed}
        onClose={() => {
          shopkeeperChatOpenRef.current = false;
          setShopkeeperNearby(false);
          setShopkeeperDismissed(true);
          shopkeeperDismissedRef.current = true;
        }}
      />

      {/* Minimap */}
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

      <style>{`
        @keyframes fadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes panelIn { from { opacity:0; transform:translateY(24px) scale(0.97) } to { opacity:1; transform:translateY(0) scale(1) } }
        #vr-crosshair.on-art .ch-ring { transform:translate(-50%,-50%) scale(1.5) !important; border-color:#c4a265 !important; }
      `}</style>
    </div>
  );
}

/* ── Art Overlay ── */
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
    </div>
  );
}
