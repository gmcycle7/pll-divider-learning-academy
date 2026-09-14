import { useMemo } from 'react'
import type { LabExercise } from '@/lab/types'
import type { QuizQuestion } from '@/components/quiz/types'
import { Callout, CodeBlock, CompareTable, Math as M, ModeContent, Section, Steps, Term } from '@/components/content'
import { StateTable } from '@/components/sim/StateTable'
import { StateDiagram, graphToDiagram } from '@/components/circuit/StateDiagram'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { QuizEngine } from '@/components/quiz/QuizEngine'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, measureDivide } from '@/models/divider/analysis'
import { dualMod23 } from '@/models/divider/examples'
import { fmtNum } from '@/utils/format'
import { ex5Schematic } from './advanced-schematics'
import { ex5Timing } from './advanced-timing'

const T = 100

/**
 * 交替 /2 與 /3 的 input pattern：ctrl 只在 state = 01 的 edge（k ≡ 2 mod 5 走 /2、k ≡ 4 mod 5 走 /3）被取樣。
 * 邊 1、2 用 0，邊 3、4、5 用 1 ⇒ measureDivide 量到的週期依序是 3, 2, 3, 2 …，平均 2.5：
 * 第一個 out rising edge 落在 edge 2（ctrl 還是 0 的那個 /2 週期結束時），所以第一個完整的輸出週期是 3 T，之後才 3、2 交替。
 */
export function alternatingMod(k: number): { mod: 0 | 1 } {
  return { mod: k % 5 === 1 || k % 5 === 2 ? 0 : 1 }
}

function Prompt() {
  return (
    <>
      <p>
        兩個 flop 共用 clk，兩個 gate：U3 的輸出端有 bubble，U4 沒有。除了 clk 與 rst_n 之外，還多了一個外部訊號 <span className="mono">ctrl</span>，它只接到 U4 的一個輸入。輸出 out 取自 U3 的輸出（不是任何一個 flop 的 Q）。
      </p>
      <p>
        這一題的工作紙第 6、7、9 題請<b>分 ctrl = 0 與 ctrl = 1 兩種情況各寫一組</b>；第 11 題請認真想：ctrl 在哪一個 edge 被「看見」？在其他時間改變它會不會有事？模擬器的 input 按鈕可以在任何一步之前切換 ctrl，切完後把 out 的 rising edge 間隔記下來，看看相位有沒有跳。（模擬器的按鈕直接印 netlist 的訊號名稱，所以圖上標 <span className="mono">ctrl</span> 的這條線，按鈕上寫的是 <span className="mono">mod</span>——同一個訊號。）
      </p>
    </>
  )
}

const quiz: QuizQuestion[] = [
  {
    id: 'q1',
    type: 'state',
    prompt: 'ctrl = 1，從 reset（n2 n1 = 00）開始，經過 4 個 clk rising edge 之後 state（q1q0）是多少？',
    answer: '01',
    width: 2,
    bitNames: ['n2(q1)', 'n1(q0)'],
    explanation: '00 → 01 → 10 → 00 → 01。三個 edge 一圈，第 4 個 edge 後回到 01。',
  },
  {
    id: 'q2',
    type: 'single',
    prompt: 'ctrl 在哪一個 rising edge 被電路「看見」（決定這個 output 週期是 2 還是 3 個 T）？',
    options: ['state 由 00 進入 01 的那個 edge', 'state 為 01 時的那個 rising edge（U4 = n1 AND ctrl 被 U2 取樣）', '每一個 edge 都會', 'out 由 0 → 1 的那個 edge'],
    answer: 1,
    explanation: 'n4 = n1 AND ctrl，只有 n1 = q0 = 1（state 01）時 ctrl 才能穿過 U4 到 U2.D。其他 edge n1 = 0，U4 輸出恆 0，ctrl 是什麼都無所謂。',
  },
  {
    id: 'q3',
    type: 'numeric',
    prompt: 'tCQ,max = 8、NOR = 12、AND = 10、tsetup = 7、jitter = 2、margin = 2、skew = 0。Tclk,min 是多少 ps？',
    answer: 31,
    unit: 'ps',
    explanation: '最慢的是 NOR 路徑：8 + 12 + 7 + 2 + 2 = 31 ps。AND 路徑只有 8 + 10 = 18 ps，不是 critical。兩個 mode 的 Tclk,min 相同。',
  },
  {
    id: 'q4',
    type: 'multiple',
    prompt: '下列哪些敘述正確？',
    options: ['out 的 rising edge 永遠發生在進入 state 00 的 edge，所以 ctrl 在 2 與 3 之間切換時輸出相位不會跳（phase-continuous）', 'ctrl = 0 時 U2.Q → NOR 這條路徑不會被 sensitize', 'state 11 是 lock-up state', '兩個 mode 的 output duty 都是 50%'],
    answers: [0, 1],
    explanation: '兩種週期都從 state 00 開始、也都在回到 00 時結束，edge 不會多也不會少。ctrl = 0 時 q1 恆 0，n2 沒有 transition。11 在 ctrl = 1 時 → 10、ctrl = 0 時 → 00，一個 edge 就回主循環。/3 的 duty 是 1/3。',
  },
  {
    id: 'q5',
    type: 'single',
    prompt: 'ctrl 每個 output 週期交替 0、1、0、1…，長期平均除數是多少？',
    options: ['2', '2.5', '3', '不確定，取決於 ctrl 切換的相位'],
    answer: 1,
    explanation: '週期依序 2 T、3 T、2 T、3 T…，平均 (2 + 3) / 2 = 2.5。只要 ctrl 在正確的 edge 前穩定，瞬時值永遠是 2 或 3（整數），平均值才是 2.5——這就是 fractional-N 的基本原理。',
  },
]

function Solution() {
  const sim0 = useMemo(() => simulate(dualMod23, 8, { period: T }), [])
  const sim1 = useMemo(() => simulate(dualMod23, 9, { period: T }, (k) => (k === 1 ? { mod: 1 } : {})), [])
  const simAlt = useMemo(() => simulate(dualMod23, 12, { period: T }, alternatingMod), [])
  const graph0 = useMemo(() => buildStateGraph(dualMod23, { mod: 0 }), [])
  const graph1 = useMemo(() => buildStateGraph(dualMod23, { mod: 1 }), [])
  const altMeasure = useMemo(() => measureDivide(simAlt.traces.find((t) => t.name === 'div_out')!, T), [simAlt])
  const altTraces = useMemo(() => simAlt.traces.filter((t) => ['clk', 'mod', 'q1', 'q0', 'div_out'].includes(t.name)), [simAlt])

  return (
    <>
      <Section title="第一步：兩個 D、一個外部控制" en="Write every D">
        <p>
          兩個 flop 共用 clk，是同步電路；ctrl 不接任何 clk pin，它是 data。state = q1q0，q1 = Q(U2) = n2（MSB）、q0 = Q(U1) = n1（LSB）。
        </p>
        <ul>
          <li>
            <b>U1.D = n3 = U3(n1, n2)</b>，U3 是 NOR ⇒ <b>d0 = NOT(q1 OR q0)</b>：只有 state 00 時才是 1。這條與題目 4 完全相同。
          </li>
          <li>
            <b>U2.D = n4 = U4(n1, ctrl)</b>，U4 是 AND ⇒ <b>d1 = q0 AND ctrl</b>：q1 只有在「上一個 state 是 01 <i>而且</i> ctrl = 1」時才會變成 1。
          </li>
          <li>
            <b>out = n3 = d0</b>：輸出不是 flop 的 Q，而是 NOR 的輸出——state 00 時為 1。
          </li>
        </ul>
        <Callout kind="idea" title="ctrl 在做什麼">
          把 ctrl 想成一個「要不要多繞一步」的開關。沒有它（ctrl = 0）U2 永遠是 0，電路只剩 q0 在 0、1 之間跳——就是題目 1 的 /2。ctrl = 1 時 01 之後多插入一個 state 10 再回 00——變成題目 4 的 /3。<b>同一個電路、同一組 flop、只差一個 AND</b>：這就是 <Term zh="雙模除頻器" en="dual-modulus divider" />。
        </Callout>
      </Section>

      <Section title="第二步：ctrl = 0 逐 edge，再把 ctrl 換成 1 重推一次" en="Edge by edge, both modes">
        <Steps
          items={[
            <>
              <b>Reset</b>：q1q0 = 00。edge 前：d0 = NOR(0,0) = 1、d1 = 0 AND ctrl = 0。out = d0 = <b>1</b>（reset 期間 out 就是 high）。
            </>,
            <>
              <b>ctrl = 0，Edge 1</b>：q0 ← 1、q1 ← 0 ⇒ <span className="mono">01</span>。out = NOR(1,0) = 0。新的 d0 = 0、d1 = 1 AND 0 = <b>0</b>（ctrl 在這裡被看了一眼，答案是「不繞」）。
            </>,
            <>
              <b>ctrl = 0，Edge 2</b>：q0 ← 0、q1 ← 0 ⇒ <span className="mono">00</span>。out 由 0 → 1。兩個 edge 一圈：<b>/2</b>，out 每 2 T 一個 rising edge（t = 2T、4T…）。
            </>,
            <>
              <b>ctrl = 1，Edge 1</b>：00 → 01，同上。但新的 d1 = q0 AND ctrl = 1 AND 1 = <b>1</b>。
            </>,
            <>
              <b>ctrl = 1，Edge 2</b>：q0 ← NOR(1,0) = 0、q1 ← 1 ⇒ <span className="mono">10</span>。out = NOR(0,1) = 0——還沒回到 00，out 繼續 low。
            </>,
            <>
              <b>ctrl = 1，Edge 3</b>：d0 = NOR(0,1) = 0、d1 = q0 AND 1 = 0 AND 1 = 0 ⇒ <span className="mono">00</span>。out 由 0 → 1。三個 edge 一圈：<b>/3</b>，rising edge 在 t = 3T、6T…。
            </>,
          ]}
        />
        <div className="two-col">
          <div>
            <p className="small muted">ctrl = 0（模擬器）：00 → 01 → 00，out 每 2 個 edge 升一次。</p>
            <StateTable netlist={dualMod23} records={sim0.records} period={T} maxRows={6} />
          </div>
          <div>
            <p className="small muted">ctrl = 1（模擬器，ctrl 在 edge 1 前切成 1）：00 → 01 → 10 → 00。</p>
            <StateTable netlist={dualMod23} records={sim1.records} period={T} maxRows={7} />
          </div>
        </div>
      </Section>

      <Section title="第三步：兩張 state diagram，unused state 都會自復原" en="State graphs">
        <div className="two-col">
          <div>
            <StateDiagram {...graphToDiagram(graph0, 'clk↑')} width={300} height={230} title="ctrl = 0：主循環 00 → 01" />
            <p className="small muted">10 → 00、11 → 00：d1 = q0 AND 0 恆為 0，任何 state 一個 edge 內 q1 都被清掉。</p>
          </div>
          <div>
            <StateDiagram {...graphToDiagram(graph1, 'clk↑')} width={300} height={230} title="ctrl = 1：主循環 00 → 01 → 10" />
            <p className="small muted">11 → 10：d0 = NOR(1,1) = 0、d1 = q0 AND 1 = 1。與題目 4 一樣，11 是 unused 但不 lock-up。</p>
          </div>
        </div>
        <p>
          4 個 state 都不會被卡住，所以這個 cell 不需要 reset 就能脫困；reset 只決定起始相位。工作紙第 15 題寫「11 是 lock-up」就錯了——要看它的 next state。
        </p>
      </Section>

      <Section title="第四步：除數、duty，以及「切換不跳相位」" en="Divide ratio and phase continuity">
        <M block>{'N = \\begin{cases} 2, & ctrl = 0 \\\\ 3, & ctrl = 1 \\end{cases} \\qquad D = \\frac{t_{high}}{T_{out}} = \\begin{cases} 1\\,T_{in} / 2\\,T_{in} = 50\\% \\\\ 1\\,T_{in} / 3\\,T_{in} \\approx 33\\% \\end{cases}'}</M>
        <p>
          <M>{'T_{in}'}</M> 為 clk 週期（ps），<M>{'T_{out}'}</M> 為 out 週期。out 只在 state 00 為 1，兩個 mode 都 high 一個 T；分母不同，duty 就不同。
        </p>
        <Callout kind="method" title="為什麼切換 ctrl 不會讓 out 的 edge 跳掉">
          兩種週期都從 state 00 出發（out 剛升起）、都在回到 00 時結束（out 再升起）。ctrl 只決定中間要走 1 個還是 2 個 state。所以不管怎麼切，相鄰兩個 rising edge 之間永遠是 2 T 或 3 T，<b>不會出現 1 T、4 T，也不會多一個或少一個 edge</b>。這叫 <Term zh="相位連續" en="phase continuity" />——它是 state machine 結構的結果，不是 timing 湊出來的。
        </Callout>
        <p className="small muted">
          下圖把 ctrl 每個 output 週期交替 0 / 1：out 的間隔依序 {altMeasure.intervals.map((x) => `${x}T`).join('、')}，平均 {fmtNum(altMeasure.intervals.reduce((a, b) => a + b, 0) / altMeasure.intervals.length, 3)}。瞬時值永遠是整數，平均值才是 2.5。
        </p>
        <ClockWaveform signals={altTraces} tEnd={12 * T} period={T} showEdgeTimes={['div_out']} highlight={['div_out']} markers={simAlt.records.map((r) => ({ t: r.t, label: String(r.edgeIndex), kind: 'edge' as const }))} />
        <Callout kind="warning" title="這不是「/2 與 /3 的輸出用 MUX 選一個」">
          若你把獨立的 /2 與 /3 divider 各自跑，再用 ctrl 選輸出，兩個 divider 的相位各自獨立，切換瞬間輸出可能出現 runt 或相位跳躍。dual-modulus 的精神是<b>同一組 state bit 走不同長度的循環</b>，state 從頭到尾只有一份。
        </Callout>
      </Section>

      <Section title="第五步：ctrl 的 deadline" en="Control timing deadline">
        <p>
          工作紙第 11 題。d1 = n1 AND ctrl，n1 = q0 只在 state 01 為 1。所以 ctrl 只在<b>「state = 01 時的那個 rising edge」</b>被 U2 取樣，一個 output 週期只有一次。往前推：
        </p>
        <M block>{'t_{ctrl,stable} \\le t_{edge(01)} - (t_{setup} + t_{AND} + t_{wire}) = t_{edge(01)} - (7 + 10 + 4)\\ \\text{ps} = t_{edge(01)} - 21\\ \\text{ps}'}</M>
        <ul>
          <li>
            <b>最安全的切換時刻</b>：state 00 期間（out = 1 的那個 T）。此時 n1 = 0，U4 被關著，ctrl 怎麼變都不會傳到 U2。距離取樣 edge 還有整整 1 T 減 21 ps。
          </li>
          <li>
            <b>最危險</b>：在 state 01 那個 edge 前 21 ps 內改變 ctrl ⇒ U2 setup / hold violation ⇒ 這一個週期不知道是 2 還是 3（甚至 metastable），但電路不會因此壞掉——下一個週期又回到正軌。
          </li>
          <li>
            <b>工程上的做法</b>：用 out 的 rising edge（進入 00）當 clock 把 ctrl 重新取樣。這樣 ctrl 的 launch edge 就固定在 state 00 的開頭，STA 可以直接檢查 out → ctrl flop → U4 → U2.D 這條 path。
          </li>
        </ul>
      </Section>

      <Section title="第六步：critical path 隨 mode 改變名單，但不改變數字" en="Critical path">
        <Callout kind="method" title="候選路徑（tCQ 8、NOR 12、AND 10、wire 4、tsetup 7、jitter 2、margin 2）">
          <ol style={{ margin: 0 }}>
            <li>
              <b>U1.Q → U3 → U1.D</b>：8 + 12 = <b>20 ps</b>。兩個 mode 都會動——每個週期 n1 至少變兩次。
            </li>
            <li>
              <b>U2.Q → U3 → U1.D</b>：8 + 12 = 20 ps。只有 ctrl = 1 時 n2 才會 0 → 1 → 0；ctrl = 0 時 n2 恆 0，路徑存在但沒有 transition。
            </li>
            <li>
              <b>U1.Q → U4 → U2.D</b>：8 + 10 = 18 ps。只有 ctrl = 1 時 AND 才打開。
            </li>
            <li>
              <b>ctrl → U4 → U2.D</b>：4 + 10 = 14 ps。這是 control deadline（上一節），不是 register-to-register 的 Fmax path。
            </li>
          </ol>
          <p style={{ margin: '0.4em 0 0' }}>
            Tclk,min = 20 + 7 + 2 + 2 = <b>31 ps</b>，兩個 mode 相同。T = 40 ps 時 slack 9 ps。切到 /3 mode 多了兩條 sensitized path，但都不比 NOR 路徑慢，所以 Fmax 沒變——「換 mode 後要重看一次」不代表數字一定會變。
          </p>
        </Callout>
        <ModeContent level="engineer" title="Timing equation、hold 與 RTL">
          <M block>{'T_{clk,min} \\ge t_{CQ} + t_{NOR} + t_{setup} - t_{skew} + t_{jitter} + t_{margin} = 8 + 12 + 7 - 0 + 2 + 2 = 31\\ \\text{ps}'}</M>
          <M block>{'\\text{hold（U1.Q → U4 → U2.D）}:\\; t_{CQ,min} + t_{AND,min} = 5 + 8 = 13 \\ge t_{hold} + t_{skew} = 3 + t_{skew}'}</M>
          <p>
            <M>{'t_{skew}'}</M> = clk 到達 capture flop − 到達 launch flop（ps）。U1 → U2 這條 AND 路徑 launch 與 capture 是不同的 flop，clock tree 的 skew 會直接進來：skew {'>'} 10 ps 才會 hold fail，比題目 4 沒有 logic 的路徑寬鬆。
          </p>
          <CodeBlock
            title="等效 RTL"
            code={`
module lab_ex5 (
  input  logic clk,
  input  logic rst_n,
  input  logic ctrl,      // 0: /2, 1: /3
  output logic out
);
  logic q0, q1;
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) {q1, q0} <= 2'b00;
    else begin
      q0 <= ~(q1 | q0);   // n3 = NOR(n2, n1)
      q1 <= q0 & ctrl;    // n4 = n1 AND ctrl
    end
  assign out = ~(q1 | q0); // n3：state 00 時為 1
endmodule
`}
            note="ctrl = 0：00 → 01 → 00；ctrl = 1：00 → 01 → 10 → 00。ctrl 只在 q0 = 1 的 edge 有作用。"
          />
        </ModeContent>
        <ModeContent level="deep" title="實際 delay、hazard 與高速實作">
          <ul>
            <li>
              <b>實際 delay</b>（T = 100、tCQ 8、NOR 12、AND 10）：edge k 後 n1 在 k·T + 8 變，n3 在 k·T + 20、n4 在 k·T + 18 穩定。out = n3 也在 edge 後 20 ps 才升起——output 的 latency 是 tCQ + NOR，不是 tCQ。若 out 拿去當下游的 clock，這 20 ps 就是 generated clock 的 source latency。
            </li>
            <li>
              <b>NOR hazard</b>：ctrl = 1 時 01 → 10 那個 edge，n1 由 1 → 0、n2 由 0 → 1 幾乎同時變；n1 先落、n2 後升會讓 n3（= out）短暫跳到 1。它在 edge 後 ~10 ps 發生、寬度只有幾 ps。對 U1.D 無害，但 <b>out 上會出現一個 runt pulse</b>——這就是「output 從 decode 出去」的代價。要乾淨的 output 就從 flop Q 直接出去（例如加一個 flop 把 n3 重新取樣，latency 多 1 T）。
            </li>
            <li>
              <b>ctrl 的 metastability</b>：若 ctrl 來自另一個 clock domain，在 state 01 那個 edge 附近改變會讓 U2 進入 metastable；結果是 q1 在 edge 後很久才決定 0 或 1，等於 tCQ 變大，下一個 edge U1.D（經 NOR）可能 setup fail。所以 ctrl 一定要先同步到 clk domain（或用 out 重新取樣）。
            </li>
            <li>
              <b>高速 /2 /3 cell</b>：CML 實作常把 NOR 併進 U1 的 master latch、AND 併進 U2 的 master latch，讓 tCQ + gate 變成一個 stage；ctrl 走差動、進入 AND 的尾電流開關。fVCO 到 20 GHz 以上時這個 cell 仍是 MMD 第一級的標準做法（見題目 6）。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>把 ctrl 當成 clock 或 reset</b>：它接的是 AND 的 data 輸入。判斷方法：有沒有接到任何 clk pin？沒有。
            </li>
            <li>
              <b>只推一種 mode</b>：dual-modulus 要兩組 state sequence，reachable state 與 duty 也要分開寫。
            </li>
            <li>
              <b>以為 ctrl 隨時都有效</b>：它只在 state 01 那個 edge 被取樣；其他時間改變沒有作用，也不會產生 glitch。
            </li>
            <li>
              <b>把「/2 與 /3 輸出經 MUX 選」當成 dual-modulus</b>：那種做法相位不連續；dual-modulus 是同一組 state bit 走不同長度的循環。
            </li>
            <li>
              <b>認為換 mode 一定改變 Tclk,min</b>：這裡 /3 多出的兩條路徑都不比 NOR 慢，Fmax 不變；但名單變了，STA 要兩個 mode 都跑。
            </li>
          </ul>
        </Callout>
      </Section>

      <Section title="解答後自我檢查" en="Self-check">
        <CompareTable head={['', 'ctrl = 0', 'ctrl = 1']} rows={[['state sequence', '00 → 01 → 00', '00 → 01 → 10 → 00'], ['除數', '2', '3'], ['duty', '50%', '1/3'], ['sensitized path', 'U1.Q → NOR → U1.D', '四條都活著'], ['Tclk,min', '31 ps', '31 ps']]} />
        <QuizEngine questions={quiz} title="題目 5 自我檢查" storageKey="lab-ex5-dm23-check" />
      </Section>
    </>
  )
}

const exercise: LabExercise = {
  id: 'ex5-dm23',
  order: 5,
  title: '多一個 AND 與一個外部訊號：同一組 flop 走兩種長度的循環',
  difficulty: 3,
  summary: '/2 /3 dual-modulus cell：練習「每個 mode 各推一次」、control 訊號的取樣 edge 與 deadline、mode switching 的 phase continuity，以及 mode 如何改變 sensitized path 的名單。',
  netlist: dualMod23,
  schematic: ex5Schematic,
  simOptions: { period: T },
  reference: {
    q1: 'clk：同時接 U1、U2 的 clk pin（rising edge），同步電路。ctrl 不是 clock——它只接到 U4（AND）的 data 輸入',
    q2: 'U1、U2 兩個 rising-edge DFF（共用 async reset rst_n）。U3 是 NOR、U4 是 AND，都是 combinational；out 從 U3 的輸出（n3）取出，不是任何一個 Q',
    q3: 'q1 = Q(U2) = n2（MSB）、q0 = Q(U1) = n1（LSB）；state = q1q0，共 2 bit',
    q4: '00（rst_n = 0 時兩個 flop 都清成 0；此時 n3 = NOR(0,0) = 1，所以 reset 期間 out = 1）',
    q5: 'd0 = n3 = NOR(q1, q0) = NOT(q1 OR q0)（U3）；d1 = n4 = q0 AND ctrl（U4）；out = n3 = d0',
    q6: 'ctrl = 0：reachable 只有 00、01；10 與 11 各在 1 個 edge 內回到 00（d1 恆 0）。ctrl = 1：reachable 00、01、10；11 → 10 一個 edge 回主循環。兩種 mode 都沒有 lock-up',
    q7: 'ctrl = 0：00 → 01 → 00（2 個 edge 一圈）；ctrl = 1：00 → 01 → 10 → 00（3 個 edge 一圈）。走哪一條由 state 01 那個 edge 的 ctrl 決定',
    q8: 'out = n3 = NOR(q1, q0)：在「進入 state 00」的 edge 由 0 → 1，在下一個 edge（離開 00）由 1 → 0。ctrl = 0：edge 2、4、6… 升起；ctrl = 1：edge 3、6、9… 升起',
    q9: '2 或 3（mod=0 → 2，mod=1 → 3）：ctrl = 0 時 out rising edge 每 2 個 clk 週期一次，ctrl = 1 時每 3 個一次；交替切換時瞬時值仍是 2 或 3，平均值介於兩者之間（例如 0/1 交替 → 2.5）',
    q10: 'ctrl = 0：50%（high 1 T、low 1 T）；ctrl = 1：1/3（high 1 T、low 2 T）。out 只在 state 00 為 1，兩個 mode 都 high 一個 T，分母不同',
    q11: 'ctrl 只在 state = 01 的那個 rising edge 被取樣（d1 = q0 AND ctrl，其他 edge q0 = 0 擋住 AND）。必須在該 edge 前 tsetup + tAND + wire = 7 + 10 + 4 = 21 ps 穩定；在 state 00 期間（out = 1）改變 ctrl 最安全，有將近 1 T 的餘裕。rst_n 為 async reset，另外要看 recovery / removal',
    q12: 'U1.Q（n1）在第 k 個 rising edge launch：進 U3（NOR，兩個 mode 都會動）與 U4（AND，只有 ctrl = 1 時傳得過去）。ctrl = 1 時 U2.Q（n2）也在第 k 個 edge launch 進 U3。ctrl → U4 → U2.D 是 control 路徑，launch 由上游決定',
    q13: 'U1.D（n3）在第 k+1 個 rising edge capture（NOR 路徑，可用 1 T）；U2.D（n4）在第 k+1 個 edge capture（AND 路徑）。兩個 mode 的 capture edge 都是下一個 clk edge',
    q14: 'tCQ(8) → U3 NOR(12) → tsetup(7)：arrival 20 ps，Tclk,min = 20 + 7 + 2 + 2 = 31 ps（兩個 mode 相同）；U1.Q → U4 AND(10) → U2.D：18 ps（次要，只在 ctrl = 1 被 sensitize）；ctrl → wire(4) → AND(10) → U2.D：14 ps，這是 deadline 不是 Fmax；hold：5 + 8 = 13 ≥ 3',
    q15: 'unused state：ctrl = 1 時 11 → 10、ctrl = 0 時 10 → 00 與 11 → 00，全部自復原，沒有 lock-up。glitch：01 → 10 時 n1↓、n2↑ 同時變，NOR 輸出（= out）可能有幾 ps 的 static-0 hazard——對 U1.D 無害，但 out 上會有 runt（output 從 decode 出去的代價）。phase continuity：兩種週期都從 00 開始、回到 00 結束，切換 ctrl 不會多或少一個 edge。ctrl 若在 state 01 的 edge 前 21 ps 內改變 → U2 setup / hold violation，該週期除數不確定（2 或 3），但下一週期恢復',
  },
  hints: [
    '先看 clock：兩個 flop 都吃 clk，同步電路；ctrl 只接到 U4，是 data 不是 clock。再看兩個 gate 的符號：U3 有 bubble（NOR）、U4 沒有（AND）。U3 吃兩個 Q、輸出接回 U1.D 也接到 out——這一半和題目 4 一模一樣。U4 吃 U1.Q 和 ctrl、輸出接 U2.D：想想 ctrl = 0 時 U4 的輸出是什麼，U2 還會不會變？',
    'd0 = NOR(q1, q0)、d1 = q0 AND ctrl、out = NOR 輸出。ctrl = 0：d1 恆 0 ⇒ q1 永遠是 0 ⇒ 只剩 q0 在 NOR(0, q0) = NOT q0 之間翻：00 → 01 → 00。ctrl = 1：從 00 開始，edge 1 後 01（d1 = 1 AND 1 = 1）；edge 2 後 q1 ← 1、q0 ← NOR(0,1) = 0 ⇒ 10；再算一次 10：d0 = NOR(1,0) = ？d1 = q0 AND 1 = ？——看看回到哪裡。另外把 11 代進兩種 ctrl 看它去哪。',
    '下表是 ctrl = 0（模擬器預設）逐 edge 產生的結果：out 每 2 個 edge 升一次。請自己在模擬器把 ctrl（按鈕上寫的是 netlist 名稱 mod）切成 1 再跑一次，你會看到 00 → 01 → 10 → 00。然後試試在不同的 edge 前切換 ctrl：注意 d1 那一欄只有在 state = 01 那一列會等於 ctrl——那就是 ctrl 被「看見」的 edge。',
  ],
  Solution,
  criticalPath: ex5Timing,
  Prompt,
}
export default exercise
