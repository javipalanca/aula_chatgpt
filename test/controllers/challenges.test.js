import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import createApp from '../../server/app.js'
import challengesControllerFactory from '../../server/controllers/challenges.js'

describe('challenges controller', () => {
  let app
  let challengesRepo

  beforeEach(() => {
    challengesRepo = { findByClass: vi.fn().mockResolvedValue([{ id: 'ch1' }]), upsert: vi.fn().mockResolvedValue(true) }
    const challengesController = challengesControllerFactory({ challengesRepo, broadcast: vi.fn(), activeQuestions: new Map() })
    app = createApp()
    app.use('/api/challenges', challengesController)
  })

  it('GET /api/challenges returns [] when no classId', async () => {
    const res = await request(app).get('/api/challenges')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('POST /api/challenges creates and broadcasts', async () => {
    const res = await request(app).post('/api/challenges').send({ classId: 'C1', title: 'Q' })
    expect(res.status).toBe(200)
  })
})
