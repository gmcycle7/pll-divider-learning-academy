import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Netlist, Values } from '@/models/divider/types'
import { simulate } from '@/models/divider/engine'
import { nextStateOf } from '@/models/divider/analysis'
import { analyzeHold, analyzeSetup } from '@/models/timing/sta'
import type { TimingEnv, TimingPath, TimingScenario } from '@/models/timing/types'
import { allStates } from '@/utils/bits'
import { fmtNum } from '@/utils/format'

/* ------------------------------------------------------------------ */
/* 十步流程（可重用 checklist）                                            */
/* ------------------------------------------------------------------ */

export interface CpStep {
  n: number
  title: string
  en: string
  /** 這一步要「產出」什麼（寫在紙上的東西） */
  deliverable: string
  /** 常見漏掉的地方 */
  trap: string
}

export const CP_STEPS: CpStep[] = [
  { n: 1, title: '圈出所有 sequential elements', en: 'sequential elements', deliverable: '一張清單：每個 flop / latch 的名稱、clock、觸發 edge、有沒有 async reset。', trap: '漏掉 latch、漏掉用別的 flop 的 Q 當 clock 的 ripple 級、把 MUX 當成 sequential。' },
  { n: 2, title: '找出所有 launch points', en: 'launch points', deliverable: '每個 flop 的 Q（與 Q̄）、每個進來的 primary input（它背後有一個看不見的 launch flop）。', trap: '忘記 primary input（mode、sel、mod）也是 launch point，只是 launch flop 在別的 block。' },
  { n: 3, title: '找出所有 capture points', en: 'capture points', deliverable: '每個 flop 的 D、enable、async pin；每個 primary output（後面有看不見的 capture flop）。', trap: '把 output port 當 capture point 算 slack——沒有下一級的 setup 資訊時它只是 latency。' },
  { n: 4, title: '列出每個 launch → capture 的 combinational cone', en: 'combinational cone', deliverable: '一張表：每條 path 的 launch、經過的 gate、capture。同一個 gate 有幾個輸入來自不同 launch，就有幾條 path。', trap: '只列「最長的那條」。這一步要窮舉，判斷留給後面。' },
  { n: 5, title: '根據 mode 判斷哪些 path 可以被 sensitized', en: 'sensitization', deliverable: '每條 path 標上「哪個 mode / 哪種 input 條件下，launch 端的變化真的會傳到 capture 端」。', trap: '看到 MUX 就把兩個 data input 都算；沒有用 next-state equation 檢查某個 D 是否在該 mode 恆為常數。' },
  { n: 6, title: '計算每條 path 的最大 delay', en: 'max delay', deliverable: 'arrival = tCQ,max + Σ gate max（含 fanout、drive、wire、stack 修正）。', trap: '數 gate 而不是加 delay；忘了 MUX 的 sel→out 與 data→out 不一樣。' },
  { n: 7, title: '加入 setup、skew、jitter、margin', en: 'required time', deliverable: 'required = skew + Tclk − tsetup − jitter − margin（同一個 clock 的 single-cycle path）。', trap: 'skew 符號死背；把 skew 當 uncertainty；half-cycle path 忘了 Tclk/2。' },
  { n: 8, title: '找出 minimum slack', en: 'minimum slack', deliverable: '每條 path 的 slack = required − arrival；最小的那條就是這個 mode 的 critical path；Tclk,min 由它決定。', trap: '只算最長 arrival 那條，忽略 required 不同（half-cycle、multicycle、不同 capture flop 的 tsetup）。' },
  { n: 9, title: '另外做 hold / min-delay check', en: 'hold check', deliverable: '每條 path 的 tCQ,min + Σ gate min ≥ thold + skew；看最短那條，用 fast corner 的 min delay。', trap: '以為 setup 過了 hold 就過；以為降頻可以修 hold。' },
  { n: 10, title: '檢查 pulse width、recovery、removal', en: 'pulse width / recovery / removal', deliverable: 'clock high / low 寬度 ≥ flop 最小 pulse width；rst_n 釋放相對 clk edge 滿足 recovery / removal。', trap: '把 pulse-width violation 當 setup violation；忘了 reset release 也有時間窗。' },
]

const CHECK_KEY = 'pdla.m7.cp-checklist'

function loadChecks(key: string, n: number): boolean[] {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length === n) return arr.map((x) => Boolean(x))
    }
  } catch {
    /* ignore */
  }
  return Array(n).fill(false)
}

/**
 * 十步流程 checklist：每一步可勾選，進度存在 localStorage（SSR 安全：初始全部未勾，mount 後才讀）。
 * 其他課可以直接 `import { CriticalPathChecklist }` 重用，用不同的 storageKey。
 */
export function CriticalPathChecklist({ storageKey = CHECK_KEY, title = 'Critical path 十步 checklist', showTraps = true }: { storageKey?: string; title?: string; showTraps?: boolean }) {
  const [checks, setChecks] = useState<boolean[]>(() => Array(CP_STEPS.length).fill(false))
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    setChecks(loadChecks(storageKey, CP_STEPS.length))
    setLoaded(true)
  }, [storageKey])
  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(checks))
    } catch {
      /* ignore */
    }
  }, [checks, loaded, storageKey])
  const done = checks.filter(Boolean).length
  return (
    <div className="panel">
      <div className="panel-title">
        {title}
        <span className={`chip ${done === CP_STEPS.length ? 'chip-ok' : 'chip-accent'}`}>
          {done} / {CP_STEPS.length}
        </span>
      </div>
      <div className="panel-sub">分析任何陌生電路都用同一張表。做完一步勾一步；勾完十步之前，不要說你「找到 critical path 了」。</div>
      <ol className="steps">
        {CP_STEPS.map((s, i) => (
          <li key={s.n}>
            <label style={{ display: 'flex', gap: '0.6em', alignItems: 'flex-start', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={checks[i]}
                onChange={(e) => setChecks(checks.map((c, k) => (k === i ? e.target.checked : c)))}
                style={{ marginTop: '0.35em' }}
              />
              <span>
                <b style={{ textDecoration: checks[i] ? 'line-through' : 'none' }}>{s.title}</b>
                <span className="muted small" style={{ marginLeft: '0.5em' }}>（{s.en}）</span>
                <div className="small">
                  <span className="muted">產出：</span>
                  {s.deliverable}
                </div>
                {showTraps ? (
                  <div className="small">
                    <span className="muted">常漏：</span>
                    {s.trap}
                  </div>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ol>
      <div className="control-row">
        <button className="btn btn-sm" onClick={() => setChecks(Array(CP_STEPS.length).fill(false))}>
          全部清除
        </button>
        <button className="btn btn-sm" onClick={() => setChecks(Array(CP_STEPS.length).fill(true))}>
          全部勾選
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Step 6～9 的工作表：每條 path 的 arrival / required / slack / hold        */
/* 全部由 @/models/timing/sta 計算，與 CriticalPathExplorer 一致              */
/* ------------------------------------------------------------------ */

export interface PathBudgetTableProps {
  scenario: TimingScenario
  /** 只顯示此 mode 會被 sensitize 的 path */
  mode?: string
  env?: TimingEnv
  /** 顯示哪些欄位 */
  columns?: ('segments' | 'arrival' | 'required' | 'slack' | 'hold')[]
  /** 只顯示這些 path id（省略 = 所有 setup / interface path） */
  ids?: string[]
  title?: ReactNode
  /** 顯示「這條 path 只在哪個 mode 才算」 */
  showModes?: boolean
}

function segSum(p: TimingPath, which: 'min' | 'max') {
  return p.segments.filter((s) => s.kind !== 'setup' && s.kind !== 'hold').map((s) => `${fmtNum(s[which])}`)
}

export function PathBudgetTable({ scenario, mode, env, columns = ['segments', 'arrival', 'required', 'slack'], ids, title, showModes = false }: PathBudgetTableProps) {
  const e = env ?? scenario.env
  const paths = scenario.paths.filter((p) => (p.type === 'setup' || p.type === 'interface' || p.type === 'multicycle') && (!ids || ids.includes(p.id)) && (!p.modes || !mode || p.modes.includes(mode)))
  const rows = paths.map((p) => ({ p, s: analyzeSetup(p, e), h: analyzeHold(p, e) }))
  const worstSlack = rows.length ? Math.min(...rows.map((r) => r.s.slack)) : 0
  const worstHoldSlack = rows.length ? Math.min(...rows.map((r) => r.h.slack)) : 0
  const has = (c: (typeof columns)[number]) => columns.includes(c)
  return (
    <div>
      {title ? <div className="small muted">{title}</div> : null}
      <div className="scroll-x">
        <table className="timing-table">
          <thead>
            <tr>
              <th>path</th>
              <th>launch → capture</th>
              {showModes ? <th>sensitized</th> : null}
              {has('segments') ? <th>max delay（ps）</th> : null}
              {has('arrival') ? <th>arrival</th> : null}
              {has('required') ? <th>required</th> : null}
              {has('slack') ? <th>setup slack</th> : null}
              {has('hold') ? <th>min delay</th> : null}
              {has('hold') ? <th>hold slack</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, s, h }) => (
              <tr key={p.id}>
                <td>
                  <b>{p.id}</b>
                </td>
                <td style={{ fontFamily: 'var(--font)' }}>{p.name}</td>
                {showModes ? <td style={{ fontFamily: 'var(--font)' }}>{p.modes ? p.modes.map((m) => scenario.modes?.find((x) => x.id === m)?.label ?? m).join('、') : '所有 mode'}</td> : null}
                {has('segments') ? <td>{segSum(p, 'max').join(' + ')}</td> : null}
                {has('arrival') ? <td>{fmtNum(s.arrival)}</td> : null}
                {has('required') ? <td>{fmtNum(s.required)}</td> : null}
                {has('slack') ? (
                  <td className={s.slack < 0 ? 'slack-bad' : 'slack-ok'}>
                    <b>{fmtNum(s.slack)}</b>
                    {s.slack === worstSlack ? <span className="chip chip-danger" style={{ marginLeft: '0.4em' }}>critical</span> : null}
                  </td>
                ) : null}
                {has('hold') ? <td>{segSum(p, 'min').join(' + ')} = {fmtNum(h.arrival)}</td> : null}
                {has('hold') ? (
                  <td className={h.slack < 0 ? 'slack-bad' : 'slack-ok'}>
                    <b>{fmtNum(h.slack)}</b>
                    {h.slack === worstHoldSlack ? <span className="chip chip-info" style={{ marginLeft: '0.4em' }}>最短</span> : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {has('required') ? (
        <div className="small muted">
          required = skew + T<sub>clk</sub> − t<sub>setup</sub> − jitter − margin = {fmtNum(e.skew)} + {fmtNum(e.period)} − {fmtNum(paths[0]?.capture.setup ?? 0)} − {fmtNum(e.jitter)} − {fmtNum(e.margin)}；單位 ps。
        </div>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sensitization 證明表：對每個 state 列出某個 D 在不同 input 下的值        */
/* ------------------------------------------------------------------ */

export interface SensitizationTableProps {
  netlist: Netlist
  /** 要觀察的 comb 訊號（通常是某個 D） */
  target: string
  /** 幾組 input 條件，各成一欄 */
  inputSets: { label: string; inputs: Values }[]
  title?: ReactNode
  /** 額外顯示哪些 comb 訊號（每組 input 都會列） */
  extra?: string[]
}

export function SensitizationTable({ netlist, target, inputSets, title, extra = [] }: SensitizationTableProps) {
  const states = allStates(netlist.stateOrder.length)
  const rows = states.map((s) => ({ s, cols: inputSets.map((set) => nextStateOf(netlist, s, set.inputs)) }))
  const constant = inputSets.map((_, k) => {
    const vals = rows.map((r) => r.cols[k].comb[target] ?? r.cols[k].d[target])
    return vals.every((v) => v === vals[0]) ? vals[0] : null
  })
  return (
    <div>
      {title ? <div className="small muted">{title}</div> : null}
      <div className="scroll-x">
        <table className="state-table">
          <thead>
            <tr>
              <th>state（{netlist.stateOrder.join(' ')}）</th>
              {inputSets.map((set, k) => (
                <th key={k}>
                  {target}｜{set.label}
                </th>
              ))}
              {extra.flatMap((x) => inputSets.map((set, k) => <th key={`${x}-${k}`}>{x}｜{set.label}</th>))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.s}>
                <td>{r.s}</td>
                {r.cols.map((c, k) => (
                  <td key={k} className={constant[k] !== null ? '' : 'changed'}>
                    {c.comb[target] ?? c.d[target]}
                  </td>
                ))}
                {extra.flatMap((x) => r.cols.map((c, k) => <td key={`${x}-${k}`}>{c.comb[x] ?? c.d[x]}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="small">
        {inputSets.map((set, k) => (
          <div key={k}>
            <b>{set.label}</b>：{target} {constant[k] !== null ? <>在所有 {states.length} 個 state 都等於 <b>{constant[k]}</b> ⇒ 這個 capture point 在此條件下<b>不會被任何 launch point 影響</b>，經過它的 path 不算。</> : <>會隨 state 改變 ⇒ 至少有一條經過 {target} 的 path 被 sensitize。</>}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 事件時間表：用 engine 的 real-delay 模擬，列出每個 edge 之後各訊號何時改變 */
/* ------------------------------------------------------------------ */

export interface EdgeEventTableProps {
  netlist: Netlist
  inputs: Values
  /** 顯示第幾個 edge（從 1 開始） */
  edges: number[]
  /** 顯示哪些訊號的「相對 edge 的改變時間」 */
  signals: string[]
  period?: number
  title?: ReactNode
  /** 每列附註（key = edge index） */
  notes?: Record<number, ReactNode>
}

export function EdgeEventTable({ netlist, inputs, edges, signals, period = 100, title, notes }: EdgeEventTableProps) {
  const records = useMemo(() => simulate(netlist, Math.max(...edges) + 1, { period, delayMode: 'real' }, () => inputs).records, [netlist, inputs, edges, period])
  return (
    <div>
      {title ? <div className="small muted">{title}</div> : null}
      <div className="scroll-x">
        <table className="timing-table">
          <thead>
            <tr>
              <th>edge</th>
              <th>state 前 → 後（{netlist.stateOrder.join('')}）</th>
              {signals.map((s) => (
                <th key={s}>{s}</th>
              ))}
              {notes ? <th>說明</th> : null}
            </tr>
          </thead>
          <tbody>
            {edges.map((k) => {
              const r = records[k - 1]
              if (!r) return null
              const before = netlist.stateOrder.map((b) => r.stateBefore[b]).join('')
              const after = netlist.stateOrder.map((b) => r.stateAfter[b]).join('')
              return (
                <tr key={k}>
                  <td>
                    {k}（t = {fmtNum(r.t)}）
                  </td>
                  <td>
                    {before} → {after}
                  </td>
                  {signals.map((s) => {
                    const evs = r.events.filter((e) => e.signal === s && e.t >= r.t)
                    return (
                      <td key={s}>
                        {evs.length ? evs.map((e) => `${e.from}→${e.to} @ +${fmtNum(e.t - r.t)}`).join('；') : <span className="muted">不變</span>}
                      </td>
                    )
                  })}
                  {notes ? <td style={{ fontFamily: 'var(--font)' }}>{notes[k] ?? ''}</td> : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="small muted">「+n」= 該 edge 之後 n ps（real-delay 模式，tCQ 與 gate delay 取 netlist 的 max 值）。</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 「你先做 → 解答」的固定版型                                              */
/* ------------------------------------------------------------------ */

export function TryFirst({ step, ask, children }: { step: string; ask: ReactNode; children: ReactNode }) {
  return (
    <div className="hint-box">
      <div>
        <span className="chip chip-accent">{step}</span> <b>你先做：</b>
        {ask}
      </div>
      <details style={{ marginTop: '0.5em' }}>
        <summary>展開解答</summary>
        <div style={{ marginTop: '0.5em' }}>{children}</div>
      </details>
    </div>
  )
}
