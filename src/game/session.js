// pure operations on a GameSession — each returns a new object, never mutates.
// these are the only ways the log changes, so a realtime backend later can
// intercept exactly this surface without the UI changing.
import { SCHEMA_VERSION } from "./model.js";

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createSession(mapBounds) {
  const now = Date.now();
  return {
    id: uid(),
    schemaVersion: SCHEMA_VERSION,
    mapBounds,
    questions: [],
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeQuestion(input) {
  const now = Date.now();
  return {
    id: input.id || uid(),
    type: input.type,
    askedFrom: {
      lat: input.askedFrom.lat,
      lng: input.askedFrom.lng,
      timestamp: input.askedFrom.timestamp ?? now,
    },
    params: input.params ?? {},
    answer: input.answer ?? "null",
    createdAt: input.createdAt ?? now,
    ...(input.note ? { note: input.note } : {}),
  };
}

export function addQuestion(session, question) {
  return {
    ...session,
    questions: [...session.questions, normalizeQuestion(question)],
    updatedAt: Date.now(),
  };
}

export function updateQuestion(session, id, patch) {
  return {
    ...session,
    questions: session.questions.map((q) => (q.id === id ? { ...q, ...patch, id: q.id } : q)),
    updatedAt: Date.now(),
  };
}

export function deleteQuestion(session, id) {
  return {
    ...session,
    questions: session.questions.filter((q) => q.id !== id),
    updatedAt: Date.now(),
  };
}

// reorder — significant, the region is a replay of this exact order
export function moveQuestion(session, id, direction) {
  const idx = session.questions.findIndex((q) => q.id === id);
  if (idx < 0) return session;
  const target = idx + (direction === "up" ? -1 : 1);
  if (target < 0 || target >= session.questions.length) return session;
  const next = session.questions.slice();
  [next[idx], next[target]] = [next[target], next[idx]];
  return { ...session, questions: next, updatedAt: Date.now() };
}
