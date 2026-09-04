// primary basemap is Protomaps — one self-hosted london.pmtiles vector archive
// via MapLibre GL, no key, works offline. if the file's missing the map falls
// back to CARTO raster at runtime. override with VITE_PMTILES_URL, or force with
// VITE_BASEMAP=carto|protomaps (default auto).
import { layers, namedFlavor } from "@protomaps/basemaps";

export const BASEMAP_MODE = import.meta.env.VITE_BASEMAP || "auto"; // auto | protomaps | carto

// absolute URL to the vector archive, resolved against the deployed base path
export const PMTILES_URL =
  import.meta.env.VITE_PMTILES_URL ||
  new URL("london.pmtiles", document.baseURI).href;

// glyphs + sprites for the Protomaps flavors — vendor into /public for zero external requests
const BASEMAP_ASSETS = "https://protomaps.github.io/basemaps-assets";

export const PMTILES_ATTRIBUTION =
  '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> &middot; <a href="https://protomaps.com">Protomaps</a>';

export const CARTO_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &middot; &copy; <a href="https://carto.com/attributions">CARTO</a>';

// cheap probe so we don't fetch the MapLibre chunk when london.pmtiles isn't
// there. checks the "PMTiles" magic bytes, which also rejects a dev-server SPA
// fallback that answers 200 with index.html.
export async function pmtilesReachable(url = PMTILES_URL) {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-15" } });
    if (!res.ok && res.status !== 206) return false;
    if ((res.headers.get("content-type") || "").includes("text/html")) return false;

    let head;
    if (res.body?.getReader) {
      const reader = res.body.getReader();
      head = (await reader.read()).value || new Uint8Array();
      reader.cancel();
    } else {
      head = new Uint8Array(await res.arrayBuffer());
    }
    return String.fromCharCode(...head.slice(0, 7)) === "PMTiles";
  } catch {
    return false;
  }
}

// a MapLibre GL style for the London vector archive (flavor: light/dark/grayscale/white/black)
export function buildMapLibreStyle(flavor = "light") {
  return {
    version: 8,
    glyphs: `${BASEMAP_ASSETS}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${BASEMAP_ASSETS}/sprites/v4/${flavor}`,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${PMTILES_URL}`,
        attribution: PMTILES_ATTRIBUTION,
      },
    },
    layers: layers("protomaps", namedFlavor(flavor), { lang: "en" }),
  };
}
