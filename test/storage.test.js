import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as storage from '../src/lib/storage'

describe('storage.createClass', () => {
  beforeEach(()=> {
    vi.restoreAllMocks()
  })

  it('creates a class successfully (mocked fetch)', async () => {
    const fakeResp = { ok: true, json: async () => ({ id: 'MOCK1' }) }
  globalThis.fetch = vi.fn().mockResolvedValue(fakeResp)
    const cls = await storage.createClass({ name: 'X', teacherName: 'Y' })
    expect(cls).toBeTruthy()
    expect(cls.code).toBe('MOCK1')
  expect(globalThis.fetch).toHaveBeenCalled()
  })

  it('retries on failure and eventually throws', async () => {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'))
  await expect(storage.createClass({})).rejects.toThrow()
  expect(globalThis.fetch).toHaveBeenCalled()
  })
})
