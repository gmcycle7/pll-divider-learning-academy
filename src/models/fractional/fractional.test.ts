import { describe, expect, it } from 'vitest'
import { analyzeSequence, simplePatternFor, parseSequence, dftMagnitude } from './sequence'
import { runDsm } from './dsm'

describe('fractional sequence', () => {
  it('2,3,3,3,2,3,3,3 averages to 2.75', () => {
    const a = analyzeSequence([2, 3, 3, 3, 2, 3, 3, 3])
    expect(a.average).toBe(2.75)
    expect(a.edgeTimes).toEqual([0, 2, 5, 8, 11, 13, 16, 19, 22])
    expect(a.edgeError[1]).toBeCloseTo(-0.75)
    expect(a.edgeError[4]).toBeCloseTo(0)
    expect(a.peakToPeak).toBeCloseTo(0.75)
  })
  it('simplePatternFor 2 + 3/4 → 2,3,3,3 (rotated)', () => {
    const s = simplePatternFor(2, 3, 4)
    expect(s.reduce((a, b) => a + b, 0)).toBe(11)
    expect(s.sort()).toEqual([2, 3, 3, 3])
  })
  it('parseSequence', () => {
    expect(parseSequence('2, 3 3\n3')).toEqual([2, 3, 3, 3])
  })
  it('dft of periodic error has a tone at 1/period', () => {
    const a = analyzeSequence(Array(8).fill([2, 3, 3, 3]).flat())
    const { freq, mag } = dftMagnitude(a.edgeError.slice(1))
    const peak = mag.indexOf(Math.max(...mag))
    expect(freq[peak]).toBeCloseTo(0.25)
  })
})

describe('DSM', () => {
  it('MASH-1 average equals k/m', () => {
    const r = runDsm({ k: 3, m: 8, order: 1, length: 800 })
    expect(r.average).toBeCloseTo(3 / 8, 6)
    expect(r.deltas.every((d) => d === 0 || d === 1)).toBe(true)
  })
  it('MASH-1-1 average equals k/m with deltas in −1..2', () => {
    const r = runDsm({ k: 3, m: 8, order: 2, length: 4000 })
    expect(Math.abs(r.average - 3 / 8)).toBeLessThan(0.01)
    expect(r.deltas.every((d) => d >= -1 && d <= 2)).toBe(true)
  })
  it('dither keeps long-term average close to k/m', () => {
    const r = runDsm({ k: 3, m: 64, order: 1, length: 20000, dither: true })
    expect(Math.abs(r.average - 3 / 64)).toBeLessThan(0.01)
  })
})
