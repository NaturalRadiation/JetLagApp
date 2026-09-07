// syncs the shared question log for a room. seekers push the whole session blob
// on every edit; hiders and co-seekers receive it and replay the reducer
// locally. Supabase `rooms` table + Postgres Changes when configured, a
// same-origin BroadcastChannel otherwise (enough for multi-tab testing).
//
// createRoomSessionSync(opts) -> Promise<{ mode, close(), push(session) }>
//   opts.code            room code
//   opts.onRemoteSession (session) => void   full session object from the room
//   opts.onStatus        (status)  => void   "live" | "local" | "unavailable"
//   opts.onPrimed        (hadRow)  => void   fired once the room's current state
//                                            is known (so a seeker can safely
//                                            start publishing without racing)
import { getSupabase, supabaseConfigured } from "./supabase.js";

function bcSession({ code, onRemoteSession, onStatus, onPrimed }) {
  const bc = new BroadcastChannel(`jetlag-roomlog-${code}`);
  let last = null;
  let primed = false;
  const prime = (hadRow) => {
    if (primed) return;
    primed = true;
    onPrimed?.(hadRow);
  };

  bc.onmessage = (e) => {
    const msg = e.data || {};
    if (msg.t === "req") {
      if (last) bc.postMessage({ t: "session", session: last });
      return;
    }
    if (msg.t === "session" && msg.session) {
      last = msg.session;
      prime(true);
      onRemoteSession(msg.session);
    }
  };

  // ask any other tab for the current log; if nobody answers shortly, we're it
  bc.postMessage({ t: "req" });
  const primeTimer = setTimeout(() => prime(false), 300);
  onStatus?.("local");

  return {
    mode: "local",
    push(session) {
      last = session;
      bc.postMessage({ t: "session", session });
    },
    close() {
      clearTimeout(primeTimer);
      bc.close();
    },
  };
}

async function supabaseSession({ code, onRemoteSession, onStatus, onPrimed }) {
  const supabase = await getSupabase();

  // initial fetch — a late joiner gets the current board straight away
  const { data, error } = await supabase
    .from("rooms")
    .select("session")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error; // table missing / RLS — caller degrades to "unavailable"
  if (data?.session) onRemoteSession(data.session);
  onPrimed?.(Boolean(data?.session));

  const channel = supabase
    .channel(`db-rooms:${code}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `code=eq.${code}` },
      (payload) => {
        const row = payload.new;
        if (row?.session) onRemoteSession(row.session);
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onStatus?.("live");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onStatus?.("unavailable");
    });

  return {
    mode: "cloud",
    async push(session) {
      const { error: upErr } = await supabase
        .from("rooms")
        .upsert({ code, session, updated_at: new Date().toISOString() }, { onConflict: "code" });
      if (upErr) console.error("[room-session] push failed", upErr);
    },
    close() {
      supabase.removeChannel(channel);
    },
  };
}

export async function createRoomSessionSync(opts) {
  if (supabaseConfigured) {
    try {
      return await supabaseSession(opts);
    } catch (err) {
      console.error(
        "[room-session] cloud sync unavailable — create the `rooms` table (see docs/supabase-rooms.sql)",
        err
      );
      opts.onStatus?.("unavailable");
      opts.onPrimed?.(false);
      return { mode: "unavailable", push() {}, close() {} };
    }
  }
  return bcSession(opts);
}
