import { useMemo, useState, type ReactNode } from 'react'
import type { Values } from '@/models/divider/types'
import { elementSize, parseRef, pinPoint, routeWire, type SchElement, type Schematic, type SchematicHighlight, type SchWire } from './schematic'
import type { TimingArc } from './arcs'

export interface LogicDiagramProps {
  schematic: Schematic
  /** 訊號目前值（顯示在 wire 上） */
  values?: Values
  highlights?: SchematicHighlight[]
  /** 被點選的元件 */
  activeElement?: string | null
  onElementClick?: (id: string, e: SchElement) => void
  /** 點擊元件時顯示的 timing arc（由 arcs.ts 推導）；未給 activeElement 時由元件內部管理點選狀態 */
  arcs?: TimingArc[]
  onWireClick?: (id: string, w: SchWire) => void
  showValues?: boolean
  showLegend?: boolean
  /** 顯示在圖下方的資訊列（hover 說明） */
  info?: ReactNode
  /** 是否顯示 pin 名稱 */
  showPins?: boolean
  maxWidth?: number
  caption?: ReactNode
}

const KIND_LABEL: Record<string, string> = {
  dff: 'D flip-flop：clock edge 時把 D 抓進 Q',
  tff: 'T flip-flop：clock edge 時若 T=1 則 toggle',
  latch: 'Latch：enable 為 active 時 Q 跟隨 D（transparent）',
  inv: 'Inverter：輸出 = NOT 輸入',
  buf: 'Buffer：輸出 = 輸入',
  and: 'AND gate',
  nand: 'NAND gate',
  or: 'OR gate',
  nor: 'NOR gate',
  xor: 'XOR gate',
  xnor: 'XNOR gate',
  mux2: '2:1 MUX：sel=0 選 in0，sel=1 選 in1',
  mux4: '4:1 MUX',
  mux8: '8:1 MUX',
  port: 'Port',
  box: 'Block',
  text: '',
  dot: 'Junction',
}

export function LogicDiagram({
  schematic,
  values,
  highlights = [],
  activeElement,
  onElementClick,
  arcs = [],
  onWireClick,
  showValues = true,
  showLegend = true,
  info,
  showPins = true,
  maxWidth,
  caption,
}: LogicDiagramProps) {
  const [hover, setHover] = useState<{ type: 'elem' | 'wire'; id: string } | null>(null)
  const [activeInternal, setActiveInternal] = useState<string | null>(null)
  const active = activeElement !== undefined ? activeElement : activeInternal
  const activeArcs = active ? arcs.filter((a) => a.element === active) : []
  const elemMap = useMemo(() => new Map(schematic.elements.map((e) => [e.id, e])), [schematic])
  const routed = useMemo(
    () =>
      schematic.wires.map((w) => {
        const a = parseRef(w.from)
        const b = parseRef(w.to)
        const ea = elemMap.get(a.elem)
        const eb = elemMap.get(b.elem)
        if (!ea || !eb) return { w, pts: [] as [number, number][] }
        const pa = pinPoint(ea, a.pin)
        const pb = pinPoint(eb, b.pin)
        return { w, pts: routeWire(w, pa, pb, schematic.elements) }
      }),
    [schematic, elemMap],
  )
  const wireHl = new Map<string, SchematicHighlight['style']>()
  const elemHl = new Map<string, SchematicHighlight['style']>()
  for (const h of highlights) {
    for (const id of h.wires ?? []) wireHl.set(id, h.style)
    for (const id of h.elements ?? []) elemHl.set(id, h.style)
  }

  const hoverInfo = (() => {
    if (!hover) return null
    if (hover.type === 'elem') {
      const e = elemMap.get(hover.id)
      if (!e) return null
      const v = e.signal && values ? values[e.signal] : undefined
      return (
        <>
          <b>{e.label ?? e.id}</b>　{e.description ?? KIND_LABEL[e.kind]}
          {e.edge ? `　（${e.edge === 'rising' ? '上升緣觸發 rising-edge' : '下降緣觸發 falling-edge'}）` : ''}
          {v !== undefined ? <>　目前 {e.signal} = <span className={`value-${v}`}>{v}</span></> : null}
        </>
      )
    }
    const w = schematic.wires.find((x) => x.id === hover.id)
    if (!w) return null
    const v = w.signal && values ? values[w.signal] : undefined
    return (
      <>
        <b>{w.label ?? w.signal ?? w.id}</b>　{w.kind ? WIRE_KIND_LABEL[w.kind] : '訊號線'}　{w.from} → {w.to}
        {v !== undefined ? <>　目前值 <span className={`value-${v}`}>{v}</span></> : null}
      </>
    )
  })()

  return (
    <figure className="circuit" style={{ margin: '0.6em 0' }}>
      {schematic.title ? <div className="panel-title" style={{ padding: '0 0.4em' }}>{schematic.title}</div> : null}
      <svg viewBox={`0 0 ${schematic.width} ${schematic.height}`} width={maxWidth ?? schematic.width} role="img" aria-label={schematic.title ?? 'circuit'}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
          <marker id="arrow-setup" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--hl-setup)" />
          </marker>
          <marker id="arrow-hold" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--hl-hold)" />
          </marker>
          <marker id="arrow-async" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--hl-async)" />
          </marker>
          <marker id="arrow-info" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent)" />
          </marker>
        </defs>
        {/* wires */}
        {routed.map(({ w, pts }) => {
          if (!pts.length) return null
          const hl = wireHl.get(w.id)
          const v = w.signal && values ? values[w.signal] : undefined
          const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ')
          const cls = ['wire', w.kind ? `wire-${w.kind}` : '', hl ? `hl-${hl}` : '', v === 1 && showValues ? 'wire-1' : ''].filter(Boolean).join(' ')
          const markerId = hl ? `arrow-${hl}` : 'arrow'
          const stroke = hl ? undefined : w.kind === 'clock' ? 'var(--sig-clock)' : w.kind === 'control' ? 'var(--sig-control)' : w.kind === 'reset' ? 'var(--sig-reset)' : w.kind === 'output' ? 'var(--sig-output)' : 'var(--sig-data)'
          // label position
          const labelAt = w.labelAt ?? 0.5
          const lp = pointAlong(pts, labelAt)
          return (
            <g key={w.id} onMouseEnter={() => setHover({ type: 'wire', id: w.id })} onMouseLeave={() => setHover(null)} onClick={() => onWireClick?.(w.id, w)} style={{ cursor: onWireClick ? 'pointer' : 'default' }}>
              <path d={d} className="wire" style={{ stroke: 'transparent', strokeWidth: 10 }} />
              <path d={d} className={cls} markerEnd={w.noArrow ? undefined : `url(#${markerId})`} style={{ color: stroke }} />
              {w.label || (w.signal && showValues && v !== undefined) ? (
                <text x={lp[0] + 4} y={lp[1] - 5} className="wire-label">
                  {w.label ?? w.signal}
                  {w.signal && showValues && v !== undefined ? (
                    <tspan className={`wire-value wire-value-${v}`}> = {v}</tspan>
                  ) : null}
                </text>
              ) : null}
            </g>
          )
        })}
        {/* elements */}
        {schematic.elements.map((e) => {
          const hl = elemHl.get(e.id)
          const cls = ['elem', hl ? `elem-hl-${hl}` : '', active === e.id ? 'elem-active' : '', e.className ?? ''].filter(Boolean).join(' ')
          return (
            <g
              key={e.id}
              className={cls}
              onMouseEnter={() => setHover({ type: 'elem', id: e.id })}
              onMouseLeave={() => setHover(null)}
              onClick={() => {
                onElementClick?.(e.id, e)
                if (activeElement === undefined) setActiveInternal((prev) => (prev === e.id ? null : e.id))
              }}
            >
              <title>{e.description ?? KIND_LABEL[e.kind]}</title>
              <Symbol e={e} showPins={showPins} value={e.signal && values ? values[e.signal] : undefined} />
            </g>
          )
        })}
        {/* timing arcs of the clicked element */}
        {activeArcs.map((a, i) => {
          const e = elemMap.get(a.element)
          if (!e) return null
          const p1 = pinPoint(e, a.from)
          const p2 = pinPoint(e, a.to)
          const top = Math.min(p1.y, p2.y)
          const cx = (p1.x + p2.x) / 2
          const cy = top - 22 - i * 16
          return (
            <g key={`${a.element}-${a.from}-${a.to}-${i}`} className="arc-group">
              <path d={`M ${p1.x} ${p1.y} Q ${cx} ${cy} ${p2.x} ${p2.y}`} className="arc" markerEnd="url(#arrow-info)" />
              <text x={cx} y={cy + 2} textAnchor="middle" className="arc-label">
                {a.from} → {a.to}：{a.label}
              </text>
            </g>
          )
        })}
        {/* highlight tags */}
        {highlights.flatMap((h) =>
          (h.tags ?? []).map((t, i) => {
            const e = elemMap.get(t.elementOrWire)
            let x = 0
            let y = 0
            if (e) {
              const s = elementSize(e)
              x = e.x + s.w / 2
              y = e.y - 14
            } else {
              const r = routed.find((rr) => rr.w.id === t.elementOrWire)
              if (r && r.pts.length) {
                const p = pointAlong(r.pts, 0.5)
                x = p[0]
                y = p[1] - 14
              }
            }
            return (
              <text key={`${h.style}-${i}`} x={x + (t.dx ?? 0)} y={y + (t.dy ?? 0)} textAnchor="middle" className={`hl-tag hl-tag-${h.style}`}>
                {t.text}
              </text>
            )
          }),
        )}
      </svg>
      {showLegend ? (
        <div className="circuit-legend">
          <span style={{ color: 'var(--sig-clock)' }}>━ clock</span>
          <span style={{ color: 'var(--sig-data)' }}>━ data / feedback</span>
          <span style={{ color: 'var(--sig-control)' }}>╌ control</span>
          <span style={{ color: 'var(--sig-reset)' }}>┄ reset</span>
          <span style={{ color: 'var(--sig-output)' }}>━ output</span>
          {highlights.some((h) => h.style === 'setup') ? <span style={{ color: 'var(--hl-setup)', fontWeight: 700 }}>━━ setup / max-delay path</span> : null}
          {highlights.some((h) => h.style === 'hold') ? <span style={{ color: 'var(--hl-hold)', fontWeight: 700 }}>╍╍ hold / min-delay path</span> : null}
          {highlights.some((h) => h.style === 'async') ? <span style={{ color: 'var(--hl-async)', fontWeight: 700 }}>┈┈ asynchronous / control path</span> : null}
        </div>
      ) : null}
      <div className="circuit-info">
        {hoverInfo ??
          (active && activeArcs.length ? (
            <>
              <b>{elemMap.get(active)?.label ?? active}</b> 的 timing arc：
              {activeArcs.map((a, i) => (
                <span key={i} style={{ marginLeft: '0.6em' }}>
                  <span className="mono">
                    {a.from} → {a.to}
                  </span>{' '}
                  {a.label}
                  {i < activeArcs.length - 1 ? '；' : ''}
                </span>
              ))}
              <span className="faint">　（再點一次取消）</span>
            </>
          ) : (
            info ?? (
              <span className="faint">
                滑鼠移到元件或訊號線上可看到說明；{arcs.length ? '點擊元件可看 timing arc（tCQ、tpd、setup / hold）。' : '點擊元件可高亮。'}
              </span>
            )
          ))}
      </div>
      {caption ? <figcaption className="small muted" style={{ padding: '0.2em 0.5em' }}>{caption}</figcaption> : null}
    </figure>
  )
}

const WIRE_KIND_LABEL: Record<string, string> = {
  clock: 'clock path（時脈路徑）',
  data: 'data path（資料路徑）',
  control: 'control path（控制路徑）',
  reset: 'reset path（非同步重置）',
  output: 'output path（輸出路徑）',
  feedback: 'feedback path（回授路徑）',
}

function pointAlong(pts: [number, number][], frac: number): [number, number] {
  let total = 0
  const segs: number[] = []
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    segs.push(l)
    total += l
  }
  let target = total * frac
  for (let i = 1; i < pts.length; i++) {
    if (target <= segs[i - 1] || i === pts.length - 1) {
      const r = segs[i - 1] ? target / segs[i - 1] : 0
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * r, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * r]
    }
    target -= segs[i - 1]
  }
  return pts[0]
}

function Symbol({ e, showPins, value }: { e: SchElement; showPins: boolean; value?: 0 | 1 }) {
  const { w, h } = elementSize(e)
  const x = e.x
  const y = e.y
  const label = e.label ? (
    <text x={x + w / 2} y={y - 6} textAnchor="middle" className="sym-label">
      {e.label}
    </text>
  ) : null
  switch (e.kind) {
    case 'dff':
    case 'tff':
    case 'latch': {
      const isLatch = e.kind === 'latch'
      const neg = e.negEdge || e.edge === 'falling'
      return (
        <>
          {label}
          <rect x={x} y={y} width={w} height={h} rx={3} className="sym" />
          <text x={x + 8} y={y + 24} className="sym-text">{e.kind === 'tff' ? 'T' : 'D'}</text>
          <text x={x + w - 8} y={y + 24} textAnchor="end" className="sym-text">Q</text>
          <text x={x + w - 8} y={y + 56} textAnchor="end" className="sym-text">Q̄</text>
          {isLatch ? (
            <text x={x + 6} y={y + 56} className="sym-text">EN</text>
          ) : (
            <path d={`M ${x} ${y + 45} L ${x + 9} ${y + 52} L ${x} ${y + 59}`} fill="none" stroke="currentColor" strokeWidth={1.4} className="sym" style={{ fill: 'none' }} />
          )}
          {neg && !isLatch ? <circle cx={x - 4} cy={y + 52} r={3.5} className="sym" /> : null}
          {showPins ? (
            <text x={x + w / 2} y={y + h - 4} textAnchor="middle" className="pin-text">{e.kind === 'latch' ? '' : 'rst_n'}</text>
          ) : null}
          {value !== undefined ? (
            <text x={x + w / 2} y={y + 42} textAnchor="middle" className={`wire-value wire-value-${value}`} style={{ fontSize: 13 }}>
              {e.signal}={value}
            </text>
          ) : null}
        </>
      )
    }
    case 'inv':
    case 'buf': {
      const bubble = e.kind === 'inv'
      const tipX = x + w - (bubble ? 7 : 0)
      return (
        <>
          {label}
          <path d={`M ${x} ${y} L ${tipX} ${y + h / 2} L ${x} ${y + h} Z`} className="sym" />
          {bubble ? <circle cx={tipX + 3.5} cy={y + h / 2} r={3.5} className="sym" /> : null}
        </>
      )
    }
    case 'and':
    case 'nand': {
      const bubble = e.kind === 'nand'
      const bw = w - (bubble ? 7 : 0)
      return (
        <>
          {label}
          <path d={`M ${x} ${y} L ${x + bw - h / 2} ${y} A ${h / 2} ${h / 2} 0 0 1 ${x + bw - h / 2} ${y + h} L ${x} ${y + h} Z`} className="sym" />
          {bubble ? <circle cx={x + bw + 3.5} cy={y + h / 2} r={3.5} className="sym" /> : null}
        </>
      )
    }
    case 'or':
    case 'nor':
    case 'xor':
    case 'xnor': {
      const bubble = e.kind === 'nor' || e.kind === 'xnor'
      const dbl = e.kind === 'xor' || e.kind === 'xnor'
      const bw = w - (bubble ? 7 : 0)
      const body = `M ${x + (dbl ? 6 : 0)} ${y} Q ${x + bw * 0.55} ${y} ${x + bw} ${y + h / 2} Q ${x + bw * 0.55} ${y + h} ${x + (dbl ? 6 : 0)} ${y + h} Q ${x + (dbl ? 6 : 0) + 14} ${y + h / 2} ${x + (dbl ? 6 : 0)} ${y} Z`
      return (
        <>
          {label}
          <path d={body} className="sym" />
          {dbl ? <path d={`M ${x} ${y} Q ${x + 14} ${y + h / 2} ${x} ${y + h}`} className="sym" style={{ fill: 'none' }} /> : null}
          {bubble ? <circle cx={x + bw + 3.5} cy={y + h / 2} r={3.5} className="sym" /> : null}
        </>
      )
    }
    case 'mux2':
    case 'mux4':
    case 'mux8': {
      const n = e.kind === 'mux2' ? 2 : e.kind === 'mux4' ? 4 : 8
      return (
        <>
          {label}
          <path d={`M ${x} ${y} L ${x + w} ${y + 12} L ${x + w} ${y + h - 12} L ${x} ${y + h} Z`} className="sym" />
          {Array.from({ length: n }).map((_, i) => (
            <text key={i} x={x + 4} y={y + (h * (i + 1)) / (n + 1) + 3} className="pin-text">{i}</text>
          ))}
          <text x={x + w / 2} y={y + h / 2 + 3} textAnchor="middle" className="sym-text" style={{ fontSize: 9 }}>MUX</text>
        </>
      )
    }
    case 'port': {
      const isIn = e.dir !== 'out'
      return (
        <>
          <circle cx={x} cy={y} r={3} className="sym" />
          <text x={isIn ? x - 7 : x + 7} y={y + 4} textAnchor={isIn ? 'end' : 'start'} className="sym-text" style={{ fontWeight: 600 }}>
            {e.text ?? e.label ?? e.id}
            {value !== undefined ? <tspan className={`wire-value wire-value-${value}`}> = {value}</tspan> : null}
          </text>
        </>
      )
    }
    case 'box': {
      const lines = (e.text ?? e.label ?? e.id).split('\n')
      return (
        <>
          {label}
          <rect x={x} y={y} width={w} height={h} rx={4} className="sym" />
          {lines.map((ln, i) => (
            <text key={i} x={x + w / 2} y={y + h / 2 + 4 + (i - (lines.length - 1) / 2) * 14} textAnchor="middle" className="sym-text">
              {ln}
            </text>
          ))}
          {showPins
            ? (e.pins ?? []).map((p) => {
                const pp = pinPoint(e, p.name)
                const dx = p.side === 'left' ? 5 : p.side === 'right' ? -5 : 0
                const dy = p.side === 'top' ? 10 : p.side === 'bottom' ? -4 : 3
                return (
                  <text key={p.name} x={pp.x + dx} y={pp.y + dy} textAnchor={p.side === 'left' ? 'start' : p.side === 'right' ? 'end' : 'middle'} className="pin-text">
                    {p.label ?? p.name}
                  </text>
                )
              })
            : null}
          {e.edge ? <path d={`M ${x} ${y + h - 14} L ${x + 8} ${y + h - 8} L ${x} ${y + h - 2}`} className="sym" style={{ fill: 'none' }} /> : null}
        </>
      )
    }
    case 'text':
      return (
        <text x={x} y={y} className="sym-label" style={{ fontSize: 12 }}>
          {e.text ?? e.label}
        </text>
      )
    case 'dot':
      return <circle cx={x} cy={y} r={3} fill="currentColor" className="sym" style={{ fill: 'var(--fg)' }} />
  }
}
