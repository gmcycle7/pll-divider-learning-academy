import { describe, expect, it } from 'vitest'
import { simulate } from '@/models/divider/engine'
import { findPeriod, measureDivide, stateSequence } from '@/models/divider/analysis'
import { analyzeHold, analyzeSetup, worstHold, worstSetup } from '@/models/timing/sta'
import type { Bit } from '@/models/divider/types'
import {
  TIMING as K,
  f1PulseWidths,
  mmd2,
  mmd2LateMod,
  mmd2LostMod,
  mmd2ModAt01,
  mmd2P0First,
  mmd2SlowMod,
  mmd3,
  mmdEdgeRows,
  mmdN,
  modOut2Consumption,
  normalizeCycle,
  outputRisingEdges,
  reachabilityBySim,
  summarizeInputs,
  summarizeMode,
  switchP0Scan,
  withExtraModDelay,
} from './models'
import { MMD_MODES, mmd2P0FirstTiming, mmd2Timing, mmd3ModChainPath } from './timing'

const T = 100
const outTrace = (traces: { name: string; events: { t: number; v: Bit }[] }[], name = 'div_out') => traces.find((t) => t.name === name)!

// ---------------------------------------------------------------- Lesson 4-1：mmd2 四種 mode
describe('Lesson 4-1: two-stage MMD (mmd2), N = 4 + 2p1 + p0', () => {
  const expected: Record<string, { N: number; cycle: string[]; duty: number; cell1: number[]; rising: number[] }> = {
    '00': { N: 4, cycle: ['0001', '0100', '0101', '0000'], duty: 0.5, cell1: [2, 2, 2, 2], rising: [4, 8, 12, 16] },
    '01': { N: 5, cycle: ['0001', '0010', '0100', '0101', '0000'], duty: 0.6, cell1: [3, 2, 3, 2], rising: [5, 10, 15, 20] },
    '10': { N: 6, cycle: ['0001', '0100', '0101', '1000', '1001', '0000'], duty: 1 / 3, cell1: [2, 2, 2, 2], rising: [6, 12, 18, 24] },
    '11': { N: 7, cycle: ['0001', '0010', '0100', '0101', '1000', '1001', '0000'], duty: 3 / 7, cell1: [3, 2, 2, 3], rising: [7, 14, 21, 28] },
  }
  for (const [mode, e] of Object.entries(expected)) {
    const p1 = Number(mode[0]) as Bit
    const p0 = Number(mode[1]) as Bit
    it(`p1p0 = ${mode}: state cycle, divide ratio ${e.N}, duty ${(e.duty * 100).toFixed(1)}%, cell-1 pattern`, () => {
      const s = summarizeMode(mmd2, p0, p1, 30)
      expect(s.N).toBe(e.N)
      expect(s.ratio).toBe(e.N)
      expect(s.duty).toBeCloseTo(e.duty, 6)
      expect(s.cycle).toEqual(e.cycle)
      expect(s.states.slice(0, e.cycle.length)).toEqual(e.cycle) // 從 reset 直接進入主循環，沒有 transient
      expect(s.cell1Cycles.slice(0, 4)).toEqual(e.cell1)
      const { records } = simulate(mmd2, 30, { period: T }, () => ({ p0, p1 }))
      expect(outputRisingEdges(records).slice(0, 4)).toEqual(e.rising)
    })
    it(`p1p0 = ${mode}: duty = (2 + p0) / N（div_out 在 b = 00 那一個 f1 週期為 1）`, () => {
      const s = summarizeMode(mmd2, p0, p1, 30)
      expect(s.duty).toBeCloseTo((2 + p0) / e.N, 6)
    })
    it(`p1p0 = ${mode}: every one of the 16 states reaches the main cycle (no lock-up, checked by simulation)`, () => {
      const r = reachabilityBySim(mmd2, { p0, p1 })
      expect(r.cycle).toEqual(e.cycle)
      expect(r.lockup).toEqual([])
      expect(r.nodes.filter((n) => n.onCycle).length).toBe(e.cycle.length)
    })
    it(`p1p0 = ${mode}: real-delay mode gives the same ratio and sequence`, () => {
      const { records, traces } = simulate(mmd2, 30, { period: T, delayMode: 'real' }, () => ({ p0, p1 }))
      expect(measureDivide(outTrace(traces), T).ratio).toBe(e.N)
      expect(stateSequence(mmd2, records).slice(0, e.cycle.length)).toEqual(e.cycle)
    })
  }

  it('p1p0 = 01: the edge-by-edge table used in the lesson (a1a0, b1b0, f1, mod_out2, da1)', () => {
    const rows = mmdEdgeRows(mmd2, { p0: 1, p1: 0 }, 5)
    const view = rows.map((r) => [r.edge, r.aBefore, r.bBefore, r.f1Before, r.modOut2Before, r.mod1EffBefore, r.da1, r.aAfter, r.bAfter, r.f1Rises, r.out])
    expect(view).toEqual([
      [1, '00', '00', 1, 1, 1, 0, '01', '00', false, 1],
      [2, '01', '00', 0, 1, 1, 1, '10', '00', false, 1],
      [3, '10', '00', 0, 1, 1, 0, '00', '01', true, 0],
      [4, '00', '01', 1, 0, 0, 0, '01', '01', false, 0],
      [5, '01', '01', 0, 0, 0, 0, '00', '00', true, 1],
    ])
    expect(rows[2].cell1CycleLength).toBe(3)
    expect(rows[4].cell1CycleLength).toBe(2)
  })

  it('p0 is only consumed at the edge where a = 01 and mod_out2 = 1 (da1 = a0·p0·mod_out2)', () => {
    const rows = mmdEdgeRows(mmd2, { p0: 1, p1: 1 }, 14)
    for (const r of rows) {
      const expectedDa1 = r.aBefore === '01' && r.modOut2Before === 1 ? 1 : 0
      expect(r.da1).toBe(expectedDa1)
      // da1 = 1 的 edge 之後 a 一定是 10（走 /3）
      if (r.da1 === 1) expect(r.aAfter).toBe('10')
    }
  })

  it('p1 is only consumed at an f1↑ where b0 = 1 (db1 = b0·p1)', () => {
    const { records } = simulate(mmd2, 20, { period: T }, () => ({ p0: 0, p1: 1 }))
    for (const r of records) {
      const rose = r.events.some((e) => e.signal === 'f1' && e.to === 1)
      if (!rose) {
        expect(r.stateAfter.b1).toBe(r.stateBefore.b1)
        expect(r.stateAfter.b0).toBe(r.stateBefore.b0)
      } else {
        expect(r.stateAfter.b1).toBe(r.stateBefore.b0) // db1 = b0 · 1
      }
    }
  })

  it('mmdN: N = 2^n + Σ p_i·2^i', () => {
    expect(mmdN([0, 0])).toBe(4)
    expect(mmdN([1, 0])).toBe(5)
    expect(mmdN([0, 1])).toBe(6)
    expect(mmdN([1, 1])).toBe(7)
    expect(mmdN([1, 0, 1])).toBe(13)
    expect(mmdN([1, 1, 1, 1])).toBe(31)
  })
})

// ---------------------------------------------------------------- Lesson 4-1：三級 mmd3
describe('Lesson 4-1: three-stage MMD (mmd3), N = 8 + 4p2 + 2p1 + p0', () => {
  for (let m = 0; m < 8; m++) {
    const p0 = (m & 1) as Bit
    const p1 = ((m >> 1) & 1) as Bit
    const p2 = ((m >> 2) & 1) as Bit
    const N = 8 + 4 * p2 + 2 * p1 + p0
    it(`p2p1p0 = ${p2}${p1}${p0}: divide by ${N}, periodic, duty = (4 + 2p1 + p0)/N`, () => {
      const s = summarizeInputs(mmd3, [p0, p1, p2], 80)
      expect(s.N).toBe(N)
      expect(s.ratio).toBe(N)
      expect(s.cycle.length).toBe(N)
      expect(s.duty).toBeCloseTo((4 + 2 * p1 + p0) / N, 6)
      const { traces } = simulate(mmd3, 80, { period: T }, () => ({ p0, p1, p2 }))
      const meas = measureDivide(outTrace(traces), T)
      expect(meas.periodic).toBe(true)
      expect(meas.intervals.slice(1).every((x) => x === N)).toBe(true)
    })
  }
  it('cell 1 does /3 exactly once per output period, only when p0 = 1', () => {
    const s1 = summarizeInputs(mmd3, [1, 0, 0], 60)
    const s0 = summarizeInputs(mmd3, [0, 1, 1], 60)
    // 每個 output period（9 個 clk）內 cell 1 走 4 輪：3,2,2,2
    expect(s1.cell1Cycles.slice(0, 8)).toEqual([3, 2, 2, 2, 3, 2, 2, 2])
    expect(s0.cell1Cycles.every((c) => c === 2)).toBe(true)
  })
})

// ---------------------------------------------------------------- Lesson 4-1 練習：mod_out2 改在 b = 01
describe('Lesson 4-1 exercise: request /3 in b = 01 instead of b = 00 (mmd2ModAt01)', () => {
  it('same N for all four modes, but the /3 moves to the other f1 period', () => {
    for (const p1 of [0, 1] as Bit[])
      for (const p0 of [0, 1] as Bit[]) {
        const a = summarizeMode(mmd2, p0, p1, 30)
        const b = summarizeMode(mmd2ModAt01, p0, p1, 30)
        expect(b.ratio).toBe(a.ratio)
        expect(b.N).toBe(a.N)
        if (p0 === 1) {
          expect(a.cell1Cycles.slice(0, 2)).toEqual([3, 2])
          expect(b.cell1Cycles.slice(0, 2)).toEqual([2, 3])
        }
      }
  })
  it('p1p0 = 01: cycle 0001 → 0100 → 0101 → 0110 → 0000, duty 2/5 (was 3/5)', () => {
    const s = summarizeMode(mmd2ModAt01, 1, 0, 30)
    expect(s.cycle).toEqual(['0001', '0100', '0101', '0110', '0000'])
    expect(s.duty).toBeCloseTo(0.4, 6)
    expect(summarizeMode(mmd2, 1, 0, 30).duty).toBeCloseTo(0.6, 6)
  })
  it('p1p0 = 11: duty 2/7 (was 3/7); no lock-up in any mode', () => {
    expect(summarizeMode(mmd2ModAt01, 1, 1, 30).duty).toBeCloseTo(2 / 7, 6)
    for (const p1 of [0, 1] as Bit[]) for (const p0 of [0, 1] as Bit[]) expect(reachabilityBySim(mmd2ModAt01, { p0, p1 }).lockup).toEqual([])
  })
})

// ---------------------------------------------------------------- Lesson 4-2：path ② 的 deadline（simulate 證明）
describe('Lesson 4-2: path 2 — mod_out2 is consumed at the a = 01 edge', () => {
  it('mod_out2 changes 40 ps after the f1-rising clk edge k and is consumed at edge k+2 (real delay)', () => {
    const cons = modOut2Consumption(mmd2, 1, 0, 20)
    expect(cons.length).toBeGreaterThan(3)
    for (const c of cons) {
      expect(c.consumeEdge - c.launchEdge).toBe(2)
      if (c.tModOut2 !== null) expect(c.tModOut2 - (c.launchEdge * T)).toBeCloseTo(K.tcq + K.nor + K.tcq + K.nor, 6) // 8+12+8+12 = 40
      // b = 00 時 mod_out2 = 1 ⇒ da1 = 1 ⇒ 走 /3；b = 01 時 mod_out2 = 0 ⇒ /2
      expect(c.da1).toBe(c.modOut2AtConsume)
      expect(c.a1After).toBe(c.da1)
    }
    // /5：/3 與 /2 交替（每次 f1↑ 之後 mod_out2 翻轉一次）
    const seq = cons.slice(1, 6).map((c) => c.da1)
    for (let i = 1; i < seq.length; i++) expect(seq[i]).not.toBe(seq[i - 1])
    expect(seq).toContain(1)
    expect(seq).toContain(0)
  })
  const cycleOf = (nl: typeof mmd2, p0: Bit, p1: Bit) => {
    const { records, traces } = simulate(nl, 60, { period: T, delayMode: 'real' }, () => ({ p0, p1 }))
    const seq = stateSequence(nl, records)
    const per = findPeriod(seq)!
    const m = measureDivide(outTrace(traces), T)
    return { cycle: seq.slice(per.start, per.start + per.period), ratio: m.ratio, duty: m.duty }
  }
  it('arrival 150 ps (single-cycle STA fails, slack −63) still gives the correct sequence, N and duty', () => {
    for (const p1 of [0, 1] as Bit[]) {
      const ref = cycleOf(mmd2, 1, p1)
      const slow = cycleOf(mmd2SlowMod, 1, p1)
      expect(slow.ratio).toBe(ref.ratio)
      expect(slow.cycle).toEqual(ref.cycle)
      expect(slow.duty).toBeCloseTo(ref.duty!, 6)
    }
  })
  it('arrival 225 ps (> 2T): the /3 lands in the b = 01 period — same N, wrong state cycle, duty 3/5 → 2/5', () => {
    const late = cycleOf(mmd2LateMod, 1, 0)
    expect(late.ratio).toBe(5)
    expect(late.cycle).toEqual(['0001', '0100', '0101', '0110', '0000'])
    expect(late.duty).toBeCloseTo(0.4, 6)
    expect(cycleOf(mmd2, 1, 0).duty).toBeCloseTo(0.6, 6)
    const late7 = cycleOf(mmd2LateMod, 1, 1)
    expect(late7.ratio).toBe(7)
    expect(late7.cycle).toEqual(['0001', '0100', '0101', '0110', '1000', '1001', '0000'])
  })
  it('arrival 260 ps: the 2T-wide mod_out2 pulse is swallowed by the slower AND (inertial delay) — /3 lost, N = 4 / 6', () => {
    expect(cycleOf(mmd2LostMod, 1, 0).ratio).toBe(4)
    expect(cycleOf(mmd2LostMod, 1, 1).ratio).toBe(6)
    expect(cycleOf(mmd2LostMod, 1, 0).cycle).toEqual(['0001', '0100', '0101', '0000'])
  })
  it('p0 = 0 modes are immune to the slow path (mod1_eff ≡ 0, path not sensitized)', () => {
    for (const p1 of [0, 1] as Bit[]) {
      for (const nl of [mmd2LateMod, mmd2LostMod]) {
        const r = cycleOf(nl, 0, p1)
        expect(r.ratio).toBe(4 + 2 * p1)
        expect(r.cycle).toEqual(cycleOf(mmd2, 0, p1).cycle)
      }
    }
  })
  it('withExtraModDelay: functional boundary is 2T (arrival ≤ 200 keeps the steady-state cycle, 210 moves the /3)', () => {
    // arrival 180 / 200：reset 後第一輪來不及走 /3（transient），但穩態循環與原版相同——只是 findPeriod 從不同位置切入，
    // 所以要先把循環旋轉到同一個起點再比較。
    const ref = normalizeCycle(cycleOf(mmd2, 1, 0).cycle)
    expect(ref).toEqual(['0001', '0010', '0100', '0101', '0000'])
    for (const extra of [90, 120, 140]) {
      const r = cycleOf(withExtraModDelay(extra), 1, 0)
      expect(normalizeCycle(r.cycle)).toEqual(ref) // arrival 150 / 180 / 200
      expect(r.duty).toBeCloseTo(0.6, 6)
    }
    // arrival 210 > 2T：/3 搬到 b = 01 的 f1 週期
    const late = cycleOf(withExtraModDelay(150), 1, 0)
    expect(normalizeCycle(late.cycle)).toEqual(['0001', '0100', '0101', '0110', '0000'])
    expect(late.duty).toBeCloseTo(0.4, 6)
  })
  it('normalizeCycle rotates a cycle so that the anchor state is last', () => {
    expect(normalizeCycle(['0100', '0101', '0000', '0001', '0010'])).toEqual(['0001', '0010', '0100', '0101', '0000'])
    expect(normalizeCycle(['0001', '0010', '0000'])).toEqual(['0001', '0010', '0000'])
    expect(normalizeCycle(['01', '10'])).toEqual(['01', '10']) // anchor 不存在：原樣回傳
  })
})

// ---------------------------------------------------------------- Lesson 4-2：path ③（p0 何時生效）、path ⑥（f1 pulse width）
describe('Lesson 4-2: path 3 (mode switching) and path 6 (f1 pulse width)', () => {
  it('switching p0 0→1 before any edge only ever yields 4T or 5T intervals (phase continuity)', () => {
    const rows = switchP0Scan([2, 3, 4, 5, 6, 7, 8, 9], mmd2, 40)
    for (const r of rows) {
      expect(r.intervals.length).toBeGreaterThan(3)
      for (const iv of r.intervals) expect([4, 5]).toContain(iv)
      expect(r.firstFiveAt).toBeGreaterThanOrEqual(0)
    }
  })
  it('p0 is sampled only at the a = 01 & mod_out2 = 1 edge: before edge 2 → first period /5; edges 3–6 → wait for the next such edge (edge 6); edge 7+ → one more /4', () => {
    const rows = switchP0Scan([1, 2, 3, 4, 5, 6, 7, 8], mmd2, 40)
    const byK = Object.fromEntries(rows.map((r) => [r.k, r]))
    expect(byK[1].risingEdges.slice(0, 3)).toEqual([5, 10, 15])
    expect(byK[2].risingEdges.slice(0, 3)).toEqual([5, 10, 15])
    for (const k of [3, 4, 5, 6]) expect(byK[k].risingEdges.slice(0, 3)).toEqual([4, 9, 14])
    for (const k of [7, 8]) {
      expect(byK[k].risingEdges.slice(0, 3)).toEqual([4, 8, 13])
      expect(byK[k].intervals.slice(0, 2)).toEqual([4, 5])
    }
  })
  it('f1 high pulse is exactly one T; low pulse is 1T (/2) or 2T (/3)', () => {
    for (const [p0, p1] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as [Bit, Bit][]) {
      const rows = f1PulseWidths(mmd2, p0, p1, T, 20)
      const highs = rows.filter((r) => r.level === 1).map((r) => r.width)
      const lows = rows.filter((r) => r.level === 0).map((r) => r.width)
      expect(highs.length).toBeGreaterThan(2)
      for (const w of highs) expect(w).toBeCloseTo(T, 6)
      for (const w of lows) expect([T, 2 * T].some((x) => Math.abs(x - w) < 1e-6)).toBe(true)
      if (p0 === 1) expect(lows.some((w) => Math.abs(w - 2 * T) < 1e-6)).toBe(true)
      else expect(lows.every((w) => Math.abs(w - T) < 1e-6)).toBe(true)
    }
  })
  // Lesson 4-1 engineer 段落：controller 在 div_out↑ 更新 p 時，離兩個 capture edge 還有多遠
  it('deadline from div_out↑: p0 edge is 2T away, p1 edge is (4 + p0)T away (all four modes)', () => {
    for (const [p0, p1] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ] as [Bit, Bit][]) {
      const rows = mmdEdgeRows(mmd2, { p0, p1 }, 40)
      const divRise: number[] = []
      let prev: Bit = 0
      for (const r of rows) {
        if (prev === 0 && r.out === 1) divRise.push(r.edge)
        prev = r.out
      }
      // p0 只在「a = 01 且 mod_out2 = 1」的 clk↑ 被用到
      const p0Edges = rows.filter((r) => r.aBefore === '01' && r.modOut2Before === 1).map((r) => r.edge)
      // p1 只在「f1↑ 且 b0 = 1」的那個 edge 被用到（db1 = b0 · p1）
      const p1Edges = rows.filter((r) => r.f1Rises && r.bBefore[1] === '1').map((r) => r.edge)
      // 用第二、第三個 div_out↑（跳過 reset 的第一個）
      for (const e of divRise.slice(1, 3)) {
        const nextP0 = p0Edges.find((x) => x > e)!
        const nextP1 = p1Edges.find((x) => x > e)!
        expect(nextP0 - e, `p0 distance, p1p0=${p1}${p0}`).toBe(2)
        expect(nextP1 - e, `p1 distance, p1p0=${p1}${p0}`).toBe(4 + p0)
      }
      // div_out↑ 之後的第一個 f1↑ 是 b: 00 → 01，那個 edge 上 db1 = b0·p1 = 0，p1 沒被用到
      const e0 = divRise[1]
      const firstF1 = rows.filter((r) => r.f1Rises && r.edge > e0)[0]
      expect(firstF1.bBefore, `first f1↑ after div_out↑, p1p0=${p1}${p0}`).toBe('00')
      expect(firstF1.edge - e0).toBe(2 + p0)
    }
  })

  it('after reset a = 00 so f1 = 1: the first f1↑ appears at edge 2 (p0 = 0) or edge 3 (p0 = 1)', () => {
    const r0 = simulate(mmd2, 4, { period: T, delayMode: 'real' }, () => ({ p0: 0, p1: 0 }))
    const r1 = simulate(mmd2, 4, { period: T, delayMode: 'real' }, () => ({ p0: 1, p1: 0 }))
    const firstRise = (recs: typeof r0.records) => recs.find((r) => r.events.some((e) => e.signal === 'f1' && e.to === 1))!.edgeIndex
    expect(firstRise(r0.records)).toBe(2)
    expect(firstRise(r1.records)).toBe(3)
    expect(r0.records[0].combBefore.f1).toBe(1)
  })
})

// ---------------------------------------------------------------- Lesson 4-2：timing scenario 的數字
describe('Lesson 4-2: timing scenario numbers', () => {
  const env = mmd2Timing.env
  const path = (id: string) => mmd2Timing.paths.find((p) => p.id === id)!
  it('path 2 (single-cycle): arrival 60, required 87, slack 27, Tclk,min 73', () => {
    const s = analyzeSetup(path('p2-modout2-da1'), env)
    expect(s.arrival).toBe(60)
    expect(s.required).toBe(87)
    expect(s.slack).toBe(27)
    expect(s.tclkMin).toBe(73)
  })
  it('path 2 as multicycle-2: slack 127; path 1 local: arrival 20, slack 67, Tclk,min 33', () => {
    expect(analyzeSetup(path('p2-modout2-da1-mc2'), env).slack).toBe(127)
    const s = analyzeSetup(path('p1-a0-nor-da0'), env)
    expect(s.arrival).toBe(20)
    expect(s.slack).toBe(67)
    expect(s.tclkMin).toBe(33)
  })
  it('worst setup path is path 2 when p0 = 1, path 1 when p0 = 0; worst hold is a0 → AND → a1 when p0 = 1', () => {
    expect(worstSetup(mmd2Timing.paths, env, 'm01')!.path.id).toBe('p2-modout2-da1')
    expect(worstSetup(mmd2Timing.paths, env, 'm11')!.path.id).toBe('p2-modout2-da1')
    expect(worstSetup(mmd2Timing.paths, env, 'm00')!.path.id).toBe('p1-a0-nor-da0')
    expect(worstSetup(mmd2Timing.paths, env, 'm10')!.path.id).toBe('p1-a0-nor-da0')
    expect(worstSetup(mmd2Timing.paths, env, 'sw')!.path.id).toBe('p2-modout2-da1')
    // control path 只在「換除數中」列出
    expect(mmd2Timing.paths.find((p) => p.id === 'p3-p0-da1')!.modes).toEqual(['sw'])
    expect(worstHold(mmd2Timing.paths, env, 'm01')!.path.id).toBe('p1-a0-and-da1')
    expect(analyzeHold(path('p1-a0-and-da1'), env).slack).toBe(9)
    expect(analyzeHold(path('p1-a0-nor-da0'), env).slack).toBe(10)
    expect(analyzeHold(path('p2-modout2-da1'), env).slack).toBe(37)
  })
  it('control paths: p0 → da1 arrival 40 (slack 47); p1 → db1 arrival 30 (slack 57); output latency 43', () => {
    expect(analyzeSetup(path('p3-p0-da1'), env).arrival).toBe(40)
    expect(analyzeSetup(path('p3-p0-da1'), env).slack).toBe(47)
    expect(analyzeSetup(path('p3-p1-db1'), env).arrival).toBe(30)
    expect(analyzeSetup(path('p3-p1-db1'), env).slack).toBe(57)
    expect(analyzeSetup(path('p4-f2-out'), env).arrival).toBe(43)
  })
  it('path 4 (output decode) carries tsetup = K.setup so the explorer table matches 課文的 slack 44', () => {
    const p4 = path('p4-f2-out')
    expect(p4.type).toBe('output')
    expect(p4.capture.setup).toBe(K.setup)
    const s = analyzeSetup(p4, env)
    expect(s.arrival).toBe(43) // latency：唯一對這條 path 有意義的數字
    expect(s.required).toBe(87)
    expect(s.slack).toBe(44) // 只有在「接了 clk domain 的 retimer」的假設下才成立
    // notes 必須明講那幾列在沒有 capture flop 時沒有意義
    expect(p4.notes!.some((n) => n.includes('沒有 capture flop'))).toBe(true)
  })
  it('path 6 (pulse width) captures on f1 falling：終點是 pulse 的結束，不是 ff_b0 的 f1↑', () => {
    const p6 = path('p6-f1-pulse')
    expect(p6.type).toBe('pulse-width')
    expect(p6.capture.edge).toBe('falling')
    expect(p6.capture.clock).toBe('f1')
  })
  it('pulse-width path: Tclk,min from pulse width = 40 ps', () => {
    expect(analyzeSetup(path('p6-f1-pulse'), env).tclkMin).toBe(K.norAsym + K.minPulse + K.jitter + K.margin)
    expect(analyzeSetup(path('p6-f1-pulse'), env).tclkMin).toBe(40)
  })
  it('three-stage chain: arrival 90 ⇒ slack −3 at T = 100 (single-cycle)', () => {
    const s = analyzeSetup(mmd3ModChainPath, env)
    expect(s.arrival).toBe(90)
    expect(s.slack).toBe(-3)
  })
  it('every path references only wires / elements that exist in the schematic; modes reference declared ids', () => {
    for (const sc of [mmd2Timing, mmd2P0FirstTiming]) {
      const wireIds = new Set(sc.schematic.wires.map((w) => w.id))
      const elemIds = new Set(sc.schematic.elements.map((e) => e.id))
      const modeIds = new Set(MMD_MODES.map((m) => m.id))
      for (const p of sc.paths) {
        for (const m of p.modes ?? []) expect(modeIds.has(m)).toBe(true)
        expect(elemIds.has(p.launch.element)).toBe(true)
        expect(elemIds.has(p.capture.element)).toBe(true)
        for (const s of p.segments) {
          for (const w of s.wires ?? []) expect(wireIds.has(w)).toBe(true)
          for (const e of s.elements ?? []) expect(elemIds.has(e)).toBe(true)
        }
      }
    }
  })
})

// ---------------------------------------------------------------- Lesson 4-2 練習：p0 的 AND 移到 mod_out2 之前
describe('Lesson 4-2 exercise: AND(p0) before mod_out2 (mmd2P0First)', () => {
  it('functionally identical to mmd2 in all four modes (ideal and real delay)', () => {
    for (const p1 of [0, 1] as Bit[])
      for (const p0 of [0, 1] as Bit[])
        for (const delayMode of ['ideal', 'real'] as const) {
          const a = simulate(mmd2, 30, { period: T, delayMode }, () => ({ p0, p1 }))
          const b = simulate(mmd2P0First, 30, { period: T, delayMode }, () => ({ p0, p1 }))
          expect(stateSequence(mmd2P0First, b.records)).toEqual(stateSequence(mmd2, a.records))
          expect(measureDivide(outTrace(b.traces), T).ratio).toBe(measureDivide(outTrace(a.traces), T).ratio)
        }
  })
  it('path 2 arrival stays 60 / slack 27; p0 control path stays 40', () => {
    const env = mmd2P0FirstTiming.env
    const p2 = mmd2P0FirstTiming.paths.find((p) => p.id === 'p2-modout2-da1')!
    expect(analyzeSetup(p2, env).arrival).toBe(60)
    expect(analyzeSetup(p2, env).slack).toBe(27)
    expect(analyzeSetup(mmd2P0FirstTiming.paths.find((p) => p.id === 'p3-p0-da1')!, env).arrival).toBe(40)
    expect(worstSetup(mmd2P0FirstTiming.paths, env, 'm01')!.path.id).toBe('p2-modout2-da1')
  })
  it('mod_out2 wire is idle when p0 = 0 (no toggling on the long wire)', () => {
    const { traces } = simulate(mmd2P0First, 30, { period: T }, () => ({ p0: 0, p1: 1 }))
    const w = outTrace(traces, 'mod_out2')
    expect(w.events.filter((e) => e.t > 0).length).toBe(0)
    const orig = outTrace(simulate(mmd2, 30, { period: T }, () => ({ p0: 0, p1: 1 })).traces, 'mod_out2')
    expect(orig.events.filter((e) => e.t > 0).length).toBeGreaterThan(4)
  })
  it('state period equals N in all modes', () => {
    for (const p1 of [0, 1] as Bit[])
      for (const p0 of [0, 1] as Bit[]) {
        const { records } = simulate(mmd2P0First, 40, { period: T }, () => ({ p0, p1 }))
        expect(findPeriod(stateSequence(mmd2P0First, records))!.period).toBe(4 + 2 * p1 + p0)
      }
  })
})
