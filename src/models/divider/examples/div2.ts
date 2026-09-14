import type { Netlist } from '../types'
import { not } from '@/utils/bits'

/** DFF divide-by-2：d0 = NOT q0 */
export const div2: Netlist = {
  id: 'div2',
  name: 'DFF Divide-by-2',
  description: '單一 DFF，D = Q̄，每個 rising edge toggle 一次。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [{ q: 'q0', qb: 'q0_b', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' }],
  gates: [{ out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV', kind: 'inv' }],
  stateOrder: ['q0'],
  output: 'q0',
  watch: ['d0'],
  equations: [{ target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' }],
  defaultDelays: { tcq: 8, gate: 6 },
}

/** 沒有 reset 的 /2（用於說明 reset 必要性：任何初值都能工作） */
export const div2NoReset: Netlist = {
  ...div2,
  id: 'div2-noreset',
  name: 'DFF /2（無 reset）',
  flops: [{ q: 'q0', qb: 'q0_b', d: 'd0', clk: 'clk', edge: 'rising', tcq: 8, label: 'FF0' }],
}
