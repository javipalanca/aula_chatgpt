
/*
  TeacherDashboard.jsx

  Este archivo contiene el componente React que implementa la interfaz de
  profesor/profesora para gestionar una clase en tiempo real.

  Tras la refactorización, este componente actúa como un "controlador" o
  "orquestador". Mantiene todo el estado y la lógica de negocio (en hooks
  y manejadores de eventos), pero delega el renderizado de la UI a
  componentes hijos más pequeños y especializados que se encuentran en
  `src/components/dashboard`.
*/
import React, { useEffect, useState } from 'react';
import { FancyCard } from '../components/ui';
import { createClass, listClasses, listClassParticipants, createQuestion, syncClassesRemote, initRealtime, revealQuestion, subscribeToClass, persistClassMeta, postParticipantUpdate, deleteClass, setClassActive } from '../lib/storage';
import { VERIF_QUIZ, ETHICS_SCENARIOS, BAD_PROMPTS } from '../lib/data';
import { toast } from '../components/Toaster';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';

// Importar componentes refactorizados
import { ClassSelector } from '../components/dashboard/ClassSelector';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { Timeline } from '../components/dashboard/Timeline';
import { QuestionControl } from '../components/dashboard/QuestionControl';
import { ParticipantsPanel } from '../components/dashboard/ParticipantsPanel';
import { CodeModal } from '../components/dashboard/modals/CodeModal';
import { ScoresOverlay } from '../components/dashboard/modals/ScoresOverlay';
import { FinalWinnersModal } from '../components/dashboard/modals/FinalWinnersModal';

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export default function TeacherDashboard({ onClose }) {
  // State remains centralized here for now. Further refactoring could move this to custom hooks.
  const [classes, setClasses] = useState([]);
  const [selected, setSelected] = useState(null);
  const [questionRunning, setQuestionRunning] = useState(null);
  const [lastQuestionResults, setLastQuestionResults] = useState(null);
  const [showScoresOverlay, setShowScoresOverlay] = useState(false);
  const [showParticipantsList, setShowParticipantsList] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [selectedCorrect, setSelectedCorrect] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [liveAnswers, setLiveAnswers] = useState({});
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [codeToShow, setCodeToShow] = useState('');
  const [blockViewIndex, setBlockViewIndex] = useState(0);
  const [showFinalModal, setShowFinalModal] = useState(false);
  const [finalWinners, setFinalWinners] = useState([]);
  const [pendingAdvance, setPendingAdvance] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  // All useEffect hooks and handler functions remain here for now.
  // ... (toda la lógica de useEffects y funciones handle...)
  useEffect(()=>{
    // Inicialización de clases
    setClasses(listClasses())
    let mounted = true
    syncClassesRemote().then(()=> { if (mounted) setClasses(listClasses()) }).catch((e)=>{ console.warn('syncClassesRemote failed', e) })
    function onUpdate(e) { try { setClasses(Object.values(e.detail || listClasses())) } catch(_) { setClasses(listClasses()) } }
    window.addEventListener('aula-classes-updated', onUpdate)
    return ()=> { mounted = false; window.removeEventListener('aula-classes-updated', onUpdate) }
  }, [])

  useEffect(()=>{
    if (selected) {
      initRealtime()
      try { subscribeToClass(selected, { role: 'teacher' }) } catch(e) { console.warn('subscribeToClass failed', e) }
      fetchParticipants()
      try {
        const cls = classes.find(c => (c.code || c.id) === selected) || {}
        const meta = cls.meta || {}
        if (typeof meta.currentBlockIndex === 'number') setBlockViewIndex(meta.currentBlockIndex)
      } catch(e) { /* ignore */ }
    } else {
      setParticipants([])
    }
    return ()=> { /* cleanup handled globally by storage.js websocket */ }
  }, [selected])

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
  }, [selected])

  useEffect(()=>{
    if (lastQuestionResults) {
      setShowScoresOverlay(true)
    }
  }, [lastQuestionResults])

  useEffect(()=>{
    function onRealtime(e) {
      const d = e.detail || {}
      if (!d) return
      if (d.type === 'participants-updated' && d.classId === selected) {
        setParticipants(d.participants.map(p => ({ sessionId: p.sessionId, displayName: p.displayName, score: p.score, lastSeen: p.lastSeen })))
        setLastRefresh(new Date())
      }
      if (d.type === 'question-launched' && d.classId === selected) {
        setQuestionRunning(d.question)
        setSecondsLeft(d.question.duration || 30)
        setTimerRunning(true)
        setLastQuestionResults(null)
        setSelectedCorrect(null)
        setLiveAnswers(prev => { const copy = {...prev}; delete copy[d.question.id]; return copy })
      }
      if (d.type === 'answers-count' && d.classId === selected) {
        setLiveAnswers(prev => ({ ...prev, [d.questionId]: { total: d.total || 0, counts: d.counts || {} } }))
        if (d.total >= participants.length) {
          const correct = questionRunning && questionRunning.payload && questionRunning.payload.correctAnswer ? questionRunning.payload.correctAnswer : null
          handleRevealAction(correct)
        }
      }
      if (d.type === 'question-results' && d.classId === selected) {
        setLastQuestionResults(d)
        setTimerRunning(false)
        setLiveAnswers(prev => ({ ...prev, [d.questionId]: { total: Object.values(d.distribution || {}).reduce((a,b)=>a+b,0), counts: d.distribution || {} } }))
      }
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

  async function handleRevealAction(preferredAnswer = null) {
    if (!questionRunning) return toast('No hay pregunta activa')
    setTimerRunning(false)
    setSecondsLeft(0)
    const preferred = preferredAnswer || questionRunning?.payload?.correctAnswer;
    const correct = preferred || prompt('Respuesta correcta (texto exacto)')
    if (!correct) return
    try {
      const res = await revealQuestion(selected, questionRunning.id, correct)
      setLastQuestionResults(res)
      setSelectedCorrect(correct)
      toast('Resultados mostrados')
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
      const cls = classes.find(c => (c.code || c.id) === selected) || {};
      const meta = cls.meta || {};
      try {
        meta.finished = false;
        meta.currentBlockIndex = 0;
        meta.currentQuestionIndex = 0;
        await persistClassMeta(selected, meta);
        setClasses(listClasses());
        toast('Juego reiniciado');
      } catch (e) { console.warn('restartGame failed', e); toast('No se pudo reiniciar') }
  }

  function handleShowCode(code) {
    if (!code) return;
    setCodeToShow(code);
    setShowCodeModal(true);
  }

  async function handleLaunch() {
    // ... (toda la lógica de handleLaunch, que es enorme)
    console.log('handleLaunch invoked', { selected })
  if (!selected) return toast('Selecciona una clase')
    try {
      if (pendingAdvance) {
        const clsPending = classes.find(c => (c.code || c.id) === selected) || {}
        const metaPending = clsPending.meta || {}
        metaPending.currentBlockIndex = pendingAdvance.nextBlockIndex
        metaPending.currentQuestionIndex = pendingAdvance.nextQuestionIndex
        if (metaPending.currentBlockIndex >= (metaPending.blocks ? metaPending.blocks.length : 0)) {
          metaPending.finished = true
          try { await persistClassMeta(selected, metaPending); setBlockViewIndex(metaPending.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist pending final failed', e) }
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
        try { await persistClassMeta(selected, metaPending); setBlockViewIndex(metaPending.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist pending advance failed', e) }
        setPendingAdvance(null)
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
      if (!meta.blocks) {
        const buildBlock = (id, name, items, mapper) => ({ id, name, questions: items.map(mapper) })
        const verifMapper = (v, idx) => ({ id: `q-verif-${idx}-${Date.now()}`, title: v.q, duration: 30, options: Array.isArray(v.options) ? v.options.slice() : [], payload: { source: 'VERIF_QUIZ', explain: v.explain, correctAnswer: (Array.isArray(v.options) && typeof v.a !== 'undefined') ? v.options[v.a] : null } })
        const ethicsMapper = (e, idx) => ({ id: `q-eth-${idx}-${Date.now()}`, title: e.text, duration: 30, options: ['No es correcto','Es correcto'], payload: { source: 'ETHICS_SCENARIOS', why: e.why, correctAnswer: e.good ? 'Es correcto' : 'No es correcto' } })
  const badMapper = (b, idx) => ({ id: `q-bad-${idx}-${Date.now()}`, title: b.bad, duration: 25, options: [], payload: { source: 'BAD_PROMPTS', tip: b.tip, evaluation: 'prompt' } })
        meta.blocks = [
          buildBlock('ETHICS', 'Escenarios éticos', ETHICS_SCENARIOS, ethicsMapper),
          buildBlock('VERIF', 'Verificación', VERIF_QUIZ, verifMapper),
          buildBlock('PROMPTS', 'Mejorar prompts', BAD_PROMPTS, badMapper)
        ]
        meta.currentBlockIndex = 0
        meta.currentQuestionIndex = 0
        try { await persistClassMeta(selected, meta); console.log('persisted initial class meta', { classId: selected, meta }); setBlockViewIndex(meta.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist class meta failed', e) }
      }

      if (meta.finished) {
        const restart = confirm('El juego ya ha finalizado. ¿Reiniciar el juego y comenzar desde el principio?')
        if (!restart) {
          return toast('El juego ya ha finalizado')
        }
        await handleRestartGame();
      }

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

      const payload = { ...(next.payload || {}), blockId: block.id, blockName: block.name, blockIndex: bIndex, questionIndex: qIdx }
      const options = Array.isArray(next.options) ? next.options : []
      const qPayload = { id: next.id || `q-${Date.now()}`, title: next.title, options, duration: next.duration || 30, payload }

      let nextBlockIndex = bIndex
      let nextQuestionIndex = qIdx + 1
      if (nextQuestionIndex >= (block.questions.length || 0)) {
        nextBlockIndex = bIndex + 1
        nextQuestionIndex = 0
      }

      if (nextBlockIndex >= (meta.blocks ? meta.blocks.length : 0)) {
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
          meta.currentBlockIndex = nextBlockIndex
          meta.currentQuestionIndex = nextQuestionIndex
          meta.finished = true
          try { await persistClassMeta(selected, meta); setBlockViewIndex(meta.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist class meta final failed', e) }
          const tops = (participants || []).slice().sort((a,b)=> (b.score||0)-(a.score||0)).slice(0,3)
          setFinalWinners(tops)
          setShowFinalModal(true)
        } catch(e) {
          console.error('Error creando/cargando challenge final', e)
          toast('No se pudo notificar fin de juego: ' + (e && e.message ? e.message : String(e)))
        }
        return
      }

      try {
        const q = await createQuestion(selected, qPayload)
        setQuestionRunning(q)
        setSecondsLeft(q.duration || 30)
        setTimerRunning(true)
        setLastQuestionResults(null)
        setSelectedCorrect(null)
        setLiveAnswers(prev => ({ ...prev, [q.id]: { total: 0, counts: {} } }))
        try { subscribeToClass(selected, { role: 'teacher' }) } catch(e) { console.warn('subscribeToClass on launch failed', e) }
        toast('Pregunta lanzada: ' + q.title)

        const isLastOfBlock = qIdx === ((block.questions || []).length - 1)
        if (isLastOfBlock) {
          setPendingAdvance({ nextBlockIndex, nextQuestionIndex })
        } else {
          meta.currentBlockIndex = nextBlockIndex
          meta.currentQuestionIndex = nextQuestionIndex
          if (nextBlockIndex >= (meta.blocks ? meta.blocks.length : 0)) {
            meta.finished = true
          }
          try { await persistClassMeta(selected, meta); setBlockViewIndex(meta.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist class meta failed', e) }
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

  async function jumpToQuestion(blockIndex, questionIndex) {
    // ... (toda la lógica de jumpToQuestion)
    try {
      if (!selected) return
      setBlockViewIndex(blockIndex)
      toast('Lanzando pregunta ' + (questionIndex + 1) + ' del bloque ' + (blockIndex+1))
      const cls = classes.find(c => (c.code || c.id) === selected) || {}
      const meta = cls.meta || {}
      if (!meta.blocks) {
        const buildBlock = (id, name, items, mapper) => ({ id, name, questions: items.map(mapper) })
        const verifMapper = (v, idx) => ({ id: `q-verif-${idx}-${Date.now()}`, title: v.q, duration: v.duration || 30, options: Array.isArray(v.options) ? v.options.slice() : [], payload: { source: 'VERIF_QUIZ', explain: v.explain, correctAnswer: (Array.isArray(v.options) && typeof v.a !== 'undefined') ? v.options[v.a] : null } })
        const ethicsMapper = (e, idx) => ({ id: `q-eth-${idx}-${Date.now()}`, title: e.text, duration: e.duration || 30, options: ['No es correcto','Es correcto'], payload: { source: 'ETHICS_SCENARIOS', why: e.why, correctAnswer: e.good ? 'Es correcto' : 'No es correcto' } })
  const badMapper = (b, idx) => ({ id: `q-bad-${idx}-${Date.now()}`, title: b.bad, duration: b.duration || 30, options: [], payload: { source: 'BAD_PROMPTS', tip: b.tip, evaluation: 'prompt' } })
        meta.blocks = [
          buildBlock('ETHICS', 'Escenarios éticos', ETHICS_SCENARIOS, ethicsMapper),
          buildBlock('VERIF', 'Verificación', VERIF_QUIZ, verifMapper),
          buildBlock('PROMPTS', 'Mejorar prompts', BAD_PROMPTS, badMapper)
        ]
        meta.currentBlockIndex = 0
        meta.currentQuestionIndex = 0
        try { await persistClassMeta(selected, meta); setBlockViewIndex(meta.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist class meta failed', e) }
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
      let nextBlockIndex = blockIndex
      let nextQuestionIndex = qIdx + 1
      if (nextQuestionIndex >= (block.questions.length || 0)) { nextBlockIndex = blockIndex + 1; nextQuestionIndex = 0 }
      if (nextBlockIndex >= (meta.blocks ? meta.blocks.length : 0)) {
        meta.currentBlockIndex = nextBlockIndex
        meta.currentQuestionIndex = nextQuestionIndex
        meta.finished = true
        try { await persistClassMeta(selected, meta); setBlockViewIndex(meta.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist class meta final failed', e) }
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
        const q = await createQuestion(selected, qPayload)
        setQuestionRunning(q)
        setSecondsLeft(q.duration || 30)
        setTimerRunning(true)
        setLastQuestionResults(null)
        setSelectedCorrect(null)
        setLiveAnswers(prev => ({ ...prev, [q.id]: { total: 0, counts: {} } }))
        try { subscribeToClass(selected, { role: 'teacher' }) } catch(e) { console.warn('subscribeToClass on launch failed', e) }
        toast('Pregunta lanzada: ' + q.title)

        meta.currentBlockIndex = nextBlockIndex
        meta.currentQuestionIndex = nextQuestionIndex
        if (nextBlockIndex >= (meta.blocks ? meta.blocks.length : 0)) {
          meta.finished = true
        }
        try { await persistClassMeta(selected, meta); setBlockViewIndex(meta.currentBlockIndex || 0); setClasses(listClasses()) } catch(e) { console.warn('persist class meta failed', e) }
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

  const selectedClassData = selected ? classes.find(c => (c.code || c.id) === selected) : null;

  if (!selected || !selectedClassData) {
    return (
      <ClassSelector
        classes={classes}
        onSelectClass={setSelected}
        onCreateClass={handleCreateClass}
        onDeleteClass={handleDeleteClass}
        onToggleActiveClass={handleToggleActiveClass}
        onShowCode={handleShowCode}
      />
    );
  }

  return (
    <div className="p-4">
      
      <DashboardHeader 
        classData={selectedClassData}
        onToggleActive={() => handleToggleActiveClass(selected)}
        onDelete={() => handleDeleteClass(selected)}
        onRestartGame={handleRestartGame}
      />

      <FancyCard className="p-6 mt-4">
        <div className="flex flex-col md:flex-row md:items-start md:gap-6">
          <div className="flex-1">
            <Timeline 
              classData={selectedClassData}
              blockViewIndex={blockViewIndex}
              setBlockViewIndex={setBlockViewIndex}
              questionRunning={questionRunning}
              onJumpToQuestion={jumpToQuestion}
            />
            <QuestionControl 
              questionRunning={questionRunning}
              secondsLeft={secondsLeft}
              liveAnswers={liveAnswers}
              lastQuestionResults={lastQuestionResults}
              selectedCorrect={selectedCorrect}
              pendingAdvance={pendingAdvance}
              onLaunch={handleLaunch}
              onReveal={handleRevealAction}
              onShowScores={() => setShowScoresOverlay(true)}
            />
          </div>
          <ParticipantsPanel participants={participants} />
        </div>
      </FancyCard>

      <CodeModal 
        show={showCodeModal}
        onClose={() => setShowCodeModal(false)}
        code={codeToShow}
      />
      <ScoresOverlay 
        show={showScoresOverlay}
        onClose={() => setShowScoresOverlay(false)}
        participants={participants}
      />
      <FinalWinnersModal 
        show={showFinalModal}
        onClose={() => setShowFinalModal(false)}
        winners={finalWinners}
        onRestart={handleRestartGame}
      />
    </div>
  );
}
