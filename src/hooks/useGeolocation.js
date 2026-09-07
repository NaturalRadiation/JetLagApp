// watchPosition wrapper — starts only when `enabled` (an explicit user action,
// never on load), stops on disable/unmount. returns the latest fix and a
// human-readable error, whichever is current.
import { useEffect, useState } from "react";

const MESSAGES = {
  1: "Location blocked — allow it for this site in your browser settings.",
  2: "Location unavailable — your device can't get a fix right now.",
  3: "Location timed out — still trying…",
};

export function useGeolocation(enabled) {
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;
  const [fix, setFix] = useState(null); // { lat, lng, accuracy, ts }
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!enabled || !supported) {
      setFix(null);
      setError(null);
      return undefined;
    }
    setError(null);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setFix({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          ts: pos.timestamp,
        });
        setError(null);
      },
      (err) => setError(MESSAGES[err.code] || "Location error."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled, supported]);

  return { supported, fix, error };
}
