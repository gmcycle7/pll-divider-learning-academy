import { useMemo, useState, type ReactNode } from 'react'
import { analyzeSequence, dftMagnitude, parseSequence } from '@/models/fractional/sequence'
import { ClockWaveform, clockTrace } from '@/components/waveform/ClockWaveform'
import type { SignalTrace } from '@/models/divider/types'
import { runDualModSequence } from '@/lessons/m6/models'
import { fmtNum } from '@/utils/format'

// ---------------------------------------------------------------- DFT 概念圖（SVG bar chart）
export interface DftChartProps {
  freq: number[]
  mag: number[]
  /** 要標出的頻率（以 f_div 的比例表示），例如 1/pattern period */
  marks?: { f: number; label: string }[]
  title?: ReactNode
  yLabel?: string
  height?: number
  /** 以 dB 顯示（相對最大值） */
  db?: boolean
}

export function DftChart({ freq, mag, marks = [], title, yLabel = '|X(f)|', height = 210, db = false }: DftChartProps) {
  const W = 560
  const padL = 46
  const padR = 14
  const padT = 18
  const padB = 34
  const plotW = W - padL - padR
  const plotH = height - padT - padB
  const maxMag = Math.max(1e-12, ...mag)
  const vals = db ? mag.map((m) => 20 * Math.log10(Math.max(m, maxMag * 1e-4) / maxMag)) : mag
  const yMin = db ? -80 : 0
  const yMax = db ? 0 : maxMag * 1.08
  const x = (f: number) => padL + (f / 0.5) * plotW
  const y = (v: number) => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH
  const n = Math.max(1, freq.length)
  const bw = Math.max(1, (plotW / n) * 0.8)
  const yTicks = db ? [0, -20, -40, -60, -80] : [0, maxMag * 0.25, maxMag * 0.5, maxMag * 0.75, maxMag]
  return (
    <div className="wave" style={{ padding: '0.4em 0.6em' }}>
      {title ? <div className="wave-toolbar" style={{ color: 'var(--fg)', fontWeight: 600 }}>{title}</div> : null}
      <div className="wave-svg-wrap">
        <svg viewBox={`0 0 ${W} ${height}`} width="100%" style={{ maxWidth: W, display: 'block', fontFamily: 'var(--mono)' }} role="img" aria-label="DFT magnitude">
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={padL} x2={padL + plotW} y1={y(t)} y2={y(t)} stroke="var(--sig-grid)" strokeWidth={1} />
              <text x={padL - 4} y={y(t) + 3} textAnchor="end" style={{ fontSize: 9, fill: 'var(--fg-muted)' }}>
                {db ? `${t}` : fmtNum(t, 2)}
              </text>
            </g>
          ))}
          {[0, 0.1, 0.2, 0.3, 0.4, 0.5].map((f) => (
            <g key={f}>
              <line x1={x(f)} x2={x(f)} y1={padT + plotH} y2={padT + plotH + 4} stroke="var(--fg-muted)" />
              <text x={x(f)} y={padT + plotH + 15} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--fg-muted)' }}>
                {f}
              </text>
            </g>
          ))}
          <text x={padL + plotW / 2} y={height - 4} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--fg-muted)' }}>
            f / f_div（每個 output 週期取樣一次 ⇒ 最高 0.5）
          </text>
          <text x={10} y={padT + 4} style={{ fontSize: 9, fill: 'var(--fg-muted)' }}>
            {yLabel}
            {db ? ' (dB)' : ''}
          </text>
          {freq.map((f, i) =>
            f > 0.5 + 1e-9 ? null : (
              <rect key={i} x={x(f) - bw / 2} y={y(vals[i])} width={bw} height={Math.max(0, padT + plotH - y(vals[i]))} fill="var(--accent)" opacity={0.85} />
            ),
          )}
          {marks.map((m, i) => (
            <g key={i}>
              <line x1={x(m.f)} x2={x(m.f)} y1={padT} y2={padT + plotH} stroke="var(--sig-cursor)" strokeDasharray="4 3" strokeWidth={1.2} />
              <text x={x(m.f) + 3} y={padT + 10 + i * 11} style={{ fontSize: 9.5, fill: 'var(--sig-cursor)' }}>
                {m.label}
              </text>
            </g>
          ))}
          <line x1={padL} x2={padL + plotW} y1={padT + plotH} y2={padT + plotH} stroke="var(--fg-muted)" />
          <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} stroke="var(--fg-muted)" />
        </svg>
      </div>
    </div>
  )
}

/** 循環序列的最小週期（把序列視為無限重複） */
export function cyclicPeriod(seq: number[]): number {
  const L = seq.length
  for (let p = 1; p <= L; p++) {
    if (L % p !== 0) continue
    let ok = true
    for (let i = 0; i < L; i++) if (seq[i] !== seq[(i + p) % L]) ok = false
    if (ok) return p
  }
  return L
}

// ---------------------------------------------------------------- 主元件
export interface DividerSequenceSimulatorProps {
  initial?: string
  title?: ReactNode
  /** 序列只含 2/3 時，用 dualMod23 跑出真實波形 */
  showRealDivider?: boolean
  showDft?: boolean
  showTable?: boolean
  /** 假設的輸入 clock 週期（ps），用來換算 ps */
  tinPs?: number
  maxLength?: number
  presets?: { label: string; value: string }[]
}

const DEFAULT_PRESETS = [
  { label: '2,3,3,3（2.75）', value: '2, 3, 3, 3, 2, 3, 3, 3' },
  { label: '3,3,4', value: '3, 3, 4, 3, 3, 4' },
  { label: '2,3（2.5）', value: '2, 3, 2, 3, 2, 3, 2, 3' },
  { label: '2,2,2,3（2.25）', value: '2, 2, 2, 3, 2, 2, 2, 3' },
  { label: '3,3,3,3,2（2.8）', value: '3, 3, 3, 3, 2, 3, 3, 3, 3, 2' },
]

export function DividerSequenceSimulator(props: DividerSequenceSimulatorProps) {
  const { initial = '2, 3, 3, 3, 2, 3, 3, 3', title, showRealDivider = true, showDft = true, showTable = true, tinPs = 100, maxLength = 32, presets = DEFAULT_PRESETS } = props
  const [text, setText] = useState(initial)
  const seq = useMemo(() => parseSequence(text).map((x) => Math.round(x)).filter((x) => x >= 1).slice(0, maxLength), [text, maxLength])
  const a = useMemo(() => analyzeSequence(seq), [seq])
  const L = seq.length
  const P = L ? cyclicPeriod(seq) : 0
  const errs = a.edgeError.slice(1)
  const errMean = errs.length ? errs.reduce((s, v) => s + v, 0) / errs.length : 0
  const rmsAc = errs.length ? Math.sqrt(errs.reduce((s, v) => s + (v - errMean) ** 2, 0) / errs.length) : 0
  const T = 100 // 波形以 T 為單位；ps 換算另外用 tinPs

  // 波形：clk、ideal（均勻 edge）、actual（序列 edge）
  const waveform = useMemo(() => {
    if (!L) return null
    const tEndT = a.edgeTimes[a.edgeTimes.length - 1] + 1
    const clk = clockTrace('clk', T, Math.ceil(tEndT) + 1)
    const actual: SignalTrace = { name: 'actual', kind: 'output', events: [] }
    const ideal: SignalTrace = { name: 'ideal', kind: 'phase', events: [] }
    const width = Math.min(1, a.average / 2)
    for (const t of a.edgeTimes) actual.events.push({ t: t * T, v: 1 }, { t: (t + 1) * T, v: 0 })
    for (const t of a.idealTimes) ideal.events.push({ t: t * T, v: 1 }, { t: (t + width) * T, v: 0 })
    // 確保以 0 開頭（t=0 的 v=1 事件已經在 edgeTimes[0]=0）
    const annotations = a.edgeTimes.slice(1, 9).map((t, i) => ({ t: t * T, signal: 'actual', text: `e${i + 1}=${fmtNum(a.edgeError[i + 1], 2)}T` }))
    const markers = a.idealTimes.slice(1, 9).map((t, i) => ({ t: t * T, label: `ideal ${i + 1}`, kind: 'window' as const, signal: 'ideal' }))
    return { traces: [clk, ideal, actual], tEnd: tEndT * T, annotations, markers }
  }, [a, L])

  // 真實 divider（dualMod23）
  const only23 = L > 0 && seq.every((x) => x === 2 || x === 3)
  const real = useMemo(() => (showRealDivider && only23 ? runDualModSequence(seq, L <= 8 ? 2 * L : L, T) : null), [showRealDivider, only23, seq, L])

  // DFT：把 pattern 重複到 ≥ 64 個 output 週期
  const dft = useMemo(() => {
    if (!L || !showDft) return null
    const reps = Math.max(1, Math.ceil(64 / L))
    const tiled = Array.from({ length: reps }, () => seq).flat()
    const e = analyzeSequence(tiled).edgeError.slice(1)
    return dftMagnitude(e)
  }, [seq, L, showDft])

  return (
    <div className="panel">
      <div className="panel-title">{title ?? 'Divider Sequence Simulator'}</div>
      <div className="control-row">
        <label style={{ flex: '1 1 320px' }}>
          divide sequence（每個 output 週期的 instantaneous divide value，逗號或空白分隔）
          <input type="text" value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1, minWidth: 220, fontFamily: 'var(--mono)', padding: '0.3em 0.5em', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-elev)' }} />
        </label>
        <span className="btn-group">
          {presets.map((p) => (
            <button key={p.label} className={`btn btn-sm ${text === p.value ? 'active' : ''}`} onClick={() => setText(p.value)}>
              {p.label}
            </button>
          ))}
        </span>
      </div>
      {!L ? (
        <div className="small muted">請輸入至少一個正整數（例如 2, 3, 3, 3）。</div>
      ) : (
        <>
          <div className="kv" style={{ margin: '0.4em 0 0.8em' }}>
            <dt>序列長度 L / 總和</dt>
            <dd>
              {L} 個 output 週期，Σ N<sub>k</sub> = {a.edgeTimes[L]} T<sub>in</sub>
            </dd>
            <dt>平均除數 N<sub>avg</sub></dt>
            <dd>
              {a.edgeTimes[L]} / {L} = <b>{fmtNum(a.average, 4)}</b>
            </dd>
            <dt>pattern 週期 P</dt>
            <dd>
              {P} 個 output 週期 ⇒ fractional spur 在 f<sub>div</sub> / {P}（PLL 鎖定時 f<sub>div</sub> = f<sub>ref</sub>）
            </dd>
            <dt>edge error peak-to-peak</dt>
            <dd>
              {fmtNum(a.peakToPeak, 3)} T<sub>in</sub> = {fmtNum(a.peakToPeak * tinPs, 1)} ps（T<sub>in</sub> = {tinPs} ps）
            </dd>
            <dt>edge error RMS（去除平均）</dt>
            <dd>
              {fmtNum(rmsAc, 3)} T<sub>in</sub> = {fmtNum(rmsAc * tinPs, 1)} ps；平均（靜態 offset）= {fmtNum(errMean, 3)} T<sub>in</sub>
            </dd>
          </div>
          {showTable ? (
            <div className="scroll-x">
              <table className="state-table">
                <thead>
                  <tr>
                    <th>edge k</th>
                    <th>N<sub>k</sub></th>
                    <th>t<sub>k</sub>（T<sub>in</sub>）</th>
                    <th>k·N<sub>avg</sub></th>
                    <th>e<sub>k</sub> = t<sub>k</sub> − k·N<sub>avg</sub></th>
                    <th>e<sub>k</sub>（ps）</th>
                    <th>φ<sub>k</sub> = e<sub>k</sub>/N<sub>avg</sub>（output 週期）</th>
                    <th>φ<sub>k</sub>（rad）</th>
                  </tr>
                </thead>
                <tbody>
                  {a.edgeTimes.map((t, k) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td>{k === 0 ? '—' : seq[k - 1]}</td>
                      <td>{t}</td>
                      <td>{fmtNum(a.idealTimes[k], 3)}</td>
                      <td className={Math.abs(a.edgeError[k]) > 1e-9 ? 'changed' : ''}>{fmtNum(a.edgeError[k], 3)}</td>
                      <td>{fmtNum(a.edgeError[k] * tinPs, 1)}</td>
                      <td>{fmtNum(a.phaseErrorCycles[k], 3)}</td>
                      <td>{fmtNum(2 * Math.PI * a.phaseErrorCycles[k], 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {waveform ? (
            <ClockWaveform
              signals={waveform.traces}
              tEnd={waveform.tEnd}
              period={T}
              title="ideal（均勻 edge，間隔 N_avg）vs actual（序列 edge）"
              annotations={waveform.annotations}
              markers={waveform.markers}
              showEdgeTimes={['actual']}
              highlight={['actual']}
            />
          ) : null}
          {real && real.traces.length ? (
            <div style={{ marginTop: '0.6em' }}>
              <ClockWaveform
                signals={real.traces.filter((t) => ['clk', 'mod', 'q1', 'q0', 'div_out'].includes(t.name))}
                tEnd={(real.edgeTimes[real.edgeTimes.length - 1] + 1) * T}
                period={T}
                title="真實 /2 /3 cell（Lesson 3 的 dualMod23）依序列切 mod"
                showEdgeTimes={['div_out']}
                highlight={['div_out']}
              />
              <div className="small muted">
                量到的 output rising edge 間隔：<span className="mono">{real.intervals.join(', ')}</span>　⇐ 輸入序列：<span className="mono">{real.applied.join(', ')}</span>
                {real.intervals.every((v, i) => v === real.applied[i]) ? <span className="chip chip-ok" style={{ marginLeft: '0.6em' }}>divider 完全照序列跑</span> : null}。
                mod 在每個 output 週期開始（state 00）時設定，state 01 取樣。
              </div>
            </div>
          ) : showRealDivider && L ? (
            <div className="small muted">（序列含有 2、3 以外的值，/2 /3 cell 做不到；請用 Lesson 4 的 MMD。）</div>
          ) : null}
          {dft ? (
            <DftChart
              freq={dft.freq}
              mag={dft.mag}
              marks={[{ f: 1 / P, label: `1/P = f_div/${P}` }]}
              title={`edge error 的 DFT（pattern 重複 ${Math.max(1, Math.ceil(64 / L))} 次，${Math.max(1, Math.ceil(64 / L)) * L} 個週期）`}
              yLabel="|E(f)|（T_in）"
            />
          ) : null}
        </>
      )}
    </div>
  )
}
