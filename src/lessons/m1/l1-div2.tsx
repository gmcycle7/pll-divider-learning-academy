import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { StateDiagram } from '@/components/circuit/StateDiagram'
import { div2 } from '@/models/divider/examples'
import { div2Schematic } from './div2-schematic'
import { div2Timing } from './div2-timing'
import type { Schematic } from '@/components/circuit/schematic'
import type { Netlist } from '@/models/divider/types'
import { xor } from '@/utils/bits'

function Content() {
  return (
    <>
      <Section title="先用直覺想" en="Intuition">
        <p>
          想像一個開關，每次有人敲門（clock 的 rising edge）就把開關<b>反過來</b>。敲第一次：關 → 開。敲第二次：開 → 關。敲兩次才回到原來的樣子。
        </p>
        <p>
          所以「敲門」的節奏如果是每 T 秒一次，開關「開 → 關 → 開」一整圈需要 2T。開關的頻率是敲門頻率的一半。這就是 divide-by-2：<b>output 每兩個 input edge 重複一次</b>。
        </p>
        <Callout kind="idea">
          divider 分析永遠先追蹤 <Term zh="邊緣" en="edge" />，不要只看高低電位。問自己：<b>下一個 edge 來時，state 會變成什麼？</b>
        </Callout>
      </Section>

      <Section title="最簡單的電路" en="The circuit">
        <p>
          一個 <Term zh="D 型正反器" en="D flip-flop, DFF" /> 加一個 inverter。把 Q 反相之後接回 D：
        </p>
        <Math block>{'d_0 = \\overline{q_0}'}</Math>
        <LogicDiagram schematic={div2Schematic} showValues={false} />
        <p>
          先找出分析所需的三樣東西：
        </p>
        <ul>
          <li>
            <b>Clock input</b>：<span className="mono">clk</span>，接到 FF0 的 clk pin，rising edge 觸發。
          </li>
          <li>
            <b>Memory element</b>：只有一個，FF0。它的 Q 就是唯一的 <Term zh="狀態位元" en="state bit" /> <span className="mono">q0</span>。
          </li>
          <li>
            <b>Feedback path</b>：<span className="mono">q0 → INV → d0</span>。這條路徑決定下一個 state。
          </li>
        </ul>
      </Section>

      <Section title="逐一個 clock edge 操作" en="Edge by edge">
        <p>
          下面的模擬器從 reset state（q0 = 0）開始。每按一次「下一個 Clock Edge」，看三件事：edge 前的 state、inverter 已經算好的 d0、edge 後的新 state。
        </p>
        <DividerSimPanel netlist={div2} schematic={div2Schematic} title="DFF Divide-by-2" showDelayMode showPulseWidths />
        <Steps
          items={[
            <>
              <b>初始</b>：reset 讓 q0 = 0。inverter 不用等 clock，馬上算出 d0 = NOT 0 = 1，停在 D pin 前面等。
            </>,
            <>
              <b>第一個 edge（t = 1T）</b>：FF0 把 D 抓進 Q，q0 = 1。inverter 隨即算出新的 d0 = 0。
            </>,
            <>
              <b>第二個 edge（t = 2T）</b>：FF0 抓 d0 = 0，q0 = 0。回到初始 state。
            </>,
            <>
              <b>結論</b>：state 序列是 0 → 1 → 0 → 1 …，每 2 個 edge 重複一次。q0 的 rising edge 出現在 edge 1、edge 3、edge 5 …，相鄰間隔 = 2T。
            </>,
          ]}
        />
      </Section>

      <Section title="State table 與 next-state equation" en="State table">
        <div className="two-col">
          <div>
            <table className="state-table">
              <thead>
                <tr>
                  <th>現在 q0</th>
                  <th>d0 = NOT q0</th>
                  <th>下一個 q0</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>0</td>
                  <td>1</td>
                  <td>1</td>
                </tr>
                <tr>
                  <td>1</td>
                  <td>0</td>
                  <td>0</td>
                </tr>
              </tbody>
            </table>
            <p className="small muted">只有一個 state bit，所以只有兩個 state。兩個都 reachable，沒有 unused state。</p>
          </div>
          <StateDiagram states={['0', '1']} transitions={[{ from: '0', to: '1', label: 'clk↑' }, { from: '1', to: '0', label: 'clk↑' }]} outputs={{ '0': '0', '1': '1' }} width={260} height={200} />
        </div>
      </Section>

      <Section title="Divide ratio 的數學推導" en="Deriving the divide ratio">
        <p>
          設輸入 clock 週期為 <Math>{'T_{in}'}</Math>。q0 在每個 rising edge toggle，所以 q0 的一個完整週期（0→1→0）需要兩個 rising edge：
        </p>
        <Math block>{'T_{out} = 2\\,T_{in} \\quad\\Rightarrow\\quad f_{out} = \\frac{f_{in}}{2},\\qquad N = \\frac{T_{out}}{T_{in}} = 2'}</Math>
        <p>
          <b>Duty cycle</b>：q0 high 的時間是一個 <Math>{'T_{in}'}</Math>，low 也是一個 <Math>{'T_{in}'}</Math>，所以
        </p>
        <Math block>{'D = \\frac{t_{high}}{T_{out}} = \\frac{T_{in}}{2T_{in}} = 50\\%'}</Math>
        <Callout kind="note" title="注意：50% duty 與輸入 duty 無關">
          因為 q0 只在 rising edge 改變，輸入 clock 的 duty cycle 是 30% 還是 70% 都不影響輸出——這是 /2 常被拿來「整形」duty cycle 的原因。
        </Callout>
      </Section>

      <Section title="這個架構的 critical path" en="Critical path">
        <p>
          q0 在 edge k 改變之後，新的 d0 必須在 edge k+1 之前準備好。這條路徑就是：
        </p>
        <p className="mono">FF0.clk（edge k）→ tCQ → q0 → INV → d0 → FF0.D 的 setup（edge k+1）</p>
        <Callout kind="method" title="怎麼確認它是 critical path？">
          <ol style={{ margin: 0 }}>
            <li>
              <b>Launch point</b>：FF0，在 edge k 的 rising edge 把新值送出（launch）。
            </li>
            <li>
              <b>Combinational logic</b>：只有一個 inverter。
            </li>
            <li>
              <b>Capture point</b>：還是 FF0，在 edge k+1 抓 D。launch 與 capture 是同一個 flop，但是<b>不同的 edge</b>。
            </li>
            <li>
              <b>可用時間</b>：兩個 edge 之間 = 一個 <Math>{'T_{in}'}</Math>。
            </li>
          </ol>
        </Callout>
        <CriticalPathExplorer scenario={div2Timing} guided />
        <Callout kind="note" title="為什麼 reset 那條路徑的 removal slack 是紅色的 −3 ps">
          點選「rst_n → FF0（reset recovery / removal）」再切到 Hold 分頁，會看到 removal slack = 2 − 5 = <b>−3 ps</b>。這不是模型錯，而是<b>刻意保留</b>的結果：這個電路把 rst_n 直接接到 flop 的非同步 pin，
          釋放時機與 clk 毫無關係，所以 removal 檢查天生過不了——它告訴你的是「沒有同步的 reset 一定有風險」。修法不是把走線拉長，而是加 reset synchronizer；Lesson 8-1 會把它做出來，Lesson 7-3 案例 A 也有同一組數字的完整討論。
          這也是本課要你記住的區分：<b>recovery / removal 是 reset 的 async pin check，不是 Fmax path</b>。
        </Callout>
        <ModeContent level="engineer" title="Timing equation">
          <p>Setup check（資料要在 capture edge 之前 tsetup 就穩定）：</p>
          <Math block>{'T_{clk,min} \\ge t_{CQ,max} + t_{logic,max} + t_{setup} + t_{skew} + t_{jitter} + t_{margin}'}</Math>
          <Math block>{'F_{max} \\le \\frac{1}{T_{clk,min}}'}</Math>
          <p>
            變數定義：<Math>{'t_{CQ,max}'}</Math> = clock edge 到 Q 穩定的最大延遲；<Math>{'t_{logic,max}'}</Math> = inverter 最大延遲；<Math>{'t_{setup}'}</Math> = D 必須在 edge 前穩定的時間；<Math>{'t_{jitter}'}</Math> = 相鄰 edge 間隔的不確定量；<Math>{'t_{margin}'}</Math> = 設計裕度。單位皆為 ps。
          </p>
          <p>Hold check（資料不能在 capture edge 之後太快就變）：</p>
          <Math block>{'t_{CQ,min} + t_{logic,min} \\ge t_{hold} + t_{skew}'}</Math>
          <Callout kind="warning" title="skew 的正負不要死背">
            這裡的 <Math>{'t_{skew}'}</Math> 定義為 <b>capture clock 到達時間 − launch clock 到達時間</b>。capture edge 比 launch edge 晚到（skew &gt; 0）時，資料有更多時間到達（setup 變寬鬆），但也表示 launch 之後資料必須撐更久不變（hold 變嚴格）。與其記正負號，不如每次都畫出 launch edge 與 capture edge 的相對位置，問「資料是在哪個 edge 送出、哪個 edge 被抓」。在 /2 中 launch 與 capture 用同一條 clock 線，skew ≈ 0。
          </Callout>
        </ModeContent>
        <ModeContent level="deep" title="高速實作會遇到的事">
          <ul>
            <li>
              <b>Q̄ 直接接 D</b>：很多高速 /2 沒有獨立 inverter，直接用 flop 的 Q̄ 輸出接回 D。此時 logic delay ≈ 0，setup path 只剩 tCQ + tsetup，但 hold path 也只剩 tCQ,min——flop 內部必須保證 tCQ,min &gt; thold（一般 master-slave 結構天生滿足）。
            </li>
            <li>
              <b>CML latch 型 /2</b>：兩個 CML latch 串成 master-slave，每個 latch 在 clock 半週期內必須完成 regeneration。此時 Fmax 由 latch 的 regeneration time constant（gm/C）決定，而不是 gate-level tCQ + tsetup 的加法模型。
            </li>
            <li>
              <b>Pulse width</b>：輸入 clock 的 high / low 寬度各自要大於 master / slave latch 的最小 transparent 時間；輸入 duty 偏離 50% 太多會先撞到 pulse-width 限制，而不是 setup 限制。
            </li>
            <li>
              <b>Jitter</b>：/2 本身不放大輸入 jitter（每個 output edge 直接對應一個 input edge），但 tCQ 隨 PVT 與供電雜訊變化會加上自己的 jitter。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>把 Q 直接接 D（沒有反相）</b>：d0 = q0，state 永遠不變，輸出是常數，不是 /2。
            </li>
            <li>
              <b>把 inverter 放在 clock 路徑上</b>：那只是把觸發邊緣改成 falling edge，除頻比還是 2，但輸出 edge 對齊到輸入的 falling edge。
            </li>
            <li>
              <b>忘記 reset</b>：/2 從 0 或 1 開始都能正常工作（兩個 state 都合法），所以 /2 其實不需要 reset 也能除頻——但輸出的<b>相位</b>會不確定（差半個輸出週期）。多個 /2 並排時這會造成 phase ambiguity。
            </li>
            <li>
              <b>用 latch 取代 DFF</b>：latch 在 enable 期間 transparent，D = Q̄ 會在 enable 高電位時不停振盪（見 Lesson 0-2）。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="SystemVerilog（synthesizable）">
          <CodeBlock
            title="div2.sv"
            code={`
module div2 (
  input  logic clk,
  input  logic rst_n,     // async active-low reset
  output logic div_out
);
  logic q0;
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) q0 <= 1'b0;       // reset state: q0 = 0
    else        q0 <= ~q0;        // d0 = NOT q0
  end
  assign div_out = q0;
endmodule
`}
            note="每個 posedge clk：q0 ← ~q0。reset 只決定起始相位，不影響除頻比。"
          />
        </ModeContent>
      </Section>
    </>
  )
}

/** 練習：把 inverter 換成 XOR（另一輸入固定為 1），問使用者這還是 /2 嗎 */
const xorDiv2: Netlist = {
  id: 'xor-div2',
  name: 'XOR feedback',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'en', initial: 1, description: 'XOR 的另一個輸入' }],
  flops: [{ q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' }],
  gates: [{ out: 'd0', inputs: ['q0', 'en'], fn: (v) => xor(v.q0, v.en), delay: 12, label: 'XOR', kind: 'xor' }],
  stateOrder: ['q0'],
  output: 'q0',
  watch: ['d0'],
  equations: [{ target: 'd0', text: 'd0 = q0 XOR en', latex: 'd_0 = q_0 \\oplus en' }],
}
const xorSchematic: Schematic = {
  width: 380,
  height: 190,
  elements: [
    { id: 'clk', kind: 'port', x: 40, y: 92, text: 'clk', dir: 'in' },
    { id: 'en', kind: 'port', x: 250, y: 178, text: 'en', dir: 'in' },
    { id: 'ff0', kind: 'dff', x: 140, y: 40, label: 'FF0', edge: 'rising', signal: 'q0' },
    { id: 'xor', kind: 'xor', x: 250, y: 110, label: 'XOR' },
    { id: 'out', kind: 'port', x: 350, y: 60, text: 'div_out', dir: 'out' },
  ],
  wires: [
    { id: 'w_clk', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_q', from: 'ff0.q', to: 'out.p', signal: 'q0', kind: 'output' },
    { id: 'w_q_x', from: 'ff0.q', to: 'xor.in0', signal: 'q0', kind: 'feedback', points: [[222, 60], [222, 123]] },
    { id: 'w_en', from: 'en.p', to: 'xor.in1', signal: 'en', kind: 'control', points: [[236, 178], [236, 137]] },
    { id: 'w_d', from: 'xor.out', to: 'ff0.d', signal: 'd0', kind: 'feedback', points: [[320, 130], [320, 172], [120, 172], [120, 60]] },
  ],
}
function ExerciseComponent() {
  return <DividerSimPanel netlist={xorDiv2} schematic={xorSchematic} title="練習電路" showEquations={false} compact />
}

const lesson: LessonDef = {
  id: 'm1-l1-div2',
  module: 1,
  order: 1,
  title: 'DFF Divide-by-2',
  titleEn: 'The DFF divide-by-2',
  summary: '一個 DFF 加一個 inverter：逐 edge 看 state 如何 toggle，推導 divide ratio 與 duty cycle，並找出第一條 critical path。',
  goals: [
    '看懂 D = Q̄ 為什麼會讓 Q 每個 edge toggle。',
    '從 edge-by-edge 的 state 序列推導出 Tout = 2Tin。',
    '用 launch / capture 的觀點找出 Q → INV → D 這條 critical path，並算出 Tclk,min。',
    '分辨 setup check 與 hold check 各自在問什麼。',
  ],
  readingMinutes: 25,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'single',
      prompt: '/2 divider 的 output rising edge 之間相隔多少個輸入 clock 週期？',
      options: ['1 個', '2 個', '4 個', '取決於輸入 duty cycle'],
      answer: 1,
      explanation: 'q0 每個 rising edge toggle 一次，要兩個 edge 才回到同一個值，所以 output 週期 = 2 Tin。',
    },
    {
      id: 'q2',
      type: 'state',
      prompt: '從 reset（q0 = 0）開始，經過 5 個 rising edge 之後 q0 是多少？',
      answer: '1',
      width: 1,
      bitNames: ['q0'],
      explanation: '0 → 1 → 0 → 1 → 0 → 1：奇數個 edge 之後 q0 = 1。',
    },
    {
      id: 'q3',
      type: 'single',
      prompt: '/2 divider 的 critical path 是哪一條？',
      options: ['clk 走線到 FF0 的 clock pin', 'FF0.Q → inverter → FF0.D', 'FF0.Q → div_out 輸出走線', 'rst_n → FF0'],
      answer: 1,
      explanation: '只有 Q → INV → D 有 launch（edge k）與 capture（edge k+1），並且必須在一個 Tclk 內完成。clock 走線與 output 走線都沒有 capture flop 的 setup 要求；reset 是 recovery/removal 檢查。',
    },
    {
      id: 'q4',
      type: 'numeric',
      prompt: '若 tCQ,max = 8 ps、tINV,max = 6 ps、tsetup = 7 ps、jitter = 2 ps、margin = 2 ps、skew = 0，Tclk,min 是多少 ps？',
      answer: 25,
      unit: 'ps',
      explanation: 'Tclk,min = 8 + 6 + 7 + 2 + 2 = 25 ps，對應 Fmax = 40 GHz。',
    },
    {
      id: 'q5',
      type: 'multiple',
      prompt: '下列哪些敘述正確？',
      options: ['/2 的輸出 duty cycle 一定是 50%，與輸入 duty 無關', '/2 需要 reset 才能除頻', 'hold check 與 clock period 無關', '把 inverter 移到 clock 路徑上會讓除頻比變成 4'],
      answers: [0, 2],
      explanation: '輸出只在 rising edge 翻轉，所以 duty 是 50%；hold 檢查的是同一個 edge 後資料是否太快改變，與 period 無關。/2 沒有 reset 也能工作（只是相位不確定）；把 inverter 移到 clock 上只是改成 falling-edge 觸發。',
    },
    {
      id: 'q6',
      type: 'single',
      prompt: '在 /2 divider 中，launch point 與 capture point 分別是？',
      options: ['launch = FF0（edge k），capture = FF0（edge k+1）', 'launch = inverter，capture = FF0', 'launch = FF0，capture = div_out', 'launch = clk port，capture = FF0'],
      answer: 0,
      explanation: '同一個 flop 既是 launch 也是 capture，但用的是相鄰兩個 edge；可用時間是一個 Tclk。',
    },
  ],
  exercise: {
    title: 'XOR feedback 的 divider',
    prompt: (
      <p>
        下面的電路把 inverter 換成了 XOR，另一個輸入是 en。先不要按模擬，自己推一次：en = 1 時 d0 = ？state 序列是什麼？除頻比是多少？en = 0 時又如何？然後再用模擬器驗證。
      </p>
    ),
    Component: ExerciseComponent,
    checklist: ['寫出 d0 的 next-state equation', 'en = 1 與 en = 0 各列出 state 序列', '指出 critical path 多了哪一段 delay', '這個電路的 en 最晚要在何時穩定？'],
    answer: (
      <>
        <p>
          d0 = q0 XOR en。en = 1 時 d0 = NOT q0，與 /2 完全相同（除頻比 2）。en = 0 時 d0 = q0，state 永遠不變，輸出停住（相當於 gated）。所以這是一個「可暫停的 /2」。
        </p>
        <p>
          critical path 變成 FF0.Q → XOR → FF0.D，XOR 比 inverter 慢（兩級 transistor stack、較大 input capacitance），Fmax 下降。en 屬於 control path：它必須在下一個 rising edge 之前 tsetup + tXOR 就穩定，否則那個 edge 抓到的 d0 可能是舊的、新的、或 metastable。
        </p>
      </>
    ),
  },
}
export default lesson
