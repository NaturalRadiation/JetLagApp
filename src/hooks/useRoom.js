// joins the room's presence + broadcast channel while `room` is set: returns
// who's there, the other seekers' latest positions, and a way to send our own.
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoomTransport } from "../lib/roomTransport.js";
import { supabaseConfigured } from "../lib/supabase.js";

export function useRoom(room, clientId) {
  const [members, setMembers] = useState([]);
  const [positions, setPositions] = useState([]); // other seekers: [{ id, name, role, lat, lng, accuracy, ts }]
  const [status, setStatus] = useState("off"); // off | connecting | connected | local | error
  const transportRef = useRef(null);

  useEffect(() => {
    if (!room?.code || !clientId) {
      setMembers([]);
      setPositions([]);
      setStatus("off");
      return undefined;
    }
    let cancelled = false;
    setStatus("connecting");
    setMembers([]);
    setPositions([]);

    createRoomTransport({
      code: room.code,
      identity: { id: clientId, role: room.role, name: room.name },
      onMembers: (m) => !cancelled && setMembers(m),
      onPositions: (p) => !cancelled && setPositions(p),
      onError: () => !cancelled && setStatus("error"),
    }).then((tp) => {
      if (cancelled) {
        tp.close();
        return;
      }
      transportRef.current = tp;
      setStatus(tp.mode === "local" ? "local" : "connected");
    });

    return () => {
      cancelled = true;
      transportRef.current?.close();
      transportRef.current = null;
    };
  }, [room?.code, room?.role, room?.name, clientId]);

  const sendPosition = useCallback((pos) => transportRef.current?.sendPosition(pos), []);
  const stopSharing = useCallback(() => transportRef.current?.stopPosition(), []);

  return { members, positions, status, cloud: supabaseConfigured, sendPosition, stopSharing };
}
