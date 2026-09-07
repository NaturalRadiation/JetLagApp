// Supabase is only pulled in (dynamic import) when a room is actually joined and
// credentials are present — a solo player never downloads it. set the two vars
// in a .env.local to enable cross-device rooms; without them, rooms fall back to
// same-device BroadcastChannel (see roomTransport.js).
const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(URL && KEY);

let clientPromise = null;

export function getSupabase() {
  if (!supabaseConfigured) return null;
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(URL, KEY, { realtime: { params: { eventsPerSecond: 5 } } })
    );
  }
  return clientPromise;
}
