import { useEffect, useRef, useState, useCallback } from "react";
import { getSessionId } from "../lib/storage";
import useRealtime from "./useRealtime";
import useQuestionTimer from "./useQuestionTimer";
import useSubmitAnswer from "./useSubmitAnswer";
import useParticipants from "./useParticipants";

/**
 * Hook container que encapsula la lógica de sesión del estudiante.
 * - maneja eventos websocket (question-launched, answers-count, question-results, participants-updated)
 * - integra useQuestionTimer y useParticipants
 * - expone estado y handlers para StudentView
 */
export default function useStudentSession(classCode, displayName) {
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

  const currentQuestionRef = useRef(null);
  const {
    secondsLeft: hookSecondsLeft,
    start: startTimer,
    stop: stopTimer,
  } = useQuestionTimer(currentQuestion);
  const { submitAnswer: submitAnswerHook } = useSubmitAnswer();
  const partsHook = useParticipants(classCode, displayName);

  /**
   * Mantiene una referencia mutable (`currentQuestionRef`) sincronizada con
   * `currentQuestion` para que el manejador de realtime pueda leer el valor
   * más reciente sin quedar sujeto a cierres (closures) obsoletos.
   */
  useEffect(() => {
    currentQuestionRef.current = currentQuestion;
  }, [currentQuestion]);
  // overlay visibility is controlled by the UI component
  /**
   * Handler de eventos websocket (usado por `useRealtime`).
   * Procesa eventos entrantes relevantes para la vista del estudiante:
   * - 'question-launched': inicializa estado para una nueva pregunta
   * - 'answers-count': actualiza el contador agregado de respuestas
   * - 'question-results': detiene el temporizador, marca respuesta y muestra
   *   resultados/evaluaciones si están presentes
   * - 'participants-updated': refresca participantes y la puntuación del usuario
   */
  useRealtime(classCode, (d) => {
    const cq = currentQuestionRef.current;
    if (!d) return;

    if (d.type === "question-launched") {
      setCurrentQuestion(d.question);
      const announcedDuration =
        d.question && typeof d.question.duration === "number"
          ? Number(d.question.duration)
          : d.question &&
              d.question.payload &&
              typeof d.question.payload.duration === "number"
            ? Number(d.question.payload.duration)
            : 30;
      setSecondsLeft(announcedDuration);
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

  /**
   * Garantiza que `timerStarted` vuelva a `false` cuando se borra
   * `currentQuestion`. Evita que el temporizador siga marcado como activo
   * si no hay pregunta.
   */
  useEffect(() => {
    if (!currentQuestion) setTimerStarted(false);
  }, [currentQuestion]);

  /**
   * Arranca el temporizador cuando `timerStarted` es true y existe una
   * `currentQuestion` válida. Usa la función `startTimer` provista por
   * `useQuestionTimer`.
   */
  useEffect(() => {
    if (!timerStarted) return;
    if (!currentQuestion) return;
    try {
      startTimer();
    } catch (e) {
      /* ignore */
    }
  }, [timerStarted, currentQuestion, startTimer]);

  /**
   * Sincroniza el estado local `secondsLeft` con el valor `hookSecondsLeft`
   * devuelto por `useQuestionTimer`, para que la UI muestre siempre el valor
   * actual del temporizador.
   */
  useEffect(() => {
    setSecondsLeft(hookSecondsLeft);
  }, [hookSecondsLeft]);

  /**
   * Fallback de revelado: cuando el temporizador llega a cero y no existe
   * `correctAnswer`, intenta recuperar la pregunta desde el backend HTTP.
   * Esto ayuda a mostrar la respuesta correcta si se perdió el evento
   * websocket (p. ej. reconexiones). Se ignoran errores de red.
   */
  useEffect(() => {
    if (!currentQuestion || !timerStarted || secondsLeft > 0 || correctAnswer)
      return;
    (async () => {
      try {
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
  }, [secondsLeft, currentQuestion, timerStarted, correctAnswer, classCode]);

  // action handlers
  /**
   * handleAnswer: callback para enviar una respuesta MCQ/open/prompt.
   * - Parámetros: `ans` (la respuesta del usuario).
   * - Comportamiento: evita envíos duplicados si ya respondió, guarda la
   *   respuesta localmente (`setUserAnswer`) y llama a `submitAnswerHook`.
   *   Si el envío tiene éxito marca `hasAnswered=true`.
   */
  const handleAnswer = useCallback(
    async (ans) => {
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
    },
    [currentQuestion, hasAnswered, submitAnswerHook, classCode],
  );

  /**
   * handleSubmitPrompt: submit handler específico para prompts (texto libre).
   * - Lee `promptText`, lo valida y lo envía con `submitAnswerHook`.
   * - Actualiza `submittedPrompt`, `promptSubmitted` y marca `hasAnswered`.
   */
  const handleSubmitPrompt = useCallback(async () => {
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
  }, [currentQuestion, hasAnswered, promptText, submitAnswerHook, classCode]);

    /**
   * handleEvaluation: convierte una evaluación (score/feedback) en el formato
   * que usa la UI.
   * - Normaliza `evaluation.score` (acepta 0..1 o 0..100), calcula `score`
   *   en 0..100 y `awardedPoints` según los `points` de la pregunta.
   * - Guarda el resultado en `displayedEvaluationResult` para mostrar overlay.
   */
  const handleEvaluation = useCallback(
    (evaluation) => {
      let raw = Number(evaluation.score || 0);
      if (isNaN(raw)) raw = 0;
      const fraction =
        raw > 1
          ? Math.max(0, Math.min(1, raw / 100))
          : Math.max(0, Math.min(1, raw));
      const scoreVal = Math.max(0, Math.min(100, Math.round(fraction * 100)));
      const points =
        currentQuestion &&
        currentQuestion.payload &&
        Number(currentQuestion.payload.points)
          ? Number(currentQuestion.payload.points)
          : 100;
      const awarded = Math.round((Number(points) || 0) * fraction);

      setDisplayedEvaluationResult({
        score: scoreVal,
        feedback: evaluation.feedback,
        awardedPoints: awarded,
      });
    },
    [currentQuestion],
  );

  return {
    // state
    currentQuestion,
    secondsLeft,
    hasAnswered,
    timerStarted,
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

    // handlers
    handleAnswer,
    handleSubmitPrompt,
    handleEvaluation,
    setCurrentQuestion,
    setTimerStarted,
  };
}
