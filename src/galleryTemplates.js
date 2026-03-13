// Add new templates here as you create more gallery GLB files.
// slotCount must match the number of SLOT_ meshes in the GLB (flat artwork surfaces).
// productSlotCount must match the number of SLOT_P_ meshes in the GLB (3D product pedestals).
//
// Blender naming convention:
//   SLOT_1, SLOT_2, ...     → flat artwork display surfaces (interactive, loaded with images)
//   SLOT_P_1, SLOT_P_2, ... → 3D product pedestals (interactive, loaded with GLB models)
//   All other meshes        → automatically become colliders (walls, floors, etc.)
const GALLERY_TEMPLATES = [
  {
    id: "gallery_v1",
    name: "Classic White Gallery",
    description:
      "A clean, minimalist space with 1 display surface across two wings.",
    glbFile: "/models/gallery2.glb", // served from client/public/models/
    previewImage: "/models/gallery2-preview.webp", // add a screenshot of the model here
    slotCount: 1,
    productSlotCount: 0,
    price: 999,
    flipY: false,
  },
  {
    id: "gallery_v2",
    name: "Industrial Loft",
    glbFile: "/models/gallery1.glb",
    description:
      "A clean, minimalist space with 1 display surface across two wings.",
    previewImage: "/models/gallery2-preview.webp", // add a screenshot of the model here
    slotCount: 1,
    productSlotCount: 1,
    price: 999,
    flipY: false,
  },
];

export default GALLERY_TEMPLATES;

