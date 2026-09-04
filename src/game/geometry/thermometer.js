// thermometer — "after travelling [distance], am I hotter or colder?" the
// perpendicular bisector of start->end splits the map; hotter keeps the end
// side, colder the start side. done as intersect with a big covering rectangle.
import * as turf from "@turf/turf";
import { intersect, toPosition } from "./turfHelpers.js";

// half-width / depth of the covering rectangle, comfortably bigger than London
const SPAN_KM = 400;

// the bisector as a finite segment long enough to cross the map (for the preview)
export function bisectorLine(start, end) {
  const s = toPosition(start);
  const e = toPosition(end);
  const mid = turf.midpoint(s, e).geometry.coordinates;
  const bearing = turf.bearing(s, e);
  const a = turf.destination(mid, SPAN_KM, bearing + 90, { units: "kilometers" }).geometry.coordinates;
  const b = turf.destination(mid, SPAN_KM, bearing - 90, { units: "kilometers" }).geometry.coordinates;
  return turf.lineString([a, b]);
}

// rectangle covering the half-plane on the side of `toward` ("start" | "end")
export function halfPlane(start, end, toward) {
  const s = toPosition(start);
  const e = toPosition(end);
  const mid = turf.midpoint(s, e).geometry.coordinates;
  const bearing = turf.bearing(s, e); // start -> end
  const edgeA = turf.destination(mid, SPAN_KM, bearing + 90, { units: "kilometers" }).geometry.coordinates;
  const edgeB = turf.destination(mid, SPAN_KM, bearing - 90, { units: "kilometers" }).geometry.coordinates;
  const push = toward === "end" ? bearing : bearing + 180;
  const farA = turf.destination(edgeA, SPAN_KM * 2, push, { units: "kilometers" }).geometry.coordinates;
  const farB = turf.destination(edgeB, SPAN_KM * 2, push, { units: "kilometers" }).geometry.coordinates;
  return turf.polygon([[edgeA, edgeB, farB, farA, edgeA]]);
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
