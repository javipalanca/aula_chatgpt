/* eslint-env node */
import { getCollection } from "../lib/db.js";

export default class ParticipantsRepo {
  constructor() {
    this.colName = "participants";
  }

  _col() {
    return getCollection(this.colName);
  }

  async upsert(doc) {
    if (!doc || !doc.id) throw new Error("doc.id required");
    const id = doc.id;
    // Build $set only for fields that are explicitly defined (avoid overwriting with undefined)
    const setFields = {};
    for (const k of Object.keys(doc)) {
      if (k === "id") continue;
      const v = doc[k];
      if (typeof v !== "undefined") setFields[k] = v;
    }

    // Ensure we always have something to set on insert (id at minimum).
    // Do NOT include fields like displayName in $setOnInsert when they are
    // present in the incoming doc, otherwise MongoDB will complain if the
    // same path appears in both $set and $setOnInsert during upsert.
    const setOnInsert = { id };

    const update = {};
    if (Object.keys(setFields).length) update.$set = setFields;
    if (Object.keys(setOnInsert).length) update.$setOnInsert = setOnInsert;

    await this._col().updateOne({ id }, update, { upsert: true });
    // return the current stored document
    try {
      return await this.findOneById(id);
    } catch (e) {
      return { id, ...setFields };
    }
  }

  async deleteByClass(classId) {
    if (!classId) return;
    await this._col().deleteMany({ classId });
  }

  async count() {
    return this._col().countDocuments();
  }

  async findOneById(id) {
    if (!id) return null;
    return this._col().findOne({ id });
  }

  async findOneByClassSession(classId, sessionId) {
    if (!classId || !sessionId) return null;
    return this._col().findOne({ classId, sessionId });
  }

  async incScore(classId, sessionId, amount = 0) {
    if (!classId || !sessionId) throw new Error("classId & sessionId required");
    await this._col().updateOne(
      { classId, sessionId },
      { $inc: { score: Number(amount) || 0 }, $set: { lastSeen: new Date() } },
      { upsert: true },
    );
  }

  async listConnected(classId, { includeDisconnected = false } = {}) {
    const q = includeDisconnected ? { classId } : { classId, connected: true };
    let cursorOrArray = this._col().find(q);
    // if find returned a promise, await it
    if (cursorOrArray && typeof cursorOrArray.then === "function") {
      try {
        cursorOrArray = await cursorOrArray;
      } catch (e) {
        cursorOrArray = null;
      }
    }
    let docs = [];
    if (cursorOrArray && typeof cursorOrArray.toArray === "function") {
      try {
        docs = await cursorOrArray.toArray();
      } catch (e) {
        docs = [];
      }
    } else if (Array.isArray(cursorOrArray)) {
      docs = cursorOrArray;
    } else if (
      cursorOrArray &&
      typeof cursorOrArray[Symbol.iterator] === "function"
    ) {
      try {
        docs = Array.from(cursorOrArray);
      } catch (e) {
        docs = [];
      }
    } else {
      docs = [];
    }
    return docs.map((d) => ({
      sessionId: d.sessionId,
      displayName: d.displayName,
      score: d.score || 0,
      lastSeen: d.lastSeen,
      connected: !!d.connected,
    }));
  }

  async markDisconnected(classId, sessionId) {
    if (!classId || !sessionId) return;
    await this._col().updateOne(
      { classId, sessionId },
      { $set: { connected: false, lastSeen: new Date() } },
      { upsert: false },
    );
  }

  async resetScores(classId) {
    if (!classId) throw new Error("classId required");
    await this._col().updateMany({ classId }, { $set: { score: 0 } });
  }
}
