// tiny non-crypto string hash (FNV-1a), used to key Leaflet layers
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function hashJson(value) {
  return hashString(JSON.stringify(value ?? null));
}
