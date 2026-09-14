import { describe, expect, it } from 'vitest'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, detectRuntPulses, measureDivide, stateSequence } from '@/models/divider/analysis'
import { tff } from '@/models/divider/examples'
import { buildEdgeExerciseTraces, div2Duty30, div2Duty70, edgesOf, invChain3, latchDiv, mixedFsm, ringOsc3, singleInv } from './models'

const T = 100

describe('Lesson 0-1：輸入 duty 不影響 /2 的輸出', () => {
  for (const [name, nl, inDuty] of [
    ['duty 30%', div2Duty30, 0.3],
    ['duty 70%', div2Duty70, 0.7],
  ] as const) {
    it(`${name} 的輸入仍然得到 /2、輸出 duty 50%`, () => {
      const { traces } = simulate(nl, 10, { period: T })
      const m = measureDivide(traces.find((t) => t.name === nl.output)!, T)
      expect(m.ratio).toBe(2)
      expect(m.duty).toBe(0.5)
      // 輸入本身的 duty 確實不是 50%，證明兩者無關
      expect(nl.clocks[0].duty).toBe(inDuty)
    })
  }
})

describe('Lesson 0-2：combinational 沒有 state', () => {
  it('singleInv 與 invChain3 都沒有任何 memory element', () => {
    for (const nl of [singleInv, invChain3]) {
      expect(nl.flops.length).toBe(0)
      expect(nl.latches ?? []).toEqual([])
      expect(nl.stateOrder).toEqual([])
    }
  })

  it('invChain3：延遲沿路徑累積，out 比 a 晚 3 × tpd = 30 ps（課文數字）', () => {
    const { traces } = simulate(invChain3, 4, { period: T, delayMode: 'real' }, (e) => (e === 2 ? { a: 1 } : {}))
    const at = traces.find((t) => t.name === 'a')!.events.find((e) => e.t > 0 && e.v === 1)!.t
    const b = traces.find((t) => t.name === 'b')!.events.find((e) => e.t > at)!.t
    const c = traces.find((t) => t.name === 'c')!.events.find((e) => e.t > at)!.t
    const out = traces.find((t) => t.name === 'out')!.events.find((e) => e.t > at)!.t
    expect(b - at).toBe(10)
    expect(c - at).toBe(20)
    expect(out - at).toBe(30)
  })
})

describe('Lesson 0-2：純組合回授不是 divider', () => {
  it('latchDiv：clk = 1 期間 transparent latch 反覆振盪，產生一連串 runt', () => {
    const { traces } = simulate(latchDiv, 4, { period: T, delayMode: 'real' })
    const q0 = traces.find((t) => t.name === 'q0')!
    const runts = detectRuntPulses([q0], 20)
    expect(runts.length).toBeGreaterThan(8)
    // 每次翻轉相隔 latch delay 5 + INV delay 6 = 11 ps
    const flips = q0.events.filter((e) => e.t > 0).slice(0, 5).map((e) => e.t)
    for (let i = 1; i < flips.length; i++) expect(flips[i] - flips[i - 1]).toBe(11)
  })

  it('ringOsc3：kick 放開後自由振盪，週期由 gate delay 決定而非 clock', () => {
    const { traces } = simulate(ringOsc3, 4, { period: T, delayMode: 'real' }, (e) => (e === 1 ? { kick: 0 } : {}))
    const a = traces.find((t) => t.name === 'a')!.events.filter((e) => e.t > 100).map((e) => e.t)
    // 每次翻轉相隔 3 級 × 15 ps = 45 ps（課文數字）；一個完整週期 90 ps
    for (let i = 1; i < Math.min(6, a.length); i++) expect(a[i] - a[i - 1]).toBe(45)
    // 45 ps 與 clock 週期 100 ps 沒有整數關係 ⇒ 沒有任何 edge 與 clock 對齊
    expect(T % 45).not.toBe(0)
  })
})

describe('Lesson 0-2 練習：mixedFsm', () => {
  it('en = 1 時走遍 4 個 state：00 → 10 → 11 → 01 → 00', () => {
    const g = buildStateGraph(mixedFsm, { en: 1 })
    expect(g.mainCycle).toEqual(['00', '10', '11', '01'])
    expect(g.lockup).toEqual([])
    const { records } = simulate(mixedFsm, 9, { period: T }, () => ({ en: 1 }))
    expect(stateSequence(mixedFsm, records).slice(0, 8)).toEqual(['10', '11', '01', '00', '10', '11', '01', '00'])
  })

  it('en = 0 時停在 00（FF1 永遠不會被設為 1）', () => {
    expect(buildStateGraph(mixedFsm, { en: 0 }).mainCycle).toEqual(['00'])
  })

  it('flag 是組合輸出，不是 state bit', () => {
    expect(mixedFsm.stateOrder).toEqual(['q1', 'q0'])
    expect(mixedFsm.gates.some((g) => g.out === 'flag')).toBe(true)
    expect(mixedFsm.flops.some((f) => f.q === 'flag')).toBe(false)
  })
})

describe('Lesson 0-1 練習波形：a / b 對齊哪一種 edge（課文解答的每個時間點）', () => {
  const { clk, a, b } = buildEdgeExerciseTraces(T)
  const clkEdges = edgesOf(clk)

  it('clk 的第一個 rising edge 在 t = T；falling edge 在 1.5T、2.5T、3.5T…，沒有 0.5T 這個 edge', () => {
    const rising = clkEdges.filter((e) => e.type === 'rising').map((e) => e.t)
    const falling = clkEdges.filter((e) => e.type === 'falling').map((e) => e.t)
    expect(rising.slice(0, 3)).toEqual([T, 2 * T, 3 * T])
    expect(falling.slice(0, 3)).toEqual([1.5 * T, 2.5 * T, 3.5 * T])
    // t = 0 只是初始電位（0），不是 edge；0.5T 更沒有任何 edge
    expect(clkEdges.some((e) => e.t === 0)).toBe(false)
    expect(clkEdges.some((e) => e.t === 0.5 * T)).toBe(false)
    expect(clk.events[0]).toEqual({ t: 0, v: 0 })
  })

  it('a 只在 falling edge 改變（1.5T、2.5T、3.5T…），週期 2T', () => {
    const fallingSet = new Set(clkEdges.filter((e) => e.type === 'falling').map((e) => e.t))
    const aChanges = a.events.filter((e) => e.t > 0).map((e) => e.t)
    expect(aChanges.slice(0, 3)).toEqual([1.5 * T, 2.5 * T, 3.5 * T])
    expect(aChanges.every((t) => fallingSet.has(t))).toBe(true)
    const aRises = edgesOf(a).filter((e) => e.type === 'rising').map((e) => e.t)
    expect(aRises[1] - aRises[0]).toBe(2 * T)
  })

  it('b 只在 rising edge 改變（T、3T、5T），週期 4T', () => {
    const risingSet = new Set(clkEdges.filter((e) => e.type === 'rising').map((e) => e.t))
    const bChanges = b.events.filter((e) => e.t > 0).map((e) => e.t)
    expect(bChanges).toEqual([T, 3 * T, 5 * T])
    expect(bChanges.every((t) => risingSet.has(t))).toBe(true)
    const bRises = edgesOf(b).filter((e) => e.type === 'rising').map((e) => e.t)
    expect(bRises[1] - bRises[0]).toBe(4 * T)
  })
})

describe('Lesson 0-3 練習：T flip-flop 的 tCQ 與 d 的更新時間（要在「實際 delay」模式才量得到）', () => {
  it('real 模式：q 在 edge + tCQ = 8 ps，d 在 edge + tCQ + tXOR = 20 ps', () => {
    const { traces } = simulate(tff, 5, { period: T, delayMode: 'real' })
    const q = traces.find((t) => t.name === 'q')!
    const d = traces.find((t) => t.name === 'd')!
    expect(q.events.filter((e) => e.t > 0).slice(0, 3).map((e) => e.t)).toEqual([108, 208, 308])
    expect(d.events.filter((e) => e.t > 0).slice(0, 3).map((e) => e.t)).toEqual([120, 220, 320])
    expect(tff.gates.find((g) => g.out === 'd')!.delay).toBe(12)
  })

  it('ideal 模式：所有訊號貼齊 edge，量不到 tCQ（所以練習面板必須開 showDelayMode）', () => {
    const { traces } = simulate(tff, 5, { period: T })
    const q = traces.find((t) => t.name === 'q')!
    expect(q.events.filter((e) => e.t > 0).slice(0, 3).map((e) => e.t)).toEqual([100, 200, 300])
  })
})
