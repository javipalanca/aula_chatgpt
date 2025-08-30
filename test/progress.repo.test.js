import { describe, it, expect, beforeEach } from "vitest";
import ProgressRepo from "../server/repositories/ProgressRepo.js";

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
      const out = Array.from(docs.values()).filter((d) => {
        for (const k of Object.keys(q || {})) if (d[k] !== q[k]) return false;
        return true;
      });
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

describe("ProgressRepo", () => {
  let fakeCol;
  beforeEach(() => {
    fakeCol = makeFakeCollection();
    ProgressRepo.prototype._col = () => fakeCol;
  });

  it("upsert and findById", async () => {
    const r = new ProgressRepo();
    await r.upsert({ id: "p1", data: { a: 1 } });
    const got = await r.findById("p1");
    expect(got).toBeTruthy();
    expect(got.data.a).toBe(1);
  });

  it("find and delete", async () => {
    const r = new ProgressRepo();
    await r.upsert({ id: "p2", data: { b: 2 } });
    const all = await r.find({});
    expect(all.length).toBeGreaterThanOrEqual(1);
    await r.deleteById("p2");
    const found = await r.findById("p2");
    expect(found).toBeNull();
  });
});
