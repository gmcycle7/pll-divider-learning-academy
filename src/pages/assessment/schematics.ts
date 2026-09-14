import type { Schematic, SchematicHighlight, SchElement, SchWire } from '@/components/circuit/schematic'

/*
 * 版面規劃（Assessment A）
 *   上排：mod port → OR → AND → FF2.D（d2 的 next-state logic）
 *   中排：FF0 → FF1 → FF2 → div_out（q0 → d1 為純走線）
 *   下排：rst_n net label、clk（由下方進入的 clock bus）、INV（q2 → d0 的 feedback 走最下方的 channel）
 * 所有走線都不交叉，方便使用者用眼睛追 path。
 */
const FF_Y = 130
const FF_X = [110, 250, 390] as const
const OR_X = 170
const AND_X = 290
const TOP_Y = 44
const IN0 = TOP_Y + 40 / 3 // gate 的 in0 y
const IN1 = TOP_Y + 80 / 3 // gate 的 in1 y
const OUT = TOP_Y + 20 // gate 的 out y
const D_Y = FF_Y + 20
const CLK_Y = FF_Y + 52
const RST_Y = FF_Y + 72
const BUS_Y = 246
const INV_X = 480
const INV_Y = 268
const CHAN_Y = 318

function coreElements(dx = 0): SchElement[] {
  return [
    { id: 'mod', kind: 'port', x: 34 + dx, y: IN0, text: 'mod', dir: 'in', description: 'modulus control input' },
    { id: 'or', kind: 'or', x: OR_X + dx, y: TOP_Y, label: 'OR', description: 'or_m = q0 OR mod' },
    { id: 'and', kind: 'and', x: AND_X + dx, y: TOP_Y, label: 'AND', description: 'd2 = q1 AND or_m' },
    { id: 'ff0', kind: 'dff', x: FF_X[0] + dx, y: FF_Y, label: 'FF0', edge: 'rising', signal: 'q0', description: 'rising-edge DFF；state bit q0' },
    { id: 'ff1', kind: 'dff', x: FF_X[1] + dx, y: FF_Y, label: 'FF1', edge: 'rising', signal: 'q1', description: 'rising-edge DFF；state bit q1' },
    { id: 'ff2', kind: 'dff', x: FF_X[2] + dx, y: FF_Y, label: 'FF2', edge: 'rising', signal: 'q2', description: 'rising-edge DFF；state bit q2 = div_out' },
    { id: 'rst0', kind: 'port', x: FF_X[0] + 32 + dx, y: RST_Y + 24, text: 'rst_n', dir: 'in', description: 'async reset (active low)' },
    { id: 'rst1', kind: 'port', x: FF_X[1] + 32 + dx, y: RST_Y + 24, text: 'rst_n', dir: 'in', description: 'async reset (active low)' },
    { id: 'rst2', kind: 'port', x: FF_X[2] + 32 + dx, y: RST_Y + 24, text: 'rst_n', dir: 'in', description: 'async reset (active low)' },
    { id: 'clk', kind: 'port', x: 200 + dx, y: 290, text: 'clk', dir: 'in', description: 'input clock（同一條 clock 給三個 FF）' },
    { id: 'inv', kind: 'inv', x: INV_X + dx, y: INV_Y, label: 'INV', description: 'd0 = NOT q2' },
  ]
}

function coreWires(dx = 0): SchWire[] {
  const x = (v: number) => v + dx
  return [
    // clock bus（由下方進入，三條 drop 往上接到各 FF 的 clk pin）
    { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock', points: [[x(200), BUS_Y], [x(92), BUS_Y], [x(92), CLK_Y]] },
    { id: 'w_clk1', from: 'clk.p', to: 'ff1.clk', signal: 'clk', kind: 'clock', points: [[x(200), BUS_Y], [x(232), BUS_Y], [x(232), CLK_Y]] },
    { id: 'w_clk2', from: 'clk.p', to: 'ff2.clk', signal: 'clk', kind: 'clock', points: [[x(200), BUS_Y], [x(372), BUS_Y], [x(372), CLK_Y]] },
    // reset
    { id: 'w_rst0', from: 'rst0.p', to: 'ff0.rstn', kind: 'reset', route: 'direct' },
    { id: 'w_rst1', from: 'rst1.p', to: 'ff1.rstn', kind: 'reset', route: 'direct' },
    { id: 'w_rst2', from: 'rst2.p', to: 'ff2.rstn', kind: 'reset', route: 'direct' },
    // 中排 data
    { id: 'w_q0_d1', from: 'ff0.q', to: 'ff1.d', signal: 'q0', kind: 'data', labelAt: 0.35 },
    // 上排 next-state logic for d2
    { id: 'w_mod', from: 'mod.p', to: 'or.in0', signal: 'mod', kind: 'control' },
    { id: 'w_q0_or', from: 'ff0.q', to: 'or.in1', signal: 'q0', kind: 'feedback', points: [[x(190), D_Y], [x(190), 100], [x(156), 100], [x(156), IN1]], labelAt: 0.55, noArrow: false },
    { id: 'w_or_and', from: 'or.out', to: 'and.in0', signal: 'or_m', kind: 'data', points: [[x(256), OUT], [x(256), IN0]] },
    { id: 'w_q1_and', from: 'ff1.q', to: 'and.in1', signal: 'q1', kind: 'feedback', points: [[x(330), D_Y], [x(330), 110], [x(276), 110], [x(276), IN1]], labelAt: 0.2 },
    { id: 'w_and_d2', from: 'and.out', to: 'ff2.d', signal: 'd2', kind: 'data', points: [[x(378), OUT], [x(378), D_Y]], labelAt: 0.5 },
    // feedback q2 → INV → d0（走最下方 channel）
    { id: 'w_q2_inv', from: 'ff2.q', to: 'inv.in0', signal: 'q2', kind: 'feedback', points: [[x(470), D_Y], [x(470), INV_Y + 12]], labelAt: 0.5 },
    { id: 'w_inv_d0', from: 'inv.out', to: 'ff0.d', signal: 'd0', kind: 'feedback', points: [[x(540), INV_Y + 12], [x(540), CHAN_Y], [x(60), CHAN_Y], [x(60), D_Y]], labelAt: 0.5 },
  ]
}

/** Assessment A：不標示 equation、不標示 critical path 的原始電路 */
export const johnson56Schematic: Schematic = {
  width: 660,
  height: 340,
  title: '待分析電路：3 個 DFF + INV / OR / AND，一個 control input mod',
  elements: [...coreElements(), { id: 'out', kind: 'port', x: 620, y: D_Y, text: 'div_out', dir: 'out', description: 'output = q2' }],
  wires: [...coreWires(), { id: 'w_out', from: 'ff2.q', to: 'out.p', signal: 'q2', kind: 'output', label: 'div_out', labelAt: 0.6 }],
}

/*
 * Assessment B：同一個 divider 放進「系統」裡——
 *   mod 由 register FF_M（同一個 clk）每個 cycle 更新（例如來自 DSM / modulus controller）
 *   div_out 經過一段長走線送到 downstream 的 retiming flop FF_R（例如 PFD 前的 re-sync）
 * 這樣才有完整的 launch / capture：mod path 的 launch 是 FF_M，interface path 的 capture 是 FF_R。
 */
const DX = 110
const FFM_X = 96
const FFM_Y = 24
const FFR_X = 690

export const johnson56SysSchematic: Schematic = {
  width: 840,
  height: 340,
  title: 'Assessment B：/5 /6 divider + modulus register FF_M + downstream retiming flop FF_R',
  elements: [
    ...coreElements(DX).filter((e) => e.id !== 'mod'),
    { id: 'mod_in', kind: 'port', x: 50, y: FFM_Y + 20, text: 'mod_in', dir: 'in', description: '來自 modulus controller / DSM 的下一個 mod 值' },
    { id: 'ffm', kind: 'dff', x: FFM_X, y: FFM_Y, label: 'FF_M', edge: 'rising', signal: 'mod', description: 'modulus register：每個 clk 更新 mod' },
    { id: 'clkm', kind: 'port', x: 50, y: FFM_Y + 52, text: 'clk', dir: 'in', description: '同一條 clk' },
    { id: 'rstm', kind: 'port', x: FFM_X + 32, y: FFM_Y + 72 + 24, text: 'rst_n', dir: 'in', description: 'async reset' },
    { id: 'ffr', kind: 'dff', x: FFR_X, y: FF_Y, label: 'FF_R', edge: 'rising', signal: 'div_out_r', description: 'downstream retiming flop（clock 經過較長的 clock tree）' },
    { id: 'clkr', kind: 'port', x: FFR_X - 38, y: CLK_Y, text: 'clk', dir: 'in', description: '同一條 clk，但經過較長的 clock tree（skew）' },
    { id: 'rstr', kind: 'port', x: FFR_X + 32, y: RST_Y + 24, text: 'rst_n', dir: 'in', description: 'async reset' },
    { id: 'outr', kind: 'port', x: 800, y: D_Y, text: 'div_out_r', dir: 'out', description: 'retimed output' },
  ],
  wires: [
    ...coreWires(DX).filter((w) => w.id !== 'w_mod'),
    { id: 'w_modin', from: 'mod_in.p', to: 'ffm.d', signal: 'mod_in', kind: 'control' },
    { id: 'w_clkm', from: 'clkm.p', to: 'ffm.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_rstm', from: 'rstm.p', to: 'ffm.rstn', kind: 'reset', route: 'direct' },
    { id: 'w_mod', from: 'ffm.q', to: 'or.in0', signal: 'mod', kind: 'control', points: [[200, FFM_Y + 20], [200, IN0]], labelAt: 0.7 },
    { id: 'w_out', from: 'ff2.q', to: 'ffr.d', signal: 'q2', kind: 'output', label: 'div_out', labelAt: 0.55 },
    { id: 'w_clkr', from: 'clkr.p', to: 'ffr.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_rstr', from: 'rstr.p', to: 'ffr.rstn', kind: 'reset', route: 'direct' },
    { id: 'w_outr', from: 'ffr.q', to: 'outr.p', signal: 'div_out_r', kind: 'output' },
  ],
}

/** Assessment B 各候選 path 的高亮（給 critical-path 題型與解答用） */
export const pathHighlights = {
  q2InvD0: { style: 'setup', wires: ['w_q2_inv', 'w_inv_d0'], elements: ['ff2', 'inv', 'ff0'], tags: [{ elementOrWire: 'ff2', text: 'launch' }, { elementOrWire: 'ff0', text: 'capture' }] } satisfies SchematicHighlight,
  q1AndD2: { style: 'setup', wires: ['w_q1_and', 'w_and_d2'], elements: ['ff1', 'and', 'ff2'], tags: [{ elementOrWire: 'ff1', text: 'launch' }, { elementOrWire: 'ff2', text: 'capture' }] } satisfies SchematicHighlight,
  q0OrAndD2: { style: 'setup', wires: ['w_q0_or', 'w_or_and', 'w_and_d2'], elements: ['ff0', 'or', 'and', 'ff2'], tags: [{ elementOrWire: 'ff0', text: 'launch' }, { elementOrWire: 'ff2', text: 'capture' }] } satisfies SchematicHighlight,
  modOrAndD2: { style: 'setup', wires: ['w_mod', 'w_or_and', 'w_and_d2'], elements: ['ffm', 'or', 'and', 'ff2'], tags: [{ elementOrWire: 'ffm', text: 'launch' }, { elementOrWire: 'ff2', text: 'capture' }] } satisfies SchematicHighlight,
  q0D1: { style: 'hold', wires: ['w_q0_d1'], elements: ['ff0', 'ff1'], tags: [{ elementOrWire: 'ff0', text: 'launch' }, { elementOrWire: 'ff1', text: 'capture' }] } satisfies SchematicHighlight,
  outFfr: { style: 'setup', wires: ['w_out'], elements: ['ff2', 'ffr'], tags: [{ elementOrWire: 'ff2', text: 'launch' }, { elementOrWire: 'ffr', text: 'capture' }] } satisfies SchematicHighlight,
  rst: { style: 'async', wires: ['w_rst0', 'w_rst1', 'w_rst2'], elements: ['rst0', 'rst1', 'rst2', 'ff0', 'ff1', 'ff2'], tags: [] } satisfies SchematicHighlight,
  clk: { style: 'info', wires: ['w_clk0', 'w_clk1', 'w_clk2'], elements: ['clk'], tags: [] } satisfies SchematicHighlight,
}
