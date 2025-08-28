/* eslint-env node */
export default class ParticipantService {
  constructor({ participantsRepo, broadcast = null, participantLastPersist = null, participantLastBroadcast = null, options = {} } = {}) {
    this.participantsRepo = participantsRepo
    this.broadcast = broadcast
    this.participantLastPersist = participantLastPersist || new Map()
    this.participantLastBroadcast = participantLastBroadcast || new Map()
    this.minPersistMs = options.minPersistMs || 5000
    this.minBroadcastMs = options.minBroadcastMs || 2000
  }

  async fetchConnectedParticipants(classId, opts = {}) {
    return this.participantsRepo.listConnected(classId, opts)
  }

  async saveParticipant(payload = {}) {
    if (!payload || !payload.id) throw new Error('participant id required')
    const pKey = `${payload.classId || 'noclass'}:${payload.sessionId || payload.id}`
    const now = Date.now()
    const lastPersist = this.participantLastPersist.get(pKey) || 0
    const isScoreOp = typeof payload.scoreDelta !== 'undefined' || typeof payload.score !== 'undefined'
    if (!isScoreOp && now - lastPersist < this.minPersistMs) {
      return { ok: true, skipped: true }
    }
    if (typeof payload.scoreDelta !== 'undefined') {
      await this.participantsRepo.incScore(payload.classId, payload.sessionId, Number(payload.scoreDelta) || 0)
      try { this.participantLastPersist.set(pKey, Date.now()) } catch (e) { /* ignore */ }
    } else if (typeof payload.score !== 'undefined') {
      await this.participantsRepo.upsert({ id: payload.id, classId: payload.classId, sessionId: payload.sessionId, displayName: payload.displayName, score: payload.score, lastSeen: new Date(), connected: !!payload.connected })
      try { this.participantLastPersist.set(pKey, Date.now()) } catch (e) { /* ignore */ }
    } else {
      await this.participantsRepo.upsert({ id: payload.id, classId: payload.classId, sessionId: payload.sessionId, displayName: payload.displayName, score: payload.score || 0, lastSeen: new Date(), connected: !!payload.connected })
      try { this.participantLastPersist.set(pKey, Date.now()) } catch (e) { /* ignore */ }
    }
    // broadcast participants-updated
    try {
      if (typeof this.broadcast === 'function') {
        const docs = await this.fetchConnectedParticipants(payload.classId)
        this.broadcast({ type: 'participants-updated', classId: payload.classId, participants: docs }, payload.classId)
      }
    } catch (e) { /* ignore broadcast errors */ }
    return { ok: true }
  }

  async resetScores(classId) {
    if (!classId) throw new Error('classId required')
    await this.participantsRepo.resetScores(classId)
    try {
      if (typeof this.broadcast === 'function') {
        const docs = await this.fetchConnectedParticipants(classId, { includeDisconnected: true })
        this.broadcast({ type: 'participants-updated', classId, participants: docs }, classId)
      }
    } catch (e) { /* ignore */ }
    return { ok: true }
  }

  async handleSubscribe({ classId, sessionId, role = 'student', displayName = null }) {
    if (!classId) throw new Error('classId required')
    // if student, ensure participant record exists and mark connected
    if (sessionId && role === 'student') {
      const pid = `${classId}:${sessionId}`
      const prev = await this.participantsRepo.findOneById(pid)
      const toSet = { lastSeen: new Date(), connected: true }
      if (displayName) toSet.displayName = String(displayName)
      else if (prev && prev.displayName) toSet.displayName = prev.displayName
      else toSet.displayName = `Alumno-${String(sessionId).slice(0,5)}`
      await this.participantsRepo.upsert({ id: pid, ...toSet, classId, sessionId })
      try {
        if (typeof this.broadcast === 'function') {
          const docs = await this.fetchConnectedParticipants(classId)
          this.broadcast({ type: 'participants-updated', classId, participants: docs }, classId)
        }
      } catch (e) { /* ignore */ }
    }
    return { ok: true }
  }

  async handlePing(classId, sessionId) {
    if (!classId || !sessionId) return
    const prev = await this.participantsRepo.findOneByClassSession(classId, sessionId)
    if (!prev || prev.connected !== true) {
      await this.participantsRepo.upsert({ id: `${classId}:${sessionId}`, classId, sessionId, lastSeen: new Date(), connected: true, displayName: (prev && prev.displayName) ? prev.displayName : (`Alumno-${String(sessionId).slice(0,5)}`) })
      try { this.participantLastPersist.set(`${classId}:${sessionId}`, Date.now()) } catch (e) { /* ignore */ }
      try {
        if (typeof this.broadcast === 'function') {
          const docs = await this.fetchConnectedParticipants(classId)
          this.broadcast({ type: 'participants-updated', classId, participants: docs }, classId)
        }
      } catch (e) { /* ignore */ }
    } else {
      try {
        const key = `${classId}:${sessionId}`
        const now = Date.now()
        const last = this.participantLastPersist.get(key) || 0
        if (now - last >= this.minPersistMs) {
          await this.participantsRepo.upsert({ id: `${classId}:${sessionId}`, classId, sessionId, lastSeen: new Date(), connected: true })
          this.participantLastPersist.set(key, now)
        }
      } catch (e) { /* ignore */ }
    }

    // broadcast lightweight heartbeat (throttled)
    try {
      const hbKey = `${classId}:${sessionId}`
      const nowB = Date.now()
      const lastB = this.participantLastBroadcast.get(hbKey) || 0
      if (nowB - lastB >= this.minBroadcastMs) {
        this.participantLastBroadcast.set(hbKey, nowB)
        const displayName = (prev && prev.displayName) ? prev.displayName : `Alumno-${String(sessionId).slice(0,5)}`
        if (typeof this.broadcast === 'function') this.broadcast({ type: 'participant-heartbeat', classId, sessionId, displayName, lastSeen: new Date(), connected: true }, classId)
      }
    } catch (e) { /* ignore */ }
  }

  async handleDisconnect(classId, sessionId) {
    if (!classId || !sessionId) return
    await this.participantsRepo.markDisconnected(classId, sessionId)
    try {
      if (typeof this.broadcast === 'function') {
        this.broadcast({ type: 'participant-disconnected', classId, sessionId }, classId)
        const docs = await this.fetchConnectedParticipants(classId)
        this.broadcast({ type: 'participants-updated', classId, participants: docs }, classId)
      }
    } catch (e) { /* ignore */ }
  try { this.participantLastPersist.delete(`${classId}:${sessionId}`) } catch (e) { /* ignore */ }
  try { this.participantLastBroadcast.delete(`${classId}:${sessionId}`) } catch (e) { /* ignore */ }
  }
}
