import assert from 'assert'

export default class ClassService {
  constructor({ classesRepo, answersRepo = null, participantService = null, broadcastService = null, getDefaultMeta = null } = {}) {
    assert(classesRepo, 'classesRepo required')
    this.classesRepo = classesRepo
    // optional injected collaborators
    this.answersRepo = answersRepo
    this.participantService = participantService
    this.broadcastService = broadcastService
    this.getDefaultMeta = getDefaultMeta
  }

  async list(q = {}) {
    return this.classesRepo.find(q)
  }

  async get(id) {
    return this.classesRepo.findById(id)
  }

  async create(payload = {}) {
    if (!payload.id) payload.id = (Math.random().toString(36).substring(2,8).toUpperCase())
    payload.created_at = payload.created_at || new Date()
    await this.classesRepo.upsert(payload)
    return { ok: true, id: payload.id }
  }

  async update(id, updates = {}) {
    return this.classesRepo.update(id, updates)
  }

  async delete(id) {
    return this.classesRepo.deleteById(id)
  }

  async count(q = {}) {
    if (typeof this.classesRepo.count === 'function') return this.classesRepo.count(q)
    return 0
  }

  // Reset class: replace meta with defaultMeta, optionally delete answers, reset participant scores and broadcast updates
  async resetClass(id) {
    // determine default meta from injected helper or empty
    const metaToSet = (typeof this.getDefaultMeta === 'function') ? this.getDefaultMeta() : {}
    await this.update(id, { meta: metaToSet })

    // delete answers if possible
    if (this.answersRepo && typeof this.answersRepo.deleteByClass === 'function') {
      try { await this.answersRepo.deleteByClass(id) } catch (e) { console.warn('ClassService.resetClass: deleteByClass failed', e) }
    }

    // reset participant scores if service exposes resetScores
    if (this.participantService && typeof this.participantService.resetScores === 'function') {
      try { await this.participantService.resetScores(id) } catch (e) { console.warn('ClassService.resetClass: resetScores failed', e) }
    }

    // broadcast class reset and participants updated if possible
    try {
      if (this.broadcastService && typeof this.broadcastService.publish === 'function') {
        const cls = await this.get(id)
        this.broadcastService.publish({ type: 'class-reset', classId: id, class: cls }, id)
        if (this.participantService && typeof this.participantService.fetchConnectedParticipants === 'function') {
          const parts = await this.participantService.fetchConnectedParticipants(id, { includeDisconnected: true })
          this.broadcastService.publish({ type: 'participants-updated', classId: id, participants: parts }, id)
        }
      }
    } catch (e) { console.warn('ClassService.resetClass: broadcast failed', e) }

    return this.get(id)
  }
}
