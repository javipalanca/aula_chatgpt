import { useRef } from "react";
import {
  submitAnswer as submitAnswerHttp,
  submitEvaluatedAnswer as submitEvaluatedAnswerHttp,
} from "../lib/storage";

/**
 * useSubmitAnswer
 * ---------------
 * Hook that centralizes sending answers to the backend with an in-memory
 * dedupe map to avoid duplicate network requests when called multiple times
 * rapidly or from multiple component instances.
 *
 * Blocks:
 * - IN_FLIGHT: a shared object holding pending promises keyed by request
 * - submitAnswer: sends a student's answer (MCQ or free-text) via storage HTTP
 * - submitEvaluatedAnswer: sends an answer together with an LLM evaluation
 * - both functions return the pending promise and ensure the IN_FLIGHT entry
 *   is removed when the request completes
 *
 * Contract:
 * - inputs: classId, sessionId, questionId, answer (and optional evaluation)
 * - errors: throws if required ids are missing
 * - output: the HTTP response body from the storage helper
 */
// Shared in-flight map to dedupe identical submissions across hook instances
const IN_FLIGHT = {};

export default function useSubmitAnswer() {
  const inflight = useRef(IN_FLIGHT);

  // Submit a plain answer. Key composed from class/session/question ensures
  // concurrent calls for the same logical submission reuse the same promise.
  const submitAnswer = async (classId, sessionId, questionId, answer) => {
    if (!classId || !sessionId || !questionId)
      throw new Error("classId, sessionId and questionId required");
    const key = `${classId}:${sessionId}:${questionId}`;
    if (inflight.current[key]) return inflight.current[key];
    const p = (async () => {
      try {
        const res = await submitAnswerHttp(
          classId,
          sessionId,
          questionId,
          answer,
        );
        return res;
      } finally {
        delete inflight.current[key];
      }
    })();
    inflight.current[key] = p;
    return p;
  };

  // Submit an evaluated answer (LLM evaluation included). Uses a distinct key
  // suffix to allow evaluation submissions to be deduped independently.
  const submitEvaluatedAnswer = async (
    classId,
    sessionId,
    questionId,
    answer,
    evaluation = {},
  ) => {
    if (!classId || !sessionId || !questionId)
      throw new Error("classId, sessionId and questionId required");
    const key = `${classId}:${sessionId}:${questionId}:eval`;
    if (inflight.current[key]) return inflight.current[key];
    const p = (async () => {
      try {
        const res = await submitEvaluatedAnswerHttp(
          classId,
          sessionId,
          questionId,
          answer,
          evaluation,
        );
        return res;
      } finally {
        delete inflight.current[key];
      }
    })();
    inflight.current[key] = p;
    return p;
  };

  return { submitAnswer, submitEvaluatedAnswer };
}
