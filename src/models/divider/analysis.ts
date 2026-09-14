import type { Bit, Netlist, SignalTrace, Values, StepRecord } from './types'
import { allStates, fromBitString, toBitString } from '@/utils/bits'

/** zero-delay 求 comb fixed point */
export function evalComb(netlist: Netlist, base: Values): Values {
  const v: Values = { ...base }
  for (const g of netlist.gates) if (v[g.out] === undefined) v[g.out] = 0
  for (let iter = 0; iter < 64; iter++) {
    let changed = false
    for (const g of netlist.gates) {
      const nv = g.fn(v)
      if (nv !== v[g.out]) {
        v[g.out] = nv
        changed = true
      }
    }
    if (!changed) break
  }
  return v
}

export interface NextStateResult {
  state: string
  next: string
  d: Values
  comb: Values
  output: Bit
}

/** 同步觀點：給定 state（bit-string）與 inputs，算 D 值與 next state */
export function nextStateOf(netlist: Netlist, state: string, inputs: Values): NextStateResult {
  const base: Values = { ...inputs }
  const sv = fromBitString(state, netlist.stateOrder)
  Object.assign(base, sv)
  for (const f of netlist.flops) {
    if (f.qb) base[f.qb] = sv[f.q] ? 0 : 1
  }
  for (const c of netlist.clocks) base[c.name] = base[c.name] ?? 0
  for (const f of netlist.flops) if (f.rstn && base[f.rstn] === undefined) base[f.rstn] = 1
  const comb = evalComb(netlist, base)
  const d: Values = {}
  const nextVals: Values = { ...sv }
  for (const f of netlist.flops) {
    d[f.d] = comb[f.d] ?? 0
    nextVals[f.q] = d[f.d]
  }
  return {
    state,
    next: toBitString(nextVals, netlist.stateOrder),
    d,
    comb,
    output: comb[netlist.output] ?? sv[netlist.output] ?? 0,
  }
}

export interface StateNode {
  state: string
  next: string
  output: Bit
  reachable: boolean
  onCycle: boolean
  /** 進入後永遠無法回到主循環 */
  lockup: boolean
  /** 從此 state 走幾步進入主循環（-1 表示永遠不會） */
  stepsToCycle: number
}

export interface StateGraph {
  nodes: StateNode[]
  /** 從 reset state 出發的主循環（依順序） */
  mainCycle: string[]
  resetState: string
  reachable: string[]
  transient: string[]
  lockup: string[]
}

/** 建立固定 input 下的完整 state graph（synchronous 觀點） */
export function buildStateGraph(netlist: Netlist, inputs: Values, resetState?: string): StateGraph {
  const width = netlist.stateOrder.length
  const states = allStates(width)
  const nextMap = new Map<string, NextStateResult>()
  for (const s of states) nextMap.set(s, nextStateOf(netlist, s, inputs))

  const rs =
    resetState ??
    toBitString(
      Object.fromEntries(netlist.flops.map((f) => [f.q, f.resetValue ?? 0])) as Values,
      netlist.stateOrder,
    )
  // main cycle from reset
  const seen: string[] = []
  let cur = rs
  while (!seen.includes(cur)) {
    seen.push(cur)
    cur = nextMap.get(cur)!.next
  }
  const cycleStart = seen.indexOf(cur)
  const mainCycle = seen.slice(cycleStart)
  const cycleSet = new Set(mainCycle)
  const reachable = new Set(seen)

  const nodes: StateNode[] = states.map((s) => {
    // steps to cycle
    let steps = 0
    let x = s
    const visited = new Set<string>()
    while (!cycleSet.has(x) && !visited.has(x)) {
      visited.add(x)
      x = nextMap.get(x)!.next
      steps++
    }
    const reaches = cycleSet.has(x)
    return {
      state: s,
      next: nextMap.get(s)!.next,
      output: nextMap.get(s)!.output,
      reachable: reachable.has(s),
      onCycle: cycleSet.has(s),
      lockup: !reaches,
      stepsToCycle: reaches ? steps : -1,
    }
  })
  return {
    nodes,
    mainCycle,
    resetState: rs,
    reachable: [...reachable],
    transient: seen.slice(0, cycleStart),
    lockup: nodes.filter((n) => n.lockup).map((n) => n.state),
  }
}

export interface DivideMeasure {
  /** output rising edge 時間 */
  risingTimes: number[]
  fallingTimes: number[]
  /** 相鄰 rising edge 間隔（以 clock period 為單位） */
  intervals: number[]
  /** 平均除數（去除 transient 後） */
  ratio: number | null
  /** duty cycle（去除 transient 後的第一個完整週期） */
  duty: number | null
  /** 是否所有 interval 相同 */
  periodic: boolean
}

export function valueAt(trace: SignalTrace, t: number): Bit {
  let v: Bit = trace.events[0]?.v ?? 0
  for (const e of trace.events) {
    if (e.t <= t + 1e-9) v = e.v
    else break
  }
  return v
}

/** 從 output trace 量測 divide ratio 與 duty */
export function measureDivide(trace: SignalTrace, clockPeriod: number, skipFirst = 1): DivideMeasure {
  const rising: number[] = []
  const falling: number[] = []
  let prev: Bit | undefined
  for (const e of trace.events) {
    if (prev !== undefined) {
      if (prev === 0 && e.v === 1) rising.push(e.t)
      if (prev === 1 && e.v === 0) falling.push(e.t)
    }
    prev = e.v
  }
  const intervals: number[] = []
  for (let i = 1; i < rising.length; i++) intervals.push(round((rising[i] - rising[i - 1]) / clockPeriod))
  const used = intervals.slice(skipFirst)
  const ratio = used.length ? round(used.reduce((a, b) => a + b, 0) / used.length) : null
  const periodic = used.length > 0 && used.every((x) => Math.abs(x - used[0]) < 1e-6)
  let duty: number | null = null
  const idx = skipFirst
  if (rising.length > idx + 1) {
    const r0 = rising[idx]
    const r1 = rising[idx + 1]
    const f = falling.find((x) => x > r0 && x < r1)
    if (f !== undefined) duty = round((f - r0) / (r1 - r0))
  }
  return { risingTimes: rising, fallingTimes: falling, intervals, ratio, duty, periodic }
}

function round(x: number) {
  return Math.round(x * 1e6) / 1e6
}

export interface PulseInfo {
  signal: string
  t0: number
  t1: number
  width: number
  level: Bit
}

/** 找出比 minWidth 窄的 pulse（runt / glitch） */
export function detectRuntPulses(traces: SignalTrace[], minWidth: number): PulseInfo[] {
  const out: PulseInfo[] = []
  for (const tr of traces) {
    for (let i = 1; i < tr.events.length; i++) {
      const a = tr.events[i - 1]
      const b = tr.events[i]
      const w = b.t - a.t
      if (w > 0 && w < minWidth) out.push({ signal: tr.name, t0: a.t, t1: b.t, width: w, level: a.v })
    }
  }
  return out
}

/** 從 records 找出 state 序列（bit-string） */
export function stateSequence(netlist: Netlist, records: StepRecord[]): string[] {
  return records.map((r) => toBitString(r.stateAfter, netlist.stateOrder))
}

/** 從 state 序列找週期（去除 transient） */
export function findPeriod(seq: string[]): { period: number; start: number } | null {
  for (let start = 0; start < seq.length; start++) {
    for (let p = 1; start + 2 * p <= seq.length; p++) {
      let ok = true
      for (let i = start; i + p < seq.length; i++) {
        if (seq[i] !== seq[i + p]) {
          ok = false
          break
        }
      }
      if (ok) return { period: p, start }
    }
  }
  return null
}

/** 從 trace 取出某訊號在各 clock edge 的值（用於 state table 對照） */
export function sampleAt(trace: SignalTrace, times: number[]): Bit[] {
  return times.map((t) => valueAt(trace, t))
}
