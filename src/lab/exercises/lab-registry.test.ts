import { describe, expect, it } from 'vitest'
import { exercises } from './index'
import { WORKSHEET_QUESTIONS } from '@/components/lab/worksheet'

describe('lab exercises', () => {
  it('has 8 exercises with ids, hints and 15 reference answers', () => {
    expect(exercises.length).toBe(8)
    const ids = exercises.map((e) => e.id)
    expect(new Set(ids).size).toBe(8)
    for (const e of exercises) {
      expect(e.hints.length).toBe(3)
      for (const q of WORKSHEET_QUESTIONS) expect((e.reference[q.key] ?? '').length, `${e.id} ${q.key}`).toBeGreaterThan(0)
      expect(e.netlist.flops.length + (e.netlist.latches?.length ?? 0)).toBeGreaterThan(0)
      expect(e.schematic.elements.length).toBeGreaterThan(0)
    }
    const orders = exercises.map((e) => e.order)
    expect([...orders].sort((a, b) => a - b)).toEqual(orders)
  })
})
