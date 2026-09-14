import { describe, expect, it } from 'vitest'
import { simulate, createSim } from './engine'
import { buildStateGraph, measureDivide, nextStateOf, stateSequence, findPeriod, detectRuntPulses } from './analysis'
import type { Netlist } from './types'
import { div2, ripple4, ripple8, sync4, sync8, div3, div3Lockup, div3Recover, div3Duty50, dualMod23, muxSelect23, dualMod12, dualMod12Glitchy, mmd2, mmdRatio } from './examples'

const T = 100

describe('div2', () => {
  it('toggles every rising edge and divides by 2', () => {
    const { records, traces } = simulate(div2, 8, { period: T })
    expect(stateSequence(div2, records)).toEqual(['1', '0', '1', '0', '1', '0', '1', '0'])
    const q0 = traces.find((t) => t.name === 'q0')!
    const m = measureDivide(q0, T)
    expect(m.ratio).toBe(2)
    expect(m.duty).toBe(0.5)
    expect(m.periodic).toBe(true)
  })
  it('next-state equation d0 = NOT q0', () => {
    expect(nextStateOf(div2, '0', {}).next).toBe('1')
    expect(nextStateOf(div2, '1', {}).next).toBe('0')
  })
  it('real delay mode: q0 changes tcq after the edge', () => {
    const { traces } = simulate(div2, 3, { period: T, delayMode: 'real' })
    const q0 = traces.find((t) => t.name === 'q0')!
    const first = q0.events.find((e) => e.t > 0)!
    expect(first.t).toBeCloseTo(T + 8, 6)
    const d0 = traces.find((t) => t.name === 'd0')!
    const d0first = d0.events.find((e) => e.t > 0)!
    expect(d0first.t).toBeCloseTo(T + 8 + 6, 6)
  })
})

describe('ripple counters', () => {
  it('ripple4 counts 00→01→10→11 and divides by 4', () => {
    const { records, traces } = simulate(ripple4, 16, { period: T })
    expect(stateSequence(ripple4, records).slice(0, 8)).toEqual(['01', '10', '11', '00', '01', '10', '11', '00'])
    const m = measureDivide(traces.find((t) => t.name === 'q1')!, T)
    expect(m.ratio).toBe(4)
    expect(m.duty).toBe(0.5)
  })
  it('ripple8 divides by 8', () => {
    const { traces } = simulate(ripple8, 24, { period: T })
    const m = measureDivide(traces.find((t) => t.name === 'q2')!, T)
    expect(m.ratio).toBe(8)
  })
  it('ripple propagation accumulates tcq per stage in real mode', () => {
    const { traces } = simulate(ripple4, 4, { period: T, delayMode: 'real' })
    const q1 = traces.find((t) => t.name === 'q1')!
    // q1 first rises when q0 falls at edge 2: t = 2T + tcq(q0) + tcq(q1)
    const r = q1.events.find((e) => e.v === 1)!
    expect(r.t).toBeCloseTo(2 * T + 8 + 8, 6)
  })
})

describe('synchronous counters', () => {
  it('sync4 counts and divides by 4', () => {
    const { records, traces } = simulate(sync4, 16, { period: T })
    expect(stateSequence(sync4, records).slice(0, 8)).toEqual(['01', '10', '11', '00', '01', '10', '11', '00'])
    expect(measureDivide(traces.find((t) => t.name === 'q1')!, T).ratio).toBe(4)
  })
  it('sync8 divides by 8', () => {
    const { traces } = simulate(sync8, 24, { period: T })
    expect(measureDivide(traces.find((t) => t.name === 'q2')!, T).ratio).toBe(8)
  })
  it('sync4 state graph has no unreachable states', () => {
    const g = buildStateGraph(sync4, {})
    expect(g.mainCycle).toEqual(['00', '01', '10', '11'])
    expect(g.lockup).toEqual([])
  })
})

describe('div3', () => {
  it('sequence 00→01→10 and ratio 3 with duty 1/3', () => {
    const { records, traces } = simulate(div3, 15, { period: T })
    expect(stateSequence(div3, records).slice(0, 9)).toEqual(['01', '10', '00', '01', '10', '00', '01', '10', '00'])
    const m = measureDivide(traces.find((t) => t.name === 'q1')!, T)
    expect(m.ratio).toBe(3)
    expect(m.duty).toBeCloseTo(1 / 3, 6)
  })
  it('state 11 is unreachable but recovers', () => {
    const g = buildStateGraph(div3, {})
    expect(g.mainCycle).toEqual(['00', '01', '10'])
    const n11 = g.nodes.find((n) => n.state === '11')!
    expect(n11.reachable).toBe(false)
    expect(n11.lockup).toBe(false)
    expect(n11.next).toBe('10')
  })
  it('div3Lockup: 11 locks up', () => {
    const g = buildStateGraph(div3Lockup, {})
    expect(g.lockup).toEqual(['11'])
    const { records } = simulate(div3Lockup, 4, { period: T, initialState: { q0: 1, q1: 1 } })
    expect(stateSequence(div3Lockup, records)).toEqual(['11', '11', '11', '11'])
  })
  it('div3Recover: 11 returns to loop in one cycle', () => {
    const g = buildStateGraph(div3Recover, {})
    expect(g.lockup).toEqual([])
    expect(g.nodes.find((n) => n.state === '11')!.stepsToCycle).toBe(1)
    const { records } = simulate(div3Recover, 4, { period: T, initialState: { q0: 1, q1: 1 } })
    expect(stateSequence(div3Recover, records)).toEqual(['00', '01', '10', '00'])
  })
  it('div3Duty50 gives ratio 3 with 50% duty', () => {
    const { traces } = simulate(div3Duty50, 12, { period: T })
    const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T)
    expect(m.ratio).toBe(3)
    expect(m.duty).toBeCloseTo(0.5, 6)
  })
})

describe('dual-modulus /2 /3', () => {
  it('mod=0 → /2, mod=1 → /3', () => {
    const r0 = simulate(dualMod23, 12, { period: T }, () => ({ mod: 0 }))
    expect(measureDivide(r0.traces.find((t) => t.name === 'div_out')!, T).ratio).toBe(2)
    const r1 = simulate(dualMod23, 12, { period: T }, () => ({ mod: 1 }))
    expect(measureDivide(r1.traces.find((t) => t.name === 'div_out')!, T).ratio).toBe(3)
    expect(stateSequence(dualMod23, r1.records).slice(0, 6)).toEqual(['01', '10', '00', '01', '10', '00'])
  })
  it('state graphs', () => {
    expect(buildStateGraph(dualMod23, { mod: 0 }).mainCycle).toEqual(['00', '01'])
    expect(buildStateGraph(dualMod23, { mod: 1 }).mainCycle).toEqual(['00', '01', '10'])
    expect(buildStateGraph(dualMod23, { mod: 1 }).lockup).toEqual([])
  })
  it('switching mod keeps phase continuity: intervals are exactly 2 or 3', () => {
    const seq = [0, 0, 1, 1, 0, 1, 0, 0, 1]
    let k = 0
    const { traces } = simulate(dualMod23, 40, { period: T }, (edge) => {
      // change mod right after each output rising edge (state 00)
      return { mod: seq[k % seq.length] as 0 | 1, ...(edge % 1 === 0 && k++ >= 0 ? {} : {}) }
    })
    const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T)
    for (const iv of m.intervals) expect([2, 3]).toContain(iv)
  })
  it('mux-select version can produce intervals that are neither 2 nor 3', () => {
    const { traces } = simulate(muxSelect23, 30, { period: T }, (edge) => ({ mod: edge % 5 === 3 ? 1 : 0 }))
    const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T)
    expect(m.intervals.some((iv) => iv !== 2 && iv !== 3)).toBe(true)
  })
})

describe('dual-modulus /1 /2', () => {
  it('sel=0 passes every pulse, sel=1 passes every other', () => {
    const r0 = simulate(dualMod12, 8, { period: T }, () => ({ sel: 0 }))
    expect(measureDivide(r0.traces.find((t) => t.name === 'div_out')!, T).ratio).toBe(1)
    const r1 = simulate(dualMod12, 12, { period: T }, () => ({ sel: 1 }))
    expect(measureDivide(r1.traces.find((t) => t.name === 'div_out')!, T).ratio).toBe(2)
  })
  it('resynchronized gating has no runt pulses; combinational gating does', () => {
    const good = simulate(dualMod12, 12, { period: T, delayMode: 'real' }, () => ({ sel: 1 }))
    expect(detectRuntPulses(good.traces.filter((t) => t.name === 'div_out'), 30)).toEqual([])
    const bad = simulate(dualMod12Glitchy, 12, { period: T, delayMode: 'real' }, () => ({ sel: 1 }))
    expect(detectRuntPulses(bad.traces.filter((t) => t.name === 'div_out'), 30).length).toBeGreaterThan(0)
  })
})

describe('MMD two cells', () => {
  for (const p0 of [0, 1] as const) {
    for (const p1 of [0, 1] as const) {
      it(`p1=${p1} p0=${p0} → /${4 + 2 * p1 + p0}`, () => {
        const { traces } = simulate(mmd2, 40, { period: T }, () => ({ p0, p1 }))
        const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T, 1)
        expect(m.ratio).toBe(4 + 2 * p1 + p0)
        expect(m.periodic).toBe(true)
        expect(mmdRatio([p0, p1])).toBe(4 + 2 * p1 + p0)
      })
    }
  }
})

describe('multi-phase clock generation（回歸測試）', () => {
  /**
   * 舊版把「落在推進視窗外的 falling edge」記在單一欄位裡下次再排，
   * 但同一個 clock 的下一個週期會覆蓋掉還沒沖出去的那一筆 ⇒ 該 clock 升起後永遠不下降。
   *
   * 觸發條件需要「主 clock（clocks[0]）決定推進視窗，另一條 phase 的 falling edge
   * 剛好落在視窗邊界外」，所以這裡照 PMUX 的實際結構建 8 條 phase clock，
   * 主 clock 是 ph0，被測的 flop 由第 i 條 phase 驅動。sel = 4 / 5 曾經整個停住。
   */
  const PH = 8
  const phaseClocks = Array.from({ length: PH }, (_, i) => ({ name: `ph${i}`, phase: i / PH }))

  for (let i = 0; i < PH; i++) {
    it(`由 ph${i} 驅動的 /2 仍然正常除頻（ph${i} 的 falling edge 沒有被丟掉）`, () => {
      const nl: Netlist = {
        id: `pmux-ph${i}`,
        name: `driven by ph${i}`,
        clocks: phaseClocks,
        inputs: [],
        flops: [{ q: 'q0', d: 'd0', clk: `ph${i}`, edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8 }],
        gates: [{ out: 'd0', inputs: ['q0'], fn: (v) => (v.q0 ? 0 : 1), delay: 6, kind: 'inv' }],
        stateOrder: ['q0'],
        output: 'q0',
        equations: [{ target: 'd0', text: 'd0 = NOT q0' }],
      }
      const { sim } = simulate(nl, 20, { period: T })
      const ph = sim.getTraces([`ph${i}`])[0]
      const rises = ph.events.filter((e) => e.v === 1).length
      const falls = ph.events.filter((e) => e.v === 0 && e.t > 0).length
      expect(rises, `ph${i} rising 次數`).toBeGreaterThan(4)
      expect(Math.abs(rises - falls), `ph${i} rising/falling 不成對`).toBeLessThanOrEqual(1)
      // clock 有在動 ⇒ 這個 phase 驅動的 /2 真的有除頻
      expect(measureDivide(sim.getTraces(['q0'])[0], T).ratio, `ph${i} 驅動的除數`).toBe(2)
    })
  }
})

describe('engine stepping API', () => {
  it('stepEdge records before/after state and D values', () => {
    const sim = createSim(div2, { period: T })
    const r1 = sim.stepEdge()
    expect(r1.edgeIndex).toBe(1)
    expect(r1.t).toBe(T)
    expect(r1.stateBefore.q0).toBe(0)
    expect(r1.combBefore.d0).toBe(1)
    expect(r1.stateAfter.q0).toBe(1)
    const r2 = sim.stepEdge()
    expect(r2.stateAfter.q0).toBe(0)
  })
  it('findPeriod detects state cycle', () => {
    expect(findPeriod(['01', '10', '00', '01', '10', '00'])).toEqual({ period: 3, start: 0 })
  })
})
