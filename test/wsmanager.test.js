import { describe, it, expect, beforeEach, vi } from 'vitest'
import WSManager from '../server/services/WSManager.js'

describe('WSManager', () => {
  let participantsService
  let answerService
  let questionService
  let fetchActiveQuestion
  let svc

  beforeEach(() => {
    participantsService = {
      handleSubscribe: vi.fn().mockResolvedValue(true),
      handlePing: vi.fn().mockResolvedValue(true),
      handleDisconnect: vi.fn().mockResolvedValue(true)
    }
    answerService = { submitAnswer: vi.fn().mockResolvedValue(true) }
    questionService = { revealQuestion: vi.fn().mockResolvedValue(true) }
    fetchActiveQuestion = vi.fn().mockResolvedValue(null)
    svc = new WSManager({ participantsService, answerService, questionService, fetchActiveQuestion })
  })

  it('subscribe acknowledges and calls participantService.handleSubscribe', async () => {
    // simulate ws object
    const ws = { send: vi.fn(), on: vi.fn() }
    const obj = { type: 'subscribe', classId: 'C1', sessionId: 'S1', role: 'student', displayName: 'X' }
    await svc._handleSubscribe(ws, obj)
    expect(participantsService.handleSubscribe).toHaveBeenCalledWith({ classId: 'C1', sessionId: 'S1', role: 'student', displayName: 'X' })
    expect(ws.send).toHaveBeenCalled()
  })

  it('ping delegates to participantsService.handlePing', async () => {
    const ws = { send: vi.fn(), on: vi.fn() }
    const obj = { type: 'ping', classId: 'C2', sessionId: 'S2' }
    await svc._handlePing(ws, obj)
    expect(participantsService.handlePing).toHaveBeenCalledWith('C2', 'S2')
  })

  it('answer forwards to answerService.submitAnswer', async () => {
    fetchActiveQuestion.mockResolvedValue({ question: { payload: {} }, startedAt: Date.now() - 1000 })
    const ws = { send: vi.fn(), on: vi.fn() }
    const obj = { type: 'answer', classId: 'C3', sessionId: 'S3', questionId: 'Q3', answer: 'resp' }
    await svc._handleAnswer(ws, obj)
    expect(answerService.submitAnswer).toHaveBeenCalled()
  })

  it('reveal delegates to questionService.revealQuestion for teacher', async () => {
    const ws = { send: vi.fn(), on: vi.fn(), _role: 'teacher' }
    fetchActiveQuestion.mockResolvedValue({ question: { payload: {} }, startedAt: Date.now() - 1000 })
    const obj = { type: 'reveal', classId: 'C4', questionId: 'Q4', correctAnswer: 'A', points: 100 }
    await svc._handleReveal(ws, obj)
    expect(questionService.revealQuestion).toHaveBeenCalledWith({ classId: 'C4', questionId: 'Q4', correctAnswer: 'A', points: 100, activeQuestion: { question: { payload: {} }, startedAt: expect.any(Number) } })
  })

  it('ignores malformed (non-json) messages', async () => {
    const ws = { send: vi.fn(), on: vi.fn() }
    // send a plain string that is not JSON
    await svc._onMessage(ws, 'not a json')
    expect(ws.send).not.toHaveBeenCalled()
  })

  it('returns forbidden when non-teacher tries to reveal', async () => {
    const ws = { send: vi.fn(), on: vi.fn() }
    const obj = { type: 'reveal', classId: 'C5', questionId: 'Q5', correctAnswer: 'X', points: 10 }
    await svc._onMessage(ws, JSON.stringify(obj))
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'error', message: 'forbidden' }))
  })

  it('publish sends only to subscribers for a class', () => {
    // create mock sockets
    const wsA = { send: vi.fn() }
    const wsB = { send: vi.fn() }
    const wsC = { send: vi.fn() }
    // register clients and class subscribers
    svc.wsClients.add(wsA)
    svc.wsClients.add(wsB)
    svc.wsClients.add(wsC)
    svc.classSubs.set('CLX', new Set([wsA, wsB]))

    const payload = { type: 'event', data: 123 }
    svc.publish('event', payload, 'CLX')

    expect(wsA.send).toHaveBeenCalledWith(JSON.stringify(payload))
    expect(wsB.send).toHaveBeenCalledWith(JSON.stringify(payload))
    expect(wsC.send).not.toHaveBeenCalled()
  })

  it('publish is resilient when a socket.send throws and continues for other sockets', () => {
    const ws1 = { send: vi.fn(() => { throw new Error('broken') }) }
    const ws2 = { send: vi.fn() }
    svc.wsClients.add(ws1)
    svc.wsClients.add(ws2)
    svc.classSubs.set('CLZ', new Set([ws1, ws2]))

    const payload = { hello: 'world' }
    // should not throw
    expect(() => svc.publish('e', payload, 'CLZ')).not.toThrow()
    expect(ws2.send).toHaveBeenCalledWith(JSON.stringify(payload))
  })

  it('subscribe registers ws in maps and sets sessionId/role', async () => {
    const ws = { send: vi.fn(), on: vi.fn() }
    const obj = { type: 'subscribe', classId: 'CLASSREG', sessionId: 'SREG', role: 'student', displayName: 'Pedro' }
    await svc._handleSubscribe(ws, obj)
    expect(svc.classSubs.get('CLASSREG').has(ws)).toBe(true)
    expect(svc.wsToClasses.get(ws).has('CLASSREG')).toBe(true)
    expect(ws._sessionId).toBe('SREG')
    expect(ws._role).toBe('student')
  })

  it('student receives question-launched on subscribe but teacher does not', async () => {
    fetchActiveQuestion.mockResolvedValue({ question: { id: 'QX', payload: {}, duration: 60 }, startedAt: Date.now() - 1000 })
    const wsStudent = { send: vi.fn(), on: vi.fn() }
    const wsTeacher = { send: vi.fn(), on: vi.fn() }
    await svc._handleSubscribe(wsStudent, { type: 'subscribe', classId: 'CLQT', sessionId: 'SS', role: 'student' })
    await svc._handleSubscribe(wsTeacher, { type: 'subscribe', classId: 'CLQT', sessionId: 'ST', role: 'teacher' })
    // student should have received both subscribed and question-launched
    expect(wsStudent.send.mock.calls.some(c => c[0].includes('question-launched'))).toBe(true)
    // teacher should not receive question-launched
    expect(wsTeacher.send.mock.calls.some(c => c[0].includes('question-launched'))).toBe(false)
  })

  it('unsubscribe removes subscription and calls handleDisconnect when sessionId provided', async () => {
    const ws = { send: vi.fn(), on: vi.fn() }
    await svc._handleSubscribe(ws, { type: 'subscribe', classId: 'CLUN', sessionId: 'SUN', role: 'student' })
    expect(svc.classSubs.get('CLUN').has(ws)).toBe(true)
    await svc._handleUnsubscribe(ws, { type: 'unsubscribe', classId: 'CLUN', sessionId: 'SUN' })
    expect(svc.classSubs.get('CLUN') && svc.classSubs.get('CLUN').has(ws)).toBe(false)
    expect(participantsService.handleDisconnect).toHaveBeenCalledWith('CLUN', 'SUN')
  })

  it('publish without classId sends to all connected clients', () => {
    const a = { send: vi.fn() }
    const b = { send: vi.fn() }
    svc.wsClients.add(a)
    svc.wsClients.add(b)
    const payload = { all: 1 }
    svc.publish('notice', payload)
    expect(a.send).toHaveBeenCalledWith(JSON.stringify(payload))
    expect(b.send).toHaveBeenCalledWith(JSON.stringify(payload))
  })

  it('ignores JSON messages missing required fields (no-op)', async () => {
    const ws = { send: vi.fn(), on: vi.fn() }
    await svc._onMessage(ws, JSON.stringify({ type: 'answer' }))
    expect(ws.send).not.toHaveBeenCalled()
  })

  it('subscribe tolerates socket.send throwing (no crash)', async () => {
    const ws = { send: vi.fn(() => { throw new Error('boom') }), on: vi.fn() }
    fetchActiveQuestion.mockResolvedValue(null)
    await expect(svc._handleSubscribe(ws, { type: 'subscribe', classId: 'CT', sessionId: 'SS', role: 'student' })).resolves.not.toThrow()
  })

  it('_onClose cleans maps and calls participantsService.handleDisconnect for sessioned sockets', () => {
    const ws = { send: vi.fn(), on: vi.fn(), _sessionId: 'SCLOSE' }
    // simulate that ws is subscribed to two classes
    svc.wsToClasses.set(ws, new Set(['A', 'B']))
    svc.classSubs.set('A', new Set([ws]))
    svc.classSubs.set('B', new Set([ws]))
    svc.wsClients.add(ws)
    svc._onClose(ws)
  expect(svc.wsToClasses.has(ws)).toBe(false)
  // classSubs should not contain the classes anymore
  expect(svc.classSubs.has('A')).toBe(false)
  expect(svc.classSubs.has('B')).toBe(false)
  // ensure handleDisconnect was invoked for the sessioned socket for each class
  expect(participantsService.handleDisconnect).toHaveBeenCalledWith('A', 'SCLOSE')
  expect(participantsService.handleDisconnect).toHaveBeenCalledWith('B', 'SCLOSE')
  })
})
