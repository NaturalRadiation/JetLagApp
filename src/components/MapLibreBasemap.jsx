// Protomaps vector basemap via MapLibre GL, mounted as one non-interactive
// Leaflet layer so the react-leaflet overlays keep working. the plugin's canvas
// goes in tilePane (below overlayPane), so the mask, borough lines and markers
// render on top. loaded lazily by MapView after it confirms the .pmtiles archive
// is reachable; if the GL context still errors, onUnavailable falls back to raster.
import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import * as maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import "@maplibre/maplibre-gl-leaflet";
import { buildMapLibreStyle } from "../lib/basemap.js";

let protocolRegistered = false;
function ensurePmtilesProtocol() {
  if (protocolRegistered) return;
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  protocolRegistered = true;
}

let workerUrlSet = false;
function ensureWorkerUrl() {
  if (workerUrlSet || typeof maplibregl.setWorkerUrl !== "function") return;
  // maplibre-gl 6 otherwise resolves its worker next to the bundled chunk, where
  // Vite never emits it — the maplibre-worker-vendor plugin in vite.config.js
  // drops it at /vendor/ instead.
  maplibregl.setWorkerUrl(new URL("vendor/maplibre-gl-worker.mjs", document.baseURI).href);
  workerUrlSet = true;
}

export default function MapLibreBasemap({ flavor = "light", onUnavailable }) {
  const map = useMap();

  useEffect(() => {
    ensurePmtilesProtocol();
    ensureWorkerUrl();

    let layer = null;
    let disposed = false;

    // the leaflet glue syncs the GL view on user move/zoom, but a layer added
    // after the map's initial fitBounds is left blank and at a stale zoom, and
    // maplibre-gl 6's render loop doesn't recover on its own here. push leaflet's
    // live view in (GL uses 512px tiles, hence zoom - 1) and force a synchronous
    // redraw.
    const sync = () => {
      try {
        const gl = layer?.getMaplibreMap();
        if (!gl) return;
        const c = map.getCenter();
        gl.resize();
        gl.jumpTo({ center: [c.lng, c.lat], zoom: map.getZoom() - 1 });
        gl.redraw();
      } catch {
        /* map torn down */
      }
    };

    try {
      layer = L.maplibreGL({
        style: buildMapLibreStyle(flavor),
        interactive: false,
        attributionControl: false,
      });
      layer.addTo(map);

      map.on("moveend", sync);
      map.on("zoomend", sync);

      const gl = layer.getMaplibreMap();

      // the leaflet glue leaves a layer added after the map's fitBounds blank and
      // maplibre-gl 6 doesn't self-recover, so kick a redraw every 120ms over the
      // first ~2.5s. redraw() is synchronous and cheap once a frame holds.
      let ticks = 0;
      const kick = () => {
        if (disposed || ticks++ > 20) return;
        sync();
        setTimeout(kick, 120);
      };
      kick();

      gl?.on("error", (e) => {
        const msg = e?.error?.message || "";
        if (/pmtiles|\.pmtiles|archive|tile/i.test(msg)) {
          console.warn("[basemap] vector archive error — falling back:", msg);
          onUnavailable?.();
        }
      });
    } catch (err) {
      console.warn("[basemap] MapLibre init failed — falling back:", err);
      onUnavailable?.();
    }

    return () => {
      disposed = true;
      map.off("moveend", sync);
      map.off("zoomend", sync);
      if (layer) {
        try {
          layer.remove();
        } catch {
          /* map already torn down */
        }
      }
    };
  }, [map, flavor, onUnavailable]);

  return null;
}
