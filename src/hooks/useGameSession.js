// wires the session data-layer + reducer to React. components get the derived
// region and log mutations, never touch geometry or storage directly. multi-
// device sync slots in here: swap the useState/localStorage effect for a room
// subscription, keep the same return shape.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addQuestion as addQuestionOp,
  createSession,
  deleteQuestion as deleteQuestionOp,
  moveQuestion as moveQuestionOp,
  updateQuestion as updateQuestionOp,
} from "../game/session.js";
import { clearSession, loadSession, saveSession } from "../game/persistence.js";
import { deriveRegionSteps } from "../game/reducer.js";

export function useGameSession(mapBounds, ctx) {
  const [session, setSession] = useState(() => loadSession(mapBounds) || createSession(mapBounds));

  // keep mapBounds authoritative from the app even for a restored session
  useEffect(() => {
    setSession((s) => (s.mapBounds === mapBounds ? s : { ...s, mapBounds }));
  }, [mapBounds]);

  useEffect(() => {
    saveSession(session);
  }, [session]);

  // one replay gives both the per-step snapshots and (its last element) the region
  const regionSteps = useMemo(
    () => deriveRegionSteps(session.mapBounds, session.questions, ctx),
    [session.mapBounds, session.questions, ctx]
  );
  const region =
    regionSteps.length > 0 ? regionSteps[regionSteps.length - 1] : session.mapBounds;

  const addQuestion = useCallback((q) => setSession((s) => addQuestionOp(s, q)), []);
  const updateQuestion = useCallback((id, patch) => setSession((s) => updateQuestionOp(s, id, patch)), []);
  const deleteQuestion = useCallback((id) => setSession((s) => deleteQuestionOp(s, id)), []);
  const moveQuestion = useCallback((id, dir) => setSession((s) => moveQuestionOp(s, id, dir)), []);
  const resetSession = useCallback(() => {
    clearSession();
    setSession(createSession(mapBounds));
  }, [mapBounds]);

  return {
    session,
    questions: session.questions,
    region,
    regionSteps,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    moveQuestion,
    resetSession,
  };
}
