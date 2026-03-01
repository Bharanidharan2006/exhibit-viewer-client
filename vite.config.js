import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy API calls to Express
      "/api": { target: "http://localhost:5000", changeOrigin: true },
      // Proxy uploaded images to Express
      "/uploads": { target: "http://localhost:5000", changeOrigin: true },
    },
  },
});
