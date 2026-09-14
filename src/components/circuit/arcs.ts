import type { Netlist } from '@/models/divider/types'
import type { TimingScenario } from '@/models/timing/types'
import { parseRef, type Schematic, type SchElement } from './schematic'

/** 點擊元件時顯示的 timing arc：從某個 pin 到另一個 pin 的一段延遲／時序要求 */
export interface TimingArc {
  element: string
  /** 起點 pin 名稱（dff：d/clk/q/qb；gate：in0..inN/out；mux：in0../sel/out；box：自訂） */
  from: string
  to: string
  label: string
  kind: 'tcq' | 'tpd' | 'setup' | 'transparent' | 'segment'
}

const GATE_KINDS = new Set(['inv', 'buf', 'and', 'nand', 'or', 'nor', 'xor', 'xnor', 'mux2', 'mux4', 'mux8'])

function firstPins(e: SchElement): { input: string | null; output: string | null } {
  if (e.kind === 'box') {
    const left = (e.pins ?? []).find((p) => p.side === 'left')?.name ?? null
    const right = (e.pins ?? []).find((p) => p.side === 'right')?.name ?? null
    return { input: left, output: right }
  }
  if (GATE_KINDS.has(e.kind)) return { input: 'in0', output: 'out' }
  if (e.kind === 'dff' || e.kind === 'tff' || e.kind === 'latch') return { input: e.kind === 'tff' ? 't' : 'd', output: 'q' }
  return { input: null, output: null }
}

/**
 * 由 netlist + schematic 推導每個元件的 timing arc（給 DividerSimPanel 用）：
 * - flop：clk → q（tCQ）、d → clk（setup / hold 相對 clk edge）
 * - latch：en → q（transparent）、d → q
 * - gate：每個有接線的輸入 pin → out（tpd；delay 由「out pin 的 wire signal」對回 netlist 的 gate）
 */
export function deriveTimingArcs(netlist: Netlist, schematic: Schematic): TimingArc[] {
  const arcs: TimingArc[] = []
  const outSignal = new Map<string, string>()
  const inPins = new Map<string, Set<string>>()
  for (const w of schematic.wires) {
    const a = parseRef(w.from)
    const b = parseRef(w.to)
    if (a.pin === 'out' && w.signal && !outSignal.has(a.elem)) outSignal.set(a.elem, w.signal)
    if (!inPins.has(b.elem)) inPins.set(b.elem, new Set())
    inPins.get(b.elem)!.add(b.pin)
  }
  const dTcq = netlist.defaultDelays?.tcq
  const dGate = netlist.defaultDelays?.gate
  for (const e of schematic.elements) {
    if (e.kind === 'dff' || e.kind === 'tff' || e.kind === 'latch') {
      const flop = e.signal ? netlist.flops.find((f) => f.q === e.signal) : undefined
      const latch = e.signal ? (netlist.latches ?? []).find((l) => l.q === e.signal) : undefined
      if (e.kind === 'latch' || latch) {
        const d = latch?.delay
        arcs.push({ element: e.id, from: 'en', to: 'q', label: 'enable 期間 transparent', kind: 'transparent' })
        arcs.push({ element: e.id, from: 'd', to: 'q', label: `d → q${d !== undefined ? ` ${d} ps` : ''}（enable = 1 時）`, kind: 'tpd' })
      } else {
        const tcq = flop?.tcq ?? dTcq
        arcs.push({ element: e.id, from: 'clk', to: 'q', label: `tCQ${tcq !== undefined ? ` = ${tcq} ps` : ''}`, kind: 'tcq' })
        arcs.push({ element: e.id, from: e.kind === 'tff' ? 't' : 'd', to: 'clk', label: 'setup / hold（相對 clk edge）', kind: 'setup' })
      }
      continue
    }
    if (!GATE_KINDS.has(e.kind)) continue
    const sig = outSignal.get(e.id)
    const gate = sig ? netlist.gates.find((g) => g.out === sig) : undefined
    const delay = gate?.delay ?? dGate
    const label = `tpd${delay !== undefined ? ` = ${delay} ps` : ''}`
    const wired = [...(inPins.get(e.id) ?? [])].filter((p) => p !== 'out').sort()
    const pins = wired.length ? wired : e.kind === 'inv' || e.kind === 'buf' ? ['in0'] : ['in0', 'in1']
    for (const pin of pins) arcs.push({ element: e.id, from: pin, to: 'out', label, kind: 'tpd' })
  }
  return arcs
}

/**
 * 由 TimingScenario 的 segments 推導 arc（給 CriticalPathExplorer 用）：
 * 每個 segment 若掛在某個元件上，就在那個元件畫一條「segment.label min–max ps」的 arc。
 */
export function deriveArcsFromScenario(scenario: TimingScenario): TimingArc[] {
  const byId = new Map(scenario.schematic.elements.map((e) => [e.id, e]))
  const seen = new Set<string>()
  const arcs: TimingArc[] = []
  for (const p of scenario.paths) {
    for (const seg of p.segments) {
      for (const id of seg.elements ?? []) {
        const e = byId.get(id)
        if (!e) continue
        const key = `${id}|${seg.label}|${seg.min}|${seg.max}`
        if (seen.has(key)) continue
        seen.add(key)
        const isFlop = e.kind === 'dff' || e.kind === 'tff' || e.kind === 'latch'
        let from: string | null
        let to: string | null
        if (isFlop && seg.kind === 'tcq') {
          from = 'clk'
          to = 'q'
        } else if (isFlop && (seg.kind === 'setup' || seg.kind === 'hold')) {
          from = e.kind === 'tff' ? 't' : 'd'
          to = 'clk'
        } else {
          const fp = firstPins(e)
          from = fp.input
          to = fp.output
        }
        if (!from || !to) continue
        const range = seg.min === seg.max ? `${seg.max} ps` : `${seg.min}–${seg.max} ps`
        arcs.push({ element: id, from, to, label: `${seg.label} ${range}`, kind: seg.kind === 'tcq' ? 'tcq' : seg.kind === 'setup' || seg.kind === 'hold' ? 'setup' : 'segment' })
      }
    }
  }
  return arcs
}
