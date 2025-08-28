import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import createApp from '../../server/app.js'
import settingsControllerFactory from '../../server/controllers/settings.js'

describe('integration: settings controller', () => {
  let app
  let fakeSettingsRepo
  beforeEach(() => {
    app = createApp()
    fakeSettingsRepo = { upsert: async () => ({ ok: true }), findById: async () => ({ data: { foo: 'bar' } }) }
    const sc = settingsControllerFactory({ settingsRepo: fakeSettingsRepo })
    app.use('/api/settings', sc)
  })

  it('PUT /api/settings/:id upserts and returns 200', async () => {
    const res = await request(app).put('/api/settings/S1').send({ data: { foo: 'bar' } })
    expect(res.status).toBe(200)
  })
})
