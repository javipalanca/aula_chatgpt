import React, { useState } from "react";
import { Button } from "../components/ui";

import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import ChatGPT from "../components/ChatGPT";
import OptionsList from "../components/OptionsList";
import QuestionHeader from "../components/QuestionHeader";
import PromptEditor from "../components/PromptEditor";
import ScoreOverlay from "../components/ScoreOverlay";
import useStudentSession from "../hooks/useStudentSession";
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export default function StudentView({ classCode, displayName, onBack }) {
  const {
    currentQuestion,
    secondsLeft,
    hasAnswered,
    revealed,
    answersCount,
    score,
    userAnswer,
    promptText,
    setPromptText,
    submittedPrompt,
    promptSubmitted,
    displayedEvaluationResult,
    correctAnswer,
    partsHook,
    handleAnswer,
    handleSubmitPrompt,
    handleEvaluation,
  } = useStudentSession(classCode, displayName);

  const [showScoresOverlay, setShowScoresOverlay] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="max-w-4xl w-full text-center">
        <QuestionHeader
          classCode={classCode}
          displayName={displayName}
          score={score}
          onShowScores={async () => {
            try {
              if (partsHook && partsHook.refresh) await partsHook.refresh();
              setShowScoresOverlay(true);
            } catch (e) {
              console.warn("show scores failed", e);
            }
          }}
        />

        {!currentQuestion && (
          <div className="p-12 rounded-xl bg-white/5">
            <div className="text-xl font-semibold">
              Esperando a que el docente lance preguntas…
            </div>
            <div className="text-sm opacity-70 mt-2">
              Mantente atento: cuando el profesor lance una pregunta aparecerá
              aquí en pantalla completa.
            </div>
            <div className="mt-4 text-sm opacity-60">
              Respuestas recibidas: {answersCount}
            </div>
            <div className="mt-4">
              <Button variant="ghost" onClick={onBack}>
                Volver
              </Button>
            </div>
          </div>
        )}

        {currentQuestion && (
          <div className="p-8 rounded-xl bg-white/5">
            {currentQuestion.payload && currentQuestion.payload.blockName && (
              <div className="mb-4">
                <div className="text-sm opacity-70">
                  Bloque actual:{" "}
                  <span className="font-semibold">
                    {currentQuestion.payload.blockName}
                  </span>
                </div>
                <div className="text-xs opacity-60">
                  Pregunta{" "}
                  {typeof currentQuestion.payload.questionIndex !== "undefined"
                    ? currentQuestion.payload.questionIndex + 1
                    : "?"}{" "}
                  del bloque
                </div>
              </div>
            )}

            <div className="text-3xl font-bold mb-4">
              {currentQuestion.title}
            </div>

            {currentQuestion.options && currentQuestion.options.length > 0 && (
              <OptionsList
                options={currentQuestion.options}
                userAnswer={userAnswer}
                correctAnswer={correctAnswer}
                hasAnswered={hasAnswered}
                onChoose={handleAnswer}
                revealed={revealed}
              />
            )}

            {/* Open / prompt evaluation: free-text ChatGPT-like input */}
            {(!currentQuestion.options ||
              currentQuestion.options.length === 0) &&
              currentQuestion.payload &&
              (currentQuestion.payload.evaluation === "open" ||
                currentQuestion.payload.evaluation === "prompt" ||
                currentQuestion.payload.source === "BAD_PROMPTS" ||
                currentQuestion.payload.source === "PROMPTS") && (
                <div className="mb-6">
                  <PromptEditor
                    promptText={promptText}
                    onChange={setPromptText}
                    onSubmit={handleSubmitPrompt}
                    onClear={() => setPromptText("")}
                    instructions={
                      currentQuestion.payload &&
                      (currentQuestion.payload.instructions ||
                        currentQuestion.payload.tip)
                    }
                    template={
                      currentQuestion.payload &&
                      (currentQuestion.payload.template ||
                        currentQuestion.payload.instructions)
                    }
                    disabled={hasAnswered}
                    submittedPrompt={submittedPrompt}
                  />

                  {promptSubmitted && submittedPrompt && (
                    <ChatGPT
                      question={currentQuestion}
                      answer={submittedPrompt}
                      onEvaluated={handleEvaluation}
                    />
                  )}

                  {displayedEvaluationResult && (
                    <div className="mt-3 text-left">
                      <div className="space-y-3">
                        <div className="max-w-[80%] p-3 rounded-lg bg-white/10 text-left self-start">
                          <div className="text-sm opacity-80">Tu entrada</div>
                          <div className="mt-1">
                            {submittedPrompt || promptText}
                          </div>
                        </div>
                        <div
                          className="max-w-[80%] p-3 rounded-lg bg-slate-800 text-left self-end ml-auto"
                          style={{
                            background:
                              "linear-gradient(180deg,#0f172a,#111827)",
                          }}
                        >
                          <div className="text-sm opacity-80">
                            Evaluación automática —{" "}
                            {Math.round(displayedEvaluationResult.score || 0)}
                            /100
                          </div>
                          {displayedEvaluationResult.awardedPoints ? (
                            <div className="text-sm opacity-80">
                              Puntos: {displayedEvaluationResult.awardedPoints}
                            </div>
                          ) : null}
                          <div className="mt-2">
                            {displayedEvaluationResult.feedback}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {correctAnswer && (
                    <div className="mt-3 text-sm opacity-70 text-left">
                      Respuesta correcta:{" "}
                      <div className="mt-1 p-2 rounded bg-green-600 text-white">
                        {correctAnswer}
                      </div>
                    </div>
                  )}
                </div>
              )}

            <div className="text-2xl font-mono mb-2">{secondsLeft}s</div>
            <div className="text-sm opacity-70">
              Respuestas recibidas: {answersCount}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-center gap-2">
                <Button variant="ghost" onClick={onBack}>
                  Salir
                </Button>
              </div>
            </div>
          </div>
        )}

        {showScoresOverlay && (
          <ScoreOverlay
            participants={(partsHook && partsHook.participants) || []}
            onClose={() => setShowScoresOverlay(false)}
          />
        )}
      </div>
    </div>
  );
}
