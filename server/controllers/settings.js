import express from 'express'

export default function settingsController({ settingsService, settingsRepo } = {}) {
  const router = express.Router()
  const service = settingsService || (settingsRepo ? { getSettings: (id) => settingsRepo.findById(id), upsertSettings: (id, data) => settingsRepo.upsert({ id, data }) } : null)

  router.get('/:id', async (req, res) => {
    try { const doc = await service.getSettings(req.params.id); return res.json(doc || null) } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  router.put('/:id', async (req, res) => {
    try { await service.upsertSettings(req.params.id, req.body.data || {}); return res.json({ ok: true }) } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  return router
}
