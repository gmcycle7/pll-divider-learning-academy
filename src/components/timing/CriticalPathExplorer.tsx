import { useMemo, useState } from 'react'
import type { TimingEnv, TimingPath, TimingScenario } from '@/models/timing/types'
import { analyzeHold, analyzeSetup, worstHold, worstSetup } from '@/models/timing/sta'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import type { SchematicHighlight } from '@/components/circuit/schematic'
import { deriveArcsFromScenario } from '@/components/circuit/arcs'
import { TimingBudgetBar } from './TimingBudgetBar'
import { fmtNum } from '@/utils/format'
import { Math as M } from '@/components/content'

export interface CriticalPathExplorerProps {
  scenario: TimingScenario
  initialPath?: string
  /** 逐步揭示模式（launch → segments → capture → budget） */
  guided?: boolean
  showEnvControls?: boolean
  showHold?: boolean
  compact?: boolean
}

const PATH_TYPE_LABEL: Record<string, string> = {
  setup: 'setup / max-delay',
  hold: 'hold / min-delay',
  'pulse-width': 'pulse width',
  recovery: 'reset recovery',
  removal: 'reset removal',
  async: 'asynchronous / control',
  output: 'output latency',
  interface: 'interface (divider → downstream)',
  multicycle: 'multicycle',
}

export function CriticalPathExplorer({ scenario, initialPath, guided = false, showEnvControls = true, showHold = true, compact = false }: CriticalPathExplorerProps) {
  const [env, setEnv] = useState<TimingEnv>(scenario.env)
  const [mode, setMode] = useState<string | undefined>(scenario.modes?.[0]?.id)
  const [pathId, setPathId] = useState<string>(initialPath ?? scenario.paths[0]?.id)
  const [step, setStep] = useState(guided ? 0 : 99)
  const [view, setView] = useState<'setup' | 'hold'>('setup')
  const visiblePaths = scenario.paths.filter((p) => !p.modes || !mode || p.modes.includes(mode))
  const path: TimingPath | undefined = visiblePaths.find((p) => p.id === pathId) ?? visiblePaths[0]
  const setup = path ? analyzeSetup(path, env) : null
  const hold = path ? analyzeHold(path, env) : null
  const worstS = useMemo(() => worstSetup(scenario.paths, env, mode), [scenario, env, mode])
  const arcs = useMemo(() => deriveArcsFromScenario(scenario), [scenario])
  const worstH = useMemo(() => worstHold(scenario.paths, env, mode), [scenario, env, mode])

  const highlights: SchematicHighlight[] = useMemo(() => {
    if (!path) return []
    const style = view === 'hold' ? 'hold' : path.type === 'async' || path.type === 'recovery' || path.type === 'removal' ? 'async' : 'setup'
    const segs = step >= 1 ? path.segments : []
    const wires = segs.flatMap((s) => s.wires ?? [])
    const elements = [...(step >= 0 ? [path.launch.element] : []), ...segs.flatMap((s) => s.elements ?? []), ...(step >= 2 ? [path.capture.element] : [])]
    const tags: SchematicHighlight['tags'] = []
    const same = path.capture.element === path.launch.element
    if (step >= 2 && same) tags.push({ elementOrWire: path.capture.element, text: `launch = capture（edge k → edge k+1，${path.launch.clock}）` })
    else {
      if (step >= 0) tags.push({ elementOrWire: path.launch.element, text: `launch（${path.launch.edge === 'rising' ? '↑' : '↓'} ${path.launch.clock}）` })
      if (step >= 2) tags.push({ elementOrWire: path.capture.element, text: `capture（${path.capture.edge === 'rising' ? '↑' : '↓'} ${path.capture.clock}）` })
    }
    return [{ style, wires, elements, tags }]
  }, [path, step, view])

  if (!path || !setup || !hold) return null
  /**
   * output path 的終點沒有 capture flop（div_out、gclk、被選中的 phase…），
   * 所以它沒有 required time、沒有 slack，也不限制 Fmax——只有一個 latency 數字。
   * 把它當 setup 顯示會直接牴觸課文的第一條規則（「不要把所有 output delay 都叫 critical path」）。
   */
  const isOutput = path.type === 'output'
  const isSetupLike = path.type !== 'hold' && !isOutput
  /** reset 的 async pin check：capture.setup 是 t_recovery、capture.hold 是 t_removal，名稱要跟著換 */
  const isReset = path.type === 'recovery' || path.type === 'removal'
  /**
   * async（例如 PMUX 的 select window）：終點是 combinational MUX，不是 flop。
   * 它借用 setup / hold 兩側來表示「窗的關閉／打開」，失敗模式是 runt / double edge，
   * 不是「資料來不及」；而且窗的寬度不是 clock period 的限制 ⇒ 不能印 Tclk,min / Fmax。
   */
  const isWindow = path.type === 'async'
  /**
   * pulse-width：被檢查的是 clock 自己的形狀，capture.setup 欄位存的是最小 pulse width。
   * Tclk,min 仍然有意義（T 必須容得下這個 pulse），但 slack 的失敗模式是 pulse 太窄。
   */
  const isPulseWidth = path.type === 'pulse-width'
  /**
   * async 的 T_clk,min 仍然有意義（= 能安全切換的最小 Tvco），只有 F_max 的說法不成立，
   * 所以保留這一列與公式，改掉的是它的解讀文字。
   */
  /** pulse-width path：minPulse 是真正的判準；capture.setup 只有在作者刻意把 minPulse 放進計算時才會有值 */
  const pwMin = path.capture.minPulse ?? path.capture.setup
  const pwModelled = path.capture.setup !== undefined
  const showTclkMin = true
  const slackLabel = isReset ? 'Recovery slack' : isWindow ? 'Window slack' : isPulseWidth ? 'Pulse-width slack' : 'Slack'
  const violationText = isReset
    ? 'recovery violation：reset 釋放得太晚，太靠近 edge'
    : isWindow
      ? 'window violation：select 落在窗外 ⇒ pmux_out 出現 runt / double edge（不是「資料來不及」）'
      : isPulseWidth
        ? 'pulse-width violation：clock pulse 太窄，flop 來不及 regenerate（不是 setup、也不是 hold）'
        : 'setup violation：資料來不及'
  const maxStep = 3
  /** multicycle / half-cycle 的可用時間 = N × f × T；Tclk,min 的分母就是它 */
  const nCycles = path.cycles ?? 1
  const pFraction = path.periodFraction ?? 1
  const denom = nCycles * pFraction
  const tsetupVal = path.capture.setup ?? 0
  /** T_clk,min 的分子：Σt_max + tsetup + jitter + margin − skew */
  const tminNumer = setup.arrival + tsetupVal + env.jitter + env.margin - env.skew
  /** reset path 的 capture.setup 其實是 t_recovery，budget bar 的 legend 要跟著改名 */
  const setupItemLabel = isReset ? 't_recovery' : isPulseWidth ? 't_pw,min' : isWindow ? 't_window' : null
  const budgetItems = setupItemLabel ? setup.breakdown.map((b) => (b.kind === 'setup' ? { ...b, label: setupItemLabel } : b)) : setup.breakdown
  const tminTex = isReset
    ? `t_{rst,max} + t_{recovery} + t_{jitter} + t_{margin} - t_{skew}`
    : `t_{CQ,max} + t_{logic,max} + t_{setup} + t_{jitter} + t_{margin} - t_{skew}`
  const segmentHead = (
    <thead>
      <tr>
        <th>段</th>
        <th>從</th>
        <th>到</th>
        <th>min (ps)</th>
        <th>max (ps)</th>
        <th>說明</th>
      </tr>
    </thead>
  )
  const segmentRows = path.segments.map((s) => (
    <tr key={s.id}>
      <td>{s.label}</td>
      <td>{s.from}</td>
      <td>{s.to}</td>
      <td>{fmtNum(s.min)}</td>
      <td>{fmtNum(s.max)}</td>
      <td style={{ fontFamily: 'var(--font)' }}>{s.note ?? ''}</td>
    </tr>
  ))

  return (
    <div className="panel">
      <div className="panel-title">
        Critical Path Explorer
        <span className="chip chip-accent">{scenario.name}</span>
      </div>
      {scenario.description ? <div className="panel-sub">{scenario.description}</div> : null}
      {scenario.modes && scenario.modes.length ? (
        <div className="control-row">
          <span className="small muted">Mode：</span>
          <span className="btn-group">
            {scenario.modes.map((m) => (
              <button key={m.id} className={`btn btn-sm ${mode === m.id ? 'active' : ''}`} onClick={() => setMode(m.id)} title={m.description}>
                {m.label}
              </button>
            ))}
          </span>
        </div>
      ) : null}
      <div className="two-col">
        <div>
          <div className="small muted" style={{ marginBottom: '0.3em' }}>候選路徑（點選以高亮）：</div>
          <div className="path-list">
            {visiblePaths.map((p) => {
              const s = analyzeSetup(p, env)
              const h = analyzeHold(p, env)
              const isWorstS = worstS?.path.id === p.id
              const isWorstH = worstH?.path.id === p.id
              return (
                <button key={p.id} className={`path-item ${p.id === path.id ? 'active' : ''}`} onClick={() => setPathId(p.id)}>
                  <div>
                    <b>{p.name}</b>
                    <span className={`chip path-kind ${p.type === 'hold' ? 'chip-info' : p.type === 'async' || p.type === 'recovery' || p.type === 'removal' ? 'chip' : 'chip-danger'}`}>{PATH_TYPE_LABEL[p.type] ?? p.type}</span>
                    {isWorstS && p.type !== 'hold' ? <span className="chip chip-danger path-kind">最差 setup slack</span> : null}
                    {isWorstH && showHold ? <span className="chip chip-info path-kind">最差 hold slack</span> : null}
                  </div>
                  <div className="path-desc">
                    {p.launch.element} → {p.segments.map((sg) => sg.label).join(' → ')} → {p.capture.element}
                    {p.type === 'output' ? (
                      <>　latency <b>{fmtNum(s.arrival)}</b> ps</>
                    ) : p.type === 'hold' ? null : (
                      <>　{p.type === 'recovery' || p.type === 'removal' ? 'recovery' : p.type === 'async' ? 'window' : 'setup'} slack <b className={s.slack < 0 ? 'slack-bad' : 'slack-ok'}>{fmtNum(s.slack)}</b></>
                    )}
                    {showHold && p.type !== 'output' && p.type !== 'async' ? <>　{p.type === 'recovery' || p.type === 'removal' ? 'removal' : 'hold'} slack <b className={h.slack < 0 ? 'slack-bad' : 'slack-ok'}>{fmtNum(h.slack)}</b></> : null}
                  </div>
                </button>
              )
            })}
          </div>
          {showEnvControls ? (
            <div className="control-row" style={{ marginTop: '0.8em' }}>
              <label>
                T<sub>clk</sub> (ps)
                <input type="number" value={env.period} onChange={(e) => setEnv({ ...env, period: Number(e.target.value) })} />
              </label>
              <label>
                skew (ps)
                <input type="number" value={env.skew} onChange={(e) => setEnv({ ...env, skew: Number(e.target.value) })} />
              </label>
              <label>
                jitter (ps)
                <input type="number" value={env.jitter} onChange={(e) => setEnv({ ...env, jitter: Number(e.target.value) })} />
              </label>
              <label>
                margin (ps)
                <input type="number" value={env.margin} onChange={(e) => setEnv({ ...env, margin: Number(e.target.value) })} />
              </label>
            </div>
          ) : null}
        </div>
        <div>
          {guided ? (
            <div className="control-row">
              <span className="btn-group">
                <button className="btn btn-sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step <= 0}>
                  ◀
                </button>
                <button className="btn btn-sm btn-primary" onClick={() => setStep((s) => Math.min(maxStep, s + 1))} disabled={step >= maxStep}>
                  下一步 ▶
                </button>
              </span>
              <span className="small">
                {['① 找 launch point', '② 走過 combinational logic', '③ 找 capture point 與 capture edge', '④ 計算 timing budget 與 slack'][Math.min(step, 3)]}
              </span>
            </div>
          ) : null}
          {showHold && isSetupLike ? (
            <div className="tabs">
              <button className={view === 'setup' ? 'active' : ''} onClick={() => setView('setup')}>
                Setup（max delay）
              </button>
              <button className={view === 'hold' ? 'active' : ''} onClick={() => setView('hold')}>
                Hold（min delay）
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <LogicDiagram schematic={scenario.schematic} highlights={highlights} showValues={false} showLegend={!compact} arcs={arcs} />
      {path.description ? <p className="small">{path.description}</p> : null}
      {step >= 3 || !guided ? (
        <>
          {isOutput ? (
            <>
              <div className="scroll-x">
                <table className="timing-table">
                  {segmentHead}
                  <tbody>
                    {segmentRows}
                    <tr>
                      <td colSpan={3}>
                        <b>Output latency</b>（Σ max）
                      </td>
                      <td colSpan={2}>
                        <b>{fmtNum(setup.arrival)}</b>
                      </td>
                      <td style={{ fontFamily: 'var(--font)' }}>最慢的情況：{path.launch.element} 的 launch edge 之後 {fmtNum(setup.arrival)} ps</td>
                    </tr>
                    <tr>
                      <td colSpan={3}>最短 latency（Σ min）</td>
                      <td colSpan={2}>{fmtNum(hold.arrival)}</td>
                      <td style={{ fontFamily: 'var(--font)' }}>
                        min–max 的差 {fmtNum(setup.arrival - hold.arrival)} ps 就是這個輸出的 delay 不確定範圍（PVT / OCV）
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="small">
                <M block>{`t_{latency} = \\sum t_{max} = ${fmtNum(setup.arrival)}\\ \\text{ps}\\qquad(\\text{no required time, no slack})`}</M>
                <p className="muted">
                  這條 path 的終點（{path.capture.element}）<b>沒有 capture flop</b>，沒有人拿一個 edge 在等這筆資料 ⇒ 沒有 required time、沒有 slack、也<b>不限制 F</b>
                  <sub>max</sub>。它只是一個 latency 數字。要等到知道下一級是誰、它用哪個 clock、t<sub>setup</sub> 是多少，這條 path 才會變成 interface path（那時 required time 由下一級的 clock 決定，才會有 slack）。
                </p>
                <p className="muted">
                  若這個輸出被當成 clock 用（generated clock），該看的是它的 source latency、duty / pulse width 與 glitch，仍然不是 setup slack。
                </p>
              </div>
            </>
          ) : null}
          {view === 'setup' && isSetupLike ? (
            <>
              <div className="scroll-x">
                <table className="timing-table">
                  {segmentHead}
                  <tbody>
                    {segmentRows}
                    <tr>
                      <td colSpan={3}>
                        <b>Arrival time</b>（launch clock 到達 + Σ max）
                      </td>
                      <td colSpan={2}>
                        <b>{fmtNum(setup.arrival)}</b>
                      </td>
                      <td></td>
                    </tr>
                    <tr>
                      <td colSpan={3}>
                        <b>Required time</b>（T×{path.cycles ?? 1}
                        {path.periodFraction ? `×${path.periodFraction}` : ''} + skew − {isReset ? 't_recovery' : 'tsetup'} − jitter − margin）
                      </td>
                      <td colSpan={2}>
                        <b>{fmtNum(setup.required)}</b>
                      </td>
                      <td></td>
                    </tr>
                    <tr>
                      <td colSpan={3}>
                        <b>{slackLabel}</b> = required − arrival
                      </td>
                      <td colSpan={2} className={setup.slack < 0 ? 'slack-bad' : 'slack-ok'}>
                        {fmtNum(setup.slack)}
                      </td>
                      <td style={{ fontFamily: 'var(--font)' }}>{setup.slack < 0 ? violationText : 'OK'}</td>
                    </tr>
                    {showTclkMin ? (
                      <tr>
                        <td colSpan={3}>
                          T<sub>clk,min</sub>（slack = 0 時）
                        </td>
                        <td colSpan={2}>{fmtNum(setup.tclkMin)}</td>
                        <td style={{ fontFamily: 'var(--font)' }}>
                          {isReset ? (
                            <>
                              reset 的 async pin check：launch 不是 clk 的 flop，這個 T<sub>clk,min</sub> <b>不是 Fmax 限制</b>，只是「slack = 0 時的 T」。
                            </>
                          ) : isWindow ? (
                            <>
                              這個 T<sub>clk,min</sub> 是「<b>能安全切換的最小 T</b><sub>vco</sub>」——window 寬度 = N·f·T 必須容得下整條 select 路徑。
                              它<b>不是 divider 的 F</b><sub>max</sub>：這條 path 的終點是 combinational MUX，沒有 flop 在等資料，失敗模式是 runt / double edge。
                            </>
                          ) : isPulseWidth ? (
                            pwModelled ? (
                              <>
                                這個 T<sub>clk,min</sub> 是<b>由 pulse width 決定</b>的：T 必須容得下最小 pulse width（{fmtNum(pwMin ?? 0)} ps）加上 jitter 與 margin。高速時它可能比 setup 更早撞到。
                              </>
                            ) : (
                              <>
                                這條 path <b>沒有把最小 pulse width（{pwMin !== undefined ? `${fmtNum(pwMin)} ps` : '未給'}）放進計算</b>：這一列只是把 arrival 套進 setup 公式，數字本身沒有 setup 的意義。
                                真正的判準是「輸出 pulse 的寬度 ≥ 最小 pulse width」——課文用 0.5T − arrival 的餘裕直接算給你看。
                              </>
                            )
                          ) : (
                            <>
                              F<sub>max</sub> = 1 / T<sub>clk,min</sub> ≈ {fmtNum(1000 / setup.tclkMin, 2)} GHz（單位 ps）——這是<b>上面那格 T</b>
                              <sub>clk</sub> 的頻率，不是這條 path 可用時間（{fmtNum(setup.available)} ps）的倒數
                            </>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <TimingBudgetBar items={budgetItems} total={setup.available} title={isWindow ? 'Window budget（窗的時間如何被消耗）' : 'Timing budget（可用時間如何被消耗）'} />
              <div className="small">
                <M block>
                  {denom === 1
                    ? `T_{clk,min} = ${tminTex} = ${fmtNum(tminNumer)}\\ \\text{ps}`
                    : `T_{clk,min} = \\frac{${tminTex}}{N \\cdot f} = \\frac{${fmtNum(tminNumer)}}{${fmtNum(nCycles)} \\times ${fmtNum(pFraction, 3)}} = ${fmtNum(setup.tclkMin)}\\ \\text{ps}`}
                </M>
                <p className="muted">
                  <M>{'N'}</M> = 這條 path 可用的 cycle 數（multicycle；這裡 N = {fmtNum(nCycles)}）；<M>{'f'}</M> = capture edge 落在一個週期的哪個比例（half-cycle / window；這裡 f ={' '}
                  {fmtNum(pFraction, 3)}）。可用時間 = <M>{'N f T_{clk}'}</M> = {fmtNum(setup.available)} ps
                  {denom === 1 ? '（N = f = 1，分母是 1，所以分子就是 Tclk,min）' : '，所以分子那一串「資料花掉的時間」要先除以 N·f 才會是對 Tclk 的要求'}。
                </p>
                {isWindow ? (
                  <p className="muted">
                    這條 path 是一個<b>兩側都有限制的窗</b>：不能早於 window 打開（Hold 視圖），也不能晚於 window 關閉（Setup 視圖）。
                    窗寬由兩條 phase 的相對位置決定，窗寬為 0 時（forward +4，兩條 phase 互為反相）不論延遲多小都不可能 timing clean。
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
          {(view === 'hold' && isSetupLike) || path.type === 'hold' ? (
            <>
              <div className="scroll-x">
                <table className="timing-table">
                  <tbody>
                    <tr>
                      <td>
                        <b>Arrival (min)</b> = Σ min delay
                      </td>
                      <td>{fmtNum(hold.arrival)}</td>
                    </tr>
                    <tr>
                      <td>
                        <b>Required</b> = t<sub>{isReset ? 'removal' : 'hold'}</sub> + skew
                      </td>
                      <td>{fmtNum(hold.required)}</td>
                    </tr>
                    <tr>
                      <td>
                        <b>{isReset ? 'Removal slack' : 'Hold slack'}</b> = arrival − required
                      </td>
                      <td className={hold.slack < 0 ? 'slack-bad' : 'slack-ok'}>
                        {fmtNum(hold.slack)}
                        {hold.slack < 0 ? <span className="muted">　{isReset ? '（removal violation：reset 釋放得太早）' : '（hold violation：資料變得太快）'}</span> : null}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="small">
                <M block>{isReset ? `t_{arrival,min} \\ge t_{removal} + t_{skew}` : `t_{CQ,min} + t_{logic,min} \\ge t_{hold} + t_{skew}`}</M>
                <p className="muted">
                  {isReset
                    ? 'removal 與 clock period 無關：它檢查的是「reset 釋放得會不會太早、太靠近剛過去的那個 edge」。負值的修法是 reset synchronizer（把 de-assert 對齊 clk），不是把走線拉長。'
                    : 'hold 與 clock period 無關：它檢查的是「同一個 edge 之後，資料是否太快改變」。'}
                </p>
              </div>
            </>
          ) : null}
          {path.notes?.length ? (
            <ul className="small">
              {path.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          ) : null}
          {path.limits ? (
            <div className="small">
              <b>這條路徑限制的是：</b>
              {path.limits}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
