import { getCollection } from "../lib/db.js";

export default class SettingsRepo {
  constructor(colName = "settings") {
    this.colName = colName;
  }

  _col() {
    return getCollection(this.colName);
  }

  async findById(id) {
    return this._col().findOne({ id });
  }

  async upsert({ id, data }) {
    return this._col().replaceOne(
      { id },
      { id, data, updated_at: new Date() },
      { upsert: true },
    );
  }

  async count(q = {}) {
    return this._col().countDocuments(q);
  }
}
