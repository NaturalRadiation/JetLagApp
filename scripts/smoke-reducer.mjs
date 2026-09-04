// quick sanity check of the reducer + geometry against the real boundary
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import * as turf from "@turf/turf";
import { deriveRegion } from "../src/game/reducer.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bounds = JSON.parse(readFileSync(resolve(root, "public/data/greater-london.geojson"), "utf8"));
const km2 = (r) => (r ? turf.area(r) / 1e6 : 0);
const CENTER = { lat: 51.5072, lng: -0.1276, timestamp: 0 };
let pass = 0;
let fail = 0;
const check = (name, cond) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  cond ? pass++ : fail++;
};

const base = km2(bounds);
console.log(`boundary area ${base.toFixed(0)} km2\n`);

// radar yes: 3 miles around the centre must be far smaller than all of London
const r1 = deriveRegion(bounds, [
  { id: "a", type: "radar", askedFrom: CENTER, params: { radiusMeters: 3 * 1609.344 }, answer: "yes" },
]);
check("radar yes 3mi shrinks region", km2(r1) > 0 && km2(r1) < base * 0.5);
check("radar yes 3mi ~ pi r^2 clipped", km2(r1) < Math.PI * 4.828 * 4.828 + 1);

// radar no: removes that disc
const r2 = deriveRegion(bounds, [
  { id: "a", type: "radar", askedFrom: CENTER, params: { radiusMeters: 3 * 1609.344 }, answer: "no" },
]);
check("radar no 3mi removes a chunk", km2(r2) < base && km2(r2) > base * 0.7);
check("radar yes + radar no partition", Math.abs(km2(r1) + km2(r2) - base) < 1);

// contradiction -> empty
const r3 = deriveRegion(bounds, [
  { id: "a", type: "radar", askedFrom: CENTER, params: { radiusMeters: 1609.344 }, answer: "yes" },
  { id: "b", type: "radar", askedFrom: CENTER, params: { radiusMeters: 1609.344 }, answer: "no" },
]);
check("contradictory radar -> null", r3 === null);

// thermometer: start west, end east of centre. hotter keeps the eastern half.
const start = { lat: 51.5072, lng: -0.30, timestamp: 0 };
const end = { lat: 51.5072, lng: 0.05, timestamp: 0 };
const hot = deriveRegion(bounds, [
  { id: "t", type: "thermometer", askedFrom: end, params: { start, end }, answer: "hotter" },
]);
const cold = deriveRegion(bounds, [
  { id: "t", type: "thermometer", askedFrom: end, params: { start, end }, answer: "colder" },
]);
check("thermometer hotter keeps part of region", km2(hot) > 0 && km2(hot) < base);
check("thermometer hotter + colder partition London", Math.abs(km2(hot) + km2(cold) - base) < 2);
const hotCentroidLng = turf.centroid(hot).geometry.coordinates[0];
const coldCentroidLng = turf.centroid(cold).geometry.coordinates[0];
check("hotter half lies east of colder half", hotCentroidLng > coldCentroidLng);

// null answer is a no-op
const r4 = deriveRegion(bounds, [
  { id: "n", type: "radar", askedFrom: CENTER, params: { radiusMeters: 1609.344 }, answer: "null" },
]);
check("null answer leaves region unchanged", Math.abs(km2(r4) - base) < 0.001);

// --- tentacle ---
const MILE = 1609.344;
const poiPath = (c) => resolve(root, `public/data/poi/${c}.geojson`);
const ctx = {
  pois: Object.fromEntries(
    ["museums", "libraries", "cinemas", "hospitals"].map((c) => [
      c,
      JSON.parse(readFileSync(poiPath(c), "utf8")),
    ])
  ),
};
const BM = { lat: 51.5194, lng: -0.127, timestamp: 0 }; // British Museum
const tq = (answer, params) => ({ id: "tc", type: "tentacle", askedFrom: BM, params, answer });

const tYes = deriveRegion(bounds, [tq("yes", { category: "museums", searchRadiusMeters: MILE, reachRadiusMeters: MILE })], ctx);
check("tentacle yes: non-empty and within the 1mi search circle", km2(tYes) > 0 && km2(tYes) < Math.PI * 1.609 * 1.609 + 0.5);

const tNo = deriveRegion(bounds, [tq("no", { category: "museums", searchRadiusMeters: MILE, reachRadiusMeters: MILE })], ctx);
check("tentacle no: removes the reachable compound", km2(tNo) < base && km2(tNo) > base * 0.9);

const tNamed = deriveRegion(
  bounds,
  [tq("yes", { category: "museums", searchRadiusMeters: MILE, reachRadiusMeters: MILE, namedPoi: { name: "British Museum", lat: 51.5194, lng: -0.127 } })],
  ctx
);
check("tentacle named POI: smaller than the un-named yes", km2(tNamed) > 0 && km2(tNamed) <= km2(tYes) + 0.01);
check("tentacle named POI centroid near the POI", turf.distance(turf.centroid(tNamed), [-0.127, 51.5194], { units: "kilometers" }) < 1.7);

// nowhere near a museum -> "yes" is a contradiction, "no" tells us nothing
const FARISH = { lat: 51.62, lng: 0.18, timestamp: 0 };
const tFarYes = deriveRegion(bounds, [{ id: "f", type: "tentacle", askedFrom: FARISH, params: { category: "museums", searchRadiusMeters: MILE, reachRadiusMeters: MILE }, answer: "yes" }], ctx);
const tFarNo = deriveRegion(bounds, [{ id: "f", type: "tentacle", askedFrom: FARISH, params: { category: "museums", searchRadiusMeters: MILE, reachRadiusMeters: MILE }, answer: "no" }], ctx);
check("tentacle yes with nothing reachable -> null", tFarYes === null);
check("tentacle no with nothing reachable -> unchanged", Math.abs(km2(tFarNo) - base) < 0.001);

// --- matching ---
const boroughs = JSON.parse(readFileSync(resolve(root, "public/data/london-boroughs.geojson"), "utf8"));
const readOpt = (p) => {
  try {
    return JSON.parse(readFileSync(resolve(root, p), "utf8"));
  } catch {
    return null;
  }
};
const wards = readOpt("public/data/wards.geojson");
const stations = readOpt("public/data/stations.geojson");
const water = readOpt("public/data/water.geojson");
const coastline = readOpt("public/data/coastline.geojson");
const allPois = Object.fromEntries(
  ["museums", "libraries", "cinemas", "hospitals", "parks", "golf", "consulates"].map((c) => [
    c,
    readOpt(`public/data/poi/${c}.geojson`),
  ])
);
const mctx = { boroughs, wards, stations, water, coastline, boundary: bounds, pois: allPois };
const CAMDEN = { lat: 51.53, lng: -0.143, timestamp: 0 }; // near Camden Town
const mq = (cat, answer) => ({ id: "m", type: "matching", askedFrom: CAMDEN, params: { category: cat }, answer });

const mYes = deriveRegion(bounds, [mq("borough", "yes")], mctx);
check("matching borough yes -> one borough (< 12% of London)", km2(mYes) > 5 && km2(mYes) < base * 0.12);
const mNo = deriveRegion(bounds, [mq("borough", "no")], mctx);
check("matching borough yes + no partition London", Math.abs(km2(mYes) + km2(mNo) - base) < 2);

if (wards) {
  const wYes = deriveRegion(bounds, [mq("ward", "yes")], mctx);
  check("matching ward yes -> smaller than the borough", km2(wYes) > 0 && km2(wYes) < km2(mYes));
}

const aYes = deriveRegion(bounds, [mq("airport", "yes")], mctx);
const aNo = deriveRegion(bounds, [mq("airport", "no")], mctx);
check("matching airport yes: a chunk of London, not all", km2(aYes) > base * 0.05 && km2(aYes) < base * 0.95);
check("matching airport yes + no partition London", Math.abs(km2(aYes) + km2(aNo) - base) < 3);
// Camden's nearest airport is London City (east), not Heathrow (far west)
const aCentroidLng = turf.centroid(aYes).geometry.coordinates[0];
check("matching airport cell for Camden leans east (London City)", aCentroidLng > -0.14);

// POI Voronoi: the seeker's museum cell must contain the seeker, and be < London
const musYes = deriveRegion(bounds, [mq("museums", "yes")], mctx);
const musNo = deriveRegion(bounds, [mq("museums", "no")], mctx);
check(
  "matching museum yes: cell contains the seeker, smaller than London",
  km2(musYes) > 0 &&
    km2(musYes) < base &&
    turf.booleanPointInPolygon([CAMDEN.lng, CAMDEN.lat], musYes)
);
check("matching museum yes + no partition London", Math.abs(km2(musYes) + km2(musNo) - base) < 3);

if (stations) {
  const snYes = deriveRegion(bounds, [mq("station-name-length", "yes")], mctx);
  const snNo = deriveRegion(bounds, [mq("station-name-length", "no")], mctx);
  check("matching station-name-length yes: non-empty, not all of London", km2(snYes) > 0 && km2(snYes) < base * 0.9);
  check("matching station-name-length yes + no partition London", Math.abs(km2(snYes) + km2(snNo) - base) < 4);
}

// --- measuring ---
const meq = (cat, answer, from = CAMDEN) => ({
  id: "me",
  type: "measuring",
  askedFrom: from,
  params: { category: cat },
  answer,
});

if (stations) {
  const t0 = Date.now();
  const stC = deriveRegion(bounds, [meq("stations", "closer")], mctx);
  const stF = deriveRegion(bounds, [meq("stations", "further")], mctx);
  check("measuring stations closer/further partition London", Math.abs(km2(stC) + km2(stF) - base) < 5);
  check("measuring stations closer: seeker at Camden Town stays in", turf.booleanPointInPolygon([CAMDEN.lng, CAMDEN.lat], stC));
  console.log(`      (stations measuring took ${Date.now() - t0} ms)`);
}

if (water) {
  const wC = deriveRegion(bounds, [meq("water", "closer")], mctx);
  const wF = deriveRegion(bounds, [meq("water", "further")], mctx);
  check("measuring water closer/further partition London", Math.abs(km2(wC) + km2(wF) - base) < 6);
  check("measuring water closer: non-empty and smaller than London", km2(wC) > 0 && km2(wC) < base);
}

const bbC = deriveRegion(bounds, [meq("borough-borders", "closer")], mctx);
const bbF = deriveRegion(bounds, [meq("borough-borders", "further")], mctx);
check("measuring borough-borders closer/further partition London", Math.abs(km2(bbC) + km2(bbF) - base) < 6);

// coastline: England's estuary coast, ~20-60 km SE of London -> a diagonal cut
if (mctx.coastline) {
  const cC = deriveRegion(bounds, [meq("coastline", "closer", { lat: 51.51, lng: -0.12 })], mctx);
  const cF = deriveRegion(bounds, [meq("coastline", "further", { lat: 51.51, lng: -0.12 })], mctx);
  check("measuring coastline closer: a proper sub-region (SE half-ish)", km2(cC) > base * 0.1 && km2(cC) < base * 0.95);
  check("measuring coastline closer/further partition London", Math.abs(km2(cC) + km2(cF) - base) < 6);
  const cLng = turf.centroid(cC).geometry.coordinates[0];
  check("measuring coastline 'closer' cell leans SE (toward the sea)", cLng > -0.12);
}

const airM = deriveRegion(bounds, [meq("airports", "closer")], mctx);
check("measuring airports closer: a proper sub-region", km2(airM) > 0 && km2(airM) < base);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
