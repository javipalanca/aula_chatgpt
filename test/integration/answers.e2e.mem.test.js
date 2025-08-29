import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient } from 'mongodb'
import request from 'supertest'
import createApp from '../../server/app.js'
import answersControllerFactory from '../../server/controllers/answers.js'
import AnswersRepo from '../../server/repositories/AnswersRepo.js'

describe('E2E /api/answers with memory DB', () => {
  let mongoServer
  let client
  let db
  let app

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create()
    const uri = mongoServer.getUri()
    client = new MongoClient(uri)
    await client.connect()
    db = client.db('test')
  const answersRepo = new AnswersRepo({ db })
    // simple fake answerService that uses the repo
  const answerService = { submitAnswer: async ({ classId, sessionId, questionId, answer }) => { await answersRepo.upsert({ id: `${classId}:${sessionId}:${questionId}`, classId, sessionId, questionId, answer, created_at: new Date().toISOString() }); return { ok: true } } }
  app = createApp()
  app.use('/api/answers', answersControllerFactory({ answerService, answersRepo, activeQuestions: new Map() }))
  }, 20000)

  afterAll(async () => {
    if (client) await client.close()
    if (mongoServer) await mongoServer.stop()
  })

  it('POST /api/answers persists answer', async () => {
    const body = { classId: 'C9', sessionId: 'S9', questionId: 'Q9', answer: 'X' }
    const res = await request(app).post('/api/answers').send(body)
    expect(res.status).toBe(200)
    // verify persisted
    const col = db.collection('answers')
    const docs = await col.find({ classId: 'C9' }).toArray()
    expect(docs.length).toBeGreaterThanOrEqual(1)
    expect(docs[0].sessionId).toBe('S9')
  })
})
