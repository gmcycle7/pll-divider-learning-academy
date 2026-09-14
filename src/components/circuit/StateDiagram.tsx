import { useMemo } from 'react'
import type { StateGraph } from '@/models/divider/analysis'

export interface StateTransition {
  from: string
  to: string
  label?: string
  active?: boolean
}

export interface StateDiagramProps {
  states: string[]
  transitions: StateTransition[]
  current?: string
  unreachable?: string[]
  lockup?: string[]
  outputs?: Record<string, string>
  onSelect?: (s: string) => void
  width?: number
  height?: number
  title?: string
  /** 用 graph 直接建立 */
  graph?: StateGraph
}

export function StateDiagram(props: StateDiagramProps) {
  const width = props.width ?? 360
  const height = props.height ?? 260
  const states = props.states
  const cx = width / 2
  const cy = height / 2
  const R = Math.min(width, height) / 2 - 44
  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>()
    states.forEach((s, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / states.length
      m.set(s, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) })
    })
    return m
  }, [states, cx, cy, R])
  const unreachable = new Set(props.unreachable ?? [])
  const lockup = new Set(props.lockup ?? [])
  const r = 22
  return (
    <div className="state-diagram">
      {props.title ? <div className="small muted" style={{ padding: '0 0.3em' }}>{props.title}</div> : null}
      <svg viewBox={`0 0 ${width} ${height}`} width={width} role="img" aria-label="state diagram">
        <defs>
          <marker id="sd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--fg-muted)" />
          </marker>
          <marker id="sd-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
          </marker>
        </defs>
        {props.transitions.map((t, i) => {
          const a = pos.get(t.from)
          const b = pos.get(t.to)
          if (!a || !b) return null
          const active = t.active || (props.current !== undefined && t.from === props.current)
          if (t.from === t.to) {
            // self loop
            const ang = Math.atan2(a.y - cy, a.x - cx)
            const lx = a.x + Math.cos(ang) * (r + 16)
            const ly = a.y + Math.sin(ang) * (r + 16)
            const p1x = a.x + Math.cos(ang - 0.6) * r
            const p1y = a.y + Math.sin(ang - 0.6) * r
            const p2x = a.x + Math.cos(ang + 0.6) * r
            const p2y = a.y + Math.sin(ang + 0.6) * r
            const c1x = a.x + Math.cos(ang - 0.9) * (r + 34)
            const c1y = a.y + Math.sin(ang - 0.9) * (r + 34)
            const c2x = a.x + Math.cos(ang + 0.9) * (r + 34)
            const c2y = a.y + Math.sin(ang + 0.9) * (r + 34)
            return (
              <g key={i}>
                <path d={`M ${p1x} ${p1y} C ${c1x} ${c1y} ${c2x} ${c2y} ${p2x} ${p2y}`} className={`tr ${active ? 'tr-active' : ''}`} markerEnd={`url(#${active ? 'sd-arrow-active' : 'sd-arrow'})`} />
                {t.label ? (
                  <text x={lx + Math.cos(ang) * 14} y={ly + Math.sin(ang) * 14 + 3} textAnchor="middle" className={`tr-text ${active ? 'tr-text-active' : ''}`}>
                    {t.label}
                  </text>
                ) : null}
              </g>
            )
          }
          // curved arrow; offset to allow bidirectional pairs
          const dx = b.x - a.x
          const dy = b.y - a.y
          const len = Math.hypot(dx, dy)
          const ux = dx / len
          const uy = dy / len
          const nx = -uy
          const ny = ux
          const bend = 18
          const sx = a.x + ux * r + nx * 4
          const sy = a.y + uy * r + ny * 4
          const ex = b.x - ux * r + nx * 4
          const ey = b.y - uy * r + ny * 4
          const mx = (a.x + b.x) / 2 + nx * bend
          const my = (a.y + b.y) / 2 + ny * bend
          return (
            <g key={i}>
              <path d={`M ${sx} ${sy} Q ${mx} ${my} ${ex} ${ey}`} className={`tr ${active ? 'tr-active' : ''}`} markerEnd={`url(#${active ? 'sd-arrow-active' : 'sd-arrow'})`} />
              {t.label ? (
                <text x={mx + nx * 6} y={my + ny * 6 + 3} textAnchor="middle" className={`tr-text ${active ? 'tr-text-active' : ''}`}>
                  {t.label}
                </text>
              ) : null}
            </g>
          )
        })}
        {states.map((s) => {
          const p = pos.get(s)!
          const cls = ['st', props.current === s ? 'st-current' : '', unreachable.has(s) ? 'st-unreachable' : '', lockup.has(s) ? 'st-lockup' : ''].filter(Boolean).join(' ')
          return (
            <g key={s} onClick={() => props.onSelect?.(s)}>
              <circle cx={p.x} cy={p.y} r={r} className={cls} />
              <text x={p.x} y={p.y + 4} textAnchor="middle" className="st-text">
                {s}
              </text>
              {props.outputs?.[s] !== undefined ? (
                <text x={p.x} y={p.y + r + 12} textAnchor="middle" className="st-sub">
                  out={props.outputs[s]}
                </text>
              ) : null}
              {lockup.has(s) ? (
                <text x={p.x} y={p.y - r - 6} textAnchor="middle" className="st-sub" style={{ fill: 'var(--danger)' }}>
                  lock-up
                </text>
              ) : unreachable.has(s) ? (
                <text x={p.x} y={p.y - r - 6} textAnchor="middle" className="st-sub">
                  unreachable
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      <div className="small muted" style={{ padding: '0 0.3em' }}>
        實線圓 = 可達狀態（reachable state）；虛線圓 = 不可達（unreachable）；紅色 = lock-up。
      </div>
    </div>
  )
}

/** 從 StateGraph 建立 StateDiagram 的 props */
export function graphToDiagram(g: StateGraph, label?: string): Pick<StateDiagramProps, 'states' | 'transitions' | 'unreachable' | 'lockup' | 'outputs'> {
  return {
    states: g.nodes.map((n) => n.state),
    transitions: g.nodes.map((n) => ({ from: n.state, to: n.next, label })),
    unreachable: g.nodes.filter((n) => !n.reachable).map((n) => n.state),
    lockup: g.lockup,
    outputs: Object.fromEntries(g.nodes.map((n) => [n.state, String(n.output)])),
  }
}
