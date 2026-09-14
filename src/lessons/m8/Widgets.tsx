import { useMemo, useState, type ReactNode } from 'react'
import type { Netlist, SignalTrace } from '@/models/divider/types'
import { buildStateGraph, type StateGraph } from '@/models/divider/analysis'
import { simulate } from '@/models/divider/engine'
import { useSimulation } from '@/hooks/useSimulation'
import { EdgeStepper } from '@/components/sim/EdgeStepper'
import { StateTable } from '@/components/sim/StateTable'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { StateDiagram, graphToDiagram } from '@/components/circuit/StateDiagram'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import type { Schematic } from '@/components/circuit/schematic'
import { ClockWaveform, clockTrace, traceFrom, type WaveAnnotation, type WaveMarker, type WaveShade } from '@/components/waveform/ClockWaveform'
import { CompareTable, Math as M } from '@/components/content'
import type { TimingEnv, TimingScenario } from '@/models/timing/types'
import { worstHold, worstSetup } from '@/models/timing/sta'
import { div3 } from '@/models/divider/examples'
import { allStates, toBitString } from '@/utils/bits'
import { fmtNum } from '@/utils/format'
import { buildGrayDiv3, grayDiv3Candidates, stateFromString } from './models'
import { grayDiv3BoxSchematic } from './schematics'

/* ------------------------------------------------------------------------------------------------
 * 共用：state 的分類 chip
 * ---------------------------------------------------------------------------------------------- */
function classify(graph: StateGraph, s: string): { kind: 'cycle' | 'transient' | 'lockup'; steps: number } {
  const n = graph.nodes.find((x) => x.state === s)
  if (!n) return { kind: 'lockup', steps: -1 }
  if (n.onCycle) return { kind: 'cycle', steps: 0 }
  if (n.lockup) return { kind: 'lockup', steps: -1 }
  return { kind: 'transient', steps: n.stepsToCycle }
}

export function StateChip({ graph, s, arrow }: { graph: StateGraph; s: string; arrow?: boolean }) {
  const c = classify(graph, s)
  const cls = c.kind === 'cycle' ? 'chip chip-ok' : c.kind === 'lockup' ? 'chip chip-danger' : 'chip chip-warn'
  return (
    <>
      <span className={cls} style={{ fontFamily: 'var(--mono)' }} title={c.kind === 'cycle' ? '主循環' : c.kind === 'lockup' ? 'lock-up' : `${c.steps} 步後回到主循環`}>
        {s}
      </span>
      {arrow ? <span className="muted"> → </span> : null}
    </>
  )
}

/* ------------------------------------------------------------------------------------------------
 * StateGraphTable：列出所有 2^n 個 state 的 next / 分類 / 幾步回到主循環
 * ---------------------------------------------------------------------------------------------- */
export function StateGraphTable({ netlist, current, compact }: { netlist: Netlist; current?: string; compact?: boolean }) {
  const graph = useMemo(() => buildStateGraph(netlist, {}), [netlist])
  return (
    <div className="scroll-x">
      <table className="state-table">
        <thead>
          <tr>
            <th>state（{netlist.stateOrder.join('')}）</th>
            <th>next</th>
            <th>{netlist.output}</th>
            <th>分類</th>
            {!compact ? <th>到主循環的步數</th> : null}
          </tr>
        </thead>
        <tbody>
          {graph.nodes.map((n) => {
            const c = classify(graph, n.state)
            return (
              <tr key={n.state} className={current === n.state ? 'current' : ''}>
                <td>
                  <b>{n.state}</b>
                </td>
                <td>{n.next}</td>
                <td className={n.output ? 'value-1' : 'value-0'}>{n.output}</td>
                <td style={{ fontFamily: 'var(--font)' }}>
                  {c.kind === 'cycle' ? <span className="chip chip-ok">合法（主循環）</span> : c.kind === 'lockup' ? <span className="chip chip-danger">lock-up</span> : <span className="chip chip-warn">unused，會回來</span>}
                </td>
                {!compact ? <td style={{ fontFamily: 'var(--font)' }}>{c.kind === 'cycle' ? '0（已在循環上）' : c.kind === 'lockup' ? '∞（永遠不會）' : `${c.steps} 個 edge`}</td> : null}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="small muted">
        主循環：{graph.mainCycle.join(' → ')} → {graph.mainCycle[0]}（{graph.mainCycle.length} 個 state）；lock-up：{graph.lockup.length ? graph.lockup.join(', ') : '無'}。
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
 * StateGraphExplorer：從任意 state 啟動，逐 edge 看它走到哪裡
 * ---------------------------------------------------------------------------------------------- */
export interface StateGraphExplorerProps {
  netlist: Netlist
  schematic?: Schematic
  title?: ReactNode
  /** 開始時預設載入的 state（省略 = 從 reset 開始） */
  initialStart?: string
  windowCycles?: number
  showTable?: boolean
  showSchematic?: boolean
  children?: ReactNode
}

export function StateGraphExplorer({ netlist, schematic, title, initialStart, windowCycles = 8, showTable = true, showSchematic = true, children }: StateGraphExplorerProps) {
  const graph = useMemo(() => buildStateGraph(netlist, {}), [netlist])
  const diag = useMemo(() => graphToDiagram(graph, 'clk↑'), [graph])
  const simOpts = useMemo(() => ({ period: 100, initialState: initialStart ? stateFromString(netlist, initialStart) : undefined }), [netlist, initialStart])
  const sim = useSimulation(netlist, simOpts)
  const width = netlist.stateOrder.length
  const [text, setText] = useState(initialStart ?? '')
  const T = sim.period
  const order = netlist.stateOrder

  const pick = (s: string) => {
    setText(s)
    sim.reset(stateFromString(netlist, s))
  }
  const fromReset = () => {
    setText('')
    sim.reset(undefined)
  }
  const randomPowerUp = () => {
    const states = allStates(width)
    pick(states[Math.floor(Math.random() * states.length)])
  }

  const path = sim.records.length ? [toBitString(sim.records[0].stateBefore, order), ...sim.records.map((r) => toBitString(r.stateAfter, order))] : [sim.stateString]
  const startState = path[0]
  const startInfo = classify(graph, startState)
  const enterIdx = path.findIndex((s) => graph.mainCycle.includes(s))
  const hasReset = netlist.flops.some((f) => f.rstn)
  const startedFromReset = sim.records.length === 0 ? true : (sim.sim.getTraces(['rst_n'])[0]?.events.some((e) => e.v === 0) ?? false)
  const tEnd = Math.max(windowCycles * T, (sim.edgeIndex + 2) * T)
  const tStart = Math.max(0, tEnd - windowCycles * T)
  const cur = sim.current
  const edgeLabels = useMemo(() => {
    const out: { t: number; label: string }[] = []
    for (let k = 1; k * T <= tEnd; k++) if (k * T >= tStart) out.push({ t: k * T, label: `${k}` })
    return out
  }, [T, tEnd, tStart])

  return (
    <div className="panel">
      {title ? <div className="panel-title">{title}</div> : null}
      <div className="two-col">
        <div>
          <StateDiagram {...diag} current={sim.stateString} onSelect={pick} width={340} height={width >= 3 ? 320 : 240} title="點一個 state 當作上電時的初始值" />
        </div>
        <div>
          <div className="control-row">
            <label>
              初始 state（{order.join('')}）：
              <input type="text" value={text} onChange={(e) => setText(e.target.value.replace(/[^01]/g, '').slice(0, width))} placeholder={'0'.repeat(width)} style={{ width: `${width + 3}em`, fontFamily: 'var(--mono)' }} />
            </label>
            <button className="btn btn-sm btn-primary" onClick={() => pick(text.padStart(width, '0'))} disabled={text.length === 0}>
              從這個 state 啟動
            </button>
            <button className="btn btn-sm" onClick={randomPowerUp} title="真實矽片：每次上電的初始 state 由雜訊與 mismatch 決定">
              🎲 隨機上電
            </button>
            {hasReset ? (
              <button className="btn btn-sm" onClick={fromReset} title="rst_n 在 t=0 拉低、0.5T 釋放">
                用 reset 啟動（{graph.resetState}）
              </button>
            ) : null}
          </div>
          <div className="small" style={{ marginBottom: '0.4em' }}>
            起點 <span className="mono">{startState}</span>
            {startedFromReset && hasReset && sim.records.length > 0 ? <span className="chip chip-accent" style={{ marginLeft: '0.4em' }}>由 rst_n 決定</span> : null}
            ：{' '}
            {startInfo.kind === 'cycle' ? (
              <span className="chip chip-ok">合法 state，本來就在主循環上</span>
            ) : startInfo.kind === 'lockup' ? (
              <span className="chip chip-danger">lock-up state：永遠回不到主循環</span>
            ) : (
              <span className="chip chip-warn">unused state：{startInfo.steps} 個 edge 後回到主循環</span>
            )}
          </div>
          <div className="small" style={{ lineHeight: 2 }}>
            走過的 state：
            {path.map((s, i) => (
              <StateChip key={i} graph={graph} s={s} arrow={i < path.length - 1} />
            ))}
            {enterIdx > 0 ? <span className="muted">　（第 {enterIdx} 個 edge 後進入主循環）</span> : null}
            {enterIdx < 0 && sim.records.length >= 2 ? <span className="slack-bad">　還沒進入主循環</span> : null}
          </div>
          <div className="small muted" style={{ marginTop: '0.3em' }}>
            <span className="chip chip-ok">綠</span> 主循環　<span className="chip chip-warn">黃</span> unused 但會回來　<span className="chip chip-danger">紅</span> lock-up
          </div>
        </div>
      </div>
      <EdgeStepper sim={sim} />
      <div className="control-row">
        <span className="small muted">目前 state：</span>
        <span className="state-bits">
          {order.map((b) => {
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
        {cur ? (
          <span className="small muted">
            edge {cur.edgeIndex}：{toBitString(cur.stateBefore, order)} → {toBitString(cur.stateAfter, order)}
            {toBitString(cur.stateBefore, order) === toBitString(cur.stateAfter, order) ? '（沒有變化）' : ''}
          </span>
        ) : null}
      </div>
      {showSchematic && schematic ? <LogicDiagram schematic={schematic} values={sim.values} showLegend={false} /> : null}
      <ClockWaveform signals={sim.traces} tStart={tStart} tEnd={tEnd} period={T} edgeLabels={edgeLabels} markers={cur ? [{ t: cur.t, label: `edge ${cur.edgeIndex}`, kind: 'edge' }] : []} highlight={[netlist.output]} showEdgeTimes />
      {showTable ? (
        <details>
          <summary className="small muted">State transition table（逐 edge）</summary>
          <StateTable netlist={netlist} records={sim.records} period={T} />
        </details>
      ) : null}
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
 * XStartDemo：沒有 reset 的 RTL 模擬（X 永遠傳下去）vs 有 reset
 * ---------------------------------------------------------------------------------------------- */
export function XStartDemo() {
  const T = 100
  const [withReset, setWithReset] = useState(false)
  const withResetTraces = useMemo(() => simulate(div3, 6, { period: T }).traces.filter((t) => ['clk', 'rst_n', 'q0', 'q1', 'd0'].includes(t.name)), [])
  const noResetTraces: SignalTrace[] = useMemo(
    () => [clockTrace('clk', T, 6), traceFrom('q0', [{ t: 0, v: 1 }], 'x'), traceFrom('q1', [{ t: 0, v: 1 }], 'x'), traceFrom('d0', [{ t: 0, v: 1 }], 'x')],
    [],
  )
  const ann: WaveAnnotation[] = withReset
    ? [{ t: 0.5 * T, signal: 'rst_n', text: 'rst_n 釋放：state 從 00 開始' }]
    : [
        { t: 0, signal: 'q0', text: 'X：上電值未知' },
        { t: 0, signal: 'd0', text: 'd0 = NOR(X, X) = X' },
        { t: 3 * T, signal: 'q1', text: '每個 edge 抓進來的還是 X' },
      ]
  return (
    <div className="panel">
      <div className="panel-title">
        RTL 模擬的上電
        <span className="btn-group">
          <button className={`btn btn-sm ${!withReset ? 'active' : ''}`} onClick={() => setWithReset(false)}>
            沒有 reset
          </button>
          <button className={`btn btn-sm ${withReset ? 'active' : ''}`} onClick={() => setWithReset(true)}>
            有 reset
          </button>
        </span>
      </div>
      <ClockWaveform signals={withReset ? withResetTraces : noResetTraces} tEnd={7 * T} period={T} xSignals={withReset ? [] : ['q0', 'q1', 'd0']} annotations={ann} zoomable={false} showValuesAtCursor={withReset} />
      <p className="small muted" style={{ margin: '0.4em 0 0' }}>
        {withReset
          ? 'rst_n 在 t = 0 為 0（asserted），q0 = q1 = 0；0.5T 釋放之後，第一個 rising edge（t = 1T）抓到 d0 = NOR(0,0) = 1，state 變成 01。之後一切確定。'
          : '模擬器不知道 q0、q1 上電是 0 還是 1，只能標成 X。NOR(X, X) = X，所以 d0 = X；下一個 edge 抓進來的還是 X。沒有任何一個 edge 能把 X 變成 0 或 1——整個 divider 從頭到尾都是 X，輸出也是 X。'}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
 * ResetReleaseDemo：rst_n 在 clock edge 附近釋放的三種結果（早 / 晚 / window 內 → X）
 * ---------------------------------------------------------------------------------------------- */
const T = 100
const T_REC = 10
const T_REM = 5
const T_AND = 14
const T_SETUP = 7
const T_HOLD = 3
const T_CQ = 8

function toggleTrace(name: string, firstEdge: number, edges: number[], kind: SignalTrace['kind'] = 'output'): SignalTrace {
  const ev: { t: number; v: 0 | 1 }[] = [{ t: 0, v: 0 }]
  let v: 0 | 1 = 0
  for (const e of edges) {
    if (e < firstEdge) continue
    v = v ? 0 : 1
    ev.push({ t: e + T_CQ, v })
  }
  return { name, events: ev, kind }
}

export function ResetReleaseDemo() {
  const [mode, setMode] = useState<'async' | 'sync'>('async')
  const [off, setOff] = useState(-30)
  const edgeT = 2 * T
  const edges = [1, 2, 3, 4, 5].map((k) => k * T)
  const tRel = edgeT + off
  // 分類
  const win: [number, number] = mode === 'async' ? [-T_REC, T_REM] : [-T_SETUP - T_AND, T_HOLD - T_AND]
  const verdict: 'early' | 'late' | 'x' = off <= win[0] ? 'early' : off >= win[1] ? 'late' : 'x'
  const clk = clockTrace('clk', T, 5)
  const rst: SignalTrace = mode === 'async' ? { name: 'rst_n', events: [{ t: 0, v: 0 }, { t: tRel, v: 1 }], kind: 'reset' } : { name: 'rst', events: [{ t: 0, v: 1 }, { t: tRel, v: 0 }], kind: 'control' }
  const qA = toggleTrace('q0', edgeT, edges)
  const qB = toggleTrace('q0', edgeT + T, edges)
  let signals: SignalTrace[]
  if (verdict === 'early') signals = [clk, rst, qA]
  else if (verdict === 'late') signals = [clk, rst, qB]
  else signals = [clk, rst, { name: 'q0 (RTL)', events: [{ t: 0, v: 0 }, { t: edgeT + T_CQ, v: 1 }], kind: 'x' }, { ...qA, name: 'q0 (矽片可能 A)' }, { ...qB, name: 'q0 (矽片可能 B)' }]
  if (mode === 'sync') {
    // 同步 reset：D = NOT q0 AND NOT rst，畫出 D 讓人看到它經過 AND 之後才改變
    const d: SignalTrace = { name: 'd0', events: [{ t: 0, v: 0 }, { t: tRel + T_AND, v: 1 }], kind: 'data' }
    signals = [signals[0], signals[1], d, ...signals.slice(2)]
  }
  const shades: WaveShade[] = [
    { t0: edgeT + win[0], t1: edgeT + win[1], kind: 'danger', label: mode === 'async' ? `recovery ${T_REC} | removal ${T_REM}` : `setup ${T_SETUP} | hold ${T_HOLD}（折算到 rst：往前 ${T_AND} ps）`, signal: rst.name },
  ]
  const markers: WaveMarker[] = [
    { t: edgeT, label: 'edge 2', kind: 'edge' },
    { t: tRel, label: `${mode === 'async' ? 'rst_n 釋放' : 'rst 拉低'} @ edge ${off >= 0 ? '+' : '−'} ${Math.abs(off)} ps`, kind: 'input', signal: rst.name },
  ]
  const ann: WaveAnnotation[] = verdict === 'x' ? [{ t: edgeT + T_CQ, signal: 'q0 (RTL)', text: 'X：這個 edge 抓到 0 還是 1？未知' }] : []

  const explain =
    mode === 'async'
      ? verdict === 'early'
        ? `rst_n 在 edge 2 之前 ${-off} ps 釋放，早於 t_recovery = ${T_REC} ps：flop 在 edge 2 就確定已經離開 reset，正常抓 D，q0 從 edge 2 開始 toggle。`
        : verdict === 'late'
          ? `rst_n 在 edge 2 之後 ${off} ps 才釋放，晚於 t_removal = ${T_REM} ps：edge 2 那一刻 flop 確定還在 reset（q0 被壓在 0），第一個有效 edge 是 edge 3。結果也是確定的，只是晚一拍。`
          : `rst_n 在 edge 2 前後 ${Math.abs(off)} ps 釋放，落在 recovery/removal window（−${T_REC} … +${T_REM} ps）內：flop 內部的 reset 電晶體與 clock 取樣同時在動作，它可能在 edge 2 抓到 D（結果 A），也可能沒抓到（結果 B），甚至 metastable。RTL 模擬只能給 X。`
      : verdict === 'early'
        ? `rst 在 edge 2 之前 ${-off} ps 拉低，經過 AND（${T_AND} ps）後 d0 在 edge 前 ${-off - T_AND} ps 變成 1，≥ t_setup = ${T_SETUP} ps：edge 2 正常抓到 1。`
        : verdict === 'late'
          ? `rst 在 edge 2 前 ${-off} ps（或之後）才拉低，d0 要到 edge 後 ${off + T_AND} ps 才變 1（晚於 t_hold = ${T_HOLD} ps）：edge 2 抓到的是舊的 d0 = 0，state 仍是 0；edge 3 才開始。`
          : `rst 拉低的時間經過 AND 折算後，d0 剛好在 edge 2 的 setup/hold window 內改變：這是普通的 setup/hold violation（不是 recovery/removal），結果同樣未知。`

  return (
    <div className="panel">
      <div className="panel-title">
        Reset 釋放時間 vs clock edge
        <span className="btn-group">
          <button className={`btn btn-sm ${mode === 'async' ? 'active' : ''}`} onClick={() => setMode('async')}>
            非同步 reset（rst_n → flop）
          </button>
          <button className={`btn btn-sm ${mode === 'sync' ? 'active' : ''}`} onClick={() => setMode('sync')}>
            同步 reset（rst → AND → D）
          </button>
        </span>
      </div>
      <div className="control-row">
        <label>
          釋放時間（相對 edge 2，ps）
          <input type="range" min={-50} max={50} step={1} value={off} onChange={(e) => setOff(Number(e.target.value))} style={{ width: 220 }} />
          <span className="mono" style={{ minWidth: '4em' }}>
            {off >= 0 ? '+' : ''}
            {off}
          </span>
        </label>
        <span className="btn-group">
          <button className="btn btn-sm" onClick={() => setOff(-30)}>
            早
          </button>
          <button className="btn btn-sm" onClick={() => setOff(mode === 'async' ? -4 : -18)}>
            剛好在 window 內
          </button>
          <button className="btn btn-sm" onClick={() => setOff(20)}>
            晚
          </button>
        </span>
        <span className={`chip ${verdict === 'x' ? 'chip-danger' : verdict === 'early' ? 'chip-ok' : 'chip-info'}`}>{verdict === 'early' ? '安全：edge 2 起算' : verdict === 'late' ? '安全：edge 3 起算' : 'X：結果未知'}</span>
      </div>
      <ClockWaveform signals={signals} tEnd={5.5 * T} period={T} shades={shades} markers={markers} annotations={ann} xSignals={['q0 (RTL)']} highlight={['q0']} showEdgeTimes={['q0']} zoomable={false} />
      <p className="small" style={{ margin: '0.4em 0 0' }}>{explain}</p>
      <p className="small muted" style={{ margin: '0.3em 0 0' }}>
        {mode === 'async'
          ? `模型參數：t_recovery = ${T_REC} ps（像 setup：釋放要在 edge 前多久）、t_removal = ${T_REM} ps（像 hold：釋放不能在 edge 後多快）、tCQ = ${T_CQ} ps。`
          : `模型參數：AND delay = ${T_AND} ps、t_setup = ${T_SETUP} ps、t_hold = ${T_HOLD} ps。同步 reset 的 window 是 D pin 的 setup/hold window，往前平移了一個 AND delay。`}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
 * ResetSkewDemo：兩個 /2 並排，reset 釋放時間差 → 相位差
 * ---------------------------------------------------------------------------------------------- */
export function ResetSkewDemo() {
  const [skew, setSkew] = useState(0)
  const edgeT = 2 * T
  const edges = [1, 2, 3, 4, 5, 6].map((k) => k * T)
  const offA = -30
  const offB = offA + skew
  const vB: 'early' | 'late' | 'x' = offB <= -T_REC ? 'early' : offB >= T_REM ? 'late' : 'x'
  const clk = clockTrace('clk', T, 6)
  const rstA: SignalTrace = { name: 'rst_n_A', events: [{ t: 0, v: 0 }, { t: edgeT + offA, v: 1 }], kind: 'reset' }
  const rstB: SignalTrace = { name: 'rst_n_B', events: [{ t: 0, v: 0 }, { t: edgeT + offB, v: 1 }], kind: 'reset' }
  const qA = toggleTrace('q_A', edgeT, edges)
  const qB = vB === 'x' ? { name: 'q_B', events: [{ t: 0, v: 0 as const }, { t: edgeT + T_CQ, v: 1 as const }], kind: 'x' as const } : toggleTrace('q_B', vB === 'early' ? edgeT : edgeT + T, edges)
  const shades: WaveShade[] = [{ t0: edgeT - T_REC, t1: edgeT + T_REM, kind: 'danger', label: 'recovery | removal', signal: 'rst_n_B' }]
  return (
    <div className="panel">
      <div className="panel-title">兩個並排的 /2：reset 釋放時間差 → 輸出相位差</div>
      <div className="control-row">
        <label>
          rst_n 到 B 比到 A 晚（ps）
          <input type="range" min={0} max={80} step={1} value={skew} onChange={(e) => setSkew(Number(e.target.value))} style={{ width: 220 }} />
          <span className="mono">{skew}</span>
        </label>
        <span className={`chip ${vB === 'early' ? 'chip-ok' : vB === 'late' ? 'chip-warn' : 'chip-danger'}`}>{vB === 'early' ? 'A、B 同一個 edge 起算：相位對齊' : vB === 'late' ? 'B 晚一個 edge：/2 輸出差 180°' : 'B 落在 window：相位未知'}</span>
      </div>
      <ClockWaveform signals={[clk, rstA, rstB, qA, qB]} tEnd={6.5 * T} period={T} shades={shades} markers={[{ t: edgeT, label: 'edge 2', kind: 'edge' }]} xSignals={['q_B']} highlight={['q_A', 'q_B']} deltaBetween={vB === 'x' ? undefined : { a: 'q_A', b: 'q_B', label: 'Δφ' }} zoomable={false} />
      <p className="small muted" style={{ margin: '0.4em 0 0' }}>
        兩個 /2 的除頻比都對，但只要 reset 釋放落在不同的 clock cycle，輸出就差一個輸入週期——對 /2 來說是 180°。多相 clock 產生器、I/Q divider、MMD 的多級 cell，都要求 reset 釋放「在同一個 edge 之前」到達所有 flop。
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
 * KMap：2 或 3 變數的 Karnaugh map（cells 以 state bit-string 為 key；'x' = don't care）
 * ---------------------------------------------------------------------------------------------- */
export function KMap({ vars, cells, title, marks }: { vars: [string, string] | [string, string, string]; cells: Record<string, '0' | '1' | 'x'>; title?: ReactNode; marks?: Record<string, string> }) {
  const three = vars.length === 3
  const rows = ['0', '1']
  const cols = three ? ['00', '01', '11', '10'] : ['0', '1']
  const key = (r: string, c: string) => `${r}${c}`
  const cellStyle = (v: '0' | '1' | 'x' | undefined, marked: boolean): React.CSSProperties => ({
    textAlign: 'center',
    fontFamily: 'var(--mono)',
    fontWeight: v === '1' ? 700 : 500,
    color: v === 'x' ? 'var(--fg-faint)' : v === '1' ? 'var(--ok)' : 'var(--fg)',
    background: marked ? 'var(--warn-soft)' : v === '1' ? 'var(--ok-soft)' : undefined,
    border: marked ? '2px solid var(--warn)' : undefined,
    minWidth: '3.2em',
  })
  return (
    <div style={{ display: 'inline-block', margin: '0.3em 0.8em 0.3em 0' }}>
      {title ? <div className="small" style={{ marginBottom: '0.2em' }}>{title}</div> : null}
      <table className="state-table">
        <thead>
          <tr>
            <th className="small muted">
              {vars[0]} ＼ {three ? `${vars[1]}${vars[2]}` : vars[1]}
            </th>
            {cols.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th>{r}</th>
              {cols.map((c) => {
                const k = key(r, c)
                const v = cells[k]
                const mk = marks?.[k]
                return (
                  <td key={c} style={cellStyle(v, !!mk)} title={`state ${k}`}>
                    {v ?? '·'}
                    {mk ? <div style={{ fontSize: '0.7em', fontFamily: 'var(--font)', color: 'var(--warn)' }}>{mk}</div> : null}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
 * RecoverDesigner（Lesson 8-2 練習）：替 Gray /3 挑 next-state equation，立即看 state graph 與模擬
 * ---------------------------------------------------------------------------------------------- */
export function RecoverDesigner() {
  const [d1, setD1] = useState('xor')
  const [d0, setD0] = useState('nq1')
  const c1 = grayDiv3Candidates.d1.find((c) => c.key === d1)!
  const c0 = grayDiv3Candidates.d0.find((c) => c.key === d0)!
  const netlist = useMemo(() => buildGrayDiv3(d1, d0), [d1, d0])
  const graph = useMemo(() => buildStateGraph(netlist, {}), [netlist])
  const diag = useMemo(() => graphToDiagram(graph, 'clk↑'), [graph])
  const sch = useMemo(() => grayDiv3BoxSchematic(c1.text, c0.text), [c1, c0])
  const target = ['00', '01', '11']
  const keepsCycle = graph.mainCycle.join() === target.join()
  const noLockup = graph.lockup.length === 0
  const maxSteps = Math.max(...graph.nodes.map((n) => n.stepsToCycle))
  const cost = c1.gates + c0.gates
  const critical = Math.max(c1.delay, c0.delay)
  const ok = keepsCycle && noLockup
  const n10 = graph.nodes.find((n) => n.state === '10')!
  const simOpts = useMemo(() => ({ period: 100, initialState: stateFromString(netlist, '10') }), [netlist])
  return (
    <div className="panel">
      <div className="panel-title">Self-recovery 設計台：Gray-code /3（00 → 01 → 11）</div>
      <div className="control-row">
        <label>
          d1 =
          <select value={d1} onChange={(e) => setD1(e.target.value)}>
            {grayDiv3Candidates.d1.map((c) => (
              <option key={c.key} value={c.key}>
                {c.text}
              </option>
            ))}
          </select>
        </label>
        <label>
          d0 =
          <select value={d0} onChange={(e) => setD0(e.target.value)}>
            {grayDiv3Candidates.d0.map((c) => (
              <option key={c.key} value={c.key}>
                {c.text}
              </option>
            ))}
          </select>
        </label>
        <span className="small muted">
          等效 2-input gate 數 = <b>{fmtNum(cost)}</b>　最慢 gate = <b>{critical} ps</b>
        </span>
      </div>
      <div className="two-col">
        <div>
          <StateDiagram {...diag} width={300} height={220} title="state graph（依目前的 equation）" />
        </div>
        <div className="small">
          <div style={{ marginBottom: '0.4em' }}>
            <M block>{`d_1 = ${c1.latex},\\qquad d_0 = ${c0.latex}`}</M>
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.2em', lineHeight: 1.9 }}>
            <li>
              主循環 {graph.mainCycle.join(' → ')}：{keepsCycle ? <span className="chip chip-ok">保留 00 → 01 → 11</span> : <span className="chip chip-danger">主循環被改壞了（除頻比 / 順序不對）</span>}
            </li>
            <li>
              state 10 → {n10.next}：{n10.lockup ? <span className="chip chip-danger">lock-up</span> : n10.onCycle ? <span className="chip chip-warn">10 變成主循環的一部分</span> : <span className="chip chip-ok">{n10.stepsToCycle} 個 edge 回到主循環</span>}
            </li>
            <li>
              所有 unused state 最多 {maxSteps < 0 ? '∞' : maxSteps} 個 edge 回到主循環；lock-up：{graph.lockup.length ? graph.lockup.join(', ') : '無'}
            </li>
            <li>
              結論：{ok ? <span className="chip chip-ok">修好了（self-recovering /3）</span> : <span className="chip chip-danger">還不行</span>}
            </li>
          </ul>
        </div>
      </div>
      <details>
        <summary className="small muted">所有 state 的 next-state</summary>
        <StateGraphTable netlist={netlist} compact />
      </details>
      <DividerSimPanel key={netlist.id} netlist={netlist} schematic={sch} options={simOpts} title="從 10 啟動驗證（也可以自己載入任意 state）" allowInitialState compact showEquations={false} showMeasure windowCycles={8} />
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------
 * RobustnessCostTable（Lesson 8-2）：把「修正前 / 修正後」的代價全部算出來放在同一張表
 *   gate 數、電晶體估計、Fmax critical path 與 Tclk,min、最差 hold slack、
 *   gate 輸出翻轉次數 / 主循環（動態功耗的代理量）、lock-up 與最壞回復步數。
 * 所有數字都由 netlist / timing scenario 計算，不是手寫的；課文引用的數字在 models.test.ts 內固定。
 * ---------------------------------------------------------------------------------------------- */
/** static CMOS 的電晶體數估計（2-input）；XOR/XNOR 以 transmission-gate 實作約 10–12 顆，這裡取 12 */
const TRANSISTORS: Record<string, number> = { inv: 2, buf: 4, nand: 4, nor: 4, and: 6, or: 6, xor: 12, xnor: 12, mux: 12, custom: 8 }

export interface CostRow {
  label: string
  netlist: Netlist
  timing: TimingScenario
}

export interface CostResult {
  gates: number
  transistors: number
  tclkMin: number
  worstPath: string
  holdSlack: number
  holdPath: string
  lockup: string[]
  maxSteps: number
  cycleLen: number
  togglesPerCycle: number
}

/** 計算一個設計的代價；`gates` 不含 delay = 0 的 wire（kind buf、delay 0） */
export function costOf(netlist: Netlist, timing: TimingScenario, env: TimingEnv = timing.env): CostResult {
  const gates = netlist.gates.filter((g) => !(g.kind === 'buf' && (g.delay ?? 0) === 0))
  const transistors = gates.reduce((a, g) => a + (TRANSISTORS[g.kind ?? 'custom'] ?? 8), 0)
  const ws = worstSetup(timing.paths, env)
  const wh = worstHold(timing.paths, env)
  const graph = buildStateGraph(netlist, {})
  const N = graph.mainCycle.length
  const maxSteps = Math.max(0, ...graph.nodes.filter((n) => !n.lockup).map((n) => n.stepsToCycle))
  const gateOuts = new Set(gates.map((g) => g.out))
  // 動態功耗代理：穩態下一個主循環內 gate 輸出翻轉的次數（real delay 模式，含 glitch）
  const { records } = simulate(netlist, 3 * N, { period: 100, delayMode: 'real' })
  const togglesPerCycle = records.slice(2 * N).reduce((a, r) => a + r.events.filter((e) => gateOuts.has(e.signal)).length, 0)
  return {
    gates: gates.length,
    transistors,
    tclkMin: ws?.result.tclkMin ?? 0,
    worstPath: ws?.path.name ?? '—',
    holdSlack: wh?.result.slack ?? 0,
    holdPath: wh?.path.name ?? '—',
    lockup: graph.lockup,
    maxSteps,
    cycleLen: N,
    togglesPerCycle,
  }
}

export function RobustnessCostTable({ rows, env, title }: { rows: CostRow[]; env?: TimingEnv; title?: ReactNode }) {
  const data = useMemo(() => rows.map((r) => ({ ...r, c: costOf(r.netlist, r.timing, env) })), [rows, env])
  const best = (pick: (c: CostResult) => number, lowerIsBetter = true) => {
    const vals = data.map((d) => pick(d.c))
    const target = lowerIsBetter ? Math.min(...vals) : Math.max(...vals)
    return vals.map((v) => v === target)
  }
  const mark = (v: ReactNode, good: boolean, bad = false) => <span className={`chip ${bad ? 'chip-danger' : good ? 'chip-ok' : ''}`}>{v}</span>
  const bGates = best((c) => c.gates)
  const bTr = best((c) => c.transistors)
  const bT = best((c) => c.tclkMin)
  const bH = best((c) => c.holdSlack, false)
  const bTog = best((c) => c.togglesPerCycle)
  const period = env?.period ?? rows[0]?.timing.env.period ?? 100
  return (
    <div className="panel">
      {title ? <div className="panel-title">{title}</div> : null}
      <CompareTable
        head={['指標', ...data.map((d) => d.label)]}
        rows={[
          ['next-state gate 數（不含 wire）', ...data.map((d, i) => mark(d.c.gates, bGates[i]))],
          ['電晶體估計（static CMOS，只算 next-state logic）', ...data.map((d, i) => mark(`≈ ${d.c.transistors}`, bTr[i]))],
          ['Fmax critical path', ...data.map((d) => <span key={d.label} className="mono small">{d.c.worstPath}</span>)],
          [`Tclk,min（ps；jitter + margin = ${fmtNum((env ?? rows[0].timing.env).jitter + (env ?? rows[0].timing.env).margin)} ps）`, ...data.map((d, i) => mark(fmtNum(d.c.tclkMin), bT[i]))],
          ['Fmax（GHz）', ...data.map((d) => fmtNum(1000 / d.c.tclkMin, 1))],
          ['最差 hold slack（ps）', ...data.map((d, i) => mark(fmtNum(d.c.holdSlack), bH[i], d.c.holdSlack < 0))],
          [`gate 輸出翻轉 / 主循環（real delay，${period} ps 週期；動態功耗代理）`, ...data.map((d, i) => mark(d.c.togglesPerCycle, bTog[i]))],
          ['lock-up state', ...data.map((d) => (d.c.lockup.length ? mark(d.c.lockup.join(', '), false, true) : mark('無', true)))],
          ['最壞回復步數（unused → 主循環）', ...data.map((d) => (d.c.lockup.length ? mark('∞', false, true) : mark(`${d.c.maxSteps} 個 edge`, d.c.maxSteps <= 2)))],
          ['主循環長度（divide ratio）', ...data.map((d) => String(d.c.cycleLen))],
        ]}
      />
      <p className="small muted" style={{ margin: '0.4em 0 0' }}>
        綠色 = 該列最好的一欄；紅色 = 有 lock-up。電晶體數只算 next-state logic（flop 三個設計都一樣），XOR/XNOR 以 12 顆估計。翻轉次數由 real-delay 模擬統計，包含 glitch。
      </p>
    </div>
  )
}
