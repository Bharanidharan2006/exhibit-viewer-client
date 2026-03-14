import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["noninferable-willingly-remy.ngrok-free.dev"],
    // hmr: {
    //   host: "noninferable-willingly-remy.ngrok-free.dev", // 👈 add this
    //   clientPort: 443, // 👈 ngrok uses 443 externally
    //   protocol: "wss", // 👈 ngrok uses wss
    // },

    proxy: {
      // Proxy API calls to Express
      "/api": { target: "http://localhost:5000", changeOrigin: true },
      // Proxy uploaded images to Express
      "/uploads": { target: "http://localhost:5000", changeOrigin: true },
      // Proxy public assets
      "/public": { target: "http://localhost:5000", changeOrigin: true },
      // Proxy websocket for socket.io
      "/socket.io": {
        target: "http://localhost:5000",
        ws: true,
      },
    },
  },
});
