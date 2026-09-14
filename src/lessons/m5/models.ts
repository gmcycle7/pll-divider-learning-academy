import type { Bit, ClockDef, GateDef, Netlist, SignalTrace, Values } from '@/models/divider/types'
import { valueAt } from '@/models/divider/analysis'
import { phaseClockEvents } from '@/models/phase/pmux'
import { and, nor, not, xor } from '@/utils/bits'

/**
 * Module 5 的 netlist：8-phase VCO clock + phase MUX（PMUX）。
 *
 * 時間單位：engine 的 base period = Tvco。phase i 的 clock 相位偏移 i/8。
 * 主 clock（clocks[0]）是 ph0，所以 DividerSimPanel 的「edge k」= ph0 的第 k 個 rising edge（t = k·Tvco）；
 * 被選中的 phase 的 rising edge 落在 t = k·Tvco + sel/8·Tvco。
 */

export const PHASES = 8

/** 8 個 phase clock：ph0..ph7，phase = i/8 */
export const phaseClocks: ClockDef[] = Array.from({ length: PHASES }, (_, i) => ({
  name: `ph${i}`,
  phase: i / PHASES,
  description: `VCO phase ${i}：rising edge 在 k·Tvco + ${i}/8·Tvco`,
}))

/** 由 s2 s1 s0 解出 phase index */
export function selIndex(v: Values): number {
  return (v.s0 ?? 0) + 2 * (v.s1 ?? 0) + 4 * (v.s2 ?? 0)
}

/** 8:1 combinational phase MUX：pclk = ph[sel] */
const mux8Gate: GateDef = {
  out: 'pclk',
  inputs: [...phaseClocks.map((c) => c.name), 's0', 's1', 's2'],
  fn: (v) => (v[`ph${selIndex(v)}`] ?? 0) as Bit,
  delay: 10,
  label: 'PMUX (8:1)',
  kind: 'mux',
  description: 'combinational 8:1 MUX；select 一改，輸出立刻跟著跳到新 phase 的 level',
}

function selInputs(sel: number) {
  const s = sel & 7
  return [
    { name: 's0', initial: (s & 1) as Bit, description: 'phase select bit 0（LSB）' },
    { name: 's1', initial: ((s >> 1) & 1) as Bit, description: 'phase select bit 1' },
    { name: 's2', initial: ((s >> 2) & 1) as Bit, description: 'phase select bit 2（MSB）' },
  ]
}

/**
 * Lesson 5-1：PMUX → 同步 /4 counter。
 * state (q1 q0)：00 → 01 → 10 → 11 → 00；div_out = q1（/4，50% duty）。
 * 用 factory 讓 select 的初始值可以不同（靜態選 phase）。
 */
export function pmuxDiv4(sel: number): Netlist {
  const s = sel & 7
  return {
    id: `pmux-div4-s${s}`,
    name: `PMUX(phase ${s}) → /4`,
    description: `8-phase MUX 靜態選 phase ${s}，驅動兩個 DFF 組成的同步 /4。`,
    clocks: phaseClocks,
    inputs: selInputs(s),
    flops: [
      { q: 'q0', d: 'd0', clk: 'pclk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0', description: '/4 counter LSB，由 pclk 驅動' },
      { q: 'q1', d: 'd1', clk: 'pclk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1', description: '/4 counter MSB = div_out' },
    ],
    gates: [
      mux8Gate,
      { out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV', kind: 'inv' },
      { out: 'd1', inputs: ['q1', 'q0'], fn: (v) => xor(v.q1, v.q0), delay: 12, label: 'XOR', kind: 'xor' },
      { out: 'div_out', inputs: ['q1'], fn: (v) => v.q1, delay: 0, label: 'wire', kind: 'buf' },
    ],
    stateOrder: ['q1', 'q0'],
    output: 'div_out',
    watch: ['pclk'],
    equations: [
      { target: 'pclk', text: 'pclk = ph[s2 s1 s0]', latex: 'pclk = ph_{\\,4s_2+2s_1+s_0}' },
      { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
      { target: 'd1', text: 'd1 = q1 XOR q0', latex: 'd_1 = q_1 \\oplus q_0' },
      { target: 'div_out', text: 'div_out = q1', latex: 'div\\_out = q_1' },
    ],
    legalStates: ['00', '01', '10', '11'],
    defaultDelays: { tcq: 8, gate: 6 },
  }
}

export const pmuxDiv4Sel0 = pmuxDiv4(0)
export const pmuxDiv4Sel3 = pmuxDiv4(3)

/** dual-modulus /2 /3 cell 的 next-state gates（與 examples 的 dualMod23 相同） */
const dm23Gates: GateDef[] = [
  { out: 'd0', inputs: ['q0', 'q1'], fn: (v) => nor(v.q0, v.q1), delay: 12, label: 'NOR', kind: 'nor' },
  { out: 'd1', inputs: ['q0', 'mod'], fn: (v) => and(v.q0, v.mod), delay: 10, label: 'AND', kind: 'and' },
  { out: 'div_out', inputs: ['d0'], fn: (v) => v.d0, delay: 0, label: 'wire', kind: 'buf' },
]
const dm23Flops: Netlist['flops'] = [
  { q: 'q0', d: 'd0', clk: 'pclk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0', description: '/2 /3 cell state bit 0' },
  { q: 'q1', d: 'd1', clk: 'pclk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1', description: '/2 /3 cell state bit 1' },
]
const dm23Equations: Netlist['equations'] = [
  { target: 'd0', text: 'd0 = NOT(q1 OR q0)', latex: 'd_0 = \\overline{q_1 + q_0}' },
  { target: 'd1', text: 'd1 = q0 AND mod', latex: 'd_1 = q_0 \\cdot mod' },
  { target: 'div_out', text: 'div_out = NOT(q1 OR q0)（state 00 時為 1）', latex: 'div\\_out = \\overline{q_1 + q_0}' },
]

/**
 * Lesson 5-2 / 5-3：架構 2 的最簡版本——combinational 8:1 PMUX → /2 /3 dual-modulus cell。
 * select 在任何時刻都可以改（沒有 retiming），所以會示範出 runt / double edge。
 */
export const pmuxDualMod23: Netlist = {
  id: 'pmux-dm23',
  name: 'PMUX（combinational）→ /2 /3 cell',
  description: '8:1 combinational MUX 選 phase 當 /2 /3 cell 的 clock。select 改變的瞬間若新舊 phase level 不同，pclk 會多出 edge。',
  clocks: phaseClocks,
  inputs: [...selInputs(0), { name: 'mod', initial: 0, description: 'mod=0：/2；mod=1：/3' }],
  flops: dm23Flops,
  gates: [mux8Gate, ...dm23Gates],
  stateOrder: ['q1', 'q0'],
  output: 'div_out',
  watch: ['pclk'],
  equations: [{ target: 'pclk', text: 'pclk = ph[s2 s1 s0]', latex: 'pclk = ph_{\\,4s_2+2s_1+s_0}' }, ...dm23Equations],
  legalStates: ['00', '01', '10'],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * Glitch-free PMUX（兩級 retiming 的 8-source 版本）→ /2 /3 cell。
 *
 * 每個 phase i 有一個 enable flop en_i，在 ph_i 的 **falling edge** 取樣：
 *   d_en_i = dec_i AND NOT( OR_{j≠i} en_j )
 * 舊 phase 的 enable 在舊 phase 的 falling edge 關掉（此時舊 phase 已經是 low，AND 不會產生 edge）；
 * 新 phase 的 enable 要等舊的關掉之後、在新 phase 的下一個 falling edge 才打開（此時新 phase 也是 low）。
 * pclk = OR_i ( ph_i AND en_i )。
 * 代價：切換有 latency（舊 enable 在舊 phase 的 falling edge 關、新 enable 在新 phase 的下一個 falling edge 開），
 * 而且只能「往後」切：想往前 k 個 phase 會變成往後 8−k 個（多等一個 Tvco，等效 missing pulse）。但永遠不會出現 runt。
 * 注意 handoff path：en_old（↓ph_old）→ den_new → EN_new.D（↓ph_new）只有 k/8·Tvco 可用，real delay 模式下 k = 1 會來不及、再多等一個 T（見 Lesson 5-2 deep）。
 */
export const pmuxDualMod23Safe: Netlist = (() => {
  const decGates: GateDef[] = Array.from({ length: PHASES }, (_, i) => ({
    out: `dec${i}`,
    inputs: ['s0', 's1', 's2'],
    fn: (v) => (selIndex(v) === i ? 1 : 0) as Bit,
    delay: 8,
    label: `decode ${i}`,
    kind: 'custom',
  }))
  const enFlops: Netlist['flops'] = Array.from({ length: PHASES }, (_, i) => ({
    q: `en${i}`,
    d: `den${i}`,
    clk: `ph${i}`,
    edge: 'falling',
    rstn: 'rst_n',
    resetValue: (i === 0 ? 1 : 0) as Bit,
    tcq: 8,
    label: `EN${i} (↓ph${i})`,
    description: `phase ${i} 的 enable，在 ph${i} falling edge 取樣`,
  }))
  const enGates: GateDef[] = Array.from({ length: PHASES }, (_, i) => ({
    out: `den${i}`,
    inputs: [`dec${i}`, ...Array.from({ length: PHASES }, (_, j) => `en${j}`)],
    fn: (v) => {
      let others: Bit = 0
      for (let j = 0; j < PHASES; j++) if (j !== i && v[`en${j}`] === 1) others = 1
      return and(v[`dec${i}`] ?? 0, not(others))
    },
    delay: 6,
    label: `den${i} = dec${i}·¬(other en)`,
    kind: 'custom',
  }))
  const andOr: GateDef = {
    out: 'pclk',
    inputs: [...phaseClocks.map((c) => c.name), ...Array.from({ length: PHASES }, (_, j) => `en${j}`)],
    fn: (v) => {
      let o: Bit = 0
      for (let j = 0; j < PHASES; j++) if (v[`ph${j}`] === 1 && v[`en${j}`] === 1) o = 1
      return o
    },
    delay: 8,
    label: 'AND-OR',
    kind: 'custom',
    description: 'pclk = OR_i(ph_i AND en_i)',
  }
  return {
    id: 'pmux-dm23-safe',
    name: 'Glitch-free PMUX（retimed enable）→ /2 /3 cell',
    description: '每個 phase 的 enable 在該 phase 的 falling edge 取樣；舊的先關、新的後開，pclk 永遠沒有 runt。',
    clocks: phaseClocks,
    inputs: [...selInputs(0), { name: 'mod', initial: 0, description: 'mod=0：/2；mod=1：/3' }],
    flops: [...dm23Flops, ...enFlops],
    gates: [...decGates, ...enGates, andOr, ...dm23Gates],
    stateOrder: ['q1', 'q0'],
    output: 'div_out',
    watch: ['pclk'],
    equations: [
      { target: 'den_i', text: 'den_i = dec_i AND NOT(OR of other en_j)；en_i 在 ph_i falling edge 取樣', latex: 'd_{en,i} = dec_i \\cdot \\overline{\\sum_{j \\ne i} en_j}' },
      { target: 'pclk', text: 'pclk = OR_i(ph_i AND en_i)', latex: 'pclk = \\sum_i ph_i \\cdot en_i' },
      ...dm23Equations,
    ],
    legalStates: ['00', '01', '10'],
    defaultDelays: { tcq: 8, gate: 6 },
  }
})()

/** 把 phase index 轉成 s0 s1 s2 的 input 物件 */
export function selBits(sel: number): { s0: Bit; s1: Bit; s2: Bit } {
  const s = sel & 7
  return { s0: (s & 1) as Bit, s1: ((s >> 1) & 1) as Bit, s2: ((s >> 2) & 1) as Bit }
}

/**
 * Lesson 5-3 的示範腳本：phase step 與 mod 切換一起發生。
 * key = ph0 edge index（DividerSimPanel 的「edge k」），value = 在 edge k 之前生效的 input。
 * 沒列出的 edge 沿用前一個值（simulate 的 inputAt 只在有回傳時才覆寫）。
 */
export const arch2Script: Record<number, { sel: number; mod: Bit }> = {
  1: { sel: 0, mod: 0 }, // /2，phase 0
  6: { sel: 1, mod: 1 }, // 同時：phase +1、/3
  12: { sel: 2, mod: 0 }, // 同時：phase +1、回到 /2
  17: { sel: 0, mod: 1 }, // phase 2 → 0（等效 forward 6）、/3
}

export function arch2InputAt(edge: number): Partial<Values> {
  const s = arch2Script[edge]
  if (!s) return {}
  return { ...selBits(s.sel), mod: s.mod }
}

/** 產生「在 ph0 edge k 之前把 select 換成 sel（mod 可選）」的 inputAt，其餘 edge 不改 */
export function switchAt(edge: number, sel: number, mod?: Bit): (edgeIndex: number) => Partial<Values> {
  return (k) => (k === edge ? { ...selBits(sel), ...(mod === undefined ? {} : { mod }) } : {})
}

/** 回傳 event 序列中所有 rising edge（0 → 1）的時間 */
export function risingTimes(events: { t: number; v: Bit }[]): number[] {
  const out: number[] = []
  let prev: Bit | undefined
  for (const e of events) {
    if (prev === 0 && e.v === 1) out.push(e.t)
    prev = e.v
  }
  return out
}

// ---------------------------------------------------------------- Lesson 5-2：safe switching window 的純函式（widget 與測試共用）

export interface LevelInterval {
  t0: number
  t1: number
  /** 兩個 phase 在此區間是否同 level */
  same: boolean
  /** 同 level 時的 level（不同 level 時為 null） */
  level: Bit | null
}

/** 把 [0, cycles] 依 ph_a / ph_b 的 edge 切段，標出每段兩者是否同 level（時間單位 Tvco） */
export function levelIntervals(M: number, a: number, b: number, cycles: number): LevelInterval[] {
  const evA = phaseClockEvents(M, cycles, a)
  const evB = phaseClockEvents(M, cycles, b)
  const trA: SignalTrace = { name: 'a', events: evA }
  const trB: SignalTrace = { name: 'b', events: evB }
  const bps = Array.from(new Set([0, cycles, ...evA.map((e) => e.t), ...evB.map((e) => e.t)].filter((t) => t >= 0 && t <= cycles))).sort((x, y) => x - y)
  const out: LevelInterval[] = []
  for (let i = 0; i + 1 < bps.length; i++) {
    const t0 = bps[i]
    const t1 = bps[i + 1]
    if (t1 - t0 < 1e-9) continue
    const mid = (t0 + t1) / 2
    const va = valueAt(trA, mid)
    const vb = valueAt(trB, mid)
    const same = va === vb
    const last = out[out.length - 1]
    if (last && last.same === same && last.level === (same ? va : null) && Math.abs(last.t1 - t0) < 1e-9) last.t1 = t1
    else out.push({ t0, t1, same, level: same ? va : null })
  }
  return out
}

/**
 * 解析式的 safe window（相對 ph_a 的 rising edge，單位 Tvco）：forward k 步（0 < k < M）
 * 兩者都 high：[k/M, 1/2]；兩者都 low：[1/2 + k/M, 1]；每段寬 1/2 − k/M（k ≥ M/2 時為 0，需改用 backward 的看法）。
 */
export function safeWindows(M: number, k: number): { high: [number, number] | null; low: [number, number] | null; widthEach: number; total: number } {
  const kk = ((k % M) + M) % M
  const w = 0.5 - kk / M
  if (kk === 0) return { high: [0, 0.5], low: [0.5, 1], widthEach: 0.5, total: 1 }
  if (w <= 1e-12) {
    // k ≥ M/2：以 backward（M−k）步看：都 high [0, 1/2 − (M−k)/M]，都 low [1/2, 1 − (M−k)/M]
    const kb = M - kk
    const wb = 0.5 - kb / M
    if (wb <= 1e-12) return { high: null, low: null, widthEach: 0, total: 0 }
    return { high: [0, wb], low: [0.5, 0.5 + wb], widthEach: wb, total: 2 * wb }
  }
  return { high: [kk / M, 0.5], low: [0.5 + kk / M, 1], widthEach: w, total: 2 * w }
}

/** 下游 /2（理想 flop）：pmux_out 每個 rising edge 都 toggle（runt 的 edge 也算） */
export function toggleOnRising(events: { t: number; v: Bit }[]): { t: number; v: Bit }[] {
  const out: { t: number; v: Bit }[] = [{ t: 0, v: 0 }]
  let q: Bit = 0
  let prev: Bit | undefined
  for (const e of events) {
    if (prev === 0 && e.v === 1) {
      q = q ? 0 : 1
      out.push({ t: e.t, v: q })
    }
    prev = e.v
  }
  return out
}

/** 第一個比 minPulse 窄的 pulse（略過從 t = 0 開始的初始段，那不是真的 pulse） */
export function firstRunt(events: { t: number; v: Bit }[], minPulse: number): { t0: number; t1: number; width: number; level: Bit } | null {
  for (let i = 1; i < events.length; i++) {
    const a = events[i - 1]
    const b = events[i]
    if (a.t <= 1e-12) continue
    const w = b.t - a.t
    if (w > 1e-12 && w < minPulse - 1e-12) return { t0: a.t, t1: b.t, width: w, level: a.v }
  }
  return null
}

// ---------------------------------------------------------------- Lesson 5-3：架構 3（/N/N+1 → 8 divided phases → PMUX）的 edge 時間（純函式）

export interface Arch3Step {
  /** 這個 output 週期 divider 走幾個 Tvco（2 或 3） */
  N: number
  /** 這個 output edge 選的 divided phase index（0..7） */
  sel: number
}

/**
 * 架構 3 的 output edge 時間（Tvco 單位）：
 * divider 在 ph0 上產生 edge E_j（E_0 = 0，E_{j+1} = E_j + N_j），8 個 divided phase 是 E_j + i/8，
 * PMUX 選第 sel_j 個 ⇒ t_j = E_j + sel_j/8。間隔 = N_j + (sel_{j+1} − sel_j)/8：backward step 直接變成 N − k/8，不會掉 pulse。
 * 前提：select 在所有 divided phase 同 level 的區間內改變（divided clock 週期長，這個區間很寬）。
 */
export function arch3Edges(steps: Arch3Step[], M = 8): { divEdges: number[]; times: number[]; intervals: number[] } {
  const divEdges: number[] = []
  const times: number[] = []
  let E = 0
  for (const st of steps) {
    divEdges.push(E)
    times.push(E + st.sel / M)
    E += st.N
  }
  const intervals = times.slice(1).map((t, i) => t - times[i])
  return { divEdges, times, intervals }
}

/** 架構 3 的示範腳本：與架構 2 腳本相同的 N / phase 決策（N 是該 output 週期的除數、sel 是該 output edge 用的 phase），第 6 → 7 個 edge 是 backward 2 步（2 → 0） */
export const arch3Script: Arch3Step[] = [
  { N: 2, sel: 0 },
  { N: 3, sel: 0 },
  { N: 3, sel: 1 },
  { N: 2, sel: 1 },
  { N: 2, sel: 2 },
  { N: 2, sel: 2 },
  { N: 3, sel: 2 },
  { N: 3, sel: 0 },
  { N: 3, sel: 0 },
  { N: 3, sel: 0 },
]
