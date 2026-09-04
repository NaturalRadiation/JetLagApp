// tentacle — "within [R1] of me, which [category] are you nearest to? (must also
// be within [R2] of it)". compound = circle(askedFrom, R1) ∩ ⋃ circle(poi, R2);
// yes intersects it (or just the named poi's circle), "not within reach" subtracts.
// only POIs within R1+R2 of the seeker are considered, so it stays a few ms.
import * as turf from "@turf/turf";
import { intersect, difference, unionAll, toPosition } from "./turfHelpers.js";

const CIRCLE_STEPS = 96;
const BUFFER_STEPS = 24;

function circleAround(point, radiusMeters) {
  return turf.circle(toPosition(point), radiusMeters / 1000, {
    steps: CIRCLE_STEPS,
    units: "kilometers",
  });
}

// a POI's reach is just a circle — turf.circle, not turf.buffer (which drags in JTS)
function poiBuffer(poi, radiusMeters) {
  return turf.circle([poi.lng, poi.lat], radiusMeters / 1000, {
    steps: BUFFER_STEPS,
    units: "kilometers",
  });
}

// [{lng, lat, name}] of the category, from the static POI file
export function categoryPoints(featureCollection) {
  return (featureCollection?.features || [])
    .filter((f) => f.geometry?.type === "Point")
    .map((f) => ({
      lng: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
      name: f.properties?.name || "(unnamed)",
    }));
}

// POIs within `withinMeters` of `point`, nearest first
export function poisInRange(point, pois, withinMeters) {
  const from = toPosition(point);
  return pois
    .map((p) => ({ ...p, distance: turf.distance(from, [p.lng, p.lat], { units: "meters" }) }))
    .filter((p) => p.distance <= withinMeters)
    .sort((a, b) => a.distance - b.distance);
}

// the full compound region for a category, or null if nothing is reachable
export function tentacleCompound(askedFrom, searchRadiusMeters, reachRadiusMeters, pois) {
  const near = poisInRange(askedFrom, pois, searchRadiusMeters + reachRadiusMeters);
  if (near.length === 0) return null;
  const reach = unionAll(near.map((p) => poiBuffer(p, reachRadiusMeters)));
  if (!reach) return null;
  return intersect(circleAround(askedFrom, searchRadiusMeters), reach);
}

// params: { category, searchRadiusMeters, reachRadiusMeters?, namedPoi? }; ctx.pois[category]
export function applyTentacle(region, question, ctx) {
  const { askedFrom, params, answer } = question;
  const r1 = params.searchRadiusMeters;
  const r2 = params.reachRadiusMeters ?? r1;
  const pois = categoryPoints(ctx?.pois?.[params.category]);

  if (answer === "yes" && params.namedPoi) {
    const reach = poiBuffer(params.namedPoi, r2);
    return intersect(region, intersect(circleAround(askedFrom, r1), reach));
  }

  const compound = tentacleCompound(askedFrom, r1, r2, pois);

  if (answer === "yes") {
    // hider named some POI in the category, so they're inside the compound
    return compound ? intersect(region, compound) : null;
  }
  if (answer === "no") {
    // "not within reach" — nowhere in the compound
    return compound ? difference(region, compound) : region;
  }
  return region;
}
