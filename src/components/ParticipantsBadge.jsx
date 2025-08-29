import React from 'react'
import { Button } from './ui'

export default function ParticipantsBadge({ score = 0, onShow }) {
  return (
    <div className="flex items-center gap-3 mt-2 justify-center">
      <div className="text-sm opacity-60">Puntos:</div>
      <div className="font-mono text-lg font-semibold">{score}</div>
      <Button variant="ghost" onClick={onShow}>Mostrar puntuación</Button>
    </div>
  )
}
