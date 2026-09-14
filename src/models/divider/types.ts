export type Bit = 0 | 1
export type Values = Record<string, Bit>

export type EdgeKind = 'rising' | 'falling'

export interface ClockDef {
  name: string
  /** 絕對週期；省略時等於 base period */
  period?: number
  /** 以自身週期為單位的相位偏移（0..1），例如 8-phase 的 phase 3 = 3/8 */
  phase?: number
  /** duty cycle 0..1，預設 0.5 */
  duty?: number
  description?: string
}

export interface InputDef {
  name: string
  initial: Bit
  description?: string
}

export interface FlopDef {
  /** Q 輸出訊號名稱 */
  q: string
  /** Q̄ 輸出訊號名稱（可省略） */
  qb?: string
  /** D 輸入訊號名稱 */
  d: string
  /** clock 訊號名稱（可以是另一個 flop 的 Q：ripple） */
  clk: string
  edge: EdgeKind
  /** 非同步 reset（active low）訊號名稱 */
  rstn?: string
  resetValue?: Bit
  /** clock-to-Q delay（real 模式使用） */
  tcq?: number
  label?: string
  description?: string
}

export interface LatchDef {
  q: string
  d: string
  en: string
  activeHigh?: boolean
  delay?: number
  label?: string
}

export type GateKind = 'inv' | 'buf' | 'and' | 'nand' | 'or' | 'nor' | 'xor' | 'xnor' | 'mux' | 'custom'

export interface GateDef {
  out: string
  inputs: string[]
  fn: (v: Values) => Bit
  delay?: number
  label?: string
  kind?: GateKind
  description?: string
}

export interface EquationDef {
  target: string
  /** 純文字方程式，例如 d0 = NOT q0 */
  text: string
  /** KaTeX 表示，例如 d_0 = \overline{q_0} */
  latex?: string
}

export interface Netlist {
  id: string
  name: string
  description?: string
  clocks: ClockDef[]
  inputs: InputDef[]
  flops: FlopDef[]
  latches?: LatchDef[]
  gates: GateDef[]
  /** state 顯示順序（MSB first） */
  stateOrder: string[]
  /** 主要輸出訊號 */
  output: string
  /** 額外在波形顯示的訊號 */
  watch?: string[]
  equations: EquationDef[]
  /** 合法 state（可省略，由 analysis 從 reset 推導） */
  legalStates?: string[]
  /** 主 clock 的哪一種 edge 當作「一步」 */
  stepEdge?: EdgeKind | 'both'
  defaultDelays?: { tcq?: number; gate?: number }
}

export interface TraceEvent {
  t: number
  v: Bit
}

export interface SignalTrace {
  name: string
  events: TraceEvent[]
  kind?: 'clock' | 'data' | 'control' | 'output' | 'reset' | 'phase' | 'x'
}

export interface SimEvent {
  t: number
  signal: string
  from: Bit
  to: Bit
  cause?: string
}

export interface StepRecord {
  /** 第幾個主 clock edge（從 1 開始） */
  edgeIndex: number
  /** edge 發生時間 */
  t: number
  edge: EdgeKind
  /** 本步 input 值（在 edge 前已穩定） */
  inputs: Values
  /** edge 前一瞬間的 state（flop Q） */
  stateBefore: Values
  /** edge 前一瞬間所有 comb 輸出與 D 值 */
  combBefore: Values
  /** 本步結束（propagation 完成後）的 state */
  stateAfter: Values
  /** 本步結束時所有訊號值 */
  valuesAfter: Values
  /** 主要輸出值（edge 後） */
  output: Bit
  /** 本步發生的事件（依時間排序） */
  events: SimEvent[]
}

export interface SimOptions {
  /** base clock period（單位任意，UI 以 ps 或 T 顯示）預設 100 */
  period?: number
  /** ideal：zero-delay delta cycle；real：使用 tcq / gate delay */
  delayMode?: 'ideal' | 'real'
  /** input 在 edge 前多久生效（以 period 的比例）預設 0.35 */
  inputLead?: number
  /** rst_n 釋放時間（以 period 的比例）預設 0.5；null 表示不自動驅動 reset */
  resetRelease?: number | null
  /** 覆寫初始 state（用於 illegal state 實驗） */
  initialState?: Values
  /** 覆寫每個 flop 的 tcq / 每個 gate 的 delay */
  tcqOverride?: number
  gateDelayOverride?: number
}
