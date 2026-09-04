import { useEffect, useMemo, useState } from "react";
import { MapView } from "./components/MapView.jsx";
import { QuestionForm } from "./components/QuestionForm.jsx";
import { QuestionLog } from "./components/QuestionLog.jsx";
import { TransitLegend } from "./components/TransitLegend.jsx";
import { useGameSession } from "./hooks/useGameSession.js";

const LONDON_CENTER = { lat: 51.5072, lng: -0.1276 };

// resolve against the document base so the same build works at the domain root
// and under /<repo>/ on GitHub Pages
const asset = (path) => new URL(path, document.baseURI).href;

const required = (path) =>
  fetch(asset(path)).then((r) => {
    if (!r.ok) throw new Error(`${path} ${r.status}`);
    return r.json();
  });

// overlay data is nice-to-have — if it hasn't been generated, the app still runs
const optional = (path) =>
  fetch(asset(path))
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

const POI_CATEGORIES = [
  "museums", // tentacle + matching
  "libraries",
  "cinemas",
  "hospitals",
  "parks", // matching only (needs `npm run prepare:poi`)
  "golf",
  "consulates",
];

async function loadGeo() {
  const [boundary, boroughs, wards, water, coastline, lines, stations, ...poiList] = await Promise.all([
    required("data/greater-london.geojson"),
    required("data/london-boroughs.geojson"),
    optional("data/wards.geojson"),
    optional("data/water.geojson"),
    optional("data/coastline.geojson"),
    optional("data/tube-lines.geojson"),
    optional("data/stations.geojson"),
    ...POI_CATEGORIES.map((c) => optional(`data/poi/${c}.geojson`)),
  ]);
  const pois = Object.fromEntries(POI_CATEGORIES.map((c, i) => [c, poiList[i]]));
  return { boundary, boroughs, wards, water, coastline, lines, stations, pois };
}

export default function App() {
  const [geo, setGeo] = useState(null);
  const [geoError, setGeoError] = useState(null);

  useEffect(() => {
    loadGeo().then(setGeo).catch((err) => setGeoError(err.message));
  }, []);

  if (geoError) {
    return (
      <div className="fatal">
        <h1>Map data missing</h1>
        <p>
          Could not load the London boundary files (<code>{geoError}</code>).
        </p>
        <p>
          Generate them once with:
          <br />
          <code>npm run prepare:geo</code>
        </p>
      </div>
    );
  }

  if (!geo) {
    return <div className="fatal">Loading London map data…</div>;
  }

  return (
    <Tracker
      boundary={geo.boundary}
      boroughs={geo.boroughs}
      wards={geo.wards}
      water={geo.water}
      coastline={geo.coastline}
      lines={geo.lines}
      stations={geo.stations}
      pois={geo.pois}
    />
  );
}

function Tracker({ boundary, boroughs, wards, water, coastline, lines, stations, pois }) {
  const ctx = useMemo(
    () => ({ pois, boroughs, wards, water, coastline, stations, boundary }),
    [pois, boroughs, wards, water, coastline, stations, boundary]
  );
  const {
    session,
    questions,
    region,
    regionSteps,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    moveQuestion,
    resetSession,
  } = useGameSession(boundary, ctx);

  const [seeker, setSeeker] = useState(() => {
    const last = session.questions[session.questions.length - 1];
    return last ? { lat: last.askedFrom.lat, lng: last.askedFrom.lng } : LONDON_CENTER;
  });
  const [preview, setPreview] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const selectedIndex = useMemo(
    () => questions.findIndex((q) => q.id === selectedId),
    [questions, selectedId]
  );
  const displayRegion =
    selectedIndex >= 0 ? regionSteps[selectedIndex] : region;

  const emptied = region === null;
  const emptiedAt = emptied ? regionSteps.findIndex((s) => s === null) : -1;

  return (
    <div className="app">
      <aside className="sidebar">
        <header className="sidebar-head">
          <h1>London Seeker Tracker</h1>
          <p className="subtitle">Jet Lag: The Game — Hide and Seek</p>
        </header>

        <section className="panel">
          <h2>Seeker position</h2>
          <p className="hint">
            Drag the marker or click the map. This is “asked from” for the next question.
          </p>
          <div className="coord-row">
            <label>
              Lat
              <input
                type="number"
                step="0.0001"
                value={seeker.lat}
                onChange={(e) => setSeeker((s) => ({ ...s, lat: Number(e.target.value) }))}
              />
            </label>
            <label>
              Lng
              <input
                type="number"
                step="0.0001"
                value={seeker.lng}
                onChange={(e) => setSeeker((s) => ({ ...s, lng: Number(e.target.value) }))}
              />
            </label>
          </div>
        </section>

        <QuestionForm
          seeker={seeker}
          pois={pois}
          ctx={ctx}
          onPreviewChange={setPreview}
          onSubmit={(q) => {
            addQuestion(q);
            setSelectedId(null);
          }}
        />

        <QuestionLog
          questions={questions}
          regionSteps={regionSteps}
          selectedId={selectedId}
          emptiedAt={emptiedAt}
          onSelect={setSelectedId}
          onUpdate={updateQuestion}
          onDelete={deleteQuestion}
          onMove={moveQuestion}
        />

        {(lines || stations) && <TransitLegend />}

        <section className="panel">
          <button className="danger" onClick={resetSession}>
            Reset game
          </button>
        </section>
      </aside>

      <main className="map">
        {emptied && (
          <div className="map-banner error">
            No possible region — the answers contradict each other
            {emptiedAt >= 0 ? ` (first at question ${emptiedAt + 1})` : ""}. Check the log.
          </div>
        )}
        {selectedIndex >= 0 && (
          <div className="map-banner info">
            Showing region after question {selectedIndex + 1}.{" "}
            <button className="link" onClick={() => setSelectedId(null)}>
              Show current
            </button>
          </div>
        )}
        <MapView
          boundary={boundary}
          boroughs={boroughs}
          lines={lines}
          stations={stations}
          pois={pois}
          ctx={ctx}
          region={displayRegion}
          seeker={seeker}
          onSeekerChange={setSeeker}
          questions={questions}
          selectedId={selectedId}
          preview={preview}
        />
      </main>
    </div>
  );
}
