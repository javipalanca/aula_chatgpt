import React, { useEffect, useState } from "react";
import { FancyCard, Button } from "../components/ui";
import { getApiBase } from "../lib/storage";

function Timer({ seconds, running, onFinish }) {
  const [t, setT] = useState(seconds);
  useEffect(() => {
    if (!running) return;
    setT(seconds);
    const id = setInterval(
      () =>
        setT((s) => {
          if (s <= 1) {
            clearInterval(id);
            onFinish();
            return 0;
          }
          return s - 1;
        }),
      1000,
    );
    return () => clearInterval(id);
  }, [running]);
  return <div className="text-xl font-mono">{t}s</div>;
}

export default function DiagnosisBoss({ onFinishAll }) {
  const API_BASE = getApiBase();
  const [stage, setStage] = useState(0);
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    setLoading(true);
    try {
      const mockItems = [
        {
          id: "b1",
          prompt:
            "Detecta el bulo: Lee la siguiente respuesta y enumera por qué es dudosa.",
        },
        {
          id: "b2",
          prompt:
            "Prompt Golf: Escribe el prompt más corto que pida una lista con 3 pasos para verificar una fuente.",
        },
        {
          id: "b3",
          prompt:
            "Re-pregunta: Formula dos preguntas que ayuden a clarificar una afirmación ambigua.",
        },
      ];

      const r = await fetch((API_BASE || "") + "/api/diagnosis/generate");
      const text = await r.text();
      const trimmed = text.trim();
      // quick heuristic: if response looks like HTML (error page), fallback to mock
      if (
        trimmed.startsWith("<") ||
        trimmed.toLowerCase().includes("<!doctype")
      ) {
        console.warn("diagnosis generate returned HTML, using mock items");
        setItems(mockItems);
        setLoading(false);
        return;
      }
      if (!r.ok) {
        console.warn(
          "diagnosis generate failed status",
          r.status,
          "body:",
          text.slice(0, 200),
        );
        setItems([]);
      } else {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) {
            setItems(parsed);
          } else if (
            parsed &&
            Array.isArray(parsed.results) &&
            parsed.results[0] &&
            parsed.results[0].content
          ) {
            try {
              const inner = JSON.parse(parsed.results[0].content);
              if (Array.isArray(inner)) setItems(inner);
              else setItems([]);
            } catch (e) {
              console.warn("inner parse failed", e);
              setItems([]);
            }
          } else {
            // attempt to find JSON array substring
            const start = text.indexOf("[");
            const end = text.lastIndexOf("]");
            if (start !== -1 && end !== -1 && end > start) {
              try {
                const maybe = JSON.parse(text.substring(start, end + 1));
                if (Array.isArray(maybe)) setItems(maybe);
                else setItems([]);
              } catch (e) {
                console.warn("substring parse failed", e);
                setItems([]);
              }
            } else {
              console.warn(
                "diagnosis generate returned non-JSON, using mock:",
                text.slice(0, 200),
              );
              setItems(mockItems);
            }
          }
        } catch (errJson) {
          console.warn("failed to parse JSON from text, using mock", errJson);
          setItems(mockItems);
        }
      }
    } catch (e) {
      console.warn("failed gen", e);
      setItems([]);
    }
    setLoading(false);
  }

  function startStage() {
    setRunning(true);
  }

  function finishStage(result) {
    setRunning(false);
    setAnswers((a) => ({ ...a, [stage]: result }));
    (async () => {
      // send to server validation depending on stage
      try {
        const url =
          (API_BASE || "") +
          (stage === 0
            ? "/api/diagnosis/validate-bulo"
            : stage === 1
              ? "/api/diagnosis/validate-prompt"
              : "/api/diagnosis/validate-repregunta");
        const payload =
          stage === 0
            ? { answer: result.resp }
            : stage === 1
              ? { promptText: result.resp }
              : {
                  questions: result.resp ? result.resp.split("\n") : [],
                  original: items[stage]?.prompt,
                };
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await r.json();
        setAnswers((a) => ({
          ...a,
          [stage]: { ...a[stage], validated: data },
        }));
      } catch (e) {
        setAnswers((a) => ({
          ...a,
          [stage]: { ...a[stage], validated: { ok: false, error: String(e) } },
        }));
      }
      if (stage < 2) setStage((s) => s + 1);
      else {
        const final = {
          answers: { ...answers, [stage]: result },
          completed_at: new Date().toISOString(),
        };
        try {
          fetch((API_BASE || "") + "/api/diagnosis/results", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(final),
          });
        } catch (e) {
          console.warn("persist result failed", e);
        }
        onFinishAll && onFinishAll(answers);
      }
    })();
  }

  if (loading)
    return (
      <FancyCard>
        <h3>Cargando diagnóstico...</h3>
      </FancyCard>
    );
  const item = items[stage];
  return (
    <FancyCard>
      <h2 className="text-xl font-bold mb-2">
        Boss Fight diagnóstico ({stage + 1}/3)
      </h2>
      {item ? (
        <div>
          <div className="mb-4">{item.prompt}</div>
          <div className="mb-2">Tiempo:</div>
          <Timer
            seconds={90}
            running={running}
            onFinish={() => finishStage({ timeout: true })}
          />
          {!running ? (
            <Button onClick={startStage} variant="primary">
              Comenzar reto
            </Button>
          ) : (
            <div className="mt-4">
              {/* Simplicity: collect free text answer */}
              <textarea
                className="w-full p-2 border rounded"
                rows={4}
                value={answers[stage]?.resp || ""}
                onChange={(e) =>
                  setAnswers((a) => ({
                    ...a,
                    [stage]: { ...a[stage], resp: e.target.value },
                  }))
                }
              />
              <div className="mt-2 flex gap-2">
                <Button
                  onClick={() =>
                    finishStage({ resp: answers[stage]?.resp || "" })
                  }
                  variant="primary"
                >
                  Enviar
                </Button>
                <Button
                  onClick={() => finishStage({ skipped: true })}
                  variant="ghost"
                >
                  Me rindo
                </Button>
              </div>
              {answers[stage]?.validated && (
                <pre className="mt-3 bg-slate-50 p-2 rounded text-sm">
                  {JSON.stringify(answers[stage].validated, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      ) : (
        <p>No hay items de diagnóstico. Pruébalo de nuevo más tarde.</p>
      )}
    </FancyCard>
  );
}
