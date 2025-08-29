import React from 'react'
import { Button } from './ui'

export default function PromptEditor({ promptText, onChange, onSubmit, onClear, instructions, template, disabled, submittedPrompt }) {
  return (
    <div className="mb-6">
      <div className="mb-3 p-3 rounded border border-slate-700 bg-white/5 text-left">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm font-semibold">Instrucciones para esta pregunta</div>
            <div className="text-xs opacity-75 mt-1">{instructions || 'Redacta un prompt claro incluyendo: rol, objetivo, contexto y formato.'}</div>
          </div>
          <div className="ml-3">
            <button className="text-sm px-2 py-1 rounded bg-slate-700/30 hover:bg-slate-700/40" onClick={() => {
              try { navigator.clipboard.writeText(template || instructions || '') } catch(e) { /* ignore */ }
              onChange && onChange(template || instructions || '')
            }}>Copiar plantilla</button>
          </div>
        </div>
      </div>

      <div className="text-left mb-2 text-sm opacity-70">Respuesta (puedes escribir un prompt completo):</div>
      <textarea value={promptText} onChange={e => onChange && onChange(e.target.value)} rows={6} className="w-full p-3 rounded bg-white/5 text-white mb-2" placeholder="Escribe tu respuesta o prompt aqui..." disabled={disabled} />
      <div className="flex gap-2 justify-center">
        <Button onClick={onSubmit} disabled={disabled || !promptText.trim()}>Enviar</Button>
        <Button variant="ghost" onClick={onClear} disabled={disabled}>Borrar</Button>
      </div>

      {submittedPrompt && (
        <div className="mt-3 text-sm opacity-70 text-left">Tu envío: <div className="mt-1 p-2 rounded bg-white/5">{submittedPrompt}</div></div>
      )}
    </div>
  )
}
