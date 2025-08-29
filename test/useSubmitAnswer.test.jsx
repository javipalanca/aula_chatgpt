import React from 'react'
import { vi, describe, test, expect } from 'vitest'
import { render, act } from '@testing-library/react'
import useSubmitAnswer from '../src/hooks/useSubmitAnswer'
import * as storage from '../src/lib/storage'

vi.mock('../src/lib/storage')

describe('useSubmitAnswer', () => {
  test('dedupes concurrent submits for same key', async () => {
    const fakeRes = { ok: true }
    let calls = 0
    storage.submitAnswer.mockImplementation(async () => { calls += 1; await new Promise(res => setTimeout(res, 20)); return fakeRes })

    let hookApi = null
    function TestComp() {
      hookApi = useSubmitAnswer()
      return null
    }

    render(<TestComp />)

    // call submit twice before the first resolves
    let r1, r2
    await act(async () => {
      const p1 = hookApi.submitAnswer('C', 'S', 'Q', 'ans')
      const p2 = hookApi.submitAnswer('C', 'S', 'Q', 'ans')
      const all = await Promise.all([p1, p2])
      r1 = all[0]
      r2 = all[1]
    })

    expect(r1).toEqual(fakeRes)
    expect(r2).toEqual(fakeRes)
    expect(calls).toBe(1)
  })
})
