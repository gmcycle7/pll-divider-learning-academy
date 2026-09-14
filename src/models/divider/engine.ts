import type {
  Bit,
  EdgeKind,
  Netlist,
  SignalTrace,
  SimEvent,
  SimOptions,
  StepRecord,
  TraceEvent,
  Values,
} from './types'
import { toBitString } from '@/utils/bits'

interface QueuedEvent {
  t: number
  delta: number
  seq: number
  signal: string
  value: Bit
  cause: string
}

const EPS = 1e-9

/**
 * Event-driven simulator for divider netlists.
 * - 支援 zero-delay（delta cycle）與 real delay
 * - 支援 ripple clock（flop clk 可以是任何訊號）、多相 clock、async reset、latch
 * - 每個訊號同一時間最多一個 pending event（inertial delay）
 */
export class DividerSim {
  readonly netlist: Netlist
  readonly period: number
  readonly opts: Required<Omit<SimOptions, 'initialState' | 'tcqOverride' | 'gateDelayOverride'>> & {
    initialState?: Values
    tcqOverride?: number
    gateDelayOverride?: number
  }

  private values: Values = {}
  private traces: Record<string, TraceEvent[]> = {}
  private queue: QueuedEvent[] = []
  private pending: Map<string, QueuedEvent> = new Map()
  private seq = 0
  private now = 0
  private nowDelta = 0
  private edgeCount = 0
  private pendingInputs: Values = {}
  private clockGenerated: Record<string, number> = {}
  private eventLog: SimEvent[] = []
  private depGates: Map<string, number[]> = new Map()
  private depFlops: Map<string, number[]> = new Map()
  private depLatches: Map<string, number[]> = new Map()
  private forcedState: Values | null = null
  records: StepRecord[] = []

  constructor(netlist: Netlist, opts: SimOptions = {}) {
    this.netlist = netlist
    this.period = opts.period ?? 100
    this.opts = {
      period: this.period,
      delayMode: opts.delayMode ?? 'ideal',
      inputLead: opts.inputLead ?? 0.35,
      resetRelease: opts.resetRelease === undefined ? 0.5 : opts.resetRelease,
      initialState: opts.initialState,
      tcqOverride: opts.tcqOverride,
      gateDelayOverride: opts.gateDelayOverride,
    }
    this.buildDeps()
    this.reset(opts.initialState)
  }

  // ---------------------------------------------------------------- setup
  private buildDeps() {
    const add = (m: Map<string, number[]>, sig: string, idx: number) => {
      const arr = m.get(sig) ?? []
      arr.push(idx)
      m.set(sig, arr)
    }
    this.netlist.gates.forEach((g, i) => g.inputs.forEach((s) => add(this.depGates, s, i)))
    this.netlist.flops.forEach((f, i) => {
      add(this.depFlops, f.clk, i)
      if (f.rstn) add(this.depFlops, f.rstn, i)
    })
    ;(this.netlist.latches ?? []).forEach((l, i) => {
      add(this.depLatches, l.d, i)
      add(this.depLatches, l.en, i)
    })
  }

  private hasReset(): boolean {
    return this.netlist.flops.some((f) => f.rstn)
  }

  /** 回到 t=0。initialState 給定時，flop 直接載入該 state 且不驅動 reset。 */
  reset(initialState?: Values) {
    this.values = {}
    this.traces = {}
    this.queue = []
    this.pending = new Map()
    this.seq = 0
    this.now = 0
    this.nowDelta = 0
    this.edgeCount = 0
    this.records = []
    this.eventLog = []
    this.clockGenerated = {}
    this.pendingInputs = {}
    this.forcedState = initialState ?? null

    const set = (name: string, v: Bit) => {
      this.values[name] = v
      this.traces[name] = [{ t: 0, v }]
    }
    for (const c of this.netlist.clocks) set(c.name, 0)
    for (const inp of this.netlist.inputs) set(inp.name, inp.initial)
    const resetNames = new Set(this.netlist.flops.map((f) => f.rstn).filter(Boolean) as string[])
    for (const r of resetNames) {
      // rst_n：initialState 存在時視為已釋放；否則 t=0 為 0（asserted）
      set(r, initialState ? 1 : 0)
    }
    for (const f of this.netlist.flops) {
      const q: Bit = initialState ? (initialState[f.q] ?? 0) : (f.resetValue ?? 0)
      set(f.q, q)
      if (f.qb) set(f.qb, q ? 0 : 1)
    }
    for (const l of this.netlist.latches ?? []) set(l.q, initialState?.[l.q] ?? 0)
    for (const g of this.netlist.gates) set(g.out, 0)
    // comb 初值：zero-delay 迭代到穩定
    for (let iter = 0; iter < 64; iter++) {
      let changed = false
      for (const g of this.netlist.gates) {
        const v = g.fn(this.values)
        if (v !== this.values[g.out]) {
          this.values[g.out] = v
          this.traces[g.out] = [{ t: 0, v }]
          changed = true
        }
      }
      for (const l of this.netlist.latches ?? []) {
        const active = (l.activeHigh ?? true) ? this.values[l.en] === 1 : this.values[l.en] === 0
        if (active && this.values[l.d] !== this.values[l.q]) {
          this.values[l.q] = this.values[l.d]
          this.traces[l.q] = [{ t: 0, v: this.values[l.q] }]
          changed = true
        }
      }
      if (!changed) break
    }
    // 排 reset release
    if (!initialState && this.hasReset() && this.opts.resetRelease !== null) {
      const tRel = this.opts.resetRelease * this.period
      for (const r of resetNames) this.schedule(r, 1, tRel, 0, 'reset release')
    }
  }

  // ---------------------------------------------------------------- accessors
  get time() {
    return this.now
  }
  get edgeIndex() {
    return this.edgeCount
  }
  getValues(): Values {
    return { ...this.values }
  }
  getValue(name: string): Bit {
    return this.values[name] ?? 0
  }
  getState(): Values {
    const s: Values = {}
    for (const f of this.netlist.flops) s[f.q] = this.values[f.q]
    for (const l of this.netlist.latches ?? []) s[l.q] = this.values[l.q]
    return s
  }
  getStateString(): string {
    return toBitString(this.values, this.netlist.stateOrder)
  }
  getCombValues(): Values {
    const c: Values = {}
    for (const g of this.netlist.gates) c[g.out] = this.values[g.out]
    for (const f of this.netlist.flops) c[f.d] = this.values[f.d] ?? 0
    return c
  }
  getEventLog(): SimEvent[] {
    return [...this.eventLog]
  }

  /** 全部訊號的 trace（給 waveform） */
  getTraces(names?: string[]): SignalTrace[] {
    const list = names ?? this.defaultTraceNames()
    return list
      .filter((n) => this.traces[n])
      .map((n) => ({ name: n, events: [...this.traces[n]], kind: this.kindOf(n) }))
  }

  defaultTraceNames(): string[] {
    const nl = this.netlist
    const names: string[] = []
    for (const c of nl.clocks) names.push(c.name)
    for (const f of nl.flops) if (f.rstn && !names.includes(f.rstn)) names.push(f.rstn)
    for (const i of nl.inputs) if (!names.includes(i.name)) names.push(i.name)
    for (const f of nl.flops) if (!names.includes(f.q)) names.push(f.q)
    for (const l of nl.latches ?? []) if (!names.includes(l.q)) names.push(l.q)
    for (const w of nl.watch ?? []) if (!names.includes(w)) names.push(w)
    if (!names.includes(nl.output)) names.push(nl.output)
    return names
  }

  kindOf(name: string): SignalTrace['kind'] {
    const nl = this.netlist
    if (nl.clocks.some((c) => c.name === name)) return nl.clocks.length > 1 ? 'phase' : 'clock'
    if (nl.flops.some((f) => f.rstn === name)) return 'reset'
    if (name === nl.output) return 'output'
    if (nl.inputs.some((i) => i.name === name)) return 'control'
    return 'data'
  }

  /** 設定下一個 edge 前要改變的 input */
  setInput(name: string, v: Bit) {
    this.pendingInputs[name] = v
  }
  getPendingInputs(): Values {
    return { ...this.pendingInputs }
  }
  /** 目前 input（含 pending 覆寫） */
  getEffectiveInputs(): Values {
    const v: Values = {}
    for (const i of this.netlist.inputs) v[i.name] = this.pendingInputs[i.name] ?? this.values[i.name]
    return v
  }

  // ---------------------------------------------------------------- scheduling
  private schedule(signal: string, value: Bit, t: number, deltaOffset: number, cause: string) {
    const prev = this.pending.get(signal)
    if (prev) {
      // inertial：取消尚未發生的 pending event
      this.queue = this.queue.filter((e) => e !== prev)
      this.pending.delete(signal)
    }
    const current = this.values[signal]
    if (current === value) return
    const ev: QueuedEvent = {
      t,
      delta: t > this.now + EPS ? 0 : this.nowDelta + deltaOffset + 1,
      seq: this.seq++,
      signal,
      value,
      cause,
    }
    this.queue.push(ev)
    this.pending.set(signal, ev)
  }

  /** transport delay：不取消同訊號既有事件（clock 產生器用） */
  private scheduleTransport(signal: string, value: Bit, t: number, cause: string) {
    const ev: QueuedEvent = {
      t,
      delta: t > this.now + EPS ? 0 : this.nowDelta + 1,
      seq: this.seq++,
      signal,
      value,
      cause,
    }
    this.queue.push(ev)
  }

  private popNext(): QueuedEvent | undefined {
    if (this.queue.length === 0) return undefined
    let best = 0
    for (let i = 1; i < this.queue.length; i++) {
      const a = this.queue[i]
      const b = this.queue[best]
      if (a.t < b.t - EPS || (Math.abs(a.t - b.t) <= EPS && (a.delta < b.delta || (a.delta === b.delta && a.seq < b.seq)))) best = i
    }
    const ev = this.queue[best]
    this.queue.splice(best, 1)
    if (this.pending.get(ev.signal) === ev) this.pending.delete(ev.signal)
    return ev
  }

  private gateDelay(idx: number): number {
    if (this.opts.delayMode === 'ideal') return 0
    const g = this.netlist.gates[idx]
    return this.opts.gateDelayOverride ?? g.delay ?? this.netlist.defaultDelays?.gate ?? 0
  }
  private flopDelay(idx: number): number {
    if (this.opts.delayMode === 'ideal') return 0
    const f = this.netlist.flops[idx]
    return this.opts.tcqOverride ?? f.tcq ?? this.netlist.defaultDelays?.tcq ?? 0
  }

  /**
   * 產生 clock edge。只要某個週期的 rising edge 落在視窗內，就把「rising 與其對應的
   * falling」一起排進事件佇列——即使 falling 落在 tEnd 之後也沒關係：advanceTo 只處理
   * t <= tEnd 的事件，晚到的 falling 會留在佇列裡等下一次推進。
   *
   * （舊版把落在視窗外的 falling 另外記在單一欄位裡「下次再排」，但同一個 clock 的下一個
   *  週期會覆蓋掉還沒被沖出去的那一筆，導致某些 phase offset 的 clock 升起後永遠不下降。
   *  多相 clock 的 phase 0.5 / 0.625 會踩到，PMUX 的 sel = 4 / 5 因此整個停住。）
   */
  private clockEdgesUpTo(tEnd: number) {
    for (const c of this.netlist.clocks) {
      const P = c.period ?? this.period
      const duty = c.duty ?? 0.5
      const t0 = P + (c.phase ?? 0) * P
      let n = this.clockGenerated[c.name] ?? 0
      while (true) {
        const tr = t0 + n * P
        if (tr > tEnd + EPS) break
        this.scheduleTransport(c.name, 1, tr, 'clock')
        this.scheduleTransport(c.name, 0, tr + duty * P, 'clock')
        n++
      }
      this.clockGenerated[c.name] = n
    }
  }

  /** 推進到 tEnd（含），處理所有事件 */
  advanceTo(tEnd: number) {
    this.clockEdgesUpTo(tEnd)
    while (this.queue.length) {
      const next = this.queue.reduce((m, e) => (e.t < m.t - EPS || (Math.abs(e.t - m.t) <= EPS && e.delta < m.delta) ? e : m))
      if (next.t > tEnd + EPS) break
      const ev = this.popNext()!
      this.apply(ev)
    }
    if (tEnd > this.now) {
      this.now = tEnd
      this.nowDelta = 0
    }
  }

  private apply(ev: QueuedEvent) {
    if (ev.t > this.now + EPS) {
      this.now = ev.t
      this.nowDelta = ev.delta
    } else {
      this.nowDelta = Math.max(this.nowDelta, ev.delta)
    }
    const from = this.values[ev.signal]
    if (from === ev.value) return
    this.values[ev.signal] = ev.value
    ;(this.traces[ev.signal] ??= []).push({ t: ev.t, v: ev.value })
    this.eventLog.push({ t: ev.t, signal: ev.signal, from, to: ev.value, cause: ev.cause })
    this.propagate(ev.signal, ev.value)
  }

  private propagate(signal: string, value: Bit) {
    // gates
    for (const gi of this.depGates.get(signal) ?? []) {
      const g = this.netlist.gates[gi]
      const out = g.fn(this.values)
      this.schedule(g.out, out, this.now + this.gateDelay(gi), 0, `${g.label ?? g.out} ← ${signal}`)
    }
    // flops
    for (const fi of this.depFlops.get(signal) ?? []) {
      const f = this.netlist.flops[fi]
      if (f.rstn === signal) {
        if (value === 0) {
          const rv = f.resetValue ?? 0
          this.schedule(f.q, rv, this.now, 0, `${f.label ?? f.q} async reset`)
          if (f.qb) this.schedule(f.qb, rv ? 0 : 1, this.now, 0, `${f.label ?? f.q} async reset`)
        }
        continue
      }
      if (f.clk === signal) {
        const active: EdgeKind = value === 1 ? 'rising' : 'falling'
        if (active !== f.edge) continue
        if (f.rstn && this.values[f.rstn] === 0) continue
        const d = this.values[f.d] ?? 0
        const tcq = this.flopDelay(fi)
        this.schedule(f.q, d, this.now + tcq, 0, `${f.label ?? f.q} captures d=${d} @ ${signal} ${active}`)
        if (f.qb) this.schedule(f.qb, d ? 0 : 1, this.now + tcq, 0, `${f.label ?? f.q} qb`)
      }
    }
    // latches
    for (const li of this.depLatches.get(signal) ?? []) {
      const l = (this.netlist.latches ?? [])[li]
      const active = (l.activeHigh ?? true) ? this.values[l.en] === 1 : this.values[l.en] === 0
      if (!active) continue
      const dly = this.opts.delayMode === 'ideal' ? 0 : (l.delay ?? 0)
      this.schedule(l.q, this.values[l.d], this.now + dly, 0, `${l.label ?? l.q} transparent`)
    }
  }

  // ---------------------------------------------------------------- stepping
  private primaryClock() {
    return this.netlist.clocks[0]
  }
  private nextPrimaryEdgeTime(edgeSel: EdgeKind | 'both'): { t: number; edge: EdgeKind } {
    const c = this.primaryClock()
    const P = c.period ?? this.period
    const duty = c.duty ?? 0.5
    const t0 = P + (c.phase ?? 0) * P
    // 找第一個 > now 的 edge
    let n = Math.max(0, Math.floor((this.now - t0) / P) - 1)
    while (true) {
      const tr = t0 + n * P
      const tf = tr + duty * P
      if ((edgeSel === 'rising' || edgeSel === 'both') && tr > this.now + EPS) return { t: tr, edge: 'rising' }
      if ((edgeSel === 'falling' || edgeSel === 'both') && tf > this.now + EPS) return { t: tf, edge: 'falling' }
      n++
    }
  }

  /** 推進一個主 clock edge，回傳 StepRecord */
  stepEdge(): StepRecord {
    const sel = this.netlist.stepEdge ?? 'rising'
    const { t: tEdge, edge } = this.nextPrimaryEdgeTime(sel)
    const P = this.period
    const tIn = tEdge - this.opts.inputLead * P
    const logStart = this.eventLog.length

    // 1. input 改變
    if (tIn > this.now + EPS) this.advanceTo(tIn)
    for (const [name, v] of Object.entries(this.pendingInputs)) {
      this.schedule(name, v, this.now, 0, `input ${name}`)
    }
    this.pendingInputs = {}
    // 若被強制 state 且 rst_n 存在，確保 rst_n = 1
    if (this.forcedState) {
      for (const f of this.netlist.flops) if (f.rstn && this.values[f.rstn] === 0) this.schedule(f.rstn, 1, this.now, 0, 'reset release')
      this.forcedState = null
    }
    // 2. 推進到 edge 前一瞬間
    this.advanceTo(tEdge - EPS * 10)
    const stateBefore = this.getState()
    const combBefore = this.getCombValues()
    const inputs: Values = {}
    for (const i of this.netlist.inputs) inputs[i.name] = this.values[i.name]

    // 3. 通過 edge 並讓 propagation 完成，直到下一個 input 改變點之前
    const stepLen = sel === 'both' ? P * (this.primaryClock().duty ?? 0.5) : P
    const tEnd = tEdge + stepLen - this.opts.inputLead * P - EPS * 10
    this.advanceTo(Math.max(tEdge, tEnd))
    this.edgeCount++
    const rec: StepRecord = {
      edgeIndex: this.edgeCount,
      t: tEdge,
      edge,
      inputs,
      stateBefore,
      combBefore,
      stateAfter: this.getState(),
      valuesAfter: this.getValues(),
      output: this.values[this.netlist.output] ?? 0,
      events: this.eventLog.slice(logStart),
    }
    this.records.push(rec)
    return rec
  }

  /** 連續推進 n 個 edge，inputs 可依 edge index 給定 */
  run(n: number, inputAt?: (edgeIndex: number) => Partial<Values>): StepRecord[] {
    const out: StepRecord[] = []
    for (let i = 0; i < n; i++) {
      const upcoming = this.edgeCount + 1
      const inp = inputAt?.(upcoming)
      if (inp) for (const [k, v] of Object.entries(inp)) if (v !== undefined) this.setInput(k, v)
      out.push(this.stepEdge())
    }
    return out
  }
}

export function createSim(netlist: Netlist, opts?: SimOptions) {
  return new DividerSim(netlist, opts)
}

/** 便利函式：從 reset 跑 n 個 edge 並回傳 records 與 traces */
export function simulate(netlist: Netlist, n: number, opts?: SimOptions, inputAt?: (edgeIndex: number) => Partial<Values>) {
  const sim = new DividerSim(netlist, opts)
  const records = sim.run(n, inputAt)
  return { sim, records, traces: sim.getTraces(), period: sim.period }
}
