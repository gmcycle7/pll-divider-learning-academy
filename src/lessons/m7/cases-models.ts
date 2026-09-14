import type { Netlist } from '@/models/divider/types'
import { and, mux, not, xor } from '@/utils/bits'

/**
 * 案例 B：programmable /4 /6 divider（3-bit synchronous counter + terminal-count decode + MUX）
 *
 * state (q2 q1 q0) 從 000 遞增；遇到 terminal count（tc = 1）時下一個 state 清為 000。
 *   sel = 0：tc = DEC4 = (state == 011) ⇒ 000 → 001 → 010 → 011 → 000        週期 4
 *   sel = 1：tc = DEC6 = (state == 101) ⇒ 000 → 001 → 010 → 011 → 100 → 101 → 000   週期 6
 *
 * next-state：
 *   inc0 = NOT q0                 inc1 = q1 XOR q0                 inc2 = q2 XOR (q1 AND q0)
 *   tc4  = NOT q2 AND q1 AND q0   tc6  = q2 AND NOT q1 AND q0      tc = sel ? tc6 : tc4
 *   d_i  = inc_i AND NOT tc
 * 輸出 div_out = q1：/4 時 q1 = 0,0,1,1（50%）；/6 時 q1 = 0,0,1,1,0,0（duty 1/3）。
 *
 * critical path 候選：
 *   (a) q → DEC (14) → MUX2 (10) → CLR AND (10) → D   = tCQ 8 + 34 = 42 ps
 *   (b) q → AND(q1,q0) (10) → XOR (12) → CLR AND (10) → D = tCQ 8 + 32 = 40 ps
 * 哪一條 decode 被 sensitize 由 sel 決定（sel=0 只有 DEC4 → MUX 那條會影響輸出）。
 */
export const progDiv46: Netlist = {
  id: 'prog-div46',
  name: 'Programmable /4 /6（counter + decode + MUX）',
  description: 'sel=0：000→001→010→011→000（/4）；sel=1：000→…→101→000（/6）。next-state = 遞增，遇 terminal count 清零。',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'sel', initial: 0, description: 'sel=0：/4（terminal count = 011）；sel=1：/6（terminal count = 101）' }],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
    { q: 'q2', d: 'd2', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF2' },
  ],
  gates: [
    { out: 'inc0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INC0 (INV)', kind: 'inv' },
    { out: 'c01', inputs: ['q0', 'q1'], fn: (v) => and(v.q1, v.q0), delay: 10, label: 'AND(q1,q0)', kind: 'and' },
    { out: 'inc1', inputs: ['q0', 'q1'], fn: (v) => xor(v.q1, v.q0), delay: 12, label: 'INC1 (XOR)', kind: 'xor' },
    { out: 'inc2', inputs: ['q2', 'c01'], fn: (v) => xor(v.q2, v.c01), delay: 12, label: 'INC2 (XOR)', kind: 'xor' },
    { out: 'tc4', inputs: ['q0', 'q1', 'q2'], fn: (v) => and(not(v.q2), v.q1, v.q0), delay: 14, label: 'DEC4 (=011)', kind: 'and' },
    { out: 'tc6', inputs: ['q0', 'q1', 'q2'], fn: (v) => and(v.q2, not(v.q1), v.q0), delay: 14, label: 'DEC6 (=101)', kind: 'and' },
    { out: 'tc', inputs: ['tc4', 'tc6', 'sel'], fn: (v) => mux(v.sel, v.tc4, v.tc6), delay: 10, label: 'MUX2 (sel)', kind: 'mux' },
    { out: 'd0', inputs: ['inc0', 'tc'], fn: (v) => and(v.inc0, not(v.tc)), delay: 10, label: 'CLR0 (AND ¬tc)', kind: 'and' },
    { out: 'd1', inputs: ['inc1', 'tc'], fn: (v) => and(v.inc1, not(v.tc)), delay: 10, label: 'CLR1 (AND ¬tc)', kind: 'and' },
    { out: 'd2', inputs: ['inc2', 'tc'], fn: (v) => and(v.inc2, not(v.tc)), delay: 10, label: 'CLR2 (AND ¬tc)', kind: 'and' },
    { out: 'div_out', inputs: ['q1'], fn: (v) => v.q1, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['q2', 'q1', 'q0'],
  output: 'div_out',
  watch: ['tc'],
  equations: [
    { target: 'inc', text: 'inc = state + 1  (inc0 = NOT q0, inc1 = q1 XOR q0, inc2 = q2 XOR (q1 AND q0))', latex: 'inc = state + 1' },
    { target: 'tc4', text: 'tc4 = NOT q2 AND q1 AND q0  (state == 011)', latex: 'tc_4 = \\overline{q_2}\\,q_1\\,q_0' },
    { target: 'tc6', text: 'tc6 = q2 AND NOT q1 AND q0  (state == 101)', latex: 'tc_6 = q_2\\,\\overline{q_1}\\,q_0' },
    { target: 'tc', text: 'tc = sel ? tc6 : tc4', latex: 'tc = sel\\,?\\,tc_6 : tc_4' },
    { target: 'd', text: 'd_i = inc_i AND NOT tc  (tc=1 時清為 000)', latex: 'd_i = inc_i \\cdot \\overline{tc}' },
    { target: 'div_out', text: 'div_out = q1', latex: 'div\\_out = q_1' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * 練習用變形：把 decode 換成 /5（terminal count = 100）與 /7（terminal count = 110）。
 * DEC5 = q2 AND NOT q1 AND NOT q0 有兩個反相輸入 ⇒ 多一級 inverter（或改用 PMOS stack 較深的 NOR 型 decode），delay 14 → 18 ps。
 * 輸出改用 q2（/5：q2 = 0,0,0,0,1；/7：q2 = 0,0,0,0,1,1,1），因為 /7 時 q1 一個週期內會 rising 兩次。
 */
export const progDiv57: Netlist = {
  ...progDiv46,
  id: 'prog-div57',
  name: 'Programmable /5 /7（decode 改為 =100 / =110）',
  description: 'sel=0：000→…→100→000（/5）；sel=1：000→…→110→000（/7）。',
  inputs: [{ name: 'sel', initial: 0, description: 'sel=0：/5（terminal count = 100）；sel=1：/7（terminal count = 110）' }],
  gates: [
    { out: 'inc0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INC0 (INV)', kind: 'inv' },
    { out: 'c01', inputs: ['q0', 'q1'], fn: (v) => and(v.q1, v.q0), delay: 10, label: 'AND(q1,q0)', kind: 'and' },
    { out: 'inc1', inputs: ['q0', 'q1'], fn: (v) => xor(v.q1, v.q0), delay: 12, label: 'INC1 (XOR)', kind: 'xor' },
    { out: 'inc2', inputs: ['q2', 'c01'], fn: (v) => xor(v.q2, v.c01), delay: 12, label: 'INC2 (XOR)', kind: 'xor' },
    { out: 'tc5', inputs: ['q0', 'q1', 'q2'], fn: (v) => and(v.q2, not(v.q1), not(v.q0)), delay: 18, label: 'DEC5 (=100)', kind: 'and' },
    { out: 'tc7', inputs: ['q0', 'q1', 'q2'], fn: (v) => and(v.q2, v.q1, not(v.q0)), delay: 14, label: 'DEC7 (=110)', kind: 'and' },
    { out: 'tc', inputs: ['tc5', 'tc7', 'sel'], fn: (v) => mux(v.sel, v.tc5, v.tc7), delay: 10, label: 'MUX2 (sel)', kind: 'mux' },
    { out: 'd0', inputs: ['inc0', 'tc'], fn: (v) => and(v.inc0, not(v.tc)), delay: 10, label: 'CLR0 (AND ¬tc)', kind: 'and' },
    { out: 'd1', inputs: ['inc1', 'tc'], fn: (v) => and(v.inc1, not(v.tc)), delay: 10, label: 'CLR1 (AND ¬tc)', kind: 'and' },
    { out: 'd2', inputs: ['inc2', 'tc'], fn: (v) => and(v.inc2, not(v.tc)), delay: 10, label: 'CLR2 (AND ¬tc)', kind: 'and' },
    { out: 'div_out', inputs: ['q2'], fn: (v) => v.q2, delay: 0, label: 'wire', kind: 'buf' },
  ],
  equations: [
    { target: 'inc', text: 'inc = state + 1', latex: 'inc = state + 1' },
    { target: 'tc5', text: 'tc5 = q2 AND NOT q1 AND NOT q0  (state == 100)', latex: 'tc_5 = q_2\\,\\overline{q_1}\\,\\overline{q_0}' },
    { target: 'tc7', text: 'tc7 = q2 AND q1 AND NOT q0  (state == 110)', latex: 'tc_7 = q_2\\,q_1\\,\\overline{q_0}' },
    { target: 'tc', text: 'tc = sel ? tc7 : tc5', latex: 'tc = sel\\,?\\,tc_7 : tc_5' },
    { target: 'd', text: 'd_i = inc_i AND NOT tc', latex: 'd_i = inc_i \\cdot \\overline{tc}' },
    { target: 'div_out', text: 'div_out = q2', latex: 'div\\_out = q_2' },
  ],
}

/**
 * Lesson 7-4 練習用：latch-based clock gating cell（正確做法）。
 *   en_l 是一個 active-low latch（clk = 0 時 transparent，clk = 1 時 hold）
 *   gclk = clk AND en_l
 * 因為 en_l 只會在 clk = 0 期間改變，所以 gclk 不會出現 runt pulse。
 * 對照組：dualMod12Glitchy（en 直接由 comb 產生，在 clk = 1 期間改變 ⇒ runt）。
 */
export const clockGateLatch: Netlist = {
  id: 'cg-latch',
  name: 'Latch-based clock gating cell',
  description: 'en 先經過 clk-low transparent latch，再與 clk AND；en 在 clk=1 期間改變也不會產生 runt。',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'en', initial: 1, description: 'gating enable（可在任意時間改變）' }],
  flops: [{ q: 'q0', d: 'd0', clk: 'gclk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0 (gated)' }],
  latches: [{ q: 'en_l', d: 'en', en: 'clk', activeHigh: false, delay: 6, label: 'EN latch (clk-low transparent)' }],
  gates: [
    { out: 'gclk', inputs: ['clk', 'en_l'], fn: (v) => and(v.clk, v.en_l), delay: 6, label: 'AND (gate)', kind: 'and' },
    { out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV', kind: 'inv' },
    { out: 'div_out', inputs: ['q0'], fn: (v) => v.q0, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['q0'],
  output: 'div_out',
  watch: ['en_l', 'gclk'],
  equations: [
    { target: 'en_l', text: 'en_l = en  (transparent while clk = 0；clk = 1 時保持)', latex: 'en_l \\leftarrow en\\ (clk = 0)' },
    { target: 'gclk', text: 'gclk = clk AND en_l', latex: 'gclk = clk \\cdot en_l' },
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}
