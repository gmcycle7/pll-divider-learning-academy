import type { Netlist } from '@/models/divider/types'
import { and, nor, not, or, xor } from '@/utils/bits'

/**
 * Module 2 專用 netlist。
 * 每一個都在 models.test.ts 以 simulate / measureDivide / buildStateGraph 驗證過：
 * state sequence、divide ratio、duty cycle、unused state 去向。
 */

/**
 * 另一種 /3 編碼：00 → 01 → 11 → 00（state 10 為 unused）。
 * d0 = NOT q1
 * d1 = q0 AND NOT q1 = q0 AND d0（直接重用 inverter 的輸出）
 * unused state 10：d0 = 0、d1 = 0 → 00，一個 cycle 回到主循環。
 * 輸出可選 q1（high 1 cycle，duty 1/3）或 q0（high 2 cycle，duty 2/3）。
 * 注意：若把 d1 寫成單純的 q0，11 會走到 10 而不是 00，變成 Johnson /4。
 */
export const div3Alt: Netlist = {
  id: 'div3-alt',
  name: 'Divide-by-3（00→01→11 編碼）',
  description: '兩個 DFF、一個 inverter、一個 AND：state 序列 00→01→11→00。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
  ],
  gates: [
    { out: 'd0', inputs: ['q1'], fn: (v) => not(v.q1), delay: 6, label: 'INV', kind: 'inv' },
    { out: 'd1', inputs: ['q0', 'd0'], fn: (v) => and(v.q0, v.d0), delay: 10, label: 'AND', kind: 'and' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'q1',
  watch: ['d0', 'd1'],
  equations: [
    { target: 'd0', text: 'd0 = NOT q1', latex: 'd_0 = \\overline{q_1}' },
    { target: 'd1', text: 'd1 = q0 AND NOT q1', latex: 'd_1 = q_0\\,\\overline{q_1}' },
  ],
  legalStates: ['00', '01', '11'],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * Lesson 2-2 練習：把 div3Duty50 的 OR 換成 AND。
 * q1 high：edge k → k+1；q1_f high：k+0.5 → k+1.5；AND 之後 high：k+0.5 → k+1 = 0.5T。
 * 除頻比仍是 3，duty = 0.5/3 = 1/6。
 */
export const div3And: Netlist = {
  id: 'div3-and',
  name: 'Divide-by-3：q1 AND q1_f',
  description: '同樣的 /3 core 與 falling-edge DFF，但輸出改用 AND。',
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
    { out: 'div_out', inputs: ['q1', 'q1_f'], fn: (v) => and(v.q1, v.q1_f), delay: 10, label: 'AND', kind: 'and' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'div_out',
  watch: ['q1_f'],
  equations: [
    { target: 'd0', text: 'd0 = NOT(q1 OR q0)', latex: 'd_0 = \\overline{q_1 + q_0}' },
    { target: 'd1', text: 'd1 = q0', latex: 'd_1 = q_0' },
    { target: 'q1_f', text: 'q1_f = q1 sampled at falling edge', latex: 'q_{1f} \\leftarrow q_1 \\text{ @ clk}\\downarrow' },
    { target: 'div_out', text: 'div_out = q1 AND q1_f', latex: 'div\\_out = q_1 \\cdot q_{1f}' },
  ],
  legalStates: ['00', '01', '10'],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * 與 div3Duty50 相同的電路，但輸入 clock duty = 40%。
 * falling edge 在 k + 0.4T，所以 q1_f high：k+0.4 → k+1.4；OR 之後 high = 1.4T，duty = 1.4/3 ≈ 46.7%。
 */
export const div3Duty50In40: Netlist = {
  id: 'div3-duty50-in40',
  name: 'Divide-by-3 50% duty（輸入 duty 40%）',
  description: '同一個 rising + falling 合成電路，輸入 clock 的 duty 改成 40%。',
  clocks: [{ name: 'clk', duty: 0.4 }],
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

/**
 * /5 with 50% duty。
 * mod-5 counter：000 → 001 → 010 → 011 → 100 → 000（101、110、111 為 unused，皆一個 cycle 回到主循環）
 *   d0 = NOR(q0, q2)
 *   d1 = q1 XOR q0
 *   d2 = q1 AND q0
 * q1 在 010、011 兩個 state 為 high（2T）。q1 經 falling-edge DFF 延遲 T/2 得 q1_f，
 * div_out = q1 OR q1_f → high 2T + 0.5T = 2.5T，週期 5T → duty 50%。
 */
export const div5Duty50: Netlist = {
  id: 'div5-duty50',
  name: 'Divide-by-5 with 50% duty',
  description: 'mod-5 counter 的 q1（high 2T）加 falling-edge DFF 與 OR，得到 2.5T 的高電位。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
    { q: 'q2', d: 'd2', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF2' },
    { q: 'q1_f', d: 'q1', clk: 'clk', edge: 'falling', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF_f (falling)' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0', 'q2'], fn: (v) => nor(v.q0, v.q2), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'd1', inputs: ['q0', 'q1'], fn: (v) => xor(v.q1, v.q0), delay: 12, label: 'XOR', kind: 'xor' },
    { out: 'd2', inputs: ['q0', 'q1'], fn: (v) => and(v.q1, v.q0), delay: 10, label: 'AND', kind: 'and' },
    { out: 'div_out', inputs: ['q1', 'q1_f'], fn: (v) => or(v.q1, v.q1_f), delay: 10, label: 'OR', kind: 'or' },
  ],
  stateOrder: ['q2', 'q1', 'q0'],
  output: 'div_out',
  watch: ['q1_f'],
  equations: [
    { target: 'd0', text: 'd0 = NOT(q0 OR q2)', latex: 'd_0 = \\overline{q_0 + q_2}' },
    { target: 'd1', text: 'd1 = q1 XOR q0', latex: 'd_1 = q_1 \\oplus q_0' },
    { target: 'd2', text: 'd2 = q1 AND q0', latex: 'd_2 = q_1 q_0' },
    { target: 'q1_f', text: 'q1_f = q1 sampled at falling edge', latex: 'q_{1f} \\leftarrow q_1 \\text{ @ clk}\\downarrow' },
    { target: 'div_out', text: 'div_out = q1 OR q1_f', latex: 'div\\_out = q_1 + q_{1f}' },
  ],
  legalStates: ['000', '001', '010', '011', '100'],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * /5 with 50% duty，但「high 2T 的訊號」不是單一 state bit，而是用 decode 產生：
 *   p = (q1 AND q0) OR q2   → 在 state 011、100 為 high（也是 2T）
 * 理想模式下與 div5Duty50 一樣（ratio 5、duty 50%）。
 * 實際 delay 模式下，FF0 的 tCQ（14 ps，fanout 較大）比 FF1（6 ps）慢：在 001 → 010 時 q1 先變 1、q0 才變 0，
 * AND 會短暫輸出 1 → p 出現 runt pulse → div_out 也跟著 glitch（p_f 此時為 0，遮不住）。
 * 用來示範：output decode 由多個同時翻轉的 state bit 組成時的 hazard。
 */
export const div5DecodeGlitch: Netlist = {
  id: 'div5-decode-glitch',
  name: 'Divide-by-5 50% duty（decode 版，有 hazard）',
  description: 'high 2T 的訊號改由 (q1 AND q0) OR q2 decode，實際 delay 模式會出現 runt pulse。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 14, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 6, label: 'FF1' },
    { q: 'q2', d: 'd2', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF2' },
    { q: 'p_f', d: 'p', clk: 'clk', edge: 'falling', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF_f (falling)' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0', 'q2'], fn: (v) => nor(v.q0, v.q2), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'd1', inputs: ['q0', 'q1'], fn: (v) => xor(v.q1, v.q0), delay: 12, label: 'XOR', kind: 'xor' },
    { out: 'd2', inputs: ['q0', 'q1'], fn: (v) => and(v.q1, v.q0), delay: 10, label: 'AND', kind: 'and' },
    { out: 'a', inputs: ['q0', 'q1'], fn: (v) => and(v.q1, v.q0), delay: 6, label: 'AND (decode)', kind: 'and' },
    { out: 'p', inputs: ['a', 'q2'], fn: (v) => or(v.a, v.q2), delay: 4, label: 'OR (decode)', kind: 'or' },
    { out: 'div_out', inputs: ['p', 'p_f'], fn: (v) => or(v.p, v.p_f), delay: 4, label: 'OR', kind: 'or' },
  ],
  stateOrder: ['q2', 'q1', 'q0'],
  output: 'div_out',
  watch: ['p', 'p_f'],
  equations: [
    { target: 'd0', text: 'd0 = NOT(q0 OR q2)', latex: 'd_0 = \\overline{q_0 + q_2}' },
    { target: 'd1', text: 'd1 = q1 XOR q0', latex: 'd_1 = q_1 \\oplus q_0' },
    { target: 'd2', text: 'd2 = q1 AND q0', latex: 'd_2 = q_1 q_0' },
    { target: 'p', text: 'p = (q1 AND q0) OR q2', latex: 'p = q_1 q_0 + q_2' },
    { target: 'p_f', text: 'p_f = p sampled at falling edge', latex: 'p_f \\leftarrow p \\text{ @ clk}\\downarrow' },
    { target: 'div_out', text: 'div_out = p OR p_f', latex: 'div\\_out = p + p_f' },
  ],
  legalStates: ['000', '001', '010', '011', '100'],
  defaultDelays: { tcq: 8, gate: 6 },
}
