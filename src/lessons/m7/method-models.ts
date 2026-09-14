import type { Netlist } from '@/models/divider/types'
import { and, mux, nor, not } from '@/utils/bits'

/**
 * Lesson 7-2 練習電路：programmable /3 /4 divider
 *
 * 三個 flop：q1 q0 是 Gray-code counter，q2 是輸出 retiming flop。
 *   d0 = NOT q1                              （INV，兩種 mode 共用）
 *   d1 = sel ? q0 : (q0 AND NOT q1)          （2:1 MUX：in0 = AND 輸出，in1 = q0）
 *   d2 = NOR(q1, q0)                         （state 00 偵測 → 每個循環 high 一個 cycle）
 *   div_out = q2
 *
 * sel = 0（/3）：q1q0 = 00 → 01 → 11 → 00；完整 state (q2 q1 q0) = 000 → 101 → 011 → 000
 * sel = 1（/4）：q1q0 = 00 → 01 → 11 → 10 → 00；完整 state = 000 → 101 → 011 → 010 → 000
 * unused state q1q0 = 10（sel=0 時）→ d0 = 0, d1 = 0 → 00，一個 cycle 內回到主循環（無 lock-up）。
 *
 * Gate delay（ps，max）：INV 7（fanout 2）、AND 11、MUX 14、NOR 12；tCQ 8。
 * 用意：sel=0 時最長 path 是 q1 → INV → AND → MUX → FF1.D = 8+7+11+14 = 40 ps；
 *       sel=1 時 MUX 選 in1，AND 那條不被 sensitize，最長變成 q0 → MUX → FF1.D = 8+14 = 22 ps。
 *
 * real-delay 模擬（simulate，T = 100）驗證過的事件時間：
 *   sel=0 edge 1（t=100）：q0 108 → a 119 → d1 133（= 8+11+14，p3）；edge 2（t=200）：q1 208 → d0 215 → a 226 → d1 240（= 8+7+11+14，p2）
 *   sel=1 edge 3（t=300）：q0 308 → d1 322（= 8+14，p4）
 *   sel=1 edge 1 的 d1 出現在 133 而不是 122：engine 的 gate 是 inertial-delay 模型，任何 input 改變都會
 *   重算輸出並重新排程；a（MUX 的 in0）在 119 改變，把 d1 的事件推到 119+14。真實的 AOI / TG MUX 在
 *   sel=1 時 in0 被 gate 掉，不會有這個效應——這是「模擬器 artifact vs STA sensitization」的教材。
 */
export const progDiv34: Netlist = {
  id: 'prog-div34',
  name: 'Programmable /3 /4（Gray counter + output flop）',
  description: 'sel=0 走 000→101→011，sel=1 走 000→101→011→010；div_out = q2 每個循環 high 一個 cycle。',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'sel', initial: 0, description: 'sel=0：/3；sel=1：/4' }],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
    { q: 'q2', d: 'd2', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF2' },
  ],
  gates: [
    { out: 'd0', inputs: ['q1'], fn: (v) => not(v.q1), delay: 7, label: 'INV', kind: 'inv', description: 'd0 = NOT q1（fanout 2：FF0.D 與 AND）' },
    { out: 'a', inputs: ['q0', 'd0'], fn: (v) => and(v.q0, v.d0), delay: 11, label: 'AND', kind: 'and', description: 'a = q0 AND NOT q1' },
    { out: 'd1', inputs: ['sel', 'a', 'q0'], fn: (v) => mux(v.sel, v.a, v.q0), delay: 14, label: 'MUX', kind: 'mux', description: 'd1 = sel ? q0 : a' },
    { out: 'd2', inputs: ['q1', 'q0'], fn: (v) => nor(v.q1, v.q0), delay: 12, label: 'NOR', kind: 'nor', description: 'd2 = NOR(q1, q0)：state 00 偵測' },
    { out: 'div_out', inputs: ['q2'], fn: (v) => v.q2, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['q2', 'q1', 'q0'],
  output: 'div_out',
  watch: ['d0', 'a', 'd1', 'd2'],
  equations: [
    { target: 'd0', text: 'd0 = NOT q1', latex: 'd_0 = \\overline{q_1}' },
    { target: 'a', text: 'a = q0 AND NOT q1', latex: 'a = q_0 \\cdot \\overline{q_1}' },
    { target: 'd1', text: 'd1 = sel ? q0 : a', latex: 'd_1 = sel\\,?\\,q_0 : (q_0 \\cdot \\overline{q_1})' },
    { target: 'd2', text: 'd2 = NOR(q1, q0)', latex: 'd_2 = \\overline{q_1 + q_0}' },
    { target: 'div_out', text: 'div_out = q2', latex: 'div\\_out = q_2' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * Sensitization 反例：/2 /3 cell，但 AND gate 故意做得慢（18 ps，例如 fanout 大）。
 *   d0 = NOR(q1, q0)
 *   d1 = q0 AND mod
 * mod = 1：00 → 01 → 10 → 00（/3）；AND path q0 → AND → FF1.D = 8 + 18 = 26 ps 是最長的。
 * mod = 0：00 → 01 → 00（/2）；d1 恆為 0，q1 永遠不變 ⇒ AND path 根本不會被 sensitize，
 *          critical path 變成 NOR path（8 + 12 = 20 ps）。
 * 輸出 = q0：mod=0 時 /2（50%），mod=1 時 /3（duty 1/3）。
 */
export const modeAndCounter: Netlist = {
  id: 'mode-and-counter',
  name: '/2 /3 cell（AND 路徑刻意較慢）',
  description: 'mod=0：d1 恆 0，AND 路徑不被 sensitize；mod=1：AND 路徑才是 critical。',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'mod', initial: 0, description: 'mod=0：/2；mod=1：/3' }],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
  ],
  gates: [
    { out: 'd0', inputs: ['q1', 'q0'], fn: (v) => nor(v.q1, v.q0), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'd1', inputs: ['q0', 'mod'], fn: (v) => and(v.q0, v.mod), delay: 18, label: 'AND (slow)', kind: 'and', description: '刻意做慢的 AND：fanout 大、drive 小' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'q0',
  watch: ['d0', 'd1'],
  equations: [
    { target: 'd0', text: 'd0 = NOR(q1, q0)', latex: 'd_0 = \\overline{q_1 + q_0}' },
    { target: 'd1', text: 'd1 = q0 AND mod', latex: 'd_1 = q_0 \\cdot mod' },
  ],
  legalStates: ['00', '01', '10'],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * 練習用：同一個 programmable divider，但 sel 預設為 1（/4）。
 * 讓使用者在「另一個 mode」重跑 Step 5～8；電路、delay、equations 全部與 progDiv34 相同。
 * 從 reset 出發：000 → 101 → 011 → 010 → 000（/4，div_out duty 1/4）。
 */
export const progDiv34Sel1: Netlist = {
  ...progDiv34,
  id: 'prog-div34-sel1',
  name: 'Programmable /3 /4（練習：sel 預設 1）',
  description: 'sel=1：000→101→011→010→000（/4）。把 sel 切回 0 可以比較兩種 mode 的 d1 到達時間。',
  inputs: [{ name: 'sel', initial: 1, description: 'sel=0：/3；sel=1：/4（練習預設）' }],
}
