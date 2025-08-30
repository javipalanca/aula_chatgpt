import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { connectDb, closeDb } from "../../server/lib/db.js";
import AnswersRepo from "../../server/repositories/AnswersRepo.js";

let mongod;

describe("AnswersRepo integration (mongodb-memory-server)", () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await connectDb({ uri, dbName: "testdb" });
  });

  afterAll(async () => {
    await closeDb();
    if (mongod) await mongod.stop();
  });

  it("upsert and findByClassQuestion against real mongo", async () => {
    const repo = new AnswersRepo();
    const doc = {
      id: "c1:s1:q1",
      classId: "c1",
      sessionId: "s1",
      questionId: "q1",
      answer: "A",
      created_at: new Date(),
    };
    await repo.upsert(doc);
    const docs = await repo.findByClassQuestion("c1", "q1");
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.length).toBe(1);
    expect(docs[0].sessionId).toBe("s1");
  });
});
