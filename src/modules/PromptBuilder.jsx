import React, { useMemo, useState } from 'react'
import { Button } from '../components/ui'
import { Input, Textarea, Select, Number, Toggle, FancyCard } from '../components/ui'
import { toast } from '../components/Toaster'
import { mascotSpeak } from '../components/MascotGuide'

const OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL
const OLLAMA_MODEL = import.meta.env.VITE_OLLAMA_MODEL || 'llama2'

export default function PromptBuilder({ onScore }) {
  const [role, setRole] = useState("");
  const [task, setTask] = useState("");
  const [context, setContext] = useState("");
  const [steps, setSteps] = useState(false);
  const [examples, setExamples] = useState(false);
  const [tone, setTone] = useState("neutral");
  const [format, setFormat] = useState("párrafos claros");
  const [limit, setLimit] = useState(200);
  const [lang, setLang] = useState("español");
  const [scored, setScored] = useState(false);

  const preview = useMemo(() => {
    const lines = [];
    if (role) lines.push(`Actúa como ${role}.`);
    if (task) lines.push(`Tu tarea: ${task}.`);
    if (context) lines.push(`Contexto: ${context}.`);
    lines.push(`Formato de salida: ${format}. Tono: ${tone}. Idioma: ${lang}.`);
    if (steps) lines.push("Explica paso a paso.");
    if (examples) lines.push("Incluye 1-2 ejemplos.");
    lines.push(`Límite aproximado: ${limit} palabras.`);
    return lines.join("\n");
  }, [role, task, context, steps, examples, tone, format, limit, lang]);

  function handleScore() {
    let score = 0;
    if (role) score += 1;
    if (task) score += 2;
    if (context) score += 2;
    if (steps) score += 1;
    if (examples) score += 1;
    if (format) score += 1;
    if (tone && tone !== "neutral") score += 1;
    if (limit >= 100) score += 1;
    if (lang) score += 1;
    if (!scored) { onScore(score); setScored(true); }
  }

  const [ollamaLoading, setOllamaLoading] = useState(false)
  const [ollamaResp, setOllamaResp] = useState('')

  async function tryOllama() {
    if (!OLLAMA_URL) return toast('La URL del servidor de inferencia no está configurada en .env')
    setOllamaResp('')
    setOllamaLoading(true)
    try {
      const res = await fetch(`${OLLAMA_URL.replace(/\/$/, '')}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: OLLAMA_MODEL, prompt: preview })
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Error ${res.status}: ${text}`)
      }
      // Read the body as text and run a robust extraction to get human-readable content
      const text = await res.text()
      const extractText = (obj) => {
        if (obj == null) return ''
        if (typeof obj === 'string') return obj
        if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj)
        if (Array.isArray(obj)) return obj.map(extractText).filter(Boolean).join('\n')
        // look for common keys
        const keys = ['response','text','output','result','reply','message','content']
        for (const k of keys) {
          if (obj[k]) return extractText(obj[k])
        }
        // nested arrays/objects
        for (const v of Object.values(obj)) {
          const got = extractText(v)
          if (got) return got
        }
        return ''
      }

      let final = ''
      // try JSON first
      try {
        const parsed = JSON.parse(text)
        final = extractText(parsed) || (typeof parsed === 'object' ? JSON.stringify(parsed, null, 2) : String(parsed))
      } catch (e) {
        // Not pure JSON — try NDJSON / SSE lines
        const responses = []
        const lines = text.split(/\r?\n/)
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          // SSE "data: {...}"
          if (trimmed.startsWith('data:')) {
            const payload = trimmed.replace(/^data:\s*/, '')
            try {
              const p = JSON.parse(payload)
              const t = extractText(p)
              if (t) responses.push(t)
              continue
            } catch (e) {}
          }
          // try parse line as JSON
          try {
            const p = JSON.parse(trimmed)
            const t = extractText(p)
            if (t) { responses.push(t); continue }
          } catch (e) {}
          // fallback regex for "response": "..."
          const rx = /"response"\s*:\s*"((?:\\.|[^"\\])*)"/g
          let m
          while ((m = rx.exec(trimmed)) !== null) {
            responses.push(m[1].replace(/\\"/g, '"'))
          }
        }
        final = responses.length ? responses.join('') : text
      }
      // Clean up common escaped sequences
      try { final = final.replace(/\\n/g, '\n') } catch {}
      setOllamaResp(final)
      mascotSpeak({ text: 'He generado una respuesta. Puedes revisarla.', mood: 'happy' })
    } catch (err) {
      console.error(err)
  toast('Error al conectar con el servidor de inferencia: ' + (err.message || err))
  setOllamaResp('Error: ' + (err.message || String(err)))
  mascotSpeak({ text: 'No he podido obtener respuesta del servidor.', mood: 'sad' })
    } finally {
      setOllamaLoading(false)
    }
  }

  return (
    <FancyCard>
      <h2 className="text-xl font-black mb-1 flex items-center gap-2">Constructor de Prompts</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <Input label="Rol (p. ej., profesor de historia para 4º ESO)" value={role} setValue={setRole} placeholder="Actúa como…"/>
          <Input label="Tarea" value={task} setValue={setTask} placeholder="Explica, resume, corrige, propone…"/>
          <Textarea label="Contexto" value={context} setValue={setContext} placeholder="Qué sabes ya, objetivo, nivel, requisitos…"/>
        </div>
        <div className="space-y-3">
          <pre className="whitespace-pre-wrap bg-slate-900 text-slate-100 rounded-xl p-4 text-sm min-h-[220px]">{preview}</pre>
          <div className="flex gap-2">
            <Button onClick={() => { navigator.clipboard.writeText(preview); mascotSpeak({ text: 'Prompt copiado al portapapeles', mood: 'cheer' }); try { window.dispatchEvent(new CustomEvent('mascot-bounce')) } catch {} }} variant="primary">Copiar</Button>
            <Button onClick={handleScore} variant="success">Evaluar y sumar puntos</Button>
            <Button onClick={tryOllama} variant="ghost" disabled={!OLLAMA_URL || ollamaLoading}>{ollamaLoading? 'Generando…' : 'Generar respuesta'}</Button>
          </div>
          {OLLAMA_URL ? (
            <div className="mt-3">
              <label className="text-sm font-semibold text-slate-700">Respuesta de la IA</label>
              <pre className="whitespace-pre-wrap bg-slate-50 rounded-xl p-3 text-sm min-h-[80px]">{ollamaResp || (ollamaLoading? 'Esperando respuesta…' : 'Pulsa "Generar respuesta" para ver la respuesta')}</pre>
            </div>
          ) : (
            <p className="mt-2 text-xs text-rose-600">La URL del servidor de inferencia no está configurada. Añade VITE_OLLAMA_URL en tu archivo `.env` (ver README).</p>
          )}
        </div>
      </div>
    </FancyCard>
  )
}
