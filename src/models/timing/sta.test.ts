import { describe, expect, it } from 'vitest'
import { analyzeHold, analyzePulseWidth, analyzeSetup, tclkMin, worstHold, worstSetup } from './sta'
import type { TimingEnv, TimingPath } from './types'

const path: TimingPath = {
  id: 'p',
  name: 'Q → logic → D',
  type: 'setup',
  launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
  capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
  segments: [
    { id: 'tcq', label: 'tCQ', from: 'ff0/clk', to: 'ff0/q', kind: 'tcq', min: 5, max: 8 },
    { id: 'logic', label: 'logic', from: 'ff0/q', to: 'ff1/d', kind: 'logic', min: 12, max: 25 },
  ],
}

describe('STA', () => {
  it('Lesson 7-1 worked example: Tclk=50, tCQ=8, logic=25, tsetup=7, unc=4 → slack 6', () => {
    const r = analyzeSetup(path, { period: 50, skew: 0, jitter: 4, margin: 0 })
    expect(r.arrival).toBe(33)
    expect(r.required).toBe(39)
    expect(r.slack).toBe(6)
    expect(r.tclkMin).toBe(44)
  })
  it('positive skew relaxes setup and tightens hold', () => {
    const s0 = analyzeSetup(path, { period: 50, skew: 0, jitter: 4, margin: 0 })
    const s5 = analyzeSetup(path, { period: 50, skew: 5, jitter: 4, margin: 0 })
    expect(s5.slack - s0.slack).toBe(5)
    const h0 = analyzeHold(path, { period: 50, skew: 0, jitter: 4, margin: 0 })
    const h5 = analyzeHold(path, { period: 50, skew: 5, jitter: 4, margin: 0 })
    expect(h0.slack).toBe(17 - 3)
    expect(h5.slack).toBe(17 - 8)
  })
  it('multicycle doubles available time', () => {
    const r = analyzeSetup({ ...path, cycles: 2 }, { period: 50, skew: 0, jitter: 4, margin: 0 })
    expect(r.available).toBe(100)
    expect(r.slack).toBe(56)
  })
  it('rising→falling half-cycle path', () => {
    const r = analyzeSetup({ ...path, periodFraction: 0.5 }, { period: 50, skew: 0, jitter: 4, margin: 0 })
    expect(r.available).toBe(25)
    expect(r.slack).toBe(-19)
  })
  it('pulse width', () => {
    expect(analyzePulseWidth(12, 20).slack).toBe(-8)
    expect(analyzePulseWidth(30, 20).slack).toBe(10)
  })
  it('tclkMin helper', () => {
    expect(tclkMin({ tcq: 8, logic: 6, setup: 7, jitter: 4, margin: 2 })).toBe(27)
  })

  /**
   * Explorer 底部那行公式的恆等式：Tclk,min = (Σt_max + tsetup + jitter + margin − skew) / (N·f)。
   * 只要 cycles ≠ 1 或 periodFraction ≠ 1，分母就不能省略——省略的話公式與面板上的數字對不起來。
   */
  it('Tclk,min 的分母是 N·f（multicycle / half-cycle 不可省略）', () => {
    const env: TimingEnv = { period: 50, skew: 0, jitter: 4, margin: 0 }
    const numer = 33 + 7 + 4 + 0 // arrival 33 + tsetup 7 + jitter 4 + margin 0 − skew 0
    expect(analyzeSetup(path, env).tclkMin).toBe(numer / 1)
    expect(analyzeSetup({ ...path, cycles: 2 }, env).tclkMin).toBe(numer / 2)
    expect(analyzeSetup({ ...path, cycles: 8 }, env).tclkMin).toBe(numer / 8)
    expect(analyzeSetup({ ...path, periodFraction: 0.5 }, env).tclkMin).toBe(numer / 0.5)
    expect(analyzeSetup({ ...path, periodFraction: 3 / 8 }, env).tclkMin).toBeCloseTo(numer / (3 / 8), 9)
    expect(analyzeSetup({ ...path, cycles: 2, periodFraction: 0.5 }, env).tclkMin).toBe(numer / 1)
    // skew 進分子（正 skew 讓 Tclk,min 變小）
    expect(analyzeSetup({ ...path, cycles: 2 }, { ...env, skew: 6 }).tclkMin).toBe((numer - 6) / 2)
  })
})

/**
 * worstSetup / worstHold 的候選集合必須對稱。
 * multicycle 與 interface 只是「setup 的可用時間被重新宣告」；hold 是同一個 edge 的 0-cycle 檢查，
 * 完全不受 setup exception 影響，所以它們一定要留在 worstHold 的候選裡。
 */
describe('worstSetup / worstHold 的候選集合', () => {
  const env: TimingEnv = { period: 1000, skew: 0, jitter: 0, margin: 0 }
  const mk = (id: string, type: TimingPath['type'], min: number, max: number, hold: number, cycles?: number): TimingPath => ({
    id,
    name: id,
    type,
    cycles,
    launch: { element: 'a', edge: 'rising', clock: 'clk' },
    capture: { element: 'b', edge: 'rising', clock: 'clk', setup: 7, hold },
    segments: [{ id: 'd', label: 'd', from: 'a', to: 'b', kind: 'logic', min, max }],
  })
  // 模仿案例 F：interface 的 hold slack(15) 比 setup 的(20) 還小，但 setup slack 反而最寬鬆
  const setupP = mk('int-fmax', 'setup', 23, 38, 3)
  const ifaceP = mk('iface', 'interface', 23, 40, 8, 8)
  const mcP = mk('loop', 'multicycle', 163, 275, 3, 8)
  const outP = mk('gen-clk', 'output', 31, 45, 0)
  const asyncP = mk('p-ctrl', 'async', 1, 25, 3)
  const paths = [setupP, ifaceP, mcP, outP, asyncP]

  it('hold slack 由 interface path 決定（15 < 20 < 160）', () => {
    expect(analyzeHold(setupP, env).slack).toBe(20)
    expect(analyzeHold(ifaceP, env).slack).toBe(15)
    expect(analyzeHold(mcP, env).slack).toBe(160)
    expect(worstHold(paths, env)!.path.id).toBe('iface')
    expect(worstHold(paths, env)!.result.slack).toBe(15)
  })
  it('output / async 兩邊都不算（沒有 capture flop / 沒有 launch edge）', () => {
    expect(worstSetup([outP, asyncP], env)).toBeNull()
    expect(worstHold([outP, asyncP], env)).toBeNull()
  })
  it('worstSetup 也把 multicycle 與 interface 算進候選', () => {
    // 這組數字裡 setup path 的 slack 最小（1 T 可用），但 multicycle / interface 一樣是候選
    expect(worstSetup(paths, env)!.path.id).toBe('int-fmax')
    expect(worstSetup([ifaceP], env)!.path.id).toBe('iface')
    expect(worstSetup([mcP], env)!.path.id).toBe('loop')
  })
})
