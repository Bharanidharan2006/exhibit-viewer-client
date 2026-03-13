import * as THREE from "three";

/**
 * Creates a floating name label sprite for a visitor.
 * Uses CanvasTexture to render text, auto-billboards in both desktop and VR.
 *
 * @param {string} name - Visitor display name
 * @param {string} color - Hex color for the accent dot (default: gold)
 * @returns {THREE.Sprite}
 */
export function createVisitorLabel(name, color = "#c4a265") {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");

  // Background pill
  ctx.fillStyle = "rgba(10, 8, 5, 0.65)";
  roundRect(ctx, 8, 8, 240, 48, 24);
  ctx.fill();

  // Border
  ctx.strokeStyle = "rgba(196, 162, 101, 0.3)";
  ctx.lineWidth = 1;
  roundRect(ctx, 8, 8, 240, 48, 24);
  ctx.stroke();

  // Colored dot
  ctx.beginPath();
  ctx.arc(36, 32, 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Name text
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.font = "bold 20px 'DM Mono', monospace, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  // Truncate name if too long
  const displayName = name.length > 14 ? name.substring(0, 12) + "…" : name;
  ctx.fillText(displayName, 50, 33);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: true,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.2, 0.3, 1); // wide and short
  sprite.renderOrder = 999; // render on top

  return sprite;
}

/**
 * Creates a simple colored dot mesh to represent a visitor's body
 * @param {string} color
 * @returns {THREE.Mesh}
 */
export function createVisitorDot(color = "#c4a265") {
  const geo = new THREE.SphereGeometry(0.12, 8, 8);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: 0.7,
  });
  return new THREE.Mesh(geo, mat);
}

/**
 * Generates a consistent color from a string (userId/name)
 * @param {string} str
 * @returns {string} hex color
 */
export function visitorColor(str) {
  const colors = [
    "#c4a265", "#7eb8da", "#da7e8c", "#7eda95",
    "#dab87e", "#a27eda", "#7edac4", "#da7ec4",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/** Helper: rounded rect path */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
