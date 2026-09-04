// tentacle — "of all the [category] within [R] of me, which are you nearest to?".
// one radius, measured from the seeker. the hider either names a category POI —
// they're then inside the seeker's circle and in that POI's nearest-neighbour
// cell among the in-range POIs — or answers that they're not within R of the
// seeker at all, which drops the circle.
import * as turf from "@turf/turf";
import { intersect, difference, toPosition } from "./turfHelpers.js";

const CIRCLE_STEPS = 96;

function circleAround(point, radiusMeters) {
  return turf.circle(toPosition(point), radiusMeters / 1000, {
    steps: CIRCLE_STEPS,
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

// category POIs within `withinMeters` of `point`, nearest first
export function poisInRange(point, pois, withinMeters) {
  const from = toPosition(point);
  return pois
    .map((p) => ({ ...p, distance: turf.distance(from, [p.lng, p.lat], { units: "meters" }) }))
    .filter((p) => p.distance <= withinMeters)
    .sort((a, b) => a.distance - b.distance);
}

// index of `namedPoi` in `inRange` — nearest coords with a matching (or absent)
// name, within ~220 m so a stale namedPoi doesn't snap to the wrong place
function findNamedIndex(inRange, namedPoi) {
  let idx = -1;
  let best = Infinity;
  for (let i = 0; i < inRange.length; i += 1) {
    const p = inRange[i];
    const nameOk = !namedPoi.name || !p.name || p.name === namedPoi.name;
    const d = (p.lng - namedPoi.lng) ** 2 + (p.lat - namedPoi.lat) ** 2;
    if (nameOk && d < best) {
      best = d;
      idx = i;
    }
  }
  return best <= 4e-6 ? idx : -1;
}

// within `circle`, the area closer to inRange[targetIdx] than to any other
// in-range POI. 0 or 1 candidates -> no partition, so the whole circle.
function voronoiCellWithin(targetIdx, inRange, circle) {
  if (inRange.length <= 1) return circle;
  const pts = turf.featureCollection(inRange.map((p) => turf.point([p.lng, p.lat])));
  const [minX, minY, maxX, maxY] = turf.bbox(circle);
  const padX = (maxX - minX) * 0.1 || 0.01;
  const padY = (maxY - minY) * 0.1 || 0.01;
  let cells;
  try {
    cells = turf.voronoi(pts, {
      bbox: [minX - padX, minY - padY, maxX + padX, maxY + padY],
    }).features;
  } catch {
    return circle;
  }
  if (cells.length !== inRange.length || !cells[targetIdx]) return null;
  return intersect(cells[targetIdx], circle);
}

// the region a "yes, nearest to <namedPoi>" answer implies: inside the seeker's
// circle and in that POI's nearest-neighbour cell. without a namedPoi it's just
// the circle (we only learn the hider is within R). null if a namedPoi was given
// but nothing is in range — can't be nearest to a POI that isn't there.
export function tentacleNearestCell(askedFrom, radiusMeters, pois, namedPoi) {
  if (!radiusMeters || radiusMeters <= 0) return null;
  const circle = circleAround(askedFrom, radiusMeters);
  const inRange = poisInRange(askedFrom, pois, radiusMeters);
  if (!namedPoi) return circle;
  if (inRange.length === 0) return null;
  const idx = findNamedIndex(inRange, namedPoi);
  if (idx < 0) return circle; // named a POI we can't place — fall back to the circle
  return voronoiCellWithin(idx, inRange, circle);
}

// params: { category, searchRadiusMeters, namedPoi? }; ctx.pois[category]
export function applyTentacle(region, question, ctx) {
  const { askedFrom, params, answer } = question;
  const r = params?.searchRadiusMeters;
  if (!r || r <= 0 || answer === "null") return region;

  // "I'm not within R of you" — drop the seeker's circle
  if (answer === "no") return difference(region, circleAround(askedFrom, r));

  // "yes" — the hider named the category POI they're nearest to
  const pois = categoryPoints(ctx?.pois?.[params.category]);
  if (poisInRange(askedFrom, pois, r).length === 0) return null; // impossible answer

  const cell = tentacleNearestCell(askedFrom, r, pois, params.namedPoi || null);
  return cell ? intersect(region, cell) : null;
}
