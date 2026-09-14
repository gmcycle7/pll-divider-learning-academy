import { describe, expect, it } from 'vitest'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, measureDivide, stateSequence } from '@/models/divider/analysis'
import { analyzeHold, analyzeSetup, worstSetup } from '@/models/timing/sta'
import { WORKSHEET_QUESTIONS } from '@/components/lab/worksheet'
import { parseRef } from '@/components/circuit/schematic'
import { edgesForTwoOutputPeriods } from '@/lab/hints'
import type { LabExercise } from '@/lab/types'
import ex1 from './ex1-div2'
import ex2 from './ex2-ripple4'
import ex3 from './ex3-sync4'
import ex4 from './ex4-div3'

const T = 100
const mine: LabExercise[] = [ex1, ex2, ex3, ex4]

/** reference.q9 必須以數字開頭，例如 "2（output rising edge 每 2 個 clk 週期一次）" */
function ratioFromReference(e: LabExercise): number {
  const m = /^\s*(\d+(?:\.\d+)?)/.exec(e.reference.q9 ?? '')
  if (!m) throw new Error(`${e.id}: reference.q9 does not start with a number: ${e.reference.q9}`)
  return Number(m[1])
}

describe('lab exercises 1-4: metadata', () => {
  it('ids, orders, difficulty and 3 hints', () => {
    expect(mine.map((e) => e.id)).toEqual(['ex1-div2', 'ex2-ripple4', 'ex3-sync4', 'ex4-div3'])
    expect(mine.map((e) => e.order)).toEqual([1, 2, 3, 4])
    for (const e of mine) {
      expect(e.hints.length).toBe(3)
      for (const h of e.hints) expect(h.trim().length).toBeGreaterThan(20)
      expect(e.difficulty).toBeGreaterThanOrEqual(1)
      expect(e.difficulty).toBeLessThanOrEqual(5)
      expect(e.title.length).toBeGreaterThan(0)
      expect(e.summary.length).toBeGreaterThan(0)
      expect(typeof e.Solution).toBe('function')
      expect(typeof e.Prompt).toBe('function')
    }
  })
  it('reference has exactly q1..q15, all filled', () => {
    for (const e of mine) {
      const keys = Object.keys(e.reference).sort()
      expect(keys, e.id).toEqual(WORKSHEET_QUESTIONS.map((q) => q.key).sort())
      for (const q of WORKSHEET_QUESTIONS) expect((e.reference[q.key] ?? '').trim().length, `${e.id} ${q.key}`).toBeGreaterThan(0)
    }
  })
  it('schematic wires reference existing elements and pins', () => {
    for (const e of mine) {
      const ids = new Set(e.schematic.elements.map((el) => el.id))
      for (const w of e.schematic.wires) {
        expect(ids.has(parseRef(w.from).elem), `${e.id} ${w.id} from`).toBe(true)
        expect(ids.has(parseRef(w.to).elem), `${e.id} ${w.id} to`).toBe(true)
        for (const p of w.points ?? []) {
          expect(p[0]).toBeGreaterThanOrEqual(0)
          expect(p[0]).toBeLessThanOrEqual(e.schematic.width)
          expect(p[1]).toBeGreaterThanOrEqual(0)
          expect(p[1]).toBeLessThanOrEqual(e.schematic.height)
        }
      }
      // schematic 上的 signal 名稱必須存在於 netlist（live value 才顯示得出來）
      const known = new Set<string>([...e.netlist.clocks.map((c) => c.name), ...e.netlist.inputs.map((i) => i.name), ...e.netlist.flops.flatMap((f) => [f.q, f.d, f.qb ?? f.q, f.rstn ?? f.q]), ...e.netlist.gates.map((g) => g.out)])
      for (const w of e.schematic.wires) if (w.signal) expect(known.has(w.signal), `${e.id} ${w.id} signal ${w.signal}`).toBe(true)
      // 題目電路圖不可洩漏 netlist 的 d0/q0 命名（只用 U*/n* 標籤）
      for (const el of e.schematic.elements) if (el.label) expect(el.label, `${e.id} ${el.id}`).toMatch(/^U\d$/)
      for (const w of e.schematic.wires) if (w.signal) expect(w.label, `${e.id} ${w.id} label`).toBeDefined()
    }
  })
})

describe('lab exercises 1-4: divide ratio matches reference.q9', () => {
  for (const e of mine) {
    it(`${e.id}: simulate → measureDivide === reference`, () => {
      const { traces } = simulate(e.netlist, 24, { ...e.simOptions, period: T })
      const out = traces.find((t) => t.name === e.netlist.output)!
      const m = measureDivide(out, T)
      expect(m.ratio, e.id).toBe(ratioFromReference(e))
      expect(m.periodic, e.id).toBe(true)
    })
  }
})

describe('lab exercises 1-4: state sequence, duty, state graph', () => {
  it('ex1: 0 → 1 → 0, ratio 2, duty 50%', () => {
    const { records, traces } = simulate(ex1.netlist, 8, { period: T })
    expect(stateSequence(ex1.netlist, records)).toEqual(['1', '0', '1', '0', '1', '0', '1', '0'])
    const m = measureDivide(traces.find((t) => t.name === ex1.netlist.output)!, T)
    expect(m.ratio).toBe(2)
    expect(m.duty).toBe(0.5)
    const g = buildStateGraph(ex1.netlist, {})
    expect(g.mainCycle).toEqual(['0', '1'])
    expect(g.lockup).toEqual([])
    expect(g.nodes.filter((n) => !n.reachable)).toEqual([])
  })
  it('ex2 (ripple): 00 → 01 → 10 → 11 → 00, q1 只在偶數 edge 變, ratio 4, duty 50%', () => {
    const { records, traces } = simulate(ex2.netlist, 12, { period: T })
    expect(stateSequence(ex2.netlist, records).slice(0, 8)).toEqual(['01', '10', '11', '00', '01', '10', '11', '00'])
    for (const r of records) {
      const q1Changed = r.stateBefore.q1 !== r.stateAfter.q1
      expect(q1Changed, `edge ${r.edgeIndex}`).toBe(r.edgeIndex % 2 === 0)
    }
    const m = measureDivide(traces.find((t) => t.name === 'q1')!, T)
    expect(m.ratio).toBe(4)
    expect(m.duty).toBe(0.5)
    expect(m.risingTimes.slice(0, 2)).toEqual([2 * T, 6 * T])
    // 實際 delay：out 比 clk edge 晚兩個 tCQ（ripple clock-path 累積）
    const real = simulate(ex2.netlist, 4, { period: T, delayMode: 'real' })
    const q1 = real.traces.find((t) => t.name === 'q1')!
    expect(q1.events.find((ev) => ev.v === 1)!.t).toBeCloseTo(2 * T + 8 + 8, 6)
  })
  it('ex3 (sync): 00 → 01 → 10 → 11 → 00, ratio 4, duty 50%, no unused state', () => {
    const { records, traces } = simulate(ex3.netlist, 12, { period: T })
    expect(stateSequence(ex3.netlist, records).slice(0, 8)).toEqual(['01', '10', '11', '00', '01', '10', '11', '00'])
    const m = measureDivide(traces.find((t) => t.name === 'q1')!, T)
    expect(m.ratio).toBe(4)
    expect(m.duty).toBe(0.5)
    const g = buildStateGraph(ex3.netlist, {})
    expect(g.mainCycle).toEqual(['00', '01', '10', '11'])
    expect(g.lockup).toEqual([])
    expect(g.nodes.filter((n) => !n.reachable)).toEqual([])
    // 同步版：q1 在 edge 後一個 tCQ 就變（沒有 ripple 累積）
    const real = simulate(ex3.netlist, 4, { period: T, delayMode: 'real' })
    const q1 = real.traces.find((t) => t.name === 'q1')!
    expect(q1.events.find((ev) => ev.v === 1)!.t).toBeCloseTo(2 * T + 8, 6)
    const d1 = real.traces.find((t) => t.name === 'd1')!
    expect(d1.events.find((ev) => ev.t > 0)!.t).toBeCloseTo(T + 8 + 12, 6)
  })
  it('ex4 (/3): 00 → 01 → 10 → 00, ratio 3, duty 1/3, 11 unreachable but self-recovering', () => {
    const { records, traces } = simulate(ex4.netlist, 12, { period: T })
    expect(stateSequence(ex4.netlist, records).slice(0, 9)).toEqual(['01', '10', '00', '01', '10', '00', '01', '10', '00'])
    const m = measureDivide(traces.find((t) => t.name === 'q1')!, T)
    expect(m.ratio).toBe(3)
    expect(m.duty).toBeCloseTo(1 / 3, 6)
    expect(m.risingTimes.slice(0, 3)).toEqual([2 * T, 5 * T, 8 * T])
    const g = buildStateGraph(ex4.netlist, {})
    expect(g.mainCycle).toEqual(['00', '01', '10'])
    expect(g.lockup).toEqual([])
    const s11 = g.nodes.find((n) => n.state === '11')!
    expect(s11.reachable).toBe(false)
    expect(s11.next).toBe('10')
    expect(s11.stepsToCycle).toBe(1)
  })
})

describe('lab exercises 1-4: hint 3 edge count covers two output periods', () => {
  it('k = first rising edge index + 2 × ratio', () => {
    expect(edgesForTwoOutputPeriods(ex1.netlist, ex1.simOptions)).toBe(1 + 2 * 2)
    expect(edgesForTwoOutputPeriods(ex2.netlist, ex2.simOptions)).toBe(2 + 2 * 4)
    expect(edgesForTwoOutputPeriods(ex3.netlist, ex3.simOptions)).toBe(2 + 2 * 4)
    expect(edgesForTwoOutputPeriods(ex4.netlist, ex4.simOptions)).toBe(2 + 2 * 3)
  })
})

describe('lab exercises 1-4: critical path scenarios', () => {
  it('every scenario has positive slack at its env and the expected worst path', () => {
    const expectedWorst: Record<string, string> = { 'ex1-div2': 'loop', 'ex2-ripple4': 'stage1', 'ex3-sync4': 'q0-xor-d1', 'ex4-div3': 'q0-nor-d0' }
    const expectedTclkMin: Record<string, number> = { 'ex1-div2': 25, 'ex2-ripple4': 25, 'ex3-sync4': 31, 'ex4-div3': 31 }
    for (const e of mine) {
      const sc = e.criticalPath!
      expect(sc.schematic).toBe(e.schematic)
      const elemIds = new Set(sc.schematic.elements.map((el) => el.id))
      const wireIds = new Set(sc.schematic.wires.map((w) => w.id))
      for (const p of sc.paths) {
        expect(elemIds.has(p.launch.element), `${e.id} ${p.id} launch`).toBe(true)
        expect(elemIds.has(p.capture.element), `${e.id} ${p.id} capture`).toBe(true)
        for (const s of p.segments) {
          for (const w of s.wires ?? []) expect(wireIds.has(w), `${e.id} ${p.id} wire ${w}`).toBe(true)
          for (const el of s.elements ?? []) expect(elemIds.has(el), `${e.id} ${p.id} elem ${el}`).toBe(true)
          expect(s.min).toBeLessThanOrEqual(s.max)
        }
        if (p.type === 'setup') {
          expect(analyzeSetup(p, sc.env).slack, `${e.id} ${p.id} setup`).toBeGreaterThan(0)
          expect(analyzeHold(p, sc.env).slack, `${e.id} ${p.id} hold`).toBeGreaterThan(0)
        }
      }
      const worst = worstSetup(sc.paths, sc.env)!
      expect(worst.path.id, e.id).toBe(expectedWorst[e.id])
      expect(worst.result.tclkMin, e.id).toBe(expectedTclkMin[e.id])
      expect(sc.env.period).toBeLessThanOrEqual(100)
      expect(sc.env.period).toBeGreaterThan(worst.result.tclkMin)
    }
  })
  it('ex2 stage-2 loop has twice the available time of stage 1', () => {
    const sc = ex2.criticalPath!
    const s1 = analyzeSetup(sc.paths.find((p) => p.id === 'stage1')!, sc.env)
    const s2 = analyzeSetup(sc.paths.find((p) => p.id === 'stage2')!, sc.env)
    expect(s2.available).toBe(2 * s1.available)
    expect(s2.slack - s1.slack).toBe(sc.env.period)
  })
  it('ex4 no-logic path has the smallest hold slack', () => {
    const sc = ex4.criticalPath!
    const holds = sc.paths.filter((p) => p.type === 'setup').map((p) => ({ id: p.id, slack: analyzeHold(p, sc.env).slack }))
    const min = holds.reduce((a, b) => (b.slack < a.slack ? b : a))
    expect(min.id).toBe('q0-d1')
    expect(min.slack).toBe(6 - 3)
  })
})

describe('lab exercises 1-4: reset recovery / removal path', () => {
  /**
   * 這條 path 的兩段 delay 量的是「釋放到達 rstn pin 的時刻相對 clk edge k」
   *（reset synchronizer tCQ 5~8 + rst_n 走線 2~4），不是單純的走線延遲；
   * 所以 removal（= analyzeHold）必須是正的 slack，不能再出現「每一題 reset 都 removal violation」。
   */
  it('arrival 7~12 ps、removal slack +2、recovery slack +14（T = 40）', () => {
    for (const e of mine) {
      const sc = e.criticalPath!
      const p = sc.paths.find((x) => x.type === 'recovery')!
      expect(p.segments.map((x) => x.id), e.id).toEqual(['sync', 'rst'])
      const setup = analyzeSetup(p, sc.env)
      const hold = analyzeHold(p, sc.env)
      expect(sc.env.period, e.id).toBe(40)
      expect(hold.arrival, `${e.id} arrival,min`).toBe(5 + 2)
      expect(setup.arrival, `${e.id} arrival,max`).toBe(8 + 4)
      // removal：釋放必須比 edge k 晚 t_removal = 5 ps ⇒ 7 − 5 = +2
      expect(hold.required, `${e.id} removal req`).toBe(5)
      expect(hold.slack, `${e.id} removal slack`).toBe(2)
      // recovery：釋放必須比 edge k+1 早 t_recovery = 10 ps ⇒ (40 − 10 − 2 − 2) − 12 = +14
      expect(setup.required, `${e.id} recovery req`).toBe(26)
      expect(setup.slack, `${e.id} recovery slack`).toBe(14)
    }
  })
  it('recovery path 不限制 Fmax：worstSetup 不會挑到它，而且兩個 slack 都是正的', () => {
    for (const e of mine) {
      const sc = e.criticalPath!
      const rec = sc.paths.find((x) => x.type === 'recovery')!
      expect(worstSetup(sc.paths, sc.env)!.path.id, e.id).not.toBe(rec.id)
      expect(analyzeSetup(rec, sc.env).slack, `${e.id} recovery`).toBeGreaterThan(0)
      expect(analyzeHold(rec, sc.env).slack, `${e.id} removal`).toBeGreaterThan(0)
      expect(rec.limits, e.id).toContain('不是 Fmax')
    }
  })
})
