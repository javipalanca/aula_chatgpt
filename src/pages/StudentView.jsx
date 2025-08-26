import React, { useEffect, useState } from 'react'
import { initRealtime, subscribeToClass, unsubscribeFromClass, joinClass, submitAnswer, getSessionId } from '../lib/storage'
import { startHeartbeat, stopHeartbeat, leaveClass } from '../lib/storage'
import { Button, clsx } from '../components/ui'

export default function StudentView({ classCode, displayName, onBack }) {
  // joined state not required; rely on API/WS events
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [hasAnswered, setHasAnswered] = useState(false)
  const [answersCount, setAnswersCount] = useState(0)
  const [score, setScore] = useState(0)
  const [userAnswer, setUserAnswer] = useState(null)
  const [correctAnswer, setCorrectAnswer] = useState(null)

  useEffect(()=>{
    if (!classCode) return
    // ensure websocket ready
    initRealtime()
  // join the class via API
  ;(async () => {
      try {
  await joinClass(classCode, displayName || `Alumno-${getSessionId().slice(0,5)}`)
  // start heartbeat to mark student as connected periodically (every 5s)
  try { startHeartbeat(classCode, 5000) } catch(e) { console.warn('startHeartbeat failed', e) }
      } catch (e) {
        console.warn('joinClass failed', e)
      }
    })()
    // subscribe via websocket to class events
    const trySub = () => subscribeToClass(classCode)
    trySub()

    function onRealtime(e) {
      const d = e.detail || {}
  try { console.log('StudentView received realtime', d) } catch(e) { console.warn('StudentView log failed', e) }
      if (d.classId !== classCode) return
      if (d.type === 'question-launched') {
        setCurrentQuestion(d.question)
        setSecondsLeft(d.question.duration || 30)
        setHasAnswered(false)
  // distribution handled on teacher side; reset local counters
        setAnswersCount(0)
        setUserAnswer(null)
        setCorrectAnswer(null)
      }
      if (d.type === 'answers-count' && d.questionId === (currentQuestion && currentQuestion.id)) {
        setAnswersCount(d.total || 0)
      }
      if (d.type === 'question-results') {
  // Log for debugging
  try { console.debug('StudentView question-results received', { questionId: d.questionId, currentQuestionId: currentQuestion && currentQuestion.id }) } catch(e) { /* ignore */ }
  // If it's for the current question, or if for any reason questionId doesn't match but class-level reveal arrived,
  // stop the timer and show results as a safe fallback.
  if (!currentQuestion || d.questionId === (currentQuestion && currentQuestion.id) || d.classId === classCode) {
    // stop local timer and show results
    setSecondsLeft(0)
    setHasAnswered(true)
    // distribution and correctAnswer come from server; update correctAnswer
    setCorrectAnswer(d.correctAnswer)
    // optionally show awarded points in payload
    if (d.updatedScores) {
      const me = d.updatedScores.find(s => s.sessionId === getSessionId())
      if (me) setScore(me.score || 0)
    }
  }
      }
    }

    window.addEventListener('aula-realtime', onRealtime)
    // on unload or leaving this view, inform server we left and stop heartbeat
    const cleanup = async () => {
      try { unsubscribeFromClass(classCode) } catch(e) { console.warn('unsubscribeFromClass failed', e) }
      try { await leaveClass(classCode) } catch(e) { console.warn('leaveClass on cleanup failed', e) }
      try { stopHeartbeat() } catch(e) { console.warn('stopHeartbeat on cleanup failed', e) }
      try { window.removeEventListener('aula-realtime', onRealtime) } catch(e) { console.warn('remove aula-realtime listener failed', e) }
    }
    window.addEventListener('beforeunload', cleanup)
    return () => { cleanup() }
  }, [classCode])

  // local seconds countdown
  useEffect(()=>{
    if (!currentQuestion) return
    if (secondsLeft <= 0) return
    const t = setInterval(()=> setSecondsLeft(s => Math.max(0, s-1)), 1000)
    return () => clearInterval(t)
  }, [currentQuestion, secondsLeft])

  // If timer reaches zero but no question-results arrived with correctAnswer,
  // try to fetch stored challenge to find payload.correctAnswer and reveal locally.
  useEffect(()=>{
    if (!currentQuestion) return
    if (secondsLeft > 0) return
    if (correctAnswer) return
    // attempt to fetch the challenge from the storage API
    (async () => {
      try {
        // fetch stored challenges from the backend (relative path so Vite proxy works in dev)
        const r = await fetch(`/api/challenges?classId=${encodeURIComponent(classCode)}`)
        if (!r.ok) return
        const docs = await r.json()
        const found = (docs || []).find(d => d.id === currentQuestion.id)
        if (found && found.payload && typeof found.payload.correctAnswer !== 'undefined') {
          setCorrectAnswer(found.payload.correctAnswer)
          setHasAnswered(true)
        }
      } catch (e) { /* ignore fetch errors */ }
    })()
  }, [secondsLeft, currentQuestion])

  async function handleAnswer(ans) {
    if (!currentQuestion || hasAnswered) return
    setUserAnswer(ans)
    try {
      await submitAnswer(classCode, getSessionId(), currentQuestion.id, ans)
      setHasAnswered(true)
    } catch (e) { console.warn('submitAnswer failed', e) }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="max-w-4xl w-full text-center">
        <div className="mb-6">
          <div className="text-sm opacity-60">Clase: <span className="font-mono">{classCode}</span></div>
          <div className="text-2xl font-bold mt-2">{displayName || 'Alumno'}</div>
          <div className="text-sm opacity-60">Puntuación: {score}</div>
        </div>

        {!currentQuestion && (
          <div className="p-12 rounded-xl bg-white/5">
            <div className="text-xl font-semibold">Esperando a que el docente lance preguntas…</div>
            <div className="text-sm opacity-70 mt-2">Mantente atento: cuando el profesor lance una pregunta aparecerá aquí en pantalla completa.</div>
            <div className="mt-4 text-sm opacity-60">Respuestas recibidas: {answersCount}</div>
            <div className="mt-4">
              <Button variant="ghost" onClick={onBack}>Volver</Button>
            </div>
          </div>
        )}

        {currentQuestion && (
          <div className="p-8 rounded-xl bg-white/5">
            <div className="text-3xl font-bold mb-4">{currentQuestion.title}</div>
            {currentQuestion.options && currentQuestion.options.length>0 && (
              <div className="grid gap-3 mb-6">
                {currentQuestion.options.map((opt, i) => {
                  // reveal styling applies only once correctAnswer is known
                  const revealed = correctAnswer !== null && typeof correctAnswer !== 'undefined'
                  const isCorrect = revealed && String(correctAnswer) === String(opt)
                  const isUserChoice = userAnswer === opt
                  const isWrong = revealed && isUserChoice && !isCorrect
                  const isPending = !revealed && isUserChoice && hasAnswered

                  return (
                    <button
                      key={i}
                      disabled={revealed}
                      onClick={()=>handleAnswer(opt)}
                      className={clsx(
                        'p-4 rounded text-left transition',
                        // pending (answered but not revealed) -> yellow
                        isPending ? 'bg-yellow-400 text-black' : revealed ? 'opacity-90' : 'hover:opacity-95 cursor-pointer',
                        // final colors when revealed
                        revealed ? (isCorrect ? 'bg-green-600 text-white' : isWrong ? 'bg-red-600 text-white' : 'bg-white/5') : (!isPending ? 'bg-white/5' : '')
                      )}
                    >
                      {opt}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="text-2xl font-mono mb-2">{secondsLeft}s</div>
            <div className="text-sm opacity-70">Respuestas recibidas: {answersCount}</div>
            {/* distribution hidden for students (handled in teacher UI) */}
            <div className="mt-4">
              <div className="flex items-center justify-center gap-2">
                <Button variant="ghost" onClick={onBack}>Salir</Button>
                <Button variant="ghost" onClick={async ()=>{
                  // stop timer locally and try to show results
                  setSecondsLeft(0)
                  setHasAnswered(true)
                  // if question has embedded correctAnswer in payload (teacher included it), reveal it
                  const preferred = currentQuestion && currentQuestion.payload && currentQuestion.payload.correctAnswer ? currentQuestion.payload.correctAnswer : null
                  if (preferred) {
                    setCorrectAnswer(preferred)
                    return
                  }
                  // otherwise fetch answers counts to show distribution (no correct answer)
                  try {
                    const r = await fetch(`/api/answers?classId=${encodeURIComponent(classCode)}&questionId=${encodeURIComponent(currentQuestion.id)}`)
                    if (!r.ok) {
                      console.warn('fetch answers failed status', r.status)
                    } else {
                      const ct = (r.headers.get('content-type') || '').toLowerCase()
                      if (!ct.includes('application/json')) {
                        const text = await r.text().catch(()=>null)
                        console.warn('answers endpoint returned non-json response', ct, text)
                      } else {
                        const docs = await r.json()
                        const counts = {}
                        for (const a of docs) {
                          const k = a.answer == null ? '' : String(a.answer)
                          counts[k] = (counts[k]||0)+1
                        }
                        // set answersCount so UI shows total
                        setAnswersCount(Object.values(counts).reduce((s,v)=>s+v,0))
                      }
                    }
                  } catch (e) { console.warn('fetch answers failed', e) }
                }}>Mostrar resultado</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}