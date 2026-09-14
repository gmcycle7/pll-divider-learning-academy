import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Tabs, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { StateDiagram } from '@/components/circuit/StateDiagram'
import { simulate } from '@/models/divider/engine'
import type { Netlist, SignalTrace, Values } from '@/models/divider/types'
import { TIMING as K, mmd2, mmd2ModAt01, mmd3 } from './models'
import { hlF1Clock, hlPath2ModOut, mmd2BlockSchematic, mmd2ModAt01Schematic, mmd2Schematic, mmd3BlockSchematic } from './schematics'
import { mmd2Timing } from './timing'
import { DivideRangeTable, MmdEdgeTable, MmdTwoStageExplorer, SwitchP0Table } from './Widgets'

// ---------------------------------------------------------------- 由 engine 產生的靜態波形（quiz 用；只給 clk 與 div_out）
function outWave(nl: Netlist, inputAt: (e: number) => Partial<Values>, edges = 11): SignalTrace[] {
  const { sim } = simulate(nl, edges, { period: K.T }, inputAt)
  return sim.getTraces(['clk', 'div_out'])
}

/** 主循環（b1b0a1a0）：與 models.test.ts 內用 simulate 驗證過的序列一致 */
const CYCLE_00 = ['0000', '0001', '0100', '0101']
const CYCLE_01 = ['0000', '0001', '0010', '0100', '0101']
const ring = (states: string[]) => states.map((s, i) => ({ from: s, to: states[(i + 1) % states.length], label: 'clk↑' }))
const outOf = (states: string[]) => Object.fromEntries(states.map((s) => [s, s.slice(0, 2) === '00' ? '1' : '0']))

function Content() {
  return (
    <>
      <Section title="先用直覺想" en="Intuition">
        <p>
          Module 3 的 /2 /3 cell 只能給你 2 或 3。PLL 常常需要的是「/64 到 /127 之間任何一個整數」。做法不是設計一個 64 種 state 的大 state machine，而是把<b>同一種 cell 串起來</b>：第一個 cell 吃 VCO clock，它的輸出當第二個 cell 的 clock，第二個的輸出當第三個的 clock……這就是 <Term zh="多模除頻器" en="multi-modulus divider, MMD" />。
        </p>
        <p>
          想像一棟兩層樓的鐘樓。一樓的人每聽到 2 聲 tick（clk）就敲一次小鐘（f1）。二樓的人每聽到 2 聲或 3 聲小鐘（由 p1 決定）就敲一次大鐘（div_out）。關鍵的設計是：<b>二樓在自己每一輪裡，恰好有一次機會對一樓喊「這一次多等一聲 tick 再敲」</b>——一樓聽不聽，由 p0 決定。
        </p>
        <p>
          先不看電路，只算拍子。二樓一輪 = (2 + p1) 聲小鐘。每聲小鐘平常要 2 聲 tick；其中恰好一聲可以被拉長成 3 聲 tick（若 p0 = 1）。所以大鐘一輪 = 2·(2 + p1) + p0 聲 tick。p1p0 從 00 到 11：4、5、6、7。
        </p>
        <Callout kind="idea">
          MMD 的兩個核心動作：<b>往下傳 clock</b>（每一級用前一級的輸出當 clock，頻率逐級變慢）與<b>往回傳請求</b>（後級用 modulus-out 告訴前級「這一輪多吞一個 edge」）。除數的每一個 bit 就是「某一級要不要多吞一個」。
        </Callout>
      </Section>

      <Section title="兩級串接的電路" en="The two-cell circuit">
        <p>先看 block 圖。每個 cell 有四個介面：clock in、f_out（往後級的 clock）、mod_in（來自後級的請求）、mod_out（往前級的請求），加上自己的 modulus bit p。</p>
        <LogicDiagram schematic={mmd2BlockSchematic} showValues={false} />
        <p>再看 gate-level。左半是 cell 1，右半是 cell 2，兩個 cell 長得幾乎一樣：</p>
        <LogicDiagram schematic={mmd2Schematic} showValues={false} />
        <p>分析前先找出五樣東西：</p>
        <ul>
          <li>
            <b>Clock</b>：cell 1 的兩個 flop 吃 <span className="mono">clk</span>。cell 2 的兩個 flop 吃 <span className="mono">f1 = NOR(a1, a0)</span>——這是由 cell 1 的 state 算出來的 <Term zh="產生時脈" en="generated clock" />，只在 a = 00 那一個 clk 週期為 1。
          </li>
          <li>
            <b>Memory elements</b>：cell 1 的 state 是 <span className="mono">a1 a0</span>，cell 2 的 state 是 <span className="mono">b1 b0</span>。整個 MMD 的 state 寫成 b1 b0 a1 a0（4 個 bit）。
          </li>
          <li>
            <b>Local feedback</b>：每個 cell 自己的 /2 /3 迴路——da0 = NOR(a1, a0)、da1 = a0 · mod1_eff；db0 = NOR(b1, b0)、db1 = b0 · p1。
          </li>
          <li>
            <b>Modulus control</b>：<span className="mono">p0</span> 進 cell 1 的 AND_P0，<span className="mono">p1</span> 進 cell 2 的 AND_B1。這是 <Term zh="模數控制" en="modulus control" />。
          </li>
          <li>
            <b>Modulus-out（往回傳的請求）</b>：<span className="mono">mod_out2 = NOR(b1, b0)</span> 從 cell 2 沿底部長線回到 cell 1，先與 p0 AND 成 mod1_eff，再與 a0 AND 成 da1。cell 2 是最後一級，它的 mod_in 固定為 1，所以 mod_out2 就是它自己的 f2，也是 div_out。
          </li>
        </ul>
        <Math block>{'d_{a0} = \\overline{a_1 + a_0} = f_1,\\qquad d_{a1} = a_0 \\cdot p_0 \\cdot mod\\_out_2,\\qquad d_{b0} = \\overline{b_1 + b_0} = mod\\_out_2 = div\\_out,\\qquad d_{b1} = b_0 \\cdot p_1'}</Math>
        <p>
          注意 da1 那條式子。cell 1 要走 /3（a 經過 10），必須 a0 = 1、p0 = 1、<b>而且</b> mod_out2 = 1 三件事同時成立。mod_out2 = 1 只在 cell 2 處於 b = 00 的那一個 f1 週期。所以 cell 1 每個輸出週期最多只會走一次 /3——這就是 N 只多 p0 而不是多 2·p0 的原因。
        </p>
      </Section>

      <Section title="互動：兩級各自在做什麼" en="Interactive two-stage MMD">
        <p>
          下面的模擬器同時顯示兩個 cell 的 state、各自看到的 MOD（p0、p1、mod_out2、mod1_eff）、這個 edge 有沒有 clock 到 cell 2、output edge 與量到的總除數。先把 p1p0 設成 01，一步一步按，對照下一節的逐 edge 推導。
        </p>
        <MmdTwoStageExplorer />
      </Section>

      <Section title="逐 edge 帶看 p1p0 = 01 的一個週期" en="Edge by edge, p1p0 = 01">
        <p>
          reset 後 a = 00、b = 00。這時 f1 = NOR(0,0) = 1、mod_out2 = NOR(0,0) = 1。p0 = 1，所以 mod1_eff = p0 · mod_out2 = 1。每個 edge 先問三件事：<b>edge 前 cell 1 的 D 是什麼？這個 edge 之後 f1 會不會由 0 變 1（cell 2 被 clock 到）？mod_out2 會不會變？</b>
        </p>
        <Steps
          items={[
            <>
              <b>Edge 1</b>：a = 00 ⇒ da0 = NOR(0,0) = 1，da1 = a0 · mod1_eff = 0 · 1 = 0。edge 後 a = <span className="mono">01</span>。f1 = NOR(0,1) 由 1 變 0——是下降，不是上升，cell 2 不動，b 仍是 00。div_out = mod_out2 = 1。
            </>,
            <>
              <b>Edge 2</b>：a = 01 ⇒ da0 = NOR(0,1) = 0，da1 = a0 · mod1_eff = 1 · 1 = <b>1</b>。這就是叉路口：mod1_eff = 1，cell 1 決定繞路。edge 後 a = <span className="mono">10</span>。f1 = NOR(1,0) = 0 不變，b 仍 00。
            </>,
            <>
              <b>Edge 3</b>：a = 10 ⇒ da0 = NOR(1,0) = 0，da1 = a0 · … = 0 · 1 = 0。edge 後 a = <span className="mono">00</span>，f1 = NOR(0,0) 由 0 變 <b>1</b>：這是 f1 的 rising edge，cell 2 被 clock 到。cell 2 在這一瞬間看到的 D：db0 = NOR(b1,b0) = NOR(0,0) = 1、db1 = b0 · p1 = 0 · 0 = 0 ⇒ b = <span className="mono">01</span>。b 不再是 00，所以 mod_out2 = NOR(0,1) 變成 <b>0</b>，div_out 落下。cell 1 這一輪用了 3 個 edge：<b>/3</b>。
            </>,
            <>
              <b>Edge 4</b>：a = 00、mod_out2 = 0 ⇒ mod1_eff = 0，da1 一定是 0；da0 = 1。edge 後 a = <span className="mono">01</span>，f1 由 1 變 0（下降），cell 2 不動。
            </>,
            <>
              <b>Edge 5</b>：a = 01，但 mod1_eff = 0 ⇒ da1 = 1 · 0 = 0，不繞路；da0 = 0。edge 後 a = <span className="mono">00</span>，f1 由 0 變 1：cell 2 又被 clock 到，db0 = NOR(0,1) = 0、db1 = b0 · p1 = 1 · 0 = 0 ⇒ b = <span className="mono">00</span>。mod_out2 = NOR(0,0) 回到 1，div_out 升起。cell 1 這一輪用了 2 個 edge：<b>/2</b>。
            </>,
            <>
              <b>結論</b>：edge 5 之後 (b, a) = (00, 00)，與 reset 一模一樣，所以接下來 edge 6–10 會重複 edge 1–5。div_out 的 rising edge 在 edge 5、10、15 …，間隔 5T ⇒ <b>N = 5</b>。div_out 在 b = 00 的那一個 f1 週期為 1，而那個 f1 週期是被拉長成 3T 的那一個，所以 high = 3T、low = 2T，duty = 3/5 = 60%——不是 50%。
            </>,
          ]}
        />
        <p>四種 mode 的逐 edge 表都由 engine 產生（與上面的模擬器同一套 event-driven 模型）。自己先用同樣的三個問題推 p1p0 = 11，再對照表：</p>
        <Tabs
          tabs={[
            { label: 'p1p0 = 01（/5）', content: <MmdEdgeTable p0={1} p1={0} edges={10} caption="cell 1：/3, /2 交替；div_out 在 edge 5, 10 升起" /> },
            { label: 'p1p0 = 00（/4）', content: <MmdEdgeTable p0={0} p1={0} edges={8} caption="mod1_eff 恆 0：cell 1 永遠 /2；cell 2 每 2 個 f1 一輪" /> },
            { label: 'p1p0 = 10（/6）', content: <MmdEdgeTable p0={0} p1={1} edges={12} caption="cell 2 走 /3（b 經過 10），cell 1 永遠 /2" /> },
            { label: 'p1p0 = 11（/7）', content: <MmdEdgeTable p0={1} p1={1} edges={14} caption="cell 2 走 /3，且 b = 00 那一個 f1 週期 cell 1 走 /3：3 + 2 + 2 = 7" /> },
          ]}
        />
        <Callout kind="method" title="讀這種表的固定步驟">
          <ol style={{ margin: 0 }}>
            <li>先只看 a1a0 與 f1：a 什麼時候回到 00？那一列 f1↑，cell 2 才會換 state。</li>
            <li>再看 b1b0 與 mod_out2：b = 00 的那些列 mod_out2 = 1。</li>
            <li>最後看 da1：只有「a = 01 且 mod_out2 = 1 且 p0 = 1」的那一列 da1 = 1，下一列 a 會是 10。</li>
            <li>數 a 回到 00 的間隔（2 或 3），再數 b 回到 00 之間有幾個 f1↑（2 或 3）。相乘相加就是 N。</li>
          </ol>
        </Callout>
      </Section>

      <Section title="State diagram：4 個 bit 只走其中幾個 state" en="State diagram">
        <p>
          state 有 4 個 bit、16 種組合，但每個 mode 的主循環只用 N 個。下面是由模擬得到的兩個主循環（b1 b0 a1 a0），箭頭都是 clk↑；注意 b 只在 a 由 10 或 01 回到 00 的那個 edge 才變。
        </p>
        <div className="grid-2">
          <StateDiagram states={CYCLE_00} transitions={ring(CYCLE_00)} outputs={outOf(CYCLE_00)} title="p1p0 = 00：4 個 state，N = 4" width={300} height={230} />
          <StateDiagram states={CYCLE_01} transitions={ring(CYCLE_01)} outputs={outOf(CYCLE_01)} title="p1p0 = 01：多了 0010（a = 10），N = 5" width={300} height={230} />
        </div>
        <p className="small muted">
          其餘 11 個 state 呢？models.test.ts 用 simulate 從 16 個初始 state 各跑一次：四種 mode 都沒有 lock-up，最多幾個 edge 就回到主循環（每個 cell 各自是 Lesson 3-2 那種 11 → 10 → 00 會自己回來的結構）。
        </p>
      </Section>

      <Section title="Divide ratio 的數學推導" en="Deriving N">
        <p>
          設輸入 clock 週期為 <Math>{'T'}</Math>（ps）。先定義每一級「一輪」的長度：
        </p>
        <ul>
          <li>
            <Math>{'T_{f1}'}</Math>：f1 的一個週期 = cell 1 從 a = 00 回到 a = 00 所需的 clk 週期數 × T。平常是 <Math>{'2T'}</Math>；被要求 /3 的那一輪是 <Math>{'3T'}</Math>。
          </li>
          <li>
            <Math>{'T_{out}'}</Math>：div_out 的一個週期 = cell 2 從 b = 00 回到 b = 00 所需的 f1 週期數。cell 2 是一個 /2 /3 cell，所以是 <Math>{'(2 + p_1)'}</Math> 個 f1 週期。
          </li>
        </ul>
        <p>cell 2 的 (2 + p1) 個 f1 週期裡，恰好一個（b = 00 的那個）mod_out2 = 1。只有那一個 f1 週期，cell 1 才可能走 /3，而且要 p0 = 1 才真的走：</p>
        <Math block>{'T_{out} = \\underbrace{(2 + p_1)}_{\\text{cell 2 的 f1 週期數}} \\cdot 2T + \\underbrace{p_0 \\cdot T}_{\\text{被拉長的那一個}} = (4 + 2p_1 + p_0)\\,T'}</Math>
        <Math block>{'N = \\frac{T_{out}}{T} = 4 + 2p_1 + p_0 \\in \\{4, 5, 6, 7\\}'}</Math>
        <p>
          其中 <Math>{'p_0, p_1 \\in \\{0, 1\\}'}</Math> 是 modulus bit，沒有單位；<Math>{'N'}</Math> 是整數除數。p1 的權重是 2（它讓 cell 2 多用一個 f1 週期，而一個 f1 週期是 2T），p0 的權重是 1（它只把一個 f1 週期拉長 1T）。
        </p>
        <p>推到 n 級：第 i 級（i 從 0 數）多吞一個 edge 時，前面 i 級已經把它放大成 <Math>{'2^i'}</Math> 個 T。最後一級每輪 (2 + p<sub>n−1</sub>) 個週期，往前每級乘 2：</p>
        <Math block>{'N = 2^n + \\sum_{i=0}^{n-1} p_i\\,2^i,\\qquad N \\in [\\,2^n,\\ 2^{n+1} - 1\\,]'}</Math>
        <p>
          這給出 <Term zh="除數範圍" en="divide range" />：n 級可以做 2<sup>n</sup> 到 2<sup>n+1</sup> − 1，共 2<sup>n</sup> 個連續整數；<Term zh="解析度" en="resolution" /> 是 1（相鄰除數差 1 個 T）。範圍的下限被「每級至少 /2」卡住——要 /3 到 /7 這種不從 2<sup>n</sup> 起算的範圍，得在最後幾級加 bypass（deep 模式）。
        </p>
        <p>
          <b>Duty cycle</b>：div_out = NOR(b1, b0)，只在 b = 00 那一個 f1 週期為 1，而那個 f1 週期長 (2 + p0) T：
        </p>
        <Math block>{'D = \\frac{t_{high}}{T_{out}} = \\frac{(2 + p_0)\\,T}{N\\,T} = \\frac{2 + p_0}{4 + 2p_1 + p_0}'}</Math>
        <CompareTable head={['p1p0', 'N', 'cell 1 每輪（clk 數）', 'cell 2 每輪（f1 數）', 'duty = (2 + p0)/N', 'div_out rising edge（edge #）']} rows={[['00', '4', '2, 2', '2', '2/4 = 50%', '4, 8, 12 …'], ['01', '5', '3, 2', '2', '3/5 = 60%', '5, 10, 15 …'], ['10', '6', '2, 2, 2', '3', '2/6 = 33.3%', '6, 12, 18 …'], ['11', '7', '3, 2, 2', '3', '3/7 = 42.9%', '7, 14, 21 …']]} />
        <p className="small muted">表中每一格都由 models.test.ts 用 simulate 與 measureDivide 驗證過；下一節的三級表則是在頁面上即時模擬出來的。</p>
        <Callout kind="warning" title="只有 /4 mode 是 50%">
          MMD 的輸出 duty 隨 mode 改變，而且離 50% 可以很遠。後面若接需要 50% duty 的電路（例如某些 PFD、或用兩個 edge 的 DTC），要在輸出加一級 /2 或做 duty correction。不要假設「除頻器輸出就是方波」。
        </Callout>
      </Section>

      <Section title="Cascade、modulus-out 的傳遞、最後一級如何影響前級" en="Cascade and modulus-out propagation">
        <p>
          兩級的規則推到三級：cell 3 的 clock 是 f2、state 是 c1c0、modulus bit 是 p2。現在 cell 2 不再是最後一級，它的 mod_in 是 cell 3 的 mod_out3，所以 cell 2 自己的 /3 也要「被允許」才能走；而它往前傳給 cell 1 的請求，必須同時滿足「自己在 00」與「後級也在 00」：
        </p>
        <Math block>{'mod\\_out_3 = f_3,\\qquad mod\\_out_2 = f_2 \\cdot mod\\_out_3,\\qquad d_{b1} = b_0 \\cdot p_1 \\cdot mod\\_out_3,\\qquad d_{a1} = a_0 \\cdot p_0 \\cdot mod\\_out_2'}</Math>
        <LogicDiagram schematic={mmd3BlockSchematic} showValues={false} />
        <p>
          這條 AND 鏈就是 <Term zh="模數輸出傳遞" en="modulus-out propagation" />：最後一級每輸出週期只有一次 c = 00，這個「1」往前一級一級被 f<sub>i</sub> 過濾，最後只有在<b>所有後級都在 00 的那一個 clk 週期</b>才到達 cell 1。所以不管幾級，cell 1 每個輸出週期最多只走一次 /3，p0 的權重永遠是 1。counter 的 ripple carry 是「往後傳」，MMD 的 modulus-out 是「往前傳」，方向相反，但都是一條隨級數變長的組合邏輯鏈——下一課會看到這條鏈的長度直接決定 Fmax。
        </p>
        <p>三級 MMD 的 8 種除數（頁面即時用 simulate 跑 80 個 edge 量出來的）：</p>
        <DivideRangeTable netlist={mmd3} bits={3} title="三級 /2 /3 cell：N = 8 + 4·p2 + 2·p1 + p0" />
        <ModeContent level="engineer" title="三級 p2p1p0 = 101 的逐 edge（N = 13）">
          <p>
            用同一套讀表法：c 每 (2 + p2) = 3 個 f2 週期一輪；b 每 2 個 f1 週期一輪（p1 = 0，b 永遠不經過 10）；只有 c = 00 且 b = 00 的那一個 clk 週期 mod_out2 = 1，cell 1 走一次 /3。輸出週期 = 3 × 2 × 2 + 1 = 13。
          </p>
          <div className="scroll-x">
            <table className="state-table">
              <thead>
                <tr>
                  <th>edge</th>
                  <th>a</th>
                  <th>b</th>
                  <th>c</th>
                  <th>mod_out3</th>
                  <th>mod_out2</th>
                  <th>da1</th>
                  <th>→ a</th>
                  <th>→ b</th>
                  <th>→ c</th>
                  <th>div_out</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [1, '00', '00', '00', 1, 1, 0, '01', '00', '00', 1],
                  [2, '01', '00', '00', 1, 1, 1, '10', '00', '00', 1],
                  [3, '10', '00', '00', 1, 1, 0, '00', '01', '00', 1],
                  [4, '00', '01', '00', 1, 0, 0, '01', '01', '00', 1],
                  [5, '01', '01', '00', 1, 0, 0, '00', '00', '01', 0],
                  [6, '00', '00', '01', 0, 0, 0, '01', '00', '01', 0],
                  [7, '01', '00', '01', 0, 0, 0, '00', '01', '01', 0],
                  [8, '00', '01', '01', 0, 0, 0, '01', '01', '01', 0],
                  [9, '01', '01', '01', 0, 0, 0, '00', '00', '10', 0],
                  [10, '00', '00', '10', 0, 0, 0, '01', '00', '10', 0],
                  [11, '01', '00', '10', 0, 0, 0, '00', '01', '10', 0],
                  [12, '00', '01', '10', 0, 0, 0, '01', '01', '10', 0],
                  [13, '01', '01', '10', 0, 0, 0, '00', '00', '00', 1],
                ].map((r) => (
                  <tr key={r[0]}>
                    {r.map((c, i) => (
                      <td key={i} className={i === 6 && c === 1 ? 'value-1' : i >= 7 && i <= 9 ? 'mono' : ''}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">edge 2 是唯一 da1 = 1 的列（a = 01、b = 00、c = 00、p0 = 1）；edge 13 之後回到全 0，週期 13。div_out = f3 只在 c = 00 期間為 1（edge 13–17，共 5 個 clk）⇒ duty = 5/13。</p>
        </ModeContent>
      </Section>

      <Section title="Control 的 timing deadline：p0、p1 何時真的被看到" en="When p0 and p1 are actually sampled">
        <p>
          p0 與 p1 都不是「每個 edge 都在被用」。回到 next-state equation：
        </p>
        <ul>
          <li>
            <b>p0</b> 只出現在 da1 = a0 · p0 · mod_out2。它只在 <b>a = 01 且 mod_out2 = 1</b> 的那個 clk edge 影響結果——每個輸出週期恰好一次（p1p0 = 01 的表裡是 edge 2、7、12 …）。其他 edge 上 a0 = 0 或 mod_out2 = 0 已經把 AND 鎖成 0，p0 是什麼都沒差。
          </li>
          <li>
            <b>p1</b> 只出現在 db1 = b0 · p1。它只在 <b>b0 = 1 的那個 f1↑</b> 影響結果——同樣每個輸出週期一次，而且那是 f1 的 edge，不是 clk 的 edge。
          </li>
        </ul>
        <p>
          用模擬驗證：p1 = 0，p0 在第 k 個 edge 之前由 0 變 1。看第一個 5T interval 出現在哪裡：
        </p>
        <SwitchP0Table />
        <p>
          k = 1 或 2：edge 2 就是 a = 01 且 mod_out2 = 1 的 edge，新的 p0 剛好趕上，第一個週期就是 5T。k = 3 到 6：錯過了 edge 2，要等下一次 a = 01 且 mod_out2 = 1 的 edge（edge 6，因為第一輪 /4 之後 b 在 edge 4 回到 00、a 在 edge 5 進入 01）——第一個週期仍是 4T 結束於 edge 4，但下一個週期立刻變 5T。k = 7、8：連 edge 6 也錯過，多一個 4T。
        </p>
        <Callout kind="note" title="這保證了 phase continuity">
          不管 p0 什麼時候換，interval 只會是 4T 或 5T，沒有第三種長度，也沒有 glitch——因為 p0 不是在切換輸出，而是在改變 state machine 下一次走到叉路口時的選擇（Lesson 3-1 的 A 架構）。代價是「生效時間」不確定：最快這一輪、最慢下下一輪。controller（例如 delta-sigma modulator）必須知道自己送出的 p 會在哪一個輸出週期生效。
        </Callout>
        <ModeContent level="engineer" title="deadline 的具體位置">
          <p>
            p0 的 capture edge 是「a = 01 且 mod_out2 = 1」的那個 clk↑。它前面有 AND_P0 與 AND_A1 兩個 gate，所以 p0 最晚要在該 edge 之前 <Math>{'t_{AND,P0} + t_{AND,A1} + t_{setup}'}</Math> = 10 + 10 + 7 = 27 ps 穩定（再扣 jitter 3、margin 3 是 33 ps）。p1 的 capture edge 是 b0 = 1 的那個 f1↑，前面只有一個 AND_B1：deadline = 10 + 7 = 17 ps（f1↑ 本身比對應的 clk↑ 晚 tCQ + tNOR = 20 ps 才到）。
          </p>
          <p>
            兩個 deadline 落在不同的 edge 上：p0 的 edge 是「輸出週期開始後的第 2 個 clk edge」，p1 的 edge 是「b 進入 01 之後的下一個 f1↑」。換除數時如果 p1、p0 不在同一個安全窗內改變，可能出現一個「p1 新、p0 舊」的中間除數——不是 glitch，但平均除數會差 1 個 T。實務上 controller 用 div_out 的 rising edge（b 剛回到 00）當作更新 p 的時刻：那時距離 p0 的 edge 還有 <b>2T</b>、距離 p1 的 edge 還有 <b>(4 + p0) T</b>。p1 那個距離很容易算錯成 2T，逐 edge 走一次就清楚了：div_out 升起的那個 clk edge 上 b 由 01 回到 00、f1 同時升起，cell 1 帶著 mod_out2 = 1 走一輪 (2 + p0) T；<b>div_out 之後的第一個 f1↑</b> 看到的是 b = 00（b0 = 0）⇒ db1 = b0 · p1 = 0，這個 edge 只是把 b 帶到 01，<b>p1 完全沒被用到</b>；接著 b = 01 ⇒ mod_out2 = 0，cell 1 走一輪 2T，<b>再下一個 f1↑</b>（b0 = 1）才真的取樣 p1。合計 (2 + p0) + 2 = (4 + p0) T。
          </p>
          <p className="small muted">
            模擬核對（<span className="mono">simulate(mmd2, …)</span> 逐 edge 找 div_out↑ 與「f1↑ 且 b0 = 1」）：p1p0 = 00 → div_out↑ 在 edge 4、8、12，p1 的 edge 在 8、12 ⇒ 4T；01 → div_out↑ 在 5、10，p1 的 edge 在 10 ⇒ 5T；10 → div_out↑ 在 6、12，p1 的 edge 在 10、16 ⇒ 4T；11 → div_out↑ 在 7、14，p1 的 edge 在 12、19 ⇒ 5T。四種 mode 都是 (4 + p0) T。p0 的 edge 則固定在 div_out↑ 之後第 2 個 clk edge（6、7、8、9）⇒ 2T。
          </p>
        </ModeContent>
      </Section>

      <Section title="這個架構的 critical path（預告）" en="Critical path preview">
        <p>
          兩級各自的 local 迴路（a0 → NOR1 → da0）和 Lesson 3-2 一樣：tCQ + tNOR。但 MMD 多了一條跨級的路徑：cell 2 在 f1↑ 換 state，經 NOR2 算出 mod_out2，走長線回到 cell 1，再經兩個 AND 進 C1.FF1 的 D——而 C1.FF1 用的是 clk。這條路徑的 launch clock 是 generated clock f1，capture clock 是 clk。
        </p>
        <LogicDiagram schematic={mmd2Schematic} highlights={[hlPath2ModOut, hlF1Clock]} showValues={false} />
        <p>
          注意圖上最長的線是 f1（從 NOR1 拉到 cell 2 的兩個 clock pin）。它<b>不是</b> timing path：它是 clock，沒有 capture flop 在等它的 data。真正要算的是紅色那條：launch 在 C2.FF0（f1↑），capture 在 C1.FF1（clk↑）。先用 explorer 看一眼它的數字，下一課再把六類路徑全部拆開。
        </p>
        <CriticalPathExplorer scenario={mmd2Timing} initialPath="p2-modout2-da1" showEnvControls={false} compact />
        <ModeContent level="engineer" title="先記三個數字">
          <p>
            用 T = 100、tCQ = 8、NOR = 12、AND = 10、tsetup = 7、jitter = 3、margin = 3：local path arrival = 8 + 12 = 20 ps；跨級 path 從 clk edge 算起 arrival = 8 + 12（f1↑）+ 8 + 12（mod_out2）+ 10 + 10（兩個 AND）= 60 ps；required = 100 − 7 − 3 − 3 = 87 ps ⇒ slack 27 ps。p0 = 0 時這條路徑上沒有 transition（AND_P0 鎖死），critical path 退回 local 的 20 ps。
          </p>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>把 p0 的權重算成 2</b>：cell 1 在一個輸出週期裡會走 (2 + p1) 輪，但只有 mod_out2 = 1 的那一輪可以 /3。沒有 modulus-out gating 的話（da1 = a0 · p0），cell 1 每一輪都 /3，N 變成 (2 + p0)·(2 + p1)，四種 mode 給 {'{4, 6, 6, 9}'}——有重複、也不連續，p0 的權重不再是 1。
            </li>
            <li>
              <b>把 f1 那條長線當 critical path</b>：它是 clock。它的延遲決定 cell 2 的 edge 什麼時候到（source latency），影響的是跨級路徑的 arrival 與輸出 latency，不是它自己要滿足什麼 setup。
            </li>
            <li>
              <b>用 buildStateGraph 這種同步觀點分析 MMD</b>：cell 2 的 clock 是 f1，不是 clk。「每個 clk edge 所有 flop 同時更新」的假設不成立；要用 event-driven 模擬（或把 f1 當 enable 改寫成同步等效電路）才能得到正確的 reachability。
            </li>
            <li>
              <b>假設輸出是 50% duty</b>：只有 p1p0 = 00 是。其他 mode 的 high 寬度是 (2 + p0) T，跟 N 沒有固定比例。
            </li>
            <li>
              <b>在任意時刻換 p1p0 又期待立刻生效</b>：p0 只在每個輸出週期的一個 edge 被看，p1 在另一個。換得太晚會晚一個（或兩個）輸出週期才生效；controller 要用 div_out edge 對齊。
            </li>
            <li>
              <b>把「兩個 cell 的輸出經 MUX 選」當成 MMD</b>：MMD 的每一級都是 state-continuous 的 /2 /3 cell，output edge 是下一個 interval 的共同起點（Lesson 3-1）。MUX 選輸出沒有這個性質。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="SystemVerilog（synthesizable，兩級）">
          <CodeBlock
            title="mmd2.sv"
            code={`
module mmd2 (
  input  logic clk,      // VCO clock（最高速）
  input  logic rst_n,    // async active-low reset，四個 flop 共用
  input  logic p0, p1,   // modulus bits：N = 4 + 2*p1 + p0
  output logic div_out
);
  logic a0, a1, b0, b1;
  logic f1, mod_out2, mod1_eff;

  // ---- cell 1（clock = clk）：/2 /3 cell，mod_in = mod_out2 ----
  assign f1       = ~(a1 | a0);          // state 00 時為 1；同時是 cell 2 的 clock
  assign mod1_eff = p0 & mod_out2;       // 後級請求 AND 自己的 modulus bit
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) {a1, a0} <= 2'b00;
    else begin
      a0 <= f1;                          // da0 = NOR(a1, a0)
      a1 <= a0 & mod1_eff;               // da1 = a0 · p0 · mod_out2：只在 state 01 看
    end
  end

  // ---- cell 2（clock = f1：generated clock）：最後一級，mod_in = 1 ----
  assign mod_out2 = ~(b1 | b0);          // b = 00 那一個 f1 週期為 1
  always_ff @(posedge f1 or negedge rst_n) begin
    if (!rst_n) {b1, b0} <= 2'b00;
    else begin
      b0 <= mod_out2;                    // db0 = NOR(b1, b0)
      b1 <= b0 & p1;                     // db1 = b0 · p1
    end
  end
  assign div_out = mod_out2;             // = f2；high 寬度 (2 + p0) T
endmodule
`}
            note="posedge f1 是 generated clock：合成與 STA 要宣告 create_generated_clock（divide_by 2，但實際上是 2 或 3——用最短的 2T 做檢查）。三級版把 mod_out2 改成 f2 & mod_out3、db1 多 AND 一個 mod_out3 即可。"
          />
        </ModeContent>
        <ModeContent level="deep" title="高速實作會遇到的事">
          <ul>
            <li>
              <b>每一級可用時間翻倍</b>：cell 1 的 local path 要在 1T 內完成，cell 2 在 2T（f1 最短週期），cell 3 在 4T。所以只有第一級（有時第二級）需要 CML 或 TSPC 這類高速 flop，後面的級可以用標準 CMOS、更小的 driver，功耗逐級下降——這是 MMD 相對於一個大同步 counter 的主要優勢。
            </li>
            <li>
              <b>但 modulus-out 鏈的可用時間不會翻倍</b>：mod_out<sub>n</sub> 從最後一級一路 AND 回 cell 1，capture 仍在 clk domain。級數越多鏈越長，而 cell 1 的週期不變。常見解法：在每一級用自己的 clock 把 mod_out 重新取樣（retime）一次，把長鏈切成一級一級的 local path；代價是請求晚一個 f<sub>i</sub> 週期到，要重新驗證 N 的公式仍成立（通常改成請求在 b = 01 提出——正是這一課練習的變體）。
            </li>
            <li>
              <b>f1 是 generated clock，high pulse 只有 1T</b>：cell 2 flop 的最小 clock pulse width 在極高速時會比 setup 更早成為限制（Lesson 4-2 的第六類路徑）。NOR 的 rise / fall 不對稱會再吃掉一點。
            </li>
            <li>
              <b>輸出 edge 是「算出來」的</b>：div_out 由 NOR2 decode，它相對 clk edge 的延遲是 tCQ(a) + NOR1 + tCQ(b) + NOR2 ≈ 40 ps，而且隨 PVT、supply noise 變動——那個變動就是 divider 貢獻給 PLL 的 jitter。高性能設計會在最後用 clk 把 div_out 再 retime 一次（同時修掉 decode glitch），代價是這條 retime path 又變成一條跨級 setup path。
            </li>
            <li>
              <b>divide range 的下限</b>：要 N 從 2<sup>n</sup> 以下起算（例如 /3 到 /7），在最後幾級加 bypass，讓 modulus-out 直接從前一級取——這時不同 N 的 latency 不同，controller 要對齊。
            </li>
          </ul>
        </ModeContent>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------- 練習：mod_out2 改在 b = 01 提出請求
function ExerciseComponent() {
  return <DividerSimPanel netlist={mmd2ModAt01} schematic={mmd2ModAt01Schematic} title="變體：mod_out2 = b0 · b̄1（cell 2 在 state 01 才請求 /3）" signals={['clk', 'a0', 'a1', 'f1', 'b0', 'b1', 'mod_out2', 'mod1_eff', 'div_out']} windowCycles={12} showEquations={false} showPulseWidths compact />
}

const lesson: LessonDef = {
  id: 'm4-l1-mmd',
  module: 4,
  order: 1,
  title: '兩級 /2 /3 Cell 可以產生什麼除數',
  titleEn: 'What two cascaded /2 /3 cells can divide by',
  summary: '把兩個 /2 /3 cell 串起來：後級用前級輸出當 clock，再用 modulus-out 回頭要求前級多吞一個 edge。逐 edge 推出 N = 4 + 2·p1 + p0、duty = (2 + p0)/N、divide range 與 resolution，並找出 p0 / p1 各自只在哪一個 edge 被看到。',
  goals: [
    '從 block 圖與 gate-level 圖指出每一級的 clock、state bit、local feedback、modulus control 與 modulus-out。',
    '逐 edge 走完 p1p0 = 01 的 5 個 clk 週期，說出 cell 1 哪一輪走 /3、為什麼只有一輪、div_out 何時翻轉。',
    '推導 N = 2·(2 + p1) + p0 與 n 級的 N = 2^n + Σ p_i·2^i，說出 divide range 與 resolution。',
    '解釋 modulus-out 為什麼要一級一級 AND 回去、最後一級如何決定前級能不能 /3。',
    '指出 p0 只在 a = 01 且 mod_out2 = 1 的 clk edge、p1 只在 b0 = 1 的 f1 edge 被用到，以及這對換除數時機的意義。',
  ],
  readingMinutes: 45,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'single',
      prompt: 'p1p0 = 10 時，cell 2 每個輸出週期用幾個 f1 週期？cell 1 每一輪各走幾個 clk？總除數 N 是多少？',
      options: ['2 個 f1 週期；cell 1 走 3, 3；N = 6', '3 個 f1 週期；cell 1 走 2, 2, 2；N = 6', '3 個 f1 週期；cell 1 走 3, 2, 2；N = 7', '2 個 f1 週期；cell 1 走 2, 2；N = 4'],
      answer: 1,
      explanation: 'p1 = 1 讓 cell 2 走 /3（b：00 → 01 → 10），用 3 個 f1 週期。p0 = 0 使 mod1_eff 恆 0，cell 1 每一輪都是 /2。N = 3 × 2 + 0 = 6。',
    },
    {
      id: 'q2',
      type: 'state',
      prompt: '從 reset（b1b0a1a0 = 0000）開始，p1p0 = 11 固定。經過 4 個 clk rising edge 之後 state（b1 b0 a1 a0）是多少？',
      answer: '0101',
      width: 4,
      bitNames: ['b1', 'b0', 'a1', 'a0'],
      explanation: 'edge 1：a → 01。edge 2：a = 01 且 mod_out2 = 1 且 p0 = 1 ⇒ da1 = 1，a → 10。edge 3：a → 00，f1↑，cell 2 抓 db0 = 1、db1 = b0·p1 = 0 ⇒ b → 01。edge 4：a → 01，f1 下降，b 不變。所以 0101。',
    },
    {
      id: 'q3',
      type: 'numeric',
      prompt: '三級 MMD（cell 3 的 clock = f2，p2 是它的 modulus bit）設 p2p1p0 = 110。總除數 N 是多少？',
      answer: 14,
      explanation: 'N = 2^3 + 4·p2 + 2·p1 + p0 = 8 + 4 + 2 + 0 = 14。也可以數：cell 3 走 3 輪 f2、cell 2 每輪走 3 個 f1（但只有 c = 00 那一輪被允許——所以其實是 3 + 2 + 2 = 7 個 f1）、cell 1 全部 /2 ⇒ 7 × 2 = 14。',
    },
    {
      id: 'q4',
      type: 'waveform',
      prompt: '從 reset 開始、p1p0 = 01 固定不變，哪一個是 div_out？（只顯示 clk 與 div_out）',
      options: [
        { label: 'A', traces: outWave(mmd2, () => ({ p0: 1, p1: 0 })) },
        { label: 'B', traces: outWave(mmd2, () => ({ p0: 0, p1: 0 })) },
        { label: 'C', traces: outWave(mmd2, () => ({ p0: 0, p1: 1 })) },
        { label: 'D', traces: outWave(mmd2ModAt01, () => ({ p0: 1, p1: 0 })) },
      ],
      answer: 0,
      tEnd: 1100,
      period: 100,
      explanation: 'p1p0 = 01：rising edge 在 edge 5、10，high 3T、low 2T（duty 60%）。B 是 /4（4T 週期、50%）；C 是 /6（high 2T、low 4T）；D 也是 /5，但 /3 被搬到 b = 01 那個 f1 週期，所以 high 只有 2T、low 3T（40%）——這是練習的變體。',
    },
    {
      id: 'q5',
      type: 'multiple',
      prompt: '關於 modulus-out（mod_out2 → cell 1）的敘述，哪些正確？',
      options: [
        'mod_out2 = 1 的 f1 週期，每個輸出週期恰好出現一次',
        '若拿掉 mod_out2 的 gating（da1 = a0 · p0），N 會變成 3·(2 + p1)，除數不再連續',
        'p0 = 0 時 mod_out2 那條長線上仍然每個輸出週期 toggle 一次，但 cell 1 不理它',
        'mod_out2 是 cell 1 的 clock，所以它決定 cell 1 什麼時候換 state',
        '三級時 mod_out2 = f2 · mod_out3：只有 cell 2 與 cell 3 都在 00 時才往前傳',
      ],
      answers: [0, 1, 2, 4],
      explanation: 'mod_out2 = NOR(b1, b0) 只在 b = 00 那個 f1 週期為 1，一個輸出週期一次。沒有 gating 時 cell 1 每輪都 /3，N ∈ {6, 9}。p0 = 0 時 AND_P0 把它鎖掉，但 NOR2 的輸出照樣 toggle（它同時是 div_out）。cell 1 的 clock 是 clk，mod_out2 只是 data。三級的 AND 鏈讓請求只在所有後級都在 00 時傳到最前級。',
    },
    {
      id: 'q6',
      type: 'numeric',
      prompt: 'p1p0 = 11（N = 7）時，div_out 的 duty cycle 是多少 %？（取到小數點後一位）',
      answer: 42.9,
      tolerance: 0.3,
      unit: '%',
      explanation: 'div_out 只在 b = 00 那一個 f1 週期為 1，而那個 f1 週期被 p0 = 1 拉長成 3T：duty = (2 + p0)/N = 3/7 = 42.9%。',
    },
    {
      id: 'q7',
      type: 'single',
      prompt: 'p1 = 0，MMD 已在 /4 穩定運作。controller 把 p0 由 0 改成 1，並保證在 edge 5 之前穩定（edge 4 之後）。第一個 5T 的 output interval 從哪一個 rising edge 開始？',
      options: ['從 edge 4 的 rising edge 開始（edge 4 → 9）', '從 edge 8 的 rising edge 開始（edge 8 → 13）', 'edge 5 立刻多一個 T，interval 變成 edge 4 → 10', '不會生效，要等 reset'],
      answer: 0,
      explanation: '/4 mode 下 div_out 在 edge 4 升起、b 回到 00。a 在 edge 5 進入 01，edge 6 就是「a = 01 且 mod_out2 = 1」的 edge；p0 在 edge 5 之前穩定，edge 6 抓到 da1 = 1，這一輪 cell 1 走 /3，週期變成 edge 4 → 9 = 5T。模擬表（k = 5）：rising edge 4, 9, 14。若在 edge 6 之後才穩定（k = 7），就錯過這一次，要多等一個 4T：rising edge 4, 8, 13。',
    },
  ],
  exercise: {
    title: '變體：cell 2 改在 state 01 才提出 /3 請求',
    prompt: (
      <>
        <p>
          下面的電路只改了一個 gate：mod_out2 不再是 NOR(b1, b0)，而是 <span className="mono">b0 · b̄1</span>——cell 2 在 b = 01 那個 f1 週期才請求 cell 1 走 /3。f2 = NOR(b1, b0) 仍然是 db0 與 div_out。先不要按模擬，自己推：
        </p>
        <ol>
          <li>p1p0 = 01 時，cell 1 哪一輪走 /3？是 b = 00 那一輪，還是 b = 01 那一輪？</li>
          <li>N 有沒有變？為什麼？</li>
          <li>div_out 的 high 寬度是幾個 T？duty 變成多少？</li>
          <li>state 主循環（b1b0a1a0）長什麼樣？會出現哪一個原版沒有的 state？</li>
        </ol>
        <p>推完再用模擬器驗證四種 mode。</p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: ['寫出 mod_out2 的新式子，指出它在哪一個 f1 週期為 1', '四種 mode 的 N 各是多少（與原版比）', 'p1p0 = 01 的 state 主循環與 duty', '這個改法對 modulus-out 的 timing 有什麼好處或壞處'],
    answer: (
      <>
        <p>
          <b>N 不變</b>：cell 2 每個輸出週期仍然恰好有一個 f1 週期 mod_out2 = 1（現在是 b = 01 那一個），cell 1 仍然每個輸出週期最多走一次 /3。四種 mode 依舊是 4、5、6、7。
        </p>
        <p>
          <b>但 /3 的位置搬了</b>。p1p0 = 01 的主循環變成 0001 → 0100 → 0101 → 0110 → 0000：cell 1 先走 /2（b = 00 那輪），再走 /3（b = 01 那輪），多出 state 0110（b = 01、a = 10）。div_out 仍在 b = 00 時為 1，但 b = 00 那一個 f1 週期現在只有 2T，所以 high = 2T、low = 3T，duty 由 3/5 變成 2/5；p1p0 = 11 由 3/7 變 2/7。output rising edge 的位置也整個平移一個 T。
        </p>
        <p>
          <b>timing 上的意義</b>：請求在 b 進入 01 時提出，而 b = 01 之前 cell 1 剛好在 /2 那一輪——cell 1 要到<b>下一輪</b>的 a = 01 edge 才會用到它。mod_out2 因此多了一整個 f1 週期（≥ 2T）的餘裕，這就是把 modulus-out 一級一級 retime 時常用的形式。代價是 duty 更遠離 50%，以及三級以上時 mod_out 鏈的對齊條件要重新推導（「所有後級都在 00」不再成立，要改成「所有後級都在各自的請求 state」）。
        </p>
      </>
    ),
  },
}
export default lesson
