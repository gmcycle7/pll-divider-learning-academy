import type { SchElement, Schematic, SchematicHighlight, SchWire } from '@/components/circuit/schematic'

/**
 * 兩級 /2 /3 MMD（mmd2）的 gate-level 電路圖。
 *
 * Cell 1（左，clock = clk）：
 *   NOR1：f1 = NOR(a1, a0) = da0；f1 同時是 cell 2 的 clock
 *   AND_P0：mod1_eff = p0 · mod_out2
 *   AND_A1：da1 = a0 · mod1_eff
 * Cell 2（右，clock = f1）：
 *   NOR2：mod_out2 = f2 = NOR(b1, b0) = db0；也是 div_out
 *   AND_B1：db1 = b0 · p1
 * mod_out2 從右下沿底部 channel 回到 cell 1 的 AND_P0。
 */
const CELL1_X = 130
const FF1_X = 240
const CELL2_X = 450
const FF2_X = 560

const cellElements: SchElement[] = [
  { id: 'txt_c1', kind: 'text', x: 60, y: 18, text: 'Cell 1：/2 /3（clock = clk，state a1a0）' },
  { id: 'txt_c2', kind: 'text', x: 400, y: 18, text: 'Cell 2：/2 /3（clock = f1，state b1b0）' },
  { id: 'clk', kind: 'port', x: 30, y: 132, text: 'clk', dir: 'in', description: 'input clock，只驅動 cell 1 的兩個 flop' },
  { id: 'p0', kind: 'port', x: 30, y: 313.33, text: 'p0', dir: 'in', description: 'modulus bit 0（由 controller flop 送出）：cell 1 是否允許走 /3' },
  { id: 'p1', kind: 'port', x: 400, y: 256.67, text: 'p1', dir: 'in', description: 'modulus bit 1（由 controller flop 送出）：cell 2 是否走 /3' },
  { id: 'rst', kind: 'port', x: 30, y: 392, text: 'rst_n', dir: 'in', description: 'async reset（active low），四個 flop 共用' },
  { id: 'nor1', kind: 'nor', x: CELL1_X, y: 80, label: 'NOR1', description: 'f1 = NOT(a1 OR a0) = da0；a = 00 時為 1。f1 也是 cell 2 的 clock' },
  { id: 'and_a1', kind: 'and', x: CELL1_X, y: 220, label: 'AND_A1', description: 'da1 = a0 AND mod1_eff：只有 state 01 且 mod1_eff = 1 時才會讓 a1 變 1（走 /3）' },
  { id: 'and_p0', kind: 'and', x: 60, y: 300, label: 'AND_P0', description: 'mod1_eff = p0 AND mod_out2：cell 2 的請求要先經過 p0 gating' },
  { id: 'ff_a0', kind: 'dff', x: FF1_X, y: 80, label: 'C1.FF0', edge: 'rising', signal: 'a0', description: 'cell 1 state bit a0（LSB），clock = clk' },
  { id: 'ff_a1', kind: 'dff', x: FF1_X, y: 220, label: 'C1.FF1', edge: 'rising', signal: 'a1', description: 'cell 1 state bit a1（MSB），clock = clk；只有走 /3 那一輪才會是 1' },
  { id: 'nor2', kind: 'nor', x: CELL2_X, y: 80, label: 'NOR2', description: 'mod_out2 = f2 = NOT(b1 OR b0) = db0；b = 00 時為 1。也是 div_out' },
  { id: 'and_b1', kind: 'and', x: CELL2_X, y: 220, label: 'AND_B1', description: 'db1 = b0 AND p1' },
  { id: 'ff_b0', kind: 'dff', x: FF2_X, y: 80, label: 'C2.FF0', edge: 'rising', signal: 'b0', description: 'cell 2 state bit b0，clock = f1（generated clock）' },
  { id: 'ff_b1', kind: 'dff', x: FF2_X, y: 220, label: 'C2.FF1', edge: 'rising', signal: 'b1', description: 'cell 2 state bit b1，clock = f1' },
  { id: 'out', kind: 'port', x: 530, y: 44, text: 'div_out', dir: 'out', description: 'div_out = f2 = NOR(b1, b0)' },
  { id: 'j_a0', kind: 'dot', x: 318, y: 100 },
  { id: 'j_f1', kind: 'dot', x: 196, y: 100 },
  { id: 'j_f1b', kind: 'dot', x: 420, y: 160 },
  { id: 'j_b0', kind: 'dot', x: 640, y: 100 },
  { id: 'j_mod', kind: 'dot', x: 516, y: 100 },
]

const cellWires: SchWire[] = [
  // clock
  { id: 'w_clk_a0', from: 'clk.p', to: 'ff_a0.clk', signal: 'clk', kind: 'clock' },
  { id: 'w_clk_a1', from: 'clk.p', to: 'ff_a1.clk', kind: 'clock', points: [[222, 132], [222, 272]] },
  // cell 1 local feedback
  { id: 'w_a0_nor1', from: 'ff_a0.q', to: 'nor1.in0', signal: 'a0', kind: 'feedback', points: [[318, 100], [318, 40], [110, 40], [110, 93.33]], labelAt: 0.45 },
  { id: 'w_a1_nor1', from: 'ff_a1.q', to: 'nor1.in1', signal: 'a1', kind: 'feedback', points: [[330, 240], [330, 28], [100, 28], [100, 106.67]], labelAt: 0.5 },
  { id: 'w_f1_da0', from: 'nor1.out', to: 'ff_a0.d', signal: 'f1', kind: 'data', labelAt: 0.35 },
  { id: 'w_a0_and', from: 'ff_a0.q', to: 'and_a1.in0', kind: 'feedback', points: [[318, 100], [318, 190], [118, 190], [118, 233.33]] },
  { id: 'w_and_da1', from: 'and_a1.out', to: 'ff_a1.d', signal: 'da1', kind: 'data', labelAt: 0.35 },
  // modulus control into cell 1
  { id: 'w_p0', from: 'p0.p', to: 'and_p0.in0', signal: 'p0', kind: 'control' },
  { id: 'w_andp0_and', from: 'and_p0.out', to: 'and_a1.in1', signal: 'mod1_eff', kind: 'control', points: [[120, 320], [120, 246.67]], labelAt: 0.1 },
  // f1 → cell 2 clocks（generated clock）
  { id: 'w_f1_b0clk', from: 'nor1.out', to: 'ff_b0.clk', kind: 'clock', points: [[196, 100], [196, 160], [420, 160], [420, 132]], label: 'f1', labelAt: 0.55 },
  { id: 'w_f1_b1clk', from: 'nor1.out', to: 'ff_b1.clk', kind: 'clock', points: [[196, 100], [196, 160], [540, 160], [540, 272]] },
  // cell 2 local feedback
  { id: 'w_b0_nor2', from: 'ff_b0.q', to: 'nor2.in0', signal: 'b0', kind: 'feedback', points: [[640, 100], [640, 40], [430, 40], [430, 93.33]], labelAt: 0.45 },
  { id: 'w_b1_nor2', from: 'ff_b1.q', to: 'nor2.in1', signal: 'b1', kind: 'feedback', points: [[652, 240], [652, 28], [420, 28], [420, 106.67]], labelAt: 0.5 },
  { id: 'w_nor2_db0', from: 'nor2.out', to: 'ff_b0.d', signal: 'f2', kind: 'data', labelAt: 0.7 },
  { id: 'w_b0_and', from: 'ff_b0.q', to: 'and_b1.in0', kind: 'feedback', points: [[640, 100], [640, 190], [438, 190], [438, 233.33]] },
  { id: 'w_p1', from: 'p1.p', to: 'and_b1.in1', signal: 'p1', kind: 'control' },
  { id: 'w_and_db1', from: 'and_b1.out', to: 'ff_b1.d', signal: 'db1', kind: 'data', labelAt: 0.35 },
  // modulus-out back to cell 1（長回授線）
  { id: 'w_nor2_modp0', from: 'nor2.out', to: 'and_p0.in1', signal: 'mod_out2', kind: 'control', points: [[516, 100], [516, 360], [48, 360], [48, 326.67]], labelAt: 0.5 },
  // output
  { id: 'w_out', from: 'nor2.out', to: 'out.p', signal: 'div_out', kind: 'output', points: [[516, 100], [516, 44]], labelAt: 0.9 },
  // reset
  { id: 'w_rst_a1', from: 'rst.p', to: 'ff_a1.rstn', kind: 'reset', points: [[272, 392]] },
  { id: 'w_rst_b1', from: 'rst.p', to: 'ff_b1.rstn', kind: 'reset', points: [[592, 392]] },
  { id: 'w_rst_a0', from: 'rst.p', to: 'ff_a0.rstn', kind: 'reset', points: [[232, 392], [232, 168], [272, 168]] },
  { id: 'w_rst_b0', from: 'rst.p', to: 'ff_b0.rstn', kind: 'reset', points: [[552, 392], [552, 168], [592, 168]] },
]

export const mmd2Schematic: Schematic = {
  width: 700,
  height: 420,
  title: '兩級 /2 /3 MMD（N = 4 + 2·p1 + p0）',
  elements: cellElements,
  wires: cellWires,
}

// ---------------------------------------------------------------- 變體 A：mod_out2 改在 b = 01 時請求（Lesson 4-1 練習）
/**
 * mod_out2 = b0 · b̄1（AND_MOD），不再等於 f2。f2 = NOR(b1,b0) 仍然是 db0 與 div_out。
 */
export const mmd2ModAt01Schematic: Schematic = {
  width: 820,
  height: 420,
  title: '變體：cell 2 在 state 01 才請求 /3（mod_out2 = b0 · b̄1）',
  elements: [
    ...cellElements.filter((e) => e.id !== 'txt_c2' && e.id !== 'j_mod'),
    { id: 'txt_c2', kind: 'text', x: 400, y: 18, text: 'Cell 2：mod_out2 = b0 AND NOT b1' },
    { id: 'and_mod', kind: 'and', x: 700, y: 150, label: 'AND_MOD', description: 'mod_out2 = b0 AND b̄1：b = 01 那個 f1 週期才為 1' },
    { id: 'j_mod', kind: 'dot', x: 516, y: 100 },
    { id: 'j_b0b', kind: 'dot', x: 640, y: 163.33 },
  ],
  wires: [
    ...cellWires.filter((w) => w.id !== 'w_nor2_modp0'),
    { id: 'w_b0_andmod', from: 'ff_b0.q', to: 'and_mod.in0', kind: 'feedback', points: [[640, 100], [640, 163.33]] },
    { id: 'w_b1b_andmod', from: 'ff_b1.qb', to: 'and_mod.in1', signal: 'b1b', kind: 'feedback', points: [[680, 272], [680, 176.67]], labelAt: 0.4 },
    { id: 'w_andmod_modp0', from: 'and_mod.out', to: 'and_p0.in1', signal: 'mod_out2', kind: 'control', points: [[770, 170], [770, 360], [48, 360], [48, 326.67]], labelAt: 0.5 },
  ],
}

// ---------------------------------------------------------------- 變體 B：p0 的 AND 移到 mod_out2 之前（Lesson 4-2 練習）
/**
 * AND_P0 搬到 cell 2：mod_out2 = f2 · p0，cell 1 只剩 da1 = a0 · mod_out2。
 */
export const mmd2P0FirstSchematic: Schematic = {
  width: 820,
  height: 420,
  title: '變體：p0 先與 f2 AND，再回傳 cell 1（mod_out2 = f2 · p0）',
  elements: [
    ...cellElements.filter((e) => e.id !== 'and_p0' && e.id !== 'p0' && e.id !== 'txt_c1' && e.id !== 'txt_c2'),
    { id: 'txt_c1', kind: 'text', x: 60, y: 18, text: 'Cell 1：da1 = a0 AND mod_out2' },
    { id: 'txt_c2', kind: 'text', x: 400, y: 18, text: 'Cell 2：mod_out2 = f2 AND p0' },
    { id: 'and_p0', kind: 'and', x: 700, y: 150, label: 'AND_P0', description: 'mod_out2 = f2 AND p0：p0 gating 搬到 cell 2 這一側' },
    { id: 'p0', kind: 'port', x: 670, y: 176.67, text: 'p0', dir: 'in', description: 'modulus bit 0，現在接到 cell 2' },
  ],
  wires: [
    ...cellWires.filter((w) => w.id !== 'w_nor2_modp0' && w.id !== 'w_p0' && w.id !== 'w_andp0_and'),
    { id: 'w_f2_andp0', from: 'nor2.out', to: 'and_p0.in0', kind: 'data', points: [[516, 100], [516, 130], [690, 130], [690, 163.33]] },
    { id: 'w_p0', from: 'p0.p', to: 'and_p0.in1', signal: 'p0', kind: 'control' },
    { id: 'w_andp0_and', from: 'and_p0.out', to: 'and_a1.in1', signal: 'mod_out2', kind: 'control', points: [[770, 170], [770, 360], [120, 360], [120, 246.67]], labelAt: 0.5 },
  ],
}

// ---------------------------------------------------------------- Block-level：n 級 cell 串接
/**
 * 以 box 表示每一級 /2 /3 cell：
 *   左：fin（clock in）、modout（往前級）；右：fout（往後級 clock）、modin（來自後級）；下：p（modulus bit）
 */
export function mmdBlockSchematic(n: number): Schematic {
  const boxW = 120
  const gap = 70
  const x0 = 110
  const y = 60
  const elements: SchElement[] = [
    { id: 'clk', kind: 'port', x: 40, y: y + 27, text: 'clk', dir: 'in', description: 'input clock（最高速）' },
    { id: 'rst', kind: 'port', x: 40, y: y + 63, text: 'mod_out1', dir: 'out', description: '第一級的 modulus-out（最前級不需要，可留空）' },
  ]
  const wires: SchWire[] = []
  for (let i = 0; i < n; i++) {
    const x = x0 + i * (boxW + gap)
    elements.push({
      id: `cell${i + 1}`,
      kind: 'box',
      x,
      y,
      w: boxW,
      h: 90,
      text: `cell ${i + 1}\n/2 or /3`,
      edge: 'rising',
      pins: [
        { name: 'fin', side: 'left', pos: 0.3, label: 'clk' },
        { name: 'modout', side: 'left', pos: 0.7, label: 'mod_out' },
        { name: 'fout', side: 'right', pos: 0.3, label: 'f_out' },
        { name: 'modin', side: 'right', pos: 0.7, label: 'mod_in' },
        { name: 'p', side: 'bottom', pos: 0.5, label: `p${i}` },
      ],
      description: i === 0 ? '最高速的一級：直接吃 clk' : `第 ${i + 1} 級：clock = 前一級的 f_out（頻率已被除過）`,
    })
    elements.push({ id: `p${i}`, kind: 'port', x: x + boxW / 2, y: y + 90 + 40, text: `p${i}`, dir: 'in', description: `modulus bit ${i}（權重 2^${i}）` })
    wires.push({ id: `w_p${i}`, from: `p${i}.p`, to: `cell${i + 1}.p`, signal: `p${i}`, kind: 'control', route: 'direct' })
    if (i === 0) wires.push({ id: 'w_clk', from: 'clk.p', to: 'cell1.fin', signal: 'clk', kind: 'clock' })
    else {
      wires.push({ id: `w_f${i}`, from: `cell${i}.fout`, to: `cell${i + 1}.fin`, signal: `f${i}`, kind: 'clock', route: 'direct', labelAt: 0.5 })
      wires.push({ id: `w_mod${i + 1}`, from: `cell${i + 1}.modout`, to: `cell${i}.modin`, signal: `mod_out${i + 1}`, kind: 'control', route: 'direct', labelAt: 0.5 })
    }
  }
  const xLast = x0 + (n - 1) * (boxW + gap) + boxW
  elements.push({ id: 'out', kind: 'port', x: xLast + 60, y: y + 27, text: 'div_out', dir: 'out', description: `div_out = f${n}：最後一級的輸出` })
  elements.push({ id: 'one', kind: 'port', x: xLast + 60, y: y + 63, text: '1', dir: 'in', description: `最後一級的 mod_in 固定為 1：每個輸出週期都允許一次 /3 請求` })
  wires.push({ id: 'w_out', from: `cell${n}.fout`, to: 'out.p', signal: `f${n}`, kind: 'output', route: 'direct' })
  wires.push({ id: 'w_one', from: 'one.p', to: `cell${n}.modin`, kind: 'control', route: 'direct' })
  wires.push({ id: 'w_mod1', from: 'cell1.modout', to: 'rst.p', kind: 'control', route: 'direct', noArrow: true })
  return { width: xLast + 140, height: y + 90 + 70, elements, wires, title: `${n} 級 /2 /3 cell 串接：N = 2^${n} + Σ p_i·2^i` }
}

export const mmd2BlockSchematic = mmdBlockSchematic(2)
export const mmd3BlockSchematic = mmdBlockSchematic(3)

// ---------------------------------------------------------------- 高亮（quiz 與課文用）
export const hlPath1Local: SchematicHighlight = {
  style: 'setup',
  wires: ['w_a0_nor1', 'w_f1_da0'],
  elements: ['ff_a0', 'nor1'],
  tags: [{ elementOrWire: 'ff_a0', text: 'launch = capture（edge k → k+1）' }],
}

export const hlPath2ModOut: SchematicHighlight = {
  style: 'setup',
  wires: ['w_f1_b0clk', 'w_b0_nor2', 'w_nor2_modp0', 'w_andp0_and', 'w_and_da1'],
  elements: ['ff_a0', 'nor1', 'ff_b0', 'nor2', 'and_p0', 'and_a1', 'ff_a1'],
  tags: [
    { elementOrWire: 'ff_b0', text: 'launch（f1↑）' },
    { elementOrWire: 'ff_a1', text: 'capture（clk↑）', dy: 100 },
  ],
}

export const hlPath3Control: SchematicHighlight = {
  style: 'async',
  wires: ['w_p0', 'w_andp0_and', 'w_and_da1'],
  elements: ['and_p0', 'and_a1', 'ff_a1'],
  tags: [{ elementOrWire: 'and_p0', text: 'p0 只在 a = 01 且 mod_out2 = 1 時被用到' }],
}

export const hlPath4Output: SchematicHighlight = {
  style: 'info',
  wires: ['w_b0_nor2', 'w_out'],
  elements: ['ff_b0', 'nor2'],
  tags: [{ elementOrWire: 'nor2', text: 'output decode：沒有 capture flop' }],
}

export const hlPath5Reset: SchematicHighlight = {
  style: 'async',
  wires: ['w_rst_a0', 'w_rst_a1', 'w_rst_b0', 'w_rst_b1'],
  elements: ['rst'],
  tags: [{ elementOrWire: 'ff_a1', text: 'recovery / removal', dy: 100 }],
}

export const hlF1Clock: SchematicHighlight = {
  style: 'info',
  wires: ['w_f1_b0clk', 'w_f1_b1clk'],
  elements: ['nor1'],
  tags: [{ elementOrWire: 'w_f1_b0clk', text: 'f1：generated clock（最長的線，但不是 path）' }],
}

export const hlHoldA0And: SchematicHighlight = {
  style: 'hold',
  wires: ['w_a0_and', 'w_and_da1'],
  elements: ['ff_a0', 'and_a1', 'ff_a1'],
  tags: [{ elementOrWire: 'and_a1', text: 'min delay：tCQ,min + tAND,min' }],
}
