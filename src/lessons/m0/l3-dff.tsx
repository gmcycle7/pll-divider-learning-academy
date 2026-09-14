import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { SetupHoldDemo } from '@/components/timing/SetupHoldDemo'
import { dffFollow, tff } from '@/models/divider/examples'
import type { Schematic } from '@/components/circuit/schematic'

const dffSchematic: Schematic = {
  width: 320,
  height: 170,
  elements: [
    { id: 'd', kind: 'port', x: 50, y: 60, text: 'd_in', dir: 'in' },
    { id: 'clk', kind: 'port', x: 50, y: 92, text: 'clk', dir: 'in' },
    { id: 'ff', kind: 'dff', x: 130, y: 40, label: 'FF', edge: 'rising', signal: 'q' },
    { id: 'q', kind: 'port', x: 280, y: 60, text: 'q', dir: 'out' },
  ],
  wires: [
    { id: 'w_d', from: 'd.p', to: 'ff.d', signal: 'd_in', kind: 'control' },
    { id: 'w_clk', from: 'clk.p', to: 'ff.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_q', from: 'ff.q', to: 'q.p', signal: 'q', kind: 'output' },
  ],
}

const tffSchematic: Schematic = {
  width: 380,
  height: 200,
  elements: [
    { id: 't', kind: 'port', x: 60, y: 150, text: 't', dir: 'in' },
    { id: 'clk', kind: 'port', x: 60, y: 92, text: 'clk', dir: 'in' },
    { id: 'xor', kind: 'xor', x: 70, y: 40, label: 'XOR' },
    { id: 'ff', kind: 'dff', x: 190, y: 40, label: 'FF', edge: 'rising', signal: 'q' },
    { id: 'q', kind: 'port', x: 340, y: 60, text: 'q', dir: 'out' },
  ],
  wires: [
    { id: 'w_t', from: 't.p', to: 'xor.in1', signal: 't', kind: 'control', points: [[58, 150], [58, 66]] },
    { id: 'w_x', from: 'xor.out', to: 'ff.d', signal: 'd', kind: 'data' },
    { id: 'w_clk', from: 'clk.p', to: 'ff.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_q', from: 'ff.q', to: 'q.p', signal: 'q', kind: 'output' },
    { id: 'w_fb', from: 'ff.q', to: 'xor.in0', signal: 'q', kind: 'feedback', points: [[270, 60], [270, 20], [50, 20], [50, 53]] },
  ],
}

function Content() {
  return (
    <>
      <Section title="DFF 在 clock edge 發生什麼" en="What a DFF does at the clock edge">
        <p>
          <Term zh="D 型正反器" en="D flip-flop" /> 只做一件事：<b>在 clock 的 rising edge 那一瞬間，把 D 的值複製到 Q</b>。其他時間，不管 D 怎麼變，Q 都不動。
        </p>
        <p>
          下面的模擬器讓你自己切換 d_in，再按「下一個 Clock Edge」。注意 q 只有在 edge 時才會跟上 d_in。
        </p>
        <DividerSimPanel netlist={dffFollow} schematic={dffSchematic} title="DFF：q 只在 edge 時抓 d_in" showEquations={false} showMeasure={false} showTable={false} showDelayMode />
        <Callout kind="idea">
          可以把 DFF 想成一台<b>相機</b>：D 是鏡頭前的景象，clock edge 是按快門，Q 是洗出來的照片。快門沒按，景象再怎麼變，照片不會變。
        </Callout>
      </Section>

      <Section title="D 不是立刻出現在 Q：clock-to-Q delay" en="Clock-to-Q delay">
        <p>
          按下快門到照片洗出來需要時間。DFF 從 clock edge 到 Q 穩定為新值，需要 <Term zh="時脈到輸出延遲" en="clock-to-Q delay, tCQ" />。把上面模擬器切到「實際 delay」模式，波形上 q 會比 edge 晚 tCQ 才改變。
        </p>
        <p>
          tCQ 看起來小（幾 ps 到幾十 ps），但在高速 divider 裡它常常是 timing budget 裡最大的一塊，因為它每個 cycle 都會出現一次。
        </p>
      </Section>

      <Section title="Setup time 與 hold time" en="Setup and hold">
        <p>
          相機需要景象在按快門前就停下來，而且按下去之後也要維持一小段時間，不然照片會糊。DFF 的兩個要求：
        </p>
        <ul>
          <li>
            <Term zh="建立時間" en="setup time, tsetup" />：D 必須在 clock edge 之前至少 tsetup 就穩定。
          </li>
          <li>
            <Term zh="保持時間" en="hold time, thold" />：D 在 clock edge 之後至少 thold 內不能改變。
          </li>
        </ul>
        <p>拖曳下面的滑桿，改變 D 轉換的時間點，觀察 Q 的結果：</p>
        <SetupHoldDemo />
        <Steps
          items={[
            <>D 在 setup window 之前改變 → edge 抓到<b>新值</b>。</>,
            <>D 在 hold window 之後才改變 → 這個 edge 抓到<b>舊值</b>，新值要等下一個 edge。</>,
            <>D 在 setup/hold window 裡改變 → 結果<b>不確定</b>：可能新、可能舊、可能很久才決定（metastability）。</>,
          ]}
        />
      </Section>

      <Section title="Metastability 的直覺" en="Metastability">
        <p>
          DFF 內部是兩個 inverter 互相咬住的 latch。抓資料時，它必須把輸入推到「0 側」或「1 側」其中一邊。如果 D 剛好在 edge 附近變化，latch 被推到正中間，像一枝筆立在桌上：理論上會倒向某一邊，但要多久沒人知道。
        </p>
        <Callout kind="warning" title="為什麼 divider 特別在意這件事">
          divider 的 D 幾乎都是從自己的 Q 經過 logic 算回來的。只要 tCQ + tlogic 太接近一個 clock 週期，D 就會在下一個 edge 的 setup window 裡才變——這就是 Lesson 1-1 之後每一課都要算的 <Term zh="臨界路徑" en="critical path" />。
        </Callout>
        <ModeContent level="deep" title="Regeneration time constant">
          <p>
            latch 從 metastable 點離開的速度由 <Math>{'\\tau = C / g_m'}</Math> 決定，輸出偏離中點的幅度隨 <Math>{'e^{t/\\tau}'}</Math> 成長。給定可接受的失敗率，需要的 resolution time 是 <Math>{'t_r = \\tau \\ln(\\Delta V_{final} / \\Delta V_{initial})'}</Math>。這就是為什麼高速 CML flop 追求大 <Math>{'g_m'}</Math>、小寄生電容：不只是為了 tCQ，也是為了縮短 metastability window。
          </p>
        </ModeContent>
      </Section>

      <Section title="D = Q̄ 為什麼可以形成 toggle" en="Why D = Q̄ toggles">
        <p>
          把 Q 反相接回 D，每個 edge 抓到的都是「現在 Q 的相反」。所以 Q 每個 edge 翻一次。這就是下一課 /2 divider 的全部秘密。
        </p>
        <p>
          先看一個更一般的版本：<Term zh="T 型正反器" en="T flip-flop" />。d = q XOR t：t = 1 時 d = NOT q（toggle），t = 0 時 d = q（hold）。
        </p>
        <DividerSimPanel netlist={tff} schematic={tffSchematic} title="T flip-flop：t=1 toggle、t=0 hold" showMeasure={false} showDelayMode showEdgeTimes />
        <Callout kind="method" title="分析任何 flop feedback 的固定步驟">
          <ol style={{ margin: 0 }}>
            <li>寫出 D 是 Q 與 input 的什麼函數（next-state equation）。</li>
            <li>把現在的 Q 代進去，算出 D。</li>
            <li>edge 來：Q ← D。</li>
            <li>回到步驟 2。</li>
          </ol>
        </Callout>
        <ModeContent level="engineer" title="State equation 與 RTL 的對應">
          <p>
            把上面四個步驟寫成式子。設 <Math>{'q[k]'}</Math> 是第 <Math>{'k'}</Math> 個 clock edge 之後的 state，<Math>{'t'}</Math> 是 T 輸入：
          </p>
          <Math block>{'d[k] = q[k] \\oplus t,\\qquad q[k+1] = d[k] = q[k] \\oplus t'}</Math>
          <p>
            變數定義：<Math>{'q, d, t \\in \\{0, 1\\}'}</Math> 為無單位的邏輯值；<Math>{'k'}</Math> 為 edge 序號（無單位）。
            <Math>{'t = 1'}</Math> 時 <Math>{'q[k+1] = \\overline{q[k]}'}</Math>（toggle），<Math>{'t = 0'}</Math> 時 <Math>{'q[k+1] = q[k]'}</Math>（hold）。
            這個式子就是下一課 /2 divider 的 next-state equation：把 <Math>{'t'}</Math> 固定成 1 即可。
          </p>
          <p>
            RTL 與電路是一對一的：<code>always_ff @(posedge clk)</code> 就是那顆 flop，<code>{'<='}</code> 右邊的運算式就是 D 前面的 combinational logic，
            <code>if (!rst_n)</code> 分支就是 reset state。
          </p>
          <CodeBlock
            title="tff.sv（synthesizable）"
            code={`
module tff (
  input  logic clk,
  input  logic rst_n,   // async active-low reset
  input  logic t,       // 1: toggle, 0: hold
  output logic q
);
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) q <= 1'b0;      // reset state
    else        q <= q ^ t;     // d = q XOR t
  end
endmodule
`}
            note="把 t 接成常數 1 就得到 /2 divider；Lesson 1-1 會逐 edge 驗證它。"
          />
          <p>
            時序上，這顆 flop 要能在一個 clock 週期內完成「Q 出來 → 經過 XOR → 回到 D」，也就是
          </p>
          <Math block>{'T_{clk} \\ge t_{CQ,max} + t_{XOR,max} + t_{setup}'}</Math>
          <p>
            其中各項單位皆為 ps。這條式子是 Module 7 要展開的 <Term zh="臨界路徑" en="critical path" /> 分析的最簡形式；Lesson 1-1 會用實際數字算一次。
          </p>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>以為 Q 會跟著 D 變</b>：那是 <Term zh="鎖存器" en="latch" /> 在 enable 期間的行為，不是 edge-triggered flop。flop 只在觸發 edge 那一瞬間取樣。
            </li>
            <li>
              <b>把 tCQ 當成「可以忽略的小數字」</b>：在高速 divider 裡它每個 cycle 都出現一次，常常是 timing budget 裡最大的一塊。
            </li>
            <li>
              <b>把 setup violation 與 hold violation 搞混</b>：setup 是資料<b>來不及</b>在 edge 前穩定，可以靠降頻解決；hold 是資料在 edge 後<b>太早</b>改變，與 clock 週期無關，降頻救不了。
            </li>
            <li>
              <b>以為 metastability 只是「抓到錯的值」</b>：抓到舊值或新值都還算確定的結果。metastability 是 Q 停在中間電位、要多久才決定不確定——下游看到的可能是非 0 非 1 的電位。
            </li>
            <li>
              <b>用 D = Q（沒有反相）想做 toggle</b>：state 永遠不變，輸出是常數。必須是 D = Q̄。
            </li>
          </ul>
        </Callout>
      </Section>
    </>
  )
}

const lesson: LessonDef = {
  id: 'm0-l3-dff',
  module: 0,
  order: 3,
  title: 'DFF、TFF 與 Clock-to-Q',
  titleEn: 'DFF, TFF and clock-to-Q',
  summary: '從零解釋 DFF 在 clock edge 做什麼、tCQ、setup、hold、metastability，以及 D = Q̄ 為什麼會 toggle。',
  goals: ['說出 DFF 在 rising edge 那一瞬間做的唯一一件事。', '解釋 tCQ、tsetup、thold 三個時間各自限制什麼。', '用相機／筆立在桌上的直覺理解 metastability。', '看懂 d = q XOR t 的 T flip-flop，為 /2 做準備。'],
  readingMinutes: 20,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'single',
      prompt: 'DFF 的 Q 在什麼時候會改變？',
      options: ['D 改變時馬上改變', '只在 clock 的觸發 edge（加上 tCQ）之後', 'clock 為 high 的整段期間', 'reset 釋放時'],
      answer: 1,
      explanation: 'edge-triggered：只有在觸發 edge 才把 D 抓進 Q，且 Q 要再等 tCQ 才穩定。',
    },
    {
      id: 'q2',
      type: 'single',
      prompt: 'D 在 clock edge 之後 2 ps 就改變，而 thold = 5 ps。這是哪一種問題？',
      options: ['setup violation', 'hold violation', 'pulse-width violation', '沒有問題'],
      answer: 1,
      explanation: 'D 在 edge 後太快改變、落在 hold window 內，是 hold violation。setup violation 是 edge 前來不及；pulse-width 是 clock 本身太窄。',
    },
    {
      id: 'q3',
      type: 'state',
      prompt: 'T flip-flop 從 q = 0 開始，t 固定為 1，經過 3 個 edge 之後 q 是？',
      answer: '1',
      width: 1,
      bitNames: ['q'],
      explanation: 't=1 每個 edge toggle：0 → 1 → 0 → 1。',
    },
    {
      id: 'q4',
      type: 'multiple',
      prompt: '下列哪些會讓 DFF 進入 metastable 的機率增加？',
      options: ['D 的轉換時間更接近 clock edge', 'latch 的 gm/C 更小（regeneration 更慢）', 'clock 週期更長', 'D 提早很久就穩定'],
      answers: [0, 1],
      explanation: '轉換越接近 edge、regeneration 越慢，越容易停在中點太久。clock 週期長與 D 提早穩定反而是安全的。',
    },
  ],
  exercise: {
    title: '找出 flop 的三個時間',
    prompt: (
      <p>
        把下面這個 T flip-flop 模擬器的「Delay 模式」從<b>理想（zero delay）</b>切到<b>實際（tCQ / gate delay）</b>——理想模式下所有訊號都貼齊 edge，量不到任何延遲。切過去之後，從波形上標出的 edge 時間量測：(1) clock edge 到 q 改變的時間（t<sub>CQ</sub>）；(2) q 改變之後 d 還要多久才跟著更新。再把 t 在某個 edge 前才改成 0，觀察那個 edge 抓到的是 toggle 還是 hold。
      </p>
    ),
    Component: () => <DividerSimPanel netlist={tff} schematic={tffSchematic} title="練習：切到「實際 delay」量 tCQ" showMeasure={false} showDelayMode showEdgeTimes compact />,
    checklist: ['切到「實際 delay」模式（理想模式量不到 tCQ）', '量到 tCQ ≈ 8 ps（例如 clk edge 在 100 ps，q 在 108 ps 才改變）', '看到 d 在 edge 後 tCQ + tXOR = 20 ps 才更新', '說出 t 最晚必須在 edge 前多久穩定'],
    answer: (
      <>
        <p>
          T = 100 ps 時，clk 的 edge 在 100、200、300… ps；實際 delay 模式下 <b>q 在 108、208、308… ps 改變</b>，所以 t<sub>CQ</sub> = 8 ps（模型設定值）。d = q XOR t 要等 q 穩定後再過一個 XOR 的 12 ps，所以 <b>d 在 120、220、320… ps 更新</b>，相對 edge 是 8 + 12 = 20 ps。
        </p>
        <p>
          t 是 XOR 的另一個輸入，所以 t 必須在 edge 前 t<sub>XOR</sub> + t<sub>setup</sub> 就穩定，d 才來得及算完並滿足 FF 的 setup；模擬器把 input 放在 edge 前 0.35T = 35 ps 生效，遠大於 12 + t<sub>setup</sub>，所以每次都穩穩抓到。
        </p>
      </>
    ),
  },
}
export default lesson
