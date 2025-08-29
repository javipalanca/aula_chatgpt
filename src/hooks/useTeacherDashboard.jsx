import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { createClass, listClasses, listClassParticipants, createQuestion, syncClassesRemote, initRealtime, revealQuestion, subscribeToClass, persistClassMeta, deleteClass, setClassActive, getApiBase } from '../lib/storage'
import { VERIF_QUIZ, ETHICS_SCENARIOS, BAD_PROMPTS } from '../lib/data'
import { toast } from '../components/Toaster'
import useRealtime from './useRealtime'

/**
 * useTeacherDashboard
 * -------------------
 * Centralized hook that powers the teacher UI. It manages classes, the
 * currently running question, timers, participants, live answers and
 * exposes action handlers used by the TeacherDashboard component.
 *
 * Major blocks:
 * - state declarations: all UI state used by the teacher dashboard
 * - helper mappers: functions to convert static datasets into question objects
 * - effects: initialization (load classes, sync remote), polling and subscription
 * - realtime handlers: delegated to `useRealtime` to react to student events
 * - actions: functions that launch questions, reveal results, create classes, etc.
 * - return: public API consumed by the UI
 */
export default function useTeacherDashboard() {
  const [classes, setClasses] = useState([])
  const [selected, setSelected] = useState(null)
  const [questionRunning, setQuestionRunning] = useState(null)
  const [lastQuestionResults, setLastQuestionResults] = useState(null)
  const [showScoresOverlay, setShowScoresOverlay] = useState(false)
  const [showParticipantsList] = useState(true)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [selectedCorrect, setSelectedCorrect] = useState(null)
  const [participants, setParticipants] = useState([])
  const [liveAnswers, setLiveAnswers] = useState({})
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [codeToShow, setCodeToShow] = useState('')
  const [blockViewIndex, setBlockViewIndex] = useState(0)
  const [showFinalModal, setShowFinalModal] = useState(false)
  const [finalWinners, setFinalWinners] = useState([])
  const [showNextBlockButton, setShowNextBlockButton] = useState(false)
  const [showFinishGameButton, setShowFinishGameButton] = useState(false)
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState(new Set())
  const [lastRefresh, setLastRefresh] = useState(null)
  const mountedRef = useRef(true)

  const API_BASE = getApiBase()

  function getDefaultMeta() {
    return {
      currentBlockIndex: 0,
      currentQuestionIndex: 0,
      finished: false,
      startedAt: null,
      askedQuestions: {},
      revealedQuestions: {},
      mode: 'timed',
      timer: 30
    }
  }

  // --- small helpers extracted for readability ---
  const buildBlock = (id, name, items, mapper) => ({ id, name, questions: items.map(mapper) })
  const verifMapper = (v, idx) => ({
    id: `q-verif-${idx}-${Date.now()}`,
    title: v.q,
    duration: v.duration || 30,
    options: Array.isArray(v.options) ? v.options.slice() : [],
    type: v.type || 'single',
    maxPoints: v.maxPoints || 100,
    timeDecay: typeof v.timeDecay === 'boolean' ? v.timeDecay : true,
    payload: { source: 'VERIF_QUIZ', explain: v.explain, correctAnswer: (Array.isArray(v.options) && typeof v.a !== 'undefined') ? v.options[v.a] : null }
  })
  const ethicsMapper = (e, idx) => ({
    id: `q-eth-${idx}-${Date.now()}`,
    title: e.text,
    duration: e.duration || 30,
    options: ['No es correcto','Es correcto'],
    type: e.type || 'single',
    maxPoints: e.maxPoints || 100,
    timeDecay: typeof e.timeDecay === 'boolean' ? e.timeDecay : true,
    payload: { source: 'ETHICS_SCENARIOS', why: e.why, correctAnswer: e.good ? 'Es correcto' : 'No es correcto' }
  })
  const badMapper = (b, idx) => ({
    id: `q-bad-${idx}-${Date.now()}`,
    title: b.bad,
    duration: b.duration || 180,
    options: [],
    type: b.type || 'prompt',
    maxPoints: b.maxPoints || 200,
    timeDecay: typeof b.timeDecay === 'boolean' ? b.timeDecay : false,
    systemPrompt: b.systemPrompt || null,
    payload: { source: 'BAD_PROMPTS', tip: b.tip, evaluation: 'prompt' }
  })
  // (helpers for building default blocks are available as the individual mappers)

  // return the index of the first question in block that has not been asked yet
  function findFirstUnaskedIndex(block, meta) {
    try {
      if (!block || !Array.isArray(block.questions) || block.questions.length === 0) return null
      const asked = (meta && meta.askedQuestions) ? meta.askedQuestions : {}
      for (let i = 0; i < block.questions.length; i++) {
        const q = block.questions[i]
        if (!q) continue
        if (!asked[q.id]) return i
      }
      return null // all asked
    } catch (e) { return null }
  }

  useEffect(()=>{
    // Inicialización de clases
    setClasses(listClasses())
    syncClassesRemote().then(()=> { if (mountedRef.current) setClasses(listClasses()) }).catch((e)=>{ console.warn('syncClassesRemote failed', e) })
    function onUpdate(e) { try { setClasses(Object.values(e.detail || listClasses())) } catch(_) { setClasses(listClasses()) } }
    window.addEventListener('aula-classes-updated', onUpdate)
    return ()=> { mountedRef.current = false; window.removeEventListener('aula-classes-updated', onUpdate) }
  }, [])

  // fetch functions stable with useCallback
  const fetchParticipants = useCallback(async () => {
    try {
      if (!selected) return setParticipants([])
      const parts = await listClassParticipants(selected)
      setParticipants(parts || [])
      setLastRefresh(new Date())
    } catch (e) {
      console.warn('fetchParticipants failed', e)
    }
  }, [selected])

  const fetchAnsweredQuestions = useCallback(async (classId) => {
    try {
      const r = await fetch(`/api/answers?classId=${encodeURIComponent(classId)}`)
      if (!r.ok) return
      const docs = await r.json()
      const answeredIds = new Set(docs.map(d => d.questionId))
      setAnsweredQuestionIds(answeredIds)
    } catch (e) {
      console.warn('fetchAnsweredQuestions failed', e)
    }
  }, [])

  useEffect(()=>{
    if (selected) {
      initRealtime()
      try { subscribeToClass(selected, { role: 'teacher' }) } catch(e) { console.warn('subscribeToClass failed', e) }
      fetchParticipants()
      fetchAnsweredQuestions(selected)
      try {
        const cls = classes.find(c => (c.code || c.id) === selected) || {}
        const meta = cls.meta || {}
        if (typeof meta.currentBlockIndex === 'number') setBlockViewIndex(meta.currentBlockIndex)
      } catch(e) { /* ignore */ }
    } else {
      setParticipants([])
      setAnsweredQuestionIds(new Set())
    }
    return ()=> { /* cleanup handled globally by storage.js websocket */ }
  }, [selected, fetchParticipants, fetchAnsweredQuestions, classes])

  useEffect(() => {
    if (!selected) return
    const POLL_MS = 5000
    let mounted = true
    const tick = async () => {
      try {
        if (!mounted) return
        await fetchParticipants()
      } catch (e) { console.warn('participants poll failed', e) }
    }
    const id = setInterval(tick, POLL_MS)
    return () => { mounted = false; clearInterval(id) }
  }, [selected, fetchParticipants])

  useEffect(()=>{
  // Do not auto-open the scores overlay when results arrive; require teacher to press "Mostrar puntuación"
  // This prevents revealing scores immediately on reveal and gives teacher control.
  }, [lastQuestionResults])

  // delegate realtime handling to useRealtime hook
  useRealtime(selected, {
    onParticipantsUpdated: (parts) => {
      setParticipants(parts.map(p => ({ sessionId: p.sessionId, displayName: p.displayName, score: p.score, lastSeen: p.lastSeen })))
      setLastRefresh(new Date())
    },
    onQuestionLaunched: (q) => {
      setQuestionRunning(q)
      setSecondsLeft(q.duration || 30)
      setTimerRunning(true)
      setLastQuestionResults(null)
      setSelectedCorrect(null)
      setLiveAnswers(prev => { const copy = {...prev}; delete copy[q.id]; return copy })
    },
    onAnswersCount: (d) => {
      setLiveAnswers(prev => ({ ...prev, [d.questionId]: { total: d.total || 0, counts: d.counts || {} } }))
      if (d.total >= participants.length) {
        const correct = questionRunning && questionRunning.payload && questionRunning.payload.correctAnswer ? questionRunning.payload.correctAnswer : null
        try { handleRevealAction(correct) } catch (_) { /* swallow */ }
      }
    },
    onQuestionResults: (d) => {
      setLastQuestionResults(d)
      setTimerRunning(false)
      setLiveAnswers(prev => ({ ...prev, [d.questionId]: { total: Object.values(d.distribution || {}).reduce((a,b)=>a+b,0), counts: d.distribution || {} } }))
    },
    onParticipantHeartbeat: (d) => {
      setParticipants(prev => {
        const copy = (prev || []).slice()
        const idx = copy.findIndex(p => p.sessionId === d.sessionId)
  // Preserve existing displayName if heartbeat does not include one
  const existingName = (copy[idx] && copy[idx].displayName) ? copy[idx].displayName : null
  const entry = { sessionId: d.sessionId, displayName: d.displayName || existingName || (`Alumno-${String(d.sessionId).slice(0,5)}`), score: (copy[idx] && copy[idx].score) || 0, lastSeen: d.lastSeen || new Date(), connected: d.type === 'participant-heartbeat' }
        if (idx === -1) copy.push(entry)
        else copy[idx] = { ...copy[idx], ...entry }
        return copy
      })
    }
  })

  useEffect(() => {
    if (!timerRunning || !questionRunning || secondsLeft <= 0) {
      setTimerRunning(false);
      return;
    }
    const t = setInterval(()=> setSecondsLeft(s => {
      const next = Math.max(0, s-1)
      if (next === 0) {
        setTimerRunning(false)
        try {
          const preferred = questionRunning?.payload?.correctAnswer;
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

  // fetchParticipants and fetchAnsweredQuestions are declared above with useCallback

  async function handleRevealAction(preferredAnswer = null) {
    if (!questionRunning) return toast('No hay pregunta activa')
    setTimerRunning(false)
    // If this reveal is for the special end-of-game marker, keep the displayed secondsLeft
    const isGameEnd = questionRunning && questionRunning.payload && questionRunning.payload.type === 'game-ended'
    if (!isGameEnd) setSecondsLeft(0)
    const preferred = preferredAnswer || questionRunning?.payload?.correctAnswer
    const qPayload = (questionRunning && questionRunning.payload) ? questionRunning.payload : {}
    const evalMode = (qPayload && typeof qPayload.evaluation === 'string') ? qPayload.evaluation : ((qPayload && (qPayload.source === 'BAD_PROMPTS' || qPayload.source === 'PROMPTS')) ? 'prompt' : 'mcq')
    // Never ask the teacher: obtain correct answer from question payload fields
    const fromPayload = (qPayload && (typeof qPayload.correctAnswer !== 'undefined')) ? qPayload.correctAnswer : (qPayload && (typeof qPayload.correct !== 'undefined') ? qPayload.correct : null)
    const correct = (typeof preferred !== 'undefined' && preferred !== null) ? preferred : fromPayload
    if ((evalMode === 'mcq' || evalMode === 'redflags') && (typeof correct === 'undefined' || correct === null)) {
      return toast('No se encontró la respuesta correcta en la pregunta. Revisa la definición en data.js')
    }
    try {
      try {
        const res = await revealQuestion(selected, questionRunning.id, correct)
        setLastQuestionResults(res)
        setSelectedCorrect(correct)
        toast('Resultados mostrados')
        return
      } catch (err) {
        console.warn('revealQuestion (WS) failed, attempting HTTP fallback', err)
        // continue to HTTP fallback
      }

      // HTTP fallback: call the reveal endpoint directly
      try {
        const pointsToSend = (questionRunning && typeof questionRunning.maxPoints === 'number') ? Number(questionRunning.maxPoints) : ((questionRunning && questionRunning.payload && questionRunning.payload.maxPoints) ? Number(questionRunning.payload.maxPoints) : 100)
        const r = await fetch(`/api/questions/${encodeURIComponent(questionRunning.id)}/reveal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId: selected, correctAnswer: correct, points: pointsToSend })
        })
        if (!r.ok) throw new Error('HTTP reveal failed: ' + r.status)
        const json = await r.json()
        setLastQuestionResults(json)
        setSelectedCorrect(correct)
        toast('Resultados mostrados (fallback HTTP)')
        return
      } catch (httpErr) {
        console.error('HTTP reveal fallback failed', httpErr)
        toast('Error mostrando resultados: ' + (httpErr && httpErr.message ? httpErr.message : String(httpErr)))
      }
    } catch (e) { toast('Error mostrando resultados: ' + (e.message || e)) }
  }

  async function handleCreateClass({ name, teacherName }) {
    try {
      const cls = await createClass({ name, teacherName, meta: {}, password: '' });
      setClasses(listClasses());
      setSelected(cls.code || cls.id || cls);
      toast('Clase creada: ' + (cls.code || cls.id || cls));
    } catch (err) {
      toast('No se pudo crear: ' + (err.message || err));
    }
  }

  async function handleDeleteClass(code) {
    if (!code) return;
    if (!confirm('¿Borrar esta clase? Esta acción es irreversible.')) return;
    try {
      await deleteClass(code);
      setClasses(listClasses());
      if (selected === code) setSelected(null);
      toast('Clase borrada');
    } catch (e) {
      toast('No se pudo borrar: ' + (e.message || e));
    }
  }

  async function handleToggleActiveClass(code) {
    if (!code) return;
    try {
      const cls = classes.find(c => (c.code || c.id) === code);
      const current = cls ? cls.active : true;
      await setClassActive(code, !current);
      setClasses(listClasses());
      toast(!current ? 'Clase activada' : 'Clase desactivada');
    } catch (e) {
      toast('No se pudo actualizar: ' + (e.message || e));
    }
  }
  


    async function handleRestartGame() {
      if (!selected) return
      try {
        // Try atomic server-side reset endpoint first
        const res = await fetch(API_BASE + `/api/classes/${selected}/reset`, { method: 'POST' })
        if (res.ok) {
          await res.json()
          // Update local UI state to match server reset
          setClasses(listClasses())
          setQuestionRunning(null)
          setLastQuestionResults(null)
          setLiveAnswers({})
          setSelectedCorrect(null)
          setShowNextBlockButton(false)
          setShowFinishGameButton(false)
          setAnsweredQuestionIds(new Set())
          setBlockViewIndex(0)
          try { fetchParticipants() } catch(e) { console.warn('fetchParticipants after reset failed', e) }
          toast('Juego reiniciado')
          return
        }
      } catch (e) {
        console.warn('atomic reset endpoint failed, falling back', e)
      }

      // Fallback: best-effort sequence (compatibility)
      try {
        await fetch(API_BASE + '/api/participants/reset-scores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId: selected })
        })

        // reset class meta locally and persist
        const cls = classes.find(c => (c.code || c.id) === selected)
        if (cls) {
          const meta = getDefaultMeta()
          await persistClassMeta(selected, meta)
        }

        // best-effort delete answers remotely
        try {
          await fetch(API_BASE + `/api/answers?classId=${selected}`, { method: 'DELETE' })
        } catch (e) { console.warn('delete answers failed', e) }

  setClasses(listClasses())
  setQuestionRunning(null)
  setLastQuestionResults(null)
  setLiveAnswers({})
  setSelectedCorrect(null)
  setShowNextBlockButton(false)
  setShowFinishGameButton(false)
  setAnsweredQuestionIds(new Set())
  setBlockViewIndex(0)
  try { fetchParticipants() } catch(e) { console.warn('fetchParticipants after reset failed', e) }
        } catch (e) {
          console.error('fallback restart failed', e)
        }
      }

      async function handleFinishGame() {
        if (!selected) return;
        const cls = classes.find(c => (c.code || c.id) === selected) || {};
        const meta = cls.meta || {};

        meta.finished = true;
        await persistClassMeta(selected, meta);
        setClasses(listClasses());
        setShowFinishGameButton(false);

        const tops = (participants || []).slice().sort((a,b)=> (b.score||0)-(a.score||0)).slice(0,3);
        setFinalWinners(tops);
        setShowFinalModal(true);
        toast('Juego finalizado');
      }

  function handleShowCode(code) {
    if (!code) return;
    setCodeToShow(code);
    setShowCodeModal(true);
  }

  // stable wrapper for show code used by children (use handleShowCode directly)

  async function handleLaunch() {
    console.log('handleLaunch invoked', { selected })
    if (!selected) return toast('Selecciona una clase')
    try {
      const cls = classes.find(c => (c.code || c.id) === selected) || {}
      const meta = cls.meta || {}
      if (!meta.blocks) {
        meta.blocks = [
          buildBlock('ETHICS', 'Escenarios éticos', ETHICS_SCENARIOS, ethicsMapper),
          buildBlock('VERIF', 'Verificación', VERIF_QUIZ, verifMapper),
          buildBlock('PROMPTS', 'Mejorar prompts', BAD_PROMPTS, badMapper)
        ]
        meta.currentBlockIndex = 0
        meta.currentQuestionIndex = 0
        await persistClassMeta(selected, meta); 
        console.log('persisted initial class meta', { classId: selected, meta }); 
        setBlockViewIndex(meta.currentBlockIndex || 0); 
        setClasses(listClasses());
      }

      if (meta.finished) {
        const restart = confirm('El juego ya ha finalizado. ¿Reiniciar el juego y comenzar desde el principio?')
        if (!restart) {
          return toast('El juego ya ha finalizado')
        }
        await handleRestartGame();
        return; // Exit after restarting
      }

      const currentBlockIndex = (typeof meta.currentBlockIndex === 'number' ? meta.currentBlockIndex : 0)
      const currentQuestionIndex = (typeof meta.currentQuestionIndex === 'number' ? meta.currentQuestionIndex : 0)
      console.log('handleLaunch: currentBlockIndex', currentBlockIndex, 'currentQuestionIndex', currentQuestionIndex);
      const blocks = meta.blocks || []

      if (currentBlockIndex >= blocks.length) {
        // This case should ideally be caught by meta.finished, but as a safeguard
        return toast('No quedan bloques por lanzar')
      }

      const block = blocks[currentBlockIndex]
      if (!block || !Array.isArray(block.questions) || block.questions.length === 0) return toast('Bloque vacío')

      const questionToLaunch = block.questions[currentQuestionIndex]
      if (!questionToLaunch) {
        // This can happen if currentQuestionIndex is out of bounds for the current block
        return toast('No quedan preguntas en el bloque actual')
      }

      const payload = { ...(questionToLaunch.payload || {}), blockId: block.id, blockName: block.name, blockIndex: currentBlockIndex, questionIndex: currentQuestionIndex }
      const options = Array.isArray(questionToLaunch.options) ? questionToLaunch.options : []
            const qPayload = {
              id: questionToLaunch.id || `q-${Date.now()}`,
              title: questionToLaunch.title,
              options,
              duration: questionToLaunch.duration,
              type: questionToLaunch.type || 'single',
              maxPoints: questionToLaunch.maxPoints || 100,
              timeDecay: typeof questionToLaunch.timeDecay === 'boolean' ? questionToLaunch.timeDecay : true,
              systemPrompt: questionToLaunch.systemPrompt || null,
              payload
            }

      // Launch the current question
      const q = await createQuestion(selected, qPayload)
      setQuestionRunning(q)
      setSecondsLeft(q.duration || 30)
      setTimerRunning(true)
      setLastQuestionResults(null)
      setSelectedCorrect(null)
      setLiveAnswers(prev => ({ ...prev, [q.id]: { total: 0, counts: {} } }))
      try { subscribeToClass(selected, { role: 'teacher' }) } catch(e) { console.warn('subscribeToClass on launch failed', e) }
      toast('Pregunta lanzada: ' + q.title)

      // Mark this question as asked in class meta (so UI can show it as green)
      try {
        const cls2 = classes.find(c => (c.code || c.id) === selected) || {}
        const meta2 = cls2.meta || {}
        meta2.askedQuestions = meta2.askedQuestions || {}
        meta2.askedQuestions[q.id] = true
        await persistClassMeta(selected, meta2)
      } catch (e) { console.warn('mark askedQuestions failed', e) }

      // Advance question index for the next launch
      meta.currentQuestionIndex = currentQuestionIndex + 1;

      // Determine if next block/game end buttons should be shown
      const isLastQuestionOfBlock = currentQuestionIndex === (block.questions.length - 1);
      const isLastBlock = (currentBlockIndex + 1) >= (meta.blocks ? meta.blocks.length : 0);

      if (isLastQuestionOfBlock && isLastBlock) {
        setShowFinishGameButton(true);
        setShowNextBlockButton(false);
      } else if (isLastQuestionOfBlock) {
        setShowNextBlockButton(true);
        setShowFinishGameButton(false);
      } else {
        setShowNextBlockButton(false);
        setShowFinishGameButton(false);
      }

      // Persist meta without advancing block index here, as block advancement is now manual
      await persistClassMeta(selected, meta);
      setClasses(listClasses()); // Refresh classes to reflect updated meta
      setBlockViewIndex(currentBlockIndex); // Keep block view on current block

    } catch (err) {
      console.error('handleLaunch failed', err)
      toast('Error lanzando pregunta: ' + (err && err.message ? err.message : String(err)))
    }
  }

  async function jumpToQuestion(blockIndex, questionIndex) {
    console.log('jumpToQuestion invoked', { blockIndex, questionIndex });
    try {
      if (!selected) return
      const cls = classes.find(c => (c.code || c.id) === selected) || {}
      const meta = cls.meta || {}
      if (!meta.blocks) {
        // Initialize blocks if they don't exist
        meta.blocks = [
          buildBlock('ETHICS', 'Escenarios éticos', ETHICS_SCENARIOS, ethicsMapper),
          buildBlock('VERIF', 'Verificación', VERIF_QUIZ, verifMapper),
          buildBlock('PROMPTS', 'Mejorar prompts', BAD_PROMPTS, badMapper)
        ]
        meta.currentBlockIndex = 0
        meta.currentQuestionIndex = 0
        await persistClassMeta(selected, meta);
        setClasses(listClasses());
      }

      const blocks = meta.blocks || []
      if (blockIndex >= blocks.length) return toast('Bloque inválido')
      const block = blocks[blockIndex]
      if (!block || !Array.isArray(block.questions) || block.questions.length === 0) return toast('Bloque vacío')
      const qIdx = Math.min(questionIndex, block.questions.length - 1)

      // Update meta with the selected question's indices
      meta.currentBlockIndex = blockIndex
      meta.currentQuestionIndex = qIdx
      meta.finished = false; // Ensure game is not marked as finished if jumping to a question
      await persistClassMeta(selected, meta);
      setClasses(listClasses()); // Refresh classes to reflect updated meta
      setBlockViewIndex(blockIndex); // Update UI to show the selected block
      toast('Pregunta seleccionada: ' + (qIdx + 1) + ' del bloque ' + (blockIndex+1))

    } catch (e) { 
      console.error('jumpToQuestion failed', e);
      toast('No se pudo seleccionar la pregunta: ' + (e.message || e));
    }
  }

  async function handleNextBlock() {
    if (!selected) return
    try {
      const cls = classes.find(c => (c.code || c.id) === selected) || {}
      const meta = cls.meta || {}
      const blocks = meta.blocks || []
      const next = (typeof meta.currentBlockIndex === 'number' ? meta.currentBlockIndex : 0) + 1
      if (next >= blocks.length) return toast('No hay más bloques')
      meta.currentBlockIndex = next
      // Choose the first unasked question in the target block, if any
      const nextBlock = blocks[next]
      const firstUnasked = findFirstUnaskedIndex(nextBlock, meta)
      meta.currentQuestionIndex = (typeof firstUnasked === 'number' && firstUnasked >= 0) ? firstUnasked : 0
      await persistClassMeta(selected, meta)
      setClasses(listClasses())
      setBlockViewIndex(next)
  // Clear the "next block" UI state so teacher can launch the first question of the new block
  setShowNextBlockButton(false)
  setShowFinishGameButton(false)
  setQuestionRunning(null)
  setLastQuestionResults(null)
  setLiveAnswers({})
  setSelectedCorrect(null)
  setAnsweredQuestionIds(new Set())
  toast('Siguiente bloque')
    } catch (e) { console.error('handleNextBlock failed', e); toast('No se pudo avanzar de bloque') }
  }

  // When the teacher changes the block view (e.g. clicks a different block bubble),
  // ensure meta.currentBlockIndex/currentQuestionIndex are set so the "next question"
  // will be the first non-asked in that block; if all asked, enable the Next Block button.
  useEffect(() => {
    if (!selected) return
    try {
      const cls = classes.find(c => (c.code || c.id) === selected) || {}
      const meta = cls.meta || {}
      const blocks = meta.blocks || []
      const idx = blockViewIndex
      if (idx == null || idx < 0 || idx >= blocks.length) return
      const block = blocks[idx]
      const firstUnasked = findFirstUnaskedIndex(block, meta)
      if (typeof firstUnasked === 'number' && firstUnasked >= 0) {
        // Do not override a user's explicit selection: if meta.currentQuestionIndex
        // already points to an unasked question we keep it. Only replace when
        // the current index is invalid/out of range or points to an already-asked question.
        const curIdx = (typeof meta.currentQuestionIndex === 'number') ? meta.currentQuestionIndex : null
        const inRange = curIdx !== null && curIdx >= 0 && curIdx < (block.questions ? block.questions.length : 0)
        const asked = (meta && meta.askedQuestions) ? meta.askedQuestions : {}
        const curPointsToUnasked = inRange && !asked[block.questions[curIdx].id]

        if (!inRange || !curPointsToUnasked) {
          const needsBlockUpdate = meta.currentBlockIndex !== idx
          const needsQuestionUpdate = meta.currentQuestionIndex !== firstUnasked
          if (needsBlockUpdate || needsQuestionUpdate) {
            meta.currentBlockIndex = idx
            meta.currentQuestionIndex = firstUnasked
            meta.finished = false
            // persist but don't force a local classes refresh here (storage will emit update)
            persistClassMeta(selected, meta).catch(()=>{})
          }
        }
        setShowNextBlockButton(false)
        setShowFinishGameButton(false)
      } else {
        // All questions in this block were asked
        // If this is the last block, show finish, otherwise show next block
        const isLastBlock = (idx + 1) >= (blocks ? blocks.length : 0)
        setShowFinishGameButton(isLastBlock)
        setShowNextBlockButton(!isLastBlock)
      }
    } catch (e) { /* ignore */ }
  }, [blockViewIndex, selected, classes])

  const selectedClassData = selected ? classes.find(c => (c.code || c.id) === selected) : null;
  const memoSelectedClassData = useMemo(() => selectedClassData, [selected, classes])

  return {
    // state
    classes,
    selected,
    setSelected,
    questionRunning,
    lastQuestionResults,
    showScoresOverlay,
    setShowScoresOverlay,
    showParticipantsList,
    secondsLeft,
    timerRunning,
    selectedCorrect,
    participants,
    liveAnswers,
    showCodeModal,
    setShowCodeModal,
    codeToShow,
    setCodeToShow,
    blockViewIndex,
    setBlockViewIndex,
    showFinalModal,
  setShowFinalModal,
    finalWinners,
    showNextBlockButton,
    showFinishGameButton,
    answeredQuestionIds,
    lastRefresh,

    // derived
  selectedClassData: memoSelectedClassData,

    // actions
    fetchParticipants,
    fetchAnsweredQuestions,
    handleRevealAction,
    handleCreateClass,
    handleDeleteClass,
    handleToggleActiveClass,
    handleRestartGame,
    handleNextBlock,
    handleFinishGame,
    handleShowCode,
    handleLaunch,
    jumpToQuestion,
  }
}
