import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { SignalTrace } from '@/models/divider/types'
import { valueAt } from '@/models/divider/analysis'
import { fmtT, fmtNum } from '@/utils/format'

export interface WaveMarker {
  t: number
  label?: string
  kind?: 'edge' | 'cursor' | 'window' | 'input'
  /** 只畫在某個訊號列 */
  signal?: string
}

export interface WaveShade {
  t0: number
  t1: number
  label?: string
  kind: 'safe' | 'danger' | 'info'
  signal?: string
}

export interface WaveAnnotation {
  t: number
  signal: string
  text: string
  dy?: number
}

export interface ClockWaveformProps {
  signals: SignalTrace[]
  tStart?: number
  tEnd: number
  /** 若給 period，時間軸以 T 為單位標示 */
  period?: number
  unit?: string
  rowHeight?: number
  markers?: WaveMarker[]
  shades?: WaveShade[]
  annotations?: WaveAnnotation[]
  /** 顯示 output / highlight 訊號的 edge 時間 */
  showEdgeTimes?: boolean | string[]
  /** 顯示 high pulse 寬度 */
  showPulseWidths?: boolean | string[]
  highlight?: string[]
  dim?: string[]
  zoomable?: boolean
  /** 量測工具：點兩下顯示 Δt */
  measure?: boolean
  /** 兩個訊號之間的 rising edge 相位差 */
  deltaBetween?: { a: string; b: string; label?: string }
  title?: ReactNode
  /** 每個 T 的最小像素寬度 */
  pxPerPeriod?: number
  /** 顯示每個訊號目前值（cursor 位置） */
  showValuesAtCursor?: boolean
  /** X 狀態訊號（畫成虛線） */
  xSignals?: string[]
  /** 額外的時間軸刻度（例如 clock edge 編號） */
  edgeLabels?: { t: number; label: string }[]
  compact?: boolean
}

const NAME_W = 74
const PAD_R = 16
const AXIS_H = 22

export function ClockWaveform(props: ClockWaveformProps) {
  const {
    signals,
    tStart = 0,
    tEnd,
    period,
    unit = '',
    rowHeight = 34,
    markers = [],
    shades = [],
    annotations = [],
    showEdgeTimes = false,
    showPulseWidths = false,
    highlight = [],
    dim = [],
    zoomable = true,
    measure = true,
    deltaBetween,
    title,
    pxPerPeriod,
    showValuesAtCursor = true,
    xSignals = [],
    edgeLabels,
    compact = false,
  } = props
  const [zoom, setZoom] = useState(1)
  const [cursorT, setCursorT] = useState<number | null>(null)
  const [measurePts, setMeasurePts] = useState<number[]>([])
  const svgRef = useRef<SVGSVGElement>(null)

  const span = tEnd - tStart
  const basePx = pxPerPeriod ?? (period ? 70 : 700 / Math.max(1, span))
  const plotW = Math.max(300, (period ? (span / period) * basePx : span * basePx) * zoom)
  const width = NAME_W + plotW + PAD_R
  const rows = signals.length
  const topPad = compact ? 6 : 14
  const height = topPad + rows * rowHeight + AXIS_H + (deltaBetween ? 18 : 0)
  const x = (t: number) => NAME_W + ((t - tStart) / span) * plotW
  const tOf = (px: number) => tStart + ((px - NAME_W) / plotW) * span

  const fmt = (t: number) => (period ? fmtT(t, period) : `${fmtNum(t)}${unit}`)

  // grid ticks
  const ticks = useMemo(() => {
    const out: number[] = []
    if (period) {
      const first = Math.ceil(tStart / period)
      for (let k = first; k * period <= tEnd + 1e-9; k++) out.push(k * period)
    } else {
      const step = niceStep(span / 8)
      const first = Math.ceil(tStart / step)
      for (let k = first; k * step <= tEnd + 1e-9; k++) out.push(k * step)
    }
    return out
  }, [tStart, tEnd, span, period])

  const handleMove = (ev: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scale = width / rect.width
    const px = (ev.clientX - rect.left) * scale
    if (px < NAME_W || px > NAME_W + plotW) {
      setCursorT(null)
      return
    }
    setCursorT(tOf(px))
  }
  const handleClick = () => {
    if (!measure || cursorT === null) return
    setMeasurePts((p) => (p.length >= 2 ? [cursorT] : [...p, cursorT]))
  }

  const edgeTimeSignals = new Set(showEdgeTimes === true ? signals.filter((s) => s.kind === 'output' || highlight.includes(s.name)).map((s) => s.name) : Array.isArray(showEdgeTimes) ? showEdgeTimes : [])
  const pwSignals = new Set(showPulseWidths === true ? signals.filter((s) => s.kind === 'output').map((s) => s.name) : Array.isArray(showPulseWidths) ? showPulseWidths : [])

  return (
    <div className="wave">
      <div className="wave-toolbar">
        {title ? <span style={{ color: 'var(--fg)', fontWeight: 600 }}>{title}</span> : null}
        <span className="spacer" />
        {cursorT !== null && showValuesAtCursor ? (
          <span className="mono">
            t = {fmt(cursorT)}
            {signals.slice(0, 8).map((s) => (
              <span key={s.name} style={{ marginLeft: '0.7em' }}>
                {s.name}=<b className={`value-${valueAt(s, cursorT)}`}>{valueAt(s, cursorT)}</b>
              </span>
            ))}
          </span>
        ) : null}
        {measurePts.length === 2 ? (
          <span className="mono" style={{ color: 'var(--sig-cursor)' }}>
            Δt = {fmt(Math.abs(measurePts[1] - measurePts[0]))}
          </span>
        ) : measure ? (
          <span className="faint">{measurePts.length === 1 ? '再點一下量測 Δt' : '點兩下量測 Δt'}</span>
        ) : null}
        {zoomable ? (
          <span className="btn-group">
            <button className="btn btn-sm" onClick={() => setZoom((z) => Math.max(0.5, z / 1.5))} aria-label="zoom out">−</button>
            <button className="btn btn-sm" onClick={() => setZoom(1)} aria-label="reset zoom">1×</button>
            <button className="btn btn-sm" onClick={() => setZoom((z) => Math.min(8, z * 1.5))} aria-label="zoom in">＋</button>
          </span>
        ) : null}
      </div>
      <div className="wave-svg-wrap">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          onMouseMove={handleMove}
          onMouseLeave={() => setCursorT(null)}
          onClick={handleClick}
          role="img"
          aria-label="waveform"
        >
          {/* shades */}
          {shades.map((sh, i) => {
            const rowIdx = sh.signal ? signals.findIndex((s) => s.name === sh.signal) : -1
            const y0 = rowIdx >= 0 ? topPad + rowIdx * rowHeight : topPad
            const hh = rowIdx >= 0 ? rowHeight : rows * rowHeight
            return (
              <g key={i}>
                <rect x={x(sh.t0)} y={y0} width={Math.max(0, x(sh.t1) - x(sh.t0))} height={hh} className={`shade-${sh.kind}`} />
                {sh.label ? (
                  <text x={(x(sh.t0) + x(sh.t1)) / 2} y={y0 + 10} textAnchor="middle" className="shade-text">
                    {sh.label}
                  </text>
                ) : null}
              </g>
            )
          })}
          {/* grid */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={topPad} y2={topPad + rows * rowHeight} className="grid" />
              <text x={x(t)} y={topPad + rows * rowHeight + 14} textAnchor="middle" className="axis-text">
                {fmt(t)}
              </text>
            </g>
          ))}
          {edgeLabels?.map((el, i) => (
            <text key={i} x={x(el.t)} y={topPad - 3} textAnchor="middle" className="axis-text">
              {el.label}
            </text>
          ))}
          {/* signals */}
          {signals.map((s, i) => {
            const y0 = topPad + i * rowHeight + 4
            const y1 = topPad + (i + 1) * rowHeight - 6
            const yOf = (v: 0 | 1) => (v ? y0 : y1)
            const evs = s.events
            let d = ''
            let cur: 0 | 1 = evs[0]?.v ?? 0
            let curT = tStart
            // initial value at tStart
            cur = valueAt(s, tStart)
            d += `M ${x(tStart)} ${yOf(cur)}`
            for (const e of evs) {
              if (e.t < tStart) continue
              if (e.t > tEnd) break
              if (e.v === cur) continue
              d += ` L ${x(e.t)} ${yOf(cur)} L ${x(e.t)} ${yOf(e.v)}`
              cur = e.v
              curT = e.t
            }
            void curT
            d += ` L ${x(tEnd)} ${yOf(cur)}`
            const isX = xSignals.includes(s.name)
            const cls = ['trace', `trace-${isX ? 'x' : (s.kind ?? 'data')}`, highlight.includes(s.name) ? 'trace-highlight' : '', dim.includes(s.name) ? 'trace-dim' : ''].filter(Boolean).join(' ')
            // edge times
            const edgeTexts: ReactNode[] = []
            if (edgeTimeSignals.has(s.name)) {
              let prev: 0 | 1 | undefined
              for (const e of evs) {
                if (prev !== undefined && e.t >= tStart && e.t <= tEnd) {
                  edgeTexts.push(
                    <text key={e.t} x={x(e.t) + 2} y={e.v === 1 ? y0 - 1 : y1 + 10} className="edge-time" style={{ display: e.v === 1 ? undefined : 'none' }}>
                      {fmt(e.t)}
                    </text>,
                  )
                }
                prev = e.v
              }
            }
            const pwTexts: ReactNode[] = []
            if (pwSignals.has(s.name)) {
              for (let k = 1; k < evs.length; k++) {
                const a = evs[k - 1]
                const b = evs[k]
                if (a.v === 1 && b.t >= tStart && a.t <= tEnd) {
                  pwTexts.push(
                    <text key={a.t} x={(x(a.t) + x(b.t)) / 2} y={(y0 + y1) / 2 + 4} textAnchor="middle" className="pw-text">
                      {fmt(b.t - a.t)}
                    </text>,
                  )
                }
              }
            }
            return (
              <g key={s.name}>
                <text x={NAME_W - 8} y={(y0 + y1) / 2 + 4} textAnchor="end" className="sig-name">
                  {s.name}
                </text>
                <line x1={NAME_W} x2={NAME_W + plotW} y1={y1 + 5} y2={y1 + 5} className="grid" />
                <path d={d} className={cls} />
                {edgeTexts}
                {pwTexts}
              </g>
            )
          })}
          {/* annotations */}
          {annotations.map((a, i) => {
            const idx = signals.findIndex((s) => s.name === a.signal)
            if (idx < 0) return null
            const yy = topPad + idx * rowHeight + (a.dy ?? -2)
            return (
              <g key={i}>
                <line x1={x(a.t)} x2={x(a.t)} y1={yy} y2={topPad + (idx + 1) * rowHeight - 6} className="ann-line" />
                <text x={x(a.t) + 3} y={yy + 8} className="ann-text">
                  {a.text}
                </text>
              </g>
            )
          })}
          {/* markers */}
          {markers.map((m, i) => {
            const idx = m.signal ? signals.findIndex((s) => s.name === m.signal) : -1
            const yA = idx >= 0 ? topPad + idx * rowHeight : topPad
            const yB = idx >= 0 ? topPad + (idx + 1) * rowHeight : topPad + rows * rowHeight
            const color = m.kind === 'input' ? 'var(--sig-control)' : m.kind === 'window' ? 'var(--accent)' : 'var(--sig-cursor)'
            return (
              <g key={i}>
                <line x1={x(m.t)} x2={x(m.t)} y1={yA} y2={yB} stroke={color} strokeWidth={1.2} strokeDasharray={m.kind === 'edge' ? '2 2' : '4 2'} />
                {m.label ? (
                  <text x={x(m.t) + 3} y={yA + 9} className="marker-text" style={{ fill: color }}>
                    {m.label}
                  </text>
                ) : null}
              </g>
            )
          })}
          {/* delta between */}
          {deltaBetween
            ? (() => {
                const sa = signals.find((s) => s.name === deltaBetween.a)
                const sb = signals.find((s) => s.name === deltaBetween.b)
                if (!sa || !sb) return null
                const ra = firstRising(sa, tStart)
                const rb = ra === null ? null : firstRising(sb, ra)
                if (ra === null || rb === null) return null
                const yy = topPad + rows * rowHeight + AXIS_H + 6
                return (
                  <g>
                    <line x1={x(ra)} x2={x(rb)} y1={yy} y2={yy} className="ann-line" markerEnd="url(#warrow)" />
                    <line x1={x(ra)} x2={x(ra)} y1={topPad} y2={yy} className="ann-line" strokeDasharray="2 2" />
                    <line x1={x(rb)} x2={x(rb)} y1={topPad} y2={yy} className="ann-line" strokeDasharray="2 2" />
                    <text x={(x(ra) + x(rb)) / 2} y={yy - 3} textAnchor="middle" className="ann-text">
                      {deltaBetween.label ?? 'Δφ'} = {fmt(rb - ra)}
                    </text>
                  </g>
                )
              })()
            : null}
          {/* cursor */}
          {cursorT !== null ? (
            <g>
              <line x1={x(cursorT)} x2={x(cursorT)} y1={topPad} y2={topPad + rows * rowHeight} className="cursor-line" />
              <text x={x(cursorT) + 3} y={topPad + rows * rowHeight - 2} className="cursor-text">
                {fmt(cursorT)}
              </text>
            </g>
          ) : null}
          {measurePts.map((t, i) => (
            <line key={i} x1={x(t)} x2={x(t)} y1={topPad} y2={topPad + rows * rowHeight} stroke="var(--sig-cursor)" strokeWidth={1.5} />
          ))}
          {measurePts.length === 2 ? (
            <text x={(x(measurePts[0]) + x(measurePts[1])) / 2} y={topPad + 10} textAnchor="middle" className="cursor-text">
              Δt = {fmt(Math.abs(measurePts[1] - measurePts[0]))}
            </text>
          ) : null}
        </svg>
      </div>
    </div>
  )
}

function firstRising(s: SignalTrace, after: number): number | null {
  let prev: 0 | 1 | undefined
  for (const e of s.events) {
    if (prev === 0 && e.v === 1 && e.t >= after) return e.t
    prev = e.v
  }
  return null
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const r = raw / p
  if (r < 1.5) return p
  if (r < 3.5) return 2 * p
  if (r < 7.5) return 5 * p
  return 10 * p
}

/** 便利函式：把 {t, v} 序列轉為 trace */
export function traceFrom(name: string, events: { t: number; v: 0 | 1 }[], kind?: SignalTrace['kind']): SignalTrace {
  return { name, events, kind }
}

/** 產生理想 clock trace */
export function clockTrace(name: string, period: number, cycles: number, opts: { phase?: number; duty?: number; kind?: SignalTrace['kind']; startLow?: number } = {}): SignalTrace {
  const duty = opts.duty ?? 0.5
  const off = (opts.phase ?? 0) * period
  const ev: { t: number; v: 0 | 1 }[] = [{ t: 0, v: 0 }]
  const start = opts.startLow ?? period
  for (let n = 0; n < cycles; n++) {
    const tr = start + off + n * period
    ev.push({ t: tr, v: 1 }, { t: tr + duty * period, v: 0 })
  }
  return { name, events: ev, kind: opts.kind ?? 'clock' }
}
