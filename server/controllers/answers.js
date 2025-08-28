import express from 'express'

export default function answersController({ answerService, answersRepo, activeQuestions } = {}) {
  const router = express.Router()

  router.post('/', async (req, res) => {
    const payload = req.body || {}
    if (!payload.classId || !payload.sessionId || !payload.questionId) return res.status(400).json({ error: 'classId, sessionId and questionId required' })
    try {
      const active = activeQuestions.get(payload.classId)
      await answerService.submitAnswer({ classId: payload.classId, sessionId: payload.sessionId, questionId: payload.questionId, answer: payload.answer, evaluation: payload.evaluation, activeQuestion: active ? { question: active.question, startedAt: active.startedAt } : null })
      return res.json({ ok: true })
    } catch (err) { return res.status(500).json({ ok: false, error: String(err) }) }
  })

  router.get('/', async (req, res) => {
    const classId = req.query.classId
    const questionId = req.query.questionId
    const q = {}
    if (classId) q.classId = classId
    if (questionId) q.questionId = questionId
    try {
      const docs = await answersRepo.find(q)
      return res.json(docs)
    } catch (err) { return res.status(500).json({ ok: false, error: String(err) }) }
  })

  return router
}
