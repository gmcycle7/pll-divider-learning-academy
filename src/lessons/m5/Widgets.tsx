import { useMemo, useState, type ReactNode } from 'react'
import { ClockWaveform, traceFrom, type WaveShade } from '@/components/waveform/ClockWaveform'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { simulate } from '@/models/divider/engine'
import { valueAt } from '@/models/divider/analysis'
import type { Netlist, SignalTrace, StepRecord } from '@/models/divider/types'
import { muxSwitchOutput, phaseClockEvents, rotatingEdges } from '@/models/phase/pmux'
import { fmtNum } from '@/utils/format'
import type { Schematic } from '@/components/circuit/schematic'
import { arch2InputAt, arch2Script, arch3Edges, arch3Script, firstRunt, levelIntervals, pmuxDiv4, pmuxDualMod23Safe, risingTimes, safeWindows, selIndex, toggleOnRising } from './models'
import { arch1Schematic, arch2Schematic, arch3Schematic, pmuxDm23Schematic } from './schematics'

/** Module 5 所有模擬共用的選項：input 在 ph0 falling edge（k.5 T）生效 */
export const M5_SIM_OPTIONS = { period: 100, inputLead: 0.5 } as const

/** 以 T 為單位、保留 3 位小數（phase spacing 是 1/8 = 0.125，fmtT 的 2 位會四捨五入） */
export function fmtTT(t: number, period: number): string {
  return `${fmtNum(t / period, 3)}T`
}

// ---------------------------------------------------------------- narration
/** 逐 edge 敘述：ph0 edge 之後，被選中的 phase 的 rising edge 何時發生、state 何時更新 */
export function narratePmux(rec: StepRecord, netlist: Netlist, period: number): ReactNode {
  const sel = selIndex(rec.inputs)
  const before = netlist.stateOrder.map((b) => rec.stateBefore[b]).join('')
  const after = netlist.stateOrder.map((b) => rec.stateAfter[b]).join('')
  const pclkRises = rec.events.filter((e) => e.signal === 'pclk' && e.to === 1)
  const pclkFalls = rec.events.filter((e) => e.signal === 'pclk' && e.to === 0)
  const tSel = rec.t + (sel / 8) * period
  const selChanged = rec.events.some((e) => e.signal === 's0' || e.signal === 's1' || e.signal === 's2')
  return (
    <ol>
      <li>
        <b>ph0 edge {rec.edgeIndex}</b>（t = {fmtTT(rec.t, period)}）：select = {sel}（s2 s1 s0 = {rec.inputs.s2}
        {rec.inputs.s1}
        {rec.inputs.s0}
        {'mod' in rec.inputs ? <>，mod = {rec.inputs.mod}</> : null}）。ph0 的 rising edge 本身<b>不會</b>直接觸發 flop——flop 的 clock 是 pclk。
        {selChanged ? <>　<b>select 在這個視窗開頭（{fmtTT(rec.t - 0.5 * period, period)}，ph0 的 falling edge）改變了。</b></> : null}
      </li>
      <li>
        被選中的 phase {sel} 的 rising edge 在 t = {fmtTT(rec.t, period)} + {sel}/8 T = <b>{fmtTT(tSel, period)}</b>
        {sel >= 4 ? '（超過半個 T，會記錄在下一個 ph0 edge 的視窗裡）' : ''}。
      </li>
      <li>
        這個視窗（{fmtTT(rec.t - 0.5 * period, period)} ～ {fmtTT(rec.t + 0.5 * period, period)}）內 pclk 的 rising edge：
        {pclkRises.length ? pclkRises.map((e) => fmtTT(e.t, period)).join('、') : '無'}
        {pclkFalls.length ? <>；falling edge：{pclkFalls.map((e) => fmtTT(e.t, period)).join('、')}</> : null}。
        {pclkRises.length > 1 ? <b className="value-x">　同一個視窗出現兩個以上 rising edge ⇒ select 切換造成 double edge / runt！</b> : null}
      </li>
      <li>
        state：<span className="mono">{before}</span> → <span className="mono">{after}</span>
        {before === after ? '（這個視窗沒有 pclk edge，state 不變）' : ''}；輸出 {netlist.output} = <b className={`value-${rec.output}`}>{rec.output}</b>。
      </li>
    </ol>
  )
}

// ---------------------------------------------------------------- Lesson 5-1：靜態選 phase 的相位偏移
export function StaticPhaseCompare() {
  const [b, setB] = useState(3)
  const T = M5_SIM_OPTIONS.period
  const traces = useMemo(() => {
    const r0 = simulate(pmuxDiv4(0), 8, M5_SIM_OPTIONS)
    const rb = simulate(pmuxDiv4(b), 8, M5_SIM_OPTIONS)
    const pick = (r: typeof r0, name: string) => r.traces.find((t) => t.name === name)!
    const out: SignalTrace[] = [
      { ...pick(r0, 'ph0'), kind: 'phase' },
      { ...pick(rb, `ph${b}`), kind: 'phase' },
      { ...pick(rb, 'pclk'), name: `pclk(ph${b})`, kind: 'clock' },
      { ...pick(r0, 'div_out'), name: 'out@ph0', kind: 'output' },
      { ...pick(rb, 'div_out'), name: `out@ph${b}`, kind: 'output' },
    ]
    return out
  }, [b])
  return (
    <div className="panel">
      <div className="panel-title">
        靜態選 phase：/4 的輸出相位跟著 pclk 走
        <span className="chip">Δφ = {b}/8 T = {fmtNum(b / 8, 4)} T</span>
      </div>
      <div className="control-row">
        <label>
          比較 phase 0 與 phase
          <select value={b} onChange={(e) => setB(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <span className="small muted">兩個 /4 都從 reset 開始，一個由 ph0 驅動、一個由 ph{b} 驅動。</span>
      </div>
      <ClockWaveform signals={traces} tStart={0} tEnd={8 * T} period={T} showEdgeTimes={['out@ph0', `out@ph${b}`]} highlight={[`out@ph${b}`]} deltaBetween={{ a: 'out@ph0', b: `out@ph${b}`, label: 'Δφ（rising edge）' }} pxPerPeriod={90} />
      <p className="small muted">
        量到的 Δφ 就是 {b}/8 T：divider 只是把 clock edge「數 4 個」，它不會改變相位——相位由被選中的 phase 決定。輸出頻率不變（還是 /4），只有 edge 的位置平移了 {b} 個 phase spacing。
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- Lesson 5-1 / 5-3：phase rotation 與平均除數
export function RotationTable({ initialN = 4, initialStep = 1, initialM = 8, count = 9, lockControls = false, title }: { initialN?: number; initialStep?: number; initialM?: 4 | 8 | 16; count?: number; lockControls?: boolean; title?: string }) {
  const [N, setN] = useState(initialN)
  const [step, setStep] = useState(initialStep)
  const [M, setM] = useState<4 | 8 | 16>(initialM)
  const data = useMemo(() => rotatingEdges(N, step, M, count), [N, step, M, count])
  const intervals = data.times.slice(1).map((t, i) => t - data.times[i])
  const avg = data.times.length > 1 ? (data.times[data.times.length - 1] - data.times[0]) / (data.times.length - 1) : N
  const tEnd = Math.ceil(data.times[data.times.length - 1] + 1)
  const traces: SignalTrace[] = useMemo(() => {
    const t: SignalTrace[] = []
    const shown = Math.min(M, 8)
    for (let i = 0; i < shown; i++) t.push(traceFrom(`ph${i}`, phaseClockEvents(M, tEnd, i), 'phase'))
    const ev: { t: number; v: 0 | 1 }[] = [{ t: 0, v: 0 }]
    for (const tk of data.times) ev.push({ t: tk, v: 1 }, { t: tk + 0.5, v: 0 })
    t.push(traceFrom('out_edge', ev, 'output'))
    return t
  }, [M, tEnd, data.times])
  return (
    <div className="panel">
      <div className="panel-title">
        {title ?? 'Phase rotation → 平均除數'}
        <span className="chip chip-accent">
          N + k/M = {N} + {step}/{M} = {fmtNum(N + step / M, 4)}
        </span>
      </div>
      {!lockControls ? (
        <div className="control-row">
          <label>
            divider N
            <select value={N} onChange={(e) => setN(Number(e.target.value))}>
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label>
            每個 output 週期前進 k 個 phase
            <select value={step} onChange={(e) => setStep(Number(e.target.value))}>
              {[-3, -2, -1, 0, 1, 2, 3, 4].map((k) => (
                <option key={k} value={k}>
                  {k >= 0 ? `+${k}` : k}
                </option>
              ))}
            </select>
          </label>
          <label>
            M
            <select value={M} onChange={(e) => setM(Number(e.target.value) as 4 | 8 | 16)}>
              <option value={4}>4</option>
              <option value={8}>8</option>
              <option value={16}>16</option>
            </select>
          </label>
        </div>
      ) : null}
      <div className="scroll-x">
        <table className="state-table">
          <thead>
            <tr>
              <th>output edge k</th>
              <th>phase index</th>
              <th>edge 時間（T）</th>
              <th>與上一個 edge 的間隔</th>
              <th>這一步 rotate 的 carry</th>
            </tr>
          </thead>
          <tbody>
            {data.times.map((t, k) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{data.indices[k]}</td>
                <td>{fmtNum(t, 4)}</td>
                <td>{k === 0 ? '—' : fmtNum(intervals[k - 1], 4)}</td>
                <td className={data.carries[k] !== 0 ? 'changed' : ''}>{data.carries[k] === 0 ? '0' : `${data.carries[k] > 0 ? '+' : ''}${data.carries[k]}（wrap）`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small">
        {count - 1} 個間隔的平均 = ({fmtNum(data.times[data.times.length - 1], 4)} − 0) / {count - 1} = <b>{fmtNum(avg, 4)} T</b>
        {Math.abs(avg - (N + step / M)) < 1e-9 ? <>，恰好等於 N + k/M = {fmtNum(N + step / M, 4)}。</> : <>（有限長度的平均，趨近 N + k/M）。</>}
        {step !== 0 ? <> 每個間隔不是整數：不跨 boundary 的週期是 {N + step / M >= N ? `${N} + ${step}/${M}` : `${N} − ${-step}/${M}`} T，跨 boundary 的那一個由 carry 補上整數部分——但因為 carry 已經併入時間，所有間隔其實都相同。</> : null}
      </p>
      <ClockWaveform signals={traces} tEnd={tEnd} period={1} rowHeight={26} pxPerPeriod={44} highlight={['out_edge']} showEdgeTimes={['out_edge']} annotations={data.times.map((t, k) => ({ t, signal: 'out_edge', text: `ph${data.indices[k]}`, dy: -2 }))} title="每個 output edge 對齊到哪一個 phase（out_edge 只標示 rising edge 的位置）" />
    </div>
  )
}

// ---------------------------------------------------------------- Lesson 5-2：MUX 切換 demo
type Verdict = 'ok' | 'runt' | 'edge' | 'short'

export function MuxSwitchDemo({ initialA = 0, initialB = 1, initialT = 1.3, lockPhases = false, title, showDownstream = true }: { initialA?: number; initialB?: number; initialT?: number; lockPhases?: boolean; title?: string; showDownstream?: boolean }) {
  const M = 8
  const cycles = 3
  const [a, setA] = useState(initialA)
  const [b, setB] = useState(initialB)
  const [tSwitch, setTSwitch] = useState(initialT)
  const [minPulse, setMinPulse] = useState(0.2)
  const events = useMemo(() => muxSwitchOutput(M, a, b, tSwitch, cycles, minPulse).events, [a, b, tSwitch, minPulse])
  const runt = useMemo(() => firstRunt(events, minPulse), [events, minPulse])
  const intervals = useMemo(() => levelIntervals(M, a, b, cycles), [a, b])
  const trA = useMemo(() => traceFrom(`ph${a}`, phaseClockEvents(M, cycles, a), 'phase'), [a])
  const trB = useMemo(() => traceFrom(`ph${b}`, phaseClockEvents(M, cycles, b), 'phase'), [b])
  const vA = valueAt(trA, tSwitch)
  const vB = valueAt(trB, tSwitch)
  const mismatch = a !== b && vA !== vB
  const rises = risingTimes(events)
  const q = useMemo(() => toggleOnRising(events), [events])
  const k = (((b - a) % M) + M) % M
  const kMin = Math.min(k, M - k)
  const win = safeWindows(M, k)
  const safeNow = intervals.filter((iv) => iv.same && iv.t1 > 1 + 1e-9 && iv.t0 < 2 - 1e-9).map((iv) => ({ ...iv, t0: Math.max(iv.t0, 1), t1: Math.min(iv.t1, 2) }))
  const traces: SignalTrace[] = [trA, trB, traceFrom('pmux_out', events, 'output'), ...(showDownstream ? [traceFrom('q(/2)', q, 'data')] : [])]
  const shades: WaveShade[] = [
    ...intervals.map<WaveShade>((iv) => ({ t0: iv.t0, t1: iv.t1, kind: iv.same ? 'safe' : 'danger', signal: 'pmux_out' })),
    ...(runt ? [{ t0: runt.t0, t1: runt.t1, kind: 'danger' as const, signal: showDownstream ? 'q(/2)' : 'pmux_out', label: 'runt' }] : []),
  ]
  const verdict: Verdict = runt ? 'runt' : mismatch ? (vB === 1 ? 'edge' : 'short') : 'ok'
  const verdictText: Record<Verdict, ReactNode> = {
    runt: (
      <>
        <span className="m5-verdict-kind">Runt pulse（pulse-width violation）。</span> pmux_out 在 {fmtNum(runt?.t0 ?? 0, 4)} T ～ {fmtNum(runt?.t1 ?? 0, 4)} T 出現一段寬 {fmtNum(runt?.width ?? 0, 4)} T 的{runt?.level ? '高' : '低'}電位，小於下游 flop 的 t<sub>pw,min</sub> = {fmtNum(minPulse, 2)} T。這不是 setup / hold 問題：clock 本身太窄，下游 flop 可能觸發、可能不觸發、也可能 metastable。
      </>
    ),
    edge: (
      <>
        <span className="m5-verdict-kind">多一個 rising edge（double edge）。</span> 切換瞬間 ph{a} = 0、ph{b} = 1，所以 pmux_out 在 t<sub>sw</sub> = {fmtNum(tSwitch, 3)} T 直接跳高——這個 edge 既不是 ph{a} 的也不是 ph{b} 的。它的寬度還有 ≥ t<sub>pw,min</sub>，下游 flop 會「正常」被觸發一次：/2 多 toggle 一次、divider 多數一個 edge ⇒ 輸出相位跳掉。
      </>
    ),
    short: (
      <>
        <span className="m5-verdict-kind">高電位 pulse 被截短。</span> 切換瞬間 ph{a} = 1、ph{b} = 0，pmux_out 在 t<sub>sw</sub> = {fmtNum(tSwitch, 3)} T 提早落下。這一次剛好還 ≥ t<sub>pw,min</sub>，所以下游 flop 只是失去 margin；再把 t<sub>sw</sub> 往前拖一點就會變成 runt。
      </>
    ),
    ok: (
      <>
        <span className="m5-verdict-kind">乾淨切換。</span> 切換瞬間 ph{a} 與 ph{b} 同 level（都是 {vA}），pmux_out 沒有多出任何 transition；下一個 rising edge 直接是 ph{b} 的 edge，與上一個 edge 相距 {rises.length >= 2 ? fmtNum(rises.find((t) => t > tSwitch)! - [...rises].reverse().find((t) => t <= tSwitch)!, 4) : '—'} T{k <= 4 ? `（= 1 + ${k}/8：forward）` : `（= 1 − ${M - k}/8：backward）`}。
      </>
    ),
  }
  return (
    <div className="panel">
      <div className="panel-title">
        {title ?? 'PMUX select 切換時間掃描'}
        <span className="chip">
          ph{a} → ph{b}（forward k = {k}，最短距離 {kMin}）
        </span>
        <span className={`chip ${win.total > 0 ? 'chip-ok' : 'chip-danger'}`}>同 level 區間每個 T 共 {fmtNum(win.total, 3)} T</span>
      </div>
      <div className="control-row">
        {!lockPhases ? (
          <>
            <label>
              舊 phase a
              <select value={a} onChange={(e) => setA(Number(e.target.value))}>
                {Array.from({ length: M }, (_, i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </label>
            <label>
              新 phase b
              <select value={b} onChange={(e) => setB(Number(e.target.value))}>
                {Array.from({ length: M }, (_, i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        <label>
          select 切換時間 t<sub>sw</sub> = {fmtNum(tSwitch, 3)} T
          <input type="range" min={1} max={2} step={0.005} value={tSwitch} onChange={(e) => setTSwitch(Number(e.target.value))} style={{ width: 260 }} />
        </label>
        <label>
          下游 flop t<sub>pw,min</sub> = {fmtNum(minPulse, 2)} T
          <input type="range" min={0.05} max={0.5} step={0.01} value={minPulse} onChange={(e) => setMinPulse(Number(e.target.value))} />
        </label>
      </div>
      <ClockWaveform
        signals={traces}
        tEnd={cycles}
        period={1}
        pxPerPeriod={240}
        rowHeight={34}
        shades={shades}
        markers={[{ t: tSwitch, label: `sel: ${a}→${b}`, kind: 'window' }]}
        highlight={['pmux_out']}
        showPulseWidths={['pmux_out']}
        showEdgeTimes={['pmux_out']}
        zoomable={false}
        title="pmux_out 列的底色：綠 = ph_a 與 ph_b 同 level（可切換）；紅 = 不同 level（切換會產生 transition）"
      />
      <div className={`callout ${verdict === 'ok' ? 'callout-method' : 'callout-pitfall'} m5-verdict m5-verdict-${verdict === 'ok' ? 'ok' : verdict === 'runt' ? 'runt' : 'edge'}`}>
        <div className="callout-title">{verdict === 'ok' ? '結果：安全' : verdict === 'runt' ? '結果：pulse-width violation' : verdict === 'edge' ? '結果：多一個 edge' : '結果：pulse 被截短（尚未違規）'}</div>
        {verdictText[verdict]}
        <div className="small muted" style={{ marginTop: '0.4em' }}>
          pmux_out rising edge：{rises.map((t) => fmtNum(t, 4)).join('、')} T。
          {showDownstream ? <> 下游 /2（理想 flop，每個 rising edge 都 toggle）的 q 畫在最下一列——runt 的 edge 也被算了一次；真實 flop 對 runt 的反應是不確定的。</> : null}
        </div>
      </div>
      <div className="small muted">
        這一個 T（1 ～ 2 T）內的安全區：{safeNow.length ? safeNow.map((iv) => `[${fmtNum(iv.t0, 3)}, ${fmtNum(iv.t1, 3)}] T（都 ${iv.level}）`).join('、') : '沒有——兩個 phase 互為反相，任何時刻切都會產生 transition'}。理論：forward k = {k} 時每段安全區寬 1/2 − {kMin}/8 = {fmtNum(win.widthEach, 4)} T。切在安全區邊緣仍可能讓合併後的 pulse 太窄——真正的判準是下游 flop 的 t<sub>pw,min</sub>。
      </div>
    </div>
  )
}

/** Lesson 5-2：forward k = 1..7 的 safe window 一覽（相對 ph_a 的 rising edge） */
export function SafeWindowTable({ Tps = 125, highlightK }: { Tps?: number; highlightK?: number }) {
  const M = 8
  const rows = Array.from({ length: 7 }, (_, i) => i + 1).map((k) => ({ k, w: safeWindows(M, k) }))
  const rng = (r: [number, number] | null) => (r ? `[${fmtNum(r[0], 3)}, ${fmtNum(r[1], 3)}] T` : '無')
  return (
    <div className="scroll-x">
      <table className="state-table m5-window-table">
        <thead>
          <tr>
            <th>forward k</th>
            <th>等效 backward</th>
            <th>都 high 的窗</th>
            <th>都 low 的窗</th>
            <th>每個窗的寬度</th>
            <th>每個 T 可切換的總時間</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ k, w }) => (
            <tr key={k} className={highlightK === k ? 'current' : ''}>
              <td>+{k}</td>
              <td>−{M - k}</td>
              <td className={w.high ? 'm5-safe' : 'm5-none'}>{rng(w.high)}</td>
              <td className={w.low ? 'm5-safe' : 'm5-none'}>{rng(w.low)}</td>
              <td className={w.widthEach > 0 ? '' : 'm5-danger'}>
                {w.widthEach > 0 ? `${fmtNum(w.widthEach, 4)} T = ${fmtNum(w.widthEach * Tps, 1)} ps` : '0（沒有安全窗）'}
              </td>
              <td className={w.total > 0 ? 'm5-safe' : 'm5-danger'}>{fmtNum(w.total, 3)} T</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">
        時間以 ph_a 的 rising edge 為 0，單位 Tvco（ps 欄以 Tvco = {Tps} ps 換算）。k ≥ 5 時以 backward（8 − k 步）的觀點列出：窗口從 ph_a 的 edge 開始、在 ph_b 的 edge 結束。
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- Lesson 5-2 / 5-3：engine 版本
export function PmuxDm23Sim({ netlist, title, signals, schematic = pmuxDm23Schematic, prerun, windowCycles = 8 }: { netlist: Netlist; title: string; signals?: string[]; schematic?: Schematic; prerun?: number; windowCycles?: number }) {
  const options = useMemo(() => ({ ...M5_SIM_OPTIONS, ...(prerun ? { prerun } : {}) }), [prerun])
  return <DividerSimPanel netlist={netlist} schematic={schematic} options={options} title={title} narrate={narratePmux} signals={signals} windowCycles={windowCycles} showPulseWidths showDelayMode />
}

// ---------------------------------------------------------------- Lesson 5-3：架構 2 的 edge 時間表（engine 產生）
export function Arch2EdgeTable() {
  const T = M5_SIM_OPTIONS.period
  const [mode, setMode] = useState<'ideal' | 'real'>('ideal')
  const data = useMemo(() => {
    const { traces } = simulate(pmuxDualMod23Safe, 28, { ...M5_SIM_OPTIONS, delayMode: mode }, arch2InputAt)
    const out = traces.find((t) => t.name === 'div_out')!
    const pclk = traces.find((t) => t.name === 'pclk')!
    return { traces, rises: risingTimes(out.events), pclkRises: risingTimes(pclk.events) }
  }, [mode])
  const rows = data.rises.map((t, k) => {
    // 這個 rising edge 所在的 ph0 週期內，腳本已經生效的 sel / mod（腳本在 edge e 前 0.5 T 生效）
    const edgeIdx = Math.floor(t / T)
    let sel = 0
    let mod: 0 | 1 = 0
    for (const [e, s] of Object.entries(arch2Script)) {
      if (Number(e) <= edgeIdx) {
        sel = s.sel
        mod = s.mod
      }
    }
    return { k, t, interval: k === 0 ? null : (t - data.rises[k - 1]) / T, sel, mod }
  })
  const shown = ['ph0', 'ph1', 'ph2', 's0', 's1', 'mod', 'en0', 'en1', 'en2', 'pclk', 'div_out']
  const traces = shown.map((n) => data.traces.find((t) => t.name === n)!).filter(Boolean)
  return (
    <div className="panel">
      <div className="panel-title">
        架構 2（glitch-free PMUX → /2 /3）：phase step 與 mod 一起切換的 edge 時間表
        <span className="chip chip-accent">{mode === 'ideal' ? 'ideal（zero delay）' : 'real（tCQ / gate delay）'}</span>
      </div>
      <div className="control-row">
        <label>
          Delay 模式
          <select value={mode} onChange={(e) => setMode(e.target.value as 'ideal' | 'real')}>
            <option value="ideal">理想（zero delay）</option>
            <option value="real">實際（tCQ / gate delay）</option>
          </select>
        </label>
        <span className="small muted">腳本（input 在 ph0 edge k 前 0.5 T 生效）：edge 1 → sel 0、mod 0（/2）；edge 6 → sel 1、mod 1；edge 12 → sel 2、mod 0；edge 17 → sel 0、mod 1。以下全部由 simulate 逐 edge 產生。</span>
      </div>
      <div className="scroll-x">
        <table className="state-table">
          <thead>
            <tr>
              <th>div_out rising #</th>
              <th>時間</th>
              <th>與上一個的間隔</th>
              <th>這個週期的 phase</th>
              <th>mod（N）</th>
              <th>預期 N + Δphase/8</th>
              <th>差異</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const prev = rows[i - 1]
              const dPhase = prev ? (((r.sel - prev.sel) % 8) + 8) % 8 : 0
              const N = r.mod ? 3 : 2
              const expect = prev ? N + dPhase / 8 : null
              const diff = expect !== null && r.interval !== null ? r.interval - expect : null
              return (
                <tr key={r.k} className={diff !== null && Math.abs(diff) > 1e-6 ? 'changed' : ''}>
                  <td>{r.k}</td>
                  <td>{fmtNum(r.t / T, 3)} T</td>
                  <td>{r.interval === null ? '—' : `${fmtNum(r.interval, 4)} T`}</td>
                  <td>ph{r.sel}</td>
                  <td>
                    {r.mod}（/{N}）
                  </td>
                  <td>{expect === null ? '—' : `${N} + ${dPhase}/8 = ${fmtNum(expect, 4)}`}</td>
                  <td className={diff !== null && Math.abs(diff) > 1e-6 ? 'm5-danger' : ''}>{diff === null ? '—' : Math.abs(diff) < 1e-6 ? '一致' : `${diff > 0 ? '+' : ''}${fmtNum(diff, 3)} T（handoff 沒趕上，多等一個 T）`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="small">
        「預期」= 這個週期的 N（由 mod 決定）+ forward 的 phase 距離 / 8。retimed MUX 只能「往後」切：phase 2 → 0 等效 forward 6 步（+6/8 T），不是 backward 2 步（−2/8 T）。要真的往前 2/8 T，必須同時讓 divider 少走一個 cycle（N − 1）——這就是 Lesson 5-1 的 integer carry 進入 modulus 控制的地方。
        {mode === 'real' ? <b> real 模式下 forward +1 的兩次切換各多等了一個 T：不是 glitch，是 glitch-free MUX 的 enable handoff path（en_old ↓ph_old → EN_new ↓ph_new 只有 1/8 T = 12.5 ps，而 tCQ 8 + gate 6 = 14 ps）沒趕上，EN_new 等到下一個 falling edge 才打開。看 en0 / en1 / en2 列。</b> : null}
      </p>
      <ClockWaveform signals={traces} tStart={0} tEnd={28 * T} period={T} pxPerPeriod={56} rowHeight={24} highlight={['div_out']} showEdgeTimes={['div_out']} title="glitch-free PMUX → /2 /3：sel / mod 切換、enable handoff、pclk 與 div_out（可橫向捲動、可 zoom）" />
    </div>
  )
}

// ---------------------------------------------------------------- Lesson 5-3：架構 3 的 edge 時間表（純函式）
export function Arch3EdgeTable() {
  const M = 8
  const data = useMemo(() => arch3Edges(arch3Script, M), [])
  const tEnd = Math.ceil(data.times[data.times.length - 1] + 1)
  const traces = useMemo(() => {
    const t: SignalTrace[] = []
    const pulse = (times: number[]) => {
      const ev: { t: number; v: 0 | 1 }[] = [{ t: 0, v: 0 }]
      for (const x of times) ev.push({ t: x, v: 1 }, { t: x + 0.5, v: 0 })
      return ev
    }
    t.push(traceFrom('div_N', pulse(data.divEdges), 'clock'))
    for (let i = 0; i < 4; i++) t.push(traceFrom(`dph${i}`, pulse(data.divEdges.map((e) => e + i / M)), 'phase'))
    t.push(traceFrom('div_out', pulse(data.times), 'output'))
    return t
  }, [data])
  return (
    <div className="panel">
      <div className="panel-title">架構 3（/2 /3 → 8 divided phases → PMUX）：同樣的 N / phase 決策，backward 不掉 pulse</div>
      <div className="scroll-x">
        <table className="state-table">
          <thead>
            <tr>
              <th>output edge j</th>
              <th>divider edge E_j（ph0 上）</th>
              <th>這週期 N_j</th>
              <th>選的 divided phase</th>
              <th>output edge = E_j + sel/8</th>
              <th>與上一個的間隔 = N + Δsel/8</th>
            </tr>
          </thead>
          <tbody>
            {arch3Script.map((st, j) => {
              const prev = arch3Script[j - 1]
              const dsel = prev ? st.sel - prev.sel : 0
              return (
                <tr key={j} className={dsel < 0 ? 'changed' : ''}>
                  <td>{j}</td>
                  <td>{data.divEdges[j]} T</td>
                  <td>{st.N}</td>
                  <td>dph{st.sel}</td>
                  <td>{fmtNum(data.times[j], 3)} T</td>
                  <td>{j === 0 ? '—' : `${prev.N} ${dsel >= 0 ? '+' : '−'} ${Math.abs(dsel)}/8 = ${fmtNum(data.intervals[j - 1], 4)} T`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="small">
        第 6 → 7 個 edge：sel 從 2 回到 0，間隔 = 3 − 2/8 = 2.75 T。同樣的決策在架構 2 是 3 + 6/8 = 3.75 T（多等一個 T）。代價：8 個 divided phase 要先被產生出來（8 個 retiming flop 各由一個 VCO phase 驅動），而 select 必須在所有 divided phase 同 level 的區間內改變。
      </p>
      <ClockWaveform signals={traces} tEnd={tEnd} period={1} rowHeight={24} pxPerPeriod={40} highlight={['div_out']} showEdgeTimes={['div_out']} title="div_N 在 ph0 上；dph_i = div_N 延遲 i/8 T（只畫 0..3）；div_out = 被選中的 dph" />
    </div>
  )
}

// ---------------------------------------------------------------- Lesson 5-3：練習：給需求選架構
const ARCH_INFO: { id: '1' | '2' | '3'; name: string; schematic: Schematic; summary: string[] }[] = [
  { id: '1', name: '架構 1：PMUX → fixed /N', schematic: arch1Schematic, summary: ['PMUX 在 fVCO 工作', 'fractional 只能靠 phase rotation（N + k/8）', 'wrap 的 carry 無處可放：retimed MUX 的 backward 會掉 pulse（combinational MUX 可以 backward，但要賭 window）'] },
  { id: '2', name: '架構 2：PMUX → /N /N+1', schematic: arch2Schematic, summary: ['PMUX 在 fVCO 工作', 'carry 可以併入 modulus（N±1）', 'select window 最嚴：需要 glitch-free MUX'] },
  { id: '3', name: '架構 3：/N /N+1 → phases → PMUX', schematic: arch3Schematic, summary: ['PMUX 在 fVCO/N 工作', 'backward step 直接 N − k/8', '要先產生 8 個 divided phase（retiming flop）'] },
]
const PATH_OPTIONS = [
  { id: 'div', label: 'divider 內部 Q → logic → D（在 fVCO 工作）' },
  { id: 'window', label: 'phase_sel → decode → combinational PMUX 的 safe window' },
  { id: 'handoff', label: 'glitch-free MUX 的 enable handoff（en_old ↓ → EN_new ↓，k/8 T）' },
  { id: 'retime', label: '產生 divided phase 的 retiming flop：div_N → FF(ph_i) 的 setup（i/8 T）' },
  { id: 'clk', label: 'ph_i → PMUX → clk 的 clock path' },
]

export function ArchDecisionWorksheet() {
  const [arch, setArch] = useState<'1' | '2' | '3' | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [show, setShow] = useState(false)
  const info = ARCH_INFO.find((a) => a.id === arch)
  return (
    <div className="panel">
      <div className="panel-title">需求 → 架構 → critical path</div>
      <ul className="m5-req-list">
        <li>fVCO = 8 GHz（Tvco = 125 ps），8-phase VCO 已經有了。</li>
        <li>整數除數 N = 4 ～ 6，需要 1/8 步進的 fractional；每個 output 週期 phase 最多動 ±1 步，而且 backward 一步時<b>不能</b>掉一個 pulse。</li>
        <li>控制 FSM 由 div_out 驅動，允許 1 個 output 週期的 latency。</li>
        <li>功耗優先；輸出 jitter 預算緊，PMUX 的 delay noise 不能被放大。</li>
      </ul>
      <div className="m5-arch-grid">
        {ARCH_INFO.map((a) => (
          <div key={a.id} className={`m5-arch-card ${arch === a.id ? 'selected' : ''}`}>
            <label>
              <input type="radio" name="m5-arch" checked={arch === a.id} onChange={() => setArch(a.id)} />
              {a.name}
            </label>
            <ul>
              {a.summary.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {info ? <LogicDiagram schematic={info.schematic} showValues={false} showLegend={false} /> : null}
      <div className="m5-choice-row">
        <span className="small muted">這個架構裡限制 Fmax 的 path 是：</span>
        {PATH_OPTIONS.map((p) => (
          <label key={p.id}>
            <input type="radio" name="m5-path" checked={path === p.id} onChange={() => setPath(p.id)} />
            {p.label}
          </label>
        ))}
      </div>
      <div className="control-row">
        <button className="btn" onClick={() => setShow((s) => !s)} disabled={!arch || !path}>
          {show ? '收起對照' : '對照參考推理'}
        </button>
        {!arch || !path ? <span className="small muted">先選一個架構與一條 path。</span> : null}
      </div>
      {show && arch && path ? (
        <div className="callout callout-note">
          <div className="callout-title">你選了 {info?.name}；path = {PATH_OPTIONS.find((p) => p.id === path)?.label}</div>
          <p>
            {arch === '3' ? '架構 3 符合「backward 不掉 pulse」（間隔直接 N − 1/8）與「PMUX 在低速工作、功耗低」兩個條件；' : arch === '2' ? '架構 2 可以用 modulus 吃掉 carry（backward 一步 = N − 1 再 forward 7 步），但 PMUX 在 fVCO 工作且 select window 最嚴，需要 glitch-free MUX 與提前一個週期算好的 select——功耗與 jitter 兩項都比架構 3 吃虧；' : '架構 1 的 fixed /N 沒有地方放 carry：retimed MUX 的 backward 一步會變成 forward 7 步、多等一個 T，違反需求（換成 combinational MUX 雖可 backward，但要把 select 壓進 3/8 T 的窗內，jitter 預算不允許）；'}
            {path === 'div' ? 'Fmax 的 critical path 在三種架構裡都是「在 fVCO 工作的 divider 內部 Q → logic → D」：tCQ + logic + setup 必須小於 Tvco = 125 ps。' : path === 'window' ? 'safe window 限制的是切換時機（switching window），不是 Fmax——它決定 select 何時可以改，不決定 clock 可以多快。' : path === 'handoff' ? 'handoff path 限制的是切換 latency 與 EN flop 的 metastability，不是 divider 的 Fmax。' : path === 'retime' ? 'retiming flop 的 setup path（只有 i/8 T 可用）確實是架構 3 特有的緊路徑，但它決定「divided phase 能不能正確產生」；divider 內部 loop 仍是 Fmax 的第一個瓶頸——兩條都要檢查。' : 'clock path 是 latency / mismatch / jitter 的來源，不是 setup critical path。'}
          </p>
          <p className="small muted">參考答案不是唯一答案：若需求改成「phase 每個週期可動 ±3 步」或「不允許 8 個 retiming flop 的面積」，結論會不同。完整推理見下方解答。</p>
        </div>
      ) : null}
    </div>
  )
}
