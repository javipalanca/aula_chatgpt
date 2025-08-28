import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import createApp from '../../server/app.js'
import classesControllerFactory from '../../server/controllers/classes.js'

describe('classes controller', () => {
  let app
  let classesRepo

  beforeEach(() => {
    classesRepo = { find: vi.fn().mockResolvedValue([{ id: 'C1' }]), findById: vi.fn().mockResolvedValue({ id: 'C1' }), upsert: vi.fn().mockResolvedValue(true), update: vi.fn().mockResolvedValue({ id: 'C1' }), deleteById: vi.fn().mockResolvedValue(true) }
    const classesController = classesControllerFactory({ classesRepo })
    app = createApp()
    app.use('/api/classes', classesController)
  })

  it('GET /api/classes returns classes', async () => {
    const res = await request(app).get('/api/classes')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: 'C1' }])
  })

  it('GET /api/classes/:id returns class', async () => {
    const res = await request(app).get('/api/classes/C1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: 'C1' })
  })

  it('POST /api/classes creates class', async () => {
    const res = await request(app).post('/api/classes').send({ name: 'A' })
    expect(res.status).toBe(200)
    expect(classesRepo.upsert).toHaveBeenCalled()
  })
})
