import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import createApp from "../../server/app.js";
import progressControllerFactory from "../../server/controllers/progress.js";

describe("progress controller", () => {
  let app;
  let progressRepo;

  beforeEach(() => {
    progressRepo = {
      findById: vi.fn().mockResolvedValue({ id: "P1" }),
      upsert: vi.fn().mockResolvedValue(true),
    };
    const progressController = progressControllerFactory({ progressRepo });
    app = createApp();
    app.use("/api/progress", progressController);
  });

  it("GET /api/progress/:id returns progress", async () => {
    const res = await request(app).get("/api/progress/P1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "P1" });
  });

  it("PUT /api/progress/:id upserts", async () => {
    const res = await request(app)
      .put("/api/progress/P1")
      .send({ data: { x: 1 } });
    expect(res.status).toBe(200);
    expect(progressRepo.upsert).toHaveBeenCalled();
  });
});
