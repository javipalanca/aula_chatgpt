import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import createApp from '../../server/app.js'
import answersControllerFactory from '../../server/controllers/answers.js'

describe('integration: answers controller', () => {
  let app
  let fakeAnswerService
  let fakeAnswersRepo
  beforeEach(() => {
    app = createApp()
    fakeAnswerService = { submitAnswer: vi.fn().mockResolvedValue({ ok: true }) }
    fakeAnswersRepo = { replaceAnswer: vi.fn().mockResolvedValue({ ok: true }) }
  const ac = answersControllerFactory({ answerService: fakeAnswerService, answersRepo: fakeAnswersRepo, activeQuestions: new Map() })
    app.use('/api/answers', ac)
  })

  it('POST /api/answers forwards to answerService.submitAnswer', async () => {
    const body = { classId: 'C1', sessionId: 'S1', questionId: 'Q1', answer: 'A' }
    const res = await request(app).post('/api/answers').send(body)
    expect(res.status).toBe(200)
    expect(fakeAnswerService.submitAnswer).toHaveBeenCalled()
  })
})
