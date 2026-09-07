// persisted device/UI state, so a returning visitor keeps their layout, map
// mode, room membership and a stable identity rather than starting fresh.
import { useEffect, useState } from "react";
import { loadUiPrefs, saveUiPrefs } from "../lib/uiPrefs.js";

// what a tap on the map does: "default" nothing (pan/zoom only), "question"
// moves the seeker's asked-from pin, "ruler" places measuring pins. "question"
// is the default so today's behaviour is unchanged.
export const MAP_MODES = ["default", "question", "ruler"];

function makeId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  }
}

export function useUiPrefs(isMobile) {
  const [stored] = useState(loadUiPrefs); // read once

  const [sidebarOpen, setSidebarOpen] = useState(() => stored?.sidebarOpen ?? !isMobile);
  const [mapMode, setMapMode] = useState(() =>
    MAP_MODES.includes(stored?.mapMode) ? stored.mapMode : "question"
  );
  // { code, role, name } | null — the room this device is in
  const [room, setRoom] = useState(() => stored?.room ?? null);
  // per-tab presence identity — not persisted, so each tab is its own member and
  // a refresh gets a fresh id (the old presence entry drops on disconnect)
  const [clientId] = useState(makeId);

  useEffect(() => {
    saveUiPrefs({ sidebarOpen, mapMode, room });
  }, [sidebarOpen, mapMode, room]);

  return {
    sidebarOpen,
    setSidebarOpen,
    mapMode,
    setMapMode,
    room,
    setRoom,
    clientId,
  };
}
