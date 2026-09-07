// join / leave a room and see who's in it. seekers share their location and
// hiders watch the deduced region shrink (phases 4.2 / 4.3); this step is just
// the room + role + presence plumbing.
import { useState } from "react";
import { generateRoomCode, normalizeRoomCode } from "../lib/roomCode.js";

const STATUS_LABEL = {
  connecting: "connecting…",
  connected: "connected",
  local: "this device only",
  error: "connection error",
};

// the shared question-log sync (separate channel from presence/positions)
const LOG_SYNC = {
  connecting: { cls: "hint", text: "syncing question log…" },
  live: { cls: "room-share-on", text: "Question log synced" },
  local: { cls: "hint", text: "Log syncs to other tabs on this device only." },
  unavailable: {
    cls: "hint",
    text: "Question log isn't syncing — run docs/supabase-rooms.sql in Supabase.",
  },
};

export function RoomPanel({
  room,
  members,
  status,
  logSync,
  cloud,
  onJoin,
  onLeave,
  gpsOn,
  sharing,
  sharingPaused,
  onToggleShare,
}) {
  const [code, setCode] = useState("");
  const [role, setRole] = useState("seeker");
  const [name, setName] = useState("");

  if (room) {
    return (
      <section className="panel">
        <h2>Room</h2>
        <p className="room-code">
          {room.code}
          <span className="room-status">{STATUS_LABEL[status] ?? status}</span>
        </p>
        <ul className="room-members">
          {members.length === 0 && <li className="hint">Waiting for players…</li>}
          {members.map((m) => (
            <li key={m.id}>
              <strong>{m.name || m.role}</strong>
              <span className="room-role">{m.role}</span>
              {m.self && <span className="room-you">you</span>}
            </li>
          ))}
        </ul>

        {LOG_SYNC[logSync] && (
          <p className={`room-logsync ${LOG_SYNC[logSync].cls}`}>{LOG_SYNC[logSync].text}</p>
        )}

        {room.role === "seeker" && (
          <div className="room-share">
            {!gpsOn ? (
              <p className="hint">Turn on GPS (🧭) to share your location with the room.</p>
            ) : (
              <>
                <span className={sharing ? "room-share-on" : "room-share-off"}>
                  {sharing ? "Sharing your location" : "Location sharing paused"}
                </span>
                <button type="button" onClick={onToggleShare}>
                  {sharingPaused ? "Resume" : "Pause"}
                </button>
              </>
            )}
          </div>
        )}

        <button type="button" className="danger" onClick={onLeave}>
          Leave room
        </button>
      </section>
    );
  }

  const trimmedCode = normalizeRoomCode(code);

  return (
    <section className="panel">
      <h2>Room</h2>
      {!cloud && (
        <p className="hint">
          Cross-device rooms need Supabase configured. Until then a room only links
          other tabs on this device.
        </p>
      )}
      <label className="field">
        Room code
        <span className="inline">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. 7KQ4PX"
            autoCapitalize="characters"
          />
          <button type="button" onClick={() => setCode(generateRoomCode())}>
            Generate
          </button>
        </span>
      </label>
      <fieldset className="field">
        <legend>I'm a…</legend>
        <label className="radio">
          <input
            type="radio"
            checked={role === "seeker"}
            onChange={() => setRole("seeker")}
          />
          Seeker
        </label>
        <label className="radio">
          <input
            type="radio"
            checked={role === "hider"}
            onChange={() => setRole("hider")}
          />
          Hider
        </label>
      </fieldset>
      <label className="field">
        Name (optional)
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={role} />
      </label>
      <button
        type="button"
        disabled={!trimmedCode}
        onClick={() => onJoin({ code: trimmedCode, role, name: name.trim() })}
      >
        Join room
      </button>
    </section>
  );
}
