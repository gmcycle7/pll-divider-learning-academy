import { useMemo, useState } from 'react'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import type { SignalTrace } from '@/models/divider/types'
import { fmtNum } from '@/utils/format'

/**
 * 互動 demo：拖曳 D transition 時間，觀察 DFF 的 capture 結果與 setup/hold violation。
 * 時間單位 ps，clock edge 在 t=100。
 */
export function SetupHoldDemo({ tsetup = 15, thold = 10, tcq = 12, title }: { tsetup?: number; thold?: number; tcq?: number; title?: string }) {
  const edge = 100
  const [tD, setTD] = useState(60)
  const [dFrom, setDFrom] = useState<0 | 1>(0)
  const dTo: 0 | 1 = dFrom ? 0 : 1
  const status = useMemo(() => {
    if (tD <= edge - tsetup) return 'ok-new' as const
    if (tD >= edge + thold) return 'ok-old' as const
    return 'violation' as const
  }, [tD, tsetup, thold])
  const traces: SignalTrace[] = useMemo(() => {
    const clk: SignalTrace = { name: 'clk', kind: 'clock', events: [{ t: 0, v: 0 }, { t: edge, v: 1 }, { t: edge + 50, v: 0 }, { t: edge + 100, v: 1 }, { t: edge + 150, v: 0 }] }
    const d: SignalTrace = { name: 'd', kind: 'control', events: [{ t: 0, v: dFrom }, { t: tD, v: dTo }] }
    let qEvents: { t: number; v: 0 | 1 }[]
    if (status === 'ok-new') qEvents = [{ t: 0, v: dFrom }, { t: edge + tcq, v: dTo }]
    else if (status === 'ok-old') qEvents = [{ t: 0, v: dFrom }, { t: edge + 100 + tcq, v: dTo }]
    else qEvents = [{ t: 0, v: dFrom }, { t: edge + tcq, v: dTo }, { t: edge + tcq + 8, v: dFrom }, { t: edge + tcq + 16, v: dTo }, { t: edge + tcq + 40, v: dFrom }, { t: edge + 100 + tcq, v: dTo }]
    const q: SignalTrace = { name: 'q', kind: 'output', events: qEvents }
    return [clk, d, q]
  }, [tD, dFrom, dTo, status, tcq])
  return (
    <div className="panel">
      <div className="panel-title">{title ?? 'Setup / Hold 互動 demo'}</div>
      <div className="control-row">
        <label>
          D 改變的時間 t<sub>D</sub> = {tD} ps
          <input type="range" min={20} max={180} step={1} value={tD} onChange={(e) => setTD(Number(e.target.value))} style={{ width: 240 }} />
        </label>
        <label>
          D 從 {dFrom} → {dTo}
          <button className="btn btn-sm" onClick={() => setDFrom((x) => (x ? 0 : 1))}>
            反向
          </button>
        </label>
        <span className="small muted">
          clock edge @ 100 ps　t<sub>setup</sub> = {tsetup} ps　t<sub>hold</sub> = {thold} ps　t<sub>CQ</sub> = {tcq} ps
        </span>
      </div>
      <ClockWaveform
        signals={traces}
        tEnd={260}
        unit=" ps"
        pxPerPeriod={2.6}
        shades={[
          { t0: edge - tsetup, t1: edge, kind: 'danger', label: 'setup window', signal: 'd' },
          { t0: edge, t1: edge + thold, kind: 'danger', label: 'hold window', signal: 'd' },
        ]}
        markers={[
          { t: edge, label: 'capture edge', kind: 'edge' },
          { t: tD, label: 'D 改變', kind: 'input', signal: 'd' },
        ]}
        zoomable={false}
        measure={false}
        xSignals={status === 'violation' ? ['q'] : []}
      />
      <div className={`callout ${status === 'violation' ? 'callout-pitfall' : 'callout-method'}`}>
        {status === 'ok-new' ? (
          <>
            <div className="callout-title">正常 capture：抓到新值 {dTo}</div>
            D 在 edge 前 {fmtNum(edge - tD)} ps 就穩定，大於 t<sub>setup</sub> = {tsetup} ps。Q 在 edge 後 t<sub>CQ</sub> = {tcq} ps 變成 {dTo}。
          </>
        ) : status === 'ok-old' ? (
          <>
            <div className="callout-title">正常 capture：抓到舊值 {dFrom}</div>
            D 在 edge 後 {fmtNum(tD - edge)} ps 才改變，大於 t<sub>hold</sub> = {thold} ps，所以這個 edge 抓到的是舊值；新值要等下一個 edge（200 ps）才被抓進去。
          </>
        ) : (
          <>
            <div className="callout-title">{tD < edge ? 'Setup violation（資料來不及穩定）' : 'Hold violation（資料太早改變）'}</div>
            D 在 capture edge 附近 {fmtNum(Math.abs(tD - edge))} ps 內改變，落在 setup/hold window 中。DFF 的內部 latch 沒有足夠時間完成 regeneration，
            Q 可能延遲很久才決定、可能振盪、也可能停在中間電位——這就是 <b>metastability</b>。波形上以虛線表示「不確定」。
          </>
        )}
      </div>
    </div>
  )
}

/** Pulse width demo：clock pulse 太窄時 flop 無法正確觸發 */
export function PulseWidthDemo({ minPulse = 25, title }: { minPulse?: number; title?: string }) {
  const [width, setWidth] = useState(40)
  const ok = width >= minPulse
  const traces: SignalTrace[] = useMemo(() => {
    const clk: SignalTrace = { name: 'clk_gated', kind: 'clock', events: [{ t: 0, v: 0 }, { t: 60, v: 1 }, { t: 60 + width, v: 0 }, { t: 200, v: 1 }, { t: 250, v: 0 }] }
    const q: SignalTrace = { name: 'q', kind: 'output', events: ok ? [{ t: 0, v: 0 }, { t: 72, v: 1 }, { t: 212, v: 0 }] : [{ t: 0, v: 0 }, { t: 72, v: 1 }, { t: 80, v: 0 }, { t: 212, v: 1 }] }
    return [clk, q]
  }, [width, ok])
  return (
    <div className="panel">
      <div className="panel-title">{title ?? 'Minimum pulse width 互動 demo'}</div>
      <div className="control-row">
        <label>
          clock high pulse 寬度 = {width} ps
          <input type="range" min={5} max={80} value={width} onChange={(e) => setWidth(Number(e.target.value))} style={{ width: 220 }} />
        </label>
        <span className="small muted">DFF 最小 pulse width = {minPulse} ps</span>
      </div>
      <ClockWaveform signals={traces} tEnd={300} unit=" ps" pxPerPeriod={2.3} zoomable={false} measure={false} xSignals={ok ? [] : ['q']} showPulseWidths={['clk_gated']} shades={[{ t0: 60, t1: 60 + width, kind: ok ? 'safe' : 'danger', signal: 'clk_gated' }]} />
      <div className={`callout ${ok ? 'callout-method' : 'callout-pitfall'}`}>
        {ok ? (
          <>
            <div className="callout-title">pulse 夠寬：flop 正常觸發</div>
            這不是 setup 也不是 hold 檢查——它檢查的是 clock 本身。D 再穩定，clock pulse 太窄時 master latch 沒時間把值傳給 slave。
          </>
        ) : (
          <>
            <div className="callout-title">Pulse-width violation（runt pulse）</div>
            {width} ps &lt; {minPulse} ps。這種 runt pulse 常見於 clock gating、clock MUX 切換、或 ripple 中間節點的短暫錯誤。flop 可能不觸發、部分觸發、或進入 metastable。
          </>
        )}
      </div>
    </div>
  )
}
