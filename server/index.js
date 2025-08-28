#!/usr/bin/env node
/* eslint-env node */
import dotenv from 'dotenv'
dotenv.config()
import createApp from './app.js'
import participantsControllerFactory from './controllers/participants.js'
import answersControllerFactory from './controllers/answers.js'
import classesControllerFactory from './controllers/classes.js'
import challengesControllerFactory from './controllers/challenges.js'
import progressControllerFactory from './controllers/progress.js'
import settingsControllerFactory from './controllers/settings.js'
import llmControllerFactory from './controllers/llm.js'
import { connectDb, closeDb } from './lib/db.js'
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
import diagnosisControllerFactory from './controllers/diagnosis.js'
import questionsControllerFactory from './controllers/questions.js'
import BroadcastService from './services/BroadcastService.js'
import ClassService from './services/ClassService.js'
import ChallengesService from './services/ChallengesService.js'
import ProgressService from './services/ProgressService.js'
import SettingsService from './services/SettingsService.js'
import DiagnosisService from './services/DiagnosisService.js'

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

  const activeQuestions = new Map()
  // In-memory cooldown map to avoid frequent writes for participant lastSeen updates
  const participantLastPersist = new Map()
  const PARTICIPANT_MIN_PERSIST_MS = 5000
  // In-memory map to throttle heartbeat broadcasts to teacher UIs
  const participantLastBroadcast = new Map()
  const PARTICIPANT_BROADCAST_MIN_MS = 2000

// Instantiate evaluator service
const llmEvaluator = new LLMEvaluator({ openaiKey: OPENAI_API_KEY, openaiUrl: OPENAI_URL, openaiModel: OPENAI_MODEL, ollamaUrl: OLLAMA_URL, ollamaModel: OLLAMA_MODEL })

// Helper for fetching connected participants; will be bound once participantService is created
let fetchConnectedParticipants

// (LLM evaluator instance `llmEvaluator` is used directly by services/controllers)

try {
  await connectDb({ uri: MONGO_URI, dbName: MONGO_DB })
  console.log('Connected to MongoDB', MONGO_URI, 'db=', MONGO_DB)

  const settingsRepo = new SettingsRepo()
  const diagnosisResults = new DiagnosisRepo()
  const participantsRepo = new ParticipantsRepo()
  const answersRepo = new AnswersRepo()
  const classesRepo = new ClassesRepo()
  const challengesRepo = new ChallengesRepo()
  const progressRepo = new ProgressRepo()

  // NOTE: services are instantiated after we declare in-memory maps and broadcast
  // (done below) so we defer their creation until those helpers exist.

  // WebSocket bookkeeping and broadcasting encapsulated by BroadcastService
  const broadcastService = new BroadcastService({ logger: console })
  // classId -> { question: publicQuestion, startedAt }
  // Instantiate services now that broadcast and in-memory maps exist
  const participantService = new ParticipantService({ participantsRepo, broadcast: (d, cid) => broadcastService.publish(d, cid), participantLastPersist, participantLastBroadcast, options: { minPersistMs: PARTICIPANT_MIN_PERSIST_MS, minBroadcastMs: PARTICIPANT_BROADCAST_MIN_MS } })
  const answerService = new AnswerService({ answersRepo, participantsRepo, evaluator: llmEvaluator, broadcast: (d, cid) => broadcastService.publish(d, cid) })
  const classService = new ClassService({ classesRepo })
  const challengesService = new ChallengesService({ challengesRepo, broadcast: (d, cid) => broadcastService.publish(d, cid), activeQuestions })
  const progressService = new ProgressService({ progressRepo })
  const settingsService = new SettingsService({ settingsRepo })
  const diagnosisService = new DiagnosisService({ diagnosisRepo: diagnosisResults, ollamaUrl: OLLAMA_URL, ollamaModel: OLLAMA_MODEL })
  const questionService = new QuestionService({ answersRepo, participantsRepo, evaluator: llmEvaluator, broadcast: (d, cid) => broadcastService.publish(d, cid) })

  // Bind helper to delegate to participantService
  fetchConnectedParticipants = async (classId, opts = {}) => participantService.fetchConnectedParticipants(classId, opts)

  // (removed unused fetchWithTimeout helper)

  // Create app
  const app = createApp()

  // Instantiate services and controllers then mount them via app.use
  const participantsController = participantsControllerFactory({ participantService, fetchConnectedParticipants })
  const answersController = answersControllerFactory({ answerService, activeQuestions })
  const classesController = classesControllerFactory({ classService })
  const challengesController = challengesControllerFactory({ challengesService })
  const progressController = progressControllerFactory({ progressService })
  const settingsController = settingsControllerFactory({ settingsService })
  const llmController = llmControllerFactory({ evaluator: llmEvaluator, ollamaConfig: { url: OLLAMA_URL, model: OLLAMA_MODEL }, fetchImpl: fetch })  
  const questionsController = questionsControllerFactory({ questionService })
  const diagnosisController = diagnosisControllerFactory({ diagnosisService, csvEscape })

  // Mount controllers under their API prefixes
  app.use('/api/participants', participantsController)
  app.use('/api/answers', answersController)
  app.use('/api/classes', classesController)
  app.use('/api/challenges', challengesController)
  app.use('/api/progress', progressController)
  app.use('/api/settings', settingsController)
  app.use('/api/llm', llmController)
  // Backwards-compat: some clients call /api/evaluate directly — provide a short alias
  app.post('/api/evaluate', async (req, res) => {
    const { question, answer } = req.body || {}
    if (!question || !answer) return res.status(400).json({ error: 'Question and answer are required' })
    try {
      const result = await llmEvaluator.evaluate(question, answer)
      return res.json(result)
    } catch (e) {
      console.error('evaluate alias error', e)
      return res.status(500).json({ error: 'Evaluation failed' })
    }
  })
  app.use('/api/questions', questionsController)
  app.use('/api/diagnosis', diagnosisController)

  // Controllers mounted above via app.use(); inline route handlers removed
  app.get('/api/debug/dbstats', async (req, res) => {
    try {
      // run counts in parallel to be faster
      const [classesCount, participantsCount, challengesCount, diagnosisCount] = await Promise.all([
        typeof classesRepo.count === 'function' ? classesRepo.count() : Promise.resolve(0),
        participantsRepo.count(),
        challengesRepo.count(),
        diagnosisResults.count()
      ])
      const counts = {
        classes: classesCount,
        participants: participantsCount,
        challenges: challengesCount,
        diagnosis_results: diagnosisCount
      }
      return res.json({ ok: true, counts })
    } catch (err) {
      console.error('dbstats error', err)
      return res.status(500).json({ ok: false, error: String(err) })
    }
  })
  // Attach ws upgrade handler to the HTTP server (delegated to WSManager)
  const server = app.listen(PORT, () => console.log('Aula proxy server listening on', PORT))
  server.on('error', (err) => console.error('HTTP server error', err))
  // track raw connections so we can forcibly destroy them on shutdown if needed
  const _connections = new Set()
  server.on('connection', (socket) => {
    _connections.add(socket)
    socket.on('close', () => _connections.delete(socket))
  })
  // global handlers to surface otherwise silent crashes
  process.on('uncaughtException', (err) => {
    console.error('uncaughtException', err)
  })
  process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection', reason)
  })
  // instantiate WSManager with broadcastService and attach
  const wsManager = new WSManager({ participantsService: participantService, answerService, questionService, fetchActiveQuestion: async (cid) => activeQuestions.get(cid), broadcastService })
  wsManager.attach(server)
  // graceful shutdown with forced timeout and connection destroy
  let isShuttingDown = false
  const shutdown = async (signal) => {
    if (isShuttingDown) {
      console.log('Shutdown already in progress...')
      return
    }
    isShuttingDown = true
    console.log('Received', signal, '- shutting down')
    // safety timeout: force exit if shutdown stalls
      const forceTimeout = setTimeout(() => {
      console.error('Shutdown timed out, forcing exit')
      try {
        for (const s of _connections) { try { s.destroy() } catch (e) { console.debug('error destroying connection during forced exit', e) } }
      } catch (e) { console.debug('error destroying connections during forced exit', e) }
      process.exit(1)
    }, 2000)

    try {
      if (wsManager && typeof wsManager.close === 'function') {
        try { await wsManager.close() } catch (e) { console.error('Error closing WS manager', e) }
      }

      // stop accepting new connections and wait for existing to close
      await new Promise((resolve) => {
        try { server.close(() => { console.log('HTTP server closed'); resolve() }) } catch (e) { console.error('Error closing HTTP server', e); resolve() }
      })

      // destroy any stubborn open sockets
      try {
        for (const s of _connections) {
          try { s.destroy() } catch (e) { /* ignore per-socket */ }
        }
  } catch (e) { console.debug('error destroying lingering sockets', e) }

      try { await closeDb() } catch (e) { console.error('Error closing DB', e) }
      clearTimeout(forceTimeout)
      process.exit(0)
    } catch (e) {
      console.error('Error during shutdown', e)
      clearTimeout(forceTimeout)
      process.exit(1)
    }
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
} catch (err) {
  console.error(err)
  process.exit(1)
}
