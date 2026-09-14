import type { Bit, Netlist, SignalTrace } from '@/models/divider/types'
import { simulate } from '@/models/divider/engine'
import { detectRuntPulses, measureDivide, valueAt, type PulseInfo } from '@/models/divider/analysis'
import { dualMod12, dualMod23, muxSelect23 } from '@/models/divider/examples'
import { and, nor, not, or } from '@/utils/bits'

/** Module 3 共用的時間常數（ps） */
export const T = 100
export const T_CQ = 8
export const T_CQ_MIN = 5
export const T_NOR = 12
export const T_AND = 10
export const T_AND_MIN = 7
export const T_SETUP = 7
export const T_HOLD = 3
/**
 * Lesson 3-3 的 /1 /2 gating cell（dualMod12 / dualMod12Glitchy）用的 gate delay，
 * 與 Lesson 3-2 的 dm23 是不同的 gate：這裡的 clock-gating AND 只有 6 ps、重同步用的 OR 是 10 ps。
 * 不要與 T_AND（dm23 裡 d1 = q0·mod 的 AND，10 ps）混用。
 */
export const T_AND_GATE = 6
export const T_OR_GATE = 10
/** 下游 flop 能可靠觸發的最小 pulse width（ps）：比它窄就算 runt */
export const MIN_PULSE = 30

// ---------------------------------------------------------------- 變體 netlist（Lesson 3-2 練習）

/**
 * 變體 1：把 div_out 改接到 q1。
 * mod = 1 時 q1 每三個 cycle 高一次（/3, duty 1/3）；
 * mod = 0 時 state 只在 00 ↔ 01 之間，q1 永遠是 0 ⇒ 輸出沒有任何 edge。
 * 教學重點：output decode 必須取自「兩種 mode 都會經過的 state」。
 */
export const dm23OutQ1: Netlist = {
  ...dualMod23,
  id: 'dm23-out-q1',
  name: '/2 /3 cell（div_out = q1）',
  description: '同樣的 next-state logic，但輸出改取 q1。',
  gates: [
    { out: 'd0', inputs: ['q0', 'q1'], fn: (v) => nor(v.q0, v.q1), delay: T_NOR, label: 'NOR', kind: 'nor' },
    { out: 'd1', inputs: ['q0', 'mod'], fn: (v) => and(v.q0, v.mod), delay: T_AND, label: 'AND', kind: 'and' },
    { out: 'div_out', inputs: ['q1'], fn: (v) => v.q1, delay: 0, label: 'wire', kind: 'buf' },
  ],
  watch: ['d1'],
  equations: [
    { target: 'd0', text: 'd0 = NOT(q1 OR q0)', latex: 'd_0 = \\overline{q_1 + q_0}' },
    { target: 'd1', text: 'd1 = q0 AND mod', latex: 'd_1 = q_0 \\cdot mod' },
    { target: 'div_out', text: 'div_out = q1', latex: 'div\\_out = q_1' },
  ],
}

/**
 * 變體 2：div_out = q0（state 01 時為 1）。
 * 01 在兩種 mode 都會經過，所以仍然 phase-continuous；只是 output edge 比原版晚一個 Tin。
 */
export const dm23OutQ0: Netlist = {
  ...dualMod23,
  id: 'dm23-out-q0',
  name: '/2 /3 cell（div_out = q0）',
  description: '輸出改取 q0：state 01 時為 1。',
  gates: [
    { out: 'd0', inputs: ['q0', 'q1'], fn: (v) => nor(v.q0, v.q1), delay: T_NOR, label: 'NOR', kind: 'nor' },
    { out: 'd1', inputs: ['q0', 'mod'], fn: (v) => and(v.q0, v.mod), delay: T_AND, label: 'AND', kind: 'and' },
    { out: 'div_out', inputs: ['q0'], fn: (v) => v.q0, delay: 0, label: 'wire', kind: 'buf' },
  ],
  watch: ['d1'],
  equations: [
    { target: 'd0', text: 'd0 = NOT(q1 OR q0)', latex: 'd_0 = \\overline{q_1 + q_0}' },
    { target: 'd1', text: 'd1 = q0 AND mod', latex: 'd_1 = q_0 \\cdot mod' },
    { target: 'div_out', text: 'div_out = q0', latex: 'div\\_out = q_0' },
  ],
}

/**
 * 變體 3：把 mod 改接到 d0 的邏輯（d1 = q0 固定）。
 *   d0 = NOR(q1, q0) OR (NOT mod AND q1)
 *   mod = 1：d0 = NOR(q1,q0) ⇒ 00 → 01 → 10 → 00（/3）
 *   mod = 0：00 → 01 → 10 → 01 → 10 …：主循環 01 ↔ 10（/2），00 只是 transient，
 *            而且 state 11 → 11 變成 lock-up（d1 = q0 = 1，d0 = q1 = 1）。
 * 輸出取 q0（01 時為 1）才在兩個 mode 都有 edge；若仍用 NOR(q1,q0) decode，/2 mode 永遠沒有輸出。
 */
export const dm23ModOnD0: Netlist = {
  ...dualMod23,
  id: 'dm23-mod-d0',
  name: '/2 /3 變體（mod 接到 d0 邏輯）',
  description: 'd1 = q0，mod 改成控制 d0：mod=1 走 /3，mod=0 走 01 ↔ 10。',
  gates: [
    { out: 'd0', inputs: ['q0', 'q1', 'mod'], fn: (v) => or(nor(v.q0, v.q1), and(not(v.mod), v.q1)), delay: 14, label: 'AOI', kind: 'custom' },
    { out: 'd1', inputs: ['q0'], fn: (v) => v.q0, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'div_out', inputs: ['q0'], fn: (v) => v.q0, delay: 0, label: 'wire', kind: 'buf' },
  ],
  watch: [],
  equations: [
    { target: 'd0', text: 'd0 = NOR(q1, q0) OR (NOT mod AND q1)', latex: 'd_0 = \\overline{q_1 + q_0} + \\overline{mod}\\,q_1' },
    { target: 'd1', text: 'd1 = q0', latex: 'd_1 = q_0' },
    { target: 'div_out', text: 'div_out = q0', latex: 'div\\_out = q_0' },
  ],
  legalStates: undefined,
}

// ---------------------------------------------------------------- 變體 netlist（Lesson 3-3 練習）

/**
 * 把 dualMod12 的 en flop 改成 rising-edge：en 與 q0 在同一個 rising edge 之後 tCQ 才改變，
 * 此時 clk 已經是 1，AND 輸出會先跟著 clk 拉高、再被 en 拉低 ⇒ 每兩個 cycle 一個 8 ps 的 runt。
 */
export const dm12RisingEn: Netlist = {
  ...dualMod12,
  id: 'dm12-rising-en',
  name: '/1 /2（en 改用 rising-edge FF，會 glitch）',
  description: 'en 在 clk rising edge 之後 tCQ 才變，落在 clk = 1 期間。',
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: T_CQ, label: 'FF0 (toggle)' },
    { q: 'en', d: 'd_en', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 1, tcq: T_CQ, label: 'FF_EN (rising)' },
  ],
  equations: [
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
    { target: 'd_en', text: 'd_en = NOT sel OR q0   (sampled at clk RISING edge)', latex: 'd_{en} = \\overline{sel} + q_0' },
    { target: 'div_out', text: 'div_out = clk AND en', latex: 'div\\_out = clk \\cdot en' },
  ],
}

// ---------------------------------------------------------------- 純函數 helper（Widgets 與測試共用）

export interface SwitchRun {
  traces: SignalTrace[]
  risingTimes: number[]
  intervals: number[]
  runts: PulseInfo[]
}

export interface ModSwitchOptions {
  /** 在第幾個 clock edge 之前切換 mod */
  k: number
  /** 切換時間相對該 edge 的提前量（ps，正值 = edge 之前） */
  tau: number
  dir: '0to1' | '1to0'
  mode: 'ideal' | 'real'
  edges?: number
}

/** 用同一個 mod 切換序列驅動一個 netlist，回傳波形、output rising edge interval、runt */
export function runModSwitch(netlist: Netlist, signals: string[], opts: ModSwitchOptions): SwitchRun {
  const { k, tau, dir, mode, edges = 12 } = opts
  const before: Bit = dir === '0to1' ? 0 : 1
  const after: Bit = dir === '0to1' ? 1 : 0
  const { sim, traces } = simulate(netlist, edges, { period: T, delayMode: mode, inputLead: tau / T }, (e) => ({ mod: e >= k ? after : before }))
  const out = traces.find((t) => t.name === netlist.output)!
  const m = measureDivide(out, T, 0)
  // 第一個 clock edge 之前（reset 期間）的 level 變化不算 output edge：
  // 例如 B 在 reset state 時 out3 = NOR(0,0) = 1，若 mod 一開始就選到 out3，
  // MUX 會在 t < T 冒出一個與任何 clock edge 無關的 rising edge。
  const risingTimes = m.risingTimes.filter((t) => t >= T - 1e-9)
  const intervals = risingTimes.slice(1).map((t, i) => round6((t - risingTimes[i]) / T))
  const runts = detectRuntPulses([out], MIN_PULSE).filter((r) => r.t0 >= T - 1e-9)
  return { traces: sim.getTraces(signals), risingTimes, intervals, runts }
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6

/** Lesson 3-1：A（state-continuous）與 B（MUX 選輸出）吃同一個切換序列 */
export function runModSwitchCompare(opts: ModSwitchOptions): { a: SwitchRun; b: SwitchRun; tSwitch: number; tEnd: number } {
  const a = runModSwitch(dualMod23, ['clk', 'mod', 'q1', 'q0', 'div_out'], opts)
  const b = runModSwitch(muxSelect23, ['clk', 'mod', 'out2', 'out3', 'div_out'], opts)
  return { a, b, tSwitch: opts.k * T - opts.tau, tEnd: (opts.edges ?? 12) * T }
}

/** interval 是否為合法的 dual-modulus interval（恰好 2T 或 3T） */
export const isLegal23 = (iv: number) => Math.abs(iv - 2) < 1e-6 || Math.abs(iv - 3) < 1e-6

export type ScanKind = 'early' | 'violation' | 'late'

export interface ModScanResult {
  kind: ScanKind
  /** mod 實際切換的時間（ps） */
  tSwitch: number
  /** d1 到達 FF1.D 的時間（用 max delay） */
  tD1: number
  /** 這次掃描的 capture edge（edge 4，t = 400） */
  tCapture: number
  /** 安全 deadline：capture − tsetup − tAND */
  tDeadline: number
  /** hold 邊界：capture + thold − tAND,min */
  tHoldEdge: number
  traces: SignalTrace[]
  intervals: number[]
  risingTimes: number[]
}

export const SCAN_CAPTURE_EDGE = 4
export const SCAN_T_CAPTURE = SCAN_CAPTURE_EDGE * T

/**
 * Lesson 3-2：固定在 state 01 的那個 cycle（edge 3 → edge 4），掃描 mod 0→1 的切換時間 tau（相對 edge 4，負值 = 之前）。
 * 用 real delay 模式模擬，並用 setup/hold 判定該次切換屬於哪一類。
 */
export function modTimingScan(tau: number): ModScanResult {
  const tCapture = SCAN_T_CAPTURE
  const tSwitch = tCapture + tau
  const tD1 = tSwitch + T_AND
  const tDeadline = tCapture - T_SETUP - T_AND
  const tHoldEdge = tCapture + T_HOLD - T_AND_MIN
  const kind: ScanKind = tSwitch <= tDeadline ? 'early' : tSwitch >= tHoldEdge ? 'late' : 'violation'
  // 用 inputLead 控制 input 生效時間：tau < 0 ⇒ 在 edge 4 前 |tau|；tau ≥ 0 ⇒ 在 edge 5 前 (T − tau)
  const late = tau >= 0
  const lead = late ? 1 - tau / T : -tau / T
  const kSw = late ? SCAN_CAPTURE_EDGE + 1 : SCAN_CAPTURE_EDGE
  const { sim, traces } = simulate(dualMod23, 9, { period: T, delayMode: 'real', inputLead: lead }, (e) => ({ mod: e >= kSw ? 1 : 0 }))
  const out = traces.find((t) => t.name === 'div_out')!
  const m = measureDivide(out, T, 0)
  return { kind, tSwitch, tD1, tCapture, tDeadline, tHoldEdge, traces: sim.getTraces(['clk', 'mod', 'd1', 'q0', 'q1', 'div_out']), intervals: m.intervals, risingTimes: m.risingTimes }
}

export interface EdgePass {
  edge: number
  t: number
  passed: boolean
}

export interface Div12Timeline {
  edges: EdgePass[]
  traces: SignalTrace[]
  /** 切換後第一個狀態改變的 edge（0→1：第一個被 skip 的；1→0：第一個重新放行的） */
  firstChanged: number | null
  intervals: number[]
  tSwitch: number
}

/**
 * Lesson 3-3：/1 /2 的 edge scheduling。sel 在第 k 個 edge 前切換（inputLead 0.35T），
 * 逐個 input edge 檢查 div_out 是否放行了那個 high pulse。
 */
export function div12Timeline(netlist: Netlist, opts: { k: number; dir: '0to1' | '1to0'; edges?: number; mode?: 'ideal' | 'real' }): Div12Timeline {
  const { k, dir, edges = 10, mode = 'ideal' } = opts
  const before: Bit = dir === '0to1' ? 0 : 1
  const after: Bit = dir === '0to1' ? 1 : 0
  const { sim, traces } = simulate(netlist, edges, { period: T, delayMode: mode }, (e) => ({ sel: e >= k ? after : before }))
  const out = traces.find((t) => t.name === netlist.output)!
  const list: EdgePass[] = []
  for (let n = 1; n <= edges; n++) {
    const t = n * T
    // clk high pulse 的中段（rising + 0.3T）看 div_out 是否放行
    list.push({ edge: n, t, passed: valueAt(out, t + 0.3 * T) === 1 })
  }
  let firstChanged: number | null = null
  for (const e of list) {
    if (e.edge < k) continue
    if (dir === '0to1' && !e.passed) {
      firstChanged = e.edge
      break
    }
    if (dir === '1to0') {
      // 1→0：找切換後第一個「連續兩個 edge 都放行」的起點
      const nxt = list.find((x) => x.edge === e.edge + 1)
      if (e.passed && nxt?.passed) {
        firstChanged = nxt.edge
        break
      }
    }
  }
  const m = measureDivide(out, T, 0)
  return { edges: list, traces: sim.getTraces(['clk', 'sel', 'q0', 'en', 'div_out'].filter((n) => sim.getTraces([n]).length)), firstChanged, intervals: m.intervals, tSwitch: k * T - 0.35 * T }
}

/** Lesson 3-3：good / glitchy / rising-en 三種 gating 在 real delay 下的 runt 比較 */
export function gatingRun(netlist: Netlist, opts: { k: number; mode: 'ideal' | 'real'; edges?: number }): SwitchRun {
  const { k, mode, edges = 8 } = opts
  const { sim, traces } = simulate(netlist, edges, { period: T, delayMode: mode }, (e) => ({ sel: e >= k ? 1 : 0 }))
  const out = traces.find((t) => t.name === netlist.output)!
  const m = measureDivide(out, T, 0)
  const names = ['clk', 'sel', 'q0', 'en', 'd_en', 'div_out']
  return { traces: sim.getTraces(names), risingTimes: m.risingTimes, intervals: m.intervals, runts: detectRuntPulses([out], MIN_PULSE) }
}
