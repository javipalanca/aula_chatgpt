import express from "express";

export default function participantsController({
  participantService,
  fetchConnectedParticipants,
} = {}) {
  const router = express.Router();

  router.get("/", async (req, res) => {
    const classId = req.query.classId;
    if (!classId) return res.json([]);
    const includeDisconnected =
      String(req.query.includeDisconnected || "").toLowerCase() === "true";
    try {
      const docs = await fetchConnectedParticipants(classId, {
        includeDisconnected,
      });
      return res.json(docs);
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e) });
    }
  });

  router.post("/", async (req, res) => {
    const payload = req.body || {};
    if (!payload.id) return res.status(400).json({ error: "id required" });
    payload.updated_at = new Date();
    try {
      const result = await participantService.saveParticipant(payload);
      if (result && result.skipped)
        return res.json({ ok: true, skipped: true });
      return res.json({ ok: true });
    } catch (err) {
      console.error(
        "POST /api/participants error",
        err && err.stack ? err.stack : err,
      );
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  router.post("/reset-scores", async (req, res) => {
    const { classId } = req.body || {};
    if (!classId) return res.status(400).json({ error: "classId is required" });
    try {
      await participantService.resetScores(classId);
      const docs = await fetchConnectedParticipants(classId, {
        includeDisconnected: true,
      });
      // participantService is expected to call broadcast internally if needed
      return res.json({ ok: true, participants: docs });
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err) });
    }
  });

  return router;
}
