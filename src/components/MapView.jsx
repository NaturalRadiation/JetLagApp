import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Circle,
  CircleMarker,
  GeoJSON,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import * as turf from "@turf/turf";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { hashJson } from "../lib/hash.js";
import { difference, intersect } from "../game/geometry/turfHelpers.js";
import { bisectorLine, halfPlane } from "../game/geometry/thermometer.js";
import { matchingCell } from "../game/geometry/matching.js";
import { tentacleNearestCell } from "../game/geometry/tentacle.js";
import { TransitLayers } from "./TransitLayers.jsx";
import {
  BASEMAP_MODE,
  CARTO_ATTRIBUTION,
  CARTO_URL,
  pmtilesReachable,
} from "../lib/basemap.js";

// maplibre-gl is ~1 MB, so only pull it in when the vector basemap is used
const MapLibreBasemap = lazy(() => import("./MapLibreBasemap.jsx"));

// fix Leaflet's default marker icon paths under a bundler
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// a few px of click tolerance so thin lines and small dots are tappable on a phone
const canvasRenderer = L.canvas({ tolerance: 6 });

// the possible area is left as plain map; the ruled-out area (mapBounds minus the
// possible region) is masked with translucent green
const RULED_OUT_STYLE = {
  color: "#65a30d",
  weight: 1,
  fillColor: "#86efac",
  fillOpacity: 0.4,
  interactive: false,
};
const PREVIEW_STYLE = {
  color: "#000000",
  weight: 1,
  fillColor: "#0a9843",
  fillOpacity: 0.12,
  interactive: false,
};
const MATCH_CELL_STYLE = {
  color: "#4338ca",
  weight: 2,
  dashArray: "5 4",
  fillColor: "#6366f1",
  fillOpacity: 0.15,
  interactive: false,
};

function FitToBoundary({ boundary }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (import.meta.env.DEV) window.__map = map; // dev-only debug handle
    if (done.current || !boundary) return;
    try {
      const [minX, minY, maxX, maxY] = turf.bbox(boundary);
      map.fitBounds(
        [
          [minY, minX],
          [maxY, maxX],
        ],
        { padding: [16, 16] }
      );
      done.current = true;
    } catch {
      /* ignore */
    }
  }, [boundary, map]);
  return null;
}

function SeekerLayer({ seeker, onSeekerChange, mapMode }) {
  const markerRef = useRef(null);
  // read the mode through a ref so the map click handler always sees the
  // current value, regardless of how react-leaflet re-binds the listener
  const modeRef = useRef(mapMode);
  modeRef.current = mapMode;
  useMapEvents({
    click(e) {
      if (modeRef.current !== "question") return; // "default"/"ruler": tap doesn't move the pin
      onSeekerChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  // the seeker marker is the "asked from" pin — only shown, and movable, in
  // question mode; default and ruler leave the map clear
  if (mapMode !== "question") return null;

  return (
    <Marker
      draggable
      ref={markerRef}
      position={[seeker.lat, seeker.lng]}
      eventHandlers={{
        dragend() {
          const m = markerRef.current;
          if (!m) return;
          const p = m.getLatLng();
          onSeekerChange({ lat: p.lat, lng: p.lng });
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -34]}>
        Seeker
      </Tooltip>
    </Marker>
  );
}

const RULER_COLOR = "#0e7490";
const rulerPinIcon = L.divIcon({ className: "ruler-pin", iconSize: [16, 16] });

// ruler-mode map click: fill A then B, then move whichever point is nearer the
// tap. `linePins` is `pins` with the mid-drag point overridden, so the line and
// (via MapView) the readout follow a pin live while it's dragged.
function RulerLayer({ mapMode, pins, linePins, onChange, onDrag }) {
  const modeRef = useRef(mapMode);
  modeRef.current = mapMode;
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  useMapEvents({
    click(e) {
      if (modeRef.current !== "ruler") return;
      const p = { lat: e.latlng.lat, lng: e.latlng.lng };
      const cur = pinsRef.current;
      if (cur.length < 2) {
        onChange([...cur, p]);
        return;
      }
      const near = (a) => (a.lat - p.lat) ** 2 + (a.lng - p.lng) ** 2;
      onChange(near(cur[0]) <= near(cur[1]) ? [p, cur[1]] : [cur[0], p]);
    },
  });

  // stable position refs: a re-render mid-drag (from onDrag) must not hand the
  // dragged marker a "new" position, or react-leaflet fights Leaflet's own drag
  const positions = useMemo(() => pins.map((p) => [p.lat, p.lng]), [pins]);

  if (mapMode !== "ruler") return null;

  return (
    <>
      {pins.map((p, i) => (
        <Marker
          key={`ruler-${i}`}
          position={positions[i]}
          icon={rulerPinIcon}
          draggable
          eventHandlers={{
            drag(e) {
              const { lat, lng } = e.target.getLatLng();
              onDrag({ index: i, lat, lng });
            },
            dragend(e) {
              const { lat, lng } = e.target.getLatLng();
              onDrag(null);
              onChange((prev) => prev.map((pt, j) => (j === i ? { lat, lng } : pt)));
            },
          }}
        >
          <Tooltip>{i === 0 ? "A" : "B"}</Tooltip>
        </Marker>
      ))}
      {linePins.length === 2 && (
        <Polyline
          positions={linePins.map((p) => [p.lat, p.lng])}
          pathOptions={{ color: RULER_COLOR, weight: 2, dashArray: "6 4" }}
        />
      )}
    </>
  );
}

function PreviewLayer({ preview, ctx }) {
  if (!preview) return null;

  if (preview.kind === "radar" && preview.center && preview.radiusMeters > 0) {
    return (
      <Circle
        center={[preview.center.lat, preview.center.lng]}
        radius={preview.radiusMeters}
        pathOptions={PREVIEW_STYLE}
      />
    );
  }

  if (preview.kind === "thermometer" && (preview.start || preview.end)) {
    const els = [];
    if (preview.start) {
      els.push(
        <CircleMarker
          key="s"
          center={[preview.start.lat, preview.start.lng]}
          radius={6}
          pathOptions={{ color: "#0369a1", fillColor: "#0ea5e9", fillOpacity: 1 }}
        >
          <Tooltip>Thermometer start</Tooltip>
        </CircleMarker>
      );
    }
    if (preview.end) {
      els.push(
        <CircleMarker
          key="e"
          center={[preview.end.lat, preview.end.lng]}
          radius={6}
          pathOptions={{ color: "#b45309", fillColor: "#f59e0b", fillOpacity: 1 }}
        >
          <Tooltip>Thermometer end</Tooltip>
        </CircleMarker>
      );
    }
    if (preview.start && preview.end) {
      const leg = [
        [preview.start.lat, preview.start.lng],
        [preview.end.lat, preview.end.lng],
      ];
      els.push(<Polyline key="leg" positions={leg} pathOptions={{ color: "#334155", weight: 2 }} />);
      try {
        // both shapes reach hundreds of km past London; Leaflet draws them as
        // straight lines in Mercator-projected pixel space, which bows away from
        // the true line over that distance (a few km near London can end up
        // rendered many km off). clip to the boundary, padded a little, so only
        // the short — and so undistorted — part near London ever gets drawn.
        const boundary = ctx?.boundary;
        const clipBox = boundary
          ? (() => {
              const [minX, minY, maxX, maxY] = turf.bbox(boundary);
              const padX = (maxX - minX) * 0.15;
              const padY = (maxY - minY) * 0.15;
              return [minX - padX, minY - padY, maxX + padX, maxY + padY];
            })()
          : null;

        let bis = bisectorLine(preview.start, preview.end);
        if (clipBox) bis = turf.bboxClip(bis, clipBox);
        if ((bis.geometry.coordinates?.length || 0) >= 2) {
          const line = bis.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
          els.push(
            <Polyline key="bis" positions={line} pathOptions={{ ...PREVIEW_STYLE, fillOpacity: 0 }} />
          );
        }

        let hp = halfPlane(preview.start, preview.end, preview.toward || "end");
        if (boundary) hp = intersect(hp, boundary);
        if (hp) {
          els.push(<GeoJSON key={`hp-${hashJson(preview)}`} data={hp} style={() => PREVIEW_STYLE} />);
        }
      } catch {
        /* degenerate (start == end) — skip bisector */
      }
    }
    return <>{els}</>;
  }

  if (preview.kind === "tentacle" && preview.center && preview.searchRadiusMeters > 0) {
    const els = [
      <Circle
        key="search"
        center={[preview.center.lat, preview.center.lng]}
        radius={preview.searchRadiusMeters}
        pathOptions={PREVIEW_STYLE}
      />,
    ];
    if (preview.namedPoi) {
      let cell = null;
      try {
        cell = tentacleNearestCell(
          preview.center,
          preview.searchRadiusMeters,
          preview.candidates || [],
          preview.namedPoi
        );
      } catch {
        /* ignore */
      }
      if (cell?.geometry) {
        els.push(
          <GeoJSON
            key={`cell-${preview.namedPoi.name}-${hashJson(preview.namedPoi)}`}
            data={cell}
            style={() => MATCH_CELL_STYLE}
          />
        );
      }
    }
    for (const p of preview.candidates || []) {
      const named =
        preview.namedPoi && preview.namedPoi.name === p.name && preview.namedPoi.lng === p.lng;
      els.push(
        <CircleMarker
          key={`poi-${p.name}-${p.lng}`}
          center={[p.lat, p.lng]}
          radius={named ? 6 : 3}
          pathOptions={{
            color: "#7c2d12",
            fillColor: named ? "#f59e0b" : "#fed7aa",
            fillOpacity: 1,
          }}
        >
          <Tooltip>{p.name}</Tooltip>
        </CircleMarker>
      );
    }
    return <>{els}</>;
  }

  if (preview.kind === "matching" && preview.center && preview.category) {
    let cell = null;
    try {
      cell = matchingCell(
        { askedFrom: preview.center, params: { category: preview.category } },
        ctx
      );
    } catch {
      /* ignore */
    }
    if (!cell?.cell) return null;
    return (
      <GeoJSON
        key={`match-${preview.category}-${cell.label}`}
        data={cell.cell}
        style={() => MATCH_CELL_STYLE}
      />
    );
  }

  if (preview.kind === "measuring" && preview.center && preview.rKm != null) {
    // cheap preview only — R and the nearest instance; the buffered reach region
    // is expensive, so it waits until the question is logged
    return (
      <>
        <Circle
          key="r"
          center={[preview.center.lat, preview.center.lng]}
          radius={preview.rKm * 1000}
          pathOptions={{ color: "#0369a1", weight: 1.5, dashArray: "4 4", fill: false }}
        />
        {preview.nearest && (
          <>
            <CircleMarker
              key="n"
              center={[preview.nearest.lat, preview.nearest.lng]}
              radius={5}
              pathOptions={{ color: "#0369a1", fillColor: "#38bdf8", fillOpacity: 1 }}
            >
              <Tooltip>nearest — {preview.rKm.toFixed(2)} km</Tooltip>
            </CircleMarker>
            <Polyline
              key="nl"
              positions={[
                [preview.center.lat, preview.center.lng],
                [preview.nearest.lat, preview.nearest.lng],
              ]}
              pathOptions={{ color: "#0369a1", weight: 1, dashArray: "2 4" }}
            />
          </>
        )}
      </>
    );
  }

  return null;
}

export function MapView({
  boundary,
  boroughs,
  wards,
  lines,
  stations,
  pois,
  ctx,
  region,
  seeker,
  onSeekerChange,
  mapMode,
  gpsFix,
  questions,
  selectedId,
  preview,
}) {
  const [vectorUnavailable, setVectorUnavailable] = useState(false);
  const [probe, setProbe] = useState(BASEMAP_MODE === "carto" ? "off" : "pending");
  const handleVectorUnavailable = useCallback(() => setVectorUnavailable(true), []);

  useEffect(() => {
    if (BASEMAP_MODE === "carto") return;
    let alive = true;
    pmtilesReachable().then((ok) => alive && setProbe(ok ? "ok" : "missing"));
    return () => {
      alive = false;
    };
  }, []);

  const useVector =
    !vectorUnavailable &&
    (BASEMAP_MODE === "protomaps" || (BASEMAP_MODE === "auto" && probe === "ok"));

  // tap a rail line to select it (highlight, mute the rest); tap again to clear
  const [selectedLine, setSelectedLine] = useState(null);
  const toggleLine = useCallback(
    (name) => setSelectedLine((cur) => (cur === name ? null : name)),
    []
  );

  // ruler tool: 0-2 dropped points (kept across mode switches, cleared by
  // button); rulerDrag holds a point's live position while it's being dragged
  // so the line + distance track it without re-binding the marker mid-drag
  const [rulerPins, setRulerPins] = useState([]);
  const [rulerDrag, setRulerDrag] = useState(null); // { index, lat, lng } | null
  const effRulerPins =
    rulerDrag != null
      ? rulerPins.map((p, i) =>
          i === rulerDrag.index ? { lat: rulerDrag.lat, lng: rulerDrag.lng } : p
        )
      : rulerPins;
  const rulerKm =
    effRulerPins.length === 2
      ? turf.distance(
          [effRulerPins[0].lng, effRulerPins[0].lat],
          [effRulerPins[1].lng, effRulerPins[1].lat],
          { units: "kilometers" }
        )
      : null;

  // area eliminated so far = whole map minus what's still possible (a null region
  // means everything is ruled out, and difference then returns the full boundary)
  const ruledOut = useMemo(() => difference(boundary, region), [boundary, region]);
  const ruledOutKey = useMemo(() => hashJson(ruledOut), [ruledOut]);

  return (
    <>
      <MapContainer
        center={[seeker.lat, seeker.lng]}
        zoom={10}
        scrollWheelZoom
        preferCanvas
        renderer={canvasRenderer}
        className="leaflet-root"
      >
      {useVector ? (
        <Suspense fallback={null}>
          <MapLibreBasemap flavor="light" onUnavailable={handleVectorUnavailable} />
        </Suspense>
      ) : (
        <TileLayer attribution={CARTO_ATTRIBUTION} url={CARTO_URL} />
      )}
      <FitToBoundary boundary={boundary} />

      {ruledOut && (
        <GeoJSON key={`ruled-out-${ruledOutKey}`} data={ruledOut} style={() => RULED_OUT_STYLE} />
      )}

      <TransitLayers
        lines={lines}
        stations={stations}
        pois={pois}
        boroughs={boroughs}
        wards={wards}
        selectedLine={selectedLine}
        onSelectLine={toggleLine}
      />


      {questions.map((q) => {
        const isThermo = q.type === "thermometer";
        return (
          <Fragment key={q.id}>
            <CircleMarker
              center={[q.askedFrom.lat, q.askedFrom.lng]}
              radius={q.id === selectedId ? 7 : 4}
              pathOptions={{
                color: q.id === selectedId ? "#1d4ed8" : "#475569",
                fillColor: q.id === selectedId ? "#3b82f6" : "#94a3b8",
                fillOpacity: 1,
              }}
            >
              <Tooltip>
                {q.type} → {q.answer}
              </Tooltip>
            </CircleMarker>
            {isThermo && q.params?.start && (
              <Polyline
                positions={[
                  [q.params.start.lat, q.params.start.lng],
                  [q.askedFrom.lat, q.askedFrom.lng],
                ]}
                pathOptions={{ color: "#94a3b8", weight: 1, dashArray: "3 3" }}
              />
            )}
          </Fragment>
        );
      })}

      {/* the unlogged-question preview only makes sense while composing one */}
      {mapMode === "question" && <PreviewLayer preview={preview} ctx={ctx} />}
      <RulerLayer
        mapMode={mapMode}
        pins={rulerPins}
        linePins={effRulerPins}
        onChange={setRulerPins}
        onDrag={setRulerDrag}
      />
      {gpsFix && (
        <>
          <Circle
            center={[gpsFix.lat, gpsFix.lng]}
            radius={gpsFix.accuracy || 0}
            pathOptions={{
              color: "#2563eb",
              weight: 1,
              opacity: 0.4,
              fillColor: "#3b82f6",
              fillOpacity: 0.12,
              interactive: false,
            }}
          />
          <CircleMarker
            center={[gpsFix.lat, gpsFix.lng]}
            radius={7}
            pathOptions={{
              color: "#ffffff",
              weight: 3,
              fillColor: "#2563eb",
              fillOpacity: 1,
              interactive: false,
            }}
          >
            <Tooltip>You{gpsFix.accuracy ? ` (±${Math.round(gpsFix.accuracy)} m)` : ""}</Tooltip>
          </CircleMarker>
        </>
      )}
      <SeekerLayer seeker={seeker} onSeekerChange={onSeekerChange} mapMode={mapMode} />
      </MapContainer>

      {mapMode === "ruler" && (
        <div className="ruler-readout">
          {rulerPins.length < 2 ? (
            <span>Tap the map to place point {rulerPins.length === 0 ? "A" : "B"}</span>
          ) : (
            <span>
              {(rulerKm / 1.609344).toFixed(2)} mi · {rulerKm.toFixed(2)} km
            </span>
          )}
          {gpsFix && (
            <button
              type="button"
              className="link"
              onClick={() =>
                setRulerPins((prev) => {
                  const a = { lat: gpsFix.lat, lng: gpsFix.lng };
                  return prev.length < 2 ? [a, ...prev] : [a, prev[1]];
                })
              }
            >
              A = my location
            </button>
          )}
          {rulerPins.length > 0 && (
            <button type="button" className="link" onClick={() => setRulerPins([])}>
              Clear
            </button>
          )}
        </div>
      )}
    </>
  );
}
