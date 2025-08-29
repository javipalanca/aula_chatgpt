import { useEffect } from 'react'

// useRealtime: centraliza la suscripción al evento `aula-realtime`.
// selected: class id currently selected
// callbacks: { onParticipantsUpdated, onQuestionLaunched, onAnswersCount, onQuestionResults, onParticipantHeartbeat }
export default function useRealtime(selected, callbacks = {}) {
  useEffect(() => {
    function onRealtime(e) {
      const d = e.detail || {}
      if (!d) return
      try {
        if (d.classId && selected && d.classId !== selected) return
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
  }, [selected, callbacks.onParticipantsUpdated, callbacks.onQuestionLaunched, callbacks.onAnswersCount, callbacks.onQuestionResults, callbacks.onParticipantHeartbeat])
}
