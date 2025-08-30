import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connectDb, closeDb } from "../../server/lib/db.js";
import DiagnosisRepo from "../../server/repositories/DiagnosisRepo.js";

let mongod;

describe("DiagnosisRepo integration (mongodb-memory-server)", () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await connectDb({ uri, dbName: "testdb" });
  }, 20000);

  afterAll(async () => {
    await closeDb();
    if (mongod) await mongod.stop();
  });

  it("insert and find against real mongo", async () => {
    const repo = new DiagnosisRepo();
    const payload = {
      id: "ix1",
      classId: "ci1",
      studentId: "s1",
      stage: "bulo",
      score: 0.9,
    };
    const r = await repo.insert(payload);
    expect(r).toBeTruthy();
    const docs = await repo.findByClass("ci1");
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.length).toBe(1);
    expect(docs[0].studentId).toBe("s1");
  });
});
