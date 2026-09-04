import * as turf from "@turf/turf";
import { ANSWERS_BY_TYPE } from "../game/model.js";
import { QUESTION_TYPES } from "../game/questionTypes.js";

const ANSWER_LABELS = {
  yes: "yes",
  no: "no",
  hotter: "hotter",
  colder: "colder",
  closer: "closer",
  further: "further",
  null: "no answer",
};

function regionAreaKm2(region) {
  if (!region) return 0;
  try {
    return turf.area(region) / 1e6;
  } catch {
    return 0;
  }
}

export function QuestionLog({
  questions,
  regionSteps,
  selectedId,
  emptiedAt,
  onSelect,
  onUpdate,
  onDelete,
  onMove,
}) {
  return (
    <section className="panel">
      <h2>Question log ({questions.length})</h2>
      {questions.length === 0 && <p className="hint">No questions yet. Log one above.</p>}

      <ol className="qlog">
        {questions.map((q, i) => {
          const def = QUESTION_TYPES[q.type];
          const answers = ANSWERS_BY_TYPE[q.type] || ["null"];
          const stepRegion = regionSteps[i];
          const isEmptyHere = stepRegion === null;
          const selected = q.id === selectedId;
          return (
            <li
              key={q.id}
              className={
                "qlog-row" +
                (selected ? " selected" : "") +
                (isEmptyHere ? " emptied" : "") +
                (emptiedAt >= 0 && i > emptiedAt ? " downstream" : "")
              }
            >
              <div className="qlog-main" onClick={() => onSelect(selected ? null : q.id)}>
                <span className="qlog-idx">{i + 1}</span>
                <span className="qlog-body">
                  <strong>{def?.label ?? q.type}</strong>{" "}
                  <span className="qlog-summary">{def?.summarize ? def.summarize(q) : ""}</span>
                  <span className="qlog-meta">
                    from {q.askedFrom.lat.toFixed(4)}, {q.askedFrom.lng.toFixed(4)}
                    {" · "}
                    {isEmptyHere ? "region empty" : `${regionAreaKm2(stepRegion).toFixed(1)} km²`}
                  </span>
                </span>
              </div>

              <div className="qlog-controls">
                <select
                  value={q.answer}
                  onChange={(e) => onUpdate(q.id, { answer: e.target.value })}
                  title="Answer"
                >
                  {answers.map((a) => (
                    <option key={a} value={a}>
                      {ANSWER_LABELS[a] ?? a}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => onMove(q.id, "up")}
                  title="Move earlier"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={i === questions.length - 1}
                  onClick={() => onMove(q.id, "down")}
                  title="Move later"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => onDelete(q.id)}
                  title="Delete and recompute"
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
