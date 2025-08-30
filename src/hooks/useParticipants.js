import { useEffect, useState, useCallback, useRef } from "react";
import {
  joinClass,
  startHeartbeat,
  stopHeartbeat,
  leaveClass,
  listClassParticipants,
  getSessionId,
} from "../lib/storage";

/**
 * useParticipants
 * ---------------
 * Hook that manages a student's presence in a class: joins the class,
 * starts/stops a heartbeat, fetches the current participants list and
 * provides a `refresh` helper.
 *
 * Block explanation:
 * - state: `participants` array local cache
 * - mountedRef: guard to avoid setting state after unmount
 * - fetchParticipants: lists participants via storage helper and updates state
 * - effect (join/heartbeat): on mount (or when classCode/displayName changes) we
 *   1) call joinClass (WS/HTTP) to register presence
 *   2) startHeartbeat to keep presence alive
 *   3) fetch initial participants
 *   4) cleanup: stopHeartbeat and leaveClass on unmount
 * - return: { participants, me, refresh }
 */
export default function useParticipants(classCode, displayName) {
  // Local participants cache
  const [participants, setParticipants] = useState([]);
  // Mounted flag to avoid state updates after unmount
  const mountedRef = useRef(true);

  // fetchParticipants: list participants for the class and set state if mounted
  const fetchParticipants = useCallback(async () => {
    if (!classCode) return;
    try {
      const parts = await listClassParticipants(classCode);
      if (mountedRef.current) setParticipants(parts || []);
    } catch (e) {
      /* ignore */
    }
  }, [classCode]);

  // Effect: join the class and start heartbeat; fetch initial participants.
  // Cleanup stops heartbeat and leaves the class.
  useEffect(() => {
    if (!classCode) return;
    mountedRef.current = true;
    (async () => {
      try {
        await joinClass(
          classCode,
          displayName || `Alumno-${getSessionId().slice(0, 5)}`,
        );
        try {
          startHeartbeat(classCode, 5000);
        } catch (e) {
          /* ignore */
        }
        // fetch initial participants only if still mounted
        if (mountedRef.current) await fetchParticipants();
      } catch (e) {
        console.warn("useParticipants joinClass failed", e);
      }
    })();

    return () => {
      mountedRef.current = false;
      try {
        stopHeartbeat();
      } catch (e) {
        /* ignore */
      }
      try {
        leaveClass(classCode);
      } catch (e) {
        /* ignore */
      }
    };
  }, [classCode, displayName, fetchParticipants]);

  return {
    participants,
    me:
      (participants || []).find((p) => p.sessionId === getSessionId()) || null,
    refresh: fetchParticipants,
  };
}
