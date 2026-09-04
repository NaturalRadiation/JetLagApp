// replay the ordered question log to derive the possible hider region — the
// single source of truth. nothing mutates its inputs; an empty step yields null
// which every later step passes through, so editing/deleting a question is just
// "call deriveRegionSteps again". ctx carries read-only reference data (POIs,
// borders, ...) that some types need.
import { getQuestionType } from "./questionTypes.js";

// apply one question to the current region
export function applyQuestion(region, question, ctx = {}) {
  if (!region) return null; // already empty — contradictory log upstream
  if (!question || question.answer == null || question.answer === "null") return region;

  const def = getQuestionType(question.type);
  if (!def || typeof def.apply !== "function") return region; // informational type

  try {
    const next = def.apply(region, question, ctx);
    return next ?? null;
  } catch (err) {
    // fail open: a broken step must not silently wipe the map
    console.error("[reducer] applyQuestion threw; leaving region unchanged", question, err);
    return region;
  }
}

// full replay from mapBounds (Greater London) through every question
export function deriveRegion(mapBounds, questions, ctx = {}) {
  return (questions || []).reduce((region, q) => applyQuestion(region, q, ctx), mapBounds);
}

// the region snapshot after each question, index-aligned with `questions` — lets
// the log UI show any single row's effect and flag the step that emptied it
export function deriveRegionSteps(mapBounds, questions, ctx = {}) {
  const steps = [];
  let region = mapBounds;
  for (const q of questions || []) {
    region = applyQuestion(region, q, ctx);
    steps.push(region);
  }
  return steps;
}
