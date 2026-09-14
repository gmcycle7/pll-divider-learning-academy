import type { SchElement, Schematic, SchematicHighlight, SchWire } from '@/components/circuit/schematic'

type Edge = 'rising' | 'falling'

/**
 * Ripple counter 的固定版面（每級 200 px）：
 *   INV_i 放在 FF_i 左側的 D 列，回授 q_i → INV_i 走上方的迴圈；
 *   q_i 往右下接到 FF_{i+1} 的 clk（y = 92 的水平線）。
 * 元件 id：ff{i}, inv{i}, dot{i}；wire id：w_clk{i}（進 FF_i 的 clock）、w_q{i}_inv、w_d{i}、w_out、w_rst{i}
 */
function buildRipple(edges: Edge[], opts: { withReset?: boolean; extraWidth?: number; title?: string; outText?: string } = {}) {
  const n = edges.length
  const X0 = (i: number) => 100 + 200 * i
  const elements: SchElement[] = [{ id: 'clk', kind: 'port', x: 20, y: 92, text: 'clk', dir: 'in', description: 'input clock（只有 FF0 用它）' }]
  const wires: SchWire[] = []
  for (let i = 0; i < n; i++) {
    const x0 = X0(i)
    const clkDesc = i === 0 ? 'rising-edge DFF：clock = clk' : `${edges[i] === 'falling' ? 'falling' : 'rising'}-edge DFF：clock = q${i - 1}（前一級的 Q）`
    elements.push({ id: `inv${i}`, kind: 'inv', x: x0 - 52, y: 48, label: `INV${i}`, description: `d${i} = NOT q${i}` })
    elements.push({ id: `ff${i}`, kind: 'dff', x: x0, y: 40, label: `FF${i}`, edge: edges[i], signal: `q${i}`, description: clkDesc })
    elements.push({ id: `dot${i}`, kind: 'dot', x: x0 + 80, y: 60 })
    wires.push({ id: `w_d${i}`, from: `inv${i}.out`, to: `ff${i}.d`, signal: `d${i}`, kind: 'feedback', route: 'direct', labelAt: 0.5 })
    wires.push({
      id: `w_q${i}_inv`,
      from: `ff${i}.q`,
      to: `inv${i}.in0`,
      signal: `q${i}`,
      kind: 'feedback',
      points: [
        [x0 + 80, 60],
        [x0 + 80, 16],
        [x0 - 64, 16],
        [x0 - 64, 60],
      ],
      labelAt: 0.5,
    })
    if (i === 0) {
      wires.push({ id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' })
    } else {
      const xp = X0(i - 1)
      wires.push({
        id: `w_clk${i}`,
        from: `ff${i - 1}.q`,
        to: `ff${i}.clk`,
        signal: `q${i - 1}`,
        kind: 'clock',
        points: [
          [xp + 80, 60],
          [xp + 80, 92],
        ],
        labelAt: 0.7,
        label: `q${i - 1} → clk${i}`,
      })
    }
  }
  const xLast = X0(n - 1)
  elements.push({ id: 'out', kind: 'port', x: xLast + 140, y: 60, text: opts.outText ?? 'div_out', dir: 'out', description: `output = q${n - 1}` })
  wires.push({ id: 'w_out', from: `ff${n - 1}.q`, to: 'out.p', signal: `q${n - 1}`, kind: 'output' })
  let height = 150
  if (opts.withReset) {
    const rx = X0(Math.floor((n - 1) / 2)) + 32 + (n % 2 === 0 ? 100 : 0)
    elements.push({ id: 'rst', kind: 'port', x: rx, y: 215, text: 'rst_n', dir: 'in', description: 'async reset（active low）：所有級同時清成 0' })
    for (let i = 0; i < n; i++) {
      wires.push({ id: `w_rst${i}`, from: 'rst.p', to: `ff${i}.rstn`, kind: 'reset', points: [[X0(i) + 32, 215]], noArrow: true })
    }
    height = 236
  }
  return { elements, wires, width: xLast + 200 + (opts.extraWidth ?? 0), height, title: opts.title } satisfies Schematic
}

/** 兩級 ripple /4：FF1 由 q0 的 falling edge 觸發 */
export const ripple4Schematic: Schematic = buildRipple(['rising', 'falling'], { withReset: true, title: 'Ripple counter /4' })

/** 三級 ripple /8 */
export const ripple8Schematic: Schematic = buildRipple(['rising', 'falling', 'falling'], { withReset: true, title: 'Ripple counter /8' })

/** 練習：三級 ripple，FF1 改由 q0 rising 觸發 */
export const ripple8RiseSchematic: Schematic = buildRipple(['rising', 'rising', 'falling'], { withReset: true, title: '練習電路：FF1 由 q0 rising 觸發' })

/** 練習解答：三級全 rising（down counter） */
export const ripple8AllRiseSchematic: Schematic = buildRipple(['rising', 'rising', 'rising'], { withReset: true, title: '三級皆 rising 觸發' })

/**
 * ripple /8 + NOR3 decode（state == 000）+ 由 clk 觸發的 capture flop FFS。
 * 用於 Critical Path Explorer 的「累積 clock path → decode → capture」interface path。
 * （為了版面清楚，這張圖省略 rst_n 走線；netlist 仍有 async reset。）
 */
export const ripple8DecodeSchematic: Schematic = (() => {
  const base = buildRipple(['rising', 'falling', 'falling'], { extraWidth: 320, title: 'Ripple /8 + 同步 decode' })
  const elements: SchElement[] = [
    ...base.elements.filter((e) => e.id !== 'out'),
    { id: 'out', kind: 'port', x: 650, y: 60, text: 'div_out', dir: 'out', description: 'output = q2' },
    { id: 'dotq2', kind: 'dot', x: 600, y: 60 },
    { id: 'nor', kind: 'nor', x: 720, y: 118, inputs: 3, label: 'NOR3', description: 'dec000 = NOT(q2 OR q1 OR q0)：state == 000 的 decode' },
    { id: 'ffs', kind: 'dff', x: 820, y: 125, label: 'FFS', edge: 'rising', signal: 'dec_s', description: '同步 capture flop：在 clk rising edge 抓 dec000（後級 decode / resynchronizer）' },
    { id: 'decs', kind: 'port', x: 940, y: 145, text: 'dec_s', dir: 'out', description: '同步後的 decode 輸出' },
    { id: 'dotclk', kind: 'dot', x: 50, y: 92 },
  ]
  const wires: SchWire[] = [
    ...base.wires,
    {
      id: 'w_q2_nor',
      from: 'ff2.q',
      to: 'nor.in0',
      signal: 'q2',
      kind: 'data',
      points: [
        [600, 60],
        [600, 131.5],
      ],
      labelAt: 0.6,
    },
    {
      id: 'w_q0_nor',
      from: 'ff0.q',
      to: 'nor.in1',
      signal: 'q0',
      kind: 'data',
      points: [
        [180, 60],
        [180, 210],
        [706, 210],
        [706, 145],
      ],
      labelAt: 0.5,
    },
    {
      id: 'w_q1_nor',
      from: 'ff1.q',
      to: 'nor.in2',
      signal: 'q1',
      kind: 'data',
      points: [
        [380, 60],
        [380, 192],
        [692, 192],
        [692, 158.5],
      ],
      labelAt: 0.5,
    },
    { id: 'w_dec', from: 'nor.out', to: 'ffs.d', signal: 'dec000', kind: 'data' },
    {
      id: 'w_clk_s',
      from: 'clk.p',
      to: 'ffs.clk',
      signal: 'clk',
      kind: 'clock',
      points: [
        [50, 92],
        [50, 226],
        [804, 226],
        [804, 177],
      ],
      labelAt: 0.5,
    },
    { id: 'w_decs', from: 'ffs.q', to: 'decs.p', signal: 'dec_s', kind: 'output' },
  ]
  return { width: 980, height: 240, title: base.title, elements, wires }
})()

/** Lesson 1-2 quiz：三級 ripple 上的候選路徑高亮 */
export const rippleQuizHighlights: Record<'clkWire' | 'ff0Loop' | 'ff2Loop' | 'outWire', SchematicHighlight> = {
  clkWire: { style: 'info', wires: ['w_clk1', 'w_clk2'], elements: ['ff1', 'ff2'], tags: [{ elementOrWire: 'ff1', text: 'clock path（q0 → clk1 → q1 → clk2）' }] },
  ff0Loop: { style: 'setup', wires: ['w_q0_inv', 'w_d0'], elements: ['inv0', 'ff0'], tags: [{ elementOrWire: 'ff0', text: 'launch = capture（clk edge k → k+1）' }] },
  ff2Loop: { style: 'setup', wires: ['w_q2_inv', 'w_d2'], elements: ['inv2', 'ff2'], tags: [{ elementOrWire: 'ff2', text: 'launch = capture（q1↓ → 下一個 q1↓）' }] },
  outWire: { style: 'info', wires: ['w_out'], elements: ['out'], tags: [{ elementOrWire: 'out', text: 'output latency' }] },
}
