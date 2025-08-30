import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import AnswersRepo from "../../server/repositories/AnswersRepo.js";

describe("AnswersRepo (mongodb-memory-server)", () => {
  let mongoServer;
  let client;
  let db;
  let repo;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    client = new MongoClient(uri);
    await client.connect();
    db = client.db("test");
    repo = new AnswersRepo({ db });
  });

  afterAll(async () => {
    if (client) await client.close();
    if (mongoServer) await mongoServer.stop();
  });

  it("replaceAnswer and findByClassQuestion work", async () => {
    const doc = {
      id: "1",
      classId: "C",
      sessionId: "S",
      questionId: "Q",
      answer: "X",
      created_at: new Date().toISOString(),
    };
    await repo.upsert(doc);
    const found = await repo.findByClassQuestion("C", "Q");
    expect(Array.isArray(found)).toBe(true);
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found[0].sessionId).toBe("S");
  });
});
