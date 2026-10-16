import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Build into client/dist (served by FastAPI). During local dev, proxy /api to :8000.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
