import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import createApp from '../../server/app.js'
import questionsControllerFactory from '../../server/controllers/questions.js'

describe('questions controller', () => {
  let app
  let questionService

  beforeEach(() => {
    questionService = { revealQuestion: vi.fn().mockResolvedValue({ ok: true }) }
  const questionsController = questionsControllerFactory({ questionService })
  app = createApp()
  app.use('/api/questions', questionsController)
  })

  it('POST /api/questions/:id/reveal returns 400 when missing fields', async () => {
    const res = await request(app).post('/api/questions/Q1/reveal').send({})
    expect(res.status).toBe(400)
  })

  it('POST /api/questions/:id/reveal delegates to questionService', async () => {
    const res = await request(app).post('/api/questions/Q1/reveal').send({ classId: 'C1', correctAnswer: 'A', points: 50 })
    expect(res.status).toBe(200)
    expect(questionService.revealQuestion).toHaveBeenCalledWith({ classId: 'C1', questionId: 'Q1', correctAnswer: 'A', points: 50, activeQuestion: null })
  })
})
