import { describe, expect, it } from 'vitest'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, detectRuntPulses, findPeriod, measureDivide, stateSequence } from '@/models/divider/analysis'
import { ripple4, ripple8, sync4, sync8 } from '@/models/divider/examples'
import { analyzeHold, analyzeSetup, worstSetup } from '@/models/timing/sta'
import { ripple4Decode, ripple8AllRise, ripple8Decode, ripple8Rise, sync4Decode } from './models'
import { rippleTiming } from './ripple-timing'
import { sync4Timing, sync8Timing } from './sync-timing'

const T = 100
const trace = (r: ReturnType<typeof simulate>, name: string) => r.sim.getTraces([name])[0]

// ---------------------------------------------------------------- Lesson 1-2：ripple
describe('ripple4（課文逐 edge 表）', () => {
  it('state 序列 01→10→11→00，週期 4', () => {
    const r = simulate(ripple4, 12, { period: T })
    const seq = stateSequence(ripple4, r.records)
    expect(seq.slice(0, 8)).toEqual(['01', '10', '11', '00', '01', '10', '11', '00'])
    expect(findPeriod(seq)).toEqual({ period: 4, start: 0 })
  })
  it('q0 是 /2、q1 是 /4，duty 都是 50%', () => {
    const r = simulate(ripple4, 16, { period: T })
    const m0 = measureDivide(trace(r, 'q0'), T)
    const m1 = measureDivide(trace(r, 'q1'), T)
    expect(m0.ratio).toBe(2)
    expect(m1.ratio).toBe(4)
    expect(m1.duty).toBe(0.5)
    expect(m1.periodic).toBe(true)
    // q1 的 rising edge 在 edge 2、6、10（t = 2T, 6T, 10T）
    expect(m1.risingTimes.slice(0, 3)).toEqual([200, 600, 1000])
  })
  it('FF1 只在 q0 falling edge 時改變（edge 2、4、6…）', () => {
    const r = simulate(ripple4, 8, { period: T })
    for (const rec of r.records) {
      const q0Fell = rec.stateBefore.q0 === 1 && rec.stateAfter.q0 === 0
      const q1Changed = rec.stateBefore.q1 !== rec.stateAfter.q1
      expect(q1Changed).toBe(q0Fell)
    }
  })
  it('real delay：q1 相對 clk edge 延遲 2 × tCQ（逐級累積）', () => {
    for (const tcq of [8, 16, 30]) {
      const r = simulate(ripple4, 6, { period: T, delayMode: 'real', tcqOverride: tcq })
      const q1 = trace(r, 'q1')
      const q0 = trace(r, 'q0')
      expect(q0.events.find((e) => e.v === 1)!.t).toBeCloseTo(T + tcq, 6)
      expect(q1.events.find((e) => e.v === 1)!.t).toBeCloseTo(2 * T + 2 * tcq, 6)
    }
  })
  it('real delay：11→00 中間經過 temporary state 10，持續 tCQ', () => {
    const tcq = 12
    const r = simulate(ripple4, 4, { period: T, delayMode: 'real', tcqOverride: tcq })
    const rec4 = r.records[3] // edge 4：11 → 00
    expect(rec4.stateBefore).toEqual({ q0: 1, q1: 1 })
    expect(rec4.stateAfter).toEqual({ q0: 0, q1: 0 })
    const tq0 = rec4.events.find((e) => e.signal === 'q0')!.t
    const tq1 = rec4.events.find((e) => e.signal === 'q1')!.t
    expect(tq0).toBeCloseTo(4 * T + tcq, 6)
    expect(tq1).toBeCloseTo(4 * T + 2 * tcq, 6)
    expect(tq1 - tq0).toBeCloseTo(tcq, 6)
  })
  it('同步觀點的 next-state table 對 ripple 不適用（課文 pitfall）', () => {
    // 若把 d1 = NOT q1 當成「每個 clk edge 都抓」，會得到 00→11→00 的錯誤答案
    const g = buildStateGraph(ripple4, {})
    expect(g.mainCycle).toEqual(['00', '11'])
    expect(g.mainCycle).not.toEqual(['00', '01', '10', '11'])
  })
})

describe('ripple4Decode（decode glitch）', () => {
  it('ideal：dec00 只在 state 00 為 1（沒有 glitch）', () => {
    const r = simulate(ripple4Decode, 8, { period: T })
    const dec = trace(r, 'dec00')
    // t=0 reset state 00 → 1；edge 1 後 01 → 0；edge 4 後 00 → 1；edge 5 後 → 0
    expect(dec.events).toEqual([
      { t: 0, v: 1 },
      { t: 100, v: 0 },
      { t: 400, v: 1 },
      { t: 500, v: 0 },
      { t: 800, v: 1 },
    ])
    expect(detectRuntPulses([dec], T / 2)).toEqual([])
  })
  it('real tCQ = 8：01→10 經過 temporary 00，dec00 出現寬度 8 ps 的 glitch', () => {
    const r = simulate(ripple4Decode, 8, { period: T, delayMode: 'real', tcqOverride: 8 })
    const runts = detectRuntPulses([trace(r, 'dec00')], T / 2)
    expect(runts.map((p) => [p.t0, p.t1, p.width])).toEqual([
      [214, 222, 8],
      [614, 622, 8],
    ])
  })
  it('glitch 寬度 = tCQ；tCQ 不大於 AND delay（6 ps）時被 inertial delay 濾掉', () => {
    for (const tcq of [4, 6]) {
      const r = simulate(ripple4Decode, 8, { period: T, delayMode: 'real', tcqOverride: tcq })
      expect(detectRuntPulses([trace(r, 'dec00')], T / 2)).toEqual([])
    }
    for (const tcq of [12, 20, 30]) {
      const r = simulate(ripple4Decode, 8, { period: T, delayMode: 'real', tcqOverride: tcq })
      const runts = detectRuntPulses([trace(r, 'dec00')], T / 2)
      expect(runts.length).toBe(2)
      expect(runts[0].width).toBeCloseTo(tcq, 6)
      expect(runts[0].t0).toBeCloseTo(2 * T + tcq + 6, 6)
    }
  })
  it('divide ratio 不受 decode 影響', () => {
    const r = simulate(ripple4Decode, 16, { period: T })
    expect(measureDivide(trace(r, 'q1'), T).ratio).toBe(4)
  })
})

describe('ripple8（課文）', () => {
  it('binary up count 001→…→111→000，q2 是 /8', () => {
    const r = simulate(ripple8, 20, { period: T })
    const seq = stateSequence(ripple8, r.records)
    expect(seq.slice(0, 8)).toEqual(['001', '010', '011', '100', '101', '110', '111', '000'])
    expect(findPeriod(seq)).toEqual({ period: 8, start: 0 })
    const m = measureDivide(trace(r, 'q2'), T)
    expect(m.ratio).toBe(8)
    expect(m.duty).toBe(0.5)
    expect(m.risingTimes[0]).toBe(400)
  })
  it('5 個 edge 之後 state = 101（quiz）', () => {
    const r = simulate(ripple8, 5, { period: T })
    expect(r.sim.getStateString()).toBe('101')
  })
  it('real delay：q2 相對 clk edge 延遲 3 × tCQ', () => {
    for (const tcq of [8, 12]) {
      const r = simulate(ripple8, 10, { period: T, delayMode: 'real', tcqOverride: tcq })
      expect(trace(r, 'q2').events.find((e) => e.v === 1)!.t).toBeCloseTo(4 * T + 3 * tcq, 6)
    }
  })
})

describe('ripple8Decode（累積 clock path → decode → 同步 capture）', () => {
  it('ideal：dec_s 是 dec000 晚一個 clk 的版本，/8、duty 1/8', () => {
    const r = simulate(ripple8Decode, 18, { period: T })
    expect(stateSequence(ripple8Decode, r.records).slice(0, 8)).toEqual(['001', '010', '011', '100', '101', '110', '111', '000'])
    const m = measureDivide(trace(r, 'dec_s'), T)
    expect(m.ratio).toBe(8)
    expect(m.duty).toBeCloseTo(0.125, 6)
    // state 000 出現在 edge 8 之後（t = 800..900），FFS 在 edge 9（t = 900）抓到
    expect(trace(r, 'dec_s').events.filter((e) => e.v === 1).map((e) => e.t)).toEqual([100, 900, 1700])
  })
  it('real tCQ = 8：dec000 在 8T + 3·tCQ + tNOR = 834 ps 才升起，edge 9 抓到（T = 100 夠用）', () => {
    const r = simulate(ripple8Decode, 18, { period: T, delayMode: 'real', tcqOverride: 8 })
    const dec = trace(r, 'dec000')
    expect(dec.events.find((e) => e.t > 200 && e.v === 1)!.t).toBeCloseTo(800 + 3 * 8 + 10, 6)
    expect(trace(r, 'dec_s').events.filter((e) => e.v === 1).map((e) => e.t)).toEqual([108, 908, 1708])
    expect(detectRuntPulses([dec], T / 2)).toEqual([])
  })
  it('real tCQ = 20：011→100 經過 temporary 000，dec000 出現 20 ps glitch', () => {
    const r = simulate(ripple8Decode, 18, { period: T, delayMode: 'real', tcqOverride: 20 })
    const runts = detectRuntPulses([trace(r, 'dec000')], T / 2)
    expect(runts.every((p) => Math.abs(p.width - 20) < 1e-6)).toBe(true)
    // edge 4（t = 400）：q0↓ 420 → 010；q1↓ 440 → 000（temporary）；q2↑ 460 → 100；NOR 延遲 10
    expect(runts.some((p) => Math.abs(p.t0 - 450) < 1e-6 && Math.abs(p.t1 - 470) < 1e-6)).toBe(true)
  })
})

describe('ripple8Rise（練習：FF1 由 q0 rising 觸發）', () => {
  it('state 序列 011,010,101,100,111,110,001,000；仍是 /8', () => {
    const r = simulate(ripple8Rise, 20, { period: T })
    const seq = stateSequence(ripple8Rise, r.records)
    expect(seq.slice(0, 8)).toEqual(['011', '010', '101', '100', '111', '110', '001', '000'])
    expect(findPeriod(seq)).toEqual({ period: 8, start: 0 })
    const m2 = measureDivide(trace(r, 'q2'), T)
    expect(m2.ratio).toBe(8)
    expect(m2.duty).toBe(0.5)
    // q2 的第一個 rising edge 提前到 3T（原版 ripple8 是 4T）
    expect(m2.risingTimes[0]).toBe(300)
    const m1 = measureDivide(trace(r, 'q1'), T)
    expect(m1.ratio).toBe(4)
    expect(m1.risingTimes[0]).toBe(100)
  })
  it('3 個 edge 之後 state = 101', () => {
    const r = simulate(ripple8Rise, 3, { period: T })
    expect(r.sim.getStateString()).toBe('101')
  })
  it('讀成 (q2, q1, NOT q0) 就是 up count 2,3,4,5,6,7,0,1', () => {
    const r = simulate(ripple8Rise, 8, { period: T })
    const code = r.records.map((rec) => (rec.stateAfter.q2 << 2) | (rec.stateAfter.q1 << 1) | (rec.stateAfter.q0 ? 0 : 1))
    expect(code).toEqual([2, 3, 4, 5, 6, 7, 0, 1])
  })
  it('real delay：q1 在 edge 1 之後 2 × tCQ 就升起', () => {
    const r = simulate(ripple8Rise, 4, { period: T, delayMode: 'real' })
    expect(trace(r, 'q1').events.find((e) => e.v === 1)!.t).toBeCloseTo(T + 16, 6)
  })
})

describe('ripple8AllRise（三級全 rising = down counter）', () => {
  it('111,110,…,000 循環，q2 仍是 /8', () => {
    const r = simulate(ripple8AllRise, 24, { period: T })
    const seq = stateSequence(ripple8AllRise, r.records)
    expect(seq.slice(0, 8)).toEqual(['111', '110', '101', '100', '011', '010', '001', '000'])
    expect(findPeriod(seq)).toEqual({ period: 8, start: 0 })
    const m = measureDivide(trace(r, 'q2'), T)
    expect(m.ratio).toBe(8)
    // 三級都在 edge 1 同時翻成 1：q2 的第一個 rising edge 在 1T
    expect(m.risingTimes[0]).toBe(100)
  })
})

// ---------------------------------------------------------------- Lesson 1-3：synchronous
describe('sync4（課文逐 edge 表）', () => {
  it('state 序列 01→10→11→00，d1 依序 0,1,1,0', () => {
    const r = simulate(sync4, 8, { period: T })
    expect(stateSequence(sync4, r.records).slice(0, 4)).toEqual(['01', '10', '11', '00'])
    expect(r.records.slice(0, 4).map((rec) => rec.combBefore.d1)).toEqual([0, 1, 1, 0])
    expect(r.records.slice(0, 4).map((rec) => rec.combBefore.d0)).toEqual([1, 0, 1, 0])
    expect(r.records.slice(0, 4).map((rec) => rec.output)).toEqual([0, 1, 1, 0])
  })
  it('q1 是 /4、duty 50%；3 個 edge 後 state = 11（quiz）', () => {
    const r = simulate(sync4, 16, { period: T })
    const m = measureDivide(trace(r, 'q1'), T)
    expect(m.ratio).toBe(4)
    expect(m.duty).toBe(0.5)
    expect(stateSequence(sync4, r.records)[2]).toBe('11')
  })
  it('state graph：四個 state 都在主循環，沒有 lock-up', () => {
    const g = buildStateGraph(sync4, {})
    expect(g.mainCycle).toEqual(['00', '01', '10', '11'])
    expect(g.lockup).toEqual([])
    expect(g.nodes.map((n) => [n.state, n.next])).toEqual([
      ['00', '01'],
      ['01', '10'],
      ['10', '11'],
      ['11', '00'],
    ])
  })
  it('real delay：q0 與 q1 都在 edge + tCQ 同時改變；d1 在 edge + tCQ + tXOR 才更新', () => {
    const r = simulate(sync4, 6, { period: T, delayMode: 'real' })
    expect(trace(r, 'q0').events.slice(1, 3).map((e) => e.t)).toEqual([108, 208])
    expect(trace(r, 'q1').events.slice(1, 3).map((e) => e.t)).toEqual([208, 408])
    expect(trace(r, 'd1').events[1].t).toBe(100 + 8 + 12)
  })
})

describe('sync4Decode：同步 counter 的 decode 沒有 temporary-state glitch', () => {
  it('real delay，任意 tCQ 都沒有 runt', () => {
    for (const tcq of [4, 8, 20, 30]) {
      const r = simulate(sync4Decode, 12, { period: T, delayMode: 'real', tcqOverride: tcq })
      expect(detectRuntPulses([trace(r, 'dec00')], T / 2)).toEqual([])
    }
    const r = simulate(sync4Decode, 16, { period: T })
    expect(measureDivide(trace(r, 'q1'), T).ratio).toBe(4)
    expect(measureDivide(trace(r, 'dec00'), T).ratio).toBe(4)
  })
})

describe('sync8（練習）', () => {
  it('binary up count，q2 是 /8；6 個 edge 後 state = 110', () => {
    const r = simulate(sync8, 20, { period: T })
    const seq = stateSequence(sync8, r.records)
    expect(seq.slice(0, 8)).toEqual(['001', '010', '011', '100', '101', '110', '111', '000'])
    expect(seq[5]).toBe('110')
    expect(measureDivide(trace(r, 'q2'), T).ratio).toBe(8)
    const g = buildStateGraph(sync8, {})
    expect(g.mainCycle.length).toBe(8)
    expect(g.lockup).toEqual([])
  })
  it('real delay：c1 = q1 AND q0 在 edge + tCQ + tAND，d2 再加 tXOR', () => {
    const r = simulate(sync8, 8, { period: T, delayMode: 'real' })
    expect(trace(r, 'c1').events[1]).toEqual({ t: 300 + 8 + 10, v: 1 })
    expect(trace(r, 'd2').events[1]).toEqual({ t: 300 + 8 + 10 + 12, v: 1 })
  })
})

// ---------------------------------------------------------------- timing scenario 數字（課文引用）
describe('timing scenarios', () => {
  it('ripple：FF0 loop slack +15、interface path slack −5（T = 40）', () => {
    const env = rippleTiming.env
    const p = (id: string) => rippleTiming.paths.find((x) => x.id === id)!
    expect(analyzeSetup(p('ff0-loop'), env).slack).toBe(15)
    expect(analyzeSetup(p('ff0-loop'), env).tclkMin).toBe(25)
    expect(analyzeSetup(p('ff1-loop'), env).available).toBe(80)
    const iface = analyzeSetup(p('chain-decode'), env)
    expect(iface.arrival).toBe(34)
    expect(iface.slack).toBe(-5)
    expect(iface.tclkMin).toBe(45)
    expect(analyzeHold(p('q0-decode'), env).arrival).toBe(11)
    expect(worstSetup(rippleTiming.paths, env)!.path.id).toBe('chain-decode')
  })
  it('sync4：XOR path 是 setup critical（slack 9），INV path slack 15，hold 9 ≥ 3', () => {
    const env = sync4Timing.env
    const p = (id: string) => sync4Timing.paths.find((x) => x.id === id)!
    expect(analyzeSetup(p('q0-inv-d0'), env).slack).toBe(15)
    expect(analyzeSetup(p('q0-xor-d1'), env).slack).toBe(9)
    expect(analyzeSetup(p('q0-xor-d1'), env).tclkMin).toBe(31)
    expect(analyzeSetup(p('q1-xor-d1'), env).slack).toBe(9)
    expect(analyzeHold(p('hold-q0-inv'), env).slack).toBe(6)
    expect(worstSetup(sync4Timing.paths, env)!.result.slack).toBe(9)
  })
  it('ripple (b) output latency = 3 × tCQ + t_wire = 27 ps (max) / 17 ps (min)（課文與 Explorer 的數字）', () => {
    const env = rippleTiming.env
    const out = rippleTiming.paths.find((x) => x.id === 'output-latency')!
    // CriticalPathExplorer 對 type === 'output' 直接印 analyzeSetup(...).arrival
    expect(out.type).toBe('output')
    expect(analyzeSetup(out, env).arrival).toBe(27)
    expect(analyzeHold(out, env).arrival).toBe(17)
    // 三級 tCQ 累積 24 ps，輸出走線 3 / 2 ps 是固定的尾巴
    const tcq = out.segments.filter((sg) => sg.kind === 'tcq')
    expect(tcq.length).toBe(3)
    expect(tcq.reduce((a, sg) => a + sg.max, 0)).toBe(24)
    expect(out.segments.find((sg) => sg.kind === 'wire')).toMatchObject({ min: 2, max: 3 })
  })
  it('sync4 hold vs skew：會吃到 skew 的是 XOR path（13 ps），INV loop 的 launch = capture 所以 skew 對它無效', () => {
    const env = sync4Timing.env
    const p = (id: string) => sync4Timing.paths.find((x) => x.id === id)!
    const xorPath = p('q0-xor-d1')
    // launch = FF0、capture = FF1 ⇒ skew 真的會進來
    expect([xorPath.launch.element, xorPath.capture.element]).toEqual(['ff0', 'ff1'])
    expect(analyzeHold(xorPath, env).arrival).toBe(13) // tCQ,min 5 + tXOR,min 8
    // hold slack = 13 − (thold 3 + skew) = 10 − skew：capture flop 晚到（skew > 0）才變緊
    for (const [skew, expected] of [
      [-6, 16],
      [0, 10],
      [6, 4],
      [10, 0],
      [12, -2],
    ] as const) {
      expect(analyzeHold(xorPath, { ...env, skew }).slack).toBe(expected)
    }
    // 同一個 skew 對 setup 的方向相反（FF1 晚到 ⇒ setup 變鬆）
    expect(analyzeSetup(xorPath, { ...env, skew: 3 }).slack).toBe(12)
    expect(analyzeHold(xorPath, { ...env, skew: 3 }).slack).toBe(7)
    // INV loop：launch 與 capture 都是 FF0，同一條 clk 分支 ⇒ 這條路徑的 skew 結構上恆為 0
    for (const id of ['q0-inv-d0', 'hold-q0-inv']) {
      expect(p(id).launch.element).toBe('ff0')
      expect(p(id).capture.element).toBe('ff0')
    }
    expect(analyzeHold(p('hold-q0-inv'), env).arrival).toBe(9) // 5 + 4：數字最小，但不怕 skew
  })
  it('sync8：AND → XOR2 path slack +9（T = 50）', () => {
    const env = sync8Timing.env
    const p = (id: string) => sync8Timing.paths.find((x) => x.id === id)!
    const crit = analyzeSetup(p('q0-and-xor2-d2'), env)
    expect(crit.arrival).toBe(30)
    expect(crit.required).toBe(39)
    expect(crit.slack).toBe(9)
    expect(analyzeSetup(p('q0-xor1-d1'), env).slack).toBe(19)
    expect(analyzeSetup(p('q2-xor2-d2'), env).slack).toBe(19)
    expect(analyzeSetup(p('q0-inv-d0'), env).slack).toBe(25)
    expect(worstSetup(sync8Timing.paths, env)!.path.id).toBe('q0-and-xor2-d2')
  })
})
