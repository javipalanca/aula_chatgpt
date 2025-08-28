import express from 'express'

export default function questionsController({ questionService } = {}) {
  const router = express.Router()

  router.post('/:id/reveal', async (req, res) => {
    const questionId = req.params.id
    const { classId, correctAnswer, points = 100 } = req.body || {}
    if (!classId || typeof correctAnswer === 'undefined') return res.status(400).json({ error: 'classId and correctAnswer required' })
    try {
      if (!questionService || typeof questionService.revealQuestion !== 'function') throw new Error('questionService not available')
      const result = await questionService.revealQuestion({ classId, questionId, correctAnswer, points, activeQuestion: req.body.activeQuestion || null })
      return res.json(result)
    } catch (err) { return res.status(500).json({ ok: false, error: String(err) }) }
  })

  return router
}
