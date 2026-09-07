// persisted sidebar-open + map-interaction-mode state, so a returning visitor
// keeps their layout rather than starting from scratch each time.
import { useEffect, useState } from "react";
import { loadUiPrefs, saveUiPrefs } from "../lib/uiPrefs.js";

// what a tap on the map does: "default" nothing (pan/zoom only), "question"
// moves the seeker's asked-from pin, "ruler" places measuring pins (added with
// the ruler tool). "question" is the default so today's behaviour is unchanged.
export const MAP_MODES = ["default", "question", "ruler"];

export function useUiPrefs(isMobile) {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = loadUiPrefs();
    // no stored preference yet: open on desktop (today's behaviour), collapsed
    // on a phone-width screen (there's no room to show it and the map both)
    return stored?.sidebarOpen ?? !isMobile;
  });
  const [mapMode, setMapMode] = useState(() => {
    const stored = loadUiPrefs()?.mapMode;
    return MAP_MODES.includes(stored) ? stored : "question";
  });

  useEffect(() => {
    saveUiPrefs({ sidebarOpen, mapMode });
  }, [sidebarOpen, mapMode]);

  return { sidebarOpen, setSidebarOpen, mapMode, setMapMode };
}
