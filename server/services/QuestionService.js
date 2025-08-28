/* eslint-env node */
export default class QuestionService {
  constructor({ answersRepo, participantsRepo, evaluator = null, broadcast = null } = {}) {
    this.answersRepo = answersRepo
    this.participantsRepo = participantsRepo
    this.evaluator = evaluator
    this.broadcast = broadcast
  }

  async revealQuestion({ classId, questionId, correctAnswer, points = 100, activeQuestion = null } = {}) {
    if (!classId || typeof correctAnswer === 'undefined') throw new Error('classId and correctAnswer required')
    const docs = await this.answersRepo.findByClassQuestion(classId, questionId)
    const distribution = {}
    const correctSessions = []
    for (const a of docs) {
      const key = a.answer == null ? '' : String(a.answer)
      distribution[key] = (distribution[key] || 0) + 1
      if (String(a.answer) === String(correctAnswer)) correctSessions.push(a.sessionId)
    }

    let evaluations = []
    try {
      const totalDurationSec = (activeQuestion && activeQuestion.question && Number(activeQuestion.question.duration)) ? Number(activeQuestion.question.duration) : 30
      const payload = (activeQuestion && activeQuestion.question && activeQuestion.question.payload) ? activeQuestion.question.payload : {}
      const evalMode = (payload && typeof payload.evaluation === 'string') ? payload.evaluation : ((payload && (payload.source === 'BAD_PROMPTS' || payload.source === 'PROMPTS')) ? 'prompt' : 'mcq')

      if (evalMode === 'mcq') {
        for (const a of docs) {
          if (String(a.answer) === String(correctAnswer)) {
            try {
              const answerTs = a.created_at ? (new Date(a.created_at)).getTime() : Date.now()
              const startedAt = (activeQuestion && activeQuestion.startedAt) ? activeQuestion.startedAt : (answerTs - (totalDurationSec * 1000))
              const timeTakenMs = Math.max(0, answerTs - startedAt)
              const percent = Math.min(1, timeTakenMs / (totalDurationSec * 1000))
              const award = Math.round((Number(points) || 0) * Math.max(0, 1 - percent))
              if (award > 0) await this.participantsRepo.incScore(classId, a.sessionId, award)
            } catch (e) { /* ignore per-student award error */ }
          }
        }
      } else if (evalMode === 'redflags') {
        const expected = Array.isArray(correctAnswer) ? correctAnswer.map(String) : []
        const expectedCount = expected.length || 1
        for (const a of docs) {
          try {
            let ansArr = []
            if (Array.isArray(a.answer)) ansArr = a.answer.map(String)
            else if (typeof a.answer !== 'undefined' && a.answer !== null) ansArr = [String(a.answer)]
            const matches = ansArr.filter(x => expected.includes(String(x))).length
            const fraction = Math.max(0, Math.min(1, matches / expectedCount))
            const answerTs = a.created_at ? (new Date(a.created_at)).getTime() : Date.now()
            const startedAt = (activeQuestion && activeQuestion.startedAt) ? activeQuestion.startedAt : (answerTs - (totalDurationSec * 1000))
            const timeTakenMs = Math.max(0, answerTs - startedAt)
            const percent = Math.min(1, timeTakenMs / (totalDurationSec * 1000))
            const award = Math.round((Number(points) || 0) * fraction * Math.max(0, 1 - percent))
            if (award > 0) await this.participantsRepo.incScore(classId, a.sessionId, award)
          } catch (e) { /* ignore per-student award error */ }
        }
      } else if (evalMode === 'open' || evalMode === 'prompt') {
        const evalPromises = docs.map(async (a) => {
          try {
            const answerText = Array.isArray(a.answer) ? a.answer.join(', ') : String(a.answer || '')
            const evalRes = await this.evaluator.evaluate((activeQuestion && activeQuestion.question && activeQuestion.question.payload) ? activeQuestion.question.payload : {}, answerText)
            const _rawScore = (typeof evalRes.score === 'number') ? evalRes.score : Number(evalRes.score || 0)
            const scoreFraction = (typeof _rawScore === 'number' && !isNaN(_rawScore)) ? Math.max(0, Math.min(1, (_rawScore > 1 ? _rawScore / 100 : _rawScore))) : 0
            const answerTs = a.created_at ? (new Date(a.created_at)).getTime() : Date.now()
            const startedAt = (activeQuestion && activeQuestion.startedAt) ? activeQuestion.startedAt : (answerTs - (totalDurationSec * 1000))
            const timeTakenMs = Math.max(0, answerTs - startedAt)
            const percent = Math.min(1, timeTakenMs / (totalDurationSec * 1000))
            const awarded = Math.round((Number(points) || 0) * scoreFraction * Math.max(0, 1 - percent))
            if (awarded > 0) await this.participantsRepo.incScore(classId, a.sessionId, awarded)
            return { sessionId: a.sessionId, score: scoreFraction, feedback: evalRes.feedback || '', awardedPoints: awarded }
          } catch (e) { return { sessionId: a.sessionId, score: 0, feedback: 'error', awardedPoints: 0 } }
        })
        evaluations = await Promise.all(evalPromises)
      }
    } catch (e) { /* ignore batch evaluation errors */ }

    // Broadcast results
    try {
      const payload = { type: 'question-results', classId, questionId, distribution, correctSessions, correctAnswer }
      if (activeQuestion && activeQuestion.question) {
        const q = activeQuestion.question
        const payloadMeta = (q && q.payload) ? q.payload : {}
        const evalMode = (payloadMeta && typeof payloadMeta.evaluation === 'string') ? payloadMeta.evaluation : 'mcq'
        if (evalMode === 'open' || evalMode === 'prompt') payload.answers = docs.map(a => ({ sessionId: a.sessionId, answer: a.answer, created_at: a.created_at }))
      }
      if (typeof this.broadcast === 'function') this.broadcast(payload, classId)
    } catch (e) { /* ignore broadcast */ }

    try { if (typeof this.broadcast === 'function') {
      const connected = await this.participantsRepo.listConnected(classId)
      this.broadcast({ type: 'participants-updated', classId, participants: connected }, classId)
    }} catch (e) { /* ignore */ }

    return { ok: true, distribution, correctSessions, evaluations }
  }
}
