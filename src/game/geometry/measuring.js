// measuring — "compared to me, are you closer to or further from [category]?"
// R = the seeker's distance to their own nearest instance; reach = everywhere
// within R of any instance; closer intersects, further subtracts. R is used
// exactly (not rounded) so the closer/further boundary runs through the seeker.
// stations / airports / POIs are point sets. water / coastline are thousands of
// fragments, so we grid-sample their vertices and build reach from a distance-
// field grid + isoband (buffering them or unioning huge circles froze the app).
// borough / ward borders buffer the boundary lines only.
// the live preview uses only measuringDistance (R + nearest point, no buffering);
// reach is computed once on submit and cached per (category, R to the metre).
import * as turf from "@turf/turf";
import { intersect, difference, unionAll, toPosition } from "./turfHelpers.js";
import { LONDON_AIRPORTS } from "./matching.js";

// polygon-circle facets for point-set reach: many for sparse sets (few circles,
// a prominent boundary that must sit on the seeker) down to just enough for
// dense sets (reach ≈ the whole map there, and thousands of circles to union)
function pointSteps(n) {
  return n <= 16 ? 128 : n <= 200 ? 48 : n <= 500 ? 32 : 20;
}
const LINE_BUFFER_STEPS = 8;

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
  // weight longitude by cos(lat) so "nearest" is by real distance, not raw degrees
  const kx = Math.cos((seeker.lat * Math.PI) / 180);
  let best = null;
  let bd = Infinity;
  for (const c of pts) {
    const dx = (c[0] - seeker.lng) * kx;
    const dy = c[1] - seeker.lat;
    const d = dx * dx + dy * dy;
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
    const steps = pointSteps(r.pts.length);
    // circumscribe the true circle exactly: reach stays a gap-free superset while
    // its edge sits ~1/steps² over R (a few metres), so the boundary hugs the seeker
    const radius = rKm / Math.cos(Math.PI / steps);
    return unionAll(
      r.pts.map((c) => turf.circle(c, radius, { units: "kilometers", steps }))
    );
  }
  if (r.kind === "grid") {
    const reach = reachViaGrid(r.pts, rKm, boundary, r.gridKm);
    return reach ? intersect(reach, boundary) : null;
  }
  // line (borders) — buffer the border lines by exactly R
  return turf.buffer(r.mls, rKm, { units: "kilometers", steps: LINE_BUFFER_STEPS });
}

// { rKm, reach } — `reach` is the "within R of the category" region
export function measuringReach(question, ctx) {
  const cat = question.params?.category;
  const r = resolve(ctx, cat);
  if (r.kind === "none") return { rKm: null, reach: null, unavailable: "no-data" };

  const { rKm } = measuringDistance(question, ctx);
  if (rKm == null || !Number.isFinite(rKm)) return { rKm: null, reach: null, unavailable: "no-instances" };

  // key on R to the metre: a replayed question gives an identical rKm so this
  // still caches, without the outward bias that rounding R up introduced
  const key = `${cat}|${rKm.toFixed(3)}`;
  if (_reach.has(key)) return { rKm, reach: _reach.get(key) };

  let reach = null;
  try {
    reach = bufferReach(r, rKm, ctx?.boundary) || null;
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
