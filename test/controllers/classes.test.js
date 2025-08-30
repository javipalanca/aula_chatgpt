import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import createApp from "../../server/app.js";
import classesControllerFactory from "../../server/controllers/classes.js";

describe("classes controller", () => {
  let app;
  let classesRepo;

  beforeEach(() => {
    classesRepo = {
      find: vi.fn().mockResolvedValue([{ id: "C1" }]),
      findById: vi.fn().mockResolvedValue({ id: "C1" }),
      upsert: vi.fn().mockResolvedValue(true),
      update: vi.fn().mockResolvedValue({ id: "C1" }),
      deleteById: vi.fn().mockResolvedValue(true),
    };
    const classesController = classesControllerFactory({ classesRepo });
    app = createApp();
    app.use("/api/classes", classesController);
  });

  it("GET /api/classes returns classes", async () => {
    const res = await request(app).get("/api/classes");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: "C1" }]);
  });

  it("GET /api/classes/:id returns class", async () => {
    const res = await request(app).get("/api/classes/C1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "C1" });
  });

  it("POST /api/classes creates class", async () => {
    const res = await request(app).post("/api/classes").send({ name: "A" });
    expect(res.status).toBe(200);
    expect(classesRepo.upsert).toHaveBeenCalled();
  });

  it("POST /api/classes/:id/reset calls service.resetClass and returns new class", async () => {
    const fakeClass = { id: "C1", meta: { currentBlockIndex: 0 } };
    // create controller with a classService that has resetClass
    const classesController = classesControllerFactory({
      classService: {
        list: classesRepo.find,
        get: classesRepo.findById,
        create: classesRepo.upsert,
        update: classesRepo.update,
        delete: classesRepo.deleteById,
        resetClass: vi.fn().mockResolvedValue(fakeClass),
      },
    });
    app = createApp();
    app.use("/api/classes", classesController);

    const res = await request(app).post("/api/classes/C1/reset");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.class).toEqual(fakeClass);
  });

  it("POST /api/classes/:id/reset returns 500 when resetClass throws", async () => {
    const classesController = classesControllerFactory({
      classService: {
        list: classesRepo.find,
        get: classesRepo.findById,
        create: classesRepo.upsert,
        update: classesRepo.update,
        delete: classesRepo.deleteById,
        resetClass: vi.fn().mockRejectedValue(new Error("boom")),
      },
    });
    app = createApp();
    app.use("/api/classes", classesController);

    const res = await request(app).post("/api/classes/C1/reset");
    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
  });
});
