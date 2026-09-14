import type { SchElement, SchWire, Schematic, SchematicHighlight } from '@/components/circuit/schematic'

/** mux8 的 in_i pin y 座標（mux 高 170） */
function muxPinY(muxY: number, i: number) {
  return muxY + (170 * (i + 1)) / 9
}

/** 產生 8 個 phase port + mux8 元件與連線 */
function phaseMuxBlock(portX: number, muxX: number, muxY: number, muxId = 'mux'): { elements: SchElement[]; wires: SchWire[] } {
  const elements: SchElement[] = []
  const wires: SchWire[] = []
  for (let i = 0; i < 8; i++) {
    elements.push({ id: `ph${i}`, kind: 'port', x: portX, y: muxPinY(muxY, i), text: `ph${i}`, dir: 'in', description: `VCO phase ${i}：rising edge 在 k·T + ${i}/8·T` })
    wires.push({ id: `w_ph${i}`, from: `ph${i}.p`, to: `${muxId}.in${i}`, signal: `ph${i}`, kind: 'clock', noArrow: true })
  }
  elements.push({ id: muxId, kind: 'mux8', x: muxX, y: muxY, label: 'PMUX', description: '8:1 phase MUX：sel 決定哪一個 phase 成為 pclk' })
  return { elements, wires }
}

// ---------------------------------------------------------------- Lesson 5-1：PMUX → /4
const pm1 = phaseMuxBlock(50, 120, 30)
export const pmuxDiv4Schematic: Schematic = {
  width: 700,
  height: 300,
  title: 'PMUX（8:1）→ 同步 /4',
  elements: [
    ...pm1.elements,
    { id: 'sel', kind: 'port', x: 140, y: 245, text: 's2 s1 s0', dir: 'in', description: 'phase select（3 bit）' },
    { id: 'ff0', kind: 'dff', x: 250, y: 40, label: 'FF0', edge: 'rising', signal: 'q0', description: '/4 LSB，clock = pclk' },
    { id: 'inv', kind: 'inv', x: 330, y: 150, label: 'INV', description: 'd0 = NOT q0' },
    { id: 'ff1', kind: 'dff', x: 470, y: 40, label: 'FF1', edge: 'rising', signal: 'q1', description: '/4 MSB = div_out' },
    { id: 'xor', kind: 'xor', x: 560, y: 150, label: 'XOR', description: 'd1 = q1 XOR q0' },
    { id: 'out', kind: 'port', x: 680, y: 60, text: 'div_out', dir: 'out', description: 'div_out = q1' },
  ],
  wires: [
    ...pm1.wires,
    { id: 'w_sel', from: 'sel.p', to: 'mux.sel', kind: 'control', route: 'direct', label: 'sel' },
    { id: 'w_pclk0', from: 'mux.out', to: 'ff0.clk', signal: 'pclk', kind: 'clock', points: [[190, 115], [190, 92]] },
    { id: 'w_pclk1', from: 'mux.out', to: 'ff1.clk', signal: 'pclk', kind: 'clock', points: [[190, 115], [190, 20], [450, 20], [450, 92]], labelAt: 0.5 },
    { id: 'w_q0_inv', from: 'ff0.q', to: 'inv.in0', signal: 'q0', kind: 'feedback', points: [[322, 60], [322, 162]] },
    { id: 'w_d0', from: 'inv.out', to: 'ff0.d', signal: 'd0', kind: 'feedback', points: [[380, 162], [380, 235], [232, 235], [232, 60]], labelAt: 0.6 },
    { id: 'w_q0_xor', from: 'ff0.q', to: 'xor.in1', signal: 'q0', kind: 'data', points: [[322, 60], [322, 120], [548, 120], [548, 177]], noArrow: true },
    { id: 'w_q1_xor', from: 'ff1.q', to: 'xor.in0', signal: 'q1', kind: 'feedback', points: [[640, 60], [640, 130], [552, 130], [552, 163]] },
    { id: 'w_d1', from: 'xor.out', to: 'ff1.d', signal: 'd1', kind: 'feedback', points: [[624, 170], [624, 235], [456, 235], [456, 60]], labelAt: 0.6 },
    { id: 'w_out', from: 'ff1.q', to: 'out.p', signal: 'div_out', kind: 'output' },
  ],
}

// ---------------------------------------------------------------- Lesson 5-2 / 5-3：PMUX → /2 /3 cell
const pm2 = phaseMuxBlock(50, 120, 30)
export const pmuxDm23Schematic: Schematic = {
  width: 700,
  height: 320,
  title: 'PMUX（8:1）→ /2 /3 dual-modulus cell',
  elements: [
    ...pm2.elements,
    { id: 'sel', kind: 'port', x: 140, y: 245, text: 's2 s1 s0', dir: 'in', description: 'phase select（3 bit）' },
    { id: 'ff0', kind: 'dff', x: 250, y: 40, label: 'FF0', edge: 'rising', signal: 'q0', description: 'cell state bit 0，clock = pclk' },
    { id: 'nor', kind: 'nor', x: 330, y: 150, label: 'NOR', description: 'd0 = NOT(q1 OR q0)；也是 div_out' },
    { id: 'ff1', kind: 'dff', x: 470, y: 40, label: 'FF1', edge: 'rising', signal: 'q1', description: 'cell state bit 1' },
    { id: 'and', kind: 'and', x: 560, y: 150, label: 'AND', description: 'd1 = q0 AND mod' },
    { id: 'mod', kind: 'port', x: 548, y: 260, text: 'mod', dir: 'in', description: 'mod=0：/2；mod=1：/3' },
    { id: 'out', kind: 'port', x: 400, y: 290, text: 'div_out', dir: 'out', description: 'div_out = NOR 輸出（state 00 時為 1）' },
  ],
  wires: [
    ...pm2.wires,
    { id: 'w_sel', from: 'sel.p', to: 'mux.sel', kind: 'control', route: 'direct', label: 'sel' },
    { id: 'w_pclk0', from: 'mux.out', to: 'ff0.clk', signal: 'pclk', kind: 'clock', points: [[190, 115], [190, 92]] },
    { id: 'w_pclk1', from: 'mux.out', to: 'ff1.clk', signal: 'pclk', kind: 'clock', points: [[190, 115], [190, 20], [450, 20], [450, 92]], labelAt: 0.5 },
    { id: 'w_q0_nor', from: 'ff0.q', to: 'nor.in0', signal: 'q0', kind: 'feedback', points: [[316, 60], [316, 163]] },
    { id: 'w_q1_nor', from: 'ff1.q', to: 'nor.in1', signal: 'q1', kind: 'feedback', points: [[546, 60], [546, 118], [322, 118], [322, 177]] },
    { id: 'w_q0_and', from: 'ff0.q', to: 'and.in0', signal: 'q0', kind: 'data', points: [[316, 60], [316, 35], [555, 35], [555, 163]], noArrow: true },
    { id: 'w_mod', from: 'mod.p', to: 'and.in1', signal: 'mod', kind: 'control', points: [[548, 260], [548, 177]] },
    { id: 'w_d0', from: 'nor.out', to: 'ff0.d', signal: 'd0', kind: 'feedback', points: [[400, 170], [400, 225], [232, 225], [232, 60]], labelAt: 0.6 },
    { id: 'w_d1', from: 'and.out', to: 'ff1.d', signal: 'd1', kind: 'feedback', points: [[624, 170], [624, 225], [456, 225], [456, 60]], labelAt: 0.6 },
    { id: 'w_out', from: 'nor.out', to: 'out.p', signal: 'div_out', kind: 'output', points: [[400, 170], [400, 290]] },
  ],
}

// ---------------------------------------------------------------- Lesson 5-2：控制路徑（FSM → decode → PMUX → downstream divider）
const pm3 = phaseMuxBlock(250, 300, 30)
export const pmuxCtrlSchematic: Schematic = {
  width: 660,
  height: 330,
  title: 'phase_sel（FSM）→ decode → PMUX select → pmux_out → divider',
  elements: [
    ...pm3.elements,
    { id: 'next', kind: 'port', x: 20, y: 220, text: 'next_sel', dir: 'in', description: 'FSM 算出的下一個 phase index' },
    { id: 'ffsel', kind: 'dff', x: 60, y: 200, label: 'phase_sel', edge: 'rising', description: 'FSM 的 phase_sel register，clock = div_out' },
    { id: 'dec', kind: 'box', x: 170, y: 205, w: 80, h: 40, text: 'decode', pins: [{ name: 'in', side: 'left', pos: 0.5 }, { name: 'out', side: 'right', pos: 0.5 }], description: '3 → 8 decode（或直接 3-bit select tree）' },
    { id: 'div', kind: 'box', x: 430, y: 90, w: 100, h: 50, text: 'divider', pins: [{ name: 'clk', side: 'left', pos: 0.5 }, { name: 'out', side: 'right', pos: 0.5 }], description: 'downstream divider：把 pmux_out 當 clock' },
    { id: 'out', kind: 'port', x: 620, y: 115, text: 'div_out', dir: 'out', description: 'divider 輸出，也是 FSM 的 clock' },
  ],
  wires: [
    ...pm3.wires,
    { id: 'w_next', from: 'next.p', to: 'ffsel.d', kind: 'control', signal: 'next_sel' },
    { id: 'w_q', from: 'ffsel.q', to: 'dec.in', kind: 'control', signal: 'phase_sel', points: [[150, 220], [150, 225]] },
    { id: 'w_dec', from: 'dec.out', to: 'mux.sel', kind: 'control', signal: 'sel[7:0]', points: [[320, 225]] },
    { id: 'w_pclk', from: 'mux.out', to: 'div.clk', signal: 'pmux_out', kind: 'clock', points: [[400, 115]] },
    { id: 'w_out', from: 'div.out', to: 'out.p', signal: 'div_out', kind: 'output' },
    { id: 'w_fb', from: 'out.p', to: 'ffsel.clk', signal: 'div_out', kind: 'clock', points: [[620, 300], [40, 300], [40, 252]] },
  ],
}

// ---------------------------------------------------------------- Lesson 5-2：glitch-free MUX（兩個 source 的版本）
export const glitchFreeMuxSchematic: Schematic = {
  width: 700,
  height: 320,
  title: 'Glitch-free clock MUX：enable 在各自 clock 的 falling edge 重同步',
  elements: [
    { id: 'clkfsm', kind: 'port', x: 20, y: 292, text: 'div_out', dir: 'in', description: 'FSM clock（divider 輸出）' },
    { id: 'ffsel', kind: 'dff', x: 60, y: 240, label: 'phase_sel', edge: 'rising', description: 'FSM 的 select register' },
    { id: 'ctl', kind: 'box', x: 160, y: 120, w: 70, h: 70, text: 'sel logic', pins: [{ name: 'sel', side: 'left', pos: 0.5 }, { name: 'da', side: 'right', pos: 0.25 }, { name: 'db', side: 'right', pos: 0.75 }, { name: 'ena', side: 'top', pos: 0.5 }, { name: 'enb', side: 'bottom', pos: 0.5 }], description: 'd_a = NOT sel AND NOT en_b；d_b = sel AND NOT en_a' },
    { id: 'pha', kind: 'port', x: 300, y: 30, text: 'ph_a', dir: 'in', description: '舊 phase' },
    { id: 'phb', kind: 'port', x: 300, y: 200, text: 'ph_b', dir: 'in', description: '新 phase' },
    { id: 'ffa', kind: 'dff', x: 330, y: 50, label: 'EN_a', edge: 'falling', negEdge: true, description: 'en_a 在 ph_a 的 falling edge 取樣' },
    { id: 'ffb', kind: 'dff', x: 330, y: 220, label: 'EN_b', edge: 'falling', negEdge: true, description: 'en_b 在 ph_b 的 falling edge 取樣' },
    { id: 'anda', kind: 'and', x: 460, y: 30, label: 'AND', description: 'ph_a AND en_a' },
    { id: 'andb', kind: 'and', x: 460, y: 200, label: 'AND', description: 'ph_b AND en_b' },
    { id: 'or', kind: 'or', x: 560, y: 115, label: 'OR', description: 'pmux_out = (ph_a·en_a) OR (ph_b·en_b)' },
    { id: 'out', kind: 'port', x: 680, y: 135, text: 'pmux_out', dir: 'out' },
  ],
  wires: [
    { id: 'w_clkfsm', from: 'clkfsm.p', to: 'ffsel.clk', kind: 'clock', signal: 'div_out' },
    { id: 'w_sel', from: 'ffsel.q', to: 'ctl.sel', kind: 'control', signal: 'sel', points: [[140, 260], [140, 155]] },
    { id: 'w_da', from: 'ctl.da', to: 'ffa.d', kind: 'control', signal: 'd_a', points: [[250, 137.5], [250, 70]] },
    { id: 'w_db', from: 'ctl.db', to: 'ffb.d', kind: 'control', signal: 'd_b', points: [[250, 172.5], [250, 240]] },
    { id: 'w_pha_clk', from: 'pha.p', to: 'ffa.clk', kind: 'clock', signal: 'ph_a', points: [[315, 30], [315, 102]] },
    { id: 'w_phb_clk', from: 'phb.p', to: 'ffb.clk', kind: 'clock', signal: 'ph_b', points: [[315, 200], [315, 272]] },
    { id: 'w_pha_and', from: 'pha.p', to: 'anda.in0', kind: 'clock', signal: 'ph_a', points: [[440, 30], [440, 43]] },
    { id: 'w_phb_and', from: 'phb.p', to: 'andb.in0', kind: 'clock', signal: 'ph_b', points: [[440, 200], [440, 213]] },
    { id: 'w_ena', from: 'ffa.q', to: 'anda.in1', kind: 'control', signal: 'en_a', points: [[420, 70], [420, 57]] },
    { id: 'w_enb', from: 'ffb.q', to: 'andb.in1', kind: 'control', signal: 'en_b', points: [[420, 240], [420, 227]] },
    { id: 'w_ena_fb', from: 'ffa.q', to: 'ctl.ena', kind: 'feedback', signal: 'en_a', points: [[410, 70], [410, 12], [195, 12]] },
    { id: 'w_enb_fb', from: 'ffb.q', to: 'ctl.enb', kind: 'feedback', signal: 'en_b', points: [[410, 240], [410, 305], [195, 305]] },
    { id: 'w_a_or', from: 'anda.out', to: 'or.in0', kind: 'clock', signal: 'ph_a·en_a' },
    { id: 'w_b_or', from: 'andb.out', to: 'or.in1', kind: 'clock', signal: 'ph_b·en_b' },
    { id: 'w_out', from: 'or.out', to: 'out.p', kind: 'output', signal: 'pmux_out' },
  ],
}

export const glitchFreeHalfCycleHighlight: SchematicHighlight = {
  style: 'setup',
  wires: ['w_sel', 'w_da', 'w_db'],
  elements: ['ffsel', 'ctl', 'ffa', 'ffb'],
  tags: [
    { elementOrWire: 'ffsel', text: 'launch（↑ div_out）' },
    { elementOrWire: 'ffa', text: 'capture（↓ ph_a）：半週期' },
  ],
}

// ---------------------------------------------------------------- Lesson 5-3：三種架構 block diagram
const box = (id: string, x: number, y: number, text: string, pins: SchElement['pins'], w = 110, h = 56, description?: string): SchElement => ({ id, kind: 'box', x, y, w, h, text, pins, description })
const lr = [{ name: 'in', side: 'left' as const, pos: 0.5 }, { name: 'out', side: 'right' as const, pos: 0.5 }]
const lrb = [...lr, { name: 'ctl', side: 'bottom' as const, pos: 0.5 }]

/** 架構 1：PMUX → fixed /N */
export const arch1Schematic: Schematic = {
  width: 620,
  height: 230,
  title: '架構 1：8-phase VCO → PMUX → fixed /N',
  elements: [
    box('vco', 20, 40, '8-phase VCO', lr, 100, 56, '輸出 8 個相位 ph0..ph7，頻率 fVCO'),
    box('pmux', 170, 40, 'PMUX 8:1', lrb, 100, 56, '在 fVCO 工作；select 來自 FSM'),
    box('div', 320, 40, '/N（fixed）', lr, 100, 56, '固定除數，整數 N'),
    { id: 'out', kind: 'port', x: 590, y: 68, text: 'div_out', dir: 'out' },
    box('fsm', 170, 150, 'phase FSM', [{ name: 'clk', side: 'right', pos: 0.5 }, { name: 'sel', side: 'top', pos: 0.5 }], 100, 50, '每個 output 週期決定下一個 phase index；clock = div_out'),
  ],
  wires: [
    { id: 'w_ph', from: 'vco.out', to: 'pmux.in', kind: 'clock', signal: 'ph0..7', label: '8 phases' },
    { id: 'w_pclk', from: 'pmux.out', to: 'div.in', kind: 'clock', signal: 'pclk' },
    { id: 'w_out', from: 'div.out', to: 'out.p', kind: 'output', signal: 'div_out' },
    { id: 'w_sel', from: 'fsm.sel', to: 'pmux.ctl', kind: 'control', signal: 'phase_sel', route: 'direct' },
    { id: 'w_fb', from: 'out.p', to: 'fsm.clk', kind: 'clock', signal: 'div_out', points: [[560, 68], [560, 175]] },
  ],
}

/** 架構 2：PMUX → /N/N+1 */
export const arch2Schematic: Schematic = {
  width: 620,
  height: 230,
  title: '架構 2：8-phase VCO → PMUX → /N/N+1',
  elements: [
    box('vco', 20, 40, '8-phase VCO', lr, 100, 56, '輸出 8 個相位 ph0..ph7'),
    box('pmux', 170, 40, 'PMUX 8:1', lrb, 100, 56, '在 fVCO 工作'),
    box('div', 320, 40, '/N /N+1', lrb, 100, 56, 'dual-modulus divider，mod 由 FSM 決定'),
    { id: 'out', kind: 'port', x: 590, y: 68, text: 'div_out', dir: 'out' },
    box('fsm', 210, 150, 'phase + modulus FSM', [{ name: 'clk', side: 'right', pos: 0.5 }, { name: 'sel', side: 'top', pos: 0.2 }, { name: 'mod', side: 'top', pos: 0.8 }], 180, 50, '同時決定 phase_sel 與 mod；clock = div_out'),
  ],
  wires: [
    { id: 'w_ph', from: 'vco.out', to: 'pmux.in', kind: 'clock', signal: 'ph0..7', label: '8 phases' },
    { id: 'w_pclk', from: 'pmux.out', to: 'div.in', kind: 'clock', signal: 'pclk' },
    { id: 'w_out', from: 'div.out', to: 'out.p', kind: 'output', signal: 'div_out' },
    { id: 'w_sel', from: 'fsm.sel', to: 'pmux.ctl', kind: 'control', signal: 'phase_sel', points: [[246, 120], [220, 120]] },
    { id: 'w_mod', from: 'fsm.mod', to: 'div.ctl', kind: 'control', signal: 'mod', points: [[354, 120], [370, 120]] },
    { id: 'w_fb', from: 'out.p', to: 'fsm.clk', kind: 'clock', signal: 'div_out', points: [[560, 68], [560, 175]] },
  ],
}

/** 架構 3：/N/N+1 → 8 divided phases → PMUX */
export const arch3Schematic: Schematic = {
  width: 700,
  height: 230,
  title: '架構 3：VCO → /N/N+1 → phase generator → PMUX',
  elements: [
    box('vco', 20, 40, 'VCO', lr, 80, 56, '單相（或差動）VCO clock'),
    box('div', 130, 40, '/N /N+1', lrb, 100, 56, '在 fVCO 工作'),
    box('pgen', 260, 40, '8 divided phases', lr, 130, 56, '用 8 個 divider 副本、多相 divider、或 delay line 產生間距 Tvco/8 的 8 個 divided phase'),
    box('pmux', 420, 40, 'PMUX 8:1', lrb, 100, 56, '在 fVCO/N 工作'),
    { id: 'out', kind: 'port', x: 670, y: 68, text: 'div_out', dir: 'out' },
    box('fsm', 200, 150, 'phase + modulus FSM', [{ name: 'clk', side: 'right', pos: 0.5 }, { name: 'mod', side: 'top', pos: 0.15 }, { name: 'sel', side: 'top', pos: 0.85 }], 200, 50, 'clock = div_out'),
  ],
  wires: [
    { id: 'w_vco', from: 'vco.out', to: 'div.in', kind: 'clock', signal: 'clk' },
    { id: 'w_div', from: 'div.out', to: 'pgen.in', kind: 'clock', signal: 'div_N' },
    { id: 'w_pg', from: 'pgen.out', to: 'pmux.in', kind: 'clock', signal: 'dph0..7', label: '8 phases' },
    { id: 'w_out', from: 'pmux.out', to: 'out.p', kind: 'output', signal: 'div_out' },
    { id: 'w_mod', from: 'fsm.mod', to: 'div.ctl', kind: 'control', signal: 'mod', points: [[230, 120], [180, 120]] },
    { id: 'w_sel', from: 'fsm.sel', to: 'pmux.ctl', kind: 'control', signal: 'phase_sel', points: [[370, 120], [470, 120]] },
    { id: 'w_fb', from: 'out.p', to: 'fsm.clk', kind: 'clock', signal: 'div_out', points: [[640, 68], [640, 175]] },
  ],
}

// ---------------------------------------------------------------- Lesson 5-3：架構 2 的 timing schematic（含 FSM flop）
const pm4 = phaseMuxBlock(40, 110, 30)
export const arch2TimingSchematic: Schematic = {
  width: 760,
  height: 360,
  title: '架構 2 的 timing 路徑：PMUX → /2 /3 cell，FSM 由 div_out 驅動',
  elements: [
    ...pm4.elements,
    { id: 'ff0', kind: 'dff', x: 240, y: 40, label: 'FF0', edge: 'rising', signal: 'q0' },
    { id: 'nor', kind: 'nor', x: 330, y: 150, label: 'NOR', description: 'd0 = NOT(q1 OR q0) = div_out' },
    { id: 'ff1', kind: 'dff', x: 470, y: 40, label: 'FF1', edge: 'rising', signal: 'q1' },
    { id: 'and', kind: 'and', x: 560, y: 150, label: 'AND', description: 'd1 = q0 AND mod' },
    { id: 'out', kind: 'port', x: 400, y: 300, text: 'div_out', dir: 'out' },
    { id: 'ffsel', kind: 'dff', x: 60, y: 240, label: 'phase_sel', edge: 'rising', description: 'FSM：phase select register（clock = div_out）' },
    { id: 'dec', kind: 'box', x: 170, y: 245, w: 70, h: 40, text: 'decode', pins: [{ name: 'in', side: 'left', pos: 0.5 }, { name: 'out', side: 'right', pos: 0.5 }] },
    { id: 'ffmod', kind: 'dff', x: 640, y: 240, label: 'mod reg', edge: 'rising', description: 'FSM：modulus register（clock = div_out）' },
  ],
  wires: [
    ...pm4.wires,
    { id: 'w_pclk0', from: 'mux.out', to: 'ff0.clk', signal: 'pclk', kind: 'clock', points: [[190, 115], [190, 92]] },
    { id: 'w_pclk1', from: 'mux.out', to: 'ff1.clk', signal: 'pclk', kind: 'clock', points: [[190, 115], [190, 20], [450, 20], [450, 92]] },
    { id: 'w_q0_nor', from: 'ff0.q', to: 'nor.in0', signal: 'q0', kind: 'feedback', points: [[316, 60], [316, 163]] },
    { id: 'w_q1_nor', from: 'ff1.q', to: 'nor.in1', signal: 'q1', kind: 'feedback', points: [[546, 60], [546, 118], [322, 118], [322, 177]] },
    { id: 'w_q0_and', from: 'ff0.q', to: 'and.in0', signal: 'q0', kind: 'data', points: [[316, 60], [316, 35], [555, 35], [555, 163]], noArrow: true },
    { id: 'w_d0', from: 'nor.out', to: 'ff0.d', signal: 'd0', kind: 'feedback', points: [[400, 170], [400, 225], [222, 225], [222, 60]] },
    { id: 'w_d1', from: 'and.out', to: 'ff1.d', signal: 'd1', kind: 'feedback', points: [[624, 170], [624, 225], [456, 225], [456, 60]] },
    { id: 'w_out', from: 'nor.out', to: 'out.p', signal: 'div_out', kind: 'output', points: [[400, 170], [400, 300]] },
    { id: 'w_sel_q', from: 'ffsel.q', to: 'dec.in', signal: 'phase_sel', kind: 'control', points: [[150, 260], [150, 265]] },
    { id: 'w_dec', from: 'dec.out', to: 'mux.sel', signal: 'sel', kind: 'control', points: [[255, 265], [255, 205], [130, 205]] },
    { id: 'w_mod', from: 'ffmod.q', to: 'and.in1', signal: 'mod', kind: 'control', points: [[715, 260], [715, 215], [548, 215], [548, 177]] },
    { id: 'w_fb_sel', from: 'out.p', to: 'ffsel.clk', signal: 'div_out', kind: 'clock', points: [[400, 330], [40, 330], [40, 292]] },
    { id: 'w_fb_mod', from: 'out.p', to: 'ffmod.clk', signal: 'div_out', kind: 'clock', points: [[400, 330], [620, 330], [620, 292]] },
  ],
}
