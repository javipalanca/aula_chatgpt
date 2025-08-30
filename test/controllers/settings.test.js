import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import createApp from "../../server/app.js";
import settingsControllerFactory from "../../server/controllers/settings.js";

describe("settings controller", () => {
  let app;
  let settingsRepo;

  beforeEach(() => {
    settingsRepo = {
      findById: vi.fn().mockResolvedValue({ id: "S1" }),
      upsert: vi.fn().mockResolvedValue(true),
    };
    const settingsController = settingsControllerFactory({ settingsRepo });
    app = createApp();
    app.use("/api/settings", settingsController);
  });

  it("GET /api/settings/:id returns settings", async () => {
    const res = await request(app).get("/api/settings/S1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "S1" });
  });

  it("PUT /api/settings/:id upserts", async () => {
    const res = await request(app)
      .put("/api/settings/S1")
      .send({ data: { foo: "bar" } });
    expect(res.status).toBe(200);
    expect(settingsRepo.upsert).toHaveBeenCalled();
  });
});
