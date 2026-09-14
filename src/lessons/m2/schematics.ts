import type { Schematic, SchematicHighlight } from '@/components/circuit/schematic'

/**
 * Module 2 的電路圖資料。
 * 座標約定：DFF 64×72，D pin 在 (x, y+20)、clk pin 在 (x, y+52)、Q pin 在 (x+64, y+20)、rst_n 在 (x+32, y+72)。
 * 2-input gate 52×40，in0 在 (x, y+13.3)、in1 在 (x, y+26.7)、out 在 (x+52, y+20)。
 */

// ---------------------------------------------------------------- Lesson 2-1：/3 state machine
/** /3：兩個 rising-edge DFF + NOR。d0 = NOR(q1, q0)，d1 = q0，div_out = q1。 */
export const div3Schematic: Schematic = {
  width: 480,
  height: 225,
  title: 'Divide-by-3 state machine（00 → 01 → 10 → 00）',
  elements: [
    { id: 'clk', kind: 'port', x: 30, y: 112, text: 'clk', dir: 'in', description: 'input clock（兩個 flop 共用同一條 clock）' },
    { id: 'rst', kind: 'port', x: 257, y: 205, text: 'rst_n', dir: 'in', description: 'async reset（active low）：把 state 放到 00' },
    { id: 'nor', kind: 'nor', x: 60, y: 60, label: 'NOR', description: 'd0 = NOT(q1 OR q0)：只有 state 00 時 d0 = 1' },
    { id: 'ff0', kind: 'dff', x: 150, y: 60, label: 'FF0', edge: 'rising', signal: 'q0', description: 'state bit q0（LSB）' },
    { id: 'ff1', kind: 'dff', x: 300, y: 60, label: 'FF1', edge: 'rising', signal: 'q1', description: 'state bit q1（MSB）；d1 = q0' },
    { id: 'j0', kind: 'dot', x: 250, y: 80 },
    { id: 'j1', kind: 'dot', x: 390, y: 80 },
    { id: 'out', kind: 'port', x: 440, y: 80, text: 'div_out', dir: 'out', description: 'output = q1（high 1T、low 2T）' },
  ],
  wires: [
    { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_clk1', from: 'clk.p', to: 'ff1.clk', signal: 'clk', kind: 'clock', points: [[130, 112], [130, 150], [280, 150], [280, 112]] },
    { id: 'w_nor_d0', from: 'nor.out', to: 'ff0.d', signal: 'd0', kind: 'feedback' },
    { id: 'w_q0_d1', from: 'ff0.q', to: 'ff1.d', signal: 'q0', kind: 'data', route: 'direct', labelAt: 0.72 },
    { id: 'w_q0_nor', from: 'ff0.q', to: 'nor.in0', signal: 'q0', kind: 'feedback', points: [[250, 80], [250, 32], [40, 32], [40, 73.33]] },
    { id: 'w_q1_out', from: 'ff1.q', to: 'out.p', signal: 'q1', kind: 'output' },
    { id: 'w_q1_nor', from: 'ff1.q', to: 'nor.in1', signal: 'q1', kind: 'feedback', points: [[390, 80], [390, 20], [28, 20], [28, 86.67]] },
    { id: 'w_rst0', from: 'rst.p', to: 'ff0.rstn', kind: 'reset', points: [[182, 205]] },
    { id: 'w_rst1', from: 'rst.p', to: 'ff1.rstn', kind: 'reset', points: [[332, 205]] },
  ],
}

/** setup critical path：FF0.Q / FF1.Q → NOR → FF0.D */
export const div3SetupHighlight: SchematicHighlight = {
  style: 'setup',
  wires: ['w_q0_nor', 'w_q1_nor', 'w_nor_d0'],
  elements: ['nor', 'ff0', 'ff1'],
  tags: [{ elementOrWire: 'ff0', text: 'capture（下一個 clk↑）' }],
}

/** hold 最危險的路徑：FF0.Q → FF1.D 直連（沒有 logic delay） */
export const div3HoldHighlight: SchematicHighlight = {
  style: 'hold',
  wires: ['w_q0_d1'],
  elements: ['ff0', 'ff1'],
  tags: [{ elementOrWire: 'ff1', text: 'capture（同一個 clk↑）' }],
}

/** 練習：00 → 01 → 11 → 00 編碼。d0 = NOT q1，d1 = q0 AND d0。 */
export const div3AltSchematic: Schematic = {
  width: 500,
  height: 210,
  title: '練習電路：兩個 DFF + INV + AND',
  elements: [
    { id: 'clk', kind: 'port', x: 30, y: 162, text: 'clk', dir: 'in' },
    { id: 'inv', kind: 'inv', x: 76, y: 118, label: 'INV', description: 'd0 = NOT q1' },
    { id: 'ff0', kind: 'dff', x: 150, y: 110, label: 'FF0', edge: 'rising', signal: 'q0' },
    { id: 'and', kind: 'and', x: 250, y: 40, label: 'AND', description: 'd1 = q0 AND d0 = q0 AND NOT q1' },
    { id: 'ff1', kind: 'dff', x: 340, y: 110, label: 'FF1', edge: 'rising', signal: 'q1' },
    { id: 'j0', kind: 'dot', x: 126, y: 130 },
    { id: 'j1', kind: 'dot', x: 228, y: 130 },
    { id: 'j2', kind: 'dot', x: 420, y: 130 },
    { id: 'out', kind: 'port', x: 470, y: 130, text: 'div_out', dir: 'out' },
  ],
  wires: [
    { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_clk1', from: 'clk.p', to: 'ff1.clk', signal: 'clk', kind: 'clock', points: [[130, 162], [130, 190], [310, 190], [310, 162]] },
    { id: 'w_inv_d0', from: 'inv.out', to: 'ff0.d', signal: 'd0', kind: 'feedback' },
    { id: 'w_d0_and', from: 'inv.out', to: 'and.in0', signal: 'd0', kind: 'feedback', points: [[126, 130], [126, 53.33]] },
    { id: 'w_q0_and', from: 'ff0.q', to: 'and.in1', signal: 'q0', kind: 'feedback', points: [[228, 130], [228, 66.67]] },
    { id: 'w_and_d1', from: 'and.out', to: 'ff1.d', signal: 'd1', kind: 'data', points: [[326, 60], [326, 130]] },
    { id: 'w_q1_out', from: 'ff1.q', to: 'out.p', signal: 'q1', kind: 'output' },
    { id: 'w_q1_inv', from: 'ff1.q', to: 'inv.in0', signal: 'q1', kind: 'feedback', points: [[420, 130], [420, 16], [60, 16], [60, 130]], labelAt: 0.35 },
  ],
}

// ---------------------------------------------------------------- Lesson 2-2：odd divider with 50% duty
const duty50Core: Schematic['elements'] = [
  { id: 'clk', kind: 'port', x: 30, y: 112, text: 'clk', dir: 'in', description: 'input clock：rising edge 給 FF0/FF1，falling edge 給 FF2' },
  { id: 'nor', kind: 'nor', x: 60, y: 60, label: 'NOR', description: 'd0 = NOT(q1 OR q0)' },
  { id: 'ff0', kind: 'dff', x: 150, y: 60, label: 'FF0', edge: 'rising', signal: 'q0', description: 'state bit q0' },
  { id: 'ff1', kind: 'dff', x: 300, y: 60, label: 'FF1', edge: 'rising', signal: 'q1', description: 'state bit q1：high 1T（state 10）' },
  { id: 'ff2', kind: 'dff', x: 430, y: 60, label: 'FF2', edge: 'falling', signal: 'q1_f', description: 'falling-edge DFF：q1_f = q1 在 clk↓ 取樣，等於 q1 延遲 T/2' },
  { id: 'or', kind: 'or', x: 540, y: 150, label: 'OR', description: 'div_out = q1 OR q1_f：high 從 q1↑ 到 q1_f↓ = 1.5T' },
  { id: 'j0', kind: 'dot', x: 250, y: 80 },
  { id: 'j1', kind: 'dot', x: 390, y: 80 },
  { id: 'j1b', kind: 'dot', x: 390, y: 40 },
  { id: 'j2', kind: 'dot', x: 510, y: 80 },
]
const duty50Wires: Schematic['wires'] = [
  { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
  { id: 'w_clk1', from: 'clk.p', to: 'ff1.clk', signal: 'clk', kind: 'clock', points: [[130, 112], [130, 150], [280, 150], [280, 112]] },
  { id: 'w_clk2', from: 'clk.p', to: 'ff2.clk', signal: 'clk', kind: 'clock', points: [[130, 112], [130, 150], [410, 150], [410, 112]] },
  { id: 'w_nor_d0', from: 'nor.out', to: 'ff0.d', signal: 'd0', kind: 'feedback' },
  { id: 'w_q0_d1', from: 'ff0.q', to: 'ff1.d', signal: 'q0', kind: 'data', route: 'direct', labelAt: 0.72 },
  { id: 'w_q0_nor', from: 'ff0.q', to: 'nor.in0', signal: 'q0', kind: 'feedback', points: [[250, 80], [250, 32], [40, 32], [40, 73.33]] },
  { id: 'w_q1_nor', from: 'ff1.q', to: 'nor.in1', signal: 'q1', kind: 'feedback', points: [[390, 80], [390, 20], [28, 20], [28, 86.67]] },
  { id: 'w_q1_d2', from: 'ff1.q', to: 'ff2.d', signal: 'q1', kind: 'data', route: 'direct', labelAt: 0.6 },
  { id: 'w_q1_or', from: 'ff1.q', to: 'or.in0', signal: 'q1', kind: 'data', points: [[390, 80], [390, 40], [525, 40], [525, 163.33]] },
  { id: 'w_q1f_or', from: 'ff2.q', to: 'or.in1', signal: 'q1_f', kind: 'data', points: [[510, 80], [510, 176.67]] },
]

/** /3 with 50% duty：/3 core + falling-edge DFF + OR */
export const div3Duty50Schematic: Schematic = {
  width: 660,
  height: 225,
  title: 'Divide-by-3 with 50% duty：q1 OR q1_f',
  elements: [...duty50Core, { id: 'out', kind: 'port', x: 620, y: 170, text: 'div_out', dir: 'out', description: 'div_out = q1 OR q1_f' }],
  wires: [...duty50Wires, { id: 'w_or_out', from: 'or.out', to: 'out.p', signal: 'div_out', kind: 'output' }],
}

/** 練習：OR 換成 AND */
export const div3AndSchematic: Schematic = {
  ...div3Duty50Schematic,
  title: '練習電路：q1 AND q1_f',
  elements: div3Duty50Schematic.elements.map((e) => (e.id === 'or' ? { ...e, kind: 'and' as const, label: 'AND', description: 'div_out = q1 AND q1_f' } : e)),
}

/** Critical path 分析用：多一個「下一級 rising-edge register」示範 falling → rising 的 interface path */
export const div3Duty50TimingSchematic: Schematic = {
  width: 760,
  height: 240,
  title: 'Divide-by-3 with 50% duty（含下一級 register）',
  elements: [
    ...duty50Core,
    { id: 'j3', kind: 'dot', x: 604, y: 170 },
    { id: 'out', kind: 'port', x: 604, y: 120, text: 'div_out', dir: 'out', description: 'divider 輸出' },
    { id: 'ext', kind: 'dff', x: 660, y: 150, label: '下一級 FF', edge: 'rising', description: '假設 div_out 被一個 rising-edge register 抓取（interface path）' },
  ],
  wires: [
    ...duty50Wires,
    { id: 'w_or_out', from: 'or.out', to: 'out.p', signal: 'div_out', kind: 'output', points: [[604, 170], [604, 120]] },
    { id: 'w_or_ext', from: 'or.out', to: 'ext.d', signal: 'div_out', kind: 'output', route: 'direct' },
    { id: 'w_clk_ext', from: 'clk.p', to: 'ext.clk', signal: 'clk', kind: 'clock', points: [[130, 112], [130, 150], [410, 150], [410, 205], [640, 205], [640, 202]] },
  ],
}

/** /5 with 50% duty：mod-5 counter 抽象成 box，重點放在 q1 → falling-edge DFF → OR */
export const div5Duty50Schematic: Schematic = {
  width: 560,
  height: 210,
  title: 'Divide-by-5 with 50% duty：q1（high 2T）OR q1_f',
  elements: [
    { id: 'clk', kind: 'port', x: 30, y: 112, text: 'clk', dir: 'in' },
    {
      id: 'cnt',
      kind: 'box',
      x: 70,
      y: 50,
      w: 150,
      h: 90,
      text: 'mod-5 counter\n000→001→010→011→100',
      description: '三個 rising-edge DFF：d0 = NOR(q0, q2)、d1 = q1 XOR q0、d2 = q1 AND q0',
      edge: 'rising',
      pins: [
        { name: 'clk', side: 'left', pos: 62 / 90 },
        { name: 'q1', side: 'right', pos: 1 / 3 },
      ],
    },
    { id: 'ff_f', kind: 'dff', x: 290, y: 60, label: 'FF_f', edge: 'falling', signal: 'q1_f', description: 'falling-edge DFF：q1_f = q1 延遲 T/2' },
    { id: 'or', kind: 'or', x: 420, y: 140, label: 'OR', description: 'div_out = q1 OR q1_f：high 2T + 0.5T = 2.5T' },
    { id: 'j0', kind: 'dot', x: 255, y: 80 },
    { id: 'j1', kind: 'dot', x: 380, y: 80 },
    { id: 'out', kind: 'port', x: 500, y: 160, text: 'div_out', dir: 'out' },
  ],
  wires: [
    { id: 'w_clk_cnt', from: 'clk.p', to: 'cnt.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_clk_ff', from: 'clk.p', to: 'ff_f.clk', signal: 'clk', kind: 'clock', points: [[50, 112], [50, 160], [270, 160], [270, 112]] },
    { id: 'w_q1_d', from: 'cnt.q1', to: 'ff_f.d', signal: 'q1', kind: 'data', route: 'direct' },
    { id: 'w_q1_or', from: 'cnt.q1', to: 'or.in0', signal: 'q1', kind: 'data', points: [[255, 80], [255, 30], [400, 30], [400, 153.33]] },
    { id: 'w_q1f_or', from: 'ff_f.q', to: 'or.in1', signal: 'q1_f', kind: 'data', points: [[380, 80], [380, 166.67]] },
    { id: 'w_or_out', from: 'or.out', to: 'out.p', signal: 'div_out', kind: 'output' },
  ],
}
