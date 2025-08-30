import { useEffect } from 'react'

/**
 * useRealtime (legacy-style callback variant)
 * -----------------------------------------
 * A small hook that listens to `window` CustomEvents named `aula-realtime`
 * and calls the corresponding callback functions provided in `callbacks`.
 *
 * Blocks:
 * - imports: useEffect
 * - onRealtime: map event types to callback functions and filter by `activeClass`
 * - effect: register/remove the `aula-realtime` listener and keep dependencies
 *
 * Note: This file offers an alternative signature used in some parts of the
 * codebase where an object of callbacks is more convenient than a single
 * handler function. Prefer `useRealtime.js` (single handler + opts) for most
 * new code, but keep this one for compatibility.
 */
export default function useRealtime(activeClass, callbacks = {}) {
  useEffect(() => {
    function onRealtime(e) {
      const d = e.detail || {}
      if (!d) return
      try {
  if (d.classId && activeClass && d.classId !== activeClass) return
        if (d.type === 'participants-updated') {
          callbacks.onParticipantsUpdated && callbacks.onParticipantsUpdated(d.participants || [])
          return
        }
        if (d.type === 'question-launched') {
          callbacks.onQuestionLaunched && callbacks.onQuestionLaunched(d.question)
          return
        }
        if (d.type === 'answers-count') {
          callbacks.onAnswersCount && callbacks.onAnswersCount(d)
          return
        }
        if (d.type === 'question-results') {
          callbacks.onQuestionResults && callbacks.onQuestionResults(d)
          return
        }
        if (d.type === 'participant-heartbeat' || d.type === 'participant-disconnected') {
          callbacks.onParticipantHeartbeat && callbacks.onParticipantHeartbeat(d)
          return
        }
      } catch (err) {
        // swallow errors to avoid breaking the global listener
        console.debug('useRealtime handler error', err)
      }
    }

    try {
      window.addEventListener('aula-realtime', onRealtime)
    } catch (e) {
      console.warn('useRealtime: could not add event listener', e)
    }

    return () => {
      try { window.removeEventListener('aula-realtime', onRealtime) } catch (e) { /* ignore */ }
    }
  }, [activeClass, callbacks.onParticipantsUpdated, callbacks.onQuestionLaunched, callbacks.onAnswersCount, callbacks.onQuestionResults, callbacks.onParticipantHeartbeat])
}
