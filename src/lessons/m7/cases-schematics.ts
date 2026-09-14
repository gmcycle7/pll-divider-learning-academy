import type { Schematic, SchematicHighlight } from '@/components/circuit/schematic'

/* ------------------------------------------------------------------ 案例 B：programmable /4 /6 */
/**
 * 3-bit synchronous counter：FF0..FF2 → q bus → INC(+1) / DEC4 / DEC6 → MUX2(sel) → CLR(AND ¬tc) → D
 * reset 線省略（netlist 內有 rst_n）。
 */
export const progDivSchematic: Schematic = {
  width: 720,
  height: 390,
  title: 'Programmable /4 /6：counter + decode + MUX',
  elements: [
    { id: 'clk', kind: 'port', x: 30, y: 92, text: 'clk', dir: 'in', description: 'input clock' },
    { id: 'ff0', kind: 'dff', x: 110, y: 40, label: 'FF0', edge: 'rising', signal: 'q0' },
    { id: 'ff1', kind: 'dff', x: 110, y: 140, label: 'FF1', edge: 'rising', signal: 'q1' },
    { id: 'ff2', kind: 'dff', x: 110, y: 240, label: 'FF2', edge: 'rising', signal: 'q2' },
    { id: 'qbus', kind: 'dot', x: 215, y: 200, description: 'q[2:0] bus：三個 state bit 同時送到 INC 與兩個 decode' },
    {
      id: 'inc',
      kind: 'box',
      x: 260,
      y: 40,
      w: 70,
      h: 100,
      text: 'INC\n(+1)',
      description: 'inc = state + 1：inc0 = NOT q0、inc1 = q1 XOR q0、inc2 = q2 XOR (q1 AND q0)',
      pins: [
        { name: 'q', side: 'left', pos: 0.5, label: 'q[2:0]' },
        { name: 'inc0', side: 'right', pos: 0.2, label: 'inc0' },
        { name: 'inc1', side: 'right', pos: 0.5, label: 'inc1' },
        { name: 'inc2', side: 'right', pos: 0.8, label: 'inc2' },
      ],
    },
    {
      id: 'dec4',
      kind: 'box',
      x: 260,
      y: 170,
      w: 70,
      h: 50,
      text: 'DEC4\n(=011)',
      description: 'tc4 = NOT q2 AND q1 AND q0：state 為 011 時為 1',
      pins: [
        { name: 'q', side: 'left', pos: 0.5, label: 'q[2:0]' },
        { name: 'tc4', side: 'right', pos: 0.5, label: 'tc4' },
      ],
    },
    {
      id: 'dec6',
      kind: 'box',
      x: 260,
      y: 240,
      w: 70,
      h: 50,
      text: 'DEC6\n(=101)',
      description: 'tc6 = q2 AND NOT q1 AND q0：state 為 101 時為 1',
      pins: [
        { name: 'q', side: 'left', pos: 0.5, label: 'q[2:0]' },
        { name: 'tc6', side: 'right', pos: 0.5, label: 'tc6' },
      ],
    },
    { id: 'mux', kind: 'mux2', x: 380, y: 190, label: 'MUX2', description: 'tc = sel ? tc6 : tc4' },
    { id: 'sel', kind: 'port', x: 400, y: 320, text: 'sel', dir: 'in', description: 'sel=0：/4；sel=1：/6' },
    {
      id: 'clr',
      kind: 'box',
      x: 500,
      y: 40,
      w: 70,
      h: 100,
      text: 'CLR\n(AND ¬tc)',
      description: 'd_i = inc_i AND NOT tc：terminal count 時把下一個 state 清為 000',
      pins: [
        { name: 'inc0', side: 'left', pos: 0.2, label: 'inc0' },
        { name: 'inc1', side: 'left', pos: 0.5, label: 'inc1' },
        { name: 'inc2', side: 'left', pos: 0.8, label: 'inc2' },
        { name: 'tc', side: 'bottom', pos: 0.5, label: 'tc' },
        { name: 'd0', side: 'right', pos: 0.2, label: 'd0' },
        { name: 'd1', side: 'right', pos: 0.5, label: 'd1' },
        { name: 'd2', side: 'right', pos: 0.8, label: 'd2' },
      ],
    },
    { id: 'out', kind: 'port', x: 690, y: 160, text: 'div_out', dir: 'out', description: 'div_out = q1' },
  ],
  wires: [
    { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_clk1', from: 'clk.p', to: 'ff1.clk', signal: 'clk', kind: 'clock', points: [[60, 92], [60, 192]] },
    { id: 'w_clk2', from: 'clk.p', to: 'ff2.clk', signal: 'clk', kind: 'clock', points: [[60, 92], [60, 292]] },
    { id: 'w_q0', from: 'ff0.q', to: 'qbus.p', signal: 'q0', kind: 'data', points: [[200, 60], [200, 200]], noArrow: true, labelAt: 0.1 },
    { id: 'w_q1', from: 'ff1.q', to: 'qbus.p', signal: 'q1', kind: 'data', points: [[200, 160], [200, 200]], noArrow: true, labelAt: 0.1 },
    { id: 'w_q2', from: 'ff2.q', to: 'qbus.p', signal: 'q2', kind: 'data', points: [[200, 260], [200, 200]], noArrow: true, labelAt: 0.1 },
    { id: 'w_bus_inc', from: 'qbus.p', to: 'inc.q', kind: 'data', points: [[215, 90]] },
    { id: 'w_bus_dec4', from: 'qbus.p', to: 'dec4.q', kind: 'data', points: [[215, 195]] },
    { id: 'w_bus_dec6', from: 'qbus.p', to: 'dec6.q', kind: 'data', points: [[215, 265]] },
    { id: 'w_inc0', from: 'inc.inc0', to: 'clr.inc0', signal: 'inc0', kind: 'data' },
    { id: 'w_inc1', from: 'inc.inc1', to: 'clr.inc1', signal: 'inc1', kind: 'data' },
    { id: 'w_inc2', from: 'inc.inc2', to: 'clr.inc2', signal: 'inc2', kind: 'data' },
    { id: 'w_tc4', from: 'dec4.tc4', to: 'mux.in0', signal: 'tc4', kind: 'data' },
    { id: 'w_tc6', from: 'dec6.tc6', to: 'mux.in1', signal: 'tc6', kind: 'data' },
    { id: 'w_sel', from: 'sel.p', to: 'mux.sel', signal: 'sel', kind: 'control', points: [[400, 280]] },
    { id: 'w_tc', from: 'mux.out', to: 'clr.tc', signal: 'tc', kind: 'data', points: [[535, 220]] },
    { id: 'w_d0', from: 'clr.d0', to: 'ff0.d', signal: 'd0', kind: 'feedback', points: [[596, 60], [596, 24], [90, 24], [90, 60]], labelAt: 0.5 },
    { id: 'w_d1', from: 'clr.d1', to: 'ff1.d', signal: 'd1', kind: 'feedback', points: [[606, 90], [606, 12], [84, 12], [84, 160]], labelAt: 0.5 },
    { id: 'w_d2', from: 'clr.d2', to: 'ff2.d', signal: 'd2', kind: 'feedback', points: [[616, 120], [616, 350], [76, 350], [76, 260]], labelAt: 0.5 },
    { id: 'w_out', from: 'ff1.q', to: 'out.p', signal: 'q1', kind: 'output', points: [[188, 160], [188, 172], [650, 172], [650, 160]] },
  ],
}

/** quiz / 課文用的高亮：/4 模式的 critical path */
export const progDivDecodeHighlight: SchematicHighlight = {
  style: 'setup',
  wires: ['w_q0', 'w_bus_dec4', 'w_tc4', 'w_tc', 'w_d1'],
  elements: ['ff0', 'dec4', 'mux', 'clr', 'ff1'],
  tags: [
    { elementOrWire: 'ff0', text: 'launch（edge k）' },
    { elementOrWire: 'ff1', text: 'capture（edge k+1）' },
  ],
}
export const progDivIncHighlight: SchematicHighlight = {
  style: 'setup',
  wires: ['w_q0', 'w_bus_inc', 'w_inc2', 'w_d2'],
  elements: ['ff0', 'inc', 'clr', 'ff2'],
  tags: [{ elementOrWire: 'ff0', text: 'launch' }, { elementOrWire: 'ff2', text: 'capture' }],
}
export const progDivClockHighlight: SchematicHighlight = {
  style: 'info',
  wires: ['w_clk0', 'w_clk1', 'w_clk2'],
  elements: ['clk'],
}
export const progDivSelHighlight: SchematicHighlight = {
  style: 'async',
  wires: ['w_sel', 'w_tc', 'w_d1'],
  elements: ['sel', 'mux', 'clr', 'ff1'],
  tags: [{ elementOrWire: 'sel', text: 'control input' }],
}
export const progDivOutHighlight: SchematicHighlight = {
  style: 'info',
  wires: ['w_out'],
  elements: ['ff1', 'out'],
}

/* ------------------------------------------------------------------ 案例 C：/2 /3 cell 的 MOD path */
/**
 * dualMod23 cell（FF0/FF1、NOR、AND）＋三種 mod 來源（實際電路只會有其中一種）：
 *   (i)  MOD_REG：由 cfg_clk 寫入的靜態 configuration register
 *   (ii) MOD_SYNC：與 divider 同一個 clk 的上游同步 flop
 *   (iii) mod_async：沒有已知 clock 關係的非同步來源
 */
export const dm23ModSchematic: Schematic = {
  width: 800,
  height: 340,
  title: '/2 /3 dual-modulus cell 與三種 mod 來源（擇一）',
  elements: [
    { id: 'cfg_mod', kind: 'port', x: 20, y: 60, text: 'cfg_mod', dir: 'in', description: 'configuration bus 寫入值' },
    { id: 'cfg_clk', kind: 'port', x: 20, y: 92, text: 'cfg_clk', dir: 'in', description: '低速 configuration clock（與 clk 無關）' },
    { id: 'modreg', kind: 'dff', x: 60, y: 40, label: '(i) MOD_REG', edge: 'rising', description: '靜態 register：divider 運作期間不改變' },
    { id: 'mod_in', kind: 'port', x: 20, y: 170, text: 'mod_in', dir: 'in', description: '上游 modulus 控制邏輯的輸出' },
    { id: 'clk2', kind: 'port', x: 20, y: 202, text: 'clk', dir: 'in', description: '與 divider 相同的 clk' },
    { id: 'modsync', kind: 'dff', x: 60, y: 150, label: '(ii) MOD_SYNC', edge: 'rising', description: '同步 flop：每個 clk edge 都可能送出新的 mod' },
    { id: 'modasync', kind: 'port', x: 20, y: 290, text: '(iii) mod_async', dir: 'in', description: '非同步來源：沒有 launch edge 可以參考' },
    { id: 'modj', kind: 'dot', x: 160, y: 240, description: 'mod：三種來源擇一接到 AND' },
    { id: 'clk', kind: 'port', x: 190, y: 130, text: 'clk', dir: 'in', description: 'divider input clock' },
    { id: 'ff0', kind: 'dff', x: 260, y: 40, label: 'FF0', edge: 'rising', signal: 'q0' },
    { id: 'ff1', kind: 'dff', x: 260, y: 180, label: 'FF1', edge: 'rising', signal: 'q1' },
    { id: 'nor', kind: 'nor', x: 440, y: 40, label: 'NOR', description: 'd0 = NOT(q1 OR q0)' },
    { id: 'and', kind: 'and', x: 440, y: 180, label: 'AND', description: 'd1 = q0 AND mod' },
    { id: 'out', kind: 'port', x: 760, y: 30, text: 'div_out', dir: 'out', description: 'div_out = d0（state 00 時為 1）' },
  ],
  wires: [
    { id: 'w_cfg_mod', from: 'cfg_mod.p', to: 'modreg.d', signal: 'cfg_mod', kind: 'control' },
    { id: 'w_cfg_clk', from: 'cfg_clk.p', to: 'modreg.clk', signal: 'cfg_clk', kind: 'clock' },
    { id: 'w_mod_in', from: 'mod_in.p', to: 'modsync.d', signal: 'mod_in', kind: 'control' },
    { id: 'w_clk_sync', from: 'clk2.p', to: 'modsync.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_modreg_q', from: 'modreg.q', to: 'modj.p', kind: 'control', points: [[140, 60], [140, 240]], noArrow: true },
    { id: 'w_modsync_q', from: 'modsync.q', to: 'modj.p', kind: 'control', points: [[140, 170], [140, 240]], noArrow: true },
    { id: 'w_modasync', from: 'modasync.p', to: 'modj.p', kind: 'control', points: [[140, 290], [140, 240]], noArrow: true },
    { id: 'w_mod', from: 'modj.p', to: 'and.in1', signal: 'mod', kind: 'control', points: [[160, 310], [420, 310], [420, 207]], labelAt: 0.45 },
    { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock', points: [[220, 130], [220, 92]] },
    { id: 'w_clk1', from: 'clk.p', to: 'ff1.clk', signal: 'clk', kind: 'clock', points: [[220, 130], [220, 232]] },
    { id: 'w_q0_nor', from: 'ff0.q', to: 'nor.in0', signal: 'q0', kind: 'feedback', points: [[370, 60], [370, 53]] },
    { id: 'w_q1_nor', from: 'ff1.q', to: 'nor.in1', signal: 'q1', kind: 'feedback', points: [[390, 200], [390, 67]] },
    { id: 'w_q0_and', from: 'ff0.q', to: 'and.in0', signal: 'q0', kind: 'feedback', points: [[350, 60], [350, 193]] },
    { id: 'w_d0', from: 'nor.out', to: 'ff0.d', signal: 'd0', kind: 'feedback', points: [[520, 60], [520, 20], [240, 20], [240, 60]], labelAt: 0.5 },
    { id: 'w_d1', from: 'and.out', to: 'ff1.d', signal: 'd1', kind: 'feedback', points: [[520, 200], [520, 280], [240, 280], [240, 200]], labelAt: 0.5 },
    { id: 'w_out', from: 'nor.out', to: 'out.p', signal: 'div_out', kind: 'output', points: [[540, 60], [540, 30]] },
  ],
}

/* ------------------------------------------------------------------ 案例 D：兩級 /2 /3 MMD */
/**
 * mmd2：cell 1（a1 a0，clock = clk）與 cell 2（b1 b0，clock = f1）。
 * f1 = NOR(a1, a0) 既是 cell 1 的 da0，也是 cell 2 的 clock（generated clock）。
 * mod_out2 = NOR(b1, b0) 回頭經 AND(p0) → AND(a0) → da1：跨兩級的 carry path。
 */
export const mmd2Schematic: Schematic = {
  width: 920,
  height: 420,
  title: '兩級 /2 /3 MMD：cell 1（clk）與 cell 2（f1）',
  elements: [
    { id: 'clk', kind: 'port', x: 30, y: 112, text: 'clk', dir: 'in', description: 'input clock（高速）' },
    { id: 'c1ff0', kind: 'dff', x: 110, y: 60, label: 'C1.FF0', edge: 'rising', signal: 'a0' },
    { id: 'c1ff1', kind: 'dff', x: 110, y: 200, label: 'C1.FF1', edge: 'rising', signal: 'a1' },
    { id: 'c1nor', kind: 'nor', x: 250, y: 60, label: 'C1 NOR', description: 'f1 = NOR(a1, a0) = da0；同時是 cell 2 的 clock' },
    { id: 'c1and', kind: 'and', x: 350, y: 200, label: 'C1 AND', description: 'da1 = a0 AND mod1_eff' },
    { id: 'p0', kind: 'port', x: 200, y: 343, text: 'p0', dir: 'in', description: 'modulus bit 0（靜態 programming）' },
    { id: 'c1andp0', kind: 'and', x: 250, y: 330, label: 'C1 AND(p0)', description: 'mod1_eff = p0 AND mod_out2' },
    { id: 'c2ff0', kind: 'dff', x: 560, y: 60, label: 'C2.FF0', edge: 'rising', signal: 'b0', description: 'clock = f1（generated clock）' },
    { id: 'c2ff1', kind: 'dff', x: 560, y: 200, label: 'C2.FF1', edge: 'rising', signal: 'b1', description: 'clock = f1（generated clock）' },
    { id: 'c2nor', kind: 'nor', x: 700, y: 60, label: 'C2 NOR', description: 'mod_out2 = NOR(b1, b0) = db0 = f2' },
    { id: 'c2and', kind: 'and', x: 700, y: 200, label: 'C2 AND', description: 'db1 = b0 AND p1' },
    { id: 'p1', kind: 'port', x: 680, y: 310, text: 'p1', dir: 'in', description: 'modulus bit 1（靜態 programming）' },
    { id: 'out', kind: 'port', x: 890, y: 80, text: 'div_out', dir: 'out', description: 'div_out = f2 = mod_out2' },
  ],
  wires: [
    { id: 'w_clk0', from: 'clk.p', to: 'c1ff0.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_clk1', from: 'clk.p', to: 'c1ff1.clk', signal: 'clk', kind: 'clock', points: [[60, 112], [60, 252]] },
    { id: 'w_a0_nor', from: 'c1ff0.q', to: 'c1nor.in0', signal: 'a0', kind: 'feedback', points: [[212, 80], [212, 73]] },
    { id: 'w_a1_nor', from: 'c1ff1.q', to: 'c1nor.in1', signal: 'a1', kind: 'feedback', points: [[222, 220], [222, 87]] },
    { id: 'w_f1_da0', from: 'c1nor.out', to: 'c1ff0.d', signal: 'f1', kind: 'feedback', points: [[330, 80], [330, 30], [90, 30], [90, 80]], labelAt: 0.5 },
    { id: 'w_f1_c2clk0', from: 'c1nor.out', to: 'c2ff0.clk', signal: 'f1', kind: 'clock', points: [[330, 80], [330, 150], [530, 150], [530, 112]], labelAt: 0.55 },
    { id: 'w_f1_c2clk1', from: 'c1nor.out', to: 'c2ff1.clk', kind: 'clock', points: [[330, 80], [330, 150], [530, 150], [530, 252]] },
    { id: 'w_a0_and', from: 'c1ff0.q', to: 'c1and.in0', signal: 'a0', kind: 'feedback', points: [[190, 80], [190, 180], [330, 180], [330, 213]] },
    { id: 'w_p0', from: 'p0.p', to: 'c1andp0.in0', signal: 'p0', kind: 'control' },
    { id: 'w_mo2_andp0', from: 'c2nor.out', to: 'c1andp0.in1', signal: 'mod_out2', kind: 'feedback', points: [[780, 80], [780, 390], [230, 390], [230, 357]], labelAt: 0.5 },
    { id: 'w_mod1eff', from: 'c1andp0.out', to: 'c1and.in1', signal: 'mod1_eff', kind: 'data', points: [[320, 350], [320, 227]] },
    { id: 'w_da1', from: 'c1and.out', to: 'c1ff1.d', signal: 'da1', kind: 'feedback', points: [[420, 220], [420, 290], [90, 290], [90, 220]], labelAt: 0.5 },
    { id: 'w_b0_nor', from: 'c2ff0.q', to: 'c2nor.in0', signal: 'b0', kind: 'feedback', points: [[662, 80], [662, 73]] },
    { id: 'w_b1_nor', from: 'c2ff1.q', to: 'c2nor.in1', signal: 'b1', kind: 'feedback', points: [[672, 220], [672, 87]] },
    { id: 'w_mo2_db0', from: 'c2nor.out', to: 'c2ff0.d', signal: 'mod_out2', kind: 'feedback', points: [[780, 80], [780, 30], [540, 30], [540, 80]], labelAt: 0.5 },
    { id: 'w_b0_and', from: 'c2ff0.q', to: 'c2and.in0', signal: 'b0', kind: 'feedback', points: [[640, 80], [640, 180], [680, 180], [680, 213]] },
    { id: 'w_p1', from: 'p1.p', to: 'c2and.in1', signal: 'p1', kind: 'control', points: [[690, 310], [690, 227]] },
    { id: 'w_db1', from: 'c2and.out', to: 'c2ff1.d', signal: 'db1', kind: 'feedback', points: [[770, 220], [770, 290], [540, 290], [540, 220]], labelAt: 0.5 },
    { id: 'w_out', from: 'c2nor.out', to: 'out.p', signal: 'div_out', kind: 'output' },
  ],
}

/**
 * 跨級 carry path：cell 1 的 a0 → NOR(f1) → cell 2 的 state flop → C2 NOR(mod_out2) → AND(p0) → AND → C1.FF1.D。
 * cell 2 的 launch flop 兩顆都要高亮：mod_out2 = NOR(b1, b0) 在「進入 state 00」那一拍升起，
 * p1 = 1（cell 2 走 /3，10 → 00）時是 b1 落下、p1 = 0（走 /2，01 → 00）時是 b0 落下。
 */
export const mmdCarryHighlight: SchematicHighlight = {
  style: 'setup',
  wires: ['w_a0_nor', 'w_f1_c2clk0', 'w_f1_c2clk1', 'w_b0_nor', 'w_b1_nor', 'w_mo2_andp0', 'w_mod1eff', 'w_da1'],
  elements: ['c1ff0', 'c1nor', 'c2ff0', 'c2ff1', 'c2nor', 'c1andp0', 'c1and', 'c1ff1'],
  tags: [
    { elementOrWire: 'c1ff0', text: 'launch（clk edge k）' },
    { elementOrWire: 'c2ff1', text: 'cell 2 的 launch flop：p1 = 1 → b1、p1 = 0 → b0' },
    { elementOrWire: 'c1ff1', text: 'capture（clk edge k+2）' },
  ],
}
export const mmdLocalHighlight: SchematicHighlight = {
  style: 'setup',
  wires: ['w_a0_nor', 'w_f1_da0'],
  elements: ['c1ff0', 'c1nor'],
  tags: [{ elementOrWire: 'c1ff0', text: 'launch = capture' }],
}
export const mmdRippleClockHighlight: SchematicHighlight = {
  style: 'info',
  wires: ['w_clk0', 'w_f1_c2clk0', 'w_f1_c2clk1'],
  elements: ['clk', 'c1nor'],
}
export const mmdOutputHighlight: SchematicHighlight = {
  style: 'info',
  wires: ['w_out'],
  elements: ['c2nor', 'out'],
}

/* ------------------------------------------------------------------ 案例 E：PMUX select path */
const PH_N = 8
const phPins = Array.from({ length: PH_N }, (_, i) => ({ name: `ph${i}`, side: 'right' as const, pos: (i + 1) / (PH_N + 1), label: `ph${i}` }))

export const pmuxSchematic: Schematic = {
  width: 760,
  height: 300,
  title: 'Phase-MUX divider：phase control → decode → 8:1 MUX select',
  elements: [
    { id: 'vco', kind: 'box', x: 40, y: 40, w: 90, h: 170, text: '8-phase\nVCO', description: '八個相位，間距 Tvco/8', pins: phPins },
    { id: 'mux', kind: 'mux8', x: 220, y: 40, label: '8:1 PMUX', description: '依 phase_sel 選一個相位當作 divider 的 clock' },
    { id: 'div', kind: 'box', x: 340, y: 95, w: 100, h: 60, text: '/N counter', edge: 'rising', description: '用被選中的相位當 clock 的 /N divider', pins: [{ name: 'clk', side: 'left', pos: 0.5, label: 'clk' }, { name: 'out', side: 'right', pos: 0.5, label: 'div_out' }] },
    { id: 'out', kind: 'port', x: 720, y: 125, text: 'div_out', dir: 'out' },
    {
      id: 'ctrl',
      kind: 'box',
      x: 560,
      y: 200,
      w: 140,
      h: 60,
      text: 'Phase control FSM\n(phase_sel reg)',
      edge: 'rising',
      description: '由 div_out 觸發的 FSM：每個 output 週期決定下一個 phase_sel',
      pins: [{ name: 'clk', side: 'left', pos: 0.3, label: 'clk' }, { name: 'phase_sel', side: 'left', pos: 0.8, label: 'phase_sel[2:0]' }],
    },
    { id: 'dec', kind: 'box', x: 330, y: 230, w: 100, h: 40, text: '3→8 decode', description: 'phase_sel[2:0] → one-hot select', pins: [{ name: 'in', side: 'right', pos: 0.45, label: 'in' }, { name: 'out', side: 'left', pos: 0.45, label: 'one-hot' }] },
  ],
  wires: [
    ...Array.from({ length: PH_N }, (_, i) => ({ id: `w_ph${i}`, from: `vco.ph${i}`, to: `mux.in${i}`, kind: 'clock' as const, noArrow: i !== 0 })),
    { id: 'w_mux_out', from: 'mux.out', to: 'div.clk', signal: 'sel_phase', kind: 'clock', labelAt: 0.5 },
    { id: 'w_div_out', from: 'div.out', to: 'out.p', signal: 'div_out', kind: 'output' },
    { id: 'w_div_ctrl', from: 'div.out', to: 'ctrl.clk', kind: 'clock', points: [[500, 125], [500, 218]] },
    { id: 'w_phase_sel', from: 'ctrl.phase_sel', to: 'dec.in', signal: 'phase_sel', kind: 'control' },
    { id: 'w_dec_sel', from: 'dec.out', to: 'mux.sel', signal: 'sel_onehot', kind: 'control', points: [[240, 248]] },
  ],
}

export const pmuxSelHighlight: SchematicHighlight = {
  style: 'async',
  wires: ['w_phase_sel', 'w_dec_sel'],
  elements: ['ctrl', 'dec', 'mux'],
  tags: [{ elementOrWire: 'ctrl', text: 'launch（div_out edge）' }, { elementOrWire: 'mux', text: 'select 必須在 safe window 內穩定' }],
}
export const pmuxClockHighlight: SchematicHighlight = {
  style: 'info',
  wires: ['w_ph0', 'w_mux_out'],
  elements: ['vco', 'mux', 'div'],
}

/* ------------------------------------------------------------------ 案例 F：divider → downstream DSM */
/**
 * FF_a → core logic → FF_b：divider 內部（clk_in domain）
 * FF_b → out buffer → div_out：generated clock（給 FF_last、DSM_REG 當 clock）
 * FF_last → DSM_REG：interface path（同一個 divided clock）
 * DSM_REG → DSM comb → mod → core logic → FF_b：control loop（multicycle）
 * div_out → DSM comb（虛線）：若沒有 DSM_REG，純 combinational feedback
 */
export const downstreamSchematic: Schematic = {
  width: 900,
  height: 400,
  title: 'Divider 輸出接到 downstream DSM / control logic',
  elements: [
    { id: 'clk_in', kind: 'port', x: 30, y: 92, text: 'clk_in', dir: 'in', description: '高速 input clock（週期 Tin）' },
    { id: 'ffa', kind: 'dff', x: 100, y: 40, label: 'FF_a (core)', edge: 'rising', description: 'divider 內部 flop（clk_in domain）' },
    { id: 'core', kind: 'nor', x: 220, y: 40, label: 'core logic', description: 'divider next-state logic，其中一個輸入是 modulus 控制 mod' },
    { id: 'ffb', kind: 'dff', x: 320, y: 40, label: 'FF_b (core)', edge: 'rising', description: 'divider 內部最後一級 flop（clk_in domain）；Q 經 buffer 成為 div_out' },
    { id: 'obuf', kind: 'buf', x: 460, y: 48, label: 'out decode / buffer', description: 'div_out 的 decode 與 clock buffer：generated clock 的 source latency' },
    { id: 'out', kind: 'port', x: 880, y: 60, text: 'div_out', dir: 'out', description: '週期 N·Tin 的 divided clock' },
    { id: 'fflast', kind: 'dff', x: 560, y: 150, label: 'FF_last (clk = div_out)', edge: 'rising', description: 'divider 送給 downstream 的狀態 / carry bit，由 div_out 重新取樣' },
    { id: 'dsmreg', kind: 'dff', x: 700, y: 150, label: 'DSM_REG (clk = div_out)', edge: 'rising', description: 'DSM / control logic 的輸入 register，clock 同樣是 div_out' },
    {
      id: 'dsm',
      kind: 'box',
      x: 700,
      y: 280,
      w: 130,
      h: 60,
      text: 'DSM / N calc\n(comb logic)',
      description: '算出下一個 N（或 modulus word）的組合邏輯',
      pins: [
        { name: 'in', side: 'left', pos: 0.5, label: 'in' },
        { name: 'in_comb', side: 'left', pos: 0.85, label: '(no reg)' },
        { name: 'mod', side: 'right', pos: 0.5, label: 'mod / N' },
      ],
    },
  ],
  wires: [
    { id: 'w_clk_a', from: 'clk_in.p', to: 'ffa.clk', signal: 'clk_in', kind: 'clock' },
    { id: 'w_clk_b', from: 'clk_in.p', to: 'ffb.clk', kind: 'clock', points: [[50, 92], [50, 120], [300, 120], [300, 92]] },
    { id: 'w_qa', from: 'ffa.q', to: 'core.in0', signal: 'q_a', kind: 'data' },
    { id: 'w_core_d', from: 'core.out', to: 'ffb.d', signal: 'd_b', kind: 'data' },
    { id: 'w_qb_fb', from: 'ffb.q', to: 'ffa.d', signal: 'q_b', kind: 'feedback', points: [[400, 60], [400, 20], [80, 20], [80, 60]], labelAt: 0.5 },
    { id: 'w_qb_obuf', from: 'ffb.q', to: 'obuf.in0', kind: 'data' },
    { id: 'w_divout', from: 'obuf.out', to: 'out.p', signal: 'div_out', kind: 'output' },
    { id: 'w_status', from: 'ffb.q', to: 'fflast.d', signal: 'status', kind: 'data', points: [[420, 60], [420, 170]] },
    { id: 'w_gclk_last', from: 'obuf.out', to: 'fflast.clk', kind: 'clock', points: [[520, 60], [520, 202]] },
    { id: 'w_gclk_dsm', from: 'obuf.out', to: 'dsmreg.clk', kind: 'clock', points: [[520, 60], [520, 240], [690, 240], [690, 202]] },
    { id: 'w_iface', from: 'fflast.q', to: 'dsmreg.d', signal: 'status_q', kind: 'data' },
    { id: 'w_dsm_in', from: 'dsmreg.q', to: 'dsm.in', signal: 'n_in', kind: 'data', points: [[790, 170], [790, 260], [680, 260], [680, 310]] },
    { id: 'w_mod', from: 'dsm.mod', to: 'core.in1', signal: 'mod', kind: 'control', points: [[860, 310], [860, 370], [200, 370], [200, 67]], labelAt: 0.5 },
    { id: 'w_comb_fb', from: 'obuf.out', to: 'dsm.in_comb', kind: 'control', points: [[508, 60], [508, 331]], label: '若無 DSM_REG：直接接回' },
  ],
}

export const downstreamInternalHighlight: SchematicHighlight = {
  style: 'setup',
  wires: ['w_qa', 'w_core_d'],
  elements: ['ffa', 'core', 'ffb'],
  tags: [{ elementOrWire: 'ffa', text: 'launch' }, { elementOrWire: 'ffb', text: 'capture' }],
}
export const downstreamIfaceHighlight: SchematicHighlight = {
  style: 'setup',
  wires: ['w_iface'],
  elements: ['fflast', 'dsmreg'],
  tags: [{ elementOrWire: 'fflast', text: 'launch（div_out edge）' }, { elementOrWire: 'dsmreg', text: 'capture（下一個 div_out edge）' }],
}
export const downstreamLoopHighlight: SchematicHighlight = {
  style: 'setup',
  wires: ['w_dsm_in', 'w_mod', 'w_core_d'],
  elements: ['dsmreg', 'dsm', 'core', 'ffb'],
  tags: [{ elementOrWire: 'dsmreg', text: 'launch（div_out edge）' }, { elementOrWire: 'ffb', text: 'capture（N 個 clk_in edge 後）' }],
}
export const downstreamGenClkHighlight: SchematicHighlight = {
  style: 'info',
  wires: ['w_qb_obuf', 'w_gclk_last', 'w_gclk_dsm'],
  elements: ['ffb', 'obuf'],
}

/* ------------------------------------------------------------------ 案例 B 練習：decode 換成 /5 /7 */
/**
 * 與 progDivSchematic 同一張圖，只把兩個 decode box 改名為 DEC5（=100）/ DEC7（=110），
 * 輸出改取 q2（/7 時 q1 一個週期內會 rising 兩次，不能當 div_out）。
 */
export const progDiv57Schematic: Schematic = {
  ...progDivSchematic,
  title: 'Programmable /5 /7：decode 改為 =100 / =110，輸出取 q2',
  elements: progDivSchematic.elements.map((e) => {
    if (e.id === 'dec4') return { ...e, text: 'DEC5\n(=100)', description: 'tc5 = q2 AND NOT q1 AND NOT q0：兩個反相輸入，多一級 inverter，delay 14 → 18 ps', pins: e.pins?.map((p) => (p.name === 'tc4' ? { ...p, label: 'tc5' } : p)) }
    if (e.id === 'dec6') return { ...e, text: 'DEC7\n(=110)', description: 'tc7 = q2 AND q1 AND NOT q0：一個反相輸入，delay 14 ps', pins: e.pins?.map((p) => (p.name === 'tc6' ? { ...p, label: 'tc7' } : p)) }
    if (e.id === 'sel') return { ...e, description: 'sel=0：/5；sel=1：/7' }
    if (e.id === 'out') return { ...e, description: 'div_out = q2' }
    return e
  }),
  wires: progDivSchematic.wires.map((w) => {
    if (w.id === 'w_tc4') return { ...w, signal: 'tc5' }
    if (w.id === 'w_tc6') return { ...w, signal: 'tc7' }
    if (w.id === 'w_out') return { ...w, from: 'ff2.q', signal: 'q2', points: [[188, 260], [188, 165], [650, 165], [650, 160]] as [number, number][] }
    return w
  }),
}

/* ------------------------------------------------------------------ Lesson 7-4：latch-based clock gating cell */
/**
 * clockGateLatch netlist 的電路圖：
 *   en → EN latch（clk = 0 時 transparent）→ en_l → AND(clk) → gclk → FF0（/2）
 * 三種 timing check 都在這張圖上：
 *   setup / hold：FF0.Q → INV → FF0.D（clock = gclk）；en → latch（clock = clk）
 *   pulse width：gclk 的 high pulse 不可比 FF0 的最小 pulse width 窄
 */
export const clockGateLatchSchematic: Schematic = {
  width: 640,
  height: 230,
  title: 'Latch-based clock gating cell + /2',
  elements: [
    { id: 'clk', kind: 'port', x: 30, y: 53, text: 'clk', dir: 'in', description: 'free-running input clock' },
    { id: 'en', kind: 'port', x: 30, y: 150, text: 'en', dir: 'in', description: '上游 flop 在 clk rising edge 送出的 enable（可能在 clk = 1 期間改變）' },
    { id: 'latch', kind: 'latch', x: 120, y: 118, label: 'EN latch', signal: 'en_l', negEdge: true, description: 'clk = 0 時 transparent（en_l 跟隨 en）；clk = 1 時保持。en_l 只會在 clk = 0 期間改變' },
    { id: 'and', kind: 'and', x: 280, y: 40, label: 'AND', description: 'gclk = clk AND en_l' },
    { id: 'ff0', kind: 'dff', x: 400, y: 40, label: 'FF0', edge: 'rising', signal: 'q0', description: 'clock = gclk 的 /2' },
    { id: 'inv', kind: 'inv', x: 520, y: 118, label: 'INV', description: 'd0 = NOT q0' },
    { id: 'out', kind: 'port', x: 620, y: 60, text: 'div_out', dir: 'out', description: 'div_out = q0' },
  ],
  wires: [
    { id: 'w_clk_and', from: 'clk.p', to: 'and.in0', signal: 'clk', kind: 'clock' },
    { id: 'w_clk_latch', from: 'clk.p', to: 'latch.en', kind: 'clock', points: [[60, 53], [60, 170]] },
    { id: 'w_en', from: 'en.p', to: 'latch.d', signal: 'en', kind: 'control', points: [[90, 150], [90, 138]] },
    { id: 'w_enl', from: 'latch.q', to: 'and.in1', signal: 'en_l', kind: 'control', points: [[230, 138], [230, 67]], labelAt: 0.5 },
    { id: 'w_gclk', from: 'and.out', to: 'ff0.clk', signal: 'gclk', kind: 'clock', points: [[370, 60], [370, 92]], labelAt: 0.4 },
    { id: 'w_q', from: 'ff0.q', to: 'out.p', signal: 'q0', kind: 'output' },
    { id: 'w_q_inv', from: 'ff0.q', to: 'inv.in0', signal: 'q0', kind: 'feedback', points: [[490, 60], [490, 130]] },
    { id: 'w_d', from: 'inv.out', to: 'ff0.d', signal: 'd0', kind: 'feedback', points: [[585, 130], [585, 195], [380, 195], [380, 60]], labelAt: 0.5 },
  ],
}

export const cgEnPathHighlight: SchematicHighlight = {
  style: 'setup',
  wires: ['w_en'],
  elements: ['en', 'latch'],
  tags: [{ elementOrWire: 'en', text: 'launch（clk edge k，上游 flop）' }, { elementOrWire: 'latch', text: 'capture（latch 在 clk edge k+1 關閉）' }],
}
export const cgGclkHighlight: SchematicHighlight = {
  style: 'info',
  wires: ['w_clk_and', 'w_enl', 'w_gclk'],
  elements: ['and'],
  tags: [{ elementOrWire: 'and', text: 'gclk 的 pulse width 由這裡決定' }],
}
export const cgStatePathHighlight: SchematicHighlight = {
  style: 'setup',
  wires: ['w_q_inv', 'w_d'],
  elements: ['inv', 'ff0'],
  tags: [{ elementOrWire: 'ff0', text: 'launch = capture（gclk）' }],
}
