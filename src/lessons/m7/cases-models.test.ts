import { describe, expect, it } from 'vitest'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, detectRuntPulses, findPeriod, measureDivide, nextStateOf, stateSequence } from '@/models/divider/analysis'
import { analyzeHold, analyzeSetup, worstHold, worstSetup } from '@/models/timing/sta'
import { dualMod12, dualMod12Glitchy, dualMod23, mmd2 } from '@/models/divider/examples'
import { clockGateLatch, progDiv46, progDiv57 } from './cases-models'
import { caseATiming, caseBExerciseTiming, caseBTiming, caseCTiming, caseDTiming, caseETiming, caseFTiming, clockGateTiming } from './cases-timing'
import { mmdCarryHighlight } from './cases-schematics'
import { pmuxRuntTraces } from './CaseWidgets'
import { progDiv34Timing } from './method-timing'
import type { TimingScenario } from '@/models/timing/types'

const T = 100
const ev = (tr: { events: { t: number; v: number }[] }) => tr.events.map((e) => [e.t, e.v] as const)

/* ------------------------------------------------------------------ 案例 B：programmable /4 /6 */
describe('progDiv46（案例 B：counter + decode + MUX）', () => {
  it('sel = 0：000 → 001 → 010 → 011 → 000，/4，q1 duty 50%，無 lock-up', () => {
    const { records, traces } = simulate(progDiv46, 14, { period: T }, () => ({ sel: 0 }))
    const seq = stateSequence(progDiv46, records)
    expect(seq.slice(0, 8)).toEqual(['001', '010', '011', '000', '001', '010', '011', '000'])
    expect(findPeriod(seq)!.period).toBe(4)
    const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T)
    expect(m.ratio).toBe(4)
    expect(m.duty).toBeCloseTo(0.5, 6)
    expect(m.periodic).toBe(true)
    const g = buildStateGraph(progDiv46, { sel: 0 })
    expect(g.mainCycle).toEqual(['000', '001', '010', '011'])
    expect(g.lockup).toEqual([])
    // 未用到的 100..111 只是繼續遞增，繞到 111 → 000 回主循環
    for (const s of ['100', '101', '110', '111']) expect(g.nodes.find((n) => n.state === s)!.stepsToCycle).toBeGreaterThanOrEqual(0)
    expect(nextStateOf(progDiv46, '011', { sel: 0 }).next).toBe('000')
    expect(nextStateOf(progDiv46, '111', { sel: 0 }).next).toBe('000')
  })
  it('sel = 1：000 → … → 101 → 000，/6，q1 duty 1/3，無 lock-up', () => {
    const { records, traces } = simulate(progDiv46, 14, { period: T }, () => ({ sel: 1 }))
    const seq = stateSequence(progDiv46, records)
    expect(seq.slice(0, 7)).toEqual(['001', '010', '011', '100', '101', '000', '001'])
    expect(findPeriod(seq)!.period).toBe(6)
    const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T)
    expect(m.ratio).toBe(6)
    expect(m.duty).toBeCloseTo(1 / 3, 6)
    const g = buildStateGraph(progDiv46, { sel: 1 })
    expect(g.mainCycle).toEqual(['000', '001', '010', '011', '100', '101'])
    expect(g.lockup).toEqual([])
    expect(nextStateOf(progDiv46, '011', { sel: 1 }).next).toBe('100')
    expect(nextStateOf(progDiv46, '101', { sel: 1 }).next).toBe('000')
  })
  it('real delay：tc 在 terminal-count edge 後 32 ps（tCQ 8 + DEC 14 + MUX 10）出現', () => {
    const r0 = simulate(progDiv46, 8, { period: T, delayMode: 'real' }, () => ({ sel: 0 }))
    const [tc0] = r0.sim.getTraces(['tc'])
    // edge 3（t = 300）進入 011 ⇒ tc4 → tc 在 332；edge 4（400）清為 000 ⇒ tc 在 432 落下
    expect(ev(tc0).slice(1, 3)).toEqual([[332, 1], [432, 0]])
    const r1 = simulate(progDiv46, 8, { period: T, delayMode: 'real' }, () => ({ sel: 1 }))
    const [tc1, d1] = r1.sim.getTraces(['tc', 'd1'])
    // edge 5（t = 500）進入 101 ⇒ tc6 → tc 在 532
    expect(ev(tc1).slice(1, 3)).toEqual([[532, 1], [632, 0]])
    // 同一個 edge 之後 d1 先在 +30（INC 路徑：8 + 12 + 10）變 1，再在 +42（decode 路徑：8 + 14 + 10 + 10）被 tc 拉回 0
    expect(ev(d1)).toContainEqual([530, 1])
    expect(ev(d1)).toContainEqual([542, 0])
  })
})

/* ------------------------------------------------------------------ 案例 B 練習：/5 /7 */
describe('progDiv57（練習：decode 換成 =100 / =110）', () => {
  it('sel = 0：/5，輸出 q2 duty 1/5，無 lock-up', () => {
    const { records, traces } = simulate(progDiv57, 40, { period: T }, () => ({ sel: 0 }))
    const seq = stateSequence(progDiv57, records)
    expect(seq.slice(0, 5)).toEqual(['001', '010', '011', '100', '000'])
    expect(findPeriod(seq)!.period).toBe(5)
    const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T)
    expect(m.ratio).toBe(5)
    expect(m.duty).toBeCloseTo(0.2, 6)
    const g = buildStateGraph(progDiv57, { sel: 0 })
    expect(g.mainCycle).toEqual(['000', '001', '010', '011', '100'])
    expect(g.lockup).toEqual([])
  })
  it('sel = 1：/7，輸出 q2 duty 3/7，無 lock-up', () => {
    const { records, traces } = simulate(progDiv57, 40, { period: T }, () => ({ sel: 1 }))
    const seq = stateSequence(progDiv57, records)
    expect(seq.slice(0, 7)).toEqual(['001', '010', '011', '100', '101', '110', '000'])
    expect(findPeriod(seq)!.period).toBe(7)
    const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T)
    expect(m.ratio).toBe(7)
    expect(m.duty).toBeCloseTo(3 / 7, 6)
    const g = buildStateGraph(progDiv57, { sel: 1 })
    expect(g.mainCycle).toEqual(['000', '001', '010', '011', '100', '101', '110'])
    expect(g.lockup).toEqual([])
    // /7 時 q1 一個週期內 rising 兩次（010 與 110），不能拿來當 div_out
    const q1 = traces.find((t) => t.name === 'q1')!
    const mq1 = measureDivide(q1, T)
    expect(mq1.periodic).toBe(false)
  })
  it('real delay：DEC5 比 DEC4 慢 4 ps（tc 在 +36 而不是 +32）；DEC7 維持 +32', () => {
    const r0 = simulate(progDiv57, 10, { period: T, delayMode: 'real' }, () => ({ sel: 0 }))
    expect(ev(r0.sim.getTraces(['tc'])[0]).slice(1, 3)).toEqual([[436, 1], [536, 0]])
    const r1 = simulate(progDiv57, 10, { period: T, delayMode: 'real' }, () => ({ sel: 1 }))
    expect(ev(r1.sim.getTraces(['tc'])[0]).slice(1, 3)).toEqual([[632, 1], [732, 0]])
  })
})

/* ------------------------------------------------------------------ Lesson 7-4：clock gating */
describe('clockGateLatch（latch-based ICG + /2）', () => {
  it('en = 1：q0 每個 gclk edge toggle，/2', () => {
    const { records, traces } = simulate(clockGateLatch, 10, { period: T }, () => ({ en: 1 }))
    expect(stateSequence(clockGateLatch, records).slice(0, 6)).toEqual(['1', '0', '1', '0', '1', '0'])
    expect(measureDivide(traces.find((t) => t.name === 'div_out')!, T).ratio).toBe(2)
    const g = buildStateGraph(clockGateLatch, { en: 1 })
    expect(g.mainCycle).toEqual(['0', '1'])
    expect(g.lockup).toEqual([])
  })
  it('en 在 clk = 1 期間改變：en_l 等到 clk 落下才跟隨，gclk 沒有 runt', () => {
    // inputLead 0.75 ⇒ edge k 的 input 在 (k − 0.75)·T 生效 = 前一個 cycle 的 clk high 期間
    const { sim } = simulate(clockGateLatch, 10, { period: T, delayMode: 'real', inputLead: 0.75 }, (k) => ({ en: k % 4 === 2 || k % 4 === 3 ? 0 : 1 }))
    const [clk, en, enl, gclk, q0] = sim.getTraces(['clk', 'en', 'en_l', 'gclk', 'q0'])
    // en 改變的時刻都落在 clk = 1（t mod 100 = 25）
    for (const e of en.events.slice(1)) expect(e.t % T).toBe(25)
    // en_l 只在 clk = 0 期間改變（clk 在 x50 落下 + latch 6 ps）
    for (const e of enl.events.slice(1)) expect(e.t % T).toBe(56)
    expect(ev(enl).slice(0, 3)).toEqual([[0, 1], [156, 0], [356, 1]])
    // gclk：edge 1、4、5、8、9 放行；每個 pulse 都是完整的 50 ps
    expect(gclk.events.filter((e) => e.v === 1).map((e) => e.t)).toEqual([106, 406, 506, 806, 906])
    expect(detectRuntPulses([gclk], 30)).toEqual([])
    expect(detectRuntPulses([gclk], 49)).toEqual([])
    expect(clk.events.length).toBeGreaterThan(10)
    // q0 只在放行的 edge toggle
    expect(q0.events.filter((e) => e.t > 0).map((e) => e.t)).toEqual([114, 414, 514, 814, 914])
  })
})

describe('clock gating 對照組（Lesson 7-4 RuntPulseTable 引用的數字）', () => {
  it('dualMod12Glitchy：en 在 rising edge 後 18 ps 改變 ⇒ div_out 出現 18 ps 的 runt（每兩個 cycle 一次）', () => {
    const { traces } = simulate(dualMod12Glitchy, 10, { period: T, delayMode: 'real' }, () => ({ sel: 1 }))
    const out = traces.find((t) => t.name === 'div_out')!
    const runts = detectRuntPulses([out], 30)
    expect(runts.length).toBe(5)
    for (const r of runts) {
      expect(r.width).toBe(18)
      expect(r.level).toBe(1)
      expect(r.t0 % T).toBe(6) // AND delay 6 之後升起
      expect(r.t1 % T).toBe(24) // en 在 +18 落下，再經 AND 6
    }
    // 另一種：被截短的 32 ps pulse（en 在 +18 升起 ⇒ +24 才開始，+56 隨 clk 落下）
    expect(detectRuntPulses([out], 35).length).toBe(10)
  })
  it('dualMod12（falling-edge 重同步）：沒有 runt', () => {
    const { traces } = simulate(dualMod12, 10, { period: T, delayMode: 'real' }, () => ({ sel: 1 }))
    expect(detectRuntPulses(traces.filter((t) => t.name === 'div_out'), 30)).toEqual([])
  })
})

/* ------------------------------------------------------------------ 案例 C / D 引用的既有 netlist */
describe('dualMod23 與 mmd2（案例 C、D 課文引用）', () => {
  it('dualMod23：mod=0 → 00 ↔ 01（/2）；mod=1 → 00 → 01 → 10（/3）', () => {
    const r0 = simulate(dualMod23, 12, { period: T }, () => ({ mod: 0 }))
    expect(stateSequence(dualMod23, r0.records).slice(0, 4)).toEqual(['01', '00', '01', '00'])
    expect(measureDivide(r0.traces.find((t) => t.name === 'div_out')!, T).ratio).toBe(2)
    const r1 = simulate(dualMod23, 12, { period: T }, () => ({ mod: 1 }))
    expect(stateSequence(dualMod23, r1.records).slice(0, 6)).toEqual(['01', '10', '00', '01', '10', '00'])
    expect(measureDivide(r1.traces.find((t) => t.name === 'div_out')!, T).ratio).toBe(3)
    // mod 只在離開 01 的 edge 被用到：q0 = 0 的 state（00、10）d1 與 mod 無關
    for (const s of ['00', '10']) {
      expect(nextStateOf(dualMod23, s, { mod: 0 }).d.d1).toBe(0)
      expect(nextStateOf(dualMod23, s, { mod: 1 }).d.d1).toBe(0)
    }
    expect(nextStateOf(dualMod23, '01', { mod: 0 }).d.d1).toBe(0)
    expect(nextStateOf(dualMod23, '01', { mod: 1 }).d.d1).toBe(1)
  })
  it('mmd2：N = 4 + 2·p1 + p0', () => {
    for (const p1 of [0, 1] as const)
      for (const p0 of [0, 1] as const) {
        const { traces } = simulate(mmd2, 40, { period: T }, () => ({ p0, p1 }))
        expect(measureDivide(traces.find((t) => t.name === 'div_out')!, T).ratio).toBe(4 + 2 * p1 + p0)
      }
  })
  it('mmd2 real delay（p1p0 = 11）：carry 由 edge 7 launch（mod1_eff @ 750），要到 edge 9 才被 capture（a1 @ 908）⇒ 2-cycle path', () => {
    const { sim } = simulate(mmd2, 12, { period: T, delayMode: 'real' }, () => ({ p0: 1, p1: 1 }))
    const [a0, a1, f1, modOut2, mod1Eff, da1] = sim.getTraces(['a0', 'a1', 'f1', 'mod_out2', 'mod1_eff', 'da1'])
    // edge 7（t = 700）：a → 00 ⇒ f1 rising @ 720（8 + 12）⇒ b0 @ 728 ⇒ mod_out2 @ 740 ⇒ mod1_eff @ 750
    expect(ev(f1)).toContainEqual([720, 1])
    expect(ev(modOut2)).toContainEqual([740, 1])
    expect(ev(mod1Eff)).toContainEqual([750, 1])
    // 但 a0 在 708 已經變 0 ⇒ da1 = a0 AND mod1_eff 被擋住，750 前後 da1 不動
    expect(ev(a0)).toContainEqual([708, 0])
    expect(da1.events.filter((e) => e.t > 700 && e.t < 800)).toEqual([])
    // edge 8（800）：a0 → 1 @ 808 ⇒ da1 @ 818；edge 9（900）capture ⇒ a1 @ 908
    expect(ev(da1)).toContainEqual([818, 1])
    expect(ev(a1)).toContainEqual([908, 1])
  })
})

/* ------------------------------------------------------------------ Lesson 7-3 六個案例的 timing scenario */
describe('Lesson 7-3 timing scenarios', () => {
  it('案例 A：Q → INV → D，arrival 14、slack 15、Tclk,min 25；hold slack 6', () => {
    const p = caseATiming.paths.find((x) => x.id === 'q-inv-d')!
    const s = analyzeSetup(p, caseATiming.env)
    expect(s.arrival).toBe(14)
    expect(s.slack).toBe(15)
    expect(s.tclkMin).toBe(25)
    expect(analyzeHold(p, caseATiming.env).slack).toBe(6)
    expect(worstSetup(caseATiming.paths, caseATiming.env)!.path.id).toBe('q-inv-d')
  })
  it('案例 B：/4 與 /6 各自只看到自己的 decode；critical = decode → MUX → CLR（42，slack 6，Tclk,min 54）', () => {
    const env = caseBTiming.env
    const w4 = worstSetup(caseBTiming.paths, env, 'div4')!
    expect(w4.path.id).toBe('dec4-mux')
    expect(w4.result.arrival).toBe(42)
    expect(w4.result.slack).toBe(6)
    expect(w4.result.tclkMin).toBe(54)
    const w6 = worstSetup(caseBTiming.paths, env, 'div6')!
    expect(w6.path.id).toBe('dec6-mux')
    expect(w6.result.slack).toBe(6)
    const vis4 = caseBTiming.paths.filter((p) => !p.modes || p.modes.includes('div4')).map((p) => p.id)
    expect(vis4).toContain('dec4-mux')
    expect(vis4).not.toContain('dec6-mux')
    const inc = analyzeSetup(caseBTiming.paths.find((p) => p.id === 'inc')!, env)
    expect(inc.arrival).toBe(40)
    expect(inc.slack).toBe(8)
    const sel = analyzeSetup(caseBTiming.paths.find((p) => p.id === 'sel-ctrl')!, env)
    expect(sel.arrival).toBe(27)
    expect(analyzeSetup(caseBTiming.paths.find((p) => p.id === 'out')!, env).arrival).toBe(11)
  })
  it('案例 B 練習：/5 的 DEC5 讓 critical path 變成 46（slack 2，Tclk,min 58）；/7 維持 42', () => {
    const env = caseBExerciseTiming.env
    const w5 = worstSetup(caseBExerciseTiming.paths, env, 'div5')!
    expect(w5.path.id).toBe('dec5-mux')
    expect(w5.result.arrival).toBe(46)
    expect(w5.result.slack).toBe(2)
    expect(w5.result.tclkMin).toBe(58)
    const w7 = worstSetup(caseBExerciseTiming.paths, env, 'div7')!
    expect(w7.path.id).toBe('dec7-mux')
    expect(w7.result.arrival).toBe(42)
    expect(w7.result.slack).toBe(6)
    expect(analyzeSetup(caseBExerciseTiming.paths.find((p) => p.id === 'inc')!, env).arrival).toBe(40)
  })
  it('案例 C：state path 三種 mode 都一樣（NOR 20 / AND 18）；只有 (ii) 同步 flop 的 mod path 是真正的 setup path（24，slack 15）', () => {
    const env = caseCTiming.env
    expect(analyzeSetup(caseCTiming.paths.find((p) => p.id === 'state-nor')!, env).arrival).toBe(20)
    expect(analyzeSetup(caseCTiming.paths.find((p) => p.id === 'state-and')!, env).arrival).toBe(18)
    expect(worstSetup(caseCTiming.paths, env, 'static')!.path.id).toBe('state-nor')
    expect(worstSetup(caseCTiming.paths, env, 'async')!.path.id).toBe('state-nor')
    const ws = worstSetup(caseCTiming.paths, env, 'sync')!
    expect(ws.path.id).toBe('mod-sync')
    expect(ws.result.arrival).toBe(24)
    expect(ws.result.slack).toBe(15)
    const hs = analyzeHold(caseCTiming.paths.find((p) => p.id === 'mod-sync')!, env)
    expect(hs.arrival).toBe(14)
    expect(hs.slack).toBe(11)
    expect(caseCTiming.paths.find((p) => p.id === 'mod-static')!.type).toBe('async')
    expect(caseCTiming.paths.find((p) => p.id === 'mod-async')!.type).toBe('async')
  })
  it('案例 D：STA 預設 single-cycle 時 carry path slack −2；宣告 2-cycle 後 +68；真正的 Fmax path 是 cell 1 的 a0 → NOR（Tclk,min 32）', () => {
    const env = caseDTiming.env
    const sta = analyzeSetup(caseDTiming.paths.find((p) => p.id === 'carry-sta')!, env)
    expect(sta.arrival).toBe(60)
    expect(sta.available).toBe(70)
    expect(sta.slack).toBe(-2)
    const mc = analyzeSetup(caseDTiming.paths.find((p) => p.id === 'carry-mc')!, env)
    expect(mc.available).toBe(140)
    expect(mc.slack).toBe(68)
    const c1 = analyzeSetup(caseDTiming.paths.find((p) => p.id === 'local-c1')!, env)
    expect(c1.arrival).toBe(20)
    expect(c1.slack).toBe(38)
    expect(c1.tclkMin).toBe(32)
    expect(analyzeSetup(caseDTiming.paths.find((p) => p.id === 'local-c2')!, env).slack).toBe(108)
    expect(worstSetup(caseDTiming.paths, env)!.path.id).toBe('carry-sta')
  })
  it('案例 E：select window = 3/8 Tvco = 46.875 ps，arrival 39，slack 2.875；counter 自己的 Fmax path slack 83', () => {
    const env = caseETiming.env
    const w = analyzeSetup(caseETiming.paths.find((p) => p.id === 'sel-window')!, env)
    expect(w.available).toBeCloseTo(46.875, 6)
    expect(w.arrival).toBe(39)
    expect(w.slack).toBeCloseTo(2.875, 6)
    expect(caseETiming.paths.find((p) => p.id === 'sel-window')!.type).toBe('async')
    const f = analyzeSetup(caseETiming.paths.find((p) => p.id === 'div-fmax')!, env)
    expect(f.slack).toBe(83)
    expect(f.tclkMin).toBe(42)
    expect(analyzeSetup(caseETiming.paths.find((p) => p.id === 'phase-clk')!, env).arrival).toBe(15)
  })
  it('案例 F：五條不同性質的 path 各有自己的可用時間', () => {
    const env = caseFTiming.env
    const int = analyzeSetup(caseFTiming.paths.find((p) => p.id === 'int-fmax')!, env)
    expect(int.arrival).toBe(38)
    expect(int.available).toBe(125)
    expect(int.slack).toBe(75)
    expect(int.tclkMin).toBe(50)
    const iface = analyzeSetup(caseFTiming.paths.find((p) => p.id === 'iface')!, env)
    expect(iface.available).toBe(1000)
    expect(iface.arrival).toBe(40)
    expect(iface.slack).toBe(935)
    const loop = analyzeSetup(caseFTiming.paths.find((p) => p.id === 'loop')!, env)
    expect(loop.available).toBe(1000)
    expect(loop.arrival).toBe(275)
    expect(loop.slack).toBe(713)
    const comb = analyzeSetup(caseFTiming.paths.find((p) => p.id === 'comb-fb')!, env)
    expect(comb.arrival).toBe(270)
    expect(comb.slack).toBe(-157)
    expect(analyzeSetup(caseFTiming.paths.find((p) => p.id === 'gen-clk')!, env).arrival).toBe(45)
    expect(caseFTiming.paths.find((p) => p.id === 'iface')!.type).toBe('interface')
    expect(caseFTiming.paths.find((p) => p.id === 'loop')!.type).toBe('multicycle')
    expect(caseFTiming.paths.find((p) => p.id === 'gen-clk')!.type).toBe('output')
  })
  it('Lesson 7-4 clock gating scenario：en → latch slack 77（hold 3）；q → INV → d slack 74；AND insertion delay 6', () => {
    const env = clockGateTiming.env
    const en = clockGateTiming.paths.find((p) => p.id === 'en-latch')!
    expect(analyzeSetup(en, env).arrival).toBe(12)
    expect(analyzeSetup(en, env).slack).toBe(77)
    expect(analyzeHold(en, env).slack).toBe(3)
    const q = clockGateTiming.paths.find((p) => p.id === 'q-inv-d')!
    expect(analyzeSetup(q, env).slack).toBe(74)
    expect(analyzeSetup(q, env).tclkMin).toBe(26)
    expect(analyzeSetup(clockGateTiming.paths.find((p) => p.id === 'clk-gclk')!, env).arrival).toBe(6)
  })
})

/* ------------------------------------------------------------------ 案例 A：reset 的 recovery / removal */
describe('案例 A 的 rst_n path：recovery +22、removal −3（課文 Callout 引用）', () => {
  const p = caseATiming.paths.find((x) => x.id === 'rst-recovery')!
  it('removal slack = 走線 min 2 − t_removal 5 = −3（真的 violation，不是面板算錯）', () => {
    expect(p.type).toBe('recovery')
    expect(p.capture.setup).toBe(10) // t_recovery
    expect(p.capture.hold).toBe(5) // t_removal
    const h = analyzeHold(p, caseATiming.env)
    expect(h.arrival).toBe(2)
    expect(h.required).toBe(5)
    expect(h.slack).toBe(-3)
    // recovery 那邊很寬鬆：arrival(max) 4 ⇒ slack 22
    const s = analyzeSetup(p, caseATiming.env)
    expect(s.arrival).toBe(4)
    expect(s.slack).toBe(22)
  })
  it('caseA 有把這個 −3 解釋清楚（不是沿用 m1 的空白 notes）', () => {
    expect(p.notes!.join('\n')).toContain('removal slack = 2 − 5 = −3')
    expect(p.notes!.join('\n')).toContain('reset synchronizer')
  })
  it('對照組：Lesson 7-2 的 progDiv34 走線 min 6 ⇒ removal slack = +1', () => {
    const q = progDiv34Timing.paths.find((x) => x.id === 'rst')!
    expect(analyzeHold(q, progDiv34Timing.env).slack).toBe(1)
  })
  it('reset path 不會被當成最差 setup / hold（recovery 另計）', () => {
    expect(worstSetup(caseATiming.paths, caseATiming.env)!.path.id).toBe('q-inv-d')
    expect(worstHold(caseATiming.paths, caseATiming.env)!.path.id).toBe('q-inv-d')
  })
})

/* ------------------------------------------------------------------ output path：只有 latency，沒有 slack */
describe('output path 只有 latency（Explorer 不得顯示 slack / Fmax）', () => {
  const cases: [string, TimingScenario, string, number, number][] = [
    // [名稱, scenario, pathId, Σmax, Σmin]
    ['案例 A：FF0.Q → div_out', caseATiming, 'out', 11, 7],
    ['案例 B：FF1.Q → div_out', caseBTiming, 'out', 11, 7],
    ['案例 B 練習：FF2.Q → div_out', caseBExerciseTiming, 'out', 11, 7],
    ['案例 E：VCO phase → MUX → counter clock', caseETiming, 'phase-clk', 15, 9],
    ['案例 F：generated clock 的 source latency', caseFTiming, 'gen-clk', 45, 31],
    ['Lesson 7-4：clk → AND → gclk', clockGateTiming, 'clk-gclk', 6, 4],
    ['Lesson 7-2：FF2.Q → div_out', progDiv34Timing, 'out', 11, 7],
  ]
  for (const [name, sc, id, max, min] of cases) {
    it(`${name}：latency ${max} ps（min ${min}），不進 worstSetup / worstHold`, () => {
      const p = sc.paths.find((x) => x.id === id)!
      expect(p.type).toBe('output')
      expect(p.capture.setup ?? 0).toBe(0) // 沒有 capture flop ⇒ 沒有 tsetup 可用
      expect(analyzeSetup(p, sc.env).arrival).toBe(max)
      expect(analyzeHold(p, sc.env).arrival).toBe(min)
      expect(worstSetup(sc.paths, sc.env)?.path.id).not.toBe(id)
      expect(worstHold(sc.paths, sc.env)?.path.id).not.toBe(id)
    })
  }
})

/* ------------------------------------------------------------------ 案例 D：carry path 的 launch flop 是 b1 還是 b0 */
describe('案例 D：cell 2 的 launch flop 隨 p1 改變（課文 edge 7 敘述）', () => {
  it('p1 = 1（cell 2 走 /3）：edge 7 之後在 728 改變的是 b1，b0 完全不動', () => {
    const { sim } = simulate(mmd2, 14, { period: T, delayMode: 'real' }, () => ({ p0: 1, p1: 1 }))
    const [b0, b1, f1, modOut2] = sim.getTraces(['b0', 'b1', 'f1', 'mod_out2'])
    expect(ev(f1)).toContainEqual([720, 1])
    // 728：b1 由 1 落下（10 → 00），b0 在 700–800 之間沒有任何事件
    expect(ev(b1)).toContainEqual([728, 0])
    expect(b0.events.filter((e) => e.t > 700 && e.t < 1000)).toEqual([])
    expect(ev(modOut2)).toContainEqual([740, 1])
  })
  it('p1 = 0（cell 2 走 /2）：換成 b0 落下（528 → mod_out2 540），b1 整段都是 0', () => {
    const { sim } = simulate(mmd2, 14, { period: T, delayMode: 'real' }, () => ({ p0: 1, p1: 0 }))
    const [b0, b1, f1, modOut2] = sim.getTraces(['b0', 'b1', 'f1', 'mod_out2'])
    expect(ev(f1)).toContainEqual([520, 1])
    expect(ev(b0)).toContainEqual([528, 0])
    expect(ev(modOut2)).toContainEqual([540, 1])
    expect(b1.events.every((e) => e.v === 0)).toBe(true)
  })
  it('兩條 carry path 的 segment 都把 b0 / b1 一起列出來，delay 不變（arrival 60）', () => {
    for (const id of ['carry-sta', 'carry-mc']) {
      const p = caseDTiming.paths.find((x) => x.id === id)!
      const tcqB = p.segments.find((sg) => sg.id === 'tcq_b')!
      expect(tcqB.label).toBe('tCQ (b0/b1)')
      expect(tcqB.elements).toEqual(['c2ff0', 'c2ff1'])
      expect(p.segments.find((sg) => sg.id === 'nor2')!.wires).toContain('w_b1_nor')
      expect(analyzeSetup(p, caseDTiming.env).arrival).toBe(60)
    }
    expect(mmdCarryHighlight.wires).toContain('w_b1_nor')
    expect(mmdCarryHighlight.elements).toContain('c2ff1')
  })
})

/* ------------------------------------------------------------------ 案例 E：PMUX safe window 對方向對稱 */
describe('案例 E：safe window = Tvco/2 − |k|·Tvco/8，對 k 的正負對稱', () => {
  const Tvco = caseETiming.env.period // 125
  /** 兩個 phase 同時為 low（或同時為 high）的區間寬度，50% duty、間距 Tvco/8 */
  const window = (k: number) => Tvco * (1 / 2 - Math.abs(k) / 8)
  it('|k| = 1 ⇒ 3/8 Tvco = 46.875 ps；往前往後一樣寬；|k| = 4 ⇒ 0', () => {
    expect(window(1)).toBeCloseTo((3 / 8) * Tvco, 9)
    expect(window(1)).toBeCloseTo(46.875, 9)
    expect(window(-1)).toBe(window(1))
    expect(window(-2)).toBe(window(2))
    expect(window(4)).toBe(0)
    // 舊公式 Tvco(1 − k/8 − 1/2) 對 k > 0 相同，但 k < 0 會多算成 5/8 Tvco
    expect(Tvco * (1 - 1 / 8 - 1 / 2)).toBeCloseTo(window(1), 9)
    expect(Tvco * (1 - -1 / 8 - 1 / 2)).toBeCloseTo((5 / 8) * Tvco, 9)
  })
  it('scenario 用的 periodFraction 就是 |k| = 1 的 window', () => {
    const p = caseETiming.paths.find((x) => x.id === 'sel-window')!
    expect(p.periodFraction).toBeCloseTo(window(1) / Tvco, 9)
    const s = analyzeSetup(p, caseETiming.env)
    expect(s.available).toBeCloseTo(46.875, 9)
    expect(s.arrival).toBe(39)
    expect(s.tclkMin).toBeCloseTo(44 / (3 / 8), 9) // ≈ 117.33 ps
  })
  it('課文不再宣稱「往後跳 window 反而變寬」', () => {
    const p = caseETiming.paths.find((x) => x.id === 'sel-window')!
    const notes = p.notes!.join('\n')
    expect(notes).not.toContain('window 反而變寬')
    expect(notes).toContain('對稱')
    expect(notes).toContain('min pulse width')
  })
  it('pmuxRuntTraces 是 k = −1（往後跳）：high 從 40 ps 被縮短 Δ = 10 ps 變成 30 ps', () => {
    const Tv = 80 // pmuxRuntTraces 用的 Tvco
    const tr = pmuxRuntTraces()
    const [ph0, ph1, sel, out] = ['ph0', 'ph1', 'sel', 'pmux_out'].map((n) => tr.find((t) => t.name === n)!)
    // ph1 落後 ph0 一個相位 ⇒ 從 ph1 切到 ph0 是「選較早的相位」= 往後跳，k = −1
    expect(ph0.events.find((e) => e.v === 1)!.t).toBe(20)
    expect(ph1.events.find((e) => e.v === 1)!.t).toBe(30)
    expect(sel.events.map((e) => e.t)).toEqual([0, 215])
    // t = 215 時兩個 phase 都還是 high（ph0 180–220、ph1 190–230）⇒ 在 window 內，沒有多生 edge
    const level = (t: { events: { t: number; v: number }[] }, at: number) => t.events.filter((e) => e.t <= at).at(-1)!.v
    expect(level(ph0, 215)).toBe(1)
    expect(level(ph1, 215)).toBe(1)
    // 但輸出這個 pulse 的結尾改由較早落下的 ph0 決定 ⇒ 40 → 30 ps
    const e = out.events.map((x) => x.t)
    expect(e).toContain(190)
    expect(e).toContain(220)
    expect(220 - 190).toBe(30)
    expect(150 - 110).toBe(40) // 正常寬度
    // 壓縮後的寬度 = Tvco/2 − |k|Δ，與 window 寬度同一個式子
    expect(Tv * (1 / 2 - 1 / 8)).toBe(30)
    expect(detectRuntPulses([out], 35).filter((r) => r.level === 1 && r.t0 === 190)).toHaveLength(1)
  })
})

/* ------------------------------------------------------------------ 案例 F：最差 hold 是 interface path */
describe('案例 F：multicycle / interface 一樣要做 hold 檢查', () => {
  it('最差 hold slack 是 iface 的 15 ps（不是 int-fmax 的 20）', () => {
    const env = caseFTiming.env
    const h = Object.fromEntries(caseFTiming.paths.map((p) => [p.id, analyzeHold(p, env).slack]))
    expect(h['int-fmax']).toBe(20)
    expect(h['iface']).toBe(15)
    expect(h['loop']).toBe(160)
    expect(worstHold(caseFTiming.paths, env)!.path.id).toBe('iface')
    expect(worstHold(caseFTiming.paths, env)!.result.slack).toBe(15)
    // setup 那邊仍然是 comb-fb（−157）
    expect(worstSetup(caseFTiming.paths, env)!.path.id).toBe('comb-fb')
  })
})
