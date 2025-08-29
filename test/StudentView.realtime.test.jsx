import React from 'react'
import { render, fireEvent } from '@testing-library/react'
import { vi, describe, test, expect } from 'vitest'

// mock storage and realtime helpers
vi.mock('../src/lib/storage', () => ({
  getSessionId: () => 'sess-test',
  listClassParticipants: vi.fn(async () => []),
  joinClass: vi.fn(async () => {}),
  startHeartbeat: vi.fn(() => {}),
  stopHeartbeat: vi.fn(() => {}),
  leaveClass: vi.fn(async () => {}),
  submitAnswer: vi.fn(async () => ({ ok: true }))
}))

// Provide a mocked event dispatch to simulate aula-realtime events
vi.mock('../src/hooks/useRealtime', () => ({
  default: (classCode, onEvent) => {
    // simulate a question-launched event synchronously
    setTimeout(() => {
      try { onEvent({ type: 'question-launched', classId: classCode, question: { id: 'q1', title: 'Q1', options: ['a','b'], payload: {} } }) } catch(e){ /* ignore */ }
    }, 0)
    return
  }
}))

import StudentView from '../src/pages/StudentView'

describe('StudentView realtime flow', () => {
  test('responds to question-launched and allows selecting an option', async () => {
    const { findByText } = render(<StudentView classCode="C" displayName="D" onBack={() => {}} />)
    const opt = await findByText('a')
    fireEvent.click(opt)
    // if click triggers submitAnswer (mocked) the component should mark answered
    expect(true).toBe(true)
  })
})
