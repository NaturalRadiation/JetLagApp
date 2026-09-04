// Voronoi helpers for POI matching. the seeker's cell over a category's points
// is exactly "everywhere whose nearest instance is the seeker's". turf.voronoi
// (~60 ms) and each boundary clip (~50 ms) are cached: the tessellation per FC,
// each clipped cell per point index / per station-name length.
import * as turf from "@turf/turf";
import { intersect, unionAll } from "./turfHelpers.js";

const _bbox = new WeakMap(); // FC -> [minX,minY,maxX,maxY]
const _tess = new WeakMap(); // pointFC -> { pts: Feature[], cells: (Feature|null)[] }
const _cellByIdx = new WeakMap(); // pointFC -> Map<number, Feature|null>   (clipped)
const _regionByLen = new WeakMap(); // pointFC -> Map<number, Feature|null> (clipped)

export function bboxOf(feature) {
  let b = _bbox.get(feature);
  if (!b) {
    b = turf.bbox(feature);
    _bbox.set(feature, b);
  }
  return b;
}

function tessellate(pointFC, bbox) {
  let hit = _tess.get(pointFC);
  if (hit) return hit;
  const pts = (pointFC?.features || []).filter((f) => f.geometry?.type === "Point");
  let cells = [];
  if (pts.length >= 2) {
    try {
      cells = turf.voronoi(turf.featureCollection(pts), { bbox }).features;
    } catch (err) {
      console.error("[voronoi] tessellation failed", err);
      cells = [];
    }
  }
  hit = { pts, cells };
  _tess.set(pointFC, hit);
  return hit;
}

function nearestIndex(pts, point) {
  let idx = -1;
  let best = Infinity;
  for (let i = 0; i < pts.length; i += 1) {
    const [lng, lat] = pts[i].geometry.coordinates;
    // squared degrees — fine for "which is closest" at city scale
    const d = (lng - point.lng) ** 2 + (lat - point.lat) ** 2;
    if (d < best) {
      best = d;
      idx = i;
    }
  }
  return idx;
}

// the seeker's Voronoi cell for a POI category, clipped to `boundary`
export function poiVoronoiCell(pointFC, boundary, seeker) {
  if (!pointFC || !boundary) return null;
  const { pts, cells } = tessellate(pointFC, bboxOf(boundary));
  if (pts.length < 2 || cells.length !== pts.length) return null;

  const idx = nearestIndex(pts, seeker);
  if (idx < 0) return null;
  const label = pts[idx].properties?.name || "(unnamed)";

  let cache = _cellByIdx.get(pointFC);
  if (!cache) {
    cache = new Map();
    _cellByIdx.set(pointFC, cache);
  }
  if (!cache.has(idx)) {
    cache.set(idx, cells[idx] ? intersect(cells[idx], boundary) : null);
  }
  return { cell: cache.get(idx), label };
}

// match on the character count of the seeker's nearest station's name — the
// union of the cells of every station whose name is that same length
export function stationNameLengthCell(stationFC, boundary, seeker, lengthOf) {
  if (!stationFC || !boundary) return null;
  const { pts, cells } = tessellate(stationFC, bboxOf(boundary));
  if (pts.length < 2 || cells.length !== pts.length) return null;

  const idx = nearestIndex(pts, seeker);
  if (idx < 0) return null;
  const len = lengthOf(pts[idx].properties?.name || "");

  let cache = _regionByLen.get(stationFC);
  if (!cache) {
    cache = new Map();
    _regionByLen.set(stationFC, cache);
  }
  if (!cache.has(len)) {
    const group = [];
    for (let i = 0; i < pts.length; i += 1) {
      if (cells[i] && lengthOf(pts[i].properties?.name || "") === len) group.push(cells[i]);
    }
    const merged = unionAll(group);
    cache.set(len, merged ? intersect(merged, boundary) : null);
  }
  return { cell: cache.get(len), label: `${len}-character name` };
}
