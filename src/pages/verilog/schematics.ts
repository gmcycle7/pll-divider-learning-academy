/**
 * Verilog 頁與 Bug Lab 的電路圖資料。
 *
 * 座標約定（與 @/components/circuit/schematic 一致）：
 *   DFF / latch 64×72：D 在 (x, y+20)、clk/EN 在 (x, y+52)、Q 在 (x+64, y+20)、rst_n 在 (x+32, y+72)
 *   2-input gate 52×40：in0 在 (x, y+13.33)、in1 在 (x, y+26.67)、out 在 (x+52, y+20)
 *   inv / buf 36×24：in 在 (x, y+12)、out 在 (x+36, y+12)
 *   box：自訂 pins（pos 為沿該邊的比例）
 * 兩種畫法：
 *   gate-level：真正的 gate 與 flop（DividerSimPanel 可以顯示每條線的 live value）
 *   block-level：always_ff / always_comb / assign 各畫成一個方塊，用來對照 RTL 的結構
 */
import type { SchElement, SchWire, Schematic, SchematicHighlight } from '@/components/circuit/schematic'

// ---------------------------------------------------------------- 小工具
function port(id: string, x: number, y: number, text: string, dir: 'in' | 'out', description?: string): SchElement {
  return { id, kind: 'port', x, y, text, dir, description }
}
function dff(id: string, x: number, y: number, label: string, signal: string, opts: Partial<SchElement> = {}): SchElement {
  return { id, kind: 'dff', x, y, label, signal, edge: 'rising', ...opts }
}
function dot(id: string, x: number, y: number): SchElement {
  return { id, kind: 'dot', x, y }
}
function wire(id: string, from: string, to: string, kind: SchWire['kind'], opts: Partial<SchWire> = {}): SchWire {
  return { id, from, to, kind, ...opts }
}
/** 「state register」方塊：d 在左上、clk 在左下（含 edge 三角形）、q 在右上、rst_n 在底部 */
function regBox(id: string, x: number, y: number, text: string, description?: string): SchElement {
  return {
    id,
    kind: 'box',
    x,
    y,
    w: 80,
    h: 72,
    text,
    edge: 'rising',
    description,
    pins: [
      { name: 'd', side: 'left', pos: 0.28, label: 'D' },
      { name: 'clk', side: 'left', pos: 0.89, label: '' },
      { name: 'q', side: 'right', pos: 0.28, label: 'Q' },
      { name: 'rstn', side: 'bottom', pos: 0.5, label: 'rst_n' },
    ],
  }
}

// ---------------------------------------------------------------- /2（RTL 分頁 1）
export const div2Sch: Schematic = {
  width: 380,
  height: 190,
  title: 'div2.sv：一個 always_ff + 一個 inverter',
  elements: [
    port('clk', 40, 92, 'clk', 'in', 'input clock'),
    port('rst', 172, 170, 'rst_n', 'in', 'async reset（active low）：if (!rst_n) q0 <= 0'),
    dff('ff0', 140, 40, 'FF0', 'q0', { description: 'always_ff @(posedge clk)：state bit q0' }),
    { id: 'inv', kind: 'inv', x: 250, y: 118, label: 'INV', description: 'q0 <= ~q0 的「~」' },
    port('out', 350, 60, 'div_out', 'out', 'assign div_out = q0'),
  ],
  wires: [
    wire('w_clk', 'clk.p', 'ff0.clk', 'clock', { signal: 'clk' }),
    wire('w_q', 'ff0.q', 'out.p', 'output', { signal: 'q0' }),
    wire('w_q_inv', 'ff0.q', 'inv.in0', 'feedback', { signal: 'q0', points: [[222, 60], [222, 130]], labelAt: 0.6 }),
    wire('w_d', 'inv.out', 'ff0.d', 'feedback', { signal: 'd0', points: [[300, 130], [300, 172], [120, 172], [120, 60]], labelAt: 0.75 }),
    wire('w_rst', 'rst.p', 'ff0.rstn', 'reset', { route: 'direct' }),
  ],
}

// ---------------------------------------------------------------- 兩個 /2（Bug 1）
function pairElements(withReset: boolean): SchElement[] {
  const els: SchElement[] = [
    port('clk', 30, 132, 'clk', 'in', '兩個 flop 共用同一條 clock'),
    dot('dclk', 70, 132),
    dff('ffa', 110, 80, 'FFa', 'qa', { description: 'qa <= ~qa' }),
    { id: 'inva', kind: 'inv', x: 200, y: 28, label: 'INVa' },
    dot('da', 188, 100),
    port('qa', 280, 100, 'qa', 'out'),
    dff('ffb', 330, 80, 'FFb', 'qb', { description: 'qb <= ~qb' }),
    { id: 'invb', kind: 'inv', x: 420, y: 28, label: 'INVb' },
    dot('db', 408, 100),
    port('qb', 500, 100, 'qb', 'out'),
  ]
  if (withReset) {
    els.push(port('rsta', 142, 190, 'rst_n', 'in', '同一個 rst_n 接到兩個 flop'), port('rstb', 362, 190, 'rst_n', 'in', '同一個 rst_n 接到兩個 flop'))
  }
  return els
}
function pairWires(withReset: boolean): SchWire[] {
  const ws: SchWire[] = [
    wire('w_clk_a', 'clk.p', 'ffa.clk', 'clock', { signal: 'clk' }),
    wire('w_clk_b', 'clk.p', 'ffb.clk', 'clock', { points: [[70, 132], [70, 215], [316, 215], [316, 132]] }),
    wire('w_qa_inv', 'ffa.q', 'inva.in0', 'feedback', { signal: 'qa', points: [[188, 100], [188, 40]], labelAt: 0.7 }),
    wire('w_da', 'inva.out', 'ffa.d', 'feedback', { signal: 'da', points: [[250, 40], [250, 14], [94, 14], [94, 100]], labelAt: 0.5 }),
    wire('w_qa_out', 'ffa.q', 'qa.p', 'output', { noArrow: false }),
    wire('w_qb_inv', 'ffb.q', 'invb.in0', 'feedback', { signal: 'qb', points: [[408, 100], [408, 40]], labelAt: 0.7 }),
    wire('w_db', 'invb.out', 'ffb.d', 'feedback', { signal: 'db', points: [[470, 40], [470, 14], [314, 14], [314, 100]], labelAt: 0.5 }),
    wire('w_qb_out', 'ffb.q', 'qb.p', 'output'),
  ]
  if (withReset) ws.push(wire('w_rst_a', 'rsta.p', 'ffa.rstn', 'reset', { route: 'direct' }), wire('w_rst_b', 'rstb.p', 'ffb.rstn', 'reset', { route: 'direct' }))
  return ws
}
export const pairNoResetSch: Schematic = { width: 540, height: 240, title: '兩個 /2，沒有 reset', elements: pairElements(false), wires: pairWires(false) }
export const pairResetSch: Schematic = { width: 540, height: 240, title: '兩個 /2，共用 rst_n', elements: pairElements(true), wires: pairWires(true) }

// ---------------------------------------------------------------- synchronous /4（RTL 分頁 2）
export const sync4Sch: Schematic = {
  width: 560,
  height: 262,
  title: 'div4_sync.sv：cnt <= cnt + 1 合成出來的樣子',
  elements: [
    port('clk', 30, 92, 'clk', 'in', '同一條 clk 送到 FF0 與 FF1'),
    dot('dotclk', 60, 92),
    dff('ff0', 100, 40, 'FF0', 'q0', { description: 'cnt[0]' }),
    dot('dot0', 176, 60),
    { id: 'inv0', kind: 'inv', x: 190, y: 150, label: 'INV', description: 'd0 = ~q0（cnt + 1 的最低位）' },
    { id: 'xor', kind: 'xor', x: 250, y: 40, label: 'XOR', description: 'd1 = q1 ^ q0（進位）' },
    dff('ff1', 380, 40, 'FF1', 'q1', { description: 'cnt[1]' }),
    dot('dot1', 460, 60),
    port('out', 520, 60, 'div_out', 'out', 'assign div_out = cnt[1]'),
    port('rst', 256, 245, 'rst_n', 'in', 'if (!rst_n) cnt <= 2\'b00'),
  ],
  wires: [
    wire('w_clk0', 'clk.p', 'ff0.clk', 'clock', { signal: 'clk' }),
    wire('w_clk1', 'clk.p', 'ff1.clk', 'clock', { points: [[60, 92], [60, 14], [366, 14], [366, 92]], labelAt: 0.5 }),
    wire('w_q0_inv', 'ff0.q', 'inv0.in0', 'feedback', { signal: 'q0', points: [[176, 60], [176, 162]], labelAt: 0.6 }),
    wire('w_d0', 'inv0.out', 'ff0.d', 'feedback', { signal: 'd0', points: [[238, 162], [238, 200], [84, 200], [84, 60]], labelAt: 0.55 }),
    wire('w_q0_xor', 'ff0.q', 'xor.in0', 'data', { points: [[176, 60], [176, 53.33]] }),
    wire('w_d1', 'xor.out', 'ff1.d', 'data', { signal: 'd1' }),
    wire('w_q1_xor', 'ff1.q', 'xor.in1', 'feedback', { signal: 'q1', points: [[460, 60], [460, 130], [238, 130], [238, 66.67]], labelAt: 0.5 }),
    wire('w_out', 'ff1.q', 'out.p', 'output'),
    wire('w_rst0', 'rst.p', 'ff0.rstn', 'reset', { points: [[132, 245]], noArrow: true }),
    wire('w_rst1', 'rst.p', 'ff1.rstn', 'reset', { points: [[412, 245]], noArrow: true }),
  ],
}

// ---------------------------------------------------------------- /3 gate-level（RTL 分頁 3、Bug 3）
/** d0 由 gate（NOR / XNOR）決定、d1 = q0 的 /3 兩 flop 結構 */
function div3Like(id: string, title: string, gate: 'nor' | 'xnor', gateLabel: string, gateDesc: string): Schematic {
  return {
    width: 480,
    height: 225,
    title,
    elements: [
      port('clk', 30, 112, 'clk', 'in', '兩個 flop 共用同一條 clock'),
      port('rst', 257, 205, 'rst_n', 'in', 'async reset：state <= 00'),
      { id: 'g0', kind: gate, x: 60, y: 60, label: gateLabel, description: gateDesc },
      dff('ff0', 150, 60, 'FF0', 'q0', { description: 'state[0]' }),
      dff('ff1', 300, 60, 'FF1', 'q1', { description: 'state[1]；d1 = q0' }),
      dot('j0', 250, 80),
      dot('j1', 390, 80),
      port('out', 440, 80, 'div_out', 'out', 'assign div_out = state[1]'),
    ],
    wires: [
      wire('w_clk0', 'clk.p', 'ff0.clk', 'clock', { signal: 'clk' }),
      wire('w_clk1', 'clk.p', 'ff1.clk', 'clock', { points: [[130, 112], [130, 150], [280, 150], [280, 112]] }),
      wire('w_g_d0', 'g0.out', 'ff0.d', 'feedback', { signal: 'd0' }),
      wire('w_q0_d1', 'ff0.q', 'ff1.d', 'data', { signal: 'q0', route: 'direct', labelAt: 0.72 }),
      wire('w_q0_g', 'ff0.q', 'g0.in0', 'feedback', { points: [[250, 80], [250, 32], [40, 32], [40, 73.33]] }),
      wire('w_q1_out', 'ff1.q', 'out.p', 'output', { signal: 'q1' }),
      wire('w_q1_g', 'ff1.q', 'g0.in1', 'feedback', { points: [[390, 80], [390, 20], [28, 20], [28, 86.67]] }),
      wire('w_rst0', 'rst.p', 'ff0.rstn', 'reset', { points: [[182, 205]] }),
      wire('w_rst1', 'rst.p', 'ff1.rstn', 'reset', { points: [[332, 205]] }),
    ].map((w) => ({ ...w, id: `${id}_${w.id}` })),
  }
}
export const div3Sch = div3Like('d3', 'div3_fsm.sv 合成後：NOR + 兩個 DFF（11 → 10）', 'nor', 'NOR', 'd0 = NOR(q1, q0)：只有 00 時為 1')
export const div3LockupSch = div3Like('lk', 'default: next = state 合成後：XNOR + 兩個 DFF（11 → 11）', 'xnor', 'XNOR', 'd0 = XNOR(q1, q0)：00 與 11 時都是 1 ⇒ 11 走不出去')

/** 修正版 /3（div3Recover）：d0 = NOR(q1,q0)、d1 = q0 AND NOT q1（用方塊表示 AND-with-inverted-input） */
export const div3RecoverSch: Schematic = {
  width: 500,
  height: 240,
  title: 'default: next = 00 合成後：11 → 00',
  elements: [
    port('clk', 30, 112, 'clk', 'in'),
    port('rst', 257, 220, 'rst_n', 'in'),
    { id: 'nor', kind: 'nor', x: 60, y: 60, label: 'NOR', description: 'd0 = NOR(q1, q0)' },
    dff('ff0', 150, 60, 'FF0', 'q0'),
    {
      id: 'andn',
      kind: 'box',
      x: 236,
      y: 150,
      w: 52,
      h: 40,
      text: 'q0·q̄1',
      description: 'd1 = q0 AND NOT q1：state 11 時 d1 = 0',
      pins: [
        { name: 'in0', side: 'left', pos: 0.33, label: '' },
        { name: 'in1', side: 'left', pos: 0.67, label: '' },
        { name: 'out', side: 'right', pos: 0.5, label: '' },
      ],
    },
    dff('ff1', 320, 60, 'FF1', 'q1'),
    dot('j0', 224, 80),
    dot('j1', 410, 80),
    port('out', 460, 80, 'div_out', 'out'),
  ],
  wires: [
    wire('w_clk0', 'clk.p', 'ff0.clk', 'clock', { signal: 'clk' }),
    wire('w_clk1', 'clk.p', 'ff1.clk', 'clock', { points: [[130, 112], [130, 130], [306, 130], [306, 112]] }),
    wire('w_nor_d0', 'nor.out', 'ff0.d', 'feedback', { signal: 'd0' }),
    wire('w_q0_and', 'ff0.q', 'andn.in0', 'data', { signal: 'q0', points: [[224, 80], [224, 163.2]] }),
    wire('w_and_d1', 'andn.out', 'ff1.d', 'data', { signal: 'd1', points: [[300, 170], [300, 80]] }),
    wire('w_q0_nor', 'ff0.q', 'nor.in0', 'feedback', { points: [[224, 80], [224, 32], [40, 32], [40, 73.33]] }),
    wire('w_q1_out', 'ff1.q', 'out.p', 'output', { signal: 'q1' }),
    wire('w_q1_nor', 'ff1.q', 'nor.in1', 'feedback', { points: [[410, 80], [410, 20], [28, 20], [28, 86.67]] }),
    wire('w_q1_and', 'ff1.q', 'andn.in1', 'feedback', { points: [[410, 80], [410, 205], [222, 205], [222, 176.8]] }),
    wire('w_rst0', 'rst.p', 'ff0.rstn', 'reset', { points: [[182, 220]] }),
    wire('w_rst1', 'rst.p', 'ff1.rstn', 'reset', { points: [[352, 220]] }),
  ],
}

// ---------------------------------------------------------------- RTL block-level：always_ff / always_comb / assign
/** FSM 的方塊圖：always_comb（case）→ state register → assign 輸出，state 回授到 always_comb */
export const fsmBlocksSch: Schematic = {
  width: 560,
  height: 200,
  title: 'RTL 的三個方塊：always_comb（next-state）、always_ff（state register）、assign（output decode）',
  elements: [
    port('clk', 30, 154, 'clk', 'in', 'always_ff @(posedge clk …)'),
    {
      id: 'nsl',
      kind: 'box',
      x: 70,
      y: 50,
      w: 130,
      h: 80,
      text: 'always_comb\ncase (state)',
      description: 'next-state logic：純組合邏輯，沒有記憶',
      pins: [
        { name: 'state', side: 'left', pos: 0.5, label: 'state' },
        { name: 'next', side: 'right', pos: 0.5, label: 'next' },
      ],
    },
    regBox('reg', 260, 58, 'state[1:0]', 'always_ff：兩個 DFF，只在 posedge clk 把 next 抓進 state'),
    {
      id: 'dec',
      kind: 'box',
      x: 400,
      y: 70,
      w: 80,
      h: 40,
      text: 'state[1]',
      description: 'assign div_out = state[1]：Moore output，純組合邏輯',
      pins: [
        { name: 'in', side: 'left', pos: 0.5, label: '' },
        { name: 'out', side: 'right', pos: 0.5, label: '' },
      ],
    },
    dot('j', 370, 78.16),
    port('out', 530, 90, 'div_out', 'out'),
    port('rst', 300, 175, 'rst_n', 'in', 'if (!rst_n) state <= S0'),
  ],
  wires: [
    wire('w_next', 'nsl.next', 'reg.d', 'data', { label: 'next' }),
    wire('w_clk', 'clk.p', 'reg.clk', 'clock', { signal: 'clk', points: [[240, 154], [240, 122]] }),
    wire('w_q', 'reg.q', 'dec.in', 'data', { label: 'state' }),
    wire('w_fb', 'reg.q', 'nsl.state', 'feedback', { points: [[370, 78.16], [370, 22], [50, 22], [50, 90]] }),
    wire('w_out', 'dec.out', 'out.p', 'output'),
    wire('w_rst', 'rst.p', 'reg.rstn', 'reset', { route: 'direct' }),
  ],
}

/** Bug 2：case 沒寫完 ⇒ next 變成 latch（block-level） */
export const latchBlocksSch: Schematic = {
  width: 560,
  height: 215,
  title: 'case 缺 2\'b11：always_comb 的輸出前面多了一個 latch',
  elements: [
    port('clk', 30, 190, 'clk', 'in'),
    {
      id: 'nsl',
      kind: 'box',
      x: 60,
      y: 50,
      w: 120,
      h: 90,
      text: 'case (state)\n00/01/10 only',
      description: '只有三列的 case：state = 11 時沒有任何指定',
      pins: [
        { name: 'state', side: 'left', pos: 0.4, label: 'state' },
        { name: 'c', side: 'right', pos: 0.3, label: 'c' },
        { name: 'hit', side: 'bottom', pos: 0.7, label: 'hit' },
      ],
    },
    { id: 'lat', kind: 'latch', x: 230, y: 57, label: 'LAT（推斷）', signal: 'n1', description: '合成工具推斷出的 latch：case 有匹配（hit = 1）時 transparent，11 時 hold' },
    regBox('reg', 360, 50, 'state[1:0]', 'always_ff'),
    dot('j', 460, 70.16),
    port('out', 520, 70.16, 'div_out', 'out'),
    port('rst', 400, 165, 'rst_n', 'in'),
  ],
  wires: [
    wire('w_c', 'nsl.c', 'lat.d', 'data', { label: 'c（case 的結果）' }),
    wire('w_hit', 'nsl.hit', 'lat.clk', 'control', { signal: 'case_hit', points: [[144, 160], [214, 160], [214, 109]], labelAt: 0.4 }),
    wire('w_n', 'lat.q', 'reg.d', 'data', { label: 'next' }),
    wire('w_clk', 'clk.p', 'reg.clk', 'clock', { signal: 'clk', points: [[340, 190], [340, 114.08]] }),
    wire('w_out', 'reg.q', 'out.p', 'output'),
    wire('w_fb', 'reg.q', 'nsl.state', 'feedback', { points: [[460, 70.16], [460, 20], [40, 20], [40, 86]] }),
    wire('w_rst', 'rst.p', 'reg.rstn', 'reset', { route: 'direct' }),
  ],
}

// ---------------------------------------------------------------- /2 /3 dual-modulus cell（RTL 分頁 4）
export const dm23Sch: Schematic = {
  width: 470,
  height: 292,
  title: 'dm23_cell.sv：NOR（d0）、AND（d1 = q0·mod）、兩個 DFF',
  elements: [
    port('clk', 30, 112, 'clk', 'in'),
    port('mod', 50, 226.67, 'mod', 'in', 'modulus control：0 = /2、1 = /3'),
    { id: 'nor', kind: 'nor', x: 120, y: 60, label: 'NOR', description: 'd0 = NOR(q1, q0)；也是 div_out' },
    { id: 'and', kind: 'and', x: 120, y: 200, label: 'AND', description: 'd1 = q0 AND mod' },
    dff('ff0', 250, 60, 'FF0', 'q0'),
    dff('ff1', 250, 200, 'FF1', 'q1', { description: 'mod = 0 時永遠是 0' }),
    port('out', 200, 44, 'div_out', 'out', 'assign div_out = ~(q1 | q0)'),
    dot('j1', 200, 80),
    dot('j2', 340, 80),
  ],
  wires: [
    wire('w_clk0', 'clk.p', 'ff0.clk', 'clock', { signal: 'clk' }),
    wire('w_clk1', 'clk.p', 'ff1.clk', 'clock', { points: [[60, 112], [60, 252]] }),
    wire('w_nor_d0', 'nor.out', 'ff0.d', 'data', { signal: 'd0', labelAt: 0.7 }),
    wire('w_and_d1', 'and.out', 'ff1.d', 'data', { signal: 'd1', labelAt: 0.7 }),
    wire('w_q0_nor', 'ff0.q', 'nor.in0', 'feedback', { signal: 'q0', points: [[350, 80], [350, 30], [90, 30], [90, 73.33]], labelAt: 0.5 }),
    wire('w_q0_and', 'ff0.q', 'and.in0', 'feedback', { points: [[340, 80], [340, 150], [100, 150], [100, 213.33]] }),
    wire('w_q1_nor', 'ff1.q', 'nor.in1', 'feedback', { signal: 'q1', points: [[360, 220], [360, 15], [80, 15], [80, 86.67]], labelAt: 0.5 }),
    wire('w_mod', 'mod.p', 'and.in1', 'control', { signal: 'mod' }),
    wire('w_out', 'nor.out', 'out.p', 'output', { points: [[200, 80], [200, 44]] }),
  ],
}

// ---------------------------------------------------------------- terminal-count counter（RTL 分頁 5、Bug 7）
function counterBlocks(title: string, nslText: string, decText: string, withSel: boolean): Schematic {
  const els: SchElement[] = [
    port('clk', 30, 180, 'clk', 'in'),
    {
      id: 'nsl',
      kind: 'box',
      x: 60,
      y: 50,
      w: 150,
      h: 90,
      text: nslText,
      description: 'always_comb / assign：tc 與 next 都是 cnt 的純組合函數',
      pins: [
        { name: 'cnt', side: 'left', pos: 0.4, label: 'cnt' },
        ...(withSel ? [{ name: 'sel', side: 'left' as const, pos: 0.75, label: 'sel' }] : []),
        { name: 'next', side: 'right', pos: 0.4, label: 'next' },
      ],
    },
    regBox('reg', 270, 58, 'cnt[2:0]', 'always_ff：三個 DFF'),
    {
      id: 'dec',
      kind: 'box',
      x: 410,
      y: 66,
      w: 90,
      h: 40,
      text: decText,
      description: 'assign div_out = (cnt == 0)：Moore output decode',
      pins: [
        { name: 'in', side: 'left', pos: 0.5, label: '' },
        { name: 'out', side: 'right', pos: 0.5, label: '' },
      ],
    },
    dot('j', 380, 78.16),
    port('out', 550, 86, 'div_out', 'out'),
    port('rst', 310, 165, 'rst_n', 'in'),
  ]
  if (withSel) els.push(port('sel', 30, 117.5, 'sel', 'in', '0：/4；1：/6'))
  const ws: SchWire[] = [
    wire('w_next', 'nsl.next', 'reg.d', 'data', { label: 'next' }),
    wire('w_clk', 'clk.p', 'reg.clk', 'clock', { signal: 'clk', points: [[250, 180], [250, 122]] }),
    wire('w_q', 'reg.q', 'dec.in', 'data', { label: 'cnt' }),
    wire('w_fb', 'reg.q', 'nsl.cnt', 'feedback', { points: [[380, 78.16], [380, 20], [40, 20], [40, 86]] }),
    wire('w_out', 'dec.out', 'out.p', 'output', { signal: 'div_out' }),
    wire('w_rst', 'rst.p', 'reg.rstn', 'reset', { route: 'direct' }),
  ]
  if (withSel) ws.push(wire('w_sel', 'sel.p', 'nsl.sel', 'control', { signal: 'sel' }))
  return { width: 600, height: 200, title, elements: els, wires: ws }
}
export const prog46Sch = counterBlocks('div_prog46.sv：counter + terminal count + decode', 'tc = (cnt == n_max)\nnext = tc ? 0 : cnt+1', 'cnt == 0', true)
export const offByOneSch = counterBlocks('cnt == 4 才歸零：五個 state', 'tc = (cnt == 4)\nnext = tc ? 0 : cnt+1', 'cnt == 0', false)
export const offByOneFixedSch = counterBlocks('cnt == N−1 = 3 歸零：四個 state', 'tc = (cnt == 3)\nnext = tc ? 0 : cnt+1', 'cnt == 0', false)

// ---------------------------------------------------------------- MMD（RTL 分頁 6）
function stageBox(id: string, x: number, y: number, text: string): SchElement {
  return {
    id,
    kind: 'box',
    x,
    y,
    w: 120,
    h: 80,
    text,
    edge: 'rising',
    description: 'dm23_stage：/2 /3 cell，clock 是上一級的 f_out',
    pins: [
      { name: 'clk', side: 'left', pos: 0.35, label: 'clk' },
      { name: 'p', side: 'left', pos: 0.7, label: 'p' },
      { name: 'f', side: 'right', pos: 0.35, label: 'f_out' },
      { name: 'mod', side: 'right', pos: 0.75, label: 'mod_in' },
      { name: 'modo', side: 'left', pos: 0.9, label: '' },
      { name: 'rstn', side: 'bottom', pos: 0.5, label: 'rst_n' },
    ],
  }
}
export const mmdSch: Schematic = {
  width: 520,
  height: 215,
  title: 'mmd.sv（STAGES = 2）：f 往右送、mod 往左回',
  elements: [
    port('clk', 30, 88, 'clk', 'in'),
    port('p0', 30, 116, 'p0', 'in', 'stage 1 的 p'),
    stageBox('s1', 80, 60, 'stage 1\n(a1, a0)'),
    stageBox('s2', 280, 60, 'stage 2\n(b1, b0)'),
    port('p1', 264, 165, 'p1', 'in', 'stage 2 的 p'),
    port('one', 450, 120, "1'b1", 'in', '最後一級的 mod_in 固定為 1'),
    port('out', 470, 88, 'div_out', 'out', 'assign div_out = f[STAGES]'),
    port('rst', 240, 195, 'rst_n', 'in'),
  ],
  wires: [
    wire('w_clk', 'clk.p', 's1.clk', 'clock', { signal: 'clk' }),
    wire('w_p0', 'p0.p', 's1.p', 'control', { signal: 'p0' }),
    wire('w_f1', 's1.f', 's2.clk', 'clock', { signal: 'f1', labelAt: 0.5 }),
    wire('w_mod2', 's2.modo', 's1.mod', 'control', { signal: 'mod_out2', route: 'direct', labelAt: 0.5 }),
    wire('w_p1', 'p1.p', 's2.p', 'control', { signal: 'p1', points: [[264, 116]] }),
    wire('w_one', 'one.p', 's2.mod', 'control', { route: 'direct' }),
    wire('w_out', 's2.f', 'out.p', 'output', { signal: 'div_out' }),
    wire('w_rst1', 'rst.p', 's1.rstn', 'reset', { points: [[140, 195]], noArrow: true }),
    wire('w_rst2', 'rst.p', 's2.rstn', 'reset', { points: [[340, 195]], noArrow: true }),
  ],
}

// ---------------------------------------------------------------- 8:1 phase MUX（RTL 分頁 7）
export const pmuxNaiveSch: Schematic = {
  width: 300,
  height: 240,
  title: 'pmux8_naive.sv：assign div_out = ph[phase_sel]',
  elements: [
    ...Array.from({ length: 8 }, (_, i) => port(`ph${i}`, 50, 20 + (170 * (i + 1)) / 9, `ph${i}`, 'in', `phase ${i}：落後 ph0 ${i}/8 T`)),
    { id: 'mux', kind: 'mux8', x: 120, y: 20, label: '8:1 MUX', description: '純組合邏輯 MUX：phase_sel 一變，輸出立刻跳到新相位的目前值' },
    port('sel', 140, 225, 'phase_sel[2:0]', 'in'),
    port('out', 230, 105, 'div_out', 'out'),
  ],
  wires: [
    ...Array.from({ length: 8 }, (_, i) => wire(`w_ph${i}`, `ph${i}.p`, `mux.in${i}`, 'clock', { signal: `ph${i}` })),
    wire('w_sel', 'sel.p', 'mux.sel', 'control', { route: 'direct' }),
    wire('w_out', 'mux.out', 'out.p', 'output', { signal: 'div_out' }),
  ],
}

// ---------------------------------------------------------------- Bug 4：combinational loop
const cntRegForToggle: SchElement = {
  id: 'reg',
  kind: 'box',
  x: 60,
  y: 90,
  w: 80,
  h: 72,
  text: 'cnt[1:0]\n(cnt + 1)',
  edge: 'rising',
  description: 'always_ff：/4 counter（兩個 DFF，內含 +1 邏輯）',
  pins: [
    { name: 'clk', side: 'left', pos: 0.89, label: '' },
    { name: 'q1', side: 'right', pos: 0.46, label: 'q1' },
    { name: 'q0', side: 'right', pos: 0.65, label: 'q0' },
    { name: 'rstn', side: 'bottom', pos: 0.5, label: 'rst_n' },
  ],
}
export const combLoopSch: Schematic = {
  width: 520,
  height: 220,
  title: 'assign div_out = tc ? ~div_out : div_out：輸出接回自己的輸入',
  elements: [
    port('clk', 30, 154.08, 'clk', 'in'),
    cntRegForToggle,
    { id: 'and', kind: 'and', x: 190, y: 110, label: 'AND', description: 'tc = (cnt == 3) = q1 AND q0' },
    {
      id: 'loop',
      kind: 'box',
      x: 290,
      y: 54,
      w: 130,
      h: 60,
      text: 'tc ? ~div_out\n: div_out',
      description: 'assign：沒有 flop 擋住，div_out 是自己的輸入 ⇒ combinational loop',
      pins: [
        { name: 'tc', side: 'left', pos: 0.35, label: 'tc' },
        { name: 'fb', side: 'left', pos: 0.75, label: 'fb' },
        { name: 'out', side: 'right', pos: 0.5, label: '' },
      ],
    },
    dot('j', 440, 84),
    port('out', 490, 84, 'div_out', 'out'),
    port('rst', 100, 190, 'rst_n', 'in'),
  ],
  wires: [
    wire('w_clk', 'clk.p', 'reg.clk', 'clock', { signal: 'clk' }),
    wire('w_q1', 'reg.q1', 'and.in0', 'data', { signal: 'q1' }),
    wire('w_q0', 'reg.q0', 'and.in1', 'data', { signal: 'q0' }),
    wire('w_tc', 'and.out', 'loop.tc', 'data', { signal: 'tc', points: [[266, 130], [266, 75]] }),
    wire('w_out', 'loop.out', 'out.p', 'output', { signal: 'div_out' }),
    wire('w_fb', 'loop.out', 'loop.fb', 'feedback', { points: [[440, 84], [440, 140], [275, 140], [275, 99]], label: '自己接自己', labelAt: 0.5 }),
    wire('w_rst', 'rst.p', 'reg.rstn', 'reset', { route: 'direct' }),
  ],
}
export const combFixedSch: Schematic = {
  width: 540,
  height: 230,
  title: 'toggle 放進 always_ff：q2 <= tc ? ~q2 : q2（d2 = q2 XOR tc）',
  elements: [
    port('clk', 30, 154.08, 'clk', 'in'),
    dot('dclk', 45, 154.08),
    cntRegForToggle,
    { id: 'and', kind: 'and', x: 190, y: 110, label: 'AND', description: 'tc = q1 AND q0' },
    { id: 'xor', kind: 'xor', x: 290, y: 64, label: 'XOR', description: 'd2 = q2 XOR tc' },
    dff('ff2', 380, 64, 'FF2', 'q2', { description: 'always_ff：q2 只在 tc = 1 的那個 edge 反相' }),
    dot('j', 460, 84),
    port('out', 500, 84, 'div_out', 'out'),
    port('rst', 100, 185, 'rst_n', 'in'),
    port('rst2', 412, 175, 'rst_n', 'in'),
  ],
  wires: [
    wire('w_clk', 'clk.p', 'reg.clk', 'clock', { signal: 'clk' }),
    wire('w_clk2', 'clk.p', 'ff2.clk', 'clock', { points: [[45, 154.08], [45, 205], [366, 205], [366, 116]] }),
    wire('w_q1', 'reg.q1', 'and.in0', 'data', { signal: 'q1' }),
    wire('w_q0', 'reg.q0', 'and.in1', 'data', { signal: 'q0' }),
    wire('w_tc', 'and.out', 'xor.in1', 'data', { signal: 'tc', points: [[266, 130], [266, 90.67]] }),
    wire('w_d2', 'xor.out', 'ff2.d', 'data', { signal: 'd2' }),
    wire('w_fb', 'ff2.q', 'xor.in0', 'feedback', { signal: 'q2', points: [[460, 84], [460, 12], [272, 12], [272, 77.33]], labelAt: 0.5 }),
    wire('w_out', 'ff2.q', 'out.p', 'output'),
    wire('w_rst', 'rst.p', 'reg.rstn', 'reset', { route: 'direct' }),
    wire('w_rst2', 'rst2.p', 'ff2.rstn', 'reset', { route: 'direct' }),
  ],
}

// ---------------------------------------------------------------- Bug 5：combinational clock gating
const dm12Common: SchElement[] = [
  port('clk', 30, 172, 'clk', 'in'),
  dff('ff0', 110, 120, 'FF0', 'q0', { description: 'q0 <= ~q0：toggle flop' }),
  { id: 'inv0', kind: 'inv', x: 200, y: 220, label: 'INV', description: 'd0 = ~q0' },
  dot('j0', 188, 140),
  port('rst', 142, 215, 'rst_n', 'in'),
  port('sel', 30, 63.33, 'sel', 'in', '0：/1；1：/2'),
  { id: 'invs', kind: 'inv', x: 80, y: 51.33, label: 'INV', description: '~sel' },
  { id: 'or', kind: 'or', x: 250, y: 50, label: 'OR', description: 'en = ~sel | q0' },
]
const dm12CommonWires: SchWire[] = [
  wire('w_clk0', 'clk.p', 'ff0.clk', 'clock', { signal: 'clk' }),
  wire('w_q0_inv', 'ff0.q', 'inv0.in0', 'feedback', { signal: 'q0', points: [[188, 140], [188, 232]], labelAt: 0.7 }),
  wire('w_d0', 'inv0.out', 'ff0.d', 'feedback', { signal: 'd0', points: [[250, 232], [250, 260], [94, 260], [94, 140]], labelAt: 0.5 }),
  wire('w_rst', 'rst.p', 'ff0.rstn', 'reset', { route: 'direct' }),
  wire('w_sel', 'sel.p', 'invs.in0', 'control', { signal: 'sel' }),
  wire('w_selb', 'invs.out', 'or.in0', 'control'),
  wire('w_q0_or', 'ff0.q', 'or.in1', 'data', { points: [[188, 140], [188, 76.67]] }),
]
export const dm12GlitchySch: Schematic = {
  width: 480,
  height: 285,
  title: 'assign en = ~sel | q0; assign div_out = clk & en：組合邏輯直接切 clock',
  elements: [
    ...dm12Common,
    { id: 'and', kind: 'and', x: 350, y: 90, label: 'AND', description: 'div_out = clk AND en：AND 在 clock 路徑上' },
    port('clk2', 300, 116.67, 'clk', 'in', '同一條 clk'),
    port('out', 460, 110, 'div_out', 'out'),
  ],
  wires: [
    ...dm12CommonWires,
    wire('w_en', 'or.out', 'and.in0', 'control', { signal: 'en', points: [[326, 70], [326, 103.33]], labelAt: 0.3 }),
    wire('w_clk_and', 'clk2.p', 'and.in1', 'clock'),
    wire('w_out', 'and.out', 'out.p', 'output', { signal: 'div_out' }),
  ],
}
export const dm12FixedSch: Schematic = {
  width: 580,
  height: 285,
  title: 'en 先用 negedge clk 取樣：AND 的兩個輸入不會同時變',
  elements: [
    ...dm12Common,
    dff('ffen', 330, 50, 'FF_EN', 'en', { edge: 'falling', description: 'always_ff @(negedge clk)：en 只在 clk = 0 期間更新' }),
    port('clk2', 280, 102, 'clk', 'in', '同一條 clk（negedge）'),
    { id: 'and', kind: 'and', x: 430, y: 50, label: 'AND', description: 'div_out = clk AND en' },
    port('out', 540, 70, 'div_out', 'out'),
    port('rsten', 362, 145, 'rst_n', 'in'),
  ],
  wires: [
    ...dm12CommonWires,
    wire('w_den', 'or.out', 'ffen.d', 'control', { signal: 'd_en' }),
    wire('w_clk_en', 'clk2.p', 'ffen.clk', 'clock'),
    wire('w_en', 'ffen.q', 'and.in0', 'control', { signal: 'en' }),
    wire('w_clk_and', 'clk2.p', 'and.in1', 'clock', { points: [[300, 102], [300, 160], [418, 160], [418, 76.67]] }),
    wire('w_out', 'and.out', 'out.p', 'output', { signal: 'div_out' }),
    wire('w_rsten', 'rsten.p', 'ffen.rstn', 'reset', { route: 'direct' }),
  ],
}

// ---------------------------------------------------------------- Bug 6：mod 到達太晚（block-level）
export const modLateSch: Schematic = {
  width: 540,
  height: 250,
  title: 'mod 從 flop 出來後還要走 90 ps 的慢邏輯才到 cell',
  elements: [
    port('clk', 30, 100, 'clk', 'in'),
    dot('dclk', 50, 100),
    {
      id: 'cell',
      kind: 'box',
      x: 80,
      y: 60,
      w: 120,
      h: 80,
      text: 'dm23 cell\n(q1, q0)',
      edge: 'rising',
      description: '/2 /3 cell：d1 = q0 AND mod，mod 必須在 edge 前 tsetup + tAND 穩定',
      pins: [
        { name: 'clk', side: 'left', pos: 0.5, label: '' },
        { name: 'mod', side: 'left', pos: 0.85, label: 'mod' },
        { name: 'out', side: 'right', pos: 0.5, label: '' },
        { name: 'rstn', side: 'bottom', pos: 0.5, label: 'rst_n' },
      ],
    },
    dot('j', 230, 100),
    port('out', 230, 40, 'div_out', 'out'),
    dff('ffsw', 260, 80, 'FF_SW', 'sw_r', { description: 'sw_r <= (state == 00)：這一段「有」retime' }),
    {
      id: 'slow',
      kind: 'box',
      x: 360,
      y: 78,
      w: 120,
      h: 44,
      text: '比較 / MUX\n90 ps',
      description: '慢的組合邏輯：tCQ 8 + 90 + tAND 10 = 108 ps > T = 100 ps',
      pins: [
        { name: 'in', side: 'left', pos: 0.5, label: '' },
        { name: 'mod', side: 'right', pos: 0.5, label: '' },
      ],
    },
    port('rst', 140, 170, 'rst_n', 'in'),
    port('rst2', 292, 175, 'rst_n', 'in'),
  ],
  wires: [
    wire('w_clk', 'clk.p', 'cell.clk', 'clock', { signal: 'clk' }),
    wire('w_clk2', 'clk.p', 'ffsw.clk', 'clock', { points: [[50, 100], [50, 190], [246, 190], [246, 132]] }),
    wire('w_out', 'cell.out', 'ffsw.d', 'data', { signal: 'div_out' }),
    wire('w_outp', 'cell.out', 'out.p', 'output', { points: [[230, 100], [230, 40]] }),
    wire('w_sw', 'ffsw.q', 'slow.in', 'data', { signal: 'sw_r' }),
    wire('w_mod', 'slow.mod', 'cell.mod', 'control', { signal: 'mod', points: [[500, 100], [500, 230], [64, 230], [64, 128]], labelAt: 0.5 }),
    wire('w_rst', 'rst.p', 'cell.rstn', 'reset', { route: 'direct' }),
    wire('w_rst2', 'rst2.p', 'ffsw.rstn', 'reset', { route: 'direct' }),
  ],
}

// ---------------------------------------------------------------- Bug 8：decode glitch（gate-level ripple）與修正（block-level）
export const rippleDecodeSch: Schematic = {
  width: 740,
  height: 270,
  title: 'ripple /4 + decode（q1 & ~q0）+ 下一級用 div_out 當 clock',
  elements: [
    port('clk', 30, 132, 'clk', 'in'),
    dff('ff0', 70, 80, 'FF0', 'q0'),
    { id: 'inv0', kind: 'inv', x: 160, y: 28, label: 'INV0' },
    dot('j0', 148, 100),
    port('rst0', 102, 165, 'rst_n', 'in'),
    dff('ff1', 250, 80, 'FF1', 'q1', { edge: 'falling', description: 'always_ff @(negedge q0)：clock 是 q0，不是 clk' }),
    { id: 'inv1', kind: 'inv', x: 340, y: 28, label: 'INV1' },
    dot('j1', 328, 100),
    port('rst1', 282, 165, 'rst_n', 'in'),
    { id: 'invq0', kind: 'inv', x: 370, y: 120, label: 'INV', description: '~q0' },
    { id: 'and', kind: 'and', x: 430, y: 80, label: 'AND', description: 'div_out = q1 AND NOT q0（decode state 10）' },
    dot('j2', 500, 100),
    port('out', 560, 100, 'div_out', 'out'),
    dff('ff2', 520, 120, 'FF2', 'q2', { description: 'always_ff @(posedge div_out)：把 div_out 當 clock' }),
    { id: 'inv2', kind: 'inv', x: 610, y: 210, label: 'INV2' },
    dot('j3', 598, 140),
    port('q2', 700, 140, 'q2', 'out'),
    port('rst2', 552, 215, 'rst_n', 'in'),
  ],
  wires: [
    wire('w_clk', 'clk.p', 'ff0.clk', 'clock', { signal: 'clk' }),
    wire('w_q0_inv', 'ff0.q', 'inv0.in0', 'feedback', { signal: 'q0', points: [[148, 100], [148, 40]], labelAt: 0.7 }),
    wire('w_d0', 'inv0.out', 'ff0.d', 'feedback', { points: [[210, 40], [210, 14], [54, 14], [54, 100]] }),
    wire('w_q0_clk1', 'ff0.q', 'ff1.clk', 'clock', { points: [[236, 100], [236, 132]], label: 'q0 當 clock' }),
    wire('w_q1_inv', 'ff1.q', 'inv1.in0', 'feedback', { signal: 'q1', points: [[328, 100], [328, 40]], labelAt: 0.7 }),
    wire('w_d1', 'inv1.out', 'ff1.d', 'feedback', { points: [[390, 40], [390, 14], [228, 14], [228, 100]] }),
    wire('w_q0_invq0', 'ff0.q', 'invq0.in0', 'data', { points: [[148, 100], [148, 200], [360, 200], [360, 132]] }),
    wire('w_nq0', 'invq0.out', 'and.in1', 'data', { points: [[418, 132], [418, 106.67]] }),
    wire('w_q1_and', 'ff1.q', 'and.in0', 'data'),
    wire('w_out', 'and.out', 'out.p', 'output', { signal: 'div_out' }),
    wire('w_out_clk2', 'and.out', 'ff2.clk', 'clock', { points: [[500, 100], [500, 172]] }),
    wire('w_q2_inv', 'ff2.q', 'inv2.in0', 'feedback', { signal: 'q2', points: [[598, 140], [598, 222]], labelAt: 0.7 }),
    wire('w_d2', 'inv2.out', 'ff2.d', 'feedback', { points: [[660, 222], [660, 250], [506, 250], [506, 140]] }),
    wire('w_q2_out', 'ff2.q', 'q2.p', 'output'),
    wire('w_rst0', 'rst0.p', 'ff0.rstn', 'reset', { route: 'direct' }),
    wire('w_rst1', 'rst1.p', 'ff1.rstn', 'reset', { route: 'direct' }),
    wire('w_rst2', 'rst2.p', 'ff2.rstn', 'reset', { route: 'direct' }),
  ],
}

export const syncDecodeRegSch: Schematic = {
  width: 680,
  height: 220,
  title: '同步 counter + registered decode：div_out 由 flop 直接驅動',
  elements: [
    port('clk', 30, 124.08, 'clk', 'in'),
    dot('dclk', 45, 124.08),
    regBox('reg', 60, 60, 'cnt[1:0]\n(cnt + 1)', 'always_ff：同步 /4 counter'),
    {
      id: 'dec',
      kind: 'box',
      x: 180,
      y: 64,
      w: 90,
      h: 32,
      text: 'cnt == 10',
      description: '組合邏輯 decode（q1 & ~q0），結果送進 FF_OUT 的 D',
      pins: [
        { name: 'in', side: 'left', pos: 0.5, label: '' },
        { name: 'out', side: 'right', pos: 0.5, label: '' },
      ],
    },
    dff('ffout', 310, 60, 'FF_OUT', 'div_out', { description: 'div_out <= (cnt == 10)：輸出寬度剛好 1T' }),
    dot('j', 400, 80),
    port('out', 400, 30, 'div_out', 'out'),
    dff('ff2', 470, 60, 'FF2', 'q2', { description: 'always_ff @(posedge div_out)' }),
    { id: 'inv2', kind: 'inv', x: 556, y: 10, label: 'INV2' },
    dot('j2', 548, 80),
    port('q2', 640, 80, 'q2', 'out'),
    port('rst0', 100, 170, 'rst_n', 'in'),
    port('rst1', 342, 170, 'rst_n', 'in'),
    port('rst2', 502, 170, 'rst_n', 'in'),
  ],
  wires: [
    wire('w_clk', 'clk.p', 'reg.clk', 'clock', { signal: 'clk' }),
    wire('w_clk1', 'clk.p', 'ffout.clk', 'clock', { points: [[45, 124.08], [45, 200], [296, 200], [296, 112]] }),
    wire('w_q', 'reg.q', 'dec.in', 'data', { label: 'cnt' }),
    wire('w_dec', 'dec.out', 'ffout.d', 'data', { signal: 'dec' }),
    wire('w_out', 'ffout.q', 'out.p', 'output', { points: [[400, 80], [400, 30]] }),
    wire('w_out_clk2', 'ffout.q', 'ff2.clk', 'clock', { signal: 'div_out', points: [[400, 80], [400, 112]] }),
    wire('w_q2_inv', 'ff2.q', 'inv2.in0', 'feedback', { signal: 'q2', points: [[548, 80], [548, 22]], labelAt: 0.7 }),
    wire('w_d2', 'inv2.out', 'ff2.d', 'feedback', { points: [[606, 22], [606, 4], [456, 4], [456, 80]] }),
    wire('w_q2_out', 'ff2.q', 'q2.p', 'output'),
    wire('w_rst0', 'rst0.p', 'reg.rstn', 'reset', { route: 'direct' }),
    wire('w_rst1', 'rst1.p', 'ffout.rstn', 'reset', { route: 'direct' }),
    wire('w_rst2', 'rst2.p', 'ff2.rstn', 'reset', { route: 'direct' }),
  ],
}

// ---------------------------------------------------------------- 練習：Johnson counter
export const johnsonSch: Schematic = {
  width: 520,
  height: 215,
  title: 'mystery.sv：三個 DFF 串成一圈，最後一級反相回到第一級',
  elements: [
    port('clk', 30, 132, 'clk', 'in'),
    dot('dclk', 50, 132),
    dff('ff0', 80, 80, 'FF0', 'q0'),
    dff('ff1', 200, 80, 'FF1', 'q1'),
    dff('ff2', 320, 80, 'FF2', 'q2'),
    { id: 'inv', kind: 'inv', x: 200, y: 14, label: 'INV', description: 'd0 = ~q2' },
    dot('j2', 400, 100),
    port('out', 460, 100, 'div_out', 'out'),
    port('rst0', 112, 175, 'rst_n', 'in'),
    port('rst1', 232, 175, 'rst_n', 'in'),
    port('rst2', 352, 175, 'rst_n', 'in'),
  ],
  wires: [
    wire('w_clk0', 'clk.p', 'ff0.clk', 'clock', { signal: 'clk' }),
    wire('w_clk1', 'clk.p', 'ff1.clk', 'clock', { points: [[50, 132], [50, 195], [180, 195], [180, 132]] }),
    wire('w_clk2', 'clk.p', 'ff2.clk', 'clock', { points: [[50, 132], [50, 195], [300, 195], [300, 132]] }),
    wire('w_q0_d1', 'ff0.q', 'ff1.d', 'data', { signal: 'q0' }),
    wire('w_q1_d2', 'ff1.q', 'ff2.d', 'data', { signal: 'q1' }),
    wire('w_q2_inv', 'ff2.q', 'inv.in0', 'feedback', { signal: 'q2', points: [[400, 100], [400, 4], [190, 4], [190, 26]], labelAt: 0.3 }),
    wire('w_d0', 'inv.out', 'ff0.d', 'feedback', { signal: 'd0', points: [[250, 26], [250, 52], [64, 52], [64, 100]], labelAt: 0.5 }),
    wire('w_out', 'ff2.q', 'out.p', 'output'),
    wire('w_rst0', 'rst0.p', 'ff0.rstn', 'reset', { route: 'direct' }),
    wire('w_rst1', 'rst1.p', 'ff1.rstn', 'reset', { route: 'direct' }),
    wire('w_rst2', 'rst2.p', 'ff2.rstn', 'reset', { route: 'direct' }),
  ],
}

// ---------------------------------------------------------------- highlight
/** Bug 6：mod 的 control path（launch = FF_SW，capture = cell 在 state 01 那個 edge） */
export const modLateHighlight: SchematicHighlight = {
  style: 'async',
  wires: ['w_sw', 'w_mod'],
  elements: ['slow', 'ffsw'],
  tags: [{ elementOrWire: 'slow', text: '108 ps > T' }],
}
/** Bug 5：AND 在 clock 路徑上 —— pulse-width 問題，不是 setup */
export const gatingHighlight: SchematicHighlight = {
  style: 'async',
  wires: ['w_en', 'w_clk_and'],
  elements: ['and'],
  tags: [{ elementOrWire: 'and', text: 'pulse width，不是 setup' }],
}
