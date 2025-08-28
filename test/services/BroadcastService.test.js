import { describe, it, expect, beforeEach, vi } from 'vitest'
import BroadcastService from '../../server/services/BroadcastService.js'

describe('BroadcastService', () => {
  let svc
  beforeEach(() => {
    svc = new BroadcastService({ logger: { log: vi.fn(), warn: vi.fn() } })
  })

  it('registers clients and broadcasts to all when no class specified', () => {
    const a = { send: vi.fn() }
    const b = { send: vi.fn() }
    svc.registerClient(a)
    svc.registerClient(b)

    const payload = { type: 'some-event', payload: { hello: 'world' } }
    svc.publish(payload)

    const raw = JSON.stringify(payload)
    expect(a.send).toHaveBeenCalledWith(raw)
    expect(b.send).toHaveBeenCalledWith(raw)
  })

  it('publishes only to subscribers of a class', () => {
    const a = { send: vi.fn() }
    const b = { send: vi.fn() }
    svc.registerClient(a)
    svc.registerClient(b)
    svc.subscribe(a, 'class1')

    const payload = { type: 'class-event', payload: { x: 1 } }
    svc.publish(payload, 'class1')

    const raw = JSON.stringify(payload)
    expect(a.send).toHaveBeenCalledWith(raw)
    expect(b.send).not.toHaveBeenCalled()
  })

  it('unsubscribe removes subscription so publish no longer reaches client', () => {
    const a = { send: vi.fn() }
    svc.registerClient(a)
    svc.subscribe(a, 'c')
    svc.unsubscribe(a, 'c')

    svc.publish({ type: 'x' }, 'c')
    expect(a.send).not.toHaveBeenCalled()
  })

  it('unregisterClient removes client and its subscriptions', () => {
    const a = { send: vi.fn() }
    svc.registerClient(a)
    svc.subscribe(a, 'c')
    svc.unregisterClient(a)

    // no broadcast to class
    svc.publish({ type: 'x' }, 'c')
    expect(a.send).not.toHaveBeenCalled()

    // no broadcast to all
    svc.publish({ type: 'y' })
    expect(a.send).not.toHaveBeenCalled()
  })

  it('logs broadcasting for question-launched/question-results', () => {
    const logger = { log: vi.fn(), warn: vi.fn() }
    svc = new BroadcastService({ logger })
    const a = { send: vi.fn() }
    svc.registerClient(a)

    const payload = { type: 'question-launched', payload: { q: 1 } }
    svc.publish(payload, 'classX')

    expect(logger.log).toHaveBeenCalled()
  })

  it('warns when ws.send throws', () => {
    const warn = vi.fn()
    const logger = { log: vi.fn(), warn }
    svc = new BroadcastService({ logger })
    const a = { send: vi.fn(() => { throw new Error('boom') }) }
    svc.registerClient(a)

    svc.publish({ type: 'x' })
    expect(warn).toHaveBeenCalled()
  })
})
