import React, { useEffect, useState } from 'react'
import { FancyCard, Button, Input, clsx } from '../components/ui'
import { createClass, listClasses, listClassParticipants, createQuestion, syncClassesRemote, setClassMeta, initRealtime, revealQuestion, subscribeToClass } from '../lib/storage'
import { deleteClass, setClassActive } from '../lib/storage'
import { VERIF_QUIZ, ETHICS_SCENARIOS } from '../lib/data'
import { toast } from '../components/Toaster'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

export default function TeacherDashboard({ onClose }) {
  const [name, setName] = useState('Mi clase')
  const [teacherName, setTeacherName] = useState('Profesor/a')
  const [password] = useState('')
  const [classes, setClasses] = useState([])
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState(null)
  const [questionRunning, setQuestionRunning] = useState(null)
  
  const [showProfessorFull, setShowProfessorFull] = useState(false)
  const [lastQuestionResults, setLastQuestionResults] = useState(null)
  const [showScoresOverlay, setShowScoresOverlay] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [selectedCorrect, setSelectedCorrect] = useState(null)
  const [participants, setParticipants] = useState([])
  const [liveAnswers, setLiveAnswers] = useState({}) // { questionId: { total, counts: {...} } }
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [codeToShow, setCodeToShow] = useState('')
  
  // pollingRef removed; using WebSocket realtime updates now
  const [lastRefresh, setLastRefresh] = useState(null)

  useEffect(()=>{
    // Populate from cache first, then sync with server and update when available.
  setClasses(listClasses())
  let mounted = true
  syncClassesRemote().then(()=> { if (mounted) setClasses(listClasses()) }).catch((e)=>{ console.warn('syncClassesRemote failed', e) })
    function onUpdate(e) { try { setClasses(Object.values(e.detail || listClasses())) } catch(_) { setClasses(listClasses()) } }
    window.addEventListener('aula-classes-updated', onUpdate)
    return ()=> { mounted = false; window.removeEventListener('aula-classes-updated', onUpdate) }
  }, [])

  useEffect(()=>{
    // When selected class changes, fetch participants and start polling
    if (selected) {
      
      // initialize websocket
      initRealtime()
  // subscribe to updates for this class
  try { subscribeToClass(selected, { role: 'teacher' }) } catch(e) { console.warn('subscribeToClass failed', e) }
      // fetch initial participants
      fetchParticipants()
    } else {
      // nothing to do for websocket (global)
      setParticipants([])
    }
    return ()=> { /* cleanup handled globally by storage.js websocket */ }
  }, [selected])

  useEffect(()=>{
    function onRealtime(e) {
      const d = e.detail || {}
      if (!d) return
      // Update participants list if update for the selected class
      if (d.type === 'participants-updated' && d.classId === selected) {
        setParticipants(d.participants.map(p => ({ sessionId: p.sessionId, displayName: p.displayName, score: p.score, lastSeen: p.lastSeen })))
        setLastRefresh(new Date())
      }
      if (d.type === 'question-launched' && d.classId === selected) {
        setQuestionRunning(d.question)
        // start timer for professor view
    setSecondsLeft(d.question.duration || 30)
    setTimerRunning(true)
    setLastQuestionResults(null)
    setSelectedCorrect(null)
        // clear live answers for new question
        setLiveAnswers(prev => { const copy = {...prev}; delete copy[d.question.id]; return copy })
      }
      if (d.type === 'answers-count' && d.classId === selected) {
        // d: { questionId, total, counts }
        setLiveAnswers(prev => ({ ...prev, [d.questionId]: { total: d.total || 0, counts: d.counts || {} } }))
        if (d.total >= participants.length) {
          setTimerRunning(false);
          const correct = questionRunning.payload && questionRunning.payload.correctAnswer ? questionRunning.payload.correctAnswer : null;
          if (correct) {
            revealQuestion(selected, questionRunning.id, correct)
              .then(res => {
                setLastQuestionResults(res);
                setSelectedCorrect(correct);
                toast('Resultados mostrados');
              })
              .catch(e => toast('Error mostrando resultados: ' + (e.message || e)));
          }
        }
      }
      if (d.type === 'question-results' && d.classId === selected) {
        setLastQuestionResults(d)
    // stop timer when results are revealed
    setTimerRunning(false)
        // keep final distribution in liveAnswers
        setLiveAnswers(prev => ({ ...prev, [d.questionId]: { total: Object.values(d.distribution || {}).reduce((a,b)=>a+b,0), counts: d.distribution || {} } }))
      }
    }
    window.addEventListener('aula-realtime', onRealtime)
    return () => window.removeEventListener('aula-realtime', onRealtime)
  }, [selected, participants, questionRunning])

  // Timer effect: runs while timerRunning is true. Visible time is shown in professor full view.
  useEffect(()=>{
    if (!timerRunning) return
    if (!questionRunning) return
    if (secondsLeft <= 0) { setTimerRunning(false); return }
    const t = setInterval(()=> setSecondsLeft(s => {
      const next = Math.max(0, s-1)
      if (next === 0) {
        setTimerRunning(false)
        // auto-reveal if the question payload includes a correctAnswer
        try {
          const preferred = questionRunning && questionRunning.payload && questionRunning.payload.correctAnswer ? questionRunning.payload.correctAnswer : null
          if (preferred) {
            // fire-and-forget reveal
            revealQuestion(selected, questionRunning.id, preferred)
              .then(res => {
                setLastQuestionResults(res)
                setSelectedCorrect(preferred)
                toast('Resultados mostrados')
              })
              .catch(_e => { /* ignore here; teacher can reveal manually */ })
          }
        } catch(e) { /* ignore */ }
      }
      return next
    }), 1000)
    return () => clearInterval(t)
  }, [timerRunning, questionRunning, secondsLeft])

  async function fetchParticipants() {
    try {
      if (!selected) return setParticipants([])
      const parts = await listClassParticipants(selected)
      setParticipants(parts || [])
      setLastRefresh(new Date())
    } catch (e) {
      console.warn('fetchParticipants failed', e)
    }
  }

  function handleCreate() {
    if (creating) return
    setCreating(true)
    createClass({ name, teacherName, meta: {}, password }).then(cls => {
      setClasses(listClasses())
      setSelected(cls.code || cls.id || cls)
      toast('Clase creada: ' + (cls.code || cls.id || cls))
    }).catch(err => toast('No se pudo crear: ' + (err.message || err))).finally(()=> setCreating(false))
  }

  async function handleDelete() {
    if (!selected) return toast('Selecciona una clase')
    if (!confirm('¿Borrar esta clase? Esta acción es irreversible.')) return
    try {
      await deleteClass(selected)
      setClasses(listClasses())
      setSelected(null)
      toast('Clase borrada')
    } catch (e) { toast('No se pudo borrar: ' + (e.message || e)) }
  }

  async function handleToggleActive() {
    if (!selected) return toast('Selecciona una clase')
    try {
      const cls = classes.find(c => (c.code || c.id) === selected)
      const current = cls ? cls.active : true
      await setClassActive(selected, !current)
      setClasses(listClasses())
  toast(!current ? 'Clase activada' : 'Clase desactivada')
    } catch (e) { toast('No se pudo actualizar: ' + (e.message || e)) }
  }

  async function handleDeleteClass(code) {
    if (!code) return
    if (!confirm('¿Borrar esta clase? Esta acción es irreversible.')) return
    try {
      await deleteClass(code)
      setClasses(listClasses())
      if (selected === code) setSelected(null)
      toast('Clase borrada')
    } catch (e) { toast('No se pudo borrar: ' + (e.message || e)) }
  }

  async function handleToggleActiveClass(code) {
    if (!code) return
    try {
      const cls = classes.find(c => (c.code || c.id) === code)
      const current = cls ? cls.active : true
      await setClassActive(code, !current)
      setClasses(listClasses())
  toast(!current ? 'Clase activada' : 'Clase desactivada')
    } catch (e) { toast('No se pudo actualizar: ' + (e.message || e)) }
  }

  function handleShowCode(code) {
    if (!code) return
    setCodeToShow(code)
    setShowCodeModal(true)
  }

  function refreshParticipants() {
    return participants
  }

  function handleLaunch() {
    // Launch next queued question
    if (!selected) return toast('Selecciona una clase')
    
    let next;
    const allQuestions = [];
    for (const v of VERIF_QUIZ) {
      const id = `q-${Date.now()}-${Math.floor(Math.random()*10000)}`;
      const options = Array.isArray(v.options) ? v.options.slice() : [];
      const correct = typeof v.a !== 'undefined' && options[v.a] ? options[v.a] : null;
      allQuestions.push({ id, title: v.q, duration: 30, options, payload: { source: 'VERIF_QUIZ', explain: v.explain, correctAnswer: correct } });
    }
    for (const e of ETHICS_SCENARIOS) {
      const id = `q-${Date.now()}-${Math.floor(Math.random()*10000)}`;
      const options = ['No es correcto','Es correcto'];
      const correct = e.good ? 'Es correcto' : 'No es correcto';
      allQuestions.push({ id, title: e.text, duration: 30, options, payload: { source: 'ETHICS_SCENARIOS', why: e.why, correctAnswer: correct } });
    }
    
    if (allQuestions.length > 0) {
      const randomIndex = Math.floor(Math.random() * allQuestions.length);
      next = allQuestions[randomIndex];
    } else {
      next = { title: 'Pregunta rápida', duration: 30, options: [] };
    }

    // include payload (may contain correctAnswer) so students receive source metadata
    const payload = next.payload || {}
    // ensure options exist and are an array; prefer explicit next.options or payload.options
    const options = Array.isArray(next.options) ? next.options : (payload && Array.isArray(payload.options) ? payload.options : [])
    const qPayload = { id: `q-${Date.now()}`, title: next.title, options, duration: next.duration, payload }
    try { console.debug('Teacher launching question', { classId: selected, question: qPayload }) } catch(e) { console.warn('debug log failed', e) }
    createQuestion(selected, qPayload).then(q => {
        // server will broadcast question-launched; also set local state
    setQuestionRunning(q)
    setSecondsLeft(q.duration || 30)
    setTimerRunning(true)
    setLastQuestionResults(null)
    setSelectedCorrect(null)
    setLiveAnswers(prev => ({ ...prev, [q.id]: { total: 0, counts: {} } }))
  try { subscribeToClass(selected, { role: 'teacher' }) } catch(e) { console.warn('subscribeToClass on launch failed', e) }
    toast('Pregunta lanzada: ' + q.title)
      }).catch(err => toast('No se pudo lanzar: ' + (err.message || err)))
  }

  

  function handleExport() {
    if (!selected) return toast('Selecciona una clase')
    const parts = refreshParticipants()
    const csv = ['displayName,score,lastSeen']
    for (const p of parts) csv.push(`${p.displayName.replace(/,/g,'')},${p.score || 0},${p.lastSeen || ''}`)
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${selected}-participants.csv`; a.click();
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-2">
  <Input label="Nombre de la clase" value={name} setValue={setName} />
  <Input label="Nombre profesor" value={teacherName} setValue={setTeacherName} />
  <Button onClick={handleCreate} variant="primary" disabled={creating}>{creating ? 'Creando...' : 'Crear clase'}</Button>
        <Button onClick={onClose} variant="ghost">Cerrar</Button>
      </div>

      {selected ? (
        <div className="space-y-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">{(classes.find(c => (c.code||c.id)===selected) || {}).name || selected}</h2>
              <div className="text-sm opacity-60">Código: <span className="font-mono">{selected}</span></div>
            </div>
            <div className="flex items-center gap-2">

              <Button onClick={handleExport} variant="ghost">Exportar CSV</Button>
              <Button onClick={handleToggleActive} variant="ghost">Activar/Desactivar</Button>
              <Button onClick={handleDelete} variant="destructive">Borrar</Button>
            </div>
          </div>

          <FancyCard className="p-6">
            <div className="flex flex-col md:flex-row md:items-start md:gap-6">
              <div className="flex-1">
                <div className="mb-4">
                  
                </div>
                <div className="mb-4">
                  <div className="text-3xl font-bold mb-3">{questionRunning ? questionRunning.title : 'Sin pregunta activa'}</div>
                  {questionRunning && questionRunning.options && questionRunning.options.length>0 && (
                    <div className="grid gap-3 mb-4">
                      {questionRunning.options.map((opt,i) => {
                        const isCorrect = selectedCorrect !== null && String(selectedCorrect) === String(opt)
                        return (
                          <div key={i} className={clsx('p-4 rounded text-left', isCorrect ? 'bg-green-600 text-white' : 'bg-white/5')}>
                            <div className="font-medium">{String.fromCharCode(65+i)}. {opt}</div>
                            {/* Show per-option counts only when final results are available (lastQuestionResults) */}
                            { lastQuestionResults && lastQuestionResults.distribution && (
                              <div className="mt-2 flex items-center gap-2">
                                <div className="text-sm opacity-70">{(lastQuestionResults.distribution[String(opt)] || 0)} respuestas</div>
                                <div className="flex-1 bg-white/10 h-2 rounded overflow-hidden">
                                  <div style={{ width: `${Math.min(100, ((lastQuestionResults.distribution[String(opt)] || 0) / Math.max(1, Object.values(lastQuestionResults.distribution || {}).reduce((a,b)=>a+b,0)) * 100))}%` }} className="h-2 bg-blue-500"></div>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {/* Show only total answers received while question is active */}
                  { questionRunning && (
                    <div className="text-sm opacity-70 mb-4">Respuestas recibidas: {(liveAnswers[questionRunning.id] && liveAnswers[questionRunning.id].total) || 0}</div>
                  )}
                  <div className="text-6xl font-mono mb-4">{secondsLeft}s</div>
                  <div className="flex gap-3 items-center">
                    <Button onClick={handleLaunch} variant="primary">{questionRunning ? 'Lanzar siguiente' : 'Lanzar pregunta'}</Button>
                    <Button onClick={async ()=>{
                      if (!questionRunning) return toast('No hay pregunta activa')
                      // stop countdown immediately
                      setTimerRunning(false)
                      const preferred = questionRunning.payload && questionRunning.payload.correctAnswer ? questionRunning.payload.correctAnswer : null
                      const correct = preferred || prompt('Respuesta correcta (texto exacto)')
                      if (!correct) return
                      try {
                        const res = await revealQuestion(selected, questionRunning.id, correct)
                        setLastQuestionResults(res)
                        setSelectedCorrect(correct)
                        toast('Resultados mostrados')
                      } catch (e) { toast('Error mostrando resultados: ' + (e.message || e)) }
                    }} variant="ghost">Revelar</Button>
                    <Button onClick={() => setShowScoresOverlay(true)} variant="ghost">Mostrar puntuación</Button>
                  </div>
                </div>
                {lastQuestionResults && lastQuestionResults.distribution && (
                  <div className="mt-4">
                    <h4 className="font-semibold mb-2">Distribución de respuestas</h4>
                    <div className="bg-white/5 p-4 rounded">
                      <Bar options={{ responsive: true, plugins: { legend: { display: false } } }} data={{
                        labels: Object.keys(lastQuestionResults.distribution || {}),
                        datasets: [{ label: 'Respuestas', backgroundColor: 'rgba(59,130,246,0.8)', data: Object.values(lastQuestionResults.distribution || {}) }]
                      }} />
                    </div>
                  </div>
                )}
              </div>
              <div className="w-full md:w-96 mt-6 md:mt-0">
                <div className="mb-4">
                  <h4 className="font-semibold">Participantes</h4>
                    <div className="mt-3 space-y-2 max-h-72 overflow-auto">
                    {participants.slice().sort((a,b)=> (b.score||0)-(a.score||0)).map(p => (
                      <div key={p.sessionId} className={clsx('p-2 rounded border flex items-center justify-between', p.connected === false ? 'bg-red-50 opacity-60' : 'bg-white/5')}>
                        <div className="font-semibold">{p.displayName}{p.connected === false && (<span className="ml-2 text-xs text-red-600">(desconectado)</span>)}</div>
                        <div className="font-bold">{p.score||0}</div>
                      </div>
                    ))}
                  </div>
                </div>
                
              </div>
            </div>
          </FancyCard>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          <FancyCard>
            <h3 className="font-bold mb-2">Clases</h3>
            <div className="flex flex-col gap-2">
              {classes.length===0 ? <p className="text-sm text-slate-600">No hay clases. Crea una.</p> : (
                classes.map(c => (
                  <div key={c.code || c.id} className={clsx('p-2 rounded-lg border flex items-center justify-between', selected === (c.code || c.id) ? 'bg-blue-50 border-blue-300' : 'border-slate-200', c.active === false ? 'opacity-60 bg-slate-50' : '')}>
                    <button className="text-left flex-1 min-w-0" onClick={()=> c.active !== false && setSelected(c.code || c.id)}>
                      <div>
                        <div className="font-semibold truncate">{c.name} {c.active === false && (<span className="text-xs font-medium text-red-600 ml-2">(Desactivada)</span>)}</div>
                        <div className="text-xs opacity-60 truncate">{c.code || c.id} {c.passwordHash ? '🔒' : ''} <span className="opacity-70">· {c.teacherName}</span></div>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                      <button title="Activar/Desactivar" onClick={() => handleToggleActiveClass(c.code || c.id)} className="text-sm px-2 py-1 rounded bg-slate-100">{c.active ? 'Desactivar' : 'Activar'}</button>
                      <button title="Mostrar código" onClick={() => handleShowCode(c.code || c.id)} className="text-sm px-2 py-1 rounded bg-slate-100">Código</button>
                      <button title="Borrar" onClick={() => handleDeleteClass(c.code || c.id)} className="text-sm px-2 py-1 rounded bg-red-100 text-red-700">X</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </FancyCard>

          <FancyCard>
            <h3 className="font-bold mb-2">Detalles</h3>
            {!selected ? (<p className="text-sm text-slate-600">Selecciona una clase para ver participantes y lanzar retos.</p>) : (
              <div>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Button onClick={handleLaunch} variant="primary">Lanzar pregunta</Button>
    
                  
                  <Button onClick={handleExport} variant="ghost">Exportar CSV</Button>
                  <Button onClick={() => handleShowCode(selected)} variant="ghost">Mostrar código</Button>
                  <Button onClick={handleToggleActive} variant="ghost">Activar/Desactivar</Button>
                  <Button onClick={handleDelete} variant="destructive">Borrar</Button>
                 </div>
                {questionRunning && (
                  <div className="mb-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                    <div className="font-semibold">Pregunta activa: {questionRunning.title}</div>
                    <div className="text-sm opacity-70">Duración: {questionRunning.duration}s</div>
                    {liveAnswers[questionRunning.id] && (
                      <div className="mt-2 text-sm">
                        <div>Respuestas recibidas: {liveAnswers[questionRunning.id].total}</div>
                        <div className="mt-1">Breakdown: {Object.entries(liveAnswers[questionRunning.id].counts || {}).map(([k,v]) => (<span key={k} className="inline-block mr-2">{k}: {v}</span>))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="mt-4">
                  <h4 className="font-semibold">Ranking (gráfica)</h4>
                  <div className="mt-3">
                    {participants.length===0 ? <p className="text-sm text-slate-600">Sin participantes</p> : (
                      <Bar options={{ responsive: true, plugins: { legend: { display: false } } }} data={{
                        labels: participants.slice().sort((a,b)=> (b.score||0)-(a.score||0)).slice(0,10).map(p => p.displayName),
                        datasets: [{ label: 'Puntos', backgroundColor: 'rgba(37,99,235,0.9)', data: participants.slice().sort((a,b)=> (b.score||0)-(a.score||0)).slice(0,10).map(p => p.score || 0) }]
                      }} />
                    )}
                  </div>
                </div>
                <h4 className="font-semibold">Participantes</h4>
                <div className="mt-2 space-y-2">
                  {refreshParticipants().length===0 ? <p className="text-sm text-slate-600">Nadie se ha unido todavía.</p> : (
                    refreshParticipants().sort((a,b)=> (b.score||0)-(a.score||0)).map(p=> (
                      <div key={p.sessionId} className="p-2 rounded-lg border border-slate-200 flex items-center justify-between">
                        <div>
                          <div className="font-semibold">{p.displayName}</div>
                          <div className="text-sm opacity-60">Última: {p.lastSeen ? new Date(p.lastSeen).toLocaleTimeString() : '-'}
                          </div>
                        </div>
                        <div className="text-xl font-bold">{p.score || 0}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-2 text-xs opacity-60">Última actualización: {lastRefresh ? new Date(lastRefresh).toLocaleTimeString() : '-'}
                </div>
              </div>
            )}
          </FancyCard>
        </div>
      )}
      {showCodeModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowCodeModal(false)} />
          <div className="relative z-10 bg-white rounded-xl p-8 max-w-4xl w-full text-center">
            <h3 className="text-2xl font-bold mb-4">Código de clase</h3>
            <div className="text-6xl font-mono font-bold mb-6">{codeToShow}</div>
            <div className="flex justify-center">
              <Button onClick={() => setShowCodeModal(false)} variant="ghost">Cerrar</Button>
            </div>
          </div>
        </div>
      )}
      {showProfessorFull && questionRunning && (
        <div className="fixed inset-0 z-70 bg-black text-white p-8 flex flex-col items-center justify-center">
          <div className="max-w-4xl w-full text-center">
            <div className="text-4xl font-bold mb-4">{questionRunning.title}</div>
            {questionRunning.options && questionRunning.options.length>0 && (
              <div className="grid gap-3 mb-6">
                {questionRunning.options.map((opt, i) => (
                  <div key={i} className={"p-4 rounded " + (selectedCorrect && (String(opt) === String(selectedCorrect) || String(i) === String(selectedCorrect)) ? 'bg-green-700/80 ring-2 ring-green-400' : 'bg-white/10')}>
                    <div className="text-lg">{String.fromCharCode(65+i)}. {opt}</div>
                    {lastQuestionResults && lastQuestionResults.distribution && (
                      <div className="text-sm opacity-80 mt-2">Respuestas: {lastQuestionResults.distribution[String(opt)] || lastQuestionResults.distribution[String(i)] || 0}
                      </div>
                    )}
                    {selectedCorrect && (String(opt) === String(selectedCorrect) || String(i) === String(selectedCorrect)) && (
                      <div className="text-sm font-semibold mt-2">✔ Correcta</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="text-2xl font-mono mb-4">{secondsLeft}s</div>
            <div className="flex items-center justify-center gap-4">
              <Button onClick={async ()=> {
                const correct = prompt('Indica la respuesta correcta (texto exacto)')
                if (!correct) return
                try {
                  const res = await revealQuestion(selected, questionRunning.id, correct)
                  setLastQuestionResults(res)
                  setSelectedCorrect(correct)
                  toast('Resultados revelados')
                } catch (e) { toast('Error al revelar: ' + (e.message || e)) }
              }} variant="primary">Revelar resultado</Button>
              <Button onClick={() => setShowScoresOverlay(true)} variant="ghost">Mostrar puntuación</Button>
              <Button onClick={() => { setShowProfessorFull(false); setShowScoresOverlay(false) }} variant="destructive">Cerrar</Button>
              <Button onClick={() => {
                // restart same question timer
                if (!questionRunning) return
                setSecondsLeft(questionRunning.duration || 30)
                setTimerRunning(true)
                setLastQuestionResults(null)
                setSelectedCorrect(null)
              }} variant="ghost">Reiniciar pregunta</Button>
            </div>
          </div>
        </div>
      )}
      {showScoresOverlay && (
        <div className="fixed inset-0 z-80 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowScoresOverlay(false)} />
          <div className="relative z-10 bg-white rounded-xl p-6 max-w-2xl w-full">
            <h3 className="text-xl font-bold mb-3">Puntuaciones acumuladas</h3>
            <div className="space-y-2 max-h-96 overflow-auto">
              {participants.slice().sort((a,b)=> (b.score||0)-(a.score||0)).map(p=> (
                <div key={p.sessionId} className="flex justify-between items-center p-2 border rounded">
                  <div className="font-semibold">{p.displayName}</div>
                  <div className="font-bold">{p.score||0}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end"><Button onClick={()=> setShowScoresOverlay(false)} variant="ghost">Cerrar</Button></div>
          </div>
        </div>
      )}
    </div>
  )
}