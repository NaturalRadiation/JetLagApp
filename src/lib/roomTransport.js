// one small interface, two backings: Supabase Realtime (cross-device, when
// configured) or a same-origin BroadcastChannel (other tabs on this device —
// enough to try the flow before Supabase is set up).
//
// createRoomTransport(opts) -> Promise<{
//   mode, close(), sendPosition(pos), stopPosition()
// }>
//   opts.code        room code
//   opts.identity    { id, role, name }
//   opts.onMembers   (members)   => void   [{ id, role, name, self }]
//   opts.onPositions (positions) => void   [{ id, role, name, lat, lng, accuracy, ts }]
//   opts.onError     ()          => void
import { getSupabase, supabaseConfigured } from "./supabase.js";

const MEMBER_STALE_MS = 9000; // local transport only — cloud presence self-prunes
const PING_MS = 3000;
// positions are NOT time-pruned: a seeker whose phone locked stays on the map as
// a greyed "last seen" dot. they're only removed on an explicit stop (pause) or
// when they leave the room.

function bcTransport({ code, identity, onMembers, onPositions }) {
  const bc = new BroadcastChannel(`jetlag-room-${code}`);
  const members = new Map(); // id -> { role, name, lastSeen }
  const positions = new Map(); // id -> { role, name, lat, lng, accuracy, ts, receivedAt }
  members.set(identity.id, { role: identity.role, name: identity.name, lastSeen: Date.now() });

  const emitMembers = () => {
    const now = Date.now();
    for (const [id, m] of members) {
      if (id !== identity.id && now - m.lastSeen > MEMBER_STALE_MS) members.delete(id);
    }
    onMembers(
      [...members.entries()].map(([id, m]) => ({
        id,
        role: m.role,
        name: m.name,
        self: id === identity.id,
      }))
    );
  };

  const emitPositions = () =>
    onPositions([...positions.entries()].map(([id, p]) => ({ id, ...p })));

  const announce = (t) =>
    bc.postMessage({ t, id: identity.id, role: identity.role, name: identity.name });

  bc.onmessage = (e) => {
    const msg = e.data || {};
    if (!msg.id || msg.id === identity.id) return;
    if (msg.t === "pos") {
      if (msg.stopped) positions.delete(msg.id);
      else
        positions.set(msg.id, {
          role: msg.role,
          name: msg.name,
          lat: msg.lat,
          lng: msg.lng,
          accuracy: msg.accuracy,
          ts: msg.ts,
          receivedAt: Date.now(),
        });
      emitPositions();
      return;
    }
    if (msg.t === "bye") {
      members.delete(msg.id);
      positions.delete(msg.id);
      emitPositions();
    } else {
      members.set(msg.id, { role: msg.role, name: msg.name, lastSeen: Date.now() });
      if (msg.t === "hello") announce("here"); // let the newcomer learn about us
    }
    emitMembers();
  };

  announce("hello");
  emitMembers();
  const ping = setInterval(() => {
    announce("here");
    emitMembers();
  }, PING_MS);

  return {
    mode: "local",
    sendPosition(pos) {
      bc.postMessage({
        t: "pos",
        id: identity.id,
        role: identity.role,
        name: identity.name,
        ...pos,
      });
    },
    stopPosition() {
      bc.postMessage({ t: "pos", id: identity.id, stopped: true });
    },
    close() {
      clearInterval(ping);
      announce("bye");
      bc.close();
    },
  };
}

async function supabaseTransport({ code, identity, onMembers, onPositions, onError }) {
  const supabase = await getSupabase();
  const topic = `game:${code}`;
  // a fast leave -> rejoin can leave the previous channel in the client's
  // registry; supabase.channel() would then hand back that already-subscribed
  // instance and .on() throws. drop any stragglers first.
  for (const ch of supabase.getChannels()) {
    if (ch.topic === `realtime:${topic}`) await supabase.removeChannel(ch);
  }
  const channel = supabase.channel(topic, {
    config: { presence: { key: identity.id }, broadcast: { self: false } },
  });

  const positions = new Map();
  const emitPositions = () =>
    onPositions([...positions.entries()].map(([id, p]) => ({ id, ...p })));

  channel.on("presence", { event: "sync" }, () => {
    const state = channel.presenceState();
    onMembers(
      Object.entries(state).map(([id, metas]) => {
        const meta = metas[0] || {};
        return { id, role: meta.role, name: meta.name, self: id === identity.id };
      })
    );
  });

  channel.on("broadcast", { event: "pos" }, ({ payload }) => {
    if (!payload?.id || payload.id === identity.id) return;
    if (payload.stopped) positions.delete(payload.id);
    else
      positions.set(payload.id, {
        role: payload.role,
        name: payload.name,
        lat: payload.lat,
        lng: payload.lng,
        accuracy: payload.accuracy,
        ts: payload.ts,
        receivedAt: Date.now(),
      });
    emitPositions();
  });

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      channel.track({ role: identity.role, name: identity.name });
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      onError?.();
    }
  });

  const send = (payload) => {
    try {
      channel.send({ type: "broadcast", event: "pos", payload });
    } catch {
      /* not subscribed yet — the next heartbeat will carry it */
    }
  };

  return {
    mode: "cloud",
    sendPosition(pos) {
      send({ id: identity.id, role: identity.role, name: identity.name, ...pos });
    },
    stopPosition() {
      send({ id: identity.id, stopped: true });
    },
    close() {
      try {
        channel.untrack();
      } catch {
        /* already gone */
      }
      supabase.removeChannel(channel);
    },
  };
}

export async function createRoomTransport(opts) {
  if (supabaseConfigured) {
    try {
      return await supabaseTransport(opts);
    } catch (err) {
      console.error("[room] Supabase transport failed — falling back to local", err);
    }
  }
  return bcTransport(opts);
}
