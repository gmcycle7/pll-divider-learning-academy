import type { Netlist } from '../types'
import { xor } from '@/utils/bits'

/** 單純的 DFF：q 跟隨 d_in（使用者可切換 d_in） */
export const dffFollow: Netlist = {
  id: 'dff-follow',
  name: 'DFF：q 在 rising edge 抓 d_in',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'd_in', initial: 0, description: 'D 輸入（在下一個 edge 前改變）' }],
  flops: [{ q: 'q', d: 'd_in', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF' }],
  gates: [],
  stateOrder: ['q'],
  output: 'q',
  equations: [{ target: 'q', text: 'q ← d_in @ clk rising', latex: 'q \\leftarrow d_{in}\\ @\\ clk\\uparrow' }],
  defaultDelays: { tcq: 8, gate: 6 },
}

/** TFF：t=1 時每個 edge toggle，t=0 時保持 */
export const tff: Netlist = {
  id: 'tff',
  name: 'T flip-flop（d = q XOR t）',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 't', initial: 1, description: 't=1：toggle；t=0：hold' }],
  flops: [{ q: 'q', d: 'd', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF' }],
  gates: [{ out: 'd', inputs: ['q', 't'], fn: (v) => xor(v.q, v.t), delay: 12, label: 'XOR', kind: 'xor' }],
  stateOrder: ['q'],
  output: 'q',
  watch: ['d'],
  equations: [{ target: 'd', text: 'd = q XOR t', latex: 'd = q \\oplus t' }],
  defaultDelays: { tcq: 8, gate: 6 },
}

/** 純 combinational feedback（inverter 自己咬自己）：用 real delay 模式看它振盪 */
export const ringOsc: Netlist = {
  id: 'ring-osc',
  name: 'Inverter feedback（沒有 memory element）',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'kick', initial: 0, description: '把 kick 拉高一次啟動' }],
  flops: [],
  gates: [
    { out: 'a', inputs: ['b', 'kick'], fn: (v) => (v.kick ? 1 : v.b ? 0 : 1), delay: 15, label: 'INV1', kind: 'inv' },
    { out: 'b', inputs: ['a'], fn: (v) => (v.a ? 0 : 1), delay: 15, label: 'INV2', kind: 'inv' },
  ],
  stateOrder: [],
  output: 'a',
  watch: ['b'],
  equations: [
    { target: 'a', text: 'a = NOT b' },
    { target: 'b', text: 'b = NOT a' },
  ],
  defaultDelays: { tcq: 8, gate: 15 },
}
