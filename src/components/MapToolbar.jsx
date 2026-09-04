// floating control cluster over the map — the one place mode/action toggles
// live as they're added. right now that's just the mobile sidebar toggle;
// place-seeker/explore/ruler and the GPS button join it in later phases (at
// which point this should render on desktop too, not just isMobile).
export function MapToolbar({ isMobile, sidebarOpen, onToggleSidebar }) {
  if (!isMobile) return null;

  return (
    <div className="map-toolbar">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? "Hide questions panel" : "Show questions panel"}
        title={sidebarOpen ? "Hide questions" : "Show questions"}
      >
        {sidebarOpen ? "✕" : "☰"}
      </button>
    </div>
  );
}
