/* eslint-env node */
import { WebSocketServer } from 'ws'

export default class WSManager {
  constructor({ participantsService = null, answerService = null, questionService = null, fetchActiveQuestion = null, broadcastService = null } = {}) {
    this.participantsService = participantsService
    this.answerService = answerService
    this.questionService = questionService
    // optional callback to fetch active question by classId
  this.fetchActiveQuestion = fetchActiveQuestion || (async (_cid) => null)
    // broadcastService handles client bookkeeping and publish
    this.broadcastService = broadcastService

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
  if (this.broadcastService && typeof this.broadcastService.registerClient === 'function') this.broadcastService.registerClient(ws)
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
  if (this.broadcastService && typeof this.broadcastService.subscribe === 'function') this.broadcastService.subscribe(ws, cid)
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
  if (this.broadcastService && typeof this.broadcastService.unsubscribe === 'function') this.broadcastService.unsubscribe(ws, cid)
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

  _onClose(ws) {
    // attempt participant disconnects for any classes this ws had (use broadcastService maps if available)
    try {
      const set = this.broadcastService && this.broadcastService.wsToClasses && this.broadcastService.wsToClasses.get && this.broadcastService.wsToClasses.get(ws)
      if (set && ws && ws._sessionId && this.participantsService && typeof this.participantsService.handleDisconnect === 'function') {
        for (const cid of set) {
          try { this.participantsService.handleDisconnect(cid, ws._sessionId) } catch (e) { /* ignore per-socket error */ }
        }
      }
    } catch (e) { /* ignore */ }

    // delegate unregister to broadcastService to cleanup subscriptions
    if (this.broadcastService && typeof this.broadcastService.unregisterClient === 'function') {
      try { this.broadcastService.unregisterClient(ws) } catch (e) { /* ignore */ }
    }
  }
}
