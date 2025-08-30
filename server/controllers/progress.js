import express from "express";

export default function progressController({
  progressService,
  progressRepo,
} = {}) {
  const router = express.Router();
  const service =
    progressService ||
    (progressRepo
      ? {
          get: (id) => progressRepo.findById(id),
          upsert: (id, data) =>
            progressRepo.upsert({ id, data, updated_at: new Date() }),
        }
      : null);

  router.get("/:id", async (req, res) => {
    try {
      const doc = await service.get(req.params.id);
      return res.json(doc || null);
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e) });
    }
  });

  router.put("/:id", async (req, res) => {
    try {
      await service.upsert(req.params.id, req.body.data || {});
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e) });
    }
  });

  return router;
}
