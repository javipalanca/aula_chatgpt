import React, { useState } from 'react'
import { FancyCard, Button, clsx } from '../components/ui'
import { VERIF_QUIZ } from '../lib/data'

export default function VerifyQuiz({ onScore }) {
  const [answers, setAnswers] = useState(Array(VERIF_QUIZ.length).fill(null));
  const [done, setDone] = useState(false);

  function set(i, v) { const copy = [...answers]; copy[i] = v; setAnswers(copy); }
  function finish() { let score = 0; answers.forEach((a,i)=>{ if (a===VERIF_QUIZ[i].a) score++; }); setDone(true); onScore(score); }

  return (
    <FancyCard>
      <h2 className="text-xl font-black mb-2">Verificación de Fuentes</h2>
      <ol className="space-y-4">
        {VERIF_QUIZ.map((q,i)=> (
          <li key={i} className="p-3 rounded-xl border border-slate-200">
            <p className="font-semibold mb-2">{i+1}. {q.q}</p>
            <div className="grid gap-2">
              {q.options.map((op,j)=> (
                <label key={j} className={clsx('flex items-start gap-2 p-2 rounded-xl border', answers[i]===j? 'border-blue-600 bg-blue-50':'border-slate-200')}> 
                  <input type="radio" name={`q${i}`} className="mt-1" checked={answers[i]===j} onChange={()=>set(i,j)} />
                  <span className="text-sm">{op}</span>
                </label>
              ))}
            </div>
            {done && (
              <p className={clsx('mt-2 text-sm', answers[i]===q.a? 'text-green-700':'text-rose-700')}>{answers[i]===q.a? '✔️ Correcto' : '✖️ Incorrecto'} — {q.explain}</p>
            )}
          </li>
        ))}
      </ol>
      <div className="mt-4 flex gap-2">
        {!done ? <Button onClick={finish} variant="primary">Corregir</Button> : <Button onClick={()=>{ setAnswers(Array(VERIF_QUIZ.length).fill(null)); setDone(false); }} variant="ghost">Reiniciar</Button>}
      </div>
    </FancyCard>
  )
}
