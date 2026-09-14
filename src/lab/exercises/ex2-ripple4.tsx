import { useMemo } from 'react'
import type { LabExercise } from '@/lab/types'
import type { Schematic } from '@/components/circuit/schematic'
import type { TimingScenario } from '@/models/timing/types'
import type { QuizQuestion } from '@/components/quiz/types'
import { Callout, CodeBlock, Math as M, ModeContent, Section, Steps, Term } from '@/components/content'
import { StateTable } from '@/components/sim/StateTable'
import { StateDiagram } from '@/components/circuit/StateDiagram'
import { QuizEngine } from '@/components/quiz/QuizEngine'
import { simulate } from '@/models/divider/engine'
import { ripple4 } from '@/models/divider/examples'

const T = 100

/**
 * 題目 2 的電路圖：兩級 toggle flop，第二級的 clock 來自第一級的 Q，
 * clk pin 上的 bubble 表示 falling-edge 觸發。只標 U1～U4 與 n1～n4。
 * netlist = examples.ripple4（n1 = q0、n2 = d0、n3 = q1、n4 = d1）。
 */
export const ex2Schematic: Schematic = {
  width: 560,
  height: 225,
  elements: [
    { id: 'clk', kind: 'port', x: 40, y: 92, text: 'clk', dir: 'in', description: 'clock input' },
    { id: 'rst', kind: 'port', x: 252, y: 212, text: 'rst_n', dir: 'in', description: 'active-low async reset（兩級共用）' },
    { id: 'u1', kind: 'dff', x: 110, y: 40, label: 'U1', edge: 'rising', description: 'rising-edge D flip-flop' },
    { id: 'u3', kind: 'inv', x: 200, y: 130, label: 'U3', description: 'inverter' },
    { id: 'j1', kind: 'dot', x: 190, y: 60 },
    { id: 'u2', kind: 'dff', x: 330, y: 40, label: 'U2', edge: 'falling', description: 'D flip-flop，clk pin 有 bubble：falling-edge 觸發' },
    { id: 'u4', kind: 'inv', x: 420, y: 130, label: 'U4', description: 'inverter' },
    { id: 'j2', kind: 'dot', x: 410, y: 60 },
    { id: 'out', kind: 'port', x: 530, y: 60, text: 'out', dir: 'out', description: 'output' },
  ],
  wires: [
    { id: 'w_clk', from: 'clk.p', to: 'u1.clk', signal: 'clk', label: 'clk', kind: 'clock' },
    { id: 'w_fb1', from: 'u1.q', to: 'u3.in0', signal: 'q0', label: 'n1', kind: 'feedback', points: [[190, 60], [190, 142]], labelAt: 0.6 },
    { id: 'w_d1', from: 'u3.out', to: 'u1.d', signal: 'd0', label: 'n2', kind: 'data', points: [[250, 142], [250, 178], [95, 178], [95, 60]], labelAt: 0.5 },
    { id: 'w_ck2', from: 'u1.q', to: 'u2.clk', signal: 'q0', label: 'n1', kind: 'clock', points: [[290, 60], [290, 92]], labelAt: 0.3 },
    { id: 'w_fb2', from: 'u2.q', to: 'u4.in0', signal: 'q1', label: 'n3', kind: 'feedback', points: [[410, 60], [410, 142]], labelAt: 0.6 },
    { id: 'w_d2', from: 'u4.out', to: 'u2.d', signal: 'd1', label: 'n4', kind: 'data', points: [[470, 142], [470, 178], [315, 178], [315, 60]], labelAt: 0.5 },
    { id: 'w_out', from: 'u2.q', to: 'out.p', signal: 'q1', label: 'n3', kind: 'output', labelAt: 0.75 },
    { id: 'w_rst1', from: 'rst.p', to: 'u1.rstn', kind: 'reset', points: [[142, 212]] },
    { id: 'w_rst2', from: 'rst.p', to: 'u2.rstn', kind: 'reset', points: [[362, 212]] },
  ],
}

export const ex2Timing: TimingScenario = {
  id: 'lab-ex2',
  name: '題目 2：ripple 兩級，每級各自一個 loop',
  description: 'ripple 結構沒有「跨級的 register-to-register path」：U1 與 U2 的 clock 不同，每一級只有自己的 Q → INV → D loop。跨級的是 clock path 的延遲累積。',
  schematic: ex2Schematic,
  env: { period: 40, skew: 0, jitter: 2, margin: 2 },
  paths: [
    {
      id: 'stage1',
      name: '第一級：U1.Q → U3 → U1.D（clock = clk）',
      type: 'setup',
      launch: { element: 'u1', edge: 'rising', clock: 'clk' },
      capture: { element: 'u1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(U1)', from: 'U1.clk', to: 'U1.Q', kind: 'tcq', min: 5, max: 8, elements: ['u1'] },
        { id: 'inv', label: 'U3 INV', from: 'U1.Q', to: 'U1.D', kind: 'logic', min: 4, max: 6, wires: ['w_fb1', 'w_d1'], elements: ['u3'] },
      ],
      description: '第一級跟題目 1 完全一樣：launch 在 clk 第 k 個 rising edge，capture 在第 k+1 個，可用時間 1 T。這條決定整個 ripple counter 的 Fmax。',
      notes: ['Tclk,min = 8 + 6 + 7 + 2 + 2 = 25 ps。', 'hold：5 + 4 = 9 ps ≥ 3 ps。'],
      limits: 'Fmax（輸入時脈上限）',
    },
    {
      id: 'stage2',
      name: '第二級：U2.Q → U4 → U2.D（clock = n1，週期 2T）',
      type: 'setup',
      launch: { element: 'u2', edge: 'falling', clock: 'n1' },
      capture: { element: 'u2', edge: 'falling', clock: 'n1', setup: 7, hold: 3 },
      periodFraction: 2,
      segments: [
        { id: 'tcq', label: 'tCQ(U2)', from: 'U2.clk(n1↓)', to: 'U2.Q', kind: 'tcq', min: 5, max: 8, elements: ['u2'] },
        { id: 'inv', label: 'U4 INV', from: 'U2.Q', to: 'U2.D', kind: 'logic', min: 4, max: 6, wires: ['w_fb2', 'w_d2'], elements: ['u4'] },
      ],
      description: 'U2 的 clock 是 n1（U1.Q），週期是 2T，所以這條 loop 的可用時間是 2T（表中以 T×1×2 表示）。delay 與第一級相同，但 slack 多了一整個 T——它不是 critical。',
      notes: ['每往後一級，clock 週期加倍，loop 的 setup 越來越鬆。', '注意 launch 與 capture 都是 n1 的 falling edge：同一個 flop、相鄰兩個 n1↓。'],
      limits: '不限制 Fmax（第一級已先撞到）',
    },
    {
      id: 'clock-ripple',
      name: 'Clock path 累積：clk → U1 tCQ → U2 tCQ → out',
      type: 'output',
      launch: { element: 'u1', edge: 'rising', clock: 'clk' },
      capture: { element: 'out', edge: 'rising', clock: 'clk' },
      segments: [
        { id: 'tcq1', label: 'tCQ(U1)', from: 'clk↑', to: 'n1', kind: 'tcq', min: 5, max: 8, elements: ['u1'], wires: ['w_ck2'] },
        { id: 'tcq2', label: 'tCQ(U2)', from: 'n1↓', to: 'out', kind: 'tcq', min: 5, max: 8, elements: ['u2'], wires: ['w_out'] },
      ],
      description: '這不是 setup path，而是 ripple 特有的 clock-path 延遲累積：out 相對 clk edge 晚 2 個 tCQ = 16 ps；n 級就是 n 個 tCQ。若下游用 clk 取樣 out，這 16 ps 會吃掉下游的 setup budget。',
      notes: ['ripple 的「慢」不在自己的 loop，而在 output latency 隨級數線性增加，且每級 tCQ 的 PVT 變化都會累積成 output jitter / skew。'],
      limits: 'output latency 與下游 interface timing，不是本電路的 Fmax',
    },
    {
      id: 'rst-recovery',
      name: 'rst_n → U1 / U2（reset recovery / removal）',
      type: 'recovery',
      launch: { element: 'rst', edge: 'rising', clock: 'clk（第 k 個 rising edge：rst_n 的 de-assert 由 reset synchronizer 在這個 edge 釋放）' },
      capture: { element: 'u1', edge: 'rising', clock: 'clk（第 k+1 個 rising edge）', setup: 10, hold: 5 },
      segments: [
        { id: 'sync', label: 'reset synchronizer tCQ', from: 'clk edge k', to: 'rst_n ↑', kind: 'tcq', min: 5, max: 8 },
        { id: 'rst', label: 'rst_n 走線', from: 'rst_n', to: 'U1.rstn', kind: 'wire', min: 2, max: 4, wires: ['w_rst1', 'w_rst2'] },
      ],
      description: '兩級共用 async reset，釋放已用 clk 同步（reset synchronizer）。兩段 delay 量的是「釋放到達 rstn pin 的時刻相對 clk edge k」：min 7 ps ≥ removal 5 ps（slack +2）、max 12 ps ≤ 40 − 10 − 2 − 2 = 26 ps（recovery slack +14）。reset 期間 n1 = 0，U2 沒有 clock edge；釋放後 U2 的第一個 n1↓ 在 edge 2，所以 U2 的 recovery 其實比 U1 寬鬆得多。',
      notes: ['若 rst_n 沒有同步、直接從 pad 進來，釋放時刻相對 clk edge 是任意的，這兩個 slack 都不存在——落在 [−10, +5] ps 的禁止窗內就可能 metastable。'],
      limits: 'reset release 的安全時間窗，不是 Fmax',
    },
  ],
}

function Prompt() {
  return (
    <>
      <p>
        同一顆 PLL 裡的另一個 block：四個元件 U1～U4、一個 clk、一個 rst_n、一個 out。這次<b>兩個 flop 的 clk pin 接的東西不一樣</b>，而且其中一個 clk pin 上有個小圓圈（bubble）。
      </p>
      <p>
        工作紙第 1 題這次要特別小心：不是「clock 是 clk」一句話就結束——每一個 flop 各自的 clock 是什麼？在哪一種 edge 動作？先把這件事想清楚，再逐 edge 推 state 序列。
      </p>
    </>
  )
}

const quiz: QuizQuestion[] = [
  {
    id: 'q1',
    type: 'state',
    prompt: '從 reset（n3 n1 = 00）開始，經過 5 個 clk rising edge 之後，state（n3 n1，即 q1q0）是多少？',
    answer: '01',
    width: 2,
    bitNames: ['n3(q1)', 'n1(q0)'],
    explanation: '00 → 01 → 10 → 11 → 00 → 01：第 5 個 edge 後回到 01。',
  },
  {
    id: 'q2',
    type: 'single',
    prompt: 'U2 的 Q（n3）在哪些 clk edge 改變？',
    options: ['每一個 clk rising edge', '只有 n1 由 0→1 的 edge（奇數 edge）', '只有 n1 由 1→0 的 edge（偶數 edge：2、4、6…）', '從不改變，因為 U2 沒有接到 clk'],
    answer: 2,
    explanation: 'U2 的 clock 是 n1，且 clk pin 有 bubble ⇒ falling-edge 觸發。n1 每個 clk edge 翻轉，由 1→0 發生在 edge 2、4、6…。',
  },
  {
    id: 'q3',
    type: 'numeric',
    prompt: '實際 delay 模式：T = 100 ps、每個 flop tCQ = 8 ps。out（n3）第一次由 0→1 發生在 t = ? ps',
    answer: 216,
    unit: 'ps',
    explanation: 'edge 2 在 t = 200；n1 在 208 落下；U2 被 n1↓ 觸發，再過 tCQ = 8 ps ⇒ 216 ps。兩個 tCQ 串聯，這就是 ripple 的 clock-path 累積。',
  },
  {
    id: 'q4',
    type: 'multiple',
    prompt: '下列哪些敘述正確？',
    options: ['U2 自己的 loop（U2.Q → U4 → U2.D）可用時間是 2T，不是 1T', 'out 相對 clk edge 的延遲隨級數累積，每級加一個 tCQ', '用同步 state graph 工具（假設兩個 flop 同時被 clock）會算出正確的序列', '把 U2 改成 rising-edge 觸發後，除頻比會變成 2'],
    answers: [0, 1],
    explanation: 'U2 的 clock 是 n1（週期 2T）。ripple latency = n × tCQ。同步工具會把 00 直接送到 11（兩個 D 同時被抓），與實際 00→01→10→11 不符。U2 改成 rising 觸發後序列變成 00→11→10→01（down count），仍是 /4。',
  },
  {
    id: 'q5',
    type: 'single',
    prompt: '若再串第三級（U5 的 clock 來自 U2.Q 的 falling edge），output 相對 clk edge 的 latency 是？（tCQ = 8 ps）',
    options: ['8 ps', '16 ps', '24 ps', '取決於 clk 週期'],
    answer: 2,
    explanation: '三個 tCQ 串聯：8 × 3 = 24 ps。每一級的 loop timing 都不變，變的是 clock path 的累積延遲。',
  },
]

function Solution() {
  const records = useMemo(() => simulate(ripple4, 9, { period: T }).records, [])
  return (
    <>
      <Section title="第一步：每個 flop 各自的 clock" en="Which clock, which edge">
        <p>
          這題的陷阱在工作紙第 1 題。兩個 flop：
        </p>
        <ul>
          <li>
            <b>U1</b>：clk pin 接 clk，rising edge 觸發。
          </li>
          <li>
            <b>U2</b>：clk pin 接的是 <b>n1 = U1.Q</b>，而且 pin 上有 bubble ⇒ 在 n1 的 <b>falling edge</b>（1→0）觸發。
          </li>
        </ul>
        <p>
          兩個 flop 的 clock 不同，這是 <Term zh="漣波計數器" en="ripple counter" />。它<b>不能</b>用「一個 edge、兩個 D 同時抓」的同步方法分析，必須先推第一級，再看第一級的 Q 什麼時候「打」第二級。
        </p>
        <p>
          memory element：U1、U2（2 個 state bit：n3 = q1 為 MSB、n1 = q0 為 LSB）。feedback：n1 → U3 → n2 → U1.D，n3 → U4 → n4 → U2.D。所以 d0 = NOT q0、d1 = NOT q1——兩級各自是一個 toggle flop。
        </p>
        <Callout kind="idea">
          ripple 的直覺：第一級是題目 1 的 /2；它的輸出是一個週期 2T 的 clock，拿去再 /2 一次。/2 再 /2 就是 /4——但要小心「第二級在哪個 edge 動」決定了 state 序列長什麼樣。
        </Callout>
      </Section>

      <Section title="第二步：逐 edge 推（同時追兩個 bit）" en="Edge by edge">
        <Steps
          items={[
            <>
              <b>Reset</b>：q1q0 = 00。U3 算好 n2 = 1，U4 算好 n4 = 1。n1 = 0，所以 U2 沒有 clock edge。
            </>,
            <>
              <b>Edge 1（t = 1T）</b>：U1 抓 n2 = 1 ⇒ q0 = 1。n1 由 0→1 是 <b>rising</b>，U2 不理會（它要 falling）。state = 01，out = 0。
            </>,
            <>
              <b>Edge 2（t = 2T）</b>：U1 抓 n2 = 0 ⇒ q0 = 0。n1 由 1→0 是 <b>falling</b> ⇒ U2 被觸發，抓 n4 = NOT q1 = 1 ⇒ q1 = 1。state = 10，out 由 0→1。
            </>,
            <>
              <b>Edge 3（t = 3T）</b>：q0 → 1（rising，U2 不動）。state = 11，out = 1。
            </>,
            <>
              <b>Edge 4（t = 4T）</b>：q0 → 0（falling）⇒ U2 抓 n4 = NOT 1 = 0 ⇒ q1 = 0。state = 00，out 由 1→0。<b>四個 edge 一圈。</b>
            </>,
          ]}
        />
        <p className="small muted">模擬器逐 clk edge 產生的表——注意 q1 只在「q0 由 1→0」的列改變：</p>
        <StateTable netlist={ripple4} records={records} period={T} />
      </Section>

      <Section title="第三步：state 序列與 reachable state" en="State sequence">
        <div className="two-col">
          <div>
            <p>
              q1q0：<span className="mono">00 → 01 → 10 → 11 → 00</span>。四個 state 全部 reachable，沒有 unused state。它就是一個 2-bit binary up counter，只是用 ripple 方式做。
            </p>
            <Callout kind="warning" title="同步 state-graph 工具在這裡會騙你">
              如果你把兩個 D equation 丟進「所有 flop 同時被 clock」的 state graph 工具，會得到 00 → 11 → 00（因為它以為 edge 時 U2 也同時抓 d1 = 1）。那不是這個電路的行為。ripple 電路的 state 序列只能<b>逐 edge、分級</b>推，或用 event-driven 模擬器跑。
            </Callout>
          </div>
          <StateDiagram
            states={['00', '01', '10', '11']}
            transitions={[
              { from: '00', to: '01', label: 'clk↑' },
              { from: '01', to: '10', label: 'clk↑ (n1↓)' },
              { from: '10', to: '11', label: 'clk↑' },
              { from: '11', to: '00', label: 'clk↑ (n1↓)' },
            ]}
            outputs={{ '00': '0', '01': '0', '10': '1', '11': '1' }}
            width={300}
            height={240}
          />
        </div>
      </Section>

      <Section title="第四步：divide ratio 與 duty" en="Divide ratio">
        <p>
          out = q1。它在 edge 2 由 0→1，edge 4 由 1→0，edge 6 再由 0→1：相鄰 rising edge 相隔 4 個輸入週期。設輸入 clock 週期為 <M>{'T_{in}'}</M>（ps）、輸出週期為 <M>{'T_{out}'}</M>（ps）；<M>{'N = T_{out}/T_{in}'}</M> 為除頻比（無單位），<M>{'D = t_{high}/T_{out}'}</M> 為 duty cycle（output 維持 high 的時間佔輸出週期的比例，無單位）。
        </p>
        <M block>{'T_{out} = 4\\,T_{in} \\quad\\Rightarrow\\quad N = 4,\\qquad D = \\frac{2\\,T_{in}}{4\\,T_{in}} = 50\\%'}</M>
        <p>
          也可以用「/2 再 /2」來看：n1 的週期是 <M>{'2T_{in}'}</M>，U2 把它再除 2，得到 <M>{'4T_{in}'}</M>。每一級 toggle flop 都輸出 50% duty，與輸入無關。
        </p>
      </Section>

      <Section title="第五步：ripple 的 timing 要分兩件事看" en="Timing">
        <Callout kind="method" title="(a) 每一級各自的 loop——這才是 setup path">
          <ol style={{ margin: 0 }}>
            <li>
              <b>第一級</b>：launch = U1.Q（clk 第 k 個 rising）、logic = U3、capture = U1.D（clk 第 k+1 個 rising）。可用 1T。tCQ 8 + INV 6 + tsetup 7 + jitter 2 + margin 2 = <b>25 ps = Tclk,min</b>；T = 40 時 slack 15 ps。
            </li>
            <li>
              <b>第二級</b>：launch = U2.Q（n1 第 m 個 falling）、logic = U4、capture = U2.D（n1 第 m+1 個 falling）。n1 的週期是 2T，可用 <b>2T</b>。delay 一樣是 14 ps，但 slack 多了一整個 T。
            </li>
            <li>所以整個 counter 的 Fmax 由<b>第一級</b>決定，和單一 /2 相同——ripple 再多級也不會讓 Fmax 變差。</li>
          </ol>
        </Callout>
        <Callout kind="method" title="(b) Clock path 的延遲累積——這不是 setup path">
          <p>
            clk edge → U1 tCQ → n1 落下 → U2 tCQ → out：out 相對 clk edge 晚 <b>2 × 8 = 16 ps</b>；n 級就是 n × tCQ。這條路徑沒有 capture flop，不是 register-to-register path，所以不能拿 tCQ + tCQ 去跟 T 比。但它有兩個實際後果：(1) 下游若用 clk 取樣 out，這 16 ps 會吃掉下游的 setup budget（interface path）；(2) 每級 tCQ 的 PVT / 雜訊變化都累積成 out 的 skew 與 jitter。
          </p>
        </Callout>
        <ModeContent level="engineer" title="兩級各自的 timing equation 與 RTL">
          <M block>{'T_{clk,min} \\ge t_{CQ,U1} + t_{U3} + t_{setup} + t_{jitter} + t_{margin} \\quad(\\text{第一級，可用 } 1T)'}</M>
          <M block>{'2\\,T_{clk} \\ge t_{CQ,U2} + t_{U4} + t_{setup} + t_{jitter} + t_{margin} \\quad(\\text{第二級，可用 } 2T)'}</M>
          <M block>{'t_{latency,out} = t_{CQ,U1} + t_{CQ,U2} = 16\\ \\text{ps}'}</M>
          <p>變數：各 tCQ = clock edge 到 Q 穩定（8 ps）；tU3、tU4 = inverter delay（6 ps）；tsetup = 7 ps；tjitter、tmargin 各 2 ps。單位 ps。</p>
          <CodeBlock
            title="等效 RTL（兩個 clock domain）"
            code={`
module lab_ex2 (
  input  logic clk,
  input  logic rst_n,
  output logic out
);
  logic q0, q1;
  // 第一級：clk rising
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q0 <= 1'b0;
    else        q0 <= ~q0;          // n2 = NOT n1
  // 第二級：clock 是 q0 的 falling edge（bubble）
  always_ff @(negedge q0 or negedge rst_n)
    if (!rst_n) q1 <= 1'b0;
    else        q1 <= ~q1;          // n4 = NOT n3
  assign out = q1;
endmodule
`}
            note="兩個 always_ff 用不同的 clock：synthesis / STA 會把 q0 視為一個 generated clock。"
          />
        </ModeContent>
        <ModeContent level="deep" title="實際 delay 波形、reset 與高速考量">
          <ul>
            <li>
              <b>實際 delay</b>（T = 100、tCQ = 8）：n1 在 108 升、208 降；U2 被 208 的 n1↓ 觸發，out 在 <b>216</b> 升、416 降。把模擬器切到「實際 delay」可以看到 out 比 clk edge 晚 16 ps。
            </li>
            <li>
              <b>Reset 釋放</b>：reset 期間 n1 = 0，U2 根本沒有 clock edge；釋放後 U2 的第一個觸發是 edge 2 的 n1↓。所以 U2 的 recovery / removal 天生比 U1 寬鬆——但 U1 自己仍要滿足。
            </li>
            <li>
              <b>為什麼高速 prescaler 還是有人用 ripple</b>：每級只需要驅動自己的 inverter 與下一級的 clk pin，沒有共用 clock tree，功耗低；Fmax 由第一級決定。代價是 output latency / jitter 累積，以及多 bit 一起解碼時會有 skew 造成的 decode glitch（各 bit 不同時改變）。
            </li>
            <li>
              <b>用 rising edge 會怎樣</b>：把 U2 改成 rising-edge 觸發，q1 在 n1↑（奇數 edge）翻轉，序列變成 00 → 11 → 10 → 01 → 00（down count），除頻比仍為 4，duty 仍 50%。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>把 ripple 當同步分析</b>：兩個 D 同時代入 ⇒ 00 → 11，錯。第二級只在 n1↓ 動作。
            </li>
            <li>
              <b>忽略 bubble</b>：rising 與 falling 觸發都能 /4，但 state 序列不同（up count vs. down count），output 相對 clk 的相位也不同。
            </li>
            <li>
              <b>把 tCQ + tCQ 當成 setup path 去跟 T 比</b>：那是 clock path 累積延遲（latency），沒有 capture flop；真正限制 Fmax 的是第一級的 loop。
            </li>
            <li>
              <b>以為 ripple 的 Fmax 隨級數變差</b>：每級 loop 的可用時間反而加倍；變差的是 latency 與 jitter。
            </li>
          </ul>
        </Callout>
      </Section>

      <Section title="解答後自我檢查" en="Self-check">
        <QuizEngine questions={quiz} title="題目 2 自我檢查" storageKey="lab-ex2-ripple4-check" />
      </Section>
    </>
  )
}

const exercise: LabExercise = {
  id: 'ex2-ripple4',
  order: 2,
  title: '兩級 flop，第二級的 clock 不是 clk',
  difficulty: 2,
  summary: '兩個 toggle flop 串接，第二級由第一級的輸出（falling edge）驅動。練習「每個 flop 各自的 clock 是什麼」與 ripple 的 clock-path 延遲累積。',
  netlist: ripple4,
  schematic: ex2Schematic,
  simOptions: { period: T },
  reference: {
    q1: 'U1 的 clock 是 clk（rising edge）；U2 的 clock 不是 clk，而是 n1 = U1.Q（clk pin 有 bubble ⇒ falling edge 觸發）。這是 ripple 結構：兩級 clock 不同',
    q2: 'U1、U2 兩個 DFF（都有 async reset）。U3、U4 是 inverter（combinational）',
    q3: '2 個 state bit：q1 = Q(U2) = n3（MSB）、q0 = Q(U1) = n1（LSB）；state 寫成 q1q0',
    q4: 'rst_n 釋放後 q1q0 = 00',
    q5: 'd0 = NOT q0（U3），d1 = NOT q1（U4）。但 U2 只在 q0 的 falling edge 才抓 d1，所以 q1 不是每個 clk edge 都更新',
    q6: '00、01、10、11 全部 reachable（00 → 01 → 10 → 11 → 00），沒有 unused state。注意：用「同步」state graph 工具會算出 00 → 11 的錯誤結果，因為它假設兩個 flop 同時被 clock',
    q7: 'q1q0：00 → 01 → 10 → 11 → 00（每 4 個 clk edge 一圈）；q1 只在 q0 由 1→0 的那個 edge 改變（edge 2、4、6…）',
    q8: 'output = q1（n3）：edge 2 由 0→1（q0 第一次 1→0），edge 4 由 1→0，edge 6 再 0→1… 每個偶數 edge 翻轉一次',
    q9: '4（output rising edge 在 edge 2、6、10…，間隔 4 個 clk 週期）',
    q10: '50%：q1 high 2 T（edge 2 → 4）、low 2 T（edge 4 → 6）',
    q11: '沒有 MOD / select。rst_n 對兩級都是 async reset，要求是 recovery / removal；reset 期間 n1 = 0，U2 沒有 clock edge，釋放後 U2 的第一個觸發在 edge 2',
    q12: '每一級各有自己的 loop：U1.Q 在 clk 第 k 個 rising edge launch；U2.Q 在 n1 的第 m 個 falling edge launch。Fmax 由第一級 U1.Q → U3 → U1.D 決定（可用時間 1 T）',
    q13: 'U1.D 在 clk 第 k+1 個 rising edge capture（可用 1 T）；U2.D 在 n1 的下一個 falling edge capture（可用 2 T，因為 n1 週期 = 2 T）',
    q14: '第一級：tCQ(8) → U3 INV(6) → tsetup(7)，Tclk,min = 8 + 6 + 7 + 2 + 2 = 25 ps。另外要看 clock path 累積：clk → U1 tCQ(8) → U2 clk → tCQ(8) → out，輸出延遲 16 ps，每多一級再加一個 tCQ——這是 ripple 的 clock-path 延遲，不是 setup path',
    q15: '沒有 illegal state。風險：(1) out 相對 clk 的 latency 逐級累積（2 tCQ），下游若用 clk 取樣 out 會有 interface setup 問題，且各級 tCQ 的 PVT 變化累積成 jitter；(2) 若把 U2 改成 rising-edge 觸發，序列變 00→11→10→01（down count），仍是 /4；(3) 多 bit 一起解碼時各 bit 不同時改變會有 decode glitch',
  },
  hints: [
    '先看每個 flop 的 clk pin 接到哪裡。U1 的 clk 接 clk；U2 的 clk 接的卻是 U1 的 Q（n1），而且 pin 上有 bubble——表示 U2 在 n1 的 falling edge（1→0）才動作。所以這不是「兩個 flop 一起看一個 clock」的同步電路，而是 ripple：先推 U1，再看 n1 什麼時候由 1 變 0。',
    '第一級：n2 = NOT n1，所以 n1 每個 clk rising edge 翻轉：0, 1, 0, 1 …。第二級：n4 = NOT n3，但 U2 只在 n1 由 1→0 時抓 n4——n1 在哪些 edge 由 1 變 0？（提示：edge 2、4、6 …）在那些 edge，n3 翻轉。把 n3 n1 兩個 bit 一起寫下來，看幾個 edge 回到 00。',
    '下表由模擬器逐 clk edge 產生（兩個 output 週期）。注意 q1（n3）只在 q0（n1）由 1→0 的那幾列改變。數一數 output 相鄰兩次 0→1 相隔幾個 edge，以及 high 幾個 T、low 幾個 T。',
  ],
  Solution,
  criticalPath: ex2Timing,
  Prompt,
}
export default exercise
