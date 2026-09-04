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

export default function MapLibreBasemap({ flavor = "light", onUnavailable }) {
  const map = useMap();

  useEffect(() => {
    ensurePmtilesProtocol();
    let layer = null;
    try {
      layer = L.maplibreGL({
        style: buildMapLibreStyle(flavor),
        interactive: false,
        attributionControl: false,
      });
      layer.addTo(map);
      layer.getMaplibreMap()?.on("error", (e) => {
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
