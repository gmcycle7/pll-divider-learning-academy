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
import { sync4 } from '@/models/divider/examples'

const T = 100

/**
 * 題目 3 的電路圖：兩個 DFF 共用 clk，U3 = inverter、U4 = XOR。
 * 只標 U1～U4 與 n1～n4。netlist = examples.sync4（n1 = q0、n2 = d0、n3 = q1、n4 = d1）。
 */
export const ex3Schematic: Schematic = {
  width: 620,
  height: 255,
  elements: [
    { id: 'clk', kind: 'port', x: 40, y: 92, text: 'clk', dir: 'in', description: 'clock input（兩個 flop 共用）' },
    { id: 'rst', kind: 'port', x: 40, y: 240, text: 'rst_n', dir: 'in', description: 'active-low async reset（兩個 flop 共用）' },
    { id: 'u1', kind: 'dff', x: 110, y: 40, label: 'U1', edge: 'rising', description: 'rising-edge D flip-flop' },
    { id: 'u2', kind: 'dff', x: 330, y: 40, label: 'U2', edge: 'rising', description: 'rising-edge D flip-flop' },
    { id: 'u3', kind: 'inv', x: 200, y: 130, label: 'U3', description: 'inverter' },
    { id: 'u4', kind: 'xor', x: 440, y: 130, label: 'U4', inputs: 2, description: 'XOR gate' },
    { id: 'j1', kind: 'dot', x: 190, y: 60 },
    { id: 'j2', kind: 'dot', x: 280, y: 60 },
    { id: 'j3', kind: 'dot', x: 410, y: 60 },
    { id: 'out', kind: 'port', x: 580, y: 60, text: 'out', dir: 'out', description: 'output' },
  ],
  wires: [
    { id: 'w_clk1', from: 'clk.p', to: 'u1.clk', signal: 'clk', label: 'clk', kind: 'clock' },
    { id: 'w_clk2', from: 'clk.p', to: 'u2.clk', signal: 'clk', label: 'clk', kind: 'clock', points: [[70, 92], [70, 215], [305, 215], [305, 92]], labelAt: 0.5 },
    { id: 'w_fb1', from: 'u1.q', to: 'u3.in0', signal: 'q0', label: 'n1', kind: 'feedback', points: [[190, 60], [190, 142]], labelAt: 0.6 },
    { id: 'w_d1', from: 'u3.out', to: 'u1.d', signal: 'd0', label: 'n2', kind: 'data', points: [[250, 142], [250, 178], [95, 178], [95, 60]], labelAt: 0.5 },
    { id: 'w_x0', from: 'u1.q', to: 'u4.in0', signal: 'q0', label: 'n1', kind: 'feedback', points: [[280, 60], [280, 143.33]], labelAt: 0.7 },
    { id: 'w_x1', from: 'u2.q', to: 'u4.in1', signal: 'q1', label: 'n3', kind: 'feedback', points: [[410, 60], [410, 156.67]], labelAt: 0.6 },
    { id: 'w_d2', from: 'u4.out', to: 'u2.d', signal: 'd1', label: 'n4', kind: 'data', points: [[506, 150], [506, 195], [318, 195], [318, 60]], labelAt: 0.5 },
    { id: 'w_out', from: 'u2.q', to: 'out.p', signal: 'q1', label: 'n3', kind: 'output', labelAt: 0.75 },
    { id: 'w_rst1', from: 'rst.p', to: 'u1.rstn', kind: 'reset', points: [[142, 240]] },
    { id: 'w_rst2', from: 'rst.p', to: 'u2.rstn', kind: 'reset', points: [[362, 240]] },
  ],
}

export const ex3Timing: TimingScenario = {
  id: 'lab-ex3',
  name: '題目 3：同步 /4，三條候選路徑',
  description: '兩個 flop 共用 clk，所以任何「flop.Q → logic → flop.D」都是 launch 在 edge k、capture 在 edge k+1 的 register-to-register path。要比的是哪一條最慢。',
  schematic: ex3Schematic,
  env: { period: 40, skew: 0, jitter: 2, margin: 2 },
  paths: [
    {
      id: 'q0-xor-d1',
      name: 'U1.Q → U4（XOR）→ U2.D',
      type: 'setup',
      launch: { element: 'u1', edge: 'rising', clock: 'clk' },
      capture: { element: 'u2', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(U1)', from: 'U1.clk', to: 'U1.Q', kind: 'tcq', min: 5, max: 8, elements: ['u1'] },
        { id: 'xor', label: 'U4 XOR', from: 'U1.Q', to: 'U2.D', kind: 'logic', min: 8, max: 12, wires: ['w_x0', 'w_d2'], elements: ['u4'] },
      ],
      description: 'n1 每個 edge 都變，所以這條路徑每個 cycle 都被 sensitize。XOR 比 inverter 慢一倍，這條是 critical path。',
      notes: ['arrival = 8 + 12 = 20 ps；Tclk,min = 20 + 7 + 2 + 2 = 31 ps；T = 40 ps 時 slack = 9 ps。', 'hold：5 + 8 = 13 ps ≥ 3 ps。'],
      limits: 'Fmax',
    },
    {
      id: 'q1-xor-d1',
      name: 'U2.Q → U4（XOR）→ U2.D',
      type: 'setup',
      launch: { element: 'u2', edge: 'rising', clock: 'clk' },
      capture: { element: 'u2', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(U2)', from: 'U2.clk', to: 'U2.Q', kind: 'tcq', min: 5, max: 8, elements: ['u2'] },
        { id: 'xor', label: 'U4 XOR', from: 'U2.Q', to: 'U2.D', kind: 'logic', min: 8, max: 12, wires: ['w_x1', 'w_d2'], elements: ['u4'] },
      ],
      description: 'XOR 的另一個輸入來自 U2 自己。延遲與上一條相同，所以兩條並列為最慢；哪一條先變由 state 決定（n3 只在偶數 edge 變）。',
      notes: ['同樣 20 ps。兩條路徑 delay 相同時，STA 會都報出來；設計上要一起看。'],
      limits: 'Fmax（與 U1 → XOR 並列）',
    },
    {
      id: 'q0-inv-d0',
      name: 'U1.Q → U3（INV）→ U1.D',
      type: 'setup',
      launch: { element: 'u1', edge: 'rising', clock: 'clk' },
      capture: { element: 'u1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(U1)', from: 'U1.clk', to: 'U1.Q', kind: 'tcq', min: 5, max: 8, elements: ['u1'] },
        { id: 'inv', label: 'U3 INV', from: 'U1.Q', to: 'U1.D', kind: 'logic', min: 4, max: 6, wires: ['w_fb1', 'w_d1'], elements: ['u3'] },
      ],
      description: '第一個 bit 自己的 toggle loop，arrival 只有 14 ps，比 XOR 路徑快 6 ps——不是 critical。',
      limits: '不限制 Fmax',
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
      description: 'async reset 的釋放時間相對 clk edge 的要求，不是 data path。釋放已用 clk 同步，所以兩段 delay 量的是「釋放到達 rstn pin 的時刻相對 clk edge k」：min 7 ps ≥ removal 5 ps（slack +2）、max 12 ps ≤ 40 − 10 − 2 − 2 = 26 ps（recovery slack +14）。',
      notes: ['兩個 flop 的 rst_n 走線若差太多，可能一個已釋放、一個還在 reset，第一個 edge 就抓到非預期的 state。'],
      limits: 'reset release 的安全時間窗，不是 Fmax',
    },
  ],
}

function Prompt() {
  return (
    <>
      <p>
        這次兩個 flop 的 clk pin 都接到同一條 clk。U3 是 inverter，U4 是一個兩輸入的 gate（看清楚它的符號）。輸出 out 取自 U2。
      </p>
      <p>
        同步電路可以「一個 edge、兩個 bit 一起更新」：先寫出 U1.D 與 U2.D 各自是誰的函數，再從 reset 逐 edge 代入。critical path 這次有<b>不只一條候選</b>——分別從哪個 flop launch、經過哪個 gate、被哪個 flop capture？
      </p>
    </>
  )
}

const quiz: QuizQuestion[] = [
  {
    id: 'q1',
    type: 'state',
    prompt: '從 reset（n3 n1 = 00）開始，經過 6 個 clk rising edge 之後，state（q1q0）是多少？',
    answer: '10',
    width: 2,
    bitNames: ['n3(q1)', 'n1(q0)'],
    explanation: '00 → 01 → 10 → 11 → 00 → 01 → 10。第 6 個 edge 後是 10。',
  },
  {
    id: 'q2',
    type: 'single',
    prompt: '這個電路的 setup critical path 是哪一條？',
    options: ['clk 走線到 U2 的 clk pin', 'U1.Q → U3 → U1.D', 'U1.Q → U4 → U2.D（與 U2.Q → U4 → U2.D 並列）', 'U2.Q → out'],
    answer: 2,
    explanation: '經過 XOR 的兩條路徑 arrival = 8 + 12 = 20 ps，比 inverter loop 的 14 ps 慢。clock 走線與 output 走線沒有 capture flop 的 setup 要求。',
  },
  {
    id: 'q3',
    type: 'numeric',
    prompt: 'tCQ,max = 8、XOR = 12、tsetup = 7、jitter = 2、margin = 2、skew = 0。Tclk,min 是多少 ps？',
    answer: 31,
    unit: 'ps',
    explanation: '8 + 12 + 7 + 2 + 2 = 31 ps。T = 40 ps 時 slack = 9 ps。',
  },
  {
    id: 'q4',
    type: 'multiple',
    prompt: '下列哪些敘述正確？',
    options: ['n4 = n1 XOR n3 的意思是：n1 = 1 時 n3 翻轉，n1 = 0 時 n3 保持', '4 個 state 全部在主循環，沒有 unused state', 'U1 的 inverter loop 是這個電路的 critical path', '把 U4 換成 AND gate，仍然是 /4'],
    answers: [0, 1],
    explanation: 'XOR 就是「有條件的 toggle」。2-bit binary counter 四個 state 全用到。inverter loop 只有 14 ps，不是 critical。換成 AND：d1 = q0 AND q1，從 00 出發 q1 永遠是 0，輸出恆為 0。',
  },
  {
    id: 'q5',
    type: 'single',
    prompt: '若把 U4 換成 XNOR（n4 = NOT(n1 XOR n3)），從 00 出發會怎樣？',
    options: ['變成 /2', '仍是 /4，但序列變成 00 → 11 → 10 → 01（down count）', '停在 11 不動', '變成 /3'],
    answer: 1,
    explanation: '00：d1 = XNOR(0,0) = 1、d0 = 1 ⇒ 11；11：d1 = 1、d0 = 0 ⇒ 10；10：d1 = XNOR(0,1) = 0、d0 = 1 ⇒ 01；01：d1 = 0、d0 = 0 ⇒ 00。四個 edge 一圈，仍是 /4。',
  },
]

function Solution() {
  const records = useMemo(() => simulate(sync4, 9, { period: T }).records, [])
  const graph = useMemo(() => buildStateGraph(sync4, {}), [])
  return (
    <>
      <Section title="第一步：同步電路——先把每個 D 的來源寫清楚" en="Synchronous: write every D">
        <p>
          兩個 flop 的 clk pin 都接 clk（rising edge）：這是 <Term zh="同步電路" en="synchronous circuit" />，所有 state bit 在同一個 edge 一起更新。所以分析方法是：
        </p>
        <ol>
          <li>memory element：U1、U2 ⇒ 2 個 state bit，q1 = Q(U2) = n3（MSB）、q0 = Q(U1) = n1（LSB）。</li>
          <li>
            U1.D = n2 = U3(n1) ⇒ <b>d0 = NOT q0</b>。
          </li>
          <li>
            U2.D = n4 = U4(n1, n3)，U4 是 XOR ⇒ <b>d1 = q0 XOR q1</b>。
          </li>
        </ol>
        <Callout kind="idea" title="XOR 的讀法">
          d1 = q1 XOR q0：q0 = 0 時 d1 = q1（保持）；q0 = 1 時 d1 = NOT q1（翻轉）。所以 q1 是「每逢 q0 = 1 就翻一次」——q0 每兩個 edge 有一次是 1，q1 就每兩個 edge 翻一次，週期 4。
        </Callout>
      </Section>

      <Section title="第二步：從 00 逐 edge 代入" en="Edge by edge">
        <Steps
          items={[
            <>
              <b>Reset</b>：q1q0 = 00。edge 前算好：d0 = NOT 0 = 1，d1 = 0 XOR 0 = 0。
            </>,
            <>
              <b>Edge 1</b>：兩個 flop 同時抓 ⇒ q0 = 1、q1 = 0 ⇒ <span className="mono">01</span>。out = q1 = 0。新的 d0 = 0、d1 = 1 XOR 0 = 1。
            </>,
            <>
              <b>Edge 2</b>：⇒ q0 = 0、q1 = 1 ⇒ <span className="mono">10</span>。out 由 0→1。新的 d0 = 1、d1 = 0 XOR 1 = 1。
            </>,
            <>
              <b>Edge 3</b>：⇒ <span className="mono">11</span>。out = 1。新的 d0 = 0、d1 = 1 XOR 1 = 0。
            </>,
            <>
              <b>Edge 4</b>：⇒ <span className="mono">00</span>。out 由 1→0。回到 reset state：<b>四個 edge 一圈</b>。
            </>,
          ]}
        />
        <p className="small muted">模擬器產生的表——看 d1 那一欄：只有 q0 = 1 的列，d1 才與 q1 不同：</p>
        <StateTable netlist={sync4} records={records} period={T} />
      </Section>

      <Section title="第三步：state table 與 state diagram" en="State table">
        <div className="two-col">
          <div>
            <table className="state-table">
              <thead>
                <tr>
                  <th>q1q0</th>
                  <th>d0 = q̄0</th>
                  <th>d1 = q1⊕q0</th>
                  <th>next</th>
                  <th>out</th>
                </tr>
              </thead>
              <tbody>
                {graph.nodes.map((n) => (
                  <tr key={n.state}>
                    <td>{n.state}</td>
                    <td>{n.state[1] === '1' ? 0 : 1}</td>
                    <td>{n.next[0]}</td>
                    <td>{n.next}</td>
                    <td>{n.output}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="small muted">四個 state 全部 reachable、全部在主循環：這是 2-bit binary up counter（00, 01, 10, 11 = 0, 1, 2, 3）。沒有 unused state，所以不會有 lock-up 問題。</p>
          </div>
          <StateDiagram {...graphToDiagram(graph, 'clk↑')} width={300} height={240} />
        </div>
      </Section>

      <Section title="第四步：divide ratio 與 duty" en="Divide ratio">
        <p>out = q1 在 edge 2 由 0→1、edge 4 由 1→0、edge 6 再由 0→1。設輸入 clock 週期為 <M>{'T_{in}'}</M>（ps）、輸出週期為 <M>{'T_{out}'}</M>（ps）；<M>{'N = T_{out}/T_{in}'}</M> 為除頻比（無單位），<M>{'D = t_{high}/T_{out}'}</M> 為 duty cycle（output 維持 high 的時間佔輸出週期的比例，無單位）。</p>
        <M block>{'T_{out} = 4\\,T_{in} \\quad\\Rightarrow\\quad N = 4,\\qquad D = \\frac{2\\,T_{in}}{4\\,T_{in}} = 50\\%'}</M>
        <p>
          一般化：n-bit 同步 binary counter 的 MSB 是 <M>{'/2^n'}</M>，duty 50%；每一個較低的 bit 都是 <M>{'/2^{k+1}'}</M>。這裡 q0 是 /2、q1 是 /4。
        </p>
      </Section>

      <Section title="第五步：比較三條候選路徑" en="Critical path">
        <p>
          同步電路裡每一條「flop.Q → logic → flop.D」都是 launch 在 edge k、capture 在 edge k+1、可用時間 1T 的路徑。把它們列出來比：
        </p>
        <Callout kind="method" title="候選路徑">
          <ol style={{ margin: 0 }}>
            <li>
              <b>U1.Q → U3 → U1.D</b>：tCQ 8 + INV 6 = 14 ps。
            </li>
            <li>
              <b>U1.Q → U4 → U2.D</b>：tCQ 8 + XOR 12 = <b>20 ps</b>。n1 每個 edge 都變，每個 cycle 都被 sensitize。
            </li>
            <li>
              <b>U2.Q → U4 → U2.D</b>：tCQ 8 + XOR 12 = <b>20 ps</b>。n3 每兩個 edge 變一次，但只要「可能」變就要算。
            </li>
          </ol>
          <p style={{ margin: '0.4em 0 0' }}>
            最慢的是經過 XOR 的兩條（並列）。Tclk,min = 20 + tsetup 7 + jitter 2 + margin 2 = <b>31 ps</b>；T = 40 ps 時 slack = 9 ps。與題目 1 的 25 ps 相比，多出的 6 ps 全來自 XOR 比 inverter 慢。
          </p>
        </Callout>
        <p>
          注意：這裡 launch 與 capture 是<b>不同的 flop</b>（U1 → U2）。它們共用 clk，但 clock tree 到兩個 clk pin 的到達時間可能不同——這就是 skew 出現的地方（題目 1 的單一 flop loop 沒有這個問題）。
        </p>
        <ModeContent level="engineer" title="Timing equation 與 RTL">
          <M block>{'T_{clk,min} \\ge t_{CQ,U1} + t_{U4,XOR} + t_{setup} - t_{skew} + t_{jitter} + t_{margin} = 8 + 12 + 7 - 0 + 2 + 2 = 31\\ \\text{ps}'}</M>
          <p>
            <M>{'t_{skew}'}</M> = clk 到達 U2.clk（capture）− 到達 U1.clk（launch），單位 ps。capture 較晚到（skew &gt; 0）setup 變鬆、hold 變嚴：hold 要求 <M>{'t_{CQ,min} + t_{XOR,min} = 5 + 8 = 13 \\ge t_{hold} + t_{skew}'}</M>，所以 skew 最多 10 ps 才不會 hold violation。
          </p>
          <CodeBlock
            title="等效 RTL"
            code={`
module lab_ex3 (
  input  logic clk,
  input  logic rst_n,
  output logic out
);
  logic q0, q1;
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) {q1, q0} <= 2'b00;
    else begin
      q0 <= ~q0;          // n2 = NOT n1
      q1 <= q1 ^ q0;      // n4 = n3 XOR n1
    end
  assign out = q1;
endmodule
`}
            note="{q1,q0} <= {q1,q0} + 1 會合成出同樣的電路：q0 的 toggle 與 q1 的 XOR 就是 2-bit 加法器的 sum。"
          />
        </ModeContent>
        <ModeContent level="deep" title="實際 delay、hazard 與同步 vs. ripple">
          <ul>
            <li>
              <b>實際 delay</b>（T = 100、tCQ 8、XOR 12）：n1 在 108 變、n3 在 208 變（同一個 edge 後 8 ps，沒有 ripple 那種 16 ps 累積）；n4 在 120 才穩定（108 + 12）。距離下一個 edge 還有 80 ps。
            </li>
            <li>
              <b>XOR 的 static hazard</b>：01 → 10 那個 edge，n1 由 1→0、n3 由 0→1 幾乎同時變；XOR 輸出 n4 理論上 1 → 1 不變，但若 n1 先落、n3 後升，中間有一瞬間兩輸入都是 0，n4 會短暫掉到 0 再回 1。這個 glitch 在 edge 後 ~10 ps 發生、edge 前早已穩定，對 U2 無害；但<b>如果有人拿 n4 去當別的電路的 clock 或 async control</b>，它就是 runt pulse 的來源。
            </li>
            <li>
              <b>同步 vs. ripple</b>：同一個 /4，同步版 out 只晚 clk 一個 tCQ（8 ps），ripple 版晚兩個（16 ps）；但同步版 clock tree 要餵兩個 flop（skew、功耗），且 logic 隨 bit 數增長：/8 的 MSB 路徑是 tCQ + AND + XOR = 8 + 10 + 12 = 30 ps，Fmax 會下降；ripple 版 Fmax 不變。
            </li>
            <li>
              <b>高速實作</b>：XOR 常用 pass-transistor 或 CML 兩層 stack 實作；tCQ + XOR 的和才是設計要壓的目標，只縮 flop 不縮 XOR 沒有用。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>把 XOR 當成「每個 edge 都翻」</b>：那是 inverter。XOR 是有條件的翻轉，條件是另一個輸入為 1。
            </li>
            <li>
              <b>只看 U1 自己的 loop</b>：critical path 是 U1 → XOR → U2，launch 與 capture 是不同 flop；漏掉跨 flop 的路徑就會高估 Fmax。
            </li>
            <li>
              <b>把最長的走線當 critical path</b>：clk 走到 U2 的那條長線是 clock path，沒有 setup 要求（它影響的是 skew）。
            </li>
            <li>
              <b>忘記 XOR 有兩個 launch point</b>：U1.Q 與 U2.Q 都會 launch 到 U4；delay 相同時兩條都要報。
            </li>
          </ul>
        </Callout>
      </Section>

      <Section title="解答後自我檢查" en="Self-check">
        <QuizEngine questions={quiz} title="題目 3 自我檢查" storageKey="lab-ex3-sync4-check" />
      </Section>
    </>
  )
}

const exercise: LabExercise = {
  id: 'ex3-sync4',
  order: 3,
  title: '兩個 flop 共用 clk，一個 XOR',
  difficulty: 2,
  summary: '同步 2-bit counter：練習「所有 D 一起寫、所有 bit 一起更新」，並在三條候選路徑中找出真正的 critical path。',
  netlist: sync4,
  schematic: ex3Schematic,
  simOptions: { period: T },
  reference: {
    q1: 'clk：同時接到 U1 與 U2 的 clk pin（都是 rising edge）——單一 clock domain，同步電路',
    q2: 'U1、U2 兩個 rising-edge DFF（共用 async reset）；U3（inverter）與 U4（XOR）是 combinational',
    q3: 'q1 = Q(U2) = n3（MSB）、q0 = Q(U1) = n1（LSB）；state = q1q0，2 bit ⇒ 最多 4 個 state',
    q4: '00',
    q5: 'd0 = NOT q0（U3）；d1 = q1 XOR q0（U4）：q0 = 1 時 q1 翻轉，q0 = 0 時 q1 保持',
    q6: '00、01、10、11 全部 reachable，沒有 unused / lock-up state（2-bit binary up counter）',
    q7: '00 → 01 → 10 → 11 → 00（每 4 個 edge 一圈）',
    q8: 'output = q1（n3）：edge 2 由 0→1、edge 4 由 1→0、edge 6 由 0→1 …（每逢 edge 前 q0 = 1 的 edge 翻轉）',
    q9: '4（output rising edge 在 edge 2、6、10…，間隔 4 個 clk 週期）',
    q10: '50%：q1 high 2 T（state 10、11）、low 2 T（state 00、01）',
    q11: '沒有 MOD / select；rst_n 是 async reset，要求 recovery / removal 而不是 data setup',
    q12: 'U1 的 Q（n1），在第 k 個 clk rising edge launch——它同時餵 U3 與 U4；U2.Q（n3）也 launch 進 U4，兩條 XOR 路徑延遲相同（並列 critical）',
    q13: 'U2 的 D（n4），在第 k+1 個 rising edge capture；可用時間 1 T。launch（U1）與 capture（U2）是不同 flop，共用 clk 但 clock tree 可能有 skew',
    q14: 'tCQ(8) → U4 XOR(12) → tsetup(7)：arrival 20 ps；Tclk,min = 20 + 7 + 2 + 2 = 31 ps。相較之下 U1 的 inverter loop 只有 tCQ + INV = 14 ps，不是 critical',
    q15: '沒有 illegal state（4 個 state 都在主循環）。風險：XOR 在 01→10 時兩個輸入幾乎同時翻轉，n4 可能出現短暫 glitch（static hazard）；它在 edge 前已穩定所以功能無害，但若拿 n4 去當別的電路的 clock 就會是 runt 來源。launch / capture 是不同 flop，要注意 clock skew 對 hold 的影響（skew ≤ 10 ps）',
  },
  hints: [
    '兩個 flop 的 clk 都接到同一條 clk——這是同步電路，所以可以「一個 edge 一個 edge」同時更新 n3 與 n1。先看每個 D 由誰決定：U1 的 D（n2）來自 U3，只吃 n1；U2 的 D（n4）來自 U4，U4 吃 n1 與 n3 兩個輸入。所以 n1 的行為可以先獨立算出來，再用它推 n3。看清楚 U4 的符號：它是 XOR。',
    'n2 = NOT n1（n1 每個 edge 翻轉）。n4 = n1 XOR n3：意思是「n1 = 1 時 n3 翻轉、n1 = 0 時 n3 不變」。從 00 開始：edge 1 前 n1 = 0 ⇒ n4 = n3 = 0，n1 變 1 ⇒ state 01。edge 2 前 n1 = 1 ⇒ n4 = NOT n3 = 1 ⇒ state 10。再繼續推兩個 edge，看什麼時候回到 00。',
    '下表由模擬器逐 edge 產生。看 d1（n4）那一欄：只有 q0（n1）= 1 的列，d1 才和 q1 不同。output（q1 = n3）相鄰兩次 0→1 相隔幾個 edge？high 幾個 T？',
  ],
  Solution,
  criticalPath: ex3Timing,
  Prompt,
}
export default exercise
