import type { Schematic, SchematicHighlight } from '@/components/circuit/schematic'

/* ------------------------------------------------------------------ */
/* 練習電路：programmable /3 /4（3 flop + INV + AND + MUX + NOR）            */
/* 排版：邏輯在上、三個 flop 排成一列在下，feedback 從 Q 往上繞回          */
/* ------------------------------------------------------------------ */
export const progDiv34Schematic: Schematic = {
  width: 790,
  height: 360,
  title: 'Programmable /3 /4 divider',
  elements: [
    { id: 'inv', kind: 'inv', x: 40, y: 120, label: 'INV', description: 'd0 = NOT q1；輸出同時餵 FF0.D 與 AND（fanout 2）' },
    { id: 'and', kind: 'and', x: 150, y: 60, label: 'AND', description: 'a = q0 AND d0 = q0 AND NOT q1' },
    { id: 'mux', kind: 'mux2', x: 240, y: 80, label: 'MUX', description: 'd1 = sel ? q0 : a（sel=0 選 in0，sel=1 選 in1）' },
    { id: 'nor', kind: 'nor', x: 450, y: 80, label: 'NOR', description: 'd2 = NOR(q1, q0)：state 00 偵測' },
    { id: 'ff0', kind: 'dff', x: 120, y: 200, label: 'FF0', edge: 'rising', signal: 'q0', description: 'state bit q0' },
    { id: 'ff1', kind: 'dff', x: 330, y: 200, label: 'FF1', edge: 'rising', signal: 'q1', description: 'state bit q1' },
    { id: 'ff2', kind: 'dff', x: 540, y: 200, label: 'FF2', edge: 'rising', signal: 'q2', description: '輸出 retiming flop：q2 = div_out' },
    { id: 'clk0', kind: 'port', x: 96, y: 252, text: 'clk', dir: 'in' },
    { id: 'clk1', kind: 'port', x: 306, y: 252, text: 'clk', dir: 'in' },
    { id: 'clk2', kind: 'port', x: 516, y: 252, text: 'clk', dir: 'in' },
    { id: 'sel', kind: 'port', x: 260, y: 185, text: 'sel', dir: 'in', description: 'mode 控制：0 = /3，1 = /4' },
    { id: 'out', kind: 'port', x: 670, y: 220, text: 'div_out', dir: 'out' },
    { id: 'rst', kind: 'text', x: 120, y: 335, text: 'rst_n → FF0 / FF1 / FF2 的 rstn（非同步 reset，走線省略）' },
    { id: 'j_d0', kind: 'dot', x: 110, y: 132 },
    { id: 'j_q0', kind: 'dot', x: 200, y: 160 },
    { id: 'j_q0b', kind: 'dot', x: 136, y: 160 },
    { id: 'j_q1', kind: 'dot', x: 410, y: 220 },
  ],
  wires: [
    { id: 'w_clk0', from: 'clk0.p', to: 'ff0.clk', kind: 'clock' },
    { id: 'w_clk1', from: 'clk1.p', to: 'ff1.clk', kind: 'clock' },
    { id: 'w_clk2', from: 'clk2.p', to: 'ff2.clk', kind: 'clock' },
    { id: 'w_inv_d0', from: 'inv.out', to: 'ff0.d', signal: 'd0', kind: 'data', points: [[110, 132], [110, 220]], labelAt: 0.6 },
    { id: 'w_d0_and', from: 'inv.out', to: 'and.in0', kind: 'data', points: [[110, 132], [110, 73.33]], noArrow: false },
    { id: 'w_q1_inv', from: 'ff1.q', to: 'inv.in0', signal: 'q1', kind: 'feedback', points: [[410, 220], [410, 300], [28, 300], [28, 132]], labelAt: 0.5 },
    { id: 'w_q1_nor', from: 'ff1.q', to: 'nor.in1', kind: 'feedback', points: [[410, 220], [410, 106.67]] },
    { id: 'w_q0_and', from: 'ff0.q', to: 'and.in1', signal: 'q0', kind: 'feedback', points: [[200, 220], [200, 160], [136, 160], [136, 86.67]], labelAt: 0.15 },
    { id: 'w_q0_mux', from: 'ff0.q', to: 'mux.in1', kind: 'feedback', points: [[200, 220], [200, 160], [228, 160], [228, 120]] },
    { id: 'w_q0_nor', from: 'ff0.q', to: 'nor.in0', kind: 'feedback', points: [[200, 220], [200, 160], [94, 160], [94, 20], [430, 20], [430, 93.33]] },
    { id: 'w_and_mux', from: 'and.out', to: 'mux.in0', signal: 'a', kind: 'data' },
    { id: 'w_mux_d1', from: 'mux.out', to: 'ff1.d', signal: 'd1', kind: 'data', points: [[305, 110], [305, 220]], labelAt: 0.6 },
    { id: 'w_nor_d2', from: 'nor.out', to: 'ff2.d', signal: 'd2', kind: 'data', points: [[521, 100], [521, 220]], labelAt: 0.6 },
    { id: 'w_sel', from: 'sel.p', to: 'mux.sel', signal: 'sel', kind: 'control', route: 'direct' },
    { id: 'w_out', from: 'ff2.q', to: 'out.p', signal: 'div_out', kind: 'output' },
  ],
}

/** 課文與 quiz 用的候選 path 高亮 */
export const progDiv34Highlights = {
  p1: { style: 'setup', wires: ['w_q1_inv', 'w_inv_d0'], elements: ['ff1', 'inv', 'ff0'], tags: [{ elementOrWire: 'ff1', text: 'launch' }, { elementOrWire: 'ff0', text: 'capture' }] },
  p2: { style: 'setup', wires: ['w_q1_inv', 'w_d0_and', 'w_and_mux', 'w_mux_d1'], elements: ['ff1', 'inv', 'and', 'mux'], tags: [{ elementOrWire: 'ff1', text: 'launch = capture' }] },
  p3: { style: 'setup', wires: ['w_q0_and', 'w_and_mux', 'w_mux_d1'], elements: ['ff0', 'and', 'mux', 'ff1'], tags: [{ elementOrWire: 'ff0', text: 'launch' }, { elementOrWire: 'ff1', text: 'capture' }] },
  p4: { style: 'setup', wires: ['w_q0_mux', 'w_mux_d1'], elements: ['ff0', 'mux', 'ff1'], tags: [{ elementOrWire: 'ff0', text: 'launch' }, { elementOrWire: 'ff1', text: 'capture' }] },
  p5: { style: 'setup', wires: ['w_q1_nor', 'w_q0_nor', 'w_nor_d2'], elements: ['ff0', 'ff1', 'nor', 'ff2'], tags: [{ elementOrWire: 'ff2', text: 'capture' }] },
  sel: { style: 'async', wires: ['w_sel', 'w_mux_d1'], elements: ['mux', 'ff1'], tags: [{ elementOrWire: 'sel', text: 'input' }] },
  hold: { style: 'hold', wires: ['w_q1_inv', 'w_inv_d0'], elements: ['ff1', 'inv', 'ff0'], tags: [{ elementOrWire: 'inv', text: 'min-delay path' }] },
} satisfies Record<string, SchematicHighlight>

/* ------------------------------------------------------------------ */
/* 反例一：gate 數最多 ≠ 最慢                                             */
/* FF_A → INV → INV → INV → FF_B（3 × 8 = 24 ps）                          */
/* FF_A → NAND4（fanout 4）→ FF_C（30 ps）                                 */
/* ------------------------------------------------------------------ */
export const gateCountTrapSchematic: Schematic = {
  width: 540,
  height: 300,
  title: '哪一條比較慢？',
  elements: [
    { id: 'clka', kind: 'port', x: 30, y: 122, text: 'clk', dir: 'in' },
    { id: 'ffa', kind: 'dff', x: 80, y: 70, label: 'FF_A', edge: 'rising', signal: 'qa', description: 'launch point（兩條 path 共用）' },
    { id: 'inv1', kind: 'inv', x: 190, y: 78, label: 'INV', description: '小 inverter，fanout 1：8 ps' },
    { id: 'inv2', kind: 'inv', x: 240, y: 78, label: 'INV', description: '小 inverter，fanout 1：8 ps' },
    { id: 'inv3', kind: 'inv', x: 290, y: 78, label: 'INV', description: '小 inverter，fanout 1：8 ps' },
    { id: 'ffb', kind: 'dff', x: 380, y: 70, label: 'FF_B', edge: 'rising', signal: 'qb', description: 'capture point（inverter 鏈）' },
    { id: 'clkb', kind: 'port', x: 356, y: 122, text: 'clk', dir: 'in' },
    { id: 'nand', kind: 'nand', x: 190, y: 180, inputs: 4, label: 'NAND4', description: '4-input NAND，4 個 transistor 疊在一起，輸出還要推 4 個負載：30 ps' },
    { id: 'x1', kind: 'port', x: 150, y: 207.2, text: 'x1', dir: 'in' },
    { id: 'x2', kind: 'port', x: 150, y: 220.8, text: 'x2', dir: 'in' },
    { id: 'x3', kind: 'port', x: 150, y: 234.4, text: 'x3', dir: 'in' },
    { id: 'ffc', kind: 'dff', x: 380, y: 190, label: 'FF_C', edge: 'rising', signal: 'qc', description: 'capture point（NAND4 path）' },
    { id: 'clkc', kind: 'port', x: 356, y: 242, text: 'clk', dir: 'in' },
    {
      id: 'loads',
      kind: 'box',
      x: 300,
      y: 250,
      w: 70,
      h: 30,
      text: '×3 其他負載',
      pins: [{ name: 'in', side: 'left', pos: 0.5, label: '' }],
      description: 'NAND4 的輸出還接到其他 3 個 gate（fanout 4）',
    },
    { id: 'qb', kind: 'port', x: 500, y: 90, text: 'qb', dir: 'out' },
    { id: 'qc', kind: 'port', x: 500, y: 210, text: 'qc', dir: 'out' },
    { id: 'j_qa', kind: 'dot', x: 160, y: 90 },
    { id: 'j_nand', kind: 'dot', x: 270, y: 214 },
  ],
  wires: [
    { id: 'w_clka', from: 'clka.p', to: 'ffa.clk', kind: 'clock' },
    { id: 'w_clkb', from: 'clkb.p', to: 'ffb.clk', kind: 'clock' },
    { id: 'w_clkc', from: 'clkc.p', to: 'ffc.clk', kind: 'clock' },
    { id: 'w_q_inv1', from: 'ffa.q', to: 'inv1.in0', signal: 'qa', kind: 'data' },
    { id: 'w_inv12', from: 'inv1.out', to: 'inv2.in0', kind: 'data', noArrow: true },
    { id: 'w_inv23', from: 'inv2.out', to: 'inv3.in0', kind: 'data', noArrow: true },
    { id: 'w_inv3_d', from: 'inv3.out', to: 'ffb.d', kind: 'data' },
    { id: 'w_q_nand', from: 'ffa.q', to: 'nand.in0', kind: 'data', points: [[160, 90], [160, 193.6]] },
    { id: 'w_x1', from: 'x1.p', to: 'nand.in1', kind: 'control', route: 'direct' },
    { id: 'w_x2', from: 'x2.p', to: 'nand.in2', kind: 'control', route: 'direct' },
    { id: 'w_x3', from: 'x3.p', to: 'nand.in3', kind: 'control', route: 'direct' },
    { id: 'w_nand_d', from: 'nand.out', to: 'ffc.d', kind: 'data' },
    { id: 'w_nand_loads', from: 'nand.out', to: 'loads.in', kind: 'data', points: [[270, 214], [270, 265]] },
    { id: 'w_qb', from: 'ffb.q', to: 'qb.p', signal: 'qb', kind: 'output' },
    { id: 'w_qc', from: 'ffc.q', to: 'qc.p', signal: 'qc', kind: 'output' },
  ],
}

export const gateCountTrapHighlights = {
  invChain: { style: 'setup', wires: ['w_q_inv1', 'w_inv12', 'w_inv23', 'w_inv3_d'], elements: ['ffa', 'inv1', 'inv2', 'inv3', 'ffb'] },
  nandPath: { style: 'setup', wires: ['w_q_nand', 'w_nand_d'], elements: ['ffa', 'nand', 'ffc'] },
  clockPath: { style: 'info', wires: ['w_clka', 'w_clkb', 'w_clkc'], elements: [] },
} satisfies Record<string, SchematicHighlight>

/* ------------------------------------------------------------------ */
/* 反例二：mode 決定 sensitization（/2 /3 cell，AND 慢）                    */
/* ------------------------------------------------------------------ */
export const modeAndSchematic: Schematic = {
  width: 480,
  height: 270,
  title: '/2 /3 cell：d1 = q0 AND mod',
  elements: [
    { id: 'nor', kind: 'nor', x: 40, y: 60, label: 'NOR', description: 'd0 = NOR(q1, q0)：12 ps' },
    { id: 'and', kind: 'and', x: 250, y: 60, label: 'AND (slow)', description: 'd1 = q0 AND mod：18 ps（fanout 大、drive 小）' },
    { id: 'ff0', kind: 'dff', x: 120, y: 180, label: 'FF0', edge: 'rising', signal: 'q0' },
    { id: 'ff1', kind: 'dff', x: 330, y: 180, label: 'FF1', edge: 'rising', signal: 'q1' },
    { id: 'clk0', kind: 'port', x: 96, y: 232, text: 'clk', dir: 'in' },
    { id: 'clk1', kind: 'port', x: 306, y: 232, text: 'clk', dir: 'in' },
    { id: 'mod', kind: 'port', x: 200, y: 140, text: 'mod', dir: 'in', description: 'mod = 0：/2；mod = 1：/3' },
    { id: 'out', kind: 'port', x: 250, y: 215, text: 'div_out = q0', dir: 'out' },
    { id: 'j_q0', kind: 'dot', x: 200, y: 200 },
  ],
  wires: [
    { id: 'w_clk0', from: 'clk0.p', to: 'ff0.clk', kind: 'clock' },
    { id: 'w_clk1', from: 'clk1.p', to: 'ff1.clk', kind: 'clock' },
    { id: 'w_nor_d0', from: 'nor.out', to: 'ff0.d', signal: 'd0', kind: 'data', points: [[106, 80], [106, 200]], labelAt: 0.6 },
    { id: 'w_and_d1', from: 'and.out', to: 'ff1.d', signal: 'd1', kind: 'data', points: [[316, 80], [316, 200]], labelAt: 0.6 },
    { id: 'w_mod', from: 'mod.p', to: 'and.in1', signal: 'mod', kind: 'control', points: [[236, 140], [236, 86.67]] },
    { id: 'w_q0_nor', from: 'ff0.q', to: 'nor.in1', signal: 'q0', kind: 'feedback', points: [[200, 200], [200, 130], [28, 130], [28, 86.67]], labelAt: 0.4 },
    { id: 'w_q0_and', from: 'ff0.q', to: 'and.in0', kind: 'feedback', points: [[200, 200], [200, 130], [224, 130], [224, 73.33]] },
    { id: 'w_q1_nor', from: 'ff1.q', to: 'nor.in0', signal: 'q1', kind: 'feedback', points: [[410, 200], [410, 30], [14, 30], [14, 73.33]], labelAt: 0.5 },
    { id: 'w_out', from: 'ff0.q', to: 'out.p', kind: 'output', points: [[200, 200], [200, 215]] },
  ],
}

export const modeAndHighlights = {
  norPath: { style: 'setup', wires: ['w_q0_nor', 'w_q1_nor', 'w_nor_d0'], elements: ['nor', 'ff0'] },
  andPath: { style: 'setup', wires: ['w_q0_and', 'w_and_d1'], elements: ['ff0', 'and', 'ff1'] },
} satisfies Record<string, SchematicHighlight>
