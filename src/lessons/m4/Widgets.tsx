import { useMemo, useState, type ReactNode } from 'react'
import { useSimulation } from '@/hooks/useSimulation'
import { EdgeStepper } from '@/components/sim/EdgeStepper'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import type { SchematicHighlight } from '@/components/circuit/schematic'
import { ClockWaveform, type WaveMarker, type WaveShade, type WaveAnnotation } from '@/components/waveform/ClockWaveform'
import { simulate } from '@/models/divider/engine'
import { findPeriod, measureDivide, stateSequence } from '@/models/divider/analysis'
import type { Bit, Netlist } from '@/models/divider/types'
import type { TimingEnv, TimingPath, TimingScenario } from '@/models/timing/types'
import { analyzeHold, analyzeSetup, worstHold, worstSetup } from '@/models/timing/sta'
import { fmtNum, pct } from '@/utils/format'
import { mmd2 } from '@/models/divider/examples'
import { mmd2Schematic } from './schematics'
import { TIMING as K, f1PulseWidths, mmdEdgeRows, mmdN, modOut2Consumption, summarizeInputs, switchP0Scan, withExtraModDelay } from './models'

// ---------------------------------------------------------------- 小工具
function Chip({ v, on = 'chip-ok', off = 'chip' }: { v: Bit | undefined; on?: string; off?: string }) {
  return <span className={`chip ${v ? on : off}`}>{v ?? '-'}</span>
}

const MODE_LABEL = (p0: Bit, p1: Bit) => `p1p0 = ${p1}${p0}`

// ---------------------------------------------------------------- Lesson 4-1：互動式兩級 MMD
/**
 * 每級 state、每級 MOD（p0、p1、mod_out2、mod1_eff）、這個 edge 有沒有 clock 到 cell 2、output edge、總 divide ratio。
 */
export function MmdTwoStageExplorer({ netlist = mmd2, title }: { netlist?: Netlist; title?: string }) {
  const sim = useSimulation(netlist, { period: K.T })
  const T = sim.period
  const cur = sim.current
  const v = sim.values
  const p0 = sim.effectiveInputs.p0 ?? 0
  const p1 = sim.effectiveInputs.p1 ?? 0
  const signals = ['clk', 'a0', 'a1', 'f1', 'b0', 'b1', 'mod_out2', 'mod1_eff', 'div_out']
  const traces = sim.sim.getTraces(signals)
  const windowCycles = 12
  const tEnd = Math.max(windowCycles * T, (sim.edgeIndex + 2) * T)
  const tStart = Math.max(0, tEnd - windowCycles * T)
  const out = traces.find((t) => t.name === 'div_out')
  const measure = out ? measureDivide(out, T) : null
  const f1Rose = cur ? cur.events.some((e) => e.signal === 'f1' && e.to === 1) : false
  const da1Before = cur?.combBefore.da1
  // cell 1 這一輪已經走了幾個 edge（自上次 a = 00 起）
  const cell1Elapsed = useMemo(() => {
    let n = 0
    for (let i = sim.records.length - 1; i >= 0; i--) {
      n++
      const r = sim.records[i]
      if (r.stateAfter.a0 === 0 && r.stateAfter.a1 === 0) {
        n = 0
        break
      }
    }
    return sim.records.length ? n : 0
  }, [sim.records])
  const highlights: SchematicHighlight[] = []
  if (f1Rose) highlights.push({ style: 'info', wires: ['w_f1_b0clk', 'w_f1_b1clk'], elements: ['ff_b0', 'ff_b1'], tags: [{ elementOrWire: 'ff_b0', text: '這個 edge f1↑：cell 2 被 clock 到' }] })
  if (cur && da1Before === 1) highlights.push({ style: 'setup', wires: ['w_nor2_modp0', 'w_andp0_and', 'w_and_da1'], elements: ['and_p0', 'and_a1', 'ff_a1'], tags: [{ elementOrWire: 'ff_a1', text: 'da1 = 1：這一輪 cell 1 走 /3', dy: 100 }] })
  const edgeLabels = Array.from({ length: Math.floor(tEnd / T) }, (_, i) => ({ t: (i + 1) * T, label: `${i + 1}` })).filter((e) => e.t >= tStart)
  const markers: WaveMarker[] = cur ? [{ t: cur.t, label: `edge ${cur.edgeIndex}`, kind: 'edge' }] : []
  const recent = sim.records.slice(-8)

  return (
    <div className="panel">
      <div className="panel-title">{title ?? '互動式兩級 MMD：cell 1 / cell 2 各自在做什麼'}</div>
      <div className="control-row">
        <span className="small muted">modulus bits（下一個 edge 前生效）：</span>
        <div className="input-toggles">
          <button className={`input-toggle ${p0 ? 'on' : ''}`} onClick={() => sim.setInput('p0', p0 ? 0 : 1)} title="cell 1 是否允許走 /3">
            p0 = <b>{p0}</b>
          </button>
          <button className={`input-toggle ${p1 ? 'on' : ''}`} onClick={() => sim.setInput('p1', p1 ? 0 : 1)} title="cell 2 是否走 /3">
            p1 = <b>{p1}</b>
          </button>
        </div>
        <span className="chip chip-accent">
          理論 N = 4 + 2·{p1} + {p0} = {mmdN([p0, p1])}
        </span>
      </div>
      <EdgeStepper sim={sim} label="clk edge" />
      <div className="grid-2" style={{ gap: '0.6em' }}>
        <div className="hint-box">
          <div>
            <b>Cell 1</b>（clock = clk）　state a1a0 = <span className="mono">{v.a1}{v.a0}</span>
          </div>
          <div className="small">
            f1 = NOR(a1, a0) = <Chip v={v.f1} on="chip-info" />　mod_out2（來自 cell 2）= <Chip v={v.mod_out2} />　p0 = <Chip v={v.p0} />　⇒ mod1_eff = p0·mod_out2 = <Chip v={v.mod1_eff} on="chip-warn" />
          </div>
          <div className="small">
            這一輪：{v.a1 === 1 ? <b>走 /3（a1 = 1，多停一拍）</b> : v.mod1_eff === 1 ? <b>已被允許走 /3（下一個 a = 01 的 edge 會用到）</b> : '走 /2'}　已經過 {cell1Elapsed} 個 edge
          </div>
        </div>
        <div className="hint-box">
          <div>
            <b>Cell 2</b>（clock = f1）　state b1b0 = <span className="mono">{v.b1}{v.b0}</span>
          </div>
          <div className="small">
            mod_out2 = NOR(b1, b0) = <Chip v={v.mod_out2} />　p1 = <Chip v={v.p1} />　db1 = b0·p1 = <Chip v={v.db1} on="chip-warn" />　{f1Rose ? <span className="chip chip-info">這個 edge 被 clock 到</span> : <span className="chip">這個 edge 沒被 clock</span>}
          </div>
          <div className="small">
            div_out = mod_out2 = <b className={`value-${v.div_out ?? 0}`}>{v.div_out ?? 0}</b>
            {measure && measure.ratio !== null ? (
              <>
                　量到：rising edge 間隔 {measure.intervals.map((x) => `${x}T`).join(', ')} ⇒ N = <b>{measure.ratio}</b>，duty ≈ <b>{measure.duty !== null ? pct(measure.duty) : '-'}</b>
              </>
            ) : (
              <span className="muted">　（還沒有兩個以上的 output rising edge）</span>
            )}
          </div>
        </div>
      </div>
      <LogicDiagram schematic={mmd2Schematic} values={v} highlights={highlights} showLegend={false} />
      <ClockWaveform signals={traces} tStart={tStart} tEnd={tEnd} period={T} edgeLabels={edgeLabels} markers={markers} highlight={['div_out', 'f1']} showEdgeTimes={['div_out']} />
      <div className="scroll-x">
        <table className="state-table">
          <thead>
            <tr>
              <th>edge</th>
              <th>a1a0（前）</th>
              <th>b1b0（前）</th>
              <th>f1</th>
              <th>mod_out2</th>
              <th>mod1_eff</th>
              <th>da1</th>
              <th>→ a1a0</th>
              <th>→ b1b0</th>
              <th>f1↑？</th>
              <th>div_out</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 ? (
              <tr>
                <td colSpan={11} className="muted">
                  按「下一個 Clock Edge」開始。reset state：a = 00、b = 00，所以 f1 = 1、mod_out2 = 1。
                </td>
              </tr>
            ) : null}
            {recent.map((r) => {
              const rose = r.events.some((e) => e.signal === 'f1' && e.to === 1)
              return (
                <tr key={r.edgeIndex} className={r === cur ? 'current' : ''}>
                  <td>{r.edgeIndex}</td>
                  <td className="mono">{r.stateBefore.a1}{r.stateBefore.a0}</td>
                  <td className="mono">{r.stateBefore.b1}{r.stateBefore.b0}</td>
                  <td>{r.combBefore.f1}</td>
                  <td>{r.combBefore.mod_out2}</td>
                  <td>{r.combBefore.mod1_eff}</td>
                  <td className={r.combBefore.da1 ? 'value-1' : ''}>{r.combBefore.da1}</td>
                  <td className="mono">
                    <b>{r.stateAfter.a1}{r.stateAfter.a0}</b>
                  </td>
                  <td className="mono">
                    <b>{r.stateAfter.b1}{r.stateAfter.b0}</b>
                  </td>
                  <td>{rose ? '✔' : ''}</td>
                  <td className={r.output ? 'value-1' : 'value-0'}>{r.output}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="small muted">
        怎麼讀：cell 2 只有在「f1↑」那一列才會換 state；mod_out2 = 1 的那一個 f1 週期，cell 1 才有機會走 /3（還要 p0 = 1）。試著在不同時刻切 p0，看哪一個 edge 才真的吃到新值。
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Lesson 4-1：固定 mode 的逐 edge 表（由 engine 產生）
export function MmdEdgeTable({ netlist = mmd2, p0, p1, edges = 8, caption }: { netlist?: Netlist; p0: Bit; p1: Bit; edges?: number; caption?: ReactNode }) {
  const rows = useMemo(() => mmdEdgeRows(netlist, { p0, p1 }, edges), [netlist, p0, p1, edges])
  return (
    <div className="scroll-x" style={{ margin: '0.5em 0' }}>
      <table className="state-table">
        <thead>
          <tr>
            <th colSpan={11} style={{ textAlign: 'left' }}>
              {MODE_LABEL(p0, p1)}（N = {mmdN([p0, p1])}）{caption ? <span className="muted">　{caption}</span> : null}
            </th>
          </tr>
          <tr>
            <th>edge</th>
            <th>a1a0（前）</th>
            <th>b1b0（前）</th>
            <th>f1</th>
            <th>mod_out2</th>
            <th>mod1_eff</th>
            <th>da1</th>
            <th>→ a1a0</th>
            <th>→ b1b0</th>
            <th>f1↑</th>
            <th>div_out</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.edge}>
              <td>{r.edge}</td>
              <td className="mono">{r.aBefore}</td>
              <td className="mono">{r.bBefore}</td>
              <td>{r.f1Before}</td>
              <td className={r.modOut2Before ? 'value-1' : ''}>{r.modOut2Before}</td>
              <td>{r.mod1EffBefore}</td>
              <td className={r.da1 ? 'value-1' : ''}>{r.da1}</td>
              <td className="mono">
                <b>{r.aAfter}</b>
                {r.cell1CycleLength ? <span className="small muted">（/{r.cell1CycleLength}）</span> : null}
              </td>
              <td className="mono">
                <b>{r.bAfter}</b>
              </td>
              <td>{r.f1Rises ? '✔' : ''}</td>
              <td className={r.out ? 'value-1' : 'value-0'}>{r.out}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- Lesson 4-1：divide range 表（mmd2 / mmd3）
export function DivideRangeTable({ netlist, bits, title }: { netlist: Netlist; bits: number; title?: string }) {
  const rows = useMemo(() => {
    const out = []
    for (let m = 0; m < 1 << bits; m++) {
      const p: Bit[] = []
      for (let i = 0; i < bits; i++) p.push(((m >> i) & 1) as Bit)
      out.push(summarizeInputs(netlist, p))
    }
    return out
  }, [netlist, bits])
  const label = (p: Bit[]) => [...p].reverse().join('')
  return (
    <div className="scroll-x" style={{ margin: '0.5em 0' }}>
      <table className="compare-table">
        <thead>
          {title ? (
            <tr>
              <th colSpan={6} style={{ textAlign: 'left' }}>
                {title}
              </th>
            </tr>
          ) : null}
          <tr>
            <th>{Array.from({ length: bits }, (_, i) => `p${bits - 1 - i}`).join('')}</th>
            <th>理論 N = 2^{bits} + Σ p_i·2^i</th>
            <th>模擬量到的 N</th>
            <th>duty</th>
            <th>cell 1 每輪的長度（/2 或 /3）</th>
            <th>主循環長度（state 數）</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={label(r.p)}>
              <td className="mono">{label(r.p)}</td>
              <td>{r.N}</td>
              <td className={r.ratio === r.N ? 'slack-ok' : 'slack-bad'}>
                <b>{r.ratio ?? '-'}</b>
              </td>
              <td>{r.duty !== null ? pct(r.duty) : '-'}</td>
              <td className="mono">{r.cell1Cycles.slice(0, 6).join(' ')} …</td>
              <td>{r.cycle.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- Lesson 4-2：path ② 的 deadline（real delay + 可調延遲）
export function ModOut2DeadlineDemo() {
  const [extra, setExtra] = useState(0)
  const [p1, setP1] = useState<Bit>(0)
  const p0: Bit = 1
  const netlist = useMemo(() => withExtraModDelay(extra), [extra])
  const arrival = K.tcq + K.nor + K.tcq + K.nor + (K.and + extra) + K.and
  const res = useMemo(() => {
    const edges = 16
    const run = (nl: Netlist) => {
      const { sim, traces, records } = simulate(nl, 40, { period: K.T, delayMode: 'real' }, () => ({ p0, p1 }))
      const m = measureDivide(traces.find((t) => t.name === 'div_out')!, K.T)
      const seq = stateSequence(nl, records)
      const per = findPeriod(seq)
      return { sim, records, ratio: m.ratio, duty: m.duty, intervals: m.intervals, cycle: per ? seq.slice(per.start, per.start + per.period) : [] }
    }
    const cur = run(netlist)
    const ref = run(mmd2)
    const names = ['clk', 'a0', 'a1', 'f1', 'b0', 'mod_out2', 'mod1_eff', 'da1', 'div_out']
    const cons = modOut2Consumption(netlist, p0, p1, edges)
    return { traces: cur.sim.getTraces(names), cur, ref, cons, tEnd: (edges + 1) * K.T }
  }, [netlist, p1])
  const expectedN = mmdN([p0, p1])
  const ratioWrong = res.cur.ratio !== expectedN
  const cycleWrong = !ratioWrong && res.cur.cycle.join(',') !== res.ref.cycle.join(',')
  const bad = ratioWrong || cycleWrong
  const markers: WaveMarker[] = []
  const annotations: WaveAnnotation[] = []
  const shades: WaveShade[] = []
  for (const c of res.cons.slice(1, 4)) {
    markers.push({ t: c.tF1Rise, label: `f1↑（edge ${c.launchEdge}）`, kind: 'edge' })
    markers.push({ t: c.tConsume, label: `a = 01 的 edge ${c.consumeEdge}`, kind: 'cursor' })
    if (c.tModOut2 !== null) annotations.push({ t: c.tModOut2, signal: 'mod_out2', text: `mod_out2 @ ${fmtNum(c.tModOut2)}` })
    shades.push({ t0: c.tF1Rise, t1: c.tConsume, kind: c.a1After === 1 ? 'safe' : 'danger', signal: 'da1', label: c.a1After === 1 ? '/3 ✔' : '應該 /3 卻走 /2' })
  }
  const edgeLabels = Array.from({ length: 16 }, (_, i) => ({ t: (i + 1) * K.T, label: `${i + 1}` }))
  return (
    <div className="panel">
      <div className="panel-title">path ②：mod_out2 何時被 cell 1 真正用到？（real delay）</div>
      <div className="control-row">
        <label>
          AND_P0 延遲 = 10 + <b>{extra}</b> ps（模擬長走線）
          <input type="range" min={0} max={200} step={5} value={extra} onChange={(e) => setExtra(Number(e.target.value))} style={{ width: 220 }} />
        </label>
        <label>
          p1
          <span className="btn-group">
            <button className={`btn btn-sm ${p1 === 0 ? 'active' : ''}`} onClick={() => setP1(0)}>
              0（/5）
            </button>
            <button className={`btn btn-sm ${p1 === 1 ? 'active' : ''}`} onClick={() => setP1(1)}>
              1（/7）
            </button>
          </span>
        </label>
        <span className="chip chip-accent">p0 = 1（固定）</span>
      </div>
      <div className="small" style={{ margin: '0.3em 0' }}>
        從 clk edge k 算起的 arrival = 8 + 12 + 8 + 12 + ({K.and} + {extra}) + {K.and} = <b>{arrival}</b> ps。
        單週期 STA required = {K.T - K.setup - K.jitter - K.margin} ps ⇒ slack <b className={K.T - K.setup - K.jitter - K.margin - arrival < 0 ? 'slack-bad' : 'slack-ok'}>{K.T - K.setup - K.jitter - K.margin - arrival}</b> ps；
        功能上的 deadline（a = 01 的 edge，k+2）= {2 * K.T} ps（模型無 setup time）。
      </div>
      <ClockWaveform signals={res.traces} tStart={0} tEnd={res.tEnd} period={K.T} edgeLabels={edgeLabels} markers={markers} annotations={annotations} shades={shades} highlight={['mod_out2', 'da1', 'div_out']} pxPerPeriod={56} rowHeight={28} zoomable={false} />
      <div className="scroll-x">
        <table className="timing-table">
          <thead>
            <tr>
              <th>f1↑ 的 edge（launch）</th>
              <th>f1↑ 時間</th>
              <th>mod_out2 改變時間</th>
              <th>a = 01 的 edge（capture）</th>
              <th>capture 時間</th>
              <th>capture 前 mod_out2</th>
              <th>da1</th>
              <th>結果</th>
            </tr>
          </thead>
          <tbody>
            {res.cons.map((c) => (
              <tr key={c.launchEdge}>
                <td>edge {c.launchEdge}</td>
                <td>{fmtNum(c.tF1Rise)}</td>
                <td>{c.tModOut2 !== null ? fmtNum(c.tModOut2) : '（不變）'}</td>
                <td>edge {c.consumeEdge}（= launch + {c.consumeEdge - c.launchEdge}）</td>
                <td>{fmtNum(c.tConsume)}</td>
                <td>{c.modOut2AtConsume}</td>
                <td>{c.da1}</td>
                <td className={c.da1 === 1 ? 'slack-ok' : ''}>{c.da1 === 1 ? 'cell 1 走 /3' : 'cell 1 走 /2'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`callout ${bad ? 'callout-pitfall' : 'callout-note'}`}>
        <div className="callout-title">這個延遲下的輸出（穩態）</div>
        <div>
          output rising edge 間隔：
          {res.cur.intervals.slice(1, 7).map((x, i) => (
            <span key={i} className={`chip ${x === expectedN ? 'chip-ok' : 'chip-danger'}`}>
              {x}T
            </span>
          ))}
          　duty ≈ <b className={res.cur.duty === res.ref.duty ? 'slack-ok' : 'slack-bad'}>{res.cur.duty !== null ? pct(res.cur.duty) : '-'}</b>（正確：{res.ref.duty !== null ? pct(res.ref.duty) : '-'}）
        </div>
        <div className="small">
          state 主循環（b1b0a1a0）：<span className={`mono ${cycleWrong ? 'slack-bad' : ''}`}>{res.cur.cycle.join(' → ') || '（尚未穩定）'}</span>
          {cycleWrong ? <>　正確應為 <span className="mono">{res.ref.cycle.join(' → ')}</span></> : null}
        </div>
        {ratioWrong ? (
          <>平均 N 都錯了：mod_out2 那個 2T 寬的 pulse 比 AND_P0 的延遲還短，被 inertial delay 吞掉——cell 1 再也收不到 /3 的請求，N 掉成 {res.cur.ratio}。</>
        ) : cycleWrong ? (
          <>平均 N 還是 {expectedN}，但 state 序列變了：/3 被搬到 b = 01 那個 f1 週期（0110 出現），div_out 的 duty 與 edge 位置整個搬走。這就是 path ② 違反時的第一個症狀——divide sequence 錯，而不是（或早於）metastable。</>
        ) : (
          <>state 序列、duty、N 都正確。{arrival > K.T - K.setup - K.jitter - K.margin ? '注意：單週期 STA 已經報 violation，但功能還對——因為 da1 要到 a = 01 的 edge（多一個 T）才被抓。' : ''}</>
        )}
      </div>
      <div className="small muted">
        建議依序試：0（原版，slack +27）→ 90（arrival 150：STA fail、功能仍對）→ 150（arrival 210 &gt; 2T：/3 搬家，duty 0.6 → 0.4）→ 200（arrival 260：pulse 被吞，N = 4）。第一個 interval 受 reset 影響，這裡只看穩態。
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Lesson 4-2：path ③ 的 sensitize 時機
export function SwitchP0Table() {
  const rows = useMemo(() => switchP0Scan([2, 3, 4, 5, 6, 7, 8, 9]), [])
  return (
    <div className="scroll-x" style={{ margin: '0.5em 0' }}>
      <table className="compare-table">
        <thead>
          <tr>
            <th>p0 在 edge k 之前 0 → 1</th>
            <th>div_out rising edge 的 edge 編號</th>
            <th>interval（T）</th>
            <th>第一個 5T 是第幾個 interval</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td>k = {r.k}</td>
              <td className="mono">{r.risingEdges.slice(0, 5).join(', ')}</td>
              <td>
                {r.intervals.slice(0, 4).map((x, i) => (
                  <span key={i} className={`chip ${x === 5 ? 'chip-ok' : x === 4 ? 'chip' : 'chip-danger'}`}>
                    {x}T
                  </span>
                ))}
              </td>
              <td>{r.firstFiveAt >= 0 ? `#${r.firstFiveAt + 1}` : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- Lesson 4-2：path ⑥ f1 pulse width
export function F1PulseWidthDemo() {
  const [T, setT] = useState(100)
  const [mode, setMode] = useState<'01' | '00'>('01')
  const p0: Bit = mode === '01' ? 1 : 0
  const res = useMemo(() => {
    const edges = 10
    const rows = f1PulseWidths(mmd2, p0, 0, T, edges)
    const { sim } = simulate(mmd2, edges, { period: T, delayMode: 'real' }, () => ({ p0, p1: 0 }))
    return { rows, traces: sim.getTraces(['clk', 'a0', 'a1', 'f1', 'b0']), tEnd: (edges + 1) * T }
  }, [T, p0])
  const highs = res.rows.filter((r) => r.level === 1)
  const lows = res.rows.filter((r) => r.level === 0)
  const minHigh = highs.length ? Math.min(...highs.map((r) => r.width)) : 0
  const minLow = lows.length ? Math.min(...lows.map((r) => r.width)) : 0
  const effHigh = minHigh - K.norAsym
  const shades: WaveShade[] = highs.filter((r) => r.width - K.norAsym < K.minPulse).map((r) => ({ t0: r.t0, t1: r.t1, kind: 'danger', signal: 'f1', label: `${fmtNum(r.width)} ps` }))
  const tPulse = K.norAsym + K.minPulse + K.jitter + K.margin
  const tSetup2 = K.tcq * 2 + K.nor * 2 + K.and * 2 + K.setup + K.jitter + K.margin
  const tSetup1 = K.tcq + K.nor + K.setup + K.jitter + K.margin
  return (
    <div className="panel">
      <div className="panel-title">path ⑥：f1 是 generated clock，high pulse 只有一個 T</div>
      <div className="control-row">
        <label>
          T = <b>{T}</b> ps
          <input type="range" min={30} max={120} step={5} value={T} onChange={(e) => setT(Number(e.target.value))} style={{ width: 220 }} />
        </label>
        <span className="btn-group">
          <button className={`btn btn-sm ${mode === '01' ? 'active' : ''}`} onClick={() => setMode('01')}>
            p1p0 = 01
          </button>
          <button className={`btn btn-sm ${mode === '00' ? 'active' : ''}`} onClick={() => setMode('00')}>
            p1p0 = 00
          </button>
        </span>
      </div>
      <ClockWaveform signals={res.traces} tStart={0} tEnd={res.tEnd} period={T} showPulseWidths={['f1']} shades={shades} highlight={['f1']} pxPerPeriod={60} rowHeight={28} zoomable={false} />
      <div className="small">
        模型量到的 f1：high 最窄 <b>{fmtNum(minHigh)}</b> ps（= T），low 最窄 <b>{fmtNum(minLow)}</b> ps（/2 時 1T、/3 時 2T）。實際 NOR 的 rise/fall 不對稱約 {K.norAsym} ps ⇒ 有效 high ≈ <b className={effHigh < K.minPulse ? 'slack-bad' : 'slack-ok'}>{fmtNum(effHigh)}</b> ps，cell 2 flop 需要 ≥ {K.minPulse} ps。
      </div>
      <div className="small muted">
        三個下限比一比：pulse width ⇒ T ≥ {tPulse} ps；local path ① ⇒ T ≥ {tSetup1} ps；跨級 path ②（p0 = 1）⇒ T ≥ {tSetup2} ps。用這組 CMOS 數字，setup 先撞到；換成 CML 高速級（tCQ 4、gate 5）時 path ② 約 39 ps，就會和 pulse width 的 40 ps 一起到——這時 f1 的形狀（而不是 data 的到達）成為限制。
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Lesson 4-2：Critical Path Highlighter
export interface CriticalPathHighlighterProps {
  scenario: TimingScenario
  title?: string
  /** 哪些 path 屬於「async / control」那一組（預設：type 為 recovery/removal/async，加上 id 以 p3- 開頭者） */
  controlPathIds?: string[]
  initialMode?: string
}

function pathHighlight(p: TimingPath, style: SchematicHighlight['style'], tagPrefix: string, dyCapture = 0): SchematicHighlight {
  const wires = p.segments.flatMap((s) => s.wires ?? [])
  const elements = [p.launch.element, ...p.segments.flatMap((s) => s.elements ?? []), p.capture.element]
  const tags: SchematicHighlight['tags'] = []
  if (p.launch.element === p.capture.element) tags.push({ elementOrWire: p.launch.element, text: `${tagPrefix} launch = capture` })
  else {
    tags.push({ elementOrWire: p.launch.element, text: `${tagPrefix} launch（${p.launch.clock}↑）` })
    tags.push({ elementOrWire: p.capture.element, text: `${tagPrefix} capture（${p.capture.clock}↑）`, dy: dyCapture })
  }
  return { style, wires, elements, tags }
}

function PathTable({ path, env, kind }: { path: TimingPath; env: TimingEnv; kind: 'setup' | 'hold' | 'async' }) {
  const s = analyzeSetup(path, env)
  const h = analyzeHold(path, env)
  const useMin = kind === 'hold'
  const segs = path.segments.filter((x) => x.kind !== 'setup' && x.kind !== 'hold')
  const total = useMin ? h.arrival : s.arrival
  const budget = useMin ? h.required : s.required
  const slack = useMin ? h.slack : s.slack
  return (
    <div className="scroll-x">
      <table className="timing-table">
        <tbody>
          <tr>
            <td>
              <b>launch</b>
            </td>
            <td colSpan={2}>
              {path.launch.label ?? path.launch.element}，{path.launch.clock} {path.launch.edge === 'rising' ? '↑' : '↓'}
            </td>
          </tr>
          <tr>
            <td>
              <b>capture</b>
            </td>
            <td colSpan={2}>
              {path.capture.label ?? path.capture.element}，{path.capture.clock} {path.capture.edge === 'rising' ? '↑' : '↓'}
              {path.cycles && path.cycles > 1 ? `（${path.cycles} 個 cycle 之後）` : ''}
            </td>
          </tr>
          {segs.map((sg) => (
            <tr key={sg.id}>
              <td>{sg.label}</td>
              <td>
                {sg.from} → {sg.to}
              </td>
              <td>{useMin ? `min ${fmtNum(sg.min)}` : `max ${fmtNum(sg.max)}`} ps</td>
            </tr>
          ))}
          <tr>
            <td>
              <b>總 delay（arrival）</b>
            </td>
            <td>{useMin ? 'Σ min' : 'Σ max'}</td>
            <td>
              <b>{fmtNum(total)}</b> ps
            </td>
          </tr>
          <tr>
            <td>
              <b>budget（required）</b>
            </td>
            <td>{useMin ? 'thold + skew' : kind === 'async' ? 'T + skew − trecovery − jitter − margin' : `T×${(path.cycles ?? 1) * (path.periodFraction ?? 1)} + skew − tsetup − jitter − margin`}</td>
            <td>
              <b>{fmtNum(budget)}</b> ps
            </td>
          </tr>
          <tr>
            <td>
              <b>slack</b>
            </td>
            <td>{useMin ? 'arrival − required' : 'required − arrival'}</td>
            <td className={slack < 0 ? 'slack-bad' : 'slack-ok'}>
              <b>{fmtNum(slack)}</b> ps
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/**
 * 同一張圖上同時畫三組 highlight：
 *   紅實線 = 這個 mode 下最差 setup slack 的路徑
 *   藍虛線 = 最差 hold slack 的路徑
 *   灰點線 = async / control 路徑（reset、p0 / p1）
 * 並列出三張表（launch、capture、每段 delay、總 delay、budget、slack）。
 */
export function CriticalPathHighlighter({ scenario, title, controlPathIds, initialMode }: CriticalPathHighlighterProps) {
  const [mode, setMode] = useState<string | undefined>(initialMode ?? scenario.modes?.[0]?.id)
  const env = scenario.env
  const visible = scenario.paths.filter((p) => !p.modes || !mode || p.modes.includes(mode))
  const ws = worstSetup(visible, env, mode)
  const wh = worstHold(visible, env, mode)
  const ctrlIds = controlPathIds ?? visible.filter((p) => p.type === 'recovery' || p.type === 'removal' || p.type === 'async' || p.id.startsWith('p3-')).map((p) => p.id)
  const ctrl = visible.filter((p) => ctrlIds.includes(p.id))
  const highlights: SchematicHighlight[] = []
  for (const p of ctrl) highlights.push({ ...pathHighlight(p, 'async', '┈'), tags: [] })
  if (ctrl.length) highlights.push({ style: 'async', tags: ctrl.slice(0, 2).map((p, i) => ({ elementOrWire: p.launch.element, text: `┈ ${p.launch.element}：async / control`, dy: i * 14 })) })
  if (wh) highlights.push(pathHighlight(wh.path, 'hold', '╍ hold', 100))
  if (ws) highlights.push(pathHighlight(ws.path, 'setup', '━ setup', 100))
  return (
    <div className="panel">
      <div className="panel-title">
        {title ?? 'Critical Path Highlighter'}
        <span className="chip chip-accent">{scenario.name}</span>
      </div>
      {scenario.modes?.length ? (
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
      <div className="small" style={{ margin: '0.3em 0' }}>
        <span style={{ color: 'var(--hl-setup)', fontWeight: 700 }}>━━ 紅實線</span> = 最差 setup（max-delay）路徑
        <span style={{ color: 'var(--hl-hold)', fontWeight: 700 }}>╍╍ 藍虛線</span> = 最差 hold（min-delay）路徑
        <span style={{ color: 'var(--hl-async)', fontWeight: 700 }}>┈┈ 灰點線</span> = async / control 路徑（reset、p0 / p1）。
        線型與標籤文字（━ / ╍ / ┈）和顏色一起用，不只靠顏色分辨。
      </div>
      <LogicDiagram schematic={scenario.schematic} highlights={highlights} showValues={false} />
      <div className="grid-3" style={{ gap: '0.6em', alignItems: 'start' }}>
        <div>
          <div className="small" style={{ color: 'var(--hl-setup)', fontWeight: 700 }}>
            ━━ setup：{ws ? ws.path.name : '（此 mode 沒有 setup 路徑）'}
          </div>
          {ws ? <PathTable path={ws.path} env={env} kind="setup" /> : null}
          {ws ? (
            <div className="small muted">
              Tclk,min（slack = 0）= <b>{fmtNum(ws.result.tclkMin)}</b> ps ⇒ Fmax ≈ {fmtNum(1000 / ws.result.tclkMin, 2)} GHz。{ws.path.limits ? <>限制：{ws.path.limits}。</> : null}
            </div>
          ) : null}
        </div>
        <div>
          <div className="small" style={{ color: 'var(--hl-hold)', fontWeight: 700 }}>
            ╍╍ hold：{wh ? wh.path.name : '（無）'}
          </div>
          {wh ? <PathTable path={wh.path} env={env} kind="hold" /> : null}
          <div className="small muted">hold 與 T 無關：檢查的是同一個 edge 之後，資料是否太快改變。</div>
        </div>
        <div>
          <div className="small" style={{ color: 'var(--hl-async)', fontWeight: 700 }}>
            ┈┈ async / control（{ctrl.length} 條）
          </div>
          {ctrl.map((p) => (
            <details key={p.id} open={p.id === ctrl[0]?.id}>
              <summary className="small">{p.name}</summary>
              <PathTable path={p} env={env} kind="async" />
            </details>
          ))}
          <div className="small muted">這一組不是 reg-to-reg 的 Fmax 問題：reset 看 recovery / removal；p0 / p1 看「被 sensitize 的那個 edge」之前是否穩定。</div>
        </div>
      </div>
    </div>
  )
}
