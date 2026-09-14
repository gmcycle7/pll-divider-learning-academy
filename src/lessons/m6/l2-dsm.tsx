import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { StateDiagram, graphToDiagram } from '@/components/circuit/StateDiagram'
import { buildStateGraph } from '@/models/divider/analysis'
import { frac225, frac2375 } from './models'
import { frac225Schematic, frac225Timing, frac2375Schematic } from './schematics'
import { AccumulatorStepper, DsmCompareTable, DsmExplorer } from './Widgets'

const accGraph = graphToDiagram(buildStateGraph(frac225, {}))

function Content() {
  return (
    <>
      <Section title="先用直覺想：每個月付整數，但總額要對" en="Intuition">
        <p>
          Lesson 6-1 的 accumulator 其實已經是一個 <Term zh="三角積分調變器" en="delta-sigma modulator, DSM" />——最簡單的一階版本。它把「每個週期該除 2.75」這個做不到的要求，換成「每個週期除 2 或 3，但記住欠了多少」。
        </p>
        <p>
          想像分期付款：每期只能付整數元，總額 275 元分 100 期。每期付 2 元或 3 元，同時記帳：多付的、少付的都記在餘額裡，下一期照餘額決定付 2 還是 3。長期總額一定正確；但任何單獨一期都不是 2.75 元。DSM 做的事一模一樣：<b>長期平均正確，而不是每個 cycle 正確</b>。
        </p>
        <p>
          問題在於 Lesson 6-1 看到的：餘額 0, 3, 2, 1, 0, 3, 2, 1 … 每 4 期重複，pattern 週期短、誤差變成一根 tone（spur）。這一課要回答：DSM 怎麼把這個誤差<b>打散並推到高頻</b>（<Term zh="雜訊整形" en="noise shaping" />），為什麼「打散」不是免費的，以及它對 MMD 的除數範圍提出什麼要求。
        </p>
        <Callout kind="idea">
          DSM 不能消除 <Term zh="量化誤差" en="quantization error" />——每個週期仍然只能是整數。它能做的是改變誤差的<b>頻譜形狀</b>：把誤差的能量從低頻（loop filter 濾不掉、會變成 spur 或近載波 noise 的地方）搬到高頻（loop filter 會濾掉的地方）。判斷一個 DSM 好不好，不能只看 peak-to-peak，要看「經過 loop filter 之後還剩多少」。
        </Callout>
      </Section>

      <Section title="最簡單的電路：一階 accumulator（K = 1，M = 4）" en="The circuit: a first-order accumulator">
        <p>
          最簡單的 DSM 是一個 mod-M 的 accumulator：每個 output 週期加 K，溢位就輸出 carry = 1。用 Lesson 6-1 練習的那個電路（K = 1，M = 4，接在 /2 /3 cell 上）當硬體：
        </p>
        <LogicDiagram schematic={frac225Schematic} showValues={false} />
        <ul>
          <li>
            <b>Clock</b>：<span className="mono">clk</span>（T<sub>in</sub>）。教學模型裡 accumulator 用同一個 clk，靠 en = q0 每個 output 週期只走一步；真實設計用 div_out 當 accumulator 的 clock。
          </li>
          <li>
            <b>Memory</b>：<span className="mono">a1 a0</span> 是 accumulator 的殘值——它就是量化誤差（× M）；<span className="mono">q1 q0</span> 是 cell。
          </li>
          <li>
            <b>Feedback</b>：<span className="mono">mod = a1 · a0</span>（acc = 3 時加 1 會溢位）→ AND → d1；accumulator 更新 <span className="mono">da0 = a0 ⊕ q0</span>、<span className="mono">da1 = a1 ⊕ (q0 · a0)</span>（2-bit 遞增）。
          </li>
        </ul>
      </Section>

      <Section title="逐一個 clock edge 操作：看餘額怎麼累積、什麼時候 carry" en="Edge by edge">
        <p>
          從 reset 開始。這次把注意力放在 <span className="mono">a1 a0</span>：每個 output 週期它加 1，加到 3 的下一次就 wrap 回 0 並產生 carry（mod = 1 ⇒ 那個週期 /3）。
        </p>
        <DividerSimPanel netlist={frac225} schematic={frac225Schematic} title="一階 accumulator DSM（k/m = 1/4）+ /2 /3 cell" windowCycles={12} />
        <Steps
          items={[
            <>
              <b>週期 1（edge 1–2）</b>：state 0000 → 0001 → 0100。edge 2 時 acc = 0 ⇒ mod = 0 ⇒ /2；同一個 edge acc 0 → 1。rising edge 在 2T。
            </>,
            <>
              <b>週期 2（edge 3–4）</b>：0101 → 1000。acc = 1 ⇒ mod = 0 ⇒ /2；acc → 2。rising edge 在 4T。
            </>,
            <>
              <b>週期 3（edge 5–6）</b>：1001 → 1100。acc = 2 ⇒ /2；acc → 3。rising edge 在 6T。
            </>,
            <>
              <b>週期 4（edge 7–9）</b>：state 1101 時 mod = a1 · a0 = 1 ⇒ d1 = 1 ⇒ edge 8 進 10（/3），acc 3 + 1 = 4 → wrap 回 0（carry 被「用掉」）；edge 9 回到 0000。rising edge 在 9T。
            </>,
            <>
              <b>結論</b>：carry 序列 0, 0, 0, 1；除數 2, 2, 2, 3；平均 9 / 4 = 2.25；殘值序列 1, 2, 3, 0。9 個 edge 後 state 回到 reset。餘額每 4 個週期歸零 ⇒ pattern 週期 4 ⇒ tone 在 f<sub>div</sub>/4。
            </>,
          ]}
        />
        <StateDiagram {...accGraph} width={640} height={400} title="a1 a0 q1 q0：9-state 主循環，7 個 unreachable state 都在 1 個 edge 內回到循環" />
      </Section>

      <Section title="數學：一階 DSM 的 noise transfer function" en="First-order DSM math">
        <p>
          令 accumulator 在第 n 個 output 週期<b>之後</b>的殘值為 <Math>{'r[n] \\in \\{0, \\dots, M-1\\}'}</Math>，輸入為常數 K，輸出 carry 為 <Math>{'c[n] \\in \\{0, 1\\}'}</Math>：
        </p>
        <Math block>{'r[n] = r[n-1] + K - M\\,c[n],\\qquad c[n] = \\begin{cases}1 & r[n-1] + K \\ge M\\\\ 0 & \\text{otherwise}\\end{cases}'}</Math>
        <p>
          把 <Math>{'r[n]'}</Math> 除以 M 定義成量化誤差 <Math>{'e[n] = r[n]/M \\in [0, 1)'}</Math>，整理第一式：
        </p>
        <Math block>{'c[n] = \\frac{K}{M} + e[n-1] - e[n]\\quad\\Longrightarrow\\quad C(z) = \\frac{K}{M} + (1 - z^{-1})\\,E(z)'}</Math>
        <p>
          <Math>{'(1 - z^{-1})'}</Math> 就是一階的 <Term zh="雜訊轉移函數" en="noise transfer function, NTF" />。它的大小是 <Math>{'|1 - e^{-j2\\pi f/f_s}| = 2\\left|\\sin(\\pi f / f_s)\\right|'}</Math>，<Math>{'f_s = f_{div}'}</Math> 是 DSM 的更新率（每個 output 週期一次）。在 <Math>{'f \\to 0'}</Math> 時 NTF → 0（低頻誤差被壓掉），在 <Math>{'f = f_s/2'}</Math> 時 NTF = 2（高頻誤差被放大）。變數與單位：<Math>{'f'}</Math> 是相對於 <Math>{'f_{div}'}</Math> 的頻率（Hz）；<Math>{'e[n]'}</Math> 無單位（output 週期的比例）；<Math>{'c[n]'}</Math> 是加到整數除數 N 上的量。
        </p>
        <p>
          <b>edge error 與 e[n] 的關係</b>：Lesson 6-1 的累積誤差 <Math>{'\\sum_{i \\le k}(N_i - N_{avg}) = \\sum_{i \\le k}(c[i] - K/M) = e[0] - e[k]'}</Math>，所以 edge error 就是 <Math>{'-e[k]\\,T_{in}'}</Math>（差一個常數）。這解釋了為什麼一階 DSM 的 edge error 永遠在一個 T<sub>in</sub> 之內：<Math>{'e[k] \\in [0, 1)'}</Math>。
        </p>
        <Callout kind="formula" title="二階 MASH-1-1">
          把第一級的殘值 <Math>{'r_1[n]'}</Math> 餵給第二個 accumulator，第二級的 carry <Math>{'c_2'}</Math> 做一次差分後加回去：
          <Math block>{'y[n] = c_1[n] + c_2[n] - c_2[n-1]\\quad\\Longrightarrow\\quad Y(z) = \\frac{K}{M} + (1 - z^{-1})^2 E_2(z)'}</Math>
          第一級的誤差被完全消掉，只剩第二級的誤差乘上 <Math>{'(1 - z^{-1})^2'}</Math>：低頻壓得更狠（斜率 40 dB/decade），高頻放得更大（最大 4 倍）。代價：<Math>{'y[n] \\in \\{-1, 0, 1, 2\\}'}</Math>，瞬時除數會用到 <b>N − 1 … N + 2</b> 四個值——MMD 的範圍必須夠寬。三階 MASH-1-1-1 需要 N − 3 … N + 4。
        </Callout>
      </Section>

      <Section title="互動：k/m、order、dither 對 deltas、平均、p-p / RMS、DFT 的影響" en="DSM explorer">
        <p>
          下面的工具用專案的 <span className="mono">runDsm()</span> 產生序列。看四件事：(1) 前 32 個 deltas 的和 ≠ 32 × k/m，但 512 個的平均 ≈ k/m；(2) DFT 的形狀——一階像 20 dB/decade 的斜坡、二階更陡；(3) pattern 週期與 tone；(4) 真實 MMD 是否跑得出來。建議順序：
        </p>
        <ol>
          <li>k = 16（= 1/4）、order 1：deltas 是 0001 重複，週期 4，edge error 的 DFT 只有兩根（0.25 與 0.5 f<sub>div</sub>），最強的在 0.25——這就是上面的硬體。</li>
          <li>
            切到 order 2：deltas 變成 <span className="mono">00100100</span>（週期 8）。注意圖畫的是 <b>edge error</b> 的 DFT，不是 deltas 的 DFT：它從一階的單一一根 0.25，變成 <b>0.125 / 0.25 / 0.375 三根等高</b>的 tone（每根 |E| = 0.125）。最低的那一根比一階<b>更靠近載波</b>，不是更遠——這是下一節反例的關鍵。p-p 也從 0.75 升到 1.0。
          </li>
          <li>k = 21：order 1 的週期是 64，tone 在 21/64 = 0.328；order 2 的 DFT 明顯把低頻壓下去、高頻抬起來。</li>
          <li>
            打開 dither（k = 21、order 1、預設 length = 512）：tone 變矮、四周長出雜訊底，但 ±1 LSB 對 m = 64 來說很弱，<b>tone 不會消失</b>——0.328 那根只從 |E| = 0.159 降到 0.143，而 p-p 從 0.98 升到 1.19、低通後 RMS 從 0.081 升到 0.105。「delta pattern 週期」那一欄會變成「找不到」，因為序列已經不再從第一個週期起重複。
          </li>
          <li>N = 4 配 order 2：MMD 需要 3 … 6，超出 Lesson 4 的 4 … 7 ⇒ 工具會警告；N = 5 才放得下。</li>
        </ol>
        <DsmExplorer initialK={21} initialOrder={1} initialN={5} />
      </Section>

      <Section title="tone、dither，以及 peak-to-peak 與 RMS 不一定同時改善" en="Tones, dither and the p-p vs RMS trap">
        <p>
          一個常數輸入 K/M 讓 accumulator 的殘值以 <Math>{'M/\\gcd(K, M)'}</Math> 為週期重複，所以輸出一定有 tone。<Term zh="抖動注入" en="dither" /> 在輸入（或量化器）加一點偽隨機值，讓殘值不再週期重複——tone 被打散成寬頻雜訊。但這個雜訊是真的加進去的能量：<b>noise floor 會上升</b>。下面是同一個 k/m = 21/64 用四種設定跑 2048 個週期的統計（loop filter 用一階低通、corner = f<sub>div</sub>/32 代表 PLL 對 divider 相位誤差的濾波）：
        </p>
        <DsmCompareTable k={21} m={64} N={4} length={2048} caption="綠色 = 該欄最小。注意三個指標的贏家不是同一個設定。" />
        <Steps
          items={[
            <>
              <b>MASH-1 → MASH-1-1（都沒有 dither）</b>：p-p 從 0.98 升到 1.75 T<sub>in</sub>，AC RMS 從 0.29 升到 0.41——loop filter 之前二階<b>更糟</b>；但低通後 RMS 從 0.081 降到 0.055——二階把誤差推到高頻，loop filter 濾掉後<b>更好</b>。這就是 noise shaping：總能量變大，in-band 能量變小。
            </>,
            <>
              <b>MASH-1 加 dither</b>（2048 個週期）：0.328 那根乾淨的 tone 確實被打散——「delta pattern 週期」那一欄從 64 變成「找不到」，因為序列不再從第一個週期起重複。但別把表格裡「最強 tone = 0.116」讀成「tone 只是變矮」：它的<b>頻率</b>已經從 0.328 f<sub>div</sub> 掉到 f ≈ 0.0005 f<sub>div</sub>（DFT 的第 1 個 bin），那不是 tone，是 dither 造成的<b>低頻漫遊</b>，正好落在 loop filter 的通帶裡。結果就是 p-p 翻倍（0.98 → 1.95）、AC RMS 從 0.29 升到 0.38、低通後 RMS 從 0.081 升到 0.287。這個模型的 dither 是加在<b>輸入</b>的白噪音，訊號轉移函數 STF = 1，所以它<b>不會被 shaping</b>，直接落在 in-band。
            </>,
            <>
              <b>結論</b>：p-p、AC RMS、in-band RMS 三個指標各有不同的贏家。「二階一定比一階好」只對 in-band 成立；「dither 一定有幫助」只對 tone 成立。選 DSM 要先問：你的 PLL 頻寬是多少？你怕的是 spur 還是 noise？MMD 放得下幾個除數？
            </>,
          ]}
        />
        <Callout kind="warning" title="明確反例：k/m = 1/4 時二階全面輸給一階">
          同樣的比較換成 k/m = 16/64（= 1/4）：
        </Callout>
        <DsmCompareTable k={16} m={64} N={4} length={256} caption="1/4 是「短週期」輸入：一階週期 4、二階週期 8；二階在三個指標上都比一階差，包括低通後的 RMS。" />
        <p>
          為什麼？把兩張 edge error 的 DFT 逐根 bin 攤開來看（這正是 DsmExplorer 畫的那張圖）：
        </p>
        <ul>
          <li>
            <b>一階</b>：殘值序列 1, 2, 3, 0——誤差只有 4 個值、pattern 只有 4 個週期，DFT 只有<b>兩根</b>：f<sub>div</sub>/4（|E| = 0.177）與 f<sub>div</sub>/2（0.125）。兩者都遠在 loop corner f<sub>div</sub>/32 之上，被濾得乾乾淨淨 ⇒ 低通後 RMS 只有 <b>0.0365</b>。
          </li>
          <li>
            <b>二階</b>：pattern 拉長成 8（deltas = 00100100），DFT 變成 f<sub>div</sub>/8、f<sub>div</sub>/4、3f<sub>div</sub>/8 <b>三根等高</b>的 tone（每根 |E| = 0.125）。注意<b>不是「tone 移到 3/8」</b>——恰恰相反：最低的那一根從一階的 f<sub>div</sub>/4 <b>掉到 f<sub>div</sub>/8</b>，離 loop corner 更近、一階低通對它的衰減少了一半 ⇒ 低通後 RMS 反而升到 <b>0.0537</b>。
          </li>
        </ul>
        <p>
          所以二階輸的不是「總能量變大」（那只解釋 p-p 0.75 → 1.0 與 AC RMS 0.28 → 0.31），而是<b>它把一部分能量放到了比一階更低的頻率上</b>。教訓：<b>NTF 描述的是「平均而言」的頻譜形狀；對特定的短週期輸入，實際的 tone 落在哪幾根 bin 要自己算，不能用 NTF 的斜率去猜</b>。實務上這類「整齊」的分數（1/2、1/4、0）反而是最容易出 spur 的輸入，通常靠 dither 或非零初始值處理。
        </p>
        <ModeContent level="engineer" title="MMD 範圍與 DSM 階數">
          <p>
            瞬時除數範圍：一階 N … N+1；二階 N−1 … N+2；三階 N−3 … N+4。若 MMD 是 Lesson 4 的兩級 cell（4 … 7），二階只能配 N = 5（4 … 7 剛好）；N = 4 會要求 3、N = 6 會要求 8，任何一個被 clip 掉，長期平均就不再是 N + k/m——工具裡的警告就是這個。另外 DSM 的輸出是多 bit 的（−1 … 2 需要 2 bit 有號數），一次可能兩個 bit 同時翻轉，送進 MMD 的 p1 p0 之前必須先 register，否則會出現 Lesson 4 講的 modulus glitch。
          </p>
        </ModeContent>
        <ModeContent level="deep" title="dither 該加在哪裡、多大">
          <ul>
            <li>
              <b>輸入 dither</b>（這個模型）：訊號轉移函數 STF = 1，白噪音直接進 in-band；優點是實作簡單、保證打散所有 tone；缺點是抬高 noise floor。用 ±1 LSB（1/64）已經明顯；實務上會用更多 bit 的 accumulator（例如 20–24 bit），讓 1 LSB 的 dither 相對很小。
            </li>
            <li>
              <b>量化器前 LSB dither</b>：加在最後一級量化之前，會被 NTF shaping，in-band 影響小得多；但打散 tone 的效果較弱，對短週期輸入不一定夠。
            </li>
            <li>
              <b>非零初始值 / 奇數 LSB 強制為 1</b>：讓殘值序列的週期最大化（例如 2^W），不加隨機性也能把 tone 推到極低頻、能量攤薄；常與高階 MASH 搭配。
            </li>
            <li>
              <b>階數越高、in-band 越乾淨，但</b>：out-of-band 誤差更大（三階 p-p 可達 7 T<sub>in</sub>），對 PFD/CP 的線性度要求更高（大相位誤差會撞到 CP 的非線性區，把高頻雜訊 fold 回 in-band），而且 MMD 要更寬。這是 Lesson 6-3 用 DTC 抵消 DSM 誤差的動機之一。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="這個架構的 critical path" en="Critical path">
        <p>
          與 Lesson 6-1 相同的問法：launch 在哪、capture 在哪、哪個 edge、可用時間多少。這裡的三條 path：accumulator 進位鏈（ACC0 → AND → XOR1 → ACC1.D）、carry → mod → FF1.D 的 control path、cell 自己的 NOR feedback。
        </p>
        <CriticalPathExplorer scenario={frac225Timing} guided />
        <ModeContent level="engineer" title="數字">
          <p>
            進位鏈：8 + 10 + 12 + 7 + 2 + 2 = <b>41 ps</b>（沒有 INV，比 6-1 的借位鏈短 6 ps）；mod control path：8 + 10 + 10 + 7 + 2 + 2 = 39 ps；cell：31 ps。DSM 每多一階就多一條 accumulator 鏈與一個差分器；在 output-rate clock domain 裡這些鏈有 N 個 T<sub>in</sub> 可用，所以 DSM 的位寬與階數通常不是 Fmax 的限制——<b>限制在 DSM 輸出回到 MMD 的 control path</b>：多 bit 的除數控制必須在 MMD 第一個 cell 取樣 modulus 之前穩定，且每個 bit 的到達時間要對齊（否則短暫出現錯誤的除數組合）。
          </p>
        </ModeContent>
        <ModeContent level="deep" title="DSM 與 MMD 之間的時序">
          <ul>
            <li>
              DSM 用 div_out 當 clock，輸出在 output edge 之後 t<sub>CQ</sub> 更新；MMD <b>最早</b>在下一個 output 週期的第一個 cell state 01 取樣——也就是 output edge 之後<b>一個</b> T<sub>in</sub>（state 00 → 01 只花一個 edge），慢的話兩個。setup / deadline 一定要用<b>最早</b>的那個 capture edge 去算，所以這個視窗只有 1 個 T<sub>in</sub>，非常短（Lesson 6-3 的 carry → MMD interface path 就是拿這個 deadline 算出 slack 只有 28 ps）。因此 DSM 輸出通常會再用 VCO clock 的 retiming flop 對齊，或讓 MMD 在週期的後段才取樣 modulus（Lesson 4 的 mod_out 結構天然提供這個延遲）。
            </li>
            <li>
              MASH 可以 pipeline：每一級加一級 register，NTF 不變、只是整體延遲多幾個週期；對 PLL 而言 DSM 的延遲是回授路上的固定 latency，不影響鎖定的平均除數。
            </li>
            <li>
              DSM 的 clock 是 divider 自己的輸出——這是一個 <b>self-timed loop</b>：div_out 的 edge 產生下一個 modulus，下一個 modulus 決定下一個 div_out edge 的位置。分析時把它當成兩個 clock domain（VCO rate 與 output rate）之間的 interface path。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>以為 DSM 讓每個週期都正確</b>：每個週期仍然是整數；DSM 只保證長期平均與誤差的頻譜形狀。
            </li>
            <li>
              <b>只看 peak-to-peak</b>：二階的 p-p 比一階大、dither 讓 p-p 翻倍，但 in-band RMS 才是 PLL 輸出看得到的量。反過來也一樣：不要只看 in-band 而忘了 p-p 決定 PFD/CP 的線性範圍與 MMD 的除數範圍。
            </li>
            <li>
              <b>「高階一定更好」</b>：k/m = 1/4 的反例顯示對短週期輸入二階三個指標都輸。要看實際序列，不要只看 NTF。
            </li>
            <li>
              <b>「dither 一定有幫助」</b>：它打散 tone，但抬高 noise floor；加在輸入的 dither 不會被 shaping。
            </li>
            <li>
              <b>忘記 MMD 範圍</b>：二階需要 N−1 … N+2；被 clip 的那些週期會讓平均除數錯掉，而且 clip 是非線性的，會產生新的 tone。
            </li>
            <li>
              <b>DSM 多 bit 輸出沒有 register 就送進 MMD</b>：−1 → 2 之類的轉換會有中間狀態，MMD 可能短暫看到錯誤的除數。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="SystemVerilog：MASH-1-1（pipeline 版）">
          <CodeBlock
            title="mash11.sv"
            code={`
module mash11 #(parameter W = 6) (
  input  logic              clk,     // = div_out（output-rate clock）
  input  logic              rst_n,
  input  logic [W-1:0]      k,       // fraction = k / 2^W
  output logic signed [2:0] delta    // -1 .. +2，加到 MMD 的整數除數 N 上
);
  logic [W-1:0] acc1, acc2;
  logic         c1, c2, c2_d;

  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      acc1 <= '0; acc2 <= '0; c1 <= 1'b0; c2 <= 1'b0; c2_d <= 1'b0;
    end else begin
      {c1, acc1} <= acc1 + k;        // stage 1: carry-out = overflow
      {c2, acc2} <= acc2 + acc1;     // stage 2 accumulates the stage-1 residue
      c2_d       <= c2;
    end
  end
  // y = c1 + (1 - z^-1) c2 ；registered 版本比課文的模型多一個 cycle 的 latency，平均值相同
  assign delta = {2'b00, c1} + {2'b00, c2} - {2'b00, c2_d};
endmodule
`}
            note="送進 MMD 前 delta 要與 N 相加並 register：mmd_ctrl <= N + delta。範圍 N−1 … N+2 必須在 MMD 的能力之內。"
          />
        </ModeContent>
      </Section>
    </>
  )
}

function ExerciseComponent() {
  return (
    <>
      <DividerSimPanel
        netlist={frac2375}
        schematic={frac2375Schematic}
        title="陌生電路：/2 /3 cell + 3-bit accumulator（先自己推，再按 edge 對答案）"
        windowCycles={12}
        showEquations={false}
      />
      <AccumulatorStepper initialK={3} initialM={8} steps={16} />
    </>
  )
}

const lesson: LessonDef = {
  id: 'm6-l2-dsm',
  module: 6,
  order: 2,
  title: 'DSM 的角色',
  titleEn: 'The role of the delta-sigma modulator',
  summary: 'DSM 讓長期平均正確而非每 cycle 正確；一階 accumulator 的 NTF、MASH-1-1 的 noise shaping、tone 與 dither，以及 peak-to-peak / RMS / in-band RMS 三個指標為什麼不會同時改善。',
  goals: [
    '用 accumulator 的殘值解釋量化誤差，推出一階 NTF = 1 − z⁻¹ 與 MASH-1-1 的 (1 − z⁻¹)²。',
    '逐 edge 看 k/m = 1/4 的硬體：殘值 1, 2, 3, 0、carry 0, 0, 0, 1、除數 2, 2, 2, 3。',
    '比較 1st / 2nd / dither 的 p-p、AC RMS、in-band RMS，說出各自的贏家與反例。',
    '把 DSM 階數對應到 MMD 需要的除數範圍，並指出 DSM → MMD 的 control-path deadline。',
  ],
  readingMinutes: 40,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'numeric',
      prompt: '一階 accumulator，K = 3、M = 8，從 acc = 0 開始跑 8 個週期。carry = 1 出現幾次？',
      answer: 3,
      explanation: '殘值 3, 6, 1(c), 4, 7, 2(c), 5, 0(c)：carry 在第 3、6、8 個週期，共 3 次 ⇒ 平均 3/8 = K/M。',
    },
    {
      id: 'q2',
      type: 'single',
      prompt: '一階 DSM 的 noise transfer function 是？',
      options: ['1', '1 − z⁻¹', '(1 − z⁻¹)²', 'z⁻¹'],
      answer: 1,
      explanation: 'c[n] = K/M + e[n−1] − e[n] ⇒ C(z) = K/M + (1 − z⁻¹) E(z)。低頻 |NTF| → 0，f_s/2 時 |NTF| = 2。',
    },
    {
      id: 'q3',
      type: 'numeric',
      prompt: 'MASH-1-1 的輸出 delta ∈ {−1, 0, 1, 2}。整數除數 N = 5 時，MMD 必須支援的最小瞬時除數是多少？',
      answer: 4,
      explanation: 'N + delta ∈ {4, 5, 6, 7}：最小 4、最大 7。Lesson 4 的兩級 MMD（4 … 7）剛好放得下 N = 5。',
    },
    {
      id: 'q4',
      type: 'state',
      prompt: 'k/m = 1/4 的硬體（frac225）從 reset 開始，經過 6 個 rising edge 之後 accumulator a1 a0 是多少？',
      answer: '11',
      width: 2,
      bitNames: ['a1', 'a0'],
      explanation: 'accumulator 在 edge 2、4、6 各加 1（每個 output 週期一次）：0 → 1 → 2 → 3 = 11。下一個 output 週期（edge 8）會 wrap 回 0 並產生 carry。',
    },
    {
      id: 'q5',
      type: 'multiple',
      prompt: '關於 dither 與 DSM 階數，哪些正確？（依課文的模型與數據）',
      options: [
        '加在輸入的 dither 會被 NTF shaping，所以不影響 in-band',
        'dither 打散 tone，但 p-p 與 in-band RMS 都變大',
        'MASH-1-1 在 loop filter 之前的 AC RMS 比 MASH-1 大',
        'MASH-1-1 對任何 k/m 的 in-band RMS 都比 MASH-1 小',
        '二階 DSM 需要 MMD 提供 N−1 … N+2 四個除數',
      ],
      answers: [1, 2, 4],
      explanation: '輸入 dither 的 STF = 1，不被 shaping；k/m = 1/4 是 MASH-1-1 in-band 也更差的反例。',
    },
    {
      id: 'q6',
      type: 'numeric',
      prompt: 'k/m = 21/64 的一階 accumulator（沒有 dither），delta 序列的週期是幾個 output 週期？',
      answer: 64,
      explanation: '週期 = M / gcd(K, M) = 64 / gcd(21, 64) = 64。tone 在 f_div × 21/64 及其諧波（折疊後最強的一根在 0.328 f_div）。',
    },
    {
      id: 'q7',
      type: 'single',
      prompt: '從 MASH-1 換成 MASH-1-1（k/m = 21/64，不加 dither），三個指標怎麼變？',
      options: ['p-p ↓、AC RMS ↓、in-band RMS ↓', 'p-p ↑、AC RMS ↑、in-band RMS ↓', 'p-p ↑、AC RMS ↓、in-band RMS ↓', 'p-p ↓、AC RMS ↑、in-band RMS ↑'],
      answer: 1,
      explanation: '課文數據：p-p 0.98 → 1.75、AC RMS 0.29 → 0.41（都變差），低通後 RMS 0.081 → 0.055（變好）。noise shaping 是把能量搬到高頻，不是消掉。',
    },
  ],
  exercise: {
    title: '陌生電路：這個 3-bit accumulator 排出什麼序列？再比較 K = 1 與 K = 3 的鋸齒方向',
    prompt: (
      <>
        <p>
          <b>(A) 陌生電路。</b>下面的電路是同一個 /2 /3 cell，但 accumulator 從 2 bit 加寬成 3 bit（<span className="mono">a2 a1 a0</span>），而且更新邏輯換了：
        </p>
        <ul>
          <li>
            <span className="mono">da0 = a0 ⊕ q0</span>
          </li>
          <li>
            <span className="mono">da1 = a1 ⊕ (q0 · ā0)</span>
          </li>
          <li>
            <span className="mono">o01 = a1 + a0</span>、<span className="mono">da2 = a2 ⊕ (q0 · o01)</span>
          </li>
          <li>
            <span className="mono">mod = a2 · o01</span>
          </li>
        </ul>
        <p>
          <b>先不要按模擬。</b>把 en = q0 = 1 代進去，逐 bit 判斷這個 accumulator 每個 output 週期加多少：bit 0 每次都翻 ⇒ 加數的 LSB 是 1；bit 1 在 a0 = 0 時翻 ⇒ 加數的 bit 1 也是 1（1 + 1 進位的行為）；bit 2 只在 (a1 + a0) 有進位時翻 ⇒ 加數的 bit 2 是 0。寫出 (1) 加數 K 與模數 M、(2) mod = 1 的條件換成 acc 的數值範圍、(3) 從 reset 開始 8 個 output 週期的 acc 與 mod、(4) 瞬時除數序列與平均除數、(5) state 週期是幾個 clk edge、(6) e<sub>k</sub> 與 peak-to-peak、(7) spur 位置。推完再用下面的面板逐 edge 對答案（state 顯示順序是 <span className="mono">a2 a1 a0 q1 q0</span>），用手算表對 accumulator。
        </p>
        <p>
          <b>(B) 鋸齒方向。</b>回到 M = 4：把 K = 1 與 K = 3 的 carry pattern、瞬時除數序列、e<sub>k</sub> 逐項寫出來比較。兩者的 peak-to-peak 一樣嗎？e<sub>k</sub> 的<b>正負號</b>會反過來嗎？（在手算表上按 1/4 與 3/4 兩個 preset 對答案。）
        </p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: [
      '從 da0 / da1 / da2 反推加數 K 與模數 M',
      '把 mod = a2 · (a1 + a0) 換成 acc 的數值條件',
      '列出 8 個 output 週期的 acc、mod 與瞬時除數，算平均除數',
      '數出 state 週期（clk edge 數）並與 Σ N_k 對照',
      '算出 e_k 與 peak-to-peak，指出 spur 位置',
      '比較 M = 4 時 K = 1 與 K = 3 的 e_k：p-p 與正負號各是什麼',
    ],
    answer: (
      <>
        <p>
          <b>(A)</b> 加數 <b>K = 3</b>（bit2 bit1 bit0 = 011），模數 <b>M = 8</b>。<span className="mono">mod = a2 · (a1 + a0)</span> 就是 a2 = 1 且 a1a0 ≠ 00 ⇒ acc ∈ {'{5, 6, 7}'} ⇒ acc ≥ 5 ⇔ acc + 3 ≥ 8，正是「這次加下去會溢位」。
        </p>
        <p>
          從 reset（acc = 0）逐個 output 週期：acc = 0 → mod 0 ⇒ <b>/2</b>，acc ← 3；acc = 3 → /2，acc ← 6；acc = 6 → mod 1 ⇒ <b>/3</b>，acc ← 1；acc = 1 → /2，acc ← 4；acc = 4 → /2，acc ← 7；acc = 7 → /3，acc ← 2；acc = 2 → /2，acc ← 5；acc = 5 → /3，acc ← 0（回到 reset）。
        </p>
        <p>
          ⇒ mod 序列 <b>0, 0, 1, 0, 0, 1, 0, 1</b>（8 個週期裡 carry <b>3</b> 次 = K，與小測驗第 1 題同一個 accumulator）；瞬時除數 <b>2, 2, 3, 2, 2, 3, 2, 3</b>；平均 19 / 8 = <b>2.375</b> = 2 + 3/8。state 序列 <span className="mono">00000 → 00001 → 01100 → 01101 → 11000 → 11001 → 00110 → 00100 → 00101 → 10000 → 10001 → 11100 → 11101 → 01010 → 01000 → 01001 → 10100 → 10101 → 00010 → 00000</span>，週期 <b>19 個 clk edge</b>（= 2+2+3+2+2+3+2+3）。output rising edge 在 t = 0, 2, 4, 7, 9, 11, 14, 16, 19 T<sub>in</sub>。
        </p>
        <p>
          e<sub>k</sub> = t<sub>k</sub> − k·2.375 = <b>0, −0.375, −0.75, −0.125, −0.5, −0.875, −0.25, −0.625, 0</b> T<sub>in</sub> ⇒ peak-to-peak = <b>0.875 T<sub>in</sub></b> = (M − 1)/M · T<sub>in</sub>（M = 8，對照 M = 4 的 0.75）。pattern 週期 8 個 output 週期 ⇒ spur 在 f<sub>div</sub>/8 及其諧波；f<sub>ref</sub> = 100 MHz 時最低的一根在 12.5 MHz。注意 e<sub>k</sub> 不是單調的鋸齒——它是 −3/8 步進、mod 1 之後跳回來，正是 accumulator 殘值 /M 取負號的結果（e<sub>k</sub> = −r[k]/M）。
        </p>
        <p>
          <b>(B)</b> M = 4：K = 1 的 carry 是 <b>0, 0, 0, 1</b>、除數 2, 2, 2, 3，e<sub>k</sub> = 0, −0.25, −0.5, −0.75, 0；K = 3 的 carry 是 <b>0, 1, 1, 1</b>、除數 2, 3, 3, 3，e<sub>k</sub> = 0, −0.75, −0.5, −0.25, 0。兩者的週期都是 M / gcd(K, M) = 4，peak-to-peak 都是 <b>0.75 T<sub>in</sub></b>。反過來的<b>不是正負號</b>——兩串 e<sub>k</sub> 全都是負值或零，也就是每個 edge 都<b>比理想早到或準時</b>（瞬時除數不可能小於 N<sub>avg</sub> 之外還累積提前量）。反過來的是<b>鋸齒的斜率方向</b>：K = 3 是「一開始最早（−0.75），之後逐漸追上」，K = 1 是「逐漸落後到最早（−0.75），再一次歸零」。這個差別在頻譜上就是同一根 f<sub>div</sub>/4 spur 的<b>相位</b>不同，功率完全一樣。
        </p>
      </>
    ),
  },
}
export default lesson
