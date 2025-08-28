/* eslint-env node */
import { WebSocketServer } from 'ws'

export default class WSManager {
  constructor({ participantsService = null, answerService = null, questionService = null, fetchActiveQuestion = null, options = {} } = {}) {
    this.participantsService = participantsService
    this.answerService = answerService
    this.questionService = questionService
    // optional callback to fetch active question by classId
    this.fetchActiveQuestion = fetchActiveQuestion || (async (cid) => null)

    // internal maps
    this.wsClients = new Set()
    this.classSubs = new Map()
    this.wsToClasses = new Map()

    this.wss = new WebSocketServer({ noServer: true })
  }

  attach(server) {
    server.on('upgrade', (request, socket, head) => {
      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this._onConnection(ws)
      })
    })
  }

  _onConnection(ws) {
    this.wsClients.add(ws)
    ws.on('close', () => this._onClose(ws))
    ws.on('message', async (msg) => {
      await this._onMessage(ws, msg)
    })
  }

  async _onMessage(ws, msg) {
    let parsed = null
    try { parsed = JSON.parse(String(msg)) } catch (e) { /* ignore parse */ }
    const obj = parsed || (() => { try { return JSON.parse(String(msg)) } catch(e) { return null } })()
    if (!obj) return

    try {
      if (obj.type === 'subscribe' && obj.classId) return await this._handleSubscribe(ws, obj)
      if (obj.type === 'ping' && obj.classId && obj.sessionId) return await this._handlePing(ws, obj)
      if (obj.type === 'answer' && obj.classId && obj.sessionId && obj.questionId) return await this._handleAnswer(ws, obj)
      if (obj.type === 'unsubscribe' && obj.classId) return await this._handleUnsubscribe(ws, obj)
      if (obj.type === 'reveal' && obj.classId && obj.questionId && typeof obj.correctAnswer !== 'undefined') return await this._handleReveal(ws, obj)
    } catch (e) {
      try { ws.send(JSON.stringify({ type: 'error', message: String(e) })) } catch (er) { /* ignore */ }
    }
  }

  async _handleSubscribe(ws, obj) {
    const cid = obj.classId
    const sessionId = obj.sessionId || null
    const role = obj.role || 'student'
    // add to clients set and subscription maps
    this.wsClients.add(ws)
    if (!this.classSubs.has(cid)) this.classSubs.set(cid, new Set())
    this.classSubs.get(cid).add(ws)
    if (!this.wsToClasses.has(ws)) this.wsToClasses.set(ws, new Set())
    this.wsToClasses.get(ws).add(cid)
    try { if (sessionId) ws._sessionId = sessionId } catch (e) { /* ignore */ }
    try { ws._role = role } catch (e) { /* ignore */ }
    if (sessionId && role === 'student' && this.participantsService && typeof this.participantsService.handleSubscribe === 'function') {
      await this.participantsService.handleSubscribe({ classId: cid, sessionId, role, displayName: obj.displayName })
    }
    try { ws.send(JSON.stringify({ type: 'subscribed', classId: cid, role })) } catch (e) { /* ignore */ }
    // send active question if present
    try {
      const active = await this.fetchActiveQuestion(cid)
      if (role === 'student' && active && active.question) {
        const q = { ...active.question }
        const totalDuration = (q.duration && Number(q.duration)) ? Number(q.duration) : 30
        const elapsed = Math.floor((Date.now() - (active.startedAt || Date.now()))/1000)
        const remaining = Math.max(0, totalDuration - elapsed)
        q.duration = remaining
        try { ws.send(JSON.stringify({ type: 'question-launched', classId: cid, question: q })) } catch(e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
  }

  async _handlePing(ws, obj) {
    const cid = obj.classId
    const sid = obj.sessionId
    if (this.participantsService && typeof this.participantsService.handlePing === 'function') {
      await this.participantsService.handlePing(cid, sid)
    }
  }

  async _handleAnswer(ws, obj) {
    const payload = obj || {}
    const active = await this.fetchActiveQuestion(payload.classId)
    if (this.answerService && typeof this.answerService.submitAnswer === 'function') {
      await this.answerService.submitAnswer({ classId: payload.classId, sessionId: payload.sessionId, questionId: payload.questionId, answer: payload.answer, evaluation: payload.evaluation, activeQuestion: active ? { question: active.question, startedAt: active.startedAt } : null })
    }
  }

  async _handleUnsubscribe(ws, obj) {
    const cid = obj.classId
    const sessionId = obj.sessionId || null
    const set = this.classSubs.get(cid)
    if (set) set.delete(ws)
    const wsSet = this.wsToClasses.get(ws)
    if (wsSet) {
      wsSet.delete(cid)
      if (wsSet.size === 0) this.wsToClasses.delete(ws)
    }
    if (sessionId && this.participantsService && typeof this.participantsService.handleDisconnect === 'function') {
      await this.participantsService.handleDisconnect(cid, sessionId)
    }
  }

  async _handleReveal(ws, obj) {
    if (ws._role !== 'teacher') {
      try { ws.send(JSON.stringify({ type: 'error', message: 'forbidden' })) } catch(e) { /* ignore */ }
      return
    }
    const classId = obj.classId
    const questionId = obj.questionId
    const correctAnswer = obj.correctAnswer
    const points = obj.points || 100
    if (this.questionService && typeof this.questionService.revealQuestion === 'function') {
      // fetch active question and delegate to questionService
      const active = await this.fetchActiveQuestion(classId)
      await this.questionService.revealQuestion({ classId, questionId, correctAnswer, points, activeQuestion: active })
    }
  }

  publish(type, payload, classId) {
    const raw = JSON.stringify(payload)
    let targets = []
    if (classId) {
      const set = this.classSubs.get(classId)
      if (set && set.size) targets = Array.from(set)
    } else {
      targets = Array.from(this.wsClients)
    }
    for (const s of targets) {
      try { s.send(raw) } catch(e) { /* ignore per socket errors */ }
    }
  }

  _onClose(ws) {
    const set = this.wsToClasses.get(ws)
    if (set) {
      for (const cid of set) {
        const s = this.classSubs.get(cid)
        if (s) s.delete(ws)
        if (s && s.size === 0) this.classSubs.delete(cid)
        const sid = ws._sessionId || null
        if (sid && this.participantsService && typeof this.participantsService.handleDisconnect === 'function') {
          // best-effort
          try { this.participantsService.handleDisconnect(cid, sid) } catch (e) { /* ignore */ }
        }
      }
      this.wsToClasses.delete(ws)
    }
    this.wsClients.delete(ws)
  }
}
