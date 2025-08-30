import { getCollection } from "../lib/db.js";

export default class ClassesRepo {
  constructor(colName = "classes") {
    this.colName = colName;
  }
  _col() {
    return getCollection(this.colName);
  }

  async upsert(doc) {
    if (!doc || !doc.id) throw new Error("id required");
    const col = this._col();
    return col.replaceOne({ id: doc.id }, doc, { upsert: true });
  }

  async find(q = {}) {
    const col = this._col();
    const res = col.find(q);
    // tolerate cursor with toArray() or direct array
    if (res && typeof res.toArray === "function") return await res.toArray();
    if (Array.isArray(res)) return res;
    // fallback: try to collect from async iterable
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

  async update(id, updates = {}) {
    if (!id) throw new Error("id required");
    await this._col().updateOne({ id }, { $set: updates });
    return this.findById(id);
  }

  async deleteById(id) {
    if (!id) throw new Error("id required");
    return this._col().deleteOne({ id });
  }

  async count(q = {}) {
    return this._col().countDocuments(q);
  }
}
