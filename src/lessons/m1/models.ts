import type { Netlist } from '@/models/divider/types'
import { ripple4, ripple8, sync4 } from '@/models/divider/examples'
import { and, nor, not } from '@/utils/bits'

/**
 * Lesson 1-2 / 1-3 專用 netlist。
 * 所有 netlist 都在 models.test.ts 用 simulate() 驗證過 state sequence、divide ratio、duty 與 glitch 行為。
 */

/** ripple4 + 「state == 00」decode（dec00 = q0_b AND q1_b）。用來示範 temporary state 造成的 decode glitch。 */
export const ripple4Decode: Netlist = {
  ...ripple4,
  id: 'ripple4-decode',
  name: 'Ripple /4 + state==00 decode',
  description: '兩級 ripple counter，加一個 AND gate 解碼 state 00。real delay 模式下，01→10 會短暫經過 00，decode 出現 glitch。',
  gates: [
    ...ripple4.gates,
    {
      out: 'dec00',
      inputs: ['q0_b', 'q1_b'],
      fn: (v) => and(v.q0_b, v.q1_b),
      delay: 6,
      label: 'AND00',
      kind: 'and',
      description: 'dec00 = NOT q1 AND NOT q0（state == 00）',
    },
  ],
  watch: ['dec00'],
  equations: [...ripple4.equations, { target: 'dec00', text: 'dec00 = NOT q1 AND NOT q0', latex: 'dec_{00} = \\overline{q_1}\\,\\overline{q_0}' }],
}

/**
 * ripple8 + 「state == 000」decode（NOR3）+ 一個由 clk 觸發的 capture flop（FFS）。
 * FFS 代表「後級同步 decode / resynchronizer」：它的 setup path 從 FF0 的 clk edge 開始，
 * 經過 q0 → FF1 → q1 → FF2 → q2 → NOR3 → FFS.D，也就是累積 3 × tCQ + tNOR。
 */
export const ripple8Decode: Netlist = {
  ...ripple8,
  id: 'ripple8-decode',
  name: 'Ripple /8 + state==000 decode + capture flop',
  description: '三級 ripple counter；dec000 = NOR(q2, q1, q0)；FFS 在 clk rising edge 抓 dec000。',
  flops: [...ripple8.flops, { q: 'dec_s', d: 'dec000', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FFS', description: '同步 capture flop：在 clk rising edge 抓 dec000' }],
  gates: [
    ...ripple8.gates,
    {
      out: 'dec000',
      inputs: ['q0', 'q1', 'q2'],
      fn: (v) => nor(v.q0, v.q1, v.q2),
      delay: 10,
      label: 'NOR3',
      kind: 'nor',
      description: 'dec000 = NOT(q2 OR q1 OR q0)（state == 000）',
    },
  ],
  stateOrder: ['q2', 'q1', 'q0'],
  output: 'q2',
  watch: ['dec000', 'dec_s'],
  equations: [
    ...ripple8.equations,
    { target: 'dec000', text: 'dec000 = NOT(q2 OR q1 OR q0)', latex: 'dec_{000} = \\overline{q_2 + q_1 + q_0}' },
    { target: 'dec_s', text: 'dec_s <= dec000 @ clk rising', latex: 'dec_s \\leftarrow dec_{000}\\ (\\text{clk}\\uparrow)' },
  ],
}

/** 練習：三級 ripple，但第二級改由 q0 的 rising edge 觸發（第三級仍由 q1 falling 觸發）。 */
export const ripple8Rise: Netlist = {
  id: 'ripple8-rise',
  name: 'Ripple /8（FF1 由 q0 rising 觸發）',
  description: '三級 toggle FF：FF0 ← clk↑，FF1 ← q0↑，FF2 ← q1↓。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', qb: 'q0_b', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', qb: 'q1_b', d: 'd1', clk: 'q0', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
    { q: 'q2', qb: 'q2_b', d: 'd2', clk: 'q1', edge: 'falling', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF2' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV0', kind: 'inv' },
    { out: 'd1', inputs: ['q1'], fn: (v) => not(v.q1), delay: 6, label: 'INV1', kind: 'inv' },
    { out: 'd2', inputs: ['q2'], fn: (v) => not(v.q2), delay: 6, label: 'INV2', kind: 'inv' },
  ],
  stateOrder: ['q2', 'q1', 'q0'],
  output: 'q2',
  equations: [
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
    { target: 'd1', text: 'd1 = NOT q1  (clk1 = q0 rising)', latex: 'd_1 = \\overline{q_1}\\quad(\\text{clk}_1 = q_0\\uparrow)' },
    { target: 'd2', text: 'd2 = NOT q2  (clk2 = q1 falling)', latex: 'd_2 = \\overline{q_2}\\quad(\\text{clk}_2 = q_1\\downarrow)' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/** 練習解答用：三級全部由前級 Q 的 rising edge 觸發 → binary down counter。 */
export const ripple8AllRise: Netlist = {
  ...ripple8Rise,
  id: 'ripple8-all-rise',
  name: 'Ripple /8（三級皆 rising 觸發）',
  description: '三級 toggle FF：FF0 ← clk↑，FF1 ← q0↑，FF2 ← q1↑。',
  flops: ripple8Rise.flops.map((f) => ({ ...f, edge: 'rising' as const })),
  equations: [
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
    { target: 'd1', text: 'd1 = NOT q1  (clk1 = q0 rising)', latex: 'd_1 = \\overline{q_1}\\quad(\\text{clk}_1 = q_0\\uparrow)' },
    { target: 'd2', text: 'd2 = NOT q2  (clk2 = q1 rising)', latex: 'd_2 = \\overline{q_2}\\quad(\\text{clk}_2 = q_1\\uparrow)' },
  ],
}

/** sync4 + 同樣的「state == 00」decode：所有 flop 同時更新，decode 沒有 temporary-state glitch。 */
export const sync4Decode: Netlist = {
  ...sync4,
  id: 'sync4-decode',
  name: 'Synchronous /4 + state==00 decode',
  description: '同步 counter 加同一個 AND decode；因為 q0、q1 同時更新，dec00 不會出現 temporary-state glitch。',
  flops: sync4.flops.map((f) => ({ ...f, qb: `${f.q}_b` })),
  gates: [
    ...sync4.gates,
    {
      out: 'dec00',
      inputs: ['q0_b', 'q1_b'],
      fn: (v) => and(v.q0_b, v.q1_b),
      delay: 6,
      label: 'AND00',
      kind: 'and',
      description: 'dec00 = NOT q1 AND NOT q0（state == 00）',
    },
  ],
  watch: ['d1', 'dec00'],
  equations: [...sync4.equations, { target: 'dec00', text: 'dec00 = NOT q1 AND NOT q0', latex: 'dec_{00} = \\overline{q_1}\\,\\overline{q_0}' }],
}
