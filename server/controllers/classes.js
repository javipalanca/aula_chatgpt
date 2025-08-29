import express from 'express'

export default function classesController({ classesRepo, classService } = {}) {
  const router = express.Router()
  // prefer classService when provided
  const service = classService || (classesRepo ? { list: (q)=>classesRepo.find(q), get: (id)=>classesRepo.findById(id), create: async (p)=>{ if (!p.id) p.id = (Math.random().toString(36).substring(2,8).toUpperCase()); p.created_at = p.created_at || new Date(); await classesRepo.upsert(p); return { ok: true, id: p.id } }, update: (id,u)=>classesRepo.update(id,u), delete: (id)=>classesRepo.deleteById(id) } : null)

  router.get('/', async (req, res) => {
    try {
      const docs = await service.list({})
      return res.json(docs)
    } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  router.get('/:id', async (req, res) => {
    try { const doc = await service.get(req.params.id); return res.json(doc || null) } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  router.post('/', async (req, res) => {
    const payload = req.body || {}
    try { const out = await service.create(payload); return res.json(out) } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  router.patch('/:id', async (req, res) => {
    try { const doc = await service.update(req.params.id, req.body || {}); return res.json(doc || null) } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  router.delete('/:id', async (req, res) => {
    try {
      await service.delete(req.params.id)
      return res.json({ ok: true })
    } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  // Atomic reset endpoint: reset class meta, delete answers (optional) and reset participant scores
  router.post('/:id/reset', async (req, res) => {
    const id = req.params.id
    try {
  const newDoc = await service.resetClass(id)
  return res.json({ ok: true, class: newDoc })
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e) })
    }
  })

  return router
}
