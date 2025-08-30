/* eslint-env node */
export default class AnswerService {
  constructor({
    answersRepo,
    participantsRepo,
    evaluator = null,
    broadcast = null,
  } = {}) {
    this.answersRepo = answersRepo;
    this.participantsRepo = participantsRepo;
    this.evaluator = evaluator;
    this.broadcast = broadcast;
  }

  /**
   * Procesa el envío de una respuesta de un participante.
   * Valida parámetros, guarda la respuesta, broadcast actualizaciones,
   * computa conteos agregados y maneja evaluación si aplica.
   * @param {Object} params - Parámetros de la respuesta
   * @param {string} params.classId - ID de la clase
   * @param {string} params.sessionId - ID de la sesión del participante
   * @param {string} params.questionId - ID de la pregunta
   * @param {*} params.answer - Respuesta del participante
   * @param {Object|null} params.evaluation - Evaluación proporcionada por cliente
   * @param {Object|null} params.activeQuestion - Información de la pregunta activa
   * @returns {Promise<Object>} Resultado con {ok: true}
   */
  async submitAnswer({
    classId,
    sessionId,
    questionId,
    answer,
    evaluation = null,
    activeQuestion = null,
  } = {}) {
    this._validateParams(classId, sessionId, questionId);
    const id = `${classId}:${sessionId}:${questionId}`;
    // answersRepo.findById may be missing in lightweight test mocks; tolerate that.
    const existing =
      this.answersRepo && typeof this.answersRepo.findById === "function"
        ? await this.answersRepo.findById(id)
        : null;
    const doc = this._createAnswerDoc(
      id,
      classId,
      sessionId,
      questionId,
      answer,
    );
    await this.answersRepo.upsert(doc);
    this._broadcastAnswerUpdate(classId, questionId, doc);
    await this._computeAndBroadcastCounts(classId, questionId);
    await this._handleEvaluation(doc, existing, evaluation, activeQuestion);
    return { ok: true };
  }

  /**
   * Valida que los parámetros requeridos estén presentes.
   * @private
   * @param {string} classId
   * @param {string} sessionId
   * @param {string} questionId
   * @throws {Error} Si algún parámetro falta
   */
  _validateParams(classId, sessionId, questionId) {
    if (!classId || !sessionId || !questionId) {
      throw new Error("classId, sessionId and questionId required");
    }
  }

  /**
   * Crea el objeto documento de la respuesta.
   * @private
   * @param {string} id - ID único de la respuesta
   * @param {string} classId
   * @param {string} sessionId
   * @param {string} questionId
   * @param {*} answer
   * @returns {Object} Documento de respuesta
   */
  _createAnswerDoc(id, classId, sessionId, questionId, answer) {
    return {
      id,
      classId,
      sessionId,
      questionId,
      answer,
      created_at: new Date(),
    };
  }

  /**
   * Broadcast la actualización de la respuesta.
   * @private
   * @param {string} classId
   * @param {string} questionId
   * @param {Object} doc - Documento de respuesta
   */
  _broadcastAnswerUpdate(classId, questionId, doc) {
    this._safeBroadcast(
      { type: "answers-updated", classId, questionId, answer: doc },
      classId,
    );
  }

  /**
   * Computa conteos agregados de respuestas y los broadcast.
   * @private
   * @param {string} classId
   * @param {string} questionId
   */
  async _computeAndBroadcastCounts(classId, questionId) {
    try {
      const docs = await this.answersRepo.findByClassQuestion(
        classId,
        questionId,
      );
      const counts = {};
      for (const a of docs) {
        const key = a.answer == null ? "" : String(a.answer);
        counts[key] = (counts[key] || 0) + 1;
      }
      const total = Object.values(counts).reduce((s, v) => s + v, 0);
      const agg = { type: "answers-count", classId, questionId, total, counts };
      this._safeBroadcast(agg, classId);
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * Maneja la evaluación para preguntas abiertas o prompt.
   * @private
   * @param {Object} doc - Documento de respuesta
   * @param {Object|null} existing - Respuesta existente
   * @param {Object|null} evaluation - Evaluación del cliente
   * @param {Object|null} activeQuestion - Información de la pregunta activa
   */
  async _handleEvaluation(doc, existing, evaluation, activeQuestion) {
    try {
      const questionPayload = this._extractQuestionPayload(activeQuestion);
      const evalMode = this._determineEvalMode(questionPayload);

      if (evaluation && (evalMode === "open" || evalMode === "prompt")) {
        await this._computeAndApplyAward(
          doc,
          existing,
          questionPayload,
          evaluation.score || 0,
          evaluation.feedback || "",
          "client",
          activeQuestion,
        );
      } else if (
        (!evaluation || evaluation == null) &&
        (evalMode === "open" || evalMode === "prompt") &&
        this.evaluator
      ) {
        const ev = await this.evaluator.evaluate({
          question: questionPayload,
          answer: doc.answer,
        });
        const serverScore =
          ev && (typeof ev.score === "number" || typeof ev.score === "string")
            ? ev.score
            : 0;
        const feedback = ev && ev.feedback ? ev.feedback : "";
        await this._computeAndApplyAward(
          doc,
          existing,
          questionPayload,
          serverScore,
          feedback,
          "server",
          activeQuestion,
        );
      }
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * Extrae el payload de la pregunta de activeQuestion.
   * @private
   * @param {Object|null} activeQuestion
   * @returns {Object} Payload de la pregunta
   */
  _extractQuestionPayload(activeQuestion) {
    return activeQuestion &&
      activeQuestion.question &&
      activeQuestion.question.payload
      ? activeQuestion.question.payload
      : activeQuestion || {};
  }

  /**
   * Determina el modo de evaluación basado en el payload.
   * @private
   * @param {Object} questionPayload
   * @returns {string} Modo de evaluación: "mcq", "open", "prompt"
   */
  _determineEvalMode(questionPayload) {
    if (questionPayload && typeof questionPayload.evaluation === "string") {
      return questionPayload.evaluation;
    }
    if (
      questionPayload &&
      (questionPayload.source === "BAD_PROMPTS" ||
        questionPayload.source === "PROMPTS")
    ) {
      return "prompt";
    }
    return "mcq";
  }

  /**
   * Computa y aplica el premio basado en el score, feedback y source.
   * @private
   * @param {Object} doc - Documento de respuesta
   * @param {Object|null} existing - Respuesta existente
   * @param {Object} questionPayload
   * @param {number} rawScore
   * @param {string} feedback
   * @param {string} source
   * @param {Object|null} activeQuestion
   */
  async _computeAndApplyAward(
    doc,
    existing,
    questionPayload,
    rawScore,
    feedback,
    source,
    activeQuestion,
  ) {
    // rawScore may be a fraction (0..1) or a percentage (0..100)
    const raw = Number(rawScore || 0);
    const isLLM =
      questionPayload &&
      (questionPayload.evaluation === "prompt" ||
        questionPayload.evaluation === "open" ||
        questionPayload.source === "PROMPTS" ||
        questionPayload.source === "BAD_PROMPTS");

    // compute timing info used only for non-LLM questions
    const answerTs = doc.created_at
      ? new Date(doc.created_at).getTime()
      : Date.now();
    const totalDurationSec =
      questionPayload && Number(questionPayload.duration)
        ? Number(questionPayload.duration)
        : 30;
    const startedAt =
      activeQuestion && activeQuestion.startedAt
        ? activeQuestion.startedAt
        : answerTs - totalDurationSec * 1000;
    const timeTakenMs = Math.max(0, answerTs - startedAt);
    const percent = Math.min(1, timeTakenMs / (totalDurationSec * 1000));

    let scoreFraction = 0; // normalized 0..1
    let awarded = 0; // points to award (0..100)

    if (isLLM) {
      // For LLM questions: use evaluation score directly, without applying time decay
      // Accept either 0..1 (fraction) or 0..100 (percentage) from evaluator
      if (raw > 1) {
        awarded = Math.round(raw); // assume evaluator returned 0..100
      } else {
        awarded = Math.round(raw * 100); // evaluator returned 0..1
      }
      scoreFraction = Math.max(0, Math.min(1, awarded / 100));
    } else {
      // Non-LLM: compute score fraction (0..1) then prorate to 0..100 by time taken
      scoreFraction = Math.max(0, Math.min(1, raw > 1 ? raw / 100 : raw));
      // determine whether to apply time decay (default true)
      const applyTimeDecay =
        typeof questionPayload?.timeDecay === "boolean"
          ? questionPayload.timeDecay
          : true;
      const timeMultiplier = applyTimeDecay ? Math.max(0, 1 - percent) : 1;
      awarded = Math.round(100 * scoreFraction * timeMultiplier);
    }

    // idempotent score increment: only inc if awarded > 0 and no previous awardedPoints
    if (awarded > 0) {
      if (
        !(
          existing &&
          existing.evaluation &&
          typeof existing.evaluation.awardedPoints === "number" &&
          existing.evaluation.awardedPoints > 0
        )
      ) {
        await this.participantsRepo.incScore(
          doc.classId,
          doc.sessionId,
          awarded,
        );
      }
    }

    // persist evaluation (store normalized scoreFraction and awardedPoints)
    await this.answersRepo.upsert({
      ...doc,
      evaluation: {
        score: scoreFraction,
        feedback: feedback || "",
        awardedPoints: awarded,
        evaluatedAt: new Date(),
        source,
      },
    });

    this._broadcastEvaluation(doc, scoreFraction, feedback, awarded, source);
  }

  /**
   * Broadcast la evaluación de la respuesta.
   * @private
   * @param {Object} doc - Documento de respuesta
   * @param {number} scoreFraction
   * @param {string} feedback
   * @param {number} awardedPoints
   * @param {string} source
   */
  _broadcastEvaluation(doc, scoreFraction, feedback, awardedPoints, source) {
    this._safeBroadcast(
      {
        type: "answer-evaluated",
        classId: doc.classId,
        questionId: doc.questionId,
        sessionId: doc.sessionId,
        score: scoreFraction,
        feedback: feedback || "",
        awardedPoints,
        source,
      },
      doc.classId,
    );
  }

  /**
   * Broadcast seguro que ignora errores.
   * @private
   * @param {Object} message
   * @param {string} classId
   */
  _safeBroadcast(message, classId) {
    this.broadcast(message, classId);
  }

  async list(query = {}) {
    if (!this.answersRepo || typeof this.answersRepo.find !== "function")
      return [];
    return this.answersRepo.find(query);
  }
}
