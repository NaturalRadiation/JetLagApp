// short, unguessable room code. the code IS the shared secret (like a meeting
// link), so it needs enough entropy that brute-forcing it isn't feasible;
// ambiguous characters (0/O, 1/I/L) are left out so it's easy to read aloud.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateRoomCode(length = 6) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function normalizeRoomCode(raw) {
  return (raw || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 12);
}
