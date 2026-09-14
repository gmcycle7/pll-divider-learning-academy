import type { Netlist } from '../types'
import { and, not, nor, or } from '@/utils/bits'

/**
 * /3 state machine：00 → 01 → 10 → 00，state 11 為 unused。
 * d0 = NOT(q0 OR q1) = NOR(q1, q0)
 * d1 = q0
 * 最簡版本：state 11 → next = (q0=1 → d1=1, d0=NOR=0) = 10 → 回到主循環（自復原）。
 * 輸出 div_out = q1（high 1 個 cycle，low 2 個 cycle，duty = 1/3）。
 */
export const div3: Netlist = {
  id: 'div3',
  name: 'Divide-by-3 State Machine',
  description: '兩個 DFF 的 /3 counter，state 序列 00→01→10→00。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0', 'q1'], fn: (v) => nor(v.q0, v.q1), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'd1', inputs: ['q0'], fn: (v) => v.q0, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'q1',
  watch: ['d0'],
  equations: [
    { target: 'd0', text: 'd0 = NOT(q1 OR q0)', latex: 'd_0 = \\overline{q_1 + q_0}' },
    { target: 'd1', text: 'd1 = q0', latex: 'd_1 = q_0' },
  ],
  legalStates: ['00', '01', '10'],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * 有 lock-up 問題的 /3：使用 d1 = q0 AND NOT q1，d0 = NOT q0 AND NOT q1... 但故意把 11 設計成 → 11
 * d0 = NOR(q1,q0) OR (q1 AND q0)   → 11 時 d0 = 1
 * d1 = q0                            → 11 時 d1 = 1  ⇒ 11 → 11 lock-up
 */
export const div3Lockup: Netlist = {
  id: 'div3-lockup',
  name: 'Divide-by-3（有 lock-up state）',
  description: 'state 11 會自己跳回 11，永遠不回到主循環。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0', 'q1'], fn: (v) => or(nor(v.q0, v.q1), and(v.q0, v.q1)), delay: 14, label: 'XNOR', kind: 'xnor' },
    { out: 'd1', inputs: ['q0'], fn: (v) => v.q0, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'q1',
  equations: [
    { target: 'd0', text: 'd0 = XNOR(q1, q0)', latex: 'd_0 = \\overline{q_1 \\oplus q_0}' },
    { target: 'd1', text: 'd1 = q0', latex: 'd_1 = q_0' },
  ],
  legalStates: ['00', '01', '10'],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * 修正版：d0 = NOT q0 AND NOT q1（與原本相同），d1 = q0 AND NOT q1。
 * 11 → (d1 = 0, d0 = 0) = 00：一個 cycle 回到主循環。
 */
export const div3Recover: Netlist = {
  id: 'div3-recover',
  name: 'Divide-by-3（self-recovering）',
  description: 'state 11 一個 cycle 內回到 00。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0', 'q1'], fn: (v) => nor(v.q0, v.q1), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'd1', inputs: ['q0', 'q1'], fn: (v) => and(v.q0, not(v.q1)), delay: 14, label: 'AND', kind: 'and' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'q1',
  equations: [
    { target: 'd0', text: 'd0 = NOT(q1 OR q0)', latex: 'd_0 = \\overline{q_1 + q_0}' },
    { target: 'd1', text: 'd1 = q0 AND NOT q1', latex: 'd_1 = q_0 \\overline{q_1}' },
  ],
  legalStates: ['00', '01', '10'],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * /3 with 50% duty：在 q1 上再用 falling-edge FF 延遲半個 cycle，div_out = q1 OR q1_half。
 * q1 high 1 cycle（從 edge k 到 k+1），q1d 在 falling edge 抓 q1 → high 從 k+0.5 到 k+1.5
 * OR 之後 high 從 k 到 k+1.5 = 1.5 cycle，週期 3 → duty 50%。
 */
export const div3Duty50: Netlist = {
  id: 'div3-duty50',
  name: 'Divide-by-3 with 50% duty',
  description: '在 /3 的 q1 後加一個 falling-edge DFF，q1 OR q1_f 得到 1.5 cycle 高電位。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
    { q: 'q1_f', d: 'q1', clk: 'clk', edge: 'falling', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF2 (falling)' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0', 'q1'], fn: (v) => nor(v.q0, v.q1), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'd1', inputs: ['q0'], fn: (v) => v.q0, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'div_out', inputs: ['q1', 'q1_f'], fn: (v) => or(v.q1, v.q1_f), delay: 10, label: 'OR', kind: 'or' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'div_out',
  watch: ['q1_f'],
  equations: [
    { target: 'd0', text: 'd0 = NOT(q1 OR q0)', latex: 'd_0 = \\overline{q_1 + q_0}' },
    { target: 'd1', text: 'd1 = q0', latex: 'd_1 = q_0' },
    { target: 'q1_f', text: 'q1_f = q1 sampled at falling edge', latex: 'q_{1f} \\leftarrow q_1 \\text{ @ clk}\\downarrow' },
    { target: 'div_out', text: 'div_out = q1 OR q1_f', latex: 'div\\_out = q_1 + q_{1f}' },
  ],
  legalStates: ['00', '01', '10'],
  defaultDelays: { tcq: 8, gate: 6 },
}
