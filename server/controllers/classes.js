import express from 'express'

export default function classesController({ classesRepo } = {}) {
  const router = express.Router()

  router.get('/', async (req, res) => {
    try {
      const docs = await classesRepo.find({})
      return res.json(docs)
    } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  router.get('/:id', async (req, res) => {
    try { const doc = await classesRepo.findById(req.params.id); return res.json(doc || null) } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  router.post('/', async (req, res) => {
    const payload = req.body || {}
    if (!payload.id) payload.id = (Math.random().toString(36).substring(2,8).toUpperCase())
    payload.created_at = new Date()
    try { await classesRepo.upsert(payload); return res.json({ ok: true, id: payload.id }) } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  router.patch('/:id', async (req, res) => {
    try { const doc = await classesRepo.update(req.params.id, req.body || {}); return res.json(doc || null) } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  router.delete('/:id', async (req, res) => {
    try {
      await classesRepo.deleteById(req.params.id)
      return res.json({ ok: true })
    } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  return router
}
