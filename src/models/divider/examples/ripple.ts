import type { Netlist } from '../types'
import { not } from '@/utils/bits'

/** 兩級 ripple /4：FF1 的 clock 是 q0 的 falling edge（等效 q0_b rising） */
export const ripple4: Netlist = {
  id: 'ripple4',
  name: 'Ripple Counter /4',
  description: '兩級 toggle FF 串接：第一級輸出當第二級 clock。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', qb: 'q0_b', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', qb: 'q1_b', d: 'd1', clk: 'q0', edge: 'falling', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV0', kind: 'inv' },
    { out: 'd1', inputs: ['q1'], fn: (v) => not(v.q1), delay: 6, label: 'INV1', kind: 'inv' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'q1',
  equations: [
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
    { target: 'd1', text: 'd1 = NOT q1  (clocked by q0 falling edge)', latex: 'd_1 = \\overline{q_1}\\quad(\\text{clk}_1 = q_0\\downarrow)' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/** 三級 ripple /8 */
export const ripple8: Netlist = {
  id: 'ripple8',
  name: 'Ripple Counter /8',
  description: '三級 toggle FF 串接。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', qb: 'q0_b', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', qb: 'q1_b', d: 'd1', clk: 'q0', edge: 'falling', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
    { q: 'q2', qb: 'q2_b', d: 'd2', clk: 'q1', edge: 'falling', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF2' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV0', kind: 'inv' },
    { out: 'd1', inputs: ['q1'], fn: (v) => not(v.q1), delay: 6, label: 'INV1', kind: 'inv' },
    { out: 'd2', inputs: ['q2'], fn: (v) => not(v.q2), delay: 6, label: 'INV2', kind: 'inv' },
  ],
  stateOrder: ['q2', 'q1', 'q0'],
  output: 'q2',
  equations: [
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
    { target: 'd1', text: 'd1 = NOT q1  (clk1 = q0 falling)', latex: 'd_1 = \\overline{q_1}' },
    { target: 'd2', text: 'd2 = NOT q2  (clk2 = q1 falling)', latex: 'd_2 = \\overline{q_2}' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}
