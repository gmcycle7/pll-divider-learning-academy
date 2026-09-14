import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { traceFrom } from '@/components/waveform/ClockWaveform'
import { phaseClockEvents } from '@/models/phase/pmux'
import { pmuxDualMod23, pmuxDualMod23Safe } from './models'
import { glitchFreeHalfCycleHighlight, glitchFreeMuxSchematic, pmuxDm23Schematic } from './schematics'
import { glitchFreeTiming, pmuxSwitchTiming } from './timing'
import { MuxSwitchDemo, PmuxDm23Sim, SafeWindowTable } from './Widgets'
import './style.css'

function Content() {
  return (
    <>
      <Section title="先用直覺想：換軌道的火車" en="Intuition">
        <p>
          Lesson 5-1 把 select 當成「reset 前設好、之後不動」的常數。真實的 PMUX 每個 output 週期都要換一次 phase。問題來了：<b>select 改變的那一瞬間，pmux_out 會發生什麼？</b>
        </p>
        <p>
          想像一列火車在軌道 A 上跑，你要把它切到軌道 B。如果切換的那一刻兩條軌道<b>在同一個高度</b>（同 level），火車平順地過去，什麼都沒發生。如果 A 是高架、B 在地面，切換的瞬間火車「掉」下去——這一掉，就是一個多出來的 <Term zh="邊緣" en="edge" />。
        </p>
        <p>
          MUX 是 combinational 的：select 一變，輸出<b>立刻</b>變成新輸入現在的值。若舊 phase 現在是 1、新 phase 現在是 0，輸出就在這一刻從 1 跳到 0；反過來就從 0 跳到 1。這個 transition 不屬於任何一條 phase 的 edge，它是憑空多出來的。
        </p>
        <Callout kind="idea">
          divider 分析永遠追蹤 edge。問自己一個問題就夠了：<b>切換的瞬間，ph_old 與 ph_new 的 level 一樣嗎？</b>一樣 → 沒有多出 edge；不一樣 → 多出一個 edge，而且它旁邊的 pulse 會很窄。
        </Callout>
      </Section>

      <Section title="會發生的五種事" en="What can go wrong">
        <p>
          設 ph_old = ph0、ph_new = ph1（forward +1）。以 ph0 的 rising edge 為 t = 0：ph0 在 [0, 0.5 T) 是 high，ph1 在 [0.125 T, 0.625 T) 是 high。逐段推：
        </p>
        <Steps
          items={[
            <>
              <b>t ∈ [0, 0.125 T)：ph0 = 1、ph1 = 0</b>。在這裡切，pmux_out 從 1 掉到 0，剛升起的 high pulse 被截短成不到 0.125 T ⇒ <Term zh="短脈波" en="short / runt pulse" />。
            </>,
            <>
              <b>t ∈ [0.125 T, 0.5 T)：兩者都是 1</b>。切了沒事，pmux_out 繼續 high，直到 ph1 在 0.625 T 落下。這個 high pulse 反而變長（0.625 T）。
            </>,
            <>
              <b>t ∈ [0.5 T, 0.625 T)：ph0 = 0、ph1 = 1</b>。切了 pmux_out 從 0 跳到 1——多了一個 rising edge——再在 0.625 T 跟著 ph1 落下：一個寬 &lt; 0.125 T 的 runt。下游 divider 可能把這個 runt 當一個 edge 數進去（<Term zh="重複邊緣" en="double edge" />），也可能沒數到，也可能 metastable。
            </>,
            <>
              <b>t ∈ [0.625 T, 1 T)：兩者都是 0</b>。安全。下一個 rising edge 就是 ph1 的 1.125 T，與上一個 edge（0）相距 1.125 T：這正是我們要的 forward +1。
            </>,
            <>
              另一種後果是 <Term zh="漏脈波" en="missing pulse" />：如果 select 在 0.5 T 附近切、而 MUX 的 inertial delay 把窄 pulse 濾掉，pmux_out 這一個 T 內完全沒有 rising edge——divider 少數一個。
            </>,
          ]}
        />
        <Callout kind="warning" title="這不是 setup 問題，是 pulse width 問題">
          很多人第一反應是「select 對 MUX 的 setup time 不夠」。MUX 沒有 setup time——它是 combinational。真正的判準是：切換之後，pmux_out 上每一段 high / low 的寬度是否都大於下游 flop 的 <Term zh="最小脈波寬度" en="minimum pulse width, tpw,min" />。寬度不夠的 pulse 是 <Term zh="脈波寬度違規" en="pulse-width violation" />，它讓 flop 的 master latch 來不及 regenerate；結果不確定。
        </Callout>
      </Section>

      <Section title="互動：拖曳 select 的切換時間" en="Sweep the switching instant">
        <p>
          下面的 demo 用 <span className="mono">muxSwitchOutput()</span> 產生 pmux_out：t<sub>sw</sub> 之前跟 ph_a，之後跟 ph_b。pmux_out 列的底色標出「同 level（綠）」與「不同 level（紅）」。先固定 a = 0、b = 1，把 t<sub>sw</sub> 從 1.0 T 慢慢拖到 2.0 T，對照上面五段的推論；再把 b 改成 4、7、5 看看。
        </p>
        <MuxSwitchDemo initialA={0} initialB={1} initialT={1.55} title="ph_a → ph_b：切換時間掃描（時間單位 Tvco）" />
        <Steps
          items={[
            <>
              <b>b = 1，t<sub>sw</sub> = 1.55 T</b>：紅區（ph0 已 low、ph1 還 high）。pmux_out 多一個 rising edge，而且切口兩側各留下一段窄脈波：ph0 落下（1.5 T）到切換（1.55 T）那段<b>低電位只有 0.05 T</b>、新升起的<b>高電位（1.55 ～ 1.625 T）只有 0.075 T</b>，兩段都比 t<sub>pw,min</sub> = 0.2 T 窄。demo 的判決框由左往右掃，會先報 0.05 T 那一段——課文與 widget 的數字差在這裡，不是兩套算法。下游 /2 的 q 多 toggle 一次。
            </>,
            <>
              <b>b = 1，t<sub>sw</sub> = 1.3 T</b>：綠區（都 high）。乾淨。下一個 rising edge 在 2.125 T。
            </>,
            <>
              <b>b = 7（backward −1），t<sub>sw</sub> = 1.7 T</b>：都 low，乾淨；下一個 edge 在 1.875 T，比不切早 1/8 T。注意 low pulse 只剩 0.375 T——pulse width 判準仍然要看。
            </>,
            <>
              <b>b = 4</b>：ph4 是 ph0 的反相，紅區佔滿整個 T。無論 t<sub>sw</sub> 在哪，都會多出 transition；只有 pulse 剛好各 0.25 T 時才勉強不算 runt。
            </>,
          ]}
        />
      </Section>

      <Section title="最簡單的電路：combinational PMUX → /2 /3 cell" en="The circuit">
        <p>
          把 Lesson 5-1 的 /4 換成 Lesson 3 的 /2 /3 dual-modulus cell（之後 Lesson 5-3 會用到）。PMUX 還是一個 8:1 combinational MUX，select 隨時可以改：
        </p>
        <LogicDiagram schematic={pmuxDm23Schematic} showValues={false} />
        <ul>
          <li>
            <b>Clock input</b>：8 條 <span className="mono">ph0..ph7</span> → PMUX → <span className="mono">pclk</span>。
          </li>
          <li>
            <b>Memory element</b>：FF0、FF1，state = <span className="mono">q1 q0</span>；mod = 0 走 00 → 01 → 00（/2），mod = 1 走 00 → 01 → 10 → 00（/3）。
          </li>
          <li>
            <b>Feedback</b>：<span className="mono">d0 = NOT(q1 OR q0)</span>、<span className="mono">d1 = q0 AND mod</span>。PMUX 不在 feedback 裡；它在 clock path 上。
          </li>
        </ul>
      </Section>

      <Section title="逐一個 clock edge 操作：讓 divider 真的數錯" en="Edge by edge">
        <p>
          模擬器的 input 在 ph0 的 <b>falling edge</b>（t = k.5 T）生效。這個時刻 ph0 剛變 0，而 ph1、ph2、ph3 還是 1、ph4 剛升起、ph5..ph7 是 0。所以：
        </p>
        <Steps
          items={[
            <>
              模擬器已經幫你走到 edge 3（state 01 → 00 → 01，/2）。現在把 <span className="mono">s0</span> 設成 1（select 0 → 1），按「下一個 Clock Edge」。
            </>,
            <>
              敘述會告訴你：select 在 3.5 T 改變，此時 ph0 = 0、ph1 = 1 ⇒ pclk 立刻跳高，到 3.625 T 才跟 ph1 落下：<b>一個 0.125 T 的 runt</b>。理想 flop 把它當成一個 edge：state 01 → 00，div_out 在 3.5 T 就升起——比原本該有的 4 T 早了半個 T。
            </>,
            <>
              Reset，改成 <span className="mono">s2 s1 s0 = 1 1 1</span>（select 7）。3.5 T 時 ph0 = 0、ph7 = 0 ⇒ 沒有多出 edge；下一個 pclk edge 在 3.875 T（ph7）。這是乾淨的 backward −1。
            </>,
            <>
              再試 select 4：3.5 T 剛好是 ph4 的 rising edge。pclk 在 3.0 T（ph0）與 3.5 T（ph4）各升一次——同一個 T 內兩個 rising edge，divider 多數一個。
            </>,
            <>
              切到「實際 delay」模式：runt 的寬度不變（它由兩條 phase 的 edge 決定），只是整體晚了 MUX 的 delay。所以 delay 不是解藥。
            </>,
          ]}
        />
        <PmuxDm23Sim netlist={pmuxDualMod23} prerun={3} title="combinational PMUX → /2 /3 cell（select 在 ph0 falling edge 生效）" signals={['ph0', 'ph1', 'ph4', 'ph7', 's0', 's1', 's2', 'mod', 'pclk', 'q0', 'q1', 'div_out']} />
        <Callout kind="method" title="逐 edge 分析 PMUX 切換的固定步驟">
          <ol style={{ margin: 0 }}>
            <li>寫下 select 改變的時刻 t<sub>sw</sub>（相對 ph_old 的 rising edge）。</li>
            <li>查 ph_old(t<sub>sw</sub>)、ph_new(t<sub>sw</sub>)：同 level？</li>
            <li>不同 → pmux_out 在 t<sub>sw</sub> 多一個 transition；算出它與前後 edge 形成的 pulse 寬度。</li>
            <li>把每個 pulse 寬度跟下游 t<sub>pw,min</sub> 比：不夠就是 runt，下游行為不確定；夠的話 divider 會「正常」多數一個 edge——相位仍然跳掉。</li>
            <li>同 level → 下一個 edge 就是 ph_new 的 edge；間隔 = 1 ± k/8 T。</li>
          </ol>
        </Callout>
      </Section>

      <Section title="Safe switching window 的計算" en="The safe window">
        <p>
          把上面的推論一般化。ph_a 在 [0, 1/2) high；forward k 步的 ph_b 在 [k/8, 1/2 + k/8) high（單位 Tvco，相對 ph_a 的 rising edge）。兩者同 level 的區間：
        </p>
        <Math block>{'W_{high} = \\left[\\tfrac{k}{M},\\ \\tfrac{1}{2}\\right],\\qquad W_{low} = \\left[\\tfrac{1}{2} + \\tfrac{k}{M},\\ 1\\right],\\qquad |W_{high}| = |W_{low}| = \\tfrac{1}{2} - \\tfrac{k}{M}'}</Math>
        <p>
          變數：<Math>{'k'}</Math> = forward 的 phase 步數（1 ≤ k ≤ M−1）、<Math>{'M'}</Math> = phase 數（8）、時間單位 <Math>{'T_{vco}'}</Math>。<Math>{'k \\ge M/2'}</Math> 時改用 backward <Math>{'M-k'}</Math> 步來看，寬度公式對稱。每個 T 可以切換的總時間：
        </p>
        <Math block>{'T_{safe} = 2\\left(\\tfrac{1}{2} - \\tfrac{k_{min}}{M}\\right) T_{vco} = \\left(1 - \\tfrac{2k_{min}}{M}\\right) T_{vco},\\qquad k_{min} = \\min(k, M-k)'}</Math>
        <SafeWindowTable highlightK={1} />
        <Steps
          items={[
            <>
              <b>相鄰 phase（k = 1）重疊最大</b>：每個窗 3/8 T = 46.9 ps（Tvco = 125 ps），每個 T 有 3/4 T 可以切。
            </>,
            <>
              <b>k = 2</b>：每個窗 1/4 T；<b>k = 3</b>：只剩 1/8 T = 15.6 ps，已經比 select 路徑的 jitter + PVT 變化大不了多少。
            </>,
            <>
              <b>k = 4（反相）：沒有窗。</b> 這不是 timing margin 不夠，而是結構上不存在同 level 的時刻。要走 4 步，只能拆成兩次（各自在安全窗內切），或改用下面的 glitch-free MUX。
            </>,
            <>
              窗口的位置也重要：W<sub>high</sub> 在 ph_a 升起後 k/8 T 才打開，太早切也會出事（ph_a 已 high、ph_b 還 low）。所以 select 路徑<b>同時有 max-delay 與 min-delay 要求</b>。
            </>,
          ]}
        />
        <Callout kind="warning" title="判準永遠是下游的 tpw,min">
          「同 level」保證的是<b>不多出 transition</b>。切在窗口邊緣，合併後的 pulse 仍可能比不切時窄（例如 backward 3 步時 high pulse 只剩 1/8 T）。所以設計規格要寫成：<b>切換後 pmux_out 上任何一段 pulse ≥ t<sub>pw,min</sub> + margin</b>，而不是「select 在窗內」。
        </Callout>
        <ModeContent level="engineer" title="把 window 寫成 timing constraint">
          <p>
            以 ph_old 的 rising edge 為 launch 參考點、select 到達 pmux_out 的時間為 <Math>{'t_{arr}'}</Math>（含 FSM 的 clock-to-Q、decode、MUX select-to-out）。forward k 步的第一個窗要求：
          </p>
          <Math block>{'\\tfrac{k}{M}T_{vco} + t_{hold,margin} \\le t_{arr,min} \\quad\\text{且}\\quad t_{arr,max} + t_{jitter} + t_{margin} \\le \\tfrac{1}{2}T_{vco}'}</Math>
          <p>
            左式像 hold check（不能太早）、右式像 setup check（不能太晚），但 capture 不是 flop 的 edge，而是「ph_new 升起」與「ph_old 落下」這兩個時刻。在 STA 工具裡這條路徑會被當成 asynchronous / false path——必須手動加 constraint 或用 retiming 把它變成真正的 flop-to-flop path。
          </p>
        </ModeContent>
      </Section>

      <Section title="這個架構的 critical path" en="Critical path">
        <p>
          照 Lesson 1-1 的流程：launch 在哪？phase_sel 這個 FSM flop 的 clock 是 div_out，而 div_out 是 divider 在 ph_old 的 rising edge 之後 tCQ 產生的。所以 <b>launch edge = ph_old 的 rising edge</b>（經過 divider）。capture 在哪？不是 flop——是 pmux_out 上「ph_old 與 ph_new 同 level」的時間窗。
        </p>
        <p className="mono">ph_old ↑ → divider tCQ → div_out → phase_sel.clk → tCQ → decode → PMUX select → pmux_out（必須落在 [k/8 T, 1/2 T] 內）</p>
        <p>
          用 Explorer 逐步看：切換 mode（forward +1 … +4）觀察 window 怎麼變窄。path type 是 <span className="mono">async</span>：它限制的是 <b>switching window</b>，不是 Fmax。
        </p>
        <CriticalPathExplorer scenario={pmuxSwitchTiming} initialPath="sel-window-k1" guided />
        <Steps
          items={[
            <>
              <b>forward +1</b>：max arrival 54 ps，window 在 62.5 ps 關閉，扣掉 jitter 3 + margin 3 剩 2.5 ps slack——過了，但只差 2.5 ps。min arrival 34 ps ≥ window 打開的 15.6 ps，hold 視圖也過。
            </>,
            <>
              <b>forward +2</b>：window 打開延到 31.25 ps，min arrival 34 ps 只剩 2.75 ps；快一點的 PVT corner 就落進「ph_old 已 high、ph_new 還 low」的紅區。
            </>,
            <>
              <b>forward +3</b>：window 打開在 46.9 ps，min arrival 34 ps 太早 ⇒ hold-like 違規：select 到得太快反而錯。
            </>,
            <>
              <b>forward +4</b>：window 寬度 0。任何 delay 都救不了。
            </>,
          ]}
        />
        <Callout kind="pitfall" title="不要把它當成普通的 data setup path">
          它沒有 capture flop、沒有 tsetup；它「同時」要求不能太早也不能太晚；而且它的失敗模式是 pulse-width violation，不是抓錯資料。在報告裡把這條路徑標成「setup critical path」會誤導下一個工程師去加 buffer。
        </Callout>
        <ModeContent level="engineer" title="路徑上其他兩條：divider 內部與 clock path">
          <p>
            Explorer 裡還有兩條 path。<b>divider 內部 Q → logic → D</b> 才是 Fmax critical path：launch 與 capture 都在 pclk 的 rising edge。注意 backward step 那一個 cycle 的 pclk 週期只有 1 − k/8 T，這條 path 的可用時間也跟著縮短——backward 步數越大，divider 的 timing 越緊。<b>ph_i → PMUX → clk</b> 是 clock path：它的 delay 決定 latency 與 mismatch，不決定 Fmax。
          </p>
        </ModeContent>
      </Section>

      <Section title="Glitch-free MUX：舊的先關、新的後開" en="Glitch-free clock MUX">
        <p>
          既然問題是「select 在錯的時刻改變」，解法就是<b>不要讓 select 直接進 MUX</b>：每一條 phase 各有一個 enable，enable 只在自己那條 phase 的 <b>falling edge</b> 更新。這樣 enable 改變時，那條 phase 一定是 0，AND 之後不會產生 edge。
        </p>
        <LogicDiagram schematic={glitchFreeMuxSchematic} showValues={false} highlights={[glitchFreeHalfCycleHighlight]} />
        <Steps
          items={[
            <>
              <b>切換 a → b，FSM 把 sel 從 0 改成 1。</b> d_a = NOT sel AND NOT en_b = 0；d_b = sel AND NOT en_a = 0（因為 en_a 還是 1）。
            </>,
            <>
              <b>ph_a 的下一個 falling edge</b>：EN_a 抓到 0，en_a = 0。此時 ph_a = 0，所以 ph_a·en_a 從 0 變 0——沒有 edge。pmux_out 現在暫時沒有任何 clock。
            </>,
            <>
              <b>d_b 變成 1</b>（en_a 已經 0）。等 <b>ph_b 的下一個 falling edge</b>：EN_b 抓到 1，en_b = 1。此時 ph_b = 0，AND 輸出還是 0——也沒有 edge。
            </>,
            <>
              <b>ph_b 的下一個 rising edge</b>：pmux_out 第一次由 ph_b 驅動。從 ph_a 最後一個 rising edge 到這裡，間隔 = 1 + k/8 T（forward k 步）。永遠沒有 runt。
            </>,
          ]}
        />
        <p>下面是 8-phase 版本（每條 phase 一個 enable flop）接 /2 /3 cell。做跟上面一樣的實驗：走到 edge 3，把 s0 設成 1，看 pclk 與 en0 / en1：</p>
        <PmuxDm23Sim netlist={pmuxDualMod23Safe} prerun={3} title="glitch-free PMUX（retimed enable）→ /2 /3 cell" signals={['ph0', 'ph1', 'ph4', 's0', 's1', 's2', 'en0', 'en1', 'en4', 'pclk', 'q0', 'q1', 'div_out']} windowCycles={7} />
        <Steps
          items={[
            <>
              select 在 3.5 T 改變（ph0 的 falling edge）；EN0 在這個 edge 抓到的還是舊的 d（decode 還沒更新），en0 要到 <b>4.5 T</b> 才變 0。ph0 在 4.0 T 的 pulse 照常通過。
            </>,
            <>
              en0 = 0 之後 d_en1 = 1；EN1 在 ph1 的下一個 falling edge <b>4.625 T</b> 抓到，en1 = 1。pclk 的下一個 rising edge 是 ph1 的 <b>5.125 T</b>。
            </>,
            <>
              pclk rising：3、4、5.125、6.125 …：間隔 1 + 1/8 T，沒有任何窄 pulse。代價是切換 latency：select 改變後過了 1.625 T 新 phase 才生效。
            </>,
            <>
              試 select 7：en7 在 5.375 T 才開，pclk 下一個 edge 在 5.875 T：間隔 1.875 T = 1 + 7/8。<b>retimed MUX 只能往後切</b>——想 backward −1，得到的是 forward +7（多等一個 T，等效 missing pulse）。要真的往前，必須讓 divider 少走一個 cycle：這就是 5-1 的 integer carry，5-3 會處理。
            </>,
          ]}
        />
        <Callout kind="note" title="兩個 flop 的 timing path 才是 glitch-free MUX 的限制">
          combinational PMUX 的 select window 消失了，換來兩條真正的 flop-to-flop path：(1) phase_sel（↑ div_out）→ sel logic → EN_a.D（↓ ph_a）：<b>half-cycle path</b>；(2) en_a（↓ ph_a）→ d_b → EN_b.D（↓ ph_b）：<b>handoff path</b>，可用時間只有 k/8 T。
        </Callout>
        <CriticalPathExplorer scenario={glitchFreeTiming} initialPath="half-cycle" guided />
        <ModeContent level="engineer" title="SystemVerilog：兩個 source 的 glitch-free clock MUX">
          <CodeBlock
            title="gf_clkmux.sv"
            code={`
module gf_clkmux (
  input  logic clk_a,    // 舊 phase
  input  logic clk_b,    // 新 phase
  input  logic sel,      // 0: clk_a, 1: clk_b（必須與 clk_a 同步，或先經 synchronizer）
  input  logic rst_n,
  output logic clk_out
);
  logic en_a, en_b;
  // enable 在各自 clock 的 falling edge 更新：改變時該 clock 為 0，AND 不會產生 edge
  always_ff @(negedge clk_a or negedge rst_n)
    if (!rst_n) en_a <= 1'b1;            // reset 後預設走 clk_a
    else        en_a <= ~sel & ~en_b;    // 新的要等舊的關掉
  always_ff @(negedge clk_b or negedge rst_n)
    if (!rst_n) en_b <= 1'b0;
    else        en_b <= sel & ~en_a;
  assign clk_out = (clk_a & en_a) | (clk_b & en_b);
endmodule
`}
            note="8-phase 版本把 en 擴成 8 個、decode sel 成 one-hot；每個 den_i = dec_i AND NOT(OR of other en)。~en_b / ~en_a 的交叉項就是 handoff path。"
          />
        </ModeContent>
        <ModeContent level="deep" title="handoff path、metastability 與 real delay 模式">
          <ul>
            <li>
              <b>handoff path 的可用時間 = k/8 T</b>：en_a 在 ph_a 的 falling edge 關、EN_b 在 ph_b 的 falling edge 抓，兩者只差 k/8 T。k = 1 時是 15.6 ps（8 GHz），扣掉 EN_a 的 tCQ、sel logic 與 EN_b 的 tsetup 幾乎不剩。把上面的模擬器切到「實際 delay」：tCQ 8 + gate 6 = 14 ps &gt; 12.5 ps（1/8 T，模擬器 T = 100），EN1 錯過 4.625 T 這個 falling edge，等到 5.625 T 才開，pclk 的下一個 edge 變成 6.125 T——多等了一個 T。<b>沒有 glitch，但 latency 多一個 T</b>；而且如果 d_b 剛好落在 EN_b 的 setup/hold window 裡，EN_b 會 metastable。
            </li>
            <li>
              <b>解法</b>：(a) EN_b 前面再加一級 flop（2-stage synchronizer；latency +1 T 但確定）；(b) 限制最小步數（k ≥ 3 時 handoff 有 3/8 T）；(c) FSM 提前一個 output 週期算好 select，讓 half-cycle path 變 multicycle，並用 ph_old 的 falling edge 先把 select 取樣一次再送進 enable 邏輯。
            </li>
            <li>
              <b>CML 實作</b>：高速 PMUX 常用 CML 的 current-steering MUX，select 是差動的 tail-switch。select 的 transition 本身有限 slew，切換期間輸出是兩條 phase 的加權和——這時 runt 不是「有或沒有」，而是一段幅度不足的過渡。下游 CML latch 的 t<sub>pw,min</sub> 由它的 regeneration time constant 決定。
            </li>
            <li>
              <b>PVT 與 jitter</b>：safe window 的邊界由 VCO phase 決定（跟著 Tvco 縮放），但 select 路徑的 delay 跟著製程與電壓走，兩者不同步變化。一個在 typical corner 有 2.5 ps slack 的 combinational 切換，在 fast-fast corner 可能已經掉進紅區。這是幾乎所有量產設計都用 retimed / glitch-free MUX 的原因。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>把 PMUX glitch 當成 select 的 setup violation</b>：MUX 沒有 setup time。問題是 pulse width；判準是下游 t<sub>pw,min</sub>。
            </li>
            <li>
              <b>加 delay 或 buffer 想「躲開」紅區</b>：delay 隨 PVT 變，窗口跟著 Tvco 變，兩者不會一起動。只有 retiming 能把「窗」變成 flop 的 edge。
            </li>
            <li>
              <b>以為 k = 4 只是 margin 比較小</b>：反相的兩條 phase 沒有任何同 level 的時刻，窗口寬度為 0。
            </li>
            <li>
              <b>忘記 min-delay 那一側</b>：select 太早到（ph_new 還沒升起）一樣會截短 pulse。
            </li>
            <li>
              <b>以為 glitch-free MUX 沒有代價</b>：它有 1 ～ 2 T 的切換 latency、只能往後切（backward 要靠 divider 的 modulus 補）、還有自己的 handoff path 與 metastability 風險。
            </li>
            <li>
              <b>把 runt 造成的多一次 toggle 當成「divider 壞了」</b>：divider 沒壞，它忠實地數了一個不該存在的 edge。要修的是 clock。
            </li>
          </ul>
        </Callout>
        <CompareTable
          head={['', 'combinational PMUX', 'glitch-free（retimed enable）PMUX']}
          rows={[
            ['runt 風險', '有：select 落在紅區就有', '無：enable 只在 clock 為 0 時改變'],
            ['select 的 timing 要求', 'safe window（同時有 max / min delay）', 'half-cycle path + handoff path（真正的 flop-to-flop）'],
            ['切換 latency', '≈ 0（立刻）', '1 ～ 2 T（舊關、新開各等一個 falling edge）'],
            ['backward step', '可以（切在都 low 的窗）', '不行：變成 forward 8 − k，多一個 T；要靠 modulus 補'],
            ['步數限制', 'k ≤ 3（k = 4 無窗）；k 越大越窄', 'k 越小 handoff 越緊（k = 1 最緊）'],
            ['硬體', '一個 8:1 MUX', '8 個 falling-edge flop + AND-OR + decode'],
          ]}
        />
      </Section>
    </>
  )
}

function ExerciseComponent() {
  return <MuxSwitchDemo initialA={1} initialB={5} initialT={1.4} title="練習：先推再拖" />
}

const qPh = (i: number) => traceFrom(`ph${i}`, phaseClockEvents(8, 3, i), 'phase')
const selStep = (t: number) => traceFrom('sel', [{ t: 0, v: 0 }, { t, v: 1 }], 'control')

const lesson: LessonDef = {
  id: 'm5-l2-pmux-glitch',
  module: 5,
  order: 2,
  title: 'PMUX 的 Glitch 與 Safe Switching Window',
  titleEn: 'PMUX glitches and the safe switching window',
  summary: '為什麼不能任意切 select：兩條 phase level 不同時切換會產生 runt / double edge / missing pulse。推導 safe window = 同 level 區間，用下游 tpw,min 當判準，並看 glitch-free MUX 如何把「窗」換成兩條 flop-to-flop path。',
  goals: [
    '說出 PMUX 切換產生 glitch 的唯一原因：切換瞬間 ph_old 與 ph_new 的 level 不同。',
    '從波形辨認 short pulse、double edge、missing pulse，並解釋為什麼下游 divider 會多數或少數一個 edge。',
    '推導 forward k 步的 safe window [k/8 T, 1/2 T] 與 [1/2 + k/8 T, 1 T]，說出 k = 4 為什麼沒有窗。',
    '把 select 路徑寫成同時有 max-delay 與 min-delay 的 window constraint，並說明它限制的是 switching window 而非 Fmax。',
    '解釋 glitch-free MUX 的 enable 為什麼在 falling edge 取樣，以及它帶來的 half-cycle path、handoff path 與 latency。',
  ],
  readingMinutes: 40,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'single',
      prompt: 'combinational PMUX 切換 select 時輸出出現 runt pulse，根本原因是？',
      options: ['select 對 MUX 的 setup time 不夠', '切換瞬間 ph_old 與 ph_new 的 level 不同，輸出多出一個 transition', 'MUX 的 propagation delay 太長', '兩條 phase 的頻率不同'],
      answer: 1,
      explanation: 'MUX 是 combinational，沒有 setup time。select 一變輸出立刻跟到新 phase 現在的 level；level 不同就多一個 edge，旁邊的 pulse 因此很窄。delay 只會平移波形，頻率相同是 PMUX 的前提。',
    },
    {
      id: 'q2',
      type: 'numeric',
      prompt: '8-phase，forward +2。每一個「同 level」的安全窗寬多少 T？（以 Tvco 為單位）',
      answer: 0.25,
      tolerance: 0.001,
      explanation: '寬度 = 1/2 − k/8 = 1/2 − 2/8 = 0.25 T。都 high 的窗是 [0.25, 0.5] T，都 low 的窗是 [0.75, 1] T。',
    },
    {
      id: 'q3',
      type: 'waveform',
      prompt: 'select 從 ph0 切到 ph1（sel 由 0 變 1 的時刻如 sel 列所示）。哪一組的切換時間會產生 runt？',
      options: [
        { label: 'A：切在 1.06 T', traces: [qPh(0), qPh(1), selStep(1.06)] },
        { label: 'B：切在 1.3 T', traces: [qPh(0), qPh(1), selStep(1.3)] },
        { label: 'C：切在 1.8 T', traces: [qPh(0), qPh(1), selStep(1.8)] },
      ],
      answer: 0,
      tEnd: 3,
      period: 1,
      explanation: '1.06 T 時 ph0 = 1（1.0 ～ 1.5）、ph1 = 0（1.125 才升起）：level 不同，pmux_out 剛升起 0.06 T 就被截掉 ⇒ runt。1.3 T 兩者都 high、1.8 T 兩者都 low，都是安全窗。',
    },
    {
      id: 'q4',
      type: 'multiple',
      prompt: 'select 落在 danger zone 之後，下列哪些是可能的後果？',
      options: ['pmux_out 出現寬度小於 tpw,min 的 runt', '下游 divider 多數（或少數）一個 edge，輸出相位跳掉', '多出來的 edge 會讓那一個 pclk 週期縮短，divider 內部 Q → logic → D 在該 cycle 的可用時間跟著變少', 'divider 的 Fmax 下降', '下游 flop 進入 metastable'],
      answers: [0, 1, 2, 4],
      explanation:
        'runt 是 pulse-width 問題：flop 可能觸發（多數一個 edge）、不觸發（少數一個）或 metastable。第 3、4 項要分開看：Fmax 由 tCQ + logic + tsetup 決定，是 path delay 的性質，不會因為 select 改變而變差（第 4 項錯）；但多出來的 edge 會讓相鄰兩個 pclk rising edge 的間隔塌陷——simulate(pmuxDualMod23, inputLead 0.5) 把 select 0 → 1 切在 3.5 T，pclk 的 rising edge 是 3.0 T、3.5 T、4.125 T，中間那一個 cycle 只剩 0.5 T（標稱 1 T），Q → NOR → D 在那一個 cycle 的可用時間真的被吃掉（第 3 項對，與下面 engineer 段落、Lesson 5-3 deep 段落一致）。這和 runt 自己的 pulse-width 問題是兩件事。',
    },
    {
      id: 'q5',
      type: 'single',
      prompt: 'glitch-free MUX 把每條 phase 的 enable flop 用該 phase 的 falling edge 觸發，目的是？',
      options: ['減少 flop 的 tCQ', '讓 enable 改變時該 phase 為 0，AND 輸出不會產生 partial pulse', '讓 select 有更多 setup time', '把 MUX 變成 rising-edge 觸發'],
      answer: 1,
      explanation: 'enable 在 falling edge 之後才改變，此時 clock 為 low，ph·en 從 0 變 0 沒有 edge；等 clock 下次升起時 enable 已經穩定。這把「window」換成了 flop 的 edge。',
    },
    {
      id: 'q6',
      type: 'single',
      prompt: '要從 ph1 切到 ph5（相差 4 個 phase）。正確的敘述是？',
      options: ['只要 select 夠快，在 ph1 升起前切就安全', '安全窗在 0.5 T 附近，寬 1/8 T', '兩者互為反相，沒有任何同 level 的時刻；要拆成兩次或用 glitch-free MUX', '用 16:1 MUX 就能解決'],
      answer: 2,
      explanation: 'ph5 = NOT ph1（相差半個週期）。任何時刻切都會多一個 transition，窗口寬度 0。這是結構問題，不是速度問題。',
    },
    {
      id: 'q7',
      type: 'state',
      prompt: 'PMUX → /2 /3 cell（mod = 0）目前 state = 00。因為 select 切在紅區，pclk 在同一個 T 內出現兩個 rising edge（原本只該有一個），理想 flop 兩個都抓。兩個 edge 之後 state 是？',
      answer: '00',
      width: 2,
      bitNames: ['q1', 'q0'],
      explanation: 'mod = 0：00 → 01 → 00。兩個 edge 走完一整圈，div_out 在這一個 T 內多輸出了一個 pulse——divider 沒有壞，它忠實地數了一個不該存在的 edge。',
    },
    {
      id: 'q8',
      type: 'numeric',
      prompt: 'Tvco = 125 ps，forward +1。select 從 ph_old 的 rising edge 算起最晚 54 ps 到達 pmux_out，jitter 3 ps、margin 3 ps。相對「都 high 的窗」關閉時刻（ph_old 的 falling edge），slack 是多少 ps？',
      answer: 2.5,
      tolerance: 0.01,
      explanation: '窗在 1/2 T = 62.5 ps 關閉。required = 62.5 − 3 − 3 = 56.5 ps；slack = 56.5 − 54 = 2.5 ps。過了，但 PVT 稍微變一下就掉進「ph_old 已 low、ph_new 還 high」的紅區。',
    },
  ],
  exercise: {
    title: 'ph1 → ph5 有沒有安全區？ph1 → ph2 呢？',
    prompt: (
      <p>
        先不要動 demo，自己算：(1) ph1 在哪些時間是 high？ph5 呢？兩者有沒有同 level 的區間？(2) 把新 phase 改成 ph2，重算：都 high 的窗、都 low 的窗各在哪、各多寬？(3) 若下游 t<sub>pw,min</sub> = 0.2 T，ph1 → ph5 有沒有任何切換時刻是「不算違規」的？那算安全嗎？(4) 如果一定要從 1 走到 5，你會怎麼做？然後用 demo 驗證。
      </p>
    ),
    Component: ExerciseComponent,
    checklist: ['寫出 ph1、ph5 的 high 區間並指出沒有同 level 的時刻', '寫出 ph1 → ph2 的兩個窗：[1.25, 1.625] T（都 high）與 [1.75, 2.125] T（都 low），各 0.375 T', '說出 tpw,min 判準與「同 level」判準的差別', '提出拆成兩次 +2 或改用 glitch-free MUX'],
    answer: (
      <>
        <p>
          (1) ph1 high 在 [n + 0.125, n + 0.625)，ph5 high 在 [n + 0.625, n + 1.125)：兩者互為反相，<b>沒有任何同 level 的時刻</b>，所以沒有安全區。任何 t<sub>sw</sub> 都會讓 pmux_out 多一個 transition。
        </p>
        <p>
          (2) ph2 high 在 [n + 0.25, n + 0.75)。與 ph1 都 high：[n + 0.25, n + 0.625)；都 low：[n + 0.75, n + 1.125)。各寬 0.375 T（= 1/2 − 1/8），每個 T 共 0.75 T 可切。紅區是 [n + 0.125, n + 0.25)（ph1 已 high、ph2 還 low）與 [n + 0.625, n + 0.75)（ph1 已 low、ph2 還 high）。
        </p>
        <p>
          (3) 1 → 5 時，若剛好切在 1.375 T 附近，兩段 partial pulse 各 0.25 T，以 t<sub>pw,min</sub> = 0.2 T 來看「沒有違規」——但那是 0.05 T 的 margin，而且 1.375 T 出現的其實是一個<b>提早的 falling edge</b>（切到 ph5 時 ph5 還是 low），真正多出來的 <b>rising edge 在 1.625 T</b>（ph5 升起）——不切換時 ph1 在 [1 T, 2 T) 只有 1.125 T 一個 rising edge，切了之後變成 1.125 T 與 1.625 T 兩個，下游 divider 一定多數一個。「沒 runt」不等於「安全」：相位已經跳掉。
        </p>
        <p>
          (4) 拆成 1 → 3 → 5 兩次 +2，各自切在 [k/8, 1/2] 或 [1/2 + k/8, 1] 的窗內（每次都會讓 divider 多等 2/8 T，兩次共 4/8 T，與一次走 4 步的 phase 位移相同）；或改用 glitch-free MUX，接受 1 ～ 2 T 的 latency，換取任意步數都沒有 runt。
        </p>
      </>
    ),
  },
}
export default lesson
