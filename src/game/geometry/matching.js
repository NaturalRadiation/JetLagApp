// matching — "is your nearest [category] the same as mine?" find the seeker's
// cell, then yes intersects the region with it, no subtracts it. cells:
// borough/ward = the polygon you're in (exact); airport = the Voronoi cell of
// your nearest of the six; POI / station-name-length = Voronoi (see voronoi.js).
import * as turf from "@turf/turf";
import { intersect, difference, toPosition } from "./turfHelpers.js";
import { halfPlane } from "./thermometer.js";
import { poiVoronoiCell, stationNameLengthCell } from "./voronoi.js";

// POI categories matched via a Voronoi cell (data in ctx.pois[key])
export const MATCHING_POI_KEYS = [
  "museums",
  "libraries",
  "cinemas",
  "hospitals",
  "parks",
  "golf",
  "consulates",
];

// character count of a station name, minus parentheticals and a trailing
// "station"; spaces and punctuation still count ("Bank" = 4). tweak to taste.
export function stationNameLength(raw) {
  return String(raw)
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\bstation\b/i, "")
    .trim().length;
}

// the six commercial airports serving London; some sit outside the boundary but
// still shape the Voronoi inside it (house rule: all six, not just Heathrow + City)
export const LONDON_AIRPORTS = [
  { id: "Heathrow", coord: [-0.4543, 51.47] },
  { id: "Gatwick", coord: [-0.1903, 51.1481] },
  { id: "Stansted", coord: [0.235, 51.885] },
  { id: "Luton", coord: [-0.3717, 51.8747] },
  { id: "London City", coord: [0.0495, 51.5048] },
  { id: "Southend", coord: [0.6931, 51.5714] },
];

// half-plane of points nearer to airport `a` than to airport `b`
function nearerHalfPlane(a, b) {
  return halfPlane({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] }, "start");
}

// airport cells are static per boundary — compute all six once, then reuse
let _cache = { boundary: null, cells: null };
function airportCells(boundary) {
  if (_cache.boundary === boundary && _cache.cells) return _cache.cells;
  const cells = {};
  for (const ap of LONDON_AIRPORTS) {
    let cell = boundary;
    for (const other of LONDON_AIRPORTS) {
      if (other.id === ap.id || !cell) continue;
      cell = intersect(cell, nearerHalfPlane(ap.coord, other.coord));
    }
    cells[ap.id] = cell; // null when no London point is nearest to this airport
  }
  _cache = { boundary, cells };
  return cells;
}

function adminCellFor(askedFrom, fc, nameKeys) {
  if (!fc) return null;
  const pt = turf.point(toPosition(askedFrom));
  for (const f of fc.features) {
    try {
      if (turf.booleanPointInPolygon(pt, f)) {
        const label = nameKeys.map((k) => f.properties?.[k]).find(Boolean) || "area";
        return { cell: f, label };
      }
    } catch {
      /* skip malformed geometry */
    }
  }
  return null;
}

function airportCellFor(askedFrom, boundary) {
  if (!boundary) return null;
  const from = toPosition(askedFrom);
  let nearest = null;
  let best = Infinity;
  for (const ap of LONDON_AIRPORTS) {
    const d = turf.distance(from, ap.coord, { units: "kilometers" });
    if (d < best) {
      best = d;
      nearest = ap;
    }
  }
  const cell = airportCells(boundary)[nearest.id];
  return cell ? { cell, label: nearest.id } : null;
}

// the seeker's cell + a label, or null if it can't be resolved
export function matchingCell(question, ctx) {
  const { askedFrom, params } = question;
  const cat = params?.category;
  switch (cat) {
    case "borough":
      return adminCellFor(askedFrom, ctx?.boroughs, ["name", "NAME", "borough"]);
    case "ward":
      return adminCellFor(askedFrom, ctx?.wards, ["ward", "WD13NM", "name"]);
    case "airport":
      return airportCellFor(askedFrom, ctx?.boundary);
    case "station-name-length":
      return stationNameLengthCell(ctx?.stations, ctx?.boundary, askedFrom, stationNameLength);
    default:
      if (MATCHING_POI_KEYS.includes(cat)) {
        return poiVoronoiCell(ctx?.pois?.[cat], ctx?.boundary, askedFrom);
      }
      return null;
  }
}

export function applyMatching(region, question, ctx) {
  const res = matchingCell(question, ctx);
  if (!res || !res.cell) return region; // unresolved — no information
  if (question.answer === "yes") return intersect(region, res.cell);
  if (question.answer === "no") return difference(region, res.cell);
  return region;
}
