import { useEffect, useMemo, useState } from "react";
import * as turf from "@turf/turf";
import { METERS_PER_MILE } from "../game/model.js";
import {
  QUESTION_TYPES,
  RADAR_PRESETS,
  THERMOMETER_PRESETS,
  TENTACLE_CATEGORIES,
  TENTACLE_DEFAULT_RADIUS_M,
  MATCHING_CATEGORIES,
  MATCHING_UNAVAILABLE,
  MEASURING_CATEGORIES,
  formatMeters,
} from "../game/questionTypes.js";
import { categoryPoints, poisInRange } from "../game/geometry/tentacle.js";
import { matchingCell } from "../game/geometry/matching.js";
import { measuringDistance } from "../game/geometry/measuring.js";

const KM_PER_MILE = 1.609344;

const TYPE_ORDER = ["radar", "thermometer", "measuring", "matching", "tentacle", "photo"];

const emptyDraft = {
  type: "radar",
  // radar
  radarMode: "preset",
  radarPresetIdx: 2, // "1 mile"
  radarCustomValue: 1,
  radarCustomUnit: "mi",
  radarAnswer: "yes",
  // thermometer
  thermoStart: null,
  thermoEnd: null,
  thermoPreset: "3 miles",
  thermoAnswer: "hotter",
  // tentacle
  tentacleCategory: "museums",
  tentacleRadiusMode: "default",
  tentacleRadiusValue: 1,
  tentacleRadiusUnit: "mi",
  tentacleAnswer: "yes",
  tentaclePoiName: "",
  // matching
  matchCategory: "borough",
  matchAnswer: "yes",
  // measuring
  measureCategory: "stations",
  measureAnswer: "closer",
};

function radarMeters(draft) {
  if (draft.radarMode === "preset") return RADAR_PRESETS[draft.radarPresetIdx]?.meters ?? 0;
  const n = Number(draft.radarCustomValue);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n * (draft.radarCustomUnit === "km" ? 1000 : METERS_PER_MILE);
}

function tentacleRadiusMeters(draft) {
  if (draft.tentacleRadiusMode === "default") return TENTACLE_DEFAULT_RADIUS_M;
  const n = Number(draft.tentacleRadiusValue);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n * (draft.tentacleRadiusUnit === "km" ? 1000 : METERS_PER_MILE);
}

export function QuestionForm({ seeker, pois, ctx, onSubmit, onPreviewChange, onTypeChange }) {
  const [draft, setDraft] = useState(emptyDraft);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // lets the collapsed mobile sheet show what you're about to log, e.g. "Radar"
  useEffect(() => {
    onTypeChange?.(QUESTION_TYPES[draft.type]?.label ?? draft.type);
  }, [draft.type, onTypeChange]);

  const meters = radarMeters(draft);
  const tentacleR = tentacleRadiusMeters(draft);

  const matchValue = useMemo(() => {
    if (draft.type !== "matching") return null;
    try {
      return (
        matchingCell({ askedFrom: seeker, params: { category: draft.matchCategory } }, ctx)?.label ??
        null
      );
    } catch {
      return null;
    }
  }, [draft.type, draft.matchCategory, seeker, ctx]);

  const dataMissing = (spec) => {
    if (!spec) return null;
    if (spec === "wards") return ctx?.wards ? null : { cmd: "prepare:wards" };
    if (spec === "water") return ctx?.water ? null : { cmd: "prepare:water" };
    if (spec === "coastline") return ctx?.coastline ? null : { cmd: "prepare:water" };
    if (spec === "stations") return ctx?.stations ? null : { cmd: "prepare:transit" };
    if (spec.startsWith("poi:")) return ctx?.pois?.[spec.slice(4)] ? null : { cmd: "prepare:poi" };
    return null;
  };

  const matchDataMissing = useMemo(() => {
    if (draft.type !== "matching") return null;
    return dataMissing(MATCHING_CATEGORIES.find((c) => c.key === draft.matchCategory)?.data);
  }, [draft.type, draft.matchCategory, ctx]);

  const measureDef = MEASURING_CATEGORIES.find((c) => c.key === draft.measureCategory);
  const measureDataMissing = useMemo(
    () => (draft.type === "measuring" ? dataMissing(measureDef?.data) : null),
    [draft.type, draft.measureCategory, ctx]
  );
  const measureInfo = useMemo(() => {
    if (draft.type !== "measuring") return null;
    try {
      return measuringDistance(
        { askedFrom: seeker, params: { category: draft.measureCategory } },
        ctx
      );
    } catch {
      return null;
    }
  }, [draft.type, draft.measureCategory, seeker, ctx]);

  const tentacleCandidates = useMemo(() => {
    if (draft.type !== "tentacle" || tentacleR <= 0) return [];
    const pts = categoryPoints(pois?.[draft.tentacleCategory]);
    return poisInRange(seeker, pts, tentacleR); // POIs within the radius of the seeker
  }, [draft.type, draft.tentacleCategory, pois, seeker, tentacleR]);

  const thermoLegMeters = useMemo(() => {
    if (!draft.thermoStart || !draft.thermoEnd) return null;
    return turf.distance(
      [draft.thermoStart.lng, draft.thermoStart.lat],
      [draft.thermoEnd.lng, draft.thermoEnd.lat],
      { units: "meters" }
    );
  }, [draft.thermoStart, draft.thermoEnd]);

  // feed the live preview overlay on the map
  useEffect(() => {
    if (draft.type === "radar") {
      onPreviewChange({ kind: "radar", center: seeker, radiusMeters: meters });
    } else if (draft.type === "thermometer") {
      onPreviewChange({
        kind: "thermometer",
        start: draft.thermoStart,
        end: draft.thermoEnd,
        toward: draft.thermoAnswer === "colder" ? "start" : "end",
      });
    } else if (draft.type === "tentacle") {
      onPreviewChange({
        kind: "tentacle",
        center: seeker,
        searchRadiusMeters: tentacleR,
        category: draft.tentacleCategory,
        candidates: tentacleCandidates,
        namedPoi:
          draft.tentacleAnswer === "yes" && draft.tentaclePoiName
            ? tentacleCandidates.find((p) => p.name === draft.tentaclePoiName) || null
            : null,
      });
    } else if (draft.type === "matching") {
      onPreviewChange({ kind: "matching", center: seeker, category: draft.matchCategory });
    } else if (draft.type === "measuring") {
      onPreviewChange({
        kind: "measuring",
        center: seeker,
        rKm: measureInfo?.rKm ?? null,
        nearest: measureInfo?.nearest ?? null,
      });
    } else {
      onPreviewChange(null);
    }
  }, [
    draft.type,
    draft.thermoStart,
    draft.thermoEnd,
    draft.thermoAnswer,
    draft.tentacleCategory,
    draft.tentacleAnswer,
    draft.tentaclePoiName,
    draft.matchCategory,
    draft.measureCategory,
    measureInfo,
    tentacleR,
    tentacleCandidates,
    meters,
    seeker,
    onPreviewChange,
  ]);

  const typeDef = QUESTION_TYPES[draft.type];
  const active = typeDef?.status === "active";

  const thermoShortfall =
    draft.type === "thermometer" &&
    thermoLegMeters != null &&
    (() => {
      const preset = THERMOMETER_PRESETS.find((p) => p.label === draft.thermoPreset);
      return preset && thermoLegMeters < preset.meters ? preset : null;
    })();

  function submit(e) {
    e.preventDefault();
    const now = Date.now();

    if (draft.type === "radar") {
      if (meters <= 0) return;
      onSubmit({
        type: "radar",
        askedFrom: { ...seeker, timestamp: now },
        params: {
          radiusMeters: meters,
          preset:
            draft.radarMode === "preset" ? RADAR_PRESETS[draft.radarPresetIdx]?.label ?? null : null,
        },
        answer: draft.radarAnswer,
      });
      return;
    }

    if (draft.type === "thermometer") {
      if (!draft.thermoStart || !draft.thermoEnd) return;
      onSubmit({
        type: "thermometer",
        askedFrom: { ...draft.thermoEnd, timestamp: now },
        params: {
          start: draft.thermoStart,
          end: draft.thermoEnd,
          distancePreset: draft.thermoPreset,
        },
        answer: draft.thermoAnswer,
      });
      setDraft((d) => ({ ...d, thermoStart: null, thermoEnd: null }));
      return;
    }

    if (draft.type === "tentacle") {
      if (tentacleR <= 0) return;
      const named =
        draft.tentacleAnswer === "yes" && draft.tentaclePoiName
          ? tentacleCandidates.find((p) => p.name === draft.tentaclePoiName)
          : null;
      onSubmit({
        type: "tentacle",
        askedFrom: { ...seeker, timestamp: now },
        params: {
          category: draft.tentacleCategory,
          searchRadiusMeters: tentacleR,
          ...(named ? { namedPoi: { name: named.name, lng: named.lng, lat: named.lat } } : {}),
        },
        answer: draft.tentacleAnswer,
      });
      setDraft((d) => ({ ...d, tentaclePoiName: "" }));
      return;
    }

    if (draft.type === "matching") {
      onSubmit({
        type: "matching",
        askedFrom: { ...seeker, timestamp: now },
        params: { category: draft.matchCategory, seekerValue: matchValue },
        answer: draft.matchAnswer,
      });
      return;
    }

    if (draft.type === "measuring") {
      onSubmit({
        type: "measuring",
        askedFrom: { ...seeker, timestamp: now },
        params: {
          category: draft.measureCategory,
          seekerKm: measureInfo?.rKm ?? null,
        },
        answer: draft.measureAnswer,
      });
    }
  }

  return (
    <section className="panel">
      <h2>Log a question</h2>

      <label className="field">
        Type
        <select value={draft.type} onChange={(e) => set({ type: e.target.value })}>
          {TYPE_ORDER.map((t) => {
            const d = QUESTION_TYPES[t];
            const usable = d.status === "active";
            return (
              <option key={t} value={t} disabled={!usable}>
                {d.label}
                {d.status === "planned" ? " — coming soon" : ""}
                {d.status === "informational" ? " — no map effect" : ""}
              </option>
            );
          })}
        </select>
      </label>
      <p className="hint">{typeDef?.blurb}</p>

      {!active && (
        <p className="notice">
          {typeDef?.status === "planned"
            ? `Not implemented yet — ${typeDef.plannedIn}.`
            : "This question type has no effect on the London map; log it in notes if you like."}
        </p>
      )}

      {draft.type === "radar" && (
        <form onSubmit={submit}>
          <fieldset className="field">
            <legend>Radius</legend>
            <label className="radio">
              <input
                type="radio"
                checked={draft.radarMode === "preset"}
                onChange={() => set({ radarMode: "preset" })}
              />
              Preset
            </label>
            <select
              disabled={draft.radarMode !== "preset"}
              value={draft.radarPresetIdx}
              onChange={(e) => set({ radarPresetIdx: Number(e.target.value) })}
            >
              {RADAR_PRESETS.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
            <label className="radio">
              <input
                type="radio"
                checked={draft.radarMode === "custom"}
                onChange={() => set({ radarMode: "custom" })}
              />
              Custom
            </label>
            <span className="inline">
              <input
                type="number"
                min="0"
                step="0.1"
                disabled={draft.radarMode !== "custom"}
                value={draft.radarCustomValue}
                onChange={(e) => set({ radarCustomValue: e.target.value })}
              />
              <select
                disabled={draft.radarMode !== "custom"}
                value={draft.radarCustomUnit}
                onChange={(e) => set({ radarCustomUnit: e.target.value })}
              >
                <option value="mi">mi</option>
                <option value="km">km</option>
              </select>
            </span>
          </fieldset>

          <AnswerButtons
            options={[
              ["yes", "Yes (inside)"],
              ["no", "No (outside)"],
              ["null", "No answer"],
            ]}
            value={draft.radarAnswer}
            onChange={(v) => set({ radarAnswer: v })}
          />

          <p className="hint">
            Circle: {formatMeters(meters)} radius, centred on the seeker.
          </p>
          <button type="submit" disabled={meters <= 0}>
            Log radar question
          </button>
        </form>
      )}

      {draft.type === "thermometer" && (
        <form onSubmit={submit}>
          <div className="capture-row">
            <button type="button" onClick={() => set({ thermoStart: { ...seeker } })}>
              Capture start
            </button>
            <CoordChip point={draft.thermoStart} onClear={() => set({ thermoStart: null })} />
          </div>
          <div className="capture-row">
            <button type="button" onClick={() => set({ thermoEnd: { ...seeker } })}>
              Capture end
            </button>
            <CoordChip point={draft.thermoEnd} onClear={() => set({ thermoEnd: null })} />
          </div>

          <label className="field">
            Minimum travel (informational)
            <select
              value={draft.thermoPreset}
              onChange={(e) => set({ thermoPreset: e.target.value })}
            >
              {THERMOMETER_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label} ({p.sizes})
                </option>
              ))}
            </select>
          </label>

          {thermoLegMeters != null && (
            <p className="hint">
              Leg travelled: {(thermoLegMeters / METERS_PER_MILE).toFixed(2)} mi
              {thermoShortfall ? ` — below the ${thermoShortfall.label} minimum` : ""}
            </p>
          )}

          <AnswerButtons
            options={[
              ["hotter", "Hotter (nearer)"],
              ["colder", "Colder (further)"],
              ["null", "No answer"],
            ]}
            value={draft.thermoAnswer}
            onChange={(v) => set({ thermoAnswer: v })}
          />

          <button type="submit" disabled={!draft.thermoStart || !draft.thermoEnd}>
            Log thermometer question
          </button>
        </form>
      )}

      {draft.type === "tentacle" && (
        <form onSubmit={submit}>
          <label className="field">
            Category
            <select
              value={draft.tentacleCategory}
              onChange={(e) => set({ tentacleCategory: e.target.value, tentaclePoiName: "" })}
            >
              {TENTACLE_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="field">
            <legend>Search radius (from the seeker)</legend>
            <label className="radio">
              <input
                type="radio"
                checked={draft.tentacleRadiusMode === "default"}
                onChange={() => set({ tentacleRadiusMode: "default" })}
              />
              1 mile (London default)
            </label>
            <label className="radio">
              <input
                type="radio"
                checked={draft.tentacleRadiusMode === "custom"}
                onChange={() => set({ tentacleRadiusMode: "custom" })}
              />
              Custom
            </label>
            <span className="inline">
              <input
                type="number"
                min="0"
                step="0.1"
                disabled={draft.tentacleRadiusMode !== "custom"}
                value={draft.tentacleRadiusValue}
                onChange={(e) => set({ tentacleRadiusValue: e.target.value })}
              />
              <select
                disabled={draft.tentacleRadiusMode !== "custom"}
                value={draft.tentacleRadiusUnit}
                onChange={(e) => set({ tentacleRadiusUnit: e.target.value })}
              >
                <option value="mi">mi</option>
                <option value="km">km</option>
              </select>
            </span>
          </fieldset>

          {!pois?.[draft.tentacleCategory] && (
            <p className="notice">
              No {draft.tentacleCategory} data yet — run <code>npm run prepare:poi</code>.
            </p>
          )}

          <AnswerButtons
            options={[
              ["yes", "Named a place"],
              ["no", "Outside the radius"],
              ["null", "No answer"],
            ]}
            value={draft.tentacleAnswer}
            onChange={(v) => set({ tentacleAnswer: v })}
          />

          {draft.tentacleAnswer === "yes" && (
            <label className="field">
              Which place did they name? (optional — narrows the zone)
              <select
                value={draft.tentaclePoiName}
                onChange={(e) => set({ tentaclePoiName: e.target.value })}
              >
                <option value="">— not recorded —</option>
                {tentacleCandidates.map((p) => (
                  <option key={`${p.name}-${p.lng}`} value={p.name}>
                    {p.name} · {(p.distance / METERS_PER_MILE).toFixed(2)} mi
                  </option>
                ))}
              </select>
            </label>
          )}

          <p className="hint">
            {tentacleCandidates.length}{" "}
            {TENTACLE_CATEGORIES.find((c) => c.key === draft.tentacleCategory)?.label.toLowerCase()}{" "}
            within {formatMeters(tentacleR)} of the seeker.
          </p>
          <button type="submit" disabled={tentacleR <= 0}>
            Log tentacle question
          </button>
        </form>
      )}

      {draft.type === "matching" && (
        <form onSubmit={submit}>
          <label className="field">
            Category
            <select
              value={draft.matchCategory}
              onChange={(e) => set({ matchCategory: e.target.value })}
            >
              {MATCHING_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label} — {c.note}
                </option>
              ))}
            </select>
          </label>

          <p className="hint">
            Seeker's{" "}
            {MATCHING_CATEGORIES.find((c) => c.key === draft.matchCategory)?.label.toLowerCase()}:{" "}
            <strong>{matchValue ?? "—"}</strong>
            {matchDataMissing && (
              <>
                {" "}
                — no data, run <code>npm run {matchDataMissing.cmd}</code>
              </>
            )}
          </p>

          <AnswerButtons
            options={[
              ["yes", "Same"],
              ["no", "Different"],
              ["null", "No answer"],
            ]}
            value={draft.matchAnswer}
            onChange={(v) => set({ matchAnswer: v })}
          />

          <details className="hint">
            <summary>Other match categories (not usable for a London map)</summary>
            <ul>
              {MATCHING_UNAVAILABLE.map(([name, why]) => (
                <li key={name}>
                  <strong>{name}</strong> — {why}
                </li>
              ))}
            </ul>
          </details>

          <button type="submit" disabled={draft.matchAnswer !== "null" && !matchValue}>
            Log matching question
          </button>
        </form>
      )}

      {draft.type === "measuring" && (
        <form onSubmit={submit}>
          <label className="field">
            Category
            <select
              value={draft.measureCategory}
              onChange={(e) => set({ measureCategory: e.target.value })}
            >
              {MEASURING_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          {measureDef?.note && <p className="notice">{measureDef.note}.</p>}

          <p className="hint">
            {measureDataMissing ? (
              <>
                No data — run <code>npm run {measureDataMissing.cmd}</code>
              </>
            ) : measureInfo?.rKm != null ? (
              <>
                Seeker's nearest {measureDef?.label.toLowerCase()}:{" "}
                <strong>
                  {(measureInfo.rKm / KM_PER_MILE).toFixed(2)} mi ({measureInfo.rKm.toFixed(2)} km)
                </strong>{" "}
                away — "closer" keeps everywhere within that of{" "}
                {measureDef?.kind === "geom" ? "the category" : "an instance"}.
              </>
            ) : (
              <>Move the seeker onto the map to measure.</>
            )}
          </p>

          <AnswerButtons
            options={[
              ["closer", "Closer"],
              ["further", "Further"],
              ["null", "No answer"],
            ]}
            value={draft.measureAnswer}
            onChange={(v) => set({ measureAnswer: v })}
          />

          <button
            type="submit"
            disabled={
              draft.measureAnswer !== "null" && (measureDataMissing || measureInfo?.rKm == null)
            }
          >
            Log measuring question
          </button>
        </form>
      )}

      {!active && (
        <button
          type="button"
          onClick={() =>
            onSubmit({
              type: draft.type,
              askedFrom: { ...seeker, timestamp: Date.now() },
              params: {},
              answer: "null",
            })
          }
        >
          Log {typeDef?.label} (no map effect)
        </button>
      )}
    </section>
  );
}

function AnswerButtons({ options, value, onChange }) {
  return (
    <div className="answers">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          className={value === v ? "answer active" : "answer"}
          onClick={() => onChange(v)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function CoordChip({ point, onClear }) {
  if (!point) return <span className="coord-chip empty">not set</span>;
  return (
    <span className="coord-chip">
      {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
      <button type="button" className="link" onClick={onClear}>
        clear
      </button>
    </span>
  );
}
