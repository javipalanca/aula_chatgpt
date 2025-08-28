import { describe, it, expect } from 'vitest'
/* eslint-env vitest */
import SettingsRepo from '../server/repositories/SettingsRepo.js'

function makeFakeCol() {
  const docs = []
  return {
    findOne: async (q) => docs.find(d => d.id === q.id) || null,
  replaceOne: async (q, doc, _opts) => { const i = docs.findIndex(d => d.id === q.id); if (i === -1) docs.push(doc); else docs[i] = doc; return { upsertedId: 'ok' } },
    countDocuments: async (q={}) => docs.filter(d => { for (const k of Object.keys(q)) if (d[k] !== q[k]) return false; return true }).length
  }
}

describe('SettingsRepo', () => {
  it('upsert and findById', async () => {
    const repo = new SettingsRepo('settings')
    const fake = makeFakeCol()
    repo._col = () => fake
    await repo.upsert({ id: 's1', data: { a: 1 } })
    const d = await repo.findById('s1')
    expect(d).not.toBeNull()
    expect(d.data.a).toBe(1)
  })
})
