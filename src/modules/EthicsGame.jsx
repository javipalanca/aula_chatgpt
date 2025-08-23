import React, { useState } from 'react'
import { FancyCard, Pill, Button } from '../components/ui'
import { ETHICS_SCENARIOS } from '../lib/data'

export default function EthicsGame({ onScore }) {
  const [i, setI] = useState(0);
  const [right, setRight] = useState(0);
  const [finished, setFinished] = useState(false);

  function answer(val) {
    const sc = ETHICS_SCENARIOS[i];
    const ok = sc.good === val;
    if (ok) setRight((r) => r + 1);
    const next = i + 1;
    if (next >= ETHICS_SCENARIOS.length) {
      setFinished(true);
      onScore(right + (ok ? 1 : 0));
    } else setI(next);
  }

  if (finished) return (
    <FancyCard>
      <h2 className="text-xl font-black mb-2">Ética y Seguridad</h2>
      <p>¡Has acertado {right} de {ETHICS_SCENARIOS.length}!</p>
    </FancyCard>
  )

  const sc = ETHICS_SCENARIOS[i];
  return (
    <FancyCard>
      <h2 className="text-xl font-black mb-2">Ética y Seguridad</h2>
      <div className="flex items-center justify-between mb-2">
        <Pill tone="amber">Pregunta {i+1} / {ETHICS_SCENARIOS.length}</Pill>
        <Pill tone="purple">Aciertos: {right}</Pill>
      </div>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-lg font-medium">{sc.text}</div>
      <div className="mt-4 flex gap-3">
        <Button onClick={() => answer(true)} variant="success">Adecuado</Button>
        <Button onClick={() => answer(false)} variant="danger">No adecuado</Button>
      </div>
    </FancyCard>
  )
}
