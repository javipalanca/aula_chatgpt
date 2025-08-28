import { describe, it, expect, beforeEach, vi } from 'vitest'
import AnswerService from '../server/services/AnswerService.js'

describe('AnswerService', () => {
  let answersRepo
  let participantsRepo
  let evaluator
  let broadcast
  let svc

  beforeEach(() => {
    answersRepo = {
      upsert: vi.fn().mockResolvedValue(true),
      findByClassQuestion: vi.fn().mockResolvedValue([])
    }
    participantsRepo = {
      incScore: vi.fn().mockResolvedValue(true)
    }
    evaluator = {
      evaluate: vi.fn().mockResolvedValue({ score: 0.5, feedback: 'ok' })
    }
    broadcast = vi.fn()
    svc = new AnswerService({ answersRepo, participantsRepo, evaluator, broadcast })
  })

  it('submitAnswer upserts and broadcasts counts', async () => {
    // simulate existing docs so counts include the new one
    answersRepo.findByClassQuestion.mockResolvedValue([{ answer: 'a' }, { answer: 'b' }])
    await svc.submitAnswer({ classId: 'C1', sessionId: 'S1', questionId: 'Q1', answer: 'a' })
    // initial upsert
    expect(answersRepo.upsert).toHaveBeenCalled()
    // broadcast answers-updated and answers-count
    const types = broadcast.mock.calls.map(c => c[0] && c[0].type)
    expect(types).toContain('answers-updated')
    expect(types).toContain('answers-count')
  })

  it('submitAnswer handles client-provided evaluation and awards points', async () => {
    const activeQuestion = { question: { payload: { evaluation: 'open', points: 100, duration: 30 } }, startedAt: Date.now() - 5000 }
    const evaluation = { score: 80, feedback: 'nice' }
    await svc.submitAnswer({ classId: 'C2', sessionId: 'S2', questionId: 'Q2', answer: 'ans', evaluation, activeQuestion })
    // should upsert initial answer and then upsert with evaluation
    expect(answersRepo.upsert).toHaveBeenCalled()
    // should award points via participantsRepo.incScore
    expect(participantsRepo.incScore).toHaveBeenCalled()
    // should upsert evaluation attached
    const hasEvalUpsert = answersRepo.upsert.mock.calls.some(call => call[0] && call[0].evaluation && call[0].evaluation.source === 'client')
    expect(hasEvalUpsert).toBe(true)
    // broadcast answer-evaluated
    const types = broadcast.mock.calls.map(c => c[0] && c[0].type)
    expect(types).toContain('answer-evaluated')
  })

  it('submitAnswer uses evaluator when no client evaluation and awards points', async () => {
    const activeQuestion = { question: { payload: { evaluation: 'prompt', points: 50, duration: 30 } }, startedAt: Date.now() - 2000 }
    evaluator.evaluate.mockResolvedValue({ score: 0.6, feedback: 'pretty good' })
    await svc.submitAnswer({ classId: 'C3', sessionId: 'S3', questionId: 'Q3', answer: 'text', evaluation: null, activeQuestion })
    // evaluator called
    expect(evaluator.evaluate).toHaveBeenCalled()
    // participantsRepo.incScore called with positive award
    expect(participantsRepo.incScore).toHaveBeenCalled()
    const hasServerEval = answersRepo.upsert.mock.calls.some(call => call[0] && call[0].evaluation && call[0].evaluation.source === 'server')
    expect(hasServerEval).toBe(true)
    const types = broadcast.mock.calls.map(c => c[0] && c[0].type)
    expect(types).toContain('answer-evaluated')
  })

  it('submitAnswer rejects when upsert fails', async () => {
    answersRepo.upsert.mockRejectedValue(new Error('DB fail'))
    await expect(svc.submitAnswer({ classId: 'ERR', sessionId: 'E', questionId: 'Q', answer: 'x' })).rejects.toThrow('DB fail')
  })
})
