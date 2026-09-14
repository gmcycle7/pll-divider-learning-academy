import { describe, expect, it } from 'vitest'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, findPeriod, measureDivide, nextStateOf, stateSequence, detectRuntPulses } from '@/models/divider/analysis'
import { allStates } from '@/utils/bits'
import { JOHNSON56_CYCLE, JOHNSON56_SPEC, johnson56, johnson56SelfRecover } from './models'

const T = 100

describe('Assessment /5 /6 Johnson-type dual-modulus divider', () => {
  it('mod=0: state sequence 000→001→011→111→110→000 (period 5)', () => {
    const { records } = simulate(johnson56, 15, { period: T }, () => ({ mod: 0 }))
    const seq = stateSequence(johnson56, records)
    // records 記錄的是每個 edge 之後的 state：第 1 個 edge 後 = 001
    expect(seq.slice(0, 10)).toEqual(['001', '011', '111', '110', '000', '001', '011', '111', '110', '000'])
    expect(findPeriod(seq)).toEqual({ period: 5, start: 0 })
  })

  it('mod=1: state sequence 000→001→011→111→110→100→000 (period 6)', () => {
    const { records } = simulate(johnson56, 18, { period: T }, () => ({ mod: 1 }))
    const seq = stateSequence(johnson56, records)
    expect(seq.slice(0, 12)).toEqual(['001', '011', '111', '110', '100', '000', '001', '011', '111', '110', '100', '000'])
    expect(findPeriod(seq)).toEqual({ period: 6, start: 0 })
  })

  it('divide ratio 5 with 40% duty (mod=0) and 6 with 50% duty (mod=1)', () => {
    for (const mod of [0, 1] as const) {
      const { traces } = simulate(johnson56, 40, { period: T }, () => ({ mod }))
      const out = traces.find((t) => t.name === 'div_out')!
      const m = measureDivide(out, T)
      expect(m.ratio, `mod=${mod}`).toBe(JOHNSON56_SPEC.ratio[mod])
      expect(m.duty, `mod=${mod}`).toBeCloseTo(JOHNSON56_SPEC.duty[mod], 6)
      expect(m.periodic).toBe(true)
    }
  })

  it('output is q2 itself: every output edge coincides with a state edge (no decode glitch)', () => {
    const { traces } = simulate(johnson56, 30, { period: T, delayMode: 'real' }, (k) => ({ mod: k % 11 < 5 ? 0 : 1 }))
    // 用 real delay 跑，輸出不應該有比 tCQ 更窄的 pulse
    expect(detectRuntPulses(traces.filter((t) => t.name === 'div_out'), 50)).toEqual([])
    const out = traces.find((t) => t.name === 'div_out')!
    const q2 = traces.find((t) => t.name === 'q2')!
    expect(out.events.map((e) => [e.t, e.v])).toEqual(q2.events.map((e) => [e.t, e.v]))
  })

  it('next-state equations: mod only enters d2 when q1=1 and q0=0 (states 110 and unused 010)', () => {
    for (const s of allStates(3)) {
      const n0 = nextStateOf(johnson56, s, { mod: 0 }).next
      const n1 = nextStateOf(johnson56, s, { mod: 1 }).next
      const q1 = s[1] === '1'
      const q0 = s[2] === '1'
      if (q1 && !q0) {
        // d2 = q1·(q0+mod) = mod ⇒ 兩種 mod 的 next state 只差在 MSB
        expect(n0[0]).toBe('0')
        expect(n1[0]).toBe('1')
        expect(n0.slice(1)).toBe(n1.slice(1))
      } else {
        expect(n0, `state ${s}`).toBe(n1)
      }
    }
    expect(nextStateOf(johnson56, JOHNSON56_SPEC.modSampledInState, { mod: 0 }).next).toBe('000')
    expect(nextStateOf(johnson56, JOHNSON56_SPEC.modSampledInState, { mod: 1 }).next).toBe('100')
    // 主循環的每一步
    for (const mod of [0, 1] as const) {
      const cyc = JOHNSON56_CYCLE[mod]
      cyc.forEach((s, i) => {
        expect(nextStateOf(johnson56, s, { mod }).next, `mod=${mod} ${s}`).toBe(cyc[(i + 1) % cyc.length])
      })
    }
  })

  it('state graph: mod=0 self-recovers from all unused states; mod=1 has a 010↔101 lock-up loop', () => {
    const g0 = buildStateGraph(johnson56, { mod: 0 })
    expect(g0.mainCycle).toEqual(JOHNSON56_CYCLE[0])
    expect(g0.lockup).toEqual([])
    const steps0 = Object.fromEntries(g0.nodes.map((n) => [n.state, n.stepsToCycle]))
    expect(steps0['010']).toBe(1) // 010 → 001
    expect(steps0['100']).toBe(1) // 100 → 000
    expect(steps0['101']).toBe(2) // 101 → 010 → 001

    const g1 = buildStateGraph(johnson56, { mod: 1 })
    expect(g1.mainCycle).toEqual(JOHNSON56_CYCLE[1])
    expect(g1.lockup.sort()).toEqual(['010', '101'])
    expect(g1.nodes.find((n) => n.state === '010')!.next).toBe('101')
    expect(g1.nodes.find((n) => n.state === '101')!.next).toBe('010')
  })

  it('starting in 010 without reset: mod=1 never reaches the main cycle, mod=0 recovers in one edge', () => {
    const bad = simulate(johnson56, 12, { period: T, initialState: { q2: 0, q1: 1, q0: 0 } }, () => ({ mod: 1 }))
    const seq = stateSequence(johnson56, bad.records)
    expect(seq).toEqual(['101', '010', '101', '010', '101', '010', '101', '010', '101', '010', '101', '010'])
    expect(measureDivide(bad.traces.find((t) => t.name === 'div_out')!, T).ratio).toBe(2) // q2 每 2 個 edge 翻一次：看起來像 /2，其實是 lock-up
    const ok = simulate(johnson56, 6, { period: T, initialState: { q2: 0, q1: 1, q0: 0 } }, () => ({ mod: 0 }))
    expect(stateSequence(johnson56, ok.records)).toEqual(['001', '011', '111', '110', '000', '001'])
  })

  it('mode switching is phase-continuous: every output interval is exactly 5T or 6T', () => {
    // mod 在各種時間點切換
    const pattern = [0, 0, 1, 1, 0, 1, 0, 0, 0, 1, 1, 1, 0]
    const { traces, records } = simulate(johnson56, 80, { period: T }, (k) => ({ mod: pattern[Math.floor(k / 3) % pattern.length] as 0 | 1 }))
    const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T)
    expect(m.intervals.length).toBeGreaterThan(8)
    for (const iv of m.intervals) expect([5, 6]).toContain(iv)
    // 每個 cycle 都從 000 開始、經過 001 011 111 110
    const seq = stateSequence(johnson56, records)
    for (let i = 0; i + 4 < seq.length; i++) {
      if (seq[i] === '001') expect(seq.slice(i, i + 4)).toEqual(['001', '011', '111', '110'])
    }
  })

  it('mod deadline: mod set at the edge leaving 110 decides 5 vs 6; changing it one edge earlier/later gives the other', () => {
    // 從 reset 起：edge1→001, edge2→011, edge3→111, edge4→110, edge5 離開 110
    const late = simulate(johnson56, 12, { period: T }, (k) => ({ mod: k === 5 ? 1 : 0 }))
    expect(stateSequence(johnson56, late.records).slice(0, 7)).toEqual(['001', '011', '111', '110', '100', '000', '001'])
    const early = simulate(johnson56, 12, { period: T }, (k) => ({ mod: k === 4 ? 1 : 0 }))
    expect(stateSequence(johnson56, early.records).slice(0, 7)).toEqual(['001', '011', '111', '110', '000', '001', '011'])
  })

  it('real delay mode: q2 changes tCQ after the edge and d2 settles after tCQ + tOR + tAND', () => {
    const { sim, traces } = simulate(johnson56, 4, { period: T, delayMode: 'real' }, () => ({ mod: 0 }))
    const q0 = traces.find((t) => t.name === 'q0')!
    expect(q0.events.find((e) => e.t > 0)!.t).toBeCloseTo(T + 10, 6)
    const [d2, orm] = sim.getTraces(['d2', 'or_m'])
    // edge 1（t=T）：q0 0→1 ⇒ or_m 在 tCQ + tOR 後變 1
    expect(orm.events.find((e) => e.v === 1)!.t).toBeCloseTo(T + 10 + 11, 6)
    // edge 2（t=2T）：q1 變 1（or_m 早已是 1）⇒ d2 經 AND 在 tCQ + tAND 後變 1
    expect(d2.events.find((e) => e.v === 1)!.t).toBeCloseTo(2 * T + 10 + 10, 6)
    // 最長的 data path（q0 → OR → AND → d2）= tCQ + tOR + tAND = 31：
    // edge 4（t=4T，state 111→110）：q0 1→0 ⇒ or_m 變 0 ⇒ d2 變 0，時間 = 4T + 10 + 11 + 10
    expect(d2.events.find((e) => e.t > 3 * T && e.v === 0)!.t).toBeCloseTo(4 * T + 31, 6)
  })
})

describe('self-recovering variant (deep mode)', () => {
  it('keeps both main cycles, ratios and duty, but has no lock-up state in either mode', () => {
    for (const mod of [0, 1] as const) {
      const g = buildStateGraph(johnson56SelfRecover, { mod })
      expect(g.mainCycle, `mod=${mod}`).toEqual(JOHNSON56_CYCLE[mod])
      expect(g.lockup, `mod=${mod}`).toEqual([])
      for (const n of g.nodes) expect(n.stepsToCycle, `mod=${mod} ${n.state}`).toBeLessThanOrEqual(2)
      const { traces } = simulate(johnson56SelfRecover, 40, { period: T }, () => ({ mod }))
      const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T)
      expect(m.ratio).toBe(JOHNSON56_SPEC.ratio[mod])
      expect(m.duty).toBeCloseTo(JOHNSON56_SPEC.duty[mod], 6)
    }
    // 原本會 lock-up 的起點：現在 010 → 001，101 → 010 → 001
    const fixed = simulate(johnson56SelfRecover, 4, { period: T, initialState: { q2: 1, q1: 0, q0: 1 } }, () => ({ mod: 1 }))
    expect(stateSequence(johnson56SelfRecover, fixed.records)).toEqual(['010', '001', '011', '111'])
  })
})

// ------------------------------------------------------------------ Assessment B timing scenario
import { analyzeHold, analyzeSetup, worstHold, worstSetup } from '@/models/timing/sta'
import { ENV_B, EXPECTED_B, johnson56Timing, pathsB } from './timing'
import { johnson56Schematic, johnson56SysSchematic } from './schematics'

describe('Assessment B timing scenario', () => {
  const byId = (id: string) => pathsB.find((p) => p.id === id)!
  it('hand-computed arrival / required / slack match analyzeSetup', () => {
    expect(EXPECTED_B.required).toBe(47)
    const check = (id: string, key: keyof typeof EXPECTED_B.arrival) => {
      const r = analyzeSetup(byId(id), ENV_B)
      expect(r.arrival, `${id} arrival`).toBe(EXPECTED_B.arrival[key])
      expect(r.required, `${id} required`).toBe(EXPECTED_B.required)
      expect(r.slack, `${id} slack`).toBe(EXPECTED_B.slack[key])
      expect(analyzeHold(byId(id), ENV_B).slack, `${id} hold`).toBe(EXPECTED_B.holdSlack[key])
    }
    check('p-q2-inv-d0', 'q2InvD0')
    check('p-q1-and-d2', 'q1AndD2')
    check('p-q0-or-and-d2', 'q0OrAndD2')
    check('p-mod-or-and-d2', 'modOrAndD2')
    check('p-q0-d1', 'q0D1')
    check('p-out-ffr', 'outFfr')
  })
  it('reset recovery / removal：釋放已用 clk 同步，兩個 slack 都是正的（不是假的 removal violation）', () => {
    const p = byId('p-rst-recovery')
    expect(p.segments.map((s) => s.id)).toEqual(['sync', 'rst'])
    const setup = analyzeSetup(p, ENV_B)
    const hold = analyzeHold(p, ENV_B)
    // arrival = synchronizer tCQ + rst_n 走線，基準是 clk edge k
    expect(hold.arrival).toBe(EXPECTED_B.rstRelease.min) // 6 + 3 = 9
    expect(setup.arrival).toBe(EXPECTED_B.rstRelease.max) // 10 + 5 = 15
    // removal：釋放要比 edge k 晚 6 ps；recovery：要比 edge k+1 早 12 ps
    expect(hold.required).toBe(6)
    expect(hold.slack).toBe(EXPECTED_B.rstRelease.removalSlack) // 9 − 6 = 3
    expect(setup.required).toBe(EXPECTED_B.rstRelease.required) // 60 − 12 − 3 − 2 = 43
    expect(setup.slack).toBe(EXPECTED_B.rstRelease.recoverySlack) // 43 − 15 = 28
    // 它不參與 Fmax：worstSetup 的候選只有 setup / multicycle / interface
    for (const mode of ['fix5', 'fix6', 'dyn'] as const) expect(worstSetup(pathsB, ENV_B, mode)!.path.id).not.toBe(p.id)
  })
  it('critical path differs per mode and Tclk,min matches', () => {
    for (const mode of ['fix5', 'fix6', 'dyn'] as const) {
      const w = worstSetup(pathsB, ENV_B, mode)!
      expect(w.path.id, mode).toBe(EXPECTED_B.worst[mode])
      expect(w.result.tclkMin, mode).toBe(EXPECTED_B.tclkMin[mode])
      expect(worstHold(pathsB, ENV_B, mode)!.path.id, `${mode} hold`).toBe(EXPECTED_B.worst.hold)
    }
  })
  it('mode-gated paths: q0 path absent in fix6, mod path only in dyn', () => {
    const visible = (mode: string) => pathsB.filter((p) => !p.modes || p.modes.includes(mode)).map((p) => p.id)
    expect(visible('fix6')).not.toContain('p-q0-or-and-d2')
    expect(visible('fix6')).not.toContain('p-mod-or-and-d2')
    expect(visible('fix5')).toContain('p-q0-or-and-d2')
    expect(visible('fix5')).not.toContain('p-mod-or-and-d2')
    expect(visible('dyn')).toContain('p-mod-or-and-d2')
    expect(johnson56Timing.modes!.map((m) => m.id)).toEqual(['fix5', 'fix6', 'dyn'])
  })
  it('every wire / element referenced by paths and highlights exists in the schematic', () => {
    const ids = new Set([...johnson56SysSchematic.elements.map((e) => e.id), ...johnson56SysSchematic.wires.map((w) => w.id)])
    for (const p of pathsB) {
      expect(ids.has(p.launch.element), p.launch.element).toBe(true)
      expect(ids.has(p.capture.element), p.capture.element).toBe(true)
      for (const s of p.segments) for (const x of [...(s.wires ?? []), ...(s.elements ?? [])]) expect(ids.has(x), `${p.id}:${x}`).toBe(true)
    }
    // 每條 wire 的 from/to 都指向存在的 element
    for (const sch of [johnson56Schematic, johnson56SysSchematic]) {
      const el = new Set(sch.elements.map((e) => e.id))
      for (const w of sch.wires) {
        expect(el.has(w.from.split('.')[0]), w.from).toBe(true)
        expect(el.has(w.to.split('.')[0]), w.to).toBe(true)
      }
      expect(new Set(sch.wires.map((w) => w.id)).size).toBe(sch.wires.length)
      expect(new Set(sch.elements.map((e) => e.id)).size).toBe(sch.elements.length)
    }
  })
})
