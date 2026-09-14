import type { Netlist } from '../types'
import { and, not, nor, or } from '@/utils/bits'

/**
 * 同步 /2 /3 dual-modulus cell（教學版）
 *
 * state (q1 q0)
 *   mod = 0（/2）：00 → 01 → 00 → …           週期 2
 *   mod = 1（/3）：00 → 01 → 10 → 00 → …      週期 3
 *
 * next-state：
 *   d0 = NOT(q0 OR q1)              = NOR(q1, q0)
 *   d1 = q0 AND mod
 * 輸出 div_out = q0 OR q1 → mod=0：0,1,0,1（/2，50%）；mod=1：0,1,1,0,1,1（/3，duty 2/3）
 *   →  改用 div_out = NOT q0 AND NOT q1 = d0：每個循環在 state 00 時 high 一個 cycle。
 * 這裡採用 div_out = q1_or_q0 的反相，也就是 div_out = d0（state==00 時 high）。
 *
 * 說明：每個 output rising edge 之間的距離，mod=0 時是 2T，mod=1 時是 3T，
 *      且兩種 interval 都從同一個 state 00 開始 ⇒ phase-continuous。
 */
export const dualMod23: Netlist = {
  id: 'dm23',
  name: '/2 /3 Dual-Modulus Cell',
  description: '兩個 DFF，mod=0 走 00→01→00，mod=1 走 00→01→10→00。',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'mod', initial: 0, description: 'mod=0：/2；mod=1：/3' }],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0', 'q1'], fn: (v) => nor(v.q0, v.q1), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'd1', inputs: ['q0', 'mod'], fn: (v) => and(v.q0, v.mod), delay: 10, label: 'AND', kind: 'and' },
    { out: 'div_out', inputs: ['d0'], fn: (v) => v.d0, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'div_out',
  watch: ['d1'],
  equations: [
    { target: 'd0', text: 'd0 = NOT(q1 OR q0)', latex: 'd_0 = \\overline{q_1 + q_0}' },
    { target: 'd1', text: 'd1 = q0 AND mod', latex: 'd_1 = q_0 \\cdot mod' },
    { target: 'div_out', text: 'div_out = NOT(q1 OR q0)  (= d0，state 00 時為 1)', latex: 'div\\_out = \\overline{q_1 + q_0}' },
  ],
  legalStates: ['00', '01', '10'],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * 「錯誤」做法 B：獨立 /2 與 /3 divider 各自跑，再用 MUX 依 mod 選輸出。
 * 兩個 divider 的 phase 各自獨立，切換 mod 時輸出可能出現 phase jump / runt。
 */
export const muxSelect23: Netlist = {
  id: 'mux23',
  name: '獨立 /2 與 /3 再用 MUX 選（錯誤示範）',
  description: '兩個 divider 自由跑，輸出由 combinational MUX 依 mod 選擇。',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'mod', initial: 0, description: '0 選 /2 輸出，1 選 /3 輸出' }],
  flops: [
    { q: 'a0', d: 'da0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: '/2 FF' },
    { q: 'b0', d: 'db0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: '/3 FF0' },
    { q: 'b1', d: 'db1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: '/3 FF1' },
  ],
  gates: [
    { out: 'da0', inputs: ['a0'], fn: (v) => not(v.a0), delay: 6, label: 'INV', kind: 'inv' },
    { out: 'db0', inputs: ['b0', 'b1'], fn: (v) => nor(v.b0, v.b1), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'db1', inputs: ['b0'], fn: (v) => v.b0, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'out2', inputs: ['a0'], fn: (v) => v.a0, delay: 0, label: '/2 out', kind: 'buf' },
    { out: 'out3', inputs: ['db0'], fn: (v) => v.db0, delay: 0, label: '/3 out', kind: 'buf' },
    { out: 'div_out', inputs: ['out2', 'out3', 'mod'], fn: (v) => (v.mod ? v.out3 : v.out2), delay: 8, label: 'MUX', kind: 'mux' },
  ],
  stateOrder: ['b1', 'b0', 'a0'],
  output: 'div_out',
  watch: ['out2', 'out3'],
  equations: [
    { target: 'da0', text: 'da0 = NOT a0', latex: 'd_{a0} = \\overline{a_0}' },
    { target: 'db0', text: 'db0 = NOR(b1, b0)', latex: 'd_{b0} = \\overline{b_1 + b_0}' },
    { target: 'db1', text: 'db1 = b0', latex: 'd_{b1} = b_0' },
    { target: 'div_out', text: 'div_out = mod ? out3 : out2', latex: 'div\\_out = mod\\,?\\,out_3 : out_2' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * /1 /2 dual-modulus 概念模型（pulse-swallow 觀點）
 * 用一個 toggle FF 產生 /2，並以 sel 決定輸出是否「跳過」一個 edge。
 *   sel=0：/1 → div_out 跟隨 clk（每個 input cycle 一個 output event）
 *   sel=1：/2 → div_out 只在 q0=1 時放行 clk 的 high pulse
 * 這裡 en 由 rising-edge DFF 重新同步（en_s），避免 combinational clock gating 在 clk=1 時切換 → glitch。
 * 注意：這是 behavioral 概念模型，實際 gate 需要 latch-based clock gating。
 */
export const dualMod12: Netlist = {
  id: 'dm12',
  name: '/1 /2 Dual-Modulus（edge gating 概念）',
  description: 'sel=0 每個 clk cycle 都輸出一個 pulse；sel=1 每兩個 cycle 輸出一個。',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'sel', initial: 0, description: 'sel=0：/1；sel=1：/2' }],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0 (toggle)' },
    { q: 'en', d: 'd_en', clk: 'clk', edge: 'falling', rstn: 'rst_n', resetValue: 1, tcq: 8, label: 'FF_EN (falling)' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV', kind: 'inv' },
    // en 為 1 時放行下一個 high pulse：sel=0 永遠放行；sel=1 只在 q0=1 時放行
    { out: 'd_en', inputs: ['sel', 'q0'], fn: (v) => or(not(v.sel), v.q0), delay: 10, label: 'OR', kind: 'or' },
    { out: 'div_out', inputs: ['clk', 'en'], fn: (v) => and(v.clk, v.en), delay: 6, label: 'AND (gate)', kind: 'and' },
  ],
  stateOrder: ['en', 'q0'],
  output: 'div_out',
  watch: ['d_en'],
  stepEdge: 'rising',
  equations: [
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
    { target: 'd_en', text: 'd_en = NOT sel OR q0   (sampled at clk falling edge)', latex: 'd_{en} = \\overline{sel} + q_0' },
    { target: 'div_out', text: 'div_out = clk AND en', latex: 'div\\_out = clk \\cdot en' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * 錯誤示範：combinational clock gating，en 直接由 sel 與 q0 組合（沒有 falling-edge 重同步）。
 * q0 在 clk rising 後 tcq 才改變，en 隨之在 clk=1 期間改變 ⇒ runt pulse。
 */
export const dualMod12Glitchy: Netlist = {
  id: 'dm12-glitch',
  name: '/1 /2（combinational gating，會 glitch）',
  description: 'en 沒有經過 falling-edge 重同步，直接 AND clk。',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'sel', initial: 0 }],
  flops: [{ q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' }],
  gates: [
    { out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV', kind: 'inv' },
    { out: 'en', inputs: ['sel', 'q0'], fn: (v) => or(not(v.sel), v.q0), delay: 10, label: 'OR', kind: 'or' },
    { out: 'div_out', inputs: ['clk', 'en'], fn: (v) => and(v.clk, v.en), delay: 6, label: 'AND', kind: 'and' },
  ],
  stateOrder: ['q0'],
  output: 'div_out',
  watch: ['en'],
  equations: [
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
    { target: 'en', text: 'en = NOT sel OR q0  (combinational)', latex: 'en = \\overline{sel} + q_0' },
    { target: 'div_out', text: 'div_out = clk AND en', latex: 'div\\_out = clk \\cdot en' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}
