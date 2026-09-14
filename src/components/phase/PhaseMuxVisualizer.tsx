import { useMemo, useState } from 'react'
import { ClockWaveform, traceFrom } from '@/components/waveform/ClockWaveform'
import { phaseClockEvents, rotate, type PhaseState, type PhaseStep } from '@/models/phase/pmux'
import type { SignalTrace } from '@/models/divider/types'
import { fmtNum } from '@/utils/format'
import './PhaseMuxVisualizer.css'

export type PhaseCount = 4 | 8 | 16

export interface PhaseMuxVisualizerProps {
  /** 初始 phase 數 */
  phases?: PhaseCount
  /** 是否顯示 4 / 8 / 16 切換 */
  allowPhaseCount?: boolean
  /** 波形顯示幾個 Tvco */
  cycles?: number
  showWaveform?: boolean
  title?: string
  compact?: boolean
}

interface HistoryRow extends PhaseStep {
  n: number
  /** 這一步之後的累積 carry */
  carryAfter: number
  /** 這一步之後被選中的 edge 絕對時間（Tvco 單位）= carryAfter + to/M */
  tAbs: number
}

/** 以分數顯示 index / M（例如 3/8 T = 0.375 T） */
function fracT(index: number, M: number): string {
  if (index === 0) return '0 T'
  return `${index}/${M} T = ${fmtNum(index / M, 4)} T`
}

/**
 * 8-phase（4 / 16）wheel：顯示目前 phase index、forward / backward rotation、
 * wrap-around 時的 integer carry，以及 M 條 phase clock + 被選中的 pmux_out 波形。
 * 所有波形由 phaseClockEvents 產生（event 資料），不寫死座標。
 */
export function PhaseMuxVisualizer({ phases = 8, allowPhaseCount = true, cycles = 3, showWaveform = true, title, compact = false }: PhaseMuxVisualizerProps) {
  const [M, setM] = useState<PhaseCount>(phases)
  const [state, setState] = useState<PhaseState>({ index: 0, carry: 0 })
  const [stepSize, setStepSize] = useState(1)
  const [history, setHistory] = useState<HistoryRow[]>([])

  const doStep = (steps: number) => {
    const r = rotate(state, M, steps)
    setHistory((h) => [...h, { ...r.step, n: h.length + 1, carryAfter: r.state.carry, tAbs: r.state.carry + r.state.index / M }])
    setState(r.state)
  }
  const reset = (m: PhaseCount = M) => {
    setM(m)
    setState({ index: 0, carry: 0 })
    setHistory([])
  }
  const last = history[history.length - 1]
  const prevIndex = last ? last.from : null
  const tAbs = state.carry + state.index / M

  // ---------------------------------------------------------------- wheel geometry
  const size = compact ? 220 : 280
  const cx = size / 2
  const cy = size / 2
  const R = size / 2 - 34
  const angleOf = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / M
  const pos = (i: number, r = R) => ({ x: cx + r * Math.cos(angleOf(i)), y: cy + r * Math.sin(angleOf(i)) })
  const arcPath = useMemo(() => {
    if (!last) return null
    const a0 = angleOf(last.from)
    const steps = Math.round(last.deltaT * M)
    const a1 = a0 + (2 * Math.PI * steps) / M
    const r = R - 18
    const p0 = { x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0) }
    const p1 = { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) }
    const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0
    const sweep = steps >= 0 ? 1 : 0
    return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} ${sweep} ${p1.x} ${p1.y}`
  }, [last, M, R, cx, cy])

  // ---------------------------------------------------------------- waveform
  const traces: SignalTrace[] = useMemo(() => {
    const t: SignalTrace[] = []
    for (let i = 0; i < M; i++) t.push(traceFrom(`ph${i}`, phaseClockEvents(M, cycles, i), 'phase'))
    t.push(traceFrom('pmux_out', phaseClockEvents(M, cycles, state.index), 'output'))
    return t
  }, [M, cycles, state.index])
  const markerT = 1 + state.index / M
  const prevMarkerT = prevIndex !== null ? 1 + prevIndex / M : null

  return (
    <div className="panel phase-mux-vis">
      <div className="panel-title">
        {title ?? `${M}-phase wheel`}
        <span className="chip chip-accent">spacing = Tvco / {M} = {fmtNum(1 / M, 4)} T</span>
      </div>
      <div className="control-row">
        {allowPhaseCount ? (
          <label>
            phase 數 M
            <select value={M} onChange={(e) => reset(Number(e.target.value) as PhaseCount)}>
              <option value={4}>4</option>
              <option value={8}>8</option>
              <option value={16}>16</option>
            </select>
          </label>
        ) : null}
        <label>
          每次走幾個 phase
          <select value={stepSize} onChange={(e) => setStepSize(Number(e.target.value))}>
            {[1, 2, 3, 4].map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <span className="btn-group">
          <button className="btn" onClick={() => doStep(-stepSize)} aria-label="backward">
            ◀ backward −{stepSize}
          </button>
          <button className="btn btn-primary" onClick={() => doStep(stepSize)} aria-label="forward">
            forward +{stepSize} ▶
          </button>
          <button className="btn" onClick={() => reset()}>
            ⟲ Reset
          </button>
        </span>
      </div>
      <div className="phase-mux-grid">
        <div className="phase-wheel">
          <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${M}-phase wheel`}>
            <defs>
              <marker id="pmv-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
              </marker>
            </defs>
            <circle cx={cx} cy={cy} r={R} className="pmv-ring" />
            {/* 時間方向：順時針 = 時間往後 */}
            <text x={cx} y={cy - 6} textAnchor="middle" className="pmv-center">
              index {state.index}
            </text>
            <text x={cx} y={cy + 12} textAnchor="middle" className="pmv-center-sub">
              {fracT(state.index, M)}
            </text>
            <text x={cx} y={cy + 28} textAnchor="middle" className="pmv-center-sub">
              carry {state.carry >= 0 ? '+' : ''}
              {state.carry}
            </text>
            {arcPath ? <path d={arcPath} className="pmv-arc" markerEnd="url(#pmv-arrow)" /> : null}
            {Array.from({ length: M }, (_, i) => {
              const p = pos(i)
              const lab = pos(i, R + 18)
              const isCur = i === state.index
              const isPrev = prevIndex === i && !isCur
              return (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={isCur ? 9 : 6} className={`pmv-dot ${isCur ? 'cur' : ''} ${isPrev ? 'prev' : ''}`} />
                  <text x={lab.x} y={lab.y + 4} textAnchor="middle" className="pmv-label">
                    {i}
                  </text>
                </g>
              )
            })}
            {/* boundary 標記：index M−1 → 0 之間 */}
            {(() => {
              const b = pos(-0.5, R + 4)
              const b2 = pos(-0.5, R - 10)
              return <line x1={b.x} y1={b.y} x2={b2.x} y2={b2.y} className="pmv-boundary" />
            })()}
            <text x={cx} y={size - 6} textAnchor="middle" className="pmv-foot">
              順時針 = 時間往後（forward）；跨過 {M - 1} → 0 的分界線 = integer carry
            </text>
          </svg>
        </div>
        <div className="phase-mux-info">
          <dl className="kv">
            <dt>phase index</dt>
            <dd>
              {state.index}（共 {M} 個）
            </dd>
            <dt>cycle 內的時間</dt>
            <dd>{fracT(state.index, M)}</dd>
            <dt>累積 carry</dt>
            <dd>
              {state.carry >= 0 ? '+' : ''}
              {state.carry} 個 Tvco
            </dd>
            <dt>被選中 edge 的絕對時間</dt>
            <dd>
              carry + index/M = {state.carry} + {state.index}/{M} = <b>{fmtNum(tAbs, 4)} T</b>
            </dd>
          </dl>
          {last ? (
            <div className={`callout ${last.wrapped ? 'callout-warning' : 'callout-note'}`} style={{ margin: '0.6em 0 0' }}>
              <div className="callout-title">
                上一步：{last.from} → {last.to}（{last.direction === 'forward' ? 'forward' : 'backward'} {last.direction === 'forward' ? '+' : ''}
                {Math.round(last.deltaT * M)}）
              </div>
              edge 時間位移 ΔT = {last.direction === 'forward' ? '+' : ''}
              {Math.round(last.deltaT * M)}/{M} T = {fmtNum(last.deltaT, 4)} T。
              {last.wrapped ? (
                <>
                  {' '}
                  <b>跨過 boundary</b>：index 從 {last.from} {last.direction === 'forward' ? '往後' : '往前'}走到 {last.to}，這個 edge 其實落在{last.carry > 0 ? '下一個' : '上一個'} Tvco 週期 ⇒ integer carry {last.carry > 0 ? '+' : ''}
                  {last.carry}（divider 等效{last.carry > 0 ? '多' : '少'}走 {Math.abs(last.carry)} 個 cycle）。
                </>
              ) : (
                ' 沒有跨過 boundary，carry 不變。'
              )}
            </div>
          ) : (
            <div className="small muted" style={{ marginTop: '0.6em' }}>
              按 forward / backward 開始旋轉。注意 index 是「圈上的位置」，時間是「index / M 個 Tvco」。
            </div>
          )}
        </div>
      </div>
      {history.length ? (
        <details open={!compact}>
          <summary className="small muted">旋轉紀錄（最近 {Math.min(history.length, 10)} 步）</summary>
          <div className="scroll-x">
            <table className="state-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>from → to</th>
                  <th>方向</th>
                  <th>ΔT</th>
                  <th>wrap?</th>
                  <th>這一步 carry</th>
                  <th>累積 carry</th>
                  <th>edge 絕對時間（T）</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(-10).map((h) => (
                  <tr key={h.n} className={h.n === history.length ? 'current' : ''}>
                    <td>{h.n}</td>
                    <td>
                      {h.from} → {h.to}
                    </td>
                    <td>{h.direction}</td>
                    <td>
                      {h.deltaT >= 0 ? '+' : ''}
                      {fmtNum(h.deltaT, 4)}
                    </td>
                    <td>{h.wrapped ? '是' : '—'}</td>
                    <td>
                      {h.carry >= 0 ? '+' : ''}
                      {h.carry}
                    </td>
                    <td>
                      {h.carryAfter >= 0 ? '+' : ''}
                      {h.carryAfter}
                    </td>
                    <td>{fmtNum(h.tAbs, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
      {showWaveform ? (
        <ClockWaveform
          signals={traces}
          tEnd={cycles}
          period={1}
          rowHeight={M > 8 ? 22 : 30}
          pxPerPeriod={220}
          highlight={['pmux_out']}
          showEdgeTimes={['pmux_out']}
          markers={[
            ...(prevMarkerT !== null ? [{ t: prevMarkerT, label: `舊 ${prevIndex}`, kind: 'input' as const }] : []),
            { t: markerT, label: `phase ${state.index} edge @ ${fmtNum(markerT, 4)} T`, kind: 'cursor' as const },
          ]}
          zoomable={false}
          title={`${M} 條 phase clock 與被選中的 pmux_out（時間單位 Tvco）`}
        />
      ) : null}
    </div>
  )
}
