import React from 'react'
import { vi, describe, test, expect } from 'vitest'
import '@testing-library/jest-dom'
import { render, fireEvent } from '@testing-library/react'
import OptionsList from '../src/components/OptionsList'

describe('OptionsList', () => {
  test('renders options and calls onChoose when clicked', () => {
    const opts = ['A', 'B', 'C']
  const handle = vi.fn()
    const { getByText } = render(<OptionsList options={opts} onChoose={handle} hasAnswered={false} />)

    const btnB = getByText('B')
    fireEvent.click(btnB)
    expect(handle).toHaveBeenCalledWith('B')
  })

  test('disables buttons after reveal and shows correct styling', () => {
    const opts = ['1', '2']
  const handle = vi.fn()
    const { getByText } = render(<OptionsList options={opts} onChoose={handle} hasAnswered={true} correctAnswer={'2'} userAnswer={'1'} />)

    const btn1 = getByText('1')
    expect(btn1).toBeDisabled()
    // clicking should not trigger when disabled
    fireEvent.click(btn1)
    expect(handle).not.toHaveBeenCalled()
  })
})
