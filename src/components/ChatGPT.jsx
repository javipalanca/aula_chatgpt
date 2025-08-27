
import React, { useState, useEffect } from 'react';

export default function ChatGPT({ question, answer, onEvaluated }) {
  const [evaluation, setEvaluation] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('ChatGPT component mounted or updated');
    const evaluate = async () => {
      try {
        const response = await fetch('/api/evaluate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ question, answer }),
        });
        if (!response.ok) {
          throw new Error('La evaluación ha fallado');
        }
        const data = await response.json();
        console.log('Evaluation data:', data);
        setEvaluation(data);
        if (onEvaluated) {
          onEvaluated(data);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    evaluate();
  }, [question, answer, onEvaluated]);

  if (loading) {
    return (
      <div className="mt-3 p-3 rounded bg-yellow-500/20 text-left flex items-center justify-center gap-3">
        <div className="font-semibold">Evaluando...</div>
        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-3 p-3 rounded bg-red-500/20 text-left flex items-center justify-center gap-3">
        <div className="font-semibold">Error en la evaluación</div>
        <div className="text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="mt-3 text-left">
      <div className="space-y-3">
        <div className="max-w-[80%] p-3 rounded-lg bg-white/10 text-left self-start">
          <div className="text-sm opacity-80">Tu entrada</div>
          <div className="mt-1">{answer}</div>
        </div>
        <div className="max-w-[80%] p-3 rounded-lg bg-slate-800 text-left self-end ml-auto" style={{ background: 'linear-gradient(180deg,#0f172a,#111827)' }}>
          <div className="text-sm opacity-80">Evaluación automática — {Math.round(evaluation.score || 0)}/100</div>
          {evaluation.awardedPoints ? <div className="text-sm opacity-80">Puntos: {evaluation.awardedPoints}</div> : null}
          <div className="mt-2">{evaluation.feedback}</div>
        </div>
      </div>
    </div>
  );
}
