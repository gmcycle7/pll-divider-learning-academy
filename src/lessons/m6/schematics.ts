import type { Schematic, SchematicHighlight } from '@/components/circuit/schematic'
import type { TimingScenario, TimingSegment } from '@/models/timing/types'

/**
 * /2 /3 cell + 2-bit accumulator 的 gate-level 電路圖（frac275 與 frac225 共用版面）。
 *   上半：FF0/FF1（q0 q1）、NOR（d0）、AND（d1 = q0·mod）
 *   下半：ACC0/ACC1（a0 a1）、XOR0（da0 = a0⊕q0）、[INV]、AND（borrow / carry-in）、XOR1（da1）
 *   右上：OR 或 AND 把 a1 a0 decode 成 mod（accumulator 的 carry）
 */
function accumulatorSchematic(opts: { title: string; modKind: 'or' | 'and'; modLabel: string; borrowInv: boolean; borrowLabel: string; modSignal?: string }): Schematic {
  const { title, modKind, modLabel, borrowInv, borrowLabel } = opts
  const elements: Schematic['elements'] = [
    { id: 'clk', kind: 'port', x: 30, y: 92, text: 'clk', dir: 'in', description: 'input clock（Tin）' },
    { id: 'rstn', kind: 'port', x: 30, y: 520, text: 'rst_n', dir: 'in', description: 'async reset（active low）：四顆 flop 的 resetValue 都是 0 ⇒ reset state = 0000' },
    // /2 /3 cell
    { id: 'ff0', kind: 'dff', x: 140, y: 40, label: 'FF0', edge: 'rising', signal: 'q0', description: '/2 /3 cell state bit q0' },
    { id: 'ff1', kind: 'dff', x: 140, y: 170, label: 'FF1', edge: 'rising', signal: 'q1', description: '/2 /3 cell state bit q1' },
    { id: 'nor', kind: 'nor', x: 330, y: 60, label: 'NOR', description: 'd0 = NOT(q1 OR q0)；也是 div_out' },
    { id: 'and_d1', kind: 'and', x: 330, y: 170, label: 'AND', description: 'd1 = q0 AND mod' },
    { id: 'out', kind: 'port', x: 470, y: 80, text: 'div_out', dir: 'out', description: 'output：state 00 時為 1' },
    // accumulator carry decode
    { id: 'or_mod', kind: modKind, x: 640, y: 180, label: modLabel, description: modKind === 'or' ? 'mod = a1 OR a0（acc + 3 ≥ 4）' : 'mod = a1 AND a0（acc + 1 ≥ 4）' },
    // accumulator
    { id: 'ffa0', kind: 'dff', x: 140, y: 290, label: 'ACC0', edge: 'rising', signal: 'a0', description: 'accumulator bit 0' },
    { id: 'ffa1', kind: 'dff', x: 140, y: 400, label: 'ACC1', edge: 'rising', signal: 'a1', description: 'accumulator bit 1' },
    { id: 'xor0', kind: 'xor', x: 330, y: 290, label: 'XOR0', description: 'da0 = a0 XOR q0（en = q0）' },
    ...(borrowInv ? [{ id: 'inv_a0', kind: 'inv' as const, x: 300, y: 415, label: 'INV', description: 'NOT a0' }] : []),
    { id: 'and_bw', kind: 'and', x: 380, y: 385, label: borrowLabel, description: borrowInv ? 'bw = q0 AND NOT a0（decrement 的 borrow）' : 'cy = q0 AND a0（increment 的 carry-in）' },
    { id: 'xor1', kind: 'xor', x: 520, y: 385, label: 'XOR1', description: borrowInv ? 'da1 = a1 XOR bw' : 'da1 = a1 XOR cy' },
  ]
  const wires: Schematic['wires'] = [
    // clock bus
    { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_clk1', from: 'clk.p', to: 'ff1.clk', signal: 'clk', kind: 'clock', points: [[60, 92], [60, 222]] },
    { id: 'w_clka0', from: 'clk.p', to: 'ffa0.clk', signal: 'clk', kind: 'clock', points: [[60, 92], [60, 342]] },
    { id: 'w_clka1', from: 'clk.p', to: 'ffa1.clk', signal: 'clk', kind: 'clock', points: [[60, 92], [60, 452]] },
    // async reset bus（與 netlist 的 rstn: 'rst_n' / resetValue 0 對應）
    { id: 'w_rst0', from: 'rstn.p', to: 'ff0.rstn', signal: 'rst_n', kind: 'reset', points: [[100, 520], [100, 124], [172, 124]] },
    { id: 'w_rst1', from: 'rstn.p', to: 'ff1.rstn', signal: 'rst_n', kind: 'reset', points: [[100, 520], [100, 254], [172, 254]] },
    { id: 'w_rsta0', from: 'rstn.p', to: 'ffa0.rstn', signal: 'rst_n', kind: 'reset', points: [[100, 520], [100, 374], [172, 374]] },
    { id: 'w_rsta1', from: 'rstn.p', to: 'ffa1.rstn', signal: 'rst_n', kind: 'reset', points: [[100, 520], [100, 496], [172, 496]] },
    // cell
    { id: 'w_q0_nor', from: 'ff0.q', to: 'nor.in0', signal: 'q0', kind: 'feedback', points: [[240, 60], [240, 73]] },
    { id: 'w_q1_nor', from: 'ff1.q', to: 'nor.in1', signal: 'q1', kind: 'feedback', points: [[260, 190], [260, 87]] },
    { id: 'w_d0', from: 'nor.out', to: 'ff0.d', signal: 'd0', kind: 'feedback', points: [[410, 80], [410, 20], [120, 20], [120, 60]], labelAt: 0.75 },
    { id: 'w_out', from: 'nor.out', to: 'out.p', signal: 'div_out', kind: 'output' },
    { id: 'w_mod', from: 'or_mod.out', to: 'and_d1.in0', signal: 'mod', kind: 'control', points: [[710, 200], [710, 140], [310, 140], [310, 183]], labelAt: 0.55 },
    { id: 'w_q0_and', from: 'ff0.q', to: 'and_d1.in1', signal: 'q0', kind: 'feedback', points: [[250, 60], [250, 197]], noArrow: false },
    { id: 'w_d1', from: 'and_d1.out', to: 'ff1.d', signal: 'd1', kind: 'feedback', points: [[410, 190], [410, 150], [120, 150], [120, 190]], labelAt: 0.75 },
    // accumulator
    { id: 'w_q0_xor0', from: 'ff0.q', to: 'xor0.in0', signal: 'q0', kind: 'control', points: [[250, 60], [250, 303]] },
    { id: 'w_a0_xor0', from: 'ffa0.q', to: 'xor0.in1', signal: 'a0', kind: 'feedback', points: [[225, 310], [225, 317]] },
    { id: 'w_da0', from: 'xor0.out', to: 'ffa0.d', signal: 'da0', kind: 'feedback', points: [[410, 310], [410, 270], [120, 270], [120, 310]], labelAt: 0.75 },
    { id: 'w_q0_bw', from: 'ff0.q', to: 'and_bw.in0', signal: 'q0', kind: 'control', points: [[250, 60], [250, 398]] },
    ...(borrowInv
      ? [
          { id: 'w_a0_inv', from: 'ffa0.q', to: 'inv_a0.in0', signal: 'a0', kind: 'feedback' as const, points: [[215, 310], [215, 427]] as [number, number][] },
          { id: 'w_na0', from: 'inv_a0.out', to: 'and_bw.in1', signal: 'na0', kind: 'data' as const, points: [[358, 427], [358, 412]] as [number, number][] },
        ]
      : [{ id: 'w_a0_bw', from: 'ffa0.q', to: 'and_bw.in1', signal: 'a0', kind: 'feedback' as const, points: [[215, 310], [215, 412]] as [number, number][] }]),
    { id: 'w_bw', from: 'and_bw.out', to: 'xor1.in0', signal: borrowInv ? 'bw' : 'cy', kind: 'data', points: [[450, 405], [450, 398]] },
    { id: 'w_a1_xor1', from: 'ffa1.q', to: 'xor1.in1', signal: 'a1', kind: 'feedback', points: [[230, 420], [230, 450], [500, 450], [500, 412]] },
    { id: 'w_da1', from: 'xor1.out', to: 'ffa1.d', signal: 'da1', kind: 'feedback', points: [[590, 405], [590, 375], [120, 375], [120, 420]], labelAt: 0.8 },
    // a0 / a1 → carry decode（右側通道）
    { id: 'w_a0_mod', from: 'ffa0.q', to: 'or_mod.in0', signal: 'a0', kind: 'feedback', points: [[225, 310], [225, 345], [600, 345], [600, 193]] },
    { id: 'w_a1_mod', from: 'ffa1.q', to: 'or_mod.in1', signal: 'a1', kind: 'feedback', points: [[230, 420], [230, 450], [615, 450], [615, 207]] },
  ]
  return { width: 740, height: 545, title, elements, wires }
}

/** Lesson 6-1：accumulator /2.75 */
export const frac275Schematic: Schematic = accumulatorSchematic({
  title: '/2 /3 cell + 2-bit accumulator（K = 3，M = 4）→ /2.75',
  modKind: 'or',
  modLabel: 'OR (carry)',
  borrowInv: true,
  borrowLabel: 'AND (borrow)',
})

/** 練習用陌生電路（不標示除數） */
export const frac225Schematic: Schematic = accumulatorSchematic({
  title: '練習電路：/2 /3 cell + 2-bit counter',
  modKind: 'and',
  modLabel: 'AND (carry)',
  borrowInv: false,
  borrowLabel: 'AND (carry-in)',
})

/** 6-1 的 mod control path 高亮：accumulator → OR → AND → FF1.D */
export const fracModPathHighlight: SchematicHighlight = {
  style: 'setup',
  wires: ['w_a0_mod', 'w_a1_mod', 'w_mod', 'w_d1'],
  elements: ['or_mod', 'and_d1'],
  tags: [
    { elementOrWire: 'ffa0', text: 'launch（accumulator edge）' },
    { elementOrWire: 'ff1', text: 'capture（state 01 → 下一個 edge）' },
  ],
}

/** 6-1 的 cell 內部 feedback 高亮（與 Lesson 3 相同的 Fmax path） */
export const fracCellPathHighlight: SchematicHighlight = {
  style: 'hold',
  wires: ['w_q0_nor', 'w_q1_nor', 'w_d0'],
  elements: ['nor'],
}

/**
 * Lesson 6-2 練習用陌生電路：/2 /3 cell + 3-bit accumulator（版面不標示 K、M 與除數）。
 *   bit0：XOR0 → da0 = a0 ⊕ q0
 *   bit1：INV + AND(bit1) → bw = q0 · ā0，XOR1 → da1 = a1 ⊕ bw
 *   bit2：OR01 → o01 = a1 + a0，AND(bit2) → cy2 = q0 · o01，XOR2 → da2 = a2 ⊕ cy2
 *   carry decode：AND(carry) → mod = a2 · o01（o01 同時餵 bit2 的進位與 carry decode）
 */
export const frac2375Schematic: Schematic = {
  width: 900,
  height: 700,
  title: '練習電路：/2 /3 cell + 3-bit accumulator（加數與除數未標示）',
  elements: [
    { id: 'clk', kind: 'port', x: 30, y: 92, text: 'clk', dir: 'in', description: 'input clock（Tin）' },
    { id: 'rstn', kind: 'port', x: 30, y: 660, text: 'rst_n', dir: 'in', description: 'async reset（active low）：五顆 flop 的 resetValue 都是 0 ⇒ reset state = 00000' },
    // /2 /3 cell
    { id: 'ff0', kind: 'dff', x: 140, y: 40, label: 'FF0', edge: 'rising', signal: 'q0', description: '/2 /3 cell state bit q0' },
    { id: 'ff1', kind: 'dff', x: 140, y: 170, label: 'FF1', edge: 'rising', signal: 'q1', description: '/2 /3 cell state bit q1' },
    { id: 'nor', kind: 'nor', x: 330, y: 60, label: 'NOR', description: 'd0 = NOT(q1 OR q0)；也是 div_out' },
    { id: 'and_d1', kind: 'and', x: 330, y: 170, label: 'AND', description: 'd1 = q0 AND mod' },
    { id: 'out', kind: 'port', x: 470, y: 80, text: 'div_out', dir: 'out', description: 'output：state 00 時為 1' },
    // accumulator（3 bit）
    { id: 'ffa0', kind: 'dff', x: 140, y: 290, label: 'ACC0', edge: 'rising', signal: 'a0', description: 'accumulator bit 0' },
    { id: 'ffa1', kind: 'dff', x: 140, y: 400, label: 'ACC1', edge: 'rising', signal: 'a1', description: 'accumulator bit 1' },
    { id: 'ffa2', kind: 'dff', x: 140, y: 510, label: 'ACC2', edge: 'rising', signal: 'a2', description: 'accumulator bit 2 (MSB)' },
    { id: 'xor0', kind: 'xor', x: 330, y: 290, label: 'XOR0', description: 'da0 = a0 XOR q0（en = q0）' },
    { id: 'inv_a0', kind: 'inv', x: 300, y: 415, label: 'INV', description: 'NOT a0' },
    { id: 'and_bw', kind: 'and', x: 380, y: 385, label: 'AND (bit1)', description: 'bw = q0 AND NOT a0' },
    { id: 'xor1', kind: 'xor', x: 520, y: 385, label: 'XOR1', description: 'da1 = a1 XOR bw' },
    { id: 'and_cy2', kind: 'and', x: 380, y: 505, label: 'AND (bit2)', description: 'cy2 = q0 AND o01' },
    { id: 'xor2', kind: 'xor', x: 520, y: 505, label: 'XOR2', description: 'da2 = a2 XOR cy2' },
    { id: 'or01', kind: 'or', x: 640, y: 600, label: 'OR01', description: 'o01 = a1 OR a0（bit1 往 bit2 的進位）' },
    { id: 'and_mod', kind: 'and', x: 770, y: 180, label: 'AND (carry)', description: 'mod = a2 AND o01' },
  ],
  wires: [
    // clock bus
    { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_clk1', from: 'clk.p', to: 'ff1.clk', signal: 'clk', kind: 'clock', points: [[60, 92], [60, 222]] },
    { id: 'w_clka0', from: 'clk.p', to: 'ffa0.clk', signal: 'clk', kind: 'clock', points: [[60, 92], [60, 342]] },
    { id: 'w_clka1', from: 'clk.p', to: 'ffa1.clk', signal: 'clk', kind: 'clock', points: [[60, 92], [60, 452]] },
    { id: 'w_clka2', from: 'clk.p', to: 'ffa2.clk', signal: 'clk', kind: 'clock', points: [[60, 92], [60, 562]] },
    // async reset bus
    { id: 'w_rst0', from: 'rstn.p', to: 'ff0.rstn', signal: 'rst_n', kind: 'reset', points: [[100, 660], [100, 124], [172, 124]] },
    { id: 'w_rst1', from: 'rstn.p', to: 'ff1.rstn', signal: 'rst_n', kind: 'reset', points: [[100, 660], [100, 254], [172, 254]] },
    { id: 'w_rsta0', from: 'rstn.p', to: 'ffa0.rstn', signal: 'rst_n', kind: 'reset', points: [[100, 660], [100, 374], [172, 374]] },
    { id: 'w_rsta1', from: 'rstn.p', to: 'ffa1.rstn', signal: 'rst_n', kind: 'reset', points: [[100, 660], [100, 484], [172, 484]] },
    { id: 'w_rsta2', from: 'rstn.p', to: 'ffa2.rstn', signal: 'rst_n', kind: 'reset', points: [[100, 660], [100, 594], [172, 594]] },
    // cell
    { id: 'w_q0_nor', from: 'ff0.q', to: 'nor.in0', signal: 'q0', kind: 'feedback', points: [[240, 60], [240, 73]] },
    { id: 'w_q1_nor', from: 'ff1.q', to: 'nor.in1', signal: 'q1', kind: 'feedback', points: [[260, 190], [260, 87]] },
    { id: 'w_d0', from: 'nor.out', to: 'ff0.d', signal: 'd0', kind: 'feedback', points: [[410, 80], [410, 20], [120, 20], [120, 60]], labelAt: 0.75 },
    { id: 'w_out', from: 'nor.out', to: 'out.p', signal: 'div_out', kind: 'output' },
    { id: 'w_q0_and', from: 'ff0.q', to: 'and_d1.in1', signal: 'q0', kind: 'feedback', points: [[250, 60], [250, 197]] },
    { id: 'w_mod', from: 'and_mod.out', to: 'and_d1.in0', signal: 'mod', kind: 'control', points: [[850, 200], [850, 140], [310, 140], [310, 183]], labelAt: 0.6 },
    { id: 'w_d1', from: 'and_d1.out', to: 'ff1.d', signal: 'd1', kind: 'feedback', points: [[410, 190], [410, 150], [120, 150], [120, 190]], labelAt: 0.75 },
    // accumulator bit0
    { id: 'w_q0_xor0', from: 'ff0.q', to: 'xor0.in0', signal: 'q0', kind: 'control', points: [[250, 60], [250, 303]] },
    { id: 'w_a0_xor0', from: 'ffa0.q', to: 'xor0.in1', signal: 'a0', kind: 'feedback', points: [[225, 310], [225, 317]] },
    { id: 'w_da0', from: 'xor0.out', to: 'ffa0.d', signal: 'da0', kind: 'feedback', points: [[410, 310], [410, 270], [120, 270], [120, 310]], labelAt: 0.75 },
    // accumulator bit1
    { id: 'w_q0_bw', from: 'ff0.q', to: 'and_bw.in0', signal: 'q0', kind: 'control', points: [[250, 60], [250, 398]] },
    { id: 'w_a0_inv', from: 'ffa0.q', to: 'inv_a0.in0', signal: 'a0', kind: 'feedback', points: [[215, 310], [215, 427]] },
    { id: 'w_na0', from: 'inv_a0.out', to: 'and_bw.in1', signal: 'na0', kind: 'data', points: [[358, 427], [358, 412]] },
    { id: 'w_bw', from: 'and_bw.out', to: 'xor1.in0', signal: 'bw', kind: 'data', points: [[450, 405], [450, 398]] },
    { id: 'w_a1_xor1', from: 'ffa1.q', to: 'xor1.in1', signal: 'a1', kind: 'feedback', points: [[230, 420], [230, 460], [500, 460], [500, 412]] },
    { id: 'w_da1', from: 'xor1.out', to: 'ffa1.d', signal: 'da1', kind: 'feedback', points: [[600, 405], [600, 380], [120, 380], [120, 420]], labelAt: 0.8 },
    // accumulator bit2
    { id: 'w_q0_cy2', from: 'ff0.q', to: 'and_cy2.in0', signal: 'q0', kind: 'control', points: [[250, 60], [250, 518]] },
    { id: 'w_a0_or', from: 'ffa0.q', to: 'or01.in0', signal: 'a0', kind: 'feedback', points: [[215, 310], [215, 645], [624, 645], [624, 613]] },
    { id: 'w_a1_or', from: 'ffa1.q', to: 'or01.in1', signal: 'a1', kind: 'feedback', points: [[230, 420], [230, 470], [612, 470], [612, 627]] },
    { id: 'w_o01_cy2', from: 'or01.out', to: 'and_cy2.in1', signal: 'o01', kind: 'data', points: [[720, 620], [720, 560], [360, 560], [360, 532]], labelAt: 0.45 },
    { id: 'w_cy2', from: 'and_cy2.out', to: 'xor2.in0', signal: 'cy2', kind: 'data', points: [[450, 525], [450, 518]] },
    { id: 'w_a2_xor2', from: 'ffa2.q', to: 'xor2.in1', signal: 'a2', kind: 'feedback', points: [[235, 530], [235, 575], [500, 575], [500, 532]] },
    { id: 'w_da2', from: 'xor2.out', to: 'ffa2.d', signal: 'da2', kind: 'feedback', points: [[600, 525], [600, 490], [120, 490], [120, 530]], labelAt: 0.8 },
    // carry decode：mod = a2 · o01
    { id: 'w_a2_mod', from: 'ffa2.q', to: 'and_mod.in0', signal: 'a2', kind: 'feedback', points: [[235, 530], [235, 240], [750, 240], [750, 193]] },
    { id: 'w_o01_mod', from: 'or01.out', to: 'and_mod.in1', signal: 'o01', kind: 'data', points: [[720, 620], [720, 207]] },
  ],
}

/**
 * Lesson 6-3：3-bit phase index counter（p2 p1 p0）與 wrap carry
 *   dp0 = p0 ⊕ inc；t1 = inc·p0；dp1 = p1 ⊕ t1；t2 = t1·p1；dp2 = p2 ⊕ t2；carry = inc·p0·p1·p2
 */
export const phaseCounter8Schematic: Schematic = {
  width: 1000,
  height: 275,
  title: '3-bit phase index counter：index 7 → 0 時產生 carry',
  elements: [
    { id: 'inc', kind: 'port', x: 30, y: 53, text: 'inc', dir: 'in', description: '每個 output 週期是否往前一個 phase' },
    { id: 'clk', kind: 'port', x: 30, y: 215, text: 'clk', dir: 'in', description: 'output-rate clock：每個 output 週期一個 edge' },
    { id: 'rstn', kind: 'port', x: 30, y: 250, text: 'rst_n', dir: 'in', description: 'async reset（active low）：三顆 flop 的 resetValue 都是 0 ⇒ reset 後 index = 0' },
    { id: 'xor0', kind: 'xor', x: 80, y: 40, label: 'XOR0', description: 'dp0 = p0 XOR inc' },
    { id: 'ff0', kind: 'dff', x: 170, y: 40, label: 'P0', edge: 'rising', signal: 'p0', description: 'phase index bit 0' },
    { id: 'and0', kind: 'and', x: 260, y: 130, label: 'AND0', description: 't1 = inc AND p0' },
    { id: 'xor1', kind: 'xor', x: 360, y: 40, label: 'XOR1', description: 'dp1 = p1 XOR t1' },
    { id: 'ff1', kind: 'dff', x: 450, y: 40, label: 'P1', edge: 'rising', signal: 'p1', description: 'phase index bit 1' },
    { id: 'and1', kind: 'and', x: 545, y: 130, label: 'AND1', description: 't2 = t1 AND p1' },
    { id: 'xor2', kind: 'xor', x: 640, y: 40, label: 'XOR2', description: 'dp2 = p2 XOR t2' },
    { id: 'ff2', kind: 'dff', x: 730, y: 40, label: 'P2', edge: 'rising', signal: 'p2', description: 'phase index bit 2 (MSB)' },
    { id: 'and_c', kind: 'and', x: 850, y: 120, label: 'AND (wrap)', inputs: 4, description: 'carry = inc AND p0 AND p1 AND p2：index = 7 且 inc = 1' },
    { id: 'carry', kind: 'port', x: 965, y: 154, text: 'carry', dir: 'out', description: 'phase index 7 → 0 的進位' },
  ],
  wires: [
    { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock', points: [[150, 215], [150, 92]] },
    { id: 'w_clk1', from: 'clk.p', to: 'ff1.clk', signal: 'clk', kind: 'clock', points: [[430, 215], [430, 92]] },
    { id: 'w_clk2', from: 'clk.p', to: 'ff2.clk', signal: 'clk', kind: 'clock', points: [[710, 215], [710, 92]] },
    // async reset bus（與 netlist 的 rstn: 'rst_n' / resetValue 0 對應）
    { id: 'w_rst0', from: 'rstn.p', to: 'ff0.rstn', signal: 'rst_n', kind: 'reset', points: [[202, 250]] },
    { id: 'w_rst1', from: 'rstn.p', to: 'ff1.rstn', signal: 'rst_n', kind: 'reset', points: [[482, 250]] },
    { id: 'w_rst2', from: 'rstn.p', to: 'ff2.rstn', signal: 'rst_n', kind: 'reset', points: [[762, 250]] },
    { id: 'w_inc_x0', from: 'inc.p', to: 'xor0.in0', signal: 'inc', kind: 'control' },
    { id: 'w_inc_a0', from: 'inc.p', to: 'and0.in0', signal: 'inc', kind: 'control', points: [[55, 53], [55, 143]] },
    { id: 'w_dp0', from: 'xor0.out', to: 'ff0.d', signal: 'dp0', kind: 'data' },
    { id: 'w_p0_fb', from: 'ff0.q', to: 'xor0.in1', signal: 'p0', kind: 'feedback', points: [[250, 60], [250, 20], [65, 20], [65, 67]] },
    { id: 'w_p0_a0', from: 'ff0.q', to: 'and0.in1', signal: 'p0', kind: 'feedback', points: [[250, 60], [250, 157]] },
    { id: 'w_t1_x1', from: 'and0.out', to: 'xor1.in0', signal: 't1', kind: 'data', points: [[330, 150], [330, 53]] },
    { id: 'w_t1_a1', from: 'and0.out', to: 'and1.in0', signal: 't1', kind: 'data', points: [[330, 150], [330, 143]] },
    { id: 'w_dp1', from: 'xor1.out', to: 'ff1.d', signal: 'dp1', kind: 'data' },
    { id: 'w_p1_fb', from: 'ff1.q', to: 'xor1.in1', signal: 'p1', kind: 'feedback', points: [[525, 60], [525, 20], [348, 20], [348, 67]] },
    { id: 'w_p1_a1', from: 'ff1.q', to: 'and1.in1', signal: 'p1', kind: 'feedback', points: [[525, 60], [525, 157]] },
    { id: 'w_t2_x2', from: 'and1.out', to: 'xor2.in0', signal: 't2', kind: 'data', points: [[615, 150], [615, 53]] },
    { id: 'w_dp2', from: 'xor2.out', to: 'ff2.d', signal: 'dp2', kind: 'data' },
    { id: 'w_p2_fb', from: 'ff2.q', to: 'xor2.in1', signal: 'p2', kind: 'feedback', points: [[810, 60], [810, 20], [628, 20], [628, 67]] },
    // wrap decode（4-input AND：in0 inc, in1 p0, in2 p1, in3 p2）
    { id: 'w_inc_c', from: 'inc.p', to: 'and_c.in0', signal: 'inc', kind: 'control', points: [[55, 53], [55, 200], [800, 200], [800, 134]] },
    { id: 'w_p0_c', from: 'ff0.q', to: 'and_c.in1', signal: 'p0', kind: 'feedback', points: [[250, 60], [250, 190], [812, 190], [812, 147]] },
    { id: 'w_p1_c', from: 'ff1.q', to: 'and_c.in2', signal: 'p1', kind: 'feedback', points: [[525, 60], [525, 180], [824, 180], [824, 161]] },
    { id: 'w_p2_c', from: 'ff2.q', to: 'and_c.in3', signal: 'p2', kind: 'feedback', points: [[836, 60], [836, 174]] },
    { id: 'w_carry', from: 'and_c.out', to: 'carry.p', signal: 'carry', kind: 'output' },
  ],
}

// ---------------------------------------------------------------- Timing scenarios（Lesson 6-1 / 6-2 / 6-3）

/**
 * /2 /3 cell + 2-bit accumulator 的 timing scenario（frac275 與 frac225 共用結構）。
 * 數值與 netlist 一致：tCQ 5..8、INV 4..6、AND/OR 6..10、XOR/NOR 8..12（ps）；setup 7、hold 3。
 * 在這個教學模型裡 accumulator 與 cell 用同一個 clk（f_in），所以 accumulator 的進位／借位鏈
 * 是一條 register-to-register path，可用時間只有一個 T_in；真實設計會把它搬到 output-rate clock。
 */
function accumulatorTiming(opts: { id: string; name: string; schematic: Schematic; borrowInv: boolean }): TimingScenario {
  const { id, name, schematic, borrowInv } = opts
  const chain: TimingSegment[] = [
    { id: 'tcq', label: 'tCQ (ACC0)', from: 'ACC0.clk', to: 'ACC0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ffa0'], note: 'accumulator flop 的 clock-to-Q' },
    ...(borrowInv
      ? [{ id: 'inv', label: 'INV', from: 'ACC0.Q', to: 'na0', kind: 'logic' as const, min: 4, max: 6, wires: ['w_a0_inv', 'w_na0'], elements: ['inv_a0'], note: 'NOT a0（decrement 的 borrow 需要）' }]
      : []),
    {
      id: 'and',
      label: borrowInv ? 'AND (borrow)' : 'AND (carry-in)',
      from: borrowInv ? 'na0' : 'ACC0.Q',
      to: borrowInv ? 'bw' : 'cy',
      kind: 'logic',
      min: 6,
      max: 10,
      wires: borrowInv ? ['w_bw'] : ['w_a0_bw', 'w_bw'],
      elements: ['and_bw'],
      note: borrowInv ? 'bw = q0 · NOT a0' : 'cy = q0 · a0',
    },
    { id: 'xor', label: 'XOR1', from: borrowInv ? 'bw' : 'cy', to: 'ACC1.D', kind: 'logic', min: 8, max: 12, wires: ['w_da1'], elements: ['xor1'], note: 'da1 = a1 XOR (borrow / carry-in)' },
  ]
  return {
    id,
    name,
    description: '三條 register-to-register path 比較：accumulator 內部鏈、accumulator → mod → FF1.D 的 control path、/2 /3 cell 自己的 feedback。',
    schematic,
    env: { period: 100, skew: 0, jitter: 2, margin: 2 },
    paths: [
      {
        id: 'acc-chain',
        name: borrowInv ? 'ACC0.Q → INV → AND → XOR1 → ACC1.D（accumulator 借位鏈）' : 'ACC0.Q → AND → XOR1 → ACC1.D（accumulator 進位鏈）',
        type: 'setup',
        launch: { element: 'ffa0', edge: 'rising', clock: 'clk' },
        capture: { element: 'ffa1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
        segments: chain,
        sensitizedWhen: 'q0 = 1（這個 edge accumulator 要走一步；q0 = 0 時 AND 輸出固定為 0，path 不會被 sensitize）',
        description: '把 fractional 功能加進去之後，最長的 register-to-register path 不在 /2 /3 cell 裡，而在 accumulator 的 bit-1 更新邏輯。',
        notes: [
          'launch = ACC0（edge k），capture = ACC1（edge k+1），可用時間一個 T_in。',
          '真實設計把 accumulator / DSM 放到 output-rate clock（div_out）：同樣的邏輯有 N 個 T_in 可用，這條 path 就不再限制 Fmax。',
          '但 mod 從慢的 clock domain 回到高速 cell 時，仍然要在 cell 取樣 mod 的 edge 之前穩定（見 acc-mod path）。',
        ],
        limits: 'Fmax（在 accumulator 與 cell 共用 f_in clock 的教學模型裡）',
      },
      {
        id: 'acc-mod',
        name: `ACC0/ACC1.Q → ${borrowInv ? 'OR' : 'AND'} (carry) → AND → FF1.D（mod control path）`,
        type: 'setup',
        launch: { element: 'ffa0', edge: 'rising', clock: 'clk' },
        capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
        segments: [
          { id: 'tcq', label: 'tCQ (ACC)', from: 'ACC.clk', to: 'ACC.Q', kind: 'tcq', min: 5, max: 8, elements: ['ffa0', 'ffa1'] },
          { id: 'carry', label: borrowInv ? 'OR (carry)' : 'AND (carry)', from: 'a1 a0', to: 'mod', kind: 'logic', min: 6, max: 10, wires: ['w_a0_mod', 'w_a1_mod'], elements: ['or_mod'], note: 'accumulator 的 carry decode' },
          { id: 'and', label: 'AND (d1)', from: 'mod', to: 'FF1.D', kind: 'logic', min: 6, max: 10, wires: ['w_mod', 'w_d1'], elements: ['and_d1'], note: 'd1 = q0 · mod' },
        ],
        sensitizedWhen: 'q0 = 1（state 01：下一個 edge 決定進 10（/3）還是回 00（/2））',
        description: '這是「除數控制」的 deadline：mod 必須在 state 01 的那個 edge 之前 tsetup 就穩定，否則這個週期是 /2 還是 /3 會不確定。',
        notes: ['這條 path 的 launch 是 accumulator 更新的那個 edge；因為 accumulator 也在 state 01 的 edge 更新，所以 mod 有整整一個 output 週期（至少 2 個 T_in）才會被再次取樣——這裡保守地用 1 個 T_in 分析。'],
        limits: 'mod 的 control-path deadline（phase continuity）',
      },
      {
        id: 'cell',
        name: 'FF0/FF1.Q → NOR → FF0.D（/2 /3 cell 本身）',
        type: 'setup',
        launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
        capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
        segments: [
          { id: 'tcq', label: 'tCQ (FF)', from: 'FF.clk', to: 'FF.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0', 'ff1'] },
          { id: 'nor', label: 'NOR', from: 'q1 q0', to: 'FF0.D', kind: 'logic', min: 8, max: 12, wires: ['w_q0_nor', 'w_q1_nor', 'w_d0'], elements: ['nor'] },
        ],
        description: '與 Lesson 3 相同的 cell feedback path：加上 accumulator 之後它沒有變慢，但它不再是最長的 path。',
        limits: 'cell 的 Fmax（沒有 accumulator 時的 critical path）',
      },
      {
        id: 'out',
        name: 'FF0/FF1.Q → NOR → div_out（output path）',
        type: 'output',
        launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
        capture: { element: 'out', edge: 'rising', clock: 'clk' },
        segments: [
          { id: 'tcq', label: 'tCQ', from: 'FF.clk', to: 'FF.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
          { id: 'nor', label: 'NOR', from: 'q1 q0', to: 'div_out', kind: 'logic', min: 8, max: 12, elements: ['nor'] },
          { id: 'wire', label: 'output wire', from: 'NOR.out', to: 'div_out', kind: 'wire', min: 2, max: 3, wires: ['w_out'] },
        ],
        description: 'output latency：每個 output edge 都比觸發它的 clk edge 晚 tCQ + tNOR，這不是 setup critical path。',
        limits: 'output latency，不限制 Fmax',
      },
    ],
  }
}

/** Lesson 6-1：frac275 的 timing scenario */
export const frac275Timing: TimingScenario = accumulatorTiming({ id: 'frac275', name: '/2.75 fractional divider（cell + accumulator）', schematic: frac275Schematic, borrowInv: true })

/** Lesson 6-2：frac225（一階 accumulator DSM 硬體）的 timing scenario */
export const frac225Timing: TimingScenario = accumulatorTiming({ id: 'frac225', name: '一階 accumulator DSM（K = 1, M = 4）+ /2 /3 cell', schematic: frac225Schematic, borrowInv: false })

/**
 * Lesson 6-3：3-bit phase index counter 的 timing scenario。
 * 這個 counter 用 output-rate clock（每個 output 週期一個 edge，period = N·Tvco = 400 ps），
 * 所以它內部的 carry chain 有很多 slack；真正要小心的是 carry → MMD modulus 的 interface path
 * 與 inc 的 control path。
 */
export const phaseCounter8Timing: TimingScenario = {
  id: 'phase-counter-8',
  name: '3-bit phase index counter（output-rate clock）',
  description: 'counter 內部的 ripple-carry 鏈 vs. carry 交給 MMD 的 interface path。clock period = 一個 output 週期 = 4 Tvco = 400 ps。',
  schematic: phaseCounter8Schematic,
  env: { period: 400, skew: 0, jitter: 5, margin: 5 },
  paths: [
    {
      id: 'carry-chain',
      name: 'P0.Q → AND0 → AND1 → XOR2 → P2.D（counter 內部 carry chain）',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff2', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ (P0)', from: 'P0.clk', to: 'P0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'and0', label: 'AND0', from: 'p0', to: 't1', kind: 'logic', min: 6, max: 10, wires: ['w_p0_a0', 'w_t1_a1'], elements: ['and0'], note: 't1 = inc · p0' },
        { id: 'and1', label: 'AND1', from: 't1', to: 't2', kind: 'logic', min: 6, max: 10, wires: ['w_t2_x2'], elements: ['and1'], note: 't2 = t1 · p1' },
        { id: 'xor2', label: 'XOR2', from: 't2', to: 'P2.D', kind: 'logic', min: 8, max: 12, wires: ['w_dp2'], elements: ['xor2'], note: 'dp2 = p2 XOR t2' },
      ],
      sensitizedWhen: 'inc = 1 且 p0 = p1 = 1（index 3 → 4 或 7 → 0 的那個週期）',
      description: '最長的 register-to-register path，但 clock 是 output-rate（400 ps），slack 非常大：這裡不是系統的 critical path。',
      notes: ['同樣的 3-bit counter 若改用 VCO clock（100 ps）跑，slack 立刻縮到約 40 ps。', 'PMUX select 的更新時刻另有 safe-window 要求（Lesson 5-2），那是 pulse-width / runt 問題，不是這條 setup path。'],
      limits: '這個 counter 本身的 Fmax（遠高於實際 output rate）',
    },
    {
      id: 'carry-to-mmd',
      name: 'P2.Q → AND (wrap) → carry → MMD modulus（interface path）',
      type: 'interface',
      launch: { element: 'ff2', edge: 'rising', clock: 'clk' },
      capture: { element: 'carry', edge: 'rising', clock: 'clk', setup: 40, label: 'MMD 最早取樣 modulus 的 edge（output edge 後 1 Tvco）' },
      // setup / deadline 一律取「最早可能的 capture edge」：Lesson 6-2 已經說明 MMD 最早在
      // 下一個 output 週期的第一個 cell state 01 取樣 modulus，也就是 output edge 之後約 1 個 Tvco。
      // 400 ps 的 output 週期裡 1 Tvco = 100 ps ⇒ periodFraction = 0.25。
      periodFraction: 0.25,
      segments: [
        { id: 'tcq', label: 'tCQ (P2)', from: 'P2.clk', to: 'P2.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff2'] },
        { id: 'andc', label: 'AND (wrap)', from: 'p2 p1 p0 inc', to: 'carry', kind: 'logic', min: 8, max: 14, wires: ['w_p2_c', 'w_carry'], elements: ['and_c'], note: 'carry = inc · p0 · p1 · p2' },
      ],
      description: '架構 (a) 裡 carry 要變成 MMD 該週期的 N+1：它必須在 MMD 第一次取樣 modulus 的 edge 之前穩定。deadline 要取最早可能的那個 capture edge——Lesson 6-2 已經說明 MMD 最早在下一個 output 週期的第一個 cell state 01 取樣 modulus，也就是 output edge 之後 1 個 Tvco（100 ps，periodFraction = 0.25）。',
      notes: ['capture 的 setup = 40 ps 代表 MMD 內部 modulus → d1 的 AND + flop setup（見 Lesson 4）。', '若樂觀地假設 MMD 到 2 Tvco（200 ps）才取樣，slack 會從 28 ps 變成 128 ps——但 setup 分析必須用最早的 capture edge，不能用平均或最晚的。', '這條 path 跨 clock domain：carry 由 output-rate clock 產生、被 VCO-rate 的 MMD 取樣，28 ps 的 slack 幾乎不夠吸收 skew 與 PVT，實務上一定會再加一級 retiming flop——而每加一級就要重算 carry 落在哪個週期。'],
      limits: 'carry 交給 MMD 的 deadline（決定 wrap 那個週期是否真的走 N+1）',
    },
    {
      id: 'inc-control',
      name: 'inc → XOR0 → P0.D（control path）',
      type: 'async',
      launch: { element: 'inc', edge: 'rising', clock: 'inc' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'wire', label: 'inc wire', from: 'inc', to: 'XOR0.in', kind: 'wire', min: 2, max: 4, wires: ['w_inc_x0'] },
        { id: 'xor0', label: 'XOR0', from: 'inc', to: 'P0.D', kind: 'logic', min: 8, max: 12, wires: ['w_dp0'], elements: ['xor0'] },
      ],
      description: 'inc（是否往前轉一個 phase）必須在 counter 的 edge 前 tXOR + tsetup 就穩定，否則 index 是否 +1 會不確定。',
      limits: 'inc 的安全更新視窗',
    },
  ],
}

/**
 * Lesson 6-3 練習：4-bit phase index counter（p3 p2 p1 p0）與 wrap carry（16 相 PMUX 的 select 累加器）
 *   dp0 = p0 ⊕ inc；t1 = inc·p0；dp1 = p1 ⊕ t1；t2 = t1·p1；dp2 = p2 ⊕ t2；t3 = t2·p2；dp3 = p3 ⊕ t3；
 *   carry = inc·p0·p1·p2·p3（單一 5-input AND）
 */
export const phaseCounter16Schematic: Schematic = {
  width: 1270,
  height: 275,
  title: '練習電路：4-bit phase index counter（除數 / 相數未標示）',
  elements: [
    { id: 'inc', kind: 'port', x: 30, y: 53, text: 'inc', dir: 'in', description: '每個 output 週期是否往前一個 phase' },
    { id: 'clk', kind: 'port', x: 30, y: 215, text: 'clk', dir: 'in', description: 'output-rate clock：每個 output 週期一個 edge' },
    { id: 'rstn', kind: 'port', x: 30, y: 250, text: 'rst_n', dir: 'in', description: 'async reset（active low）：四顆 flop 的 resetValue 都是 0 ⇒ reset 後 index = 0' },
    { id: 'xor0', kind: 'xor', x: 80, y: 40, label: 'XOR0', description: 'dp0 = p0 XOR inc' },
    { id: 'ff0', kind: 'dff', x: 170, y: 40, label: 'P0', edge: 'rising', signal: 'p0', description: 'phase index bit 0' },
    { id: 'and0', kind: 'and', x: 260, y: 130, label: 'AND0', description: 't1 = inc AND p0' },
    { id: 'xor1', kind: 'xor', x: 360, y: 40, label: 'XOR1', description: 'dp1 = p1 XOR t1' },
    { id: 'ff1', kind: 'dff', x: 450, y: 40, label: 'P1', edge: 'rising', signal: 'p1', description: 'phase index bit 1' },
    { id: 'and1', kind: 'and', x: 545, y: 130, label: 'AND1', description: 't2 = t1 AND p1' },
    { id: 'xor2', kind: 'xor', x: 640, y: 40, label: 'XOR2', description: 'dp2 = p2 XOR t2' },
    { id: 'ff2', kind: 'dff', x: 730, y: 40, label: 'P2', edge: 'rising', signal: 'p2', description: 'phase index bit 2' },
    { id: 'and2', kind: 'and', x: 825, y: 130, label: 'AND2', description: 't3 = t2 AND p2' },
    { id: 'xor3', kind: 'xor', x: 920, y: 40, label: 'XOR3', description: 'dp3 = p3 XOR t3' },
    { id: 'ff3', kind: 'dff', x: 1010, y: 40, label: 'P3', edge: 'rising', signal: 'p3', description: 'phase index bit 3 (MSB)' },
    { id: 'and_c', kind: 'and', x: 1130, y: 110, label: 'AND (wrap)', inputs: 5, description: 'carry = inc AND p0 AND p1 AND p2 AND p3：index = 15 且 inc = 1' },
    { id: 'carry', kind: 'port', x: 1245, y: 151, text: 'carry', dir: 'out', description: 'phase index 15 → 0 的進位' },
  ],
  wires: [
    { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock', points: [[150, 215], [150, 92]] },
    { id: 'w_clk1', from: 'clk.p', to: 'ff1.clk', signal: 'clk', kind: 'clock', points: [[430, 215], [430, 92]] },
    { id: 'w_clk2', from: 'clk.p', to: 'ff2.clk', signal: 'clk', kind: 'clock', points: [[710, 215], [710, 92]] },
    { id: 'w_clk3', from: 'clk.p', to: 'ff3.clk', signal: 'clk', kind: 'clock', points: [[990, 215], [990, 92]] },
    // async reset bus（與 netlist 的 rstn: 'rst_n' / resetValue 0 對應）
    { id: 'w_rst0', from: 'rstn.p', to: 'ff0.rstn', signal: 'rst_n', kind: 'reset', points: [[202, 250]] },
    { id: 'w_rst1', from: 'rstn.p', to: 'ff1.rstn', signal: 'rst_n', kind: 'reset', points: [[482, 250]] },
    { id: 'w_rst2', from: 'rstn.p', to: 'ff2.rstn', signal: 'rst_n', kind: 'reset', points: [[762, 250]] },
    { id: 'w_rst3', from: 'rstn.p', to: 'ff3.rstn', signal: 'rst_n', kind: 'reset', points: [[1042, 250]] },
    { id: 'w_inc_x0', from: 'inc.p', to: 'xor0.in0', signal: 'inc', kind: 'control' },
    { id: 'w_inc_a0', from: 'inc.p', to: 'and0.in0', signal: 'inc', kind: 'control', points: [[55, 53], [55, 143]] },
    { id: 'w_dp0', from: 'xor0.out', to: 'ff0.d', signal: 'dp0', kind: 'data' },
    { id: 'w_p0_fb', from: 'ff0.q', to: 'xor0.in1', signal: 'p0', kind: 'feedback', points: [[250, 60], [250, 20], [65, 20], [65, 67]] },
    { id: 'w_p0_a0', from: 'ff0.q', to: 'and0.in1', signal: 'p0', kind: 'feedback', points: [[250, 60], [250, 157]] },
    { id: 'w_t1_x1', from: 'and0.out', to: 'xor1.in0', signal: 't1', kind: 'data', points: [[330, 150], [330, 53]] },
    { id: 'w_t1_a1', from: 'and0.out', to: 'and1.in0', signal: 't1', kind: 'data', points: [[330, 150], [330, 143]] },
    { id: 'w_dp1', from: 'xor1.out', to: 'ff1.d', signal: 'dp1', kind: 'data' },
    { id: 'w_p1_fb', from: 'ff1.q', to: 'xor1.in1', signal: 'p1', kind: 'feedback', points: [[525, 60], [525, 20], [348, 20], [348, 67]] },
    { id: 'w_p1_a1', from: 'ff1.q', to: 'and1.in1', signal: 'p1', kind: 'feedback', points: [[525, 60], [525, 157]] },
    { id: 'w_t2_x2', from: 'and1.out', to: 'xor2.in0', signal: 't2', kind: 'data', points: [[615, 150], [615, 53]] },
    { id: 'w_t2_a2', from: 'and1.out', to: 'and2.in0', signal: 't2', kind: 'data', points: [[615, 150], [615, 143]] },
    { id: 'w_dp2', from: 'xor2.out', to: 'ff2.d', signal: 'dp2', kind: 'data' },
    { id: 'w_p2_fb', from: 'ff2.q', to: 'xor2.in1', signal: 'p2', kind: 'feedback', points: [[810, 60], [810, 20], [628, 20], [628, 67]] },
    { id: 'w_p2_a2', from: 'ff2.q', to: 'and2.in1', signal: 'p2', kind: 'feedback', points: [[810, 60], [810, 157]] },
    { id: 'w_t3_x3', from: 'and2.out', to: 'xor3.in0', signal: 't3', kind: 'data', points: [[895, 150], [895, 53]] },
    { id: 'w_dp3', from: 'xor3.out', to: 'ff3.d', signal: 'dp3', kind: 'data' },
    { id: 'w_p3_fb', from: 'ff3.q', to: 'xor3.in1', signal: 'p3', kind: 'feedback', points: [[1090, 60], [1090, 20], [908, 20], [908, 67]] },
    // wrap decode（5-input AND：in0 inc, in1 p0, in2 p1, in3 p2, in4 p3；h = 82 ⇒ pin y = 110 + 82·(i+1)/6）
    { id: 'w_inc_c', from: 'inc.p', to: 'and_c.in0', signal: 'inc', kind: 'control', points: [[55, 53], [55, 205], [1080, 205], [1080, 124]] },
    { id: 'w_p0_c', from: 'ff0.q', to: 'and_c.in1', signal: 'p0', kind: 'feedback', points: [[250, 60], [250, 195], [1092, 195], [1092, 137]] },
    { id: 'w_p1_c', from: 'ff1.q', to: 'and_c.in2', signal: 'p1', kind: 'feedback', points: [[525, 60], [525, 185], [1104, 185], [1104, 151]] },
    { id: 'w_p2_c', from: 'ff2.q', to: 'and_c.in3', signal: 'p2', kind: 'feedback', points: [[810, 60], [810, 175], [1116, 175], [1116, 165]] },
    { id: 'w_p3_c', from: 'ff3.q', to: 'and_c.in4', signal: 'p3', kind: 'feedback', points: [[1100, 60], [1100, 178]] },
    { id: 'w_carry', from: 'and_c.out', to: 'carry.p', signal: 'carry', kind: 'output' },
  ],
}
