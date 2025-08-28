/* eslint-env node */
export default class AnswerService {
  constructor({ answersRepo, participantsRepo, evaluator = null, broadcast = null } = {}) {
    this.answersRepo = answersRepo
    this.participantsRepo = participantsRepo
    this.evaluator = evaluator
    this.broadcast = broadcast
  }

  async submitAnswer({ classId, sessionId, questionId, answer, evaluation = null, activeQuestion = null } = {}) {
    if (!classId || !sessionId || !questionId) throw new Error('classId, sessionId and questionId required')
    const id = `${classId}:${sessionId}:${questionId}`
    const doc = { id, classId, sessionId, questionId, answer, created_at: new Date() }
    await this.answersRepo.upsert(doc)
    try {
      if (typeof this.broadcast === 'function') this.broadcast({ type: 'answers-updated', classId, questionId, answer: doc }, classId)
    } catch (e) { /* ignore */ }

    // compute aggregate counts and broadcast
    try {
      const docs = await this.answersRepo.findByClassQuestion(classId, questionId)
      const counts = {}
      for (const a of docs) {
        const key = a.answer == null ? '' : String(a.answer)
        counts[key] = (counts[key] || 0) + 1
      }
      const total = Object.values(counts).reduce((s, v) => s + v, 0)
      const agg = { type: 'answers-count', classId, questionId, total, counts }
      try { if (typeof this.broadcast === 'function') this.broadcast(agg, classId) } catch (e) { /* ignore */ }
    } catch (e) { /* ignore */ }

    // handle evaluation for open/prompt questions; prefer client-provided evaluation, fall back to server evaluator
    try {
      // support both shapes: activeQuestion may be the payload directly or nested under .question.payload
      const questionPayload = (activeQuestion && activeQuestion.question && activeQuestion.question.payload) ? activeQuestion.question.payload : (activeQuestion || {})
      const evalMode = (questionPayload && typeof questionPayload.evaluation === 'string')
        ? questionPayload.evaluation
        : ((questionPayload && (questionPayload.source === 'BAD_PROMPTS' || questionPayload.source === 'PROMPTS')) ? 'prompt' : 'mcq')

      const computeAndApplyAward = async (rawScore, feedback = '', source = 'server') => {
        const raw = Number(rawScore || 0)
        const scoreFraction = Math.max(0, Math.min(1, (raw > 1 ? raw / 100 : raw)))
        const answerTs = doc.created_at ? (new Date(doc.created_at)).getTime() : Date.now()
        const totalDurationSec = (questionPayload && Number(questionPayload.duration)) ? Number(questionPayload.duration) : ((questionPayload && Number(questionPayload.points)) ? 30 : 30)
        const startedAt = (activeQuestion && activeQuestion.startedAt) ? activeQuestion.startedAt : (answerTs - (totalDurationSec * 1000))
        const timeTakenMs = Math.max(0, answerTs - startedAt)
        const percent = Math.min(1, timeTakenMs / (totalDurationSec * 1000))
        const points = (questionPayload && Number(questionPayload.points)) ? Number(questionPayload.points) : 100
        const awarded = Math.round((Number(points) || 0) * scoreFraction * Math.max(0, 1 - percent))
        if (awarded > 0 && this.participantsRepo && typeof this.participantsRepo.incScore === 'function') {
          try { await this.participantsRepo.incScore(classId, sessionId, awarded) } catch (e) { /* ignore score failures */ }
        }
        // persist evaluation attached to the answer
        try { await this.answersRepo.upsert({ ...doc, evaluation: { score: scoreFraction, feedback: feedback || '', awardedPoints: awarded, evaluatedAt: new Date(), source } }) } catch (e) { /* ignore */ }
        // broadcast evaluation
        try { if (typeof this.broadcast === 'function') this.broadcast({ type: 'answer-evaluated', classId, questionId, sessionId, score: scoreFraction, feedback: feedback || '', awardedPoints: awarded, source }, classId) } catch (e) { /* ignore */ }
      }

      // If client provided an evaluation and the question expects open/prompt evaluation, use it.
      if (evaluation && (evalMode === 'open' || evalMode === 'prompt')) {
        await computeAndApplyAward(evaluation.score || 0, evaluation.feedback || '', 'client')
      } else if ((!evaluation || evaluation == null) && (evalMode === 'open' || evalMode === 'prompt') && this.evaluator && typeof this.evaluator.evaluate === 'function') {
        // ask server evaluator for a score
        try {
          const ev = await this.evaluator.evaluate({ question: questionPayload, answer: answer })
          const serverScore = (ev && (typeof ev.score === 'number' || typeof ev.score === 'string')) ? ev.score : 0
          const feedback = (ev && ev.feedback) ? ev.feedback : ''
          await computeAndApplyAward(serverScore, feedback, 'server')
        } catch (e) { /* ignore evaluator errors */ }
      }
    } catch (e) { /* ignore */ }

    return { ok: true }
  }

  async list(query = {}) {
    if (!this.answersRepo || typeof this.answersRepo.find !== 'function') return []
    return this.answersRepo.find(query)
  }
}
