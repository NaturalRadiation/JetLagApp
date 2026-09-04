// radar — "are you within [radius] of me?" a circle at the seeker; yes intersects,
// no subtracts
import * as turf from "@turf/turf";
import { intersect, difference, toPosition } from "./turfHelpers.js";

const CIRCLE_STEPS = 128; // smooth enough that intersections don't look faceted

export function radarCircle(question) {
  const { askedFrom, params } = question;
  return turf.circle(toPosition(askedFrom), params.radiusMeters / 1000, {
    steps: CIRCLE_STEPS,
    units: "kilometers",
  });
}

export function applyRadar(region, question) {
  const circle = radarCircle(question);
  switch (question.answer) {
    case "yes":
      return intersect(region, circle);
    case "no":
      return difference(region, circle);
    default:
      return region;
  }
}
