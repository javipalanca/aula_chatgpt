import { describe, it, expect, vi, beforeEach } from 'vitest'
import ClassService from '../server/services/ClassService.js'

describe('ClassService.resetClass', () => {
  let classesRepo
  let answersRepo
  let participantService
  let broadcastService
  let service

  beforeEach(() => {
    classesRepo = {
      update: vi.fn(async (_id, _updates) => ({ ok: true })),
      findById: vi.fn(async (_id) => ({ id: _id, meta: { foo: 'bar' } })),
      find: vi.fn(async () => [])
    }

    answersRepo = {
      deleteByClass: vi.fn(async (_id) => true)
    }

    participantService = {
      resetScores: vi.fn(async (_id) => true),
      fetchConnectedParticipants: vi.fn(async (_id) => [{ sessionId: 's1', displayName: 'A', score: 0 }])
    }

    broadcastService = {
      publish: vi.fn(() => true)
    }

  service = new ClassService({ classesRepo, answersRepo, participantService, broadcastService, getDefaultMeta: () => ({}) })
  })

  it('updates meta and deletes answers and resets scores and broadcasts', async () => {
  const defaultMeta = { currentBlockIndex: 0 }
  service.getDefaultMeta = () => defaultMeta
  const res = await service.resetClass('C1')

  expect(classesRepo.update).toHaveBeenCalledWith('C1', { meta: defaultMeta })
    expect(answersRepo.deleteByClass).toHaveBeenCalledWith('C1')
    expect(participantService.resetScores).toHaveBeenCalledWith('C1')
    expect(broadcastService.publish).toHaveBeenCalled()
    expect(res).toBeTruthy()
    expect(classesRepo.findById).toHaveBeenCalledWith('C1')
  })

  it('works even if optional deps are missing', async () => {
  service.getDefaultMeta = () => ({})
  const res = await service.resetClass('C2')
  expect(classesRepo.update).toHaveBeenCalledWith('C2', { meta: {} })
    expect(res).toBeTruthy()
  })

  it('continues when answersRepo.deleteByClass throws', async () => {
    const defaultMeta = { foo: 'x' }
  answersRepo.deleteByClass = vi.fn(async (_id) => { throw new Error('delete fail') })
  service.answersRepo = answersRepo
  service.getDefaultMeta = () => defaultMeta
  const res = await service.resetClass('C3')
    expect(classesRepo.update).toHaveBeenCalledWith('C3', { meta: defaultMeta })
    expect(res).toBeTruthy()
  })

  it('continues when participantService.resetScores throws', async () => {
    const defaultMeta = { foo: 'y' }
  participantService.resetScores = vi.fn(async (_id) => { throw new Error('reset fail') })
  service.participantService = participantService
  service.getDefaultMeta = () => defaultMeta
  const res = await service.resetClass('C4')
    expect(classesRepo.update).toHaveBeenCalledWith('C4', { meta: defaultMeta })
    expect(res).toBeTruthy()
  })

  it('continues when broadcast.publish throws', async () => {
    const defaultMeta = { foo: 'z' }
  broadcastService.publish = vi.fn(() => { throw new Error('publish fail') })
  service.broadcastService = broadcastService
  service.getDefaultMeta = () => defaultMeta
  const res = await service.resetClass('C5')
    expect(classesRepo.update).toHaveBeenCalledWith('C5', { meta: defaultMeta })
    expect(res).toBeTruthy()
  })

  it('throws if classesRepo.update throws', async () => {
  classesRepo.update = vi.fn(async () => { throw new Error('update fail') })
  await expect(service.resetClass('C6')).rejects.toThrow('update fail')
  })
})
