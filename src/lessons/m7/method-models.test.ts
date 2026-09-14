import { describe, expect, it } from 'vitest'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, measureDivide, nextStateOf, stateSequence, findPeriod } from '@/models/divider/analysis'
import { analyzeHold, analyzeSetup, worstHold, worstSetup } from '@/models/timing/sta'
import { modeAndCounter, progDiv34, progDiv34Sel1 } from './method-models'
import { CORNERS, CORNER_PATHS, cornerCritical, cornerDelay, gateCountTrapTiming, modeAndTiming, progDiv34ExerciseTiming, progDiv34Timing } from './method-timing'
import { basicsExerciseTiming, basicsTiming } from './basics-timing'
import { buildHoldPathModel, buildSetupPathModel } from './BasicsWidgets'

const T = 100

describe('progDiv34 (Lesson 7-2 練習電路)', () => {
  it('sel = 0：state 000 → 101 → 011 → 000，/3，duty 1/3', () => {
    const { records, traces } = simulate(progDiv34, 12, { period: T }, () => ({ sel: 0 }))
    expect(stateSequence(progDiv34, records).slice(0, 6)).toEqual(['101', '011', '000', '101', '011', '000'])
    const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T)
    expect(m.ratio).toBe(3)
    expect(m.duty).toBeCloseTo(1 / 3, 6)
    expect(m.periodic).toBe(true)
    expect(findPeriod(stateSequence(progDiv34, records))!.period).toBe(3)
  })
  it('sel = 1：state 000 → 101 → 011 → 010 → 000，/4，duty 1/4', () => {
    const { records, traces } = simulate(progDiv34, 16, { period: T }, () => ({ sel: 1 }))
    expect(stateSequence(progDiv34, records).slice(0, 8)).toEqual(['101', '011', '010', '000', '101', '011', '010', '000'])
    const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T)
    expect(m.ratio).toBe(4)
    expect(m.duty).toBeCloseTo(0.25, 6)
    expect(findPeriod(stateSequence(progDiv34, records))!.period).toBe(4)
  })
  it('state graph：兩種 mode 都沒有 lock-up；sel=0 時 q1q0=10 一步回主循環', () => {
    const g0 = buildStateGraph(progDiv34, { sel: 0 })
    expect(g0.mainCycle).toEqual(['000', '101', '011'])
    expect(g0.lockup).toEqual([])
    // q1q0 = 10（q2 任意）→ d0 = 0, d1 = 0 → q1q0 = 00
    for (const s of ['010', '110']) expect(nextStateOf(progDiv34, s, { sel: 0 }).next.slice(1)).toBe('00')
    const g1 = buildStateGraph(progDiv34, { sel: 1 })
    expect(g1.mainCycle).toEqual(['000', '101', '011', '010'])
    expect(g1.lockup).toEqual([])
  })
  it('next-state equations：d0 = NOT q1；sel=1 → d1 = q0；sel=0 → d1 = q0 AND NOT q1', () => {
    for (const s of ['000', '001', '010', '011', '100', '101', '110', '111']) {
      const q1 = Number(s[1])
      const q0 = Number(s[2])
      const r0 = nextStateOf(progDiv34, s, { sel: 0 })
      const r1 = nextStateOf(progDiv34, s, { sel: 1 })
      expect(r0.d.d0).toBe(q1 ? 0 : 1)
      expect(r1.d.d0).toBe(q1 ? 0 : 1)
      expect(r1.d.d1).toBe(q0)
      expect(r0.d.d1).toBe(q0 && !q1 ? 1 : 0)
      expect(r0.d.d2).toBe(q1 || q0 ? 0 : 1)
    }
  })
  it('real delay：sel=0 時 d1 在 edge 後 33 ps（q0 → AND → MUX）與 40 ps（q1 → INV → AND → MUX）改變', () => {
    const { traces } = simulate(progDiv34, 3, { period: T, delayMode: 'real' }, () => ({ sel: 0 }))
    const d1 = traces.find((t) => t.name === 'd1')!
    // edge 1（t = T）：q0 0→1 在 T+8，a 在 T+19，d1 在 T+33
    const first = d1.events.find((e) => e.t > 0)!
    expect(first.t).toBeCloseTo(T + 8 + 11 + 14, 6)
    expect(first.v).toBe(1)
    // edge 2（t = 2T）：q1 0→1 在 2T+8 → d0 在 2T+15 → a 在 2T+26 → d1 在 2T+40
    const second = d1.events.find((e) => e.t > T + 50)!
    expect(second.t).toBeCloseTo(2 * T + 8 + 7 + 11 + 14, 6)
    expect(second.v).toBe(0)
  })
  it('real delay：sel=1 時 d1 只經過 MUX，在 edge 3 後 22 ps 改變（q0 → MUX in1 → d1）', () => {
    const { records, traces } = simulate(progDiv34, 4, { period: T, delayMode: 'real' }, () => ({ sel: 1 }))
    // edge 3（t = 3T）：011 → 010，q0 1→0 在 3T+8，d1 1→0 在 3T+22；a 與 d0 都不變，所以沒有其他 input 干擾 MUX
    const r3 = records[2]
    expect(r3.t).toBe(3 * T)
    const q0Ev = r3.events.find((e) => e.signal === 'q0')!
    const d1Ev = r3.events.find((e) => e.signal === 'd1')!
    expect(q0Ev.t).toBeCloseTo(3 * T + 8, 6)
    expect(d1Ev.t).toBeCloseTo(3 * T + 8 + 14, 6)
    expect(d1Ev.to).toBe(0)
    expect(r3.events.some((e) => e.signal === 'a')).toBe(false)
    // edge 1（t = T）：engine 的 inertial-delay 模型會因為 a（MUX 的 in0，sel=1 時未被選）在 T+19 改變而把 d1 重新排程到 T+33。
    // 這是模擬器 artifact（真實 MUX 在 sel=1 時 in0 被 gate 掉），課文用它解釋「模擬事件 ≠ STA sensitization」。
    const d1 = traces.find((t) => t.name === 'd1')!
    const first = d1.events.find((e) => e.t > 0)!
    expect(first.t).toBeGreaterThanOrEqual(T + 8 + 14)
    expect(first.t).toBeCloseTo(T + 8 + 11 + 14, 6)
  })
  it('real delay：課文 Step 6 引用的事件時間（sel=0 edge 1/2/3）', () => {
    const { records } = simulate(progDiv34, 3, { period: T, delayMode: 'real' }, () => ({ sel: 0 }))
    const at = (k: number, sig: string) => records[k - 1].events.filter((e) => e.signal === sig && e.t >= records[k - 1].t).map((e) => e.t - records[k - 1].t)
    expect(at(1, 'q0')).toEqual([8])
    expect(at(1, 'a')).toEqual([19])
    expect(at(1, 'd2')).toEqual([20])
    expect(at(1, 'd1')).toEqual([33])
    expect(at(2, 'q1')).toEqual([8])
    expect(at(2, 'd0')).toEqual([15])
    expect(at(2, 'a')).toEqual([26])
    expect(at(2, 'd1')).toEqual([40])
    expect(at(3, 'd0')).toEqual([15])
    expect(at(3, 'd2')).toEqual([20])
    expect(at(3, 'd1')).toEqual([])
  })
})

describe('progDiv34Sel1 (練習：sel 預設 1)', () => {
  it('與 progDiv34 是同一個電路，只有 sel 的初值不同', () => {
    expect(progDiv34Sel1.flops).toBe(progDiv34.flops)
    expect(progDiv34Sel1.gates).toBe(progDiv34.gates)
    expect(progDiv34Sel1.inputs[0]).toMatchObject({ name: 'sel', initial: 1 })
  })
  it('不改 input：000 → 101 → 011 → 010 → 000，/4，duty 1/4，無 lock-up', () => {
    const { records, traces } = simulate(progDiv34Sel1, 16, { period: T })
    expect(stateSequence(progDiv34Sel1, records).slice(0, 8)).toEqual(['101', '011', '010', '000', '101', '011', '010', '000'])
    const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T)
    expect(m.ratio).toBe(4)
    expect(m.duty).toBeCloseTo(0.25, 6)
    expect(m.periodic).toBe(true)
    const g = buildStateGraph(progDiv34Sel1, { sel: 1 })
    expect(g.mainCycle).toEqual(['000', '101', '011', '010'])
    expect(g.lockup).toEqual([])
    for (const s of ['001', '100', '110', '111']) expect(g.nodes.find((n) => n.state === s)!.stepsToCycle).toBe(1)
  })
  it('切回 sel=0 就變 /3', () => {
    const { records } = simulate(progDiv34Sel1, 9, { period: T }, () => ({ sel: 0 }))
    expect(findPeriod(stateSequence(progDiv34Sel1, records))!.period).toBe(3)
  })
})

describe('modeAndCounter (sensitization 反例)', () => {
  it('mod = 0：/2，d1 恆為 0，q1 永遠不動', () => {
    for (const s of ['00', '01', '10', '11']) expect(nextStateOf(modeAndCounter, s, { mod: 0 }).d.d1).toBe(0)
    const g = buildStateGraph(modeAndCounter, { mod: 0 })
    expect(g.mainCycle).toEqual(['00', '01'])
    const { records, traces } = simulate(modeAndCounter, 10, { period: T }, () => ({ mod: 0 }))
    expect(stateSequence(modeAndCounter, records).slice(0, 4)).toEqual(['01', '00', '01', '00'])
    const m = measureDivide(traces.find((t) => t.name === 'q0')!, T)
    expect(m.ratio).toBe(2)
    expect(m.duty).toBe(0.5)
    const q1 = traces.find((t) => t.name === 'q1')!
    expect(q1.events.every((e) => e.v === 0)).toBe(true)
  })
  it('mod = 1：/3，d1 = q0', () => {
    for (const s of ['00', '01', '10', '11']) expect(nextStateOf(modeAndCounter, s, { mod: 1 }).d.d1).toBe(Number(s[1]))
    const g = buildStateGraph(modeAndCounter, { mod: 1 })
    expect(g.mainCycle).toEqual(['00', '01', '10'])
    expect(g.lockup).toEqual([])
    const { records, traces } = simulate(modeAndCounter, 12, { period: T }, () => ({ mod: 1 }))
    expect(stateSequence(modeAndCounter, records).slice(0, 6)).toEqual(['01', '10', '00', '01', '10', '00'])
    const m = measureDivide(traces.find((t) => t.name === 'q0')!, T)
    expect(m.ratio).toBe(3)
    expect(m.duty).toBeCloseTo(1 / 3, 6)
  })
})

describe('Lesson 7-2 timing scenarios', () => {
  it('progDiv34：sel=0 critical = p2（slack 3，Tclk,min 52）；sel=1 critical = p4（slack 21，Tclk,min 34）', () => {
    const env = progDiv34Timing.env
    const w3 = worstSetup(progDiv34Timing.paths, env, 'div3')!
    expect(w3.path.id).toBe('p2')
    expect(w3.result.arrival).toBe(40)
    expect(w3.result.required).toBe(43)
    expect(w3.result.slack).toBe(3)
    expect(w3.result.tclkMin).toBe(52)
    const w4 = worstSetup(progDiv34Timing.paths, env, 'div4')!
    expect(w4.path.id).toBe('p4')
    expect(w4.result.arrival).toBe(22)
    expect(w4.result.slack).toBe(21)
    expect(w4.result.tclkMin).toBe(34)
    // p2 / p3 在 sel=1 時不在候選清單裡
    const visible4 = progDiv34Timing.paths.filter((p) => !p.modes || p.modes.includes('div4')).map((p) => p.id)
    expect(visible4).not.toContain('p2')
    expect(visible4).not.toContain('p3')
    expect(visible4).toContain('p4')
    // 每條 path 的 arrival 與課文表格一致
    const arr = Object.fromEntries(progDiv34Timing.paths.map((p) => [p.id, analyzeSetup(p, env).arrival]))
    expect(arr.p1).toBe(15)
    expect(arr.p3).toBe(33)
    expect(arr.p5a).toBe(20)
    expect(arr.p5b).toBe(20)
    expect(arr.p6).toBe(36)
  })
  it('progDiv34：hold 最差是 p1（slack 6）；skew = +8 時 −2', () => {
    const env = progDiv34Timing.env
    const h = worstHold(progDiv34Timing.paths, env, 'div3')!
    expect(h.path.id).toBe('p1')
    expect(h.result.arrival).toBe(9)
    expect(h.result.slack).toBe(6)
    const h8 = analyzeHold(progDiv34Timing.paths.find((p) => p.id === 'p1')!, { ...env, skew: 8 })
    expect(h8.slack).toBe(-2)
  })
  it('gate-count trap：NAND4 path（1 gate）比 inverter chain（3 gates）慢', () => {
    const env = gateCountTrapTiming.env
    const inv = analyzeSetup(gateCountTrapTiming.paths.find((p) => p.id === 'inv-chain')!, env)
    const nand = analyzeSetup(gateCountTrapTiming.paths.find((p) => p.id === 'nand4')!, env)
    expect(inv.arrival).toBe(32)
    expect(nand.arrival).toBe(38)
    expect(inv.slack).toBe(6)
    expect(nand.slack).toBe(0)
    expect(worstSetup(gateCountTrapTiming.paths, env)!.path.id).toBe('nand4')
    expect(nand.tclkMin).toBe(50)
    expect(inv.tclkMin).toBe(44)
  })
  it('modeAnd：mod=1 critical = AND path（slack 3）；mod=0 critical = NOR path（slack 9）', () => {
    const env = modeAndTiming.env
    const w1 = worstSetup(modeAndTiming.paths, env, 'mod1')!
    expect(w1.path.id).toBe('and')
    expect(w1.result.arrival).toBe(26)
    expect(w1.result.slack).toBe(3)
    expect(w1.result.tclkMin).toBe(37)
    const w0 = worstSetup(modeAndTiming.paths, env, 'mod0')!
    expect(w0.path.id).toBe('nor')
    expect(w0.result.arrival).toBe(20)
    expect(w0.result.slack).toBe(9)
    expect(w0.result.tclkMin).toBe(31)
  })
  it('progDiv34：課文表格的每條 path slack / hold（Tclk 55、required 43）', () => {
    const env = progDiv34Timing.env
    const su = Object.fromEntries(progDiv34Timing.paths.map((p) => [p.id, analyzeSetup(p, env)]))
    const ho = Object.fromEntries(progDiv34Timing.paths.map((p) => [p.id, analyzeHold(p, env)]))
    expect(su.p1.required).toBe(43)
    expect([su.p1.slack, su.p2.slack, su.p3.slack, su.p4.slack, su.p5a.slack, su.p5b.slack, su.p6.slack]).toEqual([28, 3, 10, 21, 23, 23, 7])
    expect([ho.p1.arrival, ho.p2.arrival, ho.p3.arrival, ho.p4.arrival, ho.p5a.arrival, ho.p6.arrival]).toEqual([9, 25, 21, 14, 13, 22])
    expect([ho.p1.slack, ho.p2.slack, ho.p3.slack, ho.p4.slack, ho.p5a.slack, ho.p6.slack]).toEqual([6, 22, 18, 11, 10, 19])
    // sel 切換那個 cycle：p6 arrival 36 ⇒ Tclk,min 48（介於 34 與 52 之間）
    expect(su.p6.arrival).toBe(36)
    expect(su.p6.tclkMin).toBe(48)
    expect(worstSetup(progDiv34Timing.paths, env, 'switch')!.path.id).toBe('p2')
  })
  it('練習 scenario：同一組 path，但 mode 順序 div4 → switch → div3', () => {
    expect(progDiv34ExerciseTiming.paths).toBe(progDiv34Timing.paths)
    expect(progDiv34ExerciseTiming.modes!.map((m) => m.id)).toEqual(['div4', 'switch', 'div3'])
    const w = worstSetup(progDiv34ExerciseTiming.paths, progDiv34ExerciseTiming.env, 'div4')!
    expect(w.path.id).toBe('p4')
    expect(w.result.tclkMin).toBe(34)
    expect(worstHold(progDiv34ExerciseTiming.paths, progDiv34ExerciseTiming.env, 'div4')!.path.id).toBe('p1')
  })
  it('PVT corner 表：TT / SS 時 gate-heavy 的 G 最慢，FF-hot 時 wire-heavy 的 W 反而 critical', () => {
    const [G, W] = CORNER_PATHS
    const byId = Object.fromEntries(CORNERS.map((c) => [c.id, c]))
    expect(cornerDelay(G, byId.tt)).toBe(40)
    expect(cornerDelay(W, byId.tt)).toBe(38)
    expect(cornerDelay(G, byId['ss-cold'])).toBe(58)
    expect(cornerDelay(W, byId['ss-cold'])).toBe(43.1)
    expect(cornerDelay(G, byId['ss-hot'])).toBe(54)
    expect(cornerDelay(W, byId['ss-hot'])).toBe(50.3)
    expect(cornerDelay(G, byId['ff-hot'])).toBe(34)
    expect(cornerDelay(W, byId['ff-hot'])).toBe(41.3)
    expect(CORNERS.map((c) => cornerCritical(CORNER_PATHS, c).id)).toEqual(['G', 'G', 'G', 'W'])
  })
})

describe('Lesson 7-1 timing scenarios', () => {
  it('教科書範例：arrival 33、required 39、slack 6、Tclk,min 44；hold slack 14', () => {
    const p = basicsTiming.paths[0]
    const s = analyzeSetup(p, basicsTiming.env)
    expect(s.arrival).toBe(33)
    expect(s.required).toBe(39)
    expect(s.slack).toBe(6)
    expect(s.tclkMin).toBe(44)
    expect(analyzeSetup(p, { ...basicsTiming.env, period: 44 }).slack).toBe(0)
    const h = analyzeHold(p, basicsTiming.env)
    expect(h.arrival).toBe(17)
    expect(h.slack).toBe(14)
    // skew ±8：setup 14 / −2，hold 6 / 22
    expect(analyzeSetup(p, { ...basicsTiming.env, skew: 8 }).slack).toBe(14)
    expect(analyzeSetup(p, { ...basicsTiming.env, skew: -8 }).slack).toBe(-2)
    expect(analyzeHold(p, { ...basicsTiming.env, skew: 8 }).slack).toBe(6)
    expect(analyzeHold(p, { ...basicsTiming.env, skew: -8 }).slack).toBe(22)
  })
  it('練習（負 skew）：setup slack 2、Tclk,min 58；hold slack 22', () => {
    const p = basicsExerciseTiming.paths[0]
    const s = analyzeSetup(p, basicsExerciseTiming.env)
    expect(s.arrival).toBe(40)
    expect(s.required).toBe(42)
    expect(s.slack).toBe(2)
    expect(s.tclkMin).toBe(58)
    const h = analyzeHold(p, basicsExerciseTiming.env)
    expect(h.arrival).toBe(21)
    expect(h.required).toBe(-1)
    expect(h.slack).toBe(22)
    // skew +5：setup 12、hold 12
    expect(analyzeSetup(p, { ...basicsExerciseTiming.env, skew: 5 }).slack).toBe(12)
    expect(analyzeHold(p, { ...basicsExerciseTiming.env, skew: 5 }).slack).toBe(12)
  })
  it('波形模型與 STA 公式一致（launch edge = 0）', () => {
    const m = buildSetupPathModel({ period: 50, tcq: 8, logic: 25, tsetup: 7, uncertainty: 4, skew: 0 })
    expect(m.arrival).toBe(33)
    expect(m.required).toBe(39)
    expect(m.slack).toBe(6)
    expect(m.captureEdge).toBe(50)
    const q = m.traces.find((t) => t.name === 'q')!
    const d = m.traces.find((t) => t.name === 'd')!
    expect(q.events.find((e) => e.v === 1)!.t).toBe(8)
    expect(d.events.find((e) => e.v === 1)!.t).toBe(33)
    const cap = m.traces.find((t) => t.name === 'capture clk')!
    expect(cap.events.filter((e) => e.v === 1).map((e) => e.t)).toEqual([0, 50, 100])
    const mSkew = buildSetupPathModel({ period: 50, tcq: 8, logic: 25, tsetup: 7, uncertainty: 4, skew: -8 })
    expect(mSkew.slack).toBe(-2)
    const h = buildHoldPathModel({ period: 50, tcqMin: 5, logicMin: 12, thold: 3, skew: 0 })
    expect(h.arrival).toBe(17)
    expect(h.slack).toBe(14)
  })
})
