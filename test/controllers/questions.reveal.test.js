import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import createApp from '../../server/app.js'
import questionsControllerFactory from '../../server/controllers/questions.js'

describe('questions controller - reveal endpoint', () => {
  let app
  let mockQuestionService
  beforeEach(() => {
    app = createApp()
    mockQuestionService = { revealQuestion: vi.fn().mockResolvedValue({ ok: true, distribution: {} }) }
    const qc = questionsControllerFactory({ questionService: mockQuestionService })
    app.use('/api/questions', qc)
  })

  it('returns 400 when missing classId or correctAnswer', async () => {
    const res = await request(app).post('/api/questions/QX/reveal').send({})
    expect(res.status).toBe(400)
  })

  it('delegates to questionService.revealQuestion and returns its result', async () => {
    const body = { classId: 'C1', correctAnswer: 'A', points: 42 }
    const res = await request(app).post('/api/questions/Q1/reveal').send(body)
    expect(res.status).toBe(200)
    expect(mockQuestionService.revealQuestion).toHaveBeenCalledWith(expect.objectContaining({ classId: 'C1', questionId: 'Q1', correctAnswer: 'A', points: 42 }))
    expect(res.body.ok).toBe(true)
  })
})
