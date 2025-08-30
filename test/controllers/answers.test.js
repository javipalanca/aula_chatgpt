import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import createApp from "../../server/app.js";
import answersControllerFactory from "../../server/controllers/answers.js";

describe("answers controller", () => {
  let app;
  let answerService;
  let activeQuestions;

  beforeEach(() => {
    // answerService now must implement .list and .submitAnswer
    answerService = {
      list: vi.fn().mockResolvedValue([{ questionId: "Q1" }]),
      submitAnswer: vi.fn().mockResolvedValue(true),
    };
    activeQuestions = new Map();
    const answersController = answersControllerFactory({
      answerService,
      activeQuestions,
    });
    app = createApp();
    app.use("/api/answers", answersController);
  });

  it("POST /api/answers validates required fields", async () => {
    const res = await request(app).post("/api/answers").send({});
    expect(res.status).toBe(400);
  });

  it("POST /api/answers accepts valid payload and calls service", async () => {
    const payload = {
      classId: "C1",
      sessionId: "S1",
      questionId: "Q1",
      answer: "x",
    };
    const res = await request(app).post("/api/answers").send(payload);
    expect(res.status).toBe(200);
    expect(answerService.submitAnswer).toHaveBeenCalled();
  });

  it("GET /api/answers returns filtered answers", async () => {
    const res = await request(app).get("/api/answers").query({ classId: "C1" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ questionId: "Q1" }]);
  });
});
