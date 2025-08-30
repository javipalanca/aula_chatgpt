import express from "express";

export default function diagnosisController({
  diagnosisService,
  csvEscape = (v) => String(v || ""),
} = {}) {
  const router = express.Router();

  router.get("/generate", async (req, res) => {
    try {
      if (
        !diagnosisService ||
        typeof diagnosisService.generatePrompts !== "function"
      )
        return res
          .status(500)
          .json({ ok: false, error: "Ollama not configured" });
      const out = await diagnosisService.generatePrompts();
      return res.json(out);
    } catch (e) {
      return res.status(502).json({ ok: false, error: String(e) });
    }
  });

  router.post("/validate-bulo", async (req, res) => {
    try {
      const out = await diagnosisService.validateBulo(
        req.body && req.body.answer,
      );
      return res.json({ ok: true, raw: out });
    } catch (e) {
      return res.status(502).json({ ok: false, error: String(e) });
    }
  });

  router.post("/results", async (req, res) => {
    try {
      const payload = req.body || {};
      payload.created_at = new Date();
      const out = await diagnosisService.saveResult(payload);
      return res.json(out);
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e) });
    }
  });

  router.get("/results", async (req, res) => {
    try {
      const docs = await diagnosisService.listResults(req.query.classId);
      return res.json(docs);
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e) });
    }
  });

  router.get("/report/:classId", async (req, res) => {
    const classId = req.params.classId;
    try {
      const docs = await diagnosisService.listResults(classId);
      const rows = [];
      rows.push(
        [
          "id",
          "classId",
          "studentId",
          "stage",
          "score",
          "verdict",
          "created_at",
          "raw",
        ].join(","),
      );
      for (const d of docs) {
        const id = d.id || (d._id && d._id.toString()) || "";
        const studentId = d.studentId || "";
        const stage = d.stage || "";
        const score = typeof d.score !== "undefined" ? d.score : "";
        const verdict = d.verdict ? String(d.verdict).replace(/\n/g, " ") : "";
        const created = d.created_at
          ? new Date(d.created_at).toISOString()
          : "";
        const raw = d.raw ? JSON.stringify(d.raw).replace(/"/g, '""') : "";
        rows.push(
          [
            csvEscape(id),
            csvEscape(classId || ""),
            csvEscape(studentId),
            csvEscape(stage),
            csvEscape(score),
            csvEscape(verdict),
            csvEscape(created),
            csvEscape(raw),
          ].join(","),
        );
      }
      const csv = rows.join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="diagnosis_report_${classId || "all"}.csv"`,
      );
      return res.send(csv);
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e) });
    }
  });

  return router;
}
