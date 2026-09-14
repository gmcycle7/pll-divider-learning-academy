import { useMemo, useState, type ReactNode } from 'react'
import type { DtcConfig } from '@/models/phase/dtc'
import { dtcStep } from '@/models/phase/dtc'
import { codeBits, dtcTimeline, type DtcTimelineRow } from '@/lessons/m6/models'
import { fmtNum } from '@/utils/format'

export interface DtcCarryVisualizerProps {
  cfg?: DtcConfig
  initialIncrement?: number
  initialSteps?: number
  /** divider 的整數除數（每個 output 週期至少走 N 個 Tvco） */
  initialN?: number
  tvcoPs?: number
  title?: ReactNode
  /** 顯示 DTC gain error 滑桿 */
  showGainError?: boolean
  /** 允許使用者切換 coarse/fine bit 數 */
  allowConfig?: boolean
  compact?: boolean
}

const ZERO: DtcTimelineRow = {
  k: 0,
  code: 0,
  wrapped: 0,
  coarse: 0,
  fine: 0,
  fineCarry: 0,
  coarseCarry: 0,
  overflowTotal: 0,
  integerCycles: 0,
  phaseQuantT: 0,
  tQuant: 0,
  tIdeal: 0,
  tActual: 0,
  residualT: 0,
  residualPs: 0,
}

export function DtcCarryVisualizer(props: DtcCarryVisualizerProps) {
  const { initialIncrement = 100, initialSteps = 12, initialN = 4, tvcoPs = 100, title, showGainError = true, allowConfig = false, compact = false } = props
  const [cfg, setCfg] = useState<DtcConfig>(props.cfg ?? { coarseBits: 3, fineBits: 6 })
  const totalBits = cfg.coarseBits + cfg.fineBits
  const fineMod = 1 << cfg.fineBits
  const coarseMod = 1 << cfg.coarseBits
  const full = fineMod * coarseMod
  const [increment, setIncrement] = useState(initialIncrement)
  const [steps, setSteps] = useState(initialSteps)
  const [N, setN] = useState(initialN)
  const [gain, setGain] = useState(0)
  const [k, setK] = useState(1)

  const inc = Math.max(0, Math.min(full - 1, Math.round(increment)))
  const rows = useMemo(() => dtcTimeline(inc, cfg, steps, N, gain, tvcoPs), [inc, cfg, steps, N, gain, tvcoPs])
  const cur = rows[Math.min(k, rows.length) - 1] ?? ZERO
  const prev = k >= 2 ? rows[k - 2] : ZERO
  const bits = codeBits(cur.coarse, cur.fine, cfg)
  const lsbPs = dtcStep(cfg) * tvcoPs
  const coarsePs = tvcoPs / coarseMod
  const incCoarse = Math.floor(inc / fineMod)
  const incFine = inc % fineMod
  const fineSum = prev.fine + inc
  const coarseSum = prev.coarse + cur.fineCarry

  const setConfig = (c: number, f: number) => {
    setCfg({ coarseBits: c, fineBits: f })
    setK(1)
  }

  return (
    <div className="panel">
      <div className="panel-title">
        {title ?? `${cfg.coarseBits}-bit PMUX + ${cfg.fineBits}-bit DTC = ${totalBits}-bit phase control word`}
        <span className="chip">架構 (a)：coarse wrap → divider 該週期走 N+1</span>
      </div>
      <div className="control-row">
        {allowConfig ? (
          <label>
            coarse / fine bits
            <select value={`${cfg.coarseBits}+${cfg.fineBits}`} onChange={(e) => {
              const [c, f] = e.target.value.split('+').map(Number)
              setConfig(c, f)
            }}>
              <option value="3+6">3 + 6（8 phases，64 DTC codes）</option>
              <option value="4+5">4 + 5（16 phases，32 DTC codes）</option>
              <option value="2+7">2 + 7（4 phases，128 DTC codes）</option>
            </select>
          </label>
        ) : null}
        <label>
          increment（code / output 週期）
          <input type="number" min={0} max={full - 1} value={increment} onChange={(e) => { setIncrement(Number(e.target.value)); setK(1) }} />
        </label>
        <label>
          N（整數除數）
          <input type="number" min={1} max={64} value={N} onChange={(e) => { setN(Math.max(1, Number(e.target.value))); setK(1) }} />
        </label>
        <label>
          步數
          <input type="number" min={1} max={64} value={steps} onChange={(e) => { setSteps(Math.max(1, Math.min(64, Number(e.target.value)))); setK(1) }} />
        </label>
        {showGainError ? (
          <label>
            DTC gain error
            <input type="range" min={-10} max={10} step={0.5} value={gain} onChange={(e) => setGain(Number(e.target.value))} />
            <span className="mono">{gain > 0 ? '+' : ''}{gain}%</span>
          </label>
        ) : null}
      </div>
      <div className="stepper">
        <button className="btn" onClick={() => setK((x) => Math.max(1, x - 1))} disabled={k <= 1}>◀ 上一步</button>
        <button className="btn btn-primary" onClick={() => setK((x) => Math.min(rows.length, x + 1))} disabled={k >= rows.length}>下一個 output 週期 ▶</button>
        <button className="btn" onClick={() => setK(1)}>⟲ 第 1 步</button>
        <button className="btn" onClick={() => setK(rows.length)}>跑到底</button>
        <span className="status">step {cur.k} / {rows.length}</span>
      </div>

      <div className="small muted" style={{ margin: '0.3em 0' }}>
        increment {inc} = {incCoarse} × {fineMod} + {incFine} ⇒ 每個週期加 <b>{incCoarse}</b> 個 PMUX step（{fmtNum(coarsePs, 3)} ps）+ <b>{incFine}</b> 個 DTC step（{fmtNum(lsbPs, 4)} ps）；
        目標平均除數 N + {inc}/{full} = <b>{fmtNum(N + inc / full, 5)}</b>
      </div>

      {/* bit field */}
      <div className="control-row" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="small muted">{totalBits}-bit control word（wrap 後）= {cur.wrapped}</div>
          <div className="bit-field">
            {bits.map((b, i) => (
              <span key={i} className={b.role}>
                <small>2^{b.weight}</small>
                <b>{b.bit}</b>
              </span>
            ))}
          </div>
          <div className="small muted" style={{ marginTop: 2 }}>
            <span style={{ color: 'var(--sig-phase)' }}>■ coarse（PMUX）</span>　<span style={{ color: 'var(--sig-output)' }}>■ fine（DTC）</span>
          </div>
        </div>
        <div className="bit-field">
          <span className="coarse"><small>PMUX code</small><b>{cur.coarse}</b></span>
          <span className="fine"><small>DTC code</small><b>{cur.fine}</b></span>
          <span className={cur.fineCarry ? 'carry' : ''}><small>fine→coarse</small><b>{cur.fineCarry}</b></span>
          <span className={cur.coarseCarry ? 'carry' : ''}><small>coarse→integer</small><b>{cur.coarseCarry}</b></span>
          <span><small>total code</small><b>{cur.code}</b></span>
          <span><small>overflow 累計</small><b>{cur.overflowTotal}</b></span>
        </div>
      </div>

      <div className="narration">
        <ol>
          <li>
            fine：{prev.fine} + {inc} = {fineSum} = {cur.fineCarry} × {fineMod} + {cur.fine} ⇒ DTC code = <b>{cur.fine}</b>
            {cur.fineCarry ? <>，進位 <b>{cur.fineCarry}</b> 給 PMUX</> : '，沒有進位'}。
          </li>
          <li>
            coarse：{prev.coarse} + {cur.fineCarry} = {coarseSum}
            {cur.coarseCarry ? (
              <> = {cur.coarseCarry} × {coarseMod} + {cur.coarse} ⇒ PMUX index wrap 回 <b>{cur.coarse}</b>，產生 coarse→integer carry <b>{cur.coarseCarry}</b>：這個週期 divider 走 N + {cur.coarseCarry} = {N + cur.coarseCarry} 個 T<sub>vco</sub>。</>
            ) : (
              <> ⇒ PMUX index = <b>{cur.coarse}</b>，沒有 wrap，divider 走 N = {N} 個 T<sub>vco</sub>。</>
            )}
          </li>
          <li>
            edge 位置 = 整數 {cur.integerCycles} + {cur.coarse}/{coarseMod} + {cur.fine}/{full} = <b>{fmtNum(cur.tQuant, 5)} T<sub>vco</sub></b>（{fmtNum(cur.tQuant * tvcoPs, 3)} ps）；理想 k·(N + {inc}/{full}) = {fmtNum(cur.tIdeal, 5)} T<sub>vco</sub>；
            量化 phase = {fmtNum(cur.phaseQuantT, 5)} T<sub>vco</sub>，理想 phase（連續）= {fmtNum(cur.tIdeal - Math.floor(cur.tIdeal), 5)} T<sub>vco</sub>。
          </li>
          <li>
            residual = actual − ideal = <b className={Math.abs(cur.residualPs) > 1e-9 ? 'value-x' : 'value-1'}>{fmtNum(cur.residualT, 6)} T<sub>vco</sub> = {fmtNum(cur.residualPs, 4)} ps</b>
            {gain !== 0 ? <>（DTC gain error {gain}% × fine {cur.fine} × {fmtNum(lsbPs, 4)} ps）</> : <>（increment 是整數個 code、DTC 理想 ⇒ residual = 0）</>}。
          </li>
        </ol>
      </div>

      <EdgeTimeline rows={rows.slice(0, k)} N={N} coarseMod={coarseMod} tvcoPs={tvcoPs} />

      {!compact ? (
        <details open>
          <summary className="small muted">逐步表（到目前為止）</summary>
          <div className="scroll-x">
            <table className="state-table">
              <thead>
                <tr>
                  <th>k</th>
                  <th>total code</th>
                  <th>{totalBits}-bit</th>
                  <th>PMUX</th>
                  <th>DTC</th>
                  <th>fine→coarse</th>
                  <th>coarse→int</th>
                  <th>整數 T<sub>vco</sub></th>
                  <th>edge（T<sub>vco</sub>）</th>
                  <th>ideal</th>
                  <th>residual（ps）</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, k).map((r) => (
                  <tr key={r.k} className={r.k === cur.k ? 'current' : ''}>
                    <td>{r.k}</td>
                    <td>{r.code}</td>
                    <td>{r.wrapped.toString(2).padStart(totalBits, '0')}</td>
                    <td>{r.coarse}</td>
                    <td>{r.fine}</td>
                    <td className={r.fineCarry ? 'changed' : ''}>{r.fineCarry}</td>
                    <td className={r.coarseCarry ? 'changed' : ''}>{r.coarseCarry}</td>
                    <td>{r.integerCycles}</td>
                    <td>{fmtNum(r.tActual, 4)}</td>
                    <td>{fmtNum(r.tIdeal, 4)}</td>
                    <td className={Math.abs(r.residualPs) > 1e-9 ? 'changed' : ''}>{fmtNum(r.residualPs, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  )
}

/** edge 時間軸：整數格線 + PMUX 子格線 + 實際 edge / 理想 edge */
function EdgeTimeline({ rows, N, coarseMod, tvcoPs }: { rows: DtcTimelineRow[]; N: number; coarseMod: number; tvcoPs: number }) {
  if (!rows.length) return null
  const W = 720
  const H = 150
  const padL = 30
  const padR = 20
  const plotW = W - padL - padR
  const tMax = rows[rows.length - 1].tActual + 1
  const tMin = Math.max(0, rows[0].tActual - N - 0.5)
  const x = (t: number) => padL + ((t - tMin) / (tMax - tMin)) * plotW
  const yEdge = 58
  const yIdeal = 92
  const ints: number[] = []
  for (let i = Math.ceil(tMin); i <= tMax; i++) ints.push(i)
  const showSub = tMax - tMin <= 12
  const maxRes = Math.max(1e-9, ...rows.map((r) => Math.abs(r.residualPs)))
  return (
    <div className="wave" style={{ padding: '0.4em 0.6em' }}>
      <div className="wave-toolbar" style={{ color: 'var(--fg)', fontWeight: 600 }}>edge timeline（T<sub>vco</sub> 單位）</div>
      <div className="wave-svg-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block', fontFamily: 'var(--mono)' }} role="img" aria-label="edge timeline">
          {ints.map((i) => (
            <g key={i}>
              <line x1={x(i)} x2={x(i)} y1={30} y2={104} stroke="var(--sig-grid)" />
              {showSub
                ? Array.from({ length: coarseMod - 1 }, (_, j) => (
                    <line key={j} x1={x(i + (j + 1) / coarseMod)} x2={x(i + (j + 1) / coarseMod)} y1={44} y2={72} stroke="var(--sig-grid)" strokeDasharray="1 2" />
                  ))
                : null}
              {ints.length <= 24 || i % 4 === 0 ? (
                <text x={x(i)} y={116} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--fg-muted)' }}>
                  {i}
                </text>
              ) : null}
            </g>
          ))}
          <text x={padL} y={24} style={{ fontSize: 9.5, fill: 'var(--sig-output)' }}>▲ actual edge（含 gain error）　</text>
          <text x={padL + 190} y={24} style={{ fontSize: 9.5, fill: 'var(--sig-phase)' }}>│ ideal edge k·(N + inc/2^bits)</text>
          {rows.map((r) => (
            <g key={r.k}>
              <path d={`M ${x(r.tActual)} ${yEdge - 8} l -5 10 l 10 0 z`} fill="var(--sig-output)" />
              <text x={x(r.tActual)} y={yEdge - 12} textAnchor="middle" style={{ fontSize: 8.5, fill: 'var(--fg-muted)' }}>
                k{r.k}{r.coarseCarry ? ' (carry)' : ''}
              </text>
              <line x1={x(r.tIdeal)} x2={x(r.tIdeal)} y1={yIdeal - 10} y2={yIdeal + 10} stroke="var(--sig-phase)" strokeWidth={1.5} />
            </g>
          ))}
          <text x={padL} y={140} style={{ fontSize: 9.5, fill: 'var(--fg-muted)' }}>
            residual（ps）：{rows.map((r) => fmtNum(r.residualPs, 3)).join('  ')}　（max |residual| = {fmtNum(maxRes, 3)} ps，T_vco = {tvcoPs} ps）
          </text>
        </svg>
      </div>
    </div>
  )
}
