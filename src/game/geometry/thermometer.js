// thermometer — "after travelling from start to end, am I hotter or colder?"
// the perpendicular bisector of start->end splits the map: hotter is the half
// closer to end, colder the half closer to start. the covering rectangle is
// built in a local planar frame (longitude scaled by cos(lat)) so the split
// stays true at every bearing — a great-circle construction drifts badly for
// anything other than due east/west travel.
import * as turf from "@turf/turf";
import { intersect, toPosition } from "./turfHelpers.js";

// covering-rectangle half-size in degrees, comfortably beyond London
const SPAN_DEG = 3;

// local planar frame at the segment midpoint: `fwd` is the unit start->end
// direction, `perp` runs along the bisector, `toLngLat` maps planar x/y back.
function frame(start, end) {
  const s = toPosition(start);
  const e = toPosition(end);
  const mid = [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2];
  const cosLat = Math.cos((mid[1] * Math.PI) / 180) || 1e-6;
  let fx = (e[0] - s[0]) * cosLat;
  let fy = e[1] - s[1];
  const len = Math.hypot(fx, fy) || 1e-9;
  fx /= len;
  fy /= len;
  return {
    mid,
    fwd: [fx, fy],
    perp: [-fy, fx],
    toLngLat: (x, y) => [mid[0] + x / cosLat, mid[1] + y],
  };
}

// the bisector as a finite segment long enough to cross the map (preview only)
export function bisectorLine(start, end) {
  const { perp, toLngLat } = frame(start, end);
  return turf.lineString([
    toLngLat(perp[0] * SPAN_DEG, perp[1] * SPAN_DEG),
    toLngLat(-perp[0] * SPAN_DEG, -perp[1] * SPAN_DEG),
  ]);
}

// rectangle covering the half-plane on the side of `toward` ("start" | "end")
export function halfPlane(start, end, toward) {
  const { fwd, perp, toLngLat } = frame(start, end);
  const sign = toward === "end" ? 1 : -1;
  const P = SPAN_DEG;
  const D = 2 * SPAN_DEG;
  const a = toLngLat(perp[0] * P, perp[1] * P);
  const b = toLngLat(-perp[0] * P, -perp[1] * P);
  const c = toLngLat(-perp[0] * P + sign * fwd[0] * D, -perp[1] * P + sign * fwd[1] * D);
  const d = toLngLat(perp[0] * P + sign * fwd[0] * D, perp[1] * P + sign * fwd[1] * D);
  return turf.polygon([[a, b, c, d, a]]);
}

export function applyThermometer(region, question) {
  const { start, end } = question.params;
  if (!start || !end) return region;
  switch (question.answer) {
    case "hotter":
      return intersect(region, halfPlane(start, end, "end"));
    case "colder":
      return intersect(region, halfPlane(start, end, "start"));
    default:
      return region;
  }
}
