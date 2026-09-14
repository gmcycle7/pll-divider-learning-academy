import { useMemo } from 'react'
import type { LabExercise } from '@/lab/types'
import type { QuizQuestion } from '@/components/quiz/types'
import type { Bit } from '@/models/divider/types'
import { Callout, CodeBlock, CompareTable, Math as M, ModeContent, Section, Steps, Term } from '@/components/content'
import { StateTable } from '@/components/sim/StateTable'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { QuizEngine } from '@/components/quiz/QuizEngine'
import { simulate } from '@/models/divider/engine'
import { measureDivide, stateSequence } from '@/models/divider/analysis'
import { mmd2 } from '@/models/divider/examples'
import { pct } from '@/utils/format'
import { ex6Schematic } from './advanced-schematics'
import { ex6Timing } from './advanced-timing'

const T = 100

/** 四種控制設定：c1 c0 → N = 4 + 2·c1 + c0 */
export const EX6_SETTINGS: { c1: Bit; c0: Bit; N: number }[] = [
  { c1: 0, c0: 0, N: 4 },
  { c1: 0, c0: 1, N: 5 },
  { c1: 1, c0: 0, N: 6 },
  { c1: 1, c0: 1, N: 7 },
]

function simWith(c1: Bit, c0: Bit, edges: number) {
  return simulate(mmd2, edges, { period: T }, (k) => (k === 1 ? { p0: c0, p1: c1 } : {}))
}

function Prompt() {
  return (
    <>
      <p>
        九個元件、兩個虛框。先數 clock：<b>clk 只接到 U1 與 U2</b>；U6、U7 的 clk pin 接的是 n3——它是 U3 的輸出。兩個外部控制 c0、c1 各接到一個 AND。輸出 out 從 U8 的輸出（n8）取出，而 n8 還經過底部一條長線回到 block A 的 U5。
      </p>
      <p>
        建議的拆法：先把 block B 蓋住，只看 block A——它和題目 5 有什麼不同？再把 block A 蓋住，只看 block B——它的 clock 是什麼、它的「ctrl」又是什麼？工作紙第 6、7、9、10 題請把 c1c0 = 00、01、10、11 四種都推一遍（state 寫成 n7 n6 n2 n1）。模擬器的 input 按鈕直接印 netlist 的訊號名稱，所以圖上的 <span className="mono">c0</span>、<span className="mono">c1</span> 在按鈕上分別寫成 <span className="mono">p0</span>、<span className="mono">p1</span>。第 12～14 題請特別注意：最長的路徑<b>不一定</b>在同一個 clock domain 裡。
      </p>
    </>
  )
}

const quiz: QuizQuestion[] = [
  {
    id: 'q1',
    type: 'numeric',
    prompt: 'c1 c0 = 10 時的除數 N 是多少？',
    answer: 6,
    explanation: 'N = 4 + 2·c1 + c0 = 4 + 2 + 0 = 6。block B 走 /3（三個 n3 週期）、block A 每個 n3 週期都走 /2 ⇒ 3 × 2 = 6。',
  },
  {
    id: 'q2',
    type: 'state',
    prompt: 'c1 c0 = 01（N = 5），從 reset 經過 3 個 clk rising edge 之後，state（n7 n6 n2 n1 = b1 b0 a1 a0）是多少？',
    answer: '0100',
    width: 4,
    bitNames: ['n7(b1)', 'n6(b0)', 'n2(a1)', 'n1(a0)'],
    explanation: '0000 → 0001 → 0010（block A 走 /3，因為 n8 = 1 且 c0 = 1）→ 0100（a 回到 00，n3 升起，b 由 00 變 01）。',
  },
  {
    id: 'q3',
    type: 'single',
    prompt: '哪一條是全電路的 critical path（決定 Tclk,min）？',
    options: ['U1.Q → U3（NOR）→ U1.D（block A 自己的 loop，1 T）', 'U6.Q → U8 → U5 → U4 → U2.D（block B 回 block A 的 mod chain，2 T 可用）', 'U6.Q → U8 → U6.D（block B 自己的 loop）', 'c1 → U9 → U7.D'],
    answer: 1,
    explanation: 'mod chain 六段加起來 60 ps（含 n3 的 20 ps latency），可用 2 T：Tclk,min = (60 + 11) / 2 = 35.5 ps，比 block A loop 的 31 ps 更緊。block B 的 loop 在 n3 domain，可用時間至少 2 T，非常鬆。',
  },
  {
    id: 'q4',
    type: 'multiple',
    prompt: '下列哪些敘述正確？',
    options: ['n3 是 generated clock：它的 rising edge 比 clk edge 晚 tCQ + NOR', 'mod chain 有 2 個 clk cycle 可用，因為 edge k+1 時 n1 = 0 擋住 U4', 'block B 的兩個 flop 由 clk 觸發', 'c0 = 0 時 block B 的請求（n8）永遠到不了 U2.D'],
    answers: [0, 1, 3],
    explanation: 'n3 = NOR(a1, a0) 在 a 回到 00 後 tCQ + NOR 才升起。block A 回到 00 之後下一個 state 一定是 01，所以 U4 = n1 AND n5 在 edge k+1 被 n1 = 0 擋住，真正取樣在 edge k+2。block B 的 clock 是 n3。c0 = 0 時 U5 輸出恆 0。',
  },
  {
    id: 'q5',
    type: 'single',
    prompt: 'c1 c0 = 10（N = 6）時 out 的 duty cycle 是多少？',
    options: ['50%', '1/3', '2/3', '3/7'],
    answer: 1,
    explanation: 'out = n8 = 1 只在 b = 00 期間，長度是一個 n3 週期 = (2 + c0) T = 2 T；輸出週期 6 T ⇒ 1/3。四種設定的 duty 分別是 2/4、3/5、2/6、3/7。',
  },
]

function Solution() {
  const sims = useMemo(() => EX6_SETTINGS.map((s) => ({ ...s, sim: simWith(s.c1, s.c0, 2 * s.N + 2) })), [])
  const rows = useMemo(
    () =>
      sims.map(({ c1, c0, N, sim }) => {
        const m = measureDivide(sim.traces.find((t) => t.name === 'div_out')!, T)
        const seq = stateSequence(mmd2, sim.records)
        return { c1, c0, N, ratio: m.ratio, duty: m.duty, seq: ['0000', ...seq.slice(0, N)].join(' → ') }
      }),
    [sims],
  )
  const sim5 = sims[1].sim
  const traces5 = useMemo(() => sim5.traces.filter((t) => ['clk', 'a0', 'a1', 'f1', 'b0', 'b1', 'mod_out2', 'mod1_eff', 'div_out'].includes(t.name)), [sim5])

  return (
    <>
      <Section title="第一步：兩個 clock domain、兩個一模一樣的 cell" en="Two clock domains, one cell twice">
        <p>
          先數 clock。<b>clk 只接 U1、U2</b>（block A）。U6、U7 的 clock 是 <b>n3 = U3 的輸出</b>——不是 clk。所以 block B 活在另一個 clock domain，n3 是由 block A 產生的 <Term zh="衍生時脈" en="generated clock" />，它的 rising edge 比 clk edge 晚 tCQ + tNOR。
        </p>
        <p>再把每個 block 拆開看：</p>
        <ul>
          <li>
            <b>block A</b>：U3 NOR 吃 n1、n2 回 U1.D；U4 AND 吃 n1 與 n5 回 U2.D。這就是題目 5 的 /2 /3 cell，只是「ctrl」換成了 n5 = U5(c0, n8) = <b>c0 AND n8</b>。
          </li>
          <li>
            <b>block B</b>：U8 NOR 吃 n6、n7 回 U6.D；U9 AND 吃 n6 與 c1 回 U7.D。也是題目 5 的 cell，ctrl = c1，clock = n3。
          </li>
          <li>
            <b>連接</b>：block A 的 NOR 輸出 n3 當 block B 的 clock；block B 的 NOR 輸出 n8 回頭當 block A 的「要不要走 /3」請求（經 c0 gating）。out = n8。
          </li>
        </ul>
        <Callout kind="idea" title="讀法">
          block A 是「快的」cell，每個 n3 週期走 /2；只有當 block B 說「這一次請走 /3」（n8 = 1）而且 c0 允許時，才多繞一個 state。block B 是「慢的」cell，用 block A 送來的 n3 當 clock，自己走 /2 或 /3（由 c1 決定）。兩級串起來，除數是 2 × (2 或 3) 再加上「有沒有多繞一次」——這就是 <Term zh="多模除頻器" en="multi-modulus divider, MMD" /> 的基本結構。
        </Callout>
      </Section>

      <Section title="第二步：c1c0 = 00 逐 edge，再讓 c0 = 1 看差別" en="Edge by edge">
        <p>state 寫成 n7 n6 n2 n1 = b1 b0 a1 a0。所有方程式：</p>
        <ul>
          <li>da0 = n3 = NOR(a1, a0)；da1 = n4 = a0 AND n5；n5 = c0 AND n8</li>
          <li>db0 = n8 = NOR(b1, b0)；db1 = n9 = b0 AND c1；out = n8</li>
        </ul>
        <Steps
          items={[
            <>
              <b>Reset</b>：0000。n3 = NOR(0,0) = 1、n8 = NOR(0,0) = 1、out = 1。c1c0 = 00 ⇒ n5 = 0 AND 1 = 0。
            </>,
            <>
              <b>Edge 1（clk）</b>：block A：da0 = n3 = 1、da1 = 0 ⇒ a = 01。n3 由 1 落到 0（falling edge，block B 不動）⇒ <span className="mono">0001</span>。
            </>,
            <>
              <b>Edge 2</b>：da0 = NOR(0,1) = 0、da1 = 1 AND 0 = 0 ⇒ a = 00 ⇒ n3 由 0 升到 1 ⇒ <b>block B 在這個 rising edge 取樣</b>：db0 = n8 = 1、db1 = b0 AND c1 = 0 ⇒ b = 01 ⇒ <span className="mono">0100</span>。此時 n8 = NOR(0,1) = 0，out 由 1 → 0。
            </>,
            <>
              <b>Edge 3</b>：a = 00 → 01 ⇒ <span className="mono">0101</span>；n3 落下。
            </>,
            <>
              <b>Edge 4</b>：a → 00，n3 升起，block B 取樣：db0 = NOR(0,1) = 0、db1 = 1 AND 0 = 0 ⇒ b = 00 ⇒ <span className="mono">0000</span>。n8 = 1，out 由 0 → 1。<b>四個 edge 一圈：/4</b>。out high 從 edge 4 到 edge 6（b = 00 撐一個 n3 週期 = 2 T），duty 2/4 = 50%。
            </>,
            <>
              <b>c0 = 1 時哪裡不同</b>：reset 時 n5 = 1 AND n8 = 1。Edge 1 後 a = 01，而且 da1 = a0 AND n5 = 1 ⇒ Edge 2 後 a = <b>10</b>（不是 00）；Edge 3 後 a = 00，n3 才升起、b 才變 01。block A 這一輪走了 /3。b = 01 之後 n8 = 0 ⇒ n5 = 0，接下來 block A 都走 /2；直到 b 回到 00（n8 = 1）才再走一次 /3。所以每個 output 週期恰好多一個 T：N = 4 + 1 = 5。
            </>,
          ]}
        />
        <div className="two-col">
          <div>
            <p className="small muted">c1c0 = 00（N = 4）：</p>
            <StateTable netlist={mmd2} records={sims[0].sim.records} period={T} maxRows={9} combSignals={['f1', 'mod_out2', 'mod1_eff', 'da1', 'db1']} />
          </div>
          <div>
            <p className="small muted">c1c0 = 01（N = 5）：注意 edge 2 那一列 a 走到 10。</p>
            <StateTable netlist={mmd2} records={sims[1].sim.records} period={T} maxRows={11} combSignals={['f1', 'mod_out2', 'mod1_eff', 'da1', 'db1']} />
          </div>
        </div>
        <p className="small muted">N = 5 的波形：n3（f1）是 block B 的 clock，只有它的 rising edge 會讓 b 改變；n8（mod_out2）只在 b = 00 期間為 1，透過 n5（mod1_eff）讓 block A 走一次 /3。</p>
        <ClockWaveform signals={traces5} tEnd={12 * T} period={T} showEdgeTimes={['div_out']} highlight={['f1', 'div_out']} markers={sim5.records.slice(0, 12).map((r) => ({ t: r.t, label: String(r.edgeIndex), kind: 'edge' as const }))} />
      </Section>

      <Section title="第三步：四種設定的 state sequence 與除數" en="All four settings">
        <p className="small muted">由模擬器逐 edge 產生（state = b1 b0 a1 a0）。每一種都從 0000 出發，也都在回到 0000 時 out 升起：</p>
        <CompareTable
          head={['c1 c0', 'N（量測）', 'state sequence', 'duty']}
          rows={rows.map((r) => [`${r.c1} ${r.c0}`, `${r.ratio}`, <span className="mono" key={r.N}>{r.seq}</span>, r.duty !== null ? pct(r.duty) : '—'])}
        />
        <M block>{'N = \\underbrace{(2 + c_1)}_{\\text{block B 的 n3 週期數}} \\times 2 + \\underbrace{c_0}_{\\text{block A 多繞一次}} = 4 + 2c_1 + c_0 \\in \\{4, 5, 6, 7\\}'}</M>
        <p>
          推導：block B 每個 output 週期走 (2 + c1) 個 n3 週期；其中<b>恰好一個</b> n3 週期 b = 00（n8 = 1），block A 在那一輪走 /3（若 c0 = 1），其餘都走 /2。所以總共 2 × (2 + c1) + c0 個 clk 週期。這是 modular MMD 的通式：n 級 cell 的 N = 2ⁿ + Σ cᵢ·2ⁱ。
        </p>
        <M block>{'D = \\frac{t_{high}}{T_{out}} = \\frac{(2 + c_0)\\,T_{in}}{N\\,T_{in}} \\quad\\Rightarrow\\quad \\tfrac{2}{4},\\ \\tfrac{3}{5},\\ \\tfrac{2}{6},\\ \\tfrac{3}{7}'}</M>
        <p>
          <M>{'T_{in}'}</M> 為 clk 週期（ps）。out = n8 只在 b = 00 為 1，長度是一個 n3 週期；而 b = 00 那一輪正是 block A 走 /3 的那一輪（若 c0 = 1），所以 high 的長度是 (2 + c0) T。四種 duty 都不是 50%（除了 N = 4）。
        </p>
        <Callout kind="note" title="unused state">
          block A 的 11：da0 = NOR(1,1) = 0、da1 = a0 AND n5 ⇒ 下一個 edge 變 10（n5 = 1）或 00；block B 的 11 同理。任何非法組合最多 2 個 edge 就回到主循環，沒有 lock-up。
        </Callout>
      </Section>

      <Section title="第四步：c0 與 c1 的 deadline" en="Control timing deadlines">
        <ul>
          <li>
            <b>c0</b>：只在「block A 在 01 <i>而且</i> n8 = 1（block B 在 00）」的那個 clk edge 被 U4 取樣，每個 output 週期一次。往前推 tsetup + U4 + U5 + wire = 7 + 10 + 10 + 4 = 31 ps。在週期的其他時間改變 c0 都不會被看到。
          </li>
          <li>
            <b>c1</b>：只在 block B 處於 01 的那個 <b>n3 rising edge</b> 被 U9 取樣。n3 的 edge 比 clk 晚 20 ps，所以若 c1 是由 clk domain 的 flop 送來，deadline 反而寬了 20 ps。
          </li>
          <li>
            <b>實務</b>：把 c1c0 用 out 的 rising edge（b 進入 00 的那一刻）重新取樣。此時 block B 剛進入 00、block A 剛回到 00，兩個取樣 edge都在至少 1 T 之後——這就是 MMD「modulus 由輸出重新取樣」的標準做法，也是 fractional-N 中 DSM 更新 N 的時機。
          </li>
        </ul>
      </Section>

      <Section title="第五步：critical path 不在任何一個 block 裡面" en="Critical path">
        <Callout kind="method" title="三種不同性質的 path（tCQ 8、NOR 12、AND 10、tsetup 7、jitter 2、margin 2）">
          <ol style={{ margin: 0 }}>
            <li>
              <b>block A 自己的 loop</b>：U1.Q → U3 → U1.D，8 + 12 = 20 ps，可用 1 T ⇒ Tclk,min = 31 ps。與題目 5 相同。
            </li>
            <li>
              <b>block B 自己的 loop</b>：U6.Q → U8 → U6.D，同樣 20 ps，但 launch 與 capture 都是 n3 的 rising edge，n3 週期最短 2 T ⇒ 永遠比 block A 鬆。
            </li>
            <li>
              <b>mod chain</b>：U6.Q → U8 → U5 → U4 → U2.D。launch 是 n3 的 rising edge，它本身比 clk edge k 晚 20 ps；再加 tCQ 8 + NOR 12 + AND 10 + AND 10 ⇒ 從 clk edge k 算起 <b>60 ps</b>。capture 是 clk edge <b>k+2</b>——因為 edge k+1 時 block A 在 00 → 01，n1 = 0 把 U4 關著，n5 是什麼都沒差；edge k+2 時 a = 01，U4 = n1 AND n5 才真的把請求送進 U2。可用 2 T：Tclk,min = (60 + 7 + 2 + 2) / 2 = <b>35.5 ps</b>。
            </li>
          </ol>
          <p style={{ margin: '0.4em 0 0' }}>
            35.5 {'>'} 31：全電路的 Fmax 由 mod chain 決定，不是由任何一個 cell 的 loop。這是 MMD 的通則——級數越多、最後一級的請求回到第一級要穿過越多 cell，這條「modulus 回傳鏈」越來越長，而每一級能給它的時間是固定的幾個 T。
          </p>
        </Callout>
        <ModeContent level="engineer" title="Multicycle 的判斷、timing equation 與 RTL">
          <M block>{'T_{clk,min} \\ge \\frac{t_{lat}(n_3) + t_{CQ} + t_{NOR} + t_{AND} + t_{AND} + t_{setup} + t_{jitter} + t_{margin}}{2} = \\frac{20 + 8 + 12 + 10 + 10 + 7 + 2 + 2}{2} = 35.5\\ \\text{ps}'}</M>
          <p>
            <M>{'t_{lat}(n_3)'}</M> = n3 相對 clk edge 的 source latency（ps）。分母 2 是 multicycle 的 cycle 數：只有在「edge k 之後 block A 的下一個 state 必定是 01」這件事被證明之後才能宣告。本題成立（00 的 next 一定是 01）；若某個變體讓 block A 在 00 之後直接取樣 n5，就退回 1 cycle，Tclk,min 變成 71 ps。宣告 exception 之前一定要用模擬確認——工作紙第 13 題答「edge k+1」的人，等於做了保守但錯的分析。
          </p>
          <M block>{'\\text{hold（0-cycle）}:\\; 13 + 5 + 8 + 8 + 8 = 42 \\ge t_{hold} + t_{skew} = 3 + t_{skew}'}</M>
          <CodeBlock
            title="等效 RTL"
            code={`
module lab_ex6 (
  input  logic clk, rst_n,
  input  logic c0, c1,          // N = 4 + 2*c1 + c0
  output logic out
);
  logic a0, a1, b0, b1;
  logic n3, n8, n5;
  assign n3 = ~(a1 | a0);       // block A NOR：da0，也是 block B 的 clock
  assign n8 = ~(b1 | b0);       // block B NOR：db0，也是 out 與 modulus 請求
  assign n5 = c0 & n8;          // U5
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) {a1, a0} <= 2'b00;
    else begin a0 <= n3; a1 <= a0 & n5; end
  always_ff @(posedge n3 or negedge rst_n)   // generated clock！
    if (!rst_n) {b1, b0} <= 2'b00;
    else begin b0 <= n8; b1 <= b0 & c1; end
  assign out = n8;
endmodule
`}
            note="合成時 n3 必須宣告成 clk 的 generated clock（divide-by 2 或 3），否則 STA 看不到 block B 的任何 path，也不會對 mod chain 做正確的 latency 計算。"
          />
        </ModeContent>
        <ModeContent level="deep" title="實際 delay、generated clock 上的 glitch 與高速 MMD">
          <ul>
            <li>
              <b>實際 delay</b>（T = 100）：edge k 後 n1 在 +8、n3 在 +20 升起（block B 的 clock edge）、n6 在 +28、n8 在 +40、n5 在 +50、n4 在 +60 穩定。T = 100 時 60 {'<'} 100，看起來 1 cycle 就夠；T = 38 時 60 {'>'} 38，n4 在 edge k+1 之後才穩定——這時 multicycle 才「真的」被用到。模擬器切到實際 delay 就能看到 n4 在 edge k+1 之後才變。
            </li>
            <li>
              <b>n3 當 clock 的 glitch</b>：n3 = NOR(n1, n2)。block A 走 /3 時 01 → 10 那個 edge，n1↓ 與 n2↑ 幾乎同時，NOR 可能輸出幾 ps 的 1——在題目 5 這只是 out 上的 runt，在這裡它是 <b>block B 的 clock</b>：一個 runt 就可能讓 U6、U7 多觸發一次（或進 metastable），整個除數就錯了。所以實際的 MMD cell 不會把 decode 直接當下一級的 clock，而是從 flop 的 Q（或 Q 重新取樣過的訊號）出去，代價是 latency 多 tCQ 或半個 T。
            </li>
            <li>
              <b>mod chain 的可用時間會隨級數縮短</b>：三級 MMD 時最後一級的請求要經過兩級的 AND 才回到第一級，但第一級仍只給它固定的 cycle 數；所以多級 MMD 通常在每一級都把 mod_in 重新取樣（多一個 flop），讓 chain 變成多段短的 register-to-register path——用 latency 換 Fmax。
            </li>
            <li>
              <b>block B 的 clock 週期會變</b>：n3 週期是 2 T 或 3 T，STA 用最短的 2 T 檢查 block B 的 loop；jitter 也要以 n3 上的累積 jitter（含 block A 的 tCQ 與 NOR 的雜訊）來算。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>四個 flop 都當成 clk 觸發</b>：U6、U7 的 clock 是 n3。看每個 clk pin 到底接到哪裡，這是工作紙第 1 題的全部意義。
            </li>
            <li>
              <b>把 mod chain 當成 1-cycle path 或當成 ripple 的 clock path</b>：它是跨 clock domain 的 data path，launch 在 n3、capture 在 clk，且因為 n1 = 0 的遮蔽而有 2 cycle。
            </li>
            <li>
              <b>認為最慢的路徑一定在最快的 cell 裡</b>：cell 的 loop 只有 20 ps，穿越兩個 block 的請求鏈才是 60 ps。
            </li>
            <li>
              <b>duty 直接寫 50%</b>：只有 N = 4 是。out high 的長度是 (2 + c0) T。
            </li>
            <li>
              <b>忽略 n3 上的 hazard</b>：decode 當 clock 用時，glitch 不是「無害的小 pulse」，而是多出來的 clock edge。
            </li>
          </ul>
        </Callout>
      </Section>

      <Section title="解答後自我檢查" en="Self-check">
        <QuizEngine questions={quiz} title="題目 6 自我檢查" storageKey="lab-ex6-mmd2-check" />
      </Section>
    </>
  )
}

const exercise: LabExercise = {
  id: 'ex6-mmd2',
  order: 6,
  title: '兩個一樣的 cell 串起來：第二個的輸出是第一個的請求',
  difficulty: 4,
  summary: '兩級 /2 /3 MMD（N = 4～7）：練習找出 generated clock、拆解兩個 clock domain、推四種控制設定的 state sequence，以及跨 domain 的 modulus 回傳鏈為什麼是 2-cycle 的 critical path。',
  netlist: mmd2,
  schematic: ex6Schematic,
  simOptions: { period: T },
  reference: {
    q1: 'clk 只接 U1、U2（block A，rising edge）。U6、U7（block B）的 clock 是 n3 = U3（NOR）的輸出——由 block A 產生的 generated clock，週期 2 T 或 3 T，rising edge 比 clk 晚 tCQ + tNOR。兩個 clock domain',
    q2: '四個 rising-edge DFF：U1（n1 = a0）、U2（n2 = a1）在 clk domain；U6（n6 = b0）、U7（n7 = b1）在 n3 domain，四個共用 rst_n。U3、U8 是 NOR，U4、U5、U9 是 AND（combinational）。out 從 U8 的輸出 n8 取出',
    q3: 'state = n7 n6 n2 n1 = b1 b0 a1 a0（4 bit，MSB 先）；block A = a1a0、block B = b1b0',
    q4: '0000（此時 n3 = NOR(0,0) = 1、n8 = NOR(0,0) = 1，out = 1）',
    q5: 'da0 = n3 = NOR(a1, a0)；da1 = n4 = a0 AND n5，其中 n5 = c0 AND n8；db0 = n8 = NOR(b1, b0)；db1 = n9 = b0 AND c1；out = n8',
    q6: 'reachable（b1b0a1a0）：c1c0 = 00：0000、0001、0100、0101；01：再加 0010；10：0000、0001、0100、0101、1000、1001；11：0000、0001、0010、0100、0101、1000、1001。其餘 unreachable；a = 11 或 b = 11 都在 1～2 個 edge 內回到主循環，沒有 lock-up',
    q7: 'c1c0 = 00：0000 → 0001 → 0100 → 0101 → 0000（4 edge）；01：0000 → 0001 → 0010 → 0100 → 0101 → 0000（5）；10：0000 → 0001 → 0100 → 0101 → 1000 → 1001 → 0000（6）；11：0000 → 0001 → 0010 → 0100 → 0101 → 1000 → 1001 → 0000（7）。block A 每個 n3 週期走 /2，只有 b = 00 且 c0 = 1 那一輪走 /3',
    q8: 'out = n8 = NOR(b1, b0)：在 b 進入 00 的那個 clk edge（也是 n3 rising 的 edge）由 0 → 1；在 b 離開 00 的下一個 n3 rising（(2 + c0) 個 clk edge 之後）由 1 → 0。00：edge 4、8…；01：edge 5、10…；10：edge 6、12…；11：edge 7、14…',
    q9: '4~7（N = 4 + 2·c1 + c0）：c1c0 = 00 → 4、01 → 5、10 → 6、11 → 7。block B 走 (2 + c1) 個 n3 週期，其中恰好一個週期 block A 走 /3（若 c0 = 1）',
    q10: '(2 + c0) / N：00 → 2/4 = 50%；01 → 3/5 = 60%；10 → 2/6 ≈ 33%；11 → 3/7 ≈ 43%。out 只在 b = 00 為 1，長度是一個 n3 週期，而那一輪 block A 走的是 (2 + c0)',
    q11: 'c0 只在「block A 在 01 且 n8 = 1（block B 在 00）」的那個 clk edge 被 U4 取樣（每個 output 週期一次），該 edge 前 tsetup + U4 + U5 + wire = 31 ps 要穩定。c1 只在 block B 在 01 的那個 n3 rising edge 被 U9 取樣（每個 output 週期一次），n3 比 clk 晚 20 ps。實務上兩者都用 out 的 rising edge 重新取樣。rst_n：對 clk 檢查 recovery / removal（reset 期間 n3 = 1 沒有 edge）',
    q12: '全電路最緊的路徑 launch 在 U6.Q（n6），launch edge 是 n3 的 rising edge（= clk edge k + 20 ps）。block A 自己的 loop launch 在 U1.Q（n1）與 U2.Q（n2）的 clk edge k',
    q13: 'mod chain 的 capture 在 U2.D（n4），clk edge k+2——edge k+1 時 block A 剛進 01（n1 在 edge 前是 0）擋住 U4，所以是 2-cycle path。block A loop 的 capture 在 U1.D（n3），edge k+1',
    q14: 'mod chain：n3 latency（tCQ 8 + NOR 12 = 20）→ tCQ(U6) 8 → U8 NOR 12 → U5 AND 10 → U4 AND 10 = 60 ps，可用 2 T，Tclk,min = (60 + 7 + 2 + 2) / 2 = 35.5 ps。block A loop：8 + 12 = 20 ps → 31 ps。block B loop：20 ps，可用 ≥ 2 T。所以 Tclk,min = 35.5 ps（c0 = 1 時）；c0 = 0 時 mod chain 不被 sensitize，剩 31 ps',
    q15: 'unused state 都自復原（a = 11 → 10 或 00；b = 11 → 10 或 00），無 lock-up。最大的風險是 n3 = NOR(n1, n2) 被拿來當 block B 的 clock：block A 走 /3 時 01 → 10 那個 edge n1↓、n2↑ 同時變，NOR 可能出現幾 ps 的 runt ⇒ block B 被多觸發一次（generated clock 的 glitch，比 out 上的 glitch 嚴重得多）；實際設計要從 flop Q 取 clock 或加 retiming。out 也從 NOR 出去，同樣有 hazard。c0 / c1 在取樣 edge 前 31 / 21 ps 內改變 → 該週期除數不確定。STA 若沒有宣告 mod chain 的 2-cycle exception 會報假 violation，但宣告前要用模擬證明 edge k+1 真的被擋住',
  },
  hints: [
    '先數 clock：clk 只接 U1、U2；U6、U7 的 clk pin 接的是 n3——它是 U3（NOR）的輸出。所以 block B 的 clock 是 block A「產生」的。接著把 block B 蓋住，只看 block A：U3 NOR 回 U1.D、U4 AND 回 U2.D——這正是題目 5 的 /2 /3 cell，只是 ctrl 換成 n5 = U5(c0, n8)。再把 block A 蓋住：block B 也是同一個 cell，ctrl = c1，clock = n3。最後看 n8 從哪裡來、去哪裡：它是 block B 的 NOR 輸出，也是 out，還回頭餵 block A 的 U5。',
    'da0 = NOR(a1, a0) = n3；da1 = a0 AND c0 AND n8；db0 = NOR(b1, b0) = n8；db1 = b0 AND c1。c1c0 = 00、從 0000 開始：edge 1 後 a = 01（n3 由 1 落到 0，block B 不動）；edge 2 後 a = 00 ⇒ n3 升起 ⇒ block B 在這個 rising edge 取樣 db0 = n8 = 1 ⇒ b = 01 ⇒ 0100，此時 n8 = 0、out 落下。再推兩個 edge，看 b 什麼時候回到 00、out 什麼時候升起。然後把 c0 改成 1：reset 時 n5 = 1 AND n8 = 1，edge 1 後 da1 = a0 AND n5 = ？——block A 這一輪會多繞一個 state。',
    '下表是 c1c0 = 00（模擬器預設，N = 4）逐 edge 產生的結果，state = b1 b0 a1 a0。注意 b 只在 n3（f1 那一欄）由 0 變 1 的那些 edge 才改變。請自己把 c0、c1（模擬器按鈕上分別是 p0、p1）各切成 1 再跑：01 時你會在 edge 2 看到 a = 10；10 時 b 會多走一個 state。把四種的 out rising edge 間隔記下來，對照 N = 4 + 2·c1 + c0。',
  ],
  Solution,
  criticalPath: ex6Timing,
  Prompt,
}
export default exercise
