import { getCollection } from '../lib/db.js'

export default class AnswersRepo {
  constructor(opts = {}) {
    // opts can be: colName string or { db, colName }
    if (typeof opts === 'string') opts = { colName: opts }
    this.colName = (opts && opts.colName) ? opts.colName : 'answers'
    this._db = opts && opts.db ? opts.db : null
  }

  _col() {
    if (this._db) return this._db.collection(this.colName)
    return getCollection(this.colName)
  }

  async upsert(doc) {
    if (!doc || !doc.id) throw new Error('upsert requires doc.id')
    return this._col().replaceOne({ id: doc.id }, doc, { upsert: true })
  }

  // Return an array of docs for a generic query; tolerant to driver shapes
  async find(q = {}) {
    const res = this._col().find(q)
    try {
      if (typeof res.toArray === 'function') return await res.toArray()
      if (Array.isArray(res)) return res
      // fallback: try to iterate
      const out = []
      for await (const r of res) out.push(r)
      return out
    } catch (e) {
      // Last resort: return empty array
      return []
    }
  }

  async findByClassQuestion(classId, questionId) {
    const q = {}
    if (classId) q.classId = classId
    if (questionId) q.questionId = questionId
    return this.find(q)
  }

  async findById(id) {
    if (!id) return null
    return this._col().findOne({ id })
  }

  async deleteByClass(classId) {
    if (!classId) return
    return this._col().deleteMany({ classId })
  }

  async count(q = {}) {
    return this._col().countDocuments(q)
  }
}
