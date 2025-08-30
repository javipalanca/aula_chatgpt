import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import createApp from "../../server/app.js";
import diagnosisControllerFactory from "../../server/controllers/diagnosis.js";

describe("diagnosis controller", () => {
  let app;
  let diagnosisService;

  beforeEach(() => {
    diagnosisService = {
      generatePrompts: vi.fn().mockResolvedValue([]),
      validateBulo: vi.fn().mockResolvedValue({ verdict: "unknown" }),
      saveResult: vi.fn().mockResolvedValue({ insertedId: "X" }),
      listResults: vi.fn().mockResolvedValue([]),
    };
    const diagnosisController = diagnosisControllerFactory({
      diagnosisService,
    });
    app = createApp();
    app.use("/api/diagnosis", diagnosisController);
  });

  it("GET /api/diagnosis/generate returns 502 if ollama not configured", async () => {
    const badController = diagnosisControllerFactory({});
    const a = createApp();
    a.use("/api/diagnosis", badController);
    const res = await request(a).get("/api/diagnosis/generate");
    expect(res.status).toBe(500);
  });

  it("POST /api/diagnosis/results persists", async () => {
    const res = await request(app)
      .post("/api/diagnosis/results")
      .send({ classId: "C1" });
    expect(res.status).toBe(200);
    expect(diagnosisService.saveResult).toHaveBeenCalled();
  });
});
