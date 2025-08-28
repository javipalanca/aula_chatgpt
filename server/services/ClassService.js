import assert from 'assert'

export default class ClassService {
  constructor({ classesRepo } = {}) {
    assert(classesRepo, 'classesRepo required')
    this.classesRepo = classesRepo
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
}
