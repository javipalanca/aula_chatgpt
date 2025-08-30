import { describe, it, expect, beforeEach } from "vitest";
import ClassesRepo from "../server/repositories/ClassesRepo.js";

function makeFakeCollection() {
  const docs = new Map();
  return {
    async replaceOne(filter, doc, _opts) {
      const id = doc.id || (filter && filter.id);
      if (!id) throw new Error("id required");
      docs.set(id, { ...doc });
      return { acknowledged: true };
    },
    find(q) {
      const out = [];
      for (const v of docs.values()) {
        let ok = true;
        for (const k of Object.keys(q || {}))
          if (v[k] !== q[k]) {
            ok = false;
            break;
          }
        if (ok) out.push(v);
      }
      return { toArray: async () => out };
    },
    async findOne(q) {
      for (const v of docs.values()) {
        let ok = true;
        for (const k of Object.keys(q || {}))
          if (v[k] !== q[k]) {
            ok = false;
            break;
          }
        if (ok) return v;
      }
      return null;
    },
    async updateOne(q, op) {
      const doc = await this.findOne(q);
      if (!doc) return { matchedCount: 0 };
      if (op && op.$set) Object.assign(doc, op.$set);
      return { matchedCount: 1 };
    },
    async deleteOne(q) {
      for (const [k, v] of Array.from(docs.entries())) {
        let ok = true;
        for (const f of Object.keys(q || {}))
          if (v[f] !== q[f]) {
            ok = false;
            break;
          }
        if (ok) {
          docs.delete(k);
          return { deletedCount: 1 };
        }
      }
      return { deletedCount: 0 };
    },
    async countDocuments(q) {
      return Array.from(docs.values()).filter((d) => {
        for (const k of Object.keys(q || {})) if (d[k] !== q[k]) return false;
        return true;
      }).length;
    },
  };
}

describe("ClassesRepo", () => {
  let fakeCol;
  beforeEach(() => {
    fakeCol = makeFakeCollection();
    ClassesRepo.prototype._col = () => fakeCol;
  });

  it("upsert and findById", async () => {
    const repo = new ClassesRepo();
    await repo.upsert({ id: "c1", name: "Clase 1" });
    const got = await repo.findById("c1");
    expect(got).toBeTruthy();
    expect(got.name).toBe("Clase 1");
  });

  it("find returns arrays", async () => {
    const repo = new ClassesRepo();
    await repo.upsert({ id: "c1", name: "A", active: true });
    await repo.upsert({ id: "c2", name: "B", active: false });
    const all = await repo.find({});
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBe(2);
    const active = await repo.find({ active: true });
    expect(active.length).toBe(1);
  });

  it("update and delete", async () => {
    const repo = new ClassesRepo();
    await repo.upsert({ id: "c3", name: "C" });
    const after = await repo.update("c3", { name: "C2" });
    expect(after.name).toBe("C2");
    await repo.deleteById("c3");
    const got = await repo.findById("c3");
    expect(got).toBeNull();
  });
});
