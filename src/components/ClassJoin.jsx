import React, { useState } from 'react'
import { FancyCard, Button, Input } from './ui'
import { joinClass } from '../lib/storage'
import { toast } from './Toaster'

export default function ClassJoin({ onJoined, onClose }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')

  async function handleJoin() {
    try {
      const p = await joinClass(code.trim().toUpperCase(), name || undefined, password || null)
      toast('Unido a la clase ' + (code||''))
      if (onJoined) onJoined({ classCode: code.trim().toUpperCase(), participant: p })
    } catch (e) {
      toast('No se pudo unir: ' + (e.message || e))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => onClose && onClose()} />
      <FancyCard>
        <div className="flex items-start justify-between">
          <h3 className="font-bold mb-2">Unirse a clase</h3>
          <button aria-label="Cerrar" className="text-slate-500 ml-2" onClick={() => onClose && onClose()}>✕</button>
        </div>
        <div className="space-y-2">
          <Input label="Código de clase" value={code} setValue={(v)=>setCode(v)} placeholder="Ej: ABC123" />
          <Input label="Tu nombre" value={name} setValue={(v)=>setName(v)} placeholder="Nombre que verán el profe" />
          <Input label="Contraseña (si la clase la tiene)" value={password} setValue={(v)=>setPassword(v)} placeholder="Contraseña" />
          <div className="flex gap-2">
            <Button onClick={handleJoin} variant="primary">Unirse</Button>
          </div>
        </div>
      </FancyCard>
    </div>
  )
}
