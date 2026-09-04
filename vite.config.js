import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" -> relative asset URLs, so the same build works at the domain root
// and under /<repo>/ on GitHub Pages without hard-coding the repo name (single
// page, no routing, so relative paths are fine)
export default defineConfig({
  base: "./",
  plugins: [react()],
  // use the port the launcher assigns (PORT env), else 5173
  server: { port: Number(process.env.PORT) || 5173, strictPort: false },
  // let Vite serve maplibre-gl un-prebundled — dodges the "worker.mjs not found" warning
  optimizeDeps: { exclude: ["maplibre-gl"] },
  // maplibre-gl is a large, lazily-loaded chunk
  build: { chunkSizeWarningLimit: 1100 },
});
