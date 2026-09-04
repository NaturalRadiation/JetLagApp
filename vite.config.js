import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// maplibre-gl 6 loads its web worker from a sibling "maplibre-gl-worker.mjs" next
// to its own module. Vite bundles maplibre-gl into a hashed chunk and never emits
// that sibling, so in a production build the worker 404s and the vector basemap
// renders blank (just the style's grey background). this serves both worker files
// in dev and copies them verbatim into dist/vendor/ on build; MapLibreBasemap
// points setWorkerUrl there.
function maplibreWorkerVendor() {
  const files = {
    "maplibre-gl-worker.mjs": require.resolve("maplibre-gl/dist/maplibre-gl-worker.mjs"),
    "maplibre-gl-shared.mjs": require.resolve("maplibre-gl/dist/maplibre-gl-shared.mjs"),
  };
  return {
    name: "maplibre-worker-vendor",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split("?")[0].replace(/^.*\/vendor\//, "");
        if (name && files[name]) {
          res.setHeader("Content-Type", "text/javascript");
          res.end(readFileSync(files[name]));
          return;
        }
        next();
      });
    },
    generateBundle() {
      for (const [name, path] of Object.entries(files)) {
        this.emitFile({ type: "asset", fileName: `vendor/${name}`, source: readFileSync(path) });
      }
    },
  };
}

// base: "./" -> relative asset URLs, so the same build works at the domain root
// and under /<repo>/ on GitHub Pages without hard-coding the repo name (single
// page, no routing, so relative paths are fine)
export default defineConfig({
  base: "./",
  plugins: [react(), maplibreWorkerVendor()],
  // use the port the launcher assigns (PORT env), else 5173
  server: { port: Number(process.env.PORT) || 5173, strictPort: false },
  // let Vite serve maplibre-gl un-prebundled — dodges the "worker.mjs not found" warning
  optimizeDeps: { exclude: ["maplibre-gl"] },
  // maplibre-gl is a large, lazily-loaded chunk
  build: { chunkSizeWarningLimit: 1100 },
});
