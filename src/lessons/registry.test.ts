import { describe, expect, it } from 'vitest'
import { allLessons, modules } from './registry'

describe('lesson registry', () => {
  it('has unique ids and consistent module/order', async () => {
    const ids = allLessons.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(allLessons.length).toBeGreaterThanOrEqual(12)
    for (const m of modules) {
      for (const meta of m.lessons) {
        const mod = await meta.load()
        const def = mod.default
        expect(def.id).toBe(meta.id)
        expect(def.module).toBe(m.id)
        expect(def.order).toBe(meta.order)
        expect(def.title.length).toBeGreaterThan(0)
        expect(def.goals.length).toBeGreaterThan(0)
        expect(def.quiz.length).toBeGreaterThanOrEqual(4)
        const qids = def.quiz.map((q) => q.id)
        expect(new Set(qids).size).toBe(qids.length)
        expect(def.exercise).toBeDefined()
      }
    }
  })
  it('has at least 30 quiz questions in total', async () => {
    let total = 0
    for (const meta of allLessons) total += (await meta.load()).default.quiz.length
    expect(total).toBeGreaterThanOrEqual(30)
  })
  it('quiz answers are within option ranges', async () => {
    for (const meta of allLessons) {
      const def = (await meta.load()).default
      for (const q of def.quiz) {
        if (q.type === 'single' || q.type === 'waveform' || q.type === 'critical-path') {
          expect(q.answer).toBeGreaterThanOrEqual(0)
          expect(q.answer).toBeLessThan(q.options.length)
        }
        if (q.type === 'multiple') {
          for (const a of q.answers) expect(a).toBeLessThan(q.options.length)
          expect(q.answers.length).toBeGreaterThan(0)
        }
        if (q.type === 'state') expect(q.answer.length).toBe(q.width)
        expect(q.explanation.length).toBeGreaterThan(0)
      }
    }
  })
})
