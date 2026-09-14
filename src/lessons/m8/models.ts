import type { Bit, Netlist, Values } from '@/models/divider/types'
import { and, nand, nor, not, or, xor } from '@/utils/bits'

/* ------------------------------------------------------------------------------------------------
 * Module 8 的 netlist
 *
 * gate delay（real 模式）沿用 examples 的慣例：INV 6、NAND 10、XOR/OR/NOR 12、AND/XNOR 14、tCQ 8（單位 ps）。
 *
 * 所有 state 都以 stateOrder（MSB first）寫成 bit-string；下面註解裡的 state 序列都用 simulate() 跑過，
 * 並在 models.test.ts 內以測試固定下來。
 * ---------------------------------------------------------------------------------------------- */

const ff = (i: number, rstn = true) => ({
  q: `q${i}`,
  qb: `q${i}_b`,
  d: `d${i}`,
  clk: 'clk',
  edge: 'rising' as const,
  ...(rstn ? { rstn: 'rst_n', resetValue: 0 as Bit } : {}),
  tcq: 8,
  label: `FF${i}`,
})

/* ------------------------------------------------------------------------------------------------
 * 1. Twisted-ring（shortened Johnson）/5：3 個 flop，5 個合法 state，3 個 unused
 *
 * 由 Johnson /6（d0 = NOT q2）縮短一個 state 而來：把 011 → 111 這一步擋掉，改成 011 → 110，
 * 所以 d0 = NOT q2 AND NOT(q1 q0) = NOR(q2, q1 AND q0)。
 *
 * 主循環（q2q1q0）：000 → 001 → 011 → 110 → 100 → 000
 * unused：010 → 101、101 → 010（互相跳，lock-up loop）、111 → 110（一步回到主循環）
 * 輸出 div_out = q2：high 於 110、100（2 個 cycle），low 3 個 cycle → duty = 2/5 = 40%
 * ---------------------------------------------------------------------------------------------- */
export const div5Lockup: Netlist = {
  id: 'm8-div5-lockup',
  name: 'Twisted-ring /5（有 lock-up loop）',
  description: '3-bit shift register：d2 = q1、d1 = q0、d0 = NOR(q2, q1 AND q0)。合法循環 000→001→011→110→100；unused state 010 與 101 互相跳，永遠不回來。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [ff(0), ff(1), ff(2)],
  gates: [
    { out: 'a10', inputs: ['q1', 'q0'], fn: (v) => and(v.q1, v.q0), delay: 14, label: 'AND', kind: 'and', description: 'a10 = q1 AND q0：偵測 011，擋住 011 → 111' },
    { out: 'd0', inputs: ['q2', 'a10'], fn: (v) => nor(v.q2, v.a10), delay: 12, label: 'NOR', kind: 'nor', description: 'd0 = NOR(q2, a10)' },
    { out: 'd1', inputs: ['q0'], fn: (v) => v.q0, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'd2', inputs: ['q1'], fn: (v) => v.q1, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['q2', 'q1', 'q0'],
  output: 'q2',
  watch: ['a10', 'd0'],
  equations: [
    { target: 'd2', text: 'd2 = q1', latex: 'd_2 = q_1' },
    { target: 'd1', text: 'd1 = q0', latex: 'd_1 = q_0' },
    { target: 'd0', text: 'd0 = NOR(q2, q1 AND q0)', latex: 'd_0 = \\overline{q_2 + q_1 q_0}' },
  ],
  legalStates: ['000', '001', '011', '110', '100'],
  defaultDelays: { tcq: 8, gate: 6 },
}

/* ------------------------------------------------------------------------------------------------
 * 2. /5 修正版 A：多一個 AND，把 101 的 next-state 從 don't care 指定成 000
 *
 * d1 = q0 AND NOT q2（合法 state 中 q0 = 1 時 q2 一定是 0，所以主循環不變）
 * unused：101 → 000（1 步）、010 → 101 → 000（2 步）、111 → 100（1 步）。max stepsToCycle = 2，無 lock-up。
 * ---------------------------------------------------------------------------------------------- */
export const div5Recover: Netlist = {
  ...div5Lockup,
  id: 'm8-div5-recover',
  name: 'Twisted-ring /5（self-recovering，加一個 AND）',
  description: 'd1 = q0 AND NOT q2：101 一步回到 000，010 兩步回到主循環。',
  gates: [
    { out: 'a10', inputs: ['q1', 'q0'], fn: (v) => and(v.q1, v.q0), delay: 14, label: 'AND', kind: 'and' },
    { out: 'd0', inputs: ['q2', 'a10'], fn: (v) => nor(v.q2, v.a10), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'd1', inputs: ['q0', 'q2_b'], fn: (v) => and(v.q0, v.q2_b), delay: 14, label: 'AND2', kind: 'and', description: 'd1 = q0 AND q2_b（用 FF2 的 Q̄）：新增的 gate' },
    { out: 'd2', inputs: ['q1'], fn: (v) => v.q1, delay: 0, label: 'wire', kind: 'buf' },
  ],
  watch: ['a10', 'd0', 'd1'],
  equations: [
    { target: 'd2', text: 'd2 = q1', latex: 'd_2 = q_1' },
    { target: 'd1', text: 'd1 = q0 AND NOT q2', latex: 'd_1 = q_0\\,\\overline{q_2}' },
    { target: 'd0', text: 'd0 = NOR(q2, q1 AND q0)', latex: 'd_0 = \\overline{q_2 + q_1 q_0}' },
  ],
}

/* ------------------------------------------------------------------------------------------------
 * 3. /5 修正版 B：重新化簡 d0。合法 state 裡「q2 = 0 且 q1 = 1」只會出現在 011，此時 q0 = 1，
 *    所以 q1 AND q0 可以用 q1 取代 → d0 = NOR(q2, q1)。gate 反而更少，而且沒有 lock-up。
 * unused：010 → 100（1 步）、101 → 010 → 100（2 步）、111 → 110（1 步）。
 * ---------------------------------------------------------------------------------------------- */
export const div5RecoverAlt: Netlist = {
  ...div5Lockup,
  id: 'm8-div5-recover-alt',
  name: 'Twisted-ring /5（self-recovering，重新化簡 d0）',
  description: 'd0 = NOR(q2, q1)：比原版少一個 gate，且沒有 lock-up。',
  gates: [
    { out: 'd0', inputs: ['q2', 'q1'], fn: (v) => nor(v.q2, v.q1), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'd1', inputs: ['q0'], fn: (v) => v.q0, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'd2', inputs: ['q1'], fn: (v) => v.q1, delay: 0, label: 'wire', kind: 'buf' },
  ],
  watch: ['d0'],
  equations: [
    { target: 'd2', text: 'd2 = q1', latex: 'd_2 = q_1' },
    { target: 'd1', text: 'd1 = q0', latex: 'd_1 = q_0' },
    { target: 'd0', text: 'd0 = NOR(q2, q1)', latex: 'd_0 = \\overline{q_2 + q_1}' },
  ],
}

/* ------------------------------------------------------------------------------------------------
 * 4. Lesson 8-1 練習：陌生 3-bit counter
 *
 * d2 = NOT q2 AND q1、d1 = q2 XOR q0、d0 = NOT q0
 * 主循環：000 → 001 → 010 → 101 → 000（/4，輸出 q2 只在 101 為 1 → duty 25%）
 * unused：011 → 110、110 → 011（loop）、100 → 011（掉進 loop）、111 → 000（1 步回來）
 * lock-up = {011, 100, 110}
 * ---------------------------------------------------------------------------------------------- */
export const mystery3: Netlist = {
  id: 'm8-mystery3',
  name: '陌生 3-bit counter',
  description: '請先自己列 state table，再用 state graph 找出所有 lock-up state。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [ff(0), ff(1), ff(2)],
  gates: [
    { out: 'd2', inputs: ['q2', 'q1'], fn: (v) => and(not(v.q2), v.q1), delay: 14, label: 'AND', kind: 'and', description: 'd2 = NOT q2 AND q1' },
    { out: 'd1', inputs: ['q2', 'q0'], fn: (v) => xor(v.q2, v.q0), delay: 12, label: 'XOR', kind: 'xor', description: 'd1 = q2 XOR q0' },
    { out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV', kind: 'inv', description: 'd0 = NOT q0' },
  ],
  stateOrder: ['q2', 'q1', 'q0'],
  output: 'q2',
  equations: [
    { target: 'd2', text: 'd2 = NOT q2 AND q1', latex: 'd_2 = \\overline{q_2}\\, q_1' },
    { target: 'd1', text: 'd1 = q2 XOR q0', latex: 'd_1 = q_2 \\oplus q_0' },
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
  ],
  legalStates: ['000', '001', '010', '101'],
  defaultDelays: { tcq: 8, gate: 6 },
}

/* ------------------------------------------------------------------------------------------------
 * 5. Lesson 8-2 練習：Gray-code /3，state 10 自己跳回自己
 *
 * 主循環：00 → 01 → 11 → 00；d1 = q1 XOR q0，d0 = NOT q1
 * 10 → (d1 = 1, d0 = 0) = 10 → lock-up
 * 輸出 q1：只在 11 為 1 → duty 1/3
 *
 * 使用者要自己改 equation。候選寫在 grayDiv3Candidates，用 buildGrayDiv3() 組出 netlist 驗證。
 * ---------------------------------------------------------------------------------------------- */
export interface EquationCandidate {
  key: string
  text: string
  latex: string
  fn: (v: Values) => Bit
  /** 等效 2-input gate 數（inverter 算 0.5；用 flop 的 Q̄ 取代 inverter 不算） */
  gates: number
  delay: number
  kind: 'inv' | 'buf' | 'and' | 'or' | 'xor' | 'nand' | 'nor'
  label: string
}

export const grayDiv3Candidates: { d1: EquationCandidate[]; d0: EquationCandidate[] } = {
  d1: [
    { key: 'xor', text: 'q1 XOR q0', latex: 'q_1 \\oplus q_0', fn: (v) => xor(v.q1, v.q0), gates: 1, delay: 12, kind: 'xor', label: 'XOR' },
    { key: 'q0', text: 'q0', latex: 'q_0', fn: (v) => v.q0, gates: 0, delay: 0, kind: 'buf', label: 'wire' },
    { key: 'q0nq1', text: 'q0 AND NOT q1', latex: 'q_0\\,\\overline{q_1}', fn: (v) => and(v.q0, not(v.q1)), gates: 1, delay: 14, kind: 'and', label: 'AND(q0,q̄1)' },
    { key: 'or', text: 'q1 OR q0', latex: 'q_1 + q_0', fn: (v) => or(v.q1, v.q0), gates: 1, delay: 12, kind: 'or', label: 'OR' },
    { key: 'nq1', text: 'NOT q1', latex: '\\overline{q_1}', fn: (v) => not(v.q1), gates: 0.5, delay: 6, kind: 'inv', label: 'INV' },
  ],
  d0: [
    { key: 'nq1', text: 'NOT q1', latex: '\\overline{q_1}', fn: (v) => not(v.q1), gates: 0.5, delay: 6, kind: 'inv', label: 'INV' },
    { key: 'nand', text: 'NAND(q1, q0)', latex: '\\overline{q_1 q_0}', fn: (v) => nand(v.q1, v.q0), gates: 1, delay: 10, kind: 'nand', label: 'NAND' },
    { key: 'nor', text: 'NOR(q1, q0)', latex: '\\overline{q_1 + q_0}', fn: (v) => nor(v.q1, v.q0), gates: 1, delay: 12, kind: 'nor', label: 'NOR' },
    { key: 'nq0', text: 'NOT q0', latex: '\\overline{q_0}', fn: (v) => not(v.q0), gates: 0.5, delay: 6, kind: 'inv', label: 'INV' },
    { key: 'xnor', text: 'XNOR(q1, q0)', latex: '\\overline{q_1 \\oplus q_0}', fn: (v) => not(xor(v.q1, v.q0)), gates: 1, delay: 14, kind: 'nor', label: 'XNOR' },
  ],
}

export function buildGrayDiv3(d1Key: string, d0Key: string): Netlist {
  const c1 = grayDiv3Candidates.d1.find((c) => c.key === d1Key) ?? grayDiv3Candidates.d1[0]
  const c0 = grayDiv3Candidates.d0.find((c) => c.key === d0Key) ?? grayDiv3Candidates.d0[0]
  return {
    id: `m8-gray3-${c1.key}-${c0.key}`,
    name: `Gray /3：d1 = ${c1.text}，d0 = ${c0.text}`,
    description: '合法循環 00 → 01 → 11 → 00。',
    clocks: [{ name: 'clk' }],
    inputs: [],
    flops: [ff(0), ff(1)],
    gates: [
      { out: 'd1', inputs: ['q1', 'q0'], fn: c1.fn, delay: c1.delay, label: c1.label, kind: c1.kind },
      { out: 'd0', inputs: ['q1', 'q0'], fn: c0.fn, delay: c0.delay, label: c0.label, kind: c0.kind },
    ],
    stateOrder: ['q1', 'q0'],
    output: 'q1',
    watch: ['d1', 'd0'],
    equations: [
      { target: 'd1', text: `d1 = ${c1.text}`, latex: `d_1 = ${c1.latex}` },
      { target: 'd0', text: `d0 = ${c0.text}`, latex: `d_0 = ${c0.latex}` },
    ],
    legalStates: ['00', '01', '11'],
    defaultDelays: { tcq: 8, gate: 6 },
  }
}

/** 練習題的原始（有 lock-up）版本：d1 = q1 XOR q0，d0 = NOT q1 */
export const grayDiv3Lockup: Netlist = { ...buildGrayDiv3('xor', 'nq1'), id: 'm8-gray3-lockup', name: 'Gray-code /3（10 → 10 lock-up）' }
/** 參考解答之一：d1 = q0 AND NOT q1（10 → 00） */
export const grayDiv3Fixed: Netlist = { ...buildGrayDiv3('q0nq1', 'nq1'), id: 'm8-gray3-fixed', name: 'Gray-code /3（修正：d1 = q0 AND NOT q1）' }
/** 參考解答之二：d0 = NAND(q1, q0)（10 → 11） */
export const grayDiv3FixedAlt: Netlist = { ...buildGrayDiv3('xor', 'nand'), id: 'm8-gray3-fixed-alt', name: 'Gray-code /3（修正：d0 = NAND(q1, q0)）' }

/* ------------------------------------------------------------------------------------------------
 * 6. Reset 示範用：div3Lockup 的邏輯（XNOR / wire，11 → 11），分別配 async reset 與 sync reset
 *
 * div3AsyncRst：rst_n 同時是 flop 的非同步 reset 與一個可手動切換的 input。
 *   拉低的瞬間 Q 立刻歸零（不等 clock edge）；放開後 flop 才在下一個 edge 抓 D。
 * div3SyncRst：rst 是一般 input，走 data path：d = next-state AND NOT rst。
 *   拉高後要等到下一個 rising edge，state 才變成 00。
 * ---------------------------------------------------------------------------------------------- */
export const div3AsyncRst: Netlist = {
  id: 'm8-div3-async-rst',
  name: '/3（11 lock-up）＋ 非同步 reset',
  description: 'rst_n 拉低時 q0、q1 立刻被清成 0；釋放後才恢復計數。',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'rst_n', initial: 1, description: '非同步 reset（active low）。拉低：立即清 0；拉高：釋放' }],
  flops: [ff(0), ff(1)],
  gates: [
    { out: 'd0', inputs: ['q0', 'q1'], fn: (v) => or(nor(v.q0, v.q1), and(v.q0, v.q1)), delay: 14, label: 'XNOR', kind: 'xnor' },
    { out: 'd1', inputs: ['q0'], fn: (v) => v.q0, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'q1',
  equations: [
    { target: 'd0', text: 'd0 = XNOR(q1, q0)', latex: 'd_0 = \\overline{q_1 \\oplus q_0}' },
    { target: 'd1', text: 'd1 = q0', latex: 'd_1 = q_0' },
    { target: 'q', text: 'rst_n = 0 ⇒ q1 = q0 = 0（立即）', latex: 'rst\\_n = 0 \\Rightarrow q_1 = q_0 = 0\\ \\text{(immediately)}' },
  ],
  legalStates: ['00', '01', '10'],
  defaultDelays: { tcq: 8, gate: 6 },
}

export const div3SyncRst: Netlist = {
  id: 'm8-div3-sync-rst',
  name: '/3（11 lock-up）＋ 同步 reset',
  description: 'rst 是 data path 的一部分：d = next-state AND NOT rst，要等下一個 rising edge 才生效。',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'rst', initial: 0, description: '同步 reset（active high）：下一個 edge 才把 state 清成 00' }],
  flops: [ff(0, false), ff(1, false)],
  gates: [
    { out: 'rst_b', inputs: ['rst'], fn: (v) => not(v.rst), delay: 6, label: 'INV', kind: 'inv' },
    { out: 'n0', inputs: ['q0', 'q1'], fn: (v) => or(nor(v.q0, v.q1), and(v.q0, v.q1)), delay: 14, label: 'XNOR', kind: 'xnor' },
    { out: 'd0', inputs: ['n0', 'rst_b'], fn: (v) => and(v.n0, v.rst_b), delay: 14, label: 'AND0', kind: 'and' },
    { out: 'd1', inputs: ['q0', 'rst_b'], fn: (v) => and(v.q0, v.rst_b), delay: 14, label: 'AND1', kind: 'and' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'q1',
  watch: ['rst_b'],
  equations: [
    { target: 'd0', text: 'd0 = XNOR(q1, q0) AND NOT rst', latex: 'd_0 = \\overline{q_1 \\oplus q_0}\\cdot\\overline{rst}' },
    { target: 'd1', text: 'd1 = q0 AND NOT rst', latex: 'd_1 = q_0\\cdot\\overline{rst}' },
  ],
  legalStates: ['00', '01', '10'],
  defaultDelays: { tcq: 8, gate: 6 },
}

/* ------------------------------------------------------------------------------------------------
 * 7. div3Recover 的顯示用版本：與 examples 的 div3Recover 邏輯完全相同（d1 = q0 AND NOT q1），
 *    只是把 NOT q1 直接接到 FF1 的 Q̄ 輸出（q1_b），電路圖上不用多畫一個 inverter。
 * ---------------------------------------------------------------------------------------------- */
export const div3RecoverQb: Netlist = {
  id: 'm8-div3-recover-qb',
  name: 'Divide-by-3（self-recovering，用 Q̄）',
  description: 'd0 = NOR(q1, q0)，d1 = q0 AND q1_b：state 11 一個 cycle 回到 00。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [ff(0), ff(1)],
  gates: [
    { out: 'd0', inputs: ['q0', 'q1'], fn: (v) => nor(v.q0, v.q1), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'd1', inputs: ['q0', 'q1_b'], fn: (v) => and(v.q0, v.q1_b), delay: 14, label: 'AND', kind: 'and', description: 'd1 = q0 AND q1_b：修正 lock-up 新增的 gate' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'q1',
  watch: ['d0', 'd1'],
  equations: [
    { target: 'd0', text: 'd0 = NOT(q1 OR q0)', latex: 'd_0 = \\overline{q_1 + q_0}' },
    { target: 'd1', text: 'd1 = q0 AND NOT q1', latex: 'd_1 = q_0\\,\\overline{q_1}' },
  ],
  legalStates: ['00', '01', '10'],
  defaultDelays: { tcq: 8, gate: 6 },
}

/** 把 bit-string 轉成 initialState（給 DividerSimPanel / createSim 用） */
export function stateFromString(netlist: Netlist, s: string): Values {
  const v: Values = {}
  const w = netlist.stateOrder.length
  const padded = s.replace(/[^01]/g, '').padStart(w, '0').slice(-w)
  netlist.stateOrder.forEach((b, i) => {
    v[b] = padded[i] === '1' ? 1 : 0
  })
  return v
}
