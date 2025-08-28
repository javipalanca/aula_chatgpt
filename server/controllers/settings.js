import express from 'express'

export default function settingsController({ settingsRepo } = {}) {
  const router = express.Router()

  router.get('/:id', async (req, res) => {
    try { const doc = await settingsRepo.findById(req.params.id); return res.json(doc || null) } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  router.put('/:id', async (req, res) => {
    try { await settingsRepo.upsert({ id: req.params.id, data: req.body.data || {} }); return res.json({ ok: true }) } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  return router
}
