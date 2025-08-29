import { useEffect, useRef } from 'react'
import { initRealtime, subscribeToClass, unsubscribeFromClass, getSessionId } from '../lib/storage'

/**
 * useRealtime
 * ---------
 * Lightweight hook that centralizes subscribing to realtime (WebSocket)
 * events for a given `classCode` and forwards incoming `aula-realtime`
 * events to the provided `onEvent` callback.
 *
 * Block explanation:
 * - imports: storage helpers that initialize WS and manage class subscriptions
 * - handlerRef: keep a stable ref to the latest onEvent callback so the
 *   window event listener can remain mounted across renders
 * - effect: when `classCode` is set we
 *    1. ensure the WS is initialized (initRealtime)
 *    2. subscribe to the class (subscribeToClass)
 *    3. register a `window` listener for `aula-realtime` that filters by classId
 *    4. forward the parsed detail object to the current handlerRef
 *    5. on cleanup remove listener and unsubscribeFromClass
 *
 * Notes:
 * - The hook avoids depending on the callback instance (`onEvent`) to
 *   prevent needless re-subscribes from inline callbacks; handlerRef is used
 *   to always forward to the latest function.
 */
export default function useRealtime(classCode, onEvent, opts = {}) {
  // Support two signatures:
  // - useRealtime(classCode, handlerFn, opts)  -> handlerFn(detail)
  // - useRealtime(classCode, callbacksObj)    -> callbacksObj.{onParticipantsUpdated,...}
  const handlerRef = useRef()
  if (typeof onEvent === 'function') {
    handlerRef.current = onEvent
  } else if (onEvent && typeof onEvent === 'object') {
    handlerRef.current = (d) => {
      try {
        if (!d) return
        if (d.type === 'participants-updated' && onEvent.onParticipantsUpdated) return onEvent.onParticipantsUpdated(d.participants || [])
        if (d.type === 'question-launched' && onEvent.onQuestionLaunched) return onEvent.onQuestionLaunched(d.question)
        if (d.type === 'answers-count' && onEvent.onAnswersCount) return onEvent.onAnswersCount(d)
        if (d.type === 'question-results' && onEvent.onQuestionResults) return onEvent.onQuestionResults(d)
        if ((d.type === 'participant-heartbeat' || d.type === 'participant-disconnected') && onEvent.onParticipantHeartbeat) return onEvent.onParticipantHeartbeat(d)
      } catch (err) { /* swallow callback errors */ }
    }
  } else {
    handlerRef.current = () => {}
  }

  useEffect(() => {
    if (!classCode) return
    // Initialize the realtime subsystem (may be idempotent)
    try { initRealtime() } catch (e) { /* ignore init errors here */ }

    // Subscribe to the class using storage helpers only when the caller is
    // a function (student flow) or explicitly requested subscription via
    // opts.forceSubscribe=true. This prevents accidental student-subscribe
    // side effects when the caller wanted only callback-object handling.
    try {
      const shouldAutoSubscribe = (typeof onEvent === 'function') || opts.forceSubscribe === true
      if (shouldAutoSubscribe) {
        const displayName = opts.displayName || `Alumno-${(getSessionId() || '').slice(0,5)}`
        subscribeToClass(classCode, { displayName, role: opts.role || 'student' })
      }
    } catch (e) {
      // swallow subscription errors
    }

    // Window-level event listener receives CustomEvent with `detail`
    function handleRealtime(e) {
      const detail = e && e.detail ? e.detail : null
      if (!detail) return
      if (detail.classId && detail.classId !== classCode) return
      try {
        // Delegate to the latest onEvent via handlerRef
        if (handlerRef.current) handlerRef.current(detail)
      } catch (err) { /* handler errors are caller responsibility */ }
    }

    window.addEventListener('aula-realtime', handleRealtime)

    return () => {
      try { window.removeEventListener('aula-realtime', handleRealtime) } catch (e) { /* ignore */ }
      try { unsubscribeFromClass(classCode) } catch (e) { /* ignore */ }
    }
  // Only re-run when classCode or subscription identity changes.
  }, [classCode, opts.displayName, opts.role])
}
