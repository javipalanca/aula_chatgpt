/*
  TeacherDashboard.jsx

  Este archivo contiene el componente React que implementa la interfaz de
  profesor/profesora para gestionar una clase en tiempo real.

  Resumen: el componente permite crear/seleccionar una clase, lanzar
  preguntas por bloques, mostrar un timeline compacto de preguntas,
  iniciar/revelar resultados (con temporizador), ver participantes y
  exportar puntuaciones. Se integra con `src/lib/storage.js` para todas
  las operaciones remotas (WS + HTTP) y escucha eventos globales
  (`aula-realtime`, `aula-classes-updated`) para actualizar la UI.

  Comentarios clave dentro del archivo explicarán cada hook, efecto,
  función y sección del JSX en detalle (qué hace, cuándo se ejecuta,
  qué llamadas externas realiza y puntos de fallo comunes).
*/
import React, { useEffect, useState } from 'react'
import { FancyCard, Button, Input, clsx } from '../components/ui'
import { createClass, listClasses, listClassParticipants, createQuestion, syncClassesRemote, initRealtime, revealQuestion, subscribeToClass, persistClassMeta, postParticipantUpdate } from '../lib/storage'
import { deleteClass, setClassActive } from '../lib/storage'
import { VERIF_QUIZ, ETHICS_SCENARIOS, BAD_PROMPTS } from '../lib/data'
import { toast } from '../components/Toaster'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js'
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

/*
  Export default TeacherDashboard

  Component responsibilities (alto nivel):
  - Mostrar listado de clases y permitir crear/editar/borrar.
  - Cuando se selecciona una clase: inicializar websocket, suscribirse
    como profesor y mostrar herramientas para lanzar preguntas.
  - Mantener una vista por bloques (blockViewIndex) y un timeline
    compacto que permite "saltar" a una pregunta concreta (jumpToQuestion).
  - Gestionar el ciclo de vida de una pregunta: launch -> live answers -> reveal
    (reveal puede realizarse manualmente o automática cuando expira el timer
    o cuando todos los alumnos han respondido).
  - Interactúa con storage.js para persistencia y con el servidor para
    broadcast de eventos a los estudiantes.
*/

export default function TeacherDashboard({ onClose }) {
  const [teacherName, setTeacherName] = useState('Profesor/a')
  const [name, setName] = useState('Mi clase')
  const [password] = useState('')
  /*
    `classes` mantiene la caché local de clases conocida por el cliente.
    Se inicializa desde `listClasses()` y se refresca cuando se persiste
    meta o se sincroniza con el servidor. Contiene objetos con forma:
    { id, code, name, teacherName, meta, active, participants, challenges }
  */
  const [classes, setClasses] = useState([])
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState(null)
  /*
    `questionRunning` representa la pregunta actualmente activa en la
    clase seleccionada. Es el objeto retornado por `createQuestion` o
    por un evento `question-launched` desde el servidor. Contiene
    { id, title, options, duration, payload, classId }
  */
  const [questionRunning, setQuestionRunning] = useState(null)
  
  const [showProfessorFull, setShowProfessorFull] = useState(false)
  const [lastQuestionResults, setLastQuestionResults] = useState(null)
  const [showScoresOverlay, setShowScoresOverlay] = useState(false)
  // ranking chart visibility handled via lastQuestionResults / showScoresOverlay
  const [showParticipantsList, setShowParticipantsList] = useState(true)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [selectedCorrect, setSelectedCorrect] = useState(null)
  const [participants, setParticipants] = useState([])
  /*
    `liveAnswers` guarda conteos en vivo por pregunta: la estructura es
    { [questionId]: { total: number, counts: { optionValue: count } } }
    Se actualiza cuando llegan eventos `answers-count` via WS.
  */
  const [liveAnswers, setLiveAnswers] = useState({}) // { questionId: { total, counts: {...} } }
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [codeToShow, setCodeToShow] = useState('')
  const [blockViewIndex, setBlockViewIndex] = useState(0)
  const [showFinalModal, setShowFinalModal] = useState(false)
  const [finalWinners, setFinalWinners] = useState([])
  // Cuando lanzamos la última pregunta de un bloque guardamos en esta
  // variable el avance pendiente. Sólo persistiremos al pulsar
  // "Lanzar siguiente" después de mostrar los resultados.
  const [pendingAdvance, setPendingAdvance] = useState(null)
  
  // pollingRef removed; using WebSocket realtime updates now
  const [lastRefresh, setLastRefresh] = useState(null)

  useEffect(()=>{
    // Inicialización de clases
    // 1) Leer la caché local (síncrono) para respuesta inmediata en la UI.
    // 2) Lanzar una sincronización remota para refrescar datos desde el servidor.
    // 3) Escuchar el evento `aula-classes-updated` que dispara `storage.syncClassesRemote`
    //    cuando llegan datos nuevos, de modo que otras pestañas o componentes
    //    también provoquen una actualización reactiva.
  setClasses(listClasses())
  let mounted = true
  syncClassesRemote().then(()=> { if (mounted) setClasses(listClasses()) }).catch((e)=>{ console.warn('syncClassesRemote failed', e) })
    function onUpdate(e) { try { setClasses(Object.values(e.detail || listClasses())) } catch(_) { setClasses(listClasses()) } }
    window.addEventListener('aula-classes-updated', onUpdate)
    return ()=> { mounted = false; window.removeEventListener('aula-classes-updated', onUpdate) }
  }, [])

  useEffect(()=>{
    // Reacción a selección de clase
    // - inicializa la conexión WS (si no está abierta)
    // - se suscribe a la clase como profesor para recibir eventos en tiempo real
    // - obtiene la lista de participantes y ajusta la vista del bloque actual
    if (selected) {
      initRealtime()
      try { subscribeToClass(selected, { role: 'teacher' }) } catch(e) { console.warn('subscribeToClass failed', e) }
      fetchParticipants()
      // si la clase persistida tiene currentBlockIndex, sincronizamos la vista
      try {
        const cls = classes.find(c => (c.code || c.id) === selected) || {}
        const meta = cls.meta || {}
        if (typeof meta.currentBlockIndex === 'number') setBlockViewIndex(meta.currentBlockIndex)
      } catch(e) { /* ignore */ }
    } else {
      // si no hay clase seleccionada, limpiamos la lista de participantes
      setParticipants([])
    }
    // cleanup: storage.js gestiona re-conexiones/close globales del websocket
    return ()=> { /* cleanup handled globally by storage.js websocket */ }
  }, [selected])

  // Poll participants periodically as a fallback / preference for teacher
  useEffect(() => {
    if (!selected) return
    const POLL_MS = 5000 // poll every 5s
    // Se ejecuta un polling ligero cada 5s para asegurar que la lista de
    // participantes esté relativamente actualizada incluso si el WS falla.
    let mounted = true
    const tick = async () => {
      try {
        if (!mounted) return
        await fetchParticipants()
      } catch (e) { console.warn('participants poll failed', e) }
    }
    // immediate tick already happens on selection, but ensure polling continues
    const id = setInterval(tick, POLL_MS)
    return () => { mounted = false; clearInterval(id) }
  }, [selected])

  useEffect(()=>{
    // Cuando `lastQuestionResults` cambia (por ejemplo tras reveal), se
    // muestra automáticamente el overlay de puntuaciones para que el
    // profesor vea la distribución y el ranking acumulado.
    if (lastQuestionResults) {
  setShowScoresOverlay(true)
    }
  }, [lastQuestionResults])

  useEffect(()=>{
    // Listener centralizado para eventos de tiempo real (WS).
    // El helper `initRealtime` parsea mensajes y los re-emite como
    // eventos DOM `aula-realtime` con `detail = parsedMessage`.
    // Aquí reaccionamos sólo para la `classId` que está seleccionada.
    function onRealtime(e) {
      const d = e.detail || {}
      if (!d) return
      // participants-updated: reemplazamos la lista completa de participantes
      if (d.type === 'participants-updated' && d.classId === selected) {
        setParticipants(d.participants.map(p => ({ sessionId: p.sessionId, displayName: p.displayName, score: p.score, lastSeen: p.lastSeen })))
        setLastRefresh(new Date())
      }
      // question-launched: servidor notifica que hay una pregunta activa
      // -> actualizamos `questionRunning`, arrancamos temporizador, limpiamos resultados previos
      if (d.type === 'question-launched' && d.classId === selected) {
        setQuestionRunning(d.question)
        setSecondsLeft(d.question.duration || 30)
        setTimerRunning(true)
        setLastQuestionResults(null)
        setSelectedCorrect(null)
        // limpiar conteos previos para esta pregunta
        setLiveAnswers(prev => { const copy = {...prev}; delete copy[d.question.id]; return copy })
      }
      // answers-count: actualización incremental (total + counts)
      // Si el total alcanza el número de participantes conocemos que
      // todos respondieron y hacemos auto-reveal.
      if (d.type === 'answers-count' && d.classId === selected) {
        setLiveAnswers(prev => ({ ...prev, [d.questionId]: { total: d.total || 0, counts: d.counts || {} } }))
        if (d.total >= participants.length) {
          const correct = questionRunning && questionRunning.payload && questionRunning.payload.correctAnswer ? questionRunning.payload.correctAnswer : null
          handleRevealAction(correct)
        }
      }
      // question-results: resultado final tras reveal (distribución, answers...)
      if (d.type === 'question-results' && d.classId === selected) {
        setLastQuestionResults(d)
        // detener timer al mostrar resultados
        setTimerRunning(false)
        // guardar distribución final en liveAnswers para mostrar barras
        setLiveAnswers(prev => ({ ...prev, [d.questionId]: { total: Object.values(d.distribution || {}).reduce((a,b)=>a+b,0), counts: d.distribution || {} } }))
      }
      // participant-heartbeat / participant-disconnected: actualizamos estado ligero
      // para evitar hacer fetch completo; esto mantiene la lista de participantes
      // con una latencia mínima.
      if ((d.type === 'participant-heartbeat' || d.type === 'participant-disconnected') && d.classId === selected) {
        setParticipants(prev => {
          const copy = (prev || []).slice()
          const idx = copy.findIndex(p => p.sessionId === d.sessionId)
          const entry = { sessionId: d.sessionId, displayName: d.displayName || (`Alumno-${String(d.sessionId).slice(0,5)}`), score: (copy[idx] && copy[idx].score) || 0, lastSeen: d.lastSeen || new Date(), connected: d.type === 'participant-heartbeat' }
          if (idx === -1) copy.push(entry)
          else copy[idx] = { ...copy[idx], ...entry }
          return copy
        })
      }

    }
    try { window.addEventListener('aula-realtime', onRealtime) } catch(e) { console.warn('add aula-realtime listener failed', e) }
    return () => { try { window.removeEventListener('aula-realtime', onRealtime) } catch(e) { /* ignore */ } }
  }, [selected, participants, questionRunning])

  // Timer effect: decrementa `secondsLeft` cuando `timerRunning` está activo
  useEffect(() => {
    if (!timerRunning) return
    if (!questionRunning) return
    if (secondsLeft <= 0) { setTimerRunning(false); return }
    const t = setInterval(()=> setSecondsLeft(s => {
      const next = Math.max(0, s-1)
      if (next === 0) {
        setTimerRunning(false)
        // auto-reveal si hay respuesta correcta conocida
        try {
          const preferred = questionRunning && questionRunning.payload && questionRunning.payload.correctAnswer ? questionRunning.payload.correctAnswer : null
          if (preferred) {
            revealQuestion(selected, questionRunning.id, preferred)
              .then(res => {
                setLastQuestionResults(res)
                setSelectedCorrect(preferred)
                toast('Resultados mostrados')
              })
              .catch(_e => { /* si falla dejamos al profesor revelar manualmente */ })
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
  // Si falla el fetch, no hacemos throw porque el polling continuará
  // y la UI debe seguir operativa (se muestran los datos en caché).
  console.warn('fetchParticipants failed', e)
    }
  }

  // Centralized reveal action used by buttons and automatic flow when all answered
  async function handleRevealAction(preferredAnswer = null) {
    /*
      handleRevealAction
      - Ejecuta la acción de revelar resultados para la pregunta activa.
      - Parámetros: preferredAnswer opcional para forzar una opción correcta
        (útil cuando el servidor envía counts y queremos aceptar una).
      - Flujo: detener timer, determinar la respuesta correcta (parámetro,
        payload.correctAnswer o prompt manual) y llamar a `revealQuestion`.
      - Efectos: actualiza `lastQuestionResults` y `selectedCorrect`.
      - Errores: se muestran mediante `toast`.
    */
    if (!questionRunning) return toast('No hay pregunta activa')
    setTimerRunning(false)
    setSecondsLeft(0)
    const preferred = preferredAnswer || (questionRunning.payload && questionRunning.payload.correctAnswer ? questionRunning.payload.correctAnswer : null)
    const correct = preferred || prompt('Respuesta correcta (texto exacto)')
    if (!correct) return
    try {
      const res = await revealQuestion(selected, questionRunning.id, correct)
      setLastQuestionResults(res)
      setSelectedCorrect(correct)
      toast('Resultados mostrados')
    } catch (e) { toast('Error mostrando resultados: ' + (e.message || e)) }
  }

  function handleCreate() {
    if (creating) return
    setCreating(true)
    createClass({ name, teacherName, meta: {}, password }).then(cls => {
  // Tras crear la clase actualizamos caché y seleccionamos la nueva clase
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
  // Tras borrar refrescamos caché y limpiamos selección
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

  async function handleLaunch() {
    /*
      handleLaunch:
      Flujo principal para lanzar la siguiente pregunta según meta persistido.

      Pasos y notas:
      1) Lectura de `classes` para obtener `cls.meta`. Si `meta.blocks` no
         existe se inicializa usando las constantes de `../lib/data`.
         (Esto evita tener que preconfigurar bloques en backend).
      2) Si `meta.finished` está a true se ofrece reiniciar la secuencia.
      3) Se elige el bloque objetivo (`bIndex`) preferiendo la vista actual
         `blockViewIndex` para que el profesor pueda lanzar desde otra vista.
      4) Se calcula la pregunta `next` y se construye `qPayload` que incluye
         metadata del bloque en `payload` (esto ayuda a estudiantes y
         laten-joiners a mostrar contexto).
      5) Se calcula el índice siguiente y se persiste `meta` (con `setClassMeta`).
         Si tras avanzar no quedan preguntas se marca `meta.finished` y se
         publica un `qEnd` tipo `game-ended` para notificar a los alumnos.
      6) Se llama `createQuestion(selected, qPayload)` que envía la petición
         al servidor; el servidor debe crear el challenge y broadcast
         `question-launched` a los suscritos. Aquí también actualizamos la
         UI local (setQuestionRunning) para que el profesor vea inmediatamente
         la pregunta aunque el broadcast tarde.

      Fallos posibles y consideraciones:
      - Si se persiste `meta` y luego `createQuestion` falla, la meta
        quedará adelantada sin pregunta real; podría requerirse rollback
        o un handling explícito si es crítico.
      - Auto-restart/fin de juego se implementa creando una `q-end` final.
      - Se refresca la caché local (`setClasses(listClasses())`) tras cada
        persistencia para que el timeline refleje el estado guardado.
    */
  console.log('handleLaunch invoked', { selected })
  if (!selected) return toast('Selecciona una clase')
    try {
      // If there's an advance pending (we launched the last question of a block)
      // then consuming this "Lanzar siguiente" should persist the pending
      // indices and either finalize the game or immediately launch the
      // next question.
      if (pendingAdvance) {
        const clsPending = classes.find(c => (c.code || c.id) === selected) || {}
        const metaPending = clsPending.meta || {}
        // apply pending advance
        metaPending.currentBlockIndex = pendingAdvance.nextBlockIndex
        metaPending.currentQuestionIndex = pendingAdvance.nextQuestionIndex
        // If advancing past last block, finalize with q-end
        if (metaPending.currentBlockIndex >= (metaPending.blocks ? metaPending.blocks.length : 0)) {
          metaPending.finished = true
          try { await persistClassMeta(selected, metaPending); setBlockViewIndex(metaPending.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist pending final failed', e) }
          // Create final challenge and show modal
          try {
            const winner = participants.slice().sort((a,b)=> (b.score||0)-(a.score||0))[0]
            const finalPayload = { type: 'game-ended', winner: winner ? { name: winner.displayName, score: winner.score || 0 } : null }
            const qEnd = { id: `q-end-${Date.now()}`, title: 'Juego terminado', options: [], duration: 10, payload: finalPayload }
            const q = await createQuestion(selected, qEnd)
            setQuestionRunning(q)
            setSecondsLeft(q.duration || 10)
            setTimerRunning(true)
            setLastQuestionResults(null)
            setSelectedCorrect(null)
            setLiveAnswers(prev => ({ ...prev, [q.id]: { total: 0, counts: {} } }))
            toast('Juego finalizado — se ha notificado a los alumnos')
            const tops = (participants || []).slice().sort((a,b)=> (b.score||0)-(a.score||0)).slice(0,3)
            setFinalWinners(tops)
            setShowFinalModal(true)
          } catch(e) { toast('No se pudo notificar fin de juego: ' + (e && e.message ? e.message : String(e))) }
          setPendingAdvance(null)
          return
        }
        // Persist the normal advance and launch the next question immediately
        try { await persistClassMeta(selected, metaPending); setBlockViewIndex(metaPending.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist pending advance failed', e) }
        setPendingAdvance(null)
        // compute next question from persisted meta
        try {
          const blocksP = metaPending.blocks || []
          const blk = blocksP[metaPending.currentBlockIndex]
          if (!blk || !Array.isArray(blk.questions) || blk.questions.length === 0) return toast('Bloque vacío')
          const qIdxP = Math.min(metaPending.currentQuestionIndex, (blk.questions.length || 0) - 1)
          const nextP = blk.questions[qIdxP]
          const payloadP = { ...(nextP.payload || {}), blockId: blk.id, blockName: blk.name, blockIndex: metaPending.currentBlockIndex, questionIndex: qIdxP }
          const optionsP = Array.isArray(nextP.options) ? nextP.options : []
          const qPayloadP = { id: nextP.id || `q-${Date.now()}`, title: nextP.title, options: optionsP, duration: nextP.duration || 30, payload: payloadP }
          const q2 = await createQuestion(selected, qPayloadP)
          setQuestionRunning(q2)
          setSecondsLeft(q2.duration || 30)
          setTimerRunning(true)
          setLastQuestionResults(null)
          setSelectedCorrect(null)
          setLiveAnswers(prev => ({ ...prev, [q2.id]: { total: 0, counts: {} } }))
          try { subscribeToClass(selected, { role: 'teacher' }) } catch(e) { console.warn('subscribeToClass on launch failed', e) }
          toast('Pregunta lanzada: ' + q2.title)
        } catch (e) { console.error('create next after pending advance failed', e); toast('No se pudo lanzar la siguiente pregunta') }
        return
      }
      const cls = classes.find(c => (c.code || c.id) === selected) || {}
      const meta = cls.meta || {}
      // Inicializar bloques si faltan (útil en clases recién creadas)
      if (!meta.blocks) {
        const buildBlock = (id, name, items, mapper) => ({ id, name, questions: items.map(mapper) })
        const verifMapper = (v, idx) => ({ id: `q-verif-${idx}-${Date.now()}`, title: v.q, duration: 30, options: Array.isArray(v.options) ? v.options.slice() : [], payload: { source: 'VERIF_QUIZ', explain: v.explain, correctAnswer: (Array.isArray(v.options) && typeof v.a !== 'undefined') ? v.options[v.a] : null } })
        const ethicsMapper = (e, idx) => ({ id: `q-eth-${idx}-${Date.now()}`, title: e.text, duration: 30, options: ['No es correcto','Es correcto'], payload: { source: 'ETHICS_SCENARIOS', why: e.why, correctAnswer: e.good ? 'Es correcto' : 'No es correcto' } })
        const badMapper = (b, idx) => ({ id: `q-bad-${idx}-${Date.now()}`, title: b.bad, duration: 25, options: [], payload: { source: 'BAD_PROMPTS', tip: b.tip } })
        meta.blocks = [
          buildBlock('ETHICS', 'Escenarios éticos', ETHICS_SCENARIOS, ethicsMapper),
          buildBlock('VERIF', 'Verificación', VERIF_QUIZ, verifMapper),
          buildBlock('PROMPTS', 'Mejorar prompts', BAD_PROMPTS, badMapper)
        ]
  meta.currentBlockIndex = 0
  meta.currentQuestionIndex = 0
  // persist meta inicial y refrescar cache local (uso persistente unificado)
  try { await persistClassMeta(selected, meta); console.log('persisted initial class meta', { classId: selected, meta }); setBlockViewIndex(meta.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist class meta failed', e) }
      }

      // Si el juego ha terminado, preguntar al profesor si desea reiniciar
      if (meta.finished) {
        console.log('handleLaunch: meta.finished true — prompting teacher to restart')
        const restart = confirm('El juego ya ha finalizado. ¿Reiniciar el juego y comenzar desde el principio?')
        if (!restart) {
          return toast('El juego ya ha finalizado')
        }
  meta.finished = false
  meta.currentBlockIndex = 0
  meta.currentQuestionIndex = 0
  try { await persistClassMeta(selected, meta); console.log('handleLaunch: class meta reset for restart', { classId: selected, meta }); setBlockViewIndex(meta.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist class meta failed on restart', e) }
      }

      // Determinar el bloque y la pregunta a lanzar
  const bIndex = (typeof blockViewIndex === 'number') ? blockViewIndex : (typeof meta.currentBlockIndex === 'number' ? meta.currentBlockIndex : 0)
  const qIndex = (typeof meta.currentQuestionIndex === 'number' ? meta.currentQuestionIndex : 0)
      const blocks = meta.blocks || []
      if (bIndex >= blocks.length) {
        return toast('No quedan bloques por lanzar')
      }
      const block = blocks[bIndex]
      if (!block || !Array.isArray(block.questions) || block.questions.length === 0) return toast('Bloque vacío')
      const qIdx = Math.min(qIndex, block.questions.length - 1)
      const next = block.questions[qIdx]

      // Construir payload público que incluirá metadatos del bloque
  const payload = { ...(next.payload || {}), blockId: block.id, blockName: block.name, blockIndex: bIndex, questionIndex: qIdx }
  console.log('handleLaunch: next question determined', { blockIndex: bIndex, questionIndex: qIdx, nextPreview: { id: next.id, title: next.title, duration: next.duration } })
      const options = Array.isArray(next.options) ? next.options : []
  const qPayload = { id: next.id || `q-${Date.now()}`, title: next.title, options, duration: next.duration || 30, payload }

      // Calcular índices posteriores (no persistimos todavía — primero
      // creamos la pregunta en el servidor y sólo tras éxito avanzamos
      // los punteros persistidos). Esto evita que falle la creación y la
      // meta quede adelantada sin pregunta real.
      let nextBlockIndex = bIndex
      let nextQuestionIndex = qIdx + 1
      if (nextQuestionIndex >= (block.questions.length || 0)) {
        nextBlockIndex = bIndex + 1
        nextQuestionIndex = 0
      }

      // Si no quedan más bloques, crearemos un challenge final (q-end).
      if (nextBlockIndex >= (meta.blocks ? meta.blocks.length : 0)) {
        // Enviar challenge final primero, y luego persistir el estado
        // finished para que todos los clientes lo vean.
        try {
          const winner = participants.slice().sort((a,b)=> (b.score||0)-(a.score||0))[0]
          const finalPayload = { type: 'game-ended', winner: winner ? { name: winner.displayName, score: winner.score || 0 } : null }
          const qEnd = { id: `q-end-${Date.now()}`, title: 'Juego terminado', options: [], duration: 10, payload: finalPayload }
          const q = await createQuestion(selected, qEnd)
          setQuestionRunning(q)
          setSecondsLeft(q.duration || 10)
          setTimerRunning(true)
          setLastQuestionResults(null)
          setSelectedCorrect(null)
          setLiveAnswers(prev => ({ ...prev, [q.id]: { total: 0, counts: {} } }))
          try { subscribeToClass(selected, { role: 'teacher' }) } catch(e) { console.warn('subscribeToClass on final failed', e) }
          toast('Juego finalizado — se ha notificado a los alumnos')
          // Persistir estado final
          meta.currentBlockIndex = nextBlockIndex
          meta.currentQuestionIndex = nextQuestionIndex
          meta.finished = true
          try { await persistClassMeta(selected, meta); setBlockViewIndex(meta.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist class meta final failed', e) }
          // Show final modal with top-3
          const tops = (participants || []).slice().sort((a,b)=> (b.score||0)-(a.score||0)).slice(0,3)
          setFinalWinners(tops)
          setShowFinalModal(true)
        } catch(e) {
          console.error('Error creando/cargando challenge final', e)
          toast('No se pudo notificar fin de juego: ' + (e && e.message ? e.message : String(e)))
        }
        return
      }

      // Crear la pregunta pública primero. El servidor deberá broadcast
      // `question-launched`. En la UI local también seteamos `questionRunning`
      // para feedback inmediato al profesor.
      try {
        console.debug('Teacher launching question', { classId: selected, question: qPayload })
        console.log('calling createQuestion with payload', qPayload)
        const q = await createQuestion(selected, qPayload)
        console.log('createQuestion returned', q)
        setQuestionRunning(q)
        setSecondsLeft(q.duration || 30)
        setTimerRunning(true)
        setLastQuestionResults(null)
        setSelectedCorrect(null)
        setLiveAnswers(prev => ({ ...prev, [q.id]: { total: 0, counts: {} } }))
        try { subscribeToClass(selected, { role: 'teacher' }) } catch(e) { console.warn('subscribeToClass on launch failed', e) }
        toast('Pregunta lanzada: ' + q.title)

        // Persistir índices avanzados solo tras crear la pregunta con éxito.
        // Si estamos lanzando la última pregunta de un bloque, deferimos la
        // persistencia hasta que el profesor pulse "Lanzar siguiente"
        const isLastOfBlock = qIdx === ((block.questions || []).length - 1)
        if (isLastOfBlock) {
          // Store advance for later consumption
          setPendingAdvance({ nextBlockIndex, nextQuestionIndex })
          console.log('handleLaunch: last question of block launched, pendingAdvance set', { nextBlockIndex, nextQuestionIndex })
        } else {
          meta.currentBlockIndex = nextBlockIndex
          meta.currentQuestionIndex = nextQuestionIndex
          if (nextBlockIndex >= (meta.blocks ? meta.blocks.length : 0)) {
            meta.finished = true
          }
          try { await persistClassMeta(selected, meta); console.log('persisted advanced indices', { classId: selected, meta }); setBlockViewIndex(meta.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist class meta failed', e) }
          if (meta.finished) {
            const tops = (participants || []).slice().sort((a,b)=> (b.score||0)-(a.score||0)).slice(0,3)
            setFinalWinners(tops)
            setShowFinalModal(true)
          }
        }
      } catch (e) {
        console.error('createQuestion failed', e)
        toast('Error creando/cargando pregunta: ' + (e && e.message ? e.message : String(e)))
        return
      }
    } catch (err) {
      console.error('handleLaunch failed', err)
      toast('Error lanzando pregunta: ' + (err && err.message ? err.message : String(err)))
    }
  }

  // Jump to a specific question in a block and launch it immediately (persist meta so continuation is from there)
  async function jumpToQuestion(blockIndex, questionIndex) {
    /*
      jumpToQuestion
      - Objetivo: al hacer click en un nodo del timeline, el profesor
        quiere "saltar" a esa pregunta y además lanzarla inmediatamente.
      - Implementación: persiste los índices en `meta` para que la
        continuación sea desde la siguiente pregunta a la que se acaba de
        lanzar; luego crea la pregunta con `createQuestion` exactamente
        igual que `handleLaunch`.

      Notas importantes:
      - Este método persiste meta antes y después de crear la pregunta en
        puntos distintos (e inicializa bloques si no existen). Eso hace que
        el estado persistido y la pregunta creada puedan divergir si hay
        fallos de red entre las llamadas. Actualmente la UI refresca
        `classes` después de cada `setClassMeta` para minimizar desfases.
      - Cuando se llega al final de todos los bloques se envía `q-end`.
    */
    try {
      if (!selected) return
      setBlockViewIndex(blockIndex)
      toast('Lanzando pregunta ' + (questionIndex + 1) + ' del bloque ' + (blockIndex+1))
      console.log('jumpToQuestion: launching', { blockIndex, questionIndex, classId: selected })
      const cls = classes.find(c => (c.code || c.id) === selected) || {}
      const meta = cls.meta || {}
      // Inicializar bloques si faltan (misma lógica que handleLaunch)
      if (!meta.blocks) {
        const buildBlock = (id, name, items, mapper) => ({ id, name, questions: items.map(mapper) })
        const verifMapper = (v, idx) => ({ id: `q-verif-${idx}-${Date.now()}`, title: v.q, duration: v.duration || 30, options: Array.isArray(v.options) ? v.options.slice() : [], payload: { source: 'VERIF_QUIZ', explain: v.explain, correctAnswer: (Array.isArray(v.options) && typeof v.a !== 'undefined') ? v.options[v.a] : null } })
        const ethicsMapper = (e, idx) => ({ id: `q-eth-${idx}-${Date.now()}`, title: e.text, duration: e.duration || 30, options: ['No es correcto','Es correcto'], payload: { source: 'ETHICS_SCENARIOS', why: e.why, correctAnswer: e.good ? 'Es correcto' : 'No es correcto' } })
        const badMapper = (b, idx) => ({ id: `q-bad-${idx}-${Date.now()}`, title: b.bad, duration: b.duration || 30, options: [], payload: { source: 'BAD_PROMPTS', tip: b.tip } })
        meta.blocks = [
          buildBlock('ETHICS', 'Escenarios éticos', ETHICS_SCENARIOS, ethicsMapper),
          buildBlock('VERIF', 'Verificación', VERIF_QUIZ, verifMapper),
          buildBlock('PROMPTS', 'Mejorar prompts', BAD_PROMPTS, badMapper)
        ]
  meta.currentBlockIndex = 0
  meta.currentQuestionIndex = 0
  try { await persistClassMeta(selected, meta); console.log('persisted initial class meta from jumpToQuestion', { classId: selected }); setBlockViewIndex(meta.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist class meta failed', e) }
      }
      const blocks = meta.blocks || []
      if (blockIndex >= blocks.length) return toast('Bloque inválido')
      const block = blocks[blockIndex]
      if (!block || !Array.isArray(block.questions) || block.questions.length === 0) return toast('Bloque vacío')
      const qIdx = Math.min(questionIndex, block.questions.length - 1)
      const next = block.questions[qIdx]
      const payload = { ...(next.payload || {}), blockId: block.id, blockName: block.name, blockIndex, questionIndex: qIdx }
      const options = Array.isArray(next.options) ? next.options : []
      const qPayload = { id: next.id || `q-${Date.now()}`, title: next.title, options, duration: next.duration || 30, payload }
      // Calcular índices posteriores y persistir para continuidad
      let nextBlockIndex = blockIndex
      let nextQuestionIndex = qIdx + 1
      if (nextQuestionIndex >= (block.questions.length || 0)) { nextBlockIndex = blockIndex + 1; nextQuestionIndex = 0 }
      if (nextBlockIndex >= (meta.blocks ? meta.blocks.length : 0)) {
  meta.currentBlockIndex = nextBlockIndex
  meta.currentQuestionIndex = nextQuestionIndex
  meta.finished = true
  try { await persistClassMeta(selected, meta); setBlockViewIndex(meta.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist class meta final failed', e) }
        // Enviar challenge final
        try {
          const qEnd = { id: `q-end-${Date.now()}`, title: 'Juego terminado', options: [], duration: 10, payload: { type: 'game-ended' } }
          const q = await createQuestion(selected, qEnd)
          setQuestionRunning(q)
          setSecondsLeft(q.duration || 10)
          setTimerRunning(true)
          setLastQuestionResults(null)
          setSelectedCorrect(null)
          setLiveAnswers(prev => ({ ...prev, [q.id]: { total: 0, counts: {} } }))
          toast('Juego finalizado — se ha notificado a los alumnos')
        } catch(e) { toast('No se pudo notificar fin de juego: ' + (e.message || e)) }
        return
      }
  meta.currentBlockIndex = nextBlockIndex
  meta.currentQuestionIndex = nextQuestionIndex
      try {
        console.log('jumpToQuestion: calling createQuestion with payload', qPayload)
        const q = await createQuestion(selected, qPayload)
        console.log('jumpToQuestion: createQuestion returned', q)
        setQuestionRunning(q)
        setSecondsLeft(q.duration || 30)
        setTimerRunning(true)
        setLastQuestionResults(null)
        setSelectedCorrect(null)
        setLiveAnswers(prev => ({ ...prev, [q.id]: { total: 0, counts: {} } }))
        try { subscribeToClass(selected, { role: 'teacher' }) } catch(e) { console.warn('subscribeToClass on launch failed', e) }
        toast('Pregunta lanzada: ' + q.title)

        // Persist indices only after successful create so we don't skip the last question
        meta.currentBlockIndex = nextBlockIndex
        meta.currentQuestionIndex = nextQuestionIndex
        if (nextBlockIndex >= (meta.blocks ? meta.blocks.length : 0)) {
          meta.finished = true
        }
        try { await persistClassMeta(selected, meta); console.log('persisted advanced indices from jumpToQuestion', { classId: selected, meta }); setBlockViewIndex(meta.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist class meta failed', e) }
        // If finished, prepare final winners modal
        if (meta.finished) {
          const tops = (participants || []).slice().sort((a,b)=> (b.score||0)-(a.score||0)).slice(0,3)
          setFinalWinners(tops)
          setShowFinalModal(true)
        }
      } catch (e) {
        console.error('jumpToQuestion createQuestion failed', e)
        toast('Error creando/cargando pregunta: ' + (e && e.message ? e.message : String(e)))
      }
    } catch (e) { console.error('jumpToQuestion failed', e); toast('No se pudo seleccionar o lanzar la pregunta') }
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

  // Ranking chart data + options (colorful + animated)
  const sortedParticipants = (participants || []).slice().sort((a,b)=> (b.score||0)-(a.score||0))
  const top10 = sortedParticipants.slice(0,10)
  const rankingLabels = top10.map(p => p.displayName)
  const rankingValues = top10.map(p => p.score || 0)
  const palette = ['#EF4444','#F59E0B','#10B981','#3B82F6','#8B5CF6','#EC4899','#06B6D4','#F97316','#6366F1','#14B8A6']
  const rankingColors = top10.map((_, i) => i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : palette[i % palette.length])
  const rankingData = { labels: rankingLabels, datasets: [{ label: 'Puntos', data: rankingValues, backgroundColor: rankingColors, borderRadius: 8, barPercentage: 0.72 }] }
  const rankingOptions = {
    maintainAspectRatio: false,
    responsive: true,
    animation: { duration: 900, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}` }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 40, minRotation: 0 } },
      y: { beginAtZero: true, ticks: { stepSize: 1 } }
    }
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-2">
  <Input label="Nombre de la clase" value={name} setValue={setName} />
  <Input label="Nombre profesor" value={teacherName} setValue={setTeacherName} />
  <Button onClick={handleCreate} variant="primary" disabled={creating}>{creating ? 'Creando...' : 'Crear clase'}</Button>
        <Button onClick={onClose} variant="ghost">Cerrar</Button>
      </div>

      {/*
        Vista principal cuando hay una clase seleccionada:
        - Encabezado con nombre de clase y banner de reinicio (si meta.finished)
        - Controles (exportar, activar, borrar)
        - FancyCard que contiene:
          * Timeline por bloques (click para jumpToQuestion)
          * Área central: pregunta activa / opciones / temporizador / botones
          * Columna derecha: lista de participantes y ranking
      */}
      {selected ? (
        <div className="space-y-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">{(classes.find(c => (c.code||c.id)===selected) || {}).name || selected}</h2>
              <div className="text-sm opacity-60">Código: <span className="font-mono">{selected}</span></div>
            </div>
            {/* Show banner if the persisted class meta marks the game as finished */}
            {(() => {
              try {
                const cls = classes.find(c => (c.code || c.id) === selected) || {}
                const meta = cls.meta || {}
                if (meta.finished) {
                  return (
                    <div className="ml-4 flex items-center gap-3">
                      <div className="px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg text-sm">Juego finalizado</div>
                      <div>
                        <button onClick={async () => {
                          try {
                            meta.finished = false
                            meta.currentBlockIndex = 0
                            meta.currentQuestionIndex = 0
                            await persistClassMeta(selected, meta)
                            toast('Juego reiniciado')
                          } catch (e) { console.warn('restartGame failed', e); toast('No se pudo reiniciar') }
                        }} className="px-3 py-1 rounded bg-blue-600 text-white text-sm">Reiniciar juego</button>
                      </div>
                    </div>
                  )
                }
              } catch (e) { /* ignore */ }
              return null
            })()}
            <div className="flex items-center gap-2">
              <Button onClick={handleToggleActive} variant="ghost">Activar/Desactivar</Button>
              <Button onClick={handleDelete} variant="destructive">Borrar</Button>
            </div>
          </div>

          <FancyCard className="p-6">
            <div className="flex flex-col md:flex-row md:items-start md:gap-6">
              <div className="flex-1">
                <div className="mb-4">
                  {/* Timeline del bloque actual:
                      - Muestra tabs de bloques y un timeline compacto (nodos numerados)
                      - Cada nodo llama a `jumpToQuestion(blockIndex, i)`
                      - Los colores usan `isActive` (amarillo) y `isLaunched` (verde)
                  */}
                  {(() => {
                    const currentClass = classes.find(c => (c.code || c.id) === selected) || {}
                    const currentMeta = currentClass.meta || {}
                // allow teacher to view a specific block via blockViewIndex (tabs)
                    const blockIndex = (typeof blockViewIndex === 'number') ? blockViewIndex : ((typeof currentMeta.currentBlockIndex === 'number') ? currentMeta.currentBlockIndex : 0)
                    // Build preview blocks from data if meta.blocks not present
                    const buildBlock = (id, name, items, mapper) => ({ id, name, questions: items.map(mapper) })
                    const verifMapper = (v, idx) => ({ id: `q-verif-${idx}`, title: v.q, duration: v.duration || 30 })
                    const ethicsMapper = (e, idx) => ({ id: `q-eth-${idx}`, title: e.text, duration: e.duration || 30 })
                    const badMapper = (b, idx) => ({ id: `q-bad-${idx}`, title: b.bad, duration: b.duration || 30 })
                    const previewBlocks = [
                      buildBlock('ETHICS', 'Escenarios éticos', ETHICS_SCENARIOS, ethicsMapper),
                      buildBlock('VERIF', 'Verificación', VERIF_QUIZ, verifMapper),
                      buildBlock('PROMPTS', 'Mejorar prompts', BAD_PROMPTS, badMapper)
                    ]
                    const blocks = currentMeta.blocks ? currentMeta.blocks : previewBlocks
                    const currentBlock = (blocks && blocks[blockIndex]) ? blocks[blockIndex] : blocks[0]
                    const currentQuestions = (currentBlock && Array.isArray(currentBlock.questions)) ? currentBlock.questions : []
  // launchedUpTo must be computed per-block: if the persisted currentBlockIndex
  // is greater than this block, then all questions in the block were launched;
  // if equal, then launchedUpTo is currentQuestionIndex - 1; otherwise none.
  let launchedUpTo = -1
  if (currentMeta && typeof currentMeta.currentQuestionIndex === 'number' && typeof currentMeta.currentBlockIndex === 'number') {
    if (currentMeta.currentBlockIndex > blockIndex) {
      launchedUpTo = (currentQuestions.length || 0) - 1
    } else if (currentMeta.currentBlockIndex === blockIndex) {
      launchedUpTo = currentMeta.currentQuestionIndex - 1
    } else {
      launchedUpTo = -1
    }
  } else if (currentMeta && typeof currentMeta.currentQuestionIndex === 'number') {
    // fallback: if no block info, assume same block
    launchedUpTo = currentMeta.currentQuestionIndex - 1
  }
  // Determine the index to display for the header.
  // Prefer the actively running question (if it's from this block),
  // otherwise show the last launched question (launchedUpTo),
  // and as a final fallback derive from currentQuestionIndex stored in meta.
  let displayedIndex = 0
  if (questionRunning && questionRunning.payload && Number(questionRunning.payload.blockIndex) === blockIndex && typeof questionRunning.payload.questionIndex === 'number') {
    displayedIndex = Number(questionRunning.payload.questionIndex)
  } else if (launchedUpTo >= 0) {
    displayedIndex = launchedUpTo
  } else if (currentMeta && typeof currentMeta.currentQuestionIndex === 'number') {
    displayedIndex = Math.max(0, currentMeta.currentQuestionIndex - 1)
  }
                    // Número mostrado (1-based): asegurar que la presentación nunca muestre 0
                    const displayedQuestionNumber = Math.min(Math.max(1, displayedIndex + 1), currentQuestions.length || 1)
                    if (!currentBlock) return null
                    return (
                      <div>
                        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-medium">Bloque: {currentBlock.name}</div>
          <div className="text-xs opacity-60">Pregunta {displayedQuestionNumber} / {currentQuestions.length}</div>
                        </div>
                        {/* Block selector tabs */}
                        <div className="flex gap-2 mb-3">
                          {blocks.map((b, bi) => (
                            <button key={b.id} onClick={() => { setBlockViewIndex(bi); }} className={"px-3 py-1 rounded text-sm " + (bi === blockIndex ? 'bg-blue-600 text-white' : 'bg-white/5')}>{b.name}</button>
                          ))}
                        </div>
                        
                                    {/* Single horizontal timeline (compact) - removed duplicate top row */}
                        {/* Horizontal timeline: numbered nodes with connecting line (minimal, aesthetic) */}
                        <div className="mt-4">
                          <div className="relative">
                            <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 pointer-events-none">
                              <div className="h-0.5 bg-slate-500/30 rounded" />
                            </div>
                            <div className="overflow-x-auto py-2">
                              <div className="flex items-center justify-between gap-4 px-2 w-full">
                                {currentQuestions.map((q, i) => {
                                  const isActive = questionRunning && questionRunning.payload && Number(questionRunning.payload.blockIndex) === blockIndex && Number(questionRunning.payload.questionIndex) === i
                                  const isLaunched = i <= launchedUpTo
                                  const baseClasses = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shadow-sm transition-transform'
                                  const colorClass = isActive ? 'bg-yellow-400 text-black ring-2 ring-yellow-300 scale-105' : isLaunched ? 'bg-green-500 text-white' : 'bg-slate-700 text-white/90'
                                  return (
                                    <div key={q.id || i} className="flex flex-col items-center min-w-[36px] flex-1">
                                      <button title={q.title} aria-label={q.title} onClick={() => jumpToQuestion(blockIndex, i)} className={baseClasses + ' ' + colorClass}>
                                        {i+1}
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
                {/*
                  Área de pregunta activa:
                  - Muestra título, opciones y el temporizador grande para el profesor.
                  - Botones para: lanzar siguiente / revelar / ver puntuación.
                */}
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
                    <Button onClick={() => handleLaunch()} variant="primary">{pendingAdvance ? 'Continuar' : (questionRunning ? 'Lanzar siguiente' : 'Lanzar pregunta')}</Button>
                    <Button onClick={() => handleRevealAction()} variant="ghost">Revelar</Button>
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
              {/* Participants column: collapsible to prioritize question area */}
              {/*
                Columna de participantes:
                - Lista con estado (conectado/desconectado) y puntuaciones.
                - Botón para ocultar la columna si el profesor desea más espacio.
              */}
              {showParticipantsList ? (
                <div className="w-full md:w-72 mt-6 md:mt-0">
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="font-semibold">Participantes</h4>
                    <button className="text-sm text-slate-600" onClick={() => setShowParticipantsList(false)}>Ocultar</button>
                  </div>
                  <div className="mb-4">
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
              ) : (
                <div className="w-full md:w-14 mt-6 md:mt-0 flex items-start justify-end">
                  <button className="text-sm text-slate-600" onClick={() => setShowParticipantsList(true)}>Mostrar participantes</button>
                </div>
              )}
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
                  <Button onClick={() => handleLaunch()} variant="primary">Lanzar pregunta</Button>
    
                  
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
                  <div className="mt-3" style={{ height: 260 }}>
                    {participants.length===0 ? <p className="text-sm text-slate-600">Sin participantes</p> : (
                      <div className="h-full">
                        <Bar options={rankingOptions} data={rankingData} />
                        <div className="mt-4 flex items-center justify-center gap-4">
                          {sortedParticipants.slice(0,3).map((p,i) => (
                            <div key={p.sessionId || i} className={"flex flex-col items-center p-2 rounded-lg shadow-md transform transition-all " + (i===0 ? 'scale-105 animate-bounce' : 'opacity-95') }>
                              <div className="text-3xl">{i===0 ? '🥇' : i===1 ? '🥈' : '🥉'}</div>
                              <div className="font-semibold mt-1 text-sm truncate" style={{maxWidth:120}}>{p.displayName}</div>
                              <div className="text-xs opacity-70">{p.score || 0} pts</div>
                            </div>
                          ))}
                        </div>
                      </div>
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
            {/* If open answers are present, show them for manual grading */}
            { lastQuestionResults && lastQuestionResults.answers && Array.isArray(lastQuestionResults.answers) && (
              <div className="mt-4">
                <h4 className="font-semibold mb-2">Respuestas abiertas (revisión manual)</h4>
                <div className="space-y-3 max-h-64 overflow-auto">
                  {lastQuestionResults.answers.map(a => (
                    <div key={a.sessionId} className="p-3 border rounded bg-white/5">
                      <div className="text-sm opacity-70 mb-2">Alumno: {a.sessionId}</div>
                      <div className="mb-2 text-left whitespace-pre-wrap">{String(a.answer||'')}</div>
                      <div className="flex items-center gap-2">
                        <input defaultValue={0} type="number" min={0} className="w-24 p-2 rounded bg-white/10" id={`pts-${a.sessionId}`} />
                        <Button onClick={async () => {
                          try {
                            const el = document.getElementById(`pts-${a.sessionId}`)
                            const pts = el ? Number(el.value || 0) : 0
                            await postParticipantUpdate(selected, { sessionId: a.sessionId, scoreDelta: pts })
                            toast('Puntos asignados: ' + pts)
                            // refresh participants
                            await fetchParticipants()
                          } catch (e) { toast('Error asignando puntos: ' + (e && e.message ? e.message : e)) }
                        }} variant="primary">Asignar puntos</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </FancyCard>
        </div>
      )}
  {/* Modal con el código de clase (para que los alumnos se unan) */}
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
  {/* Vista fullscreen del profesor: útil para proyectar la pregunta en pantalla grande */}
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
              <Button onClick={() => handleRevealAction()} variant="primary">Revelar resultado</Button>
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
  {/* Overlay de puntuaciones acumuladas: se muestra tras reveal o manualmente */}
  {showScoresOverlay && (
        <div className="fixed inset-0 z-80 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowScoresOverlay(false)} />
              <div className="relative z-10 bg-white rounded-xl p-6 max-w-2xl w-full">
                <h3 className="text-xl font-bold mb-3">Puntuaciones acumuladas</h3>
                <div className="w-full">
                  <div className="mb-4 w-full overflow-x-auto">
                    <div className="flex gap-3 items-stretch" style={{ minWidth: 420, whiteSpace: 'nowrap' }}>
                      {sortedParticipants.slice(0,3).map((p,i) => (
                        <div key={p.sessionId || i} className="text-center p-3 rounded-lg shadow-lg inline-block" style={{ background: i===0 ? 'linear-gradient(135deg,#FFD54A,#FFD700)' : i===1 ? 'linear-gradient(135deg,#E0E0E0,#C0C0C0)' : 'linear-gradient(135deg,#D4A373,#CD7F32)', width: 220, minWidth: 120 }}>
                          <div className="text-4xl">{i===0 ? '👑' : i===1 ? '🥈' : '🥉'}</div>
                          <div className="font-bold mt-2 text-lg truncate">{p.displayName}</div>
                          <div className="text-sm opacity-80">{p.score || 0} pts</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ height: 260 }}>
                    {participants.length===0 ? <p className="text-sm text-slate-600">Sin participantes</p> : (
                      <Bar options={rankingOptions} data={rankingData} />
                    )}
                  </div>
                  <div className="mt-4 space-y-2 max-h-40 overflow-auto">
                    {participants.slice().sort((a,b)=> (b.score||0)-(a.score||0)).map(p=> (
                      <div key={p.sessionId} className="flex justify-between items-center p-2 border rounded">
                        <div className="font-semibold">{p.displayName}</div>
                        <div className="font-bold">{p.score||0}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-4 flex justify-end"><Button onClick={()=> setShowScoresOverlay(false)} variant="ghost">Cerrar</Button></div>
              </div>
        </div>
      )}
              {/* Final winners modal (muy vistoso) */}
              {showFinalModal && (
                <div className="fixed inset-0 z-90 flex items-center justify-center">
                  <div className="absolute inset-0 bg-black/70" onClick={() => setShowFinalModal(false)} />
                  <div className="relative z-10 bg-white rounded-2xl p-8 max-w-4xl w-full text-center shadow-2xl">
                    <div className="text-4xl font-extrabold mb-4">¡Fin del juego!</div>
                    <div className="mb-6 text-lg opacity-70">Top 3 — Felicidades a los mejores participantes</div>
                    <div className="flex items-center justify-center gap-6 mb-6">
                      {finalWinners.length === 0 ? (
                        <div className="text-sm opacity-60">No hay participantes</div>
                      ) : finalWinners.map((p, i) => (
                        <div key={p.sessionId || i} className={"p-6 rounded-lg text-center shadow-lg transform " + (i===0 ? 'scale-110 bg-gradient-to-br from-yellow-300 to-yellow-400' : i===1 ? 'bg-gray-200' : 'bg-yellow-100')} style={{ width: 200 }}>
                          <div className="text-5xl mb-2">{i===0 ? '🥇' : i===1 ? '🥈' : '🥉'}</div>
                          <div className="font-bold text-lg truncate">{p.displayName}</div>
                          <div className="text-sm opacity-80">{p.score || 0} pts</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-center gap-4">
                      <Button onClick={() => setShowFinalModal(false)} variant="primary">Cerrar</Button>
                      <Button onClick={async () => {
                        try {
                          // reset game to start
                          const cls = classes.find(c => (c.code || c.id) === selected) || {}
                          const meta = cls.meta || {}
                          meta.finished = false
                          meta.currentBlockIndex = 0
                          meta.currentQuestionIndex = 0
                          await persistClassMeta(selected, meta)
                          setShowFinalModal(false)
                          toast('Juego reiniciado')
                        } catch (e) { console.warn('reset from final modal failed', e); toast('No se pudo reiniciar') }
                      }} variant="ghost">Reiniciar juego</Button>
                    </div>
                  </div>
                </div>
              )}
    </div>
  )
}