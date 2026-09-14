import { describe, expect, it } from 'vitest'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, detectRuntPulses, measureDivide, nextStateOf, stateSequence, valueAt } from '@/models/divider/analysis'
import { div3Lockup, div3Recover, dualMod12, dualMod12Glitchy, dualMod23, mmd2, sync4 } from '@/models/divider/examples'
import {
  COMB_LOOP_OPTIONS,
  JOHNSON6_CYCLE,
  LATCH_HISTORY_A,
  LATCH_HISTORY_B,
  MOD_PATH_OPTIONS,
  NO_RESET_ANTIPHASE,
  NO_RESET_INPHASE,
  PH,
  PMUX_OPTIONS,
  PMUX_SEL_SCHEDULE,
  RUNT_MIN,
  combToggleBug,
  combToggleFixed,
  decodeGlitchRipple,
  decodeRegisteredSync,
  div3IncompleteCase,
  dm12FixedSel1,
  dm12GlitchySel1,
  dm23ModLate,
  dm23ModRetimed,
  johnson6,
  johnson6Fixed,
  noResetPair,
  offByOneDiv5,
  offByOneFixed,
  pmuxGlitchFree,
  pmuxInputAt,
  pmuxNaive,
  prog46,
  resetPair,
  selOf,
  selBits,
} from './bug-models'

const T = 100
const trace = (traces: { name: string; events: { t: number; v: 0 | 1 }[] }[], name: string) => traces.find((t) => t.name === name)!

/* ------------------------------------------------------------------ Bug 1：missing reset */
describe('Bug 1：missing reset（兩個 /2 的相位）', () => {
  it('bug：power-up 反相時，phase_err 永遠是 1（兩路各自 /2 但相位差半個輸出週期）', () => {
    const { records, traces } = simulate(noResetPair, 8, { period: T, initialState: NO_RESET_ANTIPHASE })
    expect(stateSequence(noResetPair, records)).toEqual(['01', '10', '01', '10', '01', '10', '01', '10'])
    expect(measureDivide(trace(traces, 'qa'), T).ratio).toBe(2)
    expect(measureDivide(trace(traces, 'qb'), T).ratio).toBe(2)
    for (const r of records) expect(r.valuesAfter.phase_err).toBe(1)
  })
  it('bug：power-up 剛好同相時看起來「正常」——所以這種 bug 在矽上時有時無', () => {
    const { records } = simulate(noResetPair, 8, { period: T, initialState: NO_RESET_INPHASE })
    expect(stateSequence(noResetPair, records)).toEqual(['11', '00', '11', '00', '11', '00', '11', '00'])
    for (const r of records) expect(r.valuesAfter.phase_err).toBe(0)
  })
  it('fixed：共用 rst_n 之後，reset 釋放後兩路永遠同相', () => {
    const { records, traces } = simulate(resetPair, 8, { period: T })
    expect(stateSequence(resetPair, records)).toEqual(['11', '00', '11', '00', '11', '00', '11', '00'])
    for (const r of records) expect(r.valuesAfter.phase_err).toBe(0)
    expect(measureDivide(trace(traces, 'qa'), T).ratio).toBe(2)
    expect(measureDivide(trace(traces, 'qa'), T).duty).toBe(0.5)
  })
})

/* ------------------------------------------------------------------ Bug 2：incomplete case ⇒ latch */
describe('Bug 2：case 沒寫 2\'b11（next 被推斷成 latch）', () => {
  it('從 reset 出發看起來是正常的 /3：00→01→10→00', () => {
    const { records, traces } = simulate(div3IncompleteCase, 9, { period: T })
    expect(stateSequence(div3IncompleteCase, records)).toEqual(['01', '10', '00', '01', '10', '00', '01', '10', '00'])
    expect(measureDivide(trace(traces, 'q1'), T).ratio).toBe(3)
  })
  it('state 11 的去向取決於 latch 記得的舊值：同一個 state、兩種不同的 next', () => {
    const a = simulate(div3IncompleteCase, 3, { period: T, initialState: LATCH_HISTORY_A })
    const b = simulate(div3IncompleteCase, 3, { period: T, initialState: LATCH_HISTORY_B })
    // edge 1 之前 state 都是 11，case_hit = 0 ⇒ latch 關閉，n 保持舊值
    expect(a.records[0].combBefore.case_hit).toBe(0)
    expect(b.records[0].combBefore.case_hit).toBe(0)
    expect(stateSequence(div3IncompleteCase, a.records)).toEqual(['10', '00', '01'])
    expect(stateSequence(div3IncompleteCase, b.records)).toEqual(['01', '10', '00'])
    expect(a.records[0].stateAfter).not.toEqual(b.records[0].stateAfter)
  })
  it('同步觀點（把 latch 當成組合邏輯的 nextStateOf）無法回答 11 的去向：這正是 latch 的問題', () => {
    // nextStateOf 只算 gates 的 fixed point，latch 輸出 n 不在其中 ⇒ d 讀到 0（沒有定義）
    const r = nextStateOf(div3IncompleteCase, '11', {})
    expect(r.comb.case_hit).toBe(0)
  })
})

/* ------------------------------------------------------------------ Bug 3：illegal state lock-up */
describe('Bug 3：default: next = state（11 鎖死）', () => {
  it('bug：11 → 11 永遠鎖死，div_out 停在 1', () => {
    const g = buildStateGraph(div3Lockup, {})
    expect(g.mainCycle).toEqual(['00', '01', '10'])
    expect(g.lockup).toEqual(['11'])
    const { records, traces } = simulate(div3Lockup, 5, { period: T, initialState: { q1: 1, q0: 1 } })
    expect(stateSequence(div3Lockup, records)).toEqual(['11', '11', '11', '11', '11'])
    expect(measureDivide(trace(traces, 'q1'), T).risingTimes).toEqual([])
  })
  it('fixed：default: next = 00，11 一個 edge 內回到主循環', () => {
    const g = buildStateGraph(div3Recover, {})
    expect(g.lockup).toEqual([])
    expect(g.nodes.find((n) => n.state === '11')!.next).toBe('00')
    const { records } = simulate(div3Recover, 4, { period: T, initialState: { q1: 1, q0: 1 } })
    expect(stateSequence(div3Recover, records)).toEqual(['00', '01', '10', '00'])
  })
})

/* ------------------------------------------------------------------ Bug 4：combinational feedback */
describe('Bug 4：assign div_out = tc ? ~div_out : div_out（組合迴圈）', () => {
  it('bug：tc = 1 的那個 cycle，div_out 以 gate delay 自我振盪（很多 runt pulse）', () => {
    const { records, traces } = simulate(combToggleBug, 8, { period: T, ...COMB_LOOP_OPTIONS })
    expect(stateSequence(combToggleBug, records).slice(0, 4)).toEqual(['01', '10', '11', '00'])
    const out = trace(traces, 'div_out')
    const runts = detectRuntPulses([out], RUNT_MIN)
    expect(runts.length).toBeGreaterThan(4)
    // 振盪只發生在 tc = 1 的期間（state 11：edge 3 之後到 edge 4 之後）
    const tc = trace(traces, 'tc')
    const tcHigh = tc.events.find((e) => e.v === 1)!
    expect(tcHigh.t).toBeCloseTo(3 * T + 8 + 6, 6)
    for (const r of runts) expect(r.t0).toBeGreaterThanOrEqual(tcHigh.t - 1e-6)
    // 振盪週期 = 2 × always_comb 的 delay（15 ps）
    expect(runts[0].width).toBeCloseTo(15, 6)
  })
  it('fixed：toggle 放進 always_ff ⇒ /8、duty 50%，沒有 runt', () => {
    const { records, traces } = simulate(combToggleFixed, 24, { period: T, delayMode: 'real' })
    expect(stateSequence(combToggleFixed, records).slice(0, 8)).toEqual(['001', '010', '011', '100', '101', '110', '111', '000'])
    const m = measureDivide(trace(traces, 'div_out'), T)
    expect(m.ratio).toBe(8)
    expect(m.duty).toBe(0.5)
    expect(detectRuntPulses([trace(traces, 'div_out')], RUNT_MIN)).toEqual([])
    expect(buildStateGraph(combToggleFixed, {}).lockup).toEqual([])
  })
})

/* ------------------------------------------------------------------ Bug 5：glitchy clock gating */
describe('Bug 5：assign div_out = clk & en（組合邏輯直接切 clock）', () => {
  it('bug：sel = 1 時 en 在 clk = 1 期間改變 ⇒ runt pulse', () => {
    const bad = simulate(dualMod12Glitchy, 12, { period: T, delayMode: 'real' }, () => ({ sel: 1 }))
    const runts = detectRuntPulses([trace(bad.traces, 'div_out')], RUNT_MIN)
    expect(runts.length).toBeGreaterThan(0)
    // runt 寬度 = tCQ + tOR + tAND 之後被切掉：比半個週期窄得多
    for (const r of runts) expect(r.width).toBeLessThan(T / 2)
  })
  it('bug：ideal（zero-delay）模式看不到 runt——RTL 模擬會「過」', () => {
    const bad = simulate(dualMod12Glitchy, 12, { period: T, delayMode: 'ideal' }, () => ({ sel: 1 }))
    expect(detectRuntPulses([trace(bad.traces, 'div_out')], RUNT_MIN)).toEqual([])
  })
  it('Bug Lab 面板用的 sel 預設 1 版本：行為與原模型相同', () => {
    const bad = simulate(dm12GlitchySel1, 12, { period: T, delayMode: 'real' })
    expect(detectRuntPulses([trace(bad.traces, 'div_out')], RUNT_MIN).length).toBeGreaterThan(0)
    expect(bad.records[0].inputs.sel).toBe(1)
    const good = simulate(dm12FixedSel1, 12, { period: T, delayMode: 'real' })
    expect(detectRuntPulses([trace(good.traces, 'div_out')], RUNT_MIN)).toEqual([])
    expect(measureDivide(trace(good.traces, 'div_out'), T).ratio).toBe(2)
  })
  it('課文引用的數字：pulse 在 edge 後 6 ps 升起、edge 後 24 ps 被切掉 ⇒ 只有 18 ps 寬', () => {
    const bad = simulate(dm12GlitchySel1, 12, { period: T, delayMode: 'real' })
    const out = trace(bad.traces, 'div_out')
    // clk edge 100：en 在 118 升起（tCQ 8 + tOR 10）⇒ 輸出晚 24 ps 才升（124），clk 落下後 6 ps 落（156）⇒ 32 ps
    // clk edge 200：輸出在 206 升起（tAND 6），en 在 218 落下 ⇒ 224 被切掉 ⇒ 224 − 206 = 18 ps
    expect(out.events.slice(1, 5).map((e) => [e.t, e.v])).toEqual([
      [124, 1],
      [156, 0],
      [206, 1],
      [224, 0],
    ])
    expect(trace(bad.traces, 'q0').events.find((e) => e.t > 0)!.t).toBe(108)
    expect(trace(bad.traces, 'en').events.find((e) => e.t > 0)!.t).toBe(118)
    const widths = [...new Set(detectRuntPulses([out], RUNT_MIN).map((r) => r.width))]
    expect(widths).toEqual([18])
  })
  it('fixed：en 用 negedge clk 重新取樣 ⇒ sel=0 為 /1、sel=1 為 /2，沒有 runt', () => {
    const good1 = simulate(dualMod12, 12, { period: T, delayMode: 'real' }, () => ({ sel: 1 }))
    expect(detectRuntPulses([trace(good1.traces, 'div_out')], RUNT_MIN)).toEqual([])
    expect(measureDivide(trace(good1.traces, 'div_out'), T).ratio).toBe(2)
    const good0 = simulate(dualMod12, 8, { period: T, delayMode: 'real' }, () => ({ sel: 0 }))
    expect(measureDivide(trace(good0.traces, 'div_out'), T).ratio).toBe(1)
  })
})

/* ------------------------------------------------------------------ Bug 6：mod 到達太晚 */
describe('Bug 6：mod 經過 90 ps 慢邏輯才到 cell', () => {
  it('bug：zero-delay 模擬是 /3（看起來對）', () => {
    const { traces } = simulate(dm23ModLate, 15, { period: T, delayMode: 'ideal' })
    expect(measureDivide(trace(traces, 'div_out'), T).ratio).toBe(3)
  })
  it('bug：real delay 時 d1 在 edge 後 8 ps 才變 ⇒ 該 edge 沒吞 ⇒ 變成 /2', () => {
    const { records, traces, sim } = simulate(dm23ModLate, 15, { period: T, ...MOD_PATH_OPTIONS })
    const m = measureDivide(trace(traces, 'div_out'), T)
    expect(m.ratio).toBe(2)
    expect(m.periodic).toBe(true)
    // state 永遠在 00 / 01 之間，q1 從未變 1
    for (const r of records) expect(r.stateAfter.q1).toBe(0)
    // mod 第一次變 1 的時間：edge 1 + tCQ(8) + 90 = 1T + 98；d1 要再 +10 = 1T + 108，比 edge 2（2T）晚 8 ps
    const mod = trace(traces, 'mod')
    const modRise = mod.events.find((e) => e.v === 1)!
    expect(modRise.t).toBeCloseTo(T + 98, 6)
    const d1 = sim.getTraces(['d1'])[0]
    const d1Rise = d1.events.find((e) => e.v === 1)!
    expect(d1Rise.t).toBeCloseTo(T + 108, 6)
    // 每一個 edge 抓到的 d1 都是 0
    for (const r of records) expect(r.combBefore.d1).toBe(0)
  })
  it('fixed：mod_r 由 flop 直接驅動 ⇒ ideal 與 real 都是 /3', () => {
    for (const delayMode of ['ideal', 'real'] as const) {
      const { records, traces } = simulate(dm23ModRetimed, 18, { period: T, delayMode })
      expect(measureDivide(trace(traces, 'div_out'), T).ratio).toBe(3)
      const seq = stateSequence(dm23ModRetimed, records).map((s) => s.slice(2)) // 只看 q1 q0
      // 第一個週期 ok_r 還是 0（reset 值）⇒ 先走一次 /2，之後每個週期都是 00→01→10
      const start = seq.indexOf('01', 3)
      expect(seq.slice(start, start + 6)).toEqual(['01', '10', '00', '01', '10', '00'])
    }
  })
})

/* ------------------------------------------------------------------ Bug 7：off-by-one */
describe('Bug 7：wrap 條件寫成 cnt == N（想要 /4）', () => {
  it('bug：cnt 走 0→1→2→3→4→0 共五個 state ⇒ /5', () => {
    const { records, traces } = simulate(offByOneDiv5, 20, { period: T })
    expect(stateSequence(offByOneDiv5, records).slice(0, 6)).toEqual(['001', '010', '011', '100', '000', '001'])
    const m = measureDivide(trace(traces, 'div_out'), T)
    expect(m.ratio).toBe(5)
    expect(m.duty).toBeCloseTo(0.2, 6)
    expect(buildStateGraph(offByOneDiv5, {}).mainCycle).toEqual(['000', '001', '010', '011', '100'])
  })
  it('fixed：cnt == N−1 = 3 ⇒ 四個 state ⇒ /4', () => {
    const { records, traces } = simulate(offByOneFixed, 12, { period: T })
    expect(stateSequence(offByOneFixed, records).slice(0, 5)).toEqual(['001', '010', '011', '000', '001'])
    const m = measureDivide(trace(traces, 'div_out'), T)
    expect(m.ratio).toBe(4)
    expect(m.duty).toBeCloseTo(0.25, 6)
  })
  it('programmable /4 或 /6：sel=0 → /4，sel=1 → /6，未使用的 state 都會回到主循環', () => {
    const r4 = simulate(prog46, 16, { period: T }, () => ({ sel: 0 }))
    expect(measureDivide(trace(r4.traces, 'div_out'), T).ratio).toBe(4)
    const r6 = simulate(prog46, 24, { period: T }, () => ({ sel: 1 }))
    expect(measureDivide(trace(r6.traces, 'div_out'), T).ratio).toBe(6)
    expect(stateSequence(prog46, r6.records).slice(0, 6)).toEqual(['001', '010', '011', '100', '101', '000'])
    expect(buildStateGraph(prog46, { sel: 0 }).mainCycle).toEqual(['000', '001', '010', '011'])
    expect(buildStateGraph(prog46, { sel: 1 }).mainCycle).toEqual(['000', '001', '010', '011', '100', '101'])
    // sel=0 時 state 4..7 不會鎖死：cnt + 1 會繞回 0（& 7）
    expect(buildStateGraph(prog46, { sel: 0 }).lockup).toEqual([])
    expect(buildStateGraph(prog46, { sel: 1 }).lockup).toEqual([])
  })
  it('sel 在 cnt 已經超過新 n_max 時才切換：cnt == n_max 永遠不成立 ⇒ 一個 /8 的長週期', () => {
    // 先用 sel=1 數到 cnt=4，再切回 sel=0（n_max=3）：4 → 5 → 6 → 7 → 0 才 wrap
    const { records, traces } = simulate(prog46, 20, { period: T }, (edge) => ({ sel: edge <= 4 ? 1 : 0 }))
    expect(stateSequence(prog46, records).slice(3, 9)).toEqual(['100', '101', '110', '111', '000', '001'])
    const m = measureDivide(trace(traces, 'div_out'), T, 0)
    // reset 後 div_out 本來就是 1（cnt = 0），第一個 rising edge 要等到 cnt 繞過 7 回到 0：edge 8
    expect(m.risingTimes[0]).toBeCloseTo(8 * T, 6)
    expect(m.intervals.every((x) => x === 4)).toBe(true)
  })
})

/* ------------------------------------------------------------------ Bug 8：output pulse 太短 */
describe('Bug 8：ripple counter 的 decode pulse 有 runt，被下一級數進去', () => {
  it('bug：11 → 00 途中出現 8 ps 的暫態 10，decode 出 runt；q2 變成 /4 而不是 /8', () => {
    const { traces } = simulate(decodeGlitchRipple, 24, { period: T, delayMode: 'real' })
    const out = trace(traces, 'div_out')
    const runts = detectRuntPulses([out], RUNT_MIN)
    expect(runts.length).toBeGreaterThan(0)
    expect(runts[0].width).toBeCloseTo(8, 6)
    expect(runts[0].level).toBe(1)
    // 正常的 decode pulse 也有（寬約 1T）
    const m = measureDivide(out, T)
    expect(m.intervals.every((iv) => Math.abs(iv - 2) < 0.2)).toBe(true) // 真 pulse 與 runt 交錯，間隔約 2T
    const q2 = measureDivide(trace(traces, 'q2'), T)
    expect(q2.ratio).toBe(4)
  })
  it('bug：ideal 模式的 glitch 寬度為 0（波形看不到），但 posedge 事件仍然觸發 FF2', () => {
    const { traces } = simulate(decodeGlitchRipple, 24, { period: T, delayMode: 'ideal' })
    expect(detectRuntPulses([trace(traces, 'div_out')], RUNT_MIN)).toEqual([])
    expect(measureDivide(trace(traces, 'q2'), T).ratio).toBe(4)
  })
  it('fixed：同步 counter + registered decode ⇒ pulse 寬度剛好 1T、q2 = /8', () => {
    const { records, traces } = simulate(decodeRegisteredSync, 32, { period: T, delayMode: 'real' })
    expect(stateSequence(decodeRegisteredSync, records).slice(0, 4)).toEqual(['01', '10', '11', '00'])
    const out = trace(traces, 'div_out')
    expect(detectRuntPulses([out], RUNT_MIN)).toEqual([])
    const m = measureDivide(out, T)
    expect(m.ratio).toBe(4)
    expect(m.duty).toBe(0.25)
    // div_out 在 state 10 的「下一個」edge 才升起（edge 3），寬度 1T
    const rise = out.events.find((e) => e.v === 1)!
    expect(rise.t).toBeCloseTo(3 * T + 8, 6)
    expect(measureDivide(trace(traces, 'q2'), T).ratio).toBe(8)
  })
})

/* ------------------------------------------------------------------ RTL 分頁用的模型 */
describe('RTL 分頁：synthesizable 模型的 state 序列', () => {
  it('sync4：01→10→11→00，div_out = q1 為 /4', () => {
    const { records, traces } = simulate(sync4, 16, { period: T })
    expect(stateSequence(sync4, records).slice(0, 8)).toEqual(['01', '10', '11', '00', '01', '10', '11', '00'])
    expect(measureDivide(trace(traces, 'q1'), T).ratio).toBe(4)
  })
  it('dm23：mod=0 為 /2、mod=1 為 /3，兩種週期都從 state 00 開始（phase-continuous）', () => {
    const { traces, records } = simulate(dualMod23, 20, { period: T }, (edge) => ({ mod: edge >= 7 && edge <= 12 ? 1 : 0 }))
    const m = measureDivide(trace(traces, 'div_out'), T, 0)
    for (const iv of m.intervals) expect([2, 3]).toContain(iv)
    expect(m.intervals).toContain(3)
    expect(m.intervals).toContain(2)
    for (const r of records) if (r.stateBefore.q1 === 1) expect(r.stateBefore.q0).toBe(0) // 11 永遠不出現
  })
  it('mmd2：N = 4 + 2·p1 + p0', () => {
    for (const p0 of [0, 1] as const)
      for (const p1 of [0, 1] as const) {
        const { traces } = simulate(mmd2, 40, { period: T }, () => ({ p0, p1 }))
        expect(measureDivide(trace(traces, 'div_out'), T).ratio).toBe(4 + 2 * p1 + p0)
      }
  })
})

/* ------------------------------------------------------------------ Phase selection */
describe('Phase selection：naive MUX vs glitch-free enable', () => {
  const EDGES = 20
  it('sel bit helpers 互為反函數', () => {
    for (let n = 0; n < 8; n++) expect(selOf(selBits(n))).toBe(n)
  })
  it('naive：phase_sel 改變時輸出出現 runt pulse', () => {
    const { traces } = simulate(pmuxNaive, EDGES, { period: T, ...PMUX_OPTIONS }, pmuxInputAt())
    const runts = detectRuntPulses([trace(traces, 'div_out')], RUNT_MIN)
    expect(runts.length).toBeGreaterThan(0)
    // 相鄰兩相差 T/8 = 12.5 ps；2 → 5 差 3/8 T = 37.5 ps 的半截 pulse 等等
    for (const r of runts) expect(r.width).toBeLessThan(T / 2)
  })
  it('共同 clk 同步 phase_sel：切換瞬間 ph0 與 ph5~ph7 是 high、ph1~ph4 是 low', () => {
    // ph_i 在 (i/8 + PH_DELTA)·T 升起、duty 50%；sel_r 在 posedge clk 之後 tCQ 更新
    const { traces } = simulate(pmuxNaive, EDGES, { period: T, ...PMUX_OPTIONS }, () => selBits(0))
    // sel_r 在 posedge clk 之後 tCQ（8 ps）才改變，切換就發生在那一瞬間
    const tSwitch = 4 * T + 8
    expect(PH.map((n) => valueAt(trace(traces, n), tSwitch))).toEqual([1, 0, 0, 0, 0, 1, 1, 1])
    // ph4 是邊界：它的 falling edge 正好落在 clk edge 上（只差一個 buffer delay PH_DELTA = 2% T）
    expect(valueAt(trace(traces, PH[4]), 4 * T)).toBe(1)
    expect(valueAt(trace(traces, PH[4]), 4 * T + 2 + 1e-9)).toBe(0)
  })
  it('naive：phase_sel 不變時就是一個乾淨的 clock（問題只在切換瞬間）', () => {
    const { traces } = simulate(pmuxNaive, EDGES, { period: T, ...PMUX_OPTIONS }, () => selBits(3))
    const out = trace(traces, 'div_out')
    expect(detectRuntPulses([out], RUNT_MIN)).toEqual([])
    expect(measureDivide(out, T).ratio).toBe(1)
  })
  it('glitch-free：同一組 select 序列，輸出沒有任何 runt，而且每個 pulse 都是完整的半個週期', () => {
    const { traces } = simulate(pmuxGlitchFree, EDGES, { period: T, ...PMUX_OPTIONS }, pmuxInputAt())
    const out = trace(traces, 'div_out')
    expect(detectRuntPulses([out], RUNT_MIN)).toEqual([])
    // 每個 high pulse 寬度 = T/2（AND-OR 的 delay 對 rising / falling 一樣）
    const ev = out.events.filter((e) => e.t > 0)
    for (let i = 1; i < ev.length; i++) if (ev[i - 1].v === 1 && ev[i].v === 0) expect(ev[i].t - ev[i - 1].t).toBeCloseTo(T / 2, 6)
    // 切換前後：rising edge 間隔只會是 1T 或「1T + Δphase」（延後），絕不會小於 1T
    const m = measureDivide(out, T, 0)
    for (const iv of m.intervals) expect(iv).toBeGreaterThanOrEqual(1 - 1e-6)
    expect(m.intervals.some((iv) => iv > 1 + 1e-6)).toBe(true)
  })
  it('glitch-free：切換後輸出對齊到新的相位（rising edge 落在 ph[sel] 的 rising edge 上 + MUX delay）', () => {
    const { traces } = simulate(pmuxGlitchFree, EDGES, { period: T, ...PMUX_OPTIONS }, pmuxInputAt())
    const out = trace(traces, 'div_out')
    const last = PMUX_SEL_SCHEDULE[PMUX_SEL_SCHEDULE.length - 1]
    const ph = trace(traces, PH[last.sel])
    const outRises = out.events.filter((e) => e.v === 1 && e.t > (last.edge + 2) * T).map((e) => e.t)
    const phRises = ph.events.filter((e) => e.v === 1).map((e) => e.t)
    expect(outRises.length).toBeGreaterThan(1)
    for (const t of outRises) expect(phRises.some((p) => Math.abs(t - p - 6) < 1e-6)).toBe(true)
  })
  it('glitch-free：任何時刻最多只有一個 en 為 1', () => {
    const { records } = simulate(pmuxGlitchFree, EDGES, { period: T, ...PMUX_OPTIONS }, pmuxInputAt())
    for (const r of records) {
      const ones = Object.entries(r.stateAfter).filter(([k, v]) => k.startsWith('en') && v === 1).length
      expect(ones).toBeLessThanOrEqual(1)
    }
  })
})

/* ------------------------------------------------------------------ 練習：Johnson counter */
describe('練習：3-bit Johnson counter', () => {
  it('主循環 000→001→011→111→110→100，q2 為 /6、duty 50%', () => {
    const { records, traces } = simulate(johnson6, 20, { period: T })
    expect(stateSequence(johnson6, records).slice(0, 6)).toEqual(['001', '011', '111', '110', '100', '000'])
    const g = buildStateGraph(johnson6, {})
    expect(g.mainCycle).toEqual(JOHNSON6_CYCLE)
    const m = measureDivide(trace(traces, 'q2'), T)
    expect(m.ratio).toBe(6)
    expect(m.duty).toBe(0.5)
  })
  it('illegal state 010 與 101 互相循環：永遠回不到主循環（lock-up）', () => {
    const g = buildStateGraph(johnson6, {})
    expect(g.lockup.sort()).toEqual(['010', '101'])
    const { records } = simulate(johnson6, 4, { period: T, initialState: { q2: 0, q1: 1, q0: 0 } })
    expect(stateSequence(johnson6, records)).toEqual(['101', '010', '101', '010'])
  })
  it('fixed：改 d0 之後主循環不變，010 → 100、101 → 010 → 100', () => {
    const g = buildStateGraph(johnson6Fixed, {})
    expect(g.mainCycle).toEqual(JOHNSON6_CYCLE)
    expect(g.lockup).toEqual([])
    expect(g.nodes.find((n) => n.state === '010')!.next).toBe('100')
    expect(g.nodes.find((n) => n.state === '101')!.next).toBe('010')
    expect(g.nodes.find((n) => n.state === '101')!.stepsToCycle).toBe(2)
    const { traces } = simulate(johnson6Fixed, 20, { period: T })
    expect(measureDivide(trace(traces, 'q2'), T).ratio).toBe(6)
  })
})

/* ------------------------------------------------------------------ 頁面 SSR render（render 期間不可存取 window / document） */
import { createElement, type ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { MysteryExercise, RTL_TABS, VERILOG_QUIZ, VerilogPage } from '../VerilogPage'
import { BUG_CASES, BugCard, BugLab } from './bugs'

const ssr = (node: ReactElement) => renderToString(createElement(MemoryRouter, null, node))

describe('VerilogPage SSR render', () => {
  it('整頁 render 不丟例外、沒有 stub 標記', () => {
    const html = ssr(createElement(VerilogPage))
    expect(html.length).toBeGreaterThan(20000)
    expect(html).not.toMatch(/PDLA_ST(U)B|Lorem|TODO|之後再補/i)
    expect(html).toContain('RTL 與電路的對應')
    expect(html).toContain('Bug Lab')
  })
  it('七個 RTL 分頁各自都能 render', () => {
    expect(RTL_TABS.length).toBe(7)
    for (const tab of RTL_TABS) {
      const html = ssr(createElement('div', null, tab.content))
      expect(html.length).toBeGreaterThan(2000)
      expect(html).toContain('module')
    }
  })
  it('八個 bug 案例：未預測與已預測（揭曉證據與修正）都能 render', () => {
    expect(BUG_CASES.length).toBe(8)
    const ids = new Set(BUG_CASES.map((b) => b.id))
    expect(ids.size).toBe(8)
    for (const bug of BUG_CASES) {
      expect(bug.answer).toBeGreaterThanOrEqual(0)
      expect(bug.answer).toBeLessThan(bug.options.length)
      const hidden = ssr(createElement(BugCard, { bug, prediction: null, onPredict: () => {}, onRetry: () => {} }))
      expect(hidden).toContain('尚未預測')
      expect(hidden).not.toContain('模擬證據（有 bug 的版本）')
      const shown = ssr(createElement(BugCard, { bug, prediction: bug.answer, onPredict: () => {}, onRetry: () => {} }))
      expect(shown).toContain('預測正確')
      expect(shown).toContain('模擬證據（有 bug 的版本）')
      expect(shown).toContain('<h4>修正</h4>')
      expect(shown.length).toBeGreaterThan(hidden.length + 3000)
    }
    expect(ssr(createElement(BugLab, {})).length).toBeGreaterThan(8000)
  })
  it('練習與小測驗', () => {
    const html = ssr(createElement(MysteryExercise))
    expect(html).toContain('mystery')
    expect(html).toContain('顯示參考答案')
    expect(VERILOG_QUIZ.length).toBeGreaterThanOrEqual(4)
    expect(new Set(VERILOG_QUIZ.map((q) => q.type)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(VERILOG_QUIZ.map((q) => q.id)).size).toBe(VERILOG_QUIZ.length)
  })
})
