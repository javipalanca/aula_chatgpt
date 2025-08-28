import { getCollection } from '../lib/db.js'

export default class ProgressRepo {
  constructor(colName = 'progress') {
    this.colName = colName
  }
  _col() { return getCollection(this.colName) }

  async upsert(doc) {
    if (!doc || !doc.id) throw new Error('id required')
    return this._col().replaceOne({ id: doc.id }, doc, { upsert: true })
  }

  async findById(id) {
    if (!id) return null
    return this._col().findOne({ id })
  }

  async find(q = {}) {
    const res = this._col().find(q)
    if (res && typeof res.toArray === 'function') return await res.toArray()
    if (Array.isArray(res)) return res
    const out = []
    try { for await (const r of res) out.push(r); return out } catch (e) { return out }
  }

  async deleteById(id) {
    if (!id) throw new Error('id required')
    return this._col().deleteOne({ id })
  }

  async count(q = {}) {
    return this._col().countDocuments(q)
  }
}
