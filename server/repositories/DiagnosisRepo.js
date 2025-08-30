import { getCollection } from "../lib/db.js";

export default class DiagnosisRepo {
  constructor(colName = "diagnosis_results") {
    this.colName = colName;
  }

  _col() {
    return getCollection(this.colName);
  }

  async insert(doc) {
    return this._col().insertOne(doc);
  }

  async find(q = {}) {
    const cursor = await this._col().find(q);
    if (cursor && typeof cursor.toArray === "function")
      return await cursor.toArray();
    return cursor;
  }

  async findByClass(classId) {
    return this.find(classId ? { classId } : {});
  }

  async count(q = {}) {
    return this._col().countDocuments(q);
  }

  async deleteByClass(classId) {
    return this._col().deleteMany({ classId });
  }
}
