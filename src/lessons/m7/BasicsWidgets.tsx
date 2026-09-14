import { useMemo, useState } from 'react'
import { ClockWaveform, type WaveAnnotation, type WaveMarker, type WaveShade } from '@/components/waveform/ClockWaveform'
import { TimingBudgetBar } from '@/components/timing/TimingBudgetBar'
import { Math as M } from '@/components/content'
import { analyzeHold, analyzeSetup } from '@/models/timing/sta'
import type { TimingPath } from '@/models/timing/types'
import type { SignalTrace } from '@/models/divider/types'
import { fmtNum } from '@/utils/format'

/* ------------------------------------------------------------------ */
/* Setup path 波形：launch clk / q / d / capture clk，所有 edge 由參數算出 */
/* ------------------------------------------------------------------ */

export interface SetupPathParams {
  /** clock period（ps） */
  period: number
  /** launch FF 的 clock-to-Q（max，ps） */
  tcq: number
  /** combinational delay（max，ps） */
  logic: number
  /** capture FF 的 setup time（ps） */
  tsetup: number
  /** clock uncertainty = jitter + margin（ps） */
  uncertainty: number
  /** capture clock 到達 − launch clock 到達（ps） */
  skew: number
}

export interface SetupPathModel {
  traces: SignalTrace[]
  markers: WaveMarker[]
  shades: WaveShade[]
  annotations: WaveAnnotation[]
  tStart: number
  tEnd: number
  arrival: number
  required: number
  slack: number
  captureEdge: number
}

/** 以 launch edge 為 t = 0，把 setup path 的所有事件算出來（波形一律由 event 產生） */
export function buildSetupPathModel(p: SetupPathParams): SetupPathModel {
  const T = p.period
  const tStart = -Math.round(0.3 * T)
  const skew = Math.max(p.skew, tStart + 2)
  const half = T / 2
  const clkEvents = (offset: number) => {
    const ev: { t: number; v: 0 | 1 }[] = [{ t: tStart, v: 0 }]
    for (let k = 0; k < 3; k++) ev.push({ t: offset + k * T, v: 1 }, { t: offset + k * T + half, v: 0 })
    return ev
  }
  const arrival = p.tcq + p.logic
  const captureEdge = T + skew
  const required = captureEdge - p.tsetup - p.uncertainty
  const slack = required - arrival
  const traces: SignalTrace[] = [
    { name: 'launch clk', kind: 'clock', events: clkEvents(0) },
    { name: 'q', kind: 'data', events: [{ t: tStart, v: 0 }, { t: p.tcq, v: 1 }, { t: T + p.tcq, v: 0 }, { t: 2 * T + p.tcq, v: 1 }] },
    { name: 'd', kind: 'data', events: [{ t: tStart, v: 0 }, { t: arrival, v: 1 }, { t: T + arrival, v: 0 }, { t: 2 * T + arrival, v: 1 }] },
    { name: 'capture clk', kind: 'clock', events: clkEvents(skew) },
  ]
  const markers: WaveMarker[] = [
    { t: 0, label: 'launch edge k', kind: 'edge', signal: 'launch clk' },
    { t: captureEdge, label: 'capture edge k+1', kind: 'edge', signal: 'capture clk' },
  ]
  const shades: WaveShade[] = [{ t0: required, t1: captureEdge, kind: 'danger', label: 'tsetup + unc', signal: 'd' }]
  if (slack >= 0) shades.push({ t0: arrival, t1: required, kind: 'safe', label: `slack ${fmtNum(slack)}`, signal: 'd' })
  else shades.push({ t0: required, t1: arrival, kind: 'danger', label: `violation ${fmtNum(slack)}`, signal: 'd' })
  const annotations: WaveAnnotation[] = [
    { t: p.tcq, signal: 'q', text: `tCQ = ${fmtNum(p.tcq)}` },
    { t: arrival, signal: 'd', text: `arrival = ${fmtNum(arrival)}` },
  ]
  return { traces, markers, shades, annotations, tStart, tEnd: 2 * T + Math.max(0, skew) + 6, arrival, required, slack, captureEdge }
}

export function SetupPathWaveform({ params, title, compact = false }: { params: SetupPathParams; title?: string; compact?: boolean }) {
  const m = useMemo(() => buildSetupPathModel(params), [params])
  return (
    <ClockWaveform
      title={title}
      signals={m.traces}
      tStart={m.tStart}
      tEnd={m.tEnd}
      unit=" ps"
      markers={m.markers}
      shades={m.shades}
      annotations={m.annotations}
      zoomable={!compact}
      measure={!compact}
      compact={compact}
      showValuesAtCursor={false}
      rowHeight={compact ? 30 : 36}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Hold path 波形：同一個 edge，資料不能太快改變                          */
/* ------------------------------------------------------------------ */

export interface HoldPathParams {
  period: number
  tcqMin: number
  logicMin: number
  thold: number
  skew: number
}

export function buildHoldPathModel(p: HoldPathParams) {
  const T = p.period
  const tStart = -Math.round(0.3 * T)
  const skew = Math.max(p.skew, tStart + 2)
  const half = T / 2
  const clkEvents = (offset: number) => {
    const ev: { t: number; v: 0 | 1 }[] = [{ t: tStart, v: 0 }]
    for (let k = 0; k < 2; k++) ev.push({ t: offset + k * T, v: 1 }, { t: offset + k * T + half, v: 0 })
    return ev
  }
  const arrival = p.tcqMin + p.logicMin
  const required = skew + p.thold
  const slack = arrival - required
  const traces: SignalTrace[] = [
    { name: 'launch clk', kind: 'clock', events: clkEvents(0) },
    { name: 'd (min)', kind: 'data', events: [{ t: tStart, v: 1 }, { t: arrival, v: 0 }, { t: T + arrival, v: 1 }] },
    { name: 'capture clk', kind: 'clock', events: clkEvents(skew) },
  ]
  const markers: WaveMarker[] = [
    { t: 0, label: 'launch edge k', kind: 'edge', signal: 'launch clk' },
    { t: skew, label: 'capture edge k（同一個）', kind: 'edge', signal: 'capture clk' },
  ]
  const shades: WaveShade[] = [{ t0: skew, t1: required, kind: 'danger', label: 'thold', signal: 'd (min)' }]
  if (slack >= 0) shades.push({ t0: required, t1: arrival, kind: 'safe', label: `hold slack ${fmtNum(slack)}`, signal: 'd (min)' })
  else shades.push({ t0: arrival, t1: required, kind: 'danger', label: `hold violation ${fmtNum(slack)}`, signal: 'd (min)' })
  const annotations: WaveAnnotation[] = [{ t: arrival, signal: 'd (min)', text: `earliest change = ${fmtNum(arrival)}` }]
  return { traces, markers, shades, annotations, tStart, tEnd: T + 6, arrival, required, slack }
}

export function HoldPathWaveform({ params, title, compact = false }: { params: HoldPathParams; title?: string; compact?: boolean }) {
  const m = useMemo(() => buildHoldPathModel(params), [params])
  return (
    <ClockWaveform
      title={title}
      signals={m.traces}
      tStart={m.tStart}
      tEnd={m.tEnd}
      unit=" ps"
      markers={m.markers}
      shades={m.shades}
      annotations={m.annotations}
      zoomable={!compact}
      measure={!compact}
      compact={compact}
      showValuesAtCursor={false}
      rowHeight={compact ? 30 : 36}
    />
  )
}

/* ------------------------------------------------------------------ */
/* Timing 計算機                                                         */
/* ------------------------------------------------------------------ */

function makePath(p: { tcqMin: number; tcq: number; logicMin: number; logic: number; tsetup: number; thold: number }): TimingPath {
  return {
    id: 'calc',
    name: 'Launch FF.Q → logic → Capture FF.D',
    type: 'setup',
    launch: { element: 'ffl', edge: 'rising', clock: 'clk' },
    capture: { element: 'ffc', edge: 'rising', clock: 'clk', setup: p.tsetup, hold: p.thold },
    segments: [
      { id: 'tcq', label: 'tCQ', from: 'Launch FF.clk', to: 'Launch FF.Q', kind: 'tcq', min: p.tcqMin, max: p.tcq },
      { id: 'logic', label: 'logic', from: 'Launch FF.Q', to: 'Capture FF.D', kind: 'logic', min: p.logicMin, max: p.logic },
    ],
  }
}

interface CalcState {
  period: number
  tcq: number
  logic: number
  tsetup: number
  uncertainty: number
  skew: number
  tcqMin: number
  logicMin: number
  thold: number
}

const DEFAULT_CALC: CalcState = { period: 50, tcq: 8, logic: 25, tsetup: 7, uncertainty: 4, skew: 0, tcqMin: 5, logicMin: 12, thold: 3 }

/**
 * 輸入五個基本數字（Tclk、tCQ、logic、tsetup、uncertainty）＋ skew，
 * 即時顯示 arrival / required / slack / Tclk,min / Fmax 與對應波形；下方另有 hold check。
 * 所有數字都經過 @/models/timing/sta 的 analyzeSetup / analyzeHold，與 Critical Path Explorer 一致。
 */
export function TimingCalculator({ initial }: { initial?: Partial<CalcState> }) {
  const [s, setS] = useState<CalcState>({ ...DEFAULT_CALC, ...initial })
  const path = useMemo(() => makePath(s), [s])
  const env = useMemo(() => ({ period: s.period, skew: s.skew, jitter: s.uncertainty, margin: 0 }), [s])
  const setup = analyzeSetup(path, env)
  const hold = analyzeHold(path, env)
  const setupParams: SetupPathParams = { period: s.period, tcq: s.tcq, logic: s.logic, tsetup: s.tsetup, uncertainty: s.uncertainty, skew: s.skew }
  const holdParams: HoldPathParams = { period: s.period, tcqMin: s.tcqMin, logicMin: s.logicMin, thold: s.thold, skew: s.skew }
  const num = (key: keyof CalcState, label: React.ReactNode, min = -100) => (
    <label key={key}>
      {label}
      <input type="number" min={min} step={1} value={s[key]} onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })} />
    </label>
  )
  const fmaxGHz = setup.tclkMin > 0 ? 1000 / setup.tclkMin : Infinity
  return (
    <div className="panel">
      <div className="panel-title">
        Timing 計算機
        <span className="chip chip-accent">setup + hold</span>
      </div>
      <div className="panel-sub">單位一律 ps。先改 Tclk，看 slack 什麼時候變成 0；再改 skew，看 setup 與 hold 往相反方向走。</div>
      <div className="control-row">
        {num('period', <>T<sub>clk</sub></>, 1)}
        {num('tcq', <>t<sub>CQ,max</sub></>, 0)}
        {num('logic', <>t<sub>logic,max</sub></>, 0)}
        {num('tsetup', <>t<sub>setup</sub></>, 0)}
        {num('uncertainty', <>uncertainty</>, 0)}
        {num('skew', <>skew</>)}
        <button className="btn btn-sm" onClick={() => setS({ ...DEFAULT_CALC, ...initial })}>
          重設
        </button>
      </div>
      <div className="scroll-x">
        <table className="timing-table">
          <tbody>
            <tr>
              <td>
                <b>Arrival</b> = 0 + t<sub>CQ</sub> + t<sub>logic</sub>
              </td>
              <td>
                {fmtNum(s.tcq)} + {fmtNum(s.logic)} = <b>{fmtNum(setup.arrival)}</b>
              </td>
            </tr>
            <tr>
              <td>
                <b>Required</b> = skew + T<sub>clk</sub> − t<sub>setup</sub> − uncertainty
              </td>
              <td>
                {fmtNum(s.skew)} + {fmtNum(s.period)} − {fmtNum(s.tsetup)} − {fmtNum(s.uncertainty)} = <b>{fmtNum(setup.required)}</b>
              </td>
            </tr>
            <tr>
              <td>
                <b>Slack</b> = required − arrival
              </td>
              <td className={setup.slack < 0 ? 'slack-bad' : 'slack-ok'}>
                <b>{fmtNum(setup.slack)}</b> {setup.slack < 0 ? '（setup violation：資料來不及）' : '（OK）'}
              </td>
            </tr>
            <tr>
              <td>
                T<sub>clk,min</sub>（slack = 0）
              </td>
              <td>
                <b>{fmtNum(setup.tclkMin)}</b> ps　⇒　F<sub>max</sub> ≈ <b>{Number.isFinite(fmaxGHz) ? fmtNum(fmaxGHz, 2) : '∞'}</b> GHz
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <TimingBudgetBar items={setup.breakdown} total={setup.available} title="Timing budget：一個 Tclk 如何被消耗" />
      <SetupPathWaveform params={setupParams} title="Setup path 波形（launch edge = 0 ps）" />
      <details>
        <summary className="small muted">Hold check（同一個 edge；與 Tclk 無關）</summary>
        <div className="control-row">
          {num('tcqMin', <>t<sub>CQ,min</sub></>, 0)}
          {num('logicMin', <>t<sub>logic,min</sub></>, 0)}
          {num('thold', <>t<sub>hold</sub></>, 0)}
          <span className="small muted">skew 沿用上面的值（{fmtNum(s.skew)} ps）</span>
        </div>
        <div className="scroll-x">
          <table className="timing-table">
            <tbody>
              <tr>
                <td>
                  <b>Arrival (min)</b> = t<sub>CQ,min</sub> + t<sub>logic,min</sub>
                </td>
                <td>
                  {fmtNum(s.tcqMin)} + {fmtNum(s.logicMin)} = <b>{fmtNum(hold.arrival)}</b>
                </td>
              </tr>
              <tr>
                <td>
                  <b>Required</b> = skew + t<sub>hold</sub>
                </td>
                <td>
                  {fmtNum(s.skew)} + {fmtNum(s.thold)} = <b>{fmtNum(hold.required)}</b>
                </td>
              </tr>
              <tr>
                <td>
                  <b>Hold slack</b> = arrival − required
                </td>
                <td className={hold.slack < 0 ? 'slack-bad' : 'slack-ok'}>
                  <b>{fmtNum(hold.slack)}</b> {hold.slack < 0 ? '（hold violation：資料變太快）' : '（OK）'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <HoldPathWaveform params={holdParams} title="Hold path 波形（min delay）" />
        <div className="small">
          <M block>{'t_{CQ,min} + t_{logic,min} \\ge t_{hold} + t_{skew}'}</M>
        </div>
      </details>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Skew 方向比較：同一組數字，skew = +8 與 −8                              */
/* ------------------------------------------------------------------ */

export function SkewCompare({ base = DEFAULT_CALC, plus = 8, minus = -8 }: { base?: CalcState; plus?: number; minus?: number }) {
  const path = useMemo(() => makePath(base), [base])
  const render = (skew: number) => {
    const env = { period: base.period, skew, jitter: base.uncertainty, margin: 0 }
    const su = analyzeSetup(path, env)
    const ho = analyzeHold(path, env)
    return (
      <div key={skew}>
        <div className="small" style={{ marginBottom: '0.3em' }}>
          <b>skew = {skew > 0 ? '+' : ''}{fmtNum(skew)} ps</b>：capture edge 比 launch edge {skew > 0 ? '晚' : '早'}到 {fmtNum(Math.abs(skew))} ps
        </div>
        <SetupPathWaveform params={{ period: base.period, tcq: base.tcq, logic: base.logic, tsetup: base.tsetup, uncertainty: base.uncertainty, skew }} compact />
        <HoldPathWaveform params={{ period: base.period, tcqMin: base.tcqMin, logicMin: base.logicMin, thold: base.thold, skew }} compact />
        <div className="small mono">
          setup：required = {fmtNum(skew)} + {fmtNum(base.period)} − {fmtNum(base.tsetup)} − {fmtNum(base.uncertainty)} = {fmtNum(su.required)}；slack = {fmtNum(su.required)} − {fmtNum(su.arrival)} ={' '}
          <b className={su.slack < 0 ? 'slack-bad' : 'slack-ok'}>{fmtNum(su.slack)}</b>
          <br />
          hold：required = {fmtNum(skew)} + {fmtNum(base.thold)} = {fmtNum(ho.required)}；slack = {fmtNum(ho.arrival)} − {fmtNum(ho.required)} = <b className={ho.slack < 0 ? 'slack-bad' : 'slack-ok'}>{fmtNum(ho.slack)}</b>
        </div>
      </div>
    )
  }
  return <div className="grid-2">{[render(plus), render(minus)]}</div>
}
