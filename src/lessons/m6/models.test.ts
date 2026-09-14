import { describe, expect, it } from 'vitest'
import type { Netlist } from '@/models/divider/types'
import type { Schematic } from '@/components/circuit/schematic'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, detectRuntPulses, findPeriod, measureDivide, nextStateOf, stateSequence } from '@/models/divider/analysis'
import { accumulate, splitCode } from '@/models/phase/dtc'
import { rotatingEdges } from '@/models/phase/pmux'
import { analyzeSequence, dftMagnitude, simplePatternFor } from '@/models/fractional/sequence'
import { runDsm } from '@/models/fractional/dsm'
import { analyzeSetup } from '@/models/timing/sta'
import {
  frac275,
  frac225,
  frac2375,
  phaseCounter8,
  phaseCounter16,
  carryEdgeTraces,
  fineCodePeriod,
  runDualModSequence,
  runMmdSequence,
  divideValues,
  carryTimeline,
  dtcTimeline,
  codeBits,
  dsmStats,
  strictPeriod,
  stdDev,
  lowpass1,
} from './models'
import {
  frac275Schematic,
  frac225Schematic,
  frac2375Schematic,
  phaseCounter8Schematic,
  phaseCounter8Timing,
  phaseCounter16Schematic,
} from './schematics'

const T = 100

describe('frac275：accumulator /2.75（/2 /3 cell + 2-bit accumulator）', () => {
  it('state sequence from reset has period 11 and follows the expected order', () => {
    const { records } = simulate(frac275, 22, { period: T })
    const seq = stateSequence(frac275, records)
    expect(seq.slice(0, 11)).toEqual(['0001', '1100', '1101', '1010', '1000', '1001', '0110', '0100', '0101', '0010', '0000'])
    expect(findPeriod(seq)).toEqual({ period: 11, start: 0 })
  })
  it('output rising edges at 2,5,8,11,13,16,19,22 ⇒ pattern 2,3,3,3 and average 2.75', () => {
    const { traces } = simulate(frac275, 23, { period: T })
    const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T, 0)
    expect(m.risingTimes.map((t) => t / T)).toEqual([2, 5, 8, 11, 13, 16, 19, 22])
    // edge 0 是 reset state（00）的 high；之後每個 output 週期 = 2 或 3 個 Tin
    const cycles = [2, ...m.intervals]
    expect(cycles).toEqual([2, 3, 3, 3, 2, 3, 3, 3])
    const avg = cycles.reduce((a, b) => a + b, 0) / cycles.length
    expect(avg).toBeCloseTo(2.75, 9)
    expect(m.periodic).toBe(false)
  })
  it('duty：output high 一個 Tin；/3 週期 duty = 1/3、/2 週期 duty = 1/2', () => {
    const { traces } = simulate(frac275, 23, { period: T })
    const out = traces.find((t) => t.name === 'div_out')!
    const m = measureDivide(out, T, 0)
    // rising 2T → falling 3T（high 1T）→ rising 5T：duty = 1/3
    expect(m.duty).toBeCloseTo(1 / 3, 6)
    // reset state（00）本身是 high，第一個 falling 在 1T；之後每個 rising edge 之後恰好 1 Tin 就 falling
    expect(m.fallingTimes[0] / T).toBeCloseTo(1, 9)
    for (const r of m.risingTimes) {
      const f = m.fallingTimes.find((t) => t > r)!
      expect((f - r) / T).toBeCloseTo(1, 9)
    }
  })
  it('mod is 0 for exactly one cycle in four (accumulator K=3, M=4)', () => {
    const { records } = simulate(frac275, 22, { period: T })
    // 在 state q1q0 = 01（edge 前）取樣 mod：每個 output 週期一次
    const mods = records.filter((r) => r.stateBefore.q0 === 1 && r.stateBefore.q1 === 0).map((r) => r.combBefore.mod)
    expect(mods.slice(0, 8)).toEqual([0, 1, 1, 1, 0, 1, 1, 1])
    // 對照 runDsm：一階 accumulator k/m = 3/4 的 carry 序列
    expect(runDsm({ k: 3, m: 4, order: 1, length: 8 }).deltas).toEqual([0, 1, 1, 1, 0, 1, 1, 1])
  })
  it('state graph: 11 reachable states on the main cycle, 5 unreachable, all recover in 1 step, no lock-up', () => {
    const g = buildStateGraph(frac275, {})
    expect(g.mainCycle.length).toBe(11)
    expect(g.lockup).toEqual([])
    const unreachable = g.nodes.filter((n) => !n.reachable)
    expect(unreachable.map((n) => n.state)).toEqual(['0011', '0111', '1011', '1110', '1111'])
    for (const n of unreachable) expect(n.stepsToCycle).toBe(1)
  })
  it('next-state equations', () => {
    expect(nextStateOf(frac275, '0000', {}).next).toBe('0001')
    expect(nextStateOf(frac275, '0001', {}).next).toBe('1100') // acc 0 → 3 (decrement), mod=0 → /2 回 00
    expect(nextStateOf(frac275, '1101', {}).next).toBe('1010') // acc 3 → 2, mod=1 → 10
    expect(nextStateOf(frac275, '1010', {}).next).toBe('1000')
  })
  it('real delay mode has no runt pulses on the output', () => {
    const { traces } = simulate(frac275, 23, { period: T, delayMode: 'real' })
    expect(detectRuntPulses(traces.filter((t) => t.name === 'div_out'), 40)).toEqual([])
  })
})

describe('frac225：練習電路（up-counter accumulator，K=1, M=4）', () => {
  it('sequence 2,2,2,3 ⇒ average 2.25, state period 9', () => {
    const { records, traces } = simulate(frac225, 19, { period: T })
    const seq = stateSequence(frac225, records)
    expect(seq.slice(0, 9)).toEqual(['0001', '0100', '0101', '1000', '1001', '1100', '1101', '0010', '0000'])
    expect(findPeriod(seq)).toEqual({ period: 9, start: 0 })
    const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T, 0)
    expect(m.risingTimes.map((t) => t / T)).toEqual([2, 4, 6, 9, 11, 13, 15, 18])
    const cycles = [2, ...m.intervals]
    expect(cycles).toEqual([2, 2, 2, 3, 2, 2, 2, 3])
    expect(cycles.reduce((a, b) => a + b, 0) / cycles.length).toBeCloseTo(2.25, 9)
    expect(runDsm({ k: 1, m: 4, order: 1, length: 8 }).deltas).toEqual([0, 0, 0, 1, 0, 0, 0, 1])
  })
  it('state graph: 9-state main cycle, no lock-up, unreachable states recover in 1 step', () => {
    const g = buildStateGraph(frac225, {})
    expect(g.mainCycle.length).toBe(9)
    expect(g.lockup).toEqual([])
    for (const n of g.nodes.filter((n) => !n.reachable)) expect(n.stepsToCycle).toBe(1)
  })
  it('peak edge error of 2,2,2,3 is 0.75 Tin', () => {
    const a = analyzeSequence([2, 2, 2, 3])
    expect(a.average).toBeCloseTo(2.25, 9)
    expect(a.edgeError).toEqual([0, -0.25, -0.5, -0.75, 0])
    expect(a.peakToPeak).toBeCloseTo(0.75, 9)
  })
})

describe('phaseCounter8：3-bit phase index counter with wrap carry', () => {
  it('counts 000→001→…→111→000 and carry pulses once per 8 cycles (duty 1/8)', () => {
    const { records, traces } = simulate(phaseCounter8, 18, { period: T }, () => ({ inc: 1 }))
    const seq = stateSequence(phaseCounter8, records)
    expect(seq.slice(0, 8)).toEqual(['001', '010', '011', '100', '101', '110', '111', '000'])
    expect(findPeriod(seq)).toEqual({ period: 8, start: 0 })
    const m = measureDivide(traces.find((t) => t.name === 'carry')!, T, 0)
    expect(m.risingTimes.map((t) => t / T)).toEqual([7, 15])
    expect(m.ratio).toBe(8)
    expect(m.duty).toBeCloseTo(1 / 8, 6)
  })
  it('carry is 1 only in state 111 with inc = 1', () => {
    for (const s of ['000', '011', '110']) expect(nextStateOf(phaseCounter8, s, { inc: 1 }).output).toBe(0)
    expect(nextStateOf(phaseCounter8, '111', { inc: 1 }).output).toBe(1)
    expect(nextStateOf(phaseCounter8, '111', { inc: 0 }).output).toBe(0)
    expect(nextStateOf(phaseCounter8, '111', { inc: 1 }).next).toBe('000')
  })
  it('state graph: all 8 states on the cycle when inc = 1; frozen when inc = 0', () => {
    const g1 = buildStateGraph(phaseCounter8, { inc: 1 })
    expect(g1.mainCycle).toEqual(['000', '001', '010', '011', '100', '101', '110', '111'])
    expect(g1.lockup).toEqual([])
    expect(buildStateGraph(phaseCounter8, { inc: 0 }).mainCycle).toEqual(['000'])
  })
  it('real delay mode: no runt on carry (single 4-input AND, no chain hazard)', () => {
    const { traces } = simulate(phaseCounter8, 18, { period: T, delayMode: 'real' }, () => ({ inc: 1 }))
    expect(detectRuntPulses(traces.filter((t) => t.name === 'carry'), 40)).toEqual([])
  })
})

describe('runDualModSequence：用 dualMod23 逐週期切 mod', () => {
  it('2,3,3,3 gives edge times 0,2,5,8,11,13,… exactly as the sequence analysis', () => {
    const r = runDualModSequence([2, 3, 3, 3], 8)
    expect(r.applied).toEqual([2, 3, 3, 3, 2, 3, 3, 3])
    expect(r.intervals).toEqual([2, 3, 3, 3, 2, 3, 3, 3])
    expect(r.edgeTimes).toEqual(analyzeSequence([2, 3, 3, 3, 2, 3, 3, 3]).edgeTimes)
  })
  it('arbitrary 2/3 patterns are reproduced exactly (phase-continuous switching)', () => {
    const r = runDualModSequence([3, 2, 2, 3, 3, 2], 6)
    expect(r.intervals).toEqual([3, 2, 2, 3, 3, 2])
    for (const iv of r.intervals) expect([2, 3]).toContain(iv)
  })
  it('ignores values that are not 2 or 3', () => {
    expect(runDualModSequence([4, 5]).intervals).toEqual([])
  })
})

describe('runMmdSequence：用 mmd2 逐週期設定 N ∈ 4..7', () => {
  it('reproduces an arbitrary divide-value sequence', () => {
    const vals = [5, 5, 5, 6, 4, 7, 6, 5]
    const r = runMmdSequence(vals)
    expect(r.applied).toEqual(vals)
    expect(r.intervals).toEqual(vals)
  })
  it('MASH-1-1 deltas (−1..2) on N = 5 stay inside the MMD range 4..7 and are reproduced', () => {
    const d = runDsm({ k: 3, m: 8, order: 2, length: 16 }).deltas
    const vals = divideValues(5, d)
    expect(vals.every((v) => v >= 4 && v <= 7)).toBe(true)
    const r = runMmdSequence(vals)
    expect(r.intervals).toEqual(vals)
    const avg = r.intervals.reduce((a, b) => a + b, 0) / r.intervals.length
    expect(avg).toBeCloseTo(5 + 3 / 8, 9)
  })
})

describe('carryTimeline：carry 由誰吸收', () => {
  it('(a) divider absorbs the carry: every interval is N + 1/8 and the error is always 0', () => {
    const a = carryTimeline(4, 8, 1, 17, 'divider')
    for (let k = 1; k < a.length; k++) expect(a[k].t - a[k - 1].t).toBeCloseTo(4.125, 9)
    for (const p of a) expect(p.error).toBeCloseTo(0, 9)
    // offset from the integer grid grows monotonically：0, 1/8, …, 7/8, 1, 9/8 …
    for (let k = 1; k < a.length; k++) expect(a[k].offsetFromGrid).toBeGreaterThan(a[k - 1].offsetFromGrid)
    expect(a[7].carry).toBe(1)
    expect(a[8].integerCycles).toBe(33)
    // 與 pmux.ts 的 rotatingEdges 一致
    expect(a.map((p) => p.t)).toEqual(rotatingEdges(4, 1, 8, 17).times)
  })
  it('(b) PMUX wraps alone: the interval after the wrap is N − 7/8 and the error jumps to −1 Tvco', () => {
    const b = carryTimeline(4, 8, 1, 17, 'none')
    expect(b[8].t - b[7].t).toBeCloseTo(4 - 7 / 8, 9)
    expect(b[8].error).toBeCloseTo(-1, 9)
    expect(b[16].error).toBeCloseTo(-2, 9)
    // offset from the grid wraps back（鋸齒），不再單調
    expect(b[8].offsetFromGrid).toBeLessThan(b[7].offsetFromGrid)
    // 長期平均變成 N，而不是 N + 1/8
    expect((b[16].t - b[0].t) / 16).toBeCloseTo(4, 9)
  })
  it('N = 1 makes (b) produce an interval of only 1/8 Tvco', () => {
    const b = carryTimeline(1, 8, 1, 9, 'none')
    expect(b[8].t - b[7].t).toBeCloseTo(1 / 8, 9)
  })
})

describe('dtcTimeline：3-bit PMUX + 6-bit DTC', () => {
  const cfg = { coarseBits: 3, fineBits: 6 }
  it('matches accumulate() and splitCode() for increment 100', () => {
    const rows = dtcTimeline(100, cfg, 8, 4)
    const st = accumulate(100, cfg, 8)
    rows.forEach((r, i) => {
      expect(r.coarse).toBe(st[i].coarse)
      expect(r.fine).toBe(st[i].fine)
      expect(r.fineCarry).toBe(st[i].fineCarry)
      expect(r.coarseCarry).toBe(st[i].coarseCarry)
      const sp = splitCode(r.code, cfg)
      expect(sp.overflow).toBe(r.overflowTotal)
      expect(sp.coarse).toBe(r.coarse)
      expect(sp.fine).toBe(r.fine)
    })
    // step 3：code 300 → coarse 4, fine 44
    expect(rows[2]).toMatchObject({ code: 300, coarse: 4, fine: 44 })
    // 累加 100 六次：只有第 6 步 coarse wrap（600 = 512 + 88 → coarse 1, fine 24）
    expect(rows.slice(0, 6).filter((r) => r.coarseCarry > 0).length).toBe(1)
    expect(rows[5]).toMatchObject({ code: 600, coarse: 1, fine: 24, coarseCarry: 1, overflowTotal: 1 })
    // fine → coarse 進位：每步 1 或 2
    expect(rows.map((r) => r.fineCarry)).toEqual([1, 2, 1, 2, 1, 2, 1, 2])
  })
  it('quantized edge time equals the ideal time when the increment is an integer number of codes and gain error is 0', () => {
    for (const inc of [1, 37, 100, 255, 511]) {
      for (const r of dtcTimeline(inc, cfg, 20, 4)) expect(r.tQuant).toBeCloseTo(r.tIdeal, 9)
    }
  })
  it('edge times are strictly increasing with intervals N + inc/512 (carry absorbed by the divider)', () => {
    const rows = dtcTimeline(100, cfg, 30, 4)
    for (let i = 1; i < rows.length; i++) expect(rows[i].tQuant - rows[i - 1].tQuant).toBeCloseTo(4 + 100 / 512, 9)
    expect(rows[0].tQuant).toBeCloseTo(4 + 100 / 512, 9)
  })
  it('DTC gain error produces a residual proportional to the fine code (sawtooth)', () => {
    const rows = dtcTimeline(100, cfg, 8, 4, 5, 100)
    for (const r of rows) expect(r.residualPs).toBeCloseTo((r.fine / 512) * 0.05 * 100, 9)
    expect(Math.max(...rows.map((r) => r.residualPs))).toBeLessThan((63 / 512) * 0.05 * 100 + 1e-9)
  })
  it('codeBits lays out MSB-first with coarse bits before fine bits', () => {
    const bits = codeBits(4, 44, cfg)
    expect(bits.map((b) => b.bit).join('')).toBe('100101100')
    expect(bits.filter((b) => b.role === 'coarse').length).toBe(3)
    expect(bits[0].weight).toBe(8)
    expect(bits[8].weight).toBe(0)
  })
  it('4-bit PMUX + 5-bit DTC: fine LSB = Tvco/512 still, but the coarse step becomes Tvco/16', () => {
    const cfg2 = { coarseBits: 4, fineBits: 5 }
    expect(splitCode(300, cfg2)).toMatchObject({ coarse: 9, fine: 12 })
    const rows = dtcTimeline(100, cfg2, 6, 4)
    expect(rows[5]).toMatchObject({ code: 600, coarse: 2, fine: 24, overflowTotal: 1 })
  })
})

describe('dsmStats：Lesson 6-2 課文引用的性質', () => {
  it('simplePatternFor(4, 1, 4) → 4,4,4,5 with peak edge error 0.75', () => {
    const s = simplePatternFor(4, 1, 4)
    expect(s).toEqual([4, 4, 4, 5])
    expect(analyzeSequence(s).peakToPeak).toBeCloseTo(0.75, 9)
  })
  it('k/m = 1/4：MASH-1 period 4 with a tone at f/4; MASH-1-1 has larger p-p and larger AC RMS', () => {
    const s1 = dsmStats(16, 64, 1, false, 4, 256)
    const s2 = dsmStats(16, 64, 2, false, 4, 256)
    expect(s1.period).toBe(4)
    expect(s1.tone.freq).toBeCloseTo(0.25, 9)
    expect(s1.peakToPeak).toBeCloseTo(0.75, 9)
    expect(s2.peakToPeak).toBeCloseTo(1.0, 9)
    expect(s2.peakToPeak).toBeGreaterThan(s1.peakToPeak)
    expect(s2.rmsAc).toBeGreaterThan(s1.rmsAc)
    expect(s2.deltaMin).toBeGreaterThanOrEqual(-1)
    expect(s2.deltaMax).toBeLessThanOrEqual(2)
  })
  it('k/m = 21/64：MASH-1-1 is worse before the loop filter (p-p, RMS) but better after it', () => {
    const s1 = dsmStats(21, 64, 1, false, 4, 2048)
    const s2 = dsmStats(21, 64, 2, false, 4, 2048)
    expect(s2.peakToPeak).toBeGreaterThan(s1.peakToPeak)
    expect(s2.rmsAc).toBeGreaterThan(s1.rmsAc)
    expect(s2.rmsFiltered).toBeLessThan(s1.rmsFiltered)
  })
  it('input dither on 21/64 raises the filtered (in-band) RMS even though it breaks the tone', () => {
    const s1 = dsmStats(21, 64, 1, false, 4, 2048)
    const d1 = dsmStats(21, 64, 1, true, 4, 2048)
    expect(d1.tone.mag).toBeLessThan(s1.tone.mag)
    expect(d1.rmsFiltered).toBeGreaterThan(s1.rmsFiltered)
    expect(d1.rmsAc).toBeGreaterThan(s1.rmsAc)
  })
  it('stdDev and lowpass1 basics', () => {
    expect(stdDev([1, 1, 1, 1])).toBe(0)
    expect(stdDev([-1, 1, -1, 1])).toBeCloseTo(1, 9)
    const y = lowpass1(Array(400).fill(1), 1 / 32)
    expect(y[y.length - 1]).toBeCloseTo(1, 3)
  })
})

describe('phaseCounter16：練習用 4-bit phase index counter with wrap carry', () => {
  it('counts 0000→0001→…→1111→0000 (period 16) and carry pulses once per 16 cycles (duty 1/16)', () => {
    const { records, traces } = simulate(phaseCounter16, 34, { period: T }, () => ({ inc: 1 }))
    const seq = stateSequence(phaseCounter16, records)
    expect(seq.slice(0, 16)).toEqual(['0001', '0010', '0011', '0100', '0101', '0110', '0111', '1000', '1001', '1010', '1011', '1100', '1101', '1110', '1111', '0000'])
    expect(findPeriod(seq)).toEqual({ period: 16, start: 0 })
    const m = measureDivide(traces.find((t) => t.name === 'carry')!, T, 0)
    expect(m.risingTimes.map((t) => t / T)).toEqual([15, 31])
    expect(m.ratio).toBe(16)
    expect(m.duty).toBeCloseTo(1 / 16, 6)
  })
  it('carry is 1 only in state 1111 with inc = 1; after 5 edges from reset the state is 0101', () => {
    for (const s of ['0000', '0111', '1110']) expect(nextStateOf(phaseCounter16, s, { inc: 1 }).output).toBe(0)
    expect(nextStateOf(phaseCounter16, '1111', { inc: 1 }).output).toBe(1)
    expect(nextStateOf(phaseCounter16, '1111', { inc: 0 }).output).toBe(0)
    expect(nextStateOf(phaseCounter16, '1111', { inc: 1 }).next).toBe('0000')
    const { records } = simulate(phaseCounter16, 5, { period: T }, () => ({ inc: 1 }))
    expect(stateSequence(phaseCounter16, records)[4]).toBe('0101')
  })
  it('state graph: all 16 states on the cycle when inc = 1; frozen when inc = 0; no lock-up', () => {
    const g1 = buildStateGraph(phaseCounter16, { inc: 1 })
    expect(g1.mainCycle.length).toBe(16)
    expect(g1.lockup).toEqual([])
    expect(g1.nodes.filter((n) => !n.reachable)).toEqual([])
    expect(buildStateGraph(phaseCounter16, { inc: 0 }).mainCycle).toEqual(['0000'])
  })
  it('real delay mode: no runt on carry (single 5-input AND)', () => {
    const { traces } = simulate(phaseCounter16, 34, { period: T, delayMode: 'real' }, () => ({ inc: 1 }))
    expect(detectRuntPulses(traces.filter((t) => t.name === 'carry'), 40)).toEqual([])
  })
})

describe('carryEdgeTraces：由 event 產生 (a)/(b) 的波形', () => {
  it('(a) N = 2, step = 3: rising edges every 2.375 Tvco, all on the ideal markers, no runt', () => {
    const a = carryEdgeTraces(2, 8, 3, 8, 'divider', 100)
    expect(a.intervals.every((v) => Math.abs(v - 2.375) < 1e-9)).toBe(true)
    a.edgeTimesPs.forEach((t, k) => expect(t).toBeCloseTo(a.idealTimesPs[k], 9))
    const rises = a.traces[1].events.filter((e) => e.v === 1)
    expect(rises.map((e) => e.t)).toEqual(a.edgeTimesPs)
    expect(a.minPulsePs).toBeCloseTo(50, 9)
    expect(detectRuntPulses([a.traces[1]], 40)).toEqual([])
    // events 時間單調不減
    for (let i = 1; i < a.traces[1].events.length; i++) expect(a.traces[1].events[i].t).toBeGreaterThanOrEqual(a.traces[1].events[i - 1].t)
  })
  it('(b) N = 2, step = 3: the wrap cycles (k = 2→3, 5→6, 7→8) shrink to 1.375 Tvco and the edge is 1 Tvco early', () => {
    const b = carryEdgeTraces(2, 8, 3, 9, 'none', 100)
    expect(b.intervals.map((v) => Number(v.toFixed(3)))).toEqual([2.375, 2.375, 1.375, 2.375, 2.375, 1.375, 2.375, 1.375])
    expect(b.edgeTimesPs[3] - b.idealTimesPs[3]).toBeCloseTo(-100, 9)
    expect(b.edgeTimesPs[8] - b.idealTimesPs[8]).toBeCloseTo(-300, 9)
  })
  it('(b) N = 1, step = 1: the wrap interval is 1/8 Tvco ⇒ a 6.25 ps runt is drawn', () => {
    const b = carryEdgeTraces(1, 8, 1, 10, 'none', 100)
    expect(b.minPulsePs).toBeCloseTo(6.25, 9)
    expect(detectRuntPulses([b.traces[1]], 40).length).toBeGreaterThan(0)
    const a = carryEdgeTraces(1, 8, 1, 10, 'divider', 100)
    expect(detectRuntPulses([a.traces[1]], 40)).toEqual([])
  })
})

describe('fineCodePeriod：DTC gain error 的 residual 鋸齒週期', () => {
  it('increment 100 with 6 fine bits: fine_k = 36k mod 64 repeats every 16 output cycles', () => {
    expect(fineCodePeriod(100, 6)).toBe(16)
    const rows = dtcTimeline(100, { coarseBits: 3, fineBits: 6 }, 32, 4, 5, 100)
    for (let k = 0; k < 16; k++) expect(rows[k + 16].fine).toBe(rows[k].fine)
    expect(rows.slice(0, 16).map((r) => r.fine)).toEqual([36, 8, 44, 16, 52, 24, 60, 32, 4, 40, 12, 48, 20, 56, 28, 0])
    expect(rows[15].residualPs).toBeCloseTo(0, 9)
  })
  it('increment 64 (exactly one PMUX step) never touches the DTC: period 1; increment 1: period 64', () => {
    expect(fineCodePeriod(64, 6)).toBe(1)
    expect(fineCodePeriod(1, 6)).toBe(64)
    expect(fineCodePeriod(300, 5)).toBe(8) // 300 mod 32 = 12, gcd(12, 32) = 4 ⇒ 32 / 4 = 8
  })
})

// ================================================================ 課文數字的回歸釘子（審查後補）

/** DFT 裡明顯非零的 bin（回傳 [freq, mag] 由大到小） */
function topBins(d: { freq: number[]; mag: number[] }, floor = 1e-9): [number, number][] {
  return d.freq
    .map((f, i) => [f, d.mag[i]] as [number, number])
    .filter(([, m]) => m > floor)
    .sort((a, b) => b[1] - a[1])
}

describe('strictPeriod：只採用「從 index 0 起就重複」的週期', () => {
  it('undithered 一階 / 二階序列的週期 = m / gcd(k, m)（與 findPeriod 一致）', () => {
    expect(strictPeriod(runDsm({ k: 21, m: 64, order: 1, length: 2048 }).deltas)).toBe(64)
    expect(strictPeriod(runDsm({ k: 21, m: 64, order: 2, length: 2048 }).deltas)).toBe(128)
    expect(strictPeriod(runDsm({ k: 16, m: 64, order: 1, length: 256 }).deltas)).toBe(4)
    expect(strictPeriod(runDsm({ k: 16, m: 64, order: 2, length: 256 }).deltas)).toBe(8)
  })
  it('dither 過的序列不再有週期 ⇒ null（findPeriod 會被尾端的巧合騙到）', () => {
    // findPeriod 的舊行為：{period: 64, start: 1915} / {period: 4, start: 41} —— 都不是從頭成立的週期
    for (const [k, order, length] of [
      [21, 1, 2048],
      [21, 1, 512],
      [21, 2, 512],
      [16, 1, 256],
      [16, 2, 256],
    ] as const) {
      const deltas = runDsm({ k, m: 64, order: order as 1 | 2, length, dither: true }).deltas
      const loose = findPeriod(deltas.map(String))
      expect(loose === null || loose.start > 0, `k=${k} order=${order} len=${length}`).toBe(true)
      expect(strictPeriod(deltas), `k=${k} order=${order} len=${length}`).toBeNull()
    }
  })
  it('視窗不到 2P 時誠實回報 null（k/m = 3/8 要看 16 步才能確認週期 8）', () => {
    expect(strictPeriod(runDsm({ k: 3, m: 8, order: 1, length: 8 }).deltas)).toBeNull()
    expect(strictPeriod(runDsm({ k: 3, m: 8, order: 1, length: 16 }).deltas)).toBe(8)
  })
  it('dsmStats 的 period 欄位跟著 strictPeriod（DsmCompareTable / DsmExplorer 直接顯示它）', () => {
    expect(dsmStats(21, 64, 1, false, 4, 2048).period).toBe(64)
    expect(dsmStats(21, 64, 1, true, 4, 2048).period).toBeNull()
    expect(dsmStats(21, 64, 2, false, 4, 2048).period).toBe(128)
    expect(dsmStats(21, 64, 2, true, 4, 2048).period).toBeNull()
    expect(dsmStats(16, 64, 1, false, 4, 256).period).toBe(4)
    expect(dsmStats(16, 64, 1, true, 4, 256).period).toBeNull()
    expect(dsmStats(16, 64, 2, false, 4, 256).period).toBe(8)
    expect(dsmStats(16, 64, 2, true, 4, 256).period).toBeNull()
  })
})

describe('l2-dsm 的「1/4 反例」：二階輸在最低的那根 tone 更靠近載波', () => {
  it('一階 edge error 的 DFT 只有 f_div/4 與 f_div/2 兩根', () => {
    const s = dsmStats(16, 64, 1, false, 4, 256)
    const bins = topBins(s.dft)
    expect(bins.length).toBe(2)
    expect(bins[0][0]).toBeCloseTo(0.25, 9)
    expect(bins[0][1]).toBeCloseTo(Math.SQRT2 / 8, 6) // 0.1768
    expect(bins[1][0]).toBeCloseTo(0.5, 9)
    expect(bins[1][1]).toBeCloseTo(0.125, 6)
    expect(s.tone.freq).toBeCloseTo(0.25, 9)
    expect(s.rmsFiltered).toBeCloseTo(0.0365, 4)
    expect(s.peakToPeak).toBeCloseTo(0.75, 9)
  })
  it('二階 edge error 的 DFT 是 0.125 / 0.25 / 0.375 三根等高的 tone，最低的一根比一階低', () => {
    const s = dsmStats(16, 64, 2, false, 4, 256)
    const bins = topBins(s.dft)
    expect(bins.length).toBe(3)
    expect(bins.map(([f]) => f).sort((a, b) => a - b)).toEqual([0.125, 0.25, 0.375])
    for (const [, m] of bins) expect(m).toBeCloseTo(0.125, 6)
    // DsmExplorer 標的「最強 bin」是最低那一根（三根等高，取第一個最大值）
    expect(s.tone.freq).toBeCloseTo(0.125, 9)
    // 最低的 tone 從 0.25 掉到 0.125 ⇒ 低通後反而剩更多
    expect(s.rmsFiltered).toBeCloseTo(0.0537, 4)
    expect(s.rmsFiltered).toBeGreaterThan(dsmStats(16, 64, 1, false, 4, 256).rmsFiltered)
    expect(s.peakToPeak).toBeCloseTo(1.0, 9)
    expect(s.deltas.slice(0, 8).join('')).toBe('00100100')
  })
  it('deltas 自己的 DFT 最強 bin 才在 0.375——工具畫的不是這一張', () => {
    const s = dsmStats(16, 64, 2, false, 4, 256)
    expect(topBins(dftMagnitude(s.deltas))[0][0]).toBeCloseTo(0.375, 9)
  })
})

describe('l2-dsm 的 dither 數字：length 512 tone 還在，length 2048 最強 bin 跑到近 DC', () => {
  it('length = 512：0.328 那根只從 0.159 降到 0.143，p-p 與 in-band RMS 都變大', () => {
    const clean = dsmStats(21, 64, 1, false, 5, 512)
    const dith = dsmStats(21, 64, 1, true, 5, 512)
    expect(clean.tone.freq).toBeCloseTo(0.3281, 4)
    expect(clean.tone.mag).toBeCloseTo(0.159, 3)
    expect(dith.tone.freq).toBeCloseTo(0.3281, 4) // tone 沒有消失
    expect(dith.tone.mag).toBeCloseTo(0.143, 3)
    expect(clean.peakToPeak).toBeCloseTo(0.984, 3)
    expect(dith.peakToPeak).toBeCloseTo(1.188, 3)
    expect(clean.rmsFiltered).toBeCloseTo(0.0813, 4)
    expect(dith.rmsFiltered).toBeCloseTo(0.1047, 4)
  })
  it('length = 2048：最強 bin 移到 bin 1（≈ 0.0005 f_div）——那是低頻漫遊，不是 tone', () => {
    const dith = dsmStats(21, 64, 1, true, 4, 2048)
    expect(dith.tone.freq).toBeCloseTo(1 / 2048, 6)
    expect(dith.tone.mag).toBeCloseTo(0.116, 3)
    expect(dith.peakToPeak).toBeCloseTo(1.953, 3)
    expect(dith.rmsAc).toBeCloseTo(0.382, 3)
    expect(dith.rmsFiltered).toBeCloseTo(0.2874, 4)
    expect(dsmStats(21, 64, 1, false, 4, 2048).rmsFiltered).toBeCloseTo(0.0813, 4)
  })
})

describe('frac2375：Lesson 6-2 練習用陌生電路（/2 /3 cell + 3-bit accumulator，K=3, M=8）', () => {
  it('state sequence from reset has period 19 and follows the expected order', () => {
    const { records } = simulate(frac2375, 40, { period: T })
    const seq = stateSequence(frac2375, records)
    // a2 a1 a0 q1 q0
    expect(seq.slice(0, 19)).toEqual([
      '00001', '01100', '01101', '11000', '11001', '00110', '00100', '00101', '10000', '10001',
      '11100', '11101', '01010', '01000', '01001', '10100', '10101', '00010', '00000',
    ])
    expect(findPeriod(seq)).toEqual({ period: 19, start: 0 })
  })
  it('rising edges at 0,2,4,7,9,11,14,16,19 ⇒ 2,2,3,2,2,3,2,3 and average 2.375', () => {
    const { traces } = simulate(frac2375, 40, { period: T })
    const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T, 0)
    expect(m.risingTimes.slice(0, 8).map((t) => t / T)).toEqual([2, 4, 7, 9, 11, 14, 16, 19])
    const cycles = [2, ...m.intervals.slice(0, 7)]
    expect(cycles).toEqual([2, 2, 3, 2, 2, 3, 2, 3])
    expect(cycles.reduce((a, b) => a + b, 0)).toBe(19)
    expect(cycles.reduce((a, b) => a + b, 0) / cycles.length).toBeCloseTo(2.375, 9)
  })
  it('mod (carry) is 1 exactly 3 times in 8 output cycles — 與 runDsm(k=3, m=8) 同一串', () => {
    expect(runDsm({ k: 3, m: 8, order: 1, length: 8 }).deltas).toEqual([0, 0, 1, 0, 0, 1, 0, 1])
    const { traces } = simulate(frac2375, 40, { period: T })
    const cycles = [2, ...measureDivide(traces.find((t) => t.name === 'div_out')!, T, 0).intervals.slice(0, 7)]
    expect(cycles.filter((n) => n === 3).length).toBe(3)
  })
  it('edge error of 2,2,3,2,2,3,2,3 is a −k/8 sawtooth with p-p = (M−1)/M = 0.875 Tin', () => {
    const a = analyzeSequence([2, 2, 3, 2, 2, 3, 2, 3])
    expect(a.average).toBeCloseTo(2.375, 9)
    expect(a.edgeError.map((e) => Number(e.toFixed(6)))).toEqual([0, -0.375, -0.75, -0.125, -0.5, -0.875, -0.25, -0.625, 0])
    expect(a.peakToPeak).toBeCloseTo(0.875, 9)
    expect(Math.max(...a.edgeError)).toBeLessThanOrEqual(0) // 每個 edge 都早到或準時
  })
  it('mod = a2 · (a1 + a0) ⇔ acc ≥ 5；next-state equations', () => {
    for (let acc = 0; acc < 8; acc++) {
      const st = `${(acc >> 2) & 1}${(acc >> 1) & 1}${acc & 1}01` // cell = 01（取樣 mod 的 state）
      expect(nextStateOf(frac2375, st, {}).comb.mod, `acc=${acc}`).toBe(acc >= 5 ? 1 : 0)
    }
    // en = q0：cell = 00 時 accumulator 不動
    expect(nextStateOf(frac2375, '01100', {}).next.slice(0, 3)).toBe('011')
    // en = 1（cell 01）時 acc 加 3：3 → 6
    expect(nextStateOf(frac2375, '01101', {}).next.slice(0, 3)).toBe('110')
    expect(nextStateOf(frac2375, '11101', {}).next.slice(0, 3)).toBe('010') // 7 + 3 = 10 mod 8 = 2
  })
  it('state graph: 19-state main cycle, no lock-up, unreachable states recover in 1 step', () => {
    const g = buildStateGraph(frac2375, {})
    expect(g.nodes.length).toBe(32)
    expect(g.mainCycle.length).toBe(19)
    expect(g.lockup).toEqual([])
    for (const n of g.nodes.filter((x) => !x.reachable)) expect(n.stepsToCycle).toBe(1)
  })
  it('real delay mode has no runt pulses on the output', () => {
    const { traces } = simulate(frac2375, 40, { period: T, delayMode: 'real' })
    expect(detectRuntPulses(traces.filter((t) => t.name === 'div_out'), 40)).toEqual([])
  })
})

describe('l2-dsm exercise (B)：M = 4 時 K = 1 與 K = 3 的鋸齒方向', () => {
  it('兩者的 e_k 都是非正值——反過來的是斜率方向，不是正負號', () => {
    const k3 = analyzeSequence([2, 3, 3, 3])
    const k1 = analyzeSequence([2, 2, 2, 3])
    expect(k3.edgeError).toEqual([0, -0.75, -0.5, -0.25, 0])
    expect(k1.edgeError).toEqual([0, -0.25, -0.5, -0.75, 0])
    expect(Math.max(...k3.edgeError)).toBe(0)
    expect(Math.max(...k1.edgeError)).toBe(0)
    expect(k3.peakToPeak).toBeCloseTo(0.75, 9)
    expect(k1.peakToPeak).toBeCloseTo(0.75, 9)
  })
})

describe('l3-dtc 的 carry 次數與 edge 時間', () => {
  it('accumulate(100, {3,6}, 6)：fine→coarse 每步都有（6 次，合計 9 step），coarse→integer 只有 1 次', () => {
    const st = accumulate(100, { coarseBits: 3, fineBits: 6 }, 6)
    expect(st.map((s) => s.fineCarry)).toEqual([1, 2, 1, 2, 1, 2])
    expect(st.filter((s) => s.fineCarry > 0).length).toBe(6)
    expect(st.reduce((a, s) => a + s.fineCarry, 0)).toBe(9)
    expect(st.map((s) => s.coarseCarry)).toEqual([0, 0, 0, 0, 0, 1])
    expect(st.reduce((a, s) => a + s.coarseCarry, 0)).toBe(1)
  })
  it('phaseCounter8 的 carry rising edge 在 7T / 15T ⇒ output-rate clock（400 ps）下是 2800 / 6000 ps', () => {
    const { traces } = simulate(phaseCounter8, 20, { period: 400 })
    const m = measureDivide(traces.find((t) => t.name === 'carry')!, 400, 0)
    expect(m.risingTimes.slice(0, 2)).toEqual([2800, 6000])
    expect(m.risingTimes.slice(0, 2).map((t) => t / 400)).toEqual([7, 15])
  })
  it('carry → MMD 的 deadline 取最早的 capture edge（1 Tvco）⇒ slack 28 ps，不是 128 ps', () => {
    const p = phaseCounter8Timing.paths.find((x) => x.id === 'carry-to-mmd')!
    expect(p.periodFraction).toBe(0.25)
    const r = analyzeSetup(p, phaseCounter8Timing.env)
    expect(r.available).toBe(100) // 400 ps × 0.25 = 1 Tvco
    expect(r.arrival).toBe(22) // tCQ 8 + AND(wrap) 14
    expect(r.slack).toBe(28) // 100 − 22 − 40(setup) − 5(jitter) − 5(margin)
    // 樂觀地用 2 Tvco 會算出 128 ps——課文明說那是錯的做法
    expect(analyzeSetup({ ...p, periodFraction: 0.5 }, phaseCounter8Timing.env).slack).toBe(128)
  })
  it('counter 內部 carry chain 的 slack 仍是 343 ps（output-rate clock 的好處）', () => {
    const r = analyzeSetup(phaseCounter8Timing.paths.find((x) => x.id === 'carry-chain')!, phaseCounter8Timing.env)
    expect(r.arrival).toBe(40)
    expect(r.slack).toBe(343)
  })
})

describe('carryTimeline：step 不整除 M 時 wrap 間隔不固定（CarryArchitectureTimeline 的說明）', () => {
  it('M = 8, step = 3：index 0,3,6,1,4,7,2,5,…，wrap 在 k = 2,5,7,10,13（間隔 3,2,3,3）', () => {
    const rows = carryTimeline(4, 8, 3, 14, 'none')
    expect(rows.map((r) => r.index).slice(0, 8)).toEqual([0, 3, 6, 1, 4, 7, 2, 5])
    const wraps = rows.map((r, i) => (r.carry > 0 ? i : -1)).filter((i) => i >= 0)
    expect(wraps).toEqual([2, 5, 7, 10, 13])
    // 平均間隔 = M / step = 8/3 ≈ 2.67，不是 Math.ceil(8/3) = 3
    const gaps = wraps.slice(1).map((v, i) => v - wraps[i])
    expect(new Set(gaps).size).toBeGreaterThan(1)
    expect(8 / 3).toBeCloseTo(2.667, 3)
  })
  it('M = 8, step = 5：wrap 在 k = 1,3,4,6,7,9,11,12，平均 1.6 個週期一次', () => {
    const rows = carryTimeline(4, 8, 5, 14, 'none')
    expect(rows.map((r, i) => (r.carry > 0 ? i : -1)).filter((i) => i >= 0)).toEqual([1, 3, 4, 6, 7, 9, 11, 12])
    expect(8 / 5).toBeCloseTo(1.6, 6)
  })
  it('step = 1（課文預設）才是每 M 個週期剛好一次', () => {
    const rows = carryTimeline(4, 8, 1, 17, 'none')
    expect(rows.map((r, i) => (r.carry > 0 ? i : -1)).filter((i) => i >= 0)).toEqual([7, 15])
  })
})

describe('schematic 與 netlist 的 async reset 對齊（m6 的四張圖）', () => {
  const pairs: [string, Netlist, Schematic][] = [
    ['frac275', frac275, frac275Schematic],
    ['frac225', frac225, frac225Schematic],
    ['frac2375', frac2375, frac2375Schematic],
    ['phaseCounter8', phaseCounter8, phaseCounter8Schematic],
    ['phaseCounter16', phaseCounter16, phaseCounter16Schematic],
  ]
  it('每張圖都有 rst_n port，而且每顆宣告 rstn 的 flop 都有一條 reset wire 接到它的 rstn pin', () => {
    for (const [name, net, sch] of pairs) {
      const port = sch.elements.find((e) => e.kind === 'port' && e.text === 'rst_n')
      expect(port, `${name}: 缺少 rst_n port`).toBeTruthy()
      const resetWires = sch.wires.filter((w) => w.kind === 'reset')
      const flopsWithRst = net.flops.filter((f) => f.rstn)
      expect(resetWires.length, `${name}: reset wire 數 ≠ flop 數`).toBe(flopsWithRst.length)
      for (const w of resetWires) {
        expect(w.from, `${name}: reset wire ${w.id} 不是從 rst_n port 出發`).toBe(`${port!.id}.p`)
        expect(w.to.endsWith('.rstn'), `${name}: reset wire ${w.id} 沒接到 rstn pin`).toBe(true)
      }
      // 每顆 flop 只接一次
      expect(new Set(resetWires.map((w) => w.to)).size).toBe(flopsWithRst.length)
    }
  })
})
