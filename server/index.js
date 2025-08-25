#!/usr/bin/env node
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

  // WebSocket server for real-time updates
  const wss = new WebSocketServer({ noServer: true })
  const wsClients = new Set()
  // classId -> Set(ws)
  const classSubs = new Map()
  // ws -> Set(classId)
  const wsToClasses = new Map()
  function broadcast(data, targetClassId) {
    const raw = JSON.stringify(data)
    let targets = []
    if (targetClassId) {
      const set = classSubs.get(targetClassId)
      if (set && set.size) targets = Array.from(set)
    } else {
      targets = Array.from(wsClients)
    }
    for (const s of targets) {
      try { s.send(raw) } catch(e) { console.warn('ws send failed', e) }
    }
  }

  const OLLAMA_URL = process.env.VITE_OLLAMA_URL || ''
  const OLLAMA_MODEL = process.env.VITE_OLLAMA_MODEL || ''

  // helper to call fetch with timeout (kept for potential future use)
  async function fetchWithTimeout(url, opts = {}, ms = 4000) {
    const controller = new AbortController()
    const id = setTimeout(()=> controller.abort(), ms)
    try {
      const r = await fetch(url, { ...opts, signal: controller.signal })
      clearTimeout(id)
      return r
    } catch (e) {
      clearTimeout(id)
      throw e
    }
  }

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
    const docs = await participants.find({ classId }).toArray()
    return res.json(docs)
  })
  app.post('/api/participants', async (req, res) => {
    const payload = req.body || {}
    if (!payload.id) return res.status(400).json({ error: 'id required' })
    payload.updated_at = new Date()
    try {
      if (typeof payload.scoreDelta !== 'undefined') {
        // increment existing participant score atomically and update lastSeen/displayName
        await participants.updateOne({ id: payload.id }, { $inc: { score: Number(payload.scoreDelta) || 0 }, $set: { lastSeen: new Date(), displayName: payload.displayName || (`Alumno-${payload.sessionId ? String(payload.sessionId).slice(0,5) : ''}`) } }, { upsert: true })
      } else if (typeof payload.score !== 'undefined') {
        // legacy: replace full payload
        await participants.replaceOne({ id: payload.id }, payload, { upsert: true })
      } else {
        await participants.replaceOne({ id: payload.id }, payload, { upsert: true })
      }
      // notify websocket clients about updated participants for the class
      try {
  const docs = await participants.find({ classId: payload.classId }).toArray()
  broadcast({ type: 'participants-updated', classId: payload.classId, participants: docs }, payload.classId)
      } catch(e) { /* ignore */ }
      return res.json({ ok: true })
    } catch (err) {
      console.error('participants POST error', err)
      return res.status(500).json({ ok: false, error: String(err) })
    }
  })

  // Challenges
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
    }
    // debug: log what we are broadcasting so we can confirm options/payload shape
    try { console.log('Broadcasting question-launched for class', payload.classId, 'question:', JSON.stringify(publicQuestion)) } catch(e) { /* ignore logging errors */ }
    broadcast({ type: 'question-launched', classId: payload.classId, question: publicQuestion }, payload.classId)
  } catch(e) { console.warn('broadcast question-launched failed', e) }
    return res.json({ ok: true })
  })

  // Answers: participants submit an answer to a question
  app.post('/api/answers', async (req, res) => {
    const payload = req.body || {}
    if (!payload.classId || !payload.sessionId || !payload.questionId) return res.status(400).json({ error: 'classId, sessionId and questionId required' })
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
      // Update scores for correct sessions
      for (const sid of correctSessions) {
        try {
          await participants.updateOne({ classId, sessionId: sid }, { $inc: { score: Number(points) || 0 }, $set: { lastSeen: new Date() } }, { upsert: true })
        } catch(e) { console.error('score update failed', e) }
      }
      // Fetch updated participants
      const updated = await participants.find({ classId }).toArray()
  // Broadcast results and participants update
  try { broadcast({ type: 'question-results', classId, questionId, distribution, correctSessions, correctAnswer }, classId) } catch(e) { console.warn('broadcast question-results failed', e) }
  try { broadcast({ type: 'participants-updated', classId, participants: updated }, classId) } catch(e) { console.warn('broadcast participants-updated failed', e) }
      return res.json({ ok: true, distribution, correctSessions, participants: updated })
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
      ws.on('message', (msg) => {
        // allow clients to send pings or subscribe messages if needed
        try {
          const obj = JSON.parse(String(msg))
          if (obj && obj.type === 'subscribe' && obj.classId) {
            const cid = obj.classId
            // add ws to wsClients
            wsClients.add(ws)
            // add to classSubs
            if (!classSubs.has(cid)) classSubs.set(cid, new Set())
            classSubs.get(cid).add(ws)
            // track reverse mapping
            if (!wsToClasses.has(ws)) wsToClasses.set(ws, new Set())
            wsToClasses.get(ws).add(cid)
            // ack
            try { ws.send(JSON.stringify({ type: 'subscribed', classId: cid })) } catch(e) { console.warn('ack send failed', e) }
            return
          }
          // ignore other messages for now
        } catch(e) { console.warn('invalid ws message', e) }
      })
  ws.on('close', () => {
        // cleanup any class subscriptions
        const set = wsToClasses.get(ws)
        if (set) {
          for (const cid of set) {
            const s = classSubs.get(cid)
            if (s) s.delete(ws)
            if (s && s.size === 0) classSubs.delete(cid)
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
