import type { Schematic } from '@/components/circuit/schematic'

export type SegmentKind = 'tcq' | 'logic' | 'wire' | 'mux' | 'setup' | 'hold'

export interface TimingSegment {
  id: string
  label: string
  /** 起點訊號 / 元件 */
  from: string
  to: string
  kind: SegmentKind
  /** min / max delay（ps） */
  min: number
  max: number
  /** 對應 schematic 的 wire / element id（高亮用） */
  wires?: string[]
  elements?: string[]
  note?: string
}

export type PathType = 'setup' | 'hold' | 'pulse-width' | 'recovery' | 'removal' | 'async' | 'output' | 'interface' | 'multicycle'

export interface TimingPath {
  id: string
  name: string
  type: PathType
  /** 只有在此 mode 才會被 sensitize（省略 = 所有 mode） */
  modes?: string[]
  launch: { element: string; edge: 'rising' | 'falling'; clock: string; label?: string }
  capture: { element: string; edge: 'rising' | 'falling'; clock: string; label?: string; setup?: number; hold?: number; minPulse?: number }
  segments: TimingSegment[]
  /** multicycle path 的 cycle 數（預設 1） */
  cycles?: number
  /** 若 launch 與 capture 在不同 edge（例如 rising → falling），可用時間 = period * fraction */
  periodFraction?: number
  sensitizedWhen?: string
  description?: string
  notes?: string[]
  /** 這條 path 限制的是什麼（Fmax / mode switching / latency…） */
  limits?: string
}

export interface TimingMode {
  id: string
  label: string
  description?: string
}

export interface TimingEnv {
  /** clock period（ps） */
  period: number
  /** capture clock 相對 launch clock 的到達差（ps）；正值 = capture 較晚 */
  skew: number
  /** cycle-to-cycle jitter / uncertainty（ps） */
  jitter: number
  /** 設計 margin（ps） */
  margin: number
}

export interface TimingScenario {
  id: string
  name: string
  description?: string
  schematic: Schematic
  env: TimingEnv
  paths: TimingPath[]
  modes?: TimingMode[]
  /** 說明各路徑的 launch / capture 名稱（顯示用） */
  glossary?: Record<string, string>
}

export interface BudgetItem {
  key: string
  label: string
  value: number
  kind: SegmentKind | 'skew' | 'jitter' | 'margin' | 'slack' | 'hold-req'
}

export interface SetupResult {
  type: 'setup'
  arrival: number
  required: number
  slack: number
  available: number
  dataDelay: number
  breakdown: BudgetItem[]
  fmax: number
  tclkMin: number
}

export interface HoldResult {
  type: 'hold'
  arrival: number
  required: number
  slack: number
  breakdown: BudgetItem[]
}

export interface PulseWidthResult {
  type: 'pulse-width'
  width: number
  required: number
  slack: number
}
