import { describe, expect, it } from 'vitest'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, detectRuntPulses, measureDivide, nextStateOf, stateSequence, findPeriod, valueAt } from '@/models/divider/analysis'
import { div3, div3Lockup, div3Duty50 } from '@/models/divider/examples'
import { analyzeHold, analyzeSetup, worstSetup } from '@/models/timing/sta'
import { div3Alt, div3And, div3Duty50In40, div5Duty50, div5DecodeGlitch } from './models'
import { div3Timing, div3Duty50Timing } from './timing'
import type { Netlist } from '@/models/divider/types'

const T = 100
const trace = (traces: ReturnType<typeof simulate>['traces'], name: string) => traces.find((t) => t.name === name)!
const times = (traces: ReturnType<typeof simulate>['traces'], name: string, v: 0 | 1) =>
  trace(traces, name)
    .events.filter((e) => e.t > 0 && e.v === v)
    .map((e) => e.t)

// ---------------------------------------------------------------- Lesson 2-1 課文引用的既有 example 事實
describe('Lesson 2-1 facts about div3 / div3Lockup (examples)', () => {
  it('div3: 00→01→10 cycle, output q1 high 1T / period 3T, real-mode edge times', () => {
    const { records, traces } = simulate(div3, 9, { period: T })
    expect(stateSequence(div3, records)).toEqual(['01', '10', '00', '01', '10', '00', '01', '10', '00'])
    const m = measureDivide(trace(traces, 'q1'), T)
    expect(m.ratio).toBe(3)
    expect(m.duty).toBeCloseTo(1 / 3, 6)
    expect(m.risingTimes.slice(0, 3)).toEqual([200, 500, 800])
    expect(m.fallingTimes.slice(0, 2)).toEqual([300, 600])
    // real delay：q 在 edge + 8、d0 在 edge + 8 + 12
    const real = simulate(div3, 3, { period: T, delayMode: 'real' }).traces
    expect(times(real, 'q0', 1)[0]).toBeCloseTo(108, 6)
    expect(times(real, 'd0', 0)[0]).toBeCloseTo(120, 6)
  })
  it('div3: state 11 is unreachable and returns to the loop via 10 (11 → 10 → 00)', () => {
    const g = buildStateGraph(div3, {})
    expect(g.mainCycle).toEqual(['00', '01', '10'])
    const n11 = g.nodes.find((n) => n.state === '11')!
    expect(n11.reachable).toBe(false)
    expect(n11.lockup).toBe(false)
    expect(n11.next).toBe('10')
    expect(n11.stepsToCycle).toBe(1)
    const { records } = simulate(div3, 4, { period: T, initialState: { q0: 1, q1: 1 } })
    expect(stateSequence(div3, records)).toEqual(['10', '00', '01', '10'])
    // quiz q2：從 11 啟動兩個 edge 之後是 00
    expect(stateSequence(div3, records)[1]).toBe('00')
  })
  it('div3Lockup: identical on legal states, but 11 → 11', () => {
    for (const s of ['00', '01', '10']) expect(nextStateOf(div3Lockup, s, {}).next).toBe(nextStateOf(div3, s, {}).next)
    expect(nextStateOf(div3Lockup, '11', {}).next).toBe('11')
    expect(buildStateGraph(div3Lockup, {}).lockup).toEqual(['11'])
  })
})

// ---------------------------------------------------------------- div3Alt（Lesson 2-1 練習）
describe('div3Alt: 00 → 01 → 11 → 00', () => {
  it('state sequence and next-state equations', () => {
    const { records } = simulate(div3Alt, 9, { period: T })
    expect(stateSequence(div3Alt, records)).toEqual(['01', '11', '00', '01', '11', '00', '01', '11', '00'])
    expect(findPeriod(stateSequence(div3Alt, records))).toEqual({ period: 3, start: 0 })
    expect(nextStateOf(div3Alt, '00', {}).d).toEqual({ d0: 1, d1: 0 })
    expect(nextStateOf(div3Alt, '01', {}).d).toEqual({ d0: 1, d1: 1 })
    expect(nextStateOf(div3Alt, '11', {}).d).toEqual({ d0: 0, d1: 0 })
  })
  it('divide ratio 3; q1 duty 1/3, q0 duty 2/3', () => {
    const { traces } = simulate(div3Alt, 12, { period: T })
    const q1 = measureDivide(trace(traces, 'q1'), T)
    expect(q1.ratio).toBe(3)
    expect(q1.periodic).toBe(true)
    expect(q1.duty).toBeCloseTo(1 / 3, 6)
    const q0 = measureDivide(trace(traces, 'q0'), T)
    expect(q0.ratio).toBe(3)
    expect(q0.duty).toBeCloseTo(2 / 3, 6)
  })
  it('unused state 10 is unreachable, not lock-up, returns to 00 in one edge', () => {
    const g = buildStateGraph(div3Alt, {})
    expect(g.mainCycle).toEqual(['00', '01', '11'])
    expect(g.lockup).toEqual([])
    const n10 = g.nodes.find((n) => n.state === '10')!
    expect(n10.reachable).toBe(false)
    expect(n10.next).toBe('00')
    expect(n10.stepsToCycle).toBe(1)
    const { records } = simulate(div3Alt, 4, { period: T, initialState: { q0: 0, q1: 1 } })
    expect(stateSequence(div3Alt, records)).toEqual(['00', '01', '11', '00'])
  })
  it('real delay: d0 changes tINV after q1, d1 changes tAND after its inputs', () => {
    const { traces } = simulate(div3Alt, 3, { period: T, delayMode: 'real' })
    expect(times(traces, 'q1', 1)[0]).toBeCloseTo(208, 6)
    expect(times(traces, 'd0', 0)[0]).toBeCloseTo(214, 6)
    expect(times(traces, 'q0', 1)[0]).toBeCloseTo(108, 6)
    expect(times(traces, 'd1', 1)[0]).toBeCloseTo(118, 6)
  })
  it('dropping the NOT q1 term (d1 = q0) would give a Johnson /4 — documents the exercise pitfall', () => {
    const johnson: Netlist = {
      ...div3Alt,
      id: 'div3-alt-johnson',
      gates: [div3Alt.gates[0], { out: 'd1', inputs: ['q0'], fn: (v) => v.q0, delay: 0, label: 'wire', kind: 'buf' }],
      legalStates: undefined,
    }
    expect(buildStateGraph(johnson, {}).mainCycle).toEqual(['00', '01', '11', '10'])
    const { traces } = simulate(johnson, 12, { period: T })
    expect(measureDivide(trace(traces, 'q1'), T).ratio).toBe(4)
  })
})

// ---------------------------------------------------------------- Lesson 2-2：div3Duty50 課文引用的事實
describe('Lesson 2-2 facts about div3Duty50 (example)', () => {
  it('q1 high 2T→3T, q1_f high 2.5T→3.5T, div_out high 2T→3.5T = 1.5T; ratio 3 duty 50%', () => {
    const { traces } = simulate(div3Duty50, 9, { period: T })
    expect(times(traces, 'q1', 1).slice(0, 2)).toEqual([200, 500])
    expect(times(traces, 'q1', 0).slice(0, 2)).toEqual([300, 600])
    expect(times(traces, 'q1_f', 1).slice(0, 2)).toEqual([250, 550])
    expect(times(traces, 'q1_f', 0).slice(0, 2)).toEqual([350, 650])
    const m = measureDivide(trace(traces, 'div_out'), T)
    expect(m.risingTimes.slice(0, 3)).toEqual([200, 500, 800])
    expect(m.fallingTimes.slice(0, 2)).toEqual([350, 650])
    expect(m.ratio).toBe(3)
    expect(m.duty).toBeCloseTo(0.5, 6)
    expect(measureDivide(trace(traces, 'q1'), T).duty).toBeCloseTo(1 / 3, 6)
  })
  it('real delay: div_out rises at 2T + tCQ + tOR, falls at 3.5T + tCQ + tOR; no runt pulses', () => {
    const { traces } = simulate(div3Duty50, 6, { period: T, delayMode: 'real' })
    expect(times(traces, 'q1', 1)[0]).toBeCloseTo(208, 6)
    expect(times(traces, 'q1_f', 1)[0]).toBeCloseTo(258, 6)
    expect(times(traces, 'div_out', 1)[0]).toBeCloseTo(218, 6)
    expect(times(traces, 'div_out', 0)[0]).toBeCloseTo(368, 6)
    expect(detectRuntPulses(traces, 40)).toEqual([])
  })
  it('half-cycle setup failure (tCQ = 60 ps > T/2): q1_f one cycle late, output breaks into two pulses per 3T', () => {
    const { traces } = simulate(div3Duty50, 9, { period: T, delayMode: 'real', tcqOverride: 60 })
    // q1 rises at 2T + 60 = 260 > falling edge at 250 ⇒ FF2 captures 1 only at 3.5T
    expect(times(traces, 'q1', 1)[0]).toBeCloseTo(260, 6)
    expect(times(traces, 'q1_f', 1)[0]).toBeCloseTo(410, 6)
    const m = measureDivide(trace(traces, 'div_out'), T)
    expect(m.intervals.slice(1)).toEqual([1.5, 1.5, 1.5])
    expect(m.ratio).toBe(1.5)
  })
})

// ---------------------------------------------------------------- div3And（Lesson 2-2 練習）
describe('div3And: q1 AND q1_f', () => {
  it('same /3 core, output high 0.5T from clk↓ to clk↑, ratio 3, duty 1/6', () => {
    const { records, traces } = simulate(div3And, 9, { period: T })
    expect(stateSequence(div3And, records).slice(0, 6)).toEqual(['01', '10', '00', '01', '10', '00'])
    expect(buildStateGraph(div3And, {}).mainCycle).toEqual(['00', '01', '10'])
    const m = measureDivide(trace(traces, 'div_out'), T)
    expect(m.risingTimes.slice(0, 3)).toEqual([250, 550, 850])
    expect(m.fallingTimes.slice(0, 2)).toEqual([300, 600])
    expect(m.ratio).toBe(3)
    expect(m.duty).toBeCloseTo(1 / 6, 6)
  })
  it('real delay: rising edge launched by FF2 (clk↓), falling edge by FF1 (clk↑)', () => {
    const { traces } = simulate(div3And, 5, { period: T, delayMode: 'real' })
    expect(times(traces, 'div_out', 1)[0]).toBeCloseTo(250 + 8 + 10, 6)
    expect(times(traces, 'div_out', 0)[0]).toBeCloseTo(300 + 8 + 10, 6)
  })
})

// ---------------------------------------------------------------- div3Duty50In40
describe('div3Duty50In40: input duty 40%', () => {
  it('falling edge at k + 0.4T ⇒ high 1.4T, ratio 3, duty 46.7%', () => {
    const { traces } = simulate(div3Duty50In40, 9, { period: T })
    expect(times(traces, 'clk', 0).slice(0, 2)).toEqual([140, 240])
    expect(times(traces, 'q1_f', 1)[0]).toBe(240)
    const m = measureDivide(trace(traces, 'div_out'), T)
    expect(m.ratio).toBe(3)
    expect(m.duty).toBeCloseTo(1.4 / 3, 6)
    expect(m.fallingTimes[0] - m.risingTimes[0]).toBeCloseTo(140, 6)
  })
})

// ---------------------------------------------------------------- div5Duty50
describe('div5Duty50: mod-5 counter + falling-edge DFF + OR', () => {
  it('state sequence 000→001→010→011→100', () => {
    const { records } = simulate(div5Duty50, 10, { period: T })
    expect(stateSequence(div5Duty50, records)).toEqual(['001', '010', '011', '100', '000', '001', '010', '011', '100', '000'])
    expect(findPeriod(stateSequence(div5Duty50, records))).toEqual({ period: 5, start: 0 })
  })
  it('q1 high 2T (duty 2/5); div_out high 2.5T; ratio 5, duty 50%', () => {
    const { traces } = simulate(div5Duty50, 15, { period: T })
    const q1 = measureDivide(trace(traces, 'q1'), T)
    expect(q1.ratio).toBe(5)
    expect(q1.duty).toBeCloseTo(0.4, 6)
    expect(times(traces, 'q1', 1).slice(0, 2)).toEqual([200, 700])
    expect(times(traces, 'q1', 0).slice(0, 2)).toEqual([400, 900])
    expect(times(traces, 'q1_f', 0).slice(0, 2)).toEqual([450, 950])
    const m = measureDivide(trace(traces, 'div_out'), T)
    expect(m.risingTimes.slice(0, 3)).toEqual([200, 700, 1200])
    expect(m.fallingTimes.slice(0, 2)).toEqual([450, 950])
    expect(m.ratio).toBe(5)
    expect(m.periodic).toBe(true)
    expect(m.duty).toBeCloseTo(0.5, 6)
  })
  it('unused states 101, 110, 111 are unreachable and all return to the loop in one edge', () => {
    const g = buildStateGraph(div5Duty50, {})
    expect(g.mainCycle).toEqual(['000', '001', '010', '011', '100'])
    expect(g.lockup).toEqual([])
    const unused = g.nodes.filter((n) => !n.reachable)
    expect(unused.map((n) => n.state)).toEqual(['101', '110', '111'])
    for (const n of unused) expect(n.stepsToCycle).toBe(1)
    expect(g.nodes.find((n) => n.state === '101')!.next).toBe('010')
    expect(g.nodes.find((n) => n.state === '110')!.next).toBe('010')
    expect(g.nodes.find((n) => n.state === '111')!.next).toBe('100')
    const { records } = simulate(div5Duty50, 3, { period: T, initialState: { q0: 1, q1: 1, q2: 1 } })
    expect(stateSequence(div5Duty50, records)).toEqual(['100', '000', '001'])
    // quiz q6：從 011 三個 edge 之後是 001
    const r2 = simulate(div5Duty50, 3, { period: T, initialState: { q0: 1, q1: 1, q2: 0 } })
    expect(stateSequence(div5Duty50, r2.records)).toEqual(['100', '000', '001'])
  })
  it('real delay mode has no runt pulses (single state bit drives the OR)', () => {
    const { traces } = simulate(div5Duty50, 15, { period: T, delayMode: 'real' })
    expect(detectRuntPulses(traces, 40)).toEqual([])
    expect(measureDivide(trace(traces, 'div_out'), T).ratio).toBe(5)
  })
})

// ---------------------------------------------------------------- div5DecodeGlitch
describe('div5DecodeGlitch: decode-based /5 with tCQ mismatch', () => {
  it('ideal mode: same counter, ratio 5, duty 50%, no runts', () => {
    const { records, traces } = simulate(div5DecodeGlitch, 15, { period: T })
    expect(stateSequence(div5DecodeGlitch, records).slice(0, 5)).toEqual(['001', '010', '011', '100', '000'])
    expect(buildStateGraph(div5DecodeGlitch, {}).lockup).toEqual([])
    const m = measureDivide(trace(traces, 'div_out'), T)
    expect(m.ratio).toBe(5)
    expect(m.duty).toBeCloseTo(0.5, 6)
    expect(detectRuntPulses(traces, 40)).toEqual([])
  })
  it('real mode: at 001 → 010 q1 rises (6 ps) before q0 falls (14 ps) ⇒ 8 ps runt on p and div_out', () => {
    const { traces } = simulate(div5DecodeGlitch, 12, { period: T, delayMode: 'real' })
    const runts = detectRuntPulses(traces, 20)
    const onP = runts.filter((r) => r.signal === 'p')
    const onOut = runts.filter((r) => r.signal === 'div_out')
    expect(onP.length).toBeGreaterThanOrEqual(2)
    expect(onOut.length).toBeGreaterThanOrEqual(2)
    expect(onP[0]).toMatchObject({ t0: 216, t1: 224, width: 8, level: 1 })
    expect(onOut[0]).toMatchObject({ t0: 220, t1: 228, width: 8, level: 1 })
    // 每 5T 出現一次（001 → 010 的 edge）
    expect(onOut[1].t0 - onOut[0].t0).toBeCloseTo(5 * T, 6)
  })
})

// ---------------------------------------------------------------- timing scenarios（課文引用的數字）
describe('timing scenarios quoted in the lessons', () => {
  it('div3Timing: NOR paths set Fmax (slack 9, Tclk,min 31); direct path has the worst hold slack (3 ps)', () => {
    const env = div3Timing.env
    const nor = div3Timing.paths.find((p) => p.id === 'q0-nor-d0')!
    const s = analyzeSetup(nor, env)
    expect(s.arrival).toBe(20)
    expect(s.slack).toBe(9)
    expect(s.tclkMin).toBe(31)
    const direct = div3Timing.paths.find((p) => p.id === 'q0-d1')!
    expect(analyzeSetup(direct, env).slack).toBe(19)
    expect(analyzeHold(direct, env).slack).toBe(3)
    expect(analyzeHold(nor, env).slack).toBe(10)
    expect(worstSetup(div3Timing.paths, env)!.path.id).toBe('q0-nor-d0')
  })
  it('div3Duty50Timing: half-cycle path Tclk,min 42 (d50) / 52.5 (d40); interface path is the tightest at d50', () => {
    const env = div3Duty50Timing.env
    const P = (id: string) => div3Duty50Timing.paths.find((p) => p.id === id)!
    expect(analyzeSetup(P('q0-nor-d0'), env).slack).toBe(29)
    const h50 = analyzeSetup(P('q1-ff2-half-50'), env)
    expect(h50.available).toBe(30)
    expect(h50.slack).toBe(9)
    expect(h50.tclkMin).toBe(42)
    const h40 = analyzeSetup(P('q1-ff2-half-40'), env)
    expect(h40.available).toBe(24)
    expect(h40.slack).toBe(3)
    expect(h40.tclkMin).toBeCloseTo(52.5, 6)
    const e50 = analyzeSetup(P('ff2-or-ext-50'), env)
    expect(e50.slack).toBe(1)
    const e40 = analyzeSetup(P('ff2-or-ext-40'), env)
    expect(e40.available).toBe(36)
    expect(e40.slack).toBe(7)
    expect(worstSetup(div3Duty50Timing.paths, env, 'd50')!.path.id).toBe('ff2-or-ext-50')
    expect(worstSetup(div3Duty50Timing.paths, env, 'd40')!.path.id).toBe('q1-ff2-half-40')
    // quiz q4：T = 50、duty 50% 的半週期路徑 slack = 4
    expect(analyzeSetup(P('q1-ff2-half-50'), { ...env, period: 50 }).slack).toBe(4)
  })
})

// ---------------------------------------------------------------- Lesson 2-1 deep mode：編碼與 logic depth
const hamming = (a: string, b: string) => [...a].filter((c, i) => c !== b[i]).length
/** 主循環上每一步翻了幾個 bit */
const flipsOf = (cycle: string[]) => cycle.map((s, i) => hamming(s, cycle[(i + 1) % cycle.length]))

describe('Lesson 2-1 deep mode: state encoding cannot remove the 2-bit transition', () => {
  it('parity: a 3-state cycle on 2 bits always has exactly one step where both bits flip', () => {
    const c3 = buildStateGraph(div3, {}).mainCycle
    const cAlt = buildStateGraph(div3Alt, {}).mainCycle
    expect(c3).toEqual(['00', '01', '10'])
    expect(cAlt).toEqual(['00', '01', '11'])
    for (const cycle of [c3, cAlt]) {
      const flips = flipsOf(cycle)
      // 單 bit 翻轉會改變 parity；繞一圈回到起點 ⇒ 總翻轉數必為偶數 ⇒ 3 步不可能全是 1
      expect(flips.reduce((a, b) => a + b, 0) % 2).toBe(0)
      expect(flips.filter((f) => f === 2)).toHaveLength(1)
      expect(flips.filter((f) => f === 1)).toHaveLength(2)
    }
    // 換編碼只是把那一步搬家：div3 在 01 → 10，div3Alt 在 11 → 00
    const whereTwo = (cycle: string[]) => {
      const i = flipsOf(cycle).indexOf(2)
      return `${cycle[i]}->${cycle[(i + 1) % cycle.length]}`
    }
    expect(whereTwo(c3)).toBe('01->10')
    expect(whereTwo(cAlt)).toBe('11->00')
  })
  it('div3Alt is one gate level DEEPER than div3: 24 ps vs 20 ps from clock edge to the flop D', () => {
    // div3：edge 100 → q0/q1 在 +8 → NOR 再 +12 ⇒ d0 在 120 穩定（arrival = 20 ps）
    const a = simulate(div3, 4, { period: T, delayMode: 'real' }).traces
    expect(times(a, 'd0', 0)[0]).toBe(120)
    // div3Alt：edge 200 → q1 在 208 → INV 在 214 → AND 在 224 ⇒ arrival = 24 ps（兩級 gate）
    const b = simulate(div3Alt, 4, { period: T, delayMode: 'real' }).traces
    expect(times(b, 'q1', 1)[0]).toBe(208)
    expect(times(b, 'd0', 0)[0]).toBe(214)
    expect(times(b, 'd1', 0)[0]).toBe(224)
    expect(times(b, 'd1', 0)[0] - 200).toBeGreaterThan(times(a, 'd0', 0)[0] - 100)
  })
})

// ---------------------------------------------------------------- Lesson 2-2：OR 為什麼沒有 static hazard
describe('Lesson 2-2: the output OR has no static hazard', () => {
  it('its four input transitions are T/2 apart; two of them ARE the output edges, the other two are masked', () => {
    const { traces } = simulate(div3Duty50, 10, { period: T })
    const q1 = trace(traces, 'q1')
    const q1f = trace(traces, 'q1_f')
    const out = trace(traces, 'div_out')
    // 一個 output 週期內的四個切換點：q1↑ 200、q1_f↑ 250、q1↓ 300、q1_f↓ 350
    const pts = [...q1.events, ...q1f.events]
      .filter((e) => e.t >= 200 && e.t <= 350)
      .map((e) => e.t)
      .sort((x, y) => x - y)
    expect(pts).toEqual([200, 250, 300, 350])
    expect(pts.slice(1).map((t, i) => t - pts[i])).toEqual([50, 50, 50])
    // q1↑(200) 與 q1_f↓(350)：另一個輸入是 0 ⇒ OR 跟著動，這兩點就是 div_out 的 rising / falling edge
    expect(valueAt(q1f, 200)).toBe(0)
    expect(valueAt(q1, 350)).toBe(0)
    // q1_f↑(250) 與 q1↓(300)：另一個輸入是 1 ⇒ 撐住 OR，輸出不動
    expect(valueAt(q1, 250)).toBe(1)
    expect(valueAt(q1f, 300)).toBe(1)
    const m = measureDivide(out, T)
    expect(m.risingTimes.slice(0, 2)).toEqual([200, 500])
    expect(m.fallingTimes.slice(0, 2)).toEqual([350, 650])
    expect(m.duty).toBe(0.5)
    expect(detectRuntPulses([out], 30)).toEqual([])
  })
})

// ---------------------------------------------------------------- Lesson 2-1：rst-recovery path 的 removal slack 是模型假設
describe('div3Timing rst-recovery: the negative removal slack comes from the model assumption', () => {
  it('arrival is only the rst_n wire delay, so removal slack is structurally negative (−3 ps) and must be explained in the notes', () => {
    const p = div3Timing.paths.find((x) => x.id === 'rst-recovery')!
    const h = analyzeHold(p, div3Timing.env)
    expect(h.arrival).toBe(2)
    expect(h.required).toBe(5)
    expect(h.slack).toBe(-3)
    // 這個負值不是電路特性，課文與 note 必須說明它（否則畫面上就是一個沒人解釋的紅字）
    expect(p.notes!.some((n) => n.includes('removal') && n.includes('假設'))).toBe(true)
  })
})
