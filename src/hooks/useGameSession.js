// wires the session data-layer + reducer to React. components get the derived
// region and log mutations, never touch geometry or storage directly.
//
// pass `sync` (from useRoomSession, via App) to share the log with a room:
//   { role, remoteSession, publish(session), primed }
// any role adopts a session pushed by another player; only non-hiders publish
// their own edits. an incoming session is replayed through the same reducer, so
// hiders and co-seekers compute the identical region locally.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addQuestion as addQuestionOp,
  createSession,
  deleteQuestion as deleteQuestionOp,
  moveQuestion as moveQuestionOp,
  updateQuestion as updateQuestionOp,
} from "../game/session.js";
import { clearSession, loadSession, saveSession } from "../game/persistence.js";
import { deriveRegionSteps } from "../game/reducer.js";
import { SCHEMA_VERSION } from "../game/model.js";
import { hashJson } from "../lib/hash.js";

// what actually defines the shared game — mapBounds is app config (re-injected
// per client) and the timestamps are noise for change detection
const syncFingerprint = (s) => hashJson({ id: s.id, questions: s.questions });

function adoptRemote(remote, mapBounds) {
  if (remote?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(remote.questions)) return null;
  return { ...remote, mapBounds };
}

export function useGameSession(mapBounds, ctx, sync = null) {
  const [session, setSession] = useState(() => loadSession(mapBounds) || createSession(mapBounds));

  // the fingerprint we last sent to / adopted from the room — guards the
  // publish -> postgres change -> adopt -> publish echo
  const syncedRef = useRef(null);

  // keep mapBounds authoritative from the app even for a restored session
  useEffect(() => {
    setSession((s) => (s.mapBounds === mapBounds ? s : { ...s, mapBounds }));
  }, [mapBounds]);

  // adopt a log pushed by another player
  const remote = sync?.remoteSession;
  useEffect(() => {
    if (!remote) return;
    const next = adoptRemote(remote, mapBounds);
    if (!next) return;
    const fp = syncFingerprint(next);
    if (fp === syncedRef.current) return; // our own echo, or no real change
    syncedRef.current = fp;
    setSession(next);
  }, [remote, mapBounds]);

  // always cache locally; publish to the room only when we're the source of the
  // change and the room's current state is known
  useEffect(() => {
    saveSession(session);
  }, [session]);

  const publish = sync?.publish;
  const canPublish = Boolean(publish) && sync.role !== "hider" && sync.primed;
  useEffect(() => {
    if (!canPublish) return;
    const fp = syncFingerprint(session);
    if (fp === syncedRef.current) return; // came from adopt, or unchanged
    syncedRef.current = fp;
    publish(session);
  }, [session, canPublish, publish]);

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
