import { describe, it, expect, beforeEach } from 'vitest'
import ChallengesRepo from '../server/repositories/ChallengesRepo.js'

function makeFakeCollection() {
  const docs = new Map()
  return {
    async replaceOne(filter, doc, _opts) {
      const id = doc.id || (filter && filter.id)
      if (!id) throw new Error('id required')
      docs.set(id, { ...doc })
      return { acknowledged: true }
    },
    find(q) { return { toArray: async () => Array.from(docs.values()).filter(d => {
      for (const k of Object.keys(q||{})) if (d[k] !== q[k]) return false
      return true
    }) } },
    async findOne(q) {
      for (const v of docs.values()) {
        let ok = true
        for (const k of Object.keys(q || {})) if (v[k] !== q[k]) { ok = false; break }
        if (ok) return v
      }
      return null
    },
    async deleteMany(q) { let removed = 0; for (const [k,v] of Array.from(docs.entries())) { let ok=true; for (const f of Object.keys(q||{})) if (v[f] !== q[f]) { ok=false; break } if (ok) { docs.delete(k); removed++ } } return { deletedCount: removed } },
    async deleteOne(q) { for (const [k,v] of Array.from(docs.entries())) { let ok=true; for (const f of Object.keys(q||{})) if (v[f] !== q[f]) { ok=false; break } if (ok) { docs.delete(k); return { deletedCount:1 } } } return { deletedCount: 0 } },
    async countDocuments(q) { return Array.from(docs.values()).filter(d => { for (const k of Object.keys(q||{})) if (d[k] !== q[k]) return false; return true }).length }
  }
}

describe('ChallengesRepo', () => {
  let fakeCol
  beforeEach(() => { fakeCol = makeFakeCollection(); ChallengesRepo.prototype._col = () => fakeCol })

  it('upsert and findById', async () => {
    const repo = new ChallengesRepo()
    await repo.upsert({ id: 'ch1', classId: 'c1', title: 'Reto 1' })
    const got = await repo.findById('ch1')
    expect(got).toBeTruthy()
    expect(got.title).toBe('Reto 1')
  })

  it('findByClass and deleteByClass', async () => {
    const repo = new ChallengesRepo()
    await repo.upsert({ id: 'a1', classId: 'c1', title: 'A' })
    await repo.upsert({ id: 'a2', classId: 'c1', title: 'B' })
    await repo.upsert({ id: 'b1', classId: 'c2', title: 'C' })
    const forC1 = await repo.findByClass('c1')
    expect(forC1.length).toBe(2)
    await repo.deleteByClass('c1')
    const remaining = await repo.find({})
    expect(remaining.every(d => d.classId !== 'c1')).toBe(true)
  })
})
