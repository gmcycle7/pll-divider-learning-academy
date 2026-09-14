import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { StateDiagram, graphToDiagram } from '@/components/circuit/StateDiagram'
import type { SchematicHighlight } from '@/components/circuit/schematic'
import { buildStateGraph } from '@/models/divider/analysis'
import { analyzeSetup } from '@/models/timing/sta'
import { fmtNum } from '@/utils/format'
import { modeAndCounter, progDiv34, progDiv34Sel1 } from './method-models'
import { modeAndSchematic, progDiv34Highlights, progDiv34Schematic } from './method-schematics'
import { CORNERS, CORNER_PATHS, cornerCritical, cornerDelay, gateCountTrapTiming, modeAndTiming, progDiv34ExerciseTiming, progDiv34Timing } from './method-timing'
import { CP_STEPS, CriticalPathChecklist, EdgeEventTable, PathBudgetTable, SensitizationTable, TryFirst } from './MethodWidgets'

/* ------------------------------------------------------------------ */
/* 課文用的固定數字（全部來自 method-timing.ts，與測試一致）                  */
/* ------------------------------------------------------------------ */
const ENV = progDiv34Timing.env // Tclk 55、skew 0、jitter 3、margin 2
const SETUP = 7
const REQUIRED = ENV.skew + ENV.period - SETUP - ENV.jitter - ENV.margin // 43
const pathById = (id: string) => progDiv34Timing.paths.find((p) => p.id === id)!
const arrivalOf = (id: string) => analyzeSetup(pathById(id), ENV).arrival
const slackOf = (id: string) => analyzeSetup(pathById(id), ENV).slack
const tclkMinOf = (id: string) => analyzeSetup(pathById(id), ENV).tclkMin

/** Step 2 / Step 3 的高亮：launch points 與 capture points */
const launchHighlight: SchematicHighlight = {
  style: 'info',
  elements: ['ff0', 'ff1', 'ff2'],
  wires: ['w_sel'],
  tags: [
    { elementOrWire: 'ff0', text: 'launch：q0' },
    { elementOrWire: 'ff1', text: 'launch：q1' },
    { elementOrWire: 'ff2', text: 'launch：q2' },
    { elementOrWire: 'sel', text: 'launch：外部 mode register' },
  ],
}
const captureHighlight: SchematicHighlight = {
  style: 'setup',
  wires: ['w_inv_d0', 'w_mux_d1', 'w_nor_d2', 'w_out'],
  tags: [
    { elementOrWire: 'w_inv_d0', text: 'capture：FF0.D' },
    { elementOrWire: 'w_mux_d1', text: 'capture：FF1.D' },
    { elementOrWire: 'w_nor_d2', text: 'capture：FF2.D' },
    { elementOrWire: 'out', text: 'output：沒有 capture flop' },
  ],
}

function ModeStateDiagrams() {
  const g0 = buildStateGraph(progDiv34, { sel: 0 })
  const g1 = buildStateGraph(progDiv34, { sel: 1 })
  return (
    <div className="two-col">
      <StateDiagram {...graphToDiagram(g0, 'clk↑')} title="sel = 0：主循環 000 → 101 → 011（3 個 state）" width={330} height={300} />
      <StateDiagram {...graphToDiagram(g1, 'clk↑')} title="sel = 1：主循環 000 → 101 → 011 → 010（4 個 state）" width={330} height={300} />
    </div>
  )
}

function CornerTable() {
  return (
    <CompareTable
      head={['corner', ...CORNER_PATHS.map((p) => p.name), '哪條是 critical', '為什麼']}
      rows={CORNERS.map((c) => {
        const crit = cornerCritical(CORNER_PATHS, c)
        return [
          c.label,
          ...CORNER_PATHS.map((p) => (
            <span key={p.id} className={crit.id === p.id ? 'slack-bad' : ''}>
              {fmtNum(cornerDelay(p, c), 1)} ps
            </span>
          )),
          <b key="crit">{crit.id}</b>,
          c.note,
        ]
      })}
    />
  )
}

function Content() {
  return (
    <>
      <Section title="先用直覺想" en="Intuition">
        <p>
          上一課（7-1）的電路只有一條 path，所以「critical path 在哪」根本不用找。真實的 divider 隨便就有七、八條 launch → capture 的路徑，還有 mode 控制訊號、reset、輸出走線混在裡面。
          很多人第一次看陌生電路，會直接用眼睛挑一條「看起來最長」的線說：這就是 critical path。這一課要證明：<b>目測幾乎一定會錯</b>，然後給你一套每次都用同一順序做的十步流程。
        </p>
        <p>
          想像機場安檢：你想知道哪一個通道會讓你最晚登機。看排隊人數（gate 數）沒用——三個小行李的人可能比一個帶了四件行李、還要開箱檢查的人快。
          有些通道今天根本沒開（mode 不同，path 沒被 sensitize）。而且同一條通道，早上和晚上、老手和新手（PVT corner）速度也不一樣。
          真正的做法是：<b>把每一個通道都列出來，逐一算它們的處理時間，再挑最慢的</b>。
        </p>
        <Callout kind="idea">
          <Term zh="臨界路徑" en="critical path" /> 是「<b>在目前的 mode 與 corner 下會被 sensitize 的 launch → capture 路徑中，slack 最小的那一條</b>」。這句話裡每一個條件都對應到流程裡的一步：launch / capture（Step 2、3）、路徑（Step 4）、sensitize（Step 5）、slack（Step 6～8）。少做一步，答案就可能是錯的。
        </Callout>
      </Section>

      <Section title="為什麼不能只靠目測：三個反例先看數字" en="Why eyeballing fails">
        <p>細節後面每一步都會回來講，這裡先把三個數字放在你眼前：</p>
        <CompareTable
          head={['目測的直覺', '反例', '數字', '流程裡的哪一步會抓到']}
          rows={[
            ['gate 越多越慢', '3 個 inverter 串聯 vs 1 個 4-input NAND（fanout 4）', '3 × 8 = 24 ps　vs　1 × 30 = 30 ps：一個 gate 的比較慢', 'Step 6：算 delay，不是數 gate'],
            ['圖上畫出來的線都算', 'MUX 的 in0 那一條在 sel = 1 時', 'in0 那條 40 ps、in1 那條 22 ps；sel = 1 時 40 ps 那條完全不影響 Fmax', 'Step 5：sensitization'],
            ['critical path 是電路的固定屬性', '同一顆晶片換 corner', 'TT：Path G 40 ps ＞ Path W 38 ps；FF-hot：Path G 34 ps ＜ Path W 41.3 ps，critical 換人', 'Step 6 要在每個 corner 重做'],
          ]}
        />
      </Section>

      <Section title="十步流程" en="The ten-step procedure">
        <p>
          下面這十步是固定順序。前四步是「<b>找</b>」（結構），第五步是「<b>篩</b>」（功能），六到八步是「<b>算</b>」（setup），九、十步是「<b>另外檢查</b>」（hold、pulse width、reset）。先看一遍，再往下用一個陌生電路把它走完。
        </p>
        <Steps
          items={CP_STEPS.map((s) => (
            <>
              <b>{s.title}</b>
              <span className="muted small">（{s.en}）</span>
              <div className="small">
                產出：{s.deliverable}
              </div>
            </>
          ))}
        />
        <Callout kind="method" title="這張 checklist 可以重複使用">
          下面的 checklist 會記住你的勾選（存在瀏覽器裡）。之後 Module 7-3 的六個案例、或你自己的電路，都用同一張表走一次。
        </Callout>
        <CriticalPathChecklist />
      </Section>

      <Section title="陌生電路登場" en="An unfamiliar circuit">
        <p>
          這是一個你沒看過的電路：三個 DFF、一個 inverter、一個 AND、一個 2:1 MUX、一個 NOR，還有一個控制輸入 <span className="mono">sel</span>。<b>先不要問它是除幾</b>——真正陌生的電路你也不會事先知道功能。我們照流程來。
        </p>
        <LogicDiagram schematic={progDiv34Schematic} showValues={false} />
        <p className="small muted">
          數字約定（本課全部用 ps）：t<sub>CQ</sub> = 5（min）/ 8（max）；INV 4 / 7；AND 7 / 11；MUX data→out 9 / 14、sel→out 10 / 16；NOR 8 / 12；t<sub>setup</sub> = 7；t<sub>hold</sub> = 3；T<sub>clk</sub> = {fmtNum(ENV.period)}、skew {fmtNum(ENV.skew)}、jitter {fmtNum(ENV.jitter)}、margin {fmtNum(ENV.margin)}。
        </p>

        <TryFirst step="Step 1" ask="把圖上所有 sequential element 圈出來。每一個寫下：名稱、clock 是誰、哪個 edge 觸發、有沒有 async reset。有 latch 嗎？MUX 算不算？">
          <ul>
            <li>
              <b>FF0</b>（Q = q0）、<b>FF1</b>（Q = q1）、<b>FF2</b>（Q = q2）：三個都是 rising-edge DFF，clock 都是同一條 <span className="mono">clk</span>，都有 active-low async reset <span className="mono">rst_n</span>（reset 值 0）。
            </li>
            <li>沒有 latch，沒有用別的 flop 的 Q 當 clock 的 ripple 級——所以它是一個<b>完全同步</b>的電路，三個 flop 之間的 skew 可以先假設 0。</li>
            <li>
              MUX、AND、NOR、INV 都是<b>組合邏輯</b>，沒有記憶，不算。sel 是一個 primary input，它本身不是 sequential element，但它「背後」一定有一個看不見的 flop（別的 block 裡的 mode register）——這件事 Step 2 會用到。
            </li>
          </ul>
        </TryFirst>

        <TryFirst step="Step 2" ask="列出所有 launch point：哪些點會在某個 clock edge「送出」新值？別忘了從外面進來的訊號。">
          <LogicDiagram schematic={progDiv34Schematic} highlights={[launchHighlight]} showValues={false} showLegend={false} />
          <ul>
            <li>
              <b>FF0.Q（q0）、FF1.Q（q1）、FF2.Q（q2）</b>：每個 rising edge 後 t<sub>CQ</sub> 送出新值。
            </li>
            <li>
              <b>sel</b>：從外部 mode register 出來。它的 launch flop 不在這張圖上，所以我們用 <Term zh="輸入延遲" en="input delay" />（假設 12 / 20 ps）代替看不見的那段。
            </li>
            <li>
              <b>rst_n</b>：async 訊號，它不是 data launch，但釋放（de-assert）的那一刻仍然要相對 clock edge 檢查（Step 10 的 recovery / removal）。
            </li>
          </ul>
        </TryFirst>

        <TryFirst step="Step 3" ask="列出所有 capture point：哪些點會在某個 clock edge「抓」值？div_out 算嗎？">
          <LogicDiagram schematic={progDiv34Schematic} highlights={[captureHighlight]} showValues={false} showLegend={false} />
          <ul>
            <li>
              <b>FF0.D（d0）、FF1.D（d1）、FF2.D（d2）</b>：三個 D pin，各自在下一個 rising edge 之前 t<sub>setup</sub> 必須穩定。
            </li>
            <li>
              <b>FF0/1/2 的 rstn pin</b>：async pin 也是一種 capture（recovery / removal check 的對象）。
            </li>
            <li>
              <b>div_out 不是</b>：它是 output port，後面接什麼我們不知道。沒有下一級的 t<sub>setup</sub> 與 clock，就算不出 slack——它只是 <Term zh="輸出延遲" en="output latency" />（t<sub>CQ</sub> + 走線 = 8 + 3 = 11 ps）。等到知道下一級是誰，它才會變成 interface path。
            </li>
          </ul>
        </TryFirst>

        <TryFirst step="Step 4" ask="對每一個 capture point，往回追它的 combinational cone：有哪些 launch point 能到達它？經過哪些 gate？把每一條 launch → capture 寫成一列。提示：同一個 gate 有幾個輸入來自不同 launch point，就有幾條 path。">
          <CompareTable
            head={['path', 'launch', '經過', 'capture', '備註']}
            rows={[
              ['p1', 'FF1.Q', 'INV', 'FF0.D', 'd0 = NOT q1；與 sel 無關'],
              ['p2', 'FF1.Q', 'INV → AND → MUX(in0)', 'FF1.D', 'launch 與 capture 是同一個 flop（edge k → edge k+1）'],
              ['p3', 'FF0.Q', 'AND → MUX(in0)', 'FF1.D', '同一個 AND 的另一個輸入'],
              ['p4', 'FF0.Q', 'MUX(in1)', 'FF1.D', 'q0 直通 MUX 的 in1'],
              ['p5a', 'FF1.Q', 'NOR', 'FF2.D', ''],
              ['p5b', 'FF0.Q', 'NOR', 'FF2.D', '同一個 NOR，另一個 launch point'],
              ['p6', 'sel（外部）', 'MUX(sel)', 'FF1.D', 'interface path：launch 在別的 block'],
              ['rst', 'rst_n', '走線', 'FF0/1/2.rstn', 'recovery / removal（Step 10）'],
              ['out', 'FF2.Q', '走線', 'div_out', 'output latency，不算 slack'],
            ]}
          />
          <p className="small">
            七條 register-to-register / interface path（p1～p6，其中 p5 有兩條）。<b>這一步的重點是窮舉，不要現在就判斷誰最慢。</b>常見錯誤是只寫「最長的那條 p2」，然後 Step 5 就沒東西可篩了。
          </p>
        </TryFirst>
      </Section>

      <Section title="Step 5 之前：先弄懂它在做什麼" en="Before Step 5: understand the function">
        <p>
          Step 5 要判斷「哪些 path 會被 sensitize」，這需要知道電路的功能。所以現在才來問：它是除幾？照 Lesson 0-3 的四個步驟——寫 next-state equation、代入現在的 state、edge 來、重複——自己先推 sel = 0 的前三個 edge，再按模擬器對答案。
        </p>
        <Math block>{'d_0 = \\overline{q_1},\\qquad a = q_0\\cdot\\overline{q_1},\\qquad d_1 = sel\\;?\\;q_0 : a,\\qquad d_2 = \\overline{q_1 + q_0},\\qquad div\\_out = q_2'}</Math>
        <DividerSimPanel netlist={progDiv34} schematic={progDiv34Schematic} title="Programmable divider：先 sel = 0，再切 sel = 1" showDelayMode />
        <Steps
          items={[
            <>
              <b>Reset</b>：q2 q1 q0 = 000。組合邏輯馬上算好：d0 = NOT 0 = 1；a = 0 · 1 = 0；sel = 0 所以 d1 = a = 0；d2 = NOR(0, 0) = 1。三個 D 等在 pin 前：d2 d1 d0 = 1 0 1。
            </>,
            <>
              <b>Edge 1</b>：三個 flop 同時抓 → q2 q1 q0 = <b>101</b>。div_out = q2 = 1。新的 comb：d0 = NOT 0 = 1；a = 1 · 1 = 1；d1 = a = 1；d2 = NOR(0, 1) = 0。
            </>,
            <>
              <b>Edge 2</b>：抓 d2 d1 d0 = 0 1 1 → <b>011</b>。div_out = 0。comb：d0 = NOT 1 = 0；a = 1 · 0 = 0；d1 = 0；d2 = NOR(1, 1) = 0。
            </>,
            <>
              <b>Edge 3</b>：抓 0 0 0 → <b>000</b>。回到 reset state。<b>3 個 edge 一圈</b>：000 → 101 → 011 → 000 …；div_out 在 state 101 那一個 cycle 是 1，其他兩個 cycle 是 0。
            </>,
            <>
              <b>切到 sel = 1 再跑一次</b>：前兩步一樣（d1 = q0 剛好和 a 相同），但在 state 011 時 d1 = q0 = 1（而不是 a = 0），所以 edge 3 之後是 <b>010</b>，edge 4 才回到 000：<b>4 個 edge 一圈</b>。
            </>,
          ]}
        />
        <ModeStateDiagrams />
        <p className="small muted">兩種 mode 都沒有 lock-up：unused state（001、100、110、111，以及 sel = 0 時的 010）都在一個 edge 內回到主循環。</p>
        <Callout kind="formula" title="Divide ratio 與 duty cycle">
          <p>
            設輸入 clock 週期為 <Math>{'T_{in}'}</Math>（ps），主循環有 <Math>{'N'}</Math> 個 state（每個 state 停留一個 <Math>{'T_{in}'}</Math>），div_out 只在其中一個 state 為 1：
          </p>
          <Math block>{'T_{out} = N\\,T_{in},\\qquad \\frac{f_{out}}{f_{in}} = \\frac{1}{N},\\qquad D = \\frac{t_{high}}{T_{out}} = \\frac{1\\cdot T_{in}}{N\\,T_{in}} = \\frac{1}{N}'}</Math>
          <p>
            sel = 0：<Math>{'N = 3'}</Math>，/3，duty 1/3；sel = 1：<Math>{'N = 4'}</Math>，/4，duty 1/4。模擬器的量測（rising edge 間隔 3T / 4T、high 一個 T）與這裡一致。注意 /3 的 duty 不是 50%——這個電路的輸出是「每圈一個 pulse」，不是對稱方波。
          </p>
        </Callout>
        <ModeContent level="engineer" title="RTL：synthesizable SystemVerilog">
          <CodeBlock
            title="prog_div34.sv"
            code={`
module prog_div34 (
  input  logic clk,
  input  logic rst_n,      // async active-low reset
  input  logic sel,        // 0: /3, 1: /4  (quasi-static mode input)
  output logic div_out
);
  logic q0, q1, q2;
  logic d0, d1, d2, a;
  assign d0 = ~q1;                 // INV  (fanout 2: FF0.D and AND)
  assign a  = q0 & d0;             // AND  = q0 & ~q1
  assign d1 = sel ? q0 : a;        // MUX2 (in0 = a, in1 = q0)
  assign d2 = ~(q1 | q0);          // NOR  = state 00 detect
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) {q2, q1, q0} <= 3'b000;
    else        {q2, q1, q0} <= {d2, d1, d0};
  assign div_out = q2;
endmodule
`}
            note="synthesis 之後 gate 可能被合併（例如 AND + MUX 變成 AOI），Step 4 的 path 清單要以合成後的 netlist 為準，但流程完全一樣。"
          />
        </ModeContent>
      </Section>

      <Section title="Step 5：哪些 path 會被 sensitize？" en="Step 5: sensitization">
        <TryFirst step="Step 5" ask="對 Step 4 的每一條 path 問：在 sel = 0 時，launch 端的變化真的會傳到 capture 端嗎？sel = 1 時呢？sel 正在切換的那個 cycle 呢？用 next-state equation 回答，不要用感覺。">
          <p>關鍵在 MUX：d1 = sel ? q0 : a。</p>
          <ul>
            <li>
              <b>sel = 0</b>：MUX 輸出跟著 in0 = a。a 的兩個來源 q0（p3）與 q1 → INV（p2）都能改變 d1。in1 = q0 直通那條（p4）<b>不算</b>：q0 直接進 in1 的變化被 sel = 0 擋掉（雖然 q0 仍然透過 AND 影響 d1，但那是 p3，不是 p4）。
            </li>
            <li>
              <b>sel = 1</b>：MUX 只看 in1 = q0，所以 p4 算；p2、p3 經過的 in0 <b>不算</b>——不管 AND 那邊多慢，d1 都不會因為它而變。
            </li>
            <li>
              <b>sel 切換的那個 cycle</b>：sel 本身在變，p6（sel → MUX → FF1.D）才會被 sensitize。穩態時 sel 是常數，STA 裡用 case analysis 把它拿掉。
            </li>
            <li>
              <b>p1、p5a、p5b</b>：d0 = NOT q1、d2 = NOR(q1, q0) 都不經過 MUX，兩種 mode 都算。
            </li>
          </ul>
          <SensitizationTable
            netlist={progDiv34}
            target="d1"
            inputSets={[
              { label: 'sel = 0', inputs: { sel: 0 } },
              { label: 'sel = 1', inputs: { sel: 1 } },
            ]}
            extra={['a']}
            title="用 nextStateOf 對 8 個 state 全部算一次：sel = 0 時 d1 = a = q0·q̄1；sel = 1 時 d1 = q0（與 a 無關）"
          />
          <CompareTable
            head={['path', 'sel = 0（/3）', 'sel = 1（/4）', 'sel 切換中']}
            rows={[
              ['p1  FF1 → INV → FF0', '✓', '✓', '✓'],
              ['p2  FF1 → INV → AND → MUX(in0) → FF1', '✓', '✗（in0 未被選）', '✓'],
              ['p3  FF0 → AND → MUX(in0) → FF1', '✓', '✗', '✓'],
              ['p4  FF0 → MUX(in1) → FF1', '✗（in1 未被選）', '✓', '✓'],
              ['p5a / p5b  → NOR → FF2', '✓', '✓', '✓'],
              ['p6  sel → MUX(sel) → FF1', '✗（sel 是常數）', '✗', '✓'],
            ]}
          />
        </TryFirst>
        <Callout kind="warning" title="更極端的例子：某個 D 在某個 mode 下根本是常數">
          <p>
            下面這個 /2 /3 cell：d0 = NOR(q1, q0)、d1 = q0 AND mod。AND 刻意做得慢（18 ps，fanout 大、drive 小）。mod = 1 時，FF0 → AND → FF1 這條 26 ps 是 critical；但 mod = 0 時 d1 = q0 · 0 = 0 <b>永遠是 0</b>——q1 永遠不動，這條 path 不管多慢都無所謂，critical path 變成 NOR 那條（20 ps）。
          </p>
          <SensitizationTable
            netlist={modeAndCounter}
            target="d1"
            inputSets={[
              { label: 'mod = 0', inputs: { mod: 0 } },
              { label: 'mod = 1', inputs: { mod: 1 } },
            ]}
            title="nextStateOf 對 4 個 state 的證明：mod = 0 時 d1 恆為 0"
          />
          <div className="two-col">
            <DividerSimPanel netlist={modeAndCounter} schematic={modeAndSchematic} title="/2 /3 cell：mod = 0 時看 q1 有沒有動過" showEquations={false} showMeasure compact />
            <CriticalPathExplorer scenario={modeAndTiming} showEnvControls={false} compact />
          </div>
          <p className="small">
            數字：T<sub>clk</sub> = 40、jitter 2、margin 2、t<sub>setup</sub> 7 ⇒ required 29。mod = 1：AND path arrival 26，slack 3，T<sub>clk,min</sub> 37；mod = 0：只剩 NOR path arrival 20，slack 9，T<sub>clk,min</sub> 31。同一顆電路，/2 mode 可以跑到 32 GHz，/3 mode 只能 27 GHz。
          </p>
        </Callout>
        <ModeContent level="deep" title="Topological path、functional false path、與模擬器的小陷阱">
          <ul>
            <li>
              <b>STA 預設是 topological 的</b>：圖上有線就算，不管功能。所以工具會把 p2、p3、p4 全部列出來，而且在 sel = 1 時仍然報 p2 的 40 ps。要它「懂」sel 是常數，得用 <code>set_case_analysis</code>；要它知道某條 path 功能上永遠不會同時被 sensitize（例如 MUX 的兩個 data input 不可能同時被選），得用 <code>set_false_path</code>——而且你要對自己下的每一條 false path 負責。
            </li>
            <li>
              <b>「不會被 sensitize」不等於「那條線上沒有訊號在跳」</b>：sel = 1 時 a 照樣每個 cycle 在變，只是被 MUX 擋在 in0。它會消耗動態功率、會透過耦合電容製造 noise，但不會改變 d1 的邏輯值，所以不進 timing。
            </li>
            <li>
              <b>本站模擬器的一個 artifact</b>：把上面的模擬器切到「實際 delay」、sel = 1，你會看到 edge 1 之後 d1 在 +33 ps 才變，而不是 +22（t<sub>CQ</sub> + MUX）。原因是 engine 用的是簡化的 inertial-delay gate model：MUX 的<b>任何</b>輸入改變都會重算輸出並把事件重新排程；a 在 +19 改變（雖然沒被選），把 d1 的事件推到 19 + 14 = 33。看 edge 3（011 → 010）：只有 q0 變、a 不變，d1 就乾淨地在 +22 出現。真實的 AOI / transmission-gate MUX 在 sel = 1 時 in0 那條被 gate 掉，不會有這個現象；STA 也不會把它算進 sel = 1 的 path。<b>教訓：事件模擬告訴你「發生了什麼」，STA 告訴你「最壞可能是什麼」，兩者都要看，但不要把模擬器的 artifact 當成 timing path。</b>
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="Step 6：計算每條 path 的最大 delay" en="Step 6: max delay">
        <p>
          現在才開始算數字。每條 path 的 arrival = t<sub>CQ,max</sub> + 沿路每個 gate 的 max delay（含走線）。但「每個 gate 的 delay」不是查表抄一個數字就好——它取決於下面這些東西：
        </p>
        <CompareTable
          head={['因素', '例子', '典型影響（ps，示意）', '物理原因']}
          rows={[
            ['fanout', 'INV X1 推 1 個 gate → 推 4 個 gate', '8 → 14', '負載電容 C_load 變 4 倍，t ≈ R_on · C_load 跟著長'],
            ['drive strength', '同樣推 4 個 gate，INV X1 → INV X4', '14 → 9', '電晶體變寬，R_on 變小；但自己的 input cap 變大，前一級會變慢'],
            ['wire capacitance', 'INV X1 推 1 個 gate，但走線從 20 µm 變 300 µm', '8 → 20', '長線的 C_wire 與 R_wire 都加進來（RC 的 Elmore delay）'],
            ['stacking', 'NAND2 → NAND4（4 個 NMOS 串聯）', '12 → 22', '串聯電晶體等效電阻相加；離輸出最遠的那個輸入最慢'],
            ['MUX 的哪個 pin', 'MUX2 data→out vs sel→out', '14 vs 16', 'sel 要先經過 inverter 產生 sel̄，再驅動兩組 transmission gate'],
            ['input slew', '前一級輸出的 slew 從 20 ps 變 60 ps', '8 → 11', '輸入越慢過門檻，這一級越晚開始切換'],
          ]}
        />
        <Callout kind="pitfall" title="反例一：gate 數最多 ≠ 最慢">
          <p>
            FF_A 同時驅動兩條路：三個小 inverter（每個 fanout 1，8 ps）到 FF_B；一個 4-input NAND（4 個 NMOS 疊起來，輸出還要推 4 個負載，30 ps）到 FF_C。數 gate：3 vs 1。算 delay：24 vs 30。
          </p>
          <CriticalPathExplorer scenario={gateCountTrapTiming} showEnvControls={false} showHold={false} compact />
          <p className="small">
            T<sub>clk</sub> = 50、jitter 3、margin 2、t<sub>setup</sub> 7 ⇒ required 38。inverter 鏈 arrival 32、slack 6；NAND4 arrival 38、slack <b>0</b>。一個 gate 的那條才是 critical。
          </p>
        </Callout>
        <TryFirst step="Step 6" ask="用課文開頭的數字（tCQ 8、INV 7、AND 11、MUX data→out 14 / sel→out 16、NOR 12、sel 的 input delay 20），把 p1～p6 的 arrival 全部算出來。然後把模擬器切到「實際 delay」，看 d1 在 edge 1 與 edge 2 之後分別在幾 ps 改變，對一下。">
          <PathBudgetTable scenario={progDiv34Timing} columns={['segments', 'arrival']} showModes title="每條 path 的 max delay 加總（ps）" />
          <p>用事件模擬對答案（sel = 0，實際 delay）：</p>
          <EdgeEventTable
            netlist={progDiv34}
            inputs={{ sel: 0 }}
            edges={[1, 2, 3]}
            signals={['q0', 'q1', 'd0', 'a', 'd1', 'd2']}
            notes={{
              1: 'q0 在 +8 變 → a 在 +19（8 + 11）→ d1 在 +33（+14）：這是 p3 = 33 ps。q1 沒變，所以 p2 沒被 launch。',
              2: 'q1 在 +8 變 → d0 +15 → a +26 → d1 +40：這是 p2 = 8 + 7 + 11 + 14 = 40 ps。',
              3: 'q0、q1 都變，但 d1 前後都是 0：這個 edge 沒有 launch 任何會到 FF1.D 的 transition。STA 不管這個——它算的是「最壞情況」，不是「這個 cycle 有沒有發生」。',
            }}
          />
          <p className="small">
            注意最後一列：edge 3 之後 d1 沒有變，但 STA 仍然把 p2 算成 40 ps。STA 的 sensitization 是「有沒有<b>可能</b>傳到」（Step 5 的邏輯條件），不是「這個 cycle 有沒有傳到」。
          </p>
        </TryFirst>
        <ModeContent level="engineer" title="gate delay 怎麼估：logical effort 的一行公式">
          <Math block>{'t_{gate} \\approx \\tau\\,(g\\,h + p),\\qquad h = \\frac{C_{load} + C_{wire}}{C_{in}}'}</Math>
          <p className="small">
            <Math>{'\\tau'}</Math> = 製程的基本延遲單位（ps，一個 FO1 inverter 的 delay 尺度）；<Math>{'g'}</Math> = logical effort（inverter 1、NAND2 4/3、NAND4 2、NOR2 5/3…，反映 stacking）；<Math>{'h'}</Math> = electrical effort（負載電容除以自身輸入電容，反映 fanout、drive strength、wire）；<Math>{'p'}</Math> = parasitic delay（自身寄生電容）。表格裡「fanout 8 → 14」「stacking 12 → 22」就是 h 與 g 在變。這一行公式足以讓你在沒有工具時估出誰比較慢；Lesson 7-5 會把它接到電晶體層級。
          </p>
        </ModeContent>
      </Section>

      <Section title="Step 7 與 Step 8：required time 與 minimum slack" en="Steps 7–8: required time and minimum slack">
        <p>
          arrival 算完只做了一半。每條 path 的 <Term zh="要求時間" en="required time" /> 由 capture 端決定：capture edge 什麼時候來（T<sub>clk</sub> + skew）、flop 要提前多少（t<sub>setup</sub>）、edge 可能提早多少（jitter + margin）。這裡所有 path 都是同一個 clock 的 single-cycle path，所以 required 都一樣：
        </p>
        <Math block>{`t_{required} = t_{skew} + T_{clk} - t_{setup} - t_{jitter} - t_{margin} = ${fmtNum(ENV.skew)} + ${fmtNum(ENV.period)} - ${SETUP} - ${fmtNum(ENV.jitter)} - ${fmtNum(ENV.margin)} = ${REQUIRED}\\ \\text{ps}`}</Math>
        <p className="small muted">
          變數：<Math>{'t_{skew}'}</Math> = capture clock 到達 − launch clock 到達（同一條 clk，取 0）；<Math>{'T_{clk}'}</Math> = clock 週期；<Math>{'t_{setup}'}</Math> = capture flop 的 setup time；<Math>{'t_{jitter}'}</Math> = cycle-to-cycle jitter；<Math>{'t_{margin}'}</Math> = 設計裕度。全部 ps。
        </p>
        <TryFirst step="Step 7–8" ask={<>把每條 path 的 slack = required − arrival 算出來。sel = 0 時哪條最小？sel = 1 時呢？各自的 T<sub>clk,min</sub> 是多少？</>}>
          <p>
            <b>sel = 0</b>（p4、p6 不算）：
          </p>
          <PathBudgetTable scenario={progDiv34Timing} mode="div3" />
          <p>
            <b>sel = 1</b>（p2、p3、p6 不算）：
          </p>
          <PathBudgetTable scenario={progDiv34Timing} mode="div4" />
          <ul>
            <li>
              sel = 0：critical 是 <b>p2</b>（arrival {fmtNum(arrivalOf('p2'))}，slack {fmtNum(slackOf('p2'))}）。T<sub>clk,min</sub> = 40 + 7 + 3 + 2 − 0 = <b>{fmtNum(tclkMinOf('p2'))} ps</b>，F<sub>max</sub> ≈ {fmtNum(1000 / tclkMinOf('p2'), 1)} GHz。
            </li>
            <li>
              sel = 1：critical 是 <b>p4</b>（arrival {fmtNum(arrivalOf('p4'))}，slack {fmtNum(slackOf('p4'))}）。T<sub>clk,min</sub> = 22 + 12 = <b>{fmtNum(tclkMinOf('p4'))} ps</b>，F<sub>max</sub> ≈ {fmtNum(1000 / tclkMinOf('p4'), 1)} GHz。
            </li>
            <li>
              同一顆電路，/3 mode 的極限頻率比 /4 mode 低了 {fmtNum(tclkMinOf('p2') - tclkMinOf('p4'))} ps 的週期。如果只在 sel = 1 做 timing，會以為它能跑 29 GHz——切到 /3 就掛。
            </li>
          </ul>
        </TryFirst>
        <p>把全部結果放進 Critical Path Explorer。先選 mode，再點每一條 path，確認你剛才手算的每一格：</p>
        <CriticalPathExplorer scenario={progDiv34Timing} initialPath="p2" />
        <Callout kind="note" title="為什麼不是「arrival 最大的那條」而是「slack 最小的那條」？">
          這個電路裡兩者剛好一樣，因為所有 path 的 required 都是 43。但只要有一條 half-cycle path（rising → falling，可用時間 T<sub>clk</sub>/2）、一條 multicycle path（可用時間 2T<sub>clk</sub>）、或兩個 capture flop 的 t<sub>setup</sub> 不同，arrival 最大的就不一定 slack 最小。<b>永遠比 slack。</b>
        </Callout>
      </Section>

      <Section title="Step 9：hold / min-delay check" en="Step 9: hold check">
        <p>
          Setup 過了不代表 hold 過。hold 看的是<b>同一個 edge</b>：launch flop 在 edge k 送出新值，最快 t<sub>CQ,min</sub> + Σ gate min 就會改變 capture flop 的 D，而 capture flop 在同一個 edge k 之後 t<sub>hold</sub> 內 D 不能變。這次要看的是<b>最短</b>的 path、用 <b>min</b> delay（fast corner）。
        </p>
        <Math block>{'\\text{slack}_{hold} = \\big(t_{CQ,min} + \\textstyle\\sum t_{gate,min}\\big) - \\big(t_{hold} + t_{skew}\\big)'}</Math>
        <TryFirst step="Step 9" ask={<>用 min 值（t<sub>CQ</sub> 5、INV 4、AND 7、MUX 9、NOR 8）算每條 path 的 hold slack。哪條最危險？如果 FF0 的 clock 比 FF1 晚到 8 ps（skew = +8），會怎樣？</>}>
          <PathBudgetTable scenario={progDiv34Timing} columns={['hold']} title="hold：min delay 與 hold slack（thold 3，skew 0）" />
          <ul>
            <li>
              最短的是 <b>p1</b>（FF1 → INV → FF0）：5 + 4 = 9 ps；required = 3 + 0 = 3；slack 6。兩種 mode 都存在。
            </li>
            <li>
              skew = +8（capture FF0 的 clock 晚到 8 ps）：required = 3 + 8 = 11 &gt; 9 ⇒ hold slack <b>−2</b>，violation。這與 T<sub>clk</sub> 完全無關：把頻率降到 1 GHz 它還是壞的。
            </li>
            <li>
              修法：在 p1 加 delay（例如把 INV 換成兩個 buffer + INV）、或修 clock tree 讓 skew 變小。注意加 delay 會讓 p1 的 setup slack 從 28 變小，但它離 critical 很遠，安全。
            </li>
          </ul>
          <p className="small">在上面的 Explorer 切到「Hold（min delay）」分頁，把 skew 改成 8，看 p1 變紅。</p>
        </TryFirst>
      </Section>

      <Section title="Step 10：pulse width、recovery、removal" en="Step 10: pulse width, recovery, removal">
        <p>最後三個檢查跟 data path 無關，但漏掉任何一個電路都會壞：</p>
        <ul>
          <li>
            <b>Pulse width</b>：clock 的 high 與 low 各自要 ≥ flop 的最小脈寬（假設 18 ps）。T<sub>clk</sub> = 55、duty 50% ⇒ high = low = 27.5 ps，slack 9.5。但如果上游 clock 的 duty 只有 30% ⇒ high = 16.5 ps &lt; 18，<b>pulse-width violation</b>——這時 setup 與 hold 都是過的，錯的是 clock 本身。
          </li>
          <li>
            <b>Recovery</b>（像 setup）：rst_n 釋放（0 → 1）必須在 clock edge 之前 ≥ t<sub>recovery</sub>（假設 10 ps）。rst_n 是全域網路，經過 buffer 樹到三個 flop 要 6 / 8 ps（min / max）。若 rst_n 在源頭於 edge 前 15 ps 釋放，到 flop 最晚是 edge 前 15 − 8 = 7 ps &lt; 10 ⇒ violation，要提前到 edge 前 ≥ 18 ps。
          </li>
          <li>
            <b>Removal</b>（像 hold）：若要「趕不上這個 edge、等下一個」，rst_n 釋放必須在 edge 之後 ≥ t<sub>removal</sub>（假設 5 ps）；最早到達 = 源頭 + 6 ps，所以源頭在 edge 之後釋放就安全（6 &gt; 5）。介於 recovery 與 removal 之間的那個窗（到達時刻落在 edge 前 10 ps 到 edge 後 5 ps 之間）是禁區：flop 可能一半 reset 一半 capture。Explorer 裡 rst_n 那條 path 就是這兩個檢查（recovery slack、removal slack）。
          </li>
        </ul>
        <Callout kind="warning" title="三種 violation 各自的長相">
          setup：資料<b>來不及</b>（max delay，與 T<sub>clk</sub> 有關）。hold：資料<b>太早變</b>（min delay，與 T<sub>clk</sub> 無關）。pulse width：clock <b>本身太窄</b>（與 data path 無關）。Lesson 7-4 會用三個 demo 分別把它們做壞給你看。
        </Callout>
      </Section>

      <Section title="Critical path 會變：PVT、mode、input state" en="The critical path moves">
        <p>
          Step 5～8 的答案是「在某個 mode、某個 corner、某種 input 條件下」的答案。換任何一個條件，都要重做。三個維度：
        </p>
        <p>
          <b>1. PVT corner。</b>電晶體與金屬對電壓、溫度的反應不一樣：電晶體 delay 對電壓很敏感，金屬電阻只跟溫度有關。所以「gate 多」的 path 在低壓 corner 膨脹得最厲害；「線長」的 path 在高溫 corner 膨脹得最厲害。兩條在 TT 幾乎一樣長的 path：
        </p>
        <CornerTable />
        <p className="small muted">
          倍率是示意值：transistor 部分（t<sub>CQ</sub> + gate）乘 gate 倍率、wire 部分乘 wire 倍率。Path G = 8 + 32 + 0，Path W = 8 + 10 + 20（TT，ps）。SS 冷比 SS 熱慢是先進製程在低壓下的 temperature inversion。
        </p>
        <p>
          <b>2. Mode。</b>剛才做過：sel = 0 是 p2（52 ps），sel = 1 是 p4（34 ps）。<b>3. Input state。</b>sel 正在切換的那個 cycle，多出一條兩種穩態都沒有的 path：p6（sel → MUX(sel) → FF1.D，arrival 20 + 16 = 36，slack 7）。它自己要求 T<sub>clk,min</sub> = 36 + 12 = 48 ps；但切換那一拍 MUX 選的是「切換後」的那個 input，所以 p2 / p3（切到 0）或 p4（切到 1）也同時在候選裡——保守地把它們全放在一起看，切換 cycle 的 critical 仍是 p2（slack 3）。在 Explorer 裡選「sel 切換中」就能看到這四條並列。Module 3 談 phase continuity 時算的就是這一拍。
        </p>
        <ModeContent level="engineer" title="STA 工具裡這十步對應到什麼">
          <CompareTable
            head={['步驟', '工具做的事 / 你要給的東西', 'SDC 例子']}
            rows={[
              ['1–4', '工具從 netlist 自動抽出所有 timing arc 與 path（topological）', '—'],
              ['5', '你告訴它哪些 input 是常數、哪些 path 功能上不存在', 'set_case_analysis 0 [get_ports sel]；set_false_path -through …'],
              ['6', 'liberty 的 delay table（依 input slew × output load 查表），加上 wire RC（SPEF）', '—'],
              ['7', 'clock 定義、uncertainty、input / output delay', 'create_clock -period 0.055；set_clock_uncertainty -setup 0.005；set_input_delay -max 0.020 -clock clk [get_ports sel]'],
              ['8', 'report_timing -max_paths N，按 slack 排序', 'report_timing -delay_type max -nworst 10'],
              ['9', '同一套 path 用 min delay 與 fast corner 重跑', 'report_timing -delay_type min'],
              ['10', 'pulse width 從 liberty 的 min_pulse_width；recovery / removal 從 async pin 的 arc', 'report_timing -check_type pulse_width / recovery / removal'],
            ]}
          />
          <p className="small">
            每一個 mode 要另外跑一次（或用 multi-mode 設定）；每一個 corner 也要（MMMC）。工具會列出所有 corner × mode 裡最差的那條——它可能是不同的 path。
          </p>
        </ModeContent>
        <ModeContent level="deep" title="更細的幾件事">
          <ul>
            <li>
              <b>Input-dependent delay</b>：NAND4 的 delay 取決於「哪一個輸入最後到」。離輸出最近的那個 NMOS 切換時只需要對一小段內部節點放電，最快；最遠的那個要拉整條 stack，最慢。STA 對每個 input → output arc 各有一張表，所以同一個 gate 在不同 path 上 delay 不同。這就是為什麼 Step 4 要把「同一個 gate 的不同輸入」列成不同 path。
            </li>
            <li>
              <b>OCV 與 CRPR</b>：同一顆晶片上兩個 flop 的 PVT 不會完全一樣。工具用 derate（launch path 乘 1.05、capture clock 乘 0.95 之類）模擬這件事；但 launch 與 capture clock 共用的那段 clock tree 不該被兩邊各 derate 一次，那段的悲觀量會被 CRPR（clock reconvergence pessimism removal）補回來。對 divider 而言，launch = capture 的 feedback path（p2）共用整條 clock tree，CRPR 幾乎把 OCV 的懲罰全部抵掉；跨 flop 的 path（p1、p3）才會真的吃到 OCV。
            </li>
            <li>
              <b>Hold 為什麼看 fast corner</b>：hold slack = min delay − (t<sub>hold</sub> + skew)。min delay 在 FF、高壓、（先進製程）高溫最小；而 clock tree 的 skew 在同一個 corner 未必最小。所以 hold 要在所有 corner 都檢查，通常 FF-hot 最危險。
            </li>
            <li>
              <b>Jitter 只扣一次</b>：setup path 的 launch edge 與 capture edge 是相鄰的兩個 edge，扣的是 cycle-to-cycle jitter，不是 period jitter 的兩倍；hold 的 launch 與 capture 是同一個 edge，jitter 不進 hold 式子。
            </li>
            <li>
              <b>Slew 會傳染</b>：Step 6 表格裡的「input slew 8 → 11」表示 delay 不只是自己的事：前一級推得慢，這一級也慢。所以砍 critical path 時，換掉 path 上第一個慢 gate 的效果，常常比換最後一個大。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>Step 4 只列一條</b>：看到 p2 三級 gate 就停了。sel = 1 時 p2 不算，這時候你手上沒有 p4，答案會是「/4 mode 也是 52 ps」——錯了 18 ps。
            </li>
            <li>
              <b>把 MUX 的兩個 data input 都算</b>：STA 預設就是這樣（topological）。它不是錯，是悲觀；但如果你因此去優化一條永遠不會被 sensitize 的 path，那是浪費面積與功率。
            </li>
            <li>
              <b>把 output port 當 capture point</b>：div_out 的 11 ps 不是 slack，是 latency。Lesson 7-3 案例 F 會講它什麼時候變成 interface path。
            </li>
            <li>
              <b>用 TT 的數字做 sign-off</b>：Path W 在 TT 不是 critical，在 FF-hot 是。每個 corner 都要跑 Step 6～9。
            </li>
            <li>
              <b>setup 過了就不看 hold</b>：p1 在 setup 是最安全的 path（slack 28），在 hold 卻是最危險的（slack 6，skew +8 就壞）。最安全的 setup path 常常就是最危險的 hold path，因為它最短。
            </li>
            <li>
              <b>把 ripple 級當同步 path 分析</b>：如果 FF2 的 clock 是 q1 而不是 clk，FF1 → FF2 就不是 register-to-register path，而是 clock path 的累積延遲問題（Module 1-2）。Step 1 就要看出來。
            </li>
            <li>
              <b>忘記 reset release</b>：rst_n 釋放太靠近 edge，reset 後第一個 state 可能不是 000。這不影響 Fmax，但會讓 /3 的相位不確定。
            </li>
          </ul>
        </Callout>
      </Section>
    </>
  )
}

function ExerciseComponent() {
  return (
    <>
      <DividerSimPanel netlist={progDiv34Sel1} schematic={progDiv34Schematic} title="練習電路：sel 預設 1（/4）" showDelayMode showEquations={false} compact />
      <CriticalPathExplorer scenario={progDiv34ExerciseTiming} initialPath="p4" />
    </>
  )
}

const lesson: LessonDef = {
  id: 'm7-l2-cp-method',
  module: 7,
  order: 2,
  title: '如何從陌生電路找 Critical Path',
  titleEn: 'Finding the critical path in an unfamiliar circuit',
  summary: '十步流程：sequential elements → launch → capture → cone → sensitization → delay → slack → hold → pulse width / recovery / removal。用一個 programmable /3 /4 divider 從頭走一遍，並用三個反例證明目測、數 gate、只看一個 mode 或一個 corner 都會出錯。',
  goals: [
    '對任何陌生電路，用固定的十步流程找出每個 mode 的 critical path，而不是靠目測。',
    '窮舉所有 launch → capture path，並用 next-state equation 判斷哪些 path 在某個 mode 下不會被 sensitize。',
    '說出 fanout、drive strength、wire capacitance、stacking 如何改變 gate delay，並用數字解釋為什麼 gate 最多的 path 不一定最慢。',
    '從每條 path 的 slack（不是 arrival）找出 minimum slack，推出每個 mode 的 Tclk,min。',
    '另外完成 hold、pulse width、recovery / removal 檢查，並解釋 critical path 為什麼會隨 PVT、mode、input state 改變。',
  ],
  readingMinutes: 45,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'critical-path',
      prompt: 'sel = 0（/3 mode）、Tclk = 55 ps 時，哪一條是這個電路的 setup critical path？點選後圖上會高亮。',
      schematic: progDiv34Schematic,
      options: [
        { label: 'p1：FF1.Q → INV → FF0.D', highlight: progDiv34Highlights.p1, description: 'arrival 15' },
        { label: 'p2：FF1.Q → INV → AND → MUX(in0) → FF1.D', highlight: progDiv34Highlights.p2, description: 'arrival 40' },
        { label: 'p4：FF0.Q → MUX(in1) → FF1.D', highlight: progDiv34Highlights.p4, description: 'arrival 22' },
        { label: 'p5：FF0/FF1.Q → NOR → FF2.D', highlight: progDiv34Highlights.p5, description: 'arrival 20' },
      ],
      answer: 1,
      explanation: 'sel = 0 時 MUX 選 in0，p2（8 + 7 + 11 + 14 = 40 ps）被 sensitize 且 slack 最小（43 − 40 = 3）。p4 走 in1，在 sel = 0 時不被 sensitize，就算它比 p2 慢也不算。',
    },
    {
      id: 'q2',
      type: 'critical-path',
      prompt: '把 sel 改成 1（/4 mode）。現在哪一條是 setup critical path？',
      schematic: progDiv34Schematic,
      options: [
        { label: 'p2：FF1.Q → INV → AND → MUX(in0) → FF1.D', highlight: progDiv34Highlights.p2, description: '40 ps，但…' },
        { label: 'p3：FF0.Q → AND → MUX(in0) → FF1.D', highlight: progDiv34Highlights.p3, description: '33 ps，但…' },
        { label: 'p4：FF0.Q → MUX(in1) → FF1.D', highlight: progDiv34Highlights.p4, description: '22 ps' },
        { label: 'p5：FF0/FF1.Q → NOR → FF2.D', highlight: progDiv34Highlights.p5, description: '20 ps' },
      ],
      answer: 2,
      explanation: 'sel = 1 時 MUX 只看 in1，p2 與 p3 都經過 in0，不被 sensitize。剩下的 path 裡 p4（22 ps，slack 21）比 p5（20 ps，slack 23）與 p1（15 ps）都小。Tclk,min 從 52 掉到 34 ps。',
    },
    {
      id: 'q3',
      type: 'multiple',
      prompt: '關於十步流程，下列哪些敘述正確？',
      options: [
        'Step 4 要窮舉所有 launch → capture 的組合，判斷哪些不算是 Step 5 的事',
        'primary input（例如 sel）也是 launch point，它的 launch flop 在別的 block',
        'output port（例如 div_out）可以直接當 capture point 算 setup slack',
        'hold check 用 min delay，而且結果與 Tclk 無關',
        'gate 數最多的 path 一定是 arrival 最大的 path',
      ],
      answers: [0, 1, 3],
      explanation: 'Step 4 窮舉、Step 5 才篩；sel 背後有看不見的 mode register，用 input delay 代替；div_out 沒有下一級的 setup 與 clock，只是 latency；hold 看同一個 edge，與 Tclk 無關；3 個 inverter 24 ps 比 1 個 NAND4 30 ps 快，數 gate 沒有用。',
    },
    {
      id: 'q4',
      type: 'numeric',
      prompt: 'p3（FF0.Q → AND → MUX(in0) → FF1.D）：tCQ 8、AND 11、MUX 14 ps；Tclk 55、skew 0、tsetup 7、jitter 3、margin 2。setup slack 是多少 ps？',
      answer: 10,
      unit: 'ps',
      explanation: 'arrival = 8 + 11 + 14 = 33；required = 0 + 55 − 7 − 3 − 2 = 43；slack = 43 − 33 = 10 ps。',
    },
    {
      id: 'q5',
      type: 'single',
      prompt: 'FF_A 驅動兩條 path：三個 inverter（每個 8 ps）到 FF_B，以及一個 4-input NAND（fanout 4，30 ps）到 FF_C。tCQ 8、Tclk 50、tsetup 7、jitter 3、margin 2。哪一條限制 Fmax？',
      options: ['inverter 鏈，因為它有 3 個 gate', 'NAND4 那條，因為 8 + 30 = 38 ps 比 8 + 24 = 32 ps 大', '兩條一樣，因為都從 FF_A 出發', '都不限制，因為 Tclk = 50 比兩者都大'],
      answer: 1,
      explanation: 'required = 50 − 12 = 38。NAND4 path arrival 38，slack 0；inverter 鏈 arrival 32，slack 6。4 個 NMOS 串聯加 fanout 4 讓一個 gate 比三個小 inverter 還慢。「Tclk 比 arrival 大」不夠：還要扣 setup、jitter、margin。',
    },
    {
      id: 'q6',
      type: 'state',
      prompt: 'sel = 0，從 reset（q2 q1 q0 = 000）開始，經過 2 個 rising edge 之後 state 是？',
      answer: '011',
      width: 3,
      bitNames: ['q2', 'q1', 'q0'],
      explanation: '000 →（d2 d1 d0 = 1 0 1）→ 101 →（d2 d1 d0 = 0 1 1）→ 011。第三個 edge 才回到 000。',
    },
    {
      id: 'q7',
      type: 'numeric',
      prompt: 'p1（FF1.Q → INV → FF0.D）：tCQ,min 5、INV min 4、thold 3。若 FF0 的 clock 比 FF1 晚到 8 ps（skew = +8），hold slack 是多少 ps？',
      answer: -2,
      unit: 'ps',
      explanation: 'arrival,min = 5 + 4 = 9；required = skew + thold = 8 + 3 = 11；hold slack = 9 − 11 = −2 ps：violation。降頻救不了，要加 delay 或修 skew。',
    },
    {
      id: 'q8',
      type: 'single',
      prompt: '/2 /3 cell：d0 = NOR(q1, q0)（12 ps）、d1 = q0 AND mod（18 ps）、tCQ 8、tsetup 7、jitter 2、margin 2。mod = 0 時的 Tclk,min 是多少 ps？',
      options: ['31', '37', '26', '20'],
      answer: 0,
      explanation: 'mod = 0 時 d1 = q0 · 0 = 0 恆為 0，AND path 不被 sensitize。只剩 NOR path：8 + 12 + 7 + 2 + 2 = 31 ps。mod = 1 時才是 AND path 的 8 + 18 + 11 = 37 ps。',
    },
    {
      id: 'q9',
      type: 'multiple',
      prompt: '下列哪些改變可能讓「哪一條 path 是 critical」換人？（電路裡只有同一個 clock 的 single-cycle path）',
      options: ['換 PVT corner（例如從 TT 到 FF-hot）', '改變 mode 輸入（例如 sel 從 0 到 1）', 'mode 輸入正在切換的那個 cycle', '只把 Tclk 從 55 改成 50 ps', '只把 margin 從 2 改成 4 ps'],
      answers: [0, 1, 2],
      explanation: 'corner 改變 gate 與 wire 的比例、mode 改變 sensitization、input 切換讓 sel → MUX 那條出現，三者都會換 critical path。Tclk 與 margin 對所有 single-cycle 同 clock 的 path 是同一個 required，slack 一起平移，排名不變（若有 half-cycle 或 multicycle path 就不一定了）。',
    },
    {
      id: 'q10',
      type: 'single',
      prompt: 'sel = 1 穩態時，p2（FF1 → INV → AND → MUX → FF1）的 40 ps 為什麼不影響 Fmax？',
      options: ['因為 p2 的 launch 與 capture 是同一個 flop', '因為 sel = 1 時 MUX 不看 in0，in0 上的變化傳不到 FF1.D（path 未被 sensitize）', '因為 sel = 1 時 AND 的輸出恆為 0', '因為 STA 只檢查最短的 path'],
      answer: 1,
      explanation: 'sel = 1 時 d1 = q0，MUX 的 in0 被 gate 掉。AND 的輸出 a = q0 · q̄1 在 sel = 1 時照樣在變（000 → 101 時 a 從 0 變 1），只是傳不到 d1。launch = capture 同一個 flop的 path 一樣要算（/2 的 Q → INV → D 就是）。',
    },
  ],
  exercise: {
    title: '另一個 mode：sel = 1 重跑 Step 5～9',
    prompt: (
      <>
        <p>
          課文把 sel = 0 從頭走到尾。現在請你<b>在紙上</b>對 sel = 1 重做 Step 5～8，再加 Step 9：哪些 path 被 sensitize？每條 arrival 多少？slack 多少？critical 是誰？T<sub>clk,min</sub> 多少？hold 最危險的是誰？然後再問一個課文沒直接算的問題：如果 sel 在某個 cycle 從 1 切到 0，那個 cycle 的 critical path 是誰？T<sub>clk,min</sub> 又是多少？
        </p>
        <p>下面的模擬器 sel 預設為 1；把它切到「實際 delay」，看 edge 3 之後 d1 在幾 ps 改變，對你 Step 6 的答案。做完再展開 Explorer 核對。</p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: [
      'Step 5：列出 sel = 1 時被 sensitize 的 path（哪兩條被排除？為什麼？）',
      'Step 6：p1、p4、p5a、p5b 的 arrival',
      'Step 7–8：required、每條 slack、critical path、Tclk,min、Fmax',
      'Step 9：hold 最短的 path 與 slack；skew = +8 會不會壞？',
      'sel 切換的那個 cycle：多了哪條 path？它的 slack？那個 cycle 的 Tclk,min？',
      '模擬器實際 delay 模式：edge 3 之後 d1 在 +22 ps 改變，對應哪條 path？edge 1 之後為什麼是 +33？',
    ],
    answer: (
      <>
        <p>
          <b>Step 5</b>：sel = 1 ⇒ MUX 只看 in1。p2、p3（經 in0）不被 sensitize；p6 在穩態不算。剩下 p1、p4、p5a、p5b。
        </p>
        <p>
          <b>Step 6</b>：p1 = 8 + 7 = 15；p4 = 8 + 14 = 22；p5a = p5b = 8 + 12 = 20（ps）。
        </p>
        <p>
          <b>Step 7–8</b>：required = 55 − 7 − 3 − 2 = 43。slack：p1 28、p4 <b>21</b>、p5 23。critical = <b>p4</b>，T<sub>clk,min</sub> = 22 + 7 + 3 + 2 = <b>34 ps</b>，F<sub>max</sub> ≈ 29.4 GHz（sel = 0 是 52 ps、19.2 GHz）。
        </p>
        <p>
          <b>Step 9</b>：hold 最短仍是 p1：min 5 + 4 = 9，required 3，slack 6。skew = +8 ⇒ required 11，slack −2，壞掉——與 mode 無關，因為 p1 兩種 mode 都在。
        </p>
        <p>
          <b>sel 切換的那個 cycle</b>：p6（sel → MUX(sel) → FF1.D）出現，arrival = 20 + 16 = 36，slack 7。但切換 cycle 同時 in0 與 in1 都可能被選（切換前後各一種），所以 p2 也在候選裡：p2 的 slack 3 仍然最小。切換 cycle 的 T<sub>clk,min</sub> 由 p2 決定 = 52 ps；如果只看 p6 本身，它要求 36 + 12 = 48 ps。結論：這個電路要能安全切換 mode，clock 週期得照 /3 mode 的 52 ps 來——這就是 Module 3 講 mode switching 時「切換那一拍」要另外算的原因。
        </p>
        <p>
          <b>模擬器</b>：edge 3（011 → 010）只有 q0 變，d1 在 +8 + 14 = +22 出現，就是 p4。edge 1 的 +33 是模擬器 inertial-delay 模型的 artifact（未被選的 in0 在 +19 改變，把 MUX 的輸出事件重新排到 +33）；真實 MUX 與 STA 都不會把它算進 sel = 1 的 path。
        </p>
      </>
    ),
  },
}
export default lesson
