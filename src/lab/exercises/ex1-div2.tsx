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
import { div2 } from '@/models/divider/examples'

const T = 100

/**
 * 題目 1 的電路圖：故意畫成「陌生」的樣子。
 * - inverter 畫在 D 前面（而不是 Q 後面）
 * - 元件只標 U1 / U2，走線只標 n1 / n2，不出現 d0 / q0 這種提示
 * - 輸出叫 out，clock 叫 clk_in
 * netlist 仍是 examples.div2（n1 = d0、n2 = q0）。
 */
export const ex1Schematic: Schematic = {
  width: 440,
  height: 205,
  elements: [
    { id: 'clk', kind: 'port', x: 40, y: 92, text: 'clk_in', dir: 'in', description: 'clock input' },
    { id: 'rst', kind: 'port', x: 222, y: 190, text: 'rst_n', dir: 'in', description: 'active-low async reset' },
    { id: 'u2', kind: 'inv', x: 90, y: 48, label: 'U2', description: 'inverter' },
    { id: 'u1', kind: 'dff', x: 190, y: 40, label: 'U1', edge: 'rising', description: 'rising-edge D flip-flop' },
    { id: 'j1', kind: 'dot', x: 280, y: 60 },
    { id: 'out', kind: 'port', x: 400, y: 60, text: 'out', dir: 'out', description: 'output' },
  ],
  wires: [
    { id: 'w_clk', from: 'clk.p', to: 'u1.clk', signal: 'clk', label: 'clk_in', kind: 'clock' },
    { id: 'w_n1', from: 'u2.out', to: 'u1.d', signal: 'd0', label: 'n1', kind: 'data' },
    { id: 'w_n2', from: 'u1.q', to: 'out.p', signal: 'q0', label: 'n2', kind: 'output', labelAt: 0.7 },
    { id: 'w_fb', from: 'u1.q', to: 'u2.in0', signal: 'q0', label: 'n2', kind: 'feedback', points: [[280, 60], [280, 18], [68, 18], [68, 60]], labelAt: 0.5 },
    { id: 'w_rst', from: 'rst.p', to: 'u1.rstn', kind: 'reset', route: 'direct' },
  ],
}

export const ex1Timing: TimingScenario = {
  id: 'lab-ex1',
  name: '題目 1：U1.Q → U2 → U1.D',
  description: '只有一個 flop，所以唯一的 register-to-register path 是它自己的 feedback loop：launch 在第 k 個 edge，capture 在第 k+1 個 edge。',
  schematic: ex1Schematic,
  env: { period: 40, skew: 0, jitter: 2, margin: 2 },
  paths: [
    {
      id: 'loop',
      name: 'U1.Q → U2（INV）→ U1.D',
      type: 'setup',
      launch: { element: 'u1', edge: 'rising', clock: 'clk_in' },
      capture: { element: 'u1', edge: 'rising', clock: 'clk_in', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'U1.clk', to: 'U1.Q', kind: 'tcq', min: 5, max: 8, elements: ['u1'], note: 'clock edge 到 Q 穩定' },
        { id: 'inv', label: 'U2 INV', from: 'U1.Q', to: 'U1.D', kind: 'logic', min: 4, max: 6, wires: ['w_fb', 'w_n1'], elements: ['u2'], note: 'inverter propagation delay' },
      ],
      description: '這是整個電路唯一會被 sensitize 的 data path，也是 Fmax critical path。',
      notes: [
        'launch edge = 第 k 個 rising edge；capture edge = 第 k+1 個 rising edge ⇒ 可用時間 = 1 T。',
        '同一個 flop 既是 launch 也是 capture，clock 走同一條線，skew ≈ 0。',
        'hold：tCQ,min + tINV,min = 5 + 4 = 9 ps ≥ thold = 3 ps，安全。若把 U2 拿掉直接用 Q̄ 接 D，min delay 只剩 tCQ,min = 5 ps。',
      ],
      limits: 'Fmax（最高輸入時脈頻率）',
    },
    {
      id: 'rst-recovery',
      name: 'rst_n → U1（reset recovery / removal）',
      type: 'recovery',
      launch: { element: 'rst', edge: 'rising', clock: 'clk_in（第 k 個 rising edge：rst_n 的 de-assert 由 reset synchronizer 在這個 edge 釋放）' },
      capture: { element: 'u1', edge: 'rising', clock: 'clk_in（第 k+1 個 rising edge）', setup: 10, hold: 5 },
      segments: [
        { id: 'sync', label: 'reset synchronizer tCQ', from: 'clk_in edge k', to: 'rst_n ↑', kind: 'tcq', min: 5, max: 8, note: '釋放時刻由 synchronizer 最後一級 flop 的 tCQ 決定' },
        { id: 'rst', label: 'rst_n 走線', from: 'rst_n', to: 'U1.rstn', kind: 'wire', min: 2, max: 4, wires: ['w_rst'], note: '兩段加起來 = 釋放「到達 rstn pin」的時刻，量的基準是 clk_in edge k' },
      ],
      description: '非同步 reset 釋放（de-assert）相對 clock edge 的時間要求：recovery 像 setup（要比下一個 edge 早到）、removal 像 hold（不能太靠近剛過去的那個 edge）。它不是 data path，也不限制 Fmax。這裡假設 rst_n 的釋放已經用同一條 clk_in 同步（reset synchronizer），否則釋放時刻相對 clk edge 是任意的，根本沒有 slack 可算。',
      notes: [
        '這條 path 的兩段 delay 量的是「釋放到達 U1.rstn 的時刻相對 clk_in edge k」：min = 5 + 2 = 7 ps、max = 8 + 4 = 12 ps。',
        'removal（像 hold）：釋放必須比 edge k 晚 t_removal = 5 ps ⇒ slack = 7 − 5 = +2 ps。走線再快一點（min < 5 ps）就會 removal violation——這是 min-delay 問題，與 T 無關。',
        'recovery（像 setup）：釋放必須比 edge k+1 早 t_recovery = 10 ps ⇒ required = 40 − 10 − 2 − 2 = 26 ps，arrival 12 ps ⇒ slack = +14 ps。',
        '若 rst_n 直接從 pad 進來、沒有同步：釋放時刻相對 clk edge 完全隨機，可能正好落在 [−10, +5] ps 這個禁止窗內 ⇒ U1 一半 reset 一半 capture，進入 metastable。這就是「非同步 reset、同步釋放」的理由。',
      ],
      limits: 'reset release 的安全時間窗，不是 Fmax',
    },
    {
      id: 'out',
      name: 'U1.Q → out（output latency）',
      type: 'output',
      launch: { element: 'u1', edge: 'rising', clock: 'clk_in' },
      capture: { element: 'out', edge: 'rising', clock: 'clk_in' },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'U1.clk', to: 'U1.Q', kind: 'tcq', min: 5, max: 8, elements: ['u1'] },
        { id: 'wire', label: 'output wire', from: 'U1.Q', to: 'out', kind: 'wire', min: 2, max: 3, wires: ['w_n2'] },
      ],
      description: '輸出延遲：不是 setup critical path，因為沒有 capture flop——除非下游用同一個 clk 取樣 out，那才會變成 interface path。',
      limits: 'output latency，不限制 Fmax',
    },
  ],
}

function Prompt() {
  return (
    <>
      <p>
        你在 review 一顆 PLL 的 feedback divider，看到下面這個<b>沒有任何註解</b>的小電路：兩個元件 U1、U2，一個 clock 輸入 clk_in、一個 rst_n、一個輸出 out。沒有人告訴你它是做什麼的。
      </p>
      <p>
        建議順序：<b>先不要按模擬</b>。(1) 只看圖，回答工作紙 1～5（clock、memory element、state bit、reset state、D equation）；(2) 用紙筆從 reset state 開始逐 edge 推 3～4 個 edge，回答 6～10；(3) 再用模擬器一個 edge 一個 edge 對答案；(4) 最後想 timing，回答 11～15。卡住再開 hint。
      </p>
    </>
  )
}

const quiz: QuizQuestion[] = [
  {
    id: 'q1',
    type: 'state',
    prompt: '從 reset（Q = 0）開始，經過 7 個 clk_in rising edge 之後，U1 的 Q 是多少？',
    answer: '1',
    width: 1,
    bitNames: ['Q(U1)'],
    explanation: '每個 edge 翻一次：0 → 1 → 0 → 1 → 0 → 1 → 0 → 1。奇數個 edge 之後是 1。',
  },
  {
    id: 'q2',
    type: 'single',
    prompt: '把 U2 從 D 前面搬到 Q 後面（output 改從 U2 的輸出取），除頻比會變成？',
    options: ['1（不再除頻）', '仍是 2，只是 output 反相（相位差 180°）', '4', '電路會振盪'],
    answer: 1,
    explanation: 'feedback loop 仍然是「Q 反相後接回 D」，state 序列一樣是 0 → 1 → 0；只有 output 取的是 Q̄，波形反相而已。',
  },
  {
    id: 'q3',
    type: 'numeric',
    prompt: 'tCQ,max = 8 ps、U2 = 6 ps、tsetup = 7 ps、jitter = 2 ps、margin = 2 ps、skew = 0。Tclk,min 是多少 ps？',
    answer: 25,
    unit: 'ps',
    explanation: 'Tclk,min = 8 + 6 + 7 + 2 + 2 = 25 ps。T = 40 ps 時 slack = 15 ps。',
  },
  {
    id: 'q4',
    type: 'multiple',
    prompt: '下列哪些敘述正確？',
    options: ['U1 既是 launch point 也是 capture point，但用的是相鄰兩個 edge', 'output duty cycle 是 50%，與 clk_in 的 duty 無關', 'rst_n → U1 是一條 setup critical path', '這個電路有一個 unused state'],
    answers: [0, 1],
    explanation: '單一 flop 的 loop：launch 在 edge k、capture 在 edge k+1。output 只在 rising edge 翻轉，所以 high / low 各 1T。rst_n 是 async reset，檢查的是 recovery / removal；1 個 state bit 的兩個 state 都在主循環，沒有 unused state。',
  },
  {
    id: 'q5',
    type: 'single',
    prompt: '若把 U2 拿掉、直接用 U1 的 Q̄ 接回 D，hold check 的 min arrival 變成多少？（tCQ,min = 5、tINV,min = 4、thold = 3）',
    options: ['9 ps，與原本相同', '5 ps，仍大於 thold，安全', '0 ps，一定 hold violation', '4 ps'],
    answer: 1,
    explanation: 'min delay 只剩 tCQ,min = 5 ps ≥ thold = 3 ps，仍安全；但 hold margin 從 6 ps 縮到 2 ps，flop 內部 tCQ,min 必須有保證。',
  },
]

function Solution() {
  const records = useMemo(() => simulate(div2, 6, { period: T }).records, [])
  return (
    <>
      <Section title="第一步：認出三樣東西" en="Clock, memory element, feedback">
        <p>
          不要先猜「這是 /2」。先在圖上找三樣東西：
        </p>
        <ul>
          <li>
            <b>Clock input</b>：只有 clk_in 接到一個 clk pin（U1）。整個電路只有一個 clock domain，而且是 rising edge。
          </li>
          <li>
            <b>Memory element</b>：U1 是 DFF，它有 clk pin，會「記住」東西；U2 是 inverter，輸入變它就馬上變，沒有記憶。所以只有 <b>1 個 state bit</b>：Q(U1)（模擬器裡叫 q0）。
          </li>
          <li>
            <b><Term zh="回授路徑" en="feedback path" /></b>：從 U1.Q（n2）出發，繞過上方回到 U2，經 U2 變成 n1，接到 U1.D。所以 D(U1) = NOT Q(U1)。inverter 畫在 D 前面或 Q 後面沒有差別——重點是<b>回到 D 之前反相了幾次</b>（奇數次）。
          </li>
        </ul>
        <Callout kind="idea">
          陌生電路的第一個問題永遠是「誰有記憶」。有記憶的元件數量 = state bit 數量 = 你要追蹤的東西。這題只有 1 個，所以最多 2 個 state。
        </Callout>
      </Section>

      <Section title="第二步：從 reset 逐 edge 推" en="Edge by edge">
        <Steps
          items={[
            <>
              <b>Reset</b>：rst_n = 0 把 U1 清成 Q = 0。U2 不用等 clock，馬上算出 n1 = NOT 0 = 1，停在 D pin 前面等。
            </>,
            <>
              <b>Edge 1（t = 1T）</b>：edge 前 Q = 0、D = 1。edge 發生，U1 把 D 抓進 Q ⇒ Q = 1。U2 隨即把 n1 更新成 0。
            </>,
            <>
              <b>Edge 2（t = 2T）</b>：edge 前 Q = 1、D = 0。edge 發生 ⇒ Q = 0。回到 reset state——<b>兩個 edge 一圈</b>。
            </>,
            <>
              <b>Edge 3、4…</b>：重複 0 → 1 → 0。output（= Q）在 edge 1、3、5 由 0→1，在 edge 2、4、6 由 1→0。
            </>,
          ]}
        />
        <p className="small muted">下表由模擬器從 reset 產生，每一列就是上面的一步：</p>
        <StateTable netlist={div2} records={records} period={T} />
      </Section>

      <Section title="第三步：state table 與 reachable state" en="State table">
        <div className="two-col">
          <div>
            <table className="state-table">
              <thead>
                <tr>
                  <th>現在 Q</th>
                  <th>D = NOT Q</th>
                  <th>下一個 Q</th>
                  <th>output</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>0</td>
                  <td>1</td>
                  <td>1</td>
                  <td>0</td>
                </tr>
                <tr>
                  <td>1</td>
                  <td>0</td>
                  <td>0</td>
                  <td>1</td>
                </tr>
              </tbody>
            </table>
            <p className="small muted">1 個 state bit ⇒ 2 個 state，兩個都在主循環：沒有 unused state，也不可能 lock-up。</p>
          </div>
          <StateDiagram states={['0', '1']} transitions={[{ from: '0', to: '1', label: 'clk↑' }, { from: '1', to: '0', label: 'clk↑' }]} outputs={{ '0': '0', '1': '1' }} width={240} height={190} />
        </div>
      </Section>

      <Section title="第四步：divide ratio 與 duty cycle" en="Divide ratio">
        <p>
          設輸入 clock 週期為 <M>{'T_{in}'}</M>（單位 ps）。output 相鄰兩次 rising edge 在 edge 1 與 edge 3，中間隔了 2 個輸入週期：
        </p>
        <M block>{'T_{out} = 2\\,T_{in} \\quad\\Rightarrow\\quad N = \\frac{T_{out}}{T_{in}} = 2,\\qquad f_{out} = \\frac{f_{in}}{2}'}</M>
        <p>
          <b>Duty cycle</b>：output high 一個 <M>{'T_{in}'}</M>（edge 1 到 edge 2）、low 一個 <M>{'T_{in}'}</M>（edge 2 到 edge 3）：
        </p>
        <M block>{'D = \\frac{t_{high}}{T_{out}} = \\frac{T_{in}}{2\\,T_{in}} = 50\\%'}</M>
        <Callout kind="note" title="與輸入 duty 無關">
          output 只在 rising edge 翻轉，clk_in 是 30% 還是 70% duty 都不影響。這也是為什麼工作紙第 10 題的答案不需要知道 clk_in 的 duty。
        </Callout>
      </Section>

      <Section title="第五步：critical path" en="Critical path">
        <p>
          Q 在 edge k 更新後，新的 D 必須在 edge k+1 之前 tsetup 就穩定。用 launch / capture 的語言：
        </p>
        <Callout kind="method" title="逐項確認">
          <ol style={{ margin: 0 }}>
            <li>
              <b>Launch point</b>：U1.Q，在第 k 個 clk_in rising edge 送出新值（tCQ 之後）。
            </li>
            <li>
              <b>Combinational logic</b>：只有 U2 一個 inverter。這條路徑在每個 cycle 都會被 sensitize（Q 每個 edge 都變）。
            </li>
            <li>
              <b>Capture point</b>：U1.D，在第 k+1 個 rising edge 抓。同一個 flop、不同 edge，可用時間 = 1 T。
            </li>
            <li>
              <b>Budget</b>：tCQ 8 + U2 6 + tsetup 7 + jitter 2 + margin 2 = <b>25 ps</b> = Tclk,min。以 T = 40 ps 算，slack = 40 − 25 = <b>15 ps</b>。
            </li>
          </ol>
        </Callout>
        <p>
          其他兩條候選：<b>rst_n → U1</b> 是 async reset 的 recovery / removal，不是 data path；<b>U1.Q → out</b> 沒有 capture flop，只算 output latency（8 + 3 = 11 ps）。下方的 Critical Path Explorer 可以逐條切換比較。
        </p>
        <Callout kind="note" title="rst_n 那一條的兩個數字怎麼讀">
          <p style={{ marginTop: 0 }}>
            Explorer 對這條路徑也印了 recovery slack 與 removal slack，但它們量的<b>不是</b>走線延遲本身，而是「reset 釋放到達 U1.rstn 的時刻，相對第 k 個 clk_in edge 有多遠」。前提是 rst_n
            的釋放已經用同一條 clk_in 重新取樣（reset synchronizer）：釋放在 edge k 由 synchronizer 送出（tCQ 5～8 ps），再走 rst_n 這條線（2～4 ps），所以到達時刻是 edge k 之後
            <b>7～12 ps</b>。
          </p>
          <ul style={{ marginBottom: 0 }}>
            <li>
              <b>removal</b>（像 hold）：釋放要比 edge k 晚 5 ps 以上 ⇒ slack = 7 − 5 = <b>+2 ps</b>。這是 min-delay 檢查，把 clock 放慢救不了它。
            </li>
            <li>
              <b>recovery</b>（像 setup）：釋放要比 edge k+1 早 10 ps 以上 ⇒ required = 40 − 10 − 2 − 2 = 26 ps、arrival = 12 ps ⇒ slack = <b>+14 ps</b>。
            </li>
            <li>
              若 rst_n 直接從 pad 進來、<b>沒有</b>同步：釋放時刻相對 clk edge 是任意的，這兩個數字根本算不出來——它隨時可能落在 edge 前 10 ps 到 edge 後 5 ps 的禁止窗裡，讓 U1 一半 reset 一半 capture。這才是
              recovery / removal 真正要你做的設計決定。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="Timing equation 與 RTL">
          <M block>{'T_{clk,min} \\ge t_{CQ,max} + t_{U2,max} + t_{setup} - t_{skew} + t_{jitter} + t_{margin}'}</M>
          <p>
            變數：<M>{'t_{CQ,max}'}</M> = clock edge 到 Q 穩定的最大延遲（8 ps）；<M>{'t_{U2,max}'}</M> = inverter 最大延遲（6 ps）；<M>{'t_{setup}'}</M> = D 必須在 edge 前穩定的時間（7 ps）；<M>{'t_{skew}'}</M> = capture clock 到達 − launch clock 到達（同一條線，0）；<M>{'t_{jitter}'}</M> = 相鄰 edge 間隔的不確定量（2 ps）；<M>{'t_{margin}'}</M> = 設計裕度（2 ps）。單位皆為 ps。
          </p>
          <M block>{'t_{CQ,min} + t_{U2,min} = 5 + 4 = 9\\ \\text{ps} \\ge t_{hold} + t_{skew} = 3\\ \\text{ps}'}</M>
          <CodeBlock
            title="等效 RTL"
            code={`
module lab_ex1 (
  input  logic clk_in,
  input  logic rst_n,
  output logic out
);
  logic q;
  always_ff @(posedge clk_in or negedge rst_n)
    if (!rst_n) q <= 1'b0;   // reset state
    else        q <= ~q;     // D = NOT Q（U2）
  assign out = q;
endmodule
`}
            note="inverter 在 D 前面或 Q 後面，合成出來都是 q <= ~q。"
          />
        </ModeContent>
        <ModeContent level="deep" title="實際 delay 下的波形與高速實作">
          <ul>
            <li>
              把模擬器切到「實際 delay」：T = 100 ps 時 Q 在 t = 108、208、308… 改變（edge + tCQ 8），n1 在 t = 114、214… 改變（再加 U2 的 6 ps）。D 在下一個 edge 前 86 ps 就穩定，遠大於 tsetup——所以 100 ps 的 clock 很寬鬆；把 T 壓到 25 ps 才會剛好用完。
            </li>
            <li>
              <b>Q̄ 直接接 D</b>：高速 /2 常省掉 U2，直接用 flop 的 Q̄。setup path 只剩 tCQ + tsetup，但 hold path 也只剩 tCQ,min——flop 本身必須保證 tCQ,min &gt; thold（master-slave 結構天生滿足，但 dynamic / TSPC 要小心）。
            </li>
            <li>
              <b>CML latch 型 /2</b>：兩個 CML latch 串成 master-slave，每個 latch 要在半個 clock 週期內完成 regeneration；Fmax 由 gm/C 決定，而不是 tCQ + tsetup 的加法模型。
            </li>
            <li>
              <b>Pulse width</b>：clk_in 的 high / low 寬度各自要大於 master / slave 的最小 transparent 時間；輸入 duty 偏離 50% 太多會先撞到 pulse-width 限制。
            </li>
            <li>
              <b>Jitter</b>：/2 不放大輸入 jitter（每個 output edge 直接對應一個 input edge），但 tCQ 隨 PVT 與供電雜訊變化會加上自己的 jitter。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>被 inverter 的位置騙</b>：畫在 D 前面看起來像「先反相再存」，其實和「存了再反相」是同一個 loop。看的是 loop 裡反相了幾次（奇數次才會 toggle）。
            </li>
            <li>
              <b>把 U2 當成 memory element</b>：inverter 沒有 clock，不記東西；state bit 只有 Q(U1)。
            </li>
            <li>
              <b>把 rst_n 當成 critical path</b>：它是 recovery / removal 檢查，不限制 Fmax。
            </li>
            <li>
              <b>忘了它不需要 reset 也能除頻</b>：兩個 state 都合法，reset 只決定起始相位；多個 /2 並排時相位不確定才是問題。
            </li>
          </ul>
        </Callout>
      </Section>

      <Section title="解答後自我檢查" en="Self-check">
        <QuizEngine questions={quiz} title="題目 1 自我檢查" storageKey="lab-ex1-div2-check" />
      </Section>
    </>
  )
}

const exercise: LabExercise = {
  id: 'ex1-div2',
  order: 1,
  title: '一個 flop、一個 inverter',
  difficulty: 1,
  summary: '最小的 divider：先練習找 clock、memory element 與 feedback loop，逐 edge 推出 state 序列與除頻比。',
  netlist: div2,
  schematic: ex1Schematic,
  simOptions: { period: T },
  reference: {
    q1: 'clk_in：接到 U1 的 clk pin，rising edge 觸發；整個電路只有這一個 clock domain',
    q2: '只有 U1（rising-edge DFF，附 async active-low reset）。U2 是 inverter，屬 combinational，不是 memory element',
    q3: '1 個 state bit：Q(U1)（模擬器裡叫 q0）。1 bit ⇒ 只有 0 / 1 兩個 state',
    q4: 'rst_n = 0 時 U1 被清成 Q = 0；reset 釋放後 state = 0',
    q5: 'D(U1) = NOT Q(U1)，即 d0 = q̄0。inverter 畫在 D 前面或 Q 後面沒有差別，都是把 Q 反相回 D',
    q6: '0 與 1 都 reachable（0 → 1 → 0 …），沒有 unused state，也沒有 lock-up state',
    q7: '0 → 1 → 0 → 1 …（每 2 個 edge 重複一次）',
    q8: 'output = Q(U1)：在 edge 1、3、5… 由 0→1，在 edge 2、4、6… 由 1→0；每個 rising edge 都翻轉',
    q9: '2（output rising edge 每 2 個 clk 週期一次：edge 1 → edge 3 → edge 5 …）',
    q10: '50%：high 1 T、low 1 T，與 clk_in 的 duty 無關',
    q11: '沒有 MOD / select。唯一的 control 是 rst_n，它的要求是 recovery / removal（釋放時間相對 clk edge），不是 data setup deadline',
    q12: 'U1 的 Q，在第 k 個 clk_in rising edge（launch edge）',
    q13: 'U1 的 D，在第 k+1 個 clk_in rising edge（capture edge）；launch 與 capture 是同一個 flop、不同 edge，可用時間 = 1 T',
    q14: 'U1.clk → tCQ(8) → Q → U2 inverter(6) → D → tsetup(7)：Tclk,min = 8 + 6 + 7 + jitter 2 + margin 2 = 25 ps；T = 40 ps 時 slack 15 ps',
    q15: '沒有 illegal state（兩個 state 都合法）。風險：沒有 reset 時起始相位不確定（差半個輸出週期）；rst_n 若在 clk edge 附近釋放可能 metastable；若拿掉 U2 直接接 Q̄，hold margin 只剩 tCQ,min − thold',
  },
  hints: [
    '先找 memory element。這個電路裡只有 U1 是會「記住」東西的元件（它有 clk pin）；U2 只是把訊號反相，沒有記憶。所以整個電路只有 1 個 state bit：U1 的 Q。接著追蹤 U1.Q（n2）出去之後繞了一圈接到哪裡——它經過 U2 變成 n1，回到 U1 的 D。這一圈就是 feedback path，決定下一個 state。',
    'next-state equation：D(U1) = U2 的輸出 = NOT Q(U1)。把 reset state Q = 0 代進去：D = 1，所以第一個 rising edge 後 Q = 1。再代一次：Q = 1 ⇒ D = 0 ⇒ 第二個 edge 後 Q = 0。問自己：第幾個 edge 之後 state 回到 0？output 的一個週期是幾個 T？high 幾個 T、low 幾個 T？',
    '下表由模擬器從 reset 逐 edge 產生，涵蓋兩個 output 週期。對照每一列的「edge 前 state → D → edge 後 state」，確認和你手推的一致；然後數一數相鄰兩次 output 0→1 之間隔了幾個 edge——這就是 divide ratio。',
  ],
  Solution,
  criticalPath: ex1Timing,
  Prompt,
}
export default exercise
