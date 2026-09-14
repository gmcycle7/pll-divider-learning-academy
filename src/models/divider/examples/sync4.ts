import type { Netlist } from '../types'
import { not, xor } from '@/utils/bits'

/** 同步 /4 counter：q0 toggle，q1 在 q0=1 時 toggle */
export const sync4: Netlist = {
  id: 'sync4',
  name: 'Synchronous Counter /4',
  description: '兩個 DFF 共用同一個 clock，next-state 由 combinational logic 決定。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV', kind: 'inv' },
    { out: 'd1', inputs: ['q0', 'q1'], fn: (v) => xor(v.q0, v.q1), delay: 12, label: 'XOR', kind: 'xor' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'q1',
  watch: ['d1'],
  equations: [
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
    { target: 'd1', text: 'd1 = q1 XOR q0', latex: 'd_1 = q_1 \\oplus q_0' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/** 同步 /8 counter（3-bit binary） */
export const sync8: Netlist = {
  id: 'sync8',
  name: 'Synchronous Counter /8',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
    { q: 'q2', d: 'd2', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF2' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV', kind: 'inv' },
    { out: 'd1', inputs: ['q0', 'q1'], fn: (v) => xor(v.q0, v.q1), delay: 12, label: 'XOR1', kind: 'xor' },
    { out: 'c1', inputs: ['q0', 'q1'], fn: (v) => (v.q0 && v.q1 ? 1 : 0), delay: 10, label: 'AND', kind: 'and' },
    { out: 'd2', inputs: ['c1', 'q2'], fn: (v) => xor(v.c1, v.q2), delay: 12, label: 'XOR2', kind: 'xor' },
  ],
  stateOrder: ['q2', 'q1', 'q0'],
  output: 'q2',
  equations: [
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
    { target: 'd1', text: 'd1 = q1 XOR q0', latex: 'd_1 = q_1 \\oplus q_0' },
    { target: 'd2', text: 'd2 = q2 XOR (q1 AND q0)', latex: 'd_2 = q_2 \\oplus (q_1 q_0)' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}
