import React, { useEffect, useState, useCallback } from 'react'
import { initRealtime, subscribeToClass, unsubscribeFromClass, joinClass, submitAnswer, getSessionId, listClassParticipants } from '../lib/storage'
import { startHeartbeat, stopHeartbeat, leaveClass } from '../lib/storage'
import { Button, clsx } from '../components/ui'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'
import ChatGPT from '../components/ChatGPT';
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

export default function StudentView({ classCode, displayName, onBack }) {
  // joined state not required; rely on API/WS events
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [hasAnswered, setHasAnswered] = useState(false)
  const [answersCount, setAnswersCount] = useState(0)
  const [score, setScore] = useState(0)
  const [userAnswer, setUserAnswer] = useState(null)
  const [promptText, setPromptText] = useState('')
  const [submittedPrompt, setSubmittedPrompt] = useState(null)
  const [promptSubmitted, setPromptSubmitted] = useState(false)
  const [correctAnswer, setCorrectAnswer] = useState(null)
  const [participants, setParticipants] = useState([])
  const [showScoresOverlay, setShowScoresOverlay] = useState(false)

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
        setSecondsLeft(d.question.payload && typeof d.question.payload.duration === 'number' ? d.question.payload.duration : 30)
        setHasAnswered(false)
  // distribution handled on teacher side; reset local counters
        setAnswersCount(0)
        setUserAnswer(null)
        setPromptText('')
        setSubmittedPrompt(null)
        setPromptSubmitted(false)
        setCorrectAnswer(null)
      }
      if (d.type === 'answers-count' && d.questionId === (currentQuestion && currentQuestion.id)) {
        setAnswersCount(d.total || 0)
      }
      if (d.type === 'question-results') {
  // Log for debugging
  try { console.debug('StudentView question-results received', { questionId: d.questionId, currentQuestionId: currentQuestion && currentQuestion.id, raw: d }) } catch(e) { /* ignore */ }
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
    // If evaluations were included (open/prompt), do nothing, handled by ChatGPT component
    try {
      // Some broadcasts include answers/evaluations in different shapes
      // Stop any pending indicators when results arrive
  console.info('Evaluation completed or revealed for question', d.questionId)
    } catch (e) { /* ignore */ }
  }
      }
      if (d.type === 'participants-updated') {
        try { setParticipants(d.participants || []) } catch(e) { /* ignore */ }
        try {
          const me = (d.participants || []).find(p => p.sessionId === getSessionId())
          if (me) setScore(me.score || 0)
        } catch (e) { /* ignore */ }
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

  async function handleSubmitPrompt() {
    if (!currentQuestion || hasAnswered) return
    const text = String(promptText || '').trim()
    if (!text) return
    try {
      await submitAnswer(classCode, getSessionId(), currentQuestion.id, text)
      setSubmittedPrompt(text)
      setHasAnswered(true)
      setPromptSubmitted(true)
    } catch (e) { console.warn('submitPrompt failed', e) }
  }

  const handleEvaluation = useCallback((evaluation) => {
    // Award points based on the evaluation score
    const score = Math.max(1, Math.min(100, Number(evaluation.score)))
    const points = (currentQuestion.payload && Number(currentQuestion.payload.points)) ? Number(currentQuestion.payload.points) : 100
    const awarded = Math.round((Number(points) || 0) * (score / 100))
    if (awarded > 0) {
      // Update the local score
      setScore(s => s + awarded)
      // Persist the score update to the backend
      try {
        fetch(`/api/participants`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: getSessionId(), classId: classCode, scoreDelta: awarded })
        })
      } catch (e) { console.warn('score update failed', e) }
    }
  }, [currentQuestion, classCode]);

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
            {currentQuestion.payload && currentQuestion.payload.blockName && (
              <div className="mb-4">
                <div className="text-sm opacity-70">Bloque actual: <span className="font-semibold">{currentQuestion.payload.blockName}</span></div>
                <div className="text-xs opacity-60">Pregunta {typeof currentQuestion.payload.questionIndex !== 'undefined' ? (currentQuestion.payload.questionIndex+1) : '?'} del bloque</div>
              </div>
            )}
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
            {/* Open / prompt evaluation: free-text ChatGPT-like input */}
            {(!currentQuestion.options || currentQuestion.options.length===0) && currentQuestion.payload && ((currentQuestion.payload.evaluation === 'open' || currentQuestion.payload.evaluation === 'prompt') || (currentQuestion.payload.source === 'BAD_PROMPTS' || currentQuestion.payload.source === 'PROMPTS')) && (
              <div className="mb-6">
                {/* Instructions box: use explicit instructions from payload if present, otherwise show default template */}
                <div className="mb-3 p-3 rounded border border-slate-700 bg-white/5 text-left">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm font-semibold">Instrucciones para esta pregunta</div>
                      {/* Preface specifically for BAD_PROMPTS / PROMPTS */}
                      { currentQuestion.payload && (currentQuestion.payload.source === 'BAD_PROMPTS' || currentQuestion.payload.source === 'PROMPTS') ? (
                        <div className="text-xs opacity-85 mt-1 mb-2">Completa el prompt para formular una petición clara y útil. ¡Lo que escribas abajo será tu <i>prompt</i> final!</div>
                      ) : null }
                      <div className="text-xs opacity-75 mt-1">
                        { (currentQuestion.payload && (currentQuestion.payload.instructions || currentQuestion.payload.tip)) ? (
                          <span>{currentQuestion.payload.instructions || currentQuestion.payload.tip}</span>
                        ) : (
                          <span>Redacta un prompt claro incluyendo: rol (quién debe responder), objetivo (qué quieres obtener), contexto breve, formato de salida (lista, esquema, ejemplos) y restricciones (longitud, lenguaje).</span>
                        ) }
                      </div>
                    </div>
                    <div className="ml-3">
                      <button className="text-sm px-2 py-1 rounded bg-slate-700/30 hover:bg-slate-700/40" onClick={() => {
                        const tpl = (currentQuestion.payload && (currentQuestion.payload.template || currentQuestion.payload.instructions)) ? (currentQuestion.payload.template || currentQuestion.payload.instructions) : `Actúa como un experto en la materia. Resume brevemente el contexto, responde con claridad y entrega un ejemplo al final. Formato: 1) Resumen, 2) Puntos clave, 3) Ejemplo.`
                        try { navigator.clipboard.writeText(tpl) } catch(e) { /* ignore */ }
                        // also prefill textarea for convenience
                        setPromptText(tpl)
                      }}>Copiar plantilla</button>
                    </div>
                  </div>
                </div>

                <div className="text-left mb-2 text-sm opacity-70">Respuesta (puedes escribir un prompt completo):</div>
                <textarea value={promptText} onChange={e => setPromptText(e.target.value)} rows={6} className="w-full p-3 rounded bg-white/5 text-white mb-2" placeholder="Escribe tu respuesta o prompt aqui..." />
                <div className="flex gap-2 justify-center">
                  <Button onClick={handleSubmitPrompt} disabled={hasAnswered || !promptText.trim()}>Enviar</Button>
                  <Button variant="ghost" onClick={() => { setPromptText('') }} disabled={hasAnswered}>Borrar</Button>
                </div>
                {submittedPrompt && (
                  <div className="mt-3 text-sm opacity-70 text-left">Tu envío: <div className="mt-1 p-2 rounded bg-white/5">{submittedPrompt}</div></div>
                )}
                {promptSubmitted && (
                  <ChatGPT
                    question={currentQuestion}
                    answer={submittedPrompt}
                    onEvaluated={handleEvaluation}
                  />
                )}
              </div>
            )}
            <div className="text-2xl font-mono mb-2">{secondsLeft}s</div>
            <div className="text-sm opacity-70">Respuestas recibidas: {answersCount}</div>
            {/* distribution hidden for students (handled in teacher UI) */}
            <div className="mt-4">
              <div className="flex items-center justify-center gap-2">
                <Button variant="ghost" onClick={onBack}>Salir</Button>
                <Button variant="ghost" onClick={async ()=>{
                  // show scores overlay like the teacher
                  try {
                    const parts = await listClassParticipants(classCode)
                    setParticipants(parts || [])
                    setShowScoresOverlay(true)
                  } catch (e) { console.warn('fetch participants for overlay failed', e) }
                }}>Mostrar puntuación</Button>
              </div>
            </div>
          </div>
        )}
        {showScoresOverlay && (
          <div className="fixed inset-0 z-80 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/70" onClick={() => setShowScoresOverlay(false)} />
            <div className="relative z-10 bg-white rounded-xl p-6 max-w-2xl w-full text-black">
              <h3 className="text-xl font-bold mb-3">Puntuaciones acumuladas</h3>
              <div className="mb-4 w-full overflow-x-auto">
                <div className="flex gap-3 items-stretch" style={{ minWidth: 420, whiteSpace: 'nowrap' }}>
                  {participants.slice().sort((a,b)=> (b.score||0)-(a.score||0)).slice(0,3).map((p,i) => (
                    <div key={p.sessionId || i} className="text-center p-3 rounded-lg shadow-lg inline-block text-black" style={{ background: i===0 ? 'linear-gradient(135deg,#FFD54A,#FFD700)' : i===1 ? 'linear-gradient(135deg,#E0E0E0,#C0C0C0)' : 'linear-gradient(135deg,#D4A373,#CD7F32)', width: 220, minWidth: 120 }}>
                      <div className="text-4xl">{i===0 ? '👑' : i===1 ? '🥈' : '🥉'}</div>
                      <div className="font-bold mt-2 text-lg truncate">{p.displayName}</div>
                      <div className="text-sm opacity-80">{p.score || 0} pts</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ height: 220 }}>
                <Bar options={{ maintainAspectRatio: false, responsive: true, plugins: { legend: { display: false } } }} data={{ labels: participants.slice().sort((a,b)=> (b.score||0)-(a.score||0)).slice(0,10).map(p=>p.displayName), datasets: [{ label: 'Puntos', backgroundColor: participants.slice().sort((a,b)=> (b.score||0)-(a.score||0)).slice(0,10).map((_,i)=> i===0? '#FFD700' : i===1? '#C0C0C0' : i===2? '#CD7F32' : ['#EF4444','#F59E0B','#10B981','#3B82F6','#8B5CF6','#EC4899','#06B6D4','#F97316','#6366F1','#14B8A6'][i%10]), data: participants.slice().sort((a,b)=> (b.score||0)-(a.score||0)).slice(0,10).map(p=>p.score||0) }] }} />
              </div>
              <div className="mt-4 space-y-2 max-h-64 overflow-auto">
                {participants.slice().sort((a,b)=> (b.score||0)-(a.score||0)).map(p=> (
                  <div key={p.sessionId} className="p-2 rounded-lg border border-slate-200 flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{p.displayName}</div>
                      <div className="text-sm opacity-60">Última: {p.lastSeen ? new Date(p.lastSeen).toLocaleTimeString() : '-'}</div>
                    </div>
                    <div className="text-xl font-bold">{p.score || 0}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end"><Button onClick={()=> setShowScoresOverlay(false)} variant="ghost">Cerrar</Button></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}