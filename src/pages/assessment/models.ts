import type { Netlist } from '@/models/divider/types'
import { and, not, or } from '@/utils/bits'

/**
 * Assessment A / B 專用電路：3-flop「twisted-ring（Johnson）」型 /5 /6 dual-modulus divider。
 * 課程中沒有出現過這種結構——這正是評量的目的：用學過的方法分析一個陌生電路。
 *
 * state 順序 (q2 q1 q0)，三個 DFF 都由同一個 clk 的 rising edge 觸發（synchronous）。
 *
 * next-state：
 *   d0 = NOT q2
 *   d1 = q0
 *   d2 = q1 AND (q0 OR mod)
 *
 * mod = 0（/5）：000 → 001 → 011 → 111 → 110 → 000 …（週期 5）
 * mod = 1（/6）：000 → 001 → 011 → 111 → 110 → 100 → 000 …（週期 6）
 *
 * 輸出 div_out = q2（直接取自 flop，沒有 decode logic ⇒ 沒有 decode glitch）
 *   /5：q2 在 111、110 兩個 state 為 1 ⇒ high = 2T，low = 3T，duty = 40%
 *   /6：q2 在 111、110、100 三個 state 為 1 ⇒ high = 3T，low = 3T，duty = 50%
 *
 * mod 只在 state 110（q1 = 1、q0 = 0）時影響 d2：
 *   mod = 0 ⇒ d2 = 0 ⇒ 下一個 state 000（提早結束，/5）
 *   mod = 1 ⇒ d2 = 1 ⇒ 下一個 state 100（多待一個 cycle，/6）
 *
 * unused states：010、101、100（100 在 /6 是合法 state，在 /5 是 unused）
 *   mod = 0：010 → 001、101 → 010 → 001、100 → 000：全部 1～2 個 edge 回到主循環（self-recovering）
 *   mod = 1：010 → 101 → 010 → …：兩個 state 互相跳，永遠回不到主循環（lock-up）⇒ 需要 reset
 *
 * 這些結論都在 models.test.ts 用 simulate / buildStateGraph 驗證過。
 */
export const johnson56: Netlist = {
  id: 'assess-johnson56',
  name: 'Assessment：3-flop /5 /6 divider',
  description: '三個同步 DFF 加 INV、OR、AND；mod=0 時 /5，mod=1 時 /6。',
  clocks: [{ name: 'clk', description: 'input clock' }],
  inputs: [{ name: 'mod', initial: 0, description: 'modulus control：0 ⇒ /5，1 ⇒ /6' }],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 10, label: 'FF0', description: 'state bit q0（LSB）' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 10, label: 'FF1', description: 'state bit q1' },
    { q: 'q2', d: 'd2', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 10, label: 'FF2', description: 'state bit q2（MSB）＝ div_out' },
  ],
  gates: [
    { out: 'd0', inputs: ['q2'], fn: (v) => not(v.q2), delay: 5, label: 'INV', kind: 'inv', description: 'd0 = NOT q2' },
    { out: 'd1', inputs: ['q0'], fn: (v) => v.q0, delay: 2, label: 'wire', kind: 'buf', description: 'd1 = q0（純走線）' },
    { out: 'or_m', inputs: ['q0', 'mod'], fn: (v) => or(v.q0, v.mod), delay: 11, label: 'OR', kind: 'or', description: 'or_m = q0 OR mod' },
    { out: 'd2', inputs: ['q1', 'or_m'], fn: (v) => and(v.q1, v.or_m), delay: 10, label: 'AND', kind: 'and', description: 'd2 = q1 AND or_m' },
    { out: 'div_out', inputs: ['q2'], fn: (v) => v.q2, delay: 0, label: 'wire', kind: 'buf', description: 'div_out = q2' },
  ],
  stateOrder: ['q2', 'q1', 'q0'],
  output: 'div_out',
  watch: ['or_m'],
  equations: [
    { target: 'd0', text: 'd0 = NOT q2', latex: 'd_0 = \\overline{q_2}' },
    { target: 'd1', text: 'd1 = q0', latex: 'd_1 = q_0' },
    { target: 'd2', text: 'd2 = q1 AND (q0 OR mod)', latex: 'd_2 = q_1 \\cdot (q_0 + mod)' },
    { target: 'div_out', text: 'div_out = q2', latex: 'div\\_out = q_2' },
  ],
  legalStates: ['000', '001', '011', '111', '110', '100'],
  defaultDelays: { tcq: 10, gate: 8 },
}

/**
 * 深入模式用：把 lock-up 修掉的 self-recovering 版本。
 * 只改一條 equation：d2 = q1 AND (q0 OR (mod AND q2))
 *   - 主循環上 mod 只在 110 被看（此時 q2 = 1，所以 mod·q2 = mod）⇒ 功能完全不變
 *   - 010（q2 = 0）：mod·q2 = 0 ⇒ d2 = 0 ⇒ 010 → 001，一個 edge 回到主循環
 *   - 101 → 010 → 001，兩個 edge 回到主循環
 * 代價：mod path 多一級 AND（mod → AND → OR → AND → d2），dual-modulus 模式的 critical path 變長。
 */
export const johnson56SelfRecover: Netlist = {
  ...johnson56,
  id: 'assess-johnson56-sr',
  name: 'Self-recovering /5 /6（d2 加入 q2 條件）',
  description: 'd2 = q1 AND (q0 OR (mod AND q2))：010 / 101 不再互鎖。',
  gates: [
    { out: 'd0', inputs: ['q2'], fn: (v) => not(v.q2), delay: 5, label: 'INV', kind: 'inv' },
    { out: 'd1', inputs: ['q0'], fn: (v) => v.q0, delay: 2, label: 'wire', kind: 'buf' },
    { out: 'and_m', inputs: ['mod', 'q2'], fn: (v) => and(v.mod, v.q2), delay: 10, label: 'AND_M', kind: 'and' },
    { out: 'or_m', inputs: ['q0', 'and_m'], fn: (v) => or(v.q0, v.and_m), delay: 11, label: 'OR', kind: 'or' },
    { out: 'd2', inputs: ['q1', 'or_m'], fn: (v) => and(v.q1, v.or_m), delay: 10, label: 'AND', kind: 'and' },
    { out: 'div_out', inputs: ['q2'], fn: (v) => v.q2, delay: 0, label: 'wire', kind: 'buf' },
  ],
  watch: ['and_m', 'or_m'],
  equations: [
    { target: 'd0', text: 'd0 = NOT q2', latex: 'd_0 = \\overline{q_2}' },
    { target: 'd1', text: 'd1 = q0', latex: 'd_1 = q_0' },
    { target: 'd2', text: 'd2 = q1 AND (q0 OR (mod AND q2))', latex: 'd_2 = q_1 \\cdot (q_0 + mod \\cdot q_2)' },
    { target: 'div_out', text: 'div_out = q2', latex: 'div\\_out = q_2' },
  ],
}

/** 理論 state 序列（從 reset state 000 出發，一個完整循環，最後回到 000 之前的 state 為止） */
export const JOHNSON56_CYCLE: Record<0 | 1, string[]> = {
  0: ['000', '001', '011', '111', '110'],
  1: ['000', '001', '011', '111', '110', '100'],
}

/** 理論 divide ratio 與 duty cycle */
export const JOHNSON56_SPEC = {
  ratio: { 0: 5, 1: 6 } as Record<0 | 1, number>,
  duty: { 0: 2 / 5, 1: 3 / 6 } as Record<0 | 1, number>,
  /** mod 真正被「消費」的 state：只有離開 110 的那個 edge 會看 mod */
  modSampledInState: '110',
  lockupStates: { 0: [] as string[], 1: ['010', '101'] },
}
