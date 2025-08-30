import express from "express";

export default function questionsController({ questionService } = {}) {
  const router = express.Router();

  router.post("/:id/reveal", async (req, res) => {
    const questionId = req.params.id;
    const {
      classId,
      correctAnswer,
      points = 100,
      activeQuestion,
    } = req.body || {};
    if (!classId) return res.status(400).json({ error: "classId required" });
    // Determine evaluation mode: if question payload indicates LLM evaluation (prompt/open)
    const questionPayload =
      activeQuestion &&
      activeQuestion.question &&
      activeQuestion.question.payload
        ? activeQuestion.question.payload
        : activeQuestion || {};
    const evalMode =
      questionPayload && typeof questionPayload.evaluation === "string"
        ? questionPayload.evaluation
        : questionPayload &&
            (questionPayload.source === "BAD_PROMPTS" ||
              questionPayload.source === "PROMPTS")
          ? "prompt"
          : "mcq";
    // For non-LLM (mcq/redflags) we require a correctAnswer; for LLM-evaluated questions it's optional
    if (
      (evalMode === "mcq" || evalMode === "redflags") &&
      typeof correctAnswer === "undefined"
    ) {
      return res
        .status(400)
        .json({
          error: "classId and correctAnswer required for this question type",
        });
    }
    try {
      if (
        !questionService ||
        typeof questionService.revealQuestion !== "function"
      )
        throw new Error("questionService not available");
      const result = await questionService.revealQuestion({
        classId,
        questionId,
        correctAnswer,
        points,
        activeQuestion: req.body.activeQuestion || null,
      });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  return router;
}
