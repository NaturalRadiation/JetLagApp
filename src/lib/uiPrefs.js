// small persisted layer for device/UI preferences — sidebar open, map
// interaction mode. kept separate from game/persistence.js: these describe how
// you're currently looking at the app, not anything that happened in the game.
const STORAGE_KEY = "jetlag-london-seeker/ui-prefs/v1";

export function loadUiPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.error("[uiPrefs] load failed", err);
    return null;
  }
}

export function saveUiPrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.error("[uiPrefs] save failed", err);
  }
}
