import { useMemo } from 'react'
import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { StateTable } from '@/components/sim/StateTable'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { StateDiagram, graphToDiagram } from '@/components/circuit/StateDiagram'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, detectRuntPulses } from '@/models/divider/analysis'
import { sync4, sync8 } from '@/models/divider/examples'
import { ripple4Decode, sync4Decode } from './models'
import { sync4Highlights, sync4Schematic, sync8Schematic } from './sync-schematics'
import { sync4Timing, sync8Timing } from './sync-timing'

const T = 100

/** 靜態的逐 edge 表（由 engine 產生，與模擬器一致） */
function Sync4EdgeTable() {
  const r = useMemo(() => simulate(sync4, 8, { period: T }), [])
  return <StateTable netlist={sync4} records={r.records} period={T} currentIndex={-1} />
}

/** state diagram：直接由 buildStateGraph 建立 */
function Sync4StateDiagram() {
  const g = useMemo(() => buildStateGraph(sync4, {}), [])
  const d = graphToDiagram(g, 'clk↑')
  return <StateDiagram {...d} width={300} height={240} title="sync4 state graph（由 next-state equation 自動建立）" />
}

/** 同一個 decode gate：ripple 有 glitch、sync 沒有 */
function DecodeCompare() {
  const tcq = 20
  const names = ['clk', 'q0', 'q1', 'dec00']
  const rip = useMemo(() => simulate(ripple4Decode, 6, { period: T, delayMode: 'real', tcqOverride: tcq }), [])
  const syn = useMemo(() => simulate(sync4Decode, 6, { period: T, delayMode: 'real', tcqOverride: tcq }), [])
  const ripTraces = rip.sim.getTraces(names)
  const synTraces = syn.sim.getTraces(names)
  const ripRunts = detectRuntPulses(
    ripTraces.filter((t) => t.name === 'dec00'),
    T / 2,
  )
  const synRunts = detectRuntPulses(
    synTraces.filter((t) => t.name === 'dec00'),
    T / 2,
  )
  return (
    <div className="panel">
      <div className="panel-title">同一個 AND decode（state == 00），tCQ = {tcq} ps</div>
      <div className="two-col">
        <ClockWaveform title={`Ripple /4：dec00 glitch × ${ripRunts.length}`} signals={ripTraces} tEnd={7 * T} period={T} highlight={['dec00']} pxPerPeriod={95} showValuesAtCursor={false} markers={ripRunts.map((p) => ({ t: p.t0, label: `glitch ${p.width} ps`, kind: 'window' as const, signal: 'dec00' }))} />
        <ClockWaveform title={`Synchronous /4：dec00 glitch × ${synRunts.length}`} signals={synTraces} tEnd={7 * T} period={T} highlight={['dec00']} pxPerPeriod={95} showValuesAtCursor={false} />
      </div>
      <p className="small muted" style={{ margin: '0.4em 0 0' }}>
        同步版的 q0、q1 在同一個 edge 之後同時（同一個 tCQ）改變，01 → 10 不會經過 00，AND 的輸出乾淨；dec00 只是整體晚了 tCQ + tAND。ripple 版在 edge 2 與 edge 6 各出現一個寬度 = tCQ 的 glitch。
      </p>
    </div>
  )
}

function Content() {
  return (
    <>
      <Section title="先用直覺想" en="Intuition">
        <p>
          Ripple counter 像接力賽：第一棒跑完才輪到第二棒，第二棒跑完才輪到第三棒——每一棒都比前一棒晚一點起跑。<Term zh="同步計數器" en="synchronous counter" /> 像交響樂團：<b>所有人看同一個指揮</b>，指揮的棒子一落（clk rising edge），每個人同時做自己那一拍該做的事。
        </p>
        <p>
          但「同時做」有一個前提：每個人在棒子落下<b>之前</b>就已經知道自己這一拍要做什麼。在電路裡，「事先知道」就是 <Term zh="組合邏輯" en="combinational logic" />：它從現在的 state 算出每個 flop 下一個要抓的 D 值，等 clock edge 一起抓進去。
        </p>
        <Callout kind="idea">
          同步設計的核心約定：<b>所有 flop 用同一個 clock；下一個 state 由 combinational logic 從現在的 state 算好；edge 到時全部一起更新。</b> 好處是沒有 temporary state、timing 只需要看「一個 edge 到下一個 edge」；代價是 next-state logic 變成 critical path，而且 clock 要送到每一個 flop。
        </Callout>
      </Section>

      <Section title="最簡單的電路：同步 /4" en="The circuit">
        <p>
          兩個 DFF，clk 同時接到兩個 clk pin。next-state logic 有兩個 gate：inverter 給 FF0，XOR 給 FF1。
        </p>
        <Math block>{'d_0 = \\overline{q_0},\\qquad d_1 = q_1 \\oplus q_0'}</Math>
        <LogicDiagram schematic={sync4Schematic} showValues={false} />
        <ul>
          <li>
            <b>Clock input</b>：只有一條 <span className="mono">clk</span>，分兩路送到 FF0 與 FF1（圖上方的 clock 走線）。兩個 flop 都是 rising edge。
          </li>
          <li>
            <b>Memory element</b>：FF0、FF1，state = <span className="mono">q1 q0</span>。
          </li>
          <li>
            <b>Next-state logic</b>：d0 = NOT q0（跟 /2 一樣，q0 每個 edge toggle）；d1 = q1 XOR q0。
          </li>
        </ul>
        <Callout kind="note" title="d1 = q1 XOR q0 在說什麼？">
          回想 Lesson 0-3 的 T flip-flop：d = q XOR t，t = 1 時 toggle、t = 0 時 hold。這裡 t 就是 q0：<b>q0 = 1 時 q1 在下一個 edge toggle，q0 = 0 時 q1 保持</b>。這與 ripple 裡「q0 從 1 變 0 時 FF1 toggle」是同一個規則，只是 ripple 用 q0 的 edge 去<b>觸發</b>，同步版用 q0 的<b>值</b>去<b>選擇</b>要不要 toggle。
        </Callout>
      </Section>

      <Section title="逐一個 clock edge 操作" en="Edge by edge">
        <p>
          從 reset（q1 q0 = 00）開始。每個 edge 之前，先把現在的 q1 q0 代進兩條 next-state equation 算出 d1 d0；edge 到時兩個 flop <b>同時</b>抓進去。
        </p>
        <DividerSimPanel netlist={sync4} schematic={sync4Schematic} title="Synchronous /4：逐 edge" showDelayMode showPulseWidths />
        <Steps
          items={[
            <>
              <b>初始</b>：q1 q0 = 00。d0 = NOT 0 = 1；d1 = 0 XOR 0 = 0。
            </>,
            <>
              <b>Edge 1（t = 1T）</b>：FF0 抓 d0 = 1，FF1 抓 d1 = 0 ⇒ q1 q0 = <span className="mono">01</span>。接著 logic 重算：d0 = 0；d1 = 0 XOR 1 = 1。
            </>,
            <>
              <b>Edge 2（t = 2T）</b>：FF0 抓 0，FF1 抓 1 ⇒ <span className="mono">10</span>。重算：d0 = 1；d1 = 1 XOR 0 = 1。
            </>,
            <>
              <b>Edge 3（t = 3T）</b>：⇒ <span className="mono">11</span>。重算：d0 = 0；d1 = 1 XOR 1 = 0。
            </>,
            <>
              <b>Edge 4（t = 4T）</b>：⇒ <span className="mono">00</span>，回到初始。
            </>,
            <>
              <b>結論</b>：state 序列 00 → 01 → 10 → 11 → 00，與 ripple /4 一模一樣；q1 的 rising edge 在 edge 2、6、10 …，間隔 4T ⇒ <b>/4</b>。
            </>,
          ]}
        />
        <p>
          把模擬器切到「實際 delay」：q0 與 q1 都在 edge 之後<b>同一個</b> tCQ 改變（本課例子 8 ps）；d1 則要再等 XOR 的 12 ps 才更新——這 8 + 12 = 20 ps 就是等一下要算的 critical path。
        </p>
      </Section>

      <Section title="State table、state diagram 與 next-state equation" en="State table">
        <p>下面的表由模擬引擎產生（前 8 個 edge），每一列的「Combinational」欄就是 edge 前算好的 d1 d0：</p>
        <Sync4EdgeTable />
        <div className="two-col">
          <div>
            <table className="state-table">
              <thead>
                <tr>
                  <th>q1 q0</th>
                  <th>d0 = NOT q0</th>
                  <th>d1 = q1 ⊕ q0</th>
                  <th>next q1 q0</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>00</td>
                  <td>1</td>
                  <td>0</td>
                  <td>01</td>
                </tr>
                <tr>
                  <td>01</td>
                  <td>0</td>
                  <td>1</td>
                  <td>10</td>
                </tr>
                <tr>
                  <td>10</td>
                  <td>1</td>
                  <td>1</td>
                  <td>11</td>
                </tr>
                <tr>
                  <td>11</td>
                  <td>0</td>
                  <td>0</td>
                  <td>00</td>
                </tr>
              </tbody>
            </table>
            <p className="small muted">
              同步設計的好處：這張表<b>完全由 equation 決定</b>，不需要追蹤誰的 edge 何時來。四個 state 都在主循環上，沒有 unreachable、沒有 lock-up。
            </p>
          </div>
          <Sync4StateDiagram />
        </div>
        <ModeContent level="engineer" title="從「想要的序列」反推 equation">
          <p>
            設計同步 counter 的順序與分析相反：先寫下想要的 state 序列（00 → 01 → 10 → 11），列出每個 state 的 next state，然後對每一個 bit 找出 d = f(現在的 state)。q0 每步翻轉 ⇒ d0 = NOT q0；q1 在 q0 = 1 時翻轉 ⇒ d1 = q1 XOR q0。三個 bit 的 /8 用同樣方法：q2 在 q1 = q0 = 1 時翻轉 ⇒ d2 = q2 XOR (q1 AND q0)。一般式：
          </p>
          <Math block>{'d_k = q_k \\oplus \\big(q_{k-1}\\, q_{k-2} \\cdots q_0\\big)'}</Math>
          <p>括號裡是「所有低位都是 1」的 carry；位元越多，carry 的 AND 越寬，這就是同步 binary counter 的 critical path 隨位元數變慢的原因。</p>
        </ModeContent>
      </Section>

      <Section title="波形與 divide ratio 的數學推導" en="Deriving the divide ratio">
        <p>
          設輸入 clock 週期 <Math>{'T_{in}'}</Math>（ps）。q1 在 state 序列裡的值依序是 0, 0, 1, 1（對應 00, 01, 10, 11），每 4 個 edge 重複一次：
        </p>
        <Math block>{'T_{out} = T_{q_1} = 4\\,T_{in}\\quad\\Rightarrow\\quad N = 4,\\qquad f_{out} = \\frac{f_{in}}{4}'}</Math>
        <p>
          <b>Duty cycle</b>：q1 = 1 的 state 是 10 與 11，各佔一個 <Math>{'T_{in}'}</Math>：
        </p>
        <Math block>{'D = \\frac{t_{high}}{T_{out}} = \\frac{2\\,T_{in}}{4\\,T_{in}} = 50\\%'}</Math>
        <p>
          q0 的序列是 1, 0, 1, 0 ⇒ /2、50%。三個 bit 的 /8：q2 在 100, 101, 110, 111 為 1，佔 4 個 <Math>{'T_{in}'}</Math> ⇒ <Math>{'T_{q_2} = 8\\,T_{in}'}</Math>、50%。N-bit 同步 binary counter 的 MSB 是 <Math>{'/2^N'}</Math>，duty 50%——結果與 ripple 相同，但<b>每個 bit 都在同一個 edge 之後的同一個 tCQ 改變</b>。
        </p>
        <Callout kind="note" title="不只能除 2 的冪次">
          同步 counter 的 next-state 是任意 logic，所以序列不必是 binary count：只要讓 state 在 3 步、5 步後回到起點，就是 /3、/5（Module 2）。這是同步架構相對 ripple 的另一個關鍵優勢。
        </Callout>
      </Section>

      <Section title="三個 bit：同步 /8" en="Three bits: synchronous /8">
        <p>
          d2 = q2 XOR (q1 AND q0)：只有 q1 q0 = 11 時 q2 才翻。用模擬器走 8 個 edge，注意 <span className="mono">c1</span>（AND 的輸出）只在 state 011 與 111 為 1。
        </p>
        <DividerSimPanel netlist={sync8} schematic={sync8Schematic} title="Synchronous /8" showDelayMode signals={['clk', 'q0', 'q1', 'q2', 'c1', 'd2']} windowCycles={12} compact />
      </Section>

      <Section title="這個架構的 critical path" en="Critical path">
        <p>
          同步 counter 所有 flop 用同一個 clk，所以每一條 register-to-register path 的可用時間都是一個 T<sub>clk</sub>。問題只剩：<b>哪一條 path 的 delay 最長？</b>候選有：
        </p>
        <ul>
          <li>FF0.Q → INV → FF0.D：tCQ + tINV = 8 + 6 = 14 ps</li>
          <li>FF0.Q → XOR → FF1.D：tCQ + tXOR = 8 + 12 = 20 ps</li>
          <li>FF1.Q → XOR → FF1.D：tCQ + tXOR = 8 + 12 = 20 ps</li>
        </ul>
        <Callout kind="method" title="怎麼確認 XOR path 是 critical path？">
          <ol style={{ margin: 0 }}>
            <li>
              <b>Launch point</b>：FF0（clk 的 edge k，q0 在 tCQ 之後改變）。
            </li>
            <li>
              <b>Combinational logic</b>：XOR（q0 是它的一個輸入）。
            </li>
            <li>
              <b>Capture point</b>：FF1，clk 的 edge k+1。launch 與 capture 是<b>不同的 flop</b>——clock skew 開始有意義。
            </li>
            <li>
              <b>會被 sensitize 嗎？</b>會：q0 每個 edge 都變，XOR 對 q0 永遠敏感（另一個輸入不論是 0 或 1，q0 變 d1 就變）。
            </li>
            <li>
              <b>Slack</b>：required = 40 − 7 − 2 − 2 = 29 ps；arrival = 20 ps ⇒ slack = +9 ps。INV path 的 slack 是 +15 ps。XOR path 比較緊 ⇒ 它是 critical path。
            </li>
          </ol>
        </Callout>
        <CriticalPathExplorer scenario={sync4Timing} guided />
        <Callout kind="warning" title="經過最多 gate 的路徑不一定最慢">
          INV path 與 XOR path 都只有一個 gate，慢的是 XOR 這個 gate 本身（12 ps vs 6 ps）。反過來，兩個 inverter 串接（6 + 6 = 12 ps）和一個 XOR 一樣慢；三個 4 ps 的 NAND（12 ps）也一樣。critical path 看的是<b>每一條會被 sensitize 的路徑的 Σ delay</b>，不是 gate 的個數，也不是走線的長度。要一條一條把數字加出來比較。
        </Callout>
        <ModeContent level="engineer" title="Timing equation 與 skew">
          <p>Setup（launch = FF0 於 edge k，capture = FF1 於 edge k+1）：</p>
          <Math block>{'T_{clk,min} \\ge t_{CQ,max} + t_{XOR,max} + t_{setup} - t_{skew} + t_{jitter} + t_{margin} = 8 + 12 + 7 - 0 + 2 + 2 = 31\\ \\text{ps}'}</Math>
          <p>
            變數：<Math>{'t_{CQ,max}'}</Math> = FF0 的最大 clock-to-Q；<Math>{'t_{XOR,max}'}</Math> = XOR 最大延遲；<Math>{'t_{setup}'}</Math> = FF1 的 setup time；<Math>{'t_{skew}'}</Math> = FF1 的 clk 到達時間 − FF0 的 clk 到達時間；<Math>{'t_{jitter}'}</Math>、<Math>{'t_{margin}'}</Math> 同 Lesson 1-1。單位 ps。
          </p>
          <p>Hold（同一個 edge 之後，看最短路徑）：</p>
          <Math block>{'t_{CQ,min} + t_{logic,min} \\ge t_{hold} + t_{skew}\\qquad 5 + 4 = 9 \\ge 3'}</Math>
          <p>
            全電路最短的是 INV loop（5 + 4 = 9 ps），但它 launch = capture = FF0，<Math>{'t_{skew}'}</Math> 對它恆為 0。<b>會吃到 skew 的最短路徑</b>是 FF0.Q → XOR → FF1.D：<Math>{'t_{CQ,min} + t_{XOR,min} = 5 + 8 = 13\\ \\text{ps}'}</Math>，hold slack = 13 − (3 + <Math>{'t_{skew}'}</Math>) = 10 − <Math>{'t_{skew}'}</Math>。兩條要分開看：一條數字小但不怕 skew，一條數字大卻是 skew 的受害者。
          </p>
          <p>
            <b>Skew 的方向</b>：這裡 launch 與 capture 是不同的 flop，所以 clock 走線的差異會出現在 <Math>{'t_{skew}'}</Math>。若 FF1 的 clk 比 FF0 晚到 3 ps（skew = +3），FF1 的 capture edge 往後移，資料多了 3 ps 可以到達（setup slack +3），但同一個 edge 之後資料也必須多撐 3 ps 不變（hold slack −3）。不要背正負號：畫出 launch edge 與 capture edge 的相對位置就知道。
          </p>
          <p>Fmax 隨位元數變化（/8 的 carry chain）：</p>
          <Math block>{'t_{arrival}(d_2) = t_{CQ} + t_{AND} + t_{XOR} = 8 + 10 + 12 = 30\\ \\text{ps}'}</Math>
        </ModeContent>
        <ModeContent level="deep" title="高速實作的取捨">
          <ul>
            <li>
              <b>Clock load</b>：N 個 flop 都掛在 clk 上，clock buffer 要驅動 N 倍的電容，動態功耗 ∝ N · C · V² · f<sub>in</sub>。ripple 只有第一級在 f<sub>in</sub>。高速 prescaler 因此常常「前面 ripple、後面同步」。
            </li>
            <li>
              <b>Clock skew 與 hold</b>：clock tree 分兩路送到 FF0 與 FF1，走線長度、buffer 數目不同就有 skew。skew 對 setup 是加減幾 ps 的事，對 hold 卻可能是致命的——但要先挑對路徑。會被 skew 影響的 hold 路徑是 <span className="mono">FF0.Q → XOR → FF1.D</span>（launch 與 capture 是不同的 flop）：min delay = t<sub>CQ,min</sub> + t<sub>XOR,min</sub> = 5 + 8 = 13 ps。hold 變緊的條件是 <b>capture flop（FF1）的 clk 比 launch flop（FF0）晚到</b>，也就是 skew = t<sub>clk</sub>(FF1) − t<sub>clk</sub>(FF0) &gt; 0：capture edge 往後移，資料就必須多撐這麼久不變 ⇒ hold slack = 13 − (t<sub>hold</sub> + skew) = 10 − skew。skew = +6 ps 時只剩 4 ps，到 <b>+10 ps 就歸零</b>。反過來若 FF0 的 clk 晚到（skew &lt; 0），資料出發得比 capture edge 更晚，hold 反而更寬鬆（skew = −6 ⇒ hold slack 16 ps），這時變緊的是 setup——與上面 engineer 段落「setup +3 / hold −3」的方向完全一致。至於 <span className="mono">FF0.Q → INV → FF0.D</span> 這條 loop，min delay 雖然只有 9 ps，但 launch 與 capture 是<b>同一顆 FF0</b>、吃同一條 clk 分支，該分支晚到多少就同時推遲 launch 與 capture ⇒ 對它而言 skew 恆為 0，clock tree 再不平衡也不會讓它的 hold 變緊。
            </li>
            <li>
              <b>Carry chain</b>：/2<sup>N</sup> 的 d<sub>N−1</sub> 需要 (N−1)-input AND 再 XOR，Fmax 隨 N 下降。高速設計會改成 carry-lookahead、或把高位改成 ripple（它們頻率低，delay 累積無所謂）。
            </li>
            <li>
              <b>Decode 乾淨的真正原因與極限</b>：同步 counter 的 decode 沒有 temporary-state glitch，是因為所有 bit 的改變時間差只有 tCQ 的 mismatch（幾 ps），而不是 ripple 的整個 tCQ 乘以級數。但 mismatch 不是 0：decode 一個多 bit 同時翻轉的 state（例如 011 → 100）仍可能有 ps 級的窄 glitch，高速設計還是會把 decode 輸出再用 flop 抓一次。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="Ripple vs synchronous：怎麼選" en="Ripple vs synchronous">
        <CompareTable
          head={['', 'Ripple counter', 'Synchronous counter']}
          rows={[
            ['Clock', '每級不同：前級 Q 當後級 clock', '所有 flop 共用同一個 clk'],
            ['State 更新', '一級接一級（有 temporary state）', '同一個 edge 之後同時更新'],
            ['速度（Fmax）', '由第一級 Q → INV → D 決定，與級數無關', '由 next-state logic 最長路徑決定，位元數越多越慢（carry chain）'],
            ['功耗', '低：只有第一級在 f_in 切換，後級頻率減半', '高：N 個 flop 的 clock 都在 f_in 切換'],
            ['Clock load', '小（clk 只接一個 flop）', '大（clk 接 N 個 flop，需要 clock tree）'],
            ['輸出延遲（latency）', 'N × tCQ，隨 PVT 變化累積', '1 × tCQ'],
            ['Decode glitch', '有（temporary state，寬度 = tCQ）', '幾乎沒有（只剩 tCQ mismatch）'],
            ['Timing 分析', 'generated clock、clock path 累積；同步 capture 才有 interface path', '標準 register-to-register setup / hold'],
            ['除數', '只能 2^N', '任意（state machine）'],
            ['面積', '最小（每級一個 flop + 一個 inverter）', '較大（多 XOR / AND，clock buffer）'],
          ]}
        />
        <p>下面用同一個 AND decode（state == 00）比較兩者在 tCQ = 20 ps 時的行為：</p>
        <DecodeCompare />
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>用 gate 數目或走線長度猜 critical path</b>：要把每一條會被 sensitize 的路徑的 tCQ + Σ t<sub>gate</sub> 算出來比較。這裡 INV 與 XOR 都是一個 gate，XOR path 卻慢 6 ps。
            </li>
            <li>
              <b>忘記 launch 與 capture 是不同 flop 時 skew 會進來</b>：/2 的 loop（launch = capture = 同一顆 flop、同一條 clk 分支）skew 恆為 0，但 FF0 → XOR → FF1 的 skew 是 clock tree 決定的，setup 與 hold 一鬆一緊（FF1 的 clk 晚到 ⇒ setup 變鬆、hold 變緊）。
            </li>
            <li>
              <b>把 d1 寫成 NOT q1</b>：那是兩個獨立的 /2，q1 每個 edge 都翻，得到 00 → 11 → 00，不是 /4。q1 必須「有條件」地翻：d1 = q1 XOR q0。
            </li>
            <li>
              <b>以為同步 counter 完全沒有 decode glitch</b>：只是 glitch 寬度從「tCQ × 級數」縮到「tCQ mismatch」。高速 decode 仍要 register 一次。
            </li>
            <li>
              <b>忽略 clock load 對 tCQ 的影響</b>：clk 接了 N 個 flop，clock edge 變慢，每個 flop 的有效 tCQ 都會變大——critical path 的第一項就變大。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="SystemVerilog（synthesizable）">
          <CodeBlock
            title="sync4.sv"
            code={`
module sync4 (
  input  logic clk,
  input  logic rst_n,     // async active-low reset
  output logic q0, q1     // q1 = div_out
);
  // 兩個 flop 同一個 clock；next-state logic 寫在同一個 always_ff 裡
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      q0 <= 1'b0;
      q1 <= 1'b0;
    end else begin
      q0 <= ~q0;          // d0 = NOT q0
      q1 <= q1 ^ q0;      // d1 = q1 XOR q0
    end
  end
endmodule

// 等價寫法：2-bit 加法器
//   logic [1:0] cnt;  always_ff ... cnt <= cnt + 2'd1;  assign {q1, q0} = cnt;
`}
            note="synthesis 會把 cnt + 1 展開成 INV 與 XOR（以及 /8 以上的 AND carry chain）；STA 看到的就是課文那幾條 register-to-register path。"
          />
        </ModeContent>
      </Section>
    </>
  )
}

function ExerciseComponent() {
  return (
    <>
      <DividerSimPanel netlist={sync8} schematic={sync8Schematic} title="練習：同步 /8" showEquations={false} signals={['clk', 'q0', 'q1', 'q2', 'c1', 'd2']} windowCycles={10} compact />
      <CriticalPathExplorer scenario={sync8Timing} showEnvControls />
    </>
  )
}

const lesson: LessonDef = {
  id: 'm1-l3-sync',
  module: 1,
  order: 3,
  title: 'Synchronous Counter Divider',
  titleEn: 'Synchronous counter dividers',
  summary: '所有 DFF 用同一個 clock，由 combinational next-state logic 決定下一個 state：逐 edge 走過同步 /4、建立 state table 與 state diagram、推導除數與 duty，並用 slack 數字比較 INV path 與 XOR path 找出真正的 critical path；最後與 ripple counter 做完整比較。',
  goals: [
    '說出同步設計的三個約定：同一個 clock、next-state 由 logic 事先算好、edge 到時同時更新。',
    '從 d0 = NOT q0、d1 = q1 XOR q0 逐 edge 推出 00 → 01 → 10 → 11，並解釋 XOR 為什麼等於「q0 = 1 時才 toggle」。',
    '用 buildStateGraph 的觀點看 state table / state diagram：所有 state 都在主循環、沒有 lock-up。',
    '列出所有 register-to-register 候選路徑，用 tCQ + Σ t_gate 與 slack 數字（而不是 gate 數目）找出 critical path，並列出 hold path。',
    '比較 ripple 與 synchronous 在速度、功耗、clock load、decode glitch、latency、面積上的差異。',
  ],
  readingMinutes: 35,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'state',
      prompt: '同步 /4（d0 = NOT q0，d1 = q1 XOR q0）從 reset 開始，經過 3 個 rising edge 之後 q1 q0 是多少？',
      answer: '11',
      width: 2,
      bitNames: ['q1', 'q0'],
      explanation: '00 → 01 → 10 → 11。每個 edge 前先算 d1 d0：(1,0) → 01；(0,1) → 10；(1,1) → 11。',
    },
    {
      id: 'q2',
      type: 'single',
      prompt: 'd1 = q1 XOR q0 的行為是？',
      options: ['q1 每個 edge 都 toggle', 'q0 = 1 時 q1 在下一個 edge toggle，q0 = 0 時 q1 保持', 'q1 = 1 時 q0 toggle', 'q1 永遠等於 q0'],
      answer: 1,
      explanation: 'XOR 的一個輸入是 1 時輸出等於另一個輸入的反相（toggle），是 0 時輸出等於另一個輸入（hold）。這就是 T flip-flop，t = q0。',
    },
    {
      id: 'q3',
      type: 'critical-path',
      prompt: '同步 /4：tCQ = 8、tINV = 6、tXOR = 12 ps。哪一條是 setup critical path？',
      schematic: sync4Schematic,
      options: [
        { label: 'FF0.Q → INV → FF0.D', highlight: sync4Highlights.invLoop, description: 'arrival 14 ps' },
        { label: 'FF0.Q → XOR → FF1.D', highlight: sync4Highlights.xorPath, description: 'arrival 20 ps' },
        { label: 'clk → FF1.clk 的 clock 走線', highlight: sync4Highlights.clkWire, description: 'clock distribution' },
      ],
      answer: 1,
      explanation: '兩條 data path 可用時間都是一個 Tclk；XOR path 的 arrival（20 ps）比 INV path（14 ps）晚 ⇒ slack 較小 ⇒ critical。clock 走線沒有 launch / capture，它的影響以 skew 的形式進入 timing equation。',
    },
    {
      id: 'q4',
      type: 'numeric',
      prompt: '同步 /4，Tclk = 40 ps，tCQ,max = 8、tXOR,max = 12、tsetup = 7、jitter = 2、margin = 2、skew = 0（單位 ps）。FF0.Q → XOR → FF1.D 的 setup slack 是多少 ps？',
      answer: 9,
      unit: 'ps',
      explanation: 'required = 40 − 7 − 2 − 2 = 29；arrival = 8 + 12 = 20；slack = 29 − 20 = 9 ps。對應 Tclk,min = 31 ps。',
    },
    {
      id: 'q5',
      type: 'single',
      prompt: '若 FF1 的 clk 比 FF0 的 clk 晚到 3 ps（skew = +3 ps），對 FF0.Q → XOR → FF1.D 這條路徑的影響是？',
      options: ['setup slack +3 ps，hold slack −3 ps', 'setup slack −3 ps，hold slack +3 ps', 'setup 與 hold 都 +3 ps', '沒有影響，因為兩個 flop 用同一個 clock'],
      answer: 0,
      explanation: 'capture edge 往後移 3 ps：資料多 3 ps 可以到達（setup 寬鬆），但同一個 edge 之後資料必須多撐 3 ps 不變（hold 嚴格）。畫出 launch edge 與 capture edge 的相對位置就能看出來，不必背正負號。',
    },
    {
      id: 'q6',
      type: 'multiple',
      prompt: '下列哪些是 synchronous counter 相對 ripple counter 的正確比較？',
      options: [
        '所有 flop 用同一個 clock，state 在同一個 edge 之後同時更新',
        'Fmax 由 next-state logic 的最長路徑決定，位元數越多通常越慢',
        'clock load 比 ripple 小',
        '輸出延遲是 1 × tCQ 而不是 N × tCQ',
        'decode 完全不可能出現 glitch',
      ],
      answers: [0, 1, 3],
      explanation: '同步 counter 的 clk 要接到每一個 flop，clock load 比 ripple 大；decode glitch 只是縮小到 tCQ mismatch 的程度，不是完全消失。',
    },
    {
      id: 'q7',
      type: 'single',
      prompt: '「經過最多 gate 的路徑就是 critical path」——正確的說法應該是？',
      options: [
        '正確，gate 越多 delay 越長',
        '應該看走線最長的路徑',
        '應該把每一條會被 sensitize 的 launch → capture 路徑的 tCQ + Σ gate delay 算出來，slack 最小的才是',
        '應該看 fan-out 最大的 flop',
      ],
      answer: 2,
      explanation: '一個 12 ps 的 XOR 和兩個 6 ps 的 inverter 一樣慢。critical path 由數字決定，而且只有會被 sensitize、且有 launch / capture 的路徑才算。',
    },
    {
      id: 'q8',
      type: 'state',
      prompt: '同步 /8（d2 = q2 XOR (q1 AND q0)）從 reset 開始，經過 6 個 edge 之後 q2 q1 q0 是多少？',
      answer: '110',
      width: 3,
      bitNames: ['q2', 'q1', 'q0'],
      explanation: '同步 binary counter 就是 up count：001, 010, 011, 100, 101, 110。第 6 步 = 6 = 110。',
    },
  ],
  exercise: {
    title: '同步 /8 的 critical path 與 slack',
    prompt: (
      <>
        <p>
          下面是同步 /8：d0 = NOT q0、d1 = q1 XOR q0、d2 = q2 XOR (q1 AND q0)。gate delay（max）：INV 6 ps、AND 10 ps、XOR 12 ps；tCQ,max = 8 ps、tsetup = 7 ps、thold = 3 ps；Tclk = 50 ps、jitter = 2 ps、margin = 2 ps、skew = 0。
        </p>
        <p>
          先不要打開 Critical Path Explorer 的數字：列出所有從某個 flop 的 Q 出發、到某個 flop 的 D 結束的路徑，算出每一條的 arrival time，找出 slack 最小的一條，並算出它的 slack 與 Tclk,min。再用下面的工具對答案。
        </p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: ['列出至少 5 條 launch → capture 路徑及各自的 arrival time', '指出 critical path 經過哪兩個 gate', '算出它在 Tclk = 50 ps 時的 setup slack', '算出 Tclk,min 與 Fmax', '指出 FF2.D 的 hold 要看哪一條（最短）路徑'],
    answer: (
      <>
        <p>
          <b>候選路徑與 arrival（ps）</b>：FF0.Q → INV → FF0.D = 8 + 6 = 14；FF0.Q → XOR1 → FF1.D = 8 + 12 = 20；FF1.Q → XOR1 → FF1.D = 20；FF2.Q → XOR2 → FF2.D = 20；<b>FF0.Q → AND → XOR2 → FF2.D = 8 + 10 + 12 = 30</b>；FF1.Q → AND → XOR2 → FF2.D = 30。
        </p>
        <p>
          <b>Critical path</b>：q0（或 q1）→ AND → XOR2 → FF2.D，兩級 gate。required = 50 − 7 − 2 − 2 = 39 ps，arrival = 30 ps ⇒ <b>slack = +9 ps</b>。Tclk,min = 8 + 10 + 12 + 7 + 2 + 2 = 41 ps ⇒ Fmax ≈ 24.4 GHz（以本課的假想數字）。
        </p>
        <p>
          <b>Hold</b>：FF2.D 的最短路徑是 FF2.Q → XOR2 → FF2.D，min delay = 5 + 8 = 13 ps ≥ thold 3 ps；整個電路最短的是 FF0.Q → INV → FF0.D 的 5 + 4 = 9 ps。
        </p>
        <p>
          <b>觀察</b>：/4 的 critical path（XOR，20 ps）在 /8 裡已經不是最慢的；每多一個 bit，carry 的 AND 就多一個輸入，Fmax 持續下降——這是同步 binary counter 與 ripple（Fmax 與級數無關）最根本的差異。
        </p>
      </>
    ),
  },
}
export default lesson
