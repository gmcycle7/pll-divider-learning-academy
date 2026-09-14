import type { Bit, Netlist, SimOptions, StepRecord, Values } from '@/models/divider/types'
import { simulate } from '@/models/divider/engine'
import { findPeriod, measureDivide, stateSequence } from '@/models/divider/analysis'
import { mmd2 } from '@/models/divider/examples'
import { and, nor } from '@/utils/bits'
import { allStates, fromBitString } from '@/utils/bits'

export { mmd2 }

/**
 * 練習用變形：modulus 請求改在 b = 01 時提出
 *
 * 原版 mmd2：mod_out2 = NOR(b1, b0)（b = 00 那一個 f1 週期請求 /3）
 * 變形版：    mod_out2 = b0 · b̄1     （b = 01 那一個 f1 週期請求 /3）
 * f2（= div_out）與 db0 仍然是 NOR(b1, b0)，所以 cell 2 的 state 序列不變。
 *
 * 預期：每個 cell 2 週期仍然恰好一次 /3 ⇒ N 不變；但 /3 發生在不同的 f1 週期，
 *       所以 div_out 的 high / low 寬度（duty）與 output edge 相對於 clk 的 pattern 改變。
 */
export const mmd2ModAt01: Netlist = {
  id: 'mmd2-mod-at-01',
  name: '兩級 MMD（modulus 請求改在 b = 01）',
  description: 'mod_out2 = b0 AND NOT b1：cell 2 在 state 01 那個 f1 週期才要求 cell 1 走 /3。',
  clocks: [{ name: 'clk' }],
  inputs: [
    { name: 'p0', initial: 0, description: 'cell 1 的 modulus bit（LSB）' },
    { name: 'p1', initial: 0, description: 'cell 2 的 modulus bit' },
  ],
  flops: [
    { q: 'a0', d: 'da0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'C1.FF0' },
    { q: 'a1', d: 'da1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'C1.FF1' },
    { q: 'b0', d: 'db0', clk: 'f1', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'C2.FF0' },
    { q: 'b1', qb: 'b1b', d: 'db1', clk: 'f1', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'C2.FF1' },
  ],
  gates: [
    { out: 'f1', inputs: ['a0', 'a1'], fn: (v) => nor(v.a0, v.a1), delay: 12, label: 'C1 NOR', kind: 'nor' },
    { out: 'da0', inputs: ['f1'], fn: (v) => v.f1, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'f2', inputs: ['b0', 'b1'], fn: (v) => nor(v.b0, v.b1), delay: 12, label: 'C2 NOR', kind: 'nor' },
    { out: 'db0', inputs: ['f2'], fn: (v) => v.f2, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'mod_out2', inputs: ['b0', 'b1b'], fn: (v) => and(v.b0, v.b1b), delay: 10, label: 'C2 AND(b0, b̄1)', kind: 'and' },
    { out: 'mod1_eff', inputs: ['p0', 'mod_out2'], fn: (v) => and(v.p0, v.mod_out2), delay: 10, label: 'C1 AND(p0)', kind: 'and' },
    { out: 'da1', inputs: ['a0', 'mod1_eff'], fn: (v) => and(v.a0, v.mod1_eff), delay: 10, label: 'C1 AND', kind: 'and' },
    { out: 'db1', inputs: ['b0', 'p1'], fn: (v) => and(v.b0, v.p1), delay: 10, label: 'C2 AND', kind: 'and' },
    { out: 'div_out', inputs: ['f2'], fn: (v) => v.f2, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['b1', 'b0', 'a1', 'a0'],
  output: 'div_out',
  watch: ['f1', 'mod_out2', 'mod1_eff'],
  equations: [
    { target: 'da0', text: 'da0 = NOR(a1, a0)  (= f1)', latex: 'd_{a0} = \\overline{a_1 + a_0} = f_1' },
    { target: 'da1', text: 'da1 = a0 AND p0 AND mod_out2', latex: 'd_{a1} = a_0 \\cdot p_0 \\cdot mod\\_out_2' },
    { target: 'mod_out2', text: 'mod_out2 = b0 AND NOT b1  (b = 01 時為 1)', latex: 'mod\\_out_2 = b_0 \\cdot \\overline{b_1}' },
    { target: 'db0', text: 'db0 = NOR(b1, b0)  (= f2)', latex: 'd_{b0} = \\overline{b_1 + b_0} = f_2' },
    { target: 'db1', text: 'db1 = b0 AND p1', latex: 'd_{b1} = b_0 \\cdot p_1' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * 三級 /2 /3 cell 串接：N = 8 + 4·p2 + 2·p1 + p0 ∈ {8 … 15}
 *
 * Cell 1（clock = clk）：state a1a0，f1 = NOR(a1,a0)，da1 = a0 · p0 · mod_out2
 * Cell 2（clock = f1） ：state b1b0，f2 = NOR(b1,b0)，db1 = b0 · p1 · mod_out3
 * Cell 3（clock = f2） ：state c1c0，f3 = NOR(c1,c0)，dc1 = c0 · p2
 *
 * modulus-out 由最後一級往前傳：
 *   mod_out3 = f3                （最後一級：mod_in3 = 1）
 *   mod_out2 = f2 · mod_out3     （cell 2 只有在「自己在 00」且「後級也在 00」時才把請求往前傳）
 * div_out = f3
 */
export const mmd3: Netlist = {
  id: 'mmd3',
  name: '三級 /2 /3 MMD（/8 ~ /15）',
  description: '三個 /2 /3 cell 串接，p2 p1 p0 控制總除數 N = 8 + 4·p2 + 2·p1 + p0。',
  clocks: [{ name: 'clk' }],
  inputs: [
    { name: 'p0', initial: 0, description: 'cell 1 的 modulus bit（LSB）' },
    { name: 'p1', initial: 0, description: 'cell 2 的 modulus bit' },
    { name: 'p2', initial: 0, description: 'cell 3 的 modulus bit（MSB）' },
  ],
  flops: [
    { q: 'a0', d: 'da0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'C1.FF0' },
    { q: 'a1', d: 'da1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'C1.FF1' },
    { q: 'b0', d: 'db0', clk: 'f1', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'C2.FF0' },
    { q: 'b1', d: 'db1', clk: 'f1', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'C2.FF1' },
    { q: 'c0', d: 'dc0', clk: 'f2', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'C3.FF0' },
    { q: 'c1', d: 'dc1', clk: 'f2', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'C3.FF1' },
  ],
  gates: [
    { out: 'f1', inputs: ['a0', 'a1'], fn: (v) => nor(v.a0, v.a1), delay: 12, label: 'C1 NOR', kind: 'nor' },
    { out: 'da0', inputs: ['f1'], fn: (v) => v.f1, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'f2', inputs: ['b0', 'b1'], fn: (v) => nor(v.b0, v.b1), delay: 12, label: 'C2 NOR', kind: 'nor' },
    { out: 'db0', inputs: ['f2'], fn: (v) => v.f2, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'f3', inputs: ['c0', 'c1'], fn: (v) => nor(v.c0, v.c1), delay: 12, label: 'C3 NOR', kind: 'nor' },
    { out: 'dc0', inputs: ['f3'], fn: (v) => v.f3, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'mod_out3', inputs: ['f3'], fn: (v) => v.f3, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'mod_out2', inputs: ['f2', 'mod_out3'], fn: (v) => and(v.f2, v.mod_out3), delay: 10, label: 'C2 AND(mod)', kind: 'and' },
    { out: 'mod1_eff', inputs: ['p0', 'mod_out2'], fn: (v) => and(v.p0, v.mod_out2), delay: 10, label: 'C1 AND(p0)', kind: 'and' },
    { out: 'da1', inputs: ['a0', 'mod1_eff'], fn: (v) => and(v.a0, v.mod1_eff), delay: 10, label: 'C1 AND', kind: 'and' },
    { out: 'mod2_eff', inputs: ['p1', 'mod_out3'], fn: (v) => and(v.p1, v.mod_out3), delay: 10, label: 'C2 AND(p1)', kind: 'and' },
    { out: 'db1', inputs: ['b0', 'mod2_eff'], fn: (v) => and(v.b0, v.mod2_eff), delay: 10, label: 'C2 AND', kind: 'and' },
    { out: 'dc1', inputs: ['c0', 'p2'], fn: (v) => and(v.c0, v.p2), delay: 10, label: 'C3 AND', kind: 'and' },
    { out: 'div_out', inputs: ['f3'], fn: (v) => v.f3, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['c1', 'c0', 'b1', 'b0', 'a1', 'a0'],
  output: 'div_out',
  watch: ['f1', 'f2', 'mod_out2', 'mod_out3'],
  equations: [
    { target: 'da1', text: 'da1 = a0 AND p0 AND mod_out2', latex: 'd_{a1} = a_0 \\cdot p_0 \\cdot mod\\_out_2' },
    { target: 'db1', text: 'db1 = b0 AND p1 AND mod_out3', latex: 'd_{b1} = b_0 \\cdot p_1 \\cdot mod\\_out_3' },
    { target: 'dc1', text: 'dc1 = c0 AND p2', latex: 'd_{c1} = c_0 \\cdot p_2' },
    { target: 'mod_out2', text: 'mod_out2 = f2 AND mod_out3', latex: 'mod\\_out_2 = f_2 \\cdot mod\\_out_3' },
    { target: 'N', text: 'N = 8 + 4·p2 + 2·p1 + p0', latex: 'N = 8 + 4p_2 + 2p_1 + p_0' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * Lesson 4-2 用：把 mod_out2 → AND(p0) 這一段的延遲拉長，示範 path 2（downstream modulus-out → upstream MOD）。
 *
 * 從 clk edge 算起，path 2 的 arrival = tCQ(a) 8 + NOR(f1) 12 + tCQ(b) 8 + NOR(mod_out2) 12 + AND(p0) + AND(da1) 10。
 *   原版 AND(p0) = 10  ⇒ arrival  60（單週期 STA：slack +27）
 *   SlowMod  AND(p0) = 100 ⇒ arrival 150（單週期 STA：slack −63；但 da1 真正被用到是在 a = 01 的 edge，也就是 2T 之後，所以除數仍正確）
 *   LateMod  AND(p0) = 175 ⇒ arrival 225（超過 2T：cell 1 在錯的 f1 週期執行 /3，state 序列與 duty 錯，平均 N 不變）
 *   LostMod  AND(p0) = 210 ⇒ arrival 260（AND 比 mod_out2 的 2T pulse 還慢：pulse 被吞掉，/3 消失，N 錯）
 */
export function withExtraModDelay(extra: number): Netlist {
  const d = 10 + extra
  return {
    ...mmd2,
    id: `mmd2-mod-delay-${d}`,
    name: `兩級 MMD（AND(p0) delay = ${d} ps）`,
    description: `與 mmd2 相同，但 mod_out2 → AND(p0) 這一級的延遲為 ${d} ps。`,
    gates: mmd2.gates.map((g) => (g.out === 'mod1_eff' ? { ...g, delay: d, label: `C1 AND(p0)（${d} ps）` } : g)),
  }
}
export const mmd2SlowMod: Netlist = { ...withExtraModDelay(90), id: 'mmd2-slow-mod', name: '兩級 MMD（mod_out2 → cell 1 路徑過慢：arrival 150 ps）' }
/** arrival 225 ps（> 2T）：/3 落到錯的 f1 週期——state 序列與 duty 錯，平均 N 仍是 5 / 7 */
export const mmd2LateMod: Netlist = { ...withExtraModDelay(165), id: 'mmd2-late-mod', name: '兩級 MMD（mod_out2 → cell 1 路徑超過 2T：arrival 225 ps）' }
/** arrival 260 ps：mod_out2 的 2T 寬 pulse 比 AND 的延遲還短，被 inertial delay 吞掉——/3 消失，N 掉成 4 / 6 */
export const mmd2LostMod: Netlist = { ...withExtraModDelay(200), id: 'mmd2-lost-mod', name: '兩級 MMD（AND(p0) 比 mod_out2 的 pulse 還慢：arrival 260 ps）' }

/**
 * Lesson 4-2 練習用：把 p0 的 AND 移到 mod_out2 之前——先算 mod_out2' = f2 · p0，再送給 cell 1。
 * 邏輯上與原版等價（AND 有結合律），差別只在哪一段延遲落在哪條路徑上。
 */
export const mmd2P0First: Netlist = {
  ...mmd2,
  id: 'mmd2-p0-first',
  name: '兩級 MMD（p0 先與 f2 AND，再回傳 cell 1）',
  description: 'mod_out2 = NOR(b1,b0) AND p0；cell 1 的 da1 = a0 AND mod_out2。',
  gates: [
    { out: 'f1', inputs: ['a0', 'a1'], fn: (v) => nor(v.a0, v.a1), delay: 12, label: 'C1 NOR', kind: 'nor' },
    { out: 'da0', inputs: ['f1'], fn: (v) => v.f1, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'f2', inputs: ['b0', 'b1'], fn: (v) => nor(v.b0, v.b1), delay: 12, label: 'C2 NOR', kind: 'nor' },
    { out: 'db0', inputs: ['f2'], fn: (v) => v.f2, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'mod_out2', inputs: ['f2', 'p0'], fn: (v) => and(v.f2, v.p0), delay: 10, label: 'C2 AND(p0)', kind: 'and' },
    { out: 'mod1_eff', inputs: ['mod_out2'], fn: (v) => v.mod_out2, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'da1', inputs: ['a0', 'mod1_eff'], fn: (v) => and(v.a0, v.mod1_eff), delay: 10, label: 'C1 AND', kind: 'and' },
    { out: 'db1', inputs: ['b0', 'p1'], fn: (v) => and(v.b0, v.p1), delay: 10, label: 'C2 AND', kind: 'and' },
    { out: 'div_out', inputs: ['f2'], fn: (v) => v.f2, delay: 0, label: 'wire', kind: 'buf' },
  ],
  equations: [
    { target: 'da1', text: 'da1 = a0 AND mod_out2', latex: 'd_{a1} = a_0 \\cdot mod\\_out_2' },
    { target: 'mod_out2', text: 'mod_out2 = NOR(b1, b0) AND p0', latex: 'mod\\_out_2 = \\overline{b_1 + b_0} \\cdot p_0' },
    { target: 'db1', text: 'db1 = b0 AND p1', latex: 'd_{b1} = b_0 \\cdot p_1' },
  ],
}

// ---------------------------------------------------------------- helpers

/** 理論除數：N = 2^n + Σ p_i·2^i */
export function mmdN(p: Bit[]): number {
  let n = 1 << p.length
  p.forEach((b, i) => {
    n += b << i
  })
  return n
}

export interface MmdEdgeRow {
  edge: number
  aBefore: string
  bBefore: string
  f1Before: Bit
  modOut2Before: Bit
  mod1EffBefore: Bit
  da1: Bit
  da0: Bit
  aAfter: string
  bAfter: string
  f1After: Bit
  modOut2After: Bit
  out: Bit
  /** 這個 edge 讓 f1 由 0 → 1（cell 2 被 clock 到） */
  f1Rises: boolean
  /** 這個 edge 讓 cell 1 完成一個 cycle（a 回到 00）：該 cycle 用了幾個 clk */
  cell1CycleLength?: number
}

/** 逐 edge 的 (a1a0, b1b0, f1, mod_out2) 表——課文與測試共用，保證與 engine 一致 */
export function mmdEdgeRows(netlist: Netlist, inputs: Values, n: number, opts: SimOptions = {}): MmdEdgeRow[] {
  const { records } = simulate(netlist, n, { period: 100, ...opts }, () => inputs)
  const rows: MmdEdgeRow[] = []
  let lastZero = 0
  for (const r of records) {
    const sb = r.stateBefore
    const sa = r.stateAfter
    const cb = r.combBefore
    const va = r.valuesAfter
    const aAfter = `${sa.a1}${sa.a0}`
    const row: MmdEdgeRow = {
      edge: r.edgeIndex,
      aBefore: `${sb.a1}${sb.a0}`,
      bBefore: `${sb.b1}${sb.b0}`,
      f1Before: cb.f1,
      modOut2Before: cb.mod_out2,
      mod1EffBefore: cb.mod1_eff,
      da1: cb.da1,
      da0: cb.da0,
      aAfter,
      bAfter: `${sa.b1}${sa.b0}`,
      f1After: va.f1,
      modOut2After: va.mod_out2,
      out: r.output,
      f1Rises: cb.f1 === 0 && va.f1 === 1,
    }
    if (aAfter === '00') {
      row.cell1CycleLength = r.edgeIndex - lastZero
      lastZero = r.edgeIndex
    }
    rows.push(row)
  }
  return rows
}

export interface ModeSummary {
  p0: Bit
  p1: Bit
  N: number
  ratio: number | null
  duty: number | null
  /** 從 reset 開始的 state 序列（stateOrder 順序：b1 b0 a1 a0） */
  states: string[]
  /** 主循環（去除 transient） */
  cycle: string[]
  /** 每個 cell 1 cycle 的長度序列（2 或 3） */
  cell1Cycles: number[]
}

export interface InputSummary {
  /** p bits（p0 在前） */
  p: Bit[]
  /** 理論除數 2^n + Σ p_i·2^i */
  N: number
  ratio: number | null
  duty: number | null
  states: string[]
  cycle: string[]
  cell1Cycles: number[]
}

/** 任意級數的 MMD：給定 p0, p1, …（依 netlist.inputs 順序），跑 simulate 並整理結果 */
export function summarizeInputs(netlist: Netlist, p: Bit[], n = 60): InputSummary {
  const inputs: Values = {}
  netlist.inputs.forEach((inp, i) => {
    inputs[inp.name] = p[i] ?? inp.initial
  })
  const { records, traces, period } = simulate(netlist, n, { period: 100 }, () => inputs)
  const states = stateSequence(netlist, records)
  const per = findPeriod(states)
  const cycle = per ? states.slice(per.start, per.start + per.period) : []
  const m = measureDivide(traces.find((t) => t.name === netlist.output)!, period)
  const rows = mmdEdgeRows(netlist, inputs, n)
  return {
    p,
    N: mmdN(p),
    ratio: m.ratio,
    duty: m.duty,
    states,
    cycle,
    cell1Cycles: rows.filter((r) => r.cell1CycleLength !== undefined).map((r) => r.cell1CycleLength!),
  }
}

export function summarizeMode(netlist: Netlist, p0: Bit, p1: Bit, n = 30): ModeSummary {
  const s = summarizeInputs(netlist, [p0, p1], n)
  return { p0, p1, N: s.N, ratio: s.ratio, duty: s.duty, states: s.states, cycle: s.cycle, cell1Cycles: s.cell1Cycles }
}

export interface SimReachNode {
  state: string
  reachesCycle: boolean
  stepsToCycle: number
  onCycle: boolean
}

/**
 * 以 event-driven simulate 做的 reachability 分析。
 * buildStateGraph 假設所有 flop 都由同一個 clock 觸發；MMD 的 cell 2 由 f1 觸發，
 * 所以必須從每一個初始 state 實際跑一次，看它會不會回到主循環。
 */
export function reachabilityBySim(netlist: Netlist, inputs: Values, maxSteps = 24): { cycle: string[]; nodes: SimReachNode[]; lockup: string[] } {
  const base = simulate(netlist, maxSteps, { period: 100 }, () => inputs)
  const baseSeq = stateSequence(netlist, base.records)
  const per = findPeriod(baseSeq)
  const cycle = per ? baseSeq.slice(per.start, per.start + per.period) : []
  const cycleSet = new Set(cycle)
  const nodes: SimReachNode[] = allStates(netlist.stateOrder.length).map((s) => {
    const init = fromBitString(s, netlist.stateOrder)
    const { records } = simulate(netlist, maxSteps, { period: 100, initialState: init }, () => inputs)
    const seq = [s, ...stateSequence(netlist, records)]
    const idx = seq.findIndex((x) => cycleSet.has(x))
    return { state: s, reachesCycle: idx >= 0, stepsToCycle: idx, onCycle: cycleSet.has(s) }
  })
  return { cycle, nodes, lockup: nodes.filter((n) => !n.reachesCycle).map((n) => n.state) }
}

/**
 * 把一個 state 循環旋轉到固定的起點（預設：以 anchor state 為最後一個元素），
 * 讓「同一個循環、只是 findPeriod 從不同位置切入」可以直接比較。
 * 例：['0100','0101','0000','0001','0010'] → ['0001','0010','0100','0101','0000']
 */
export function normalizeCycle(cycle: string[], anchor = '0000'): string[] {
  const i = cycle.indexOf(anchor)
  if (i < 0 || cycle.length === 0) return [...cycle]
  return [...cycle.slice(i + 1), ...cycle.slice(0, i + 1)]
}

/** 由 records 取出 div_out 的 rising edge 所在 edge index（ideal 模式） */
export function outputRisingEdges(records: StepRecord[]): number[] {
  const out: number[] = []
  let prev: Bit | undefined
  for (const r of records) {
    if (prev === 0 && r.output === 1) out.push(r.edgeIndex)
    prev = r.output
  }
  return out
}


// ---------------------------------------------------------------- Lesson 4-2：timing 數字與 simulate 證明

/** 兩課共用的 timing 數字（ps）。與 netlist 內的 tcq / delay 一致。 */
export const TIMING = {
  T: 100,
  tcq: 8,
  tcqMin: 5,
  nor: 12,
  norMin: 8,
  and: 10,
  andMin: 7,
  wire: 3,
  wireMin: 2,
  setup: 7,
  hold: 3,
  recovery: 10,
  removal: 5,
  jitter: 3,
  margin: 3,
  /** cell 2 flop 的最小 clock pulse width */
  minPulse: 30,
  /** NOR 的 rise / fall 不對稱（會吃掉 f1 high pulse 的寬度） */
  norAsym: 4,
} as const

export interface ModOut2Consumption {
  /** f1 上升（cell 2 被 clock）的那個 clk edge 編號 */
  launchEdge: number
  /** f1 上升的時間 */
  tF1Rise: number
  /** mod_out2 改變的時間（若這次 f1↑ 沒有讓 mod_out2 改變則為 null） */
  tModOut2: number | null
  /** mod_out2 被 cell 1 真正用到（a = 01 且 a1 抓 da1）的 clk edge 編號 */
  consumeEdge: number
  /** consumeEdge 的時間 */
  tConsume: number
  /** consumeEdge 前一瞬間的 da1（= a0 · p0 · mod_out2） */
  da1: Bit
  /** consumeEdge 之後 a1 的值（1 = 這一輪走 /3） */
  a1After: Bit
  /** consumeEdge 前一瞬間的 mod_out2 */
  modOut2AtConsume: Bit
}

/**
 * 用 real-delay simulate 證明 path 2 的 capture 時機：
 * mod_out2 在 f1↑（clk edge k）之後改變，但 cell 1 只在「a = 01 的那個 edge」把它抓進 a1（da1 = a0 · p0 · mod_out2）。
 * 回傳每一次 f1↑ 對應的 (launchEdge, consumeEdge)。
 */
export function modOut2Consumption(netlist: Netlist, p0: Bit, p1: Bit, n = 20): ModOut2Consumption[] {
  const { records } = simulate(netlist, n, { period: 100, delayMode: 'real' }, () => ({ p0, p1 }))
  const out: ModOut2Consumption[] = []
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    const f1Up = r.events.find((e) => e.signal === 'f1' && e.to === 1)
    if (!f1Up) continue
    const modEv = r.events.find((e) => e.signal === 'mod_out2')
    // 之後第一個「edge 前 a = 01」的 edge 就是 da1 被用到的 edge
    const j = records.findIndex((x, k) => k > i && x.stateBefore.a0 === 1 && x.stateBefore.a1 === 0)
    if (j < 0) continue
    const c = records[j]
    out.push({
      launchEdge: r.edgeIndex,
      tF1Rise: f1Up.t,
      tModOut2: modEv ? modEv.t : null,
      consumeEdge: c.edgeIndex,
      tConsume: c.t,
      da1: c.combBefore.da1,
      a1After: c.stateAfter.a1,
      modOut2AtConsume: c.combBefore.mod_out2,
    })
  }
  return out
}

export interface PulseInfoRow {
  t0: number
  t1: number
  width: number
  level: Bit
}

/** real-delay 模式下 f1（cell 2 的 generated clock）每一段 high / low 的寬度 */
export function f1PulseWidths(netlist: Netlist, p0: Bit, p1: Bit, period = 100, n = 16): PulseInfoRow[] {
  const { traces } = simulate(netlist, n, { period, delayMode: 'real' }, () => ({ p0, p1 }))
  const f1 = traces.find((t) => t.name === 'f1')
  if (!f1) return []
  const rows: PulseInfoRow[] = []
  // 跳過 reset 期間（t < period）的初值
  const ev = f1.events.filter((e) => e.t >= period)
  for (let i = 1; i < ev.length; i++) rows.push({ t0: ev[i - 1].t, t1: ev[i].t, width: ev[i].t - ev[i - 1].t, level: ev[i - 1].v })
  return rows
}

export interface SwitchScanRow {
  /** p0 在第 k 個 edge 之前由 0 變 1 */
  k: number
  /** div_out rising edge 所在的 edge 編號 */
  risingEdges: number[]
  /** 相鄰 rising edge 的間隔（以 T 為單位） */
  intervals: number[]
  /** 第一個 5T interval 是第幾個 interval（0-based），-1 表示沒有 */
  firstFiveAt: number
}

/**
 * Lesson 4-2 path 3（MOD decode → D）：p0 何時改變，才會影響哪一個輸出週期？
 * p1 固定 0；p0 在 edge k 之前由 0 → 1。
 */
export function switchP0Scan(ks: number[], netlist: Netlist = mmd2, n = 24): SwitchScanRow[] {
  return ks.map((k) => {
    const { records } = simulate(netlist, n, { period: 100 }, (edge) => ({ p0: edge >= k ? 1 : 0, p1: 0 }))
    const risingEdges = outputRisingEdges(records)
    const intervals: number[] = []
    for (let i = 1; i < risingEdges.length; i++) intervals.push(risingEdges[i] - risingEdges[i - 1])
    return { k, risingEdges, intervals, firstFiveAt: intervals.findIndex((x) => x === 5) }
  })
}
