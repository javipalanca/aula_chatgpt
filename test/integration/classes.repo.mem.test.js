import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import ClassesRepo from "../../server/repositories/ClassesRepo.js";

describe("ClassesRepo (mongodb-memory-server)", () => {
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
    repo = new ClassesRepo();
    repo._col = () => db.collection("classes");
  });

  afterAll(async () => {
    if (client) await client.close();
    if (mongoServer) await mongoServer.stop();
  });

  it("upsert and findById work", async () => {
    const doc = { id: "class1", name: "Math" };
    await repo.upsert(doc);
    const got = await repo.findById("class1");
    expect(got).toBeTruthy();
    expect(got.name).toBe("Math");
  });
});
