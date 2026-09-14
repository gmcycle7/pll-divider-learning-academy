import type { Schematic, SchematicHighlight } from '@/components/circuit/schematic'

// ---------------------------------------------------------------- A：state-continuous /2 /3 cell
/**
 * dualMod23：d0 = NOR(q1, q0)、d1 = q0 AND mod、div_out = NOR(q1, q0)（= d0）。
 * gate 放左邊、flop 放右邊，feedback 從 Q 繞上方回到 gate 輸入。
 */
export const dm23Schematic: Schematic = {
  width: 470,
  height: 292,
  title: '/2 /3 dual-modulus cell（state-continuous）',
  elements: [
    { id: 'clk', kind: 'port', x: 30, y: 112, text: 'clk', dir: 'in', description: 'input clock，兩個 flop 共用' },
    { id: 'mod', kind: 'port', x: 50, y: 226.67, text: 'mod', dir: 'in', description: 'modulus control：0 = /2，1 = /3' },
    { id: 'nor', kind: 'nor', x: 120, y: 60, label: 'NOR', description: 'd0 = NOT(q1 OR q0)；也是 div_out 的 decode' },
    { id: 'and', kind: 'and', x: 120, y: 200, label: 'AND', description: 'd1 = q0 AND mod：只有 state 01 時 mod 才有作用' },
    { id: 'ff0', kind: 'dff', x: 250, y: 60, label: 'FF0', edge: 'rising', signal: 'q0', description: 'state bit q0（LSB）' },
    { id: 'ff1', kind: 'dff', x: 250, y: 200, label: 'FF1', edge: 'rising', signal: 'q1', description: 'state bit q1（MSB）；mod=0 時永遠是 0' },
    { id: 'out', kind: 'port', x: 200, y: 44, text: 'div_out', dir: 'out', description: 'div_out = NOR(q1, q0)：state 00 時為 1' },
    { id: 'j1', kind: 'dot', x: 200, y: 80 },
    { id: 'j2', kind: 'dot', x: 340, y: 80 },
  ],
  wires: [
    { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_clk1', from: 'clk.p', to: 'ff1.clk', kind: 'clock', points: [[60, 112], [60, 252]], noArrow: false },
    { id: 'w_nor_d0', from: 'nor.out', to: 'ff0.d', signal: 'd0', kind: 'data', labelAt: 0.7 },
    { id: 'w_and_d1', from: 'and.out', to: 'ff1.d', signal: 'd1', kind: 'data', labelAt: 0.7 },
    { id: 'w_q0_nor', from: 'ff0.q', to: 'nor.in0', signal: 'q0', kind: 'feedback', points: [[350, 80], [350, 30], [90, 30], [90, 73.33]], labelAt: 0.5 },
    { id: 'w_q0_and', from: 'ff0.q', to: 'and.in0', signal: 'q0', kind: 'feedback', points: [[340, 80], [340, 150], [100, 150], [100, 213.33]], labelAt: 0.55 },
    { id: 'w_q1_nor', from: 'ff1.q', to: 'nor.in1', signal: 'q1', kind: 'feedback', points: [[360, 220], [360, 15], [80, 15], [80, 86.67]], labelAt: 0.5 },
    { id: 'w_mod', from: 'mod.p', to: 'and.in1', signal: 'mod', kind: 'control' },
    { id: 'w_out', from: 'nor.out', to: 'out.p', signal: 'div_out', kind: 'output', points: [[200, 80], [200, 44]], labelAt: 0.9 },
  ],
}

/** 變體：div_out = q1 */
export const dm23OutQ1Schematic: Schematic = {
  ...dm23Schematic,
  width: 500,
  title: '/2 /3 cell 變體：div_out = q1',
  elements: [...dm23Schematic.elements.filter((e) => e.id !== 'out' && e.id !== 'j1'), { id: 'out', kind: 'port', x: 430, y: 220, text: 'div_out', dir: 'out', description: 'div_out = q1' }],
  wires: [...dm23Schematic.wires.filter((w) => w.id !== 'w_out'), { id: 'w_out', from: 'ff1.q', to: 'out.p', signal: 'div_out', kind: 'output', labelAt: 0.85 }],
}

/** 變體：div_out = q0 */
export const dm23OutQ0Schematic: Schematic = {
  ...dm23Schematic,
  width: 500,
  title: '/2 /3 cell 變體：div_out = q0',
  elements: [...dm23Schematic.elements.filter((e) => e.id !== 'out' && e.id !== 'j1'), { id: 'out', kind: 'port', x: 430, y: 80, text: 'div_out', dir: 'out', description: 'div_out = q0' }],
  wires: [...dm23Schematic.wires.filter((w) => w.id !== 'w_out'), { id: 'w_out', from: 'ff0.q', to: 'out.p', signal: 'div_out', kind: 'output', labelAt: 0.85 }],
}

/** 變體：mod 改接到 d0 的邏輯（AOI box），d1 = q0 直接接線 */
export const dm23ModOnD0Schematic: Schematic = {
  width: 500,
  height: 292,
  title: '/2 /3 變體：mod 控制 d0，d1 = q0',
  elements: [
    { id: 'clk', kind: 'port', x: 30, y: 106, text: 'clk', dir: 'in' },
    { id: 'mod', kind: 'port', x: 40, y: 89, text: 'mod', dir: 'in', description: 'mod 現在進入 d0 的邏輯' },
    {
      id: 'aoi',
      kind: 'box',
      x: 100,
      y: 44,
      w: 110,
      h: 60,
      text: 'd0 = ~(q1+q0)\n+ ~mod·q1',
      label: 'AOI',
      description: 'd0 = NOR(q1, q0) OR (NOT mod AND q1)',
      pins: [
        { name: 'in0', side: 'left', pos: 0.25, label: 'q0' },
        { name: 'in1', side: 'left', pos: 0.5, label: 'q1' },
        { name: 'in2', side: 'left', pos: 0.75, label: 'mod' },
        { name: 'out', side: 'right', pos: 0.5, label: '' },
      ],
    },
    { id: 'ff0', kind: 'dff', x: 250, y: 54, label: 'FF0', edge: 'rising', signal: 'q0' },
    { id: 'ff1', kind: 'dff', x: 250, y: 200, label: 'FF1', edge: 'rising', signal: 'q1', description: 'd1 = q0：沒有 gate' },
    { id: 'out', kind: 'port', x: 430, y: 74, text: 'div_out', dir: 'out', description: 'div_out = q0' },
    { id: 'j1', kind: 'dot', x: 340, y: 74 },
  ],
  wires: [
    { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_clk1', from: 'clk.p', to: 'ff1.clk', kind: 'clock', points: [[60, 106], [60, 252]] },
    { id: 'w_aoi_d0', from: 'aoi.out', to: 'ff0.d', signal: 'd0', kind: 'data' },
    { id: 'w_q0_d1', from: 'ff0.q', to: 'ff1.d', signal: 'd1', kind: 'feedback', points: [[340, 74], [340, 150], [230, 150], [230, 220]], labelAt: 0.6 },
    { id: 'w_q0_aoi', from: 'ff0.q', to: 'aoi.in0', signal: 'q0', kind: 'feedback', points: [[350, 74], [350, 30], [85, 30], [85, 59]], labelAt: 0.5 },
    { id: 'w_q1_aoi', from: 'ff1.q', to: 'aoi.in1', signal: 'q1', kind: 'feedback', points: [[360, 220], [360, 15], [75, 15], [75, 74]], labelAt: 0.5 },
    { id: 'w_mod', from: 'mod.p', to: 'aoi.in2', signal: 'mod', kind: 'control' },
    { id: 'w_out', from: 'ff0.q', to: 'out.p', signal: 'div_out', kind: 'output', labelAt: 0.85 },
  ],
}

// ---------------------------------------------------------------- B：獨立 /2 與 /3 再用 MUX 選（錯誤示範）
export const muxSelect23Schematic: Schematic = {
  width: 570,
  height: 330,
  title: 'B：獨立 /2、/3 divider，用 MUX 選輸出（錯誤示範）',
  elements: [
    { id: 'clk', kind: 'port', x: 40, y: 92, text: 'clk', dir: 'in' },
    { id: 'ffa', kind: 'dff', x: 200, y: 40, label: 'FFa (/2)', edge: 'rising', signal: 'a0', description: '/2 divider：自由跑，不管 mod' },
    { id: 'inv', kind: 'inv', x: 300, y: 48, label: 'INV', description: 'da0 = NOT a0' },
    { id: 'ffb0', kind: 'dff', x: 120, y: 200, label: 'FFb0 (/3)', edge: 'rising', signal: 'b0', description: '/3 divider 的 LSB' },
    { id: 'ffb1', kind: 'dff', x: 230, y: 200, label: 'FFb1 (/3)', edge: 'rising', signal: 'b1', description: '/3 divider 的 MSB，d = b0' },
    { id: 'nor', kind: 'nor', x: 330, y: 200, label: 'NOR', description: 'db0 = NOR(b1, b0)，也是 out3' },
    { id: 'mux', kind: 'mux2', x: 440, y: 130, label: 'MUX', description: 'div_out = mod ? out3 : out2（純 combinational）' },
    { id: 'mod', kind: 'port', x: 460, y: 310, text: 'mod', dir: 'in', description: 'MUX select：0 選 /2，1 選 /3' },
    { id: 'out', kind: 'port', x: 540, y: 160, text: 'div_out', dir: 'out' },
    { id: 'j_a', kind: 'dot', x: 280, y: 60 },
    { id: 'j_b0', kind: 'dot', x: 207, y: 220 },
    { id: 'j_nor', kind: 'dot', x: 400, y: 220 },
    { id: 'j_clk1', kind: 'dot', x: 70, y: 92 },
    { id: 'j_clk2', kind: 'dot', x: 70, y: 252 },
  ],
  wires: [
    { id: 'w_clka', from: 'clk.p', to: 'ffa.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_clkb0', from: 'clk.p', to: 'ffb0.clk', kind: 'clock', points: [[70, 92], [70, 252]] },
    { id: 'w_clkb1', from: 'clk.p', to: 'ffb1.clk', kind: 'clock', points: [[70, 92], [70, 290], [215, 290], [215, 252]] },
    { id: 'w_a_inv', from: 'ffa.q', to: 'inv.in0', signal: 'a0', kind: 'feedback' },
    { id: 'w_inv_da', from: 'inv.out', to: 'ffa.d', signal: 'da0', kind: 'feedback', points: [[360, 60], [360, 20], [180, 20], [180, 60]], labelAt: 0.5 },
    { id: 'w_out2', from: 'ffa.q', to: 'mux.in0', signal: 'out2', kind: 'data', points: [[280, 60], [280, 150]], labelAt: 0.75 },
    { id: 'w_b0_b1', from: 'ffb0.q', to: 'ffb1.d', signal: 'b0', kind: 'data' },
    { id: 'w_b0_nor', from: 'ffb0.q', to: 'nor.in0', kind: 'feedback', points: [[207, 220], [207, 190], [316, 190], [316, 213.33]] },
    { id: 'w_b1_nor', from: 'ffb1.q', to: 'nor.in1', signal: 'b1', kind: 'feedback', points: [[305, 220], [305, 226.67]] },
    { id: 'w_nor_db0', from: 'nor.out', to: 'ffb0.d', signal: 'db0', kind: 'feedback', points: [[400, 220], [400, 175], [100, 175], [100, 220]], labelAt: 0.5 },
    { id: 'w_out3', from: 'nor.out', to: 'mux.in1', signal: 'out3', kind: 'data', points: [[400, 220], [400, 170]], labelAt: 0.85 },
    { id: 'w_mod', from: 'mod.p', to: 'mux.sel', signal: 'mod', kind: 'control', points: [[460, 290]] },
    { id: 'w_out', from: 'mux.out', to: 'out.p', signal: 'div_out', kind: 'output' },
  ],
}

// ---------------------------------------------------------------- /1 /2：falling-edge 重同步的 clock gating（正確版）
export const dm12Schematic: Schematic = {
  width: 600,
  height: 300,
  title: '/1 /2 dual-modulus：en 由 falling-edge FF 重同步',
  elements: [
    { id: 'clk', kind: 'port', x: 40, y: 92, text: 'clk', dir: 'in' },
    { id: 'ff0', kind: 'dff', x: 140, y: 40, label: 'FF0 (toggle)', edge: 'rising', signal: 'q0', description: 'q0 每個 rising edge toggle：提供 /2 的節奏' },
    { id: 'inv', kind: 'inv', x: 240, y: 48, label: 'INV', description: 'd0 = NOT q0' },
    { id: 'sel', kind: 'port', x: 110, y: 183, text: 'sel', dir: 'in', description: 'sel = 0：/1；sel = 1：/2' },
    { id: 'inv_sel', kind: 'inv', x: 150, y: 171, label: 'INV', description: 'NOT sel' },
    { id: 'or', kind: 'or', x: 230, y: 170, label: 'OR', description: 'd_en = NOT sel OR q0' },
    { id: 'ff_en', kind: 'dff', x: 330, y: 170, label: 'FF_EN (falling)', edge: 'falling', signal: 'en', description: '在 clk falling edge 抓 d_en：en 只會在 clk = 0 期間改變' },
    { id: 'and', kind: 'and', x: 450, y: 100, label: 'AND', description: 'div_out = clk AND en：clock gating' },
    { id: 'out', kind: 'port', x: 560, y: 120, text: 'div_out', dir: 'out' },
    { id: 'j_q0', kind: 'dot', x: 222, y: 60 },
    { id: 'j_c1', kind: 'dot', x: 60, y: 92 },
    { id: 'j_c2', kind: 'dot', x: 80, y: 92 },
  ],
  wires: [
    { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_clk_en', from: 'clk.p', to: 'ff_en.clk', kind: 'clock', points: [[80, 92], [80, 280], [315, 280], [315, 222]] },
    { id: 'w_clk_and', from: 'clk.p', to: 'and.in0', kind: 'clock', points: [[60, 92], [60, 10], [430, 10], [430, 113.33]] },
    { id: 'w_q0_inv', from: 'ff0.q', to: 'inv.in0', signal: 'q0', kind: 'feedback' },
    { id: 'w_inv_d0', from: 'inv.out', to: 'ff0.d', signal: 'd0', kind: 'feedback', points: [[300, 60], [300, 20], [120, 20], [120, 60]], labelAt: 0.5 },
    { id: 'w_sel', from: 'sel.p', to: 'inv_sel.in0', signal: 'sel', kind: 'control' },
    { id: 'w_selb', from: 'inv_sel.out', to: 'or.in0', kind: 'control', label: 'sel̄' },
    { id: 'w_q0_or', from: 'ff0.q', to: 'or.in1', kind: 'feedback', points: [[222, 60], [222, 196.67]] },
    { id: 'w_den', from: 'or.out', to: 'ff_en.d', signal: 'd_en', kind: 'data', labelAt: 0.6 },
    { id: 'w_en', from: 'ff_en.q', to: 'and.in1', signal: 'en', kind: 'data', points: [[420, 190], [420, 126.67]], labelAt: 0.5 },
    { id: 'w_out', from: 'and.out', to: 'out.p', signal: 'div_out', kind: 'output' },
  ],
}

/** 練習：FF_EN 改成 rising-edge */
export const dm12RisingEnSchematic: Schematic = {
  ...dm12Schematic,
  title: '/1 /2 變體：en 改用 rising-edge FF',
  elements: dm12Schematic.elements.map((e) => (e.id === 'ff_en' ? { ...e, label: 'FF_EN (rising)', edge: 'rising' as const, description: '改成 rising edge：en 與 q0 在同一個 edge 之後 tCQ 才改變' } : e)),
}

// ---------------------------------------------------------------- /1 /2：combinational gating（會 glitch）
export const dm12GlitchySchematic: Schematic = {
  width: 560,
  height: 240,
  title: '/1 /2：combinational clock gating（錯誤示範）',
  elements: [
    { id: 'clk', kind: 'port', x: 40, y: 92, text: 'clk', dir: 'in' },
    { id: 'ff0', kind: 'dff', x: 140, y: 40, label: 'FF0 (toggle)', edge: 'rising', signal: 'q0' },
    { id: 'inv', kind: 'inv', x: 240, y: 48, label: 'INV' },
    { id: 'sel', kind: 'port', x: 110, y: 183, text: 'sel', dir: 'in' },
    { id: 'inv_sel', kind: 'inv', x: 150, y: 171, label: 'INV' },
    { id: 'or', kind: 'or', x: 230, y: 170, label: 'OR', description: 'en = NOT sel OR q0：直接是 combinational' },
    { id: 'and', kind: 'and', x: 400, y: 150, label: 'AND', description: 'div_out = clk AND en；en 在 clk = 1 期間改變就會 glitch' },
    { id: 'out', kind: 'port', x: 520, y: 170, text: 'div_out', dir: 'out' },
    { id: 'j_q0', kind: 'dot', x: 222, y: 60 },
    { id: 'j_c1', kind: 'dot', x: 60, y: 92 },
  ],
  wires: [
    { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_clk_and', from: 'clk.p', to: 'and.in0', kind: 'clock', points: [[60, 92], [60, 10], [370, 10], [370, 163.33]] },
    { id: 'w_q0_inv', from: 'ff0.q', to: 'inv.in0', signal: 'q0', kind: 'feedback' },
    { id: 'w_inv_d0', from: 'inv.out', to: 'ff0.d', signal: 'd0', kind: 'feedback', points: [[300, 60], [300, 20], [120, 20], [120, 60]], labelAt: 0.5 },
    { id: 'w_sel', from: 'sel.p', to: 'inv_sel.in0', signal: 'sel', kind: 'control' },
    { id: 'w_selb', from: 'inv_sel.out', to: 'or.in0', kind: 'control', label: 'sel̄' },
    { id: 'w_q0_or', from: 'ff0.q', to: 'or.in1', kind: 'feedback', points: [[222, 60], [222, 196.67]] },
    { id: 'w_en', from: 'or.out', to: 'and.in1', signal: 'en', kind: 'data', points: [[380, 190], [380, 176.67]], labelAt: 0.5 },
    { id: 'w_out', from: 'and.out', to: 'out.p', signal: 'div_out', kind: 'output' },
  ],
}

// ---------------------------------------------------------------- quiz 用的高亮
export const dm23HlNorPath: SchematicHighlight = { style: 'setup', wires: ['w_q0_nor', 'w_nor_d0'], elements: ['nor', 'ff0'], tags: [{ elementOrWire: 'ff0', text: 'launch = capture' }] }
export const dm23HlAndPath: SchematicHighlight = { style: 'setup', wires: ['w_q0_and', 'w_and_d1'], elements: ['and', 'ff0', 'ff1'] }
export const dm23HlModPath: SchematicHighlight = { style: 'async', wires: ['w_mod', 'w_and_d1'], elements: ['and', 'ff1'], tags: [{ elementOrWire: 'ff1', text: 'capture（state 01 那個 cycle）' }] }
export const dm23HlClock: SchematicHighlight = { style: 'info', wires: ['w_clk0', 'w_clk1'] }
export const dm23HlOut: SchematicHighlight = { style: 'info', wires: ['w_out'], elements: ['nor'] }

export const dm12HlHalfCycle: SchematicHighlight = { style: 'setup', wires: ['w_q0_or', 'w_den'], elements: ['or', 'ff0', 'ff_en'], tags: [{ elementOrWire: 'ff_en', text: 'capture @ clk↓（半個 cycle）' }] }
export const dm12HlGating: SchematicHighlight = { style: 'async', wires: ['w_en', 'w_out'], elements: ['and', 'ff_en'], tags: [{ elementOrWire: 'and', text: 'pulse width，不是 setup' }] }
export const dm12HlClockAnd: SchematicHighlight = { style: 'info', wires: ['w_clk_and'] }
export const dm12HlToggle: SchematicHighlight = { style: 'setup', wires: ['w_q0_inv', 'w_inv_d0'], elements: ['inv', 'ff0'] }
export const dm12HlSel: SchematicHighlight = { style: 'async', wires: ['w_sel', 'w_selb', 'w_den'], elements: ['inv_sel', 'or', 'ff_en'] }
