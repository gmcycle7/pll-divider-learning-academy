import { useMemo, useState } from 'react'
import { ClockWaveform, type WaveAnnotation, type WaveMarker, type WaveShade } from '@/components/waveform/ClockWaveform'
import type { Netlist } from '@/models/divider/types'
import { simulate } from '@/models/divider/engine'
import { measureDivide } from '@/models/divider/analysis'
import { dualMod12, dualMod12Glitchy, dualMod23 } from '@/models/divider/examples'
import { fmtNum, fmtT } from '@/utils/format'
import {
  MIN_PULSE,
  SCAN_CAPTURE_EDGE,
  T,
  T_AND,
  T_AND_MIN,
  T_HOLD,
  T_SETUP,
  div12Timeline,
  gatingRun,
  isLegal23,
  modTimingScan,
  runModSwitchCompare,
  type SwitchRun,
} from './models'

// ---------------------------------------------------------------- 小工具
function IntervalChips({ intervals, legal }: { intervals: number[]; legal: (iv: number) => boolean }) {
  if (!intervals.length) return <span className="muted small">（尚未有兩個以上 rising edge）</span>
  return (
    <span style={{ display: 'inline-flex', gap: '0.35em', flexWrap: 'wrap' }}>
      {intervals.map((iv, i) => (
        <span key={i} className={`chip ${legal(iv) ? 'chip-ok' : 'chip-danger'}`}>
          {fmtNum(iv)}T
        </span>
      ))}
    </span>
  )
}

function runtShades(run: SwitchRun, signal: string): WaveShade[] {
  return run.runts.map((r) => ({ t0: r.t0, t1: r.t1, kind: 'danger', signal, label: `${fmtNum(r.width)} ps` }))
}

// ---------------------------------------------------------------- Lesson 3-1：A vs B 同一個切換序列
export interface ModSwitchCompareProps {
  initialK?: number
  initialTau?: number
  initialMode?: 'ideal' | 'real'
  initialDir?: '0to1' | '1to0'
  title?: string
}

/**
 * 同一個 mod 切換序列同時餵給 A（state-continuous）與 B（MUX 選輸出）。
 * 使用者可選：在第幾個 edge 切換、切換時間相對 edge 的提前量、切換方向、delay 模式。
 */
export function ModSwitchCompare({ initialK = 6, initialTau = 35, initialMode = 'real', initialDir = '0to1', title }: ModSwitchCompareProps) {
  const [k, setK] = useState(initialK)
  const [tau, setTau] = useState(initialTau)
  const [dir, setDir] = useState<'0to1' | '1to0'>(initialDir)
  const [mode, setMode] = useState<'ideal' | 'real'>(initialMode)
  const edges = 12
  const res = useMemo(() => runModSwitchCompare({ k, tau, dir, mode, edges }), [k, tau, dir, mode])
  const markers: WaveMarker[] = [{ t: res.tSwitch, label: `mod ${dir === '0to1' ? '0→1' : '1→0'}`, kind: 'input' }]
  const edgeLabels = Array.from({ length: edges }, (_, i) => ({ t: (i + 1) * T, label: `${i + 1}` }))
  const badB = res.b.intervals.filter((iv) => !isLegal23(iv))
  return (
    <div className="panel">
      <div className="panel-title">{title ?? '同一個 mod 切換，A 與 B 的輸出'}</div>
      <div className="control-row">
        <label>
          在第 <b>{k}</b> 個 edge 前切換
          <input type="range" min={2} max={9} step={1} value={k} onChange={(e) => setK(Number(e.target.value))} />
        </label>
        <label>
          提前量 τ = <b>{tau}</b> ps（edge 之前）
          <input type="range" min={2} max={95} step={1} value={tau} onChange={(e) => setTau(Number(e.target.value))} style={{ width: 200 }} />
        </label>
        <label>
          方向
          <span className="btn-group">
            <button className={`btn btn-sm ${dir === '0to1' ? 'active' : ''}`} onClick={() => setDir('0to1')}>
              /2 → /3
            </button>
            <button className={`btn btn-sm ${dir === '1to0' ? 'active' : ''}`} onClick={() => setDir('1to0')}>
              /3 → /2
            </button>
          </span>
        </label>
        <label>
          Delay 模式
          <select value={mode} onChange={(e) => setMode(e.target.value as 'ideal' | 'real')}>
            <option value="ideal">理想（zero delay）</option>
            <option value="real">實際（tCQ / gate delay）</option>
          </select>
        </label>
      </div>
      <div className="two-col">
        <div>
          <ClockWaveform
            title="A：state-continuous /2 /3 cell"
            signals={res.a.traces}
            tEnd={res.tEnd}
            period={T}
            pxPerPeriod={40}
            rowHeight={28}
            markers={markers}
            edgeLabels={edgeLabels}
            highlight={['div_out']}
            zoomable={false}
            showValuesAtCursor={false}
          />
          <div className="small" style={{ marginTop: '0.4em' }}>
            output rising edge 間隔：<IntervalChips intervals={res.a.intervals} legal={isLegal23} />
          </div>
          <div className="small muted">runt（&lt; {MIN_PULSE} ps）：{res.a.runts.length} 個</div>
        </div>
        <div>
          <ClockWaveform
            title="B：獨立 /2、/3 再用 MUX 選"
            signals={res.b.traces}
            tEnd={res.tEnd}
            period={T}
            pxPerPeriod={40}
            rowHeight={28}
            markers={markers}
            edgeLabels={edgeLabels}
            shades={runtShades(res.b, 'div_out')}
            highlight={['div_out']}
            zoomable={false}
            showValuesAtCursor={false}
          />
          <div className="small" style={{ marginTop: '0.4em' }}>
            output rising edge 間隔：<IntervalChips intervals={res.b.intervals} legal={isLegal23} />
          </div>
          <div className="small muted">
            runt（&lt; {MIN_PULSE} ps）：{res.b.runts.length} 個
            {res.b.runts.length ? <>　寬度 {res.b.runts.map((r) => `${fmtNum(r.width)} ps`).join('、')}</> : null}
          </div>
        </div>
      </div>
      <div className={`callout ${badB.length || res.b.runts.length ? 'callout-pitfall' : 'callout-note'}`}>
        <div className="callout-title">這次切換的結果</div>
        A 的每個 interval 都是 2T 或 3T——切換只是決定「從目前這個 output edge 起算，下一個 edge 在 2T 還是 3T 之後」。
        {mode === 'real' && tau < T_AND ? (
          <>
            　τ = {tau} ps <b>小於 tAND = {T_AND} ps</b>：mod 改變之後 d1 = q0·mod 還要再過一個 AND 才到 FF1.D，到達時間已經在這個 clock edge 之後，連只算 gate delay 的模擬器都抓不到——切換要等<b>下一次進入 state 01</b> 才生效。但 interval 仍然只有 2T / 3T。
          </>
        ) : null}
        {mode === 'real' && tau >= T_AND && tau < T_SETUP + T_AND ? (
          <>
            　τ = {tau} ps：d1 在 edge 前 {tau - T_AND} ps 才到達 FF1.D。engine 只模擬 gate delay、<b>不模擬 setup</b>，所以這個 edge 抓到了 mod，chip 立刻反映新的除數；但 {tau - T_AND} ps <b>小於 tsetup = {T_SETUP} ps</b>，真實電路已經落在 setup window 裡（Lesson 3-2 的禁區），結果可能是 0、1 或 metastable。要真正安全，τ 必須 ≥ tsetup + tAND = {T_SETUP + T_AND} ps。無論哪一種，interval 仍然只有 2T / 3T。
          </>
        ) : null}
        {badB.length ? (
          <>
            　B 出現了 {badB.map((x) => `${fmtNum(x)}T`).join('、')} 這種 interval：不是 2T 也不是 3T。這就是 phase jump（例如 2.55T）、extra edge（1T 附近）或 missing edge（4T 附近）。
          </>
        ) : (
          <>　這一組參數下 B 的 interval 剛好都合法——換一個 k 或 τ 再試。</>
        )}
        {res.b.runts.length ? <>　而且 B 的 div_out 出現 {res.b.runts.length} 個比 {MIN_PULSE} ps 窄的 runt pulse（紅色區域）。</> : null}
      </div>
      <div className="small muted">
        怎麼讀 interval chip：<b>2T / 3T</b> = 合法；<b>1T</b> = 多出一個 edge（extra edge）；<b>1.xxT、2.xxT</b> = 不是整數個 T 的 phase jump；紅色區域 = 比 {MIN_PULSE} ps 窄的 runt。
        建議依序試（括號內是 ideal / real 兩種 delay 模式的值）：k = 6（extra edge：1T / 1.12T）→ k = 7（phase jump：1.65T + 2.35T / 1.57T + 2.55T）→ k = 6、τ = 5（runt：5 ps / 25 ps）→ 實際 delay、k = 4（切得再乾淨也有 0.12T 的 latency 落差）→ 方向 /3 → /2、k = 2（切換時 out2 已經是 1：edge 憑空出現，1.35T / 1.43T）。
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Lesson 3-1：共同起點的 edge timeline
/** 用 A 架構跑一段 mod 序列，在每個 output rising edge 標出「起點」與到下一個 edge 的距離 */
export function CommonOriginFigure() {
  const data = useMemo(() => {
    const edges = 14
    const { sim, traces } = simulate(dualMod23, edges, { period: T }, (e) => ({ mod: e >= 4 && e < 10 ? 1 : 0 }))
    const out = traces.find((t) => t.name === 'div_out')!
    const m = measureDivide(out, T, 0)
    const ann: WaveAnnotation[] = []
    m.risingTimes.forEach((t, i) => {
      const iv = m.intervals[i]
      ann.push({ t, signal: 'div_out', text: iv !== undefined ? `起點 → ${fmtNum(iv)}T` : '起點', dy: -4 })
    })
    const mod = traces.find((t) => t.name === 'mod')!
    const markers: WaveMarker[] = mod.events.filter((e) => e.t > 0).map((e) => ({ t: e.t, label: `mod → ${e.v}`, kind: 'input', signal: 'mod' }))
    return { traces: sim.getTraces(['clk', 'mod', 'div_out']), tEnd: edges * T, ann, markers, intervals: m.intervals }
  }, [])
  return (
    <div className="panel">
      <div className="panel-title">每個 output edge 都是下一個 interval 的共同起點</div>
      <ClockWaveform signals={data.traces} tEnd={data.tEnd} period={T} pxPerPeriod={56} annotations={data.ann} markers={data.markers} highlight={['div_out']} zoomable={false} showEdgeTimes={['div_out']} />
      <div className="small muted">
        mod 在 edge 4 之前變成 1、在 edge 10 之前變回 0。interval 序列：{data.intervals.map((x) => `${fmtNum(x)}T`).join(' → ')}。注意每一段都從上一個 output rising edge 起算，沒有任何一段被切斷或重疊。
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Lesson 3-2：MOD 切換時間掃描
/**
 * 固定在 state 01 的那個 cycle（edge 3 → edge 4），拖曳 mod 0→1 的切換時間 τ（相對 edge 4）。
 * real delay：tCQ 8、AND 10、tsetup 7、thold 3、T = 100 ps。
 */
export function ModTimingScan() {
  const [tau, setTau] = useState(-40)
  const res = useMemo(() => modTimingScan(tau), [tau])
  const tStart = 250
  const tEnd = 750
  const cap = res.tCapture
  const shades: WaveShade[] = [
    { t0: tStart + 60, t1: res.tDeadline, kind: 'safe', signal: 'mod', label: '安全：這個 cycle 就變 /3' },
    { t0: res.tDeadline, t1: res.tHoldEdge, kind: 'danger', signal: 'mod', label: 'setup / hold window' },
    { t0: res.tHoldEdge, t1: cap + 50, kind: 'info', signal: 'mod', label: '太晚：下一個 interval 才 /3' },
  ]
  const markers: WaveMarker[] = [
    { t: cap, label: `capture edge #${SCAN_CAPTURE_EDGE}`, kind: 'edge' },
    { t: res.tSwitch, label: `mod 切換 τ = ${tau} ps`, kind: 'input', signal: 'mod' },
    { t: res.tD1, label: 'd1 到達', kind: 'cursor', signal: 'd1' },
  ]
  const edgeLabels = Array.from({ length: 5 }, (_, i) => ({ t: (i + 3) * T, label: `${i + 3}` }))
  return (
    <div className="panel">
      <div className="panel-title">MOD 切換時間掃描：state 01 的那個 cycle</div>
      <div className="control-row">
        <label>
          mod 切換時間 τ = <b>{tau}</b> ps（相對 edge 4；負值 = 之前）
          <input type="range" min={-90} max={30} step={1} value={tau} onChange={(e) => setTau(Number(e.target.value))} style={{ width: 260 }} />
        </label>
        <span className="small muted">
          T = {T} ps　tCQ = 8　tAND = {T_AND_MIN}–{T_AND}　tsetup = {T_SETUP}　thold = {T_HOLD}
        </span>
      </div>
      <ClockWaveform
        signals={res.traces}
        tStart={tStart}
        tEnd={tEnd}
        period={T}
        pxPerPeriod={150}
        markers={markers}
        shades={shades}
        edgeLabels={edgeLabels}
        highlight={['div_out']}
        xSignals={res.kind === 'violation' ? ['q1', 'div_out'] : []}
        zoomable={false}
        showEdgeTimes={['div_out']}
      />
      <div className="small" style={{ marginTop: '0.4em' }}>
        mod 在 t = {res.tSwitch} ps 改變 → d1 = q0 AND mod 在 t = {res.tSwitch} + {T_AND} = <b>{res.tD1}</b> ps 到達 FF1.D。deadline = {cap} − {T_SETUP} − {T_AND} = <b>{res.tDeadline}</b> ps；hold 邊界 = {cap} + {T_HOLD} − {T_AND_MIN} = <b>{res.tHoldEdge}</b> ps。output rising edge 間隔：<IntervalChips intervals={res.intervals} legal={isLegal23} />
      </div>
      <div className={`callout ${res.kind === 'violation' ? 'callout-pitfall' : res.kind === 'early' ? 'callout-method' : 'callout-warning'}`}>
        {res.kind === 'early' ? (
          <>
            <div className="callout-title">趕上了：edge 4 抓到 d1 = 1，state 01 → 10</div>
            d1 在 edge 4 之前 {cap - res.tD1} ps 就穩定，≥ tsetup = {T_SETUP} ps。這個 cycle 立刻變成 /3：從 t = 220 ps 的 output edge 起算，下一個 edge 在 3T 之後（520 ps）。
            {cap - res.tD1 - T_SETUP < 5 ? <b>　注意：剩下的 margin 只有 {cap - res.tD1 - T_SETUP} ps，jitter 一大就會掉進 setup window。</b> : null}
          </>
        ) : res.kind === 'late' ? (
          <>
            <div className="callout-title">太晚：edge 4 抓到舊的 d1 = 0，這個 cycle 仍然是 /2</div>
            d1 在 edge 4 之後 {res.tD1 - cap} ps 才到（超過 thold，所以不是 hold violation，只是「沒趕上這班車」）。state 01 → 00，output 在 420 ps 又升起（2T）；mod 已經是 1，所以下一次進入 01（edge 5 → 6）才變 /3：interval 序列變成 2T、3T。少了一個 3T interval——這在 fractional divider 裡就是一次除數錯誤。
          </>
        ) : (
          <>
            <div className="callout-title">Setup / hold violation：d1 在 edge 4 附近 {fmtNum(Math.abs(res.tD1 - cap))} ps 內改變</div>
            FF1 可能抓到 0、抓到 1、或 metastable（q1 以虛線表示不確定）。若 q1 停在中間電位，NOR 下一個 cycle 算出的 d0 也不確定，整個 divider 的 state 可能跑進 11 或卡住。這是 control path 的 setup/hold 問題，與 Q → D 的 feedback path 一樣要被檢查。
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Lesson 3-3：/1 /2 的 edge timeline
export interface Div12EdgeTimelineProps {
  netlist?: Netlist
  title?: string
}

/** input edge 1..N 逐一標示：這個 edge 的 high pulse 有沒有被放行；切換後哪個 edge 先變 */
export function Div12EdgeTimeline({ netlist = dualMod12, title }: Div12EdgeTimelineProps) {
  const [k, setK] = useState(4)
  const [dir, setDir] = useState<'0to1' | '1to0'>('0to1')
  const edges = 10
  const res = useMemo(() => div12Timeline(netlist, { k, dir, edges }), [netlist, k, dir])
  const W = 720
  const x0 = 60
  const dx = (W - x0 - 20) / (edges - 1)
  const xOf = (n: number) => x0 + (n - 1) * dx
  const markers: WaveMarker[] = [{ t: res.tSwitch, label: `sel ${dir === '0to1' ? '0→1' : '1→0'}`, kind: 'input' }]
  const edgeLabels = Array.from({ length: edges }, (_, i) => ({ t: (i + 1) * T, label: `${i + 1}` }))
  return (
    <div className="panel">
      <div className="panel-title">{title ?? 'Edge scheduling：哪些 input edge 變成 output pulse'}</div>
      <div className="control-row">
        <label>
          sel 在第 <b>{k}</b> 個 edge 前切換
          <input type="range" min={2} max={8} step={1} value={k} onChange={(e) => setK(Number(e.target.value))} />
        </label>
        <label>
          方向
          <span className="btn-group">
            <button className={`btn btn-sm ${dir === '0to1' ? 'active' : ''}`} onClick={() => setDir('0to1')}>
              /1 → /2
            </button>
            <button className={`btn btn-sm ${dir === '1to0' ? 'active' : ''}`} onClick={() => setDir('1to0')}>
              /2 → /1
            </button>
          </span>
        </label>
      </div>
      <div className="scroll-x">
        <svg viewBox={`0 0 ${W} 130`} width={W} role="img" aria-label="edge timeline">
          <text x={4} y={30} style={{ fill: 'var(--fg-muted)', fontSize: 11 }}>
            input edge
          </text>
          <text x={4} y={92} style={{ fill: 'var(--fg-muted)', fontSize: 11 }}>
            output
          </text>
          <line x1={x0 - 10} x2={W - 10} y1={40} y2={40} stroke="var(--fg-muted)" />
          {res.edges.map((e) => (
            <g key={e.edge}>
              <line x1={xOf(e.edge)} x2={xOf(e.edge)} y1={26} y2={40} stroke="var(--sig-clock)" strokeWidth={2} />
              <text x={xOf(e.edge)} y={20} textAnchor="middle" style={{ fill: 'var(--fg-muted)', fontSize: 11 }}>
                {e.edge}
              </text>
              {e.passed ? (
                <rect x={xOf(e.edge)} y={70} width={dx * 0.45} height={22} fill="var(--sig-output)" opacity={0.85} rx={2} />
              ) : (
                <g>
                  <rect x={xOf(e.edge)} y={70} width={dx * 0.45} height={22} fill="none" stroke="var(--danger)" strokeDasharray="3 2" rx={2} />
                  <text x={xOf(e.edge) + dx * 0.22} y={86} textAnchor="middle" style={{ fill: 'var(--danger)', fontSize: 12, fontWeight: 700 }}>
                    ✕
                  </text>
                </g>
              )}
              {res.firstChanged === e.edge ? (
                <text x={xOf(e.edge)} y={112} textAnchor="start" style={{ fill: 'var(--accent)', fontSize: 11, fontWeight: 600 }}>
                  {dir === '0to1' ? '第一個被 skip 的 edge' : '第一個恢復放行的 edge'}
                </text>
              ) : null}
            </g>
          ))}
          <line x1={xOf(res.tSwitch / T)} x2={xOf(res.tSwitch / T)} y1={14} y2={100} stroke="var(--sig-control)" strokeDasharray="4 2" />
          <text x={xOf(res.tSwitch / T) + 3} y={62} style={{ fill: 'var(--sig-control)', fontSize: 11 }}>
            sel 切換
          </text>
        </svg>
      </div>
      <ClockWaveform signals={res.traces} tEnd={edges * T} period={T} pxPerPeriod={58} rowHeight={28} markers={markers} edgeLabels={edgeLabels} highlight={['div_out']} zoomable={false} showValuesAtCursor={false} />
      <div className="small muted">
        output rising edge 間隔：<IntervalChips intervals={res.intervals} legal={(iv) => Math.abs(iv - 1) < 1e-6 || Math.abs(iv - 2) < 1e-6} />
        {res.firstChanged !== null ? (
          <>
            　sel 在 t = {fmtT(res.tSwitch, T)} 改變，{dir === '0to1' ? `第一個被 skip 的是 edge ${res.firstChanged}` : `從 edge ${res.firstChanged} 起每個 edge 都放行`}。
          </>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Lesson 3-3：gating 方式比較（runt 證明）
export interface GatingCompareProps {
  /** 第三個候選（例如練習的 rising-edge 版本） */
  extra?: { netlist: Netlist; label: string }
  title?: string
}

export function GatingCompare({ extra, title }: GatingCompareProps) {
  const [mode, setMode] = useState<'ideal' | 'real'>('real')
  const [k, setK] = useState(1)
  const rows = useMemo(() => {
    const list: { label: string; netlist: Netlist }[] = [
      { label: '正確：en 由 falling-edge FF 重同步', netlist: dualMod12 },
      { label: '錯誤：combinational gating', netlist: dualMod12Glitchy },
    ]
    if (extra) list.push({ label: extra.label, netlist: extra.netlist })
    return list.map((r) => ({ ...r, run: gatingRun(r.netlist, { k, mode, edges: 8 }) }))
  }, [extra, k, mode])
  const edgeLabels = Array.from({ length: 8 }, (_, i) => ({ t: (i + 1) * T, label: `${i + 1}` }))
  return (
    <div className="panel">
      <div className="panel-title">{title ?? 'Clock gating 的 runt：三種做法在 real delay 下'}</div>
      <div className="control-row">
        <label>
          Delay 模式
          <select value={mode} onChange={(e) => setMode(e.target.value as 'ideal' | 'real')}>
            <option value="ideal">理想（zero delay）</option>
            <option value="real">實際（tCQ / gate delay）</option>
          </select>
        </label>
        <label>
          sel 在第 <b>{k}</b> 個 edge 前變成 1
          <input type="range" min={1} max={5} step={1} value={k} onChange={(e) => setK(Number(e.target.value))} />
        </label>
        <span className="small muted">runt 門檻 = {MIN_PULSE} ps（下游 flop 的最小 pulse width）</span>
      </div>
      {rows.map((r) => (
        <div key={r.netlist.id} style={{ marginBottom: '0.8em' }}>
          <ClockWaveform
            title={r.label}
            signals={r.run.traces}
            tEnd={8 * T}
            period={T}
            pxPerPeriod={80}
            rowHeight={26}
            edgeLabels={edgeLabels}
            shades={runtShades(r.run, 'div_out')}
            highlight={['div_out']}
            showPulseWidths={['div_out']}
            zoomable={false}
            showValuesAtCursor={false}
          />
          <div className="small" style={{ marginTop: '0.3em' }}>
            <span className={`chip ${r.run.runts.length ? 'chip-danger' : 'chip-ok'}`}>{r.run.runts.length ? `${r.run.runts.length} 個 runt` : '沒有 runt'}</span>
            {r.run.runts.length ? <span className="muted">　寬度 {r.run.runts.map((x) => `${fmtNum(x.width)} ps @ ${fmtNum(x.t0)} ps`).join('、')}</span> : null}
            　output rising edge 間隔：<IntervalChips intervals={r.run.intervals} legal={(iv) => Math.abs(iv - 1) < 1e-6 || Math.abs(iv - 2) < 1e-6} />
          </div>
        </div>
      ))}
      {mode === 'ideal' ? (
        <div className="callout callout-warning">
          <div className="callout-title">理想模式看不到 glitch</div>
          zero-delay 模式下 en 與 clk 在同一個 delta cycle 改變，AND 輸出的 glitch 寬度是 0，波形上只剩一條看不見的細線。切到「實際」模式，tCQ + gate delay 會把它撐開成十幾 ps 的 runt。
        </div>
      ) : null}
    </div>
  )
}
