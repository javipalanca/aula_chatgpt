import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import createApp from "../../server/app.js";
import llmControllerFactory from "../../server/controllers/llm.js";

describe("llm controller", () => {
  let app;
  let evaluator;

  beforeEach(() => {
    evaluator = { evaluate: vi.fn().mockResolvedValue({ score: 0.8 }) };
    const llmController = llmControllerFactory({
      evaluator,
      ollamaConfig: { url: "http://ollama", model: "m" },
      fetchImpl: vi.fn(),
    });
    app = createApp();
    app.use("/api/llm", llmController);
  });

  it("POST /api/llm/evaluate requires fields", async () => {
    const res = await request(app).post("/api/llm/evaluate").send({});
    expect(res.status).toBe(400);
  });

  it("POST /api/llm/evaluate calls evaluator", async () => {
    const res = await request(app)
      .post("/api/llm/evaluate")
      .send({ question: { id: "Q" }, answer: "a" });
    expect(res.status).toBe(200);
    expect(evaluator.evaluate).toHaveBeenCalled();
  });
});
