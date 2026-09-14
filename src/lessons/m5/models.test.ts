import { describe, expect, it } from 'vitest'
import { simulate } from '@/models/divider/engine'
import { measureDivide } from '@/models/divider/analysis'
import { PHASES, arch3Edges, arch3Script, firstRunt, levelIntervals, pmuxDiv4, pmuxDiv4Sel0, pmuxDiv4Sel3, pmuxDualMod23, pmuxDualMod23Safe, safeWindows, selBits } from './models'
import { muxSwitchOutput, rotatingEdges } from '@/models/phase/pmux'
import type { Bit } from '@/models/divider/types'

const T = 100

describe('Lesson 5-1：PMUX → /4，選 phase 只平移相位、不改除數', () => {
  it('每個 sel 的除數都是 4', () => {
    for (let sel = 0; sel < PHASES; sel++) {
      const nl = pmuxDiv4(sel)
      const { traces } = simulate(nl, 20, { period: T })
      expect(measureDivide(traces.find((t) => t.name === nl.output)!, T).ratio, `sel=${sel}`).toBe(4)
    }
  })

  it('sel = 3 的 output edge 比 sel = 0 晚 3/8 個 Tvco（課文數字 0.375 T）', () => {
    const r0 = simulate(pmuxDiv4Sel0, 20, { period: T })
    const r3 = simulate(pmuxDiv4Sel3, 20, { period: T })
    const t0 = measureDivide(r0.traces.find((t) => t.name === pmuxDiv4Sel0.output)!, T).risingTimes
    const t3 = measureDivide(r3.traces.find((t) => t.name === pmuxDiv4Sel3.output)!, T).risingTimes
    for (let i = 0; i < 3; i++) expect(t3[i] - t0[i]).toBeCloseTo((3 / 8) * T, 9)
  })

  it('selBits 把 index 轉成 3 個 bit（LSB first）', () => {
    expect(selBits(0)).toEqual({ s0: 0, s1: 0, s2: 0 })
    expect(selBits(3)).toEqual({ s0: 1, s1: 1, s2: 0 })
    expect(selBits(7)).toEqual({ s0: 1, s1: 1, s2: 1 })
  })
})

describe('Lesson 5-3：PMUX → /N/N+1（架構 2）', () => {
  for (const [name, nl] of [
    ['combinational select', pmuxDualMod23],
    ['glitch-free select', pmuxDualMod23Safe],
  ] as const) {
    it(`${name}：mod = 0 → /2，mod = 1 → /3`, () => {
      const r0 = simulate(nl, 24, { period: T }, () => ({ mod: 0, s0: 0, s1: 0, s2: 0 }))
      const r1 = simulate(nl, 24, { period: T }, () => ({ mod: 1, s0: 0, s1: 0, s2: 0 }))
      expect(measureDivide(r0.traces.find((t) => t.name === nl.output)!, T).ratio).toBe(2)
      expect(measureDivide(r1.traces.find((t) => t.name === nl.output)!, T).ratio).toBe(3)
    })
  }
})

describe('Lesson 5-2：safe switching window', () => {
  it('相鄰 phase（k = 1）有兩段安全區，各 0.375 Tvco', () => {
    const w = safeWindows(8, 1)
    expect(w.high).toEqual([0.125, 0.5])
    expect(w.low).toEqual([0.625, 1])
    expect(w.widthEach).toBeCloseTo(0.375, 9)
    expect(w.total).toBeCloseTo(0.75, 9)
  })

  it('反相的 phase（k = 4）完全沒有安全區——課文的「window 寬度 0」', () => {
    const w = safeWindows(8, 4)
    expect(w.high).toBeNull()
    expect(w.low).toBeNull()
    expect(w.total).toBe(0)
  })

  it('window 隨 k 變窄：k 越大安全區越小，k = 4 歸零', () => {
    const widths = [1, 2, 3, 4].map((k) => safeWindows(8, k).total)
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeLessThan(widths[i - 1])
    expect(widths[3]).toBe(0)
  })

  it('levelIntervals 標出兩條 phase 同電位的區間', () => {
    const iv = levelIntervals(8, 0, 1, 2)
    expect(iv.length).toBeGreaterThan(0)
    for (const s of iv) expect(s.t1).toBeGreaterThan(s.t0)
  })
})

describe('Lesson 5-3：架構 3（/N/N+1 → PMUX）的 edge 時間', () => {
  it('phase rotation 會產生非整數的 output interval（相位被搬動）', () => {
    const r = arch3Edges(arch3Script)
    expect(r.times.length).toBe(arch3Script.length)
    // 至少一個 interval 不是整數 ⇒ 相位確實被 PMUX 搬動，而不只是整數除頻
    expect(r.intervals.some((x) => !Number.isInteger(x))).toBe(true)
    // 時間必須單調遞增（不可以出現 edge 倒退）
    for (let i = 1; i < r.times.length; i++) expect(r.times[i]).toBeGreaterThan(r.times[i - 1])
  })
})

// ---------------------------------------------------------------- Lesson 5-1：wrap 漏掉 carry 的偏差是 k/M，不是 1/N
describe('Lesson 5-1：忘記 integer carry 時平均除數偏 k/M', () => {
  it('N = 4、k = 1、M = 8（課文正文）：正確 4.125、漏 carry 4.000，偏 1/8 = k/M ≠ 1/N = 0.25', () => {
    const { times, carries } = rotatingEdges(4, 1, 8, 9)
    expect(times[8] - times[0]).toBeCloseTo(33, 9) // 8 個 output 週期
    expect((times[8] - times[0]) / 8).toBeCloseTo(4.125, 9)
    expect(carries.slice(0, 8).reduce((a, c) => a + c, 0)).toBe(1) // 8 個週期只 wrap 一次
    const wrong = (33 - 1) / 8 // 漏掉那一次 carry
    expect(wrong).toBeCloseTo(4.0, 9)
    expect(4.125 - wrong).toBeCloseTo(1 / 8, 9) // = k/M
    expect(4.125 - wrong).not.toBeCloseTo(1 / 4, 6) // ≠ 1/N
  })
  it('N = 4、k = 2、M = 8（本課練習）：k/M = 1/N = 0.25，所以這個例子看不出兩者的差別', () => {
    const { times, carries } = rotatingEdges(4, 2, 8, 5)
    expect(times.slice(0, 5)).toEqual([0, 4.25, 8.5, 12.75, 17])
    expect(carries.slice(0, 4).reduce((a, c) => a + c, 0)).toBe(1)
    expect((17 - 1) / 4).toBeCloseTo(4.0, 9)
    expect(4.25 - 4.0).toBeCloseTo(2 / 8, 9)
    expect(2 / 8).toBeCloseTo(1 / 4, 9)
  })
})

// ---------------------------------------------------------------- Lesson 5-2：切在 danger zone 會讓那一個 pclk 週期塌陷
describe('Lesson 5-2：danger zone 的 double edge 會吃掉 divider 內部 path 那一個 cycle', () => {
  const pclkRising = (sel: number) => {
    const b = selBits(sel)
    const { traces } = simulate(pmuxDualMod23, 12, { period: T, inputLead: 0.5 }, (e) => (e >= 4 ? { s0: b.s0, s1: b.s1, s2: b.s2 } : {}))
    const ev = traces.find((t) => t.name === 'pclk')!.events
    const rising: number[] = []
    let prev: Bit | undefined
    for (const e of ev) {
      if (prev === 0 && e.v === 1) rising.push(e.t)
      prev = e.v
    }
    return rising
  }
  it('select 0 → 1 切在 3.5 T（紅區）：pclk rising 3.0 / 3.5 / 4.125 T，中間那個 cycle 只剩 0.5 T', () => {
    const r = pclkRising(1)
    expect(r.slice(0, 5)).toEqual([100, 200, 300, 350, 412.5])
    expect(r[3] - r[2]).toBe(0.5 * T) // 標稱 1 T，被壓到一半
  })
  it('select 0 → 7 切在 3.5 T（都 low 的安全窗）：沒有多出 edge，backward −1 乾淨，間隔 0.875 T', () => {
    const r = pclkRising(7)
    expect(r.slice(0, 4)).toEqual([100, 200, 300, 387.5])
    expect(r[3] - r[2]).toBeCloseTo(0.875 * T, 9) // 1 − 1/8 T：combinational MUX 做得到 backward
  })
})

// ---------------------------------------------------------------- Lesson 5-2：muxSwitchOutput 的 runt 寬度
describe('Lesson 5-2：runt 的兩段寬度與 widget 的判決一致', () => {
  it('ph0 → ph1 切在 1.55 T：低電位 0.05 T、高電位 0.075 T，firstRunt 先報 0.05 T 那一段', () => {
    const r = muxSwitchOutput(8, 0, 1, 1.55, 3, 0.2)
    const ev = r.events
    const seg = (t0: number) => {
      const i = ev.findIndex((e) => Math.abs(e.t - t0) < 1e-9)
      return { width: ev[i + 1].t - ev[i].t, level: ev[i].v }
    }
    expect(seg(1.5)).toMatchObject({ level: 0 })
    expect(seg(1.5).width).toBeCloseTo(0.05, 9)
    expect(seg(1.55)).toMatchObject({ level: 1 })
    expect(seg(1.55).width).toBeCloseTo(0.075, 9)
    const fr = firstRunt(ev, 0.2)!
    expect(fr.level).toBe(0)
    expect(fr.width).toBeCloseTo(0.05, 9)
    expect(r.runt!.t0).toBeCloseTo(1.5, 9) // muxSwitchOutput 與 firstRunt 指到同一段
  })
  it('ph1 → ph5 切在 1.375 T：1.375 T 是 falling edge，多出來的 rising edge 在 1.625 T', () => {
    const sw = muxSwitchOutput(8, 1, 5, 1.375, 3, 0.2)
    const at = (t: number) => sw.events.find((e) => Math.abs(e.t - t) < 1e-9)
    expect(at(1.375)!.v).toBe(0) // falling
    expect(at(1.625)!.v).toBe(1) // 多出來的 rising
    const rising = (evs: { t: number; v: 0 | 1 }[]) => evs.filter((e) => e.v === 1 && e.t >= 1 && e.t < 2).map((e) => e.t)
    expect(rising(sw.events)).toEqual([1.125, 1.625])
    expect(rising(muxSwitchOutput(8, 1, 1, 1.375, 3, 0.2).events)).toEqual([1.125])
    // 兩段 partial pulse 各 0.25 T：以 tpw,min = 0.2 T 來看沒有 runt，但相位已經跳掉
    expect(firstRunt(sw.events, 0.2)).toBeNull()
    expect(sw.runt).toBeNull()
  })
})

// ---------------------------------------------------------------- Lesson 5-3：架構 3 的 select window 公式
describe('Lesson 5-3：架構 3 的 select window = N·T − 7/8 T − W', () => {
  const windowWidth = (N: number, W: number, M = 8) => N - (M - 1) / M - W
  it('N = 3、W = 1 T ⇒ 1.125 T（課文 line 104 的例子）', () => {
    expect(windowWidth(3, 1)).toBeCloseTo(1.125, 9)
  })
  it('50% duty（W = N·T/2）時才化簡成 N·T/2 − 7/8 T；直接寫 N·T/2 − 7/8 T − W 會是負的', () => {
    const N = 3
    const W = N / 2
    expect(windowWidth(N, W)).toBeCloseTo(N / 2 - 7 / 8, 9)
    expect(N / 2 - 7 / 8 - 1).toBeLessThan(0) // 舊表格式子代 N = 3、W = 1 T ⇒ −0.375
  })
})
