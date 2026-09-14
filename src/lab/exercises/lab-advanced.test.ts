import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, detectRuntPulses, measureDivide, stateSequence, valueAt } from '@/models/divider/analysis'
import { analyzeHold, analyzeSetup, worstSetup } from '@/models/timing/sta'
import { rotatingEdges } from '@/models/phase/pmux'
import { WORKSHEET_QUESTIONS } from '@/components/lab/worksheet'
import { parseRef } from '@/components/circuit/schematic'
import { edgesForTwoOutputPeriods } from '@/lab/hints'
import type { LabExercise } from '@/lab/types'
import type { Bit } from '@/models/divider/types'
import { dualMod23, mmd2 } from '@/models/divider/examples'
import { ex7SimOptions, ex8SimOptions, phaseIndexOf, PMUX_INPUT_LEAD, pmux8Div4, pmuxWalkerDm23, WALKER_T } from './advanced-models'
import ex5, { alternatingMod } from './ex5-dm23'
import ex6, { EX6_SETTINGS } from './ex6-mmd2'
import ex7, { selBits } from './ex7-pmux8'
import ex8, { phaseIndexAt, simWalker, walkerInputs } from './ex8-pmux-nn1-dtc'

const T = 100
const mine: LabExercise[] = [ex5, ex6, ex7, ex8]

/** reference.q9 必須以數字開頭 */
function ratioFromReference(e: LabExercise): number {
  const m = /^\s*(\d+(?:\.\d+)?)/.exec(e.reference.q9 ?? '')
  if (!m) throw new Error(`${e.id}: reference.q9 does not start with a number: ${e.reference.q9}`)
  return Number(m[1])
}

function outTrace(sim: ReturnType<typeof simulate>, name: string) {
  return sim.traces.find((t) => t.name === name)!
}

describe('lab exercises 5-8: metadata', () => {
  it('ids, orders, difficulty, 3 hints, Prompt / Solution', () => {
    expect(mine.map((e) => e.id)).toEqual(['ex5-dm23', 'ex6-mmd2', 'ex7-pmux8', 'ex8-pmux-nn1-dtc'])
    expect(mine.map((e) => e.order)).toEqual([5, 6, 7, 8])
    for (const e of mine) {
      expect(e.hints.length).toBe(3)
      for (const h of e.hints) expect(h.trim().length).toBeGreaterThan(40)
      expect(e.difficulty).toBeGreaterThanOrEqual(3)
      expect(e.difficulty).toBeLessThanOrEqual(5)
      expect(e.title.length).toBeGreaterThan(0)
      expect(e.summary.length).toBeGreaterThan(0)
      expect(typeof e.Solution).toBe('function')
      expect(typeof e.Prompt).toBe('function')
    }
  })
  it('reference has exactly q1..q15, all filled, q9 starts with a number', () => {
    for (const e of mine) {
      const keys = Object.keys(e.reference).sort()
      expect(keys, e.id).toEqual(WORKSHEET_QUESTIONS.map((q) => q.key).sort())
      for (const q of WORKSHEET_QUESTIONS) expect((e.reference[q.key] ?? '').trim().length, `${e.id} ${q.key}`).toBeGreaterThan(1)
      expect(Number.isFinite(ratioFromReference(e)), e.id).toBe(true)
    }
    expect(ex5.reference.q9.startsWith('2 或 3（mod=0 → 2，mod=1 → 3）')).toBe(true)
    expect(ex6.reference.q9.startsWith('4~7（N = 4 + 2·c1 + c0）')).toBe(true)
  })
  it('schematic wires reference existing elements / pins, signals exist in netlist, labels are anonymous', () => {
    for (const e of mine) {
      const ids = new Set(e.schematic.elements.map((el) => el.id))
      const known = new Set<string>([...e.netlist.clocks.map((c) => c.name), ...e.netlist.inputs.map((i) => i.name), ...e.netlist.flops.flatMap((f) => [f.q, f.d, f.qb ?? f.q, f.rstn ?? f.q]), ...e.netlist.gates.map((g) => g.out)])
      for (const w of e.schematic.wires) {
        expect(ids.has(parseRef(w.from).elem), `${e.id} ${w.id} from`).toBe(true)
        expect(ids.has(parseRef(w.to).elem), `${e.id} ${w.id} to`).toBe(true)
        for (const p of w.points ?? []) {
          expect(p[0], `${e.id} ${w.id}`).toBeGreaterThanOrEqual(0)
          expect(p[0], `${e.id} ${w.id}`).toBeLessThanOrEqual(e.schematic.width)
          expect(p[1], `${e.id} ${w.id}`).toBeGreaterThanOrEqual(0)
          expect(p[1], `${e.id} ${w.id}`).toBeLessThanOrEqual(e.schematic.height)
        }
        if (w.signal) {
          expect(known.has(w.signal), `${e.id} ${w.id} signal ${w.signal}`).toBe(true)
          expect(w.label, `${e.id} ${w.id} label`).toBeDefined()
        }
      }
      // 題目電路圖不可洩漏 netlist 命名：有 label 的元件只能叫 U1..U9；box 用 text
      for (const el of e.schematic.elements) if (el.label) expect(el.label, `${e.id} ${el.id}`).toMatch(/^U\d$/)
      for (const el of e.schematic.elements) {
        expect(el.x, `${e.id} ${el.id}`).toBeGreaterThanOrEqual(0)
        expect(el.x, `${e.id} ${el.id}`).toBeLessThanOrEqual(e.schematic.width)
        expect(el.y, `${e.id} ${el.id}`).toBeGreaterThanOrEqual(0)
        expect(el.y, `${e.id} ${el.id}`).toBeLessThanOrEqual(e.schematic.height)
      }
    }
    // 題目 8 是 block diagram：四個 box
    const boxes = ex8.schematic.elements.filter((el) => el.kind === 'box').map((el) => el.id)
    expect(boxes).toEqual(expect.arrayContaining(['pmux', 'div', 'dtc', 'fsm']))
  })
  it('default-input divide ratio matches the number at the start of reference.q9', () => {
    for (const e of mine) {
      const period = e.simOptions?.period ?? T
      const { traces } = simulate(e.netlist, 24, { ...e.simOptions, period })
      const m = measureDivide(traces.find((t) => t.name === e.netlist.output)!, period)
      expect(m.ratio, e.id).toBe(ratioFromReference(e))
      expect(m.periodic, e.id).toBe(true)
      expect(edgesForTwoOutputPeriods(e.netlist, e.simOptions)).toBeGreaterThanOrEqual(4)
    }
  })
})

describe('ex5 (/2 /3 dual-modulus)', () => {
  it('mod = 0: 00 → 01 → 00, ratio 2, duty 50%; unused states return to 00', () => {
    const sim = simulate(dualMod23, 10, { period: T })
    expect(stateSequence(dualMod23, sim.records).slice(0, 6)).toEqual(['01', '00', '01', '00', '01', '00'])
    const m = measureDivide(outTrace(sim, 'div_out'), T)
    expect(m.ratio).toBe(2)
    expect(m.duty).toBe(0.5)
    expect(m.risingTimes.slice(0, 3)).toEqual([2 * T, 4 * T, 6 * T])
    const g = buildStateGraph(dualMod23, { mod: 0 })
    expect(g.mainCycle).toEqual(['00', '01'])
    expect(g.lockup).toEqual([])
    expect(g.nodes.find((n) => n.state === '10')!.next).toBe('00')
    expect(g.nodes.find((n) => n.state === '11')!.next).toBe('00')
  })
  it('mod = 1: 00 → 01 → 10 → 00, ratio 3, duty 1/3; 11 → 10', () => {
    const sim = simulate(dualMod23, 12, { period: T }, (k) => (k === 1 ? { mod: 1 } : {}))
    expect(stateSequence(dualMod23, sim.records).slice(0, 6)).toEqual(['01', '10', '00', '01', '10', '00'])
    const m = measureDivide(outTrace(sim, 'div_out'), T)
    expect(m.ratio).toBe(3)
    expect(m.duty).toBeCloseTo(1 / 3, 6)
    expect(m.risingTimes.slice(0, 3)).toEqual([3 * T, 6 * T, 9 * T])
    const g = buildStateGraph(dualMod23, { mod: 1 })
    expect(g.mainCycle).toEqual(['00', '01', '10'])
    expect(g.lockup).toEqual([])
    expect(g.nodes.find((n) => n.state === '11')!.next).toBe('10')
  })
  it('alternating mod: periods 3, 2, 3, 2 (phase-continuous, average 2.5)', () => {
    const sim = simulate(dualMod23, 12, { period: T }, alternatingMod)
    const m = measureDivide(outTrace(sim, 'div_out'), T)
    expect(m.intervals).toEqual([3, 2, 3, 2])
    expect(m.intervals.reduce((a, b) => a + b, 0) / m.intervals.length).toBe(2.5)
    // mod 只在 state 01 的 edge 被取樣：d1 只有在 stateBefore = 01 時才可能為 1
    for (const r of sim.records) if (r.stateBefore.q0 === 0) expect(r.combBefore.d1).toBe(0)
  })
  it('real delay: d1 settles tCQ + AND after the edge, out rises tCQ + NOR after the edge', () => {
    const real = simulate(dualMod23, 4, { period: T, delayMode: 'real' }, (k) => (k === 1 ? { mod: 1 } : {}))
    const d1 = outTrace(real, 'd1')
    expect(d1.events.find((ev) => ev.t > 0)!.t).toBeCloseTo(T + 8 + 10, 6)
    const out = outTrace(real, 'div_out')
    expect(out.events.filter((ev) => ev.v === 1).map((ev) => ev.t)[1]).toBeCloseTo(3 * T + 8 + 12, 6)
  })
})

describe('ex6 (two-stage MMD)', () => {
  for (const s of EX6_SETTINGS) {
    it(`c1c0 = ${s.c1}${s.c0}: ratio ${s.N}, duty (2 + c0)/N`, () => {
      const sim = simulate(mmd2, 4 * s.N + 4, { period: T }, (k) => (k === 1 ? { p0: s.c0, p1: s.c1 } : {}))
      const m = measureDivide(outTrace(sim, 'div_out'), T)
      expect(m.ratio).toBe(s.N)
      expect(m.periodic).toBe(true)
      expect(m.duty).toBeCloseTo((2 + s.c0) / s.N, 6)
      expect(m.risingTimes.slice(0, 2)).toEqual([s.N * T, 2 * s.N * T])
    })
  }
  it('state sequences for N = 4 and N = 5 (b1 b0 a1 a0)', () => {
    const s4 = simulate(mmd2, 8, { period: T })
    expect(stateSequence(mmd2, s4.records)).toEqual(['0001', '0100', '0101', '0000', '0001', '0100', '0101', '0000'])
    const s5 = simulate(mmd2, 10, { period: T }, (k) => (k === 1 ? { p0: 1 } : {}))
    expect(stateSequence(mmd2, s5.records)).toEqual(['0001', '0010', '0100', '0101', '0000', '0001', '0010', '0100', '0101', '0000'])
    // block B 只在 f1 rising 的 edge 改變
    for (const r of s5.records) {
      const bChanged = r.stateBefore.b0 !== r.stateAfter.b0 || r.stateBefore.b1 !== r.stateAfter.b1
      const f1Rises = r.combBefore.f1 === 0 && r.valuesAfter.f1 === 1
      expect(bChanged, `edge ${r.edgeIndex}`).toBe(f1Rises)
    }
  })
  it('mod chain: the request launched at edge k is only sampled at edge k+2 (a0 = 0 blocks U4 at k+1)', () => {
    const s5 = simulate(mmd2, 10, { period: T }, (k) => (k === 1 ? { p0: 1 } : {}))
    // edge 5：a 回到 00、b 回到 00 ⇒ mod_out2 = 1（launch）；edge 6 a = 00 → 01（da1 = 0）；edge 7 a = 01 取樣 da1 = 1
    const r6 = s5.records[5]
    const r7 = s5.records[6]
    expect(r6.stateBefore.a0).toBe(0)
    expect(r6.combBefore.mod1_eff).toBe(1)
    expect(r6.combBefore.da1).toBe(0)
    expect(r7.stateBefore.a0).toBe(1)
    expect(r7.combBefore.da1).toBe(1)
    expect(r7.stateAfter.a1).toBe(1)
    // real delay：n4（da1）在 edge k 之後 60 ps 才穩定（f1 20 + tCQ 8 + NOR 12 + AND 10 + AND 10）
    const real = simulate(mmd2, 6, { period: T, delayMode: 'real' }, (k) => (k === 1 ? { p0: 1 } : {}))
    const f1 = outTrace(real, 'f1')
    expect(f1.events.filter((ev) => ev.v === 1).map((ev) => ev.t)[1]).toBeCloseTo(3 * T + 20, 6)
    const mod1 = outTrace(real, 'mod1_eff')
    const modRise = mod1.events.filter((ev) => ev.v === 1 && ev.t > 5 * T).map((ev) => ev.t)[0]
    expect(modRise).toBeCloseTo(5 * T + 20 + 8 + 12 + 10, 6)
    // 進到 edge 6（600）之前 n1 = 0 擋住 U4：da1 在 edge 6 前後都是 0，edge 7 才取到 1
    const da1 = real.sim.getTraces(['da1'])[0]
    expect(valueAt(da1, 6 * T - 1)).toBe(0)
    expect(valueAt(da1, 7 * T - 1)).toBe(1)
  })
})

describe('ex7 (8-phase PMUX + /4)', () => {
  it('every sel: ratio 4, duty 50%, first rising edge = 2T + sel·T/8', () => {
    for (let sel = 0; sel < 8; sel++) {
      const sim = simulate(pmux8Div4, 12, ex7SimOptions, (k) => (k === 1 ? selBits(sel) : {}))
      const m = measureDivide(outTrace(sim, 'div_out'), T)
      expect(m.ratio, `sel ${sel}`).toBe(4)
      expect(m.duty, `sel ${sel}`).toBe(0.5)
      expect(m.risingTimes[0], `sel ${sel}`).toBeCloseTo(2 * T + (sel * T) / 8, 6)
      expect(stateSequence(pmux8Div4, sim.records).slice(0, 4).join(' '), `sel ${sel}`).toMatch(/^(01 10 11 00|00 01 10 11)$/)
    }
  })
  it('sel 0 → 3 moves the output edge by 3/8 T; real delay adds MUX + tCQ = 16 ps', () => {
    const r0 = measureDivide(outTrace(simulate(pmux8Div4, 12, ex7SimOptions), 'div_out'), T)
    const r3 = measureDivide(outTrace(simulate(pmux8Div4, 12, ex7SimOptions, (k) => (k === 1 ? selBits(3) : {})), 'div_out'), T)
    expect(r3.risingTimes[0] - r0.risingTimes[0]).toBeCloseTo((3 * T) / 8, 6)
    expect(r3.risingTimes[1] - r0.risingTimes[1]).toBeCloseTo((3 * T) / 8, 6)
    const real3 = measureDivide(outTrace(simulate(pmux8Div4, 12, { ...ex7SimOptions, delayMode: 'real' }, (k) => (k === 1 ? selBits(3) : {})), 'div_out'), T)
    expect(real3.risingTimes[0]).toBeCloseTo(2 * T + (3 * T) / 8 + 8 + 8, 6)
  })
  it('switching inside the window (0 → 3) is clean; 0 → 4 creates a runt and an extra edge', () => {
    const tSwitch = 5 * T - PMUX_INPUT_LEAD * T
    const sw3 = simulate(pmux8Div4, 10, ex7SimOptions, (k) => (k === 5 ? selBits(3) : {}))
    const pclk3 = outTrace(sw3, 'pclk')
    expect(detectRuntPulses([pclk3], T / 8)).toEqual([])
    // 切換時 ph0 與 ph3 都 high：pclk 沒有事件
    expect(pclk3.events.some((ev) => Math.abs(ev.t - tSwitch) < 1e-6)).toBe(false)
    const m3 = measureDivide(outTrace(sw3, 'div_out'), T)
    expect(m3.risingTimes.slice(0, 3)).toEqual([2 * T, 6 * T + (3 * T) / 8, 10 * T + (3 * T) / 8])

    const sw4 = simulate(pmux8Div4, 10, ex7SimOptions, (k) => (k === 5 ? selBits(4) : {}))
    const pclk4 = outTrace(sw4, 'pclk')
    const runts = detectRuntPulses([pclk4], T / 8)
    expect(runts.length).toBe(1)
    expect(runts[0].t0).toBeCloseTo(tSwitch, 6)
    expect(runts[0].width).toBeCloseTo(4.5 * T - tSwitch, 6)
    expect(runts[0].level).toBe(0)
    // 多了一個 rising edge：out 的第二個 rising 提前一個 T
    const m4 = measureDivide(outTrace(sw4, 'div_out'), T)
    expect(m4.risingTimes[1]).toBeCloseTo(5.5 * T, 6)
  })
  it('all four states reachable, no lock-up', () => {
    const g = buildStateGraph(pmux8Div4, { s0: 0, s1: 0, s2: 0 })
    expect(g.mainCycle).toEqual(['00', '01', '10', '11'])
    expect(g.lockup).toEqual([])
  })
})

describe('ex8 (PMUX + /2 /3 + walker)', () => {
  it('step = 0: mod = 0 → /2, mod = 1 → /3, phase index never moves', () => {
    for (const mod of [0, 1] as Bit[]) {
      const sim = simWalker(mod, 0, 24)
      const m = measureDivide(outTrace(sim, 'div_out'), WALKER_T)
      expect(m.ratio, `mod ${mod}`).toBe(2 + mod)
      expect(m.duty, `mod ${mod}`).toBeCloseTo(1 / (2 + mod), 6)
      for (const r of sim.records) expect(phaseIndexOf(r.stateAfter), `mod ${mod} edge ${r.edgeIndex}`).toBe(0)
      expect(outTrace(sim, 'rot_en').events.every((ev) => ev.v === 0)).toBe(true)
    }
  })
  const combos: { mod: Bit; step: number }[] = [
    { mod: 0, step: 1 },
    { mod: 0, step: 2 },
    { mod: 0, step: 3 },
    { mod: 1, step: 1 },
    { mod: 1, step: 2 },
    { mod: 1, step: 3 },
  ]
  for (const { mod, step } of combos) {
    it(`mod = ${mod}, step = ${step}: every output period is exactly N·T + step·T/8 (ideal and real), no runt on pclk`, () => {
      for (const delayMode of ['ideal', 'real'] as const) {
        const sim = simWalker(mod, step, 60, delayMode)
        const m = measureDivide(outTrace(sim, 'div_out'), WALKER_T)
        expect(m.ratio, `${delayMode}`).toBeCloseTo(2 + mod + step / 8, 6)
        expect(m.periodic, `${delayMode}`).toBe(true)
        expect(m.intervals.every((x) => Math.abs(x - (2 + mod + step / 8)) < 1e-6), `${delayMode}`).toBe(true)
        expect(m.duty, `${delayMode}`).toBeCloseTo((1 + step / 8) / (2 + mod + step / 8), 6)
        expect(detectRuntPulses([outTrace(sim, 'pclk')], WALKER_T / 8 - 1), `${delayMode}`).toEqual([])
      }
    })
  }
  it('walker: t advances by step when the cell leaves 00, s follows one phase at a time (0,1,2,…,7,0 for step 1; 0,3,6,1,4,7,2,5 for step 3)', () => {
    const w1 = simWalker(0, 1, 34)
    const s1 = w1.records.map((r) => phaseIndexOf(r.stateAfter))
    expect(s1.slice(0, 18)).toEqual([0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 0, 0])
    expect(w1.records[0].stateAfter.t0).toBe(1)
    expect(phaseIndexOf(w1.records[0].stateAfter, 't')).toBe(1)
    const w3 = simWalker(0, 3, 40)
    const m3 = measureDivide(outTrace(w3, 'div_out'), WALKER_T)
    // 每個 output rising edge 用的 phase（walker 在 edge 之後才走）：0,3,6,1,4,7,2,5,0
    expect(m3.risingTimes.slice(0, 9).map((t) => phaseIndexAt(w3.traces, t))).toEqual([0, 3, 6, 1, 4, 7, 2, 5, 0])
    // 走完之後（div_out 落下時）s 已經是下一個 edge 要用的 phase
    // fallingTimes[0] 是 reset 後第一個 edge（div_out 由 reset 的 1 落下），之後每個 falling 都在 walk 完成之後
    expect(m3.fallingTimes.slice(1, 9).map((t) => phaseIndexAt(w3.traces, t))).toEqual([3, 6, 1, 4, 7, 2, 5, 0])
    // pclk 的第一個被拉長的 high：250 ps（real delay，808 → 1058）
    const real = simWalker(0, 1, 6, 'real')
    const ev = outTrace(real, 'pclk').events
    expect(ev.slice(0, 5).map((e) => e.t)).toEqual([0, 408, 608, 808, 1058])
  })
  it('walker edge times agree with the jump-select + carry model (rotatingEdges) for N = 2, step = 3', () => {
    const sim = simWalker(0, 3, 40)
    const m = measureDivide(outTrace(sim, 'div_out'), WALKER_T)
    const rot = rotatingEdges(2, 3, 8, 8)
    for (let i = 0; i < 8; i++) expect((m.risingTimes[i] - m.risingTimes[0]) / WALKER_T).toBeCloseTo(rot.times[i], 9)
    expect(rot.carries.slice(0, 8)).toEqual([0, 0, 1, 0, 0, 1, 0, 1])
  })
  it('reachable states are (t, s, q) combinations: far fewer than 256, none locked up', () => {
    const sim = simWalker(0, 1, 160)
    const seen = new Set(stateSequence(pmuxWalkerDm23, sim.records))
    expect(seen.size).toBe(17)
    expect(seen.size).toBeLessThan(256)
    // s 從不領先 t（mod 8 距離 t − s ∈ {0, 1}）
    for (const r of sim.records) {
      const gap = (phaseIndexOf(r.stateAfter, 't') - phaseIndexOf(r.stateAfter) + 8) % 8
      expect(gap, `edge ${r.edgeIndex}`).toBeLessThanOrEqual(1)
    }
    expect(walkerInputs(1, 3)).toEqual({ mod: 1, k0: 1, k1: 1 })
    expect(ex8SimOptions.inputLead).toBe(PMUX_INPUT_LEAD)
  })
})

describe('lab exercises 5-8: critical path scenarios', () => {
  it('paths reference schematic elements / wires; setup-type paths have positive slack; worst path per mode', () => {
    const expectedWorst: Record<string, Record<string, [string, number]>> = {
      'ex5-dm23': { div2: ['q0-nor-d0', 31], div3: ['q0-nor-d0', 31] },
      'ex6-mmd2': { even: ['a-loop', 31], odd: ['mod-chain', 35.5] },
      'ex7-pmux8': { all: ['q0-xor-d1', 31] },
      'ex8-pmux-nn1-dtc': { static: ['cell-loop', 31], walk: ['walk-start', 416] },
    }
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
          expect(s.min, `${e.id} ${p.id} ${s.id}`).toBeLessThanOrEqual(s.max)
        }
        if (p.modes) for (const m of p.modes) expect(sc.modes?.some((x) => x.id === m), `${e.id} ${p.id} mode ${m}`).toBe(true)
        if (p.type === 'setup' || p.type === 'multicycle' || p.type === 'async') {
          expect(analyzeSetup(p, sc.env).slack, `${e.id} ${p.id} setup`).toBeGreaterThan(0)
          expect(analyzeHold(p, sc.env).slack, `${e.id} ${p.id} hold`).toBeGreaterThan(0)
        }
      }
      const modes = sc.modes?.map((m) => m.id) ?? ['all']
      for (const mode of modes) {
        const worst = worstSetup(sc.paths, sc.env, mode === 'all' ? undefined : mode)!
        const [id, tmin] = expectedWorst[e.id][mode]
        expect(worst.path.id, `${e.id} ${mode}`).toBe(id)
        expect(worst.result.tclkMin, `${e.id} ${mode}`).toBeCloseTo(tmin, 6)
        expect(sc.env.period, `${e.id} ${mode}`).toBeGreaterThan(worst.result.tclkMin)
      }
    }
  })
  it('ex6 mod chain is a 2-cycle path and the worst only when c0 = 1', () => {
    const sc = ex6.criticalPath!
    const chain = sc.paths.find((p) => p.id === 'mod-chain')!
    expect(chain.cycles).toBe(2)
    const r = analyzeSetup(chain, sc.env)
    expect(r.arrival).toBe(60)
    expect(r.available).toBe(2 * sc.env.period)
    expect(worstSetup(sc.paths, sc.env, 'even')!.path.id).toBe('a-loop')
  })
  it('ex7 select window is an async path with 3/8 T available; ex8 walker paths use 1/8 T', () => {
    const win = ex7.criticalPath!.paths.find((p) => p.id === 'sel-window')!
    expect(win.type).toBe('async')
    const r = analyzeSetup(win, ex7.criticalPath!.env)
    expect(r.available).toBeCloseTo((3 / 8) * ex7.criticalPath!.env.period, 6)
    expect(r.arrival).toBe(16)
    const ws = ex8.criticalPath!.paths.find((p) => p.id === 'walk-start')!
    const rs = analyzeSetup(ws, ex8.criticalPath!.env)
    expect(rs.available).toBe(ex8.criticalPath!.env.period / 8)
    expect(rs.arrival).toBe(48)
    expect(rs.tclkMin).toBe(416)
    // 模擬用的 T = 400 ps 剛好在 walker 的極限之內（沒有 jitter / margin 時 48 < 50）
    expect(rs.arrival).toBeLessThan(WALKER_T / 8)
  })
})

describe('lab exercises 5-8: reset recovery / removal 與 multicycle 的數字', () => {
  /** recovery path 的兩段 delay 量的是「釋放到達 rstn pin 的時刻相對 clk（或 n1）edge k」 */
  it('ex5 / ex6 / ex7：arrival 7~12 ps、removal slack +2、recovery slack = T − 10 − 2 − 2 − 12', () => {
    const expected: Record<string, { period: number; recovery: number }> = {
      'ex5-dm23': { period: 40, recovery: 14 },
      'ex6-mmd2': { period: 38, recovery: 12 },
      'ex7-pmux8': { period: 100, recovery: 74 },
    }
    for (const e of [ex5, ex6, ex7]) {
      const sc = e.criticalPath!
      const p = sc.paths.find((x) => x.type === 'recovery')!
      expect(p.segments.map((x) => x.id), e.id).toEqual(['sync', 'rst'])
      const setup = analyzeSetup(p, sc.env)
      const hold = analyzeHold(p, sc.env)
      expect(sc.env.period, e.id).toBe(expected[e.id].period)
      expect(hold.arrival, `${e.id} arrival,min`).toBe(7)
      expect(setup.arrival, `${e.id} arrival,max`).toBe(12)
      expect(hold.slack, `${e.id} removal slack`).toBe(2)
      expect(setup.slack, `${e.id} recovery slack`).toBe(expected[e.id].recovery)
      expect(worstSetup(sc.paths, sc.env, sc.modes?.[0]?.id)!.path.id, e.id).not.toBe(p.id)
    }
    // 題目 8 是 block diagram，沒有畫 reset pin，也就沒有這條 path
    expect(ex8.criticalPath!.paths.some((p) => p.type === 'recovery')).toBe(false)
  })

  it('ex6 mod chain：沒有宣告 multicycle 時工具會報的「假 violation」是 −33 ps（可用 1 T = 38 ps）', () => {
    const sc = ex6.criticalPath!
    const chain = sc.paths.find((p) => p.id === 'mod-chain')!
    expect(sc.env.period).toBe(38)
    const one = analyzeSetup({ ...chain, cycles: 1 }, sc.env)
    expect(one.available).toBe(38)
    expect(one.required).toBe(38 - 7 - 2 - 2)
    expect(one.arrival).toBe(60)
    expect(one.slack).toBe(-33)
    // 宣告 2-cycle 之後才是 +5 ps
    expect(analyzeSetup(chain, sc.env).slack).toBe(5)
    const notes = (chain.notes ?? []).join(' ')
    expect(notes).toContain('38 ps')
    expect(notes).toContain('−33 ps')
    expect(notes).not.toContain('40 ps')
    expect(notes).not.toContain('−31')
  })

  it('ex7 sel 0 → 4 切在視窗外：輸出 edge 比「乾淨切到 sel = 4」提前剛好 1 T（−100 ps，不是 −350）', () => {
    const risings = (inputAt?: (k: number) => Record<string, Bit>) =>
      measureDivide(outTrace(simulate(pmux8Div4, 14, ex7SimOptions, inputAt), 'div_out'), T).risingTimes
    const clean4 = risings((k) => (k === 1 ? selBits(4) : {}))
    const late4 = risings((k) => (k === 5 ? selBits(4) : {}))
    const none = risings()
    expect(none.slice(0, 3)).toEqual([2 * T, 6 * T, 10 * T])
    expect(clean4.slice(0, 3)).toEqual([2.5 * T, 6.5 * T, 10.5 * T])
    expect(late4.slice(0, 3)).toEqual([2 * T, 5.5 * T, 9.5 * T])
    // 切換之後每一個 edge 都比乾淨切換早 1 T：多數了一個 edge（不是 −350 ps）
    for (let i = 1; i < 3; i++) expect(late4[i] - clean4[i], `edge ${i}`).toBeCloseTo(-T, 6)
    // 550 − 200 = 350 只是那一次被縮短的「輸出週期」，不是相位跳動量
    expect(late4[1] - late4[0]).toBeCloseTo(3.5 * T, 6)
  })
})

describe('lab exercises 5-8: SSR render', () => {
  for (const e of mine) {
    it(`${e.id}: Prompt and Solution render without window / document, no placeholders`, () => {
      const prompt = renderToString(createElement(MemoryRouter, null, createElement(e.Prompt!)))
      expect(prompt.length).toBeGreaterThan(200)
      const html = renderToString(createElement(MemoryRouter, null, createElement(e.Solution)))
      expect(html.length).toBeGreaterThan(8000)
      expect(html).not.toMatch(new RegExp(`${['PDLA', 'STUB'].join('_')}|Lorem|TODO|之後再補`, 'i'))
      expect(html).toContain('常見錯誤')
      expect(html).toContain('自我檢查')
    })
  }
})
