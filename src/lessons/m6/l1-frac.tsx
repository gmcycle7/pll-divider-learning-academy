import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { StateDiagram, graphToDiagram } from '@/components/circuit/StateDiagram'
import { DividerSequenceSimulator } from '@/components/fractional/DividerSequenceSimulator'
import { buildStateGraph } from '@/models/divider/analysis'
import type { SignalTrace } from '@/models/divider/types'
import { frac225, frac275, runDualModSequence } from './models'
import { frac225Schematic, frac275Schematic, frac275Timing, fracModPathHighlight } from './schematics'
import { EdgeErrorWorked } from './Widgets'

/** 由 engine 算出的 state graph（11 個 state 的主循環 + 5 個 unreachable） */
const fracGraph = graphToDiagram(buildStateGraph(frac275, {}))

/** quiz 用：用 Lesson 3 的 /2 /3 cell 依序列切 mod 跑出來的真實波形（4 個 output 週期） */
function seqWave(seq: number[]): SignalTrace[] {
  return runDualModSequence(seq, 4).traces.filter((t) => t.name === 'clk' || t.name === 'div_out')
}

function Content() {
  return (
    <>
      <Section title="先用直覺想：公車每 2.75 分鐘一班？" en="Intuition">
        <p>
          PLL 需要 <Math>{'f_{vco} = 2.75 \\times f_{ref}'}</Math>（例如 100 MHz 的參考要鎖出 275 MHz）。回授路上的 divider 只會<b>數 edge</b>：數 2 個 edge 出一個 pulse、或數 3 個出一個 pulse。它沒有辦法「數 2.75 個 edge」。
        </p>
        <p>
          想像公車站牌寫著「平均每 2.75 分鐘一班」。司機做不到 2.75 分鐘，但他可以這樣發車：第 1 班隔 2 分鐘、第 2 班隔 3 分鐘、第 3 班隔 3 分鐘、第 4 班隔 3 分鐘，然後重複。4 班車一共 11 分鐘，<b>平均</b> 11 / 4 = 2.75 分鐘。
        </p>
        <p>
          但如果你拿著一張「理想時刻表」（每 2.75 分鐘一格）去對照：第 1 班早到 0.75 分鐘、第 2 班早到 0.5 分鐘、第 3 班早到 0.25 分鐘、第 4 班準時。每一班都不準，但誤差<b>可預測、而且會週期性地重複</b>。這一課要學的就是這件事在 divider 上的版本。
        </p>
        <Callout kind="idea">
          <Term zh="分數除頻器" en="fractional-N divider" /> 從來不是「每個週期除 2.75」。它是把整數除數（2 與 3）排成一個序列，讓<b>長期平均</b>是 2.75；代價是每一個 output edge 都帶著一個可以算出來的 <Term zh="邊緣時間誤差" en="edge error" />。分析 fractional divider 永遠要分清楚兩個問題：<b>這個週期除多少</b>（<Term zh="瞬時除數" en="instantaneous divide value" />，永遠是整數）與<b>平均除多少</b>（<Term zh="平均除數" en="average divide ratio" />）。
        </Callout>
      </Section>

      <Section title="最簡單的電路：/2 /3 cell + 2-bit accumulator" en="The circuit">
        <p>
          怎麼用硬體自動排出 2, 3, 3, 3？拿 Lesson 3 的 /2 /3 cell（state <span className="mono">q1 q0</span>，mod = 0 走 00 → 01 → 00，mod = 1 走 00 → 01 → 10 → 00），再加一個 2-bit <Term zh="累加器" en="accumulator" />（<span className="mono">a1 a0</span>）來決定每個週期的 mod：
        </p>
        <LogicDiagram schematic={frac275Schematic} showValues={false} highlights={[fracModPathHighlight]} />
        <p>先找出分析所需的三樣東西：</p>
        <ul>
          <li>
            <b>Clock input</b>：<span className="mono">clk</span>（週期 <Math>{'T_{in}'}</Math>），四個 flop 都由它的 rising edge 觸發。
          </li>
          <li>
            <b>Memory elements</b>：FF0 / FF1 是 cell 的 state（<span className="mono">q1 q0</span>）；ACC0 / ACC1 是 accumulator（<span className="mono">a1 a0</span>）。整個電路的 state 是 4 bit：<span className="mono">a1 a0 q1 q0</span>。
          </li>
          <li>
            <b>Feedback paths</b>：cell 自己的 <span className="mono">q1 q0 → NOR → d0</span>（與 Lesson 3 相同）；accumulator 的 <span className="mono">a1 a0 → OR → mod → AND → d1</span>（高亮的那一條：accumulator 的 carry 就是 mod）；以及 accumulator 自己的更新 <span className="mono">da0 = a0 ⊕ q0</span>、<span className="mono">da1 = a1 ⊕ (q0 · ā0)</span>。
          </li>
        </ul>
        <Callout kind="method" title="accumulator 在做什麼？">
          每個 output 週期把 K = 3 加進一個 mod-M = 4 的計數器。加了會不會溢位（acc + 3 ≥ 4）就是 carry：acc = 0 時不溢位（mod = 0 → 這個週期 /2），acc = 1, 2, 3 都溢位（mod = 1 → /3）。所以 <Math>{'mod = a_1 + a_0'}</Math>（OR）。「加 3 再 mod 4」等於「減 1」，所以 accumulator 的更新邏輯長得像 2-bit 遞減：<Math>{'d_{a0} = a_0 \\oplus q_0'}</Math>、<Math>{'d_{a1} = a_1 \\oplus (q_0 \\cdot \\overline{a_0})'}</Math>。<b>更新時機</b>：enable 是 <span className="mono">q0</span>，因為 state 01 在 /2 與 /3 的循環裡都恰好出現一次——accumulator 每個 output 週期只走一步。
        </Callout>
      </Section>

      <Section title="逐一個 clock edge 操作" en="Edge by edge">
        <p>
          模擬器從 reset state <span className="mono">a1 a0 q1 q0 = 0000</span> 開始。每按一次「下一個 Clock Edge」，先自己回答：accumulator 現在的值是多少？所以 mod 是 0 還是 1？這個 edge 會把 cell 帶到哪裡？accumulator 會不會走一步？
        </p>
        <DividerSimPanel netlist={frac275} schematic={frac275Schematic} title="/2 /3 cell + 2-bit accumulator（K = 3, M = 4）" showDelayMode windowCycles={12} />
        <Steps
          items={[
            <>
              <b>初始（0000）</b>：acc = 0 ⇒ mod = 0；cell 在 00，所以 d0 = NOR(0, 0) = 1、d1 = q0 · mod = 0。div_out = d0 = 1（state 00 就是 output 為 high 的那個 state，把 t = 0 當作第 0 個 output edge）。
            </>,
            <>
              <b>edge 1（t = 1T）</b>：q0 ← 1 ⇒ <span className="mono">0001</span>。q0 原本是 0，accumulator 沒有 enable，不動。現在 q0 = 1，所以下一個 edge 會同時「取樣 mod」與「更新 accumulator」。
            </>,
            <>
              <b>edge 2（t = 2T）</b>：mod = a1 + a0 = 0 ⇒ d1 = 0，cell 從 01 回到 00（走 /2）；同一個 edge accumulator 0 → 3（0 + 3 mod 4）⇒ <span className="mono">1100</span>。div_out 在 2T 升起：<b>第一個 output 週期 = 2 T<sub>in</sub></b>。
            </>,
            <>
              <b>edge 3（t = 3T）</b>：cell 00 → 01 ⇒ <span className="mono">1101</span>。現在 acc = 3 ⇒ mod = 1 ⇒ d1 = q0 · 1 = 1，已經在 D pin 前面等。
            </>,
            <>
              <b>edge 4（t = 4T）</b>：cell 01 → 10（走 /3 的路）；accumulator 3 → 2 ⇒ <span className="mono">1010</span>。
            </>,
            <>
              <b>edge 5（t = 5T）</b>：cell 10 → 00 ⇒ <span className="mono">1000</span>，div_out 在 5T 升起：<b>第二個 output 週期 = 5 − 2 = 3 T<sub>in</sub></b>。
            </>,
            <>
              <b>edge 6, 7, 8</b>：<span className="mono">1001 → 0110 → 0100</span>。acc = 2 ⇒ mod = 1 ⇒ 又是 /3，rising edge 在 8T。accumulator 2 → 1。
            </>,
            <>
              <b>edge 9, 10, 11</b>：<span className="mono">0101 → 0010 → 0000</span>。acc = 1 ⇒ mod = 1 ⇒ /3，rising edge 在 11T。accumulator 1 → 0，<b>回到 reset state</b>。
            </>,
            <>
              <b>結論</b>：state 序列每 11 個 edge 重複一次（2 + 3 + 3 + 3 = 11）。output rising edge 在 t = 0, 2, 5, 8, 11, 13, 16, 19, 22 …，相鄰間隔是 <b>2, 3, 3, 3, 2, 3, 3, 3 …</b>。沒有任何一個週期是 2.75，但每 4 個週期加起來一定是 11。
            </>,
          ]}
        />
        <Callout kind="warning" title="面板上的「量測 ratio」為什麼不是 2.75？">
          <p style={{ marginTop: 0 }}>
            面板量的是 <span className="mono">measureDivide()</span>，它會<b>丟掉第一個間隔</b>（reset 那一格 0 → 2T 不是正常的 output 週期），從第二個 rising edge 才開始平均。所以一路按下去，面板顯示的 ratio 依序是：
          </p>
          <ul style={{ margin: '0.3em 0' }}>
            <li>量到 t = 8T（第 3 個 rising edge，間隔 3）：3</li>
            <li>t = 11T（間隔 3, 3）：3</li>
            <li>t = 13T（3, 3, 2）：8 / 3 = <b>2.667</b></li>
            <li>t = 16T（3, 3, 2, 3）：11 / 4 = <b>2.75</b>　← 剛好涵蓋一個完整 pattern</li>
            <li>t = 19T（3, 3, 2, 3, 3）：14 / 5 = <b>2.8</b></li>
            <li>t = 22T（3, 3, 2, 3, 3, 3）：17 / 6 = <b>2.833</b></li>
            <li>t = 24T（3, 3, 2, 3, 3, 3, 2）：19 / 7 = <b>2.714</b></li>
          </ul>
          <p style={{ marginBottom: 0 }}>
            只有視窗剛好涵蓋<b>整數個 pattern</b>（4 個或 8 個間隔）時才會是 2.75，其他每一格都是錯的。這正是「平均除數」的定義問題：平均要取在完整的 pattern 週期上，任何截斷的視窗都會給你一個偏高或偏低的數字——而且偏差可以大到 ±0.1 以上，在 PLL 裡就是好幾個 MHz。
          </p>
        </Callout>
      </Section>

      <Section title="State diagram：16 個 state 裡有 11 個在循環上" en="State diagram">
        <p>
          4 個 flop 有 16 個 state。從 reset 出發能走到的只有 11 個（主循環）；剩下 5 個（accumulator 與 cell 的組合在正常運作中不會出現，例如 cell 在 11）都在一個 edge 之內回到主循環，沒有 lock-up。
        </p>
        <StateDiagram {...fracGraph} width={640} height={420} title="a1 a0 q1 q0：11-state 主循環（output = div_out）" />
        <p className="small muted">
          對照 Lesson 2：/3 的 unused state 11 若處理不好會 lock-up。這裡 d0 = NOR(q1, q0) 只保證<b>下一個 q0 = 0</b>；下一個 q1 由 d1 = q0 · mod 決定，而 q0 = 1 時它就等於 mod。所以 cell 從 11 出發只有兩個去處：mod = 0 時 11 → 00，mod = 1 時 11 → 10——<b>兩個都在主循環上</b>。實際跑 <span className="mono">nextStateOf(frac275, …)</span> 的四個 cell = 11 的 state：0011 → 1100（mod = 0，走 11 → 00）、0111 → 0010、1011 → 0110、1111 → 1010（這三個 mod = 1，走 11 → 10）。<span className="mono">buildStateGraph</span> 也印證：5 個 unreachable state 全部<b>一個 edge</b>就回到 11-state 主循環，沒有 lock-up。
        </p>
      </Section>

      <Section title="數學：瞬時除數、平均除數、edge error、phase error" en="Instantaneous vs average, edge and phase error">
        <p>
          設第 k 個 output 週期的瞬時除數為 <Math>{'N_k'}</Math>（整數，這裡是 2 或 3），pattern 長度 L 個週期。平均除數與平均 output 週期：
        </p>
        <Math block>{'N_{avg} = \\frac{1}{L}\\sum_{k=1}^{L} N_k = \\frac{2+3+3+3}{4} = 2.75,\\qquad T_{out,avg} = N_{avg}\\,T_{in},\\qquad f_{out} = \\frac{f_{in}}{N_{avg}}'}</Math>
        <p>
          第 k 個 output edge 的<b>實際</b>時間是前面所有週期的和；<b>理想</b>（均勻）edge 時間是 k 倍的平均週期；兩者的差就是 edge error：
        </p>
        <Math block>{'t_k = T_{in}\\sum_{i=1}^{k} N_i,\\qquad t_k^{*} = k\\,N_{avg}\\,T_{in},\\qquad e_k = t_k - t_k^{*} = T_{in}\\sum_{i=1}^{k}(N_i - N_{avg})'}</Math>
        <p>
          變數與單位：<Math>{'T_{in}'}</Math> = 輸入 clock 週期（ps）；<Math>{'t_k, t_k^*, e_k'}</Math> 都是時間（ps，或以 <Math>{'T_{in}'}</Math> 為單位）；<Math>{'e_k < 0'}</Math> 表示這個 edge <b>早到</b>。最右邊的寫法說明 <Math>{'e_k'}</Math> 就是「每個週期的量化誤差 <Math>{'N_i - N_{avg}'}</Math>」的累積——所以它也叫 <Term zh="累積量化誤差" en="accumulated quantization error" />。
        </p>
        <p>
          <Term zh="相位誤差" en="phase error" /> 是把時間誤差除以一個週期。要問「哪個週期」：對 divider 的<b>輸出</b>來說是 <Math>{'T_{out,avg}'}</Math>；PLL 鎖定時 <Math>{'T_{out,avg} = T_{ref}'}</Math>，所以這也是 PFD 看到的相位誤差：
        </p>
        <Math block>{'\\varphi_k = \\frac{e_k}{T_{out,avg}} = \\frac{e_k}{N_{avg}\\,T_{in}}\\ \\text{(output 週期)},\\qquad \\theta_k = 2\\pi\\,\\varphi_k\\ \\text{(rad)}'}</Math>
        <p>把 2, 3, 3, 3, 2, 3, 3, 3 代進去（T<sub>in</sub> = 100 ps）：</p>
        <EdgeErrorWorked seq={[2, 3, 3, 3, 2, 3, 3, 3]} tinPs={100} />
        <Steps
          items={[
            <>
              edge 1：t<sub>1</sub> = 2，理想 1 × 2.75 = 2.75 ⇒ e<sub>1</sub> = −0.75 T<sub>in</sub>（早到 75 ps）；φ<sub>1</sub> = −0.75 / 2.75 = −0.2727 個 output 週期 = −1.71 rad。
            </>,
            <>
              edge 2：t<sub>2</sub> = 5，理想 5.5 ⇒ e<sub>2</sub> = −0.5；edge 3：8 vs 8.25 ⇒ −0.25；edge 4：11 vs 11 ⇒ <b>0</b>。誤差在每個 pattern 結束時歸零，因為 4 個週期的和恰好是 11。
            </>,
            <>
              edge 5 ~ 8 完全重複 edge 1 ~ 4。<b>e<sub>k</sub> 是一個週期為 4 的鋸齒波</b>，peak-to-peak = 0.75 T<sub>in</sub> = 75 ps。
            </>,
          ]}
        />
        <Callout kind="formula" title="最簡 pattern 的 peak-to-peak edge error">
          分數寫成最簡分數 K/M（2.75 = 2 + 3/4，M = 4），用 accumulator 排出的最簡 pattern 週期是 M 個 output 週期，edge error 只會取 0, 1/M, 2/M, …, (M−1)/M 這些值（正負由 pattern 從哪裡開始決定），所以
          <Math block>{'e_{pp} = \\frac{M-1}{M}\\,T_{in}\\qquad (\\text{2.75: } \\tfrac{3}{4} T_{in};\\ 2.5: \\tfrac{1}{2} T_{in};\\ 2.8 = 2+\\tfrac{4}{5}: \\tfrac{4}{5} T_{in})'}</Math>
          分母越大，pattern 越長、peak error 越接近一整個 T<sub>in</sub>。
        </Callout>
      </Section>

      <Section title="互動：輸入任何序列，看平均除數、edge error、真實波形與 DFT" en="Sequence simulator">
        <p>
          下面的工具接受任意整數序列。它會列出平均除數、每個 edge 的 t<sub>k</sub> / t*<sub>k</sub> / e<sub>k</sub> / φ<sub>k</sub>、把 ideal（均勻）與 actual（序列）edge 畫成波形，並且——當序列只含 2 與 3 時——真的用 Lesson 3 的 /2 /3 cell 逐週期切 mod 跑一次，證明「divider 完全照序列跑」。試試看：
        </p>
        <ul>
          <li>把 2, 3, 3, 3 換成 3, 2, 3, 3（同樣的 pattern 從不同地方開始）：e<sub>k</sub> 的正負會變，peak-to-peak 不變。</li>
          <li>2, 3 交替（2.5）：peak-to-peak 只有 0.5 T<sub>in</sub>；2, 2, 3, 3 也是 2.5，但 peak-to-peak 變成 1.0 T<sub>in</sub>——同樣的平均，排列方式決定誤差大小。</li>
          <li>3, 3, 3, 3, 2（2.8）：pattern 週期 5，DFT 的 tone 跑到 f<sub>div</sub>/5。</li>
        </ul>
        <DividerSequenceSimulator initial="2, 3, 3, 3, 2, 3, 3, 3" tinPs={100} title="Divider Sequence Simulator：instantaneous → average → edge error → spur" />
      </Section>

      <Section title="週期性的 pattern → fractional spur" en="Periodic pattern and the fractional spur">
        <p>
          e<sub>k</sub> 每 4 個 output 週期重複一次。任何以 P 個週期重複的訊號，頻譜只會落在 <Math>{'f_{div}/P'}</Math> 及其諧波上——這就是工具裡 DFT 圖上那幾根 bar：2, 3, 3, 3 的 edge error 在 f<sub>div</sub>/4（0.25）與 f<sub>div</sub>/2（0.5）各有一根。
        </p>
        <p>
          PLL 鎖定時 <Math>{'f_{div} = f_{ref}'}</Math>，divider 的相位誤差經過 PFD、loop filter 調變 VCO，於是 VCO 輸出在載波兩側 <Math>{'\\pm f_{ref}/P'}</Math> 的地方長出 <Term zh="分數突波" en="fractional spur" />。它不是隨機的 phase noise，而是一根確定的線；因為 e<sub>k</sub> 是確定的鋸齒波，這種抖動叫 <Term zh="確定性抖動" en="deterministic jitter" />——你可以預測第 k 個 edge 早到多少。
        </p>
        <CompareTable
          head={['分數（最簡）', 'pattern 週期 P', 'spur 位置（f_ref = 100 MHz）', 'peak-to-peak edge error', '典型 PLL 頻寬 1 MHz 濾得掉？']}
          rows={[
            ['3/4（2.75）', '4', '25 MHz、50 MHz', '0.75 T_in', '可以（遠在頻寬外）'],
            ['1/2（2.5）', '2', '50 MHz', '0.5 T_in', '可以'],
            ['1/4（2.25）', '4', '25 MHz、50 MHz', '0.75 T_in', '可以'],
            ['4/5（2.8）', '5', '20 MHz、40 MHz', '0.8 T_in', '可以'],
            ['1/64', '64', '1.5625 MHz 起，每 1.5625 MHz 一根', '63/64 T_in', '第一根就在頻寬邊緣，幾乎不濾'],
            ['21/64', '64', '1.5625 MHz 起', '63/64 T_in', '同上：spur 靠近載波'],
          ]}
        />
        <Callout kind="warning" title="spur 的位置由 pattern 週期決定，不是由分數大小決定">
          2.75 與 2.25 的 spur 都在 f<sub>ref</sub>/4；1/64 與 21/64 都在 f<sub>ref</sub>/64。分母越大、pattern 越長，第一根 spur 越靠近載波、越難被 loop filter 濾掉，而且 peak error 越接近一整個 T<sub>in</sub>。這就是為什麼「用 accumulator 直接排 pattern」在需要細分數（大分母）時不能用——Lesson 6-2 的 DSM 就是要把這些確定的 tone 打散、推到高頻。
        </Callout>
        <ModeContent level="deep" title="spur 大小的數量級估計（loop filter 之前）">
          <p>
            鋸齒波 e<sub>k</sub> 的 peak-to-peak 相位是 <Math>{'\\Delta\\theta = 2\\pi\\, e_{pp} / (N_{avg} T_{in})'}</Math>。2.75 的例子：<Math>{'2\\pi \\times 0.75 / 2.75 = 1.71'}</Math> rad。鋸齒波的基頻分量振幅是 peak-to-peak 除以 π ≈ 0.55 rad。對一個被弦波相位調變的載波，spur 相對載波約為 <Math>{'20\\log_{10}(\\theta_1/2)'}</Math> dBc（小角度近似）⇒ 約 −11 dBc——這是 PFD 看到的量，還沒有經過 loop filter 在 f<sub>ref</sub>/4 的衰減。實際 spur = 這個值 + loop 從 divider phase error 到 VCO 輸出的 transfer 在 f<sub>ref</sub>/P 的增益（dB，負值）。這個估計告訴你兩件事：(1) 未經處理的 fractional 誤差非常大；(2) spur 離載波越近，loop 給的衰減越少。
          </p>
        </ModeContent>
      </Section>

      <Section title="這個架構的 critical path" en="Critical path">
        <p>
          加了 accumulator 之後，電路裡有三種 register-to-register path。用 launch / capture 的方法逐一問：
        </p>
        <Callout kind="method" title="三條 path，哪一條最長？">
          <ol style={{ margin: 0 }}>
            <li>
              <b>accumulator 借位鏈</b>：ACC0（edge k 送出 a0）→ INV → AND(borrow) → XOR1 → ACC1.D（edge k+1 抓）。只有 q0 = 1 時 AND 才會傳遞 a0 的變化——但每個 output 週期一定有一個這樣的 edge，所以它會被 sensitize。
            </li>
            <li>
              <b>mod control path</b>：ACC0 / ACC1 → OR → mod → AND → FF1.D。這是「這個週期是 /2 還是 /3」的 deadline：mod 必須在 state 01 的那個 edge 前 t<sub>setup</sub> 就穩定。
            </li>
            <li>
              <b>cell 本身</b>：FF0 / FF1 → NOR → FF0.D，與 Lesson 3 相同。
            </li>
          </ol>
        </Callout>
        <CriticalPathExplorer scenario={frac275Timing} guided />
        <ModeContent level="engineer" title="Timing equation 與數字">
          <Math block>{'T_{clk,min} \\ge t_{CQ,max} + t_{logic,max} + t_{setup} + t_{skew} + t_{jitter} + t_{margin}'}</Math>
          <p>
            借位鏈：8 + (6 + 10 + 12) + 7 + 0 + 2 + 2 = <b>47 ps</b>；mod control path：8 + (10 + 10) + 7 + 2 + 2 = 39 ps；cell：8 + 12 + 7 + 2 + 2 = 31 ps。所以在「accumulator 與 cell 共用 f<sub>in</sub> clock」的模型裡，<b>fractional 功能把 Fmax 從 32 GHz 拉低到 21 GHz</b>——critical path 從 cell 搬到 accumulator 去了。變數：t<sub>CQ,max</sub> = flop clock-to-Q 最大值；t<sub>logic,max</sub> = 路徑上所有 gate 延遲最大值的和；t<sub>setup</sub> = capture flop 的 setup；t<sub>skew</sub> = capture clock 到達 − launch clock 到達（同一條 clk 線 ≈ 0）；t<sub>jitter</sub> = 相鄰 edge 間隔的不確定量；t<sub>margin</sub> = 設計裕度。單位 ps。
          </p>
          <p>Hold check（同一個 edge，資料不能太快變）：借位鏈 t<sub>CQ,min</sub> + t<sub>logic,min</sub> = 5 + 4 + 6 + 8 = 23 ps ≥ t<sub>hold</sub> = 3 ps，安全；最短的是 cell 的 5 + 8 = 13 ps，也安全。</p>
        </ModeContent>
        <ModeContent level="deep" title="真實設計怎麼處理：慢 clock domain 與 control-path deadline">
          <ul>
            <li>
              <b>accumulator / DSM 用 div_out 當 clock</b>：它每個 output 週期只需要走一步，所以用 output-rate clock（週期 ≥ 2 T<sub>in</sub>）即可。同樣的借位鏈變成有 N 個 T<sub>in</sub> 可用，不再限制 Fmax。這也是為什麼 DSM 可以做到 20 bit 以上而不拖慢 prescaler。
            </li>
            <li>
              <b>但 mod 要回到高速 cell</b>：mod 由慢 domain 產生、被快 domain 的 FF1 取樣。deadline 不是「一個 T<sub>in</sub>」而是「state 01 那個 edge 之前」。通常會在 cell 附近加一級用 clk 重新取樣的 retiming flop，把 mod 的更新時刻對齊到 output edge 之後、state 01 之前的安全視窗——這就是 Lesson 3 講的 mode switching phase continuity：mod 改變的時刻若落在 cell 正在用 mod 的那個 edge 附近，這個週期是 /2 還是 /3 會不確定。
            </li>
            <li>
              <b>accumulator 多 bit 同時翻轉的 hazard</b>：a1 a0 從 10 變 01（2 → 1）時兩個 bit 同時改變，OR 輸出理論上可能短暫掉到 0。在同步設計裡這個 glitch 在下一個 edge 之前會消失，不會被抓到；但如果 mod 被拿去做 clock gating 或非同步控制，就必須先 register 過。
            </li>
            <li>
              <b>jitter</b>：fractional 的 edge error 是 deterministic 的，與 flop 的 random jitter 不同；兩者在 PLL 輸出上一個變成 spur、一個變成 phase noise floor。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>把「除 2.75」當成每個週期都除 2.75</b>：divider 的每個週期只能是整數；2.75 只存在於平均值裡。問「這個週期除多少」時答案永遠是 2 或 3。
            </li>
            <li>
              <b>用截斷的視窗算平均</b>：只量 7 個間隔會得到 2.857。平均要取在整數個 pattern 上。
            </li>
            <li>
              <b>把 edge error 當成 random jitter</b>：它是可預測的鋸齒波，變成 spur 而不是 noise floor；spur 的位置由 pattern 週期決定。
            </li>
            <li>
              <b>以為 pattern 拉長就沒事</b>：2, 3, 3, 3, 2, 3, 3, 3 的週期仍然是 4，spur 仍在 f<sub>ref</sub>/4；真正拉長 pattern（大分母）反而把 spur 推向載波。
            </li>
            <li>
              <b>忘記 accumulator 也是 state machine</b>：它有 reset 值、有 unreachable state、有自己的 critical path；它的 carry 是一個 control signal，必須在 cell 取樣之前穩定。
            </li>
            <li>
              <b>把 accumulator 的 carry 直接當 clock 或非同步控制</b>：多 bit 同時翻轉會產生 glitch，必須先 register。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="SystemVerilog（synthesizable，與模擬器同一份行為）">
          <CodeBlock
            title="frac_div_2p75.sv"
            code={`
module frac_div_2p75 (
  input  logic clk,      // T_in
  input  logic rst_n,    // async active-low reset
  output logic div_out
);
  logic [1:0] q;         // /2 /3 cell state {q1, q0}
  logic [1:0] acc;       // 2-bit accumulator (K = 3, M = 4)
  logic       mod;

  assign mod     = |acc;              // acc + 3 >= 4  <=>  acc != 0
  assign div_out = ~(q[1] | q[0]);    // state 00 -> high

  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      q   <= 2'b00;
      acc <= 2'b00;
    end else begin
      q[0] <= ~(q[1] | q[0]);         // d0 = NOR(q1, q0)
      q[1] <= q[0] & mod;             // d1 = q0 AND mod
      if (q[0]) acc <= acc + 2'd3;    // once per output cycle (state 01); +3 mod 4 == -1
    end
  end
endmodule
`}
            note="一般化：N + K/M 用 /N /N+1 cell + log2(M)-bit accumulator，每個 output 週期 acc <= acc + K，carry-out 當 mod。"
          />
        </ModeContent>
      </Section>
    </>
  )
}

function ExerciseComponent() {
  return <DividerSimPanel netlist={frac225} schematic={frac225Schematic} title="練習電路（除數未標示）" showEquations={false} compact windowCycles={12} />
}

const lesson: LessonDef = {
  id: 'm6-l1-frac',
  module: 6,
  order: 1,
  title: 'Fractional Divide Ratio 的基本概念',
  titleEn: 'Fractional divide ratio basics',
  summary: '用 /2 /3 cell + 2-bit accumulator 逐 edge 排出 2, 3, 3, 3；推導平均除數、edge error、phase error，看出週期性 pattern 如何變成 fractional spur。',
  goals: [
    '分清楚瞬時除數（每個週期 2 或 3）與平均除數（2.75），並知道平均要取在整數個 pattern 上。',
    '逐 output edge 算出 t_k、理想 t*_k、edge error e_k 與 phase error φ_k（含單位）。',
    '解釋為什麼週期為 P 的 pattern 會在 f_ref/P 產生 fractional spur，以及 peak-to-peak error = (M−1)/M·T_in。',
    '找出加了 accumulator 之後 critical path 搬到哪裡，以及 mod control path 的 deadline。',
  ],
  readingMinutes: 40,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'numeric',
      prompt: '序列 3, 3, 4, 3, 3, 4 的平均除數 N_avg 是多少？（保留 3 位小數）',
      answer: 3.3333,
      tolerance: 0.01,
      explanation: '(3+3+4+3+3+4) / 6 = 20 / 6 = 3.333。最簡 pattern 是 3, 3, 4（P = 3）。',
    },
    {
      id: 'q2',
      type: 'numeric',
      prompt: '序列 2, 3, 3, 3（N_avg = 2.75）：第 1 個 output edge 的 edge error e_1 是多少 T_in？（負值 = 早到）',
      answer: -0.75,
      tolerance: 0.01,
      explanation: 't_1 = 2 T_in，理想 t*_1 = 1 × 2.75 = 2.75 T_in ⇒ e_1 = 2 − 2.75 = −0.75 T_in。',
    },
    {
      id: 'q3',
      type: 'numeric',
      prompt: 'f_ref = 100 MHz，divider pattern 為 2, 3, 3, 3。最靠近載波的 fractional spur 距離載波多少 MHz？',
      answer: 25,
      tolerance: 0.1,
      explanation: 'pattern 週期 P = 4 個 output 週期；鎖定時 f_div = f_ref，所以 spur 在 f_ref / 4 = 25 MHz（諧波在 50 MHz）。',
    },
    {
      id: 'q4',
      type: 'numeric',
      prompt: 'T_in = 80 ps，pattern 2, 3, 3, 3。edge error 的 peak-to-peak 是多少 ps？',
      answer: 60,
      tolerance: 0.5,
      explanation: 'e_k = 0, −0.75, −0.5, −0.25 T_in ⇒ peak-to-peak = 0.75 T_in = 0.75 × 80 = 60 ps。一般式：(M−1)/M · T_in，M = 4。',
    },
    {
      id: 'q5',
      type: 'numeric',
      prompt: '承上（2, 3, 3, 3）：第 1 個 edge 的相位誤差 |φ_1|，以 output 週期為單位是多少？（保留 3 位小數）',
      answer: 0.2727,
      tolerance: 0.003,
      explanation: 'φ_1 = e_1 / N_avg = −0.75 / 2.75 = −0.2727 個 output 週期（= −1.71 rad）。PLL 鎖定時這就是 PFD 看到的相位誤差（以 T_ref 為單位）。',
    },
    {
      id: 'q6',
      type: 'numeric',
      prompt: '平均除數 4.25 用 /4 /5 排出最簡週期序列，pattern 週期 P 是幾個 output 週期？',
      answer: 4,
      explanation: '4.25 = 4 + 1/4，M = 4 ⇒ 最簡 pattern 是 4, 4, 4, 5（或它的旋轉），P = 4。',
    },
    {
      id: 'q7',
      type: 'state',
      prompt: 'frac275 從 reset（a1 a0 q1 q0 = 0000）開始，經過 4 個 rising edge 之後 state 是？',
      answer: '1010',
      width: 4,
      bitNames: ['a1', 'a0', 'q1', 'q0'],
      explanation: '0000 → 0001 → 1100（edge 2：/2 結束，acc 0 → 3）→ 1101 → 1010（edge 4：mod = 1 讓 cell 進 10，acc 3 → 2）。',
    },
    {
      id: 'q8',
      type: 'single',
      prompt: '平均除數 2.5 有幾種排法。哪一種的 peak-to-peak edge error 最小？',
      options: ['2, 3, 2, 3（交替）', '2, 2, 3, 3', '2, 2, 2, 3, 3, 3', '三者相同，因為平均一樣'],
      answer: 0,
      explanation: '交替：e = −0.5, 0 ⇒ p-p 0.5 T_in。2, 2, 3, 3：e = −0.5, −1, −0.5, 0 ⇒ p-p 1.0 T_in。2, 2, 2, 3, 3, 3：p-p 1.5 T_in。平均相同，排列決定誤差；最簡 pattern（accumulator 排法）誤差最小。',
    },
    {
      id: 'q9',
      type: 'multiple',
      prompt: '下列哪些敘述正確？',
      options: [
        '平均除數 2.75 表示每個 output 週期都是 2.75 T_in',
        'pattern 週期 P 決定最低的 fractional spur 頻率 f_div / P',
        'fractional divider 的 edge error 是 deterministic 的，不是 random jitter',
        '把 pattern 寫成 2, 3, 3, 3, 2, 3, 3, 3 會把 spur 移到 f_div / 8',
        '分母越大（例如 21/64），第一根 spur 越靠近載波',
      ],
      answers: [1, 2, 4],
      explanation: '每個週期只能是 2 或 3；重複寫兩次 pattern 的週期仍是 4；分母 64 的 pattern 週期是 64，spur 在 f_ref/64。',
    },
    {
      id: 'q10',
      type: 'waveform',
      prompt: '哪一個是 /2 /3 cell 依序列 2, 3, 3, 3 跑出來的 div_out？（output 在 state 00 時為 high 一個 T_in）',
      options: [
        { label: 'A', traces: seqWave([2, 2, 3, 3]) },
        { label: 'B', traces: seqWave([2, 3, 3, 3]) },
        { label: 'C', traces: seqWave([3, 3, 3, 3]) },
        { label: 'D', traces: seqWave([2, 3, 2, 3]) },
      ],
      answer: 1,
      tEnd: 1300,
      period: 100,
      explanation: 'B 的 rising edge 在 2, 5, 8, 11 T（間隔 2, 3, 3, 3）。A 是 2, 2, 3, 3（rising 在 2, 4, 7, 10）；C 是純 /3；D 是 2, 3 交替（2.5）。',
    },
  ],
  exercise: {
    title: '陌生電路：這個 accumulator 排出什麼序列？然後推廣到 4.25',
    prompt: (
      <>
        <p>
          下面的電路與課文的電路幾乎一樣，只有 accumulator 的更新邏輯與 carry decode 不同（mod = a1 · a0，da1 = a1 ⊕ (q0 · a0)）。先不要按模擬：從 reset 出發逐 edge 推，寫出 (1) accumulator 每個 output 週期加多少（K）、(2) 什麼時候 carry、(3) 瞬時除數序列與平均除數、(4) state 週期幾個 edge、(5) e<sub>k</sub> 與 peak-to-peak。
        </p>
        <p>
          接著推廣：如果 cell 換成 /4 /5、同樣的 accumulator，平均除數是多少？寫出 4.25 的最簡週期序列、pattern 週期、每個 edge 的 e<sub>k</sub>、peak-to-peak edge error 與 spur 位置（f<sub>ref</sub> = 100 MHz）。
        </p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: ['寫出 mod 與 da1 的 next-state equation，判斷 accumulator 是加 1 還是加 3', '列出前 9 個 edge 的 a1 a0 q1 q0', '寫出瞬時除數序列與平均除數，指出 state 週期', '算出 4.25 的最簡序列與 peak edge error（T_in）', '指出 4.25 的 spur 位置'],
    answer: (
      <>
        <p>
          da0 = a0 ⊕ q0、da1 = a1 ⊕ (q0 · a0)：這是 2-bit <b>遞增</b>（K = 1，M = 4）；mod = a1 · a0 表示 acc = 3 時 carry（3 + 1 ≥ 4）。從 0000：edge 2 時 acc = 0 ⇒ /2、acc → 1；edge 4 時 acc = 1 ⇒ /2、acc → 2；edge 6 時 acc = 2 ⇒ /2、acc → 3；edge 7 state 1101 時 mod = 1 ⇒ /3，edge 8 acc → 0，edge 9 回到 0000。state 序列 0000 → 0001 → 0100 → 0101 → 1000 → 1001 → 1100 → 1101 → 0010 → 0000，週期 9 個 edge；rising edge 在 2, 4, 6, 9 ⇒ 序列 <b>2, 2, 2, 3</b>，平均 9 / 4 = <b>2.25</b>。e<sub>k</sub> = 0, −0.25, −0.5, −0.75, 0 ⇒ peak-to-peak 0.75 T<sub>in</sub>。
        </p>
        <p>
          換成 /4 /5 cell、同一個 accumulator：序列 <b>4, 4, 4, 5</b>，平均 17 / 4 = <b>4.25</b>，P = 4，e<sub>k</sub> 與上面完全相同（0, −0.25, −0.5, −0.75, 0），peak-to-peak edge error = <b>0.75 T<sub>in</sub></b> = (M−1)/M · T<sub>in</sub>。spur 在 f<sub>ref</sub>/4 = 25 MHz 與 50 MHz——與 2.25、2.75 完全一樣，因為 spur 位置只看 pattern 週期，不看整數部分。
        </p>
      </>
    ),
  },
}
export default lesson
