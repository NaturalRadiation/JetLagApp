// subscribes to the room's shared question log while `room` is set. returns the
// latest session pushed by another player, a way to publish ours, and whether
// the room's current state is known yet (so a seeker doesn't overwrite an
// in-progress game with a stale local one on join).
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoomSessionSync } from "../lib/roomSession.js";

export function useRoomSession(room) {
  const [remoteSession, setRemoteSession] = useState(null);
  const [status, setStatus] = useState("off"); // off | connecting | live | local | unavailable
  const [primed, setPrimed] = useState(false);
  const syncRef = useRef(null);

  useEffect(() => {
    if (!room?.code) {
      setRemoteSession(null);
      setStatus("off");
      setPrimed(false);
      return undefined;
    }
    let cancelled = false;
    setStatus("connecting");
    setRemoteSession(null);
    setPrimed(false);

    createRoomSessionSync({
      code: room.code,
      onRemoteSession: (s) => !cancelled && setRemoteSession(s),
      onStatus: (st) => !cancelled && setStatus(st),
      onPrimed: () => !cancelled && setPrimed(true),
    }).then((sync) => {
      if (cancelled) {
        sync.close();
        return;
      }
      syncRef.current = sync;
    });

    return () => {
      cancelled = true;
      syncRef.current?.close();
      syncRef.current = null;
    };
  }, [room?.code]);

  const publishSession = useCallback((session) => {
    syncRef.current?.push(session);
  }, []);

  return { remoteSession, publishSession, sessionStatus: status, primed };
}
