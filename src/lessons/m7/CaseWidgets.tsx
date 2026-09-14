import { useMemo, useState } from 'react'
import { ClockWaveform, clockTrace } from '@/components/waveform/ClockWaveform'
import type { SignalTrace } from '@/models/divider/types'
import { simulate } from '@/models/divider/engine'
import { detectRuntPulses } from '@/models/divider/analysis'
import { dualMod12, dualMod12Glitchy } from '@/models/divider/examples'
import { clockGateLatch } from './cases-models'
import { fmtNum } from '@/utils/format'

const EDGE = 100

/* ------------------------------------------------------------------ Setup violation demo */
/**
 * 專門示範 setup violation：滑桿預設落在 setup window 內。
 * 把 D 的轉換時間當成 arrival time，edge − tsetup 當成 required time，直接顯示 slack。
 */
export function SetupViolationDemo({ tsetup = 15, thold = 10, tcq = 12 }: { tsetup?: number; thold?: number; tcq?: number }) {
  const [tD, setTD] = useState(92)
  const required = EDGE - tsetup
  const slack = required - tD
  const status = tD <= required ? 'ok' : tD < EDGE + thold ? 'violation' : 'late'
  const traces = useMemo<SignalTrace[]>(() => {
    const clk: SignalTrace = { name: 'clk', kind: 'clock', events: [{ t: 0, v: 0 }, { t: EDGE, v: 1 }, { t: EDGE + 50, v: 0 }, { t: EDGE + 100, v: 1 }, { t: EDGE + 150, v: 0 }] }
    const d: SignalTrace = { name: 'd', kind: 'control', events: [{ t: 0, v: 0 }, { t: tD, v: 1 }] }
    const q: SignalTrace = {
      name: 'q',
      kind: 'output',
      events:
        status === 'ok'
          ? [{ t: 0, v: 0 }, { t: EDGE + tcq, v: 1 }]
          : status === 'late'
            ? [{ t: 0, v: 0 }, { t: EDGE + 100 + tcq, v: 1 }]
            : [{ t: 0, v: 0 }, { t: EDGE + tcq, v: 1 }, { t: EDGE + tcq + 10, v: 0 }, { t: EDGE + tcq + 22, v: 1 }, { t: EDGE + tcq + 45, v: 0 }, { t: EDGE + 100 + tcq, v: 1 }],
    }
    return [clk, d, q]
  }, [tD, status, tcq])
  return (
    <div className="panel">
      <div className="panel-title">
        Demo 1：Setup violation <span className="chip chip-danger">資料來不及</span>
      </div>
      <div className="control-row">
        <label>
          D 改變的時間（arrival）t<sub>D</sub> = {tD} ps
          <input type="range" min={40} max={130} step={1} value={tD} onChange={(e) => setTD(Number(e.target.value))} style={{ width: 260 }} />
        </label>
        <span className="small muted">
          capture edge @ {EDGE} ps　required = edge − t<sub>setup</sub> = {required} ps
        </span>
      </div>
      <ClockWaveform
        signals={traces}
        tEnd={260}
        unit=" ps"
        pxPerPeriod={2.6}
        zoomable={false}
        measure={false}
        shades={[{ t0: EDGE - tsetup, t1: EDGE, kind: 'danger', label: 'setup window', signal: 'd' }]}
        markers={[
          { t: EDGE, label: 'capture edge', kind: 'edge' },
          { t: required, label: 'required', kind: 'window', signal: 'd' },
          { t: tD, label: 'arrival', kind: 'input', signal: 'd' },
        ]}
        xSignals={status === 'violation' ? ['q'] : []}
      />
      <div className={`callout ${status === 'violation' ? 'callout-pitfall' : 'callout-method'}`}>
        <div className="callout-title">
          setup slack = required − arrival = {required} − {tD} = <b className={slack < 0 ? 'slack-bad' : 'slack-ok'}>{fmtNum(slack)} ps</b>
        </div>
        {status === 'ok' ? (
          <>資料在 required time 之前就到了。edge 抓到新值，q 在 edge 後 t<sub>CQ</sub> = {tcq} ps 變成 1。要把 slack 變負，把滑桿往右拉到 {required} ps 之後。</>
        ) : status === 'violation' ? (
          <>
            資料<b>來不及</b>：D 在 edge 前只有 {fmtNum(EDGE - tD)} ps 就穩定，小於 t<sub>setup</sub> = {tsetup} ps。flop 內部的 master latch 還沒把新值推到穩定點就被關上，q 可能晚很久才決定、也可能先動再彈回（虛線）。<b>修法</b>：讓資料早一點到（縮短 tCQ + logic）、或把 edge 往後移（拉長 T<sub>clk</sub>）。這就是 Fmax 的來源。
          </>
        ) : (
          <>D 在 hold window 之後才改變：這個 edge 安全地抓到<b>舊值</b> 0，新值要等下一個 edge（200 ps）。這不是 violation，但你的資料晚了一整個 cycle——若這是 divider 的 next-state，除數就錯了。</>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Hold violation demo */
/**
 * 專門示範 hold violation：滑桿預設落在 hold window 內。
 * hold slack = (D 改變時間) − (edge + thold)：資料太早改變就是負的。
 */
export function HoldViolationDemo({ tsetup = 15, thold = 10, tcq = 12 }: { tsetup?: number; thold?: number; tcq?: number }) {
  const [tD, setTD] = useState(104)
  const required = EDGE + thold
  const slack = tD - required
  const status = tD >= required ? 'ok' : tD > EDGE - tsetup ? 'violation' : 'early'
  const traces = useMemo<SignalTrace[]>(() => {
    const clk: SignalTrace = { name: 'clk', kind: 'clock', events: [{ t: 0, v: 0 }, { t: EDGE, v: 1 }, { t: EDGE + 50, v: 0 }, { t: EDGE + 100, v: 1 }, { t: EDGE + 150, v: 0 }] }
    // 這裡的情境：D 在 edge 之前已經是 1（前一級 flop 在更早的 edge 送出），edge 之後太快又變回 0
    const d: SignalTrace = { name: 'd', kind: 'control', events: [{ t: 0, v: 1 }, { t: tD, v: 0 }] }
    const q: SignalTrace = {
      name: 'q',
      kind: 'output',
      events:
        status === 'ok'
          ? [{ t: 0, v: 0 }, { t: EDGE + tcq, v: 1 }, { t: EDGE + 100 + tcq, v: 0 }]
          : status === 'early'
            ? [{ t: 0, v: 0 }]
            : [{ t: 0, v: 0 }, { t: EDGE + tcq, v: 1 }, { t: EDGE + tcq + 8, v: 0 }, { t: EDGE + tcq + 20, v: 1 }, { t: EDGE + tcq + 42, v: 0 }],
    }
    return [clk, d, q]
  }, [tD, status, tcq])
  return (
    <div className="panel">
      <div className="panel-title">
        Demo 2：Hold violation <span className="chip chip-info">資料太早改變</span>
      </div>
      <div className="control-row">
        <label>
          D 改變的時間 t<sub>D</sub> = {tD} ps
          <input type="range" min={70} max={160} step={1} value={tD} onChange={(e) => setTD(Number(e.target.value))} style={{ width: 260 }} />
        </label>
        <span className="small muted">
          capture edge @ {EDGE} ps　hold required = edge + t<sub>hold</sub> = {required} ps
        </span>
      </div>
      <ClockWaveform
        signals={traces}
        tEnd={260}
        unit=" ps"
        pxPerPeriod={2.6}
        zoomable={false}
        measure={false}
        shades={[{ t0: EDGE, t1: EDGE + thold, kind: 'danger', label: 'hold window', signal: 'd' }]}
        markers={[
          { t: EDGE, label: 'capture edge', kind: 'edge' },
          { t: required, label: 'hold required', kind: 'window', signal: 'd' },
          { t: tD, label: 'D 改變', kind: 'input', signal: 'd' },
        ]}
        xSignals={status === 'violation' ? ['q'] : []}
      />
      <div className={`callout ${status === 'violation' ? 'callout-pitfall' : 'callout-method'}`}>
        <div className="callout-title">
          hold slack = arrival − (edge + t<sub>hold</sub>) = {tD} − {required} = <b className={slack < 0 ? 'slack-bad' : 'slack-ok'}>{fmtNum(slack)} ps</b>
        </div>
        {status === 'ok' ? (
          <>D 在 edge 之後撐了 {fmtNum(tD - EDGE)} ps 才改變，大於 t<sub>hold</sub>。edge 抓到 1，q 在 edge 後 t<sub>CQ</sub> 變 1；新的 0 要等下一個 edge。</>
        ) : status === 'violation' ? (
          <>
            資料<b>太早改變</b>：edge 才剛過 {fmtNum(tD - EDGE)} ps，D 就從 1 變 0，flop 的 master 還沒完全關上，新值 0 漏進去和舊值 1 打架。注意：<b>拉長 T<sub>clk</sub> 完全沒有用</b>——hold 看的是同一個 edge 之後的事。<b>修法</b>：讓資料晚一點改變（在 launch flop 之後加 delay / buffer，或提高 t<sub>CQ,min</sub>），或把 capture clock 提早（負 skew）。
          </>
        ) : (
          <>D 在 setup window 之前就變成 0：這個 edge 直接抓到 0，q 維持 0。這是正常 capture（只是資料變得早）。</>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Recovery / removal demo */
/**
 * 非同步 reset 釋放（rst_n 0 → 1）相對 clock edge 的時間：
 *   釋放早於 edge − trecovery ⇒ 這個 edge 正常 capture（q toggle）
 *   釋放晚於 edge + tremoval  ⇒ 這個 edge 仍在 reset 中被忽略，下一個 edge 才 capture
 *   落在中間 ⇒ 不確定（metastable）
 */
export function RecoveryRemovalDemo({ trec = 12, trem = 8, tcq = 12 }: { trec?: number; trem?: number; tcq?: number }) {
  const [tR, setTR] = useState(60)
  const status = tR <= EDGE - trec ? 'captured' : tR >= EDGE + trem ? 'masked' : 'violation'
  const traces = useMemo<SignalTrace[]>(() => {
    const clk: SignalTrace = { name: 'clk', kind: 'clock', events: [{ t: 0, v: 0 }, { t: EDGE, v: 1 }, { t: EDGE + 50, v: 0 }, { t: EDGE + 100, v: 1 }, { t: EDGE + 150, v: 0 }] }
    const rst: SignalTrace = { name: 'rst_n', kind: 'reset', events: [{ t: 0, v: 0 }, { t: tR, v: 1 }] }
    const d: SignalTrace = { name: 'd (= q̄)', kind: 'data', events: [{ t: 0, v: 1 }, ...(status === 'captured' ? [{ t: EDGE + tcq + 6, v: 0 as const }] : status === 'masked' ? [{ t: EDGE + 100 + tcq + 6, v: 0 as const }] : [])] }
    const q: SignalTrace = {
      name: 'q',
      kind: 'output',
      events:
        status === 'captured'
          ? [{ t: 0, v: 0 }, { t: EDGE + tcq, v: 1 }, { t: EDGE + 100 + tcq, v: 0 }]
          : status === 'masked'
            ? [{ t: 0, v: 0 }, { t: EDGE + 100 + tcq, v: 1 }]
            : [{ t: 0, v: 0 }, { t: EDGE + tcq, v: 1 }, { t: EDGE + tcq + 9, v: 0 }, { t: EDGE + tcq + 24, v: 1 }, { t: EDGE + tcq + 50, v: 0 }, { t: EDGE + 100 + tcq, v: 1 }],
    }
    return [clk, rst, d, q]
  }, [tR, status, tcq])
  return (
    <div className="panel">
      <div className="panel-title">
        Demo 4：Reset recovery / removal <span className="chip">rst_n 釋放相對 edge</span>
      </div>
      <div className="control-row">
        <label>
          rst_n 釋放時間 t<sub>R</sub> = {tR} ps
          <input type="range" min={30} max={150} step={1} value={tR} onChange={(e) => setTR(Number(e.target.value))} style={{ width: 260 }} />
        </label>
        <span className="small muted">
          edge @ {EDGE} ps　t<sub>recovery</sub> = {trec} ps　t<sub>removal</sub> = {trem} ps
        </span>
      </div>
      <ClockWaveform
        signals={traces}
        tEnd={260}
        unit=" ps"
        pxPerPeriod={2.6}
        zoomable={false}
        measure={false}
        shades={[
          { t0: EDGE - trec, t1: EDGE, kind: 'danger', label: 'recovery', signal: 'rst_n' },
          { t0: EDGE, t1: EDGE + trem, kind: 'danger', label: 'removal', signal: 'rst_n' },
        ]}
        markers={[
          { t: EDGE, label: 'edge', kind: 'edge' },
          { t: tR, label: 'reset release', kind: 'input', signal: 'rst_n' },
        ]}
        xSignals={status === 'violation' ? ['q'] : []}
      />
      <div className={`callout ${status === 'violation' ? 'callout-pitfall' : 'callout-method'}`}>
        {status === 'captured' ? (
          <>
            <div className="callout-title">recovery 滿足：edge 100 ps 正常 capture</div>
            reset 在 edge 前 {fmtNum(EDGE - tR)} ps 就釋放（≥ t<sub>recovery</sub>），flop 有時間離開 reset 狀態；edge 抓到 d = 1，q 開始 toggle。divider 的第一個 output edge 在 {EDGE + tcq} ps。
          </>
        ) : status === 'masked' ? (
          <>
            <div className="callout-title">removal 滿足：edge 100 ps 被 reset 蓋住，下一個 edge 才開始</div>
            reset 在 edge 後 {fmtNum(tR - EDGE)} ps 才釋放（≥ t<sub>removal</sub>），edge 100 ps 時 flop 仍被 reset 牢牢壓住，安全地忽略。divider 從 200 ps 那個 edge 開始——<b>輸出相位晚了一個 cycle</b>，這在多個 divider 要對齊相位時很重要。
          </>
        ) : (
          <>
            <div className="callout-title">recovery / removal violation</div>
            reset 在 edge 附近 {fmtNum(Math.abs(tR - EDGE))} ps 內釋放。flop 一半在 reset、一半在 capture：q 可能 toggle、可能不 toggle、可能 metastable。對 divider 來說，這表示<b>起始相位不確定</b>，而且若 reset 是多個 flop 共用的，不同 flop 可能做出不同決定 ⇒ 進入 illegal state。
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Runt pulse table（clock gating） */
/**
 * 用 engine 跑 dualMod12Glitchy（combinational gating）與 dualMod12（falling-edge 重同步）與 clockGateLatch（latch-based），
 * 以 real delay 波形 + detectRuntPulses 列出 runt pulse。
 */
export function RuntPulseTable({ minWidth: initialMin = 30 }: { minWidth?: number }) {
  const [minWidth, setMinWidth] = useState(initialMin)
  const [which, setWhich] = useState<'glitchy' | 'resync' | 'latch'>('glitchy')
  const T = 100
  const data = useMemo(() => {
    if (which === 'glitchy') {
      const r = simulate(dualMod12Glitchy, 10, { period: T, delayMode: 'real' }, () => ({ sel: 1 }))
      return { traces: r.sim.getTraces(['clk', 'q0', 'en', 'div_out']), signal: 'div_out', title: 'combinational gating：en = ¬sel OR q0 直接 AND clk' }
    }
    if (which === 'resync') {
      const r = simulate(dualMod12, 10, { period: T, delayMode: 'real' }, () => ({ sel: 1 }))
      return { traces: r.sim.getTraces(['clk', 'q0', 'en', 'div_out']), signal: 'div_out', title: 'falling-edge 重同步：en 只在 clk 下降緣更新' }
    }
    const r = simulate(clockGateLatch, 10, { period: T, delayMode: 'real', inputLead: 0.75 }, (k) => ({ en: k % 4 === 2 || k % 4 === 3 ? 0 : 1 }))
    return { traces: r.sim.getTraces(['clk', 'en', 'en_l', 'gclk']), signal: 'gclk', title: 'latch-based clock gating：en 在 clk = 1 期間改變也被 latch 擋住' }
  }, [which])
  const runts = useMemo(() => detectRuntPulses(data.traces.filter((t) => t.name === data.signal), minWidth), [data, minWidth])
  return (
    <div className="panel">
      <div className="panel-title">
        Demo 3b：clock gating 的 runt pulse 檢查 <span className="chip chip-accent">engine real-delay 波形 + detectRuntPulses</span>
      </div>
      <div className="control-row">
        <span className="btn-group">
          <button className={`btn btn-sm ${which === 'glitchy' ? 'active' : ''}`} onClick={() => setWhich('glitchy')}>
            combinational gating（錯）
          </button>
          <button className={`btn btn-sm ${which === 'resync' ? 'active' : ''}`} onClick={() => setWhich('resync')}>
            falling-edge 重同步
          </button>
          <button className={`btn btn-sm ${which === 'latch' ? 'active' : ''}`} onClick={() => setWhich('latch')}>
            latch-based ICG
          </button>
        </span>
        <label>
          最小允許 pulse width = {minWidth} ps
          <input type="range" min={10} max={60} step={1} value={minWidth} onChange={(e) => setMinWidth(Number(e.target.value))} />
        </label>
      </div>
      <div className="small muted" style={{ marginBottom: '0.3em' }}>{data.title}</div>
      <ClockWaveform signals={data.traces} tStart={0} tEnd={6 * T} period={T} showPulseWidths={[data.signal]} highlight={[data.signal]} zoomable={false} shades={runts.filter((r) => r.t1 <= 6 * T).map((r) => ({ t0: r.t0, t1: r.t1, kind: 'danger' as const, signal: r.signal }))} />
      {runts.length ? (
        <div className="scroll-x">
          <table className="timing-table">
            <thead>
              <tr>
                <th>訊號</th>
                <th>開始 (ps)</th>
                <th>結束 (ps)</th>
                <th>寬度 (ps)</th>
                <th>電位</th>
                <th>判定</th>
              </tr>
            </thead>
            <tbody>
              {runts.slice(0, 8).map((r, i) => (
                <tr key={i}>
                  <td>{r.signal}</td>
                  <td>{fmtNum(r.t0)}</td>
                  <td>{fmtNum(r.t1)}</td>
                  <td className="slack-bad">{fmtNum(r.width)}</td>
                  <td>{r.level}</td>
                  <td style={{ fontFamily: 'var(--font)' }}>runt：{fmtNum(r.width)} &lt; {minWidth} ps ⇒ pulse-width violation</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="callout callout-method">
          <div className="callout-title">沒有比 {minWidth} ps 窄的 pulse</div>
          gating 訊號只在 clk 為 low 時改變，AND 的輸出不會被截成半截。
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ 練習：clock gating cell 的波形 */
export function ClockGatingExercise() {
  const T = 100
  const traces = useMemo(() => {
    const r = simulate(dualMod12Glitchy, 8, { period: T, delayMode: 'real' }, () => ({ sel: 1 }))
    return r.sim.getTraces(['clk', 'q0', 'en', 'div_out'])
  }, [])
  return (
    <div className="panel">
      <div className="panel-title">練習波形：一個 clock gating cell（real delay）</div>
      <p className="small muted">
        gclk（這裡叫 div_out）= clk AND en。en 由 q0 經一個 OR gate 算出，q0 在 clk rising 後 t<sub>CQ</sub> = 8 ps 改變。用滑鼠在波形上點兩下量測寬度。
      </p>
      <ClockWaveform signals={traces} tStart={100} tEnd={5 * T} period={T} highlight={['div_out']} showPulseWidths={['div_out']} />
    </div>
  )
}

/* ------------------------------------------------------------------ Quiz 用的波形（純資料） */
/**
 * 給 waveform 選擇題用：四種情境的 clk / d / q trace。
 * edge 在 100 ps；tsetup = 15、thold = 10、tcq = 12。
 */
export function violationTraces(kind: 'setup' | 'hold' | 'pw' | 'ok'): SignalTrace[] {
  const tcq = 12
  if (kind === 'pw') {
    // clock pulse 太窄：第一個 pulse 只有 8 ps
    const clk: SignalTrace = { name: 'clk', kind: 'clock', events: [{ t: 0, v: 0 }, { t: 100, v: 1 }, { t: 108, v: 0 }, { t: 200, v: 1 }, { t: 250, v: 0 }] }
    const d: SignalTrace = { name: 'd', kind: 'control', events: [{ t: 0, v: 0 }, { t: 40, v: 1 }] }
    const q: SignalTrace = { name: 'q', kind: 'output', events: [{ t: 0, v: 0 }, { t: 100 + tcq, v: 1 }, { t: 100 + tcq + 6, v: 0 }, { t: 200 + tcq, v: 1 }] }
    return [clk, d, q]
  }
  const clk: SignalTrace = clockTrace('clk', 100, 3, { startLow: 100 })
  if (kind === 'setup') {
    const d: SignalTrace = { name: 'd', kind: 'control', events: [{ t: 0, v: 0 }, { t: 94, v: 1 }] }
    const q: SignalTrace = { name: 'q', kind: 'output', events: [{ t: 0, v: 0 }, { t: 100 + tcq, v: 1 }, { t: 100 + tcq + 10, v: 0 }, { t: 100 + tcq + 24, v: 1 }, { t: 100 + tcq + 40, v: 0 }, { t: 200 + tcq, v: 1 }] }
    return [clk, d, q]
  }
  if (kind === 'hold') {
    const d: SignalTrace = { name: 'd', kind: 'control', events: [{ t: 0, v: 1 }, { t: 103, v: 0 }] }
    const q: SignalTrace = { name: 'q', kind: 'output', events: [{ t: 0, v: 0 }, { t: 100 + tcq, v: 1 }, { t: 100 + tcq + 8, v: 0 }, { t: 100 + tcq + 20, v: 1 }, { t: 100 + tcq + 40, v: 0 }] }
    return [clk, d, q]
  }
  const d: SignalTrace = { name: 'd', kind: 'control', events: [{ t: 0, v: 0 }, { t: 50, v: 1 }, { t: 150, v: 0 }] }
  const q: SignalTrace = { name: 'q', kind: 'output', events: [{ t: 0, v: 0 }, { t: 100 + tcq, v: 1 }, { t: 200 + tcq, v: 0 }] }
  return [clk, d, q]
}

/**
 * PMUX 切換：select 落在 safe window 外 ⇒ 輸出出現被截短的 pulse（純資料，給 quiz 用）。
 * Tvco = 80 ps，ph0 high 於 20–60、100–140、180–220、260–300；ph1 落後 Tvco/8 = 10 ps。
 * sel 一開始選 ph1，在 t = 215 切回 ph0：215 之前輸出跟 ph1（190 ↑），215 之後跟 ph0（220 ↓）
 * ⇒ 190–220 這個 pulse 只有 30 ps，比正常的 40 ps 窄。
 */
export function pmuxRuntTraces(): SignalTrace[] {
  const Tv = 80
  const ph0 = clockTrace('ph0', Tv, 4, { startLow: 20 })
  const ph1 = clockTrace('ph1', Tv, 4, { startLow: 20, phase: 1 / 8 })
  const sel: SignalTrace = { name: 'sel', kind: 'control', events: [{ t: 0, v: 1 }, { t: 215, v: 0 }] }
  const out: SignalTrace = {
    name: 'pmux_out',
    kind: 'output',
    events: [{ t: 0, v: 0 }, { t: 30, v: 1 }, { t: 70, v: 0 }, { t: 110, v: 1 }, { t: 150, v: 0 }, { t: 190, v: 1 }, { t: 220, v: 0 }, { t: 260, v: 1 }, { t: 300, v: 0 }],
  }
  return [ph0, ph1, sel, out]
}
