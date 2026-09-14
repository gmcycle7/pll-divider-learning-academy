import type { Netlist, SignalTrace, StepRecord, Values } from '@/models/divider/types'
import { and, nor, not, or, xor } from '@/utils/bits'
import { createSim } from '@/models/divider/engine'
import { findPeriod, measureDivide } from '@/models/divider/analysis'
import { runDsm } from '@/models/fractional/dsm'
import { analyzeSequence, dftMagnitude } from '@/models/fractional/sequence'
import { dualMod23, mmd2 } from '@/models/divider/examples'
import { accumulate, splitCode, type DtcConfig } from '@/models/phase/dtc'

/**
 * Lesson 6-1：accumulator 型 /2.75 fractional divider（gate-level）
 *
 * 結構 = /2 /3 cell（q1 q0，與 Lesson 3 相同）+ 2-bit accumulator（a1 a0）
 *
 * accumulator 每個 output 週期加 K = 3（mod M = 4），carry-out 就是 mod：
 *   acc + 3 ≥ 4  ⇔  acc ≥ 1  ⇔  (a1 OR a0)          → mod = a1 + a0
 *   (acc + 3) mod 4 = acc − 1                          → 2-bit 遞減：da0 = a0 ⊕ en，da1 = a1 ⊕ (en · ā0)
 *
 * 更新時機：en = q0。state 01 在每個 output 週期只出現一次（/2 與 /3 都一樣），
 * 所以 accumulator 每個 output 週期恰好走一步；而 mod 在 state 01 被 d1 = q0·mod 取樣時，
 * accumulator 仍是「舊值」——同一個 edge 同時取樣 mod 與更新 accumulator。
 *
 * 從 reset（a1a0q1q0 = 0000）開始：
 *   cycle 1：acc = 0 → mod = 0 → /2，離開 01 時 acc ← 3
 *   cycle 2：acc = 3 → mod = 1 → /3，acc ← 2
 *   cycle 3：acc = 2 → /3，acc ← 1
 *   cycle 4：acc = 1 → /3，acc ← 0
 *   ⇒ 序列 2,3,3,3,2,3,3,3 …，平均 (2+3+3+3)/4 = 2.75，state 週期 11 個 clk edge
 */
export const frac275: Netlist = {
  id: 'frac275',
  name: 'Accumulator /2.75（/2 /3 cell + 2-bit accumulator，K=3, M=4）',
  description: 'accumulator 每個 output 週期加 3（mod 4），carry 決定該週期走 /2 或 /3。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0', description: '/2 /3 cell state bit q0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1', description: '/2 /3 cell state bit q1' },
    { q: 'a0', d: 'da0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'ACC0', description: 'accumulator bit 0' },
    { q: 'a1', d: 'da1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'ACC1', description: 'accumulator bit 1' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0', 'q1'], fn: (v) => nor(v.q0, v.q1), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'mod', inputs: ['a0', 'a1'], fn: (v) => or(v.a0, v.a1), delay: 10, label: 'OR (carry)', kind: 'or' },
    { out: 'd1', inputs: ['q0', 'mod'], fn: (v) => and(v.q0, v.mod), delay: 10, label: 'AND', kind: 'and' },
    { out: 'da0', inputs: ['a0', 'q0'], fn: (v) => xor(v.a0, v.q0), delay: 12, label: 'XOR0', kind: 'xor' },
    { out: 'na0', inputs: ['a0'], fn: (v) => not(v.a0), delay: 6, label: 'INV', kind: 'inv' },
    { out: 'bw', inputs: ['q0', 'na0'], fn: (v) => and(v.q0, v.na0), delay: 10, label: 'AND (borrow)', kind: 'and' },
    { out: 'da1', inputs: ['a1', 'bw'], fn: (v) => xor(v.a1, v.bw), delay: 12, label: 'XOR1', kind: 'xor' },
    { out: 'div_out', inputs: ['d0'], fn: (v) => v.d0, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['a1', 'a0', 'q1', 'q0'],
  output: 'div_out',
  watch: ['mod'],
  equations: [
    { target: 'd0', text: 'd0 = NOT(q1 OR q0)', latex: 'd_0 = \\overline{q_1 + q_0}' },
    { target: 'mod', text: 'mod = a1 OR a0   (accumulator carry：acc + 3 ≥ 4)', latex: 'mod = a_1 + a_0' },
    { target: 'd1', text: 'd1 = q0 AND mod', latex: 'd_1 = q_0 \\cdot mod' },
    { target: 'da0', text: 'da0 = a0 XOR q0   (en = q0)', latex: 'd_{a0} = a_0 \\oplus q_0' },
    { target: 'da1', text: 'da1 = a1 XOR (q0 AND NOT a0)   (borrow)', latex: 'd_{a1} = a_1 \\oplus (q_0 \\cdot \\overline{a_0})' },
    { target: 'div_out', text: 'div_out = d0（state q1q0 = 00 時為 1）', latex: 'div\\_out = \\overline{q_1 + q_0}' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * 練習用「陌生電路」：同樣的 /2 /3 cell，但 accumulator 改成 2-bit 遞增（K = 1, M = 4），
 * carry = (acc + 1 ≥ 4) ⇔ acc = 3 ⇔ a1 AND a0。
 *   da0 = a0 ⊕ q0，da1 = a1 ⊕ (q0 · a0)，mod = a1 · a0
 * 從 reset：cycle 1..3 acc = 0,1,2 → /2；cycle 4 acc = 3 → /3 ⇒ 2,2,2,3，平均 2.25，state 週期 9。
 * 這其實就是 Lesson 6-2 的一階 accumulator DSM（k/m = 1/4）硬體版本。
 */
export const frac225: Netlist = {
  id: 'frac225',
  name: '練習電路（/2 /3 cell + 2-bit up-counter accumulator）',
  description: 'accumulator 每個 output 週期加 1（mod 4），acc = 3 時 carry。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
    { q: 'a0', d: 'da0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'ACC0' },
    { q: 'a1', d: 'da1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'ACC1' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0', 'q1'], fn: (v) => nor(v.q0, v.q1), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'mod', inputs: ['a0', 'a1'], fn: (v) => and(v.a0, v.a1), delay: 10, label: 'AND (carry)', kind: 'and' },
    { out: 'd1', inputs: ['q0', 'mod'], fn: (v) => and(v.q0, v.mod), delay: 10, label: 'AND', kind: 'and' },
    { out: 'da0', inputs: ['a0', 'q0'], fn: (v) => xor(v.a0, v.q0), delay: 12, label: 'XOR0', kind: 'xor' },
    { out: 'cy', inputs: ['q0', 'a0'], fn: (v) => and(v.q0, v.a0), delay: 10, label: 'AND (carry-in)', kind: 'and' },
    { out: 'da1', inputs: ['a1', 'cy'], fn: (v) => xor(v.a1, v.cy), delay: 12, label: 'XOR1', kind: 'xor' },
    { out: 'div_out', inputs: ['d0'], fn: (v) => v.d0, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['a1', 'a0', 'q1', 'q0'],
  output: 'div_out',
  watch: ['mod'],
  equations: [
    { target: 'd0', text: 'd0 = NOT(q1 OR q0)', latex: 'd_0 = \\overline{q_1 + q_0}' },
    { target: 'mod', text: 'mod = a1 AND a0', latex: 'mod = a_1 \\cdot a_0' },
    { target: 'd1', text: 'd1 = q0 AND mod', latex: 'd_1 = q_0 \\cdot mod' },
    { target: 'da0', text: 'da0 = a0 XOR q0', latex: 'd_{a0} = a_0 \\oplus q_0' },
    { target: 'da1', text: 'da1 = a1 XOR (q0 AND a0)', latex: 'd_{a1} = a_1 \\oplus (q_0 \\cdot a_0)' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * Lesson 6-2 練習用「陌生電路」：同樣的 /2 /3 cell，但 accumulator 加寬成 3 bit（a2 a1 a0）
 * 而且每個 output 週期加 K = 3（mod M = 8）。這是一階 accumulator DSM 的 k/m = 3/8 硬體版本。
 *
 * 「+3」的 3-bit 加法（加數 = 011）逐 bit 展開，en = q0：
 *   bit0：s0 = a0 ⊕ 1                    → da0 = a0 ⊕ q0，              進位 c0 = a0
 *   bit1：s1 = a1 ⊕ 1 ⊕ a0 = a1 ⊕ ā0     → da1 = a1 ⊕ (q0 · ā0)，       進位 c1 = a1 + a0
 *   bit2：s2 = a2 ⊕ c1                   → da2 = a2 ⊕ (q0 · (a1 + a0))
 *   carry-out：c2 = a2 · c1 = a2 · (a1 + a0)  ⇔ acc ≥ 5 ⇔ acc + 3 ≥ 8  → mod
 * 所以 mod = a2 · (a1 OR a0)，而 o01 = a1 OR a0 這個中間節點同時餵給 bit2 的進位與 carry decode。
 *
 * 從 reset（a2a1a0 = 000）逐個 output 週期：
 *   acc = 0 → mod 0 → /2，acc ← 3
 *   acc = 3 → mod 0 → /2，acc ← 6
 *   acc = 6 → mod 1 → /3，acc ← 1
 *   acc = 1 → /2，acc ← 4；acc = 4 → /2，acc ← 7；acc = 7 → /3，acc ← 2
 *   acc = 2 → /2，acc ← 5；acc = 5 → /3，acc ← 0（回到 reset）
 *   ⇒ 除數序列 2,2,3,2,2,3,2,3，8 個週期裡 carry 3 次，
 *     平均 19/8 = 2.375 = 2 + 3/8，state 週期 19 個 clk edge。
 */
export const frac2375: Netlist = {
  id: 'frac2375',
  name: '練習電路（/2 /3 cell + 3-bit accumulator）',
  description: 'accumulator 每個 output 週期加 3（mod 8），進位時該週期走 /3。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0', description: '/2 /3 cell state bit q0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1', description: '/2 /3 cell state bit q1' },
    { q: 'a0', d: 'da0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'ACC0', description: 'accumulator bit 0' },
    { q: 'a1', d: 'da1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'ACC1', description: 'accumulator bit 1' },
    { q: 'a2', d: 'da2', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'ACC2', description: 'accumulator bit 2 (MSB)' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0', 'q1'], fn: (v) => nor(v.q0, v.q1), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'o01', inputs: ['a0', 'a1'], fn: (v) => or(v.a0, v.a1), delay: 10, label: 'OR01', kind: 'or' },
    { out: 'mod', inputs: ['a2', 'o01'], fn: (v) => and(v.a2, v.o01), delay: 10, label: 'AND (carry)', kind: 'and' },
    { out: 'd1', inputs: ['q0', 'mod'], fn: (v) => and(v.q0, v.mod), delay: 10, label: 'AND', kind: 'and' },
    { out: 'da0', inputs: ['a0', 'q0'], fn: (v) => xor(v.a0, v.q0), delay: 12, label: 'XOR0', kind: 'xor' },
    { out: 'na0', inputs: ['a0'], fn: (v) => not(v.a0), delay: 6, label: 'INV', kind: 'inv' },
    { out: 'bw', inputs: ['q0', 'na0'], fn: (v) => and(v.q0, v.na0), delay: 10, label: 'AND (bit1)', kind: 'and' },
    { out: 'da1', inputs: ['a1', 'bw'], fn: (v) => xor(v.a1, v.bw), delay: 12, label: 'XOR1', kind: 'xor' },
    { out: 'cy2', inputs: ['q0', 'o01'], fn: (v) => and(v.q0, v.o01), delay: 10, label: 'AND (bit2)', kind: 'and' },
    { out: 'da2', inputs: ['a2', 'cy2'], fn: (v) => xor(v.a2, v.cy2), delay: 12, label: 'XOR2', kind: 'xor' },
    { out: 'div_out', inputs: ['d0'], fn: (v) => v.d0, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['a2', 'a1', 'a0', 'q1', 'q0'],
  output: 'div_out',
  watch: ['mod'],
  equations: [
    { target: 'd0', text: 'd0 = NOT(q1 OR q0)', latex: 'd_0 = \\overline{q_1 + q_0}' },
    { target: 'o01', text: 'o01 = a1 OR a0', latex: 'o_{01} = a_1 + a_0' },
    { target: 'mod', text: 'mod = a2 AND (a1 OR a0)   (acc + 3 ≥ 8 ⇔ acc ≥ 5)', latex: 'mod = a_2 \\cdot (a_1 + a_0)' },
    { target: 'd1', text: 'd1 = q0 AND mod', latex: 'd_1 = q_0 \\cdot mod' },
    { target: 'da0', text: 'da0 = a0 XOR q0   (en = q0)', latex: 'd_{a0} = a_0 \\oplus q_0' },
    { target: 'da1', text: 'da1 = a1 XOR (q0 AND NOT a0)', latex: 'd_{a1} = a_1 \\oplus (q_0 \\cdot \\overline{a_0})' },
    { target: 'da2', text: 'da2 = a2 XOR (q0 AND (a1 OR a0))', latex: 'd_{a2} = a_2 \\oplus (q_0 \\cdot (a_1 + a_0))' },
    { target: 'div_out', text: 'div_out = d0（state q1q0 = 00 時為 1）', latex: 'div\\_out = \\overline{q_1 + q_0}' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * Lesson 6-3：3-bit phase index counter（PMUX select 的累加器）
 * 每個 clk edge（代表一個 output 週期）若 inc = 1 就把 index 加 1；index = 7 再加 1 → 回到 0 並產生 carry。
 * carry = inc · p0 · p1 · p2（單一 4-input AND，避免 AND chain 在 011→100 時的 hazard），只在 state 111 且 inc = 1 時為 1。
 * 重點：carry 只是「數字表示上的進位」——它不會自己讓 divider 多走一個 Tvco。
 */
export const phaseCounter8: Netlist = {
  id: 'phase-counter-8',
  name: '3-bit phase index counter（0..7，wrap → carry）',
  description: 'inc = 1 時每個 edge 把 phase index 加 1；7 → 0 時 carry = 1。',
  clocks: [{ name: 'clk', description: '每個 output 週期一個 edge' }],
  inputs: [{ name: 'inc', initial: 1, description: '1：每個週期往前轉一個 phase；0：停住' }],
  flops: [
    { q: 'p0', d: 'dp0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'P0' },
    { q: 'p1', d: 'dp1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'P1' },
    { q: 'p2', d: 'dp2', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'P2' },
  ],
  gates: [
    { out: 't1', inputs: ['inc', 'p0'], fn: (v) => and(v.inc, v.p0), delay: 10, label: 'AND0', kind: 'and' },
    { out: 't2', inputs: ['t1', 'p1'], fn: (v) => and(v.t1, v.p1), delay: 10, label: 'AND1', kind: 'and' },
    { out: 'carry', inputs: ['inc', 'p0', 'p1', 'p2'], fn: (v) => and(v.inc, v.p0, v.p1, v.p2), delay: 12, label: 'AND (wrap)', kind: 'and' },
    { out: 'dp0', inputs: ['p0', 'inc'], fn: (v) => xor(v.p0, v.inc), delay: 12, label: 'XOR0', kind: 'xor' },
    { out: 'dp1', inputs: ['p1', 't1'], fn: (v) => xor(v.p1, v.t1), delay: 12, label: 'XOR1', kind: 'xor' },
    { out: 'dp2', inputs: ['p2', 't2'], fn: (v) => xor(v.p2, v.t2), delay: 12, label: 'XOR2', kind: 'xor' },
  ],
  stateOrder: ['p2', 'p1', 'p0'],
  output: 'carry',
  watch: [],
  equations: [
    { target: 'dp0', text: 'dp0 = p0 XOR inc', latex: 'd_{p0} = p_0 \\oplus inc' },
    { target: 'dp1', text: 'dp1 = p1 XOR (inc AND p0)', latex: 'd_{p1} = p_1 \\oplus (inc \\cdot p_0)' },
    { target: 'dp2', text: 'dp2 = p2 XOR (inc AND p0 AND p1)', latex: 'd_{p2} = p_2 \\oplus (inc \\cdot p_0 \\cdot p_1)' },
    { target: 'carry', text: 'carry = inc AND p0 AND p1 AND p2   (index 7 → 0)', latex: 'carry = inc \\cdot p_0 \\cdot p_1 \\cdot p_2' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

// ---------------------------------------------------------------- 用既有 netlist 驗證序列

export interface SequenceRun {
  traces: SignalTrace[]
  records: StepRecord[]
  period: number
  /** output rising edge 之間的間隔（Tin 單位） */
  intervals: number[]
  /** output rising edge 時間（Tin 單位，含 t=0 的起始 edge 概念上為 edge 0） */
  edgeTimes: number[]
  /** 每個 output 週期實際使用的 mod / divide value */
  applied: number[]
}

/**
 * 用 Lesson 3 的 /2 /3 cell（dualMod23）跑一個 2/3 序列：
 * 在每個 output 週期開始（state q1q0 = 00）時設定該週期的 mod（2 → mod=0，3 → mod=1）。
 * mod 在 state 01 被取樣，所以在 00 就設定可以保證整個週期穩定。
 */
export function runDualModSequence(seq: number[], cycles = seq.length, period = 100, delayMode: 'ideal' | 'real' = 'ideal'): SequenceRun {
  const vals = seq.filter((x) => x === 2 || x === 3)
  if (!vals.length) return { traces: [], records: [], period, intervals: [], edgeTimes: [0], applied: [] }
  const sim = createSim(dualMod23, { period, delayMode })
  const applied: number[] = []
  let k = 0
  let edges = 0
  for (let i = 0; i < cycles; i++) edges += vals[i % vals.length]
  edges += 1
  const records = sim.run(edges, () => {
    const s = sim.getState()
    if (s.q1 === 0 && s.q0 === 0 && k < cycles) {
      const n = vals[k % vals.length]
      applied.push(n)
      k++
      return { mod: n === 3 ? 1 : 0 }
    }
    return {}
  })
  const traces = sim.getTraces()
  const out = traces.find((t) => t.name === 'div_out')!
  const m = measureDivide(out, period, 0)
  const edgeTimes = [0, ...m.risingTimes.map((t) => t / period)]
  const intervals: number[] = []
  for (let i = 1; i < edgeTimes.length; i++) intervals.push(edgeTimes[i] - edgeTimes[i - 1])
  return { traces, records, period, intervals, edgeTimes, applied }
}

/**
 * 用 Lesson 4 的兩級 MMD（mmd2，N = 4 + 2·p1 + p0 ∈ 4..7）跑一個 divide-value 序列。
 * 在每個 output 週期開始（cell1 = 00 且 cell2 = 00，也就是 div_out 剛升起）時設定 p1 p0。
 * p0 在 cell1 state 01（且 mod_out2 = 1）被取樣、p1 在 cell2 state 01 被取樣，兩者都在該週期之內。
 */
export function runMmdSequence(values: number[], cycles = values.length, period = 100): SequenceRun {
  const vals = values.map((v) => Math.min(7, Math.max(4, Math.round(v))))
  if (!vals.length) return { traces: [], records: [], period, intervals: [], edgeTimes: [0], applied: [] }
  const sim = createSim(mmd2, { period })
  const applied: number[] = []
  let k = 0
  let edges = 0
  for (let i = 0; i < cycles; i++) edges += vals[i % vals.length]
  edges += 1
  const records = sim.run(edges, () => {
    const s = sim.getState()
    if (s.a0 === 0 && s.a1 === 0 && s.b0 === 0 && s.b1 === 0 && k < cycles) {
      const n = vals[k % vals.length]
      applied.push(n)
      k++
      const p = n - 4
      return { p0: (p & 1) as 0 | 1, p1: ((p >> 1) & 1) as 0 | 1 }
    }
    return {}
  })
  const traces = sim.getTraces()
  const out = traces.find((t) => t.name === 'div_out')!
  const m = measureDivide(out, period, 0)
  const edgeTimes = [0, ...m.risingTimes.map((t) => t / period)]
  const intervals: number[] = []
  for (let i = 1; i < edgeTimes.length; i++) intervals.push(edgeTimes[i] - edgeTimes[i - 1])
  return { traces, records, period, intervals, edgeTimes, applied }
}

/** 由 1/0 序列（例如 DSM deltas）與整數 N 組成 instantaneous divide value 序列 */
export function divideValues(N: number, deltas: number[]): number[] {
  return deltas.map((d) => N + d)
}

// ---------------------------------------------------------------- Lesson 6-3：carry 由誰吸收

export interface CarryTimelinePoint {
  k: number
  /** 這個 edge 使用的 phase index */
  index: number
  /** 這一步（k → k+1）的 wrap carry */
  carry: number
  /** divider 在這個 edge 之前累積走過的整數 Tvco 數 */
  integerCycles: number
  /** 實際 edge 時間（Tvco） */
  t: number
  /** 理想 edge 時間 k·(N + step/M) */
  tIdeal: number
  /** t − tIdeal */
  error: number
  /** 相對於整數 divider 格線 k·N 的總 offset（Tvco）：(a) 單調遞增；(b) 鋸齒 */
  offsetFromGrid: number
}

/**
 * PMUX 每個 output 週期往前轉 step 個 phase（M 相），divider 每週期走 N 個 Tvco。
 *   absorb = 'divider'：index wrap 時 divider 該週期改走 N+1（carry 加到 N）→ 架構 (a)
 *   absorb = 'none'   ：index 自己 wrap 回 0，divider 不變 → 架構 (b)
 */
export function carryTimeline(N: number, phases: number, step: number, count: number, absorb: 'divider' | 'none'): CarryTimelinePoint[] {
  const out: CarryTimelinePoint[] = []
  let index = 0
  let base = 0
  const ideal = N + step / phases
  for (let k = 0; k < count; k++) {
    const t = base + index / phases
    out.push({ k, index, carry: 0, integerCycles: base, t, tIdeal: k * ideal, error: t - k * ideal, offsetFromGrid: t - k * N })
    const raw = index + step
    const carry = Math.floor(raw / phases)
    index = ((raw % phases) + phases) % phases
    out[k].carry = carry
    base += N + (absorb === 'divider' ? carry : 0)
  }
  return out
}

// ---------------------------------------------------------------- Lesson 6-3：DTC + PMUX 累加時間軸

export interface DtcTimelineRow {
  k: number
  /** 累加後的總 code（未 wrap） */
  code: number
  /** 9-bit wrap 後的 code（coarse·64 + fine） */
  wrapped: number
  coarse: number
  fine: number
  /** fine → coarse 的進位（可能 >1，當 increment ≥ 64） */
  fineCarry: number
  /** coarse → integer 的進位（phase index wrap） */
  coarseCarry: number
  /** 到目前為止 coarse wrap 的總次數（= splitCode(code).overflow） */
  overflowTotal: number
  /** divider 走過的整數 Tvco：k·N + overflowTotal（架構 (a)：carry 加到 N） */
  integerCycles: number
  /** 量化後的 phase（Tvco，0..1） */
  phaseQuantT: number
  /** 量化後的 edge 時間（Tvco） */
  tQuant: number
  /** 理想 edge 時間 k·(N + increment/2^bits) */
  tIdeal: number
  /** 含 DTC gain error 的實際 edge 時間 */
  tActual: number
  /** residual = tActual − tIdeal（Tvco） */
  residualT: number
  residualPs: number
}

/**
 * 每個 output 週期把 increment（code 單位）加進 (coarse, fine)；carry 依 (a) 架構：coarse wrap → divider 多走 1 Tvco。
 * gainErrorPct：DTC fine step 的 gain error（%），用來說明 residual 為何不為零。
 */
export function dtcTimeline(increment: number, cfg: DtcConfig, steps: number, N: number, gainErrorPct = 0, tvcoPs = 100): DtcTimelineRow[] {
  const fineMod = 1 << cfg.fineBits
  const coarseMod = 1 << cfg.coarseBits
  const full = fineMod * coarseMod
  const g = 1 + gainErrorPct / 100
  const st = accumulate(increment, cfg, steps)
  let overflow = 0
  return st.map((s) => {
    overflow += s.coarseCarry
    const sp = splitCode(s.accumulator, cfg)
    const integerCycles = s.k * N + overflow
    const phaseQuantT = sp.coarse / coarseMod + sp.fine / full
    const tQuant = integerCycles + phaseQuantT
    const tIdeal = s.k * (N + increment / full)
    const tActual = integerCycles + sp.coarse / coarseMod + (sp.fine / full) * g
    return {
      k: s.k,
      code: s.accumulator,
      wrapped: sp.coarse * fineMod + sp.fine,
      coarse: sp.coarse,
      fine: sp.fine,
      fineCarry: s.fineCarry,
      coarseCarry: s.coarseCarry,
      overflowTotal: overflow,
      integerCycles,
      phaseQuantT,
      tQuant,
      tIdeal,
      tActual,
      residualT: tActual - tIdeal,
      residualPs: (tActual - tIdeal) * tvcoPs,
    }
  })
}

/** 把 (coarse, fine) 展開成 MSB-first 的 bit 陣列（顯示 bit-field 用） */
export function codeBits(coarse: number, fine: number, cfg: DtcConfig): { bit: 0 | 1; role: 'coarse' | 'fine'; weight: number }[] {
  const out: { bit: 0 | 1; role: 'coarse' | 'fine'; weight: number }[] = []
  for (let i = cfg.coarseBits - 1; i >= 0; i--) out.push({ bit: ((coarse >> i) & 1) as 0 | 1, role: 'coarse', weight: i + cfg.fineBits })
  for (let i = cfg.fineBits - 1; i >= 0; i--) out.push({ bit: ((fine >> i) & 1) as 0 | 1, role: 'fine', weight: i })
  return out
}

/** Values → bit-string helper（測試與敘述用） */
export function stateOf(v: Values, order: string[]): string {
  return order.map((n) => String(v[n] ?? 0)).join('')
}

// ---------------------------------------------------------------- Lesson 6-2：DSM 序列的 jitter 統計

/** 樣本標準差（AC RMS：先去掉平均值再算 RMS；平均值在 PLL 裡只是靜態 phase offset） */
export function stdDev(x: number[]): number {
  if (!x.length) return 0
  const m = x.reduce((a, b) => a + b, 0) / x.length
  return Math.sqrt(x.reduce((a, v) => a + (v - m) * (v - m), 0) / x.length)
}

/**
 * 一階 IIR 低通（模擬 PLL loop filter 對 divider phase error 的濾波）：
 *   y[n] = a·y[n−1] + (1−a)·x[n]，a = e^{−2π·fc}，fc 以「每個 output 週期」為單位（例如 1/32）。
 * 回傳去掉前 1/4 暫態後的序列。
 */
export function lowpass1(x: number[], fc: number): number[] {
  const a = Math.exp(-2 * Math.PI * fc)
  let y = 0
  const out: number[] = []
  for (const v of x) {
    y = a * y + (1 - a) * v
    out.push(y)
  }
  return out.slice(Math.floor(x.length / 4))
}

export interface DsmStats {
  label: string
  order: 1 | 2
  dither: boolean
  deltas: number[]
  average: number
  /** instantaneous divide value 的範圍 */
  deltaMin: number
  deltaMax: number
  /** deltas 序列的週期：必須「從 index 0 起就重複」才算（dither 打散 pattern 之後 → null） */
  period: number | null
  /** edge error 序列（Tin，相對 k·N_avg，去掉 edge 0） */
  edgeError: number[]
  peakToPeak: number
  /** 含 DC 的 RMS（analyzeSequence 定義） */
  rmsDc: number
  /** AC RMS（去除平均） */
  rmsAc: number
  /** 經一階低通（fc）後的 AC RMS */
  rmsFiltered: number
  /** DFT（去均值）與最強 tone */
  dft: { freq: number[]; mag: number[] }
  tone: { freq: number; mag: number }
}

/**
 * 「真正的」週期：findPeriod 只要求「從某個 start 之後」序列是 p-週期，
 * 所以對 dither 過的（非週期）序列，它常常靠尾端的巧合比對回傳一個虛假的 p。
 * 實測：runDsm({k:21,m:64,order:1,length:2048,dither:true}) → findPeriod = {period: 64, start: 1915}，
 * 但那個序列從 index 0 看根本不重複。
 *
 * 這裡只採用「從 index 0 就成立」的週期；否則回傳 null，意思是
 * 「在這個視窗（length 個樣本）之內找不到重複的 pattern」。
 * 注意 findPeriod 需要 start + 2p ≤ length 才敢宣告週期 p，
 * 所以 length 不到真實週期兩倍時也會（正確地）回傳 null。
 */
export function strictPeriod(seq: number[]): number | null {
  const p = findPeriod(seq.map(String))
  if (!p || p.start !== 0) return null
  for (let i = 0; i + p.period < seq.length; i++) if (seq[i] !== seq[i + p.period]) return null
  return p.period
}

export function dsmStats(k: number, m: number, order: 1 | 2, dither: boolean, N: number, length: number, fc = 1 / 32, seed?: number): DsmStats {
  const r = runDsm({ k, m, order, length, dither, seed })
  const a = analyzeSequence(r.deltas.map((d) => N + d))
  const e = a.edgeError.slice(1)
  const p = strictPeriod(r.deltas)
  const dft = dftMagnitude(e)
  let best = 1
  for (let i = 2; i < dft.mag.length; i++) if (dft.mag[i] > dft.mag[best]) best = i
  return {
    label: `${order === 1 ? 'MASH-1' : 'MASH-1-1'}${dither ? ' + dither' : ''}`,
    order,
    dither,
    deltas: r.deltas,
    average: r.average,
    deltaMin: Math.min(...r.deltas),
    deltaMax: Math.max(...r.deltas),
    period: p,
    edgeError: e,
    peakToPeak: a.peakToPeak,
    rmsDc: a.rms,
    rmsAc: stdDev(e),
    rmsFiltered: stdDev(lowpass1(e, fc)),
    dft,
    tone: dft.mag.length > 1 ? { freq: dft.freq[best], mag: dft.mag[best] } : { freq: 0, mag: 0 },
  }
}

// ---------------------------------------------------------------- Lesson 6-3 練習：4-bit phase index counter（16 相）

/**
 * 練習用「陌生電路」：把 phase index counter 加寬成 4 bit（16 相 PMUX 的 select 累加器）。
 * 結構與 phaseCounter8 相同，只是多一級：t3 = t2·p2、dp3 = p3 ⊕ t3，carry = inc·p0·p1·p2·p3（單一 5-input AND）。
 * 從 reset 出發 inc = 1：0000 → 0001 → … → 1111 → 0000，carry 只在 state 1111 且 inc = 1 時為 1，每 16 個 edge 一次。
 */
export const phaseCounter16: Netlist = {
  id: 'phase-counter-16',
  name: '4-bit phase index counter（0..15，wrap → carry）',
  description: 'inc = 1 時每個 edge 把 phase index 加 1；15 → 0 時 carry = 1。',
  clocks: [{ name: 'clk', description: '每個 output 週期一個 edge' }],
  inputs: [{ name: 'inc', initial: 1, description: '1：每個週期往前轉一個 phase；0：停住' }],
  flops: [
    { q: 'p0', d: 'dp0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'P0' },
    { q: 'p1', d: 'dp1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'P1' },
    { q: 'p2', d: 'dp2', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'P2' },
    { q: 'p3', d: 'dp3', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'P3' },
  ],
  gates: [
    { out: 't1', inputs: ['inc', 'p0'], fn: (v) => and(v.inc, v.p0), delay: 10, label: 'AND0', kind: 'and' },
    { out: 't2', inputs: ['t1', 'p1'], fn: (v) => and(v.t1, v.p1), delay: 10, label: 'AND1', kind: 'and' },
    { out: 't3', inputs: ['t2', 'p2'], fn: (v) => and(v.t2, v.p2), delay: 10, label: 'AND2', kind: 'and' },
    { out: 'carry', inputs: ['inc', 'p0', 'p1', 'p2', 'p3'], fn: (v) => and(v.inc, v.p0, v.p1, v.p2, v.p3), delay: 14, label: 'AND (wrap)', kind: 'and' },
    { out: 'dp0', inputs: ['p0', 'inc'], fn: (v) => xor(v.p0, v.inc), delay: 12, label: 'XOR0', kind: 'xor' },
    { out: 'dp1', inputs: ['p1', 't1'], fn: (v) => xor(v.p1, v.t1), delay: 12, label: 'XOR1', kind: 'xor' },
    { out: 'dp2', inputs: ['p2', 't2'], fn: (v) => xor(v.p2, v.t2), delay: 12, label: 'XOR2', kind: 'xor' },
    { out: 'dp3', inputs: ['p3', 't3'], fn: (v) => xor(v.p3, v.t3), delay: 12, label: 'XOR3', kind: 'xor' },
  ],
  stateOrder: ['p3', 'p2', 'p1', 'p0'],
  output: 'carry',
  watch: [],
  equations: [
    { target: 'dp0', text: 'dp0 = p0 XOR inc', latex: 'd_{p0} = p_0 \\oplus inc' },
    { target: 'dp1', text: 'dp1 = p1 XOR (inc AND p0)', latex: 'd_{p1} = p_1 \\oplus (inc \\cdot p_0)' },
    { target: 'dp2', text: 'dp2 = p2 XOR (inc AND p0 AND p1)', latex: 'd_{p2} = p_2 \\oplus (inc \\cdot p_0 \\cdot p_1)' },
    { target: 'dp3', text: 'dp3 = p3 XOR (inc AND p0 AND p1 AND p2)', latex: 'd_{p3} = p_3 \\oplus (inc \\cdot p_0 \\cdot p_1 \\cdot p_2)' },
    { target: 'carry', text: 'carry = inc AND p0 AND p1 AND p2 AND p3   (index 15 → 0)', latex: 'carry = inc \\cdot p_0 \\cdot p_1 \\cdot p_2 \\cdot p_3' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

// ---------------------------------------------------------------- Lesson 6-3：由 edge event 產生 ClockWaveform 用的 trace

export interface CarryEdgeTraces {
  /** [vco（ph0）, div_out] 兩條 trace，時間單位 ps */
  traces: SignalTrace[]
  /** 每個 output edge 的實際時間（ps） */
  edgeTimesPs: number[]
  /** 理想 edge 時間 k·(N + step/M)·Tvco（ps） */
  idealTimesPs: number[]
  /** 相鄰 output edge 的間隔（Tvco 單位） */
  intervals: number[]
  /** 最窄的 high pulse（ps） */
  minPulsePs: number
  tEndPs: number
}

/**
 * 把 carryTimeline() 的 edge 序列變成波形 event：
 *   vco：ph0 的 rising edge 在每個整數 Tvco；
 *   div_out：在每個 output edge 升起，high 的寬度 = min(Tvco/2, 下一個 edge 距離的一半)——
 *   所以 (b) 架構在 N = 1 的 wrap 週期會自然畫出一個 runt。
 * 所有座標都由 event 資料算出，沒有寫死。
 */
export function carryEdgeTraces(N: number, phases: number, step: number, count: number, absorb: 'divider' | 'none', tvcoPs = 100): CarryEdgeTraces {
  const rows = carryTimeline(N, phases, step, count, absorb)
  const edgeTimesPs = rows.map((r) => r.t * tvcoPs)
  const idealTimesPs = rows.map((r) => r.tIdeal * tvcoPs)
  const intervals: number[] = []
  for (let i = 1; i < rows.length; i++) intervals.push(rows[i].t - rows[i - 1].t)
  const tEndPs = Math.max(edgeTimesPs[edgeTimesPs.length - 1], idealTimesPs[idealTimesPs.length - 1]) + tvcoPs
  const cycles = Math.ceil(tEndPs / tvcoPs) + 1
  const vco: { t: number; v: 0 | 1 }[] = [{ t: 0, v: 0 }]
  for (let n = 0; n < cycles; n++) vco.push({ t: n * tvcoPs, v: 1 }, { t: (n + 0.5) * tvcoPs, v: 0 })
  const out: { t: number; v: 0 | 1 }[] = []
  let minPulse = Infinity
  edgeTimesPs.forEach((t, i) => {
    const next = i + 1 < edgeTimesPs.length ? edgeTimesPs[i + 1] : t + tvcoPs
    const pw = Math.min(tvcoPs / 2, (next - t) / 2)
    minPulse = Math.min(minPulse, pw)
    if (i === 0 && t === 0) out.push({ t: 0, v: 1 })
    else {
      if (i === 0) out.push({ t: 0, v: 0 })
      out.push({ t, v: 1 })
    }
    out.push({ t: t + pw, v: 0 })
  })
  return {
    traces: [
      { name: 'vco', events: vco, kind: 'clock' },
      { name: 'div_out', events: out, kind: 'output' },
    ],
    edgeTimesPs,
    idealTimesPs,
    intervals,
    minPulsePs: Number.isFinite(minPulse) ? minPulse : 0,
    tEndPs,
  }
}

/** fine code 序列 fine_k = (k·increment) mod 2^fineBits 的週期（DTC gain error 造成的 residual 鋸齒週期） */
export function fineCodePeriod(increment: number, fineBits: number): number {
  const fineMod = 1 << fineBits
  const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b))
  const r = ((increment % fineMod) + fineMod) % fineMod
  if (r === 0) return 1
  return fineMod / g(r, fineMod)
}
