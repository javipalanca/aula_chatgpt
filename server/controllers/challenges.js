import express from 'express'

export default function challengesController({ challengesRepo, broadcast, activeQuestions } = {}) {
  const router = express.Router()

  router.get('/', async (req, res) => {
    const classId = req.query.classId
    if (!classId) return res.json([])
    try { const docs = await challengesRepo.findByClass(classId); return res.json(docs) } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
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
      await challengesRepo.upsert(payload)
      const publicQuestion = { ...payload }
      if (publicQuestion.payload && typeof publicQuestion.payload === 'object') {
        publicQuestion.payload = { ...publicQuestion.payload }
        if (typeof publicQuestion.payload.correctAnswer !== 'undefined') delete publicQuestion.payload.correctAnswer
        if (typeof publicQuestion.payload.duration !== 'undefined') publicQuestion.duration = publicQuestion.payload.duration
      }
      try { activeQuestions.set(payload.classId, { question: publicQuestion, startedAt: Date.now() }) } catch (e) { /* ignore */ }
      try { if (broadcast) broadcast({ type: 'question-launched', classId: payload.classId, question: publicQuestion }, payload.classId) } catch (e) { /* ignore */ }
      return res.json({ ok: true })
    } catch (e) { return res.status(500).json({ ok: false, error: String(e) }) }
  })

  return router
}
