import { useMemo } from 'react'
import type { LabExercise } from '@/lab/types'
import type { Schematic } from '@/components/circuit/schematic'
import type { TimingScenario } from '@/models/timing/types'
import type { QuizQuestion } from '@/components/quiz/types'
import { Callout, CodeBlock, Math as M, ModeContent, Section, Steps, Term } from '@/components/content'
import { StateTable } from '@/components/sim/StateTable'
import { StateDiagram, graphToDiagram } from '@/components/circuit/StateDiagram'
import { QuizEngine } from '@/components/quiz/QuizEngine'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph } from '@/models/divider/analysis'
import { div3 } from '@/models/divider/examples'

const T = 100

/**
 * 題目 4 的電路圖：只有 NOR 與兩個 DFF，不標 state 序列。
 * U1.Q 直接接 U2.D；NOR 吃兩個 Q，輸出接回 U1.D。
 * netlist = examples.div3（n1 = q0、n2 = q1、n3 = d0）。
 */
export const ex4Schematic: Schematic = {
  width: 560,
  height: 250,
  elements: [
    { id: 'clk', kind: 'port', x: 40, y: 92, text: 'clk', dir: 'in', description: 'clock input（兩個 flop 共用）' },
    { id: 'rst', kind: 'port', x: 40, y: 235, text: 'rst_n', dir: 'in', description: 'active-low async reset（兩個 flop 共用）' },
    { id: 'u1', kind: 'dff', x: 110, y: 40, label: 'U1', edge: 'rising', description: 'rising-edge D flip-flop' },
    { id: 'u2', kind: 'dff', x: 330, y: 40, label: 'U2', edge: 'rising', description: 'rising-edge D flip-flop' },
    { id: 'u3', kind: 'nor', x: 200, y: 140, label: 'U3', inputs: 2, description: 'NOR gate' },
    { id: 'j1', kind: 'dot', x: 180, y: 60 },
    { id: 'j2', kind: 'dot', x: 410, y: 60 },
    { id: 'out', kind: 'port', x: 520, y: 60, text: 'out', dir: 'out', description: 'output' },
  ],
  wires: [
    { id: 'w_clk1', from: 'clk.p', to: 'u1.clk', signal: 'clk', label: 'clk', kind: 'clock' },
    { id: 'w_clk2', from: 'clk.p', to: 'u2.clk', signal: 'clk', label: 'clk', kind: 'clock', points: [[70, 92], [70, 215], [305, 215], [305, 92]], labelAt: 0.5 },
    { id: 'w_q0d1', from: 'u1.q', to: 'u2.d', signal: 'q0', label: 'n1', kind: 'data', labelAt: 0.6 },
    { id: 'w_nor0', from: 'u1.q', to: 'u3.in0', signal: 'q0', label: 'n1', kind: 'feedback', points: [[180, 60], [180, 153.33]], labelAt: 0.6 },
    { id: 'w_nor1', from: 'u2.q', to: 'u3.in1', signal: 'q1', label: 'n2', kind: 'feedback', points: [[410, 60], [410, 125], [190, 125], [190, 166.67]], labelAt: 0.5 },
    { id: 'w_d0', from: 'u3.out', to: 'u1.d', signal: 'd0', label: 'n3', kind: 'data', points: [[265, 160], [265, 195], [95, 195], [95, 60]], labelAt: 0.5 },
    { id: 'w_out', from: 'u2.q', to: 'out.p', signal: 'q1', label: 'n2', kind: 'output', labelAt: 0.75 },
    { id: 'w_rst1', from: 'rst.p', to: 'u1.rstn', kind: 'reset', points: [[142, 235]] },
    { id: 'w_rst2', from: 'rst.p', to: 'u2.rstn', kind: 'reset', points: [[362, 235]] },
  ],
}

export const ex4Timing: TimingScenario = {
  id: 'lab-ex4',
  name: '題目 4：/3 state machine，NOR 有兩個 launch point',
  description: '同步兩 flop。三條 data path：兩條經 NOR 回到 U1.D（慢），一條 U1.Q 直接到 U2.D（沒有 logic，setup 很鬆但 hold 要看）。',
  schematic: ex4Schematic,
  env: { period: 40, skew: 0, jitter: 2, margin: 2 },
  paths: [
    {
      id: 'q0-nor-d0',
      name: 'U1.Q → U3（NOR）→ U1.D',
      type: 'setup',
      launch: { element: 'u1', edge: 'rising', clock: 'clk' },
      capture: { element: 'u1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(U1)', from: 'U1.clk', to: 'U1.Q', kind: 'tcq', min: 5, max: 8, elements: ['u1'] },
        { id: 'nor', label: 'U3 NOR', from: 'U1.Q', to: 'U1.D', kind: 'logic', min: 8, max: 12, wires: ['w_nor0', 'w_d0'], elements: ['u3'] },
      ],
      description: 'n1 在 00→01、01→10 兩個 edge 都變，每個週期幾乎都被 sensitize。arrival 20 ps。',
      notes: ['Tclk,min = 8 + 12 + 7 + 2 + 2 = 31 ps；T = 40 ps 時 slack 9 ps。', 'hold：5 + 8 = 13 ps ≥ 3 ps。'],
      limits: 'Fmax',
    },
    {
      id: 'q1-nor-d0',
      name: 'U2.Q → U3（NOR）→ U1.D',
      type: 'setup',
      launch: { element: 'u2', edge: 'rising', clock: 'clk' },
      capture: { element: 'u1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(U2)', from: 'U2.clk', to: 'U2.Q', kind: 'tcq', min: 5, max: 8, elements: ['u2'] },
        { id: 'nor', label: 'U3 NOR', from: 'U2.Q', to: 'U1.D', kind: 'logic', min: 8, max: 12, wires: ['w_nor1', 'w_d0'], elements: ['u3'] },
      ],
      description: 'NOR 的另一個輸入。n2 在 01→10、10→00 變。延遲與上一條相同，並列 critical；這條 launch 與 capture 是不同 flop，skew 會影響。',
      limits: 'Fmax（與 U1 → NOR 並列）',
    },
    {
      id: 'q0-d1',
      name: 'U1.Q → U2.D（沒有 logic，只有走線）',
      type: 'setup',
      launch: { element: 'u1', edge: 'rising', clock: 'clk' },
      capture: { element: 'u2', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(U1)', from: 'U1.clk', to: 'U1.Q', kind: 'tcq', min: 5, max: 8, elements: ['u1'] },
        { id: 'wire', label: 'wire', from: 'U1.Q', to: 'U2.D', kind: 'wire', min: 1, max: 2, wires: ['w_q0d1'] },
      ],
      description: 'setup 非常鬆（arrival 10 ps），但這是典型的 shift-register path：min delay 只有 tCQ,min + wire,min = 6 ps，hold margin 只剩 3 ps。若 clk 到 U2 比到 U1 晚超過 3 ps（skew > 3），就 hold violation。',
      notes: ['這條路徑提醒你：critical path 不是只有 setup；沒有 logic 的路徑常是 hold 的最壞情況。'],
      limits: 'hold（不限制 Fmax）',
    },
    {
      id: 'rst-recovery',
      name: 'rst_n → U1 / U2（reset recovery / removal）',
      type: 'recovery',
      launch: { element: 'rst', edge: 'rising', clock: 'clk（第 k 個 rising edge：rst_n 的 de-assert 由 reset synchronizer 在這個 edge 釋放）' },
      capture: { element: 'u1', edge: 'rising', clock: 'clk（第 k+1 個 rising edge）', setup: 10, hold: 5 },
      segments: [
        { id: 'sync', label: 'reset synchronizer tCQ', from: 'clk edge k', to: 'rst_n ↑', kind: 'tcq', min: 5, max: 8 },
        { id: 'rst', label: 'rst_n 走線', from: 'rst_n', to: 'U1.rstn / U2.rstn', kind: 'wire', min: 2, max: 4, wires: ['w_rst1', 'w_rst2'] },
      ],
      description: 'async reset 的釋放時間相對 clk edge 的要求。釋放已用 clk 同步，兩段 delay 量的是「釋放到達 rstn pin 的時刻相對 clk edge k」：min 7 ps ≥ removal 5 ps（slack +2）、max 12 ps ≤ 40 − 10 − 2 − 2 = 26 ps（recovery slack +14）。因為 11 會自復原，reset 在這裡主要決定起始相位。',
      limits: 'reset release 的安全時間窗，不是 Fmax',
    },
  ],
}

function Prompt() {
  return (
    <>
      <p>
        兩個 flop 共用 clk，只有一個 gate U3（看清楚它的符號：輸出端有 bubble）。U1 的 Q 直接接到 U2 的 D，中間沒有任何 logic。輸出 out 取自 U2。
      </p>
      <p>
        這一題請特別注意工作紙第 6 題（reachable state）與第 10 題（duty cycle）：2 個 bit 有 4 個可能的 state，從 reset 出發<b>是不是每一個都會出現</b>？output high 與 low 的時間<b>是不是一樣長</b>？不要用「看起來像什麼」猜，用逐 edge 推的結果回答。
      </p>
    </>
  )
}

const quiz: QuizQuestion[] = [
  {
    id: 'q1',
    type: 'state',
    prompt: '從 reset（n2 n1 = 00）開始，經過 5 個 clk rising edge 之後，state（q1q0）是多少？',
    answer: '10',
    width: 2,
    bitNames: ['n2(q1)', 'n1(q0)'],
    explanation: '00 → 01 → 10 → 00 → 01 → 10。三個 edge 一圈，第 5 個 edge 後是 10。',
  },
  {
    id: 'q2',
    type: 'single',
    prompt: 'output（n2 = q1）的 duty cycle 是多少？',
    options: ['50%', '1/3（≈ 33%）', '2/3（≈ 67%）', '取決於 clk 的 duty'],
    answer: 1,
    explanation: 'q1 只在 state 10 為 1：high 1 T、low 2 T，duty = 1/3。/3 不會自動有 50% duty。',
  },
  {
    id: 'q3',
    type: 'single',
    prompt: '若電路因雜訊進入 state 11，下一個 rising edge 後會在哪裡？',
    options: ['停在 11（lock-up）', '10（一個 edge 回到主循環）', '00', '01'],
    answer: 1,
    explanation: '11：d1 = q0 = 1，d0 = NOR(1,1) = 0 ⇒ 10，已在主循環上。11 是 unreachable 但 self-recovering。',
  },
  {
    id: 'q4',
    type: 'numeric',
    prompt: 'tCQ,max = 8、NOR = 12、tsetup = 7、jitter = 2、margin = 2、skew = 0。Tclk,min 是多少 ps？',
    answer: 31,
    unit: 'ps',
    explanation: '8 + 12 + 7 + 2 + 2 = 31 ps。經過 NOR 的兩條路徑都是這個數字。',
  },
  {
    id: 'q5',
    type: 'multiple',
    prompt: '下列哪些敘述正確？',
    options: ['U1.Q → U2.D 這條路徑 setup 很鬆，但它是 hold 的最壞情況', '/3 divider 的 output duty 一定是 50%', 'NOR 的兩個輸入來自不同 flop，所以有兩個 launch point', '11 是 lock-up state'],
    answers: [0, 2],
    explanation: '沒有 logic 的路徑 min delay 最小，hold margin 最小。NOR 由 U1.Q 與 U2.Q 餵，兩條路徑都要算。/3 的 q1 是 1/3 duty；11 一個 edge 就回到 10，不是 lock-up。',
  },
]

function Solution() {
  const records = useMemo(() => simulate(div3, 8, { period: T }).records, [])
  const graph = useMemo(() => buildStateGraph(div3, {}), [])
  return (
    <>
      <Section title="第一步：兩個 D 各自是誰的函數" en="Write every D">
        <p>
          兩個 flop 共用 clk，同步電路。memory element：U1、U2 ⇒ state = q1q0，q1 = Q(U2) = n2（MSB）、q0 = Q(U1) = n1（LSB）。
        </p>
        <ul>
          <li>
            <b>U2.D = n1 = q0</b>：中間沒有 logic。意思是「下一個 q1 就是現在的 q0」——U2 只是把 U1 延遲一個 cycle（shift register）。
          </li>
          <li>
            <b>U1.D = n3 = U3(n1, n2)</b>，U3 是 NOR ⇒ <b>d0 = NOT(q0 OR q1)</b>：只有兩個輸入都是 0 時 d0 才是 1。
          </li>
        </ul>
        <Callout kind="idea" title="NOR 的讀法">
          NOR 是「兩個都沒有」偵測器：只有 state = 00 時它輸出 1。所以 q0 只會在「上一個 state 是 00」之後變成 1。這句話已經暗示：state 序列裡 00 之後一定是 01，而且 q0 = 1 的 state 只會出現一次。
        </Callout>
      </Section>

      <Section title="第二步：從 00 逐 edge 代入" en="Edge by edge">
        <Steps
          items={[
            <>
              <b>Reset</b>：q1q0 = 00。edge 前算好：d0 = NOR(0,0) = 1，d1 = q0 = 0。
            </>,
            <>
              <b>Edge 1</b>：q0 ← 1、q1 ← 0 ⇒ <span className="mono">01</span>。out = q1 = 0。新的 d0 = NOR(1,0) = 0，d1 = q0 = 1。
            </>,
            <>
              <b>Edge 2</b>：q0 ← 0、q1 ← 1 ⇒ <span className="mono">10</span>。out 由 0→1。新的 d0 = NOR(0,1) = 0，d1 = q0 = 0。
            </>,
            <>
              <b>Edge 3</b>：q0 ← 0、q1 ← 0 ⇒ <span className="mono">00</span>。out 由 1→0。回到 reset state：<b>三個 edge 一圈</b>——不是四個。
            </>,
            <>
              <b>State 11 呢？</b>從 reset 出發永遠走不到。但如果雜訊把它推進 11：d1 = q0 = 1，d0 = NOR(1,1) = 0 ⇒ 下一個 edge 後 = 10，已經回到主循環。
            </>,
          ]}
        />
        <p className="small muted">模擬器產生的表——4 個可能的 state 只出現 3 個：</p>
        <StateTable netlist={div3} records={records} period={T} />
      </Section>

      <Section title="第三步：state table、unused state 與 self-recovery" en="State table">
        <div className="two-col">
          <div>
            <table className="state-table">
              <thead>
                <tr>
                  <th>q1q0</th>
                  <th>d0 = NOR</th>
                  <th>d1 = q0</th>
                  <th>next</th>
                  <th>out</th>
                  <th>備註</th>
                </tr>
              </thead>
              <tbody>
                {graph.nodes.map((n) => (
                  <tr key={n.state}>
                    <td>{n.state}</td>
                    <td>{n.next[1]}</td>
                    <td>{n.next[0]}</td>
                    <td>{n.next}</td>
                    <td>{n.output}</td>
                    <td style={{ fontFamily: 'var(--font)' }}>{n.reachable ? '主循環' : n.lockup ? 'lock-up' : `unreachable，${n.stepsToCycle} 個 edge 回到主循環`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted">
              主循環 00 → 01 → 10；11 是 <Term zh="未使用狀態" en="unused state" />，但它會在 1 個 edge 內回到 10，所以這個 /3 是 <Term zh="自復原" en="self-recovering" /> 的，不需要靠 reset 脫困。
            </p>
          </div>
          <StateDiagram {...graphToDiagram(graph, 'clk↑')} width={300} height={240} />
        </div>
      </Section>

      <Section title="第四步：divide ratio 與 duty——不是 50%" en="Divide ratio">
        <p>out = q1 在 edge 2 由 0→1、edge 3 由 1→0、edge 5 再由 0→1：</p>
        <M block>{'T_{out} = 3\\,T_{in} \\quad\\Rightarrow\\quad N = 3,\\qquad D = \\frac{t_{high}}{T_{out}} = \\frac{1\\,T_{in}}{3\\,T_{in}} = \\frac{1}{3}'}</M>
        <p>
          <M>{'T_{in}'}</M> 為輸入週期（ps）。output 只在 state 10 為 1：high 1 個 <M>{'T_{in}'}</M>、low 2 個。奇數除數的 state machine 直接取某個 state bit 當 output，duty 一定不是 50%（3 個 state 沒辦法對半分）。
        </p>
        <Callout kind="note" title="要 50% 怎麼辦">
          常見做法：再加一個 falling-edge flop 把 q1 延遲半個 cycle，然後 q1 OR q1_f ⇒ high 1.5 T、週期 3 T ⇒ 50%。代價是多一個 flop、一個 OR，且 output 的 rising edge 仍由 rising-edge flop 決定、falling edge 由 falling-edge flop 決定——clk 的 duty 誤差會直接進到 output。
        </Callout>
      </Section>

      <Section title="第五步：三條 data path，兩種 check" en="Critical path">
        <Callout kind="method" title="候選路徑">
          <ol style={{ margin: 0 }}>
            <li>
              <b>U1.Q → U3 → U1.D</b>：tCQ 8 + NOR 12 = <b>20 ps</b>（setup critical）。
            </li>
            <li>
              <b>U2.Q → U3 → U1.D</b>：tCQ 8 + NOR 12 = <b>20 ps</b>（並列；launch 與 capture 是不同 flop）。
            </li>
            <li>
              <b>U1.Q → U2.D</b>：tCQ 8 + wire 2 = 10 ps。setup 非常鬆，但 <b>min delay 只有 5 + 1 = 6 ps</b>，hold margin 3 ps——這是 hold 的最壞路徑。
            </li>
          </ol>
          <p style={{ margin: '0.4em 0 0' }}>
            Tclk,min = 20 + tsetup 7 + jitter 2 + margin 2 = <b>31 ps</b>；T = 40 ps 時 slack 9 ps。sensitization：n1 在 3 個 edge 中有 2 個會變、n2 也有 2 個會變，NOR 的兩條路徑都真的會被用到。
          </p>
        </Callout>
        <p>
          工作紙第 12 題常見的錯是只寫「U1.Q」。NOR 有兩個輸入，來自兩個不同的 flop——兩個都是 launch point。
        </p>
        <ModeContent level="engineer" title="Timing equation、hold 與 RTL">
          <M block>{'T_{clk,min} \\ge t_{CQ} + t_{NOR} + t_{setup} - t_{skew} + t_{jitter} + t_{margin} = 8 + 12 + 7 - 0 + 2 + 2 = 31\\ \\text{ps}'}</M>
          <M block>{'\\text{hold（U1.Q → U2.D）}:\\; t_{CQ,min} + t_{wire,min} = 5 + 1 = 6 \\ge t_{hold} + t_{skew} = 3 + t_{skew}'}</M>
          <p>
            <M>{'t_{skew}'}</M> = clk 到達 U2.clk − 到達 U1.clk（ps）。U1 → U2 這條沒有 logic 的路徑要求 skew ≤ 3 ps；若 clock tree 做不到，就要在 n1 → U2.D 之間補 buffer（加 min delay），而不是去動 NOR 那條。
          </p>
          <CodeBlock
            title="等效 RTL"
            code={`
module lab_ex4 (
  input  logic clk,
  input  logic rst_n,
  output logic out
);
  logic q0, q1;
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) {q1, q0} <= 2'b00;
    else begin
      q0 <= ~(q1 | q0);   // n3 = NOR(n2, n1)
      q1 <= q0;           // n1 直接接 U2.D
    end
  assign out = q1;        // duty 1/3
endmodule
`}
            note="state 序列 00 → 01 → 10；11 → 10（自復原）。"
          />
        </ModeContent>
        <ModeContent level="deep" title="實際 delay、NOR hazard 與高速考量">
          <ul>
            <li>
              <b>實際 delay</b>（T = 100、tCQ 8、NOR 12）：n1 在 108 升、208 降；n2 在 208 升、308 降；n3 在 120 落（108 + 12）、320 升。n3 距離下一個 edge 還有 80 ps——T 要壓到 31 ps 才會用完。
            </li>
            <li>
              <b>NOR 的 static-0 hazard</b>：01 → 10 那個 edge，n1 由 1→0、n2 由 0→1 幾乎同時變；NOR 理論上 0 → 0 不變，但若 n1 先落、n2 後升，中間兩輸入都是 0，n3 會短暫跳到 1。它在 edge 後 ~10 ps 發生、edge 前早已穩定，對 U1 無害；但若把 n3 拿去做 async control 或 clock，就是 runt pulse。
            </li>
            <li>
              <b>Self-recovery 的代價</b>：這個最簡 /3 剛好天生自復原（11 → 10）。有些 /3 實作（例如 d0 = XNOR）會讓 11 → 11 lock-up，那就必須靠 reset 或額外 logic。設計 state machine 時要把所有 unused state 的 next state 都算一遍。
            </li>
            <li>
              <b>高速 /3 的做法</b>：CML 版本常把 NOR 併進 flop 的 master latch 輸入（合併 logic 與 sampling），把 tCQ + tNOR 壓成一個 stage；duty 50% 版本再加半週期 flop。奇數除數的 output edge 交替來自不同的 flop，jitter 與 duty 誤差要分開估。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>看到兩個 flop 就猜 /4</b>：state bit 數只決定「最多」幾個 state；真正用了幾個要逐 edge 推。
            </li>
            <li>
              <b>假設 /3 有 50% duty</b>：直接取 q1 是 1/3。要 50% 需要額外電路。
            </li>
            <li>
              <b>把 11 當成 lock-up</b>：unused ≠ lock-up。要看它的 next state 會不會回到主循環。
            </li>
            <li>
              <b>忽略沒有 logic 的路徑</b>：U1.Q → U2.D 對 setup 無害，對 hold 卻是最壞的一條。
            </li>
            <li>
              <b>output rising edge 數錯</b>：第一個 rising edge 在 edge 2（不是 edge 1），之後每 3 個 edge 一次。
            </li>
          </ul>
        </Callout>
      </Section>

      <Section title="解答後自我檢查" en="Self-check">
        <QuizEngine questions={quiz} title="題目 4 自我檢查" storageKey="lab-ex4-div3-check" />
      </Section>
    </>
  )
}

const exercise: LabExercise = {
  id: 'ex4-div3',
  order: 4,
  title: '兩個 flop、一個 NOR：不是每個 state 都會出現',
  difficulty: 3,
  summary: '/3 state machine：練習 reachable / unused state、非 50% duty，以及「沒有 logic 的路徑反而是 hold 最壞路徑」。',
  netlist: div3,
  schematic: ex4Schematic,
  simOptions: { period: T },
  reference: {
    q1: 'clk：同時接 U1、U2 的 clk pin（rising edge）；同步電路',
    q2: 'U1、U2 兩個 DFF（共用 async reset）；U3 是 NOR（combinational）。U1.Q 到 U2.D 之間只有一條線，沒有 logic',
    q3: 'q1 = Q(U2) = n2（MSB）、q0 = Q(U1) = n1（LSB）；state = q1q0',
    q4: '00',
    q5: 'd0 = NOT(q1 OR q0) = NOR(q1, q0)（U3）；d1 = q0（直接接線）',
    q6: 'reachable：00、01、10。11 從 reset 出發永遠不會出現（unused state）；但 11 不會 lock-up：11 → 10 一個 edge 就回到主循環（self-recovering）',
    q7: '00 → 01 → 10 → 00（每 3 個 edge 一圈）；另外 11 → 10',
    q8: 'output = q1（n2）：edge 2 由 0→1（state 01→10），edge 3 由 1→0（10→00），edge 5 再由 0→1 …',
    q9: '3（output rising edge 在 edge 2、5、8…，間隔 3 個 clk 週期）',
    q10: '1/3 ≈ 33%：q1 只在 state 10 為 1，high 1 T、low 2 T（不是 50%）',
    q11: '沒有 MOD / select；rst_n 為 async reset（recovery / removal）。因為 11 會自復原，reset 主要用來決定起始相位',
    q12: 'U1.Q（n1）與 U2.Q（n2）都在第 k 個 rising edge launch 進 NOR；兩條路徑延遲相同（並列 critical）。U1.Q 也 launch 到 U2.D（無 logic 路徑）',
    q13: 'U1.D（n3），在第 k+1 個 rising edge capture；可用時間 1 T。U2.D 那條（q0 直接接 d1）只有 tCQ + wire，setup 很鬆，但它是 hold 的最壞路徑',
    q14: 'tCQ(8) → U3 NOR(12) → tsetup(7)：arrival 20 ps，Tclk,min = 20 + 7 + 2 + 2 = 31 ps；q0 → d1 那條只有 tCQ(8) + wire(2) = 10 ps，setup 很鬆，但 hold 要看 tCQ,min + wire,min = 6 ps ≥ thold 3 + skew',
    q15: 'illegal state 11：unreachable，但 1 個 edge 內回到 10（self-recovering，不 lock-up）。glitch：01→10 時 n1 1→0、n2 0→1 同時變，NOR 輸出可能有短暫 1 的 glitch（static-0 hazard），edge 前已穩定所以無害。output duty 不是 50%，下游若需要 50% 要再加 falling-edge flop 與 OR。U1.Q → U2.D 無 logic，clock skew > 3 ps 就 hold violation',
  },
  hints: [
    '兩個 flop 共用 clk（同步）。先看 D 是誰決定：U2 的 D 直接接 U1 的 Q（n1）——這表示 n2 只是「上一個 edge 的 n1」。U1 的 D（n3）來自 U3，它同時吃 n1 與 n2。看清楚 U3 的符號：輸出端有 bubble，是 NOR——只有在兩個輸入都是 0 時輸出 1。所以只要算出 NOR 在每個 state 的輸出，state 序列就出來了。',
    'd1 = q0；d0 = NOR(q1, q0)。從 00 開始：NOR(0,0) = 1 ⇒ edge 1 後 q0 = 1、q1 = 舊 q0 = 0 ⇒ 01。再算一次：NOR(0,1) = 0、d1 = q0 = 1 ⇒ edge 2 後 = 10。再算一次 state 10：NOR(1,0) = ？d1 = q0 = ？——你會發現回到某個看過的 state。另外也把 11 代進去試試，看它會去哪裡。',
    '下表由模擬器逐 edge 產生。注意 4 個可能的 state 中只有 3 個出現。output（q1 = n2）high 幾個 T、low 幾個 T？相鄰兩次 0→1 相隔幾個 edge？（不是 4）',
  ],
  Solution,
  criticalPath: ex4Timing,
  Prompt,
}
export default exercise
