import type { Schematic, SchematicHighlight } from '@/components/circuit/schematic'

/** /2 divider 的電路圖：clk → FF0，Q → INV → D（feedback） */
export const div2Schematic: Schematic = {
  width: 380,
  height: 190,
  title: 'DFF divide-by-2',
  elements: [
    { id: 'clk', kind: 'port', x: 40, y: 92, text: 'clk', dir: 'in', description: 'input clock' },
    { id: 'rst', kind: 'port', x: 172, y: 170, text: 'rst_n', dir: 'in', description: 'async reset (active low)' },
    { id: 'ff0', kind: 'dff', x: 140, y: 40, label: 'FF0', edge: 'rising', signal: 'q0', description: 'rising-edge DFF；state bit q0' },
    { id: 'inv', kind: 'inv', x: 250, y: 118, label: 'INV', description: 'd0 = NOT q0' },
    { id: 'out', kind: 'port', x: 350, y: 60, text: 'div_out', dir: 'out', description: 'output = q0' },
  ],
  wires: [
    { id: 'w_clk', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_q', from: 'ff0.q', to: 'out.p', signal: 'q0', kind: 'output' },
    { id: 'w_q_inv', from: 'ff0.q', to: 'inv.in0', signal: 'q0', kind: 'feedback', points: [[222, 60], [222, 130]], noArrow: false, labelAt: 0.6 },
    { id: 'w_d', from: 'inv.out', to: 'ff0.d', signal: 'd0', kind: 'feedback', points: [[300, 130], [300, 172], [120, 172], [120, 60]], labelAt: 0.75 },
    { id: 'w_rst', from: 'rst.p', to: 'ff0.rstn', kind: 'reset', route: 'direct' },
  ],
}

export const div2CriticalHighlight: SchematicHighlight = {
  style: 'setup',
  wires: ['w_q_inv', 'w_d'],
  elements: ['inv'],
  tags: [{ elementOrWire: 'ff0', text: 'launch = capture（下一個 edge）' }],
}
