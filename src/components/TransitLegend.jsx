// collapsible key for the map overlays — line colours, station symbols, POI colours
import { LINE_COLOURS, OVERGROUND_LINE_COLOURS, UNDERGROUND_LINES } from "../lib/transit.js";
import { POI_LAYERS } from "../game/questionTypes.js";

const ORDER = [
  ...[...UNDERGROUND_LINES],
  "DLR",
  ...Object.keys(OVERGROUND_LINE_COLOURS),
  "Elizabeth line",
  "Tramlink",
  "IFS Cloud Cable Car",
];

export function TransitLegend({ open = false }) {
  return (
    <details className="panel legend" open={open}>
      <summary>Rail overlay key</summary>

      <ul className="legend-lines">
        {ORDER.map((name) => (
          <li key={name}>
            <span className="swatch" style={{ background: LINE_COLOURS[name] }} />
            {name}
          </li>
        ))}
      </ul>

      <div className="legend-stations">
        <span>
          <span className="dot tfl" /> Tube / DLR / etc.
        </span>
        <span>
          <span className="dot nr" /> National Rail
        </span>
      </div>

      <div className="legend-poi">
        {POI_LAYERS.map((c) => (
          <span key={c.key}>
            <span className="dot" style={{ background: c.colour, borderColor: "#fff" }} /> {c.label}
          </span>
        ))}
      </div>

      <p className="hint">
        POI layers are off by default — turn them on in the map's layers control.
        Click any line, station or place for its name.
      </p>
    </details>
  );
}
