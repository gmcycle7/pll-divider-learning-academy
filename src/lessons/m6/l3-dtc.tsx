import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { StateDiagram, graphToDiagram } from '@/components/circuit/StateDiagram'
import { DtcCarryVisualizer } from '@/components/dtc/DtcCarryVisualizer'
import { buildStateGraph } from '@/models/divider/analysis'
import { splitCode } from '@/models/phase/dtc'
import { carryEdgeTraces, fineCodePeriod, phaseCounter16, phaseCounter8 } from './models'
import { phaseCounter16Schematic, phaseCounter8Schematic, phaseCounter8Timing } from './schematics'
import { CarryArchitectureTimeline, CarryArchitectureWaveform, ControlWordSplitter, DtcRangeCompare } from './Widgets'

/** 課文引用的數字全部由模型算出（T_vco = 100 ps，3-bit PMUX + 6-bit DTC） */
const CFG = { coarseBits: 3, fineBits: 6 }
const TVCO = 100
const LSB_PS = TVCO / 512 // 0.1953125 ps
const PMUX_PS = TVCO / 8 // 12.5 ps（一個 PMUX step = 64 個 LSB）
const c300 = splitCode(300, CFG) // coarse 4, fine 44
const c600 = splitCode(600, CFG) // overflow 1, coarse 1, fine 24
const finePeriod100 = fineCodePeriod(100, 6) // 16
const counterGraph = graphToDiagram(buildStateGraph(phaseCounter8, { inc: 1 }))

/** quiz 用：由 event 產生的 (a)/(b) 波形（N = 2，每週期前進 3 個 phase，M = 8） */
const waveA = carryEdgeTraces(2, 8, 3, 8, 'divider', TVCO)
const waveB = carryEdgeTraces(2, 8, 3, 8, 'none', TVCO)
const waveFixed = carryEdgeTraces(2, 8, 0, 8, 'divider', TVCO)
const waveStep5 = carryEdgeTraces(2, 8, 5, 8, 'divider', TVCO)

function Content() {
  return (
    <>
      <Section title="先用直覺想：一把三段刻度的尺" en="Intuition">
        <p>
          Lesson 5 的 PMUX 可以把 output edge 挪動 <Math>{'T_{vco}/8'}</Math>（8 GHz 時 15.6 ps，這一課統一用 <Math>{'T_{vco}'}</Math> = 100 ps，所以是 12.5 ps）。Lesson 6-1、6-2 的 fractional divider 只能挪整數個 <Math>{'T_{vco}'}</Math>，靠 DSM 把誤差推到高頻。如果需要的 edge 位置落在兩個 PMUX phase <b>之間</b>——例如比 ph4 晚 8.59 ps——怎麼辦？
        </p>
        <p>
          想像一把游標卡尺：主尺一格 1 cm（divider 的整數週期，1 <Math>{'T_{vco}'}</Math>），副尺一格 1 mm（PMUX 的 phase，<Math>{'T_{vco}/8'}</Math>），再加一個微調螺旋，一格 1/64 mm（<Term zh="數位時間轉換器" en="digital-to-time converter, DTC" />，把 edge 再延遲 0 … 63 個小格）。量任何長度都是：先數幾個 cm，再數幾個 mm，最後轉微調螺旋。<b>三段刻度必須首尾相接</b>：微調轉滿 64 格剛好等於副尺一格；副尺走滿 8 格剛好等於主尺一格。
        </p>
        <CompareTable
          head={['刻度', '硬體', '一格 = ？', 'ps（T_vco = 100 ps）', '可表示範圍', '對應的 control bits']}
          rows={[
            ['主尺（整數）', 'MMD / /N /N+1 divider', '1 T_vco', '100', 'N, N+1, …', '（divider 的 N 與 modulus control）'],
            ['副尺（coarse）', '8-phase PMUX', 'T_vco / 8', '12.5', '0 … 7 個 phase', '3-bit PMUX code'],
            ['微調（fine）', 'DTC', 'T_vco / 512', '0.1953', '0 … 63 個 code = 0 … 12.3 ps', '6-bit DTC code'],
          ]}
        />
        <p>
          把 3-bit PMUX code 與 6-bit DTC code 接在一起，就是一個 9-bit 的 <Term zh="相位控制字" en="phase control word" />：它決定 output edge 相對於整數格線的偏移量。這件事叫 <Term zh="相位偏移選擇" en="phase-offset selection, PHOS" />。理想上 9-bit 可以把 edge 放在 512 個位置之中的任何一個；實際上 DTC 不是理想的尺，量化後的位置與理想位置之間留下的差叫 <Term zh="殘餘相位" en="residual phase" />。
        </p>
        <Callout kind="idea">
          這一課的核心只有一句話：<b>「數字上的進位」與「硬體上該走的那一大格」是兩件事</b>。微調轉滿 64 格會在數字上進位到副尺；但除非有人把副尺真的推一格，長度不會自己變長。PMUX index 從 7 回到 0 會在數字上進位到主尺；但除非 divider 真的多走一個 <Math>{'T_{vco}'}</Math>，edge 就會<b>倒退</b>一整個週期。誰吸收 carry，是架構要定義的事，不能從「有 carry」直接推論「divider 一定改 interval」。
        </Callout>
      </Section>

      <Section title="9-bit control word：coarse / fine 怎麼切" en="The 9-bit control word">
        <p>
          先把「一個數字怎麼拆成三段刻度」練熟。設 coarse 有 <Math>{'c'}</Math> bit（<Math>{'M = 2^c'}</Math> 個 phase）、fine 有 <Math>{'f'}</Math> bit（<Math>{'F = 2^f'}</Math> 個 DTC code 對應一個 PMUX step），control word <Math>{'C'}</Math>：
        </p>
        <Math block>{'C = \\text{coarse}\\cdot F + \\text{fine},\\qquad 0 \\le \\text{fine} < F,\\quad 0 \\le \\text{coarse} < M'}</Math>
        <Math block>{'\\phi = \\frac{C}{M F}\\,T_{vco} = \\frac{\\text{coarse}}{M}\\,T_{vco} + \\frac{\\text{fine}}{M F}\\,T_{vco},\\qquad t_{LSB} = \\frac{T_{vco}}{M F}'}</Math>
        <p>
          變數與單位：<Math>{'T_{vco}'}</Math> = VCO 週期（ps）；<Math>{'\\phi'}</Math> = edge 相對整數格線的偏移（ps）；<Math>{'t_{LSB}'}</Math> = 一個 DTC code 的時間（ps）。3 + 6 bit、<Math>{'T_{vco}'}</Math> = 100 ps：<Math>{'M = 8'}</Math>、<Math>{'F = 64'}</Math>、<Math>{'MF = 512'}</Math>、<Math>{'t_{LSB} = 100/512'}</Math> = {LSB_PS.toFixed(4)} ps、一個 PMUX step = 64 個 LSB = {PMUX_PS.toFixed(1)} ps。
        </p>
        <p>拿 code 300 來做一次。先自己算，再按下面的工具對答案：</p>
        <Steps
          items={[
            <>
              <b>有沒有 overflow？</b>300 &lt; 512，沒有。整個 code 放得進 9-bit word。
            </>,
            <>
              <b>裡面有幾個 64？</b>300 = 4 × 64 + 44 ⇒ coarse = <b>{c300.coarse}</b>（選 ph4），fine = <b>{c300.fine}</b>。
            </>,
            <>
              <b>edge 在哪裡？</b>4/8 + 44/512 = 0.5 + 0.0859 = <b>{c300.phaseT.toFixed(5)} T<sub>vco</sub></b> = 50 ps + 8.59 ps = {(c300.phaseT * TVCO).toFixed(2)} ps。這就是「比 ph4 晚 8.59 ps」。
            </>,
            <>
              <b>換 600 試試</b>：600 = 1 × 512 + 88 ⇒ overflow = {c600.overflow}（跨過一整個 T<sub>vco</sub> 一次）；88 = 1 × 64 + 24 ⇒ coarse = {c600.coarse}、fine = {c600.fine}。9-bit word 只記得 88，那個「1」到哪裡去了？——先記住這個問題。
            </>,
          ]}
        />
        <ControlWordSplitter cfg={CFG} initialCode={300} tvcoPs={TVCO} />
        <Callout kind="note" title="二進位切法為什麼方便">
          F = 64 = 2<sup>6</sup>，所以「除以 64 取商與餘數」在硬體上就是<b>把 9-bit 直接切成高 3 bit 與低 6 bit</b>，不需要除法器。上面工具的 bit-field 用兩種顏色標出來：高 3 bit 直接接 PMUX 的 select，低 6 bit 直接接 DTC 的 code。這也是為什麼 M 與 F 幾乎永遠取 2 的冪次。
        </Callout>
      </Section>

      <Section title="最簡單的電路：phase index counter" en="The circuit">
        <p>
          PHOS 的 control word 通常不是常數，而是每個 output 週期<b>累加</b>一個 increment（想得到 N + 100/512 的平均除數，就每週期把 word 加 100）。累加器的最上層——coarse 的 3 bit——就是 Lesson 5-1 的 phase index 0 … 7。把它單獨拿出來看：一個 3-bit counter，inc = 1 時每個 edge 加一，index = 7 再加一就回到 0 並產生 <span className="mono">carry</span>：
        </p>
        <LogicDiagram schematic={phaseCounter8Schematic} showValues={false} />
        <ul>
          <li>
            <b>Clock input</b>：<span className="mono">clk</span> 是 <b>output-rate</b> 的 clock（每個 output 週期一個 edge，週期 = N·T<sub>vco</sub> = 400 ps），不是 VCO clock。accumulator 每個 output 週期只需要走一步。
          </li>
          <li>
            <b>Memory elements</b>：P0 / P1 / P2，state = <span className="mono">p2 p1 p0</span> 就是目前選的 phase index。
          </li>
          <li>
            <b>Feedback paths</b>：ripple-carry 型的加一：<span className="mono">dp0 = p0 ⊕ inc</span>、<span className="mono">t1 = inc·p0</span>、<span className="mono">dp1 = p1 ⊕ t1</span>、<span className="mono">t2 = t1·p1</span>、<span className="mono">dp2 = p2 ⊕ t2</span>。
          </li>
          <li>
            <b>Carry decode</b>：<span className="mono">carry = inc·p0·p1·p2</span>——用一個 4-input AND 直接 decode「index = 7 而且這個週期要加一」，而不是把 AND chain 再串一級（chain 在 011 → 100 這類多 bit 同時翻轉時會有短暫的 hazard；Lesson 6-1 的 pitfall）。
          </li>
        </ul>
      </Section>

      <Section title="逐一個 clock edge 操作：看 carry 什麼時候出現" en="Edge by edge">
        <p>
          從 reset（<span className="mono">p2 p1 p0 = 000</span>，inc = 1）開始。每按一次「下一個 Clock Edge」先自己回答：現在的 index 是多少？下一個 edge 之後是多少？carry 什麼時候變 1、維持多久？
        </p>
        <DividerSimPanel
          netlist={phaseCounter8}
          schematic={phaseCounter8Schematic}
          options={{ period: 400 }}
          title="3-bit phase index counter（output-rate clock，T = N·Tvco = 400 ps）"
          windowCycles={10}
          showDelayMode
        />
        <Steps
          items={[
            <>
              <b>初始（000）</b>：index 0，選 ph0。carry = inc·0·0·0 = 0。XOR0 已經算好 dp0 = 0 ⊕ 1 = 1 在 D pin 前面等。
            </>,
            <>
              <b>edge 1 … 7</b>：001 → 010 → 011 → 100 → 101 → 110 → 111。每個 edge index 加一：output edge 每個週期往後挪一個 phase（+12.5 ps）。到 edge 7 之後 state = 111（index 7，選 ph7）。
            </>,
            <>
              <b>state 111 期間</b>：carry = 1·1·1·1 = <b>1</b>。注意它是 combinational output，在 state 111 的<b>整個週期</b>都是 1——它在說「下一次加一會 wrap」。
            </>,
            <>
              <b>edge 8</b>：111 → 000。index 回到 0，carry 回到 0。數字上這是一次「進位」：8 個 phase 走完一圈。
            </>,
            <>
              <b>結論</b>：state 序列週期 8，carry 每 8 個 edge 出現一次、寬一個 output 週期（duty 1/8）。模擬器量到的 carry rising edge 在 t = 7T、15T——面板的 clk 週期設成 T = N·T<sub>vco</sub> = 400 ps，所以那是 <b>2800 ps</b> 與 <b>6000 ps</b>，與這一課其他地方的 400 ps output 週期對得起來。<b>到目前為止，divider 什麼都還沒被告知。</b>
            </>,
          ]}
        />
        <StateDiagram {...counterGraph} width={560} height={300} title="p2 p1 p0：inc = 1 時 8 個 state 都在環上；output = carry（只在 111 為 1）" />
        <Callout kind="warning" title="carry 是「表示法」的進位，不是「時間」的進位">
          從 ph7 選到 ph0，output edge 的位置從 7/8 T<sub>vco</sub> 變成 0/8 T<sub>vco</sub>。如果 divider 仍然只走 N 個 T<sub>vco</sub>，這個 edge 會比上一個 edge 只晚 N − 7/8 個 T<sub>vco</sub>——<b>提早了一整個 T<sub>vco</sub></b>。要讓 edge 繼續往前走 1/8 T<sub>vco</sub>，那個週期 divider 必須走 N + 1。carry 訊號存在，只表示「這裡跨過了 boundary」；<b>誰去把那一整個 T<sub>vco</sub> 補回來</b>，是架構要定義的。
        </Callout>
      </Section>

      <Section title="累加 increment：fine 進位到 coarse、coarse 進位到 integer" en="Accumulating the control word">
        <p>
          現在把 fine 也接上：9-bit accumulator 每個 output 週期加 increment = 100，integer divider N = 4，目標平均除數 4 + 100/512 = 4.1953125。用手算前 6 步，每一步都問兩個問題：fine 加完超過 63 沒有（fine → coarse 的進位）？coarse 加完超過 7 沒有（coarse → integer 的進位）？
        </p>
        <Steps
          items={[
            <>
              <b>k = 1</b>：fine 0 + 100 = 100 = 1 × 64 + 36 ⇒ fine = 36，進 1 給 coarse；coarse 0 + 1 = 1。edge 在 1·4 + 1/8 + 36/512 = 4.1953 T<sub>vco</sub>。
            </>,
            <>
              <b>k = 2</b>：36 + 100 = 136 = 2 × 64 + 8 ⇒ fine = 8，進 <b>2</b>（increment 本身就超過一個 PMUX step，所以進位可以是 2）；coarse 1 + 2 = 3。
            </>,
            <>
              <b>k = 3</b>：8 + 100 = 108 = 1 × 64 + 44 ⇒ fine = 44，進 1；coarse 3 + 1 = 4。對照上一節：total code 300 ⇒ coarse 4、fine 44，一樣。
            </>,
            <>
              <b>k = 4</b>：44 + 100 = 144 = 2 × 64 + 16 ⇒ fine 16，進 2；coarse 6。<b>k = 5</b>：16 + 100 = 116 ⇒ fine 52，進 1；coarse 7（ph7，最後一個 phase）。
            </>,
            <>
              <b>k = 6</b>：52 + 100 = 152 = 2 × 64 + 24 ⇒ fine 24，進 2；coarse 7 + 2 = 9 = <b>1 × 8 + 1</b> ⇒ coarse wrap 回 1，<b>coarse → integer carry = 1</b>。total code 600 = 512 + 88，與上一節的 overflow 一致。在架構 (a) 裡，這個週期 divider 走 N + 1 = 5 個 T<sub>vco</sub>：edge 在 (6·4 + 1) + 1/8 + 24/512 = 25.1719 = 6 × 4.1953 T<sub>vco</sub>，剛好落在理想時刻上。
            </>,
            <>
              <b>結論</b>：累加 100 六次，fine → coarse 的進位是 1, 2, 1, 2, 1, 2（每步都有），coarse → integer 的進位只有<b>一次</b>（第 6 步）。兩種 carry 是不同層次的事：前者只是在同一個 T<sub>vco</sub> 裡換一個 phase，後者才需要 divider 配合。
            </>,
          ]}
        />
        <DtcCarryVisualizer cfg={CFG} initialIncrement={100} initialN={4} initialSteps={12} tvcoPs={TVCO} />
        <p className="small muted">
          試試看：increment 改成 64（剛好一個 PMUX step）——DTC code 永遠是 0，只有 PMUX 在轉，每 8 步 wrap 一次。改成 1——64 步之後 fine 才第一次進位到 coarse，512 步之後（超出視窗）才 wrap。改成 511——每步幾乎走滿一整個 T<sub>vco</sub>，每步都 wrap。把「步數」拉到 64、increment 設 1，看 fine 從 63 跨到 0 的那一步：DTC code 歸零、PMUX index 加一，edge 只前進了一個 LSB——這就是 <Term zh="邊界跨越" en="boundary crossing" />，兩段刻度必須接得剛剛好。
        </p>
      </Section>

      <Section title="數學：edge 時間、平均除數、residual" en="Edge time, average ratio, residual">
        <p>
          設 accumulator 在第 k 個 output 週期後的值為 <Math>{'A_k = k\\,I'}</Math>（I = increment，code 單位，從 0 起算），divider 的基本除數 N。把 <Math>{'A_k'}</Math> 拆成 overflow 次數與 9-bit 餘數：
        </p>
        <Math block>{'A_k = o_k\\,(MF) + C_k,\\qquad o_k = \\left\\lfloor \\frac{A_k}{MF} \\right\\rfloor,\\quad C_k = A_k \\bmod MF = \\text{coarse}_k \\cdot F + \\text{fine}_k'}</Math>
        <p>
          <b>架構 (a)</b>：每次 coarse wrap 那個週期 divider 走 N + 1，所以到第 k 個 edge 為止 divider 總共走了 <Math>{'kN + o_k'}</Math> 個 <Math>{'T_{vco}'}</Math>，再加上 control word 的偏移：
        </p>
        <Math block>{'t_k^{(a)} = \\Big(kN + o_k + \\frac{C_k}{MF}\\Big)T_{vco} = \\Big(kN + \\frac{A_k}{MF}\\Big)T_{vco} = k\\Big(N + \\frac{I}{MF}\\Big)T_{vco}'}</Math>
        <p>
          最後一步用了 <Math>{'o_k + C_k/(MF) = A_k/(MF)'}</Math>。結果是 k 的線性函數：<b>每個 edge 都準確落在理想時刻</b>，相鄰間隔固定為 <Math>{'(N + I/MF)\\,T_{vco}'}</Math>，平均除數
        </p>
        <Math block>{'N_{avg} = N + \\frac{I}{MF} = 4 + \\frac{100}{512} = 4.1953125'}</Math>
        <p>
          <b>架構 (b)</b>：divider 永遠走 N，coarse 自己 wrap。少掉的正是 <Math>{'o_k'}</Math>：
        </p>
        <Math block>{'t_k^{(b)} = \\Big(kN + \\frac{C_k}{MF}\\Big)T_{vco} = t_k^{(a)} - o_k\\,T_{vco}'}</Math>
        <p>
          每 wrap 一次 edge 就比理想早一個 <Math>{'T_{vco}'}</Math>，誤差 <Math>{'-o_k T_{vco}'}</Math> 像樓梯一路往下；長期平均除數退回 N。變數與單位：<Math>{'t_k'}</Math> = 第 k 個 output edge 的時間（ps）；<Math>{'o_k'}</Math> = 到第 k 步為止 coarse wrap 的次數（無單位）；<Math>{'I, A_k, C_k'}</Math> 都是 code（無單位）。
        </p>
        <p>
          <Term zh="殘餘相位" en="residual phase" /> 是實際 edge 與理想 edge 的差：
        </p>
        <Math block>{'r_k = t_{k,actual} - k\\,N_{avg}\\,T_{vco}'}</Math>
        <p>它有三個來源，要分開看：</p>
        <ol>
          <li>
            <b>量化</b>：想要的分數不是整數個 code（例如 N + 1/3 需要 I = 170.67）。取 I = 171 會讓平均除數差 0.33/512；正確做法是把 Lesson 6-2 的 DSM 放在 accumulator 的 LSB 上，讓 I 在 170 與 171 之間切換——residual 被限制在 ±1 個 <Math>{'t_{LSB}'}</Math> 內並被 noise-shape。這一課的例子 I = 100 是整數，量化 residual = 0。
          </li>
          <li>
            <b>DTC gain error</b>：DTC 每個 code 實際延遲 <Math>{'(1+\\varepsilon)\\,t_{LSB}'}</Math>，那麼 <Math>{'r_k = \\varepsilon\\,\\text{fine}_k\\,t_{LSB}'}</Math>——residual 跟著 fine code 走。上面的工具把 gain error 拉到 +5%：fine = 63 時 residual = 0.05 × 63 × 0.1953 = 0.62 ps；fine = 0 時 0。fine<sub>k</sub> = (36k) mod 64 每 {finePeriod100} 步重複一次，所以 residual 是週期 {finePeriod100} 的鋸齒 ⇒ 在 f<sub>out</sub>/{finePeriod100} 出現 spur（Lesson 6-1 的道理，只是幅度小很多）。
          </li>
          <li>
            <b>DTC 非線性（INL）</b>：延遲對 code 不是直線，residual 是 code 的任意函數 <Math>{'r_k = \\mathrm{INL}(\\text{fine}_k)'}</Math>。同樣是確定性的、週期性的 ⇒ spur；而且在 boundary crossing（fine 63 → 0 同時 coarse + 1）時，DTC 的 full-scale 若不等於一個 PMUX step，edge 會跳一下。這是 DTC-based PLL 一定要做 gain / INL calibration 的原因。
          </li>
        </ol>
        <Callout kind="formula" title="一句話">
          <Math block>{'t_k = \\underbrace{\\Big(kN + o_k\\Big)T_{vco}}_{\\text{divider（整數，含吸收的 carry）}} + \\underbrace{\\frac{\\text{coarse}_k}{M}T_{vco}}_{\\text{PMUX}} + \\underbrace{\\frac{\\text{fine}_k}{MF}T_{vco}}_{\\text{DTC（理想）}} + \\underbrace{r_k}_{\\text{residual}}'}</Math>
          三段刻度各出一部分；只有當 divider 真的吃掉 <Math>{'o_k'}</Math> 時，前三項的和才是 <Math>{'k\\,N_{avg}\\,T_{vco}'}</Math>。
        </Callout>
      </Section>

      <Section title="overflow carry 由誰吸收：兩種架構的 edge timeline" en="Who absorbs the carry">
        <p>
          正確性要求裡有一條：<b>DTC / PMUX 的 overflow carry 與 divider 的 modulus control，在沒有架構定義時不能直接畫等號</b>。用同一組 rotation（N = 4，每週期前進 1 個 phase）把兩種做法的 edge 都畫出來：
        </p>
        <ul>
          <li>
            <b>(a) carry 加到 MMD 的 N</b>：coarse wrap 的那個週期，MMD 的 modulus control 讓它走 N + 1。這等於 Lesson 5-3 架構 2（PMUX → /N /N+1）加上「wrap 時 mod = 1」的規則，也等於把 carry 當成 Lesson 6-2 DSM 輸出的一部分送進 MMD。
          </li>
          <li>
            <b>(b) PMUX 自己 wrap、divider 不變</b>：counter 照樣從 7 回到 0，carry 訊號沒有接到任何地方（或接了但架構沒有定義它該做什麼）。
          </li>
        </ul>
        <CarryArchitectureTimeline initialN={4} phases={8} initialStep={1} count={12} tvcoPs={TVCO} />
        <Steps
          items={[
            <>
              <b>k = 0 … 7</b>：兩種架構完全一樣。index 0, 1, …, 7，edge 在 0, 4.125, 8.25, …, 28.875 T<sub>vco</sub>；相對整數格線 k·N 的偏移 0, 1/8, 2/8, …, 7/8，<b>單調遞增</b>。
            </>,
            <>
              <b>k = 7 → 8（wrap）</b>：index 7 + 1 = 8 ⇒ 回到 0，carry = 1。(a)：divider 這個週期走 5 個 T<sub>vco</sub>，edge 8 在 28 + 5 + 0/8 = 33 = 8 × 4.125 ✓。(b)：divider 走 4 個，edge 8 在 28 + 4 + 0 = 32——比理想 33 <b>早一個 T<sub>vco</sub></b>，這個週期的間隔只有 3.125。
            </>,
            <>
              <b>k = 8 … 16</b>：(a) 繼續每個間隔 4.125，偏移 1, 9/8, 10/8 … 繼續往上走。(b) 的偏移從 7/8 掉回 0 再重新爬：鋸齒，每 wrap 一次累積誤差再多 −1 T<sub>vco</sub>；16 個 edge 的平均間隔是 4.0，不是 4.125。
            </>,
            <>
              <b>把 N 調到 1</b>：(b) 在 wrap 那個週期的間隔變成 1 − 7/8 = 1/8 T<sub>vco</sub> = 12.5 ps——divider 被要求在上一個 edge 之後 12.5 ps 就再輸出一個 edge。這不是「平均除數不對」而已，而是 Lesson 5-2 的 runt / pulse-width violation。
            </>,
          ]}
        />
        <p>
          同一件事用真實波形看（所有 edge 都由 event 資料產生；理想 edge 用 marker 標出；N = 2、每週期前進 3 個 phase 讓 wrap 更頻繁、位移更明顯）：
        </p>
        <CarryArchitectureWaveform initialN={2} phases={8} initialStep={3} count={8} tvcoPs={TVCO} minPulsePs={40} />
        <Callout kind="method" title="判斷一個架構有沒有把 carry 接對：三個檢查">
          <ol style={{ margin: 0 }}>
            <li>
              <b>間隔是否固定</b>：相鄰 output edge 的間隔是否每一個都等於 <Math>{'(N + I/MF)\\,T_{vco}'}</Math>？只要有一個週期跳成 <Math>{'N - (M-\\text{step})/M'}</Math>，就是 carry 沒被吸收。
            </li>
            <li>
              <b>偏移是否單調</b>：edge 相對整數格線的偏移應該一路往上（forward rotation）或一路往下（backward rotation），不能鋸齒。鋸齒 = 每次 wrap 丟掉或多算一個 <Math>{'T_{vco}'}</Math>。
            </li>
            <li>
              <b>長期平均</b>：量整數個 wrap 週期的平均除數，應該是 <Math>{'N + I/MF'}</Math>，不是 N。
            </li>
          </ol>
          只有 (a) 三項都過。注意「(a)」不是唯一正確解——carry 也可以由 DSM 的 integer path 吃掉、或反過來由 divider 產生 phase step（Lesson 5-3 架構 3）——重點是<b>必須有人吃掉，而且在對的週期吃掉</b>。
        </Callout>
        <ModeContent level="deep" title="carry 的 latency 也要對齊">
          <p>
            架構 (a) 的推導假設 wrap 那個週期 divider 立刻走 N + 1。實際上 carry 從 output-rate 的 accumulator 出來，要 retime 到 MMD 的 VCO clock domain、再等 MMD 下一次取樣 modulus——如果晚了一個 output 週期才吃到，edge k+1 會早一個 <Math>{'T_{vco}'}</Math>、edge k+2 才追回來：每次 wrap 一個單週期的 −1 <Math>{'T_{vco}'}</Math> 誤差。長期平均仍然對（每個 carry 都被吃到一次），但這個確定性的誤差週期 = wrap 週期（I = 100 時是 512/gcd(100, 512) = 128 個 output 週期）⇒ 在 f<sub>out</sub>/128 長出一根很大的 spur（幅度一整個 T<sub>vco</sub>，比 DTC gain error 的 0.6 ps 大兩個數量級）。所以 carry 不只要「被吸收」，還要在<b>正確的週期</b>被吸收；設計上通常讓 accumulator 提前一個週期算出 carry（pipelining），或直接把 accumulator 放在 MMD 的 modulus 決策點之前。
          </p>
        </ModeContent>
      </Section>

      <Section title="DTC 的範圍只需要涵蓋一個 PMUX step" en="DTC range">
        <p>
          很多人第一直覺是「DTC 要能延遲 0 … 1 個 <Math>{'T_{vco}'}</Math>」。看一下 9-bit word 的切法就知道不必：fine 只有 0 … 63，最大延遲 63 × 0.1953 = 12.3 ps，<b>剛好差一個 LSB 就到下一個 PMUX phase</b>。DTC 只要涵蓋一個 PMUX step（12.5 ps）加上製程 / 溫度 / 電壓的 margin（例如 +25% ⇒ 15.6 ps，80 個 code），超過的部分由 PMUX 換 phase 去做。
        </p>
        <DtcRangeCompare tvcoPs={TVCO} totalBits={9} marginPct={25} />
        <p>
          為什麼要斤斤計較 range？DTC 通常是一串可切換的電容或電流源，延遲愈長：(1) 延遲元件自己的 thermal noise 對 jitter 的貢獻愈大（jitter 大致隨延遲的平方根增加）；(2) INL 愈難壓（長延遲線的非線性累積）；(3) 面積與功耗愈大；(4) 對供電雜訊愈敏感。<b>PMUX 出粗刻度、DTC 只做細刻度</b>，就是把 DTC 的 range 壓到最小的方法——這正是 PHOS 相對於「純 DTC 做整個 <Math>{'T_{vco}'}</Math>」的價值。
        </p>
        <Callout kind="warning" title="range 縮小的代價：boundary 必須接得剛好">
          DTC 的 full scale（64 個 code）必須等於一個 PMUX step，誤差直接變成 boundary crossing 時的 edge 跳動。DTC gain 會隨 PVT 漂 ±10% 以上，所以要留 margin、而且要 calibration：常見做法是 background LMS——用 PD 輸出的符號與 fine code 的相關性去修正 gain（residual 與 fine code 相關 ⇒ gain 不對）。calibration 收斂後 residual 只剩 INL 與雜訊。
        </Callout>
      </Section>

      <Section title="這個架構的 critical path" en="Critical path">
        <p>
          先問 launch 與 capture：phase index counter 用 output-rate clock（週期 400 ps），它內部的 register-to-register path 有很多時間；真正緊的是「carry 交給 MMD」與「control word 交給 PMUX / DTC」這兩種<b>跨出 counter</b> 的 path。
        </p>
        <Callout kind="method" title="三條 path，各自在問什麼">
          <ol style={{ margin: 0 }}>
            <li>
              <b>counter 內部 carry chain</b>：P0（edge k 送出 p0）→ AND0 → AND1 → XOR2 → P2.D（edge k+1 抓）。只有 inc = 1 且 p0 = p1 = 1 時才會被 sensitize（3 → 4 或 7 → 0 那個週期），但每 4 個週期就發生一次，所以要算。可用時間一個 output 週期 = 400 ps。
            </li>
            <li>
              <b>carry → MMD modulus（interface path）</b>：P2（edge k）→ AND (wrap) → carry → MMD 取樣 modulus 的 edge。這條決定 wrap 那個週期 MMD 是否<b>真的</b>走 N + 1——也就是架構 (a) 成不成立的 timing 條件。
            </li>
            <li>
              <b>inc → XOR0 → P0.D（control path）</b>：inc 若由更上層的 DSM 產生，必須在 counter edge 前 t<sub>XOR</sub> + t<sub>setup</sub> 穩定，否則「這個週期要不要往前轉一個 phase」不確定。
            </li>
          </ol>
        </Callout>
        <CriticalPathExplorer scenario={phaseCounter8Timing} guided />
        <ModeContent level="engineer" title="Timing equation 與數字">
          <Math block>{'T_{clk} \\ge t_{CQ,max} + t_{logic,max} + t_{setup} + t_{skew} + t_{jitter} + t_{margin}'}</Math>
          <p>
            carry chain：8 + (10 + 10 + 12) + 7 + 0 + 5 + 5 = <b>57 ps</b>，clock 週期 400 ps ⇒ slack 343 ps。同一條 chain 若改用 VCO clock（100 ps）跑，slack 只剩 43 ps——這就是為什麼 accumulator 一律放在 output-rate domain。變數：t<sub>CQ,max</sub> = flop clock-to-Q 最大值；t<sub>logic,max</sub> = path 上 gate 延遲最大值的和；t<sub>setup</sub> = capture flop 的 setup；t<sub>skew</sub> = capture clock 到達 − launch clock 到達；t<sub>jitter</sub> = 相鄰 edge 間隔的不確定量；t<sub>margin</sub> = 設計裕度。單位 ps。
          </p>
          <p>
            carry → MMD：launch 在 counter 的 edge，capture 是 MMD <b>第一次</b>取樣 modulus 的 edge。deadline 一定要取<b>最早可能</b>的那個 capture edge——Lesson 6-2 已經推過：MMD 最早在下一個 output 週期的第一個 cell state 01 取樣 modulus，也就是 output edge 之後 <b>1 個 T<sub>vco</sub></b>（100 ps，scenario 的 periodFraction = 0.25）。可用 100 ps，path 8 + 14 = 22 ps，MMD 端 modulus → d1 的 AND + setup 合計 40 ps，jitter 5、margin 5 ⇒ slack = 100 − 22 − 40 − 5 − 5 = <b>28 ps</b>。
          </p>
          <p>
            所以這條 path <b>一點都不寬鬆</b>：28 ps 在一個<b>跨 clock domain</b>（output-rate → VCO-rate）的介面上幾乎不夠吸收 skew 與 PVT。若樂觀地假設 MMD 要到 2 T<sub>vco</sub>（200 ps）才取樣，算出來會是 128 ps——但那是拿「可能比較晚的 capture edge」來算 setup，是錯的。正確的做法是承認它很緊、加一級 retiming flop 把 carry 對到 VCO clock，然後<b>重算 carry 落在哪個週期</b>（見上一節 deep 模式）：retiming 會讓 carry 晚一個 VCO 週期到，如果因此錯過那個週期的 modulus 取樣點，架構 (a) 就不成立，平均除數會退回 N。
          </p>
          <p>
            <b>DTC code 的安全更新視窗</b>——這不是 setup path，而是跟 PMUX select 一樣的 control-hazard 視窗：DTC 是一個「edge 進去、延遲 D(code) 之後 edge 出來」的元件，code 必須從 input edge 進來之前 t<sub>su,dtc</sub> 一直穩定到 output edge 離開之後 t<sub>h,dtc</sub>。每個 output 週期可以安全更新 code 的視窗：
          </p>
          <Math block>{'t_{win} = T_{out} - \\big(D_{max} + t_{su,dtc} + t_{h,dtc}\\big) \\approx 400 - (15.6 + 5 + 5) = 374\\ \\text{ps}'}</Math>
          <p>
            D<sub>max</sub> = DTC 最大延遲（含 margin，ps）；t<sub>su,dtc</sub> / t<sub>h,dtc</sub> = code 相對 input / output edge 必須穩定的時間（ps）。最安全的做法是用 DTC 自己的 output edge 去 retime 下一個 code：edge 一離開就換 code，離下一個 input edge 還有將近一整個週期。PMUX select 的更新視窗同理（Lesson 5-2：切錯時間是 pulse-width / runt 問題，不是 setup 問題）。
          </p>
        </ModeContent>
        <ModeContent level="deep" title="高速實作會遇到的事">
          <ul>
            <li>
              <b>DTC 的實作</b>：常見是 current-starved inverter 加二進位權重的電容陣列（code 控制負載電容），或一串可選抽頭的 delay line。前者面積小、LSB 可以做到 100 fs 以下，但 INL 受電容匹配與 slew 非線性限制（典型幾百 fs）；後者線性度好但 range 一長功耗與 jitter 就上來。PHOS 把 range 壓到一個 PMUX step，讓電容陣列型 DTC 可行。
            </li>
            <li>
              <b>DTC 自己的 jitter</b>：延遲元件的 thermal / flicker noise 直接加在 edge 上，且隨 code（延遲長度）變化——fine code 大時 jitter 大。這是 random jitter，與 residual（deterministic）分開計。
            </li>
            <li>
              <b>PMUX glitch</b>：coarse 改變的時刻若落在被選 phase 正在翻轉的區間，會產生 runt——Lesson 5-2 的 safe window 分析在這裡原封不動適用；DTC 在 PMUX 之後，runt 進了 DTC 只會變成另一個 runt，不會被「濾掉」（除非 DTC 的 inertial delay 剛好吃掉它，那是 missing pulse，一樣是錯的）。
            </li>
            <li>
              <b>Retiming after DTC</b>：DTC 輸出的 edge 通常會再被一個乾淨的 VCO phase 重新取樣（retiming flop），把 DTC 與 PMUX 的雜訊與 supply sensitivity 換成一個 flop 的 tCQ jitter——但 retiming 只有在 DTC 只做「小於一個 phase spacing」的細調時才可行，否則 retiming edge 會落錯週期。這是 range 要小的另一個理由。
            </li>
            <li>
              <b>PVT</b>：PMUX step = T<sub>vco</sub>/8 隨 VCO 頻率變；DTC 的 LSB 隨製程、溫度、電壓變。兩者的比值（DTC full scale / PMUX step）不會自動等於 1，必須 calibration；calibration 本身要在 PLL 鎖定後、用 residual 與 code 的相關性 background 進行。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>看到 overflow carry 就說「divider 走 N+1」</b>：carry 是 9-bit 表示法的進位，它本身不改任何 edge。要先問這個架構把 carry 接到哪裡、在哪個週期被吃掉。接錯或沒接，edge 會倒退一個 T<sub>vco</sub>、平均除數退回 N，N 小時甚至產生 runt。
            </li>
            <li>
              <b>反過來，看到 divider 該改 interval 就去找 carry</b>：Lesson 5-3 架構 3 是 divider 自己產生 phase step，根本沒有 accumulator carry；兩者是不同的機制，不能互相推論。
            </li>
            <li>
              <b>把 DTC range 做成一整個 T<sub>vco</sub></b>：多花 8 倍的 range 換來更差的 INL、jitter、功耗；PMUX 的存在就是為了讓 DTC 只做一個 step。
            </li>
            <li>
              <b>以為 residual = 0</b>：只有 increment 是整數個 code、DTC 理想、boundary 對齊時才是 0。實際上 gain error 與 INL 讓 residual 跟著 fine code 走，週期性 ⇒ spur；沒有 calibration 的 DTC-PLL 通常就是被這根 spur 打敗。
            </li>
            <li>
              <b>把 PMUX / DTC code 更新失敗當成 setup violation</b>：MUX 與 DTC 是 combinational / delay 元件，沒有 setup time；切在錯的時刻造成的是 runt 或 missing pulse（pulse-width 問題）。
            </li>
            <li>
              <b>混淆 fine → coarse 與 coarse → integer 兩種 carry</b>：前者只是在同一個 T<sub>vco</sub> 裡換 phase（increment ≥ 64 時一步可以進 2），後者才跨過整數週期。累加 100 六次，<b>前者每一步都發生</b>（6 次，進位量 1, 2, 1, 2, 1, 2，合計進 9 個 PMUX step），<b>後者只有 1 次</b>（第 6 步）。
            </li>
            <li>
              <b>用 VCO clock 跑 accumulator</b>：9-bit 加法鏈在 100 ps 裡 slack 很緊，而且它每個 output 週期只需要走一步。放在 output-rate domain，再把 carry / code retime 回去。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="SystemVerilog（synthesizable，與課文模型同一份行為）">
          <CodeBlock
            title="phos_ctrl.sv"
            code={`
module phos_ctrl #(parameter CB = 3, FB = 6) (
  input  logic             clk_out,   // output-rate clock (div_out): one edge per output cycle
  input  logic             rst_n,
  input  logic [CB+FB-1:0] inc,       // codes to add per output cycle (e.g. 100)
  output logic [CB-1:0]    pmux_sel,  // coarse: PMUX phase index 0..2^CB-1
  output logic [FB-1:0]    dtc_code,  // fine : DTC code 0..2^FB-1
  output logic             carry      // coarse wrap: MMD must run N+1 this cycle (architecture (a))
);
  logic [CB+FB-1:0] acc;
  logic [CB+FB:0]   sum;
  assign sum = {1'b0, acc} + {1'b0, inc};   // (CB+FB+1)-bit add: MSB is the coarse -> integer carry
  always_ff @(posedge clk_out or negedge rst_n) begin
    if (!rst_n) begin
      acc   <= '0;
      carry <= 1'b0;
    end else begin
      acc   <= sum[CB+FB-1:0];   // {coarse, fine} after wrap
      carry <= sum[CB+FB];       // 1 only on the cycle the coarse field wraps
    end
  end
  assign pmux_sel = acc[CB+FB-1:FB];   // top CB bits  -> PMUX select
  assign dtc_code = acc[FB-1:0];       // low FB bits  -> DTC code
endmodule

// MMD side (architecture (a)): the wrap cycle runs N+1.
//   n_inst = N_BASE + carry;   // carry must be retimed into the MMD clock domain,
//                              // and the retiming latency must land it on the wrap cycle.
`}
            note="fine → coarse 的進位在同一個加法器裡自動完成（低 6 bit 溢位進高 3 bit）；只有最上面那個 bit 需要離開這個 module。少接這一根線，就是架構 (b)。"
          />
        </ModeContent>
      </Section>
    </>
  )
}

function ExerciseComponent() {
  return (
    <>
      <DividerSimPanel netlist={phaseCounter16} schematic={phaseCounter16Schematic} title="練習電路（相數 / 除數未標示）" showEquations={false} compact windowCycles={18} />
      <div style={{ marginTop: '0.8em' }}>
        <DtcCarryVisualizer cfg={{ coarseBits: 4, fineBits: 5 }} initialIncrement={100} initialN={4} initialSteps={8} tvcoPs={TVCO} allowConfig showGainError={false} compact />
      </div>
    </>
  )
}

const lesson: LessonDef = {
  id: 'm6-l3-dtc',
  module: 6,
  order: 3,
  title: 'DTC、PHOS 與 Residual Phase',
  titleEn: 'DTC, phase-offset selection and residual phase',
  summary: '三段刻度：divider 走整數 Tvco、PMUX 走 Tvco/8、DTC 走 Tvco/512。把 3-bit + 6-bit control word 逐步累加，看 fine → coarse、coarse → integer 兩種 carry；證明只有讓 divider 吃掉 overflow carry 的架構才能讓 edge 單調前進；DTC 只需要涵蓋一個 PMUX step，residual 來自 gain error 與 INL。',
  goals: [
    '把任意 9-bit control word 拆成 coarse（PMUX）與 fine（DTC），算出 edge 位置（Tvco 與 ps）與 LSB。',
    '逐 output 週期累加 increment，分清楚 fine → coarse 的進位與 coarse → integer 的 overflow carry。',
    '用 edge timeline 證明：overflow carry 必須由 divider（或等效機制）在正確的週期吸收，否則 edge 倒退一個 Tvco、平均除數退回 N、N 小時產生 runt。',
    '解釋 DTC range 為什麼只需要一個 PMUX step + margin，以及 residual phase 為什麼不為零（量化、gain error、INL）。',
    '找出 phase index counter 的 register-to-register path、carry → MMD interface path、DTC code 的安全更新視窗各自在問什麼。',
  ],
  readingMinutes: 45,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'numeric',
      prompt: '3-bit PMUX + 6-bit DTC。total code = 300 時，PMUX code（coarse）是多少？',
      answer: 4,
      explanation: '一個 PMUX step = 2^6 = 64 個 code。300 = 4 × 64 + 44 ⇒ coarse = 4（選 ph4），fine = 44。',
    },
    {
      id: 'q2',
      type: 'numeric',
      prompt: '承上，total code = 300 時 DTC code（fine）是多少？',
      answer: 44,
      explanation: '300 − 4 × 64 = 44。edge 位置 = 4/8 + 44/512 = 0.5859 Tvco = 58.59 ps（Tvco = 100 ps）。',
    },
    {
      id: 'q3',
      type: 'numeric',
      prompt: '從 0 開始，每個 output 週期把 9-bit control word 加 100，加六次。coarse → integer 的 overflow carry 一共發生幾次？',
      answer: 1,
      explanation: '六次之後 total = 600 = 1 × 512 + 88，只跨過 512 一次（第 6 步：coarse 7 + 2 = 9 → wrap 回 1）。fine → coarse 的進位（1, 2, 1, 2, 1, 2）每步都有，但那不是 overflow carry。',
    },
    {
      id: 'q4',
      type: 'numeric',
      prompt: 'Tvco = 100 ps，3-bit PMUX + 6-bit DTC。一個 DTC LSB 是多少 ps？（保留 3 位小數）',
      answer: 0.1953,
      tolerance: 0.001,
      explanation: 't_LSB = Tvco / (2^3 × 2^6) = 100 / 512 = 0.1953 ps。PMUX step = 100 / 8 = 12.5 ps = 64 個 LSB。',
    },
    {
      id: 'q5',
      type: 'state',
      prompt: '3-bit phase index counter 從 reset（p2 p1 p0 = 000）開始，inc = 1，經過 5 個 clock edge 之後 state 是？',
      answer: '101',
      width: 3,
      bitNames: ['p2', 'p1', 'p0'],
      explanation: '000 → 001 → 010 → 011 → 100 → 101：index 5，選 ph5。carry 要到 state 111（edge 7 之後）才會是 1。',
    },
    {
      id: 'q6',
      type: 'numeric',
      prompt: '承 q3：加六次 100 之後（total 600），DTC code 是多少？',
      answer: 24,
      explanation: '600 mod 512 = 88 = 1 × 64 + 24 ⇒ coarse = 1、fine = 24。也可以從第 5 步的 fine = 52 算：52 + 100 = 152 = 2 × 64 + 24。',
    },
    {
      id: 'q7',
      type: 'single',
      prompt: 'N = 4、8 相 PMUX 每個 output 週期前進 1 個 phase。下列哪一種做法能讓相鄰 output edge 的間隔每一個都是 4.125 Tvco？',
      options: [
        'PMUX index 7 → 0 時 divider 照常走 4 個 Tvco，carry 不接任何地方',
        'PMUX index 7 → 0 的那個週期，divider 走 5 個 Tvco（carry 加到 MMD 的 N）',
        'PMUX index 7 → 0 時把 DTC code 設成 63 補回來',
        '把 PMUX 改成 backward rotation 就不會 wrap',
      ],
      answer: 1,
      explanation: 'index 從 7/8 回到 0/8 少了 7/8 Tvco，只有 divider 多走一個 Tvco（+1 − 7/8 = +1/8）才能維持 4.125 的間隔。DTC 最多只能補一個 PMUX step（12.5 ps），補不了一整個 Tvco；backward rotation 一樣會在 0 → 7 時 wrap（只是方向相反，divider 該走 N − 1）。',
    },
    {
      id: 'q8',
      type: 'waveform',
      prompt: 'N = 2、M = 8、每個 output 週期前進 3 個 phase（理想除數 2.375）。哪一個是「overflow carry 由 divider 吸收」的 div_out？（每個選項的 rising edge 都由 event 產生；理想 edge 在 k × 2.375 Tvco）',
      options: [
        { label: 'A', traces: waveB.traces },
        { label: 'B', traces: waveA.traces },
        { label: 'C', traces: waveFixed.traces },
        { label: 'D', traces: waveStep5.traces },
      ],
      answer: 1,
      tEnd: 1800,
      period: TVCO,
      explanation: 'B 的 rising edge 間隔全部是 2.375 Tvco（237.5 ps）。A 是架構 (b)：index 0, 3, 6, 1（wrap）… 在 wrap 那步間隔只剩 1.375 Tvco，edge 比理想早 100 ps。C 是固定 /2（沒有 rotation）。D 是每週期前進 5 個 phase（2.625）。',
    },
    {
      id: 'q9',
      type: 'multiple',
      prompt: '下列哪些敘述正確？',
      options: [
        '9-bit control word 的 overflow carry 出現，就表示 divider 那個週期一定會走 N + 1',
        '若 PMUX 自己 wrap 而 divider 不變，長期平均除數會退回 N',
        'DTC 的 range 只需要涵蓋一個 PMUX step 加上 margin',
        'increment 是整數個 code 且 DTC 理想時，量化造成的 residual 為 0',
        'DTC gain error 造成的 residual 是隨機的，只會抬高 noise floor',
      ],
      answers: [1, 2, 3],
      explanation: 'carry 只是表示法的進位，divider 是否走 N+1 由架構決定（選項 1 錯）。gain error 的 residual = ε × fine × t_LSB，跟著 fine code 週期性變化，是確定性的 ⇒ spur，不是 noise floor（選項 5 錯）。',
    },
    {
      id: 'q10',
      type: 'numeric',
      prompt: 'increment = 100、6-bit DTC。fine code 序列 fine_k = (100k) mod 64 每幾個 output 週期重複一次？（DTC gain error 造成的 residual 鋸齒週期）',
      answer: 16,
      explanation: '100 mod 64 = 36，gcd(36, 64) = 4 ⇒ 週期 = 64 / 4 = 16。序列是 36, 8, 44, 16, 52, 24, 60, 32, 4, 40, 12, 48, 20, 56, 28, 0。residual 週期 16 ⇒ spur 在 f_out / 16。',
    },
    {
      id: 'q11',
      type: 'single',
      prompt: 'PMUX select 或 DTC code 在錯的時刻更新，造成的問題屬於哪一類？',
      options: ['capture flop 的 setup violation', 'hold violation', 'pulse-width violation（runt / missing pulse）', 'reset recovery violation'],
      answer: 2,
      explanation: 'MUX 與 DTC 是 combinational / delay 元件，沒有 setup / hold。切在被選 phase 正在翻轉的區間會產生寬度不足的 pulse（runt）或漏掉一個 pulse——是下游 flop 的最小脈波寬度問題（Lesson 5-2）。',
    },
  ],
  exercise: {
    title: '陌生電路：4-bit PMUX + 5-bit DTC，哪一段刻度變了？',
    prompt: (
      <>
        <p>
          下面的 counter 比課文多了一個 bit，累加工具也切換成 4 + 5 bit（總共仍是 9 bit，T<sub>vco</sub> = 100 ps）。先不要按模擬，自己推：
        </p>
        <ol>
          <li>這個 counter 幾個 edge wrap 一次？carry 的 duty 是多少？從 reset 經過 5 個 edge 之後 state 是？</li>
          <li>一個 DTC LSB 是幾 ps？一個 PMUX step 是幾 ps？DTC 最多要涵蓋幾 ps？哪一段刻度變粗、哪一段變細、哪一段不變？</li>
          <li>total code = 300 拆成 coarse / fine 是多少？edge 位置幾 ps？</li>
          <li>每週期加 100、加六次：fine → coarse 進位各是多少？coarse → integer 的 overflow carry 幾次？第 6 步的 coarse / fine 是？</li>
          <li>如果 DTC 保持 6 bit、只把 PMUX 加寬到 4 bit（總共 10 bit），LSB 與 DTC range 各變成多少？</li>
        </ol>
      </>
    ),
    Component: ExerciseComponent,
    checklist: ['寫出 carry 的 next-state / output equation，算出 wrap 週期與 5 個 edge 後的 state', '算出 LSB、PMUX step、DTC 涵蓋範圍（ps），並判斷哪一段變粗 / 變細', '把 300 與 600 拆成 overflow / coarse / fine', '列出六步的 fine → coarse 進位與 overflow carry 次數', '回答 4 + 6 bit 的 LSB 與 range'],
    answer: (
      <>
        <p>
          <b>1. counter</b>：carry = inc·p0·p1·p2·p3，只在 state 1111 為 1；16 個 edge wrap 一次，carry 寬一個 output 週期 ⇒ duty 1/16（模擬器量到 carry rising edge 在 15T、31T）。5 個 edge 之後 0101（index 5）。
        </p>
        <p>
          <b>2. 刻度</b>：總共仍是 9 bit ⇒ LSB = 100 / 2<sup>9</sup> = <b>0.1953 ps，不變</b>。PMUX step = 100 / 16 = <b>6.25 ps，變細</b>（需要 16 相的 VCO 或 interpolator）。DTC 只有 32 個 code ⇒ 最大 31 × 0.1953 = 6.05 ps，涵蓋範圍<b>減半</b>（6.25 ps + margin）。<b>沒有任何一段變粗</b>——這是題目的陷阱：把「DTC range 變小」誤當成「DTC step 變粗」是常見錯誤；解析度由總 bit 數決定，coarse / fine 的切法只搬動 PMUX 相數與 DTC range 之間的 trade-off。真正變粗的是整數這一段以外都沒有：divider 仍是 1 T<sub>vco</sub>。
        </p>
        <p>
          <b>3. code 300</b>：一個 PMUX step = 32 個 code。300 = 9 × 32 + 12 ⇒ coarse = <b>9</b>、fine = <b>12</b>；edge 在 9/16 + 12/512 = 0.5859 T<sub>vco</sub> = 58.59 ps——與 3 + 6 bit 時<b>一模一樣</b>（同一個 9-bit 數字、同一個 LSB，當然是同一個位置），只是由 PMUX 出 56.25 ps、DTC 出 2.34 ps。
        </p>
        <p>
          <b>4. 累加 100</b>：100 = 3 × 32 + 4，每步進 3 或 4 給 coarse：fine 0 → 4 → 8 → 12 → 16 → 20 → 24（每步剛好進 3，因為 4 × 6 = 24 &lt; 32 還沒再溢位），coarse 0 → 3 → 6 → 9 → 12 → 15 → 18 = 1 × 16 + 2 ⇒ 第 6 步 wrap，overflow carry 仍然只有 <b>1 次</b>（600 = 512 + 88，與切法無關），第 6 步 coarse = <b>2</b>、fine = <b>24</b>（88 = 2 × 32 + 24）。overflow carry 的次數由總 code 空間 512 決定，不由切法決定；改變的只是 fine → coarse 進位的次數與大小。
        </p>
        <p>
          <b>5. 4 + 6 bit（10 bit）</b>：LSB = 100 / 1024 = 0.0977 ps；DTC 64 個 code 涵蓋 63 × 0.0977 = 6.15 ps ≈ 一個 PMUX step 6.25 ps。解析度加倍、DTC range 仍只要一個 PMUX step——這就是「加 PMUX 相數」與「加 DTC bit」在系統上的差別：前者換 range，後者換解析度。
        </p>
      </>
    ),
  },
}
export default lesson
