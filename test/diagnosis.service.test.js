import { describe, it, expect, beforeEach, vi } from 'vitest'
import DiagnosisService from '../server/services/DiagnosisService.js'

describe('DiagnosisService', () => {
  let diagnosisRepo
  let svc

  beforeEach(() => {
    diagnosisRepo = {
      insert: vi.fn().mockResolvedValue({ insertedId: 'iid' }),
      find: vi.fn().mockResolvedValue([])
    }
    svc = new DiagnosisService({ diagnosisRepo, ollamaUrl: 'http://ollama.local', ollamaModel: 'm' })
  })

  it('saveResult calls repo.insert and returns id', async () => {
    const payload = { id: 'd1', classId: 'C1', studentId: 's1' }
    const res = await svc.saveResult(payload)
    expect(diagnosisRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }))
    expect(res.ok).toBe(true)
    expect(res.id).toBeDefined()
  })

  it('listResults delegates to repo.find', async () => {
    diagnosisRepo.find.mockResolvedValue([{ id: 'x' }])
    const docs = await svc.listResults('C1')
    expect(diagnosisRepo.find).toHaveBeenCalledWith({ classId: 'C1' })
    expect(docs).toEqual([{ id: 'x' }])
  })

  it('generatePrompts calls Ollama and parses JSON', async () => {
    // stub global fetch to simulate Ollama response
    vi.stubGlobal('fetch', async (_url, _opts) => ({ ok: true, status: 200, text: async () => JSON.stringify([{ id: 'p1', prompt: 'uno' }]) }))
    const out = await svc.generatePrompts()
    expect(Array.isArray(out)).toBe(true)
    expect(out[0]).toHaveProperty('id', 'p1')
    vi.unstubAllGlobals()
  })
})
