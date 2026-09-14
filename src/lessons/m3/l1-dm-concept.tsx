import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { dualMod23, muxSelect23 } from '@/models/divider/examples'
import { simulate } from '@/models/divider/engine'
import type { Netlist, SignalTrace, Values } from '@/models/divider/types'
import { T } from './models'
import { dm23Schematic, muxSelect23Schematic } from './schematics'
import { muxSelect23Timing } from './timing'
import { CommonOriginFigure, ModSwitchCompare } from './Widgets'

// ---------------------------------------------------------------- 由 engine 產生的靜態波形（課文與 quiz 共用）
/** B 架構 mod 固定 0：兩個 divider 各跑各的 */
const bFreeRun = simulate(muxSelect23, 9, { period: T }, () => ({ mod: 0 }))
const bFreeRunTraces = bFreeRun.sim.getTraces(['clk', 'out2', 'out3', 'div_out'])

/** quiz 用：clk + div_out（不顯示 mod，避免從 mod 波形反推答案） */
function outWave(nl: Netlist, inputAt: (e: number) => Partial<Values>, edges = 9): SignalTrace[] {
  const { sim } = simulate(nl, edges, { period: T }, inputAt)
  return sim.getTraces(['clk', 'div_out'])
}

function Content() {
  return (
    <>
      <Section title="先用直覺想" en="Intuition">
        <p>
          PLL 的 feedback divider 常常需要「有時 /2、有時 /3」：例如要平均除 2.4，就讓它依序做 3、3、2、2、2。這一課的問題只有一個：<b>同一個 divider，怎麼在不打斷輸出的情況下，把下一個 output edge 放在 2T<sub>in</sub> 或 3T<sub>in</sub> 之後？</b>
        </p>
        <p>
          想像一位鼓手數拍子：「1-2 ｜ 1-2-3 ｜ 1-2 ｜ 1-2-3」。每一小節的第一拍（downbeat）就是上一小節結束的那一拍——不管這一小節是兩拍還是三拍，<b>起點都是上一個 downbeat</b>。這就是 <Term zh="雙模除頻器" en="dual-modulus divider" />。
        </p>
        <p>
          另一種做法：請兩位鼓手，一位永遠打 2 拍、一位永遠打 3 拍，再用一個開關決定「現在聽誰的」。兩人各數各的，開關一切，你聽到的 downbeat 會<b>跳</b>——可能連續兩拍很近、可能突然空一拍、可能剛好切在半拍上。這<b>不是</b> dual-modulus divider，雖然電路圖上看起來也有 /2、也有 /3、也有 MOD。
        </p>
        <Callout kind="idea">
          /2 /3 dual-modulus 的定義不是「電路裡同時有 /2 和 /3」，而是：<b>每一個 output edge 都是下一個 interval 的共同起點；MOD 只決定這個 interval 是 2T<sub>in</sub> 還是 3T<sub>in</sub></b>。interval 之間沒有縫、沒有重疊、沒有第三種長度。
        </Callout>
      </Section>

      <Section title="兩種架構" en="Two architectures">
        <p>
          <b>A：state-continuous cell</b>。兩個 DFF 共用同一組 state（q1 q0）。mod = 0 時 state 走 00 → 01 → 00（2 個 state），mod = 1 時走 00 → 01 → 10 → 00（3 個 state）。兩條迴圈<b>共用 00 與 01</b>；mod 只在 state 01 那一刻決定要不要「繞路」經過 10。輸出在 state 00 時為 1。（下一課會完整做它的 state analysis。）
        </p>
        <LogicDiagram schematic={dm23Schematic} showValues={false} />
        <p>
          <b>B：獨立 /2 與 /3，再用 MUX 選</b>。FFa + INV 是一個自由跑的 /2（a0 每個 edge toggle）；FFb0、FFb1 + NOR 是一個自由跑的 /3（b1 b0：00 → 01 → 10）。mod 完全不進入任何 flop 的 D，只當 MUX 的 select，直接在輸出端選 out2 或 out3。
        </p>
        <LogicDiagram schematic={muxSelect23Schematic} showValues={false} />
        <CompareTable
          head={['', 'A：state-continuous', 'B：MUX 選輸出']}
          rows={[
            ['記憶元件', '2 個 flop，一組 state 兩種 mode 共用', '3 個 flop，兩台互不相干的 state machine'],
            ['mod 作用的地方', 'next-state logic（d1 = q0·mod），且只在 state 01 時有效', '輸出端的 combinational MUX，隨時生效'],
            ['下一個 output edge 的起點', '目前這個 output edge', '被選到的那台 divider 自己的相位'],
            ['可能出現的 interval', '只有 2T 與 3T', '任何值：1T、1.12T、1.65T、2.55T…不保證是整數個 T'],
            ['mod 切換時間有沒有人檢查', '有：mod → AND → FF1.D 是 setup / hold path', '沒有：mod → MUX → div_out 沒有 capture flop'],
          ]}
        />
      </Section>

      <Section title="逐一個 clock edge 看 A" en="Edge by edge: architecture A">
        <p>
          先按 4 次「下一個 Clock Edge」（mod = 0），再把 mod 切成 1、再按 3 次。每一步先自己回答：現在 state 是什麼？NOR 與 AND 已經算好的 d0、d1 是多少？edge 之後 state 變成什麼？div_out 有沒有翻？
        </p>
        <DividerSimPanel netlist={dualMod23} schematic={dm23Schematic} title="A：/2 /3 state-continuous cell" showDelayMode showPulseWidths />
        <Steps
          items={[
            <>
              <b>初始</b>：reset 讓 q1 q0 = 00。d0 = NOR(0, 0) = 1，d1 = q0·mod = 0·0 = 0。div_out = NOR(q1, q0) = <b>1</b>。
            </>,
            <>
              <b>Edge 1（1T）</b>：抓進 d1 d0 = 01 ⇒ state 01。div_out 變 0。現在 d0 = NOR(0, 1) = 0，d1 = 1·mod = 1·0 = <b>0</b>——mod = 0 把「繞路」關掉了。
            </>,
            <>
              <b>Edge 2（2T）</b>：state 01 → 00，div_out 回到 1：<b>output rising edge 在 2T</b>。
            </>,
            <>
              <b>Edge 3、4</b>：01、00。output rising edge 在 4T。interval = 4T − 2T = <b>2T</b>。
            </>,
            <>
              <b>把 mod 切成 1</b>（它會在 edge 5 之前 0.35T，也就是 4.65T 生效）。此時 state 是 00：d1 = q0·mod = 0·1 = 0，<b>mod 還沒有被用到</b>。Edge 5：00 → 01。
            </>,
            <>
              <b>State 01、mod = 1</b>：d1 = 1·1 = <b>1</b>，d0 = NOR(0, 1) = 0。Edge 6：01 → <b>10</b>。div_out 仍是 0（state 不是 00）。
            </>,
            <>
              <b>State 10</b>：d0 = NOR(1, 0) = 0，d1 = q0·mod = 0·1 = 0。Edge 7：10 → 00，div_out 升起：<b>output rising edge 在 7T</b>。interval = 7T − 4T = <b>3T</b>。
            </>,
            <>
              <b>結論</b>：3T 這段 interval 的起點是 4T——正好是上一段 2T interval 的終點。輸出從頭到尾沒有「跳」；只是多停了一個 state。量測列會顯示 interval = 2T, 2T, 3T。
            </>,
          ]}
        />
        <Callout kind="method" title="怎麼預測哪一段 interval 會變成 3T">
          <ol style={{ margin: 0 }}>
            <li>mod 只在 state 01 的那個 cycle 被 d1 = q0·mod 用到。</li>
            <li>找出 mod = 1 到達之後，state 第一次停在 01 的那個 cycle；結束它的那個 edge 會把 state 帶到 10。</li>
            <li>包含這個 cycle 的 interval（從前一個 output edge 起算）就是第一個 3T。</li>
          </ol>
        </Callout>
      </Section>

      <Section title="逐一個 clock edge 看 B" en="Edge by edge: architecture B">
        <p>
          先看 B 裡兩台 divider 自己的節奏（mod 固定 0，只是讓 div_out 複製 out2）。out2 = a0 在 1T、3T、5T、7T 升起（interval 2T）；out3 = NOR(b1, b0) 在 3T、6T、9T 升起（interval 3T）。<b>兩者的相位彼此無關</b>，也都不理會 mod：
        </p>
        <ClockWaveform
          signals={bFreeRunTraces}
          tEnd={9 * T}
          period={T}
          highlight={['div_out']}
          zoomable={false}
          showEdgeTimes={['out2', 'out3']}
          annotations={[
            { t: 3 * T, signal: 'out2', text: '/2 自己的節奏' },
            { t: 3 * T, signal: 'out3', text: '/3 自己的節奏（與 /2 無關）' },
          ]}
          title="B：mod = 0，兩台 divider 自由跑"
        />
        <p>
          接著自己操作：按 5 次 edge（mod = 0），然後把 mod 切成 1（會在 edge 6 之前 0.35T = 5.65T 生效），再按幾次。切換那一瞬間，out2 與 out3 各是多少？div_out 會不會立刻跳？
        </p>
        <DividerSimPanel netlist={muxSelect23} schematic={muxSelect23Schematic} title="B：獨立 /2、/3 再用 MUX 選（錯誤示範）" signals={['clk', 'mod', 'out2', 'out3', 'div_out']} showDelayMode showPulseWidths />
        <Steps
          items={[
            <>
              <b>Edge 1 到 5（mod = 0）</b>：div_out = out2。rising edge 在 1T、3T、5T，interval 2T。看起來是正常的 /2。
            </>,
            <>
              <b>5.65T，mod 變 1</b>：這一刻 out2 = 1（從 5T 起 high）、out3 = 0（b1 b0 = 10）。MUX 立刻把輸出從 1 換成 0 ⇒ div_out 在 5.65T <b>掉下來</b>。這個 falling edge 不屬於任何一台 divider；從 5T 開始的 pulse 被切成 0.65T。
            </>,
            <>
              <b>Edge 6（6T）</b>：/3 進入 state 00，out3 升起 ⇒ div_out 升起。上一個 rising edge 在 5T，這一個在 6T：<b>interval = 1T</b>。/2 不會有 1T，/3 也不會有 1T——這是一個<b>多出來的 edge</b>（extra edge）。
            </>,
            <>
              <b>之後</b>：9T、12T，interval 3T。輸出「終於」是 /3 了，但它的相位是 /3 自己的相位，不是「從 5T 起算 3T」。
            </>,
            <>
              <b>換一個切換點</b>：Reset，按 6 次，再切 mod = 1（6.65T 生效）。這一刻 out2 = 0、out3 = 1 ⇒ div_out 從 0 <b>跳成 1</b>：一個 rising edge 出現在 6.65T，那裡根本沒有 clock edge。量測列會顯示 interval = 1.65T、2.35T——<b>phase jump</b>。
            </>,
          ]}
        />
        <Callout kind="pitfall" title="「等兩個輸出都是 0 再切」救不了它">
          就算你很小心地挑一個 out2 = out3 = 0 的瞬間切換（例如 8.65T，兩者都在 low），切換本身不冒 edge，但下一個 edge 仍然出現在 /3 自己的相位上（9T），而不是「上一個 output edge + 3T」。兩台 divider 的相位是各自從 reset 算起的，彼此沒有關係；MUX 選的是 level，不是「從現在起算的 interval」。
        </Callout>
      </Section>

      <Section title="同一個切換序列，A 與 B 並排" en="Same MOD sequence, side by side">
        <p>
          下面把<b>完全相同</b>的 mod 切換（第 k 個 edge 之前 τ ps）同時餵給 A 與 B。拖曳 k 與 τ、換方向、換 delay 模式，看兩邊 div_out 的 rising edge interval：綠色 chip 是 2T / 3T，紅色 chip 是其他長度；紅色區域是比 30 ps 窄的 runt pulse（<span className="mono">detectRuntPulses</span> 找出來的）。
        </p>
        <ModSwitchCompare initialK={6} initialTau={35} initialMode="real" />
        <p>
          下面這幾個數字都以 widget 的<b>預設模式（實際 delay）</b>為準；理想（zero-delay）模式的值另外標出來，兩者的差就是 /2 與 /3 兩條輸出 latency 的落差（16 ps 對 28 ps，差 12 ps = 0.12T）。你應該會看到這些事：
        </p>
        <ul>
          <li>
            <b>A 的 chip 永遠是 2T 或 3T</b>。不管 k、τ、方向、delay 模式怎麼選（單元測試把 8 個 k × 5 個 τ × 2 個方向 × 2 種 delay 全掃過一遍）。τ 唯一影響的是「這個 state-01 cycle 趕不趕得上」——趕不上就晚一個 interval 才變 3T，但仍然是 2T 或 3T。
          </li>
          <li>
            <b>B 在 k = 6 多出一個 edge</b>：實際 delay 下 interval 是 <b>1.12T</b>（理想 delay 下正好 1T——多出來的 0.12T 就是換來源時 latency 從 16 ps 跳到 28 ps）。<b>k = 7 是 phase jump</b>：實際 delay <b>1.57T、2.55T</b>（理想 1.65T、2.35T）。<b>k = 6、τ = 5 ps</b> 在實際 delay 下出現 25 ps 的 runt（MUX 先把 out2 的 1 切掉，25 ps 後 out3 才升起；理想 delay 下這個 runt 只有 5 ps）。
          </li>
          <li>
            <b>實際 delay、k = 4</b>：這一組 B 切得很「乾淨」（切換時兩個來源都是 0），interval 卻是 2T、<b>3.12T</b>、3T。因為 /2 的輸出 latency 是 tCQ + tMUX = 16 ps，/3 是 tCQ + tNOR + tMUX = 28 ps：換來源就換了 12 ps 的 latency。
          </li>
          <li>
            <b>方向 /3 → /2、k = 2</b>：切換在 1.65T，此時 out2 已經是 1，div_out 憑空升起——實際 delay 下這個 edge 在 1.73T（再加一個 tMUX = 8 ps），第一段 interval 是 <b>1.43T</b>（理想 delay 下 edge 在 1.65T、interval 1.35T）。
          </li>
        </ul>
        <Callout kind="warning" title="B 的 interval「看起來合法」也不代表沒事">
          k = 8、理想 delay：B 的 chip 是 2T, 2T, 2T, 2T, 3T，全綠。但把游標移到 7T 附近：從 7T 開始的 pulse 在 7.65T 就被切斷了（本來應該到 8T）。interval 只看 rising edge；<b>pulse 被截短、falling edge 搬家</b>這種事，要看 pulse width 才會發現。這也是練習題要你自己推一次的原因。
        </Callout>
      </Section>

      <Section title="共同起點：output edge 就是下一段 interval 的原點" en="The common origin">
        <p>
          把 A 的 interval 攤開來看。下面 mod 在 edge 4 之前變 1、在 edge 10 之前變回 0；每一個 output rising edge 上都標了「從這裡起算，下一個 edge 在幾 T 之後」：
        </p>
        <CommonOriginFigure />
        <p>
          用數學寫下這件事。設第 k 個 output rising edge 的時間為 <Math>{'t_k'}</Math>（ps），第 k 段 interval 的<Term zh="瞬時除數" en="instantaneous modulus" /> 為 <Math>{'N_k \\in \\{2, 3\\}'}</Math>（無單位），輸入週期為 <Math>{'T_{in}'}</Math>（ps）：
        </p>
        <Math block>{'t_{k+1} = t_k + N_k\\,T_{in}'}</Math>
        <p>
          這條式子就是 dual-modulus 的全部：下一個 edge 的位置只由「上一個 edge 在哪」與「這一段的 N<sub>k</sub>」決定。沒有任何一項來自另一台 divider 的相位。累積 K 段之後：
        </p>
        <Math block>{'t_K = t_0 + T_{in}\\sum_{k=0}^{K-1} N_k \\quad\\Rightarrow\\quad \\bar N = \\frac{t_K - t_0}{K\\,T_{in}} = \\frac{1}{K}\\sum_{k=0}^{K-1} N_k'}</Math>
        <p>
          <Math>{'\\bar N'}</Math> 是 K 段的<Term zh="平均除數" en="average divide ratio" />。上圖的序列 3, 3, 2, 2, 2 給 <Math>{'\\bar N = 12/5 = 2.4'}</Math>——模擬器量測列的「平均 divide ratio」就是這樣算的。
        </p>
        <Callout kind="note" title="瞬時除數與平均除數要分開講">
          每一段 interval 都<b>精確</b>是 2T 或 3T，從來沒有一段是 2.4T。「/2.4」只存在於長時間的平均裡；每一段相對於理想 2.4T 都有 ±0.4T、±0.6T 的誤差，這個誤差就是 fractional-N 的 quantization error（Lesson 6-1）。B 架構的錯誤是另一種：它連「每一段都是整數個 T」都做不到。
        </Callout>
        <ModeContent level="engineer" title="為什麼 PLL 特別在意這件事">
          <p>
            PFD 比的是 divider 的 edge 與 reference 的 edge。A 架構的 edge 誤差是<b>確定的</b>（由 N<sub>k</sub> 序列決定，可以事先算出來），所以 DSM 可以把它整形、DTC 可以把它抵消。B 架構的 edge 位置多了一項「切換當下兩台 divider 的相對相位」——它取決於 mod 什麼時候換、換的時候兩台各在哪個 state，是一個沒有人整形的隨機量，直接變成 PLL 的 phase error 與 spur。更糟的是 1T 的 extra edge 會讓 PFD 多看到一個 edge：charge pump 被踢一下，loop 要花很多個 reference cycle 才回得來。
          </p>
        </ModeContent>
      </Section>

      <Section title="為什麼 STA 抓不到 B 的問題" en="Why STA does not catch B">
        <p>
          有人會說：「我跑過 timing，B 沒有 violation。」沒錯，而且這正是問題。用下面的 explorer 看 B 的候選路徑：兩台 divider 各自的 Q → D 回授都是正常的 setup path；但真正出事的 <span className="mono">mod → MUX → div_out</span> 的終點是<b>輸出 port</b>，沒有任何 flop 在某個 edge 檢查它。STA 對它只能算 latency，沒有 setup、沒有 hold。
        </p>
        <CriticalPathExplorer scenario={muxSelect23Timing} initialPath="mod-mux" />
        <Callout kind="note" title="output path 的明細區為什麼長得不一樣">
          點 <span className="mono">mod → MUX → div_out</span>（以及兩條 output latency path）時，explorer 不會顯示 Required time、Slack、T<sub>clk,min</sub> 與 F<sub>max</sub>，也沒有 Setup / Hold 分頁——因為它們的終點是輸出 port，<b>沒有 capture flop</b>，沒有人拿某個 edge 在等這筆資料，「來不來得及」這個問題根本不成立。它們只有 latency：mod → MUX = 12 + 8 = <b>20 ps</b>、/2 輸出 = <b>16 ps</b>、/3 輸出 = <b>28 ps</b>。真正要讀的就是這三個數字，特別是後兩者差的 <b>12 ps</b>——切換來源時輸出 edge 就跳了這麼多。切回上面兩條 Q → D 的 loop，才會看到完整的 setup / hold 表。
        </Callout>
        <Callout kind="warning" title="STA 沒報錯 ≠ 電路正確">
          setup / hold 檢查的是「資料在 capture edge 前後有沒有穩定」。pulse width 有沒有被截短、edge 有沒有多出來或搬家、interval 是不是整數個 T——這些叫 <Term zh="相位連續性" en="phase continuity" /> 與 <Term zh="脈寬" en="pulse width" />，不在 setup / hold 的範圍內。要讓 STA 幫得上忙，切換就必須發生在某個 flop 的 D 端：這正是 A 架構的 mod → AND → FF1.D。
        </Callout>
        <ModeContent level="deep" title="把 B 修好，就會變成 A">
          <ul>
            <li>
              <b>Latency 落差</b>：/2 輸出 = edge + tCQ + tMUX = 16 ps，/3 輸出 = edge + tCQ + tNOR + tMUX = 28 ps。就算切換時兩個來源 level 相同，換來源就換了 12 ps 的 edge 位置。在 10 GHz（T = 100 ps）這是 0.12 UI 的 phase step，比多數 PLL 的 in-band phase noise 要求大好幾個數量級。
            </li>
            <li>
              <b>Runt</b>：切換在某個來源 edge 前 τ ＜ tMUX + (latency 差) 的窗口內，MUX 輸出會先跟著舊來源、再跟著新來源，冒出寬度只有十幾 ps 的 pulse。下游 flop 的最小 pulse width（這裡設 30 ps）擋不住它——可能觸發、可能不觸發、可能 metastable。
            </li>
            <li>
              <b>怎麼修</b>：要讓「切換」只在某個 clock edge 發生，而且兩個來源在那個 edge 對齊。做到這兩件事的最直接方法是：讓兩台 divider 共用 state、讓 mod 只在某個 state 進入 next-state logic——也就是 A。高速 CML prescaler（/4 /5、/8 /9）的核心也是這樣：一個 synchronous /2 /3 cell，加上非同步 /2 級與回饋的 modulus 控制（Lesson 4）。
            </li>
            <li>
              <b>另一個常見誤會</b>：「先 reset 兩台 divider 再切」。reset 本身是非同步事件，release 有 recovery / removal 的要求（Lesson 1-1）；而且 reset 期間輸出停住，等於製造一個很長的 missing interval。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>把「/2 與 /3 經 MUX 選擇」當成 dual-modulus divider</b>：兩台 divider 的相位互不相干，切換時會有 extra edge、phase jump、runt。dual-modulus 的定義是「下一個 edge 以目前 edge 為起點」。
            </li>
            <li>
              <b>以為只要切換時兩個輸出都是 0 就安全</b>：切換不冒 edge，但下一個 edge 仍在另一台 divider 自己的相位上。
            </li>
            <li>
              <b>把平均除數當成每一段的除數</b>：A 的每一段都是 2T 或 3T；2.4 只是平均。設計 PFD / loop filter 時要用每段的誤差，不是平均值。
            </li>
            <li>
              <b>因為 STA 沒報錯就放心</b>：mod → MUX → 輸出沒有 capture flop，STA 根本沒在檢查它。要看 pulse width 與 interval 序列。
            </li>
            <li>
              <b>忽略輸出 latency 落差</b>：不同來源的 tCQ + logic 不同，「乾淨」的切換也會有固定的 phase step。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="SystemVerilog：A 架構（synthesizable）">
          <CodeBlock
            title="dm23.sv"
            code={`
module dm23 (
  input  logic clk,
  input  logic rst_n,     // async active-low reset
  input  logic mod,       // 0: divide by 2, 1: divide by 3
  output logic div_out
);
  logic q0, q1;
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      q0 <= 1'b0;
      q1 <= 1'b0;                 // reset state 00
    end else begin
      q0 <= ~(q1 | q0);           // d0 = NOR(q1, q0)
      q1 <= q0 & mod;             // d1 = q0 AND mod : mod 只在 q0 = 1（state 01）時有作用
    end
  end
  assign div_out = ~(q1 | q0);    // state 00 時為 1（= d0）
endmodule
`}
            note="mod 進的是 flop 的 D（經過 AND），所以它有 setup / hold 要求，也才有「切換一定發生在某個 edge」這件事。把 mod 接到輸出端的 MUX，就失去這兩個性質。"
          />
        </ModeContent>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------- 練習：給 B 一個切換時刻，先預測再模擬
function ExerciseComponent() {
  return (
    <>
      <DividerSimPanel netlist={muxSelect23} schematic={muxSelect23Schematic} title="B：逐 edge 操作（先在紙上推完再按）" signals={['clk', 'mod', 'out2', 'out3', 'div_out']} showDelayMode showPulseWidths showEquations={false} compact />
      <ModSwitchCompare initialK={8} initialTau={35} initialMode="ideal" title="對答案：把 k 拖到你預測的切換點" />
    </>
  )
}

const lesson: LessonDef = {
  id: 'm3-l1-dm-concept',
  module: 3,
  order: 1,
  title: '什麼是 /2 /3 Dual-Modulus Divider',
  titleEn: 'What a /2 /3 dual-modulus divider really is',
  summary: '同一個 output edge 起點，連續執行 2T 或 3T 的 interval——不是「跑一個 /2 和一個 /3 再用 MUX 選」。用相同的 MOD 切換序列並排比較兩種架構，看 extra edge、phase jump、runt 是怎麼來的。',
  goals: [
    '用「共同起點」定義 dual-modulus divider：t(k+1) = t(k) + N(k)·Tin，N(k) ∈ {2, 3}。',
    '逐 edge 追蹤 state-continuous cell（A）在 mod 切換時的 state 與 output edge，指出哪一段 interval 變成 3T。',
    '逐 edge 追蹤 MUX 選輸出（B）在切換時為什麼出現 1T interval、非整數 interval、被截短的 pulse 與 runt。',
    '解釋為什麼 mod → MUX → 輸出這條路徑 STA 不會報錯，以及為什麼那反而是問題。',
    '分清楚每一段的瞬時除數與長時間的平均除數。',
  ],
  readingMinutes: 35,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'single',
      prompt: '下列哪一句最準確地描述 /2 /3 dual-modulus divider？',
      options: [
        '同時跑一個 /2 與一個 /3，依 MOD 用 MUX 選其中一個當輸出',
        '每個 output edge 都是下一段 interval 的起點，MOD 決定該段是 2Tin 還是 3Tin',
        '一個 /2 後面串一個可以旁路的 /1.5',
        '任何平均除數介於 2 與 3 之間的 divider',
      ],
      answer: 1,
      explanation: '關鍵在「共同起點」：t(k+1) = t(k) + N(k)·Tin。MUX 選輸出的做法讓下一個 edge 落在另一台 divider 自己的相位上，不滿足這個式子；平均除數只是結果，不是定義。',
    },
    {
      id: 'q2',
      type: 'waveform',
      prompt: 'A 架構（state-continuous cell）從 reset 開始，mod 在 edge 4 之前（t = 3.65T）由 0 變 1 並保持。哪一個是 div_out？',
      options: [
        { label: 'A', traces: outWave(dualMod23, (e) => ({ mod: e >= 4 ? 1 : 0 })) },
        { label: 'B', traces: outWave(muxSelect23, (e) => ({ mod: e >= 4 ? 1 : 0 })) },
        { label: 'C', traces: outWave(dualMod23, (e) => ({ mod: e >= 5 ? 1 : 0 })) },
        { label: 'D', traces: outWave(dualMod23, () => ({ mod: 1 })) },
      ],
      answer: 0,
      tEnd: 900,
      period: 100,
      explanation:
        'A：state 在 edge 3 之後是 01，mod = 1 在 3.65T 到達，所以 edge 4 抓到 d1 = 1 ⇒ 10 ⇒ edge 5 回到 00：從 2T 起算的 interval 變成 3T（rising edge 在 2T、5T、8T）。C 是 mod 晚一個 cycle 才到（rising edge 2T、4T、7T）；B 是 MUX 架構，3T 之後跟著 /3 自己的相位（1T、3T、6T、9T）；D 是從頭就 /3（3T、6T、9T）。',
    },
    {
      id: 'q3',
      type: 'numeric',
      prompt: 'A 架構的 interval 序列為 3T, 3T, 2T, 2T, 2T。這五段的平均除數是多少？',
      answer: 2.4,
      tolerance: 0.01,
      explanation: '(3 + 3 + 2 + 2 + 2) / 5 = 2.4。注意沒有任何一段是 2.4T——這是平均值，每一段相對於 2.4T 的誤差就是 fractional-N 的 quantization error。',
    },
    {
      id: 'q4',
      type: 'multiple',
      prompt: 'B 架構（獨立 /2、/3 再用 MUX 選）在 mod 切換時可能出現哪些現象？',
      options: [
        '相鄰 output rising edge 只相隔 1T（extra edge）',
        'interval 不是整數個 T（phase jump）',
        '比下游 flop 最小 pulse width 還窄的 runt pulse',
        'mod → MUX → div_out 這條路徑的 setup violation',
        'A 架構只要 mod 在 clock edge 附近切換，也會出現一樣的非 2T / 3T interval',
      ],
      answers: [0, 1, 2],
      explanation: 'mod → MUX → 輸出沒有 capture flop，STA 沒有 setup 可以 violate——這正是問題被漏掉的原因。A 在 edge 附近切換是 FF1 的 setup / hold 問題（Lesson 3-2），只要 d1 被確實抓到，interval 仍然只有 2T 或 3T。',
    },
    {
      id: 'q5',
      type: 'single',
      prompt: 'A 架構：mod = 0 跑了 4 個 edge（state 在 edge 4 之後是 00），mod 在 4.65T 變成 1。哪一段 interval 第一個變成 3T？',
      options: ['從 2T 起算的那段（2T → 5T）', '從 4T 起算的那段（4T → 7T）', '從 6T 起算的那段（6T → 9T）', '4.65T 當下就會產生一個 output edge'],
      answer: 1,
      explanation: 'edge 5 把 state 帶到 01（此時 d1 = q0·mod 才變 1），edge 6 到 10，edge 7 回到 00 ⇒ output edge 在 4T、7T。3T 從 4T 起算——mod 到達時 state 是 00，這一次還沒被用到。',
    },
    {
      id: 'q6',
      type: 'state',
      prompt: 'A 架構從 reset 開始，mod 在 edge 2 之前變成 1 並保持。經過 4 個 rising edge 之後 state（q1 q0）是多少？',
      answer: '01',
      width: 2,
      bitNames: ['q1', 'q0'],
      explanation: 'edge 1：00 → 01（mod 還是 0，但 d1 = q0·mod 在 edge 1 之前 q0 = 0，無影響）。edge 2 之前 mod = 1、state 01 ⇒ d1 = 1：edge 2 → 10；edge 3 → 00；edge 4 → 01。序列 01, 10, 00, 01。',
    },
    {
      id: 'q7',
      type: 'single',
      prompt: '為什麼 STA 不會對 B 架構的 mod → MUX → div_out 路徑報 setup violation？',
      options: ['因為 MUX 的 delay 是 0', '因為這條路徑沒有 capture flop，終點是輸出 port', '因為 mod 是非同步訊號，STA 一律忽略', '因為 /2 與 /3 的 Q → D 回授已經通過檢查'],
      answer: 1,
      explanation: 'setup / hold 是「某個 flop 在某個 edge 抓資料」的檢查；沒有 capture flop 就沒有 capture edge，STA 只能給 latency。pulse width 與 phase continuity 不在它的檢查範圍內。',
    },
  ],
  exercise: {
    title: '給 B 一個切換時刻：先預測 interval 序列，再模擬驗證',
    prompt: (
      <>
        <p>
          B 架構裡 out2 在 1T、3T、5T、7T、9T 升起（high 1T），out3 在 3T、6T、9T 升起（high 1T）。mod 在第 k 個 edge 之前 0.35T 生效。<b>先不要按模擬</b>，用這兩張時間表自己推：
        </p>
        <ol>
          <li>
            <b>情境 1：k = 8（切換在 7.65T），理想 delay。</b>切換那一瞬間 out2、out3 各是多少？div_out 會不會立刻改變？下一個 rising edge 在哪裡？寫出切換前後的 interval 序列。從 7T 開始的那個 pulse 寬度是多少？
          </li>
          <li>
            <b>情境 2：k = 7（切換在 6.65T），理想 delay。</b>同樣的問題。這次 interval 序列裡會出現什麼非整數？
          </li>
          <li>
            <b>情境 3：情境 1 改成實際 delay</b>（tCQ = 8、NOR = 12、MUX = 8 ps）。/2 的輸出 edge 在 clock edge 後幾 ps？/3 的呢？切換後第一段 interval 是多少 T？
          </li>
          <li>對照：同樣 k = 8，A 架構的 interval 序列是什麼？哪一段變成 3T？</li>
        </ol>
        <p>推完之後，用上面的模擬器逐 edge 對答案（mod 在 edge 7 之後切成 1 就是 k = 8），再把「對答案」面板的 k 拖到 8 與 7。</p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: ['寫出切換瞬間 out2、out3 的值與 div_out 的反應', '列出情境 1、2 的 rising edge 時間與 interval 序列', '指出情境 1 哪個 pulse 被截短、截成多寬', '算出情境 3 的 latency 差與第一段 interval', '寫出 A 在 k = 8 時的 interval 序列'],
    answer: (
      <>
        <p>
          <b>情境 1（k = 8，7.65T）</b>：out2 = 1（7T–8T high），out3 = 0（要到 9T 才高）。MUX 從 out2 換到 out3 ⇒ div_out 在 7.65T 立刻掉到 0。下一個 rising edge 是 out3 的 9T，再來 12T。rising edge：1T, 3T, 5T, 7T, 9T, 12T ⇒ interval <b>2T, 2T, 2T, 2T, 3T</b>——全部「合法」，但從 7T 開始的 pulse 只有 <b>0.65T</b>（本應 1T），它的 falling edge從 8T 搬到 7.65T。只看 rising edge interval 會漏掉這件事。
        </p>
        <p>
          <b>情境 2（k = 7，6.65T）</b>：out2 = 0（6T–7T low），out3 = 1（6T–7T high）。div_out 從 0 跳成 1 ⇒ 6.65T 出現一個 rising edge，7T 隨 out3 落下。rising edge：1T, 3T, 5T, 6.65T, 9T, 12T ⇒ interval 2T, 2T, <b>1.65T, 2.35T</b>, 3T。6.65T 不是任何 clock edge：phase jump。
        </p>
        <p>
          <b>情境 3（k = 8，實際 delay）</b>：/2 輸出 edge = clock edge + tCQ + tMUX = 8 + 8 = <b>16 ps</b>；/3 輸出 edge = tCQ + tNOR + tMUX = 8 + 12 + 8 = <b>28 ps</b>。rising edge：116, 316, 516, 716, <b>928</b>, 1228 ⇒ 切換後第一段 = (928 − 716) / 100 = <b>2.12T</b>，多出來的 0.12T 就是兩條路徑的 latency 差。從 716 開始的 pulse 在 773 被切斷（57 ps）。
        </p>
        <p>
          <b>A 在 k = 8</b>：state 在 edge 7 之後是 01，mod = 1 在 7.65T 到達 ⇒ edge 8 抓到 d1 = 1 → 10，edge 9 → 00。rising edge：2T, 4T, 6T, <b>9T</b>, 12T ⇒ interval 2T, 2T, <b>3T</b>, 3T。3T 從 6T 起算——上一段 2T 的終點。沒有任何 pulse 被截短（每個 pulse 都是完整的 1T）。
        </p>
        <p className="small muted">這四組數字都在 src/lessons/m3/models.test.ts 裡用 simulate() 驗證過。</p>
      </>
    ),
  },
}
export default lesson
