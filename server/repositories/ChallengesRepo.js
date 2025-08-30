import { getCollection } from "../lib/db.js";

export default class ChallengesRepo {
  constructor(colName = "challenges") {
    this.colName = colName;
  }
  _col() {
    return getCollection(this.colName);
  }

  async upsert(doc) {
    if (!doc || !doc.id) throw new Error("id required");
    return this._col().replaceOne({ id: doc.id }, doc, { upsert: true });
  }

  async find(q = {}) {
    const res = this._col().find(q);
    if (res && typeof res.toArray === "function") return await res.toArray();
    if (Array.isArray(res)) return res;
    const out = [];
    try {
      for await (const r of res) out.push(r);
      return out;
    } catch (e) {
      return out;
    }
  }

  async findById(id) {
    if (!id) return null;
    return this._col().findOne({ id });
  }

  async findByClass(classId) {
    if (!classId) return [];
    return this.find({ classId });
  }

  async deleteByClass(classId) {
    if (!classId) throw new Error("classId required");
    return this._col().deleteMany({ classId });
  }

  async deleteById(id) {
    if (!id) throw new Error("id required");
    return this._col().deleteOne({ id });
  }

  async count(q = {}) {
    return this._col().countDocuments(q);
  }
}
