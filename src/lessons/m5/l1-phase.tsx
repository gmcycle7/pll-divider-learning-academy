import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { PhaseMuxVisualizer } from '@/components/phase/PhaseMuxVisualizer'
import { traceFrom } from '@/components/waveform/ClockWaveform'
import { phaseClockEvents } from '@/models/phase/pmux'
import { pmuxDiv4Sel0 } from './models'
import { pmuxDiv4Schematic } from './schematics'
import { pmuxSwitchTiming } from './timing'
import { M5_SIM_OPTIONS, RotationTable, StaticPhaseCompare, narratePmux } from './Widgets'
import './style.css'

function Content() {
  return (
    <>
      <Section title="先用直覺想：八個錯開的節拍器" en="Intuition">
        <p>
          一個 <Term zh="多相壓控振盪器" en="multi-phase VCO" /> 不是只給你一條 clock，而是 8 條<b>頻率完全相同</b>、只是<b>起跑時間錯開</b>的 clock。想像 8 個節拍器排成一圈，每一個都比前一個晚 1/8 拍敲下去。你可以隨時決定「我要聽哪一個」——這個「聽哪一個」的開關就是 <Term zh="相位多工器" en="phase MUX, PMUX" />。
        </p>
        <p>
          重點只有一個：<b>切換你聽的節拍器，不會改變節奏（頻率），只會改變下一拍落在哪裡（edge 的時間）。</b> 這一課要把「下一拍落在哪裡」算得精確到 1/8 個週期，並且回答一個常被搞混的問題：一直往後切，切過一圈之後會發生什麼事？
        </p>
        <Callout kind="idea">
          divider 分析永遠追蹤 <Term zh="邊緣" en="edge" />。PMUX 的全部功能就是：<b>把「下一個 rising edge」的時間往前或往後挪 k/8 個 Tvco</b>。先把每一個 phase 的 edge 時間寫出來，再談 divide ratio。
        </Callout>
      </Section>

      <Section title="Phase 0 … 7 的定義：spacing = Tvco / 8" en="Defining the phases">
        <p>
          設 VCO 週期為 <Math>{'T_{vco}'}</Math>（單位 ps）。8-phase VCO 的第 i 個 phase 記作 <span className="mono">ph{'{i}'}</span>，它的 rising edge 出現在
        </p>
        <Math block>{'t_{edge}(i, n) = n\\,T_{vco} + \\frac{i}{M}\\,T_{vco},\\qquad i = 0,1,\\dots,M-1,\\quad M = 8'}</Math>
        <p>
          其中 <Math>{'n'}</Math> 是第幾個 VCO 週期（整數），<Math>{'M'}</Math> 是 phase 數。相鄰兩個 phase 的 edge 相差
        </p>
        <Math block>{'\\Delta\\phi = \\frac{T_{vco}}{M} = \\frac{T_{vco}}{8} = 0.125\\,T_{vco}'}</Math>
        <p>
          這個 <Term zh="相位間距" en="phase spacing" /> 就是 PMUX 能調整 edge 時間的最小單位（resolution）。若 <Math>{'T_{vco}'}</Math> = 125 ps（8 GHz），spacing = 15.625 ps；換成 16-phase，spacing 減半成 <Math>{'T_{vco}/16'}</Math>。
        </p>
        <CompareTable
          head={['phase index i', '0', '1', '2', '3', '4', '5', '6', '7']}
          rows={[
            ['rising edge 時間（週期 n 內）', '0', '0.125 T', '0.25 T', '0.375 T', '0.5 T', '0.625 T', '0.75 T', '0.875 T'],
            ['與 ph0 的關係', '同相', '', '', '', '反相（ph0 的 falling edge）', '', '', ''],
          ]}
        />
        <p>
          下面的圓盤把 8 個 phase 畫成一圈：<b>順時針一格 = 時間往後 1/8 T</b>。先不要按按鈕，看波形：8 條 phase clock 一條比一條晚 0.125 T，被選中的那一條複製到 <span className="mono">pmux_out</span>。
        </p>
        <PhaseMuxVisualizer phases={8} title="8-phase wheel：試試 forward / backward，並把 M 切到 4 或 16" />
      </Section>

      <Section title="選下一個 phase：edge 時間怎麼變" en="Forward and backward rotation">
        <p>
          假設目前選的是 phase 2（edge 在 0.25 T）。請用上面的圓盤自己操作，一步一步回答：
        </p>
        <Steps
          items={[
            <>
              <b>forward +1</b>（2 → 3）：edge 從 0.25 T 變成 0.375 T。<b>下一個 edge 晚了 0.125 T</b>。這叫 <Term zh="正向旋轉" en="forward rotation" />：在圓盤上順時針走。
            </>,
            <>
              <b>backward −1</b>（3 → 2）：edge 從 0.375 T 回到 0.25 T，<b>早了 0.125 T</b>。<Term zh="反向旋轉" en="backward rotation" />：逆時針走。
            </>,
            <>
              <b>forward +3</b>（2 → 5）：edge 從 0.25 T 到 0.625 T，晚了 3/8 T。步數 k 與時間位移的關係就是 <Math>{'\\Delta t = k \\cdot T_{vco}/M'}</Math>。
            </>,
            <>
              注意每一步<b>頻率都沒變</b>：pmux_out 的週期永遠是 <Math>{'T_{vco}'}</Math>，只是 edge 的落點平移。位移只在「切換的那一次」發生一次，之後又是穩定的週期性 clock。
            </>,
          ]}
        />
        <Callout kind="method" title="只看下一個 edge">
          問自己：<b>切換之後，下一個 rising edge 相對於「沒切換」會早還是晚？早 / 晚多少個 1/8 T？</b> 這就是 PMUX 對系統唯一的影響。頻率、duty 都不變。
        </Callout>
      </Section>

      <Section title="Wrap-around 與 integer carry：走過一圈會怎樣" en="Wrap-around and the integer carry">
        <p>
          現在把圓盤轉到 index 7（edge 在 0.875 T），再 forward +1。index 變成 0——但 edge 的時間<b>不是</b>回到 0，因為時間不能倒流。把它算出來：
        </p>
        <Steps
          items={[
            <>
              ph7 的 edge 在 <Math>{'n T + 0.875 T'}</Math>。forward +1 應該晚 0.125 T，所以新的 edge 在 <Math>{'n T + 1.0 T = (n+1) T + 0'}</Math>。
            </>,
            <>
              也就是說：index 回到 0，但這個 edge 其實是<b>下一個 VCO 週期</b>的 ph0 edge。整數部分多了 1。這個 +1 就是 <Term zh="整數進位" en="integer carry" />。
            </>,
            <>
              反過來，從 index 0 backward −1 到 index 7：edge 應該早 0.125 T，所以是 <Math>{'n T - 0.125 T = (n-1) T + 0.875 T'}</Math>：index 7 沒錯，但屬於<b>上一個</b>週期，carry = −1。
            </>,
            <>
              結論：<b>index 只記錄「圈上的位置」，carry 記錄「跨了幾圈」</b>。edge 的真實時間永遠是兩者的和。
            </>,
          ]}
        />
        <Math block>{'t_{edge} = \\big(\\underbrace{c}_{\\text{integer carry}} + \\underbrace{\\tfrac{i}{M}}_{\\text{phase index}}\\big)\\, T_{vco}'}</Math>
        <p>
          <Math>{'c'}</Math> 是累積的 carry（整數個 <Math>{'T_{vco}'}</Math>），<Math>{'i'}</Math> 是目前 index。圓盤右側的「被選中 edge 的絕對時間」就是這個式子。
        </p>
        <Callout kind="warning" title="為什麼 divider 在乎這個 carry">
          PMUX 通常接在一個 divider 前面或後面。divider 只會「數 edge」，它不知道你切了 phase。當 7 → 0 發生時，被選中的 edge 落到下一個 VCO 週期——對整個 PMUX + divider 系統來說，<b>等效多走了一個 integer cycle</b>；0 → 7 則少走一個。如果控制邏輯忘了這個 carry，<b>平均除數就會少掉整個 k/M 的 fractional 部分</b>——每個 output 週期轉 k 步時，每 M/k 個週期 wrap 一次、每次漏掉一個 Tvco，攤下來就是 k/M（與 N 無關）。這在 Lesson 6-3 的 DTC overflow 還會再出現一次，那裡的 carry 與 divider modulus 之間的關係要另外定義，不能直接畫等號。
        </Callout>
        <ModeContent level="engineer" title="carry 的數學：rotate() 的定義">
          <p>
            對 index <Math>{'i'}</Math> 走 <Math>{'k'}</Math> 步（<Math>{'k'}</Math> 可負）：
          </p>
          <Math block>{'i\' = (i + k) \\bmod M,\\qquad c\' = c + \\left\\lfloor \\frac{i + k}{M} \\right\\rfloor'}</Math>
          <p>
            floor 對負數向下取整，所以 <Math>{'i = 0, k = -1'}</Math> 給 <Math>{'\\lfloor -1/8 \\rfloor = -1'}</Math>。這正是專案 <span className="mono">models/phase/pmux.ts</span> 裡 <span className="mono">rotate()</span> 的實作，圓盤用的就是它。
          </p>
        </ModeContent>
      </Section>

      <Section title="最簡單的電路：PMUX + /4" en="The circuit">
        <p>
          8 條 phase clock 進一個 8:1 MUX，3-bit select <span className="mono">s2 s1 s0</span> 決定哪一條變成 <span className="mono">pclk</span>。pclk 驅動兩個 DFF 組成的同步 /4（Lesson 1-3 的電路）：
        </p>
        <LogicDiagram schematic={pmuxDiv4Schematic} showValues={false} />
        <ul>
          <li>
            <b>Clock input</b>：不是一條，是 8 條 <span className="mono">ph0..ph7</span>。但 flop 只看得到 <span className="mono">pclk</span>。
          </li>
          <li>
            <b>Memory element</b>：FF0、FF1，state = <span className="mono">q1 q0</span>。
          </li>
          <li>
            <b>Feedback</b>：<span className="mono">d0 = NOT q0</span>、<span className="mono">d1 = q1 XOR q0</span>——與普通 /4 完全一樣。PMUX 不在 feedback 裡，它在 <b>clock path</b> 上。
          </li>
        </ul>
        <Callout kind="note" title="這一課只做「靜態」選擇">
          select 在 reset 前設好、之後不再改。模擬器的 input 改變會落在 ph0 的 falling edge（t = k.5 T）生效；如果你在跑到一半時切 select，pclk 可能在切換瞬間多出一個 edge——那是下一課的主題（glitch）。想看不同 phase，請先 Reset，設好 s2 s1 s0，再按 edge。
        </Callout>
      </Section>

      <Section title="逐一個 clock edge 操作" en="Edge by edge">
        <p>
          模擬器的「edge k」是 <b>ph0</b> 的第 k 個 rising edge（t = kT）。若你選了 phase s，真正觸發 flop 的 pclk edge 在 t = kT + s/8 T。先用 s = 0 走幾步，再 Reset 後把 s 設成 3（s1 = 1、s0 = 1），比較 state 更新的時間點。
        </p>
        <DividerSimPanel netlist={pmuxDiv4Sel0} schematic={pmuxDiv4Schematic} options={M5_SIM_OPTIONS} title="PMUX → /4（select 在 reset 後設定，然後逐 edge）" narrate={narratePmux} windowCycles={8} showDelayMode showPulseWidths />
        <Steps
          items={[
            <>
              <b>s = 0</b>：pclk = ph0。edge 1（t = 1T）：state 00 → 01；edge 2：01 → 10，div_out（= q1）第一次 rising 在 <b>2T</b>；edge 4：11 → 00，div_out falling 在 4T；下一次 rising 在 6T。週期 4T，duty 50%。
            </>,
            <>
              <b>s = 3</b>：pclk = ph3，edge 在 1.375T、2.375T、…。state 序列一模一樣（01 → 10 → 11 → 00），只是每一次更新都晚 0.375 T。div_out 第一次 rising 在 <b>2.375T</b>。
            </>,
            <>
              <b>s = 4 以上</b>：pclk edge 在 kT + 0.5T 之後，落在模擬器「下一個 ph0 edge」的紀錄視窗裡，所以 state table 看起來像慢了一步——它並沒有，只是記帳的視窗以 ph0 為準。波形上的時間才是真相。
            </>,
          ]}
        />
        <p>下面直接把 phase 0 與 phase b 兩個 /4 並排，用 Δφ 工具量 rising edge 的差：</p>
        <StaticPhaseCompare />
        <Callout kind="method" title="State table 與 next-state equation 為什麼沒變">
          PMUX 只改 clock，不改 d0、d1。所以 state table（00 → 01 → 10 → 11）與 next-state equation 與 Lesson 1-3 的同步 /4 相同；divide ratio 也還是 4。唯一的差別在<b>時間軸</b>：每個 state 更新的時刻平移了 s/8 T。分析陌生的 PMUX 電路時，先把 MUX 從 clock path 拿掉、用「單一 clock」把 state machine 分析完，再把 phase 偏移加回去。
        </Callout>
      </Section>

      <Section title="Phase rotation 與 divide ratio：N + k/M" en="Rotation and the average divide ratio">
        <p>
          現在把「每個 output 週期都往前轉 k 個 phase」和一個 /N divider 放在一起。output 的第 j 個 rising edge 之後，divider 走 N 個 pclk 週期，同時 select 前進 k 個 phase。逐個 output edge 把時間列出來（下表由 <span className="mono">rotatingEdges()</span> 產生）：
        </p>
        <RotationTable initialN={4} initialStep={1} initialM={8} count={9} />
        <p>推導：設第 j 個 output edge 在 <Math>{'t_j'}</Math>，此時 phase index 為 <Math>{'i_j'}</Math>。divider 走 N 個 Tvco，再切 k 個 phase：</p>
        <Math block>{'t_{j+1} - t_j = N\\,T_{vco} + \\frac{k}{M}\\,T_{vco} \\quad(\\text{carry 已併入整數部分})'}</Math>
        <Math block>{'N_{avg} = \\frac{t_{j+1}-t_j}{T_{vco}} = N + \\frac{k}{M}'}</Math>
        <p>
          變數定義：<Math>{'N'}</Math> = divider 的整數除數（無單位）、<Math>{'k'}</Math> = 每個 output 週期前進的 phase 數（整數，可負）、<Math>{'M'}</Math> = phase 數、<Math>{'T_{vco}'}</Math> = VCO 週期（ps）。k = 1、M = 8、N = 4 時平均除數 4.125；k = −1 時 3.875。
        </p>
        <Callout kind="warning" title="平均除數 vs 每個週期的瞬時除數">
          表格裡<b>每一個</b>間隔都是 N + k/M（不是整數！），因為 PMUX 真的把 edge 放在 1/8 T 的格點上。這和 Lesson 6-1 用 /N 與 /N+1 交錯得到的 fractional ratio 不同：那裡每個瞬時週期是整數、只有平均是分數；這裡每個週期本身就是分數。兩者的 phase error 行為完全不一樣，不要混用「fractional」一詞而不說清楚是哪一種。
        </Callout>
        <ModeContent level="engineer" title="用 wrap 驗證：k = 2、N = 4 的前 5 個 edge">
          <p>
            index 序列 0, 2, 4, 6, 0（wrap，carry +1）, 2 …。edge 時間：0、4.25、8.5、12.75、17.0、21.25 T。第 4 → 第 5 個 edge：divider 走 4 T，index 6 → 0 跨 boundary，carry +1，所以 base 從 12 變成 12 + 4 + 1 = 17，加上 index 0 的 0/8 → 17.0 T；間隔仍是 4.25 T。<b>carry 不是「多出來的誤差」，它正是讓每個間隔都等於 N + k/M 的必要記帳。</b>
          </p>
          <p>把上面的表切到 k = +2 對照，再切到 k = −1 看 carry 何時變成 −1。</p>
        </ModeContent>
        <ModeContent level="deep" title="M 越多越好？phase mismatch 的代價">
          <ul>
            <li>
              <b>Resolution</b>：Tvco/M。M = 8 在 8 GHz 是 15.6 ps；M = 16 是 7.8 ps。DTC（Lesson 6-3）再往下細分。
            </li>
            <li>
              <b>Phase mismatch</b>：8 條 phase 來自 VCO 的 ring / 多相 buffer，實際 spacing 不是精確的 T/8：每條差幾百 fs 到幾 ps。旋轉時這個誤差<b>週期性</b>地出現（每繞一圈重複一次）⇒ 輸出頻譜出現 fractional spur。M 越大，要匹配的 buffer 越多、功耗越高、mismatch 校正越難。
            </li>
            <li>
              <b>MUX 的 input-dependent delay</b>：8:1 MUX 每個輸入到輸出的路徑不同（tree 結構、走線），本身就是另一組 mismatch。設計上常用對稱 tree 或兩級（4:1 → 2:1）並讓每一路走線等長。
            </li>
            <li>
              <b>Jitter</b>：pclk 的 jitter = 被選 phase 的 jitter + MUX 的 delay noise。PMUX 在 fVCO 工作，任何 supply noise 都直接變成 edge 位置的抖動。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="這個架構的 critical path" en="Critical path">
        <p>
          PMUX + 靜態 select 的 /4，timing 路徑有哪些？照 Lesson 1-1 的流程問：launch 在哪、capture 在哪、可用時間多少。
        </p>
        <ol>
          <li>
            <b>divider 內部</b>：FF0.Q → INV → FF0.D、FF0/FF1.Q → XOR → FF1.D。launch 與 capture 都在 pclk 的 rising edge，可用時間一個 <Math>{'T_{vco}'}</Math>。這是這個電路的 <Term zh="Fmax 路徑" en="Fmax-limiting path" />。
          </li>
          <li>
            <b>ph_i → MUX → pclk</b>：這是 <b>clock path</b>，沒有 capture flop 的 setup 要求，不限制 Fmax；但它決定 pclk 相對 VCO 的 latency，而且 8 路 delay 若不一致就是 phase mismatch。
          </li>
          <li>
            <b>select → MUX</b>：select 靜態時沒有 timing 要求。一旦 select 要動態改變，這條路徑的 capture 不是 flop，而是「兩個 phase 同 level 的時間窗」——下一課的主角。
          </li>
        </ol>
        <CriticalPathExplorer scenario={pmuxSwitchTiming} initialPath="div-internal" guided />
        <Callout kind="pitfall" title="不要把最長的 wire 叫 critical path">
          8 條 phase 走線很長、MUX 很大，但它們是 clock path：沒有 launch flop 與 capture flop 之間的 setup 檢查。critical path 一定要能說出「哪個 edge launch、哪個 edge capture、中間過了什麼 logic」。
        </Callout>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>把 index 當時間</b>：7 → 0 不是「早了 7/8 T」，而是「晚了 1/8 T、跨到下一個週期」。永遠用 carry + index/M 算時間。
            </li>
            <li>
              <b>忘了 carry 會影響 divider 的整數計數</b>：wrap 時等效多（或少）走一個 Tvco；控制 FSM 若沒把它算進去，平均除數會偏 <b>k/M</b>——也就是整個 fractional 部分被吃掉。用 <span className="mono">rotatingEdges(4, 1, 8, 9)</span> 核對：正確的 edge 是 0、4.125、…、33（8 個週期共 33 T ⇒ 4.125）；漏掉 wrap 的 carry 則總長 32 ⇒ 4.000，偏 0.125 = 1/8 = k/M，不是 1/N = 0.25。（本課練習的 k = 2、M = 8、N = 4 剛好 k/M = 1/N = 0.25，看不出差別。）
            </li>
            <li>
              <b>以為切 phase 會改變頻率</b>：切一次只平移一次 edge；要改變<b>平均</b>頻率，必須<b>每個週期都持續</b>切（rotation），而且平均除數是 N + k/M，不是 N。
            </li>
            <li>
              <b>把 PMUX 的 fractional 與 dual-modulus 的 fractional 混為一談</b>：PMUX 每個瞬時週期就是 N + k/M；dual-modulus 交錯是整數週期的平均。phase error 的形狀不同。
            </li>
            <li>
              <b>把 8 條 phase 走線當 critical path</b>：它們是 clock path，要看的是 mismatch 與 jitter，不是 setup slack。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="SystemVerilog：PMUX + /4（select 靜態）">
          <CodeBlock
            title="pmux_div4.sv"
            code={`
module pmux_div4 (
  input  logic [7:0] ph,      // ph[i] rising edge at n*Tvco + i/8*Tvco
  input  logic [2:0] sel,     // phase select（本課視為靜態）
  input  logic       rst_n,
  output logic       div_out
);
  logic pclk;
  logic q0, q1;
  assign pclk = ph[sel];      // combinational 8:1 MUX（注意：動態切換會 glitch，見 Lesson 5-2）

  always_ff @(posedge pclk or negedge rst_n) begin
    if (!rst_n) begin
      q0 <= 1'b0; q1 <= 1'b0;
    end else begin
      q0 <= ~q0;              // d0 = NOT q0
      q1 <= q1 ^ q0;          // d1 = q1 XOR q0
    end
  end
  assign div_out = q1;        // /4，50% duty，相位 = sel/8 * Tvco
endmodule
`}
            note="synthesis 會把 ph[sel] 合成 mux tree。實際高速設計會用 CML / 對稱 tree 手工佈局，並且 sel 絕不會像這裡一樣 asynchronous 地直接接進 clock path。"
          />
        </ModeContent>
      </Section>
    </>
  )
}

/** 練習：給 index 序列 0,2,4,6,0,2… 與 /4，算平均除數與 carry */
function ExerciseComponent() {
  return <RotationTable initialN={4} initialStep={2} initialM={8} count={9} lockControls />
}

const ph = (i: number) => traceFrom('pmux_out', phaseClockEvents(8, 3, i), 'output')
const ref0 = traceFrom('ph0', phaseClockEvents(8, 3, 0), 'phase')

const lesson: LessonDef = {
  id: 'm5-l1-phase',
  module: 5,
  order: 1,
  title: '多相 Clock 與 Phase Selection',
  titleEn: 'Multi-phase clocks and phase selection',
  summary: '8-phase VCO 的 phase spacing、forward / backward rotation、7→0 的 integer carry，以及「每個週期轉 k 個 phase」為什麼給出平均除數 N + k/8。',
  goals: [
    '寫出 8-phase clock 中第 i 個 phase 的 edge 時間，說出 spacing = Tvco/8。',
    '用圓盤解釋 forward / backward rotation 各讓下一個 edge 早或晚多少。',
    '解釋 7→0 為什麼是 +1/8 T 而不是 −7/8 T，並算出 integer carry。',
    '逐 output edge 列出時間，推導 PMUX + /N 每週期轉 k 個 phase 的平均除數 N + k/M。',
    '分辨 PMUX + divider 的三種 timing 路徑：divider 內部 setup path、clock path、select window。',
  ],
  readingMinutes: 35,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'numeric',
      prompt: '一個 16-phase VCO，Tvco = 160 ps。相鄰兩個 phase 的 spacing 是多少 ps？',
      answer: 10,
      unit: 'ps',
      explanation: 'spacing = Tvco / M = 160 / 16 = 10 ps。',
    },
    {
      id: 'q2',
      type: 'numeric',
      prompt: '8-phase，目前 index = 6。forward 3 步之後 index 是多少？',
      answer: 1,
      explanation: '(6 + 3) mod 8 = 9 mod 8 = 1。',
    },
    {
      id: 'q3',
      type: 'single',
      prompt: '承上題（index 6 forward 3 → index 1），這一步的 integer carry 是？下一個 edge 相對於「不切換」早還是晚？',
      options: ['carry 0，晚 3/8 T', 'carry +1，晚 3/8 T（其中跨到下一個週期）', 'carry −1，早 5/8 T', 'carry +1，早 5/8 T'],
      answer: 1,
      explanation: 'floor(9/8) = 1 ⇒ carry +1。edge 從 6/8 T 移到 1 + 1/8 T = 9/8 T：晚了 3/8 T，只是這 3/8 T 中有一部分跨過了週期邊界。',
    },
    {
      id: 'q4',
      type: 'single',
      prompt: 'PMUX 後面接 /4。每個 output 週期 select 前進 2 個 phase（8-phase）。平均除數是？',
      options: ['4', '4.125', '4.25', '4.5'],
      answer: 2,
      explanation: 'N + k/M = 4 + 2/8 = 4.25。每個 output 週期 divider 走 4 Tvco，再加 2/8 Tvco 的 phase 位移。',
    },
    {
      id: 'q5',
      type: 'state',
      prompt: 'PMUX → /4 從 reset（q1 q0 = 00）開始，pclk 經過 3 個 rising edge 之後 state 是？',
      answer: '11',
      width: 2,
      bitNames: ['q1', 'q0'],
      explanation: '00 → 01 → 10 → 11。選哪一個 phase 都一樣，只是這三個 edge 的時間平移 s/8 T。',
    },
    {
      id: 'q6',
      type: 'waveform',
      prompt: '以 ph0 為參考（時間單位 Tvco），下列哪一個是選中 phase 3 時的 pmux_out？',
      options: [
        { label: 'A', traces: [ref0, ph(1)] },
        { label: 'B', traces: [ref0, ph(3)] },
        { label: 'C', traces: [ref0, ph(5)] },
      ],
      answer: 1,
      tEnd: 3,
      period: 1,
      explanation: 'phase 3 的 rising edge 比 ph0 晚 3/8 T = 0.375 T。A 晚 0.125 T（phase 1），C 晚 0.625 T（phase 5）。',
    },
    {
      id: 'q7',
      type: 'multiple',
      prompt: '下列哪些敘述正確？',
      options: ['切換 phase 一次只平移一次 edge，之後 pmux_out 的週期仍是 Tvco', 'backward 從 0 到 7 的 carry 是 −1', 'PMUX 的每個瞬時 output 週期都是整數個 Tvco', '8 條 phase 走線到 MUX 是 clock path，不是 setup critical path'],
      answers: [0, 1, 3],
      explanation: 'PMUX 讓 output 週期本身變成 N + k/M（非整數），這是它與 dual-modulus 交錯的差別。其餘三項正確。',
    },
  ],
  exercise: {
    title: 'phase index 序列 0, 2, 4, 6, 0, 2, …',
    prompt: (
      <p>
        一個 PMUX + /4 的控制器每個 output 週期把 select 往前轉，index 序列是 0, 2, 4, 6, 0, 2, 4, 6, …。先不要看表：(1) 每次 wrap（6 → 0）的 carry 是多少？每幾個 output 週期發生一次？(2) 把前 5 個 output edge 的時間（Tvco 單位）寫出來。(3) 平均除數是多少？(4) 如果控制器忘記在 wrap 時把 divider 多算一個 cycle，平均除數會變成多少？然後用下表核對。
      </p>
    ),
    Component: ExerciseComponent,
    checklist: ['指出 carry +1 發生在 index 6 → 0，每 4 個 output 週期一次', '寫出 0、4.25、8.5、12.75、17.0 T', '算出平均除數 4 + 2/8 = 4.25', '說出忘記 carry 的後果'],
    answer: (
      <>
        <p>
          (1) 6 + 2 = 8，floor(8/8) = 1 ⇒ carry +1；index 每 4 步繞一圈，所以每 4 個 output 週期 wrap 一次。(2) 0、4.25、8.5、12.75、17.0 T：第 4 → 5 個 edge 時 divider 走 4 T、carry +1、index 0 ⇒ 12 + 4 + 1 + 0 = 17。(3) 每個間隔都是 4.25 T ⇒ 平均除數 4.25 = 4 + 2/8。
        </p>
        <p>
          (4) 若 wrap 時沒有多走一個 cycle，第 5 個 edge 會落在 16.0 T（index 0 的「本週期」edge——但那個 edge 其實早於 12.75 + 4 = 16.75 的 divider 計數點，實際上 divider 會抓到 16.0 T 那個 ph0 edge），四個週期的總長從 17 變 16，平均除數變成 16/4 = 4.0 而不是 4.25——整個 2/8 的 fractional 部分在每次 wrap 時被吃掉。這就是 integer carry 必須進入控制邏輯（或 divider modulus）的原因。
        </p>
      </>
    ),
  },
}
export default lesson
