
import React, { useState, useEffect } from 'react';
import { getSessionId, submitEvaluatedAnswer } from '../lib/storage';

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
        if (onEvaluated) onEvaluated(data);
        // also send evaluated answer to server so teacher UIs receive it as answer-evaluated
        try {
          await submitEvaluatedAnswer(question.payload && question.payload.classId ? question.payload.classId : (question.classId || ''), getSessionId(), question.id, answer, data);
        } catch (e) { console.warn('submitEvaluatedAnswer failed', e); }
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

  return null;

}

