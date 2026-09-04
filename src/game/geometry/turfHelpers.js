// thin wrappers over turf's boolean ops — v7 takes one FeatureCollection and
// returns Feature|null, so hide that and treat null as "empty region"
import * as turf from "@turf/turf";

export function intersect(a, b) {
  if (!a || !b) return null;
  try {
    return turf.intersect(turf.featureCollection([a, b])) || null;
  } catch (err) {
    console.error("[geometry] intersect failed", err);
    return a;
  }
}

// region a with region b removed
export function difference(a, b) {
  if (!a) return null;
  if (!b) return a;
  try {
    return turf.difference(turf.featureCollection([a, b])) || null;
  } catch (err) {
    console.error("[geometry] difference failed", err);
    return a;
  }
}

// union of many polygons, nullish entries ignored
export function unionAll(features) {
  const fs = (features || []).filter(Boolean);
  if (fs.length === 0) return null;
  if (fs.length === 1) return fs[0];
  try {
    return turf.union(turf.featureCollection(fs)) || null;
  } catch (err) {
    console.error("[geometry] union failed", err);
    return fs[0];
  }
}

// the [lng, lat] tuple turf wants, from our {lat, lng} objects
export function toPosition(point) {
  return [point.lng, point.lat];
}
