import { describe, it, expect, beforeEach, vi } from 'vitest'
import QuestionService from '../server/services/QuestionService.js'

describe('QuestionService', () => {
  let answersRepo
  let participantsRepo
  let evaluator
  let broadcast
  let svc

  beforeEach(() => {
    answersRepo = {
      findByClassQuestion: vi.fn().mockResolvedValue([])
    }
    participantsRepo = {
      incScore: vi.fn().mockResolvedValue(true),
      listConnected: vi.fn().mockResolvedValue([])
    }
    evaluator = {
      evaluate: vi.fn().mockResolvedValue({ score: 0.5, feedback: 'ok' })
    }
    broadcast = vi.fn()
    svc = new QuestionService({ answersRepo, participantsRepo, evaluator, broadcast })
  })

  it('revealQuestion computes distribution and awards MCQ points', async () => {
    const docs = [
      { sessionId: 's1', answer: 'A', created_at: new Date(Date.now() - 5000) },
      { sessionId: 's2', answer: 'B', created_at: new Date(Date.now() - 4000) },
      { sessionId: 's3', answer: 'A', created_at: new Date(Date.now() - 3000) }
    ]
    answersRepo.findByClassQuestion.mockResolvedValue(docs)
    const activeQuestion = { question: { duration: 30, payload: { /* mcq default */ } }, startedAt: Date.now() - 10000 }
    const res = await svc.revealQuestion({ classId: 'C1', questionId: 'Q1', correctAnswer: 'A', points: 100, activeQuestion })
    expect(answersRepo.findByClassQuestion).toHaveBeenCalledWith('C1', 'Q1')
    // distribution should count answers
    expect(res.distribution['A']).toBe(2)
    expect(res.distribution['B']).toBe(1)
    // incScore should be called for each correct answer (s1 and s3)
    expect(participantsRepo.incScore).toHaveBeenCalled()
    // broadcasts
    const types = broadcast.mock.calls.map(c => c[0] && c[0].type)
    expect(types).toContain('question-results')
    expect(types).toContain('participants-updated')
  })

  it('revealQuestion uses evaluator for open/prompt and returns evaluations', async () => {
    const docs = [
      { sessionId: 'sA', answer: 'texto A', created_at: new Date(Date.now() - 2000) },
      { sessionId: 'sB', answer: 'texto B', created_at: new Date(Date.now() - 1000) }
    ]
    answersRepo.findByClassQuestion.mockResolvedValue(docs)
    evaluator.evaluate.mockResolvedValue({ score: 60, feedback: 'bien' })
    const activeQuestion = { question: { payload: { evaluation: 'prompt', points: 50, duration: 30 } }, startedAt: Date.now() - 5000 }
    const res = await svc.revealQuestion({ classId: 'C2', questionId: 'Q2', correctAnswer: null, points: 50, activeQuestion })
    // evaluator called for each answer
    expect(evaluator.evaluate).toHaveBeenCalled()
    // incScore called at least once (awarded > 0 for positive score/time)
    expect(participantsRepo.incScore).toHaveBeenCalled()
    // returned evaluations match docs length
    expect(Array.isArray(res.evaluations)).toBe(true)
    expect(res.evaluations.length).toBe(2)
    expect(res.evaluations[0]).toHaveProperty('sessionId')
    expect(res.evaluations[0]).toHaveProperty('score')
  })
})
