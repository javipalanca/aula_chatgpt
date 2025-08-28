import { describe, it, expect, beforeEach } from 'vitest'
import ParticipantsRepo from '../server/repositories/ParticipantsRepo.js'

// Fake in-memory collection to mock MongoDB behavior needed by ParticipantsRepo
function makeFakeCollection() {
  const docs = new Map()
  return {
  async replaceOne(filter, doc, _opts) {
      const id = doc.id || (filter && filter.id)
      if (!id) throw new Error('id required')
      docs.set(id, { ...doc })
      return { acknowledged: true }
    },
  async updateOne(filter, update, _opts) {
      // find by classId+sessionId or id
      let found = null
      if (filter.id) found = docs.get(filter.id)
      else {
        for (const v of docs.values()) {
          if (filter.classId && filter.sessionId && v.classId === filter.classId && v.sessionId === filter.sessionId) { found = v; break }
        }
      }
      if (!found) {
    if (_opts && _opts.upsert) {
          const newId = filter.id || `${filter.classId || 'nc'}:${filter.sessionId || 'ns'}`
          const base = { id: newId, classId: filter.classId, sessionId: filter.sessionId, score: 0 }
          docs.set(newId, base)
          found = docs.get(newId)
        } else return { matchedCount: 0 }
      }
      // apply simple $inc and $set
      if (update.$inc) {
        for (const k of Object.keys(update.$inc)) {
          found[k] = (found[k] || 0) + Number(update.$inc[k] || 0)
        }
      }
      if (update.$set) {
        for (const k of Object.keys(update.$set)) found[k] = update.$set[k]
      }
      return { matchedCount: 1 }
    },
    async find(q) {
      const arr = []
      for (const v of docs.values()) {
        let ok = true
        for (const k of Object.keys(q)) {
          if (v[k] !== q[k]) { ok = false; break }
        }
        if (ok) arr.push(v)
      }
      return { toArray: async () => arr }
    },
    async findOne(q) {
      for (const v of docs.values()) {
        let ok = true
        for (const k of Object.keys(q)) { if (v[k] !== q[k]) { ok = false; break } }
        if (ok) return v
      }
      return null
    },
    async updateMany(q, update) {
      let count = 0
  for (const [,v] of docs.entries()) {
        let ok = true
        for (const f of Object.keys(q)) if (v[f] !== q[f]) { ok = false; break }
        if (!ok) continue
        if (update.$set) {
          for (const s of Object.keys(update.$set)) v[s] = update.$set[s]
        }
        count++
      }
      return { matchedCount: count }
    },
    async countDocuments() { return docs.size },
    async deleteMany(q) {
      let removed = 0
      for (const [k,v] of Array.from(docs.entries())) {
        let ok = true
        for (const f of Object.keys(q)) if (v[f] !== q[f]) { ok = false; break }
        if (ok) { docs.delete(k); removed++ }
      }
      return { deletedCount: removed }
    }
  }
}

describe('ParticipantsRepo', () => {
  let fakeCol
  beforeEach(() => {
    fakeCol = makeFakeCollection()
  // stub module getCollection used by ParticipantsRepo by patching its prototype _col
  // Monkeypatch ParticipantsRepo.prototype._col to return fakeCol
    ParticipantsRepo.prototype._col = () => fakeCol
  })

  it('upsert stores a document and requires id', async () => {
    const repo = new ParticipantsRepo()
    await expect(repo.upsert({ id: 'c1:ses1', classId: 'c1', sessionId: 'ses1', displayName: 'A' })).resolves.toBeTruthy()
    const found = await fakeCol.findOne({ id: 'c1:ses1' })
    expect(found).toBeTruthy()
    expect(found.displayName).toBe('A')
  })

  it('incScore increments score atomically and sets lastSeen', async () => {
    const repo = new ParticipantsRepo()
    await repo.incScore('classA', 's1', 10)
    let p = await fakeCol.findOne({ classId: 'classA', sessionId: 's1' })
    expect(p).toBeTruthy()
    expect(p.score).toBe(10)
    // increment again
    await repo.incScore('classA', 's1', 5)
    p = await fakeCol.findOne({ classId: 'classA', sessionId: 's1' })
    expect(p.score).toBe(15)
    expect(p.lastSeen).toBeTruthy()
  })

  it('listConnected filters by connected flag', async () => {
    const repo = new ParticipantsRepo()
    await repo.upsert({ id: 'x:1', classId: 'x', sessionId: '1', displayName: 'one', score: 2, lastSeen: new Date(), connected: true })
    await repo.upsert({ id: 'x:2', classId: 'x', sessionId: '2', displayName: 'two', score: 3, lastSeen: new Date(), connected: false })
    const onlyConnected = await repo.listConnected('x', { includeDisconnected: false })
    expect(Array.isArray(onlyConnected)).toBe(true)
    expect(onlyConnected.length).toBe(1)
    const all = await repo.listConnected('x', { includeDisconnected: true })
    expect(all.length).toBe(2)
  })

  it('resetScores sets score to 0 for class', async () => {
    const repo = new ParticipantsRepo()
    await repo.upsert({ id: 'r:1', classId: 'r', sessionId: '1', displayName: 'r1', score: 50 })
    await repo.upsert({ id: 'r:2', classId: 'r', sessionId: '2', displayName: 'r2', score: 30 })
    await repo.resetScores('r')
  const all = await repo.listConnected('r', { includeDisconnected: true })
  expect(all.every(p => p.score === 0)).toBe(true)
  })
})
