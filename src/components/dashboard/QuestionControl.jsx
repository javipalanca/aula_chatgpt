
import React from 'react';
import { Button, clsx } from '../ui';
import { Bar } from 'react-chartjs-2';

export function QuestionControl({
  questionRunning,
  secondsLeft,
  liveAnswers,
  lastQuestionResults,
  selectedCorrect,
  pendingAdvance,
  onLaunch,
  onReveal,
  onShowScores,
}) {
  return (
    <div>
      <div className="text-3xl font-bold mb-3">
        {questionRunning ? questionRunning.title : 'Sin pregunta activa'}
      </div>

      {questionRunning && questionRunning.options && questionRunning.options.length > 0 && (
        <div className="grid gap-3 mb-4">
          {questionRunning.options.map((opt, i) => {
            const isCorrect = selectedCorrect !== null && String(selectedCorrect) === String(opt);
            return (
              <div
                key={i}
                className={clsx(
                  'p-4 rounded text-left',
                  isCorrect ? 'bg-green-600 text-white' : 'bg-white/5'
                )}
              >
                <div className="font-medium">{String.fromCharCode(65 + i)}. {opt}</div>
                {lastQuestionResults && lastQuestionResults.distribution && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="text-sm opacity-70">
                      {(lastQuestionResults.distribution[String(opt)] || 0)} respuestas
                    </div>
                    <div className="flex-1 bg-white/10 h-2 rounded overflow-hidden">
                      <div
                        style={{
                          width: `${Math.min(
                            100,
                            ((lastQuestionResults.distribution[String(opt)] || 0) /
                              Math.max(1, Object.values(lastQuestionResults.distribution || {}).reduce((a, b) => a + b, 0))) *
                              100
                          )}%`,
                        }}
                        className="h-2 bg-blue-500"
                      ></div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {questionRunning && (
        <div className="text-sm opacity-70 mb-4">
          Respuestas recibidas: {(liveAnswers[questionRunning.id] && liveAnswers[questionRunning.id].total) || 0}
        </div>
      )}

      <div className="text-6xl font-mono mb-4">{secondsLeft}s</div>

      <div className="flex gap-3 items-center">
        <Button onClick={onLaunch} variant="primary">
          {pendingAdvance ? 'Continuar' : (questionRunning ? 'Lanzar siguiente' : 'Lanzar pregunta')}
        </Button>
        <Button onClick={onReveal} variant="ghost">Revelar</Button>
        <Button onClick={onShowScores} variant="ghost">Mostrar puntuación</Button>
      </div>

      {lastQuestionResults && lastQuestionResults.distribution && (
        <div className="mt-4">
          <h4 className="font-semibold mb-2">Distribución de respuestas</h4>
          <div className="bg-white/5 p-4 rounded">
            <Bar
              options={{ responsive: true, plugins: { legend: { display: false } } }}
              data={{
                labels: Object.keys(lastQuestionResults.distribution || {}),
                datasets: [
                  {
                    label: 'Respuestas',
                    backgroundColor: 'rgba(59,130,246,0.8)',
                    data: Object.values(lastQuestionResults.distribution || {}),
                  },
                ],
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
