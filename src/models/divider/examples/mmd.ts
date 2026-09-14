import type { Netlist } from '../types'
import { and, nor } from '@/utils/bits'

/**
 * 兩級 /2 /3 cell 串接的 multi-modulus divider（modular MMD，Vaucher 型式的簡化教學版）
 *
 * Cell 1（高速級）：state (a1 a0)，clock = clk
 *   da0 = NOR(a1, a0)
 *   da1 = a0 AND mod1_eff,  其中 mod1_eff = p0 AND mod_in1（只有下一級要求時才 swallow）
 *   cell1 輸出 f1 = NOR(a1,a0)（state 00 時為 1）；作為 cell 2 的 clock
 *   cell1 的 modulus 請求 mod_in1 來自 cell 2 的 mod_out2
 *
 * Cell 2（低速級）：state (b1 b0)，clock = f1（rising）
 *   db0 = NOR(b1, b0)
 *   db1 = b0 AND p1
 *   cell2 輸出 f2 = NOR(b1,b0)；mod_out2 = f2（cell2 在其 state 00 那一個 f1 週期，要求 cell1 執行一次 /3）
 *
 * 總除數 N = 4 + 2·p1 + p0 ∈ {4,5,6,7}
 *   推導：cell2 每個週期用 (2 + p1) 個 f1 cycle；其中 1 個 f1 cycle（mod_out2=1）cell1 走 /3（若 p0=1），其餘走 /2
 *   N = 2·(2+p1) + p0·1 = 4 + 2p1 + p0
 */
export const mmd2: Netlist = {
  id: 'mmd2',
  name: '兩級 /2 /3 MMD（/4 ~ /7）',
  description: '兩個 /2 /3 cell 串接，p0 與 p1 控制總除數 N = 4 + 2·p1 + p0。',
  clocks: [{ name: 'clk' }],
  inputs: [
    { name: 'p0', initial: 0, description: 'cell 1 的 modulus bit（LSB）' },
    { name: 'p1', initial: 0, description: 'cell 2 的 modulus bit' },
  ],
  flops: [
    { q: 'a0', d: 'da0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'C1.FF0' },
    { q: 'a1', d: 'da1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'C1.FF1' },
    { q: 'b0', d: 'db0', clk: 'f1', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'C2.FF0' },
    { q: 'b1', d: 'db1', clk: 'f1', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'C2.FF1' },
  ],
  gates: [
    { out: 'f1', inputs: ['a0', 'a1'], fn: (v) => nor(v.a0, v.a1), delay: 12, label: 'C1 NOR', kind: 'nor' },
    { out: 'da0', inputs: ['f1'], fn: (v) => v.f1, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'mod_out2', inputs: ['b0', 'b1'], fn: (v) => nor(v.b0, v.b1), delay: 12, label: 'C2 NOR', kind: 'nor' },
    { out: 'f2', inputs: ['mod_out2'], fn: (v) => v.mod_out2, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'db0', inputs: ['mod_out2'], fn: (v) => v.mod_out2, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'mod1_eff', inputs: ['p0', 'mod_out2'], fn: (v) => and(v.p0, v.mod_out2), delay: 10, label: 'C1 AND(p0)', kind: 'and' },
    { out: 'da1', inputs: ['a0', 'mod1_eff'], fn: (v) => and(v.a0, v.mod1_eff), delay: 10, label: 'C1 AND', kind: 'and' },
    { out: 'db1', inputs: ['b0', 'p1'], fn: (v) => and(v.b0, v.p1), delay: 10, label: 'C2 AND', kind: 'and' },
    { out: 'div_out', inputs: ['f2'], fn: (v) => v.f2, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['b1', 'b0', 'a1', 'a0'],
  output: 'div_out',
  watch: ['f1', 'mod_out2', 'mod1_eff'],
  equations: [
    { target: 'da0', text: 'da0 = NOR(a1, a0)  (= f1)', latex: 'd_{a0} = \\overline{a_1 + a_0} = f_1' },
    { target: 'da1', text: 'da1 = a0 AND p0 AND mod_out2', latex: 'd_{a1} = a_0 \\cdot p_0 \\cdot mod\\_out_2' },
    { target: 'db0', text: 'db0 = NOR(b1, b0)  (= mod_out2 = f2)', latex: 'd_{b0} = \\overline{b_1 + b_0} = mod\\_out_2' },
    { target: 'db1', text: 'db1 = b0 AND p1', latex: 'd_{b1} = b_0 \\cdot p_1' },
    { target: 'N', text: 'N = 4 + 2·p1 + p0', latex: 'N = 4 + 2p_1 + p_0' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/** 給 MMD 用的 helper：由 p bits 算理論除數 */
export function mmdRatio(p: number[]): number {
  const n = p.length
  let N = 1 << n
  for (let i = 0; i < n; i++) N += p[i] << i
  return N
}
