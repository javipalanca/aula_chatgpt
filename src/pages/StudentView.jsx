import React, { useEffect, useState, useCallback, useRef } from "react";
import { getSessionId } from "../lib/storage";
// Removed unused imports
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
import useRealtime from "../hooks/useRealtime";
import useQuestionTimer from "../hooks/useQuestionTimer";
import OptionsList from "../components/OptionsList";
import QuestionHeader from "../components/QuestionHeader";
import PromptEditor from "../components/PromptEditor";
import ScoreOverlay from "../components/ScoreOverlay";
import useSubmitAnswer from "../hooks/useSubmitAnswer";
import useParticipants from "../hooks/useParticipants";
ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export default function StudentView({ classCode, displayName, onBack }) {
  // joined state not required; rely on API/WS events
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [timerStarted, setTimerStarted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [answersCount, setAnswersCount] = useState(0);
  const [score, setScore] = useState(0);
  const [userAnswer, setUserAnswer] = useState(null);
  const [promptText, setPromptText] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState(null);
  const [promptSubmitted, setPromptSubmitted] = useState(false);
  const [displayedEvaluationResult, setDisplayedEvaluationResult] =
    useState(null);
  const [correctAnswer, setCorrectAnswer] = useState(null);
  // participants are managed by the hook to avoid duplicated state and loops
  // participants will come from the participants hook to avoid state duplication
  const [showScoresOverlay, setShowScoresOverlay] = useState(false);
  const currentQuestionRef = useRef(null);
  const {
    secondsLeft: hookSecondsLeft,
    start: startTimer,
    stop: stopTimer,
  } = useQuestionTimer(currentQuestion);
  const { submitAnswer: submitAnswerHook } = useSubmitAnswer();

  // Use a stable, memoized realtime handler to avoid re-renders caused by
  // inline callbacks. The useRealtime hook forwards events to the latest
  // handler via ref, so we can capture events here and update state.
  useRealtime(classCode, (d) => {
    const cq = currentQuestionRef.current;
    if (!d) return;
    if (d.type === "question-launched") {
      setCurrentQuestion(d.question);
      // compute announced duration immediately to avoid a race where
      // the local secondsLeft remains 0 before the timer starts and
      // triggers the reveal-on-zero effect prematurely
      const announcedDuration =
        d.question && typeof d.question.duration === "number"
          ? Number(d.question.duration)
          : d.question &&
              d.question.payload &&
              typeof d.question.payload.duration === "number"
            ? Number(d.question.payload.duration)
            : 30;
      setSecondsLeft(announcedDuration);
      // mark timer as requested; an effect will actually call startTimer()
      setTimerStarted(true);
      setHasAnswered(false);
      setRevealed(false);
      setAnswersCount(0);
      setUserAnswer(null);
      setPromptText("");
      setSubmittedPrompt(null);
      setPromptSubmitted(false);
      setCorrectAnswer(null);
    } else if (d.type === "answers-count") {
      if (d.questionId && cq && d.questionId === cq.id)
        setAnswersCount(d.total || 0);
    } else if (d.type === "question-results") {
      const isForCurrent =
        !cq ||
        (d.questionId && cq && d.questionId === cq.id) ||
        (d.classId === classCode && !d.questionId);
      if (isForCurrent) {
        stopTimer();
        setTimerStarted(false);
        setHasAnswered(true);
        setCorrectAnswer(d.correctAnswer);
        setRevealed(true);
        if (d.updatedScores) {
          const me = d.updatedScores.find(
            (s) => s.sessionId === getSessionId(),
          );
          if (me) setScore(me.score || 0);
        }
        if (Array.isArray(d.evaluations)) {
          const mine = d.evaluations.find(
            (x) => x.sessionId === getSessionId(),
          );
          if (mine) setDisplayedEvaluationResult(mine);
        }
      }
    } else if (d.type === "participants-updated") {
      // participants updated: refresh hook cache and update local score if provided
      try {
        if (partsHook && partsHook.refresh) partsHook.refresh().catch(() => {});
      } catch (e) {
        /* ignore */
      }
      if (Array.isArray(d.participants)) {
        const me = d.participants.find((p) => p.sessionId === getSessionId());
        if (me) setScore(me.score || 0);
      }
    }
  });

  // participants hook: join/start heartbeat and initial fetch + refresh helper.
  // Use partsHook.participants directly when rendering to avoid duplication.
  const partsHook = useParticipants(classCode, displayName);

  // keep a ref in sync with the currentQuestion so realtime handlers see latest value
  useEffect(() => {
    currentQuestionRef.current = currentQuestion;
  }, [currentQuestion]);

  // ensure timerStarted resets if question cleared
  useEffect(() => {
    if (!currentQuestion) setTimerStarted(false);
  }, [currentQuestion]);

  // start timer after currentQuestion state has been applied when a launch was requested
  useEffect(() => {
    if (!timerStarted) return;
    if (!currentQuestion) return;
    try {
      startTimer();
    } catch (e) {
      /* ignore */
    }
  }, [timerStarted, currentQuestion, startTimer]);

  // sync secondsLeft with hook
  useEffect(() => {
    setSecondsLeft(hookSecondsLeft);
  }, [hookSecondsLeft]);

  // If timer reaches zero but no question-results arrived with correctAnswer,
  // try to fetch stored challenge to find payload.correctAnswer and reveal locally.
  useEffect(() => {
    if (!currentQuestion) return;
    // only attempt to reveal stored correct answer when the timer was actually started
    if (!timerStarted) return;
    if (secondsLeft > 0) return;
    if (correctAnswer) return;
    // attempt to fetch the challenge from the storage API
    (async () => {
      try {
        // fetch stored challenges from the backend (relative path so Vite proxy works in dev)
        const r = await fetch(
          `/api/challenges?classId=${encodeURIComponent(classCode)}`,
        );
        if (!r.ok) return;
        const docs = await r.json();
        const found = (docs || []).find((d) => d.id === currentQuestion.id);
        if (
          found &&
          found.payload &&
          typeof found.payload.correctAnswer !== "undefined"
        ) {
          setCorrectAnswer(found.payload.correctAnswer);
          setHasAnswered(true);
          setRevealed(true);
        }
      } catch (e) {
        /* ignore fetch errors */
      }
    })();
  }, [secondsLeft, currentQuestion]);

  async function handleAnswer(ans) {
    if (!currentQuestion || hasAnswered) return;
    setUserAnswer(ans);
    try {
      await submitAnswerHook(
        classCode,
        getSessionId(),
        currentQuestion.id,
        ans,
      );
      setHasAnswered(true);
    } catch (e) {
      console.warn("submitAnswer failed", e);
    }
  }

  async function handleSubmitPrompt() {
    if (!currentQuestion || hasAnswered) return;
    const text = String(promptText || "").trim();
    if (!text) return;
    try {
      await submitAnswerHook(
        classCode,
        getSessionId(),
        currentQuestion.id,
        text,
      );
      setSubmittedPrompt(text);
      setHasAnswered(true);
      setPromptSubmitted(true);
    } catch (e) {
      console.warn("submitPrompt failed", e);
    }
  }

  const handleEvaluation = useCallback(
    (evaluation) => {
      // Award points based on the evaluation score.
      // Accept evaluation.score as either 0..1 or 1..100 and normalize.
      let raw = Number(evaluation.score || 0);
      if (isNaN(raw)) raw = 0;
      const fraction =
        raw > 1
          ? Math.max(0, Math.min(1, raw / 100))
          : Math.max(0, Math.min(1, raw));
      const score = Math.max(1, Math.min(100, Math.round(fraction * 100)));
      const points =
        currentQuestion &&
        currentQuestion.payload &&
        Number(currentQuestion.payload.points)
          ? Number(currentQuestion.payload.points)
          : 100;
      const awarded = Math.round((Number(points) || 0) * fraction);
      // Do NOT mutate authoritative participant score from the client. The server is
      // responsible for awarding points when it receives the evaluated answer (see
      // submitEvaluatedAnswer -> AnswerService). We keep a local displayed evaluation
      // so the student sees the LLM feedback and an estimated awardedPoints, but the
      // real cumulative score will arrive via the `participants-updated` event from
      // the server. This avoids double-awarding.
      setDisplayedEvaluationResult({
        score,
        feedback: evaluation.feedback,
        awardedPoints: awarded,
      });
    },
    [currentQuestion, classCode],
  );

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

                  {/* Trigger automatic LLM evaluation and submission to server via ChatGPT component */}
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
            {/* distribution hidden for students (handled in teacher UI) */}
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
