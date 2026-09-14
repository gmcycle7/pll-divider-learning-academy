import { useMemo, useState, type ReactNode } from 'react'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { Callout, CompareTable } from '@/components/content'
import { DftChart } from '@/components/fractional/DividerSequenceSimulator'
import { analyzeSequence } from '@/models/fractional/sequence'
import { fmtNum } from '@/utils/format'
import { splitCode, type DtcConfig } from '@/models/phase/dtc'
import { carryEdgeTraces, carryTimeline, codeBits, divideValues, dsmStats, runMmdSequence, strictPeriod, type DsmStats } from './models'

const T = 100

/** 最大公因數（AccumulatorStepper 用來說明「真實週期 = m / gcd(k, m)」） */
function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b)
}

// ================================================================ Lesson 6-1：edge error 手算表
/**
 * 把 analyzeSequence() 的結果攤成一張「可以對照著手算」的表：
 *   t_k = Σ N_i、t*_k = k·N_avg、e_k = t_k − t*_k、φ_k = e_k / N_avg（output 週期）與 2π·φ_k（rad）
 */
export function EdgeErrorWorked({ seq = [2, 3, 3, 3, 2, 3, 3, 3], tinPs = 100 }: { seq?: number[]; tinPs?: number }) {
  const a = analyzeSequence(seq)
  return (
    <div className="scroll-x">
      <table className="state-table">
        <thead>
          <tr>
            <th>output edge k</th>
            <th>這個週期的 N<sub>k</sub></th>
            <th>t<sub>k</sub> = Σ N<sub>i</sub>（T<sub>in</sub>）</th>
            <th>t*<sub>k</sub> = k·N<sub>avg</sub>（T<sub>in</sub>）</th>
            <th>e<sub>k</sub> = t<sub>k</sub> − t*<sub>k</sub>（T<sub>in</sub>）</th>
            <th>e<sub>k</sub>（ps，T<sub>in</sub> = {tinPs} ps）</th>
            <th>φ<sub>k</sub> = e<sub>k</sub> / N<sub>avg</sub>（output 週期）</th>
            <th>2π·φ<sub>k</sub>（rad）</th>
          </tr>
        </thead>
        <tbody>
          {a.edgeTimes.map((t, k) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{k === 0 ? '—（reset edge）' : seq[k - 1]}</td>
              <td>{t}</td>
              <td>{fmtNum(a.idealTimes[k], 3)}</td>
              <td className={Math.abs(a.edgeError[k]) > 1e-9 ? 'changed' : ''}>{fmtNum(a.edgeError[k], 3)}</td>
              <td>{fmtNum(a.edgeError[k] * tinPs, 1)}</td>
              <td>{fmtNum(a.phaseErrorCycles[k], 4)}</td>
              <td>{fmtNum(2 * Math.PI * a.phaseErrorCycles[k], 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="small muted">
        N<sub>avg</sub> = {a.edgeTimes[seq.length]} / {seq.length} = {fmtNum(a.average, 4)}；peak-to-peak edge error = {fmtNum(a.peakToPeak, 3)} T<sub>in</sub> = {fmtNum(a.peakToPeak * tinPs, 1)} ps。
      </div>
    </div>
  )
}

// ================================================================ Lesson 6-2：DSM explorer
const KM_PRESETS: { label: string; k: number }[] = [
  { label: '16/64（= 1/4）', k: 16 },
  { label: '24/64（= 3/8）', k: 24 },
  { label: '21/64', k: 21 },
  { label: '10/64', k: 10 },
  { label: '1/64', k: 1 },
  { label: '33/64', k: 33 },
]

export interface DsmExplorerProps {
  initialK?: number
  m?: number
  initialOrder?: 1 | 2
  initialN?: number
  /** 統計用的序列長度（output 週期數） */
  length?: number
  /** 一階低通 corner（以 output rate 為單位），模擬 PLL 對 divider phase error 的濾波 */
  fc?: number
  title?: ReactNode
}

/** 選 k/m、order、dither → deltas 前 32 個、平均、p-p / RMS、DFT，並用 Lesson 4 的 MMD 跑出真實波形 */
export function DsmExplorer({ initialK = 21, m = 64, initialOrder = 1, initialN = 5, length = 512, fc = 1 / 32, title }: DsmExplorerProps) {
  const [k, setK] = useState(initialK)
  const [order, setOrder] = useState<1 | 2>(initialOrder)
  const [dither, setDither] = useState(false)
  const [N, setN] = useState(initialN)
  const kk = Math.max(0, Math.min(m - 1, Math.round(Number.isFinite(k) ? k : 0)))
  const s = useMemo(() => dsmStats(kk, m, order, dither, N, length, fc), [kk, m, order, dither, N, length, fc])
  const first = s.deltas.slice(0, 32)
  const sum32 = first.reduce((x, y) => x + y, 0)
  const lo = N + s.deltaMin
  const hi = N + s.deltaMax
  const inRange = lo >= 4 && hi <= 7
  const mmd = useMemo(() => (inRange ? runMmdSequence(divideValues(N, s.deltas.slice(0, 8))) : null), [inRange, N, s])
  const marks = s.period ? [{ f: 1 / s.period, label: `1/P = f_div/${s.period}` }] : [{ f: s.tone.freq, label: `最強 bin ${fmtNum(s.tone.freq, 3)} f_div` }]
  return (
    <div className="panel">
      <div className="panel-title">{title ?? 'DSM Explorer：k/m、order、dither → deltas、平均、p-p / RMS、DFT'}</div>
      <div className="control-row">
        <label>
          k（m = {m}）
          <input type="number" min={0} max={m - 1} value={k} onChange={(e) => setK(Number(e.target.value))} />
        </label>
        <span className="btn-group">
          {KM_PRESETS.map((p) => (
            <button key={p.k} className={`btn btn-sm ${kk === p.k ? 'active' : ''}`} onClick={() => setK(p.k)}>
              {p.label}
            </button>
          ))}
        </span>
        <label>
          order
          <select value={order} onChange={(e) => setOrder(Number(e.target.value) === 2 ? 2 : 1)}>
            <option value={1}>1（MASH-1：一個 accumulator）</option>
            <option value={2}>2（MASH-1-1：兩個 accumulator）</option>
          </select>
        </label>
        <label className={`input-toggle ${dither ? 'on' : ''}`}>
          <input type="checkbox" checked={dither} onChange={(e) => setDither(e.target.checked)} /> dither（輸入加 ±1 LSB）
        </label>
        <label>
          N（整數除數）
          <input type="number" min={1} max={16} value={N} onChange={(e) => setN(Math.max(1, Math.min(16, Math.round(Number(e.target.value) || 1))))} />
        </label>
      </div>
      <div className="kv" style={{ margin: '0.4em 0 0.6em' }}>
        <dt>目標分數 k/m</dt>
        <dd>
          {kk}/{m} = {fmtNum(kk / m, 5)}
        </dd>
        <dt>{length} 個週期的平均 delta</dt>
        <dd>
          <b>{fmtNum(s.average, 5)}</b>（誤差 {fmtNum(s.average - kk / m, 5)}）⇒ 平均除數 N<sub>avg</sub> = {fmtNum(N + s.average, 5)}
        </dd>
        <dt>瞬時除數範圍</dt>
        <dd>
          delta ∈ [{s.deltaMin}, {s.deltaMax}] ⇒ N<sub>k</sub> ∈ [{lo}, {hi}]{order === 2 ? '（MASH-1-1 需要 N−1 … N+2）' : '（MASH-1 只需要 N 與 N+1）'}
        </dd>
        <dt>delta pattern 週期</dt>
        <dd>{s.period ? `${s.period} 個週期 ⇒ tone 在 f_div/${s.period} 及其諧波` : `在 ${length} 個週期內找不到重複（dither 打散了 pattern）`}</dd>
        <dt>edge error peak-to-peak</dt>
        <dd>{fmtNum(s.peakToPeak, 3)} T<sub>in</sub></dd>
        <dt>edge error AC RMS（loop filter 前）</dt>
        <dd>{fmtNum(s.rmsAc, 3)} T<sub>in</sub></dd>
        <dt>一階低通（f<sub>c</sub> = f<sub>div</sub>/{Math.round(1 / fc)}）後的 RMS</dt>
        <dd>
          <b>{fmtNum(s.rmsFiltered, 4)}</b> T<sub>in</sub>（≈ PLL 輸出看到的 in-band 部分）
        </dd>
      </div>
      <div className="small muted" style={{ marginBottom: 4 }}>
        deltas 前 32 個（每個 output 週期加到 N 上的量）：
      </div>
      <div className="bit-field" style={{ flexWrap: 'wrap' }}>
        {first.map((d, i) => (
          <span key={i} className={d === 1 ? 'fine' : d === 2 ? 'coarse' : d < 0 ? 'carry' : ''}>
            <small>{i + 1}</small>
            <b>{d}</b>
          </span>
        ))}
      </div>
      <div className="small muted" style={{ margin: '0.3em 0 0.6em' }}>
        前 32 個的和 = {sum32} ⇒ 32 個週期的平均 = {fmtNum(sum32 / 32, 4)}；長期（{length} 個）平均 = {fmtNum(s.average, 4)}。DSM 保證的是<b>長期平均</b>，不是任何一段短視窗的平均。
      </div>
      <DftChart freq={s.dft.freq} mag={s.dft.mag} marks={marks} title={`edge error 的 DFT（${length} 個 output 週期，去除平均值）`} yLabel="|E(f)|（T_in）" />
      {mmd ? (
        <div style={{ marginTop: '0.6em' }}>
          <ClockWaveform
            signals={mmd.traces.filter((t) => t.name === 'clk' || t.name === 'div_out')}
            tEnd={(mmd.edgeTimes[mmd.edgeTimes.length - 1] + 1) * T}
            period={T}
            title={`真實 MMD（Lesson 4 的兩級 /2 /3 cell，N ∈ 4..7）依 deltas 前 8 個切 N：${divideValues(N, s.deltas.slice(0, 8)).join(', ')}`}
            showEdgeTimes={['div_out']}
            highlight={['div_out']}
          />
          <div className="small muted">
            量到的 output rising edge 間隔：<span className="mono">{mmd.intervals.join(', ')}</span>　⇐ 要求的 N<sub>k</sub>：<span className="mono">{mmd.applied.join(', ')}</span>
            {mmd.intervals.every((v, i) => v === mmd.applied[i]) ? <span className="chip chip-ok" style={{ marginLeft: '0.6em' }}>MMD 完全照序列跑</span> : null}
          </div>
        </div>
      ) : (
        <Callout kind="warning" title="超出 MMD 範圍">
          這組 deltas 要求 N<sub>k</sub> ∈ [{lo}, {hi}]，但 Lesson 4 的兩級 MMD 只能做 4 … 7。{order === 2 ? '二階 DSM 需要 N−1 … N+2 四個值：' : ''}把 N 調到 {Math.max(4 - s.deltaMin, 1)} … {7 - s.deltaMax} 之間，或換更寬的 MMD。
        </Callout>
      )}
    </div>
  )
}

// ================================================================ Lesson 6-2：1st / 2nd / dither 比較表
export interface DsmCompareTableProps {
  k: number
  m: number
  N?: number
  length?: number
  fc?: number
  caption?: ReactNode
}

/** 同一個 k/m 用四種設定跑：MASH-1、MASH-1 + dither、MASH-1-1、MASH-1-1 + dither；綠色 = 該欄最小值 */
export function DsmCompareTable({ k, m, N = 4, length = 2048, fc = 1 / 32, caption }: DsmCompareTableProps) {
  const rows = useMemo(() => {
    const cfgs: [1 | 2, boolean][] = [
      [1, false],
      [1, true],
      [2, false],
      [2, true],
    ]
    return cfgs.map(([o, d]) => dsmStats(k, m, o, d, N, length, fc))
  }, [k, m, N, length, fc])
  const best = (sel: (s: DsmStats) => number) => Math.min(...rows.map(sel))
  const cell = (v: number, isBest: boolean, digits = 3) => <span className={isBest ? 'value-1' : ''}>{fmtNum(v, digits)}</span>
  return (
    <div>
      <CompareTable
        head={['設定', '瞬時除數 N_k 範圍', 'delta pattern 週期', '最強 tone（f/f_div，|E|）', 'p-p（T_in）', 'AC RMS（T_in）', `低通後 RMS（f_c = f_div/${Math.round(1 / fc)}）`]}
        rows={rows.map((s) => [
          s.label,
          `${N + s.deltaMin} … ${N + s.deltaMax}`,
          s.period ? `${s.period}` : `> ${length}（找不到）`,
          `${fmtNum(s.tone.freq, 4)}（${fmtNum(s.tone.mag, 3)}）`,
          cell(s.peakToPeak, s.peakToPeak === best((x) => x.peakToPeak)),
          cell(s.rmsAc, s.rmsAc === best((x) => x.rmsAc)),
          cell(s.rmsFiltered, s.rmsFiltered === best((x) => x.rmsFiltered), 4),
        ])}
      />
      <div className="small muted">
        k/m = {k}/{m}，N = {N}，{length} 個 output 週期，dither = 輸入 ±1 LSB（seed 固定）。{caption}
      </div>
    </div>
  )
}

// ================================================================ Lesson 6-2 練習：手算 accumulator
/** 一階 accumulator（k/m）逐步揭示：先自己算，再按「下一步」對答案 */
export function AccumulatorStepper({ initialK = 1, initialM = 4, steps = 8 }: { initialK?: number; initialM?: number; steps?: number }) {
  const [k, setK] = useState(initialK)
  const [m, setM] = useState(initialM)
  const [n, setN] = useState(0)
  const rows = useMemo(() => {
    let acc = 0
    const out: { i: number; before: number; sum: number; carry: 0 | 1; after: number }[] = []
    for (let i = 1; i <= steps; i++) {
      const sum = acc + k
      const carry: 0 | 1 = sum >= m ? 1 : 0
      const after = sum - carry * m
      out.push({ i, before: acc, sum, carry, after })
      acc = after
    }
    return out
  }, [k, m, steps])
  const carries = rows.map((r) => String(r.carry))
  // 只採用「從第 1 個週期起就重複」的週期：findPeriod 會拿尾端的巧合當週期
  // （例如 k/m = 3/8 只看 8 步時會回報「週期 2」，真實週期是 8）。
  const p = strictPeriod(rows.map((r) => r.carry))
  const shown = rows.slice(0, n)
  const total = shown.reduce((x, r) => x + r.carry, 0)
  return (
    <div className="panel">
      <div className="panel-title">
        一階 accumulator 手算：acc ← acc + k，≥ m 就減 m 並輸出 carry = 1
      </div>
      <div className="control-row">
        <label>
          k
          <input type="number" min={0} max={m - 1} value={k} onChange={(e) => { setK(Math.max(0, Math.min(m - 1, Math.round(Number(e.target.value) || 0)))); setN(0) }} />
        </label>
        <label>
          m
          <input type="number" min={2} max={64} value={m} onChange={(e) => { const mm = Math.max(2, Math.min(64, Math.round(Number(e.target.value) || 2))); setM(mm); setK((x) => Math.min(x, mm - 1)); setN(0) }} />
        </label>
        <span className="btn-group">
          {[
            [1, 4],
            [3, 4],
            [3, 8],
            [5, 8],
          ].map(([kk, mm]) => (
            <button key={`${kk}/${mm}`} className={`btn btn-sm ${k === kk && m === mm ? 'active' : ''}`} onClick={() => { setK(kk); setM(mm); setN(0) }}>
              {kk}/{mm}
            </button>
          ))}
        </span>
      </div>
      <div className="stepper">
        <button className="btn btn-primary" onClick={() => setN((x) => Math.min(steps, x + 1))} disabled={n >= steps}>
          下一步（揭示第 {Math.min(steps, n + 1)} 個週期）▶
        </button>
        <button className="btn" onClick={() => setN(0)}>⟲ 重來</button>
        <button className="btn" onClick={() => setN(steps)}>全部揭示</button>
        <span className="status">{n} / {steps}</span>
      </div>
      <div className="scroll-x">
        <table className="state-table">
          <thead>
            <tr>
              <th>週期 n</th>
              <th>acc（加之前）</th>
              <th>acc + k</th>
              <th>≥ m？</th>
              <th>carry</th>
              <th>acc（加之後，殘值 = 量化誤差 × m）</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.i} className={r.i === n ? 'current' : ''}>
                <td>{r.i}</td>
                <td>{r.before}</td>
                <td>{r.sum}</td>
                <td>{r.carry ? `是（${r.sum} − ${m}）` : '否'}</td>
                <td className={r.carry ? 'changed' : ''}>{r.carry}</td>
                <td>{r.after}</td>
              </tr>
            ))}
            {!shown.length ? (
              <tr>
                <td colSpan={6} className="muted">先在紙上算 {steps} 個週期，再按「下一步」逐一對答案。</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {n >= steps ? (
        <div className="narration">
          carry 序列 = <span className="mono">{carries.join('')}</span>；{steps} 個週期裡 carry 出現 {total} 次 ⇒ 平均 {total}/{steps} = {fmtNum(total / steps, 4)}（目標 k/m = {fmtNum(k / m, 4)}）。
          {p ? <>　週期 = <b>{p}</b> 個 output 週期 ⇒ tone 在 f<sub>div</sub>/{p}。</> : <>　在 {steps} 個週期內還看不到「從第 1 個週期起就重複」的 pattern：一階 accumulator 的週期是 m / gcd(k, m) = {m / gcd(k, m)}，而要確認週期 P 至少得看 2P 步，把步數加大就會看到。</>}
        </div>
      ) : null}
    </div>
  )
}

// ================================================================ Lesson 6-3：carry 由誰吸收（edge timeline）
export interface CarryArchitectureTimelineProps {
  initialN?: number
  phases?: number
  initialStep?: number
  count?: number
  tvcoPs?: number
}

/**
 * 同一個 PMUX rotation（每週期 +step 個 phase）畫兩條 edge timeline：
 *   (a) coarse wrap 的 carry 加到 MMD 的 N（那個週期走 N+1）→ 間隔固定 N + step/M
 *   (b) PMUX 自己 wrap、divider 不變 → wrap 那個週期的間隔只剩 N − (M−step)/M，edge 時間不再單調地跟著理想格線
 */
export function CarryArchitectureTimeline({ initialN = 4, phases = 8, initialStep = 1, count = 12, tvcoPs = 100 }: CarryArchitectureTimelineProps) {
  const [N, setN] = useState(initialN)
  const [step, setStep] = useState(initialStep)
  const a = useMemo(() => carryTimeline(N, phases, step, count, 'divider'), [N, phases, step, count])
  const b = useMemo(() => carryTimeline(N, phases, step, count, 'none'), [N, phases, step, count])
  const ideal = N + step / phases
  const W = 760
  const H = 230
  const padL = 24
  const padR = 16
  const tMax = Math.max(a[a.length - 1].t, b[b.length - 1].t, (count - 1) * ideal) + 1
  const x = (t: number) => padL + (t / tMax) * (W - padL - padR)
  const lanes = [
    { y: 74, rows: a, label: `(a) carry 加到 MMD 的 N：wrap 那個週期走 N+1 ⇒ 每個間隔都是 ${fmtNum(ideal, 3)} Tvco`, color: 'var(--sig-output)' },
    { y: 170, rows: b, label: `(b) PMUX 自己 wrap、divider 不變 ⇒ wrap 後的間隔 = ${fmtNum(N - (phases - step) / phases, 3)} Tvco`, color: 'var(--sig-control)' },
  ]
  const ints: number[] = []
  for (let i = 0; i <= Math.floor(tMax); i++) ints.push(i)
  const interval = (rows: typeof a, k: number) => (k === 0 ? null : rows[k].t - rows[k - 1].t)
  const avgA = (a[count - 1].t - a[0].t) / (count - 1)
  const avgB = (b[count - 1].t - b[0].t) / (count - 1)
  const wrapIdx = a.findIndex((p) => p.carry > 0)
  const wraps = a.map((p, i) => (p.carry > 0 ? i : -1)).filter((i) => i >= 0).slice(0, 6)
  return (
    <div className="panel">
      <div className="panel-title">overflow carry 由誰吸收？兩種架構的 edge timeline（M = {phases} 相）</div>
      <div className="control-row">
        <label>
          N（整數除數）
          <input type="number" min={1} max={8} value={N} onChange={(e) => setN(Math.max(1, Math.min(8, Math.round(Number(e.target.value) || 1))))} />
        </label>
        <label>
          每週期前進 step（phase）
          <input type="number" min={1} max={phases - 1} value={step} onChange={(e) => setStep(Math.max(1, Math.min(phases - 1, Math.round(Number(e.target.value) || 1))))} />
        </label>
        <span className="small muted">
          理想平均除數 N + step/M = {fmtNum(ideal, 4)}；PMUX index <b>平均</b>每 {fmtNum(phases / step, 2)} 個週期 wrap 一次
          {phases % step === 0 ? '' : '（step 不整除 M ⇒ 間隔不固定）'}
          {wraps.length ? <>，前幾次 wrap 落在 k = {wraps.join(', ')}</> : null}
        </span>
      </div>
      <div className="wave" style={{ padding: '0.4em 0.6em' }}>
        <div className="wave-svg-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, display: 'block', fontFamily: 'var(--mono)' }} role="img" aria-label="carry architecture timeline">
            {ints.map((i) => (
              <g key={i}>
                <line x1={x(i)} x2={x(i)} y1={30} y2={H - 34} stroke="var(--sig-grid)" strokeWidth={i % N === 0 ? 1.2 : 0.6} />
                {ints.length <= 30 || i % N === 0 ? (
                  <text x={x(i)} y={H - 22} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--fg-muted)' }}>
                    {i}
                  </text>
                ) : null}
              </g>
            ))}
            <text x={W / 2} y={H - 8} textAnchor="middle" style={{ fontSize: 9.5, fill: 'var(--fg-muted)' }}>
              時間（Tvco；粗線 = 整數 divider 格線 k·N）　▲ 實際 output edge　│ 理想 edge k·(N + step/M)
            </text>
            {lanes.map((l) => (
              <g key={l.label}>
                <text x={padL} y={l.y - 30} style={{ fontSize: 10, fill: 'var(--fg)' }}>
                  {l.label}
                </text>
                <line x1={x(0)} x2={x(tMax)} y1={l.y} y2={l.y} stroke="var(--fg-muted)" />
                {l.rows.map((p) => (
                  <g key={p.k}>
                    <line x1={x(p.tIdeal)} x2={x(p.tIdeal)} y1={l.y + 4} y2={l.y + 18} stroke="var(--sig-phase)" strokeWidth={1.4} />
                    <path d={`M ${x(p.t)} ${l.y - 2} l -5 -10 l 10 0 z`} fill={l.color} />
                    <text x={x(p.t)} y={l.y - 15} textAnchor="middle" style={{ fontSize: 8.5, fill: 'var(--fg-muted)' }}>
                      k{p.k}
                    </text>
                    {p.carry > 0 ? (
                      <text x={x(p.t)} y={l.y + 30} textAnchor="middle" style={{ fontSize: 8.5, fill: 'var(--warn)' }}>
                        wrap
                      </text>
                    ) : null}
                  </g>
                ))}
              </g>
            ))}
          </svg>
        </div>
      </div>
      <div className="scroll-x">
        <table className="state-table">
          <thead>
            <tr>
              <th>k</th>
              <th>PMUX index</th>
              <th>(a) 整數 Tvco</th>
              <th>(a) edge t<sub>k</sub></th>
              <th>(a) 間隔</th>
              <th>(a) 誤差</th>
              <th>(b) 整數 Tvco</th>
              <th>(b) edge t<sub>k</sub></th>
              <th>(b) 間隔</th>
              <th>(b) 誤差 t − k·(N+step/M)</th>
            </tr>
          </thead>
          <tbody>
            {a.map((p, k) => (
              <tr key={k} className={p.carry > 0 ? 'changed' : ''}>
                <td>{k}</td>
                <td>{p.index}{p.carry > 0 ? '（→ wrap）' : ''}</td>
                <td>{p.integerCycles}</td>
                <td>{fmtNum(p.t, 3)}</td>
                <td>{interval(a, k) === null ? '—' : fmtNum(interval(a, k) as number, 3)}</td>
                <td>{fmtNum(p.error, 3)}</td>
                <td>{b[k].integerCycles}</td>
                <td>{fmtNum(b[k].t, 3)}</td>
                <td className={interval(b, k) !== null && Math.abs((interval(b, k) as number) - ideal) > 1e-9 ? 'changed' : ''}>{interval(b, k) === null ? '—' : fmtNum(interval(b, k) as number, 3)}</td>
                <td className={Math.abs(b[k].error) > 1e-9 ? 'changed' : ''}>{fmtNum(b[k].error, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="narration">
        <ol>
          <li>
            (a)：{count} 個 edge 的平均間隔 = {fmtNum(avgA, 4)} Tvco = 理想 {fmtNum(ideal, 4)}；誤差永遠 0。wrap（k = {wrapIdx >= 0 ? wrapIdx : '—'} → {wrapIdx >= 0 ? wrapIdx + 1 : '—'}）那個週期 divider 走 N + 1 = {N + 1} 個 Tvco，因為 index 從 {wrapIdx >= 0 ? a[wrapIdx].index : phases - 1} 回到 {wrapIdx >= 0 ? (a[wrapIdx + 1]?.index ?? 0) : 0}，少掉的 {fmtNum((phases - step) / phases, 3)} Tvco 要由整數部分補回來。
          </li>
          <li>
            (b)：wrap 之後 edge 落在 {wrapIdx >= 0 ? fmtNum(b[wrapIdx + 1]?.t ?? 0, 3) : '—'} 而不是 {wrapIdx >= 0 ? fmtNum(a[wrapIdx + 1]?.t ?? 0, 3) : '—'}：間隔只剩 {fmtNum(N - (phases - step) / phases, 3)} Tvco，誤差跳到 {wrapIdx >= 0 ? fmtNum(b[wrapIdx + 1]?.error ?? 0, 3) : '—'} Tvco 並且每次 wrap 再多 −1。{count} 個 edge 的平均間隔 = {fmtNum(avgB, 4)}，長期趨近 N = {N}：這個電路<b>不是</b> /{fmtNum(ideal, 3)}。
          </li>
          <li>
            {N === 1 ? (
              <b className="value-x">N = 1 時 (b) 的 wrap 間隔只有 {fmtNum(1 / phases, 3)} Tvco = {fmtNum((tvcoPs / phases) * 1, 1)} ps：等於要求 divider 在上一個 edge 之後 1/{phases} Tvco 就再輸出一個 edge——這就是 Lesson 5-2 的 runt / double edge。</b>
            ) : (
              <>把 N 調到 1 看看 (b) 的 wrap 間隔會變成多少（提示：{fmtNum(1 / phases, 3)} Tvco = {fmtNum(tvcoPs / phases, 1)} ps）。</>
            )}
          </li>
        </ol>
      </div>
    </div>
  )
}

// ================================================================ Lesson 6-3：DTC range 只需要涵蓋一個 PMUX step
/** 同樣 9-bit 的 phase control word，用不同 coarse/fine 切法：LSB 不變，但 DTC 要涵蓋的範圍差很多 */
export function DtcRangeCompare({ tvcoPs = 100, totalBits = 9, marginPct = 25 }: { tvcoPs?: number; totalBits?: number; marginPct?: number }) {
  const cfgs = [0, 2, 3, 4].map((c) => ({ c, f: totalBits - c }))
  const lsb = tvcoPs / (1 << totalBits)
  const rows = cfgs.map(({ c, f }) => {
    const phases = 1 << c
    const stepPs = tvcoPs / phases
    const codes = 1 << f
    const need = stepPs * (1 + marginPct / 100)
    return [
      c === 0 ? `沒有 PMUX（0 + ${totalBits}）` : `${c} + ${f}`,
      `${phases}`,
      c === 0 ? '—' : `${fmtNum(stepPs, 3)} ps`,
      `${codes}`,
      `${fmtNum(lsb, 4)} ps`,
      <span key="bar" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4em' }}>
        <span style={{ display: 'inline-block', width: Math.max(4, (stepPs / tvcoPs) * 180), height: 10, background: 'var(--sig-output)', borderRadius: 3 }} />
        {fmtNum(stepPs, 3)} ps
      </span>,
      `${fmtNum(need, 2)} ps（${Math.ceil(need / lsb)} 個 code）`,
    ]
  })
  return (
    <div>
      <CompareTable head={['coarse + fine bits', 'PMUX 相數', 'PMUX step', 'DTC codes / step', 'DTC LSB', 'DTC 至少要涵蓋（1 個 PMUX step）', `含 ${marginPct}% margin`]} rows={rows} />
      <div className="small muted">
        T<sub>vco</sub> = {tvcoPs} ps，總共 {totalBits} bit ⇒ LSB = T<sub>vco</sub>/2<sup>{totalBits}</sup> = {fmtNum(lsb, 4)} ps 與切法無關；改變的是 DTC 的 full-scale range。range 越小，DTC 的 INL、雜訊與功耗越容易做好。
      </div>
    </div>
  )
}

// ================================================================ Lesson 6-3：phase control word 拆解（splitCode 互動版）
export interface ControlWordSplitterProps {
  cfg?: DtcConfig
  initialCode?: number
  tvcoPs?: number
  /** 允許輸入超過 2^bits − 1 的 code（看 overflow） */
  allowOverflow?: boolean
}

/**
 * 輸入一個 total code（例如 300），看它被切成 overflow / coarse（PMUX）/ fine（DTC）三段，
 * 以及對應的 edge 位置（Tvco 與 ps）。全部由 splitCode() 算出。
 */
export function ControlWordSplitter({ cfg = { coarseBits: 3, fineBits: 6 }, initialCode = 300, tvcoPs = 100, allowOverflow = true }: ControlWordSplitterProps) {
  const [code, setCode] = useState(initialCode)
  const fineMod = 1 << cfg.fineBits
  const coarseMod = 1 << cfg.coarseBits
  const full = fineMod * coarseMod
  const max = allowOverflow ? 4 * full - 1 : full - 1
  const c = Math.max(0, Math.min(max, Math.round(Number.isFinite(code) ? code : 0)))
  const sp = splitCode(c, cfg)
  const bits = codeBits(sp.coarse, sp.fine, cfg)
  const lsbPs = (tvcoPs / full)
  const coarsePs = tvcoPs / coarseMod
  return (
    <div className="panel">
      <div className="panel-title">
        {cfg.coarseBits}-bit PMUX + {cfg.fineBits}-bit DTC：把 total code 拆成 coarse / fine
      </div>
      <div className="control-row">
        <label>
          total code（0 … {max}）
          <input type="number" min={0} max={max} value={code} onChange={(e) => setCode(Number(e.target.value))} />
        </label>
        <span className="btn-group">
          {[63, 64, 100, 300, 511, 512, 600].filter((v) => v <= max).map((v) => (
            <button key={v} className={`btn btn-sm ${c === v ? 'active' : ''}`} onClick={() => setCode(v)}>
              {v}
            </button>
          ))}
        </span>
      </div>
      <div className="narration">
        <ol>
          <li>
            先問：{c} 超過 {full} − 1 = {full - 1} 嗎？{sp.overflow > 0 ? <>超過：{c} = <b>{sp.overflow}</b> × {full} + {c - sp.overflow * full} ⇒ overflow（wrap 次數）= <b>{sp.overflow}</b>，留下 {c - sp.overflow * full} 給 {cfg.coarseBits + cfg.fineBits}-bit word。</> : <>沒有 ⇒ overflow = 0，整個 code 都放得進 {cfg.coarseBits + cfg.fineBits}-bit word。</>}
          </li>
          <li>
            再問：{c - sp.overflow * full} 裡面有幾個 {fineMod}（一個 PMUX step = {fineMod} 個 DTC code）？{c - sp.overflow * full} = <b>{sp.coarse}</b> × {fineMod} + <b>{sp.fine}</b> ⇒ PMUX code（coarse）= <b>{sp.coarse}</b>，DTC code（fine）= <b>{sp.fine}</b>。
          </li>
          <li>
            edge 位置（不含整數週期）= {sp.coarse}/{coarseMod} + {sp.fine}/{full} = {fmtNum(sp.coarse / coarseMod, 4)} + {fmtNum(sp.fine / full, 4)} = <b>{fmtNum(sp.phaseT, 5)} T<sub>vco</sub></b> = {fmtNum(sp.coarse * coarsePs, 3)} ps + {fmtNum(sp.fine * lsbPs, 3)} ps = <b>{fmtNum(sp.phaseT * tvcoPs, 3)} ps</b>（T<sub>vco</sub> = {tvcoPs} ps）。
          </li>
        </ol>
      </div>
      <div className="control-row" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="small muted">{cfg.coarseBits + cfg.fineBits}-bit word = {sp.coarse * fineMod + sp.fine}（二進位 {(sp.coarse * fineMod + sp.fine).toString(2).padStart(cfg.coarseBits + cfg.fineBits, '0')}）</div>
          <div className="bit-field">
            {bits.map((b, i) => (
              <span key={i} className={b.role}>
                <small>2^{b.weight}</small>
                <b>{b.bit}</b>
              </span>
            ))}
          </div>
          <div className="small muted" style={{ marginTop: 2 }}>
            <span style={{ color: 'var(--sig-phase)' }}>■ coarse（PMUX，step {fmtNum(coarsePs, 3)} ps）</span>　<span style={{ color: 'var(--sig-output)' }}>■ fine（DTC，LSB {fmtNum(lsbPs, 4)} ps）</span>
          </div>
        </div>
        <div className="bit-field">
          <span className={sp.overflow ? 'carry' : ''}><small>overflow</small><b>{sp.overflow}</b></span>
          <span className="coarse"><small>PMUX</small><b>{sp.coarse}</b></span>
          <span className="fine"><small>DTC</small><b>{sp.fine}</b></span>
        </div>
      </div>
    </div>
  )
}

// ================================================================ Lesson 6-3：(a) / (b) 兩種架構的真實波形（由 event 產生）
export interface CarryArchitectureWaveformProps {
  initialN?: number
  phases?: number
  initialStep?: number
  count?: number
  tvcoPs?: number
  /** 下游 flop 的最小脈波寬度（ps），用來判斷 runt */
  minPulsePs?: number
}

/**
 * 同一組 PMUX rotation 用 ClockWaveform 畫出 (a) 與 (b) 的 div_out：
 * 所有 edge 都由 carryEdgeTraces()（→ carryTimeline()）的 event 產生；理想 edge 用 marker 標出。
 * 看的重點：(a) 的 rising edge 永遠落在 marker 上；(b) 每 wrap 一次就往前跳一個 Tvco，N = 1 時甚至畫出 runt。
 */
export function CarryArchitectureWaveform({ initialN = 2, phases = 8, initialStep = 3, count = 8, tvcoPs = 100, minPulsePs = 40 }: CarryArchitectureWaveformProps) {
  const [N, setN] = useState(initialN)
  const [step, setStep] = useState(initialStep)
  const a = useMemo(() => carryEdgeTraces(N, phases, step, count, 'divider', tvcoPs), [N, phases, step, count, tvcoPs])
  const b = useMemo(() => carryEdgeTraces(N, phases, step, count, 'none', tvcoPs), [N, phases, step, count, tvcoPs])
  const tEnd = Math.max(a.tEndPs, b.tEndPs)
  const ideal = N + step / phases
  const markers = a.idealTimesPs.map((t, k) => ({ t, label: `ideal ${k}`, kind: 'edge' as const, signal: 'div_out' }))
  const wraps = carryTimeline(N, phases, step, count, 'none')
    .map((p, k) => ({ p, k }))
    .filter(({ p }) => p.carry > 0)
  const bRunt = b.minPulsePs < minPulsePs
  return (
    <div className="panel">
      <div className="panel-title">兩種架構的真實 div_out 波形（M = {phases} 相，理想除數 N + step/M = {fmtNum(ideal, 4)}）</div>
      <div className="control-row">
        <label>
          N（整數除數）
          <input type="number" min={1} max={6} value={N} onChange={(e) => setN(Math.max(1, Math.min(6, Math.round(Number(e.target.value) || 1))))} />
        </label>
        <label>
          每週期前進 step（phase）
          <input type="number" min={1} max={phases - 1} value={step} onChange={(e) => setStep(Math.max(1, Math.min(phases - 1, Math.round(Number(e.target.value) || 1))))} />
        </label>
        <span className="small muted">wrap 發生在 k = {wraps.map(({ k }) => `${k}→${k + 1}`).join(', ') || '（視窗內沒有）'}</span>
      </div>
      <ClockWaveform
        signals={a.traces}
        tEnd={tEnd}
        period={tvcoPs}
        markers={markers}
        title={`(a) coarse wrap 的 carry 加到 MMD：wrap 那個週期走 N+1 ⇒ 間隔固定 ${fmtNum(ideal, 3)} Tvco（rising edge 全部落在 ideal marker 上）`}
        showEdgeTimes={['div_out']}
        highlight={['div_out']}
      />
      <ClockWaveform
        signals={b.traces}
        tEnd={tEnd}
        period={tvcoPs}
        markers={markers}
        title={`(b) PMUX 自己 wrap、divider 每週期都走 N：wrap 後的間隔只剩 ${fmtNum(N - (phases - step) / phases, 3)} Tvco，edge 比 ideal marker 早一個 Tvco`}
        showEdgeTimes={['div_out']}
        showPulseWidths={bRunt ? ['div_out'] : false}
        highlight={['div_out']}
      />
      <div className="narration">
        <ol>
          <li>
            (a) 的 rising edge 間隔：<span className="mono">{a.intervals.map((v) => fmtNum(v, 3)).join(', ')}</span> T<sub>vco</sub>——每一個都等於 {fmtNum(ideal, 3)}。edge 相對整數格線 k·N 的偏移 0, {fmtNum(step / phases, 3)}, {fmtNum((2 * step) / phases, 3)} … 單調遞增，跨過 1 T<sub>vco</sub> 時就由 divider 多走一個週期吸收。
          </li>
          <li>
            (b) 的 rising edge 間隔：<span className="mono">{b.intervals.map((v) => fmtNum(v, 3)).join(', ')}</span> T<sub>vco</sub>——wrap 那一步變成 {fmtNum(N - (phases - step) / phases, 3)}。edge 相對格線的偏移走到 {fmtNum(((phases - 1) / phases), 3)} 之後<b>跳回</b> 0：不單調，每 wrap 一次就比理想早一個 T<sub>vco</sub>。長期平均除數變成 N = {N}，不是 {fmtNum(ideal, 3)}。
          </li>
          <li>
            {bRunt ? (
              <b className="value-x">(b) 最窄的 high pulse 只有 {fmtNum(b.minPulsePs, 1)} ps &lt; t<sub>pw,min</sub> = {minPulsePs} ps：這是 runt（pulse-width violation），不是 setup 問題。</b>
            ) : (
              <>(b) 最窄的 high pulse = {fmtNum(b.minPulsePs, 1)} ps，還沒有撞到 t<sub>pw,min</sub> = {minPulsePs} ps；把 N 調到 1 再看。</>
            )}
          </li>
        </ol>
      </div>
    </div>
  )
}
