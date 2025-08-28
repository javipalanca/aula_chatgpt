import { describe, it, expect, beforeEach } from 'vitest'
import AnswersRepo from '../server/repositories/AnswersRepo.js'

function makeFakeCollection() {
  const docs = new Map()
  return {
    async replaceOne(filter, doc, _opts) {
      const id = doc.id || (filter && filter.id)
      if (!id) throw new Error('id required')
      docs.set(id, { ...doc })
      return { acknowledged: true }
    },
    find(q) {
      const out = []
      for (const v of docs.values()) {
        let ok = true
        for (const k of Object.keys(q || {})) if (v[k] !== q[k]) { ok = false; break }
        if (ok) out.push(v)
      }
      return { toArray: async () => out }
    },
    async findOne(q) {
      for (const v of docs.values()) {
        let ok = true
        for (const k of Object.keys(q || {})) if (v[k] !== q[k]) { ok = false; break }
        if (ok) return v
      }
      return null
    },
    async deleteMany(q) {
      let removed = 0
      for (const [k,v] of Array.from(docs.entries())) {
        let ok = true
        for (const f of Object.keys(q || {})) if (v[f] !== q[f]) { ok = false; break }
        if (ok) { docs.delete(k); removed++ }
      }
      return { deletedCount: removed }
    },
    async countDocuments() { return docs.size }
  }
}

describe('AnswersRepo', () => {
  let fakeCol
  beforeEach(() => {
    fakeCol = makeFakeCollection()
    AnswersRepo.prototype._col = () => fakeCol
  })

  it('upsert stores an answer and requires id', async () => {
    const repo = new AnswersRepo()
    const doc = { id: 'c1:s1:q1', classId: 'c1', sessionId: 's1', questionId: 'q1', answer: 'A' }
    await expect(repo.upsert(doc)).resolves.toBeTruthy()
    const found = await fakeCol.findOne({ id: doc.id })
    expect(found).toBeTruthy()
    expect(found.answer).toBe('A')
  })

  it('findByClassQuestion returns answers for class+question', async () => {
    const repo = new AnswersRepo()
    await repo.upsert({ id: 'x:1:q', classId: 'x', sessionId: '1', questionId: 'q', answer: 'yes' })
    await repo.upsert({ id: 'x:2:q', classId: 'x', sessionId: '2', questionId: 'q', answer: 'no' })
    await repo.upsert({ id: 'y:1:q', classId: 'y', sessionId: '1', questionId: 'q', answer: 'x' })
    const docs = await repo.findByClassQuestion('x', 'q')
    expect(Array.isArray(docs)).toBe(true)
    expect(docs.length).toBe(2)
  })

  it('findById returns single doc', async () => {
    const repo = new AnswersRepo()
    await repo.upsert({ id: 'one', classId: 'c', sessionId: 's', questionId: 'q', answer: 'ok' })
    const got = await repo.findById('one')
    expect(got).toBeTruthy()
    expect(got.id).toBe('one')
  })

  it('deleteByClass removes class answers', async () => {
    const repo = new AnswersRepo()
    await repo.upsert({ id: 'c1:1:q', classId: 'c1', sessionId: '1', questionId: 'q', answer: 'a' })
    await repo.upsert({ id: 'c1:2:q', classId: 'c1', sessionId: '2', questionId: 'q', answer: 'b' })
    await repo.upsert({ id: 'c2:1:q', classId: 'c2', sessionId: '1', questionId: 'q', answer: 'c' })
    await repo.deleteByClass('c1')
    const remaining = await fakeCol.find({}).toArray()
    expect(remaining.every(d => d.classId !== 'c1')).toBe(true)
  })
})
