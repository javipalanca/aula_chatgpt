#!/usr/bin/env node
/* eslint-env node */
import dotenv from 'dotenv'
dotenv.config()
import app from './app.js'
import { connectDb } from './lib/db.js'
import ParticipantsRepo from './repositories/ParticipantsRepo.js'
import AnswersRepo from './repositories/AnswersRepo.js'
import ClassesRepo from './repositories/ClassesRepo.js'
import ChallengesRepo from './repositories/ChallengesRepo.js'
import ProgressRepo from './repositories/ProgressRepo.js'
import DiagnosisRepo from './repositories/DiagnosisRepo.js'
import SettingsRepo from './repositories/SettingsRepo.js'
// ws handled by WSManager
import LLMEvaluator from './services/LLMEvaluator.js'
import ParticipantService from './services/ParticipantService.js'
import AnswerService from './services/AnswerService.js'
import QuestionService from './services/QuestionService.js'
import WSManager from './services/WSManager.js'

const MONGO_URI = process.env.MONGO_URI || ''
const MONGO_DB = process.env.MONGO_DB || 'aula_chatgpt'
const PORT = process.env.PORT || 4000

// helper to escape CSV fields
function csvEscape(v){ const s = String(v||''); if (s.includes(',') || s.includes('\n') || s.includes('"')) return '"'+s.replace(/"/g,'""')+'"'; return s }

// `app` is created and configured in server/app.js
const OLLAMA_URL = process.env.VITE_OLLAMA_URL || ''
const OLLAMA_MODEL = process.env.VITE_OLLAMA_MODEL || ''
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o'
const OPENAI_URL = process.env.OPENAI_URL || ''

// Instantiate evaluator service
const llmEvaluator = new LLMEvaluator({ openaiKey: OPENAI_API_KEY, openaiUrl: OPENAI_URL, openaiModel: OPENAI_MODEL, ollamaUrl: OLLAMA_URL, ollamaModel: OLLAMA_MODEL })

// Backwards-compatible wrapper
async function evaluateAnswerWithLLM(questionPayload = {}, answerText = '') {
  return llmEvaluator.evaluate(questionPayload, answerText)
}

try {
  await connectDb({ uri: MONGO_URI, dbName: MONGO_DB })
  console.log('Connected to MongoDB', MONGO_URI, 'db=', MONGO_DB)

  const settings = new SettingsRepo()
  const diagnosisResults = new DiagnosisRepo()
  const participantsRepo = new ParticipantsRepo()
  const answersRepo = new AnswersRepo()
  const classesRepo = new ClassesRepo()
  const challengesRepo = new ChallengesRepo()
  const progressRepo = new ProgressRepo()

  // NOTE: services are instantiated after we declare in-memory maps and broadcast
  // (done below) so we defer their creation until those helpers exist.

  // Helper placeholder for fetchConnectedParticipants; actual binding will be set after services are created
  let fetchConnectedParticipants = async (classId, _opts = {}) => { throw new Error('participant service not initialized') }

  // WebSocket server for real-time updates
  const wsClients = new Set()
  // classId -> Set(ws)
  const classSubs = new Map()
  // ws -> Set(classId)
  // classId -> { question: publicQuestion, startedAt: timestamp }
  const activeQuestions = new Map()
  // In-memory cooldown map to avoid frequent writes for participant lastSeen updates
  const participantLastPersist = new Map()
  const PARTICIPANT_MIN_PERSIST_MS = 5000
  // In-memory map to throttle heartbeat broadcasts to teacher UIs
  const participantLastBroadcast = new Map()
  const PARTICIPANT_BROADCAST_MIN_MS = 2000
  const broadcast = (data, targetClassId) => {
    const raw = JSON.stringify(data)
    let targets = []
    if (targetClassId) {
      const set = classSubs.get(targetClassId)
      if (set && set.size) targets = Array.from(set)
    } else {
      targets = Array.from(wsClients)
    }
    // Log only for key events (questions/results) to help debugging reachability
    try {
      if (data && (data.type === 'question-results' || data.type === 'question-launched')) {
        console.log('Broadcasting', data.type, 'for class', targetClassId, 'to', targets.length, 'sockets')
      }
    } catch (e) { /* ignore logging errors */ }
    for (const s of targets) {
      try { s.send(raw) } catch(e) { console.warn('ws send failed', e) }
    }
  }

  // Instantiate services now that broadcast and in-memory maps exist
  const participantService = new ParticipantService({ participantsRepo, broadcast, participantLastPersist, participantLastBroadcast, options: { minPersistMs: PARTICIPANT_MIN_PERSIST_MS, minBroadcastMs: PARTICIPANT_BROADCAST_MIN_MS } })
  const answerService = new AnswerService({ answersRepo, participantsRepo, evaluator: llmEvaluator, broadcast })

  // Bind helper to delegate to participantService
  fetchConnectedParticipants = async (classId, opts = {}) => participantService.fetchConnectedParticipants(classId, opts)

  // (removed unused fetchWithTimeout helper)

  // Progress
  app.get('/api/progress/:id', async (req, res) => {
  const doc = await progressRepo.findById(req.params.id)
  return res.json(doc || null)
  })
  app.put('/api/progress/:id', async (req, res) => {
    const id = req.params.id
    const data = req.body.data || {}
  await progressRepo.upsert({ id, data, updated_at: new Date() })
    return res.json({ ok: true })
  })

  // Settings
  app.get('/api/settings/:id', async (req, res) => {
    const doc = await settings.findById(req.params.id)
    return res.json(doc || null)
  })
  app.put('/api/settings/:id', async (req, res) => {
    const id = req.params.id
    const data = req.body.data || {}
    await settings.upsert({ id, data })
    return res.json({ ok: true })
  })

  // Classes
  app.get('/api/classes', async (req, res) => {
  const docs = await classesRepo.find({})
  console.log('GET /api/classes docs:', docs);
  return res.json(docs)
  })
  app.get('/api/classes/:id', async (req,res) => {
  const doc = await classesRepo.findById(req.params.id)
    return res.json(doc || null)
  })
  app.post('/api/classes', async (req, res) => {
    const payload = req.body || {}
    if (!payload.id) payload.id = (Math.random().toString(36).substring(2,8).toUpperCase())
    payload.created_at = new Date()
  await classesRepo.upsert(payload)
    return res.json({ ok: true, id: payload.id })
  })
  
  // Update class (partial) - used to toggle active flag etc.
  app.patch('/api/classes/:id', async (req, res) => {
    const id = req.params.id
    const updates = req.body || {}
    console.log('PATCH /api/classes/:id updates:', updates);
    try {
  const doc = await classesRepo.update(id, updates)
  return res.json(doc || null)
    } catch (e) {
      return res.status(500).json({ error: String(e) })
    }
  })

  // Delete class and cascade cleanup of participants and challenges
  app.delete('/api/classes/:id', async (req, res) => {
    const id = req.params.id
    try {
  await classesRepo.deleteById(id)
  await participantsRepo.deleteByClass(id)
  await challengesRepo.deleteByClass(id)
      return res.json({ ok: true })
    } catch (e) {
      return res.status(500).json({ error: String(e) })
    }
  })

  // Participants
  app.get('/api/participants', async (req, res) => {
    const classId = req.query.classId
    if (!classId) return res.json([])
  // By default return only currently connected participants (responding to heartbeat).
  // If the caller sets includeDisconnected=true, return everyone.
  const includeDisconnected = String(req.query.includeDisconnected || '').toLowerCase() === 'true'
  const docs = await fetchConnectedParticipants(classId, { includeDisconnected: includeDisconnected })
  return res.json(docs)
  })
  app.post('/api/participants', async (req, res) => {
    const payload = req.body || {}
    if (!payload.id) return res.status(400).json({ error: 'id required' })
    payload.updated_at = new Date()
    try {
      const result = await participantService.saveParticipant(payload)
      if (result && result.skipped) return res.json({ ok: true, skipped: true })
      return res.json({ ok: true })
    } catch (err) {
      console.error('participants POST error', err)
      return res.status(500).json({ ok: false, error: String(err) })
    }
  })

  // Challenges
  app.post('/api/participants/reset-scores', async (req, res) => {
    const { classId } = req.body || {};
    if (!classId) return res.status(400).json({ error: 'classId is required' });
    try {
      await participantsRepo.resetScores(classId)
      // Optionally, broadcast an update to clients
      const docs = await participantsRepo.listConnected(classId, { includeDisconnected: true })
      broadcast({ type: 'participants-updated', classId, participants: docs }, classId)
      return res.json({ ok: true })
    } catch (err) {
      console.error('reset-scores failed', err)
      return res.status(500).json({ ok: false, error: String(err) })
    }
  })

  app.get('/api/challenges', async (req, res) => {
    const classId = req.query.classId
    if (!classId) return res.json([])
  const docs = await challengesRepo.findByClass(classId)
    return res.json(docs)
  })
  app.post('/api/challenges', async (req, res) => {
    const payload = req.body || {}
    // Normalize game-end markers so multiple clients/flows don't create
    // many duplicate "Juego terminado" documents. If this payload looks
    // like a game-ended marker, assign a stable id per class and ensure
    // a sensible duration (default 0 to avoid timer behavior).
    const looksLikeGameEnd = (payload && ((payload.payload && payload.payload.type === 'game-ended') || (typeof payload.title === 'string' && /juego terminado/i.test(payload.title))))
    if (looksLikeGameEnd) {
      // require classId to build stable id; fall back to prefix if missing
      const cls = payload.classId || 'unknown'
      payload.id = `${cls}:game-ended`
      // avoid accidental short timers for game-end markers
      if (typeof payload.duration !== 'number') payload.duration = 0
      payload.payload = payload.payload || {}
      payload.payload.type = 'game-ended'
    } else {
      if (!payload.id) payload.id = `c-${Date.now()}`
    }
    payload.created_at = new Date()
  await challengesRepo.upsert(payload)
  // broadcast question launched (kahoot mode)
    try {
    // do not leak the correctAnswer in payload to students on launch
    const publicQuestion = { ...payload }
    if (publicQuestion.payload && typeof publicQuestion.payload === 'object') {
      publicQuestion.payload = { ...publicQuestion.payload }
      if (typeof publicQuestion.payload.correctAnswer !== 'undefined') delete publicQuestion.payload.correctAnswer
      // Copy duration to top-level for student view
      if (typeof publicQuestion.payload.duration !== 'undefined') publicQuestion.duration = publicQuestion.payload.duration
    }
  // debug: log what we are broadcasting so we can confirm options/payload shape
  try { console.log('Broadcasting question-launched for class', payload.classId, 'question:', JSON.stringify(publicQuestion)) } catch(e) { console.warn('log broadcast failed', e) }
  // record as active question with a start timestamp so late joiners can get remaining time
  try { activeQuestions.set(payload.classId, { question: publicQuestion, startedAt: Date.now() }) } catch(e) { console.warn('activeQuestions set failed', e) }
  broadcast({ type: 'question-launched', classId: payload.classId, question: publicQuestion }, payload.classId)
  } catch(e) { console.warn('broadcast question-launched failed', e) }
    return res.json({ ok: true })
  })

  app.post('/api/evaluate', async (req, res) => {
    const { question, answer } = req.body || {};
    if (!question || !answer) {
      return res.status(400).json({ error: 'Question and answer are required' });
    }
    try {
      const result = await evaluateAnswerWithLLM(question, answer);
      return res.json(result);
    } catch (err) {
      console.error('Evaluation failed', err);
      return res.status(500).json({ error: 'Evaluation failed' });
    }
  });

  // Answers: participants submit an answer to a question
  app.post('/api/answers', async (req, res) => {
    const payload = req.body || {}
    if (!payload.classId || !payload.sessionId || !payload.questionId) return res.status(400).json({ error: 'classId, sessionId and questionId required' })
  try { console.info('HTTP answer submit received', { classId: payload.classId, questionId: payload.questionId, sessionId: payload.sessionId, preview: String(payload.answer).slice(0,200) }) } catch(e) { /* ignore */ }
    try {
      const active = activeQuestions.get(payload.classId)
      await answerService.submitAnswer({ classId: payload.classId, sessionId: payload.sessionId, questionId: payload.questionId, answer: payload.answer, evaluation: payload.evaluation, activeQuestion: active ? { question: active.question, startedAt: active.startedAt } : null })
      return res.json({ ok: true })
    } catch (err) { console.error('answers POST error', err); return res.status(500).json({ ok: false, error: String(err) }) }
  })

  app.get('/api/answers', async (req, res) => {
    const classId = req.query.classId
    const questionId = req.query.questionId
    const q = {}
    if (classId) q.classId = classId
    if (questionId) q.questionId = questionId
    try {
  const docs = await answersRepo.find(q)
      return res.json(docs)
    } catch (err) { return res.status(500).json({ ok: false, error: String(err) }) }
  })

  // Reveal question results: compute distribution, update participant scores
  app.post('/api/questions/:id/reveal', async (req, res) => {
    const questionId = req.params.id
    const { classId, correctAnswer, points = 100 } = req.body || {}
    if (!classId || typeof correctAnswer === 'undefined') return res.status(400).json({ error: 'classId and correctAnswer required' })
    try {
  const docs = await answersRepo.findByClassQuestion(classId, questionId)
      const distribution = {}
      const correctSessions = []
      for (const a of docs) {
        const key = a.answer == null ? '': String(a.answer)
        distribution[key] = (distribution[key]||0) + 1
        if (String(a.answer) === String(correctAnswer)) correctSessions.push(a.sessionId)
      }
      // Update scores depending on question evaluation mode.
  let evaluations = []
  try {
        const active = activeQuestions.get(classId)
        const totalDurationSec = (active && active.question && Number(active.question.duration)) ? Number(active.question.duration) : 30
        const payload = (active && active.question && active.question.payload) ? active.question.payload : {}
  // Prefer explicit evaluation mode declared on the question payload.
  // If missing, default to 'mcq' (safe fallback).
  const evalMode = (payload && typeof payload.evaluation === 'string') ? payload.evaluation : ((payload && (payload.source === 'BAD_PROMPTS' || payload.source === 'PROMPTS')) ? 'prompt' : 'mcq')

        if (evalMode === 'mcq') {
          // existing single-correct behavior with time decay
          for (const a of docs) {
            if (String(a.answer) === String(correctAnswer)) {
              try {
                const answerTs = a.created_at ? (new Date(a.created_at)).getTime() : Date.now()
                const startedAt = (active && active.startedAt) ? active.startedAt : (answerTs - (totalDurationSec * 1000))
                const timeTakenMs = Math.max(0, answerTs - startedAt)
                const percent = Math.min(1, timeTakenMs / (totalDurationSec * 1000))
                const award = Math.round((Number(points) || 0) * Math.max(0, 1 - percent))
                if (award > 0) await participantsRepo.incScore(classId, a.sessionId, award)
              } catch(e) { console.error('score update failed', e) }
            }
          }
        } else if (evalMode === 'redflags') {
          // correctAnswer expected to be an array of expected flags
          const expected = Array.isArray(correctAnswer) ? correctAnswer.map(String) : []
          const expectedCount = expected.length || 1
          for (const a of docs) {
            try {
              // answers can be array or string; normalize
              let ansArr = []
              if (Array.isArray(a.answer)) ansArr = a.answer.map(String)
              else if (typeof a.answer !== 'undefined' && a.answer !== null) ansArr = [String(a.answer)]
              const matches = ansArr.filter(x => expected.includes(String(x))).length
              const fraction = Math.max(0, Math.min(1, matches / expectedCount))
              const answerTs = a.created_at ? (new Date(a.created_at)).getTime() : Date.now()
              const startedAt = (active && active.startedAt) ? active.startedAt : (answerTs - (totalDurationSec * 1000))
              const timeTakenMs = Math.max(0, answerTs - startedAt)
              const percent = Math.min(1, timeTakenMs / (totalDurationSec * 1000))
              const award = Math.round((Number(points) || 0) * fraction * Math.max(0, 1 - percent))
              if (award > 0) await participantsRepo.incScore(classId, a.sessionId, award)
            } catch(e) { console.error('redflags score update failed', e) }
          }
        } else if (evalMode === 'open' || evalMode === 'prompt') {
          // Evaluate open/free-text answers using LLM evaluator and award points proportional to LLM score and remaining time
          const evalPromises = docs.map(async (a) => {
            try {
              const answerText = Array.isArray(a.answer) ? a.answer.join(', ') : String(a.answer || '')
              const evalRes = await evaluateAnswerWithLLM(payload, answerText)
              // evalRes.score may be 0..1 or 1..100; normalize to 0..1
              const _rawScore = (typeof evalRes.score === 'number') ? evalRes.score : Number(evalRes.score || 0)
              const scoreFraction = (typeof _rawScore === 'number' && !isNaN(_rawScore)) ? Math.max(0, Math.min(1, (_rawScore > 1 ? _rawScore / 100 : _rawScore))) : 0
              const answerTs = a.created_at ? (new Date(a.created_at)).getTime() : Date.now()
              const startedAt = (active && active.startedAt) ? active.startedAt : (answerTs - (totalDurationSec * 1000))
              const timeTakenMs = Math.max(0, answerTs - startedAt)
              const percent = Math.min(1, timeTakenMs / (totalDurationSec * 1000))
              const awarded = Math.round((Number(points) || 0) * scoreFraction * Math.max(0, 1 - percent))
              if (awarded > 0) {
                await participantsRepo.incScore(classId, a.sessionId, awarded)
              }
              return { sessionId: a.sessionId, score: scoreFraction, feedback: evalRes.feedback || '', awardedPoints: awarded }
            } catch (e) { console.error('LLM evaluation failed for answer', e); return { sessionId: a.sessionId, score: 0, feedback: 'error', awardedPoints: 0 } }
          })
          evaluations = await Promise.all(evalPromises)
        }
      } catch(e) { console.error('score update batch failed', e) }
      // Prepare answers array for open prompts if needed
      const answersList = docs.map(a => ({ sessionId: a.sessionId, answer: a.answer, created_at: a.created_at }))
      // Fetch updated participants
      const updated = await fetchConnectedParticipants(classId, { includeDisconnected: true })
      // Broadcast results and participants update (only connected participants for teacher views)
      try {
        const payload = { type: 'question-results', classId, questionId, distribution, correctSessions, correctAnswer }
        // include answers for open/prompt evaluation
        try {
          const active = activeQuestions.get(classId)
          const payloadMeta = (active && active.question && active.question.payload) ? active.question.payload : {}
          const evalMode = (payloadMeta && typeof payloadMeta.evaluation === 'string') ? payloadMeta.evaluation : 'mcq'
          if (evalMode === 'open' || evalMode === 'prompt') payload.answers = answersList
        } catch (e) { /* ignore payload inspection errors */ }
        broadcast(payload, classId)
      } catch(e) { console.warn('broadcast question-results failed', e) }
    try {
    const connected = await fetchConnectedParticipants(classId)
    broadcast({ type: 'participants-updated', classId, participants: connected }, classId)
  } catch(e) { console.warn('broadcast participants-updated failed', e) }
  // clear active question for this class so new subscribers won't receive it
  try { activeQuestions.delete(classId) } catch(e) { console.warn('activeQuestions delete failed', e) }
      return res.json({ ok: true, distribution, correctSessions, participants: updated, evaluations })
    } catch (err) {
      console.error('reveal error', err)
      return res.status(500).json({ ok: false, error: String(err) })
    }
  })

  // Diagnosis: generate a short set of boss items; if Ollama is configured, ask it to generate
  app.get('/api/diagnosis/generate', async (req, res) => {
    if (!OLLAMA_URL) return res.status(500).json({ ok: false, error: 'Ollama no configurado' })
    try {
      const genPrompt = `Genera un array JSON con 3 objetos {id,prompt} en español para ejercicios cortos de diagnóstico educativo: Detecta el bulo, Prompt Golf (pedir prompt mínimo), y Re-pregunta. Devuelve solo JSON.`
      const url = OLLAMA_URL.replace(/\/$/, '') + '/api/generate'
      console.log('Calling Ollama generate at', url, 'model=', OLLAMA_MODEL)
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: OLLAMA_MODEL, prompt: genPrompt })
      })
      console.log('Received response from Ollama (generate), status=', r.status)
      const text = await r.text()
      if (!r.ok) return res.status(502).send(text)
      // try parse JSON or common response shapes
      try {
        const parsed = JSON.parse(text)
        if (Array.isArray(parsed)) return res.json(parsed)
        if (parsed && Array.isArray(parsed.results) && parsed.results[0] && parsed.results[0].content) {
          const inner = JSON.parse(parsed.results[0].content)
          if (Array.isArray(inner)) return res.json(inner)
        }
      } catch (e) {
        // attempt substring parse
        const s = text.indexOf('[')
        const eidx = text.lastIndexOf(']')
        if (s !== -1 && eidx !== -1 && eidx > s) {
          try {
            const maybe = JSON.parse(text.substring(s, eidx+1))
            if (Array.isArray(maybe)) return res.json(maybe)
          } catch (ee) {
            // fallthrough
          }
        }
        // if parsing fails, return bad gateway with raw text
        return res.status(502).send(text)
      }
      return res.status(502).send(text)
    } catch (err) {
      console.warn('diagnosis generate failed', err)
      return res.status(502).json({ ok: false, error: String(err) })
    }
  })

  // LLM proxy using Ollama (configured via VITE_OLLAMA_URL and VITE_OLLAMA_MODEL in .env)
  app.post('/api/llm/proxy', async (req, res) => {
    const body = req.body || {}
    const prompt = body.prompt || ''
    if (!OLLAMA_URL) return res.status(500).json({ ok: false, error: 'Ollama no configurado' })
    try {
      const url = OLLAMA_URL.replace(/\/$/, '') + '/api/generate'
      console.log('Calling Ollama proxy at', url, 'model=', body.model || OLLAMA_MODEL)
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: body.model || OLLAMA_MODEL, prompt, max_tokens: body.max_tokens || 512 })
      })
      console.log('Received response from Ollama (proxy), status=', r.status)
      const text = await r.text()
      if (!r.ok) return res.status(502).send(text)
      try { return res.json({ ok: true, provider: 'ollama', raw: JSON.parse(text) }) } catch(e) { return res.json({ ok: true, provider: 'ollama', raw: text }) }
    } catch (err) {
      console.error('LLM proxy error', err)
      return res.status(502).json({ ok: false, error: String(err) })
    }
  })

  // Validation endpoints for each mini-reto
  app.post('/api/diagnosis/validate-bulo', async (req, res) => {
    const { answer } = req.body || {}
    if (!OLLAMA_URL) return res.status(500).json({ ok: false, error: 'Ollama no configurado' })
    const prompt = `Eres un asistente que valida posibles bulos. Lee la respuesta: "${String(answer).slice(0,1000)}" y responde en JSON { verdict: 'bulo'|'no-bulo'|'dudoso', reasons: [..] } en español.`
    try {
      const callUrl = OLLAMA_URL.replace(/\/$/, '') + '/api/generate'
      console.log('Calling Ollama validate-bulo at', callUrl)
      const r = await fetch(callUrl, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ model: OLLAMA_MODEL, prompt, max_tokens: 512 }) })
      console.log('Received response from Ollama (validate-bulo), status=', r.status)
      const text = await r.text()
      if (!r.ok) return res.status(502).send(text)
      try { return res.json({ ok: true, raw: JSON.parse(text) }) } catch(e) { return res.status(502).send(text) }
    } catch (err) { return res.status(502).json({ ok: false, error: String(err) }) }
  })

  app.post('/api/diagnosis/validate-prompt', async (req, res) => {
    const { promptText } = req.body || {}
    if (!OLLAMA_URL) return res.status(500).json({ ok: false, error: 'Ollama no configurado' })
    const prompt = `Eres un corrector de prompts. Evalúa si el siguiente prompt es claro y produce una respuesta útil: "${String(promptText).slice(0,1000)}". Devuelve JSON { score:0..1, comments: [...] } en español.`
    try {
      const callUrl = OLLAMA_URL.replace(/\/$/, '') + '/api/generate'
      console.log('Calling Ollama validate-prompt at', callUrl)
      const r = await fetch(callUrl, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ model: OLLAMA_MODEL, prompt, max_tokens: 256 }) })
      console.log('Received response from Ollama (validate-prompt), status=', r.status)
      const text = await r.text()
      if (!r.ok) return res.status(502).send(text)
      try { return res.json({ ok: true, raw: JSON.parse(text) }) } catch(e) { return res.status(502).send(text) }
    } catch (err) { return res.status(502).json({ ok: false, error: String(err) }) }
  })

  app.post('/api/diagnosis/validate-repregunta', async (req, res) => {
    const { questions, original } = req.body || {}
    if (!OLLAMA_URL) return res.status(500).json({ ok: false, error: 'Ollama no configurado' })
    const prompt = `Comprueba si las siguientes preguntas ayudan a clarificar: preguntas=${JSON.stringify(questions)}; original="${String(original).slice(0,800)}". Responde JSON { useful:true|false, why: '...' } en español.`
    try {
      const callUrl = OLLAMA_URL.replace(/\/$/, '') + '/api/generate'
      console.log('Calling Ollama validate-repregunta at', callUrl)
      const r = await fetch(callUrl, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ model: OLLAMA_MODEL, prompt, max_tokens: 256 }) })
      console.log('Received response from Ollama (validate-repregunta), status=', r.status)
      const text = await r.text()
      if (!r.ok) return res.status(502).send(text)
      try { return res.json({ ok: true, raw: JSON.parse(text) }) } catch(e) { return res.status(502).send(text) }
    } catch (err) { return res.status(502).json({ ok: false, error: String(err) }) }
  })

  // Persist boss/diagnosis results
  app.post('/api/diagnosis/results', async (req, res) => {
    const payload = req.body || {}
    payload.created_at = new Date()
    try {
      const r = await diagnosisResults.insert(payload)
      return res.json({ ok: true, id: payload.id || (r && r.insertedId && r.insertedId.toString()) || 'ok' })
    } catch (err) {
      console.error('insert diagnosis result error', err)
      return res.status(500).json({ ok: false, error: String(err) })
    }
  })

  app.get('/api/diagnosis/results', async (req, res) => {
    const classId = req.query.classId
    try {
      const docs = await diagnosisResults.find(classId ? { classId } : {})
      return res.json(docs)
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) })
    }
  })

  app.get('/api/diagnosis/report/:classId', async (req, res) => {
    const classId = req.params.classId
    try {
      const docs = await diagnosisResults.find(classId ? { classId } : {})
      // CSV header
      const rows = []
  rows.push(['id','classId','studentId','stage','score','verdict','created_at','raw'].join(','))
      for (const d of docs) {
        const id = d.id || (d._id && d._id.toString()) || ''
        const studentId = d.studentId || ''
        const stage = d.stage || ''
        const score = typeof d.score !== 'undefined' ? d.score : ''
        const verdict = d.verdict ? String(d.verdict).replace(/\n/g,' ') : ''
        const created = d.created_at ? new Date(d.created_at).toISOString() : ''
        const raw = d.raw ? JSON.stringify(d.raw).replace(/"/g,'""') : ''
  // Escape commas by quoting fields that contain commas
  rows.push([csvEscape(id), csvEscape(classId||''), csvEscape(studentId), csvEscape(stage), csvEscape(score), csvEscape(verdict), csvEscape(created), csvEscape(raw)].join(','))
      }
      const csv = rows.join('\n')
      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="diagnosis_report_${classId||'all'}.csv"`)
      return res.send(csv)
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) })
    }
  })
  app.get('/api/debug/dbstats', async (req, res) => {
    try {
      const counts = {
  classes: await classesRepo.count(),
        participants: await participantsRepo.count(),
  challenges: await challengesRepo.count(),
        diagnosis_results: await diagnosisResults.countDocuments()
      }
      return res.json({ ok: true, counts })
    } catch (err) { return res.status(500).json({ ok: false, error: String(err) }) }
  })
  // Attach ws upgrade handler to the HTTP server (delegated to WSManager)
  const server = app.listen(PORT, () => console.log('Aula proxy server listening on', PORT))
  // instantiate WSManager and attach
  const questionService = new QuestionService({ answersRepo, participantsRepo, evaluator: llmEvaluator, broadcast })
  const wsManager = new WSManager({ participantsService: participantService, answerService, questionService, fetchActiveQuestion: async (cid) => activeQuestions.get(cid) })
  wsManager.attach(server)
} catch (err) {
  console.error(err)
  process.exit(1)
}
