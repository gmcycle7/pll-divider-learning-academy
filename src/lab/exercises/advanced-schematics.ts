import type { SchElement, SchWire, Schematic } from '@/components/circuit/schematic'

/**
 * 題目 5～8 的「陌生電路圖」。
 * 規則與題目 1～4 相同：元件只標 U1、U2…，走線只標 n1、n2…（clock / reset / 控制腳位除外），
 * 不出現 q0 / d0 / mod 這類會洩漏功能的名稱。block diagram（題目 8）以 box 呈現，不標 label。
 */

// ---------------------------------------------------------------- 題目 5：/2 /3 dual-modulus cell
/**
 * netlist = examples.dualMod23
 *   U1 = FF0（q0）、U2 = FF1（q1）、U3 = NOR、U4 = AND
 *   n1 = q0、n2 = q1、n3 = NOR 輸出（d0，也是 out）、n4 = AND 輸出（d1）、ctrl = mod
 */
export const ex5Schematic: Schematic = {
  width: 600,
  height: 300,
  elements: [
    { id: 'clk', kind: 'port', x: 40, y: 92, text: 'clk', dir: 'in', description: 'clock input（兩個 flop 共用）' },
    { id: 'rst', kind: 'port', x: 40, y: 270, text: 'rst_n', dir: 'in', description: 'active-low async reset（兩個 flop 共用）' },
    { id: 'ctrl', kind: 'port', x: 410, y: 205, text: 'ctrl', dir: 'in', description: '一個外部控制訊號（0 或 1），與 clk 同步' },
    { id: 'u1', kind: 'dff', x: 110, y: 40, label: 'U1', edge: 'rising', description: 'rising-edge D flip-flop' },
    { id: 'u2', kind: 'dff', x: 330, y: 40, label: 'U2', edge: 'rising', description: 'rising-edge D flip-flop' },
    { id: 'u3', kind: 'nor', x: 200, y: 140, label: 'U3', inputs: 2, description: 'NOR gate（輸出端有 bubble）' },
    { id: 'u4', kind: 'and', x: 450, y: 140, label: 'U4', inputs: 2, description: 'AND gate' },
    { id: 'j1', kind: 'dot', x: 180, y: 60 },
    { id: 'j2', kind: 'dot', x: 265, y: 160 },
    { id: 'out', kind: 'port', x: 300, y: 190, text: 'out', dir: 'out', description: 'output' },
  ],
  wires: [
    { id: 'w_clk1', from: 'clk.p', to: 'u1.clk', signal: 'clk', label: 'clk', kind: 'clock' },
    { id: 'w_clk2', from: 'clk.p', to: 'u2.clk', signal: 'clk', label: 'clk', kind: 'clock', points: [[70, 92], [70, 215], [305, 215], [305, 92]], labelAt: 0.5 },
    { id: 'w_q0_nor', from: 'u1.q', to: 'u3.in0', signal: 'q0', label: 'n1', kind: 'feedback', points: [[180, 60], [180, 153.33]], labelAt: 0.6 },
    { id: 'w_q1_nor', from: 'u2.q', to: 'u3.in1', signal: 'q1', label: 'n2', kind: 'feedback', points: [[410, 60], [410, 125], [190, 125], [190, 166.67]], labelAt: 0.5 },
    { id: 'w_q0_and', from: 'u1.q', to: 'u4.in0', signal: 'q0', label: 'n1', kind: 'data', points: [[180, 60], [180, 20], [440, 20], [440, 153.33]], labelAt: 0.5 },
    { id: 'w_ctrl', from: 'ctrl.p', to: 'u4.in1', signal: 'mod', label: 'ctrl', kind: 'control', points: [[430, 205], [430, 166.67]], labelAt: 0.3 },
    { id: 'w_d0', from: 'u3.out', to: 'u1.d', signal: 'd0', label: 'n3', kind: 'data', points: [[265, 160], [265, 195], [95, 195], [95, 60]], labelAt: 0.5 },
    { id: 'w_out', from: 'u3.out', to: 'out.p', signal: 'div_out', label: 'n3', kind: 'output', points: [[265, 160], [265, 190]], labelAt: 0.45 },
    { id: 'w_d1', from: 'u4.out', to: 'u2.d', signal: 'd1', label: 'n4', kind: 'data', points: [[515, 160], [515, 235], [318, 235], [318, 60]], labelAt: 0.5 },
    { id: 'w_rst1', from: 'rst.p', to: 'u1.rstn', kind: 'reset', points: [[142, 270]] },
    { id: 'w_rst2', from: 'rst.p', to: 'u2.rstn', kind: 'reset', points: [[362, 270]] },
  ],
}

// ---------------------------------------------------------------- 題目 6：兩級 /2 /3 MMD
/**
 * netlist = examples.mmd2。兩個虛框（block A / block B）只是視覺分組，不是元件。
 *   block A（clock = clk）：U3 = NOR、U4 = AND、U5 = AND（c0 gating）、U1 = FF（a0）、U2 = FF（a1）
 *   block B（clock = n3）：U8 = NOR、U9 = AND、U6 = FF（b0）、U7 = FF（b1）
 *   n1 = a0、n2 = a1、n3 = f1（NOR 輸出，也是 block B 的 clock）、n4 = da1、n5 = mod1_eff、
 *   n6 = b0、n7 = b1、n8 = f2 = mod_out2（也是 out）、n9 = db1；c0 = p0、c1 = p1
 */
const EX6_A_X = 130
const EX6_FA_X = 240
const EX6_B_X = 450
const EX6_FB_X = 560

/**
 * 兩個虛框用「首尾同一點的 reset-kind wire」畫成點線矩形：box 元件有不透明底色、又畫在 wire 之上，會把框內的走線蓋掉。
 * 錨點是空字串的 text 元件（不會畫出任何東西）。
 */
const ex6Elements: SchElement[] = [
  { id: 'cornerA', kind: 'text', x: 40, y: 50, text: '' },
  { id: 'cornerB', kind: 'text', x: 415, y: 50, text: '' },
  { id: 'txt_a', kind: 'text', x: 48, y: 66, text: 'block A' },
  { id: 'txt_b', kind: 'text', x: 423, y: 66, text: 'block B' },
  { id: 'clk', kind: 'port', x: 30, y: 132, text: 'clk', dir: 'in', description: 'input clock：只接到 U1、U2 的 clk pin' },
  { id: 'c0', kind: 'port', x: 30, y: 313.33, text: 'c0', dir: 'in', description: '外部控制 bit 0' },
  { id: 'c1', kind: 'port', x: 400, y: 256.67, text: 'c1', dir: 'in', description: '外部控制 bit 1' },
  { id: 'rst', kind: 'port', x: 30, y: 392, text: 'rst_n', dir: 'in', description: 'async reset（active low），四個 flop 共用' },
  { id: 'u3', kind: 'nor', x: EX6_A_X, y: 80, label: 'U3', description: 'NOR gate；輸出 n3 同時接到 U1.D 與 block B 的 clk' },
  { id: 'u4', kind: 'and', x: EX6_A_X, y: 220, label: 'U4', description: 'AND gate' },
  { id: 'u5', kind: 'and', x: 60, y: 300, label: 'U5', description: 'AND gate（一個輸入是 c0，另一個來自 block B）' },
  { id: 'u1', kind: 'dff', x: EX6_FA_X, y: 80, label: 'U1', edge: 'rising', description: 'rising-edge DFF，clock = clk' },
  { id: 'u2', kind: 'dff', x: EX6_FA_X, y: 220, label: 'U2', edge: 'rising', description: 'rising-edge DFF，clock = clk' },
  { id: 'u8', kind: 'nor', x: EX6_B_X, y: 80, label: 'U8', description: 'NOR gate；輸出 n8 是 out，也回送到 block A 的 U5' },
  { id: 'u9', kind: 'and', x: EX6_B_X, y: 220, label: 'U9', description: 'AND gate' },
  { id: 'u6', kind: 'dff', x: EX6_FB_X, y: 80, label: 'U6', edge: 'rising', description: 'rising-edge DFF，clock 來自 n3（不是 clk）' },
  { id: 'u7', kind: 'dff', x: EX6_FB_X, y: 220, label: 'U7', edge: 'rising', description: 'rising-edge DFF，clock 來自 n3（不是 clk）' },
  { id: 'out', kind: 'port', x: 530, y: 44, text: 'out', dir: 'out', description: 'output' },
  { id: 'j_a0', kind: 'dot', x: 318, y: 100 },
  { id: 'j_f1', kind: 'dot', x: 196, y: 100 },
  { id: 'j_f1b', kind: 'dot', x: 420, y: 160 },
  { id: 'j_b0', kind: 'dot', x: 640, y: 100 },
  { id: 'j_mod', kind: 'dot', x: 516, y: 100 },
]

const ex6Wires: SchWire[] = [
  { id: 'w_blockA', from: 'cornerA.p', to: 'cornerA.p', kind: 'reset', noArrow: true, label: '', points: [[360, 50], [360, 355], [40, 355]] },
  { id: 'w_blockB', from: 'cornerB.p', to: 'cornerB.p', kind: 'reset', noArrow: true, label: '', points: [[685, 50], [685, 310], [415, 310]] },
  { id: 'w_clk_a0', from: 'clk.p', to: 'u1.clk', signal: 'clk', label: 'clk', kind: 'clock' },
  { id: 'w_clk_a1', from: 'clk.p', to: 'u2.clk', signal: 'clk', label: 'clk', kind: 'clock', points: [[222, 132], [222, 272]], labelAt: 0.6 },
  { id: 'w_a0_nor1', from: 'u1.q', to: 'u3.in0', signal: 'a0', label: 'n1', kind: 'feedback', points: [[318, 100], [318, 40], [110, 40], [110, 93.33]], labelAt: 0.45 },
  { id: 'w_a1_nor1', from: 'u2.q', to: 'u3.in1', signal: 'a1', label: 'n2', kind: 'feedback', points: [[330, 240], [330, 28], [100, 28], [100, 106.67]], labelAt: 0.5 },
  { id: 'w_f1_da0', from: 'u3.out', to: 'u1.d', signal: 'f1', label: 'n3', kind: 'data', labelAt: 0.35 },
  { id: 'w_a0_and', from: 'u1.q', to: 'u4.in0', signal: 'a0', label: 'n1', kind: 'feedback', points: [[318, 100], [318, 190], [118, 190], [118, 233.33]], labelAt: 0.5 },
  { id: 'w_and_da1', from: 'u4.out', to: 'u2.d', signal: 'da1', label: 'n4', kind: 'data', labelAt: 0.35 },
  { id: 'w_c0', from: 'c0.p', to: 'u5.in0', signal: 'p0', label: 'c0', kind: 'control' },
  { id: 'w_andp0_and', from: 'u5.out', to: 'u4.in1', signal: 'mod1_eff', label: 'n5', kind: 'control', points: [[120, 320], [120, 246.67]], labelAt: 0.1 },
  { id: 'w_f1_b0clk', from: 'u3.out', to: 'u6.clk', signal: 'f1', label: 'n3', kind: 'clock', points: [[196, 100], [196, 160], [420, 160], [420, 132]], labelAt: 0.55 },
  { id: 'w_f1_b1clk', from: 'u3.out', to: 'u7.clk', kind: 'clock', points: [[196, 100], [196, 160], [540, 160], [540, 272]] },
  { id: 'w_b0_nor2', from: 'u6.q', to: 'u8.in0', signal: 'b0', label: 'n6', kind: 'feedback', points: [[640, 100], [640, 40], [430, 40], [430, 93.33]], labelAt: 0.45 },
  { id: 'w_b1_nor2', from: 'u7.q', to: 'u8.in1', signal: 'b1', label: 'n7', kind: 'feedback', points: [[652, 240], [652, 28], [420, 28], [420, 106.67]], labelAt: 0.5 },
  { id: 'w_nor2_db0', from: 'u8.out', to: 'u6.d', signal: 'f2', label: 'n8', kind: 'data', labelAt: 0.7 },
  { id: 'w_b0_and', from: 'u6.q', to: 'u9.in0', signal: 'b0', label: 'n6', kind: 'feedback', points: [[640, 100], [640, 190], [438, 190], [438, 233.33]], labelAt: 0.5 },
  { id: 'w_c1', from: 'c1.p', to: 'u9.in1', signal: 'p1', label: 'c1', kind: 'control' },
  { id: 'w_and_db1', from: 'u9.out', to: 'u7.d', signal: 'db1', label: 'n9', kind: 'data', labelAt: 0.35 },
  { id: 'w_nor2_modp0', from: 'u8.out', to: 'u5.in1', signal: 'mod_out2', label: 'n8', kind: 'control', points: [[516, 100], [516, 360], [48, 360], [48, 326.67]], labelAt: 0.5 },
  { id: 'w_out', from: 'u8.out', to: 'out.p', signal: 'div_out', label: 'n8', kind: 'output', points: [[516, 100], [516, 44]], labelAt: 0.9 },
  { id: 'w_rst_a1', from: 'rst.p', to: 'u2.rstn', kind: 'reset', points: [[272, 392]] },
  { id: 'w_rst_b1', from: 'rst.p', to: 'u7.rstn', kind: 'reset', points: [[592, 392]] },
  { id: 'w_rst_a0', from: 'rst.p', to: 'u1.rstn', kind: 'reset', points: [[232, 392], [232, 168], [272, 168]] },
  { id: 'w_rst_b0', from: 'rst.p', to: 'u6.rstn', kind: 'reset', points: [[552, 392], [552, 168], [592, 168]] },
]

export const ex6Schematic: Schematic = {
  width: 700,
  height: 420,
  elements: ex6Elements,
  wires: ex6Wires,
}

// ---------------------------------------------------------------- 題目 7：8-phase PMUX + /4
/**
 * netlist = advanced-models.pmux8Div4
 *   U1 = 8:1 MUX（select = s2 s1 s0）、U2 = FF0（q0）、U3 = FF1（q1）、U4 = INV、U5 = XOR
 *   n1 = pclk（MUX 輸出，兩個 flop 的 clock）、n2 = q0、n3 = d0、n4 = q1（out）、n5 = d1
 */
function muxPinY(muxY: number, i: number) {
  return muxY + (170 * (i + 1)) / 9
}

const ex7Mux = { x: 120, y: 30 }
const ex7PhaseElements: SchElement[] = Array.from({ length: 8 }, (_, i) => ({
  id: `ph${i}`,
  kind: 'port' as const,
  x: 50,
  y: muxPinY(ex7Mux.y, i),
  text: `ph${i}`,
  dir: 'in' as const,
  description: `VCO phase ${i}：rising edge 在 k·T + ${i}/8·T，duty 50%`,
}))
const ex7PhaseWires: SchWire[] = Array.from({ length: 8 }, (_, i) => ({
  id: `w_ph${i}`,
  from: `ph${i}.p`,
  to: `u1.in${i}`,
  signal: `ph${i}`,
  label: `ph${i}`,
  kind: 'clock' as const,
  noArrow: true,
  labelAt: 0.3,
}))

export const ex7Schematic: Schematic = {
  width: 740,
  height: 300,
  elements: [
    ...ex7PhaseElements,
    { id: 'u1', kind: 'mux8', x: ex7Mux.x, y: ex7Mux.y, label: 'U1', description: '8:1 MUX：sel 決定哪一個輸入成為輸出 n1' },
    { id: 'sel', kind: 'port', x: 140, y: 245, text: 's2 s1 s0', dir: 'in', description: '3-bit select（外部輸入）' },
    { id: 'u2', kind: 'dff', x: 250, y: 40, label: 'U2', edge: 'rising', description: 'rising-edge DFF；clock 是 n1（MUX 輸出），不是任何一個 ph' },
    { id: 'u4', kind: 'inv', x: 330, y: 150, label: 'U4', description: 'inverter' },
    { id: 'u3', kind: 'dff', x: 470, y: 40, label: 'U3', edge: 'rising', description: 'rising-edge DFF；clock 是 n1' },
    { id: 'u5', kind: 'xor', x: 560, y: 150, label: 'U5', description: 'XOR gate' },
    { id: 'rst', kind: 'port', x: 392, y: 275, text: 'rst_n', dir: 'in', description: 'active-low async reset（兩個 flop 共用）' },
    { id: 'j1', kind: 'dot', x: 190, y: 115 },
    { id: 'j2', kind: 'dot', x: 322, y: 60 },
    { id: 'j3', kind: 'dot', x: 640, y: 60 },
    { id: 'out', kind: 'port', x: 680, y: 60, text: 'out', dir: 'out', description: 'output' },
  ],
  wires: [
    ...ex7PhaseWires,
    { id: 'w_sel', from: 'sel.p', to: 'u1.sel', kind: 'control', route: 'direct', label: 'sel' },
    { id: 'w_pclk0', from: 'u1.out', to: 'u2.clk', signal: 'pclk', label: 'n1', kind: 'clock', points: [[190, 115], [190, 92]] },
    { id: 'w_pclk1', from: 'u1.out', to: 'u3.clk', signal: 'pclk', label: 'n1', kind: 'clock', points: [[190, 115], [190, 20], [450, 20], [450, 92]], labelAt: 0.5 },
    { id: 'w_q0_inv', from: 'u2.q', to: 'u4.in0', signal: 'q0', label: 'n2', kind: 'feedback', points: [[322, 60], [322, 162]], labelAt: 0.6 },
    { id: 'w_d0', from: 'u4.out', to: 'u2.d', signal: 'd0', label: 'n3', kind: 'feedback', points: [[380, 162], [380, 235], [232, 235], [232, 60]], labelAt: 0.6 },
    { id: 'w_q0_xor', from: 'u2.q', to: 'u5.in1', signal: 'q0', label: 'n2', kind: 'data', points: [[322, 60], [322, 120], [548, 120], [548, 177]], noArrow: true, labelAt: 0.5 },
    { id: 'w_q1_xor', from: 'u3.q', to: 'u5.in0', signal: 'q1', label: 'n4', kind: 'feedback', points: [[640, 60], [640, 130], [552, 130], [552, 163]], labelAt: 0.4 },
    { id: 'w_d1', from: 'u5.out', to: 'u3.d', signal: 'd1', label: 'n5', kind: 'feedback', points: [[624, 170], [624, 235], [456, 235], [456, 60]], labelAt: 0.6 },
    { id: 'w_out', from: 'u3.q', to: 'out.p', signal: 'div_out', label: 'n4', kind: 'output', labelAt: 0.8 },
    { id: 'w_rst1', from: 'rst.p', to: 'u2.rstn', kind: 'reset', points: [[282, 275]] },
    { id: 'w_rst2', from: 'rst.p', to: 'u3.rstn', kind: 'reset', points: [[502, 275]] },
  ],
}

// ---------------------------------------------------------------- 題目 8：PMUX + /N /N+1 + control FSM + DTC（block diagram）
/**
 * netlist = advanced-models.pmuxWalkerDm23（DTC 只是 behavioral，不在 netlist 內）
 *   VCO → PMUX（sel 來自 FSM）→ pclk → /N /N+1（mod 外部輸入）→ div_out → DTC → out
 *   FSM：phase index（s）、control word（t）、walker；clock = pclk，也看得到 8 個 phase
 */
const ex8PhasePins = Array.from({ length: 8 }, (_, i) => ({ name: `ph${i}`, pos: (i + 1) / 9 }))

export const ex8Schematic: Schematic = {
  width: 740,
  height: 370,
  elements: [
    {
      id: 'vco',
      kind: 'box',
      x: 30,
      y: 40,
      w: 90,
      h: 170,
      text: '8-phase\nVCO',
      description: '8 個相位 ph0..ph7，相鄰相位 rising edge 相差 T/8，duty 50%',
      pins: [...ex8PhasePins.map((p) => ({ name: p.name, side: 'right' as const, pos: p.pos, label: p.name })), { name: 'bus', side: 'bottom' as const, pos: 0.5 }],
    },
    {
      id: 'pmux',
      kind: 'box',
      x: 190,
      y: 40,
      w: 90,
      h: 170,
      text: 'PMUX\n8:1',
      description: 'combinational 8:1 phase MUX：pclk = ph[sel]',
      pins: [...ex8PhasePins.map((p) => ({ name: p.name, side: 'left' as const, pos: p.pos })), { name: 'out', side: 'right' as const, pos: 0.5, label: 'pclk' }, { name: 'sel', side: 'bottom' as const, pos: 0.5, label: 'sel' }],
    },
    {
      id: 'div',
      kind: 'box',
      x: 340,
      y: 95,
      w: 110,
      h: 60,
      text: '/N /N+1',
      edge: 'rising',
      description: '兩個 flop 的 dual-modulus cell（與題目 5 相同），clock = pclk；mod = 0 → N = 2，mod = 1 → N = 3',
      pins: [
        { name: 'clk', side: 'left', pos: 0.5, label: 'clk' },
        { name: 'out', side: 'right', pos: 0.5, label: 'out' },
        { name: 'mod', side: 'top', pos: 0.5, label: '' },
        { name: 'st', side: 'bottom', pos: 0.75, label: 'st' },
      ],
    },
    {
      id: 'dtc',
      kind: 'box',
      x: 520,
      y: 95,
      w: 90,
      h: 60,
      text: 'DTC',
      description: 'digital-to-time converter：把 div_out 的 edge 再延後 code × (T/8)/2^F（behavioral，不在模擬 netlist 內）',
      pins: [
        { name: 'in', side: 'left', pos: 0.5 },
        { name: 'out', side: 'right', pos: 0.5 },
        { name: 'code', side: 'bottom', pos: 0.5, label: 'code' },
      ],
    },
    {
      id: 'fsm',
      kind: 'box',
      x: 340,
      y: 250,
      w: 250,
      h: 80,
      text: 'control FSM\n(index s · word t · walker)',
      edge: 'rising',
      description: '9 個 flop：phase index s2 s1 s0、control word t2 t1 t0（各 3 個）加上 cell 之外的 walker 邏輯；每個 output 週期把 control word 加 step，並把 phase index 逐格走到 control word',
      pins: [
        { name: 'sel', side: 'left', pos: 0.25, label: 'sel' },
        { name: 'ph', side: 'left', pos: 0.625, label: 'ph[7:0]' },
        { name: 'pclk', side: 'top', pos: 0.3, label: 'pclk' },
        { name: 'st', side: 'top', pos: 0.45, label: 'st' },
        { name: 'code', side: 'top', pos: 0.9, label: 'code' },
        { name: 'step', side: 'bottom', pos: 0.3, label: 'step' },
      ],
    },
    { id: 'mod', kind: 'port', x: 395, y: 60, text: 'mod', dir: 'in', description: 'modulus 控制（外部輸入）：0 → /2、1 → /3' },
    { id: 'step', kind: 'port', x: 415, y: 355, text: 'k1 k0', dir: 'in', description: 'fractional step（0..3）：每個 output 週期 phase 往前走 step 格（每格 T/8）' },
    { id: 'out', kind: 'port', x: 700, y: 125, text: 'out', dir: 'out', description: '經過 DTC 的最終輸出' },
    { id: 'txt_ph', kind: 'text', x: 128, y: 30, text: 'ph0 … ph7' },
    { id: 'j1', kind: 'dot', x: 310, y: 125 },
  ],
  wires: [
    ...ex8PhasePins.map((p, i) => ({ id: `w_${p.name}`, from: `vco.${p.name}`, to: `pmux.${p.name}`, kind: 'clock' as const, route: 'direct' as const, noArrow: i !== 0, ...(i === 0 ? { signal: 'ph0', label: 'ph0' } : {}) })),
    { id: 'w_pclk_div', from: 'pmux.out', to: 'div.clk', signal: 'pclk', label: 'pclk', kind: 'clock', route: 'direct', labelAt: 0.5 },
    { id: 'w_pclk_fsm', from: 'pmux.out', to: 'fsm.pclk', signal: 'pclk', label: 'pclk', kind: 'clock', points: [[310, 125], [310, 235], [415, 235]], labelAt: 0.6 },
    { id: 'w_sel', from: 'fsm.sel', to: 'pmux.sel', label: 'sel[2:0]', kind: 'control', points: [[235, 270]], labelAt: 0.4 },
    { id: 'w_bus', from: 'vco.bus', to: 'fsm.ph', label: 'ph[7:0]', kind: 'clock', points: [[75, 300]], labelAt: 0.5, noArrow: true },
    { id: 'w_mod', from: 'mod.p', to: 'div.mod', signal: 'mod', label: 'mod', kind: 'control', route: 'direct' },
    { id: 'w_div_out', from: 'div.out', to: 'dtc.in', signal: 'div_out', label: 'div_out', kind: 'output', route: 'direct', labelAt: 0.12 },
    { id: 'w_st', from: 'div.st', to: 'fsm.st', signal: 'd0', label: 'state=00', kind: 'control', points: [[422.5, 200], [452.5, 200]], labelAt: 0.5 },
    { id: 'w_code', from: 'fsm.code', to: 'dtc.code', label: 'dtc_code', kind: 'control', points: [[565, 200]], labelAt: 0.5 },
    { id: 'w_out', from: 'dtc.out', to: 'out.p', label: 'out', kind: 'output', route: 'direct' },
    { id: 'w_step', from: 'step.p', to: 'fsm.step', label: 'k1 k0', kind: 'control', route: 'direct' },
  ],
}
