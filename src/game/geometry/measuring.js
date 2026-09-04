// measuring — "compared to me, are you closer to or further from [category]?"
// R = the seeker's distance to their own nearest instance; reach = everywhere
// within R of any instance; closer intersects, further subtracts.
// stations / airports / POIs are point sets. water / coastline are thousands of
// fragments, so we grid-sample their vertices and build reach from a distance-
// field grid + isoband (buffering them or unioning huge circles froze the app).
// borough / ward borders buffer the boundary lines only.
// the live preview uses only measuringDistance (R + nearest point, no buffering);
// reach is computed once on submit and cached per (category, rounded-up R).
import * as turf from "@turf/turf";
import { intersect, difference, unionAll, toPosition } from "./turfHelpers.js";
import { LONDON_AIRPORTS } from "./matching.js";

const POINT_STEPS = 12;
const R_INFLATE_POINT = 1 / Math.cos(Math.PI / POINT_STEPS) + 0.02; // ~1.06
const R_INFLATE_LINE = 1.03;

export const MEASURING_POI_KEYS = [
  "museums",
  "libraries",
  "cinemas",
  "hospitals",
  "parks",
  "golf",
  "consulates",
];

const _points = new WeakMap(); // point FC -> [[lng,lat], ...]
const _grid = new WeakMap(); // FC -> Map<gridKm, [[lng,lat],...]>
const _borderMLS = new WeakMap(); // polygon FC -> Feature<MultiLineString>
const _reach = new Map(); // `${cat}|${rKm}` -> Feature|null

// --- geometry prep, all cached ---

function pointCoords(fc) {
  if (!fc) return [];
  let c = _points.get(fc);
  if (!c) {
    c = (fc.features || [])
      .filter((f) => f.geometry?.type === "Point")
      .map((f) => f.geometry.coordinates);
    _points.set(fc, c);
  }
  return c;
}

// every vertex of `fc`, snapped to a `gridKm` grid and de-duplicated
function gridSample(fc, gridKm) {
  if (!fc) return [];
  let byGrid = _grid.get(fc);
  if (!byGrid) {
    byGrid = new Map();
    _grid.set(fc, byGrid);
  }
  let pts = byGrid.get(gridKm);
  if (pts) return pts;
  const g = gridKm / 111; // ° per km, near enough at London's latitude
  const seen = new Set();
  pts = [];
  for (const f of fc.features || []) {
    turf.coordEach(f, (c) => {
      const k = `${Math.round(c[0] / g)}:${Math.round(c[1] / g)}`;
      if (!seen.has(k)) {
        seen.add(k);
        pts.push(c);
      }
    });
  }
  byGrid.set(gridKm, pts);
  return pts;
}

// every ring of a polygon layer as one simplified MultiLineString (its borders)
function borderMLS(polygonFC, toleranceDeg) {
  if (!polygonFC) return null;
  let hit = _borderMLS.get(polygonFC);
  if (hit !== undefined) return hit;
  const parts = [];
  for (const f of polygonFC.features) {
    try {
      turf.flattenEach(turf.polygonToLine(f), (ln) => {
        if (ln.geometry?.type !== "LineString") return;
        const s = turf.simplify(ln, { tolerance: toleranceDeg, highQuality: false });
        if (s.geometry.coordinates.length >= 2) parts.push(s.geometry.coordinates);
      });
    } catch {
      /* skip */
    }
  }
  hit = parts.length ? turf.multiLineString(parts) : null;
  _borderMLS.set(polygonFC, hit);
  return hit;
}

// --- what geometry a category resolves to ---

function resolve(ctx, cat) {
  if (cat === "stations") {
    const p = pointCoords(ctx?.stations);
    return p.length ? { kind: "point", pts: p } : { kind: "none" };
  }
  if (cat === "airports") return { kind: "point", pts: LONDON_AIRPORTS.map((a) => a.coord) };
  if (MEASURING_POI_KEYS.includes(cat)) {
    const p = pointCoords(ctx?.pois?.[cat]);
    return p.length ? { kind: "point", pts: p } : { kind: "none" };
  }
  if (cat === "water") {
    const p = gridSample(ctx?.water, 0.5);
    return p.length ? { kind: "grid", pts: p, gridKm: 0.5 } : { kind: "none" };
  }
  if (cat === "coastline") {
    const p = gridSample(ctx?.coastline, 2);
    return p.length ? { kind: "grid", pts: p, gridKm: 2.5 } : { kind: "none" };
  }
  if (cat === "borough-borders") {
    const mls = borderMLS(ctx?.boroughs, 0.0012);
    return mls ? { kind: "line", mls } : { kind: "none" };
  }
  if (cat === "ward-borders") {
    const mls = borderMLS(ctx?.wards, 0.0025); // ~250 m, coarse — borders are everywhere anyway
    return mls ? { kind: "line", mls } : { kind: "none" };
  }
  return { kind: "none" };
}

// --- distance: cheap, no buffering ---

function nearestPointCoord(seeker, pts) {
  let best = null;
  let bd = Infinity;
  for (const c of pts) {
    const d = (c[0] - seeker.lng) ** 2 + (c[1] - seeker.lat) ** 2;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

// { rKm, nearest:{lng,lat}|null, unavailable } — drives the form and preview
export function measuringDistance(question, ctx) {
  const cat = question.params?.category;
  const r = resolve(ctx, cat);
  if (r.kind === "none") return { rKm: null, nearest: null, unavailable: "no-data" };

  const seekerPt = turf.point(toPosition(question.askedFrom));

  if (r.kind === "point" || r.kind === "grid") {
    const best = nearestPointCoord(question.askedFrom, r.pts);
    if (!best) return { rKm: null, nearest: null, unavailable: "no-instances" };
    return {
      rKm: turf.distance(seekerPt, best, { units: "kilometers" }),
      nearest: { lng: best[0], lat: best[1] },
    };
  }

  // line (borough / ward borders)
  let bd = Infinity;
  let bc = null;
  turf.flattenEach(r.mls, (ln) => {
    const np = turf.nearestPointOnLine(ln, seekerPt, { units: "kilometers" });
    if (np.properties.dist < bd) {
      bd = np.properties.dist;
      bc = np.geometry.coordinates;
    }
  });
  return bc ? { rKm: bd, nearest: { lng: bc[0], lat: bc[1] } } : { rKm: null, nearest: null };
}

// --- reach: buffered, computed once per question, cached ---

function roundUpR(rKm) {
  const step = rKm < 2 ? 0.05 : rKm < 10 ? 0.5 : 5;
  return Math.max(0.05, Math.ceil(rKm / step) * step);
}

// "within R of a point set" via a distance-field grid + isoband — robust for
// thousands of far-apart samples where a circle union would blow up
function reachViaGrid(pts, rKm, boundary, gridKm) {
  const bbox = turf.bbox(boundary);
  const pad = (rKm + gridKm) / 111;
  const grid = turf.pointGrid(
    [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad],
    gridKm,
    { units: "kilometers" }
  );
  if (!grid.features.length) return null;

  const latMid = (bbox[1] + bbox[3]) / 2;
  const kx = 111.32 * Math.cos((latMid * Math.PI) / 180);
  const ky = 110.57;
  for (const gp of grid.features) {
    const [x, y] = gp.geometry.coordinates;
    let m = Infinity;
    for (const c of pts) {
      const dx = (c[0] - x) * kx;
      const dy = (c[1] - y) * ky;
      const d2 = dx * dx + dy * dy;
      if (d2 < m) m = d2;
    }
    gp.properties.d = Math.sqrt(m);
  }

  const bands = turf.isobands(grid, [0, rKm], { zProperty: "d" });
  return unionAll((bands.features || []).filter((f) => f.geometry));
}

function bufferReach(r, rKm, boundary) {
  if (r.kind === "point") {
    const radius = rKm * R_INFLATE_POINT;
    return unionAll(
      r.pts.map((c) => turf.circle(c, radius, { units: "kilometers", steps: POINT_STEPS }))
    );
  }
  if (r.kind === "grid") {
    const reach = reachViaGrid(r.pts, rKm * R_INFLATE_LINE, boundary, r.gridKm);
    return reach ? intersect(reach, boundary) : null;
  }
  // line (borders) — straight-sided buffer, so few steps needed
  return turf.buffer(r.mls, rKm * R_INFLATE_LINE, { units: "kilometers", steps: 4 });
}

// { rKm, reach } — `reach` is the "within R of the category" region
export function measuringReach(question, ctx) {
  const cat = question.params?.category;
  const r = resolve(ctx, cat);
  if (r.kind === "none") return { rKm: null, reach: null, unavailable: "no-data" };

  const { rKm } = measuringDistance(question, ctx);
  if (rKm == null || !Number.isFinite(rKm)) return { rKm: null, reach: null, unavailable: "no-instances" };

  const rounded = roundUpR(rKm);
  const key = `${cat}|${rounded}`;
  if (_reach.has(key)) return { rKm, reach: _reach.get(key) };

  let reach = null;
  try {
    reach = bufferReach(r, rounded, ctx?.boundary) || null;
  } catch (err) {
    console.error("[measuring] buffer failed", err);
  }
  if (_reach.size > 200) _reach.clear();
  _reach.set(key, reach);
  return { rKm, reach };
}

export function applyMeasuring(region, question, ctx) {
  const { reach } = measuringReach(question, ctx);
  if (!reach) return region;
  if (question.answer === "closer") return intersect(region, reach);
  if (question.answer === "further") return difference(region, reach);
  return region;
}
