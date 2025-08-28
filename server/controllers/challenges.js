import express from 'express'

export default function challengesController({ challengesService, challengesRepo } = {}) {
  const router = express.Router()
  const service = challengesService || (challengesRepo ? { listByClass: (cid) => challengesRepo.findByClass(cid), upsert: (p) => challengesRepo.upsert(p) } : null)

  router.get('/', async (req, res) => {
  const classId = req.query.classId
  if (!classId) return res.json([])
  try { const docs = await service.listByClass(classId); return res.json(docs) } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  router.post('/', async (req, res) => {
    const payload = req.body || {}
    const looksLikeGameEnd = (payload && ((payload.payload && payload.payload.type === 'game-ended') || (typeof payload.title === 'string' && /juego terminado/i.test(payload.title))))
    if (looksLikeGameEnd) {
      const cls = payload.classId || 'unknown'
      payload.id = `${cls}:game-ended`
      if (typeof payload.duration !== 'number') payload.duration = 0
      payload.payload = payload.payload || {}
      payload.payload.type = 'game-ended'
    } else { if (!payload.id) payload.id = `c-${Date.now()}` }
    payload.created_at = new Date()
    try {
      const out = await service.upsert(payload)
      return res.json(out)
    } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  return router
}
