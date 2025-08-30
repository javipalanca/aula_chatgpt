import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import ParticipantsRepo from "../../server/repositories/ParticipantsRepo.js";

describe("ParticipantsRepo (mongodb-memory-server)", () => {
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
    // inject db by replacing global getCollection via connectDb isn't trivial here, so use internal collection access
    repo = new ParticipantsRepo();
    // monkey patch _col to use our db
    repo._col = () => db.collection("participants");
  });

  afterAll(async () => {
    if (client) await client.close();
    if (mongoServer) await mongoServer.stop();
  });

  it("upsert, findOneByClassSession and incScore work", async () => {
    const doc = {
      id: "p1",
      classId: "C1",
      sessionId: "S1",
      displayName: "User",
      connected: true,
    };
    await repo.upsert(doc);
    const found = await repo.findOneByClassSession("C1", "S1");
    expect(found).toBeTruthy();
    await repo.incScore("C1", "S1", 10);
    const again = await repo.findOneByClassSession("C1", "S1");
    expect(again.score).toBeDefined();
  });
});
