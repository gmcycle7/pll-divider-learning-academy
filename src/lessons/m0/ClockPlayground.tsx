import { useMemo, useState } from 'react'
import { ClockWaveform, clockTrace } from '@/components/waveform/ClockWaveform'
import { fmtNum } from '@/utils/format'
import { edgesOf } from './models'

const CYCLES = 5

/**
 * Lesson 0-1 的核心互動元件。
 * 使用者拖動 period（＝ 1/frequency）、duty、以及 clk_ref 相對 clk 的 phase，
 * 波形、Δφ、edge 時間表全部由 clockTrace 產生的 event 資料算出來，沒有任何寫死的座標。
 */
export function ClockPlayground() {
  const [period, setPeriod] = useState(100) // 假設時間單位為 ps
  const [dutyPct, setDutyPct] = useState(50)
  const [phasePct, setPhasePct] = useState(25)

  const duty = dutyPct / 100
  const phase = phasePct / 100
  const freqGHz = 1000 / period

  const clk = useMemo(() => clockTrace('clk', period, CYCLES, { duty }), [period, duty])
  const clkRef = useMemo(() => clockTrace('clk_ref', period, CYCLES, { duty: 0.5, phase, kind: 'phase' }), [period, phase])

  const clkEdges = useMemo(() => edgesOf(clk), [clk])
  const refEdges = useMemo(() => edgesOf(clkRef), [clkRef])

  const tHigh = duty * period
  const tLow = (1 - duty) * period
  const deltaPhi = phase * period

  return (
    <div className="panel">
      <div className="panel-title">
        Clock Playground
        <span className="chip">互動</span>
      </div>
      <div className="control-row">
        <label>
          period T = {period} ps
          <input type="range" min={40} max={200} step={5} value={period} onChange={(e) => setPeriod(Number(e.target.value))} style={{ width: 180 }} />
        </label>
        <label>
          duty = {dutyPct}%
          <input type="range" min={10} max={90} step={5} value={dutyPct} onChange={(e) => setDutyPct(Number(e.target.value))} style={{ width: 180 }} />
        </label>
        <label>
          clk_ref phase = {phasePct}%
          <input type="range" min={0} max={90} step={5} value={phasePct} onChange={(e) => setPhasePct(Number(e.target.value))} style={{ width: 180 }} />
        </label>
      </div>
      <div className="small muted" style={{ margin: '0.2em 0 0.6em' }}>
        f = 1 / T = <b className="mono">{fmtNum(freqGHz)} GHz</b>（把時間單位當成 ps 來看；T 越小、f 越大——兩者成<b>反比</b>，不是正比）
      </div>
      <ClockWaveform
        signals={[clk, clkRef]}
        tEnd={CYCLES * period + period}
        unit=" ps"
        zoomable={false}
        highlight={['clk']}
        deltaBetween={{ a: 'clk', b: 'clk_ref', label: 'Δφ(clk→clk_ref)' }}
      />
      <div className="kv" style={{ margin: '0.6em 0' }}>
        <dt>T_high = duty × T</dt>
        <dd>{fmtNum(tHigh)} ps</dd>
        <dt>T_low = (1 − duty) × T</dt>
        <dd>{fmtNum(tLow)} ps</dd>
        <dt>Δt(clk → clk_ref)</dt>
        <dd>
          phase × T = {fmtNum(deltaPhi)} ps　（= {fmtNum(phase * 360)}°，一整圈 360° 對應一個 T）
        </dd>
      </div>
      <div className="scroll-x">
        <table className="state-table">
          <thead>
            <tr>
              <th>#</th>
              <th>clk edge</th>
              <th>t (ps)</th>
              <th>與上一個同型 edge 的間隔</th>
              <th>clk_ref 對應 edge</th>
            </tr>
          </thead>
          <tbody>
            {clkEdges.slice(0, 8).map((e, i) => {
              const prevSame = clkEdges.slice(0, i).reverse().find((x) => x.type === e.type)
              const refMatch = refEdges.find((r) => r.type === e.type && r.t >= e.t)
              return (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{e.type === 'rising' ? '↑ rising' : '↓ falling'}</td>
                  <td>{fmtNum(e.t)}</td>
                  <td>{prevSame ? `${fmtNum(e.t - prevSame.t)} ps（= T）` : '—'}</td>
                  <td>{refMatch ? `${fmtNum(refMatch.t)} ps（Δ = ${fmtNum(refMatch.t - e.t)} ps）` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="small muted">
        試試看：把 period 從 100 拉到 200，再看 edge 時間表怎麼整批往後移；把 duty 壓到 20%，比較 T_high 與 T_low 的差異；把 phase 拉到接近
        90%，看 Δφ 逼近一整個 T。
      </div>
    </div>
  )
}
