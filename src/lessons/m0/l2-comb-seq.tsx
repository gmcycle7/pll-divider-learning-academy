import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { dffFollow, div2, ringOsc } from '@/models/divider/examples'
import { singleInv, invChain3, latchDiv, ringOsc3, mixedFsm } from './models'
import {
  singleInvSchematic,
  invChain3Schematic,
  dffFollowSchematic,
  div2FeedbackSchematic,
  latchSchematic,
  ringOsc2Schematic,
  ringOsc3Schematic,
  mixedFsmSchematic,
} from './schematics'

function Content() {
  return (
    <>
      <Section title="Combinational Logic：沒有記憶" en="Combinational logic has no memory">
        <p>
          <Term zh="組合邏輯" en="combinational logic" /> 的定義很嚴格：<b>輸出只是「現在」輸入的函數</b>。同樣的輸入，不管你餵它幾百次、不管上一次輸出是什麼，這一次的輸出永遠一樣。它沒有任何東西可以「記住」過去發生過什麼。
        </p>
        <p>最簡單的例子：一個 inverter，y = NOT a。</p>
        <DividerSimPanel netlist={singleInv} schematic={singleInvSchematic} title="Inverter：沒有 memory element" showTable={false} showDelayMode compact />
        <Callout kind="idea">
          注意這裡的「下一個 Clock Edge」按鈕只是借用來當<b>時間刻度尺</b>——這個電路本身完全不需要 clock。切到「實際 delay」模式，把 a 切換之後看波形：y 會在 a 改變之後<b>大約 8 ps 就跟著變</b>，跟 clock edge 發生在哪裡完全無關。這跟 DFF 的 Q「只在 edge 時才動」是本質上的不同。
        </Callout>
        <p>把 3 個 inverter 串接起來（沒有回授），在 real delay 模式下可以看到延遲怎麼一級一級累積：</p>
        <DividerSimPanel netlist={invChain3} schematic={invChain3Schematic} title="3 級 Inverter Chain：Propagation Delay 累積" showTable={false} showDelayMode compact />
        <Steps
          items={[
            <>a 改變。切到「實際 delay」模式：b 大約 10 ps 後跟著變（INV1 的 tpd）。</>,
            <>b 改變之後，c 再等大約 10 ps 才變（INV2 的 tpd）。</>,
            <>c 改變之後，out 再等大約 10 ps 才變（INV3 的 tpd）。</>,
            <>
              從 a 改變到 out 改變，總共花了 <Math>{'3 \\times t_{pd} \\approx 30\\ ps'}</Math>——這就是 <Term zh="傳播延遲" en="propagation delay" /> 沿路徑累積的樣子。整條路徑上沒有任何一個點「記住」過 a 的舊值，只是訊號一路傳過去比較慢而已。
            </>,
          ]}
        />
        <Callout kind="idea" title="這個「累積」之後會變成 critical path">
          記住這個畫面：訊號從起點出發，每經過一個 gate 就慢一點，走到終點時累積成一個總延遲。等到下一課裝上 DFF、有了「edge 出發」與「edge 抓取」這兩個時間點，這條路徑就有了<b>期限</b>——總延遲必須塞進一個 clock 週期。那時候它就叫做 <Term zh="臨界路徑" en="critical path" />，是這個網站的第二條主線。現在只要先習慣「延遲沿路徑累加」這件事。
        </Callout>
      </Section>

      <Section title="Sequential Logic：有 State" en="Sequential logic has state">
        <p>
          <Term zh="循序邏輯" en="sequential logic" /> 至少包含一個 <Term zh="記憶元件" en="memory element" />（DFF 或 latch）。它的輸出不只取決於現在的輸入，還取決於<b>現在記住的值</b>——也就是 <Term zh="狀態" en="state" />。先看一個 DFF——現在只要知道「它在 clock edge 抓一次 D，之後整個週期不變」就夠了，下一課（Lesson 0-3）才會把 tCQ、setup / hold 完整拆開：
        </p>
        <DividerSimPanel netlist={dffFollow} schematic={dffFollowSchematic} title="DFF：q 只在 edge 時抓 d_in" showTable={false} showEquations={false} compact />
        <p>
          單獨一個 DFF 還不會產生除頻——它只是「延後一拍」。要形成 divider，需要把 Q 經過 combinational logic 算出下一個 D，再接回同一個 DFF 的輸入，讓<b>現在的 state 決定下一個 state</b>：
        </p>
        <DividerSimPanel netlist={div2} schematic={div2FeedbackSchematic} title="DFF + Feedback = /2 Divider" showTable compact />
        <Callout kind="method" title="為什麼「feedback + memory element」才能形成 divider">
          <ol style={{ margin: 0 }}>
            <li>DFF 在 edge 那一瞬間把 D <b>鎖住</b>變成新的 Q，在下一個 edge 之前，Q 保證不變。</li>
            <li>因為 Q 保證在一整個週期內不變，combinational logic（這裡是 INV）才能穩定算出唯一的 d0。</li>
            <li>下一個 edge 一到，DFF 再把這個穩定的 d0 鎖進去，變成新的 state。</li>
            <li>每一步都有一個明確的「鎖定點」，所以整個系統的行為是<b>可預測、可對齊 clock</b> 的——這就是 divider 需要的東西。</li>
          </ol>
        </Callout>
      </Section>

      <Section title="危險的組合回授（一）：Latch 的透明性" en="Dangerous feedback: transparent latches">
        <p>
          如果把 DFF 換成 <Term zh="鎖存器" en="latch" />，故事完全不同。Latch 在 <span className="mono">en</span> 為 active 的整段時間都是 <Term zh="透明" en="transparent" /> 的：Q 會一直跟著 D 跑，不是只在某個瞬間才更新。下面這個電路把 latch 的 D 接成 NOT Q、EN 接 clk：
        </p>
        <LogicDiagram_placeholder />
        <DividerSimPanel
          netlist={latchDiv}
          schematic={latchSchematic}
          title="Latch Feedback：clk = 1 時會發生什麼？"
          options={{ period: 100, delayMode: 'real' }}
          windowCycles={3}
          showEquations
        />
        <Callout kind="pitfall" title="這是實際跑出來的數字（period = 100 ps，clk 在 t = 100 ps 第一次升起）">
          <p style={{ marginTop: 0 }}>
            clk 一變成 1，latch 立刻 transparent：q0 在 t = 105 變 1（走一趟 latch 的 5 ps）；INV 算出新的 d0，q0 在 116 又變 0；接著 127 變 1、138 變 0、149 變 1——每一段都剛好是 <Math>{'t_{latch}+t_{INV}=5+6=11\\ ps'}</Math>。clk 在 t = 150 落下、latch 鎖住之後，q0 就停在最後抓到的值，直到下一次 clk 再升起才重新開始振盪。
          </p>
          <p style={{ marginBottom: 0 }}>
            這些「11 ps 寬」的脈衝完全不是設計出來的訊號——它們是 <Term zh="毛刺脈衝" en="runt pulse" />，本課的 <span className="mono">models.test.ts</span> 用 <span className="mono">detectRuntPulses</span> 直接從這個電路的模擬結果驗證了它們的存在。
          </p>
        </Callout>
        <Callout kind="warning" title="為什麼這裡鎖定「實際 delay」模式，不給你切到「理想」？">
          因為 <Math>{'q_0 = \\overline{q_0}'}</Math> 這個方程式<b>沒有解</b>：zero-delay 的理想模型找不到一個一致的值，事件驅動的模擬器會在同一個模擬時間點無窮次互相觸發、永遠跑不完。這不是這個網站的 bug，而是這種回授結構本身的數學性質——這正是「透明 latch 接成組合回授」在真實電路裡也會發生不可預測行為（振盪、功耗暴衝、甚至燒毀）的根本原因。
        </Callout>
      </Section>

      <Section title="危險的組合回授（二）：Inverter Ring——級數的奇偶性決定一切" en="Inverter rings: parity matters">
        <p>先看兩個 inverter 頭尾相接、中間沒有任何 memory element：</p>
        <DividerSimPanel netlist={ringOsc} schematic={ringOsc2Schematic} title="2 級 Inverter Loop" options={{ period: 100, delayMode: 'real' }} compact showEquations={false} />
        <Callout kind="note" title="這其實是「雙穩態」，不是振盪器">
          用 <span className="mono">simulate()</span> 實際跑過：reset 之後 a 直接停在 1（b = 0），之後不管怎麼切 kick，a 都不再改變──從 t = 0 到跑完整個模擬視窗，a 只有 t = 0 這一個事件。原因是 <b>2 級反相（偶數個）</b>的回授方程式 <Math>{'a=\\overline{b},\\ b=\\overline{a}'}</Math> 有兩個穩定解（a=1,b=0 或 a=0,b=1），電路一旦落入其中一個就會一直待著不動——這跟 SRAM cell 用兩個反相器互鎖來「記住」一個 bit 是同一件事，只是這裡沒有額外的存取電晶體。
        </Callout>
        <p>現在只是多加一級，變成 3 個 inverter：</p>
        <DividerSimPanel netlist={ringOsc3} schematic={ringOsc3Schematic} title="3 級 Inverter Ring：真正會自由振盪" options={{ period: 100, delayMode: 'real' }} windowCycles={5} compact showEquations={false} />
        <Callout kind="idea" title="奇數級：方程式沒有解，所以停不下來">
          <Math>{'a=\\overline{c},\\ b=\\overline{a},\\ c=\\overline{b}'}</Math> 三個式子連立代入會得到 <Math>{'a = \\overline{a}'}</Math>——無解。既然找不到一個「停下來」的一致值，電路只能不斷翻轉。用 <span className="mono">simulate()</span> 量到：kick 放開之後，a 大約每 <b>45 ps</b> 翻轉一次（一次來回 = 2 × 3 級 × 15 ps/級 = 90 ps 一個完整週期），而且<b>這個頻率跟這個網站給的任何 clock 完全沒有關係</b>——純粹由 3 個 inverter 的 gate delay 決定。這正是為什麼它不能拿來當 divider：沒有任何 edge 跟外部 clock 對齊，頻率會隨製程、電壓、溫度（<Term zh="製程、電壓、溫度" en="process, voltage, temperature, PVT" />）漂移。
        </Callout>
        <ModeContent level="deep" title="這跟真正的 ring oscillator / VCO 有什麼關係">
          <p>
            真實的環形振盪器（ring oscillator）正是利用「奇數級反相回授無穩態解」這個性質來自由振盪，常被當作 PVT 監測電路，或早期簡易 VCO 的核心；而「偶數級、雙穩態」的結構則是 SRAM bit cell、以及許多 latch 內部鎖存機制的基礎。同一種拓樸（inverter 接成環），只差一級，物理意義完全相反——這也是為什麼看到「組合回授」電路時，第一件事永遠是先算清楚<b>總共經過幾次反相</b>，不能只憑直覺猜。
          </p>
        </ModeContent>
      </Section>

      <Section title="State 到底是什麼" en="What state really is">
        <p>
          把上面幾個電路放在一起看，「state」的定義就很明確了：
        </p>
        <Callout kind="formula" title="定義">
          <p style={{ marginTop: 0, marginBottom: 0 }}>
            <b>State</b> = 電路裡<b>所有 memory element（DFF、latch）目前鎖住的值</b>組合起來的集合。<b>Next state</b> 只由「現在的 state」與「現在的 input」決定——不需要知道更早以前發生過什麼。純組合訊號（不管算得多複雜）都不算進 state 裡，因為它們不記得任何東西，隨時可以從目前的 state 與 input 重新算出來。
          </p>
        </Callout>
        <ModeContent level="engineer" title="RTL 裡怎麼分辨這兩種邏輯">
          <p>SystemVerilog 用 <span className="mono">always_comb</span>／<span className="mono">assign</span> 寫組合邏輯，用 <span className="mono">always_ff</span> 寫循序邏輯，兩者不應該混在同一個 block 裡：</p>
          <CodeBlock
            title="comb_vs_seq.sv"
            code={`
// 組合邏輯：沒有 clock，沒有記憶
assign flag = q0 ^ q1;          // 純函數：q0、q1 一變，flag 馬上跟著變

// 循序邏輯：只有 memory element 才用 always_ff
always_ff @(posedge clk or negedge rst_n) begin
  if (!rst_n) q0 <= 1'b0;
  else        q0 <= q1;          // q0 是 state bit：這裡才會被「記住」
end
`}
            note="q0、q1 是 state bit（在 always_ff 裡被 <= 賦值）；flag 不是（在 always_comb / assign 裡只是即時算出來）。"
          />
        </ModeContent>
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>把「算起來很複雜的組合訊號」誤認成 state</b>：不管一個訊號的邏輯式多長，只要它沒有經過 DFF/latch 鎖住，它就不是 state，下一個 clock edge 前隨時可能因為輸入改變而跟著變。
            </li>
            <li>
              <b>忘記 latch 是 level-sensitive</b>：把 latch 的 enable 想成跟 DFF 的 clock pin 一樣「只在邊緣動作」，忽略了它在整段 active 期間都是透明的。
            </li>
            <li>
              <b>看到「兩個 inverter 接成環」就以為一定會振盪</b>：級數的奇偶性才是關鍵，偶數級是雙穩態、奇數級才會自由振盪。
            </li>
          </ul>
        </Callout>
      </Section>
    </>
  )
}

/** 沒有額外資訊要顯示；LogicDiagram 已經內嵌在下面的 DividerSimPanel 裡，這裡留一個小提示取代重複的圖 */
function LogicDiagram_placeholder() {
  return (
    <p className="small muted" style={{ margin: '0.2em 0' }}>
      電路圖（LogicDiagram）已經內嵌在下面的模擬面板裡——feedback 路徑：<span className="mono">q0 → INV → d0 → L0.d</span>，enable 路徑：<span className="mono">clk → L0.en</span>。
    </p>
  )
}

const lesson: LessonDef = {
  id: 'm0-l2-comb-seq',
  module: 0,
  order: 2,
  title: 'Combinational 與 Sequential Logic',
  titleEn: 'Combinational vs sequential logic',
  summary: '沒有記憶的組合邏輯、有 state 的循序邏輯；為什麼 feedback 一定要配 memory element；latch 的透明性與奇偶級數不同的 inverter 回授，各自會發生什麼。',
  goals: [
    '說出組合邏輯與循序邏輯最核心的差異：有沒有「記住」東西。',
    '解釋為什麼單獨的 feedback（不管是組合還是 latch）都不足以形成一個行為明確的 divider，一定要配 edge-triggered 的 memory element。',
    '看懂 transparent latch 接成回授為什麼會在 enable 期間振盪，並能從波形量出振盪的節奏。',
    '判斷一個 inverter 回授環會不會自由振盪：數清楚它到底經過奇數次還是偶數次反相。',
    '在一個混合 comb + DFF 的電路裡，正確圈出哪些訊號是 state bit、哪些只是組合輸出。',
  ],
  readingMinutes: 24,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'single',
      prompt: '下列何者正確描述 combinational logic？',
      options: ['輸出只是現在輸入的函數，沒有內部記憶', '輸出需要等到下一個 clock edge 才會改變', '一定包含至少一個 DFF', '輸出跟過去發生過的事件有關'],
      answer: 0,
      explanation: '組合邏輯的定義就是「輸出 = f(現在輸入)」，不依賴任何歷史，也不需要等 clock edge。',
    },
    {
      id: 'q2',
      type: 'numeric',
      prompt: '3 個 inverter 串接（沒有回授），每個 tpd = 10 ps。輸入變化後，要多少 ps 輸出才會跟著變？',
      answer: 30,
      unit: 'ps',
      explanation: '傳播延遲沿路徑累加：3 × 10 ps = 30 ps。',
    },
    {
      id: 'q3',
      type: 'multiple',
      prompt: '關於「latch 接成組合回授」（D = NOT Q，EN = clk），下列敘述哪些正確？',
      options: [
        'EN = clk = 1 的整段期間，這個回授方程式沒有一致的穩定解',
        '這個電路在 real delay 模式下，clk 高電位期間會產生一連串的短脈衝（runt pulse）',
        '把模擬器切到 ideal（zero-delay）模式，可以正常看到一樣的振盪波形',
        'clk = 0 時，q0 會保持 clk 剛落下那一刻抓到的值',
      ],
      answers: [0, 1, 3],
      explanation: 'ideal 模式是 zero-delay，這個沒有不動點解的回授會讓事件驅動模擬器在同一個時間點無窮次觸發，跑不出正常結果（不是「一樣的振盪波形」），所以第三項錯誤。',
    },
    {
      id: 'q4',
      type: 'multiple',
      prompt: '在本課「混合 comb + DFF」的練習電路裡，下列哪些訊號「不是」state bit？',
      options: ['q0', 'q1', 'flag（= q0 XOR q1）', 'en'],
      answers: [2, 3],
      explanation: 'q0、q1 是兩個 DFF 的 Q，會被鎖住，是 state bit；flag 是純組合輸出、en 是外部輸入，兩者都不會被任何 memory element 記住，都不是 state bit。',
    },
    {
      id: 'q5',
      type: 'state',
      prompt: '練習電路的 state 定義為 (q1, q0)。從 state = "01" 開始，經過一個 rising edge 之後，state 是多少？',
      answer: '00',
      width: 2,
      bitNames: ['q1', 'q0'],
      explanation: 'd0 = q1 = 0；d1 = NOT(q0) AND en = NOT(1) AND 1 = 0。edge 後 (q1,q0) = (0,0)。',
    },
    {
      id: 'q6',
      type: 'single',
      prompt: '為什麼「純組合邏輯的回授」沒辦法拿來做 divider？',
      options: [
        '因為組合邏輯的閘一定比較慢',
        '因為沒有 memory element 在某個時間點把值「鎖住」，回授迴路要嘛沒有一致解、要嘛立刻收斂到一個固定值，沒辦法產生跟 clock edge 對齊、週期明確的輸出',
        '因為組合邏輯不能有兩個以上的 gate',
        '因為組合邏輯不能接受回授訊號',
      ],
      answer: 1,
      explanation: '關鍵在於「有沒有一個確定的鎖定點」。DFF/latch 的 edge（或 latch 的 en 落下）提供了這個鎖定點；純組合回授沒有，所以行為要嘛無解要嘛是靜態的雙穩態，都不會產生跟 clock 對齊的週期性輸出。',
    },
  ],
  exercise: {
    title: '陌生電路分析：圈出 memory element、寫出 state bits',
    prompt: (
      <p>
        下面是一個混合 combinational + DFF 的電路：兩個 DFF（FF0、FF1）之間有 INV、AND、XOR 三個 gate。在按模擬器之前，先自己回答：<b>哪些訊號會被「記住」（也就是 state bit）？哪些訊號只是組合邏輯即時算出來的？</b>寫下你認為的 state 定義（用哪幾個 bit、誰是 MSB），再用模擬器驗證。
      </p>
    ),
    Component: () => <DividerSimPanel netlist={mixedFsm} schematic={mixedFsmSchematic} title="練習電路" compact />,
    checklist: [
      '列出電路裡所有的 DFF/latch，這些的 Q 就是 state bit 的候選',
      '確認 flag、q0n、d1 是否有任何一個被接到某個 flop 的 clk 或 D 之外的用途——它們是不是都只是「即時算出來」的組合訊號？',
      '寫出 state 的 bit 排列方式（哪個是 MSB）',
      '從 reset state 開始，手動推 4 個 edge，跟模擬器的 state table 對答案',
    ],
    answer: (
      <>
        <p>
          <b>State bits</b>：q1、q0（分別是 FF1、FF0 的 Q），state 定義為 (q1, q0)，q1 是 MSB。q0n、d1、flag 都只是組合邏輯即時算出來的訊號——它們沒有被任何 flop 鎖住，下一瞬間 q0、q1、en 一變，它們就馬上跟著變，不能算進 state 裡。
        </p>
        <p>
          從 reset（00）開始：edge 1 → 10，edge 2 → 11，edge 3 → 01，edge 4 → 00，剛好走完 4 個 state 回到起點，沒有 unreachable 或 lock-up 的狀態（可以在 <span className="mono">models.test.ts</span> 的 <span className="mono">buildStateGraph</span> 驗證）。
        </p>
      </>
    ),
  },
}
export default lesson
