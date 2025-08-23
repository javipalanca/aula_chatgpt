import React, { useMemo, useState } from 'react'
import { Button } from '../components/ui'
import { Input, Textarea, Select, Number, Toggle, FancyCard } from '../components/ui'

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
            <Button onClick={() => { navigator.clipboard.writeText(preview); }} variant="primary">Copiar</Button>
            <Button onClick={handleScore} variant="success">Evaluar y sumar puntos</Button>
          </div>
        </div>
      </div>
    </FancyCard>
  )
}
