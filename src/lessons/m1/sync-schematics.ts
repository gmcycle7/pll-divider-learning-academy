import type { Schematic, SchematicHighlight } from '@/components/circuit/schematic'

/**
 * 同步 /4 counter：兩個 DFF 共用 clk；d0 = NOT q0；d1 = q1 XOR q0。
 * 元件 id：ff0, ff1, inv0, xor；wire id：w_clk0, w_clk1, w_q0_inv, w_d0, w_q0_xor, w_q1_xor, w_d1, w_out, w_rst0, w_rst1
 */
export const sync4Schematic: Schematic = {
  width: 560,
  height: 262,
  title: 'Synchronous counter /4',
  elements: [
    { id: 'clk', kind: 'port', x: 30, y: 92, text: 'clk', dir: 'in', description: 'input clock：同時送到 FF0 與 FF1' },
    { id: 'dotclk', kind: 'dot', x: 60, y: 92 },
    { id: 'ff0', kind: 'dff', x: 100, y: 40, label: 'FF0', edge: 'rising', signal: 'q0', description: 'state bit q0（LSB）；clock = clk' },
    { id: 'dot0', kind: 'dot', x: 176, y: 60 },
    { id: 'inv0', kind: 'inv', x: 190, y: 150, label: 'INV', description: 'd0 = NOT q0' },
    { id: 'xor', kind: 'xor', x: 250, y: 40, label: 'XOR', description: 'd1 = q1 XOR q0' },
    { id: 'ff1', kind: 'dff', x: 380, y: 40, label: 'FF1', edge: 'rising', signal: 'q1', description: 'state bit q1（MSB）；clock = clk（與 FF0 同一條）' },
    { id: 'dot1', kind: 'dot', x: 460, y: 60 },
    { id: 'out', kind: 'port', x: 520, y: 60, text: 'div_out', dir: 'out', description: 'output = q1' },
    { id: 'rst', kind: 'port', x: 256, y: 245, text: 'rst_n', dir: 'in', description: 'async reset（active low）' },
  ],
  wires: [
    { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
    {
      id: 'w_clk1',
      from: 'clk.p',
      to: 'ff1.clk',
      signal: 'clk',
      kind: 'clock',
      points: [
        [60, 92],
        [60, 14],
        [366, 14],
        [366, 92],
      ],
      labelAt: 0.5,
    },
    {
      id: 'w_q0_inv',
      from: 'ff0.q',
      to: 'inv0.in0',
      signal: 'q0',
      kind: 'feedback',
      points: [
        [176, 60],
        [176, 162],
      ],
      labelAt: 0.6,
    },
    {
      id: 'w_d0',
      from: 'inv0.out',
      to: 'ff0.d',
      signal: 'd0',
      kind: 'feedback',
      points: [
        [238, 162],
        [238, 200],
        [84, 200],
        [84, 60],
      ],
      labelAt: 0.55,
    },
    {
      id: 'w_q0_xor',
      from: 'ff0.q',
      to: 'xor.in0',
      signal: 'q0',
      kind: 'data',
      points: [
        [176, 60],
        [176, 53.33],
      ],
      labelAt: 0.8,
    },
    { id: 'w_d1', from: 'xor.out', to: 'ff1.d', signal: 'd1', kind: 'data' },
    {
      id: 'w_q1_xor',
      from: 'ff1.q',
      to: 'xor.in1',
      signal: 'q1',
      kind: 'feedback',
      points: [
        [460, 60],
        [460, 130],
        [238, 130],
        [238, 66.67],
      ],
      labelAt: 0.5,
    },
    { id: 'w_out', from: 'ff1.q', to: 'out.p', signal: 'q1', kind: 'output' },
    { id: 'w_rst0', from: 'rst.p', to: 'ff0.rstn', kind: 'reset', points: [[132, 245]], noArrow: true },
    { id: 'w_rst1', from: 'rst.p', to: 'ff1.rstn', kind: 'reset', points: [[412, 245]], noArrow: true },
  ],
}

/** Lesson 1-3 quiz / 內文用：sync4 上的三條候選路徑 */
export const sync4Highlights: Record<'invLoop' | 'xorPath' | 'clkWire' | 'q1XorPath', SchematicHighlight> = {
  invLoop: { style: 'setup', wires: ['w_q0_inv', 'w_d0'], elements: ['inv0', 'ff0'], tags: [{ elementOrWire: 'ff0', text: 'launch = capture（edge k → k+1）' }] },
  xorPath: { style: 'setup', wires: ['w_q0_xor', 'w_d1'], elements: ['xor', 'ff0', 'ff1'], tags: [{ elementOrWire: 'ff0', text: 'launch' }, { elementOrWire: 'ff1', text: 'capture' }] },
  q1XorPath: { style: 'setup', wires: ['w_q1_xor', 'w_d1'], elements: ['xor', 'ff1'], tags: [{ elementOrWire: 'ff1', text: 'launch = capture' }] },
  clkWire: { style: 'info', wires: ['w_clk0', 'w_clk1'], elements: [], tags: [{ elementOrWire: 'w_clk1', text: 'clock distribution（skew 來源）' }] },
}

/**
 * 同步 /8 counter（練習）：d0 = NOT q0；d1 = q1 XOR q0；c1 = q1 AND q0；d2 = q2 XOR c1。
 * 元件 id：ff0, ff1, ff2, inv0, xor1, and, xor2；
 * wire id：w_clk0..2, w_q0_inv, w_d0, w_q0_xor1, w_q1_xor1, w_d1, w_q0_and, w_q1_and, w_c1, w_q2_xor2, w_d2, w_out
 * （為了版面清楚省略 rst_n 走線；netlist 仍有 async reset。）
 */
export const sync8Schematic: Schematic = {
  width: 880,
  height: 232,
  title: 'Synchronous counter /8',
  elements: [
    { id: 'clk', kind: 'port', x: 30, y: 92, text: 'clk', dir: 'in', description: 'input clock：同時送到三個 flop' },
    { id: 'dotclk', kind: 'dot', x: 60, y: 92 },
    { id: 'dotclk1', kind: 'dot', x: 366, y: 14 },
    { id: 'ff0', kind: 'dff', x: 100, y: 40, label: 'FF0', edge: 'rising', signal: 'q0', description: 'q0（LSB）' },
    { id: 'dot0', kind: 'dot', x: 176, y: 60 },
    { id: 'inv0', kind: 'inv', x: 190, y: 150, label: 'INV', description: 'd0 = NOT q0（6 ps）' },
    { id: 'xor1', kind: 'xor', x: 250, y: 40, label: 'XOR1', description: 'd1 = q1 XOR q0（12 ps）' },
    { id: 'ff1', kind: 'dff', x: 380, y: 40, label: 'FF1', edge: 'rising', signal: 'q1', description: 'q1' },
    { id: 'dot1', kind: 'dot', x: 460, y: 60 },
    { id: 'and', kind: 'and', x: 490, y: 150, label: 'AND', description: 'c1 = q1 AND q0（10 ps）' },
    { id: 'xor2', kind: 'xor', x: 600, y: 40, label: 'XOR2', description: 'd2 = q2 XOR c1（12 ps）' },
    { id: 'ff2', kind: 'dff', x: 680, y: 40, label: 'FF2', edge: 'rising', signal: 'q2', description: 'q2（MSB）= div_out' },
    { id: 'dot2', kind: 'dot', x: 760, y: 60 },
    { id: 'out', kind: 'port', x: 830, y: 60, text: 'div_out', dir: 'out', description: 'output = q2' },
  ],
  wires: [
    { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
    {
      id: 'w_clk1',
      from: 'clk.p',
      to: 'ff1.clk',
      signal: 'clk',
      kind: 'clock',
      points: [
        [60, 92],
        [60, 14],
        [366, 14],
        [366, 92],
      ],
      labelAt: 0.45,
    },
    {
      id: 'w_clk2',
      from: 'clk.p',
      to: 'ff2.clk',
      signal: 'clk',
      kind: 'clock',
      points: [
        [60, 92],
        [60, 14],
        [666, 14],
        [666, 92],
      ],
      noArrow: false,
      labelAt: 0.7,
    },
    {
      id: 'w_q0_inv',
      from: 'ff0.q',
      to: 'inv0.in0',
      signal: 'q0',
      kind: 'feedback',
      points: [
        [176, 60],
        [176, 162],
      ],
      labelAt: 0.6,
    },
    {
      id: 'w_d0',
      from: 'inv0.out',
      to: 'ff0.d',
      signal: 'd0',
      kind: 'feedback',
      points: [
        [238, 162],
        [238, 200],
        [84, 200],
        [84, 60],
      ],
      labelAt: 0.55,
    },
    {
      id: 'w_q0_xor1',
      from: 'ff0.q',
      to: 'xor1.in0',
      signal: 'q0',
      kind: 'data',
      points: [
        [176, 60],
        [176, 53.33],
      ],
      labelAt: 0.8,
    },
    {
      id: 'w_q1_xor1',
      from: 'ff1.q',
      to: 'xor1.in1',
      signal: 'q1',
      kind: 'feedback',
      points: [
        [460, 60],
        [460, 130],
        [238, 130],
        [238, 66.67],
      ],
      labelAt: 0.5,
    },
    { id: 'w_d1', from: 'xor1.out', to: 'ff1.d', signal: 'd1', kind: 'data' },
    {
      id: 'w_q0_and',
      from: 'ff0.q',
      to: 'and.in0',
      signal: 'q0',
      kind: 'data',
      points: [
        [176, 60],
        [176, 140],
        [466, 140],
        [466, 163.33],
      ],
      labelAt: 0.55,
    },
    {
      id: 'w_q1_and',
      from: 'ff1.q',
      to: 'and.in1',
      signal: 'q1',
      kind: 'data',
      points: [
        [460, 60],
        [460, 120],
        [482, 120],
        [482, 176.67],
      ],
      labelAt: 0.5,
    },
    {
      id: 'w_c1',
      from: 'and.out',
      to: 'xor2.in0',
      signal: 'c1',
      kind: 'data',
      points: [
        [570, 170],
        [570, 53.33],
      ],
      labelAt: 0.5,
    },
    {
      id: 'w_q2_xor2',
      from: 'ff2.q',
      to: 'xor2.in1',
      signal: 'q2',
      kind: 'feedback',
      points: [
        [760, 60],
        [760, 130],
        [588, 130],
        [588, 66.67],
      ],
      labelAt: 0.5,
    },
    { id: 'w_d2', from: 'xor2.out', to: 'ff2.d', signal: 'd2', kind: 'data' },
    { id: 'w_out', from: 'ff2.q', to: 'out.p', signal: 'q2', kind: 'output' },
  ],
}
