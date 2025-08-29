import { useEffect, useState, useRef, useCallback } from 'react'

/**
 * useQuestionTimer
 * -----------------
 * Small utility hook that provides a countdown timer for a question and
 * exposes helpers to start/stop it and a derived `timeTaken` value.
 *
 * Contract:
 * - input: `question` object (may include `duration` or `payload.duration`)
 * - output: { secondsLeft, start, stop, timeTaken }
 *
 * Behavior (block-by-block):
 * - imports: react helpers used by the hook
 * - state: `secondsLeft` holds remaining seconds; `startedAtRef` records when timer started
 * - start(): initializes `secondsLeft` based on announcement or payload and records start time
 * - stop(): stops the timer and records a fallback startedAt if missing (used to compute timeTaken)
 * - effect (question change): when `question` changes we auto-start the timer (or clear it)
 * - effect (ticker): when timer > 0 we install a 1s interval to tick down secondsLeft
 * - timeTaken: derived value computed from `startedAtRef` and announced duration
 */
export default function useQuestionTimer(question) {
  // Remaining seconds shown to the user
  const [secondsLeft, setSecondsLeft] = useState(0)
  // Record of when the timer was started (ms since epoch)
  const startedAtRef = useRef(null)

  // start(): compute announced duration (question.duration or payload.duration or default 30)
  // set secondsLeft and remember start time
  const start = useCallback(() => {
    if (!question) return
    const announcedDuration = (question && typeof question.duration === 'number') ? Number(question.duration) : (question && question.payload && typeof question.payload.duration === 'number' ? Number(question.payload.duration) : 30)
    setSecondsLeft(announcedDuration)
    startedAtRef.current = Date.now()
  }, [question])

  // stop(): clear remaining seconds and ensure startedAtRef is defined so timeTaken can still be computed
  const stop = useCallback(() => {
    setSecondsLeft(0)
    startedAtRef.current = startedAtRef.current || Date.now()
  }, [])

  // When a new question arrives, start the timer automatically; if question is null clear state
  useEffect(() => {
    if (!question) { setSecondsLeft(0); startedAtRef.current = null; return }
    start()
  }, [question, start])

  // Interval effect: when secondsLeft is positive, tick down every second
  useEffect(() => {
    if (!question) return
    if (secondsLeft <= 0) return
    const t = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [question, secondsLeft])

  // Derived timeTaken: compute seconds elapsed since startedAtRef (bounded by announced total)
  const timeTaken = (() => {
    if (!startedAtRef.current) return 0
    const total = ((question && (question.duration || (question.payload && question.payload.duration))) || 30)
    const elapsed = Math.max(0, (Date.now() - startedAtRef.current) / 1000)
    return Math.min(total, Math.round(elapsed))
  })()

  return { secondsLeft, start, stop, timeTaken }
}
