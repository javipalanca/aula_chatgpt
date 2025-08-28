import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import createApp from '../../server/app.js'
import participantsControllerFactory from '../../server/controllers/participants.js'

describe('participants controller', () => {
  let app
  let participantService
  let fetchConnectedParticipants

  beforeEach(() => {
    participantService = {
      saveParticipant: vi.fn().mockResolvedValue({ ok: true }),
      resetScores: vi.fn().mockResolvedValue(true)
    }
    fetchConnectedParticipants = vi.fn().mockResolvedValue([{ id: 'S1' }])
  const participantsController = participantsControllerFactory({ participantService, fetchConnectedParticipants })
  app = createApp()
  app.use('/api/participants', participantsController)
  })

  it('GET /api/participants returns empty if no classId', async () => {
    const res = await request(app).get('/api/participants')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  it('GET /api/participants?classId=X returns participants', async () => {
    const res = await request(app).get('/api/participants').query({ classId: 'C1' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: 'S1' }])
  })

  it('POST /api/participants requires id', async () => {
    const res = await request(app).post('/api/participants').send({})
    expect(res.status).toBe(400)
  })

  it('POST /api/participants accepts valid payload', async () => {
    const payload = { id: 'S2', name: 'Ana' }
    const res = await request(app).post('/api/participants').send(payload)
    expect(res.status).toBe(200)
    expect(participantService.saveParticipant).toHaveBeenCalled()
  })

})
