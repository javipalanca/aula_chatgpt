import React from 'react'
import { clsx } from './ui'

/**
 * OptionsList - presentational component for rendering options with reveal states
 * props:
 * - options: array
 * - userAnswer: current user's selected answer
 * - correctAnswer: value or null
 * - hasAnswered: bool
 * - onChoose(option)
 */
export default function OptionsList({ options = [], userAnswer, correctAnswer, hasAnswered, onChoose, revealed = undefined }) {
  // Determine if the UI should be in revealed state. Prefer an explicit
  // `revealed` prop (if provided). If it's not provided, treat presence of
  // `correctAnswer` as the signal that the question has been revealed.
  const isRevealed = (typeof revealed === 'boolean' ? revealed : (typeof correctAnswer !== 'undefined' && correctAnswer !== null))

  return (
    <div className="grid gap-3 mb-6">
      {options.map((opt, i) => {
        // Use isRevealed consistently below instead of the raw `revealed` prop
        const isCorrect = isRevealed && String(correctAnswer) === String(opt)
        const isUserChoice = userAnswer === opt
        const isWrong = isRevealed && isUserChoice && !isCorrect
        const isPending = !isRevealed && isUserChoice && hasAnswered

        return (
          <button
            key={i}
            disabled={isRevealed}
            onClick={() => onChoose && onChoose(opt)}
            className={clsx(
              'p-4 rounded text-left transition',
              isPending ? 'bg-yellow-400 text-black' : isRevealed ? 'opacity-90' : 'hover:opacity-95 cursor-pointer',
              isRevealed ? (isCorrect ? 'bg-green-600 text-white' : isWrong ? 'bg-red-600 text-white' : 'bg-white/5') : (!isPending ? 'bg-white/5' : '')
            )}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}
