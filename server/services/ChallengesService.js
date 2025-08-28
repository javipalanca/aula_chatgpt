export default class ChallengesService {
  constructor({ challengesRepo, broadcast = null, activeQuestions = null } = {}) {
    this.challengesRepo = challengesRepo
    this.broadcast = broadcast
    this.activeQuestions = activeQuestions
  }

  async listByClass(classId) {
    if (!classId) return []
    return this.challengesRepo.findByClass(classId)
  }

  async upsert(payload = {}) {
    if (!payload) throw new Error('payload required')
    const looksLikeGameEnd = (payload && ((payload.payload && payload.payload.type === 'game-ended') || (typeof payload.title === 'string' && /juego terminado/i.test(payload.title))))
    if (looksLikeGameEnd) {
      const cls = payload.classId || 'unknown'
      payload.id = `${cls}:game-ended`
      if (typeof payload.duration !== 'number') payload.duration = 0
      payload.payload = payload.payload || {}
      payload.payload.type = 'game-ended'
    } else { if (!payload.id) payload.id = `c-${Date.now()}` }
    payload.created_at = payload.created_at || new Date()
    await this.challengesRepo.upsert(payload)
    const publicQuestion = { ...payload }
    if (publicQuestion.payload && typeof publicQuestion.payload === 'object') {
      publicQuestion.payload = { ...publicQuestion.payload }
      if (typeof publicQuestion.payload.correctAnswer !== 'undefined') delete publicQuestion.payload.correctAnswer
      if (typeof publicQuestion.payload.duration !== 'undefined') publicQuestion.duration = publicQuestion.payload.duration
    }
    try { if (this.activeQuestions && typeof this.activeQuestions.set === 'function') this.activeQuestions.set(payload.classId, { question: publicQuestion, startedAt: Date.now() }) } catch (e) { /* ignore */ }
    try { if (this.broadcast) this.broadcast({ type: 'question-launched', classId: payload.classId, question: publicQuestion }, payload.classId) } catch (e) { /* ignore */ }
    return { ok: true }
  }
}
