import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { div2, dualMod12, dualMod12Glitchy } from '@/models/divider/examples'
import { simulate } from '@/models/divider/engine'
import type { Netlist, SignalTrace, Values } from '@/models/divider/types'
import { MIN_PULSE, T, T_AND, T_AND_GATE, T_CQ, T_OR_GATE, dm12RisingEn } from './models'
import { dm12GlitchySchematic, dm12HlClockAnd, dm12HlGating, dm12HlHalfCycle, dm12HlToggle, dm12RisingEnSchematic, dm12Schematic } from './schematics'
import { dm12Timing } from './timing'
import { Div12EdgeTimeline, GatingCompare } from './Widgets'

// ---------------------------------------------------------------- engine 產生的靜態波形
/** 正確版本 sel = 1、實際 delay：en 只在 clk = 0 期間改變 */
const goodReal = simulate(dualMod12, 6, { period: T, delayMode: 'real' }, () => ({ sel: 1 }))
const goodRealTraces = goodReal.sim.getTraces(['clk', 'q0', 'd_en', 'en', 'div_out'])

/** quiz 用：clk + div_out */
function outWave(nl: Netlist, inputAt: (e: number) => Partial<Values>, opts: { edges?: number; mode?: 'ideal' | 'real'; signal?: string } = {}): SignalTrace[] {
  const { edges = 8, mode = 'ideal', signal = nl.output } = opts
  const { sim } = simulate(nl, edges, { period: T, delayMode: mode }, inputAt)
  const [clk, out] = sim.getTraces(['clk', signal])
  return [clk, { ...out, name: 'div_out', kind: 'output' }]
}

function Content() {
  return (
    <>
      <Section title="先用直覺想：edge 的排程" en="Intuition: scheduling edges">
        <p>
          /2 /3 是「每段 interval 2T 或 3T」。往下推一階：<b>/1 /2</b> 是「每段 interval 1T 或 2T」。/1 就是<b>每個輸入 edge 都變成一個輸出 edge</b>（pass-through）；/2 就是<b>每兩個輸入 edge 丟掉一個</b>（skip）。
        </p>
        <p>
          想像門口的保全：/1 mode 每個人都放行；/2 mode 放一個、擋一個。保全不需要「數到 2 再產生一個 edge」，他只需要記得<b>上一個有沒有放</b>——一個 bit。這就是這一課的 state。
        </p>
        <p>
          這個觀點叫 <Term zh="邊緣排程" en="edge scheduling" />：與其把 divider 想成「產生新的 clock」，不如想成「決定哪些輸入 edge 可以通過」。輸出的每一個 edge 都<b>直接來自</b>某個輸入 edge，中間沒有 flop 的 tCQ。
        </p>
        <Callout kind="idea" title="output pulse ≠ output edge">
          下游（另一級 divider、PFD、counter）數的是 <b>rising edge</b>。這裡每個輸出 pulse 只是輸入 high pulse 的複本（寬 0.5T<sub>in</sub>），所以 /2 mode 的輸出 duty 是 25%，不是 Lesson 1-1 那個 toggle /2 的 50%。這不是錯——只要下游用 edge、而且 0.5T<sub>in</sub> 比下游的最小 pulse width 寬。
        </Callout>
      </Section>

      <Section title="Edge timeline：哪些 edge 被放行" en="Edge timeline">
        <p>
          下圖把輸入 edge 1 到 10 排成一列，實心方塊 = 這個 edge 的 high pulse 被放行（變成輸出 edge），虛線 ✕ = 被 skip。拖 k 改變 sel 切換的時間點（在第 k 個 edge 之前 0.35T），看「切換之後第一個被 skip 的是哪個 edge」：
        </p>
        <Div12EdgeTimeline />
        <Steps
          items={[
            <>
              <b>sel = 0（/1）</b>：1, 2, 3, 4, 5 … 全部放行。interval 1T。
            </>,
            <>
              <b>sel = 1（/2）</b>：從 reset 開始 edge 1、2 都放行（en 的 reset 值是 1，而且 q0 要到 edge 1 之後才變 1），之後 3 skip、4 放行、5 skip、6 放行 … 只有<b>偶數 edge</b> 通過。interval 2T。
            </>,
            <>
              <b>0 → 1 在 edge 4 之前</b>：第一個被 skip 的是 <b>edge 5</b>。<b>在 edge 5 之前</b>切呢？不是 edge 6，而是 <b>edge 7</b>——edge 6 照常放行。
            </>,
            <>
              <b>規則</b>：sel 在 (k − 0.35)T 改變，這比 falling edge (k − 0.5)T 晚，所以第一個看到新 sel 的 falling edge 是 (k + 0.5)T；它抓到的是 edge k 之後的 q0 = k mod 2。k 偶數 ⇒ q0 = 0 ⇒ edge k+1 被 skip；k 奇數 ⇒ q0 = 1 ⇒ edge k+1 放行、edge k+2 才 skip。<b>第一個被 skip 的永遠是 k 之後的第一個奇數 edge</b>。1 → 0 方向也一樣：第一個「/2 會 skip、/1 卻放行」的 edge 是 k 之後的第一個奇數 edge。
            </>,
          ]}
        />
        <CompareTable
          head={['sel 切換', 'sel 改變時間', '第一個看到新 sel 的 clk↓', '它抓到的 q0', '第一個被 skip 的 edge']}
          rows={[
            ['edge 4 之前', '3.65T', '4.5T', 'q0 = 0（edge 4 之後）', 'edge 5'],
            ['edge 5 之前', '4.65T', '5.5T', 'q0 = 1（edge 5 之後）⇒ edge 6 放行', 'edge 7'],
            ['edge 6 之前', '5.65T', '6.5T', 'q0 = 0', 'edge 7'],
          ]}
        />
        <p className="small muted">所以「切換後第一個被影響的 edge」不只看 sel 什麼時候換，還看 toggle flop 當時走到哪——這和上一課「mod 只在 state 01 被用到」是同一件事。</p>
      </Section>

      <Section title="電路：用 falling-edge FF 重同步的 clock gating" en="The circuit">
        <LogicDiagram schematic={dm12Schematic} showValues={false} />
        <ul>
          <li>
            <b>FF0 + INV</b>：q0 每個 rising edge toggle，提供「一個放、一個擋」的節奏。它不是輸出。
          </li>
          <li>
            <b>INV + OR</b>：d_en = <span className="mono">sel̄ + q0</span>。sel = 0 ⇒ d_en 恆 1（全部放行）；sel = 1 ⇒ d_en = q0。
          </li>
          <li>
            <b>FF_EN（falling edge）</b>：在每個 clk↓ 抓 d_en，輸出 en。因為它在 falling edge 觸發，<b>en 只會在 clk = 0 的期間改變</b>。
          </li>
          <li>
            <b>AND</b>：div_out = clk · en。en = 1 時輸入的 high pulse 原樣通過；en = 0 時被擋掉。
          </li>
        </ul>
        <Math block>{'d_0 = \\overline{q_0},\\qquad d_{en} = \\overline{sel} + q_0\\ (\\text{在 } clk\\downarrow \\text{ 抓進 } en),\\qquad div\\_out = clk \\cdot en'}</Math>
        <p>
          模擬器每按一次推進一個 <b>rising</b> edge；夾在中間的 falling edge（k + 0.5）發生的事（FF_EN 抓 d_en）會在同一步的 en 波形上看到。先把 sel 切成 1，然後每按一步先回答：這個 rising edge 的 high pulse 會不會通過？接下來的 clk↓ 會把 en 變成什麼？
        </p>
        <DividerSimPanel netlist={dualMod12} schematic={dm12Schematic} title="/1 /2：sel = 0 全部放行，sel = 1 放一個擋一個" signals={['clk', 'sel', 'q0', 'd_en', 'en', 'div_out']} showDelayMode showPulseWidths />
        <Steps
          items={[
            <>
              <b>初始（sel 已切成 1）</b>：q0 = 0，en = 1（reset 值），d_en = sel̄ + q0 = 0 + 0 = 0。
            </>,
            <>
              <b>Edge 1（1T）</b>：q0 → 1。clk high（1T–1.5T）、en = 1 ⇒ div_out = 1：<b>放行</b>，輸出 edge 在 1T。1.5T（clk↓）：FF_EN 抓 d_en = 0 + 1 = 1 ⇒ en 維持 1。
            </>,
            <>
              <b>Edge 2（2T）</b>：q0 → 0。en = 1 ⇒ <b>放行</b>，輸出 edge 在 2T。2.5T：抓 d_en = 0 + 0 = 0 ⇒ <b>en → 0</b>（在 clk = 0 時改變）。
            </>,
            <>
              <b>Edge 3（3T）</b>：q0 → 1。en = 0 ⇒ clk 的 high pulse 被擋，<b>沒有輸出 edge</b>（skip）。3.5T：抓 d_en = 1 ⇒ en → 1。
            </>,
            <>
              <b>Edge 4（4T）</b>：放行。4.5T：en → 0。Edge 5 skip、edge 6 放行……
            </>,
            <>
              <b>結論</b>：暫態之後輸出 edge 在 2T、4T、6T、8T，interval <b>2T</b>；每個 pulse 寬 0.5T ⇒ duty <b>25%</b>。state（en q0）序列 11 → 00 → 11 → 00。把 sel 切回 0：d_en 恆 1，en 在下一個 clk↓ 變 1，之後每個 edge 都放行（/1，duty 50%）。
            </>,
          ]}
        />
      </Section>

      <Section title="Output pulse 與 output edge 的數學" en="Pulses vs edges">
        <p>
          設輸入週期 <Math>{'T_{in}'}</Math>（ps）、輸入 duty <Math>{'D_{in}'}</Math>、mode 的瞬時除數 <Math>{'N \\in \\{1, 2\\}'}</Math>。輸出 pulse 是輸入 high pulse 的複本：
        </p>
        <Math block>{'T_{out} = N\\,T_{in},\\qquad t_{high} = D_{in}\\,T_{in},\\qquad D_{out} = \\frac{t_{high}}{T_{out}} = \\frac{D_{in}}{N} = \\begin{cases} 50\\% & N = 1 \\\\ 25\\% & N = 2 \\end{cases}\\ (D_{in} = 0.5)'}</Math>
        <p>
          <Math>{'T_{out}'}</Math>：輸出週期（ps）；<Math>{'t_{high}'}</Math>：輸出 high 時間（ps）；<Math>{'D_{out}'}</Math>：輸出 duty。和 toggle 型 /2 不同：這裡輸出 duty <b>跟著輸入 duty 走</b>，而且被 N 除。
        </p>
        <p>
          輸出 edge 的位置：<Math>{'t_{edge,out} = t_{edge,in} + t_{AND}'}</Math>——沒有 tCQ。en 只決定「這個 edge 要不要放」，不決定 edge 在哪。所以這種 gating 的輸出 jitter 幾乎等於輸入 jitter 加一個 AND 的雜訊，比經過 flop 再 decode 的 divider 乾淨。
        </p>
        <Callout kind="warning" title="0.5 Tin 的 pulse 必須比下游的最小 pulse width 寬">
          20 GHz 時 T<sub>in</sub> = 50 ps，輸出 pulse 只有 25 ps。下游 flop 若需要 30 ps 的 pulse，這個架構就不能用——不是因為 setup，是 <Term zh="脈寬" en="pulse width" />。這是為什麼高速 prescaler 把「swallow」做在前面、輸出仍用 toggle 型 divider 的原因。
        </Callout>
      </Section>

      <Section title="為什麼不能直接用 combinational gating" en="Why combinational gating glitches">
        <p>
          把 FF_EN 拿掉，en = sel̄ + q0 直接接 AND，看起來省一個 flop、邏輯也一樣。問題在<b>時間</b>：q0 在 clk↑ 之後 tCQ = {T_CQ} ps 才變，en 再經過 OR（{T_OR_GATE} ps）在 clk↑ + {T_CQ + T_OR_GATE} ps 才變——這時 clk 還是 1（high 到 +50 ps）。AND 的輸出會跟著 en 在 pulse 中間翻轉。（這個 cell 的 gate delay 與 Lesson 3-2 的 /2 /3 cell 不同：clock-gating 用的 AND 是 {T_AND_GATE} ps、重同步用的 OR 是 {T_OR_GATE} ps，不要拿 dm23 那顆 d1 = q0·mod 的 AND（{T_AND} ps）來代。）
        </p>
        <LogicDiagram schematic={dm12GlitchySchematic} showValues={false} />
        <Steps
          items={[
            <>
              <b>en 由 1 → 0 的那個 cycle</b>：clk↑ 在 t，此時 en 還是 1，div_out 在 <b>t + {T_AND_GATE}</b> 升起（只經過 gating AND 的 {T_AND_GATE} ps）；q0 在 t + {T_CQ} 翻轉、en 在 t + {T_CQ + T_OR_GATE} 落下，再過一次 AND，div_out 在 t + {T_CQ + T_OR_GATE + T_AND_GATE} 落下。輸出 pulse 只有 {T_CQ + T_OR_GATE + T_AND_GATE} − {T_AND_GATE} = <b>{T_CQ + T_OR_GATE} ps</b>：runt。AND 的 {T_AND_GATE} ps 在 rising 與 falling 兩端各出現一次，相減之後不進入寬度。
            </>,
            <>
              <b>en 由 0 → 1 的那個 cycle</b>：clk↑ 時 en 還是 0，div_out 不動；en 在 t + 18 升起，div_out 在 t + 24 才升起，然後跟著 clk↓ 在 t + 56 落下。pulse 從 24 到 56 只有 <b>32 ps</b>，而且 edge 晚了 18 ps。
            </>,
            <>
              <b>結果</b>：每個 rising edge 都有「某種」輸出——不是 18 ps 的 runt 就是 32 ps 的晚到 pulse。量測列會說 interval 0.82T、1.18T 交替，ratio ≈ 1：/2 根本沒有實現，而且每一個 pulse 都不合格。
            </>,
          ]}
        />
        <p>
          下面用 <span className="mono">detectRuntPulses</span>（門檻 {MIN_PULSE} ps）把兩種做法在實際 delay 下的 runt 標出來。先看「理想」模式：什麼都看不到——zero-delay 下 en 與 clk 在同一個 delta cycle 改變，glitch 的寬度是 0。切到「實際」才會現形：
        </p>
        <GatingCompare />
        <Math block>{'w_{runt} = (t_{CQ} + t_{OR} + t_{AND}) - t_{AND} = t_{CQ} + t_{OR} = 8 + 10 = 18\\ \\text{ps}'}</Math>
        <p>
          <Math>{'w_{runt}'}</Math>：runt 寬度（ps）。注意它<b>與 T<sub>in</sub> 無關</b>：把 clock 放慢不會讓 runt 變寬或消失，只會讓它在每個 period 裡佔的比例變小。這是 glitch 與 setup violation 最大的差別——setup 可以用降頻解決，glitch 不行。
        </p>
      </Section>

      <Section title="Safe switching window 與 pulse width" en="Safe switching window">
        <p>
          正確版本的 en 在 clk↓ + tCQ = 8 ps 改變，也就是每次都在 falling edge 之後 8 ps、下一個 rising edge 之前 42 ps。下面是實際 delay 的波形，注意 en 的每一個 transition 都落在 clk = 0 的區間裡：
        </p>
        <ClockWaveform
          signals={goodRealTraces}
          tStart={100}
          tEnd={500}
          period={T}
          pxPerPeriod={150}
          highlight={['div_out']}
          zoomable={false}
          showPulseWidths={['div_out']}
          showEdgeTimes={['en']}
          shades={[
            { t0: 150, t1: 200, kind: 'safe', signal: 'en', label: 'clk = 0：en 可以變' },
            { t0: 250, t1: 300, kind: 'safe', signal: 'en', label: 'clk = 0' },
            { t0: 350, t1: 400, kind: 'safe', signal: 'en', label: 'clk = 0' },
            { t0: 200, t1: 250, kind: 'danger', signal: 'en', label: 'clk = 1：禁區' },
            { t0: 300, t1: 350, kind: 'danger', signal: 'en', label: 'clk = 1' },
            { t0: 400, t1: 450, kind: 'danger', signal: 'en', label: 'clk = 1' },
          ]}
          title="正確版本、實際 delay：en 在 258、358、458 改變，全部在 clk = 0 期間"
        />
        <p>
          這件事有兩個 timing 要求，分別屬於<b>不同種類</b>的檢查：
        </p>
        <ol>
          <li>
            <b>Half-cycle setup path</b>：<span className="mono">FF0.Q → OR → FF_EN.D</span>。launch 在 clk↑，capture 在<b>同一個 cycle 的 clk↓</b>，可用時間只有 <Math>{'D_{in} T_{in}'}</Math>（duty 50% 時 T/2）：
            <Math block>{'t_{CQ,max} + t_{OR,max} + t_{setup} + t_{jitter} + t_{margin} \\le D_{in}\\,T_{in} \\quad\\Rightarrow\\quad T_{in,min} = \\frac{8 + 10 + 7 + 2 + 2}{0.5} = 58\\ \\text{ps}'}</Math>
          </li>
          <li>
            <b>Pulse-width 要求</b>：<span className="mono">FF_EN.Q → AND → div_out</span>。en 必須在下一個 clk↑ 之前穩定，AND 才能放出完整的 <Math>{'D_{in} T_{in}'}</Math> pulse：
            <Math block>{'t_{CQ,max} + t_{AND,max} \\le (1 - D_{in})\\,T_{in} \\quad(8 + 6 = 14 \\le 50\\ \\text{ps})'}</Math>
            若不滿足，pulse 會被截短成 <Math>{'D_{in}T_{in} - (t_{CQ} + t_{AND} - (1 - D_{in})T_{in})'}</Math>，可能低於下游的最小 pulse width。這裡沒有任何 flop 在抓 div_out，所以它<b>不是 setup check</b>。
          </li>
        </ol>
        <p>
          變數：<Math>{'t_{CQ}'}</Math> clock edge 到 Q 穩定；<Math>{'t_{OR}, t_{AND}'}</Math> gate 延遲；<Math>{'t_{setup}'}</Math> FF_EN 的 setup；<Math>{'D_{in}'}</Math> 輸入 duty；單位 ps。兩條式子都含 <Math>{'D_{in}'}</Math>：輸入 duty 偏離 50% 時，一條變鬆、另一條變緊。
        </p>
        <Callout kind="method" title="分清楚三種檢查">
          <ul style={{ margin: 0 }}>
            <li>
              <b>Setup（half-cycle）</b>：d_en 要在 clk↓ 前 tsetup 穩定 → 決定 Fmax。
            </li>
            <li>
              <b>Hold</b>：q0 改變後 d_en 不能在同一個 clk↓ 後 thold 內就變——這裡 launch 是 clk↑、capture 是 clk↓，中間隔半個 cycle，hold 天生很鬆。
            </li>
            <li>
              <b>Pulse width</b>：en 要在 clk↑ 前穩定，否則輸出 pulse 被截短或冒 runt → 與 Fmax 無關，與下游的最小 pulse width 有關。
            </li>
          </ul>
        </Callout>
      </Section>

      <Section title="這個架構的 critical path" en="Critical paths">
        <p>
          三個 mode（sel = 0、sel = 1、sel 切換中）各有不同的候選路徑。用 explorer 逐步走：先找 launch，再看經過哪些 gate，再找 capture 是 clk↑ 還是 clk↓，最後看 periodFraction = 0.5 如何把可用時間砍半：
        </p>
        <CriticalPathExplorer scenario={dm12Timing} guided showHold={false} />
        <Callout kind="note" title="為什麼這張 explorer 關掉了 Hold 分頁">
          這個 scenario 裡有一條 <span className="mono">FF_EN.Q → AND → div_out</span> 是 <b>pulse-width</b> path：它的終點是輸出 port，<b>沒有 capture flop</b>——既沒有 setup 也沒有 hold，AND 更不是 flop。對這條 path 讀得出意義的只有 <b>arrival = tCQ + tAND = {T_CQ + T_AND_GATE} ps</b>（en 改變之後，AND 要多久才把它完全反應出來），以及 <b>0.5T − arrival = {50 - T_CQ - T_AND_GATE} ps</b> 這個<b>餘裕</b>——它是正的，代表 en 在下一個 clk↑ 之前早就穩了，輸出就是完整的 0.5T = 50 ps pulse（遠大於下游要求的 {MIN_PULSE} ps）；一旦它變負 x ps，該放行的 pulse 只剩 0.5T − x、該擋掉的那個 cycle 會冒出寬度約 x 的 runt。明細區若出現 Required time、T<sub>clk,min</sub> 或 F<sub>max</sub>，那幾欄只是把同一組數字套進 setup 公式的結果，對它<b>沒有意義</b>；表上的「slack 32 ps」也只是這個 {50 - T_CQ - T_AND_GATE} ps 再扣掉 jitter 與 margin，不是 setup slack。為了避免「AND 也有 hold」的誤會，這張 explorer 把 Hold 分頁關掉了；真正有 hold 的兩條（toggle loop 與 half-cycle path）在下面的「分清楚三種檢查」裡用文字講。
        </Callout>
        <Callout kind="method" title="讀 explorer 的結果（T = 100 ps）">
          <ul style={{ margin: 0 }}>
            <li>
              <b>sel = 0（/1）</b>：d_en 恆 1，FF_EN 不動，AND 的 en 輸入不變。只剩 FF0.Q → INV → FF0.D 這個 toggle loop：T<sub>clk,min</sub> = 8 + 6 + 7 + 2 + 2 = 25 ps。但它其實什麼都不影響——q0 在 /1 mode 沒有人用。
            </li>
            <li>
              <b>sel = 1（/2）</b>：多出 <b>FF0.Q → OR → FF_EN.D（half-cycle）</b>：arrival 18 ps、可用 50 ps、required 39 ps、slack 21 ps，T<sub>clk,min</sub> = 58 ps。這才是真正的 Fmax 限制，比 toggle loop 緊一倍以上。同時 <b>FF_EN.Q → AND → div_out</b> 出現，它是 pulse-width 檢查：en 在 clk↓ 後 tCQ = {T_CQ} ps 改變，模型再保守地加一個 tAND = {T_AND_GATE} ps（要求「AND 對 en 的反應在下一個 clk↑ 之前就完成」）⇒ arrival {T_CQ + T_AND_GATE} ps，距離下一個 clk↑ 還有 {50 - T_CQ - T_AND_GATE} ps，所以放出來的是完整的 0.5T = 50 ps pulse。表上那個 slack 32 ps 就是這 {50 - T_CQ - T_AND_GATE} ps 再扣掉 jitter 與 margin，<b>不是</b> setup slack。
            </li>
            <li>
              <b>sel 切換中</b>：多出 <b>sel → INV → OR → FF_EN.D</b>。sel 若由同一個 clk 的 rising-edge flop 送出，它也只有半個 cycle：arrival 8 + 4 + 10 = 22 ps，slack 17 ps。sel 的 deadline = clk↓ − tsetup − tOR − tINV。
            </li>
            <li>
              <b>clk → AND → div_out</b>：輸出 latency 只有一個 AND（6 ps）。輸出 edge 直接來自 clk edge。
            </li>
          </ul>
        </Callout>
        <Callout kind="warning" title="critical path 隨 mode 改變">
          sel = 0 時這個電路可以跑到 40 GHz；sel = 1 時只剩 17 GHz。若 timing 只在 /1 mode 簽核，half-cycle path 從頭到尾沒被檢查過。
        </Callout>
        <ModeContent level="engineer" title="SystemVerilog：negedge-FF clock gating（behavioral 概念模型）">
          <CodeBlock
            title="dm12_gate.sv"
            code={`
// 概念模型：用 negedge flop 重同步 enable，再 AND clk。
// 真正的實作請用 library 的 ICG cell（latch-based clock gating），
// 並在 synthesis / STA 裡宣告 clock gating check；這段只用來說明 timing 關係。
module dm12_gate (
  input  logic clk,
  input  logic rst_n,
  input  logic sel,       // 0: /1（全部放行），1: /2（放一個擋一個）
  output logic div_out
);
  logic q0, en;

  // 節奏：q0 每個 posedge toggle
  always_ff @(posedge clk or negedge rst_n)
    if (!rst_n) q0 <= 1'b0;
    else        q0 <= ~q0;

  // enable 在 NEGEDGE 重同步：en 只在 clk = 0 期間改變
  always_ff @(negedge clk or negedge rst_n)
    if (!rst_n) en <= 1'b1;               // reset 後先放行
    else        en <= ~sel | q0;          // d_en = NOT sel OR q0

  assign div_out = clk & en;              // gating；en 穩定於 clk = 0 期間 ⇒ 無 glitch
endmodule
`}
            note="synthesis 會把 clk & en 視為 gated clock；若不用 ICG cell，多數 flow 會警告。此模型的 en 有 half-cycle setup path（q0 → OR → en）與 pulse-width 要求（en → AND），對應 explorer 的兩條路徑。"
          />
          <p>
            三種檢查各自的式子（<Math>{'D_{in}'}</Math> = 輸入 duty）：
          </p>
          <Math block>{'\\text{setup（half-cycle）}: t_{CQ,max} + t_{OR,max} + t_{setup} + t_{jitter} + t_{margin} \\le D_{in} T_{in}'}</Math>
          <Math block>{'\\text{hold}: t_{CQ,min} + t_{OR,min} \\ge t_{hold} - D_{in} T_{in}\\ (\\text{天生成立})'}</Math>
          <Math block>{'\\text{pulse width}: t_{CQ,max} + t_{AND,max} \\le (1 - D_{in}) T_{in}\\ \\Rightarrow\\ w_{pulse} = D_{in} T_{in} \\ge w_{min,downstream}'}</Math>
        </ModeContent>
        <ModeContent level="deep" title="高速實作會遇到的事">
          <ul>
            <li>
              <b>Latch-based ICG 比 negedge FF 好在哪</b>：標準 cell 的 integrated clock gate 用一個 <b>clk = 0 時 transparent</b> 的 latch 取代 FF_EN。latch 在 clk = 0 期間讓 enable 直接流過，clk = 1 期間鎖住。這樣 enable 邏輯可以從上一個 clk↑ 一路用到這個 clk↑ 前的 latch setup——接近<b>整個 cycle</b>（time borrowing），而不是 negedge FF 的半個 cycle。代價是 latch 的 transparent 期間 enable 若有 glitch 也會流過去，所以 enable 必須在 clk = 0 的後半段穩定（這就是 STA 的 clock gating check）。
            </li>
            <li>
              <b>CML 高速版</b>：20 GHz 以上通常不做 AND gating。/1 /2 的功能被合併進 toggle flop：sel 控制 FF0 的 D 是 Q̄（toggle）還是固定值，輸出直接取 Q。輸出 duty 回到 50%，代價是輸出 edge 多了一個 tCQ（jitter 累積）。
            </li>
            <li>
              <b>輸入 duty 的敏感度</b>：half-cycle setup 的可用時間是 D<sub>in</sub>T，pulse-width 的可用時間是 (1 − D<sub>in</sub>)T。輸入 duty 40% 時前者剩 40 ps（slack 從 21 掉到 11 ps），後者反而變成 60 ps。與 Lesson 2-2 的 50% duty /3 一樣：所有用到 falling edge 的路徑都是 duty-sensitive。
            </li>
            <li>
              <b>sel 的來源</b>：若 controller 用 clk↓ 送 sel（與 FF_EN 同相），sel → OR → FF_EN.D 變成 full-cycle path，slack 從 17 變 67 ps。這是 mode-control 訊號常用 negedge flop 送出的原因。
            </li>
            <li>
              <b>Runt 的下游後果</b>：18 ps 的 runt 進到下一級 divider 的 clock pin，可能被當成一個 edge、可能不被當成、可能讓那個 flop metastable。ideal simulation 完全看不到（寬度 0），只有帶 delay 的 gate-level 或 SPICE 才會。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>Combinational clock gating</b>：en 在 clk = 1 期間改變 ⇒ runt。寬度 tCQ + tOR，與頻率無關，降頻救不了。
            </li>
            <li>
              <b>用 rising-edge FF 重同步 en</b>：en 在 clk↑ + tCQ 改變，還是在 clk = 1 期間——練習題會讓你親手看到 8 ps 的 runt。
            </li>
            <li>
              <b>用 duty 判斷 /2 對不對</b>：這個架構的 /2 是 25% duty，完全正常；下游數的是 edge。
            </li>
            <li>
              <b>把 FF_EN.Q → AND → div_out 當 setup path</b>：沒有 capture flop。它是 pulse-width 要求。
            </li>
            <li>
              <b>忘記 half-cycle</b>：FF0.Q → OR → FF_EN.D 的 capture 在 clk↓，可用時間只有 D<sub>in</sub>T。這條才是 Fmax。
            </li>
            <li>
              <b>相信理想模擬</b>：zero-delay 下 glitch 寬度為 0，什麼都看不到。要看 runt 一定要帶 delay。
            </li>
          </ul>
        </Callout>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------- 練習：en 改用 rising-edge FF
function ExerciseComponent() {
  return (
    <>
      <DividerSimPanel netlist={dm12RisingEn} schematic={dm12RisingEnSchematic} title="練習電路：FF_EN 改成 rising edge（預設實際 delay）" options={{ delayMode: 'real' }} signals={['clk', 'sel', 'q0', 'd_en', 'en', 'div_out']} showDelayMode showPulseWidths showEquations={false} compact />
      <GatingCompare extra={{ netlist: dm12RisingEn, label: '練習：en 改用 rising-edge FF' }} title="三種做法並排：runt 在哪裡" />
    </>
  )
}

const lesson: LessonDef = {
  id: 'm3-l3-div12',
  module: 3,
  order: 3,
  title: '/1 /2 Dual-Modulus Concept',
  titleEn: 'The /1 /2 dual-modulus concept',
  summary: '/1 = 每個 edge 都放行，/2 = 放一個擋一個：用 edge scheduling 的觀點看「切換後第一個被 skip 的 edge 是哪個」；output pulse ≠ output edge；為什麼 combinational clock gating 會 runt、falling-edge 重同步為什麼安全；half-cycle setup、pulse width 與 setup 的差別。',
  goals: [
    '用 edge timeline 說出 /1 與 /2 各放行哪些 edge，以及 sel 切換後第一個被 skip 的 edge 為什麼是 k 之後的第一個奇數 edge。',
    '解釋 output pulse 與 output edge 的差別：/2 mode duty 25%，但 edge interval 是 2T。',
    '逐 edge 追蹤 q0、d_en、en、div_out，說明 en 只在 clk = 0 期間改變。',
    '算出 combinational gating 的 runt 寬度 = tCQ + tOR，並用 detectRuntPulses 在實際 delay 下驗證；理解理想模擬看不到它。',
    '分辨 half-cycle setup path（FF0.Q → OR → FF_EN.D）、control path（sel → OR → FF_EN.D）與 pulse-width 要求（FF_EN.Q → AND → div_out）三種不同的檢查。',
  ],
  readingMinutes: 40,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'single',
      prompt: 'dualMod12 在 sel = 1（/2 mode）、輸入 duty 50% 時，div_out 的 duty cycle 是多少？',
      options: ['50%', '25%', '33.3%', '取決於 tCQ'],
      answer: 1,
      explanation: '輸出 pulse 是輸入 high pulse 的複本（0.5 Tin），週期是 2 Tin ⇒ 25%。這不是錯誤：下游數的是 rising edge，interval 仍是 2T。',
    },
    {
      id: 'q2',
      type: 'numeric',
      prompt: 'sel 在 edge 5 之前（4.65T）由 0 變 1。第一個被 skip 的是第幾個 edge？',
      answer: 7,
      explanation: '第一個看到 sel = 1 的 falling edge 是 5.5T，它抓到 edge 5 之後的 q0 = 1 ⇒ en = 1，edge 6 照常放行；6.5T 抓到 q0 = 0 ⇒ en = 0，edge 7 被 skip。規則：k 之後的第一個奇數 edge。',
    },
    {
      id: 'q3',
      type: 'critical-path',
      prompt: '哪一條是 half-cycle setup path（launch 在 clk↑、capture 在同一個 cycle 的 clk↓，決定 /2 mode 的 Fmax）？',
      schematic: dm12Schematic,
      options: [
        { label: 'FF0.Q → OR → FF_EN.D', highlight: dm12HlHalfCycle, description: '到 falling-edge flop 的 D' },
        { label: 'FF_EN.Q → AND → div_out', highlight: dm12HlGating, description: '到輸出' },
        { label: 'clk → AND → div_out', highlight: dm12HlClockAnd, description: 'clock 直接到輸出' },
        { label: 'FF0.Q → INV → FF0.D', highlight: dm12HlToggle, description: 'toggle loop' },
      ],
      answer: 0,
      explanation: '只有 FF0.Q → OR → FF_EN.D 的 capture 是 clk↓，可用時間 T/2，Tclk,min = 58 ps。FF_EN.Q → AND → div_out 沒有 capture flop（pulse-width 要求）；clk → AND 是 latency；toggle loop 是 full-cycle（25 ps），不是最緊的。',
    },
    {
      id: 'q4',
      type: 'multiple',
      prompt: '關於 combinational clock gating（en = sel̄ + q0 直接 AND clk）的 runt，哪些正確？',
      options: ['runt 寬度 = tCQ + tOR，與 clock period 無關', '把 clock 放慢一倍，runt 就消失', 'zero-delay（理想）模擬看不到它', '要避免它，en 必須只在 clk = 0 期間改變'],
      answers: [0, 2, 3],
      explanation: 'en 在 clk↑ + tCQ + tOR 改變，把已經升起的 pulse 切掉：寬度 18 ps，與 T 無關；降頻只是讓它在 period 裡佔比變小。理想模擬中 en 與 clk 同一 delta cycle 變，glitch 寬度 0。解法是讓 en 在 clk = 0 期間改變（negedge FF 或 latch-based ICG）。',
    },
    {
      id: 'q5',
      type: 'waveform',
      prompt: '哪一個是 dualMod12 在 sel = 1（從 reset 就是 1）時的 div_out？',
      options: [
        { label: 'A', traces: outWave(div2, () => ({}), { signal: 'q0' }) },
        { label: 'B', traces: outWave(dualMod12, () => ({ sel: 1 })) },
        { label: 'C', traces: outWave(dualMod12, () => ({ sel: 0 })) },
        { label: 'D', traces: outWave(dualMod12Glitchy, () => ({ sel: 1 }), { mode: 'real' }) },
      ],
      answer: 1,
      tEnd: 800,
      period: 100,
      explanation: 'B：edge 1、2 放行（en reset 值 1），之後 4T、6T、8T，每個 pulse 寬 0.5T（25%）。A 是 toggle /2（50% duty，edge 在 1T、3T、5T）；C 是 /1；D 是 combinational gating 在實際 delay 下的樣子——每個 cycle 都有 18 ps 或 32 ps 的殘缺 pulse。',
    },
    {
      id: 'q6',
      type: 'numeric',
      prompt: 'half-cycle path FF0.Q → OR → FF_EN.D：tCQ,max = 8、tOR,max = 10、tsetup = 7、jitter = 2、margin = 2 ps，輸入 duty 50%。Tclk,min 是多少 ps？',
      answer: 58,
      unit: 'ps',
      explanation: '可用時間只有 T/2：0.5·Tclk,min = 8 + 10 + 7 + 2 + 2 = 29 ⇒ Tclk,min = 58 ps（Fmax ≈ 17 GHz）。toggle loop 的 25 ps 遠不是瓶頸。',
    },
    {
      id: 'q7',
      type: 'single',
      prompt: 'FF_EN.Q → AND → div_out 這條路徑要檢查的是什麼？',
      options: ['setup：en 要在下一個 clk↑ 前 tsetup 穩定，否則 AND 抓錯', 'hold：en 不能在 clk↑ 後太快改變', 'pulse width：en 要在 clk↑ 前穩定，輸出 pulse 才是完整的 Din·Tin', 'recovery：en 相對 reset 的時間'],
      answer: 2,
      explanation: 'AND 不是 flop，沒有 setup / hold。它的要求是 en 在 clk↑ 之前就穩定，這樣輸出 pulse 才不會被截短或冒出 runt。這與 Fmax 無關，與下游的最小 pulse width 有關。',
    },
  ],
  exercise: {
    title: 'en 的 FF 改成 rising-edge 會怎樣？',
    prompt: (
      <>
        <p>
          下面的電路把 FF_EN 改成 <b>rising-edge</b> 觸發（其他完全相同）。<b>先不要按模擬</b>，用實際 delay 的數字（tCQ = 8、OR = 10、AND = 6 ps、T = 100 ps）推：
        </p>
        <ol>
          <li>sel = 1 時，en 會在 clk↑ 之後幾 ps 改變？那時 clk 是 1 還是 0？</li>
          <li>en 由 1 → 0 的 cycle，div_out 的 pulse 從幾 ps 到幾 ps？寬度多少？</li>
          <li>en 由 0 → 1 的 cycle，pulse 從幾 ps 到幾 ps？</li>
          <li>量測列的 interval 序列會長什麼樣？還是 /2 嗎？</li>
          <li>理想（zero-delay）模式下會看到什麼？為什麼？</li>
          <li>要修好它有哪兩種做法？各自的 timing 要求是什麼？</li>
        </ol>
        <p>推完再按「下一個 Clock Edge」逐 edge 對答案（模擬器預設就是實際 delay），並在「三種做法並排」裡切換理想 / 實際模式比較。</p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: ['算出 en 改變的時刻（clk↑ + 8 ps）並指出它落在 clk = 1 期間', '算出 runt 寬度 8 ps 與另一半的 42 ps 截短 pulse', '解釋為什麼量到的 ratio 接近 1 而不是 2', '說出理想模式為什麼看不到問題', '寫出 negedge FF 與 latch-based ICG 兩種修法'],
    answer: (
      <>
        <p>
          <b>en 的時刻</b>：rising-edge FF_EN 與 FF0 在同一個 clk↑ 觸發，en 在 clk↑ + tCQ = <b>8 ps</b> 改變——此時 clk 剛升起，還要 42 ps 才落下。en 正好在禁區裡改變。
        </p>
        <p>
          <b>en 1 → 0 的 cycle</b>：div_out 在 clk↑ + 6 升起（AND），en 在 +8 落下，div_out 在 +14 落下：pulse 從 106 到 114，寬度 <b>8 ps</b>——比 combinational 版的 18 ps 更窄，因為少了 OR 的 10 ps。
        </p>
        <p>
          <b>en 0 → 1 的 cycle</b>：clk↑ 時 en 還是 0；en 在 +8 升起，div_out 在 +14 升起，跟著 clk↓ 在 +56 落下：pulse 從 214 到 256，<b>42 ps</b>，edge 晚了 8 ps。
        </p>
        <p>
          <b>interval 序列</b>：106, 214, 306, 414 … ⇒ 1.08T, 0.92T 交替，平均 ratio ≈ 1。每個 rising edge 都有輸出（不是 8 ps 就是 42 ps），/2 根本沒有實現。<span className="mono">detectRuntPulses</span> 在 8 個 edge 裡找到 4 個 8 ps 的 runt（106、306、506、706 ps）。
        </p>
        <p>
          <b>理想模式</b>：en 與 clk↑ 同一時刻改變，AND 的 glitch 寬度是 0——rising 與 falling 都在 100、300、500 ps，波形上看不到，量測列甚至說 ratio = 1、interval 全是 1T。zero-delay 模擬對 glitch 是盲的。state（en q0）序列 01 → 10 → 01 → 10 看起來也「正常」——問題完全在 timing，不在 logic。
        </p>
        <p>
          <b>修法</b>：(1) 把 FF_EN 改回 negedge：en 在 clk↓ + 8 改變，距離下一個 clk↑ 還有 42 ps；代價是 q0 → OR → FF_EN.D 變成 half-cycle path（Tclk,min = 58 ps）。(2) 用 latch-based ICG：clk = 0 時 transparent 的 latch + AND；enable 可以用接近整個 cycle，但要做 clock gating check（enable 必須在 clk↑ 前的 latch setup 穩定，且 clk = 0 期間不能有 glitch 流過）。兩種做法的共同點只有一個：<b>en 只能在 clk = 0 期間改變</b>。
        </p>
      </>
    ),
  },
}
export default lesson
