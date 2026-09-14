import { useMemo, useState } from 'react'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import type { SignalTrace, TraceEvent } from '@/models/divider/types'
import { Math as M } from '@/components/content'
import { fmtNum } from '@/utils/format'

/* ------------------------------------------------------------------ Logical effort calculator */
const GATES: { name: string; g: number; p: number; note: string }[] = [
  { name: 'INV', g: 1, p: 1, note: '參考：NMOS 1 / PMOS 2（γ = 2）' },
  { name: 'NAND2', g: 4 / 3, p: 2, note: 'NMOS 2-stack 各 2 倍寬，PMOS 並聯' },
  { name: 'NOR2', g: 5 / 3, p: 2, note: 'PMOS 2-stack 各 4 倍寬：輸入電容最大' },
  { name: 'NAND3', g: 5 / 3, p: 3, note: 'NMOS 3-stack 各 3 倍寬' },
  { name: 'NOR3', g: 7 / 3, p: 3, note: 'PMOS 3-stack 各 6 倍寬' },
  { name: 'XOR2', g: 2, p: 4, note: '兩級或 pass-gate 結構的等效值（實作差異大）' },
]

/**
 * delay = τ (p + g·h)
 *   τ = 該製程一個「無寄生、fanout 1」inverter 的 delay（ps）
 *   p = parasitic delay（gate 自己的 drain 電容，以 τ 為單位）
 *   g = logical effort（同樣輸出電流下，輸入電容相對 inverter 的倍數）
 *   h = electrical effort（fanout）= C_out / C_in
 */
export function LogicalEffortCalculator() {
  const [tau, setTau] = useState(8)
  const [h, setH] = useState(4)
  const [gCustom, setGCustom] = useState(2.2)
  const [pCustom, setPCustom] = useState(2.5)
  const rows = [...GATES, { name: '自訂', g: gCustom, p: pCustom, note: '輸入你自己的 g 與 p' }]
  const fo4 = tau * (1 + 4)
  return (
    <div className="panel">
      <div className="panel-title">
        Logical effort 計算機 <span className="chip chip-accent">delay = τ (p + g·h)</span>
      </div>
      <div className="control-row">
        <label>
          τ = {tau} ps
          <input type="range" min={2} max={30} step={1} value={tau} onChange={(e) => setTau(Number(e.target.value))} />
        </label>
        <label>
          fanout h = {h}
          <input type="range" min={1} max={12} step={1} value={h} onChange={(e) => setH(Number(e.target.value))} />
        </label>
        <label>
          自訂 g
          <input type="number" step={0.1} value={gCustom} onChange={(e) => setGCustom(Number(e.target.value))} />
        </label>
        <label>
          自訂 p
          <input type="number" step={0.1} value={pCustom} onChange={(e) => setPCustom(Number(e.target.value))} />
        </label>
        <span className="small muted">
          FO4 = τ(1 + 4) = <b>{fmtNum(fo4)} ps</b>
        </span>
      </div>
      <div className="scroll-x">
        <table className="timing-table">
          <thead>
            <tr>
              <th>gate</th>
              <th>g</th>
              <th>p</th>
              <th>effort delay g·h</th>
              <th>total (p + g·h)</th>
              <th>delay (ps)</th>
              <th>相對 INV</th>
              <th style={{ fontFamily: 'var(--font)' }}>為什麼</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const total = r.p + r.g * h
              const inv = 1 + h
              return (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>{fmtNum(r.g)}</td>
                  <td>{fmtNum(r.p)}</td>
                  <td>{fmtNum(r.g * h)}</td>
                  <td>{fmtNum(total)}</td>
                  <td>
                    <b>{fmtNum(tau * total, 1)}</b>
                  </td>
                  <td>×{fmtNum(total / inv)}</td>
                  <td style={{ fontFamily: 'var(--font)' }}>{r.note}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="small muted">
        把 h 拉大：effort delay g·h 主導，NOR 比 NAND 差得更多（g 大）。把 h 拉到 1：parasitic p 主導，多輸入 gate 光是自己的 drain 電容就慢。divider 的 feedback logic 通常 fanout 小、gate 少，所以 p 與 tCQ 占比大——這是為什麼高速 divider 寧可用 NAND 也不用 NOR、寧可把 decode 拆成兩級也不用 NOR3。
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Series stack sizing */
function Nmos({ x, y, label }: { x: number; y: number; label?: string }) {
  return (
    <g>
      <line x1={x - 14} y1={y} x2={x - 6} y2={y} stroke="var(--fg)" strokeWidth={1.4} />
      <line x1={x - 6} y1={y - 10} x2={x - 6} y2={y + 10} stroke="var(--fg)" strokeWidth={1.6} />
      <line x1={x - 2} y1={y - 12} x2={x - 2} y2={y + 12} stroke="var(--fg)" strokeWidth={1.6} />
      <line x1={x - 2} y1={y - 10} x2={x + 10} y2={y - 10} stroke="var(--fg)" strokeWidth={1.4} />
      <line x1={x - 2} y1={y + 10} x2={x + 10} y2={y + 10} stroke="var(--fg)" strokeWidth={1.4} />
      <line x1={x + 10} y1={y - 10} x2={x + 10} y2={y - 18} stroke="var(--fg)" strokeWidth={1.4} />
      <line x1={x + 10} y1={y + 10} x2={x + 10} y2={y + 18} stroke="var(--fg)" strokeWidth={1.4} />
      {label ? (
        <text x={x - 18} y={y + 4} textAnchor="end" fontSize={10} fill="var(--fg-muted)">
          {label}
        </text>
      ) : null}
    </g>
  )
}

/**
 * n 個 NMOS 串聯：等效電阻 = n·R0/W。要維持與單一 inverter 相同的 pull-down 電阻，每個都要 n 倍寬，
 * 於是每個輸入看到 n 倍的 gate 電容 ⇒ logical effort 上升。
 */
export function StackSizingWidget() {
  const [n, setN] = useState(3)
  const [gamma, setGamma] = useState(2)
  const cInv = 1 + gamma
  const nandCin = n + gamma
  const norCin = n * gamma + 1
  return (
    <div className="panel">
      <div className="panel-title">
        Series stack：n 個 transistor 串聯要付出什麼 <span className="chip">R_eq 與 sizing</span>
      </div>
      <div className="control-row">
        <label>
          stack 深度 n = {n}
          <input type="range" min={1} max={4} step={1} value={n} onChange={(e) => setN(Number(e.target.value))} />
        </label>
        <label>
          γ（PMOS 為了等強度所需的寬度倍數）= {gamma}
          <input type="range" min={1} max={3} step={0.5} value={gamma} onChange={(e) => setGamma(Number(e.target.value))} />
        </label>
      </div>
      <div className="two-col">
        <svg viewBox="0 0 220 230" width={220} role="img" aria-label="series stack">
          <text x={20} y={16} fontSize={11} fill="var(--fg-muted)">
            {n}-stack pull-down（每個寬度 W = {n}）
          </text>
          <line x1={60} y1={26} x2={60} y2={40} stroke="var(--fg)" strokeWidth={1.4} />
          <text x={66} y={34} fontSize={10} fill="var(--fg)">
            OUT
          </text>
          {Array.from({ length: n }, (_, i) => (
            <Nmos key={i} x={50} y={58 + i * 40} label={`in${i}`} />
          ))}
          <line x1={60} y1={58 + (n - 1) * 40 + 18} x2={60} y2={58 + (n - 1) * 40 + 30} stroke="var(--fg)" strokeWidth={1.4} />
          <line x1={48} y1={58 + (n - 1) * 40 + 30} x2={72} y2={58 + (n - 1) * 40 + 30} stroke="var(--fg)" strokeWidth={1.6} />
          <text x={78} y={58 + (n - 1) * 40 + 34} fontSize={10} fill="var(--fg-muted)">
            GND
          </text>
          <text x={120} y={70} fontSize={11} fill="var(--fg)">
            R_eq = {n} × R₀ / W
          </text>
          <text x={120} y={88} fontSize={11} fill="var(--fg)">
            W = {n} ⇒ R_eq = R₀
          </text>
          <text x={120} y={106} fontSize={11} fill="var(--fg)">
            C_gate 每輸入 = {n} 單位
          </text>
        </svg>
        <div className="scroll-x">
          <table className="timing-table">
            <thead>
              <tr>
                <th>gate</th>
                <th>NMOS W</th>
                <th>PMOS W</th>
                <th>C_in（單位）</th>
                <th>g = C_in / C_inv</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>INV</td>
                <td>1</td>
                <td>{fmtNum(gamma)}</td>
                <td>{fmtNum(cInv)}</td>
                <td>1</td>
              </tr>
              <tr>
                <td>NAND{n}</td>
                <td>{n}（{n}-stack）</td>
                <td>{fmtNum(gamma)}（並聯）</td>
                <td>{fmtNum(nandCin)}</td>
                <td>
                  <b>{fmtNum(nandCin / cInv)}</b>
                </td>
              </tr>
              <tr>
                <td>NOR{n}</td>
                <td>1（並聯）</td>
                <td>{fmtNum(n * gamma)}（{n}-stack）</td>
                <td>{fmtNum(norCin)}</td>
                <td>
                  <b>{fmtNum(norCin / cInv)}</b>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="small muted">
            stack 越深、γ 越大，NOR 越吃虧：PMOS 本來就弱，再串聯就要放大 n·γ 倍。此外 stack 內部的節點（internal node）帶有寄生電容，要先被放電才輪到輸出——這是 p 隨 n 上升的原因，也是 body effect 讓上層 transistor 更弱的地方。
          </p>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ CML latch + regeneration curve */
function Res({ x, y }: { x: number; y: number }) {
  return <path d={`M ${x} ${y} l 0 6 l 5 4 l -10 8 l 10 8 l -10 8 l 5 4 l 0 6`} fill="none" stroke="var(--fg)" strokeWidth={1.4} />
}

/**
 * CML latch：track pair（D+/D−）+ cross-coupled latch pair + clock steering pair + tail current。
 * regeneration：ΔV(t) = ΔV₀ · e^{t/τ}，τ = C_L / g_m（latch pair）。
 */
export function CmlLatchFigure() {
  const [tau, setTau] = useState(12)
  const [dv0, setDv0] = useState(20)
  const [swing, setSwing] = useState(400)
  const [halfT, setHalfT] = useState(50)
  const tRes = tau * M_log(swing / dv0)
  const ok = tRes <= halfT
  // curve
  const W = 420
  const H = 240
  const padL = 46
  const padB = 30
  const tMax = M_max(halfT * 1.4, tRes * 1.2, 20)
  const xOf = (t: number) => padL + (t / tMax) * (W - padL - 10)
  const yOf = (v: number) => H - padB - (M_min(v, swing * 1.1) / (swing * 1.1)) * (H - padB - 16)
  const pts: string[] = []
  for (let i = 0; i <= 120; i++) {
    const t = (tMax * i) / 120
    const v = M_min(swing, dv0 * M_exp(t / tau))
    pts.push(`${xOf(t).toFixed(1)},${yOf(v).toFixed(1)}`)
  }
  return (
    <div className="panel">
      <div className="panel-title">
        CML latch 與 regeneration 曲線 <span className="chip chip-danger">指數模型，不是加法模型</span>
      </div>
      <div className="two-col">
        <svg viewBox="0 0 420 300" width="100%" role="img" aria-label="CML latch">
          {/* VDD */}
          <line x1={40} y1={22} x2={380} y2={22} stroke="var(--fg)" strokeWidth={1.6} />
          <text x={12} y={26} fontSize={11} fill="var(--fg)">
            VDD
          </text>
          <Res x={120} y={22} />
          <Res x={300} y={22} />
          <text x={128} y={50} fontSize={10} fill="var(--fg-muted)">
            R_L
          </text>
          <text x={308} y={50} fontSize={10} fill="var(--fg-muted)">
            R_L
          </text>
          {/* output nodes */}
          <line x1={120} y1={66} x2={120} y2={110} stroke="var(--fg)" strokeWidth={1.4} />
          <line x1={300} y1={66} x2={300} y2={110} stroke="var(--fg)" strokeWidth={1.4} />
          <circle cx={120} cy={90} r={3} fill="var(--accent)" />
          <circle cx={300} cy={90} r={3} fill="var(--accent)" />
          <text x={70} y={94} fontSize={11} fill="var(--accent)">
            OUT−
          </text>
          <text x={308} y={94} fontSize={11} fill="var(--accent)">
            OUT+
          </text>
          {/* track pair M1 M2 */}
          <line x1={120} y1={110} x2={110} y2={110} stroke="var(--fg)" strokeWidth={1.4} />
          <Nmos x={100} y={128} label="D+" />
          <line x1={110} y1={146} x2={110} y2={160} stroke="var(--fg)" strokeWidth={1.4} />
          <line x1={300} y1={110} x2={170} y2={110} stroke="var(--fg)" strokeWidth={1.4} />
          <Nmos x={160} y={128} label="D−" />
          <line x1={170} y1={146} x2={170} y2={160} stroke="var(--fg)" strokeWidth={1.4} />
          <line x1={110} y1={160} x2={170} y2={160} stroke="var(--fg)" strokeWidth={1.4} />
          <text x={92} y={176} fontSize={10} fill="var(--fg-muted)">
            track pair
          </text>
          {/* latch pair M3 M4 (cross-coupled) */}
          <line x1={120} y1={90} x2={250} y2={90} stroke="var(--fg)" strokeWidth={1.4} />
          <line x1={250} y1={90} x2={250} y2={110} stroke="var(--fg)" strokeWidth={1.4} />
          <Nmos x={240} y={128} label="" />
          <line x1={250} y1={146} x2={250} y2={160} stroke="var(--fg)" strokeWidth={1.4} />
          <line x1={300} y1={90} x2={320} y2={90} stroke="var(--fg)" strokeWidth={1.4} />
          <line x1={320} y1={90} x2={320} y2={110} stroke="var(--fg)" strokeWidth={1.4} />
          <Nmos x={310} y={128} label="" />
          <line x1={320} y1={146} x2={320} y2={160} stroke="var(--fg)" strokeWidth={1.4} />
          <line x1={250} y1={160} x2={320} y2={160} stroke="var(--fg)" strokeWidth={1.4} />
          {/* cross coupling: gate of left latch device ← OUT+, gate of right ← OUT− */}
          <path d="M 226 128 L 212 128 L 212 200 L 340 200 L 340 100 L 320 100" fill="none" stroke="var(--sig-control)" strokeWidth={1.2} strokeDasharray="4 2" />
          <path d="M 296 128 L 284 128 L 284 190 L 200 190 L 200 100 L 250 100" fill="none" stroke="var(--sig-control)" strokeWidth={1.2} strokeDasharray="4 2" />
          <text x={222} y={216} fontSize={10} fill="var(--sig-control)">
            cross-coupled latch pair（g_m）
          </text>
          {/* clock pair */}
          <line x1={140} y1={160} x2={140} y2={214} stroke="var(--fg)" strokeWidth={1.4} />
          <Nmos x={130} y={232} label="CK" />
          <line x1={285} y1={160} x2={285} y2={214} stroke="var(--fg)" strokeWidth={1.4} />
          <Nmos x={275} y={232} label="CK̄" />
          <line x1={140} y1={250} x2={140} y2={262} stroke="var(--fg)" strokeWidth={1.4} />
          <line x1={285} y1={250} x2={285} y2={262} stroke="var(--fg)" strokeWidth={1.4} />
          <line x1={140} y1={262} x2={285} y2={262} stroke="var(--fg)" strokeWidth={1.4} />
          {/* tail */}
          <line x1={212} y1={262} x2={212} y2={272} stroke="var(--fg)" strokeWidth={1.4} />
          <circle cx={212} cy={282} r={9} fill="none" stroke="var(--fg)" strokeWidth={1.4} />
          <path d="M 212 276 L 212 288 M 208 284 L 212 288 L 216 284" fill="none" stroke="var(--fg)" strokeWidth={1.2} />
          <text x={226} y={286} fontSize={10} fill="var(--fg-muted)">
            I_SS（tail current）
          </text>
          <text x={22} y={258} fontSize={10} fill="var(--fg-muted)">
            CK = 1：track
          </text>
          <text x={22} y={272} fontSize={10} fill="var(--fg-muted)">
            CK = 0：latch
          </text>
        </svg>
        <div>
          <div className="control-row">
            <label>
              τ = C_L / g_m = {tau} ps
              <input type="range" min={3} max={40} step={1} value={tau} onChange={(e) => setTau(Number(e.target.value))} />
            </label>
            <label>
              latch 瞬間的 ΔV₀ = {dv0} mV
              <input type="range" min={2} max={120} step={1} value={dv0} onChange={(e) => setDv0(Number(e.target.value))} />
            </label>
            <label>
              目標 swing = {swing} mV
              <input type="range" min={150} max={600} step={10} value={swing} onChange={(e) => setSwing(Number(e.target.value))} />
            </label>
            <label>
              可用的 latch 半週期 T/2 = {halfT} ps
              <input type="range" min={10} max={120} step={1} value={halfT} onChange={(e) => setHalfT(Number(e.target.value))} />
            </label>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="regeneration curve">
            <line x1={padL} y1={H - padB} x2={W - 8} y2={H - padB} stroke="var(--fg-muted)" />
            <line x1={padL} y1={10} x2={padL} y2={H - padB} stroke="var(--fg-muted)" />
            <text x={W - 10} y={H - padB + 14} textAnchor="end" fontSize={10} fill="var(--fg-muted)">
              t (ps)
            </text>
            <text x={padL - 4} y={14} textAnchor="end" fontSize={10} fill="var(--fg-muted)">
              ΔV
            </text>
            <line x1={padL} y1={yOf(swing)} x2={W - 8} y2={yOf(swing)} stroke="var(--ok)" strokeDasharray="4 3" />
            <text x={padL + 4} y={yOf(swing) - 3} fontSize={10} fill="var(--ok)">
              full swing {swing} mV
            </text>
            <rect x={xOf(0)} y={10} width={M_max(0, xOf(halfT) - xOf(0))} height={H - padB - 10} fill="var(--hl-safe)" />
            <line x1={xOf(halfT)} y1={10} x2={xOf(halfT)} y2={H - padB} stroke="var(--sig-clock)" strokeDasharray="3 2" />
            <text x={xOf(halfT) + 3} y={22} fontSize={10} fill="var(--sig-clock)">
              T/2 = {halfT}
            </text>
            <polyline points={pts.join(' ')} fill="none" stroke={ok ? 'var(--accent)' : 'var(--danger)'} strokeWidth={2.2} />
            <line x1={xOf(M_min(tRes, tMax))} y1={yOf(swing)} x2={xOf(M_min(tRes, tMax))} y2={H - padB} stroke={ok ? 'var(--accent)' : 'var(--danger)'} strokeDasharray="2 2" />
            <text x={xOf(M_min(tRes, tMax)) + 3} y={H - padB - 6} fontSize={10} fill={ok ? 'var(--accent)' : 'var(--danger)'}>
              t_res = {fmtNum(tRes, 1)} ps
            </text>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <text key={f} x={xOf(f * tMax)} y={H - padB + 12} textAnchor="middle" fontSize={9} fill="var(--fg-muted)">
                {fmtNum(f * tMax, 0)}
              </text>
            ))}
          </svg>
          <div className={`callout ${ok ? 'callout-method' : 'callout-pitfall'}`}>
            <div className="callout-title">
              t<sub>res</sub> = τ · ln(V<sub>swing</sub> / ΔV₀) = {tau} × ln({swing}/{dv0}) = <b>{fmtNum(tRes, 1)} ps</b> {ok ? '≤' : '>'} T/2 = {halfT} ps
            </div>
            {ok ? (
              <>latch 在半個週期內就把差值放大到 full swing。注意 ΔV₀ 越小（clock edge 附近輸入還沒分開、或 input swing 不足）需要的時間越長——這就是 analog 版的「setup window」，但它是連續的、對數的，不是一個固定數字。</>
            ) : (
              <>
                半個週期不夠讓 latch 完成 regeneration：輸出還沒到 full swing，下一級（另一個 latch）看到的是一個縮小的 swing，再下一級更小……幾個週期後 divider 就「掉拍」（miss a toggle）。這時 Fmax 的限制來自 τ = C/g<sub>m</sub>，加大 tail current（提高 g<sub>m</sub>）或減少 C<sub>L</sub> 才有用；把 gate delay 加起來的 STA 模型根本沒有這一項。
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ TSPC precharge / evaluate timing */
/**
 * 用 event 產生 dynamic stage 的時序：
 *   clk = 0：precharge，內部節點 X 在 clk 下降後 t_pre 被拉到 1
 *   clk = 1：evaluate，若 d = 1 則 X 在 clk 上升後 t_eval 放電到 0
 *   輸出級在 clk 下降緣把 X 的結果送到 q（延遲 t_q），d = NOT q（/2 feedback，經 t_inv）
 * 限制：
 *   t_low  ≥ t_pre               （precharge 要完成）
 *   t_high ≥ t_eval              （evaluate 要完成）
 *   t_low  ≥ t_q + t_inv + t_su  （feedback 回來的 d 要在下一個 rising edge 前穩定）
 */
export function TspcTimingDiagram({ tPre = 12, tEval = 14, tQ = 8, tInv = 5, tSu = 5 }: { tPre?: number; tEval?: number; tQ?: number; tInv?: number; tSu?: number }) {
  const [period, setPeriod] = useState(70)
  const [duty, setDuty] = useState(0.5)
  const tHigh = period * duty
  const tLow = period - tHigh
  const evalOk = tHigh >= tEval
  const preOk = tLow >= tPre
  const fbOk = tLow >= tQ + tInv + tSu
  const cycles = 5
  const { traces, shades } = useMemo(() => {
    const clk: TraceEvent[] = [{ t: 0, v: 0 }]
    const x: TraceEvent[] = [{ t: 0, v: 1 }]
    const q: TraceEvent[] = [{ t: 0, v: 0 }]
    const d: TraceEvent[] = [{ t: 0, v: 1 }]
    const shades: { t0: number; t1: number; kind: 'safe' | 'danger' | 'info'; label?: string; signal?: string }[] = []
    let qv: 0 | 1 = 0
    let dv: 0 | 1 = 1
    let xv: 0 | 1 = 1
    let xValid = true
    for (let k = 0; k < cycles; k++) {
      const r = period + k * period
      const f = r + tHigh
      clk.push({ t: r, v: 1 }, { t: f, v: 0 })
      shades.push({ t0: r, t1: f, kind: evalOk ? 'info' : 'danger', label: k === 0 ? 'evaluate' : undefined, signal: 'x' })
      shades.push({ t0: f, t1: f + tLow, kind: preOk ? 'safe' : 'danger', label: k === 0 ? 'precharge' : undefined, signal: 'x' })
      // evaluate：d = 1 時放電
      if (dv === 1 && xValid) {
        if (evalOk) {
          xv = 0
          x.push({ t: r + tEval, v: 0 })
        } else {
          // 沒放到底：把 X 標成不確定（用短脈衝表示部分放電）
          x.push({ t: r + tHigh - 2, v: 0 }, { t: r + tHigh, v: 1 })
          xValid = false
        }
      }
      // 輸出級在 falling edge 讀 X：q = NOT X（evaluate 結果）
      const nq: 0 | 1 = xValid ? (xv === 0 ? 1 : 0) : qv
      if (nq !== qv) {
        qv = nq
        q.push({ t: f + tQ, v: qv })
        const nd: 0 | 1 = qv ? 0 : 1
        if (nd !== dv) {
          dv = nd
          d.push({ t: f + tQ + tInv, v: dv })
        }
      }
      // precharge
      if (xv === 0) {
        if (preOk) {
          xv = 1
          x.push({ t: f + tPre, v: 1 })
        } else {
          x.push({ t: f + tLow, v: 1 })
          xValid = false
        }
      }
    }
    const traces: SignalTrace[] = [
      { name: 'clk', kind: 'clock', events: clk },
      { name: 'd', kind: 'control', events: d },
      { name: 'x', kind: 'data', events: x },
      { name: 'q', kind: 'output', events: q },
    ]
    return { traces, shades }
  }, [period, tHigh, tLow, evalOk, preOk, tPre, tEval, tQ, tInv])
  return (
    <div className="panel">
      <div className="panel-title">
        TSPC / dynamic stage 的 precharge–evaluate 時序 <span className="chip">兩個 edge 都在工作</span>
      </div>
      <div className="control-row">
        <label>
          T<sub>clk</sub> = {period} ps
          <input type="range" min={30} max={120} step={1} value={period} onChange={(e) => setPeriod(Number(e.target.value))} />
        </label>
        <label>
          duty = {fmtNum(duty * 100, 0)}%
          <input type="range" min={0.2} max={0.8} step={0.05} value={duty} onChange={(e) => setDuty(Number(e.target.value))} />
        </label>
        <span className="small muted">
          t<sub>pre</sub> = {tPre}、t<sub>eval</sub> = {tEval}、t<sub>q</sub> = {tQ}、t<sub>inv</sub> = {tInv}、t<sub>su</sub> = {tSu} ps
        </span>
      </div>
      <ClockWaveform signals={traces} tEnd={period * (cycles + 1)} unit=" ps" pxPerPeriod={2} zoomable={false} measure={false} shades={shades} xSignals={evalOk && preOk ? [] : ['x', 'q']} showPulseWidths={['clk']} />
      <div className="scroll-x">
        <table className="timing-table">
          <thead>
            <tr>
              <th>限制</th>
              <th>需要</th>
              <th>實際</th>
              <th>結果</th>
              <th style={{ fontFamily: 'var(--font)' }}>哪一種 violation</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>evaluate：t_high ≥ t_eval</td>
              <td>{tEval}</td>
              <td>{fmtNum(tHigh, 1)}</td>
              <td className={evalOk ? 'slack-ok' : 'slack-bad'}>{evalOk ? 'OK' : 'FAIL'}</td>
              <td style={{ fontFamily: 'var(--font)' }}>clock high 太窄：pulse-width（X 沒放到底 ⇒ 輸出級讀到半途的值）</td>
            </tr>
            <tr>
              <td>precharge：t_low ≥ t_pre</td>
              <td>{tPre}</td>
              <td>{fmtNum(tLow, 1)}</td>
              <td className={preOk ? 'slack-ok' : 'slack-bad'}>{preOk ? 'OK' : 'FAIL'}</td>
              <td style={{ fontFamily: 'var(--font)' }}>clock low 太窄：pulse-width（下一次 evaluate 從錯誤的起點開始）</td>
            </tr>
            <tr>
              <td>feedback：t_low ≥ t_q + t_inv + t_su</td>
              <td>{tQ + tInv + tSu}</td>
              <td>{fmtNum(tLow, 1)}</td>
              <td className={fbOk ? 'slack-ok' : 'slack-bad'}>{fbOk ? 'OK' : 'FAIL'}</td>
              <td style={{ fontFamily: 'var(--font)' }}>setup：d 來不及在下一個 rising edge 前穩定（這才是加法模型能算的那一條）</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="small muted">
        static CMOS flop 只有 rising edge 在工作、低電位期間閒著；dynamic stage 在 clk = 0 也要做事（precharge）。所以 TSPC divider 的 Fmax 同時被 high 寬度、low 寬度、與 feedback setup 三件事限制——duty 偏離 50% 時先撞到的往往是 pulse width，不是 setup。另外注意 X 在 evaluate 期間若 d = 0 是「浮接」的（靠電容保持 1）：leakage 與 charge sharing 會讓它慢慢掉，所以 dynamic logic 有 <b>最低</b> 工作頻率。
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ Regeneration calculator（練習用） */
export function RegenerationCalculator() {
  const [gm, setGm] = useState(6)
  const [c, setC] = useState(60)
  const [dv0, setDv0] = useState(25)
  const [swing, setSwing] = useState(400)
  const tau = c / gm
  const tRes = tau * M_log(swing / dv0)
  const fmax = 1000 / (2 * tRes)
  return (
    <div className="panel">
      <div className="panel-title">
        Regeneration 計算機 <span className="chip">τ = C / g_m，t = τ ln(V_swing / ΔV₀)</span>
      </div>
      <div className="control-row">
        <label>
          g<sub>m</sub> (mS)
          <input type="number" step={0.5} min={0.1} value={gm} onChange={(e) => setGm(M_max(0.1, Number(e.target.value)))} />
        </label>
        <label>
          C<sub>L</sub> (fF)
          <input type="number" step={5} min={1} value={c} onChange={(e) => setC(M_max(1, Number(e.target.value)))} />
        </label>
        <label>
          ΔV₀ (mV)
          <input type="number" step={5} min={0.1} value={dv0} onChange={(e) => setDv0(M_max(0.1, Number(e.target.value)))} />
        </label>
        <label>
          V<sub>swing</sub> (mV)
          <input type="number" step={10} min={1} value={swing} onChange={(e) => setSwing(M_max(1, Number(e.target.value)))} />
        </label>
      </div>
      <div className="kv">
        <dt>τ = C / g_m</dt>
        <dd>
          {fmtNum(c)} fF / {fmtNum(gm)} mS = <b>{fmtNum(tau, 2)} ps</b>（1 fF / 1 mS = 1 ps）
        </dd>
        <dt>ln(V_swing / ΔV₀)</dt>
        <dd>ln({fmtNum(swing)} / {fmtNum(dv0)}) = {fmtNum(M_log(swing / dv0), 3)}</dd>
        <dt>t_res</dt>
        <dd>
          <b>{fmtNum(tRes, 2)} ps</b>
        </dd>
        <dt>若每個 latch 只有半週期可用</dt>
        <dd>
          T ≥ 2 t_res = {fmtNum(2 * tRes, 1)} ps ⇒ f ≤ <b>{fmtNum(fmax, 2)} GHz</b>（只算 regeneration，未含 track 期間的 settling 與 clock slope）
        </dd>
      </div>
      <div className="small">
        <M block>{'t_{res} = \\tau \\ln\\frac{V_{swing}}{\\Delta V_0},\\qquad \\tau = \\frac{C_L}{g_m}'}</M>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ CML divider sensitivity curve */
/**
 * injection-locked 觀點的 CML /2：需要的輸入振幅 vs 輸入頻率。
 * 在 self-oscillation 頻率 f_so 附近幾乎不需要輸入（自己會振），離開越遠需要越大的振幅；
 * 超過 latch 的 regeneration 極限（f_cut）之後怎麼加振幅都沒用。
 */
export function SensitivityCurve() {
  const [fso, setFso] = useState(8)
  const [amp, setAmp] = useState(250)
  const fCut = fso * 1.9
  const req = (f: number) => {
    const a = 40 + 320 * ((f - fso) / fso) ** 2
    const b = f < fCut ? 60 / M_max(0.02, (fCut - f) / fso) : 1e9
    return a + b
  }
  const W = 480
  const H = 240
  const padL = 46
  const padB = 30
  const fMax = fso * 2.05
  const xOf = (f: number) => padL + (f / fMax) * (W - padL - 10)
  const yOf = (v: number) => H - padB - (M_min(v, 800) / 800) * (H - padB - 16)
  const pts: string[] = []
  let lo: number | null = null
  let hi: number | null = null
  for (let i = 0; i <= 200; i++) {
    const f = (fMax * i) / 200
    const v = req(f)
    if (v <= 800) pts.push(`${xOf(f).toFixed(1)},${yOf(v).toFixed(1)}`)
    if (v <= amp) {
      if (lo === null) lo = f
      hi = f
    }
  }
  return (
    <div className="panel">
      <div className="panel-title">
        CML /2 的 input sensitivity curve <span className="chip chip-danger">Fmax 不是一個 tCQ + tsetup 的數字</span>
      </div>
      <div className="control-row">
        <label>
          self-oscillation 頻率 f<sub>so</sub> = {fso} GHz
          <input type="range" min={2} max={20} step={0.5} value={fso} onChange={(e) => setFso(Number(e.target.value))} />
        </label>
        <label>
          可提供的輸入振幅 = {amp} mV
          <input type="range" min={40} max={700} step={10} value={amp} onChange={(e) => setAmp(Number(e.target.value))} />
        </label>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="sensitivity curve">
        <line x1={padL} y1={H - padB} x2={W - 8} y2={H - padB} stroke="var(--fg-muted)" />
        <line x1={padL} y1={10} x2={padL} y2={H - padB} stroke="var(--fg-muted)" />
        <text x={W - 10} y={H - padB + 14} textAnchor="end" fontSize={10} fill="var(--fg-muted)">
          f_in (GHz)
        </text>
        <text x={padL - 4} y={14} textAnchor="end" fontSize={10} fill="var(--fg-muted)">
          需要的輸入振幅 (mV)
        </text>
        {[0.25, 0.5, 0.75, 1].map((r) => (
          <text key={r} x={xOf(r * fMax)} y={H - padB + 12} textAnchor="middle" fontSize={9} fill="var(--fg-muted)">
            {fmtNum(r * fMax, 1)}
          </text>
        ))}
        {[200, 400, 600, 800].map((v) => (
          <text key={v} x={padL - 4} y={yOf(v) + 3} textAnchor="end" fontSize={9} fill="var(--fg-muted)">
            {v}
          </text>
        ))}
        {lo !== null && hi !== null ? <rect x={xOf(lo)} y={10} width={M_max(0, xOf(hi) - xOf(lo))} height={H - padB - 10} fill="var(--hl-safe)" /> : null}
        <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2.2} />
        <line x1={padL} y1={yOf(amp)} x2={W - 8} y2={yOf(amp)} stroke="var(--sig-control)" strokeDasharray="4 3" />
        <text x={padL + 4} y={yOf(amp) - 3} fontSize={10} fill="var(--sig-control)">
          available {amp} mV
        </text>
        <line x1={xOf(fso)} y1={10} x2={xOf(fso)} y2={H - padB} stroke="var(--ok)" strokeDasharray="3 2" />
        <text x={xOf(fso) + 3} y={22} fontSize={10} fill="var(--ok)">
          f_so（自振）
        </text>
        <line x1={xOf(fCut)} y1={10} x2={xOf(fCut)} y2={H - padB} stroke="var(--danger)" strokeDasharray="3 2" />
        <text x={xOf(fCut) - 3} y={22} textAnchor="end" fontSize={10} fill="var(--danger)">
          regeneration 極限
        </text>
      </svg>
      <div className="small">
        {lo !== null && hi !== null ? (
          <>
            以 {amp} mV 驅動，可工作的輸入頻率範圍 ≈ <b>{fmtNum(lo, 1)} – {fmtNum(hi, 1)} GHz</b>。注意兩端：太低的頻率也不行（latch 自己想振、track 期間太長會 overwrite），太高則 regeneration 來不及。這條曲線由 g<sub>m</sub>、C、tail current、swing、clock slope、共模準位、PVT 一起決定；沒有任何一段是「tCQ + tsetup」。
          </>
        ) : (
          <>這個振幅在任何頻率都不夠：divider 不會鎖到輸入，只會在 f_so 附近自振或什麼都不做。</>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ helpers（避免與 <Math> 名稱衝突） */
const M_log = (x: number) => globalThis.Math.log(x)
const M_exp = (x: number) => globalThis.Math.exp(x)
const M_max = (...xs: number[]) => globalThis.Math.max(...xs)
const M_min = (...xs: number[]) => globalThis.Math.min(...xs)
