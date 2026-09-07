// floating control cluster over the map — the interaction-mode switch (what a
// tap does) plus the GPS "show my location" toggle. the mobile sidebar has its
// own handle (SidebarHandle), so it isn't toggled from here.
const MODE_BUTTONS = [
  { mode: "default", glyph: "🖐", label: "Pan / look — taps do nothing" },
  { mode: "question", glyph: "📍", label: "Place the asked-from pin on tap" },
  { mode: "ruler", glyph: "📏", label: "Measure — tap to drop two points" },
];

export function MapToolbar({ mode, onModeChange, gpsSupported, gpsOn, onToggleGps }) {
  return (
    <div className="map-toolbar">
      {MODE_BUTTONS.map((b) => (
        <button
          key={b.mode}
          type="button"
          className={mode === b.mode ? "is-active" : ""}
          aria-pressed={mode === b.mode}
          aria-label={b.label}
          title={b.label}
          onClick={() => onModeChange(b.mode)}
        >
          {b.glyph}
        </button>
      ))}
      {gpsSupported && (
        <button
          type="button"
          className={gpsOn ? "gps-toggle is-active" : "gps-toggle"}
          aria-pressed={gpsOn}
          aria-label={gpsOn ? "Hide my location" : "Show my location (GPS)"}
          title={gpsOn ? "Hide my location" : "Show my location (GPS)"}
          onClick={onToggleGps}
        >
          🧭
        </button>
      )}
    </div>
  );
}
