import React, { useState } from "react";
import { FancyCard, Button } from "../components/ui";
import { BAD_PROMPTS } from "../lib/data";
import { mascotSpeak } from "../components/MascotGuide";

export default function ImprovePrompt({ onScore }) {
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState("");
  const item = BAD_PROMPTS[idx];
  const [checked, setChecked] = useState(false);

  function evaluate() {
    const t = draft.toLowerCase();
    let score = 0;
    if (draft.length >= 60) score++;
    if (/actúa como|actua como|ponte en el rol/i.test(draft)) score++;
    if (/formato|lista|esquema|tabla|párrafos|parrafos/i.test(t)) score++;
    if (/paso a paso|pregúntame|preguntame|si falta información/i.test(t))
      score++;
    if (/nivel|curso|4º|3º|bachillerato|contexto/i.test(t)) score++;
    onScore(score);
    setChecked(true);
    mascotSpeak({
      text: `Te he dado ${score} puntos por tu mejora.`,
      mood: score >= 3 ? "happy" : "neutral",
    });
  }

  return (
    <FancyCard>
      <h2 className="text-xl font-black mb-2">Redacta Mejor</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-semibold text-slate-700">
            Petición pobre (ejemplo)
          </label>
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900">
            {item.bad}
          </div>
          <p className="mt-2 text-xs text-rose-700">Pista: {item.tip}</p>
        </div>
        <div>
          <label className="text-sm font-semibold text-slate-700">
            Tu versión mejorada
          </label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full min-h-[140px] p-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Escribe aquí tu mejor prompt…"
          />
          <div className="mt-2 flex gap-2">
            <Button variant="success" onClick={evaluate}>
              Evaluar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setIdx((i) => (i + 1) % BAD_PROMPTS.length);
                setDraft("");
                setChecked(false);
              }}
            >
              Otro reto
            </Button>
          </div>
          {checked && (
            <p className="mt-2 text-sm text-slate-700">
              Puntos otorgados según heurística.
            </p>
          )}
        </div>
      </div>
    </FancyCard>
  );
}
