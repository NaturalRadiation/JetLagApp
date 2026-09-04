// registry of question types — each has UI metadata and, when it affects the
// map, an apply(region, question, ctx) reducer step. "informational" types are
// logged but don't change the region.
import { METERS_PER_MILE } from "./model.js";
import { applyRadar } from "./geometry/radar.js";
import { applyThermometer } from "./geometry/thermometer.js";
import { applyTentacle } from "./geometry/tentacle.js";
import { applyMatching } from "./geometry/matching.js";
import { applyMeasuring } from "./geometry/measuring.js";

const mi = (n) => Math.round(n * METERS_PER_MILE);

// matching categories that inform a London-only map
export const MATCHING_CATEGORIES = [
  { key: "borough", label: "Borough", note: "3rd administrative division", data: null },
  { key: "ward", label: "Ward", note: "4th administrative division", data: "wards" },
  { key: "airport", label: "Commercial airport", note: "nearest of six London-area airports", data: null },
  { key: "station-name-length", label: "Station name's length", note: "characters in your nearest station's name", data: "stations" },
  { key: "museums", label: "Museum", note: "Voronoi cell of your nearest museum", data: "poi:museums" },
  { key: "libraries", label: "Library", note: "cell of your nearest library", data: "poi:libraries" },
  { key: "cinemas", label: "Movie theatre", note: "cell of your nearest cinema", data: "poi:cinemas" },
  { key: "hospitals", label: "Hospital", note: "cell of your nearest hospital", data: "poi:hospitals" },
  { key: "parks", label: "Park", note: "cell of your nearest park", data: "poi:parks" },
  { key: "golf", label: "Golf course", note: "cell of your nearest golf course", data: "poi:golf" },
  { key: "consulates", label: "Foreign consulate", note: "cell of your nearest consulate / mission", data: "poi:consulates" },
];

// measuring categories for London; `kind` (point / geom) drives the geometry
export const MEASURING_CATEGORIES = [
  { key: "stations", label: "Rail station", kind: "point", data: "stations" },
  { key: "airports", label: "Commercial airport", kind: "point", data: null },
  { key: "museums", label: "Museum", kind: "point", data: "poi:museums" },
  { key: "libraries", label: "Library", kind: "point", data: "poi:libraries" },
  { key: "cinemas", label: "Movie theatre", kind: "point", data: "poi:cinemas" },
  { key: "hospitals", label: "Hospital", kind: "point", data: "poi:hospitals" },
  { key: "parks", label: "Park", kind: "point", data: "poi:parks" },
  { key: "golf", label: "Golf course", kind: "point", data: "poi:golf" },
  { key: "consulates", label: "Foreign consulate", kind: "point", data: "poi:consulates" },
  { key: "water", label: "Body of water", kind: "geom", data: "water" },
  { key: "borough-borders", label: "Borough border", kind: "geom", data: null },
  { key: "ward-borders", label: "Ward border", kind: "geom", data: "wards" },
  {
    key: "coastline",
    label: "Coastline",
    kind: "geom",
    data: "coastline",
    note: "England's coast (Thames Estuary shores) — none inside Greater London itself",
  },
];

// the rest of the ruleset's matching nouns, with why they don't work here
export const MATCHING_UNAVAILABLE = [
  ["1st / 2nd administrative division", "all of London is one unit (England, then the London region)"],
  ["Transit line", "the ruleset needs you riding a moving service and screenshotting its stops"],
  ["Street or path", "needs the full road network and a same-street continuity model"],
  ["Mountain", "no peaks on or near the map — always null"],
  ["Landmass", "London is one contiguous landmass"],
  ["Zoo, Aquarium, Amusement park", "0–1 of each inside Greater London — one cell, no information"],
];

// every POI category we hold data for, with a label + a distinct colour for the
// map toggles and the sidebar key. first four are also tentacle categories.
export const POI_LAYERS = [
  { key: "museums", label: "Museums", colour: "#7c3aed" },
  { key: "libraries", label: "Libraries", colour: "#0891b2" },
  { key: "cinemas", label: "Movie theatres", colour: "#db2777" },
  { key: "hospitals", label: "Hospitals", colour: "#dc2626" },
  { key: "parks", label: "Parks", colour: "#15803d" },
  { key: "golf", label: "Golf courses", colour: "#a16207" },
  { key: "consulates", label: "Consulates", colour: "#334155" },
];

// tentacle categories for medium (London-scale) games
export const TENTACLE_CATEGORIES = POI_LAYERS.filter((l) =>
  ["museums", "libraries", "cinemas", "hospitals"].includes(l.key)
);
export const TENTACLE_DEFAULT_RADIUS_M = mi(1); // London default: 1 mile, both radii

// radar radius options, straight from the ruleset (miles)
export const RADAR_PRESETS = [
  { label: "¼ mile", meters: mi(0.25) },
  { label: "½ mile", meters: mi(0.5) },
  { label: "1 mile", meters: mi(1) },
  { label: "3 miles", meters: mi(3) },
  { label: "5 miles", meters: mi(5) },
  { label: "10 miles", meters: mi(10) },
  { label: "25 miles", meters: mi(25) },
  { label: "50 miles", meters: mi(50) },
  { label: "100 miles", meters: mi(100) },
];

// thermometer minimum-travel options by game size (miles), informational only
export const THERMOMETER_PRESETS = [
  { label: "½ mile", meters: mi(0.5), sizes: "Small+" },
  { label: "3 miles", meters: mi(3), sizes: "Small+" },
  { label: "10 miles", meters: mi(10), sizes: "Medium+" },
  { label: "50 miles", meters: mi(50), sizes: "Large" },
];

export const QUESTION_TYPES = {
  radar: {
    id: "radar",
    label: "Radar",
    status: "active",
    blurb: "Are you within [radius] of me?",
    apply: applyRadar,
    summarize: (q) => `within ${formatMeters(q.params.radiusMeters)} of seeker`,
  },

  thermometer: {
    id: "thermometer",
    label: "Thermometer",
    status: "active",
    blurb: "After travelling [distance], am I hotter or colder?",
    apply: applyThermometer,
    summarize: (q) => `travelled ${describeThermoLeg(q.params)}`,
  },

  measuring: {
    id: "measuring",
    label: "Measuring",
    status: "active",
    blurb: "Compared to me, are you closer to or further from [category]?",
    apply: applyMeasuring,
    summarize: (q) => {
      const cat =
        MEASURING_CATEGORIES.find((c) => c.key === q.params?.category)?.label ??
        q.params?.category ??
        "category";
      const dir = q.answer === "closer" ? "closer to" : q.answer === "further" ? "further from" : "vs";
      const r = q.params?.seekerKm != null ? ` (seeker ${q.params.seekerKm.toFixed(1)} km)` : "";
      return `${dir} nearest ${cat.toLowerCase()}${r}`;
    },
  },

  matching: {
    id: "matching",
    label: "Matching",
    status: "active",
    blurb: "Is your nearest [category] the same as mine?",
    apply: applyMatching,
    summarize: (q) => {
      const cat =
        MATCHING_CATEGORIES.find((c) => c.key === q.params?.category)?.label ??
        q.params?.category ??
        "category";
      const v = q.params?.seekerValue ? ` (${q.params.seekerValue})` : "";
      return `same ${cat.toLowerCase()}${v}`;
    },
  },

  tentacle: {
    id: "tentacle",
    label: "Tentacle",
    status: "active",
    blurb: "Within [radius] of me, which [category] are you nearest to?",
    apply: applyTentacle,
    summarize: (q) => {
      const cat =
        TENTACLE_CATEGORIES.find((c) => c.key === q.params?.category)?.label ??
        q.params?.category ??
        "category";
      const r = q.params?.searchRadiusMeters ? formatMeters(q.params.searchRadiusMeters) : "?";
      const poi = q.params?.namedPoi?.name ? ` → ${q.params.namedPoi.name}` : "";
      return `${cat} within ${r}${poi}`;
    },
  },

};

// nouns that never inform a London map, surfaced so the UI can grey them out
export const DISABLED_LONDON_NOUNS = {
  coastline: "The Thames is nowhere ≥ 1 mile wide in London, so this ruleset's coastline is null everywhere.",
  "international border": "London has no international border — always null.",
  landmass: "London sits on one contiguous landmass — matching is uninformative citywide.",
};

export function getQuestionType(type) {
  return QUESTION_TYPES[type] || null;
}

export function isActive(type) {
  return QUESTION_TYPES[type]?.status === "active";
}

// --- formatting helpers ---

export function formatMeters(m) {
  const miles = m / METERS_PER_MILE;
  if (miles < 0.95) {
    const frac = { 0.25: "¼", 0.5: "½", 0.75: "¾" }[Number(miles.toFixed(2))];
    return frac ? `${frac} mile` : `${miles.toFixed(2)} mi`;
  }
  return `${Number.isInteger(miles) ? miles : miles.toFixed(1)} mi`;
}

function describeThermoLeg(params) {
  if (!params?.start || !params?.end) return "an unset leg";
  const label = params.distancePreset ? `${params.distancePreset} leg` : "a leg";
  return label;
}
