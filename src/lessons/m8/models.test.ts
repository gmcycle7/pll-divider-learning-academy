import { describe, expect, it } from 'vitest'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, measureDivide, nextStateOf, stateSequence } from '@/models/divider/analysis'
import { div3, div3Lockup, div3Recover } from '@/models/divider/examples'
import { analyzeHold, analyzeSetup, worstSetup } from '@/models/timing/sta'
import type { TimingScenario } from '@/models/timing/types'
import { asyncResetTiming, div3LockupTiming, div3MinimalTiming, div3RecoverTiming, div5LockupTiming, div5RecoverAltTiming, div5RecoverTiming, syncResetTiming } from './timing'
import { asyncResetTimingSch, div2NoResetSch, div3RecoverSch, div5RecoverSch } from './schematics'
import {
  buildGrayDiv3,
  div3AsyncRst,
  div3RecoverQb,
  div3SyncRst,
  div5Lockup,
  div5Recover,
  div5RecoverAlt,
  grayDiv3Candidates,
  grayDiv3Fixed,
  grayDiv3FixedAlt,
  grayDiv3Lockup,
  mystery3,
  stateFromString,
} from './models'
import { allStates } from '@/utils/bits'

const T = 100

/** 從某個 state 啟動，跑 n 個 edge 的 state 序列 */
function runFrom(nl: Parameters<typeof simulate>[0], state: string, n = 5) {
  const { records } = simulate(nl, n, { period: T, initialState: stateFromString(nl, state) })
  return stateSequence(nl, records)
}

describe('div5Lockup（twisted-ring /5，有 lock-up loop）', () => {
  it('主循環 000→001→011→110→100，divide ratio 5，duty 40%', () => {
    const { records, traces } = simulate(div5Lockup, 15, { period: T })
    expect(stateSequence(div5Lockup, records).slice(0, 10)).toEqual(['001', '011', '110', '100', '000', '001', '011', '110', '100', '000'])
    const m = measureDivide(traces.find((t) => t.name === 'q2')!, T)
    expect(m.ratio).toBe(5)
    expect(m.duty).toBeCloseTo(0.4, 6)
    expect(m.periodic).toBe(true)
  })
  it('state graph：5 個 reachable、010 ↔ 101 lock-up、111 一步回來', () => {
    const g = buildStateGraph(div5Lockup, {})
    expect(g.mainCycle).toEqual(['000', '001', '011', '110', '100'])
    expect(g.reachable.sort()).toEqual(['000', '001', '011', '100', '110'])
    expect(g.lockup.sort()).toEqual(['010', '101'])
    expect(g.nodes.find((n) => n.state === '010')!.next).toBe('101')
    expect(g.nodes.find((n) => n.state === '101')!.next).toBe('010')
    expect(g.nodes.find((n) => n.state === '111')!.stepsToCycle).toBe(1)
    expect(g.nodes.find((n) => n.state === '111')!.next).toBe('110')
  })
  it('從 lock-up state 啟動永遠回不來；輸出 q2 變成錯誤的 /2（010 ↔ 101 交替）', () => {
    expect(runFrom(div5Lockup, '010')).toEqual(['101', '010', '101', '010', '101'])
    expect(runFrom(div5Lockup, '101')).toEqual(['010', '101', '010', '101', '010'])
    const { traces } = simulate(div5Lockup, 10, { period: T, initialState: stateFromString(div5Lockup, '010') })
    const m = measureDivide(traces.find((t) => t.name === 'q2')!, T)
    expect(m.ratio).toBe(2)
    expect(m.duty).toBeCloseTo(0.5, 6)
  })
  it('real delay：d0 = tCQ + AND + NOR 之後才穩定', () => {
    const { records } = simulate(div5Lockup, 2, { period: T, delayMode: 'real' })
    // edge 2（t=2T）：q1 ← 1 使 a10 = 1，d0 = 0；時間 = 2T + tcq(8) + AND(14) + NOR(12)
    const ev = records[1].events.find((e) => e.signal === 'd0' && e.to === 0)!
    expect(ev.t).toBeCloseTo(2 * T + 8 + 14 + 12, 6)
  })
})

describe('div5Recover（加一個 AND：d1 = q0 AND NOT q2）', () => {
  it('主循環與 divide ratio 不變', () => {
    const { records, traces } = simulate(div5Recover, 15, { period: T })
    expect(stateSequence(div5Recover, records).slice(0, 5)).toEqual(['001', '011', '110', '100', '000'])
    const m = measureDivide(traces.find((t) => t.name === 'q2')!, T)
    expect(m.ratio).toBe(5)
    expect(m.duty).toBeCloseTo(0.4, 6)
  })
  it('沒有 lock-up，所有 unused state 在 2 步內回到主循環', () => {
    const g = buildStateGraph(div5Recover, {})
    expect(g.lockup).toEqual([])
    expect(g.mainCycle).toEqual(['000', '001', '011', '110', '100'])
    for (const n of g.nodes) expect(n.stepsToCycle).toBeLessThanOrEqual(2)
    expect(g.nodes.find((n) => n.state === '101')!.next).toBe('000')
    expect(g.nodes.find((n) => n.state === '010')!.stepsToCycle).toBe(2)
    expect(g.nodes.find((n) => n.state === '111')!.next).toBe('100')
  })
  it('逐 edge：101 → 000 → 001；010 → 101 → 000', () => {
    expect(runFrom(div5Recover, '101', 3)).toEqual(['000', '001', '011'])
    expect(runFrom(div5Recover, '010', 3)).toEqual(['101', '000', '001'])
    expect(runFrom(div5Recover, '111', 3)).toEqual(['100', '000', '001'])
  })
})

describe('div5RecoverAlt（重新化簡 d0 = NOR(q2, q1)）', () => {
  it('主循環不變、無 lock-up、stepsToCycle ≤ 2', () => {
    const g = buildStateGraph(div5RecoverAlt, {})
    expect(g.mainCycle).toEqual(['000', '001', '011', '110', '100'])
    expect(g.lockup).toEqual([])
    for (const n of g.nodes) expect(n.stepsToCycle).toBeLessThanOrEqual(2)
    const { traces } = simulate(div5RecoverAlt, 15, { period: T })
    expect(measureDivide(traces.find((t) => t.name === 'q2')!, T).ratio).toBe(5)
    expect(runFrom(div5RecoverAlt, '010', 2)).toEqual(['100', '000'])
    expect(runFrom(div5RecoverAlt, '101', 3)).toEqual(['010', '100', '000'])
  })
})

describe('mystery3（Lesson 8-1 練習）', () => {
  it('主循環 000→001→010→101，/4，duty 25%', () => {
    const { records, traces } = simulate(mystery3, 12, { period: T })
    expect(stateSequence(mystery3, records).slice(0, 8)).toEqual(['001', '010', '101', '000', '001', '010', '101', '000'])
    const m = measureDivide(traces.find((t) => t.name === 'q2')!, T)
    expect(m.ratio).toBe(4)
    expect(m.duty).toBeCloseTo(0.25, 6)
  })
  it('lock-up = {011, 100, 110}；111 一步回來', () => {
    const g = buildStateGraph(mystery3, {})
    expect(g.lockup.sort()).toEqual(['011', '100', '110'])
    expect(g.nodes.find((n) => n.state === '100')!.next).toBe('011')
    expect(g.nodes.find((n) => n.state === '011')!.next).toBe('110')
    expect(g.nodes.find((n) => n.state === '110')!.next).toBe('011')
    expect(g.nodes.find((n) => n.state === '111')!.stepsToCycle).toBe(1)
    expect(runFrom(mystery3, '100', 4)).toEqual(['011', '110', '011', '110'])
    expect(runFrom(mystery3, '111', 3)).toEqual(['000', '001', '010'])
  })
})

describe('Gray-code /3（Lesson 8-2 練習）', () => {
  it('grayDiv3Lockup：00→01→11，10 → 10 lock-up，ratio 3，duty 1/3', () => {
    const { records, traces } = simulate(grayDiv3Lockup, 12, { period: T })
    expect(stateSequence(grayDiv3Lockup, records).slice(0, 6)).toEqual(['01', '11', '00', '01', '11', '00'])
    const m = measureDivide(traces.find((t) => t.name === 'q1')!, T)
    expect(m.ratio).toBe(3)
    expect(m.duty).toBeCloseTo(1 / 3, 6)
    const g = buildStateGraph(grayDiv3Lockup, {})
    expect(g.mainCycle).toEqual(['00', '01', '11'])
    expect(g.lockup).toEqual(['10'])
    expect(runFrom(grayDiv3Lockup, '10', 3)).toEqual(['10', '10', '10'])
  })
  it('grayDiv3Fixed（d1 = q0 AND NOT q1）：10 → 00，無 lock-up', () => {
    const g = buildStateGraph(grayDiv3Fixed, {})
    expect(g.mainCycle).toEqual(['00', '01', '11'])
    expect(g.lockup).toEqual([])
    expect(g.nodes.find((n) => n.state === '10')!.next).toBe('00')
    expect(runFrom(grayDiv3Fixed, '10', 4)).toEqual(['00', '01', '11', '00'])
    expect(measureDivide(simulate(grayDiv3Fixed, 12, { period: T }).traces.find((t) => t.name === 'q1')!, T).ratio).toBe(3)
  })
  it('grayDiv3FixedAlt（d0 = NAND(q1, q0)）：10 → 11，無 lock-up', () => {
    const g = buildStateGraph(grayDiv3FixedAlt, {})
    expect(g.mainCycle).toEqual(['00', '01', '11'])
    expect(g.lockup).toEqual([])
    expect(g.nodes.find((n) => n.state === '10')!.next).toBe('11')
    expect(runFrom(grayDiv3FixedAlt, '10', 4)).toEqual(['11', '00', '01', '11'])
  })
  it('所有候選組合：只有保留主循環的組合才算修好；至少有兩組能修好', () => {
    const target = ['00', '01', '11']
    const good: string[] = []
    for (const c1 of grayDiv3Candidates.d1)
      for (const c0 of grayDiv3Candidates.d0) {
        const nl = buildGrayDiv3(c1.key, c0.key)
        const g = buildStateGraph(nl, {})
        const keepsCycle = g.mainCycle.join() === target.join()
        if (keepsCycle && g.lockup.length === 0) good.push(`${c1.key}/${c0.key}`)
        // 原始組合必須是壞的
        if (c1.key === 'xor' && c0.key === 'nq1') {
          expect(keepsCycle).toBe(true)
          expect(g.lockup).toEqual(['10'])
        }
      }
    expect(good).toContain('q0nq1/nq1')
    expect(good).toContain('xor/nand')
    expect(good.length).toBeGreaterThanOrEqual(2)
  })
})

describe('div3RecoverQb 與 examples 的 div3Recover 等價', () => {
  it('每一個 state 的 next-state 都相同', () => {
    for (const s of allStates(2)) expect(nextStateOf(div3RecoverQb, s, {}).next).toBe(nextStateOf(div3Recover, s, {}).next)
    const g = buildStateGraph(div3RecoverQb, {})
    expect(g.lockup).toEqual([])
    expect(g.nodes.find((n) => n.state === '11')!.stepsToCycle).toBe(1)
    expect(runFrom(div3RecoverQb, '11', 4)).toEqual(['00', '01', '10', '00'])
  })
  it('real delay：d1 由 q1_b 經 AND 產生', () => {
    const { records } = simulate(div3RecoverQb, 2, { period: T, delayMode: 'real' })
    // edge 1：q0 ← 1，q1_b = 1 ⇒ d1 = 1 於 T + tcq + AND
    const ev = records[0].events.find((e) => e.signal === 'd1' && e.to === 1)!
    expect(ev.t).toBeCloseTo(T + 8 + 14, 6)
  })
})

describe('reset 示範 netlist', () => {
  it('div3AsyncRst：rst_n 拉低時 Q 立即歸零（不等 clock edge）', () => {
    const { records } = simulate(div3AsyncRst, 6, { period: T, initialState: stateFromString(div3AsyncRst, '11') }, (e) => (e === 3 ? { rst_n: 0 } : e === 4 ? { rst_n: 1 } : {}))
    expect(stateSequence(div3AsyncRst, records)).toEqual(['11', '11', '00', '01', '10', '00'])
    // input 在 edge 3 之前 0.35T 生效：t = 3T − 0.35T = 265；q0/q1 同時刻歸零
    const rec3 = records[2]
    const rstEv = rec3.events.find((e) => e.signal === 'rst_n' && e.to === 0)!
    const q0Ev = rec3.events.find((e) => e.signal === 'q0' && e.to === 0)!
    expect(rstEv.t).toBeCloseTo(3 * T - 0.35 * T, 6)
    expect(q0Ev.t).toBeCloseTo(rstEv.t, 6)
    expect(q0Ev.t).toBeLessThan(3 * T)
    // 沒有 reset 時 11 永遠停住
    expect(runFrom(div3AsyncRst, '11', 3)).toEqual(['11', '11', '11'])
  })
  it('div3SyncRst：rst 拉高後要等到下一個 edge，state 才變 00', () => {
    const { records } = simulate(div3SyncRst, 6, { period: T, initialState: stateFromString(div3SyncRst, '11') }, (e) => (e === 3 ? { rst: 1 } : e === 4 ? { rst: 0 } : {}))
    expect(stateSequence(div3SyncRst, records)).toEqual(['11', '11', '00', '01', '10', '00'])
    const rec3 = records[2]
    const q0Ev = rec3.events.find((e) => e.signal === 'q0' && e.to === 0)!
    expect(q0Ev.t).toBeCloseTo(3 * T, 6) // 正好在 edge，不是 rst 改變的瞬間
    expect(rec3.combBefore.d0).toBe(0)
    expect(rec3.combBefore.d1).toBe(0)
    const g = buildStateGraph(div3SyncRst, { rst: 0 })
    expect(g.lockup).toEqual(['11'])
    expect(buildStateGraph(div3SyncRst, { rst: 1 }).mainCycle).toEqual(['00'])
  })
})

describe('stateFromString', () => {
  it('依 stateOrder（MSB first）轉換', () => {
    expect(stateFromString(div5Lockup, '101')).toEqual({ q2: 1, q1: 0, q0: 1 })
    expect(stateFromString(grayDiv3Lockup, '10')).toEqual({ q1: 1, q0: 0 })
    expect(stateFromString(grayDiv3Lockup, '1')).toEqual({ q1: 0, q0: 1 })
  })
})

/* ------------------------------------------------------------------------------------------------
 * 課文引用的 timing 數字與 highlight id（Lesson 8-1 / 8-2 的內文與 quiz 都引用這些值）
 * ---------------------------------------------------------------------------------------------- */
const scenarios: TimingScenario[] = [asyncResetTiming, syncResetTiming, div3MinimalTiming, div3LockupTiming, div3RecoverTiming, div5LockupTiming, div5RecoverTiming, div5RecoverAltTiming]

describe('timing scenario：schematic id 一致', () => {
  it('每條 path 的 launch / capture / segment 所引用的 wire 與 element 都存在於 schematic', () => {
    for (const sc of scenarios) {
      const wires = new Set(sc.schematic.wires.map((w) => w.id))
      const elems = new Set(sc.schematic.elements.map((e) => e.id))
      for (const p of sc.paths) {
        expect(elems.has(p.launch.element), `${sc.id}/${p.id} launch ${p.launch.element}`).toBe(true)
        expect(elems.has(p.capture.element), `${sc.id}/${p.id} capture ${p.capture.element}`).toBe(true)
        for (const seg of p.segments) {
          for (const w of seg.wires ?? []) expect(wires.has(w), `${sc.id}/${p.id} wire ${w}`).toBe(true)
          for (const e of seg.elements ?? []) expect(elems.has(e), `${sc.id}/${p.id} element ${e}`).toBe(true)
        }
      }
    }
    // Lesson 8-2 quiz 的 critical-path 選項用到的 id
    const w5 = new Set(div5RecoverSch.wires.map((w) => w.id))
    for (const id of ['w_q0_and10_in1', 'w_a10_nor_in1', 'w_d0', 'w_q2_b_and2_in0', 'w_d1', 'w_q2_nor_in0', 'w_q1_ff2']) expect(w5.has(id), id).toBe(true)
    expect(div5RecoverSch.elements.map((e) => e.id)).toEqual(expect.arrayContaining(['and10', 'nor', 'and2', 'ff0', 'ff1', 'ff2']))
    expect(div3RecoverSch.wires.map((w) => w.id)).toEqual(expect.arrayContaining(['w_q1_b_and_in0', 'w_q0_and_in1', 'w_d1']))
    expect(asyncResetTimingSch.elements.map((e) => e.id)).toEqual(expect.arrayContaining(['rs', 'buf', 'rst_in']))
    expect(div2NoResetSch.wires.find((w) => w.id === 'w_qb_d')?.from).toBe('ff0.qb')
  })
})

describe('timing scenario：課文引用的 slack / Tclk,min', () => {
  const tmin = (sc: TimingScenario) => worstSetup(sc.paths, sc.env)!
  it('/3：最簡版 31 ps、壞版 33 ps、修正版 33 ps（新增 AND 進了 critical path）', () => {
    expect(tmin(div3MinimalTiming).result.tclkMin).toBe(31)
    expect(tmin(div3MinimalTiming).path.id).toBe('q1-nor-d0')
    expect(tmin(div3LockupTiming).result.tclkMin).toBe(33)
    expect(tmin(div3RecoverTiming).result.tclkMin).toBe(33)
    expect(['q1b-and-d1', 'q0-and-d1']).toContain(tmin(div3RecoverTiming).path.id)
    // 兩條 AND 路徑並列最差（arrival 22）；NOR 路徑 20
    const arr = Object.fromEntries(div3RecoverTiming.paths.map((p) => [p.id, analyzeSetup(p, div3RecoverTiming.env).arrival]))
    expect(arr).toEqual({ 'q1-nor-d0': 20, 'q1b-and-d1': 22, 'q0-and-d1': 22 })
    // hold：wire 路徑 slack 3 → 修正後 AND 路徑 11
    expect(analyzeHold(div3MinimalTiming.paths.find((p) => p.id === 'q0-d1')!, div3MinimalTiming.env).slack).toBe(3)
    expect(analyzeHold(div3RecoverTiming.paths.find((p) => p.id === 'q0-and-d1')!, div3RecoverTiming.env).slack).toBe(11)
  })
  it('/5：壞版 45 ps、修法 A 45 ps（AND2 不進 critical path）、修法 B 31 ps', () => {
    expect(tmin(div5LockupTiming).result.tclkMin).toBe(45)
    expect(tmin(div5RecoverTiming).result.tclkMin).toBe(45)
    expect(tmin(div5RecoverTiming).path.id).toBe('q0-and-nor-d0')
    expect(analyzeSetup(div5RecoverTiming.paths.find((p) => p.id === 'q2b-and2-d1')!, div5RecoverTiming.env).arrival).toBe(22)
    expect(tmin(div5RecoverAltTiming).result.tclkMin).toBe(31)
  })

  /**
   * Lesson 7-2 Step 4 / Lesson 8-2 quiz q5 的方法論：一個 gate 有幾個輸入來自不同的 launch flop，
   * 就有幾條 path，這一步要窮舉。/5 的 a10 = q1·q0 與修法 A 的 and2 = q0·q̄2 都是兩輸入 gate，
   * 所以各有兩條並列的 path——Explorer 的清單必須列全，否則讀者數出來的 path 數會與課文對不起來。
   */
  it('/5：a10 = q1·q0 的兩個輸入各是一條 path，arrival 並列 34 ps', () => {
    for (const sc of [div5LockupTiming, div5RecoverTiming]) {
      const arr = Object.fromEntries(sc.paths.map((p) => [p.id, analyzeSetup(p, sc.env).arrival]))
      expect(arr['q0-and-nor-d0']).toBe(34)
      expect(arr['q1-and-nor-d0']).toBe(34)
      // launch flop 不同，delay 相同
      expect(sc.paths.find((p) => p.id === 'q0-and-nor-d0')!.launch.element).toBe('ff0')
      expect(sc.paths.find((p) => p.id === 'q1-and-nor-d0')!.launch.element).toBe('ff1')
      expect(analyzeSetup(sc.paths.find((p) => p.id === 'q1-and-nor-d0')!, sc.env).tclkMin).toBe(45)
      // 兩條都走同一個 NOR 進 FF0.D，只有進 AND 的那一段 wire 不同
      expect(sc.paths.find((p) => p.id === 'q1-and-nor-d0')!.segments.find((sg) => sg.id === 'and10')!.wires).toEqual(['w_q1_and10_in0'])
    }
  })
  it('/5 修法 A：新增的 AND2 也是兩條（FF2.Q̄ 與 FF0.Q），都是 22 ps、hold slack 11', () => {
    const env = div5RecoverTiming.env
    for (const id of ['q2b-and2-d1', 'q0-and2-d1']) {
      const p = div5RecoverTiming.paths.find((x) => x.id === id)!
      expect(analyzeSetup(p, env).arrival).toBe(22)
      expect(analyzeSetup(p, env).tclkMin).toBe(33)
      expect(analyzeHold(p, env).slack).toBe(11)
    }
    expect(div5RecoverTiming.paths.find((p) => p.id === 'q0-and2-d1')!.launch.element).toBe('ff0')
    // 壞版的 d1 還只是 wire（hold slack 3）；修法 A 把它換成 AND ⇒ 11
    expect(analyzeHold(div5LockupTiming.paths.find((p) => p.id === 'q0-d1')!, div5LockupTiming.env).slack).toBe(3)
    expect(div5RecoverTiming.paths.find((p) => p.id === 'q0-d1')).toBeUndefined()
    // critical path 仍然是兩級的 AND → NOR，不是新增的 AND2
    expect(tmin(div5RecoverTiming).result.tclkMin).toBe(45)
  })
  it('reset path：recovery slack 68、removal slack 6；同步 reset 47 ps', () => {
    const rec = asyncResetTiming.paths.find((p) => p.id === 'rst-rec-ff0')!
    expect(analyzeSetup(rec, asyncResetTiming.env)).toMatchObject({ arrival: 18, required: 86, slack: 68 })
    const rem = asyncResetTiming.paths.find((p) => p.id === 'rst-rem-ff0')!
    expect(analyzeHold(rem, asyncResetTiming.env)).toMatchObject({ arrival: 11, required: 5, slack: 6 })
    expect(tmin(syncResetTiming).result.tclkMin).toBe(47)
    expect(tmin(syncResetTiming).path.id).toBe('q1-xnor-and0-d0')
    // 非同步 reset 不影響 data path
    expect(analyzeSetup(asyncResetTiming.paths[0], asyncResetTiming.env).tclkMin).toBe(31)
  })
})

describe('Lesson 8-1 quiz 波形：async vs sync reset 的 q0 歸零時間', () => {
  const run = (nl: Parameters<typeof simulate>[0], rst: string, a: 0 | 1, r: 0 | 1) => simulate(nl, 6, { period: T }, (e) => (e === 3 ? { [rst]: a } : e === 4 ? { [rst]: r } : {})).sim
  it('async：q0 在 rst_n 拉低的瞬間（edge 3 前 0.35T = 265）歸零；sync：在 edge 3（300）', () => {
    const a = run(div3AsyncRst, 'rst_n', 0, 1).getTraces(['q0'])[0]
    const s = run(div3SyncRst, 'rst', 1, 0).getTraces(['q0'])[0]
    // 從 reset 啟動：00 → 01（q0=1 @100）→ 10（q0=0 @200）；edge 3 前 reset
    expect(a.events.map((e) => `${e.t}:${e.v}`)).toEqual(['0:0', '100:1', '200:0', '400:1', '500:0'])
    expect(s.events.map((e) => `${e.t}:${e.v}`)).toEqual(['0:0', '100:1', '200:0', '400:1', '500:0'])
    // 差別要用 q1 看：async 在 265 被清、sync 在 300 才變
    const aq1 = run(div3AsyncRst, 'rst_n', 0, 1).getTraces(['q1'])[0]
    const sq1 = run(div3SyncRst, 'rst', 1, 0).getTraces(['q1'])[0]
    expect(aq1.events.find((e) => e.t > 200 && e.v === 0)!.t).toBeCloseTo(265, 6)
    expect(sq1.events.find((e) => e.t > 200 && e.v === 0)!.t).toBeCloseTo(300, 6)
  })
})

describe('examples 的 div3 / div3Lockup（課文引用）', () => {
  it('NOR 版 11 → 10（1 步）；XNOR 版 11 → 11（lock-up）', () => {
    expect(buildStateGraph(div3, {}).nodes.find((n) => n.state === '11')).toMatchObject({ next: '10', stepsToCycle: 1, lockup: false })
    expect(buildStateGraph(div3Lockup, {}).nodes.find((n) => n.state === '11')).toMatchObject({ next: '11', lockup: true })
    expect(runFrom(div3, '11', 4)).toEqual(['10', '00', '01', '10'])
    expect(runFrom(div3Lockup, '11', 3)).toEqual(['11', '11', '11'])
  })
})
