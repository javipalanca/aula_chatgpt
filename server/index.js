#!/usr/bin/env node
/* eslint-env node */
import dotenv from 'dotenv'
dotenv.config()
import express from 'express'
import cors from 'cors'
import { MongoClient } from 'mongodb'
import { WebSocketServer } from 'ws'

const MONGO_URI = process.env.MONGO_URI || ''
const MONGO_DB = process.env.MONGO_DB || 'aula_chatgpt'
const PORT = process.env.PORT || 4000

// helper to escape CSV fields
function csvEscape(v){ const s = String(v||''); if (s.includes(',') || s.includes('\n') || s.includes('"')) return '"'+s.replace(/"/g,'""')+'"'; return s }

const app = express()
app.use(cors())
app.use(express.json())
const OLLAMA_URL = process.env.VITE_OLLAMA_URL || ''
const OLLAMA_MODEL = process.env.VITE_OLLAMA_MODEL || ''
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o'
const OPENAI_URL = process.env.OPENAI_URL || ''

// Evaluate an open-text answer using an LLM. Prefer OpenAI (ChatGPT) when OPENAI_API_KEY
// is available; otherwise fall back to Ollama if configured. The evaluator is instructed
// to return strict JSON: { score: 0..1, feedback: '...' }.
async function evaluateAnswerWithLLM(questionPayload = {}, answerText = '') {
  const questionText = (questionPayload && (questionPayload.title || questionPayload.prompt || questionPayload.question)) ? (questionPayload.title || questionPayload.prompt || questionPayload.question) : ''
  const isBadPromptImprovement = (questionPayload && questionPayload.source === 'BAD_PROMPTS')
  const isPromptEvaluation = (questionPayload && (questionPayload.evaluation === 'prompt' || questionPayload.source === 'PROMPTS'))

  const system = isBadPromptImprovement
    ? `Eres un experto en ingeniería de prompts. El siguiente es un mal prompt que un estudiante ha intentado mejorar. Evalúa cuánto ha mejorado el prompt del estudiante en comparación con el original. Devuelve únicamente JSON válido con dos campos: score (número entre 1 y 100) y feedback (cadena corta y constructiva). Un buen prompt debe ser claro, específico, y ético.`
    : isPromptEvaluation
    ? `Eres un experto en ingeniería de prompts. Evalúa la calidad del siguiente prompt de un estudiante. Devuelve únicamente JSON válido con dos campos: score (número entre 1 y 100) y feedback (cadena corta y constructiva). Un buen prompt debe ser claro, específico, y ético. Por ejemplo, un prompt para hacer trampa en un examen es de muy baja calidad (score 1).`
    : `Eres un evaluador objetivo que puntúa respuestas de estudiantes. Devuelve únicamente JSON válido con dos campos: score (número entre 1 y 100) y feedback (cadena corta).`

  const user = isBadPromptImprovement
    ? `Mal prompt original: ${String(questionText).slice(0,1000)}

Prompt mejorado del alumno: ${String(answerText).slice(0,2000)}

Evalúa la mejora del prompt: asigna un score entre 1 (poca o nula mejora) y 100 (excelente mejora) y da feedback. Devuelve JSON: {"score": 1-100, "feedback": "..." }.`
    : isPromptEvaluation
    ? `Prompt del alumno: ${String(answerText).slice(0,2000)}

Evalúa la calidad de este prompt: asigna un score entre 1 (muy malo) y 100 (excelente) y da feedback. Devuelve JSON: {"score": 1-100, "feedback": "..." }.`
    : `Pregunta: ${String(questionText).slice(0,1000)}

Respuesta del alumno: ${String(answerText).slice(0,2000)}

Evalúa la respuesta: asigna un score entre 1 (muy mala) y 100 (excelente) según la calidad, claridad y cumplimiento de la consigna. Devuelve JSON: {"score": 1-100, "feedback": "..." }.`
  
  // Try OpenAI Chat Completions first
  if (OPENAI_API_KEY) {
    try {
      const url = `${OPENAI_URL}/v1/chat/completions`
      const body = { model: OPENAI_MODEL, messages: [ { role: 'system', content: system }, { role: 'user', content: user } ], temperature: 0.2, max_tokens: 200 }
      try { console.info('LLM: using OpenAI', { provider: 'openai', model: OPENAI_MODEL, url }) } catch(e) { /* ignore logging errors */ }
  try { console.debug('OpenAI request body (truncated)', JSON.stringify(body).slice(0,1000)) } catch(e) { /* ignore */ }
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` }, body: JSON.stringify(body) })
      const text = await r.text()
      if (!r.ok) {
        try { console.warn('OpenAI eval failed', { status: r.status, body: String(text).slice(0,200) }) } catch(e) { console.warn('OpenAI eval failed', r.status) }
      } else {
        try { console.debug('OpenAI raw response (truncated):', String(text).slice(0,2000)) } catch(e) { /* ignore */ }
        // Try parse JSON from content
        try {
          const parsed = JSON.parse(text)
          // OpenAI responses include choices[].message.content possibly with JSON inside
          const content = (parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content) ? parsed.choices[0].message.content : null
          if (content) {
            try { return JSON.parse(content) } catch (e) {
              // content may have extra text; attempt to extract JSON substring
              const s = content.indexOf('{')
              const eidx = content.lastIndexOf('}')
              if (s !== -1 && eidx !== -1 && eidx > s) {
                try { return JSON.parse(content.substring(s, eidx+1)) } catch(err) { /* fallthrough */ }
              }
            }
          }
        } catch (e) {
          // Some OpenAI wrappers return raw text; attempt to parse
          try {
            const content = text
            const s = content.indexOf('{')
            const eidx = content.lastIndexOf('}')
            if (s !== -1 && eidx !== -1 && eidx > s) return JSON.parse(content.substring(s, eidx+1))
          } catch (ee) { /* ignore */ }
        }
      }
    } catch (e) { console.warn('OpenAI eval error', e) }
  }

  // Fallback to Ollama if configured
  if (OLLAMA_URL) {
    try {
      const url = OLLAMA_URL.replace(/\/$/, '') + '/api/generate'
      try { console.info('LLM: using Ollama', { provider: 'ollama', model: OLLAMA_MODEL, url }) } catch(e) { /* ignore logging errors */ }
  try { console.debug('Ollama request body (truncated)', JSON.stringify({ model: OLLAMA_MODEL, prompt: `${system}\n\n${user}`, max_tokens: 200 }).slice(0,1000)) } catch(e) { /* ignore */ }
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: OLLAMA_MODEL, prompt: `${system}\n\n${user}`, max_tokens: 200 }) })
      const text = await r.text()
      if (!r.ok) {
        try { console.warn('Ollama eval failed', { status: r.status, body: String(text).slice(0,200) }) } catch(e) { console.warn('Ollama eval failed', r.status) }
      } else {
        try { console.debug('Ollama raw response (truncated):', String(text).slice(0,2000)) } catch(e) { /* ignore */ }
        try {
          const parsed = JSON.parse(text)
          // Ollama responses may be raw JSON or contain results[0].content
          if (Array.isArray(parsed)) return parsed[0]
          if (parsed && Array.isArray(parsed.results) && parsed.results[0] && parsed.results[0].content) {
            const content = parsed.results[0].content
            try { return JSON.parse(content) } catch (e) {
              const s = content.indexOf('{')
              const eidx = content.lastIndexOf('}')
              if (s !== -1 && eidx !== -1 && eidx > s) return JSON.parse(content.substring(s, eidx+1))
            }
          }
        } catch (e) { console.warn('parse ollama eval response failed', e) }
      }
    } catch (e) { console.warn('Ollama eval error', e) }
  }

  // If no evaluator or parsing failed, return neutral
  return { score: 0, feedback: 'Evaluador no disponible o no pudo parsear respuesta' }
}

try {
  const client = new MongoClient(MONGO_URI)
  await client.connect()
  console.log('Connected to MongoDB', MONGO_URI, 'db=', MONGO_DB)
  const db = client.db(MONGO_DB)

  const progress = db.collection('progress')
  const settings = db.collection('settings')
  const classes = db.collection('classes')
  const participants = db.collection('participants')
  const challenges = db.collection('challenges')
  const answers = db.collection('answers')
  const diagnosisResults = db.collection('diagnosis_results')

  // Helper: fetch and normalize participants for teacher views (only connected by default)
  const fetchConnectedParticipants = async (classId, { includeDisconnected = false } = {}) => {
    const q = includeDisconnected ? { classId } : { classId, connected: true }
    const docs = await participants.find(q).toArray()
    const out = []
    for (const d of docs) {
      if (!d) continue
      // Skip entries without a sessionId
      if (!d.sessionId) continue
      const sid = String(d.sessionId)
      const name = (d.displayName && String(d.displayName).trim()) ? String(d.displayName).trim() : `Alumno-${sid.slice(0,5)}`
      out.push({ sessionId: sid, displayName: name, score: d.score || 0, lastSeen: d.lastSeen, connected: !!d.connected })
    }
    return out
  }

  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ noServer: true })
  const wsClients = new Set()
  // classId -> Set(ws)
  const classSubs = new Map()
  // ws -> Set(classId)
  const wsToClasses = new Map()
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

  // (removed unused fetchWithTimeout helper)

  // Progress
  app.get('/api/progress/:id', async (req, res) => {
    const doc = await progress.findOne({ id: req.params.id })
    return res.json(doc || null)
  })
  app.put('/api/progress/:id', async (req, res) => {
    const id = req.params.id
    const data = req.body.data || {}
    await progress.replaceOne({ id }, { id, data, updated_at: new Date() }, { upsert: true })
    return res.json({ ok: true })
  })

  // Settings
  app.get('/api/settings/:id', async (req, res) => {
    const doc = await settings.findOne({ id: req.params.id })
    return res.json(doc || null)
  })
  app.put('/api/settings/:id', async (req, res) => {
    const id = req.params.id
    const data = req.body.data || {}
    await settings.replaceOne({ id }, { id, data, updated_at: new Date() }, { upsert: true })
    return res.json({ ok: true })
  })

  // Classes
  app.get('/api/classes', async (req, res) => {
    const docs = await classes.find({}).toArray()
    return res.json(docs)
  })
  app.get('/api/classes/:id', async (req,res) => {
    const doc = await classes.findOne({ id: req.params.id })
    return res.json(doc || null)
  })
  app.post('/api/classes', async (req, res) => {
    const payload = req.body || {}
    if (!payload.id) payload.id = (Math.random().toString(36).substring(2,8).toUpperCase())
    payload.created_at = new Date()
    await classes.replaceOne({ id: payload.id }, payload, { upsert: true })
    return res.json({ ok: true, id: payload.id })
  })
  
  // Update class (partial) - used to toggle active flag etc.
  app.patch('/api/classes/:id', async (req, res) => {
    const id = req.params.id
    const updates = req.body || {}
    try {
      await classes.updateOne({ id }, { $set: updates })
      const doc = await classes.findOne({ id })
      return res.json(doc || null)
    } catch (e) {
      return res.status(500).json({ error: String(e) })
    }
  })

  // Delete class and cascade cleanup of participants and challenges
  app.delete('/api/classes/:id', async (req, res) => {
    const id = req.params.id
    try {
      await classes.deleteOne({ id })
      await participants.deleteMany({ classId: id })
      await challenges.deleteMany({ classId: id })
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
      // Basic server-side debounce: avoid persisting frequent non-score updates for the same participant
      const pKey = `${payload.classId || 'noclass'}:${payload.sessionId || payload.id}`
      const now = Date.now()
      const lastPersist = participantLastPersist.get(pKey) || 0
      const isScoreOp = typeof payload.scoreDelta !== 'undefined' || typeof payload.score !== 'undefined'
      if (!isScoreOp && now - lastPersist < PARTICIPANT_MIN_PERSIST_MS) {
        // Skip write to DB to reduce load; respond OK. Do not broadcast.
        return res.json({ ok: true, skipped: true })
      }
      if (typeof payload.scoreDelta !== 'undefined') {
        // increment existing participant score atomically and update lastSeen/displayName
        await participants.updateOne({ id: payload.id }, { $inc: { score: Number(payload.scoreDelta) || 0 }, $set: { lastSeen: new Date(), displayName: payload.displayName || (`Alumno-${payload.sessionId ? String(payload.sessionId).slice(0,5) : ''}`) } }, { upsert: true })
        try { participantLastPersist.set(pKey, Date.now()) } catch(e) { /* ignore */ }
      } else if (typeof payload.score !== 'undefined') {
        // legacy: replace full payload
        await participants.replaceOne({ id: payload.id }, payload, { upsert: true })
        try { participantLastPersist.set(pKey, Date.now()) } catch(e) { /* ignore */ }
      } else {
        await participants.replaceOne({ id: payload.id }, payload, { upsert: true })
        try { participantLastPersist.set(pKey, Date.now()) } catch(e) { /* ignore */ }
      }
      // notify websocket clients about updated participants for the class
    try {
  try {
    const docs = await fetchConnectedParticipants(payload.classId)
    broadcast({ type: 'participants-updated', classId: payload.classId, participants: docs }, payload.classId)
  } catch(e) { console.warn('broadcast participants-updated failed', e) }
    } catch(e) { console.warn('broadcast participants-updated failed', e) }
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
      await participants.updateMany({ classId }, { $set: { score: 0 } });
      // Optionally, broadcast an update to clients if needed
      const docs = await fetchConnectedParticipants(classId, { includeDisconnected: true });
      broadcast({ type: 'participants-updated', classId, participants: docs }, classId);
      return res.json({ ok: true });
    } catch (err) {
      console.error('reset-scores failed', err);
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  app.get('/api/challenges', async (req, res) => {
    const classId = req.query.classId
    if (!classId) return res.json([])
    const docs = await challenges.find({ classId }).toArray()
    return res.json(docs)
  })
  app.post('/api/challenges', async (req, res) => {
    const payload = req.body || {}
    if (!payload.id) payload.id = `c-${Date.now()}`
    payload.created_at = new Date()
  await challenges.replaceOne({ id: payload.id }, payload, { upsert: true })
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
      const id = `${payload.classId}:${payload.sessionId}:${payload.questionId}`
      const doc = { id, classId: payload.classId, sessionId: payload.sessionId, questionId: payload.questionId, answer: payload.answer, created_at: new Date() }
      await answers.replaceOne({ id }, doc, { upsert: true })
      // broadcast answers-updated for this class/question (raw answer)
      try { broadcast({ type: 'answers-updated', classId: payload.classId, questionId: payload.questionId, answer: doc }, payload.classId) } catch(e) { console.warn('broadcast answers-updated failed', e) }

      // compute aggregate counts for this question in this class and broadcast answers-count
      try {
        const docs = await answers.find({ classId: payload.classId, questionId: payload.questionId }).toArray()
        const counts = {}
        for (const a of docs) {
          const key = a.answer == null ? '' : String(a.answer)
          counts[key] = (counts[key] || 0) + 1
        }
        const total = Object.values(counts).reduce((s,v)=>s+v,0)
        const agg = { type: 'answers-count', classId: payload.classId, questionId: payload.questionId, total, counts }
        try { broadcast(agg, payload.classId) } catch(e) { console.warn('broadcast answers-count failed', e) }
      } catch(e) { console.warn('compute answers aggregate failed', e) }

      // If this question expects LLM evaluation (open/prompt), do nothing, evaluation is handled by the client
      try {
        const active = activeQuestions.get(payload.classId)
        const questionPayload = (active && active.question && active.question.payload) ? active.question.payload : {}
        const evalMode = (questionPayload && typeof questionPayload.evaluation === 'string') ? questionPayload.evaluation : 'mcq'
        if (evalMode === 'open' || evalMode === 'prompt') {
          // do nothing
        }
      } catch(e) { console.warn('submit evaluation logic failed', e) }

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
      const docs = await answers.find(q).toArray()
      return res.json(docs)
    } catch (err) { return res.status(500).json({ ok: false, error: String(err) }) }
  })

  // Reveal question results: compute distribution, update participant scores
  app.post('/api/questions/:id/reveal', async (req, res) => {
    const questionId = req.params.id
    const { classId, correctAnswer, points = 100 } = req.body || {}
    if (!classId || typeof correctAnswer === 'undefined') return res.status(400).json({ error: 'classId and correctAnswer required' })
    try {
      const docs = await answers.find({ classId, questionId }).toArray()
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
                if (award > 0) await participants.updateOne({ classId, sessionId: a.sessionId }, { $inc: { score: award }, $set: { lastSeen: new Date() } }, { upsert: true })
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
              if (award > 0) await participants.updateOne({ classId, sessionId: a.sessionId }, { $inc: { score: award }, $set: { lastSeen: new Date() } }, { upsert: true })
            } catch(e) { console.error('redflags score update failed', e) }
          }
        } else if (evalMode === 'open' || evalMode === 'prompt') {
          // Evaluate open/free-text answers using LLM evaluator and award points proportional to LLM score and remaining time
          const evalPromises = docs.map(async (a) => {
            try {
              const answerText = Array.isArray(a.answer) ? a.answer.join(', ') : String(a.answer || '')
              const evalRes = await evaluateAnswerWithLLM(payload, answerText)
              const scoreFraction = typeof evalRes.score === 'number' ? Math.max(0, Math.min(1, evalRes.score)) : 0
              const answerTs = a.created_at ? (new Date(a.created_at)).getTime() : Date.now()
              const startedAt = (active && active.startedAt) ? active.startedAt : (answerTs - (totalDurationSec * 1000))
              const timeTakenMs = Math.max(0, answerTs - startedAt)
              const percent = Math.min(1, timeTakenMs / (totalDurationSec * 1000))
              const awarded = Math.round((Number(points) || 0) * scoreFraction * Math.max(0, 1 - percent))
              if (awarded > 0) {
                await participants.updateOne({ classId, sessionId: a.sessionId }, { $inc: { score: awarded }, $set: { lastSeen: new Date() } }, { upsert: true })
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
      const r = await diagnosisResults.insertOne(payload)
      return res.json({ ok: true, id: payload.id || r.insertedId.toString() })
    } catch (err) {
      console.error('insert diagnosis result error', err)
      return res.status(500).json({ ok: false, error: String(err) })
    }
  })

  app.get('/api/diagnosis/results', async (req, res) => {
    const classId = req.query.classId
    const q = {}
    if (classId) q.classId = classId
    try {
      const docs = await diagnosisResults.find(q).toArray()
      return res.json(docs)
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) })
    }
  })

  app.get('/api/diagnosis/report/:classId', async (req, res) => {
    const classId = req.params.classId
    try {
      const docs = await diagnosisResults.find(classId ? { classId } : {}).toArray()
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
        classes: await classes.countDocuments(),
        participants: await participants.countDocuments(),
        challenges: await challenges.countDocuments(),
        diagnosis_results: await diagnosisResults.countDocuments()
      }
      return res.json({ ok: true, counts })
    } catch (err) { return res.status(500).json({ ok: false, error: String(err) }) }
  })
  // Attach ws upgrade handler to the HTTP server
  const server = app.listen(PORT, () => console.log('Aula proxy server listening on', PORT))
  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wsClients.add(ws)
      ws.on('close', () => wsClients.delete(ws))
      ws.on('message', async (msg) => {
        // Attempt to parse message and avoid noisy heartbeat logs (ping/participant-heartbeat)
        let parsedObj = null
        try { parsedObj = JSON.parse(String(msg)) } catch (e) { /* keep raw if not json */ }
        const isHeartbeat = parsedObj && (parsedObj.type === 'ping' || parsedObj.type === 'participant-heartbeat' || parsedObj.type === 'participant-disconnected')
        if (!isHeartbeat) {
          try { console.debug('WS recv raw', { raw: String(msg).slice(0,200), sessionId: ws._sessionId || null, role: ws._role || null }) } catch(e) { /* ignore */ }
          try { console.debug('WS recv parsed preview', String(msg).slice(0,1000)) } catch(e) { /* ignore */ }
        }
        // allow clients to send pings or subscribe messages if needed
        try {
          const obj = parsedObj || JSON.parse(String(msg))
          if (!isHeartbeat) {
            try { console.debug('WS recv obj', { type: obj && obj.type, classId: obj && obj.classId, sessionId: obj && obj.sessionId }) } catch(e) { /* ignore */ }
          }
      if (obj && obj.type === 'subscribe' && obj.classId) {
            const cid = obj.classId
            // If client provided a sessionId, associate it with this ws so we can detect disconnects
            const sessionId = obj.sessionId || null
            const role = obj.role || 'student'
            // add ws to wsClients
            wsClients.add(ws)
            // add to classSubs
            if (!classSubs.has(cid)) classSubs.set(cid, new Set())
            classSubs.get(cid).add(ws)
            // track reverse mapping
            if (!wsToClasses.has(ws)) wsToClasses.set(ws, new Set())
            wsToClasses.get(ws).add(cid)
            // record sessionId on the ws object for later disconnect tracking
            try { if (sessionId) ws._sessionId = sessionId } catch(e) { console.warn('assign sessionId to ws failed', e) }
            // record role for permission checks
            try { ws._role = role } catch(e) { /* ignore */ }
            // If subscriber is a student: mark participant as connected in DB and broadcast updated participants
            try {
              if (sessionId && role === 'student') {
                // Upsert by stable id `${classId}:${sessionId}` to avoid duplicate docs
                const pid = `${cid}:${sessionId}`
                try {
                  const prev = await participants.findOne({ id: pid })
                  const toSet = { lastSeen: new Date(), connected: true }
                  // prefer explicit displayName supplied by client subscribe payload
                  if (obj && obj.displayName) toSet.displayName = String(obj.displayName)
                  else if (prev && prev.displayName) toSet.displayName = prev.displayName
                  else toSet.displayName = `Alumno-${String(sessionId).slice(0,5)}`
                  // ensure classId/sessionId stored on document for queries
                  await participants.updateOne({ id: pid }, { $set: { ...toSet, classId: cid, sessionId } }, { upsert: true })
                } catch (e) {
                  console.warn('subscribe participant upsert failed', e)
                }
                try {
                  const docs = await fetchConnectedParticipants(cid)
                  broadcast({ type: 'participants-updated', classId: cid, participants: docs }, cid)
                } catch(e) { console.warn('fetch participants after subscribe failed', e) }
              }
            } catch(e) { console.warn('subscribe participant update failed', e) }
            // ack
                try { ws.send(JSON.stringify({ type: 'subscribed', classId: cid, role })) } catch(e) { console.warn('ack send failed', e) }
            // If there is an active question for this class and this is a student, send it with remaining time
            try {
              const active = activeQuestions.get(cid)
              if (role === 'student' && active && active.question) {
                const q = { ...active.question }
                // compute remaining seconds based on stored startedAt and declared duration
                const totalDuration = (q.duration && Number(q.duration)) ? Number(q.duration) : 30
                const elapsed = Math.floor((Date.now() - (active.startedAt || Date.now()))/1000)
                const remaining = Math.max(0, totalDuration - elapsed)
                // include remaining in the sent question object
                q.duration = remaining
                try { ws.send(JSON.stringify({ type: 'question-launched', classId: cid, question: q })) } catch(e) { console.warn('send active question failed to ws', e) }
              }
            } catch(e) { console.warn('send active question failed', e) }
            return
          }
          // handle heartbeat pings from clients over WS so we can mark them connected
          if (obj && obj.type === 'ping' && obj.classId && obj.sessionId) {
            const cid = obj.classId
            const sid = obj.sessionId
            try {
              const prev = await participants.findOne({ classId: cid, sessionId: sid })
              if (!prev || prev.connected !== true) {
                // mark connected and update lastSeen
                  await participants.updateOne({ classId: cid, sessionId: sid }, { $set: { lastSeen: new Date(), connected: true, displayName: (prev && prev.displayName) ? prev.displayName : (`Alumno-${String(sid).slice(0,5)}`) } }, { upsert: true })
                  // record persist time to avoid immediate subsequent writes
                  try { participantLastPersist.set(`${cid}:${sid}`, Date.now()) } catch(e) { /* ignore */ }
                try {
                  const docs = await fetchConnectedParticipants(cid)
                  broadcast({ type: 'participants-updated', classId: cid, participants: docs }, cid)
                } catch (e) { console.warn('broadcast participants-updated after ping failed', e) }
              } else {
                // already connected: only update lastSeen
                  try {
                    const key = `${cid}:${sid}`
                    const now = Date.now()
                    const last = participantLastPersist.get(key) || 0
                    if (now - last < PARTICIPANT_MIN_PERSIST_MS) {
                      // skip frequent writes
                    } else {
                      await participants.updateOne({ classId: cid, sessionId: sid }, { $set: { lastSeen: new Date() } }, { upsert: true })
                      participantLastPersist.set(key, now)
                    }
                  } catch(e) { console.warn('update lastSeen on ping failed', e) }
              }
              // Broadcast a lightweight heartbeat event (throttled) so teacher UIs can update presence quickly
              try {
                const hbKey = `${cid}:${sid}`
                const nowB = Date.now()
                const lastB = participantLastBroadcast.get(hbKey) || 0
                if (nowB - lastB >= (typeof PARTICIPANT_BROADCAST_MIN_MS !== 'undefined' ? PARTICIPANT_BROADCAST_MIN_MS : 2000)) {
                  participantLastBroadcast.set(hbKey, nowB)
                  const displayName = (prev && prev.displayName) ? prev.displayName : `Alumno-${String(sid).slice(0,5)}`
                  try { broadcast({ type: 'participant-heartbeat', classId: cid, sessionId: sid, displayName, lastSeen: new Date(), connected: true }, cid) } catch(e) { console.warn('broadcast participant-heartbeat failed', e) }
                }
              } catch(e) { console.warn('participant-heartbeat logic failed', e) }
            } catch (e) { console.warn('ping handling failed', e) }
            return
          }

          // allow students to submit answers over WS (mirror of POST /api/answers)
          if (obj && obj.type === 'answer' && obj.classId && obj.sessionId && obj.questionId) {
            try {
                const payload = obj || {}
                try { console.info('WS answer submit received', { classId: payload.classId, questionId: payload.questionId, sessionId: payload.sessionId, preview: String(payload.answer).slice(0,200) }) } catch(e) { /* ignore */ }
              const id = `${payload.classId}:${payload.sessionId}:${payload.questionId}`
              const doc = { id, classId: payload.classId, sessionId: payload.sessionId, questionId: payload.questionId, answer: payload.answer, created_at: new Date() }
              try { await answers.replaceOne({ id }, doc, { upsert: true }) } catch(e) { console.error('answers WS replaceOne failed', e) }
              // broadcast answers-updated for this class/question (raw answer)
              try { broadcast({ type: 'answers-updated', classId: payload.classId, questionId: payload.questionId, answer: doc }, payload.classId) } catch(e) { console.warn('broadcast answers-updated failed (ws answer)', e) }
              // compute aggregate counts for this question in this class and broadcast answers-count
              try {
                const docs = await answers.find({ classId: payload.classId, questionId: payload.questionId }).toArray()
                const counts = {}
                for (const a of docs) {
                  const key = a.answer == null ? '' : String(a.answer)
                  counts[key] = (counts[key] || 0) + 1
                }
                const total = Object.values(counts).reduce((s,v)=>s+v,0)
                const agg = { type: 'answers-count', classId: payload.classId, questionId: payload.questionId, total, counts }
                try { broadcast(agg, payload.classId) } catch(e) { console.warn('broadcast answers-count failed (ws answer)', e) }
              } catch(e) { console.warn('compute answers aggregate failed (ws answer)', e) }
              // Evaluate immediately for open/prompt questions; allow client-provided evaluation
              try {
                const active = activeQuestions.get(payload.classId)
                const totalDurationSec = (active && active.question && Number(active.question.duration)) ? Number(active.question.duration) : 30
                const questionPayload = (active && active.question && active.question.payload) ? active.question.payload : {}
                const evalMode = (questionPayload && typeof questionPayload.evaluation === 'string') ? questionPayload.evaluation : 'mcq'
                if (evalMode === 'open' || evalMode === 'prompt') {
                  try {
                    if (payload.evaluation && typeof payload.evaluation.score === 'number') {
                      const scoreFraction = Math.max(0, Math.min(1, Number(payload.evaluation.score)))
                      const feedback = payload.evaluation.feedback || ''
                      const answerTs = doc.created_at ? (new Date(doc.created_at)).getTime() : Date.now()
                      const startedAt = (active && active.startedAt) ? active.startedAt : (answerTs - (totalDurationSec * 1000))
                      const timeTakenMs = Math.max(0, answerTs - startedAt)
                      const percent = Math.min(1, timeTakenMs / (totalDurationSec * 1000))
                      const points = (questionPayload && Number(questionPayload.points)) ? Number(questionPayload.points) : 100
                      const awarded = Math.round((Number(points) || 0) * scoreFraction * Math.max(0, 1 - percent))
                      if (awarded > 0) await participants.updateOne({ classId: payload.classId, sessionId: payload.sessionId }, { $inc: { score: awarded }, $set: { lastSeen: new Date() } }, { upsert: true })
                      try { await answers.replaceOne({ id }, { ...doc, evaluation: { score: scoreFraction, feedback, awardedPoints: awarded, evaluatedAt: new Date(), source: 'client' } }, { upsert: true }) } catch(e) { console.warn('attach client evaluation to answer failed (ws)', e) }
                      try { broadcast({ type: 'answer-evaluated', classId: payload.classId, questionId: payload.questionId, sessionId: payload.sessionId, score: scoreFraction, feedback, awardedPoints: awarded, source: 'client' }, payload.classId) } catch(e) { console.warn('broadcast answer-evaluated failed (ws)', e) }
                    } else {
                      const answerText = Array.isArray(payload.answer) ? payload.answer.join(', ') : String(payload.answer || '')
                      const evalRes = await evaluateAnswerWithLLM(questionPayload, answerText)
                      const scoreFraction = typeof evalRes.score === 'number' ? Math.max(0, Math.min(1, evalRes.score)) : 0
                      const answerTs = doc.created_at ? (new Date(doc.created_at)).getTime() : Date.now()
                      const startedAt = (active && active.startedAt) ? active.startedAt : (answerTs - (totalDurationSec * 1000))
                      const timeTakenMs = Math.max(0, answerTs - startedAt)
                      const percent = Math.min(1, timeTakenMs / (totalDurationSec * 1000))
                      const points = (questionPayload && Number(questionPayload.points)) ? Number(questionPayload.points) : 100
                      const awarded = Math.round((Number(points) || 0) * scoreFraction * Math.max(0, 1 - percent))
                      if (awarded > 0) await participants.updateOne({ classId: payload.classId, sessionId: payload.sessionId }, { $inc: { score: awarded }, $set: { lastSeen: new Date() } }, { upsert: true })
                      try { await answers.replaceOne({ id }, { ...doc, evaluation: { score: scoreFraction, feedback: evalRes.feedback || '', awardedPoints: awarded, evaluatedAt: new Date(), source: 'server' } }, { upsert: true }) } catch(e) { console.warn('attach evaluation to answer failed (ws)', e) }
                      try { broadcast({ type: 'answer-evaluated', classId: payload.classId, questionId: payload.questionId, sessionId: payload.sessionId, score: scoreFraction, feedback: evalRes.feedback || '', awardedPoints: awarded, source: 'server' }, payload.classId) } catch(e) { console.warn('broadcast answer-evaluated failed (ws)', e) }
                    }
                  } catch(e) { console.error('LLM evaluation at submit (ws) failed', e) }
                }
              } catch(e) { console.warn('ws submit evaluation logic failed', e) }
            } catch (err) { console.error('answers WS handling error', err) }
            return
          }
          // ignore other messages for now
          // allow explicit unsubscribe so clients can leave a class without closing the socket
          if (obj && obj.type === 'unsubscribe' && obj.classId) {
            const cid = obj.classId
            const sessionId = obj.sessionId || null
            try {
              const set = classSubs.get(cid)
              if (set) set.delete(ws)
              const wsSet = wsToClasses.get(ws)
              if (wsSet) {
                wsSet.delete(cid)
                if (wsSet.size === 0) wsToClasses.delete(ws)
              }
              if (sessionId) {
                // mark participant disconnected
                try { await participants.updateOne({ classId: cid, sessionId }, { $set: { lastSeen: new Date(), connected: false } }, { upsert: false }) } catch(e) { /* ignore */ }
                try { broadcast({ type: 'participant-disconnected', classId: cid, sessionId }, cid) } catch(e) { /* ignore */ }
                try {
                  const docs = await fetchConnectedParticipants(cid)
                  broadcast({ type: 'participants-updated', classId: cid, participants: docs }, cid)
                } catch(e) { /* ignore */ }
                try { participantLastPersist.delete(`${cid}:${sessionId}`) } catch(e) { /* ignore */ }
                try { participantLastBroadcast.delete(`${cid}:${sessionId}`) } catch(e) { /* ignore */ }
              }
            } catch (e) { console.warn('unsubscribe handling failed', e) }
            return
          }
          // allow teacher to trigger reveal via websocket (so students get immediate order)
          if (obj && obj.type === 'reveal' && obj.classId && obj.questionId && typeof obj.correctAnswer !== 'undefined') {
            try {
              // only allow ws with role teacher to reveal
              if (ws._role !== 'teacher') {
                try { ws.send(JSON.stringify({ type: 'error', message: 'forbidden' })) } catch(e) { /* ignore */ }
                return
              }
              const classId = obj.classId
              const questionId = obj.questionId
              const correctAnswer = obj.correctAnswer
              const points = obj.points || 100
              // compute distribution
              const docs = await answers.find({ classId, questionId }).toArray()
              const distribution = {}
              const correctSessions = []
              for (const a of docs) {
                const key = a.answer == null ? '': String(a.answer)
                distribution[key] = (distribution[key]||0) + 1
                if (String(a.answer) === String(correctAnswer)) correctSessions.push(a.sessionId)
              }
              // Update scores for correct sessions with time-based decay or different eval modes
              try {
                let evaluations = []
                const active = activeQuestions.get(classId)
                const totalDurationSec = (active && active.question && Number(active.question.duration)) ? Number(active.question.duration) : 30
                const payload = (active && active.question && active.question.payload) ? active.question.payload : {}
                // Prefer explicit evaluation mode declared on the question payload; fallback to 'mcq'
                const evalMode = (payload && typeof payload.evaluation === 'string') ? payload.evaluation : ((payload && (payload.source === 'BAD_PROMPTS' || payload.source === 'PROMPTS')) ? 'prompt' : 'mcq')

                if (evalMode === 'mcq') {
                  for (const a of docs) {
                    if (String(a.answer) === String(correctAnswer)) {
                      try {
                        const answerTs = a.created_at ? (new Date(a.created_at)).getTime() : Date.now()
                        const startedAt = (active && active.startedAt) ? active.startedAt : (answerTs - (totalDurationSec * 1000))
                        const timeTakenMs = Math.max(0, answerTs - startedAt)
                        const percent = Math.min(1, timeTakenMs / (totalDurationSec * 1000))
                        const award = Math.round((Number(points) || 0) * Math.max(0, 1 - percent))
                        if (award > 0) await participants.updateOne({ classId, sessionId: a.sessionId }, { $inc: { score: award }, $set: { lastSeen: new Date() } }, { upsert: true })
                      } catch(e) { console.error('score update failed in ws reveal', e) }
                    }
                  }
                } else if (evalMode === 'redflags') {
                  const expected = Array.isArray(correctAnswer) ? correctAnswer.map(String) : []
                  const expectedCount = expected.length || 1
                  for (const a of docs) {
                    try {
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
                      if (award > 0) await participants.updateOne({ classId, sessionId: a.sessionId }, { $inc: { score: award }, $set: { lastSeen: new Date() } }, { upsert: true })
                    } catch(e) { console.error('redflags score update failed in ws reveal', e) }
                  }
                } else if (evalMode === 'open' || evalMode === 'prompt') {
                  // Evaluate open answers automatically via LLM and award points based on evaluator score
                  try {
                    const evals = []
                    for (const a of docs) {
                      try {
                        const answerText = Array.isArray(a.answer) ? a.answer.join(', ') : String(a.answer || '')
                        const evalRes = await evaluateAnswerWithLLM(payload, answerText)
                        const scoreFraction = typeof evalRes.score === 'number' ? Math.max(0, Math.min(1, evalRes.score)) : 0
                        const answerTs = a.created_at ? (new Date(a.created_at)).getTime() : Date.now()
                        const startedAt = (active && active.startedAt) ? active.startedAt : (answerTs - (totalDurationSec * 1000))
                        const timeTakenMs = Math.max(0, answerTs - startedAt)
                        const percent = Math.min(1, timeTakenMs / (totalDurationSec * 1000))
                        const awarded = Math.round((Number(points) || 0) * scoreFraction * Math.max(0, 1 - percent))
                        if (awarded > 0) await participants.updateOne({ classId, sessionId: a.sessionId }, { $inc: { score: awarded }, $set: { lastSeen: new Date() } }, { upsert: true })
                        evals.push({ sessionId: a.sessionId, score: scoreFraction, feedback: evalRes.feedback || '', awardedPoints: awarded })
                      } catch (e) { console.error('LLM eval failed (ws) for', a.sessionId, e); evals.push({ sessionId: a.sessionId, score: 0, feedback: 'error', awardedPoints: 0 }) }
                    }
                    // attach evaluations to broadcast payload
                    if (!Array.isArray(evaluations)) evaluations = []
                    evaluations = evaluations.concat(evals)
                  } catch(e) { console.error('ws open eval batch failed', e) }
                }
              } catch(e) { console.error('ws score update batch failed', e) }
              // Fetch updated participants (include disconnected for response) — we return it in HTTP reveal, keep here for parity
              await fetchConnectedParticipants(classId, { includeDisconnected: true })
              // Broadcast results and participants update
              try {
                const answersListWs = docs.map(a => ({ sessionId: a.sessionId, answer: a.answer, created_at: a.created_at }))
                const payload = { type: 'question-results', classId, questionId, distribution, correctSessions, correctAnswer }
                try {
                  const active = activeQuestions.get(classId)
                  const payloadMeta = (active && active.question && active.question.payload) ? active.question.payload : {}
                  const evalMode = (payloadMeta && typeof payloadMeta.evaluation === 'string') ? payloadMeta.evaluation : 'mcq'
                  if (evalMode === 'open' || evalMode === 'prompt') payload.answers = answersListWs
                } catch (e) { /* ignore */ }
                broadcast(payload, classId)
              } catch(e) { console.warn('broadcast question-results failed (ws reveal)', e) }
              try {
                const connected = await fetchConnectedParticipants(classId)
                broadcast({ type: 'participants-updated', classId, participants: connected }, classId)
              } catch(e) { console.warn('broadcast participants-updated failed (ws reveal)', e) }
              try { activeQuestions.delete(classId) } catch(e) { console.warn('activeQuestions delete failed (ws reveal)', e) }
              return
            } catch (e) { console.warn('ws reveal handling failed', e); return }
          }
        } catch(e) { console.warn('invalid ws message', e) }
      })
      ws.on('close', async () => {
        // cleanup any class subscriptions
        const set = wsToClasses.get(ws)
        if (set) {
          for (const cid of set) {
            const s = classSubs.get(cid)
            if (s) s.delete(ws)
            if (s && s.size === 0) classSubs.delete(cid)
            // if this ws had a sessionId, mark participant as disconnected and notify
            try {
              const sid = ws._sessionId || null
              if (sid) {
                // Update participant record to reflect disconnection (set lastSeen)
                await participants.updateOne({ classId: cid, sessionId: sid }, { $set: { lastSeen: new Date(), connected: false } }, { upsert: false })
                // broadcast a lightweight event so teacher UIs can react
                try { broadcast({ type: 'participant-disconnected', classId: cid, sessionId: sid }, cid) } catch(e) { console.warn('broadcast participant-disconnected failed', e) }
                // Also broadcast updated participants list
                try {
                    const docs = await fetchConnectedParticipants(cid)
                    broadcast({ type: 'participants-updated', classId: cid, participants: docs }, cid)
                } catch(e) { console.warn('broadcast participants-updated failed on close', e) }
                  // remove from in-memory persist map to avoid growth
                  try { participantLastPersist.delete(`${cid}:${sid}`) } catch(e) { /* ignore */ }
                  try { participantLastBroadcast.delete(`${cid}:${sid}`) } catch(e) { /* ignore */ }
              }
            } catch(e) { console.warn('close handler participant update failed', e) }
          }
          wsToClasses.delete(ws)
        }
        wsClients.delete(ws)
      })
    })
  })
} catch (err) {
  console.error(err)
  process.exit(1)
}
