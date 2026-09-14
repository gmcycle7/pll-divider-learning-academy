import { useMemo, useState, type ReactNode } from 'react'
import { useSimulation, type UseSimulationOptions } from '@/hooks/useSimulation'
import type { Netlist, Values } from '@/models/divider/types'
import { measureDivide } from '@/models/divider/analysis'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import type { Schematic, SchematicHighlight } from '@/components/circuit/schematic'
import { deriveTimingArcs } from '@/components/circuit/arcs'
import { EdgeStepper } from './EdgeStepper'
import { StateTable } from './StateTable'
import { EquationList } from '@/components/content'
import { toBitString } from '@/utils/bits'
import { fmtT, pct } from '@/utils/format'

export interface DividerSimPanelProps {
  netlist: Netlist
  schematic?: Schematic
  options?: UseSimulationOptions
  title?: ReactNode
  /** 波形顯示哪些訊號（預設 engine 的 default） */
  signals?: string[]
  /** 顯示幾個 clock 週期的波形視窗 */
  windowCycles?: number
  showTable?: boolean
  showEquations?: boolean
  showNarration?: boolean
  showMeasure?: boolean
  showDelayMode?: boolean
  showInputs?: boolean
  highlights?: SchematicHighlight[]
  /** 自訂每步敘述 */
  narrate?: (rec: import('@/models/divider/types').StepRecord, netlist: Netlist, period: number) => ReactNode
  children?: ReactNode
  /** 允許使用者設定任意初始 state */
  allowInitialState?: boolean
  compact?: boolean
  showEdgeTimes?: boolean
  showPulseWidths?: boolean
}

export function DividerSimPanel(props: DividerSimPanelProps) {
  const {
    netlist,
    schematic,
    title,
    signals,
    windowCycles = 10,
    showTable = true,
    showEquations = true,
    showNarration = true,
    showMeasure = true,
    showDelayMode = false,
    showInputs = true,
    highlights,
    narrate,
    children,
    allowInitialState = false,
    compact = false,
    showEdgeTimes = true,
    showPulseWidths = false,
  } = props
  const [delayMode, setDelayMode] = useState<'ideal' | 'real'>(props.options?.delayMode ?? 'ideal')
  const options = useMemo(() => ({ period: 100, ...props.options, delayMode }), [props.options, delayMode])
  const sim = useSimulation(netlist, options)
  const arcs = useMemo(() => (schematic ? deriveTimingArcs(netlist, schematic) : []), [netlist, schematic])
  const T = sim.period
  const traces = signals ? sim.sim.getTraces(signals) : sim.traces
  const tEnd = Math.max(windowCycles * T, (sim.edgeIndex + 2) * T)
  const tStart = Math.max(0, tEnd - windowCycles * T)
  const outTrace = traces.find((t) => t.name === netlist.output)
  const measure = outTrace ? measureDivide(outTrace, T) : null
  const cur = sim.current
  const inputsDef = netlist.inputs

  const edgeLabels = useMemo(() => {
    const out: { t: number; label: string }[] = []
    for (let k = 1; k * T <= tEnd; k++) if (k * T >= tStart) out.push({ t: k * T, label: `${k}` })
    return out
  }, [T, tEnd, tStart])

  return (
    <div className="panel">
      {title ? <div className="panel-title">{title}</div> : null}
      {showInputs && inputsDef.length ? (
        <div className="control-row">
          <span className="small muted">Input（在下一個 edge 前生效）：</span>
          <div className="input-toggles">
            {inputsDef.map((i) => {
              const v = sim.effectiveInputs[i.name]
              return (
                <button key={i.name} className={`input-toggle ${v ? 'on' : ''}`} onClick={() => sim.setInput(i.name, v ? 0 : 1)} title={i.description}>
                  {i.name} = <b>{v}</b>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
      {showDelayMode || allowInitialState ? (
        <div className="control-row">
          {showDelayMode ? (
            <label>
              Delay 模式
              <select value={delayMode} onChange={(e) => setDelayMode(e.target.value as 'ideal' | 'real')}>
                <option value="ideal">理想（zero delay）</option>
                <option value="real">實際（tCQ / gate delay）</option>
              </select>
            </label>
          ) : null}
          {allowInitialState ? <InitialStatePicker netlist={netlist} onPick={(s) => sim.reset(s)} /> : null}
        </div>
      ) : null}
      <EdgeStepper sim={sim} />
      <div className="control-row">
        <span className="small muted">目前 state：</span>
        <span className="state-bits">
          {netlist.stateOrder.map((b) => {
            const changed = cur ? cur.stateBefore[b] !== cur.stateAfter[b] : false
            return (
              <span key={b} className={`state-bit ${changed ? 'changed' : ''}`}>
                <small>{b}</small>
                <b>{sim.state[b]}</b>
              </span>
            )
          })}
        </span>
        <span className="mono">= {sim.stateString}</span>
        <span className="small muted">輸出 {netlist.output} =</span>
        <b className={`value-${sim.values[netlist.output] ?? 0}`}>{sim.values[netlist.output] ?? 0}</b>
      </div>
      {schematic ? <LogicDiagram schematic={schematic} values={sim.values} highlights={highlights} showLegend={!compact} arcs={arcs} /> : null}
      <ClockWaveform
        signals={traces}
        tStart={tStart}
        tEnd={tEnd}
        period={T}
        edgeLabels={edgeLabels}
        markers={cur ? [{ t: cur.t, label: `edge ${cur.edgeIndex}`, kind: 'edge' }] : []}
        showEdgeTimes={showEdgeTimes}
        showPulseWidths={showPulseWidths}
        highlight={[netlist.output]}
      />
      {showNarration && cur ? (
        <div className="narration">
          {narrate ? narrate(cur, netlist, T) : <DefaultNarration netlist={netlist} rec={cur} period={T} />}
        </div>
      ) : null}
      {showNarration && !cur ? (
        <div className="narration">
          尚未有任何 clock edge。目前 state = <span className="mono">{sim.stateString}</span>（reset state）。按「下一個 Clock Edge」觀察第一個 edge 發生什麼事。
        </div>
      ) : null}
      {showEquations ? (
        <details open={!compact}>
          <summary className="small muted">Next-state equations</summary>
          <EquationList equations={netlist.equations} />
        </details>
      ) : null}
      {showTable ? (
        <details open={!compact}>
          <summary className="small muted">State transition table（逐 edge）</summary>
          <StateTable netlist={netlist} records={sim.records} period={T} />
        </details>
      ) : null}
      {showMeasure && measure ? (
        <div className="small muted" style={{ marginTop: '0.5em' }}>
          量測：output rising edge 間隔 = {measure.intervals.length ? measure.intervals.map((x) => `${x}T`).join(', ') : '（尚未有兩個以上 rising edge）'}
          {measure.ratio !== null ? (
            <>
              　⇒ 平均 divide ratio = <b>{measure.ratio}</b>
              {measure.duty !== null ? <>　duty cycle ≈ <b>{pct(measure.duty)}</b></> : null}
            </>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  )
}

function InitialStatePicker({ netlist, onPick }: { netlist: Netlist; onPick: (s: Values) => void }) {
  const width = netlist.stateOrder.length
  const [val, setVal] = useState('0'.repeat(width))
  return (
    <label>
      從任意 state 啟動（{netlist.stateOrder.join('')}）：
      <input type="text" value={val} onChange={(e) => setVal(e.target.value.replace(/[^01]/g, '').slice(0, width))} style={{ width: `${width + 3}em`, fontFamily: 'var(--mono)' }} />
      <button
        className="btn btn-sm"
        onClick={() => {
          const s: Values = {}
          netlist.stateOrder.forEach((b, i) => {
            s[b] = val.padStart(width, '0')[i] === '1' ? 1 : 0
          })
          onPick(s)
        }}
      >
        載入
      </button>
    </label>
  )
}

export function DefaultNarration({ netlist, rec, period }: { netlist: Netlist; rec: import('@/models/divider/types').StepRecord; period: number }) {
  const before = toBitString(rec.stateBefore, netlist.stateOrder)
  const after = toBitString(rec.stateAfter, netlist.stateOrder)
  const inputs = netlist.inputs.map((i) => `${i.name}=${rec.inputs[i.name]}`).join('，')
  const dVals = netlist.flops.map((f) => `${f.d}=${rec.combBefore[f.d]}`).join('，')
  return (
    <ol>
      <li>
        <b>Edge {rec.edgeIndex}</b>（t = {fmtT(rec.t, period)}，{rec.edge === 'rising' ? 'rising' : 'falling'}）之前：state = <span className="mono">{before}</span>
        {inputs ? <>，input：<span className="mono">{inputs}</span></> : null}。
      </li>
      <li>
        Combinational logic 依目前 state 算好下一個值：<span className="mono">{dVals}</span>。
      </li>
      <li>
        Edge 發生，每個 flop 把自己的 D 抓進 Q ⇒ state 變成 <span className="mono">{after}</span>
        {before === after ? '（沒有變化）' : ''}。
      </li>
      <li>
        輸出 {netlist.output} = <b className={`value-${rec.output}`}>{rec.output}</b>。
      </li>
    </ol>
  )
}
