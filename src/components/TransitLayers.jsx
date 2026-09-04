// toggleable reference overlays: borough boundaries (on) and ward boundaries
// (off), TfL-coloured rail lines and every rail station (both on), plus the seven
// POI categories (off). clicking a line selects it — brought to front, the rest
// muted grey — so a route can be traced end to end. all canvas-rendered so the
// hundreds of markers stay cheap.
import { useEffect, useRef } from "react";
import { GeoJSON, LayersControl } from "react-leaflet";
import L from "leaflet";
import { MODE_LABELS } from "../lib/transit.js";
import { POI_LAYERS } from "../game/questionTypes.js";

const NR_RED = "#c2410c";
const INK = "#1f2937";
const MUTED = "#b9bcc2";

const BOROUGH_STYLE = { color: "#475569", weight: 1.2, fill: false, interactive: false };
// dashed + thinner so wards read as a sub-division of the solid borough lines
const WARD_STYLE = {
  color: "#64748b",
  weight: 0.7,
  opacity: 0.75,
  dashArray: "2 3",
  fill: false,
  interactive: false,
};

function lineStyle(feature, selected) {
  const p = feature.properties;
  const weight = p.underground ? 3.5 : 3;
  const shape = { lineCap: "round", lineJoin: "round" };
  if (!selected) {
    return { color: p.colour || "#666", weight, opacity: 0.9, ...shape };
  }
  if (p.line === selected) {
    return { color: p.colour || "#666", weight: weight + 2.5, opacity: 1, ...shape };
  }
  return { color: MUTED, weight: 2, opacity: 0.3, ...shape };
}

function stationRadius(p) {
  const interchange = p.nr && p.modes.some((m) => m !== "nationalrail");
  return interchange ? 5 : 4;
}

function stationPointToLayer(feature, latlng) {
  const p = feature.properties;
  const nrOnly = p.kind === "nr";
  return L.circleMarker(latlng, {
    radius: stationRadius(p),
    color: nrOnly ? NR_RED : INK,
    weight: 1.5,
    fillColor: "#ffffff",
    fillOpacity: 1,
  });
}

function bindStation(feature, layer) {
  const p = feature.properties;
  const modes = p.modes.map((m) => MODE_LABELS[m] || m).join(" · ");
  const lines = p.lines?.length ? `<br><span class="pop-lines">${p.lines.join(", ")}</span>` : "";
  layer.bindTooltip(p.name);
  layer.bindPopup(
    `<strong>${p.name}</strong><br><span class="pop-modes">${modes}</span>${lines}`
  );
}

const poiPointToLayer = (colour) => (feature, latlng) =>
  L.circleMarker(latlng, {
    radius: 4,
    color: "#ffffff",
    weight: 1,
    fillColor: colour,
    fillOpacity: 1,
  });

function bindPoi(label) {
  return (feature, layer) => {
    const name = feature.properties?.name || "(unnamed)";
    layer.bindTooltip(name);
    layer.bindPopup(`<strong>${name}</strong><br><span class="pop-modes">${label}</span>`);
  };
}

export function TransitLayers({
  lines,
  stations,
  pois,
  boroughs,
  wards,
  selectedLine,
  onSelectLine,
}) {
  const linesRef = useRef(null);
  const stationsRef = useRef(null);

  // restyle + reorder on selection change — react-leaflet's GeoJSON doesn't
  // re-run `style` on prop change, so drive it imperatively
  useEffect(() => {
    const group = linesRef.current;
    if (!group) return;
    group.eachLayer((l) => l.setStyle(lineStyle(l.feature, selectedLine)));
    if (selectedLine) {
      group.eachLayer((l) => {
        if (l.feature.properties.line === selectedLine) l.bringToFront();
      });
    }
    stationsRef.current?.bringToFront(); // keep station dots above the lines
  }, [selectedLine]);

  return (
    <LayersControl position="topright" collapsed>
      {boroughs && (
        <LayersControl.Overlay checked name="Borough boundaries">
          <GeoJSON data={boroughs} style={() => BOROUGH_STYLE} />
        </LayersControl.Overlay>
      )}
      {wards && (
        <LayersControl.Overlay name={`Ward boundaries (${wards.features.length})`}>
          <GeoJSON data={wards} style={() => WARD_STYLE} />
        </LayersControl.Overlay>
      )}
      {lines && (
        <LayersControl.Overlay checked name="Rail lines">
          <GeoJSON
            ref={linesRef}
            data={lines}
            style={(f) => lineStyle(f, selectedLine)}
            onEachFeature={(feature, layer) => {
              layer.bindTooltip(feature.properties.line, { sticky: true });
              layer.on("click", () => onSelectLine(feature.properties.line));
            }}
          />
        </LayersControl.Overlay>
      )}
      {stations && (
        <LayersControl.Overlay checked name={`Stations (${stations.features.length})`}>
          <GeoJSON
            ref={stationsRef}
            data={stations}
            pointToLayer={stationPointToLayer}
            onEachFeature={bindStation}
          />
        </LayersControl.Overlay>
      )}

      {POI_LAYERS.map((c) => {
        const fc = pois?.[c.key];
        if (!fc) return null;
        return (
          <LayersControl.Overlay key={c.key} name={`${c.label} (${fc.features.length})`}>
            <GeoJSON
              data={fc}
              pointToLayer={poiPointToLayer(c.colour)}
              onEachFeature={bindPoi(c.label)}
            />
          </LayersControl.Overlay>
        );
      })}
    </LayersControl>
  );
}
