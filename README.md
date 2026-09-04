# London Seeker Tracker — Jet Lag: The Game (Hide and Seek)

A single-device web app for **seekers**. As you log the questions you ask the
hider, an interactive map of Greater London narrows to the region where the
hider could still be.

Ruleset: <https://www.lifack.ch/docs/seeking/>

## Status

| Step | Scope | State |
|---|---|---|
| **1** | Static London map + borough boundaries; reducer for **radar** + **thermometer** | ✅ |
| **2** | **Matching** — admin divisions, airport, station-name length, POI Voronoi | ✅ |
| **3** | **Measuring** — points, water, borders, coastline | ✅ |
| **4** | **Tentacle** compound queries + POI overlay layers | ✅ |
| 5 | Log edit/delete polish, null-answer handling, greyed-out inapplicable types | partial |

All five map-affecting question types (radar, thermometer, matching, tentacle,
**measuring**) are wired end to end. Photo is logged with no map effect.

## Measuring (step 3)

"Compared to me, are you closer to or further from [category]?" Distance is each
player's own distance to their own nearest instance:

```
R      = the seeker's distance to their nearest instance
reach  = everywhere within R of any instance
closer  → intersect the region with reach
further → subtract reach from the region
```

| Category | Geometry | Data |
|---|---|---|
| **Rail station** | one circle per station (~712), unioned | `stations.geojson` |
| **Commercial airport** | circle per airport — all **six** count (house rule) | hard-coded |
| **Museum / Library / Movie theatre / Hospital / Park / Golf course / Foreign consulate** | circle per POI, unioned | `public/data/poi/*.geojson` |
| **Body of water** | buffer the Thames / canals / docks / reservoirs / named lakes; inside a water polygon = distance 0 | `water.geojson` — `npm run prepare:water` |
| **Borough border** / **Ward border** | `polygonToLine` the borough / ward layer once, buffer the lines | derived from `london-boroughs.geojson` / `wards.geojson` |
| **Coastline** | England's real coast — the Thames Estuary shores, ~20–60 km SE. None inside Greater London (the tidal Thames is never a mile wide), so `prepare-water` fetches `natural=coastline` wide and drops anything within 8 km of the boundary | `coastline.geojson` — `npm run prepare:water` |

**Performance.** The live form/preview only computes `R` and the nearest point
(`measuringDistance`) — a few ms — so switching categories and dragging the
seeker stay snappy. The `reach` polygon is built once when the question is
logged (0.4–1.7 s, then cached per category + rounded-up R):

- point categories — a circle per instance, unioned.
- water / coastline — the OSM data is thousands of fragments, so at load their
  vertices are grid-sampled (water 0.5 km, coastline 2 km) and `reach` is a
  distance-field grid + `turf.isobands`. Buffering the raw geometry / a 40 km
  circle union froze the app; this doesn't.
- borough / ward borders — buffer the boundary *lines* (simplified to ~120 m /
  ~250 m), never the polygons.

`prepare-water.mjs` fetches `water.geojson` (`natural=water`, reservoirs,
`waterway=riverbank/canal/dock`) and `coastline.geojson` (`natural=coastline`,
Thames-bank segments removed); hand-drawn seeds (`npm run seed:water`) ship so
both work before you fetch. Core bundle ~221 KB gzip.

## Matching (step 2)

"Is your nearest [category] the same as mine?" → find the cell the seeker is in,
then `yes` intersects the region with it, `no` subtracts it.

| Category | Cell | Data |
|---|---|---|
| **Borough** (3rd division) | the borough polygon containing the seeker — exact | `london-boroughs.geojson` (committed) |
| **Ward** (4th division) | the ward polygon containing the seeker — exact | `wards.geojson` — `npm run prepare:wards` |
| **Commercial airport** | Voronoi cell of the nearest of **six** airports (Heathrow, Gatwick, Stansted, Luton, London City, Southend), as boundary ∩ half-planes | hard-coded in `matching.js` |
| **Station name's length** | union of the Voronoi cells of every station whose name has the same character count as the seeker's nearest | `stations.geojson` — `npm run prepare:transit` |
| **Museum / Library / Movie theatre / Hospital / Park / Golf course / Foreign consulate** | `turf.voronoi` cell of the seeker's nearest instance, clipped to the boundary | `public/data/poi/*.geojson` — `npm run prepare:poi` |

Voronoi tessellations and clipped cells are cached per dataset (see
`src/game/geometry/voronoi.js`). "Station name's length" counts every character
in the name after stripping parentheticals and a trailing "station" — tweak
`stationNameLength` in `matching.js`.

Wards are `martinjc/UK-GeoJSON` (2013 vintage). Parks / golf / consulates were
added to `prepare:poi` (named parks only; honorary consulates excluded); a
hand-entered seed set ships so everything works before you run it. The remaining
ruleset nouns (1st/2nd division, transit line, street, mountain, landmass,
zoo/aquarium/amusement park) don't inform a London map and are listed, greyed,
in the question form.

## Tentacle (step 4)

"Within [radius] of me, which [category] are you nearest to?" — for London /
medium games both radii are **1 mile** (default), with a custom-radius option.
Categories: **Museums, Libraries, Movie theatres, Hospitals**.

Region = `circle(askedFrom, R1) ∩ ⋃ circle(poi, R2)` over the category.
A named POI narrows to just that one; "not within reach" subtracts the whole
compound. Only POIs within `R1 + R2` of the seeker are considered, so it stays a
few milliseconds and **cannot time out or crash** — it never touches the network.

POI data is `public/data/poi/*.geojson` — `museums, libraries, cinemas,
hospitals` (Tentacle + Matching) plus `parks, golf, consulates` (Matching only):

- `npm run prepare:poi` — one Overpass query per category, clipped to the
  boundary, saved and (you) committed. Run once on a normal connection; raw
  responses are vendored under `raw/overpass/` for offline rebuilds. Options:
  `-- --endpoint=<url>`, `-- --refresh`, `-- --pad=<km>`.
- `npm run seed:poi` — writes a small hand-entered real-POI set (all seven
  categories) so the features work before you've run `prepare:poi`, which
  overwrites it.

The four Tentacle categories also get their own **map layers-control toggle** (off by default),
with matching colours in the sidebar key.

## Run

```bash
npm install
npm run dev
```

That's it — the app runs entirely off the static files committed under
`public/data/*.geojson` and `public/london.pmtiles`. `npm run build` (and the
GitHub Pages deploy) likewise need nothing generated.

### Regenerating the static data (optional)

The `scripts/prepare-*.mjs` / `seed-*.mjs` tools and their vendored source data
(`raw/`) are **git-ignored** — they only exist to rebuild the committed data and
aren't needed to build or serve the app. If you have them locally:

```bash
npm run prepare:geo     # public/data/{greater-london,london-boroughs}.geojson from raw/
npm run prepare:transit # public/data/{tube-lines,stations}.geojson from raw/
npm run prepare:wards   # public/data/wards.geojson from raw/
npm run prepare:water   # public/data/{water,coastline}.geojson via Overpass
npm run prepare:poi     # public/data/poi/*.geojson via Overpass   (seed:poi / seed:water for offline seeds)
npm run prepare:basemap # public/london.pmtiles (needs the pmtiles CLI)
```

Commit whatever they produce; that committed output is the source of truth.

## Rail overlay

`public/data/tube-lines.geojson` (one TfL-coloured MultiLineString per line) and
`public/data/stations.geojson` (every Tube / DLR / Overground / Elizabeth line /
tram / National Rail station in Greater London — the valid hiding points) are
generated by `scripts/prepare-transit.mjs` from Oliver O'Brien's TubeCreature
dataset ([github.com/oobrien/vis](https://github.com/oobrien/vis)), vendored
under `raw/oobrien-vis/` and pinned to a commit. "Up to date" doesn't matter —
these are fixed play locations, so the files are committed and the app needs no
network for them.

Lines and stations each get a toggle in the map's layers control, stations are
clickable for their details, and there's a colour key in the sidebar.
**Tapping a line selects it** — that line is brought to the front and every
other line is muted to faint grey so a route can be traced end to end; a chip
names it, tap again (or "show all lines") to clear. `npm run prepare:transit --
--fetch` refreshes the raw files; `-- --pad=<km>` changes the National Rail clip
buffer around the boundary (default 1).

### London Overground → six named lines

The source predates the Nov 2024 rename, so every Overground segment is tagged
`"London Overground"`. `prepare-transit.mjs` re-assigns each segment (and
station) to one of the six lines — Lioness, Mildmay, Windrush, Weaver,
Suffragette, Liberty — by which route corridor it runs closest to, using the
station lists in `OVERGROUND_LINE_STATIONS` (`src/lib/transit.js`). Shared track
(e.g. Highbury & Islington–Canonbury) is assigned to every line that uses it.
Colours are TfL's 2024 line colours in `OVERGROUND_LINE_COLOURS` — edit there if
you want different hexes.

## Basemap

Primary basemap is **Protomaps**: one self-hosted `public/london.pmtiles` vector
archive, rendered by MapLibre GL mounted as a single non-interactive Leaflet
layer, so all the react-leaflet overlays keep working. No API key, no tile
server, works offline once cached.

Needs the `pmtiles` CLI. Easiest cross-platform route: download the archive for
your OS from <https://github.com/protomaps/go-pmtiles/releases> and unzip the
binary into `./tools/` (`tools/pmtiles.exe` on Windows). The script also accepts
it on `PATH` (`brew install protomaps/tap/pmtiles`, `scoop install pmtiles`).

```bash
npm run prepare:basemap                     # ~15-35 MB at z14; commit the file
npm run prepare:basemap -- --maxzoom=13     # smaller
```

On Windows PowerShell, fetching the binary is:

```powershell
mkdir tools -Force
Invoke-WebRequest "https://github.com/protomaps/go-pmtiles/releases/download/v1.31.2/go-pmtiles_1.31.2_Windows_x86_64.zip" -OutFile tools\p.zip
Expand-Archive tools\p.zip -DestinationPath tools -Force; del tools\p.zip
npm run prepare:basemap
```

`prepare:basemap` derives the London bbox from `public/data/greater-london.geojson`,
then runs `pmtiles extract` against the Protomaps daily planet build over HTTP
range requests (downloads only the London window). Commit `public/london.pmtiles`
so GitHub Pages serves it.

**Fallback:** if `london.pmtiles` is missing or unreadable, the app falls back at
runtime to CARTO raster tiles and never downloads the ~1 MB MapLibre chunk.
Override with `VITE_PMTILES_URL=<url>` (e.g. an R2/S3 bucket) or force a mode
with `VITE_BASEMAP=carto|protomaps` (default `auto`).

Attribution (wired into the map): © OpenStreetMap, © Protomaps / © CARTO.

## Deploy — GitHub Pages

`.github/workflows/deploy.yml` builds and publishes on every push to `main`.

1. Push the repo to GitHub.
2. Settings → Pages → **Source: GitHub Actions**.
3. Done: `https://<user>.github.io/<repo>/` — share that link.

`vite.config.js` sets `base: "./"` so the build works under the
`/<repo>/` path without hard-coding the repo name. `public/.nojekyll` keeps
Pages from mangling the asset folder. GitHub Pages serves HTTP range requests,
which is what makes the single-file `.pmtiles` work.

> **Mobile layout is still TODO.** The current UI is a fixed 400px sidebar +
> map — fine on desktop, unusable on a phone. A responsive pass (bottom sheet /
> collapsible panel) is the next task before sharing the link around.

## Architecture

**State is an ordered question log, not a stored polygon.** The possible hider
region is *derived* by replaying the log through a pure reducer, so editing,
reordering, or deleting any past question is just "recompute from there".

```
GameSession { mapBounds, questions: [ { id, type, askedFrom, params, answer } ] }
possibleRegion = questions.reduce(applyQuestion, mapBounds)
```

| Concern | File |
|---|---|
| Data model (plain JSON, serialisable) | `src/game/model.js` |
| Log mutations (pure, the sync seam) | `src/game/session.js` |
| Reducer / replay | `src/game/reducer.js` |
| Per-type geometry | `src/game/geometry/{radar,thermometer}.js` |
| Turf v7 boolean-op wrappers | `src/game/geometry/turfHelpers.js` |
| Type registry + ruleset constants | `src/game/questionTypes.js` |
| Persistence (localStorage today) | `src/game/persistence.js` |
| React binding | `src/hooks/useGameSession.js` |
| Map | `src/components/MapView.jsx` |

### Geometry

- **Radar** — circle at `askedFrom`; `yes` → intersect, `no` → difference.
- **Thermometer** — perpendicular bisector of the start→end leg splits the map;
  `hotter` keeps the half nearer the end point, `colder` the half nearer the
  start. Realised as an intersect with a large half-plane rectangle. Planar-style
  perpendicular at London scale — fine for the game.

All boolean ops go through Turf.js. A step that errors fails **open** (region
unchanged) so a bad question can't silently wipe the map. An intentionally empty
result is `null` and every later step passes it through; the UI flags which
question first emptied the region.

## Designed for later (not built yet)

Multiple seekers on separate devices, live-synced, plus a read-only hider view.
The log is a plain ordered array and every mutation is a pure function in
`session.js`, so this is a data-layer swap (e.g. Supabase realtime + room code),
not a rewrite. `mapBounds` is treated as app config and re-injected on load; a
sync host would broadcast it with the log.
