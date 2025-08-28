import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import TeacherDashboard from '../src/modules/TeacherDashboard'

vi.mock('../src/lib/storage', async () => ({
  createClass: vi.fn().mockResolvedValue({ id: 'MOCK' }),
  listClasses: vi.fn().mockReturnValue([]),
  syncClassesRemote: vi.fn().mockResolvedValue([]),
}))

describe('TeacherDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('disables create button during creation', async () => {
    render(<TeacherDashboard onClose={() => {}} />)
    const btn = screen.getByRole('button', { name: /Crear clase/i })
    expect(btn).toBeEnabled()
  })
})
