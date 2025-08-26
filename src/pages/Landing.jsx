import React, { useState } from 'react'
import { Button } from '../components/ui'

const TEACHER_PWD = import.meta.env.VITE_TEACHER_PASSWORD || ''

export default function Landing({ onEnterTeacher, onJoinStudent }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-3xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black">Aula en vivo</h1>
          <p className="mt-2 text-slate-600">Elige cómo entrar: como docente para controlar la sesión o como alumno para unirte a la clase y responder preguntas que lance el profesor.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-6 rounded-xl border bg-white">
            <h2 className="text-xl font-semibold mb-3">Entrar como docente</h2>
            <p className="text-sm text-slate-600 mb-4">Accede al panel de control de docente para seleccionar una clase y lanzar preguntas secuencialmente.</p>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => {
                if (!TEACHER_PWD) { alert('Modo docente no configurado. Añade VITE_TEACHER_PASSWORD en .env'); return }
                const v = prompt('Contraseña de docente')
                if (v === null) return // cancelled
                if (v === TEACHER_PWD) return onEnterTeacher()
                alert('Contraseña incorrecta')
              }}>Entrar como docente</Button>
            </div>
          </div>

          <div className="p-6 rounded-xl border bg-white">
            <h2 className="text-xl font-semibold mb-3">Unirse a clase (alumno)</h2>
            <p className="text-sm text-slate-600 mb-4">Introduce el código de la clase y tu nombre. Cuando el profesor lance preguntas se mostrarán automáticamente en tu pantalla.</p>
            <div className="flex flex-col gap-2">
              <input className="rounded border px-3 py-2" placeholder="Código de clase" value={code} onChange={(e)=>setCode(e.target.value.toUpperCase())} />
              <input className="rounded border px-3 py-2" placeholder="Tu nombre" value={name} onChange={(e)=>setName(e.target.value)} />
              <div className="flex gap-2 mt-2">
                <Button variant="primary" onClick={() => onJoinStudent(code, name)}>Unirse</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
