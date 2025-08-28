import { describe, it, expect } from 'vitest'
/* eslint-env vitest */
import DiagnosisRepo from '../server/repositories/DiagnosisRepo.js'

function makeFakeCol() {
  const docs = []
  return {
    insertOne: async (d) => { docs.push(d); return { insertedId: 'ok' } },
    find: (q) => ({ toArray: async () => docs.filter(d => { for (const k of Object.keys(q)) if (d[k] !== q[k]) return false; return true }) }),
    deleteMany: async (q) => { const before = docs.length; for (let i = docs.length-1;i>=0;i--) if (docs[i].classId === q.classId) docs.splice(i,1); return { deletedCount: before - docs.length } },
    countDocuments: async (q={}) => docs.filter(d => { for (const k of Object.keys(q)) if (d[k] !== q[k]) return false; return true }).length
  }
}

describe('DiagnosisRepo', () => {
  it('insert and findByClass', async () => {
    const repo = new DiagnosisRepo('diagnosis_results')
    // monkeypatch internal collection with a shared fake instance
    const fake = makeFakeCol()
    repo._col = () => fake
    await repo.insert({ id: '1', classId: 'c1', studentId: 's1' })
    await repo.insert({ id: '2', classId: 'c2', studentId: 's2' })
    const c1 = await repo.findByClass('c1')
    expect(Array.isArray(c1)).toBe(true)
    expect(c1.length).toBe(1)
  })
})
