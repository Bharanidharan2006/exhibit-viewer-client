// Add new templates here as you create more gallery GLB files.
// slotCount must match the number of SLOT_ meshes in the GLB.
const GALLERY_TEMPLATES = [
  {
    id: "gallery_v1",
    name: "Classic White Gallery",
    description:
      "A clean, minimalist space with 1 display surface across two wings.",
    glbFile: "/models/gallery2.glb", // served from client/public/models/
    previewImage: "/models/gallery2-preview.webp", // add a screenshot of the model here
    slotCount: 1,
    price: 999,
  },
  // Add more templates here:
  // {
  //   id: "gallery_v2",
  //   name: "Industrial Loft",
  //   glbFile: "/models/gallery3.glb",
  //   slotCount: 6,
  //   price: 799,
  // },
];

export default GALLERY_TEMPLATES;
