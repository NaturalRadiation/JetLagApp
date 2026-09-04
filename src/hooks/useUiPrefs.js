// persisted sidebar-open + map-interaction-mode state, so a returning visitor
// keeps their layout rather than starting from scratch each time.
// mapMode isn't consumed by the map yet — MapView's SeekerLayer still always
// places the seeker on tap — it's wired and persisted now so the mode-gated
// interactions (place seeker / explore / ruler) have it ready to plug into.
import { useEffect, useState } from "react";
import { loadUiPrefs, saveUiPrefs } from "../lib/uiPrefs.js";

export function useUiPrefs(isMobile) {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = loadUiPrefs();
    // no stored preference yet: open on desktop (today's behaviour), collapsed
    // on a phone-width screen (there's no room to show it and the map both)
    return stored?.sidebarOpen ?? !isMobile;
  });
  const [mapMode, setMapMode] = useState(() => loadUiPrefs()?.mapMode ?? "placeSeeker");

  useEffect(() => {
    saveUiPrefs({ sidebarOpen, mapMode });
  }, [sidebarOpen, mapMode]);

  return { sidebarOpen, setSidebarOpen, mapMode, setMapMode };
}
