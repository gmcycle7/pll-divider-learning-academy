import { describe, expect, it } from 'vitest'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, detectRuntPulses, measureDivide, nextStateOf, stateSequence } from '@/models/divider/analysis'
import { dualMod12, dualMod12Glitchy, dualMod23, muxSelect23 } from '@/models/divider/examples'
import { analyzeHold, analyzePulseWidth, analyzeSetup } from '@/models/timing/sta'
import {
  MIN_PULSE,
  T,
  T_AND,
  T_AND_GATE,
  T_CQ,
  T_OR_GATE,
  T_SETUP,
  div12Timeline,
  dm12RisingEn,
  dm23ModOnD0,
  dm23OutQ0,
  dm23OutQ1,
  gatingRun,
  isLegal23,
  modTimingScan,
  runModSwitch,
  runModSwitchCompare,
} from './models'
import { dm12Timing, muxSelect23Timing } from './timing'

const outOf = (traces: { name: string }[], name: string) => (traces as { name: string; events: { t: number; v: 0 | 1 }[] }[]).find((t) => t.name === name)!

// ---------------------------------------------------------------- Lesson 3-1：A vs B
describe('Lesson 3-1: state-continuous (A) vs mux-select (B)', () => {
  it('A: mod=0 → 00→01 loop (/2, 50%), mod=1 → 00→01→10 loop (/3, 1/3 duty)', () => {
    const r0 = simulate(dualMod23, 12, { period: T }, () => ({ mod: 0 }))
    expect(stateSequence(dualMod23, r0.records).slice(0, 4)).toEqual(['01', '00', '01', '00'])
    const m0 = measureDivide(outOf(r0.traces, 'div_out'), T)
    expect(m0.ratio).toBe(2)
    expect(m0.duty).toBe(0.5)
    const r1 = simulate(dualMod23, 12, { period: T }, () => ({ mod: 1 }))
    expect(stateSequence(dualMod23, r1.records).slice(0, 6)).toEqual(['01', '10', '00', '01', '10', '00'])
    const m1 = measureDivide(outOf(r1.traces, 'div_out'), T)
    expect(m1.ratio).toBe(3)
    expect(m1.duty).toBeCloseTo(1 / 3, 6)
  })
  it('A: switching at any edge/offset only ever yields 2T or 3T intervals (ideal and real)', () => {
    for (const mode of ['ideal', 'real'] as const) {
      for (const k of [2, 3, 4, 5, 6, 7, 8, 9]) {
        for (const tau of [5, 20, 35, 60, 95]) {
          for (const dir of ['0to1', '1to0'] as const) {
            // 16 edges：tau = 95 時 input 視窗 (inputLead 0.95) 讓模擬提早結束，12 edges 只塞得下 3 個 /3 edge
            const r = runModSwitch(dualMod23, ['div_out'], { k, tau, dir, mode, edges: 16 })
            expect(r.intervals.length).toBeGreaterThan(2)
            for (const iv of r.intervals) expect(isLegal23(iv)).toBe(true)
            expect(r.runts).toEqual([])
          }
        }
      }
    }
  })
  it('A: mod 0→1 before edge 4 makes the interval starting at 2T a 3T interval (200 → 500 → 800)', () => {
    const r = runModSwitch(dualMod23, ['div_out'], { k: 4, tau: 35, dir: '0to1', mode: 'ideal' })
    expect(r.risingTimes.slice(0, 3)).toEqual([200, 500, 800])
    expect(r.intervals.slice(0, 3)).toEqual([3, 3, 3])
  })
  it('A: mod 0→1 before edge 5 is one interval late: 2T then 3T', () => {
    const r = runModSwitch(dualMod23, ['div_out'], { k: 5, tau: 35, dir: '0to1', mode: 'ideal' })
    expect(r.risingTimes.slice(0, 4)).toEqual([200, 400, 700, 1000])
    expect(r.intervals.slice(0, 3)).toEqual([2, 3, 3])
  })
  it('B: the two dividers free-run; /2 and /3 outputs have their own phases', () => {
    const { records, traces } = simulate(muxSelect23, 9, { period: T }, () => ({ mod: 0 }))
    // state order b1 b0 a0
    expect(stateSequence(muxSelect23, records).slice(0, 6)).toEqual(['011', '100', '001', '010', '101', '000'])
    expect(measureDivide(outOf(traces, 'out2'), T, 0).risingTimes.slice(0, 3)).toEqual([100, 300, 500])
    expect(measureDivide(outOf(traces, 'out3'), T, 0).risingTimes.slice(0, 3)).toEqual([300, 600, 900])
  })
  it('B: switching before edge 6 produces a 1T interval (extra edge); before edge 7 a non-integer interval (phase jump)', () => {
    const k6 = runModSwitch(muxSelect23, ['div_out'], { k: 6, tau: 35, dir: '0to1', mode: 'ideal' })
    expect(k6.intervals).toEqual([2, 2, 1, 3, 3])
    const k7 = runModSwitch(muxSelect23, ['div_out'], { k: 7, tau: 35, dir: '0to1', mode: 'ideal' })
    expect(k7.risingTimes.slice(0, 5)).toEqual([100, 300, 500, 665, 900])
    expect(k7.intervals.slice(0, 4)).toEqual([2, 2, 1.65, 2.35])
    expect(k7.intervals.some((iv) => !isLegal23(iv))).toBe(true)
  })
  it('B: in real-delay mode the /2 and /3 outputs have different latency (16 vs 28 ps) so even a "clean" switch has a phase step', () => {
    const r = runModSwitch(muxSelect23, ['div_out'], { k: 4, tau: 35, dir: '0to1', mode: 'real' })
    expect(r.risingTimes.slice(0, 3)).toEqual([116, 316, 628])
    expect(r.intervals.slice(0, 2)).toEqual([2, 3.12])
  })
  it('B: 1→0 at the very start: the reset-time MUX edge (t = 65) is not counted; the first interval is a 1.35T phase jump', () => {
    const r = runModSwitch(muxSelect23, ['div_out'], { k: 2, tau: 35, dir: '1to0', mode: 'ideal' })
    expect(r.risingTimes.slice(0, 4)).toEqual([165, 300, 500, 700])
    expect(r.intervals.slice(0, 3)).toEqual([1.35, 2, 2])
    // 原始 trace 確實有 t = 65 的 rising edge（mod 選到 reset state 時已經是 1 的 out3）
    const raw = simulate(muxSelect23, 12, { period: T, inputLead: 0.35 }, (e) => ({ mod: e >= 2 ? 0 : 1 }))
    expect(measureDivide(outOf(raw.traces, 'div_out'), T, 0).risingTimes[0]).toBe(65)
  })
  it('exercise (Lesson 3-1): switch before edge 8 truncates the /2 pulse (falls at 765 instead of 800) yet the interval list looks legal', () => {
    const k8 = runModSwitch(muxSelect23, ['div_out'], { k: 8, tau: 35, dir: '0to1', mode: 'ideal', edges: 14 })
    expect(k8.risingTimes).toEqual([100, 300, 500, 700, 900, 1200])
    expect(k8.intervals).toEqual([2, 2, 2, 2, 3])
    const raw = simulate(muxSelect23, 14, { period: T, inputLead: 0.35 }, (e) => ({ mod: e >= 8 ? 1 : 0 }))
    const ev = outOf(raw.traces, 'div_out').events
    expect(ev.find((e) => e.t > 700 && e.t < 800)).toEqual({ t: 765, v: 0 })
    // 同一個切換在 real delay：/2 pulse 716 → 773（57 ps），下一個 edge 928 ⇒ 2.12T
    const k8r = runModSwitch(muxSelect23, ['div_out'], { k: 8, tau: 35, dir: '0to1', mode: 'real', edges: 14 })
    expect(k8r.risingTimes).toEqual([116, 316, 516, 716, 928, 1228])
    expect(k8r.intervals).toEqual([2, 2, 2, 2.12, 3])
    // A 在同樣的切換下：state 01 的 cycle 是 7T → 8T，mod = 1 在 7.65T 到達 ⇒ 從 6T 的 edge 起算的 interval 變 3T
    const a8 = runModSwitch(dualMod23, ['div_out'], { k: 8, tau: 35, dir: '0to1', mode: 'ideal', edges: 14 })
    expect(a8.risingTimes).toEqual([200, 400, 600, 900, 1200])
    expect(a8.intervals).toEqual([2, 2, 3, 3])
  })
  it('B: some switch offsets create runt pulses narrower than MIN_PULSE; A never does', () => {
    const rb = runModSwitch(muxSelect23, ['div_out'], { k: 6, tau: 5, dir: '0to1', mode: 'real' })
    expect(rb.runts.length).toBeGreaterThan(0)
    expect(rb.runts[0].width).toBeLessThan(MIN_PULSE)
    const ra = runModSwitch(dualMod23, ['div_out'], { k: 6, tau: 5, dir: '0to1', mode: 'real' })
    expect(ra.runts).toEqual([])
    const cmp = runModSwitchCompare({ k: 6, tau: 5, dir: '0to1', mode: 'real' })
    expect(cmp.tSwitch).toBe(595)
    expect(cmp.a.traces.map((t) => t.name)).toEqual(['clk', 'mod', 'q1', 'q0', 'div_out'])
    expect(cmp.b.traces.map((t) => t.name)).toEqual(['clk', 'mod', 'out2', 'out3', 'div_out'])
  })
})

// ---------------------------------------------------------------- Lesson 3-2：cell 分析 + MOD timing
describe('Lesson 3-2: /2 /3 cell state analysis', () => {
  it('truth table (8 rows) matches d0 = NOR(q1,q0), d1 = q0·mod', () => {
    const expected: Record<string, string> = {
      'mod0-00': '01',
      'mod0-01': '00',
      'mod0-10': '00',
      'mod0-11': '00',
      'mod1-00': '01',
      'mod1-01': '10',
      'mod1-10': '00',
      'mod1-11': '10',
    }
    for (const mod of [0, 1] as const) {
      for (const s of ['00', '01', '10', '11']) {
        expect(nextStateOf(dualMod23, s, { mod }).next).toBe(expected[`mod${mod}-${s}`])
      }
    }
  })
  it('state graphs: 11 is unreachable but recovers in both modes (no lock-up)', () => {
    const g0 = buildStateGraph(dualMod23, { mod: 0 })
    expect(g0.mainCycle).toEqual(['00', '01'])
    expect(g0.lockup).toEqual([])
    expect(g0.nodes.find((n) => n.state === '10')!.reachable).toBe(false)
    expect(g0.nodes.find((n) => n.state === '11')!.stepsToCycle).toBe(1)
    const g1 = buildStateGraph(dualMod23, { mod: 1 })
    expect(g1.mainCycle).toEqual(['00', '01', '10'])
    expect(g1.lockup).toEqual([])
    expect(g1.nodes.find((n) => n.state === '11')!.next).toBe('10')
  })
  it('quiz: mod becomes 1 before edge 2 → state after edge 4 is 01', () => {
    const { records } = simulate(dualMod23, 6, { period: T }, (e) => ({ mod: e >= 2 ? 1 : 0 }))
    expect(stateSequence(dualMod23, records)).toEqual(['01', '10', '00', '01', '10', '00'])
  })
  it('quiz: mod = 1 for edges 1–3 then 0 → 01 10 00 01 00 01; mod 0→1 before edge 5 → 3T starts from the edge at 4T', () => {
    const a = simulate(dualMod23, 6, { period: T }, (e) => ({ mod: e < 4 ? 1 : 0 }))
    expect(stateSequence(dualMod23, a.records)).toEqual(['01', '10', '00', '01', '00', '01'])
    expect(measureDivide(outOf(a.traces, 'div_out'), T, 0).risingTimes).toEqual([300, 500])
    const b = simulate(dualMod23, 9, { period: T }, (e) => ({ mod: e >= 5 ? 1 : 0 }))
    expect(stateSequence(dualMod23, b.records)).toEqual(['01', '00', '01', '00', '01', '10', '00', '01', '10'])
    expect(measureDivide(outOf(b.traces, 'div_out'), T, 0).risingTimes).toEqual([200, 400, 700])
    // unused state 11 在兩種 mode 都會回到主循環
    expect(nextStateOf(dualMod23, '11', { mod: 1 }).next).toBe('10')
    expect(nextStateOf(dualMod23, '11', { mod: 0 }).next).toBe('00')
    // real delay：output edge = clock edge + tCQ + tNOR = 20 ps
    const r = simulate(dualMod23, 9, { period: T, delayMode: 'real' }, (e) => ({ mod: e >= 4 ? 1 : 0 }))
    expect(measureDivide(outOf(r.traces, 'div_out'), T, 0).risingTimes).toEqual([220, 520, 820])
  })
  it('mod timing scan: early switch → /3 this cycle; late switch → /2 this cycle then /3', () => {
    const early = modTimingScan(-40)
    expect(early.kind).toBe('early')
    expect(early.tSwitch).toBe(360)
    expect(early.tD1).toBe(370)
    expect(early.tDeadline).toBe(383)
    expect(early.tHoldEdge).toBe(396)
    expect(early.risingTimes.slice(0, 3)).toEqual([220, 520, 820])
    expect(early.intervals.slice(0, 2)).toEqual([3, 3])
    const late = modTimingScan(10)
    expect(late.kind).toBe('late')
    expect(late.risingTimes.slice(0, 3)).toEqual([220, 420, 720])
    expect(late.intervals.slice(0, 2)).toEqual([2, 3])
    // engine trace of mod actually switches at the requested time
    expect(outOf(late.traces, 'mod').events.find((e) => e.v === 1)!.t).toBe(410)
    expect(outOf(early.traces, 'mod').events.find((e) => e.v === 1)!.t).toBe(360)
  })
  it('mod timing scan: switching inside (deadline, hold edge) is flagged as a violation', () => {
    expect(modTimingScan(-17).kind).toBe('early')
    expect(modTimingScan(-16).kind).toBe('violation')
    expect(modTimingScan(-10).kind).toBe('violation')
    expect(modTimingScan(-5).kind).toBe('violation')
    expect(modTimingScan(-4).kind).toBe('late')
    expect(modTimingScan(0).kind).toBe('late')
  })
})

describe('Lesson 3-2 exercise variants', () => {
  it('div_out = q1: /3 works (duty 1/3) but /2 mode has no output edges at all', () => {
    const r1 = simulate(dm23OutQ1, 12, { period: T }, () => ({ mod: 1 }))
    const m1 = measureDivide(outOf(r1.traces, 'div_out'), T)
    expect(m1.ratio).toBe(3)
    expect(m1.duty).toBeCloseTo(1 / 3, 6)
    const r0 = simulate(dm23OutQ1, 12, { period: T }, () => ({ mod: 0 }))
    expect(stateSequence(dm23OutQ1, r0.records).slice(0, 4)).toEqual(['01', '00', '01', '00'])
    const m0 = measureDivide(outOf(r0.traces, 'div_out'), T)
    expect(m0.risingTimes).toEqual([])
    expect(m0.ratio).toBeNull()
    expect(buildStateGraph(dm23OutQ1, { mod: 0 }).mainCycle).toEqual(['00', '01'])
  })
  it('div_out = q0: both modes work, phase-continuous, duty 50% / 33%', () => {
    const r0 = simulate(dm23OutQ0, 12, { period: T }, () => ({ mod: 0 }))
    expect(measureDivide(outOf(r0.traces, 'div_out'), T).ratio).toBe(2)
    expect(measureDivide(outOf(r0.traces, 'div_out'), T).duty).toBe(0.5)
    const r1 = simulate(dm23OutQ0, 12, { period: T }, () => ({ mod: 1 }))
    expect(measureDivide(outOf(r1.traces, 'div_out'), T).ratio).toBe(3)
    expect(measureDivide(outOf(r1.traces, 'div_out'), T).duty).toBeCloseTo(1 / 3, 6)
    const sw = simulate(dm23OutQ0, 16, { period: T }, (e) => ({ mod: e >= 4 && e < 10 ? 1 : 0 }))
    const m = measureDivide(outOf(sw.traces, 'div_out'), T, 0)
    expect(m.intervals).toEqual([2, 3, 3, 2, 2, 2])
    expect(buildStateGraph(dm23OutQ0, { mod: 1 }).lockup).toEqual([])
  })
  it('mod on d0: /3 when mod=1; mod=0 loops 01↔10 with 00 transient and 11 as a lock-up state', () => {
    const r1 = simulate(dm23ModOnD0, 12, { period: T }, () => ({ mod: 1 }))
    expect(stateSequence(dm23ModOnD0, r1.records).slice(0, 6)).toEqual(['01', '10', '00', '01', '10', '00'])
    expect(measureDivide(outOf(r1.traces, 'div_out'), T).ratio).toBe(3)
    const r0 = simulate(dm23ModOnD0, 12, { period: T }, () => ({ mod: 0 }))
    expect(stateSequence(dm23ModOnD0, r0.records).slice(0, 5)).toEqual(['01', '10', '01', '10', '01'])
    const m0 = measureDivide(outOf(r0.traces, 'div_out'), T)
    expect(m0.ratio).toBe(2)
    expect(m0.duty).toBe(0.5)
    const g0 = buildStateGraph(dm23ModOnD0, { mod: 0 })
    expect(g0.mainCycle).toEqual(['01', '10'])
    expect(g0.transient).toEqual(['00'])
    expect(g0.lockup).toEqual(['11'])
    const g1 = buildStateGraph(dm23ModOnD0, { mod: 1 })
    expect(g1.mainCycle).toEqual(['00', '01', '10'])
    expect(g1.lockup).toEqual([])
    const locked = simulate(dm23ModOnD0, 4, { period: T, initialState: { q0: 1, q1: 1 } }, () => ({ mod: 0 }))
    expect(stateSequence(dm23ModOnD0, locked.records)).toEqual(['11', '11', '11', '11'])
    // switching still gives only 2T / 3T on the q0 output
    const sw = simulate(dm23ModOnD0, 16, { period: T }, (e) => ({ mod: e >= 4 && e < 10 ? 1 : 0 }))
    for (const iv of measureDivide(outOf(sw.traces, 'div_out'), T, 0).intervals) expect(isLegal23(iv)).toBe(true)
  })
})

// ---------------------------------------------------------------- Lesson 3-3：/1 /2
describe('Lesson 3-3: /1 /2 edge scheduling and clock gating', () => {
  it('dualMod12: sel=0 passes every pulse (/1); sel=1 passes every other pulse (/2, duty 25%)', () => {
    const r0 = simulate(dualMod12, 8, { period: T }, () => ({ sel: 0 }))
    const m0 = measureDivide(outOf(r0.traces, 'div_out'), T)
    expect(m0.ratio).toBe(1)
    expect(m0.duty).toBe(0.5)
    const r1 = simulate(dualMod12, 12, { period: T }, () => ({ sel: 1 }))
    const m1 = measureDivide(outOf(r1.traces, 'div_out'), T)
    expect(m1.ratio).toBe(2)
    expect(m1.duty).toBe(0.25)
    expect(buildStateGraph(dualMod12, { sel: 1 }).mainCycle).toEqual(['10', '01'])
    expect(buildStateGraph(dualMod12, { sel: 0 }).mainCycle).toEqual(['10', '11'])
  })
  it('edge timeline: sel 0→1 before edge 4 → edge 5 is the first skipped edge; before edge 5 → edge 7', () => {
    const t4 = div12Timeline(dualMod12, { k: 4, dir: '0to1' })
    expect(t4.edges.map((e) => e.passed)).toEqual([true, true, true, true, false, true, false, true, false, true])
    expect(t4.firstChanged).toBe(5)
    expect(t4.intervals).toEqual([1, 1, 1, 2, 2, 2])
    const t5 = div12Timeline(dualMod12, { k: 5, dir: '0to1' })
    expect(t5.firstChanged).toBe(7)
    // 1→0 before edge 5：edge 5 仍被 skip（en 在 4.5T 就已抓到 0），edge 6 放行（/2 本來就會放行），
    // edge 7 才是第一個「/2 會 skip、/1 卻放行」的 edge ⇒ firstChanged = 7
    const back = div12Timeline(dualMod12, { k: 5, dir: '1to0' })
    expect(back.edges.map((e) => e.passed)).toEqual([true, true, false, true, false, true, true, true, true, true])
    expect(back.firstChanged).toBe(7)
  })
  it('edge timeline rule: the first edge whose fate changes is the first ODD edge after k (both directions)', () => {
    // sel 在 (k − 0.35)T 改變，晚於 falling edge (k − 0.5)T，所以第一個看到新 sel 的 falling edge 是 (k + 0.5)T，
    // 它抓到的是 edge k 之後的 q0 = k mod 2 ⇒ k 偶數：edge k+1 先變；k 奇數：edge k+2 才變。
    const firstOddAfter = (k: number) => (k % 2 === 0 ? k + 1 : k + 2)
    for (const k of [2, 3, 4, 5, 6, 7, 8]) {
      expect(div12Timeline(dualMod12, { k, dir: '0to1' }).firstChanged).toBe(firstOddAfter(k))
      expect(div12Timeline(dualMod12, { k, dir: '1to0' }).firstChanged).toBe(firstOddAfter(k))
    }
    // sel 0→1 before edge 4：rising edge 100,200,300,400 然後 600,800,1000
    const t4 = div12Timeline(dualMod12, { k: 4, dir: '0to1' })
    const { records, traces } = simulate(dualMod12, 10, { period: T }, (e) => ({ sel: e >= 4 ? 1 : 0 }))
    expect(stateSequence(dualMod12, records)).toEqual(['11', '10', '11', '00', '11', '00', '11', '00', '11', '00'])
    expect(measureDivide(outOf(traces, 'div_out'), T, 0).risingTimes).toEqual([100, 200, 300, 400, 600, 800, 1000])
    expect(t4.intervals).toEqual([1, 1, 1, 2, 2, 2])
  })
  it('resynchronized gating has no runts; combinational gating produces 18 ps runts every other cycle', () => {
    const good = gatingRun(dualMod12, { k: 1, mode: 'real' })
    expect(good.runts).toEqual([])
    expect(good.risingTimes.slice(0, 4)).toEqual([106, 206, 406, 606])
    const bad = gatingRun(dualMod12Glitchy, { k: 1, mode: 'real' })
    expect(bad.runts.length).toBeGreaterThanOrEqual(3)
    expect(bad.runts[0]).toMatchObject({ t0: 206, t1: 224, width: 18 })
    // runt 寬度 = tCQ + tOR（en 在 edge + 18 ps 落下，AND 前後各加 6 ps 相消）
    for (const x of bad.runts) expect(x.width).toBe(8 + 10)
    // 另一半的 pulse 也不對：en 在 edge + 18 才升起，pulse 從 124 到 156 只有 32 ps（本應 50 ps）
    expect(bad.risingTimes.slice(0, 4)).toEqual([124, 206, 324, 406])
    expect(bad.intervals.slice(0, 2)).toEqual([0.82, 1.18])
    // en of the good version only changes while clk = 0 (falling edge + tCQ)
    const en = outOf(good.traces, 'en')
    for (const e of en.events.filter((x) => x.t > 0)) expect((e.t - 8) % T).toBe(50)
    // ideal mode hides the glitch (zero-width)
    const badIdeal = gatingRun(dualMod12Glitchy, { k: 1, mode: 'ideal' })
    expect(badIdeal.runts).toEqual([])
  })
  it('exercise: rising-edge FF_EN makes en change during clk=1 → 8 ps runts, measured ratio collapses toward 1', () => {
    const r = gatingRun(dm12RisingEn, { k: 1, mode: 'real' })
    expect(r.runts.length).toBe(4)
    for (const x of r.runts) expect(x.width).toBe(8)
    expect(r.runts[0]).toMatchObject({ t0: 106, t1: 114 })
    expect(r.intervals.every((iv) => Math.abs(iv - 2) > 0.5)).toBe(true)
    const en = outOf(r.traces, 'en')
    expect(en.events.find((e) => e.t > 0)!.t).toBe(108)
    const { records } = simulate(dm12RisingEn, 6, { period: T }, () => ({ sel: 1 }))
    expect(stateSequence(dm12RisingEn, records).slice(0, 4)).toEqual(['01', '10', '01', '10'])
    expect(buildStateGraph(dm12RisingEn, { sel: 1 }).lockup).toEqual([])
    const ideal = simulate(dm12RisingEn, 6, { period: T }, () => ({ sel: 1 }))
    expect(detectRuntPulses(ideal.traces.filter((t) => t.name === 'div_out'), MIN_PULSE)).toEqual([])
    // real：每個 rising edge 都有輸出（106, 214, 306, 414 …），量到的 ratio 接近 1 而不是 2
    expect(r.risingTimes.slice(0, 4)).toEqual([106, 214, 306, 414])
    expect(r.intervals.slice(0, 2)).toEqual([1.08, 0.92])
    // ideal mode 的「glitch」寬度是 0：rising 與 falling 同一時刻，量測看起來像 /1
    const mi = measureDivide(outOf(ideal.traces, 'div_out'), T, 0)
    expect(mi.risingTimes.slice(0, 3)).toEqual([100, 200, 300])
    expect(mi.fallingTimes[0]).toBe(100)
  })
})

// ---------------------------------------------------------------- Lesson 3-1：課文引用的 ideal / real 數字
describe('Lesson 3-1 numbers quoted in the lesson text (the widget defaults to REAL delay)', () => {
  const B = (k: number, tau: number, mode: 'ideal' | 'real', dir: '0to1' | '1to0' = '0to1') => runModSwitchCompare({ k, tau, dir, mode }).b
  it('k = 6 extra edge: 1T in ideal delay, 1.12T in real delay', () => {
    expect(B(6, 35, 'ideal').intervals).toEqual([2, 2, 1, 3, 3])
    expect(B(6, 35, 'real').intervals).toEqual([2, 2, 1.12, 3, 3])
  })
  it('k = 7 phase jump: 1.65T / 2.35T in ideal delay, 1.57T / 2.55T in real delay', () => {
    expect(B(7, 35, 'ideal').intervals).toEqual([2, 2, 1.65, 2.35, 3])
    expect(B(7, 35, 'real').intervals).toEqual([2, 2, 1.57, 2.55, 3])
  })
  it('k = 6, tau = 5 runt: 5 ps in ideal delay, 25 ps in real delay', () => {
    expect(B(6, 5, 'ideal').runts.map((r) => r.width)).toEqual([5])
    expect(B(6, 5, 'real').runts.map((r) => r.width)).toEqual([25])
  })
  it('direction /3 → /2 at k = 2: the phantom edge is at 1.65T (ideal) / 1.73T (real)', () => {
    expect(B(2, 35, 'ideal', '1to0').risingTimes[0]).toBe(165)
    expect(B(2, 35, 'ideal', '1to0').intervals[0]).toBe(1.35)
    expect(B(2, 35, 'real', '1to0').risingTimes[0]).toBe(173)
    expect(B(2, 35, 'real', '1to0').intervals[0]).toBe(1.43)
  })
  it('A: the simulator boundary for "this edge catches mod" is tau >= tAND (10 ps), NOT tsetup + tAND (17 ps)', () => {
    const ivA = (tau: number) => runModSwitchCompare({ k: 6, tau, dir: '0to1', mode: 'real' }).a.intervals
    // tau < tAND：d1 在 edge 之後才到，這個 edge 抓不到 ⇒ 切換延到下一次進入 state 01
    for (const tau of [2, 5, 9]) expect(ivA(tau)).toEqual([2, 2, 3, 3])
    // tAND ≤ tau：engine（只算 gate delay）這個 edge 就抓到了——包含 10…16 ps 這段「真實電路會落在 setup window」的區間
    for (const tau of [T_AND, 11, 16, T_SETUP + T_AND, 20, 35]) expect(ivA(tau)).toEqual([2, 3, 3])
    expect(T_AND).toBe(10)
    expect(T_SETUP + T_AND).toBe(17)
  })
})

// ---------------------------------------------------------------- Lesson 3-2 練習：變體 2 的 edge 清單
describe('Lesson 3-2 exercise variant 2: the rising-edge list must match the interval list', () => {
  it('div_out = q0 has SEVEN rising edges (1T…15T) for six intervals; the NOR version measures 3,3,2,2,2,2', () => {
    const q0 = simulate(dm23OutQ0, 16, { period: T }, (e) => ({ mod: e >= 4 && e < 10 ? 1 : 0 }))
    const mq0 = measureDivide(outOf(q0.traces, 'div_out'), T, 0)
    expect(mq0.risingTimes).toEqual([100, 300, 600, 900, 1100, 1300, 1500])
    expect(mq0.intervals).toEqual([2, 3, 3, 2, 2, 2])
    expect(mq0.risingTimes).toHaveLength(mq0.intervals.length + 1)
    const orig = simulate(dualMod23, 16, { period: T }, (e) => ({ mod: e >= 4 && e < 10 ? 1 : 0 }))
    const morig = measureDivide(outOf(orig.traces, 'div_out'), T, 0)
    // 原版在 reset（state 00）當下就是 high，t = 0 的 high 不算 rising edge ⇒ 開頭那段 2T 不在 chip 列裡
    expect(outOf(orig.traces, 'div_out').events[0]).toEqual({ t: 0, v: 1 })
    expect(morig.risingTimes).toEqual([200, 500, 800, 1000, 1200, 1400, 1600])
    expect(morig.intervals).toEqual([3, 3, 2, 2, 2, 2])
    // 把 t = 0 補回去之後，兩者是同一串，而且變體 2 的每個 edge 整體晚一個 Tin
    const origWithReset = [0, ...morig.risingTimes.slice(0, 6)]
    expect(mq0.risingTimes.map((t, i) => t - origWithReset[i])).toEqual([T, T, T, T, T, T, T])
  })
})

// ---------------------------------------------------------------- Lesson 3-3：gating cell 的 gate delay 與 runt 寬度
describe('Lesson 3-3: the /1 /2 gating cell uses its OWN gate delays (AND 6 ps, OR 10 ps)', () => {
  it('T_AND_GATE (6) is NOT the /2 /3 cell AND (T_AND = 10)', () => {
    expect(T_AND_GATE).toBe(6)
    expect(T_OR_GATE).toBe(10)
    expect(T_AND).toBe(10)
  })
  it('combinational gating: div_out rises at clk↑ + tAND(6) and falls at clk↑ + tCQ + tOR + tAND(24) ⇒ runt = tCQ + tOR = 18 ps', () => {
    const bad = gatingRun(dualMod12Glitchy, { k: 1, mode: 'real' })
    for (const r of bad.runts) {
      expect(r.t0 % T).toBe(T_AND_GATE)
      expect(r.t1 % T).toBe(T_CQ + T_OR_GATE + T_AND_GATE)
      expect(r.width).toBe(T_CQ + T_OR_GATE)
    }
    expect(bad.runts[0]).toMatchObject({ t0: 200 + T_AND_GATE, t1: 200 + T_CQ + T_OR_GATE + T_AND_GATE, width: 18 })
  })
  it('rising-edge FF_EN: the runt width is tCQ = 8 ps — tAND appears on BOTH edges and cancels out', () => {
    const r = gatingRun(dm12RisingEn, { k: 1, mode: 'real' })
    expect(r.runts).toHaveLength(4)
    for (const x of r.runts) {
      expect(x.t0 % T).toBe(T_AND_GATE) // rise：clk↑ + tAND
      expect(x.t1 % T).toBe(T_CQ + T_AND_GATE) // fall：clk↑ + tCQ + tAND
      expect(x.width).toBe(T_CQ)
      expect(x.width).not.toBe(T_CQ + T_AND_GATE) // 14 ps 是「落下時刻」，不是寬度
    }
  })
})

// ---------------------------------------------------------------- Lesson 3-1 / 3-3：沒有 capture flop 的 path
describe('paths without a capture flop must not be read as setup checks', () => {
  it('dm12 en-and-out is a pulse-width path: arrival = tCQ + tAND = 14, margin 36 ps ⇒ the real output pulse is a full 0.5T = 50 ps', () => {
    const p = dm12Timing.paths.find((x) => x.id === 'en-and-out')!
    expect(p.type).toBe('pulse-width')
    expect(p.capture.setup).toBeUndefined()
    expect(p.capture.hold).toBeUndefined()
    expect(p.capture.minPulse).toBe(MIN_PULSE)
    const s = analyzeSetup(p, dm12Timing.env)
    expect(s.arrival).toBe(T_CQ + T_AND_GATE) // 14
    expect(s.available).toBe(50) // 0.5T
    const margin = s.available - s.arrival // 36：en 的反應比下一個 clk↑ 早多久
    expect(margin).toBe(36)
    expect(s.slack).toBe(margin - dm12Timing.env.jitter - dm12Timing.env.margin) // 表上的 32 ps 就是這個
    // margin > 0 ⇒ 放出來的是完整的 0.5T pulse（不是 36 ps）；用 engine 量一次
    const good = simulate(dualMod12, 8, { period: T, delayMode: 'real' }, () => ({ sel: 1 }))
    const ev = outOf(good.traces, 'div_out').events
    expect(ev[1]).toEqual({ t: 100 + T_AND_GATE, v: 1 })
    expect(ev[2]).toEqual({ t: 150 + T_AND_GATE, v: 0 })
    const pw = analyzePulseWidth(ev[2].t - ev[1].t, p.capture.minPulse!)
    expect(pw.width).toBe(50)
    expect(pw.required).toBe(MIN_PULSE)
    expect(pw.slack).toBe(20)
    expect(detectRuntPulses([outOf(good.traces, 'div_out')], MIN_PULSE)).toEqual([])
    // explorer 借用 setup 版面時會印出的那幾個沒有意義的數字——note 必須先警告讀者
    expect(s.tclkMin).toBe(36)
    expect(analyzeHold(p, dm12Timing.env).slack).toBe(9)
    expect(p.notes![0]).toContain('沒有 capture flop')
    const risingEnNote = p.notes!.find((n) => n.includes('rising-edge FF'))!
    expect(risingEnNote).toContain(`runt 寬度是 ${gatingRun(dm12RisingEn, { k: 1, mode: 'real' }).runts[0].width} ps`)
  })
  it('mux23 mod-mux is an output path: latency 20 ps only, and its note says so', () => {
    const p = muxSelect23Timing.paths.find((x) => x.id === 'mod-mux')!
    expect(p.type).toBe('output')
    expect(p.capture.setup).toBeUndefined()
    expect(analyzeSetup(p, muxSelect23Timing.env).arrival).toBe(20)
    expect(p.notes![0]).toContain('沒有 capture flop')
    // /2 與 /3 兩條輸出 latency 差 12 ps，這才是課文要讀者看的數字
    expect(analyzeSetup(muxSelect23Timing.paths.find((x) => x.id === 'out2-lat')!, muxSelect23Timing.env).arrival).toBe(16)
    expect(analyzeSetup(muxSelect23Timing.paths.find((x) => x.id === 'out3-lat')!, muxSelect23Timing.env).arrival).toBe(28)
  })
})
