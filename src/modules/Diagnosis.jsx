import React, { useState } from 'react'
import { FancyCard, Button, clsx } from '../components/ui'
import DiagnosisBoss from './DiagnosisBoss'
import { RED_FLAGS_SAMPLE } from '../lib/data'
import { CheckCircle2, XCircle } from 'lucide-react'
import { mascotSpeak } from '../components/MascotGuide'

export default function Diagnosis({ onScore }) {
  const [selected, setSelected] = useState([]);
  const [checked, setChecked] = useState(false);
  const correctSet = new Set(RED_FLAGS_SAMPLE.correct);
  const [bossOpen, setBossOpen] = useState(false)

  function toggle(id) { setSelected((arr)=> arr.includes(id)? arr.filter(x=>x!==id) : [...arr, id]); }
  function finish() {
    let ok = selected.length === RED_FLAGS_SAMPLE.correct.length;
    if (ok) for (const id of selected) if (!correctSet.has(id)) ok = false;
    setChecked(true); onScore(ok);
  mascotSpeak({ text: ok ? 'Excelente diagnóstico.' : 'Casi, revisa las señales de alerta.', mood: ok ? 'cheer' : 'sad' })
  }

  return (
    <FancyCard>
      <h2 className="text-xl font-black mb-2">Diagnóstico de Respuestas</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-semibold text-slate-700">Respuesta simulada</label>
          <div className="p-3 rounded-xl bg-slate-900 text-slate-100 text-sm">{RED_FLAGS_SAMPLE.answer}</div>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700">Señales de alerta</label>
          <div className="grid gap-2">
            {RED_FLAGS_SAMPLE.checks.map((c)=> (
              <label key={c.id} className={clsx('flex items-start gap-2 p-2 rounded-xl border', selected.includes(c.id)? 'border-blue-600 bg-blue-50' : 'border-slate-200')}> 
                <input type="checkbox" checked={selected.includes(c.id)} onChange={()=>toggle(c.id)} className="mt-1"/>
                <span className="text-sm">{c.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Button variant="primary" onClick={finish}>Corregir</Button>
            <Button variant="ghost" onClick={()=>{ setSelected([]); setChecked(false); }}>Reiniciar</Button>
          </div>
          {checked && (
            <p className="mt-2 text-sm">{selected.sort().join(', ')===RED_FLAGS_SAMPLE.correct.sort().join(', ')? (
              <span className="text-green-700 font-semibold flex items-center gap-2"><CheckCircle2/> ¡Bien visto!</span>
            ) : (
              <span className="text-rose-700 font-semibold flex items-center gap-2"><XCircle/> Casi. Pista: hay elementos inventados y falta verificación.</span>
            )}</p>
          )}
        </div>
      </div>
      <div className="mt-4">
        <Button variant="primary" onClick={()=> setBossOpen(true)}>Iniciar Boss Fight</Button>
        {bossOpen && <div className="mt-4"><DiagnosisBoss onFinishAll={(results)=> { console.log('boss results', results); setBossOpen(false); }} /></div>}
      </div>
    </FancyCard>
  )
}
