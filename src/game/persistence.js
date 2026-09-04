// v1 persistence — the whole session as one localStorage blob, single device, no
// sync. narrow seam (loadSession/saveSession) so a realtime backend later is a
// change here, not in the components. mapBounds is app config, not user data, so
// the current boundary is re-injected on load rather than trusting the stored copy.
import { SCHEMA_VERSION } from "./model.js";

const STORAGE_KEY = "jetlag-london-seeker/session/v1";

export function loadSession(currentMapBounds) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // drop sessions from an older question/param shape
    if (parsed?.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.questions)) {
      console.warn("[persistence] ignoring incompatible stored session");
      return null;
    }
    return { ...parsed, mapBounds: currentMapBounds ?? parsed.mapBounds };
  } catch (err) {
    console.error("[persistence] load failed", err);
    return null;
  }
}

export function saveSession(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (err) {
    console.error("[persistence] save failed", err);
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error("[persistence] clear failed", err);
  }
}
