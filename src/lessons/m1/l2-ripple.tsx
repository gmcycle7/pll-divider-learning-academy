import { useMemo, useState, type ReactNode } from 'react'
import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { StateDiagram } from '@/components/circuit/StateDiagram'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { simulate } from '@/models/divider/engine'
import { detectRuntPulses } from '@/models/divider/analysis'
import { ripple4, ripple8, sync4 } from '@/models/divider/examples'
import type { Netlist, SimOptions, StepRecord } from '@/models/divider/types'
import { toBitString } from '@/utils/bits'
import { fmtT } from '@/utils/format'
import { ripple4Decode, ripple8AllRise, ripple8Decode, ripple8Rise } from './models'
import { ripple4Schematic, ripple8AllRiseSchematic, ripple8DecodeSchematic, ripple8RiseSchematic, ripple8Schematic, rippleQuizHighlights } from './ripple-schematics'
import { rippleTiming } from './ripple-timing'

const T = 100

/** ripple 專用的逐 edge 敘述：明確指出「哪一級的 clock 真的來了」 */
function rippleNarrate(rec: StepRecord, nl: Netlist, period: number): ReactNode {
  const before = toBitString(rec.stateBefore, nl.stateOrder)
  const after = toBitString(rec.stateAfter, nl.stateOrder)
  const primary = nl.clocks[0].name
  const items: ReactNode[] = [
    <>
      <b>Edge {rec.edgeIndex}</b>（t = {fmtT(rec.t, period)}，{primary} rising）之前：state = <span className="mono">{before}</span>。
    </>,
  ]
  for (const f of nl.flops) {
    const d = rec.combBefore[f.d]
    if (f.clk === primary) {
      items.push(
        <>
          {primary}↑ 是 <b>{f.label ?? f.q}</b> 的觸發 edge ⇒ 抓 {f.d} = {d} ⇒ {f.q}：{rec.stateBefore[f.q]} → <b>{rec.stateAfter[f.q]}</b>
          {rec.stateBefore[f.q] === rec.stateAfter[f.q] ? '（沒變）' : ''}。
        </>,
      )
      continue
    }
    const src = f.clk
    const sBefore = rec.stateBefore[src]
    const sAfter = rec.stateAfter[src]
    const want = f.edge
    const triggered = want === 'falling' ? sBefore === 1 && sAfter === 0 : sBefore === 0 && sAfter === 1
    if (triggered) {
      items.push(
        <>
          {src}：{sBefore} → {sAfter}，這是 <b>{want} edge</b>，正好是 <b>{f.label ?? f.q}</b> 的 clock ⇒ 抓 {f.d} = {d} ⇒ {f.q}：{rec.stateBefore[f.q]} → <b>{rec.stateAfter[f.q]}</b>。
        </>,
      )
    } else if (sBefore !== sAfter) {
      items.push(
        <>
          {src}：{sBefore} → {sAfter}，是 {sAfter === 1 ? 'rising' : 'falling'} edge，但 <b>{f.label ?? f.q}</b> 要的是 {want} edge ⇒ 不觸發，{f.q} 保持 {rec.stateAfter[f.q]}。
        </>,
      )
    } else {
      items.push(
        <>
          {src} 沒有改變 ⇒ <b>{f.label ?? f.q}</b> 沒有 clock edge，{f.q} 保持 {rec.stateAfter[f.q]}。
        </>,
      )
    }
  }
  items.push(
    <>
      state：<span className="mono">{before}</span> → <span className="mono">{after}</span>；輸出 {nl.output} = <b className={`value-${rec.output}`}>{rec.output}</b>。
    </>,
  )
  return (
    <ol>
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ol>
  )
}

/** 可調 tCQ 的 ideal vs real 並排比較（ripple /4 + state==00 decode） */
function RippleDelayCompare() {
  const [tcq, setTcq] = useState(8)
  const EDGES = 6
  const names = ['clk', 'q0', 'q1', 'dec00']
  const ideal = useMemo(() => simulate(ripple4Decode, EDGES, { period: T, delayMode: 'ideal' }), [])
  const real = useMemo(() => simulate(ripple4Decode, EDGES, { period: T, delayMode: 'real', tcqOverride: tcq }), [tcq])
  const idealTraces = ideal.sim.getTraces(names)
  const realTraces = real.sim.getTraces(names)
  const tEnd = (EDGES + 1) * T
  const order = ripple4Decode.stateOrder

  // temporary state：同一個 clk edge 之後，q0 先變、q1 稍後才變的時間窗
  const temps = real.records.flatMap((rec) => {
    const eq0 = rec.events.find((e) => e.signal === 'q0')
    const eq1 = rec.events.find((e) => e.signal === 'q1')
    if (!eq0 || !eq1) return []
    return [
      {
        edge: rec.edgeIndex,
        t0: eq0.t,
        t1: eq1.t,
        state: `${rec.stateBefore.q1}${eq0.to}`,
        from: toBitString(rec.stateBefore, order),
        to: toBitString(rec.stateAfter, order),
      },
    ]
  })
  const runts = detectRuntPulses(
    realTraces.filter((t) => t.name === 'dec00'),
    T / 2,
  )
  const q1Real = realTraces.find((t) => t.name === 'q1')!
  const q1FirstRise = q1Real.events.find((e) => e.v === 1)?.t
  const decDelay = ripple4Decode.gates.find((g) => g.out === 'dec00')?.delay ?? 0

  return (
    <div className="panel">
      <div className="panel-title">Ideal vs real：每級 tCQ 可調</div>
      <div className="control-row">
        <label>
          每級 tCQ = <b>{tcq} ps</b>
          <input type="range" min={4} max={30} step={1} value={tcq} onChange={(e) => setTcq(Number(e.target.value))} style={{ width: 200, marginLeft: 8 }} />
        </label>
        <span className="small muted">（T = {T} ps；AND decode delay 固定 {decDelay} ps；紅色陰影 = temporary state）</span>
      </div>
      <div className="two-col">
        <ClockWaveform title="理想（zero delay）" signals={idealTraces} tEnd={tEnd} period={T} highlight={['dec00']} pxPerPeriod={95} showValuesAtCursor={false} />
        <ClockWaveform
          title={`實際（tCQ = ${tcq} ps / 級）`}
          signals={realTraces}
          tEnd={tEnd}
          period={T}
          highlight={['dec00']}
          pxPerPeriod={95}
          showValuesAtCursor={false}
          shades={temps.map((tp) => ({ t0: tp.t0, t1: tp.t1, kind: 'danger' as const, label: tp.state }))}
          markers={runts.map((p) => ({ t: p.t0, label: `glitch ${p.width} ps`, kind: 'window' as const, signal: 'dec00' }))}
        />
      </div>
      <div className="scroll-x">
        <table className="state-table">
          <thead>
            <tr>
              <th>clk edge</th>
              <th>transition</th>
              <th>temporary state（q1 q0）</th>
              <th>持續時間</th>
              <th>dec00 glitch？</th>
            </tr>
          </thead>
          <tbody>
            {temps.map((tp) => {
              const g = runts.find((p) => p.t0 >= tp.t0 && p.t0 <= tp.t1 + decDelay + 1e-6)
              return (
                <tr key={tp.edge}>
                  <td>{tp.edge}</td>
                  <td>
                    {tp.from} → {tp.to}
                  </td>
                  <td>
                    <b>{tp.state}</b>（t = {tp.t0} … {tp.t1} ps）
                  </td>
                  <td>{tp.t1 - tp.t0} ps = 1 × tCQ</td>
                  <td>{g ? <span className="slack-bad">有（{g.width} ps）</span> : tp.state === '00' ? <span className="slack-ok">無（{tcq} ps ≤ AND delay，被 inertial delay 濾掉）</span> : <span className="muted">無（00 decode 不會對 {tp.state} 反應）</span>}</td>
                </tr>
              )
            })}
            {temps.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  （沒有兩個 bit 同時改變的 edge）
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="small muted" style={{ marginTop: '0.4em' }}>
        q1 的第一個 rising edge：理想在 2T = 200 ps；實際在 <b>{q1FirstRise} ps</b> = 2T + 2 × tCQ（q0 的 tCQ + q1 的 tCQ）。每多一級就多一個 tCQ。
      </div>
    </div>
  )
}

function Content() {
  const rippleSeq = ['00', '01', '10', '11']
  return (
    <>
      <Section title="先用直覺想" en="Intuition">
        <p>
          Lesson 1-1 的 /2 是「有人敲門就把開關反過來」。現在把兩個這樣的開關<b>串起來</b>：第二個開關<b>不聽門鈴</b>，它只看第一個開關——第一個開關從「開」變「關」的那一瞬間，第二個開關才反過來。
        </p>
        <p>
          第一個開關每 2 次敲門反一次，所以它「開 → 關」每 2T 發生一次；第二個開關要看到兩次「開 → 關」才走完一圈，所以它的週期是 4T。再串第三個就是 8T。這就是 <Term zh="漣波計數器" en="ripple counter" />：每一級都是 /2，前一級的<b>輸出</b>當後一級的<b>clock</b>。
        </p>
        <Callout kind="idea">
          「ripple」（漣波）這個名字就是提示：clock edge 像水波一樣<b>一級一級傳過去</b>，而不是同時到達每一級。這是它所有優點（簡單、省電）與所有缺點（延遲累積、中間狀態、decode glitch）的共同來源。
        </Callout>
      </Section>

      <Section title="最簡單的電路：兩級 /4" en="The circuit">
        <p>兩個 /2（DFF + inverter）串接。注意 FF1 的 clock pin 上有一個小圓圈（bubble）：它是 <Term zh="下降緣觸發" en="falling-edge triggered" />。</p>
        <LogicDiagram schematic={ripple4Schematic} showValues={false} />
        <p>照 Lesson 1-1 的方法，先找三樣東西：</p>
        <ul>
          <li>
            <b>Clock input</b>：這裡有<b>兩條</b>不同的 clock。FF0 的 clock 是 <span className="mono">clk</span>（rising edge）；FF1 的 clock 是 <span className="mono">q0</span>（falling edge）。<b>只有 FF0 直接聽輸入 clock。</b>
          </li>
          <li>
            <b>Memory element</b>：FF0、FF1，state = <span className="mono">q1 q0</span>（q1 是 MSB）。
          </li>
          <li>
            <b>Feedback path</b>：每一級各自一個 inverter：d0 = NOT q0、d1 = NOT q1。兩個 inverter 互不相干，沒有任何 gate 把 q0 與 q1 混在一起——<b>「q1 何時該翻」這件事不是用邏輯算的，而是用 q0 的 edge 去觸發的</b>。
          </li>
        </ul>
        <Callout kind="note" title="為什麼 FF1 用 q0 的 falling edge？">
          先不要背。等一下逐 edge 走過就會看到：q0 從 1 變 0 的那一刻，正好是二進位計數「01 → 10」進位的時刻。如果改用 rising edge，電路一樣能除頻，但 state 的編碼會不一樣——這是本課練習題。
        </Callout>
      </Section>

      <Section title="逐一個 clock edge 操作" en="Edge by edge">
        <p>
          從 reset（q1 q0 = 00）開始。每按一次「下一個 Clock Edge」，先問自己兩個問題：<b>(1) q0 會變成什麼？(2) q0 的這個變化是不是 falling edge？</b>只有第二個問題答「是」，FF1 才會動。
        </p>
        <DividerSimPanel netlist={ripple4} schematic={ripple4Schematic} title="Ripple /4：逐 edge" narrate={rippleNarrate} showDelayMode showPulseWidths />
        <Steps
          items={[
            <>
              <b>初始</b>：reset 讓 q1 q0 = 00。兩個 inverter 馬上算好 d0 = 1、d1 = 1，各自停在 D pin 前等。
            </>,
            <>
              <b>Edge 1（t = 1T）</b>：clk↑ ⇒ FF0 抓 d0 = 1，q0：0 → 1。這是 q0 的 <b>rising</b> edge，FF1 要的是 falling ⇒ FF1 不動，q1 = 0。state = <span className="mono">01</span>。
            </>,
            <>
              <b>Edge 2（t = 2T）</b>：clk↑ ⇒ FF0 抓 d0 = 0，q0：1 → 0。這是 q0 的 <b>falling</b> edge ⇒ FF1 的 clock 來了 ⇒ FF1 抓 d1 = 1，q1：0 → 1。state = <span className="mono">10</span>。
            </>,
            <>
              <b>Edge 3（t = 3T）</b>：q0：0 → 1（rising），FF1 不動。state = <span className="mono">11</span>。
            </>,
            <>
              <b>Edge 4（t = 4T）</b>：q0：1 → 0（falling）⇒ FF1 抓 d1 = 0，q1：1 → 0。state = <span className="mono">00</span>，回到初始。
            </>,
            <>
              <b>結論</b>：state 序列 00 → 01 → 10 → 11 → 00 …，每 4 個 edge 重複。q1 的 rising edge 出現在 edge 2、6、10 …，相鄰間隔 = 4T ⇒ <b>/4</b>。
            </>,
          ]}
        />
        <p>
          看一下 state 序列：00、01、10、11 就是二進位的 0、1、2、3。ripple counter 之所以「會數數」，是因為 <b>q0 由 1 變 0 時才讓 q1 翻</b>——這正是二進位加法「1 + 1 = 10」的進位規則。
        </p>
      </Section>

      <Section title="三級：/8" en="Three stages: divide by 8">
        <p>再加一級 FF2，clock 接 q1 的 falling edge。用同樣的兩個問題（q1 變了嗎？是 falling 嗎？）自己推一次，再按模擬器對答案。</p>
        <DividerSimPanel netlist={ripple8} schematic={ripple8Schematic} title="Ripple /8：逐 edge" narrate={rippleNarrate} showDelayMode windowCycles={12} />
        <div className="two-col">
          <div>
            <table className="state-table">
              <thead>
                <tr>
                  <th>edge</th>
                  <th>q2 q1 q0</th>
                  <th>十進位</th>
                  <th>誰被觸發</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['1', '001', '1', 'FF0'],
                  ['2', '010', '2', 'FF0，q0↓ ⇒ FF1'],
                  ['3', '011', '3', 'FF0'],
                  ['4', '100', '4', 'FF0，q0↓ ⇒ FF1，q1↓ ⇒ FF2'],
                  ['5', '101', '5', 'FF0'],
                  ['6', '110', '6', 'FF0，q0↓ ⇒ FF1'],
                  ['7', '111', '7', 'FF0'],
                  ['8', '000', '0', 'FF0，q0↓ ⇒ FF1，q1↓ ⇒ FF2'],
                ].map((r) => (
                  <tr key={r[0]}>
                    <td>{r[0]}</td>
                    <td className="mono">
                      <b>{r[1]}</b>
                    </td>
                    <td>{r[2]}</td>
                    <td style={{ fontFamily: 'var(--font)' }}>{r[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <p>
              q2 只在 edge 4 與 edge 8 改變（q1 falling 的時刻），所以 q2 的週期是 8 個 edge ⇒ <b>/8</b>。注意 edge 4 與 edge 8 這兩次：<b>三個 flop 都動了</b>，而且是<b>一個接一個</b>動的——這就是下面「延遲累積」與「temporary state」的來源。
            </p>
            <Callout kind="method" title="分析任何 ripple 結構的固定步驟">
              <ol style={{ margin: 0 }}>
                <li>找出每一級的 clock 來源與觸發 edge（rising / falling）。</li>
                <li>從 reset 開始，每個輸入 edge 只先更新第一級。</li>
                <li>問：第一級的變化是不是第二級要的 edge？是 ⇒ 更新第二級，再問第三級……</li>
                <li>記錄 state；找到重複的 state 就是週期。</li>
              </ol>
            </Callout>
          </div>
        </div>
      </Section>

      <Section title="State table 與 state diagram" en="State table">
        <div className="two-col">
          <div>
            <table className="state-table">
              <thead>
                <tr>
                  <th>現在 q1 q0</th>
                  <th>clk↑ 後 q0</th>
                  <th>q0 falling？</th>
                  <th>下一個 q1 q0</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>00</td>
                  <td>1</td>
                  <td>否</td>
                  <td>01</td>
                </tr>
                <tr>
                  <td>01</td>
                  <td>0</td>
                  <td>是 ⇒ q1 toggle</td>
                  <td>10</td>
                </tr>
                <tr>
                  <td>10</td>
                  <td>1</td>
                  <td>否</td>
                  <td>11</td>
                </tr>
                <tr>
                  <td>11</td>
                  <td>0</td>
                  <td>是 ⇒ q1 toggle</td>
                  <td>00</td>
                </tr>
              </tbody>
            </table>
            <p className="small muted">四個 state 都在主循環上，沒有 unused state；任何初始值都會正常計數（reset 只決定起始相位）。</p>
          </div>
          <StateDiagram
            states={rippleSeq}
            transitions={rippleSeq.map((s, i) => ({ from: s, to: rippleSeq[(i + 1) % 4], label: i % 2 === 1 ? 'clk↑, q0↓' : 'clk↑' }))}
            outputs={{ '00': '0', '01': '0', '10': '1', '11': '1' }}
            width={300}
            height={240}
          />
        </div>
        <ModeContent level="engineer" title="為什麼不能直接套「同步」的 next-state table？">
          <p>
            如果你把 d1 = NOT q1 當成「每個 clk edge 都抓」的 next-state equation，會算出 00 → 11 → 00，這是<b>錯的</b>：FF1 根本不在 clk edge 抓資料。ripple 的 next-state 必須寫成「<b>條件式 toggle</b>」——條件是 clock 來源有沒有出現觸發 edge：
          </p>
          <Math block>{'q_1^{+} = q_1 \\oplus \\big[q_0\\ \\text{falls at this edge}\\big] = q_1 \\oplus q_0'}</Math>
          <p>
            第二個等號成立是因為 q0 每個 edge 都 toggle：q0 在這個 edge 會 falling 的充要條件就是「edge 前 q0 = 1」。所以 ripple /4 與下一課的同步 /4 有<b>一模一樣的 state 序列</b>，差別只在<b>誰來執行這個 XOR</b>：同步版用一個 XOR gate 算出來、在同一個 clk edge 抓；ripple 版把它藏在「q0 的 edge 觸發 FF1」這個動作裡。
          </p>
          <Callout kind="warning" title="工具也會犯一樣的錯">
            STA 工具預設只認識 clock port 上定義的 clock。q0、q1 是「由 flop 產生的 clock」，必須用 <span className="mono">create_generated_clock -divide_by 2</span> 宣告，否則 FF1、FF2 的 timing 根本不會被分析。
          </Callout>
        </ModeContent>
      </Section>

      <Section title="Divide ratio 的數學推導" en="Deriving the divide ratio">
        <p>
          設輸入 clock 週期為 <Math>{'T_{in}'}</Math>（單位 ps）。第一級是 /2：<Math>{'T_{q_0} = 2\\,T_{in}'}</Math>。第二級的 clock 是 q0，它對 q0 而言也是 /2：
        </p>
        <Math block>{'T_{q_1} = 2\\,T_{q_0} = 4\\,T_{in},\\qquad T_{q_2} = 2\\,T_{q_1} = 8\\,T_{in}'}</Math>
        <p>推廣到 N 級（第 k 級輸出 <Math>{'q_k'}</Math>，k 從 0 起算）：</p>
        <Math block>{'T_{q_k} = 2^{\\,k+1}\\,T_{in}\\quad\\Rightarrow\\quad N_{div} = \\frac{T_{q_{N-1}}}{T_{in}} = 2^{N},\\qquad f_{out} = \\frac{f_{in}}{2^{N}}'}</Math>
        <p>
          <b>Duty cycle</b>：每一級都只在自己 clock 的<b>單一</b> edge toggle，所以每一級都是 50%——與輸入 duty 無關，也與前一級的 duty 無關（FF1 只看 q0 的 falling edge，不看 q0 high 多久）。
        </p>
        <Math block>{'D_{q_k} = \\frac{t_{high}}{T_{q_k}} = \\frac{2^{k}\\,T_{in}}{2^{k+1}\\,T_{in}} = 50\\%'}</Math>
        <Callout kind="note" title="ripple 只能除 2 的冪次">
          純 toggle 串接只能得到 2、4、8、16…。要做 /3、/5、/10 需要 decode 加 reset 或 state machine（Module 2）。
        </Callout>
      </Section>

      <Section title="Propagation delay 為什麼會逐級累積" en="Why delay accumulates">
        <p>
          到目前為止都是「理想」模式：flop 在 edge 那一瞬間就改變。真實的 flop 從 clock edge 到 Q 穩定需要 <Term zh="時脈到輸出延遲" en="clock-to-Q delay, tCQ" />。在 ripple 裡這件事特別嚴重，因為<b>第二級的 clock 本身就晚了一個 tCQ</b>：
        </p>
        <Math block>{'t_{q_0} = t_{edge} + t_{CQ},\\qquad t_{q_1} = t_{q_0\\downarrow} + t_{CQ} = t_{edge} + 2\\,t_{CQ},\\qquad t_{q_k} = t_{edge} + (k+1)\\,t_{CQ}'}</Math>
        <p>
          其中 <Math>{'t_{edge}'}</Math> 是觸發這一串變化的 clk rising edge 時刻，<Math>{'t_{CQ}'}</Math> 是每一級的 clock-to-Q 延遲（假設每級相同，單位 ps）。最後一級的輸出相對輸入 clock edge 晚了 <Math>{'N \\cdot t_{CQ}'}</Math>。
        </p>
        <p>下面把 /4 的理想波形與實際波形並排。拖曳 tCQ，看 q1 怎麼一步步落後，以及紅色陰影（temporary state）怎麼變寬：</p>
        <RippleDelayCompare />
        <Callout kind="idea" title="Temporary state：中間狀態短暫錯誤">
          看 edge 4 的 <b>11 → 00</b>：理想上 q1 q0 同時變 0。實際上 q0 先變 0（tCQ 之後），q1 要等到 q0 真的變 0 <b>再</b>過一個 tCQ 才變 0。中間那一段 tCQ，state 是 <b>10</b>——一個「不該出現在這個時間點」的 state。同樣地 edge 2 的 <b>01 → 10</b> 會短暫經過 <b>00</b>。三級的 111 → 000 更慘：會依序經過 110、100 才到 000，錯誤持續 2 × tCQ。
        </Callout>
        <ModeContent level="engineer" title="用 pulse 的觀點看 temporary state">
          <p>
            temporary state 的持續時間不是隨機的，就是 <Math>{'t_{CQ}'}</Math>（相鄰兩級的 clock-to-Q 差）。N 級的最壞 transition（<Math>{'2^N - 1 \\to 0'}</Math>）會經過 N − 1 個錯誤 state，總共持續 <Math>{'(N-1)\\,t_{CQ}'}</Math>。它與輸入 clock 的週期<b>無關</b>：clock 再慢，這段錯誤還是存在，只是佔週期的比例變小。
          </p>
        </ModeContent>
      </Section>

      <Section title="Decode glitch：為什麼 ripple 不適合高速同步 decode" en="Decode glitches">
        <p>
          上面的 <span className="mono">dec00</span> 是一個 AND gate：dec00 = NOT q1 AND NOT q0，也就是「state 等於 00 時輸出 1」。理想波形裡它乾乾淨淨只在 state 00 那一段為 1。實際波形裡，edge 2 的 01 → 10 途中短暫經過 00，AND gate 忠實地把它 decode 出來——一個寬度只有 tCQ 的 <Term zh="毛刺" en="glitch" />。
        </p>
        <Steps
          items={[
            <>
              把 tCQ 拉到 4 或 6 ps：glitch 消失。因為 AND gate 自己有 6 ps 的延遲，<b>寬度不大於 gate delay（≤ 6 ps）</b>的輸入 pulse 來不及讓輸出翻轉（<Term zh="慣性延遲" en="inertial delay" />）——tCQ = 6 ps 時 glitch 寬度剛好等於 6 ps，仍然被濾掉，所以下面表格寫的是「≤ AND delay」。<b>這不是安全，只是運氣</b>——PVT 一變、tCQ 一長，glitch 就出來了。
            </>,
            <>
              把 tCQ 拉到 20～30 ps：glitch 寬度跟著 tCQ 變寬。如果這個 decode 訊號拿去當別的電路的 clock、reset、或 enable，這個 pulse 足以觸發一次錯誤動作。
            </>,
            <>
              如果 dec00 被一個以 clk 同步的 flop 抓走（下面的 FFS），只要 glitch 不落在那個 flop 的 setup / hold window 內，就抓不到——這是「同步 decode」看似安全的原因。但代價是 decode 的 arrival time 變成 N × tCQ + t<sub>gate</sub>，這條路徑必須在一個 Tclk 內完成。
            </>,
          ]}
        />
        <p>三級版本：dec000 = NOR(q2, q1, q0) 解碼 state 000，再由 FFS 在 clk rising edge 抓。切到「實際 delay」模式，注意 edge 4（011 → 100）與 edge 8（111 → 000）：</p>
        <DividerSimPanel netlist={ripple8Decode} schematic={ripple8DecodeSchematic} title="Ripple /8 + NOR3 decode + 同步 capture（FFS）" narrate={rippleNarrate} showDelayMode signals={['clk', 'q0', 'q1', 'q2', 'dec000', 'dec_s']} windowCycles={12} showTable={false} compact />
        <p className="small muted">
          模擬器的 T = 100 ps，tCQ = 8 ps，所以 dec000 在 edge 8 之後 3 × 8 + 10 = 34 ps 才升起，edge 9 抓得到。edge 4 的 011 → 100 會經過 010 → 000 → 100：在 tCQ = 8 時，000 只維持 8 ps，被 NOR 的 10 ps 延遲濾掉；tCQ 若是 20 ps，就會有一個 20 ps 的 glitch（本課的測試檔驗證了這兩個數字）。
        </p>
        <ModeContent level="deep" title="高速電路裡這件事怎麼變成災難">
          <ul>
            <li>
              <b>Metastability</b>：glitch 或延遲後的 decode edge 落在 capture flop 的 setup / hold window 內，FFS 進入 metastable；在 PLL 裡這常表現為偶發的 divide-ratio 錯誤（cycle slip）。
            </li>
            <li>
              <b>Jitter 累積</b>：每一級的 tCQ 都會隨供電雜訊、溫度變化。輸出 edge 相對輸入 edge 的延遲是 N × tCQ，它的變化量（jitter）也是 N 級疊加：<Math>{'\\sigma_{out}^2 \\approx \\sum_{k} \\sigma_{CQ,k}^2'}</Math>。同步 counter 的輸出只隔一個 tCQ。
            </li>
            <li>
              <b>Resynchronize</b>：實務上 prescaler 尾端常用一個以輸入 clock 打的 flop 重新對齊輸出（retiming）。這正是 FFS 做的事，也正是下一節的 interface path——延遲累積不會消失，只是被搬到那個 flop 的 setup 檢查裡。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="這個架構的 critical path" en="Critical path">
        <p>
          ripple divider 的 timing 限制<b>不是</b>一條普通的 register-to-register setup path。要分成三件事來看：
        </p>
        <ol>
          <li>
            <b>(a) 決定 Fmax 的路徑</b>：FF0.Q → INV0 → FF0.D。它是唯一以輸入 clk 為 launch 與 capture 的 feedback loop，跟 Lesson 1-1 的 /2 完全一樣。後面幾級的 loop 可用時間是 2T、4T…，永遠比第一級寬鬆。
          </li>
          <li>
            <b>(b) 累積 clock path</b>：clk → FF0 → q0 → FF1 → q1 → FF2 → q2。這不是 data path，是一條<b>越走越晚的 clock path</b>；它決定輸出延遲（N × tCQ，再加上到輸出腳的走線）與 temporary state 持續多久。它<b>沒有 capture flop</b>，所以不會有 setup violation——除非……
          </li>
          <li>
            <b>(c) 有人用 clk 去抓它</b>：一旦後面接同步 decode 或 resynchronizer（FFS），(b) 的累積延遲加上 decode gate 就變成 FFS 的 setup path。它與 divider 的 Fmax 無關，但限制「同步 decode 可以跑多快」。
          </li>
        </ol>
        <Callout kind="method" title="怎麼確認 (a) 才是 Fmax critical path？">
          <ol style={{ margin: 0 }}>
            <li>
              <b>Launch point</b>：FF0，clk 的 edge k。
            </li>
            <li>
              <b>Combinational logic</b>：INV0。
            </li>
            <li>
              <b>Capture point</b>：FF0，clk 的 edge k+1。可用時間一個 T<sub>clk</sub>。
            </li>
            <li>
              FF1 的 loop：launch 與 capture 都是 q0 的 falling edge，相鄰兩個 q0↓ 之間是 <b>2T</b>——同樣的 tCQ + tINV，可用時間卻是兩倍，slack 一定比 (a) 大。
            </li>
            <li>
              q0 → FF1.clk 這條線<b>沒有 capture</b>：它是 clock path。把「最長的線」直接叫 critical path 是本課最常見的錯誤。
            </li>
          </ol>
        </Callout>
        <CriticalPathExplorer scenario={rippleTiming} guided />
        <ModeContent level="engineer" title="三條路徑的 timing equation">
          <p>(a) Fmax path（launch = capture = FF0，相鄰 clk edge）：</p>
          <Math block>{'T_{clk,min} = t_{CQ,max} + t_{INV,max} + t_{setup} + t_{jitter} + t_{margin} = 8 + 6 + 7 + 2 + 2 = 25\\ \\text{ps}'}</Math>
          <p>(b) 輸出延遲（沒有 capture，不做 setup check）：</p>
          <Math block>{'t_{out} - t_{edge} = \\sum_{k=0}^{N-1} t_{CQ,k} + t_{wire} = 3 \\times 8 + 3 = 27\\ \\text{ps}\\ (\\max),\\quad 3 \\times 5 + 2 = 17\\ \\text{ps}\\ (\\min)'}</Math>
          <p>
            這就是 Explorer 上 (b) 那條印出的 <b>latency 27 ps</b>：三級 tCQ 累積 24 ps，再加 q2 → div_out 的輸出走線 <Math>{'t_{wire}'}</Math> = 3 ps（min corner 2 ps）。隨級數線性成長的只有 <Math>{'N\\,t_{CQ}'}</Math> 那一項，走線是固定的尾巴——所以講「N × tCQ」抓的是趨勢，要對數字就得把走線加回去。max 與 min 差 10 ps，就是這條輸出路徑的 delay variation 範圍。
          </p>
          <p>(c) interface path（launch = FF0 於 clk edge k，capture = FFS 於 clk edge k+1）：</p>
          <Math block>{'t_{arrival} = 3\\,t_{CQ,max} + t_{NOR,max} = 34\\ \\text{ps},\\qquad t_{required} = T_{clk} - t_{setup} - t_{jitter} - t_{margin} = 40 - 11 = 29\\ \\text{ps}'}</Math>
          <Math block>{'\\text{slack} = t_{required} - t_{arrival} = -5\\ \\text{ps}\\quad\\Rightarrow\\quad T_{clk,min}^{(c)} = 45\\ \\text{ps}'}</Math>
          <p>
            變數：<Math>{'t_{CQ,max/min}'}</Math> = 每級 clock-to-Q 最大 / 最小延遲；<Math>{'t_{wire}'}</Math> = q2 到 div_out 的走線延遲（2 / 3 ps）；<Math>{'t_{NOR}'}</Math> = decode gate 延遲；<Math>{'t_{setup}'}</Math> = capture flop 的 setup time；<Math>{'t_{jitter}'}</Math> = 相鄰 clk edge 間隔的不確定量；<Math>{'t_{margin}'}</Math> = 設計裕度。單位皆 ps。
          </p>
          <p>
            結論：divider 本身在 T = 40 ps 有 15 ps 的 slack，但同步 decode 在同一個 clock 下已經 −5 ps。(c) 的解法是改 decode 的抓取方式（較慢的 clock、multicycle、只 resync q2 不加 gate），而不是去改 divider。
          </p>
          <p>Hold（看最短路徑，FF0.Q → NOR3 → FFS.D）：</p>
          <Math block>{'t_{CQ,min} + t_{NOR,min} = 5 + 6 = 11\\ \\text{ps} \\ge t_{hold} + t_{skew} = 3\\ \\text{ps}'}</Math>
        </ModeContent>
        <ModeContent level="deep" title="高速 prescaler 裡 ripple 的真正角色">
          <ul>
            <li>
              <b>只有第一級在全速工作</b>：這是 ripple 在高速 prescaler 尾端受歡迎的原因。VCO 後面的第一個 /2 用 CML 做到極限速度；之後每一級頻率減半，可以換成更省電的 CMOS toggle flop。功耗 ∝ Σ f<sub>k</sub> = f<sub>in</sub>(1 + 1/2 + 1/4 + …) &lt; 2 f<sub>in</sub>，而同步 counter 每一級都在 f<sub>in</sub> 下切換 clock。
            </li>
            <li>
              <b>Pulse width</b>：FF1 的 clock 是 q0，q0 是 50% duty 的 2T 訊號，high / low 各一個 T——比輸入 clock 的半週期寬一倍，pulse-width 限制永遠比第一級寬鬆。
            </li>
            <li>
              <b>Clock-to-Q 的 PVT 變化</b>：三級的 27 ps 輸出延遲（24 ps 的 tCQ 累積 + 3 ps 輸出走線）在慢 corner 可能變 40 ps。若這個輸出要與另一條同步路徑對齊（例如 PFD 的另一個輸入），延遲的變化量直接變成 static phase offset 的變化，這就是 (b) 雖不限制 Fmax，卻常常限制系統規格的原因。
            </li>
            <li>
              <b>Resync flop 的 metastability</b>：interface path slack 為負時，不只是「晚一拍」——FFS 可能停在中點。設計上通常保證 N × tCQ + t<sub>gate</sub> + t<sub>setup</sub> &lt; T<sub>clk</sub> − 安全裕度，做不到就改用較慢的 clock（例如用 q0 而不是 clk 去 resync）。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>把 q0 → FF1.clk 這條「最長的線」當成 critical path</b>：它沒有 capture point，是 clock path。真正決定 Fmax 的是 FF0 自己的 Q → INV → D。
            </li>
            <li>
              <b>用同步的 next-state table 分析 ripple</b>：會得到 00 → 11 → 00 的錯誤序列。ripple 的後級只在前級的特定 edge 動作。
            </li>
            <li>
              <b>把 temporary state 當成 setup violation</b>：它不是 timing violation，是 ripple 架構天生的行為；即使所有 flop 都滿足 setup / hold，temporary state 照樣存在。
            </li>
            <li>
              <b>直接用 decode 輸出當 clock 或 async reset</b>：glitch 會觸發錯誤動作。要不就用同步 counter，要不就把 decode 輸出先用 flop 抓一次（並確認 interface path 的 slack）。
            </li>
            <li>
              <b>以為 tCQ 小到看不見就沒事</b>：temporary state 的寬度 = tCQ，與 clock 週期無關；PVT 慢 corner 時 tCQ 會變長，原本被 gate 濾掉的 glitch 會跑出來。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="SystemVerilog（synthesizable）">
          <CodeBlock
            title="ripple4.sv"
            code={`
module ripple4 (
  input  logic clk,
  input  logic rst_n,      // async active-low reset（所有級同時清 0）
  output logic q0, q1
);
  // 第一級：clock = clk，rising edge
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q0 <= 1'b0;
    else        q0 <= ~q0;          // d0 = NOT q0

  // 第二級：clock = q0 的 falling edge（negedge q0）
  always_ff @(negedge q0 or negedge rst_n)
    if (!rst_n) q1 <= 1'b0;
    else        q1 <= ~q1;          // d1 = NOT q1
endmodule
`}
            note="注意第二個 always_ff 的敏感列表是 negedge q0：這就是 ripple。STA 需要 create_generated_clock -divide_by 2 -invert 之類的宣告，q0 才會被當成 clock 分析。"
          />
        </ModeContent>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------- quiz 用波形（由 engine 產生，與 state table 一致）
const wfTraces = (nl: Netlist, opts: SimOptions) => simulate(nl, 6, { period: T, ...opts }).sim.getTraces(['clk', 'q0', 'q1'])
const wfRippleIdeal = wfTraces(ripple4, { delayMode: 'ideal' })
const wfRippleReal = wfTraces(ripple4, { delayMode: 'real', tcqOverride: 30 })
const wfSyncReal = wfTraces(sync4, { delayMode: 'real', tcqOverride: 30 })

function ExerciseComponent() {
  return <DividerSimPanel netlist={ripple8Rise} schematic={ripple8RiseSchematic} title="練習電路：FF1 由 q0 的 rising edge 觸發" narrate={rippleNarrate} showDelayMode showEquations={false} windowCycles={12} />
}

const lesson: LessonDef = {
  id: 'm1-l2-ripple',
  module: 1,
  order: 2,
  title: 'Ripple Counter Divider',
  titleEn: 'Ripple counter dividers',
  summary: '第一級的 Q 當第二級的 clock：兩級 /4、三級 /8。逐 edge 看誰被觸發、為什麼 tCQ 逐級累積、temporary state 與 decode glitch 從哪裡來、以及 ripple 的 timing 限制為什麼不是一條普通的 setup path。',
  goals: [
    '會用「前級變了嗎？是不是後級要的 edge？」兩個問題逐 edge 推出 ripple counter 的 state 序列。',
    '從 T_q0 = 2T 推到 T_q(k) = 2^(k+1) T，說明為什麼 N 級 ripple 是 /2^N 且每級 duty 50%。',
    '解釋 propagation delay 為什麼逐級累積成 N × tCQ，以及 temporary state（例如 11 → 10 → 00）為什麼持續一個 tCQ。',
    '說明 decode glitch 的來源，以及為什麼 ripple 不適合直接做高速同步 decode。',
    '分清楚 ripple 的三種 timing 限制：第一級的 Q → INV → D（Fmax）、累積 clock path（輸出延遲）、以及接了同步 capture 之後才出現的 interface path。',
  ],
  readingMinutes: 35,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'single',
      prompt: '兩級 ripple /4 中，FF1 的 clock 是什麼？',
      options: ['輸入 clk 的 rising edge', 'q0 的 falling edge', 'd0（inverter 的輸出）', 'rst_n'],
      answer: 1,
      explanation: 'FF1 的 clk pin 接的是 q0，且帶 bubble（falling edge）。q0 每兩個 clk edge falling 一次，所以 FF1 每兩個 clk edge 才被觸發一次。',
    },
    {
      id: 'q2',
      type: 'state',
      prompt: '三級 ripple /8 從 reset（000）開始，經過 5 個 clk rising edge 之後 q2 q1 q0 是多少？',
      answer: '101',
      width: 3,
      bitNames: ['q2', 'q1', 'q0'],
      explanation: '001 → 010 → 011 → 100 → 101：ripple counter 就是二進位 up count，5 = 101。',
    },
    {
      id: 'q3',
      type: 'state',
      prompt: '實際 delay 模式下，ripple /4 從 state 11 走到 00 的途中會短暫經過哪個 state？',
      answer: '10',
      width: 2,
      bitNames: ['q1', 'q0'],
      explanation: 'q0 先在 tCQ 之後變 0（此時 q1 還是 1 ⇒ state 10），q1 要等 q0 的 falling edge 再過一個 tCQ 才變 0。temporary state 10 持續一個 tCQ。',
    },
    {
      id: 'q4',
      type: 'waveform',
      prompt: '下列哪一張是「實際 delay」模式的 ripple /4 波形？（提示：看 q1 相對 q0 的時間關係）',
      options: [
        { label: 'A', traces: wfSyncReal },
        { label: 'B', traces: wfRippleIdeal },
        { label: 'C', traces: wfRippleReal },
      ],
      answer: 2,
      tEnd: 6 * T,
      period: T,
      explanation: 'C：q0 比 clk edge 晚一個 tCQ，q1 又比 q0 晚一個 tCQ（逐級累積）。A 是同步 counter：q0 與 q1 同時晚一個 tCQ。B 是理想模式：全部對齊 clk edge。',
    },
    {
      id: 'q5',
      type: 'numeric',
      prompt: '三級 ripple，每級 tCQ = 12 ps。111 → 000 這次 transition 中，q2 的改變相對於觸發它的 clk rising edge 延遲多少 ps？',
      answer: 36,
      unit: 'ps',
      explanation: 'q0 在 12 ps 變、q1 在 24 ps 變、q2 在 36 ps 變：第 k 級延遲 (k+1) × tCQ，三級就是 3 × 12 = 36 ps。',
    },
    {
      id: 'q6',
      type: 'critical-path',
      prompt: '三級 ripple /8：哪一條是決定 Fmax 的 setup critical path？',
      schematic: ripple8Schematic,
      options: [
        { label: 'q0 → FF1.clk → q1 → FF2.clk（最長的一條線）', highlight: rippleQuizHighlights.clkWire, description: 'clock path' },
        { label: 'FF0.Q → INV0 → FF0.D', highlight: rippleQuizHighlights.ff0Loop, description: '第一級 feedback loop' },
        { label: 'FF2.Q → INV2 → FF2.D', highlight: rippleQuizHighlights.ff2Loop, description: '第三級 feedback loop' },
        { label: 'q2 → div_out', highlight: rippleQuizHighlights.outWire, description: '輸出走線' },
      ],
      answer: 1,
      explanation: '只有 FF0 的 loop 以輸入 clk 為 launch 與 capture，可用時間一個 T。q0 → FF1.clk 是 clock path（沒有 capture）；FF2 的 loop 可用時間是 4T；輸出走線沒有 capture flop。',
    },
    {
      id: 'q7',
      type: 'multiple',
      prompt: '下列哪些敘述正確？',
      options: [
        'ripple counter 每一級的 clock 都不同，只有第一級直接聽輸入 clock',
        'N 級 ripple 的輸出相對輸入 edge 延遲約 N × tCQ',
        'ripple counter 的所有 state bit 在同一個 clk edge 同時更新',
        '第二級 feedback loop 的可用時間是 2T，所以它不會是 Fmax 的瓶頸',
        'temporary state 是 setup violation 造成的，改善 setup slack 就能消除',
      ],
      answers: [0, 1, 3],
      explanation: 'ripple 的 state 是一級接一級更新的（所以有 temporary state），這與 setup slack 無關，是架構天生的行為。第二級的 clock 週期是 2T，loop 可用時間是第一級的兩倍。',
    },
    {
      id: 'q8',
      type: 'single',
      prompt: '為什麼 ripple counter 不適合直接做高速同步 decode？',
      options: [
        '因為它的 divide ratio 不是整數',
        '因為 temporary state 會讓 decode 出現 glitch，且 decode 的 arrival time 是 N × tCQ + t_gate，很難在一個 Tclk 內抓到',
        '因為 ripple counter 沒有 reset',
        '因為 decode gate 會改變 divide ratio',
      ],
      answer: 1,
      explanation: '兩個原因：temporary state 產生寬度 tCQ 的 glitch；累積延遲讓 decode 訊號很晚才穩定。若用 clk 同步去抓，這條 interface path 的 slack 很快變負（本課例子在 T = 40 ps 時為 −5 ps）。',
    },
  ],
  exercise: {
    title: '第二級改用 rising edge 觸發的三級 ripple',
    prompt: (
      <>
        <p>
          下面的三級 ripple 與課文的 /8 只有一個差別：<b>FF1 由 q0 的 rising edge 觸發</b>（FF2 仍由 q1 的 falling edge 觸發）。先不要按模擬，自己用「前級變了嗎？是不是後級要的 edge？」推出前 8 個 edge 的 state 序列，回答：它還是 /8 嗎？q2 的第一個 rising edge 在第幾個 edge？q2 q1 q0 讀成二進位還是 0,1,2,3…嗎？
        </p>
        <p>然後切到「實際 delay」模式，看看 edge 1 之後有幾個 flop 一起動。</p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: ['寫出前 8 個 edge 的 q2 q1 q0', '找出 q1 與 q2 各在哪些 edge 翻轉，算出各自的除數', '說出 q2 的相位與課文 /8 差多少個 T', '解釋為什麼二進位讀法不再是單調的 up count', '若三級全部改成 rising edge 觸發，序列會變成什麼？'],
    answer: (
      <>
        <p>
          <b>State 序列</b>（edge 1 起）：011, 010, 101, 100, 111, 110, 001, 000，然後重複。推導：edge 1 時 q0：0 → 1 是 rising，正好觸發 FF1 ⇒ q1 也變 1 ⇒ 011。q1 在 edge 1、3、5、7 翻（每次 q0 rising），是 /4；q1 在 edge 3、7 falling ⇒ q2 在 edge 3、7 翻，是 /8。q2 的第一個 rising edge 在 <b>edge 3</b>（3T），比課文的 /8（4T）<b>早一個 T</b>；除數仍是 8、duty 仍是 50%。
        </p>
        <p>
          <b>編碼</b>：讀成二進位是 3, 2, 5, 4, 7, 6, 1, 0——不是單調計數，因為 q1 現在在 q0 的 rising edge（0 → 1）翻，等於「借位」而非「進位」。如果把 q0 反相來讀（q2, q1, NOT q0）就是 2, 3, 4, 5, 6, 7, 0, 1 的 up count（本課測試檔驗證了這一點）。
        </p>
        <p>
          <b>三級全部 rising</b>：每一級都在前級 0 → 1 時翻 ⇒ edge 1 三個 flop 一起變 1（實際 delay 下依序在 tCQ、2tCQ、3tCQ），之後 111, 110, 101, 100, 011, 010, 001, 000——一個 binary <b>down counter</b>。除數還是 8。
        </p>
        <DividerSimPanel netlist={ripple8AllRise} schematic={ripple8AllRiseSchematic} title="三級全 rising：down counter" narrate={rippleNarrate} showDelayMode showEquations={false} showMeasure={false} compact windowCycles={10} />
        <p className="small muted">
          Timing 的結論不變：Fmax 仍由 FF0.Q → INV0 → FF0.D 決定；輸出延遲仍是 3 × tCQ；只是 temporary state 出現的 transition 換了（例如 000 → 111 會經過 001、011）。
        </p>
      </>
    ),
  },
}
export default lesson
