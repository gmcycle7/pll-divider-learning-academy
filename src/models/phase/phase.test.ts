import { describe, expect, it } from 'vitest'
import { rotate, rotatingEdges, muxSwitchOutput } from './pmux'
import { splitCode, accumulate, dtcStep } from './dtc'

describe('phase rotation', () => {
  it('forward wrap 7→0 produces carry +1', () => {
    const r = rotate({ index: 7, carry: 0 }, 8, 1)
    expect(r.state.index).toBe(0)
    expect(r.step.wrapped).toBe(true)
    expect(r.step.carry).toBe(1)
  })
  it('backward wrap 0→7 produces carry −1', () => {
    const r = rotate({ index: 0, carry: 0 }, 8, -1)
    expect(r.state.index).toBe(7)
    expect(r.step.carry).toBe(-1)
  })
  it('rotating by 1 phase per output cycle gives average N + 1/8', () => {
    const { times } = rotatingEdges(4, 1, 8, 17)
    const total = times[16] - times[0]
    expect(total / 16).toBeCloseTo(4 + 1 / 8, 9)
  })
  it('mux switch in the middle of a high phase creates a runt', () => {
    // phase 0 high on [n, n+0.5); phase 4 high on [n+0.5, n+1)
    // switching at t=2.45 from phase 0 (high) to phase 4 (low) → high pulse 2.0..2.45 ok, but at 2.5 phase 4 goes high → low pulse 0.05 → runt
    const r = muxSwitchOutput(8, 0, 4, 2.45, 6, 0.2)
    expect(r.runt).not.toBeNull()
    const safe = muxSwitchOutput(8, 0, 1, 2.75, 6, 0.2)
    expect(safe.runt).toBeNull()
  })
  it('runt 掃描要跳過 t = 0 起算的起始殘段（a > 0 時它寬 a/M，不是切換造成的 pulse）', () => {
    // ph1 在第一個週期要到 0.125 T 才升起：out[0] = {0, 0}、out[1] = {0.125, 1}
    const r = muxSwitchOutput(8, 1, 5, 1.375, 3, 0.2)
    expect(r.events[0]).toEqual({ t: 0, v: 0 })
    expect(r.events[1].t).toBeCloseTo(0.125, 9)
    expect(r.events[1].t - r.events[0].t).toBeLessThan(0.2) // 比 minPulse 窄，但不是 runt
    expect(r.runt).toBeNull()
    // 真正的 runt 仍然抓得到，而且回傳的是切換造成的那一段
    const bad = muxSwitchOutput(8, 0, 1, 1.55, 3, 0.2)
    expect(bad.runt).not.toBeNull()
    expect(bad.runt!.t0).toBeCloseTo(1.5, 9)
    expect(bad.runt!.width).toBeCloseTo(0.05, 9)
  })
})

describe('DTC code split', () => {
  const cfg = { coarseBits: 3, fineBits: 6 }
  it('splits 9-bit code into coarse and fine', () => {
    expect(splitCode(0, cfg)).toMatchObject({ coarse: 0, fine: 0, overflow: 0 })
    expect(splitCode(63, cfg)).toMatchObject({ coarse: 0, fine: 63 })
    expect(splitCode(64, cfg)).toMatchObject({ coarse: 1, fine: 0 })
    expect(splitCode(511, cfg)).toMatchObject({ coarse: 7, fine: 63 })
    expect(splitCode(512, cfg)).toMatchObject({ coarse: 0, fine: 0, overflow: 1 })
  })
  it('accumulating 100 per step generates fine carry and eventual coarse wrap', () => {
    const s = accumulate(100, cfg, 6)
    expect(s[0]).toMatchObject({ coarse: 1, fine: 36, fineCarry: 1 })
    expect(s.some((x) => x.coarseCarry === 1)).toBe(true)
    expect(dtcStep(cfg)).toBeCloseTo(1 / 512)
  })
})
