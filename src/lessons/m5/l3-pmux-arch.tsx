import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { pmuxDualMod23Safe } from './models'
import { arch1Schematic, arch2Schematic, arch2TimingSchematic, arch3Schematic } from './schematics'
import { arch2Timing, pmuxSwitchTiming } from './timing'
import { Arch2EdgeTable, Arch3EdgeTable, ArchDecisionWorksheet, PmuxDm23Sim, RotationTable } from './Widgets'
import './style.css'

function Content() {
  return (
    <>
      <Section title="先用直覺想：MUX 要放在哪裡" en="Intuition">
        <p>
          前兩課的 PMUX 都放在 divider <b>前面</b>：先選 phase，再除頻。但這不是唯一的擺法。一個 fractional divider 每個 output 週期要做兩個決定——<b>這個週期除幾（N 或 N+1）</b>、<b>output edge 對齊到哪一個 phase</b>。這兩個決定可以在同一個地方做，也可以分開做；PMUX 可以在 VCO 頻率工作，也可以在除完之後的低頻工作。
        </p>
        <p>
          三種擺法做的事一樣：output edge 的時間 = 整數個 Tvco + 某個 phase 的 1/8 T 偏移。差別在<b>誰負責 integer carry、切換時的 phase 是否連續、control 要提前多久、哪一條 path 最緊、以及 MUX 的雜訊怎麼進到輸出</b>。
        </p>
        <Callout kind="idea">
          分析任何 PMUX + divider 架構，先問三件事：(1) PMUX 的輸入 clock 頻率是 fVCO 還是 fVCO/N？(2) backward 一步（−1/8 T）由誰補上那個少掉的 Tvco？(3) select 改變的那一刻，兩條輸入同 level 的區間有多寬？答完，critical path 與 glitch risk 就都清楚了。
        </Callout>
      </Section>

      <Section title="三種架構的方塊圖" en="The three block diagrams">
        <p>
          <b>架構 1：PMUX → fixed /N。</b> 8 個 phase 進 PMUX，選出來的 pclk 驅動一個固定除數的 divider。fractional 部分完全靠 phase rotation（Lesson 5-1：N + k/8）。
        </p>
        <LogicDiagram schematic={arch1Schematic} showValues={false} />
        <p>
          <b>架構 2：PMUX → /N /N+1。</b> 同樣先選 phase，但 divider 是 dual-modulus：FSM 同時決定 phase_sel 與 mod。wrap 的 integer carry 可以直接變成 mod（多走或少走一個 cycle）。
        </p>
        <LogicDiagram schematic={arch2Schematic} showValues={false} />
        <p>
          <b>架構 3：/N /N+1 → phase generator → PMUX。</b> 先除頻，再用 8 個 retiming flop（各由一個 VCO phase 驅動）把 divider 輸出「複製」成 8 個間距 Tvco/8 的 divided phase，最後由 PMUX 在低頻選一個。
        </p>
        <LogicDiagram schematic={arch3Schematic} showValues={false} />
      </Section>

      <Section title="逐一個 output edge：架構 1" en="Architecture 1 edge by edge">
        <p>
          fixed /4，每個 output 週期 forward +1。用 Lesson 5-1 的表：每個間隔都是 4 + 1/8 T。把 k 改成 −1，表格會告訴你間隔是 3.875 T——但實際電路做得到嗎？逐 edge 想：
        </p>
        <RotationTable initialN={4} initialStep={1} initialM={8} count={9} title="架構 1：fixed /4 + phase rotation" />
        <Steps
          items={[
            <>
              <b>forward +1，index 7 → 0（wrap）</b>：divider 走 4 個 pclk edge 之後，PMUX 從 ph7 切到 ph0。glitch-free MUX 的 en7 在 ph7 的 falling edge 關、en0 在 ph0 的下一個 falling edge 開，第一個 ph0 edge 自然落在<b>下一個</b> Tvco 週期。carry +1 不需要任何邏輯——<b>forward 的 carry 是物理上自動的</b>。
            </>,
            <>
              <b>backward −1，index 0 → 7</b>：正確答案是「這個 output 週期只走 3 + 7/8 T」。但 fixed /4 只會數 4 個 pclk edge，retimed MUX 又只能往後切（0 → 7 等效 forward +7）：實際間隔變成 4 + 7/8 T，比想要的多了一整個 Tvco。<b>fixed /N 沒有地方放 carry −1</b>。
            </>,
            <>
              結論：架構 1 <b>若用 retimed（glitch-free）MUX</b> 就只能做 <b>forward-only rotation</b>（平均除數 N + k/8，k ≥ 0），適合「固定 fractional、單向慢慢轉」的應用。限制來自 MUX 而不是 fixed /N：改用 <b>combinational MUX</b> 時 backward 是做得到的——把 select 切在「新舊 phase 都 low」的窗內，divider 只是照樣數實體 pclk edge，每個 output 週期就是 N − k/8，不需要任何 carry 補償。<span className="mono">simulate(pmuxDualMod23, inputLead 0.5)</span> 把 select 由 0 切到 7（在 3.5 T）：pclk 沒有多出任何 transition，下一個 rising edge 落在 3.875 T = 3 + 7/8 T，正是乾淨的 backward −1（Lesson 5-2 就示範過）。代價是要付 5-2 的 window / runt 風險：窗只有 (1/2 − k/8) T，k = 4 時為 0。所以「要 backward 又要 retimed MUX 的安全性」才是架構 2 的理由。
            </>,
          ]}
        />
      </Section>

      <Section title="逐一個 output edge：架構 2（可模擬）" en="Architecture 2 edge by edge">
        <p>
          <span className="mono">models.ts</span> 的 <span className="mono">pmuxDualMod23Safe</span> 就是架構 2 的最簡版本：glitch-free 8-phase PMUX → /2 /3 cell，phase_sel 與 mod 是模擬器的 input。下面的腳本讓 phase step 與 mod 切換<b>一起</b>發生，表格由 <span className="mono">simulate()</span> 逐 edge 產生：
        </p>
        <Arch2EdgeTable />
        <Steps
          items={[
            <>
              <b>edge 6 之前（5.5 T）：sel 0 → 1、mod 0 → 1。</b> cell 此時在 state 01（5.0 T 的 pclk edge 剛把它帶到 01）。6.0 T 的 pclk edge 取樣 d1 = q0·mod = 1 ⇒ state 10；en0 在 6.5 T 關、en1 在 6.625 T 開，下一個 pclk edge 是 ph1 的 7.125 T ⇒ state 00，div_out 升起。間隔 4 → 7.125 = 3 + 1/8 T：<b>N 與 phase step 同一個週期生效</b>。
            </>,
            <>
              <b>edge 12 之前：sel 1 → 2、mod 1 → 0。</b> 間隔 2 + 1/8 T = 2.125 T。
            </>,
            <>
              <b>edge 17 之前：sel 2 → 0、mod 0 → 1。</b> 想要的是 backward 2 步，retimed MUX 給的是 forward 6 步：間隔 3 + 6/8 = 3.75 T。若 FSM 想要 3 − 2/8 = 2.75 T，必須把 mod 設成 /2（N − 1）再 forward 6：2 + 6/8 = 2.75 T ✓——這就是「carry 併入 modulus」。
            </>,
            <>
              切到 real 模式：forward +1 的兩次切換各多等一個 T（3.125 → 4.125、2.125 → 3.125）。不是 glitch——是 Lesson 5-2 的 handoff path（1/8 T = 12.5 ps &lt; tCQ 8 + gate 6）沒趕上。架構 2 的 FSM 若沒把這件事算進去，沒趕上的那個 output 週期就整整多一個 Tvco（該週期的除數 +1），平均除數跟著錯。
            </>,
          ]}
        />
        <p>自己動手：走到 edge 5，然後同時把 s0 設 1、mod 設 1，按下一個 edge，對照表格的第 2 → 3 個 rising edge。</p>
        <PmuxDm23Sim netlist={pmuxDualMod23Safe} prerun={5} title="架構 2：glitch-free PMUX → /2 /3 cell（手動切 sel / mod）" signals={['ph0', 'ph1', 'ph2', 's0', 's1', 's2', 'mod', 'en0', 'en1', 'en2', 'pclk', 'q0', 'q1', 'div_out']} windowCycles={8} />
        <Callout kind="method" title="mod 何時生效？逐 edge 推">
          /2 /3 cell 的 d1 = q0·mod 只在 <b>q0 = 1</b> 的那個 edge 才用到 mod。state 00 的 edge 把 state 帶到 01（q0 變 1），<b>下一個</b> edge 才取樣 d1 = mod。所以 mod 由 div_out 的 rising edge（state 剛進 00）launch，經過 2 個 pclk edge 才被 capture：這是一條 <Term zh="多週期路徑" en="multicycle path" />（cycles = 2）。若 FSM 在別的 state 改 mod，cycle 數要重推。
        </Callout>
      </Section>

      <Section title="逐一個 output edge：架構 3" en="Architecture 3 edge by edge">
        <p>
          divider 在 ph0 上產生 edge E<sub>j</sub>（E<sub>j+1</sub> = E<sub>j</sub> + N<sub>j</sub>）；8 個 divided phase 是 E<sub>j</sub> + i/8 T；PMUX 選第 sel<sub>j</sub> 個。output edge 時間：
        </p>
        <Math block>{'t_j = E_j + \\frac{sel_j}{M}T_{vco},\\qquad t_{j+1} - t_j = N_j\\,T_{vco} + \\frac{sel_{j+1} - sel_j}{M}T_{vco}'}</Math>
        <p>
          變數：<Math>{'E_j'}</Math> = divider 第 j 個輸出 edge（Tvco 單位）、<Math>{'N_j'}</Math> = 該週期的除數、<Math>{'sel_j'}</Math> = 該 edge 選的 divided phase index、<Math>{'M'}</Math> = 8。用與架構 2 相同的決策序列：
        </p>
        <Arch3EdgeTable />
        <Steps
          items={[
            <>
              <b>backward 直接可行</b>：sel 2 → 0 的那一步間隔 = 3 − 2/8 = 2.75 T。因為 8 個 divided phase 同時存在，「選一個比較早的」不需要等下一個週期。
            </>,
            <>
              <b>select 的安全窗很寬</b>：divided phase 的週期是 N·Tvco，8 條 dph 全部 low 的區間是 [E<sub>j</sub> + 7/8 T + W, E<sub>j+1</sub>]（W = divider 輸出 pulse 寬度）。N = 3、W = 1 T 時寬 1.125 T——比 combinational PMUX 在 fVCO 的 3/8 T 寬得多，而且 FSM 本來就由 div_out 驅動，自然對齊。
            </>,
            <>
              <b>代價在 phase generator</b>：dph<sub>i</sub> 是用 ph<sub>i</sub> 重新取樣 div_N 得到的。div_N 在 ph0 rising 之後 tCQ + logic 才穩定，而 ph1 的 rising edge 只比 ph0 晚 1/8 T——retiming flop FF(ph1) 的 setup path 只有 1/8 T 可用。實務上先用 ph4（半個 T = 62.5 ps）取樣，再由 ph4 往 ph5/ph6/ph7、由 ph0 往 ph2/ph3 分支，可以把大部分段落拉到 2/8 ～ 4/8 T；但 <b>ph0 → ph1、ph4 → ph5 這種相鄰段永遠只有 1/8 T</b>，樹怎麼分都改不掉——而且 2/8 T = 31.25 ps 也還不夠（需求是 tCQ 12 + NOR 16 + tsetup 8 + 6 = 42 ps）。真正的解法是更快的 flop、讓 div_N 由 divider 的輸出 flop 直接驅動（不經 NOR）、或多插一級 retime，細節見下面 engineer 模式。
            </>,
          ]}
        />
      </Section>

      <Section title="三種架構的比較" en="Comparison">
        <p>下表不是「哪個最好」的排行榜。每一列都寫出<b>為什麼</b>，你的需求會決定哪幾列有分量。</p>
        <CompareTable
          head={['', '架構 1：PMUX → fixed /N', '架構 2：PMUX → /N /N+1', '架構 3：/N /N+1 → phases → PMUX']}
          rows={[
            ['功能', 'retimed MUX：N + k/8，k ≥ 0（forward-only）；combinational MUX：N ± k/8 都可以，但受 window 限制', 'N + k/8 與 N±1 任意組合；carry 併入 mod', '同左；backward 直接 N − k/8'],
            ['phase continuity', 'retimed MUX：forward 連續、backward 變成 +(8−k) 多一個 T（掉 pulse）；combinational MUX：backward 可行（間隔 N − k/8），但只能切在 (1/2 − k/8) T 的窗內', 'forward 連續；backward 靠 mod = N−1 補，FSM 必須同步處理 carry', '任何方向都連續（divided phase 同時存在）'],
            ['control latency', 'glitch-free MUX：1 ～ 2 Tvco', '同左，加上 mod 的 2-cycle path；FSM 常需提前一個 output 週期算好', '≈ 1 個 output 週期（select 在 divided clock 的 low 區間改）'],
            ['critical path（Fmax）', 'divider 內部 loop @ fVCO', 'divider 內部 loop @ fVCO（/3 mode 多一條 FF1 → NOR → FF0）', 'divider 內部 loop @ fVCO；另有 retiming flop 的 i/8 T setup path'],
            ['switching path', 'combinational：window [k/8, 1/2] T；retimed：half-cycle + handoff', '同左，但 div_out 較晚（NOR 之後），第一個窗常趕不上 ⇒ 幾乎一定要 retimed MUX', 'window 寬 ≈ N·T − 7/8 T − W（W = divider 輸出 pulse 寬；50% duty 時 ≈ N·T/2 − 7/8 T）。N = 3、W = 1 T ⇒ 1.125 T，容易'],
            ['jitter sensitivity', 'PMUX 在 fVCO：MUX 的 delay noise 每個 Tvco 都進到 pclk，再被 divider 傳到輸出', '同左', 'PMUX 在 fVCO/N：每個 output edge 只經過 MUX 一次，但 retiming flop 的 tCQ noise 直接是輸出 jitter'],
            ['glitch risk', 'combinational 高；retimed 無 runt 但有 handoff', '同左', '低（窗寬）；風險轉移到 8 個 retiming flop 的 setup'],
            ['hardware', '8:1 MUX（fVCO）+ /N', '8:1 MUX（fVCO）+ /N/N+1 + carry 邏輯', '/N/N+1 + 8 個 retiming flop（fVCO edge）+ 8:1 MUX（低速）'],
            ['power', '8 條 phase 走到 MUX（fVCO 負載大）', '同左', '8 條 phase 只到 flop 的 clk pin；MUX 與 select 邏輯低速'],
            ['output timing margin', '輸出 = divider 輸出，pclk 週期在 backward 時變短', '同左', '輸出 = MUX 輸出：retiming flop 的 tCQ 與 MUX delay 直接在輸出路徑上'],
            ['適用情境', '單向、固定 fractional（例如 spread-spectrum 的慢速 phase ramp）', 'DSM 驅動的 fractional-N：mod 每週期都變、需要 ±步進', '需要雙向細步進、jitter 敏感、功耗優先；接受 8 個 retiming flop'],
          ]}
        />
        <ModeContent level="engineer" title="兩個情境，各自怎麼選">
          <Callout kind="note" title="情境 A：SerDes 的 CDR phase rotator">
            需求：fVCO = 8 GHz、固定 /4、phase 每次最多 ±1 步、步進要細且雙向、輸出 jitter 預算 &lt; 300 fs rms。分析：(1) 雙向 ⇒ 架構 1 出局（它必須用 retimed MUX 才安全，而 retimed MUX 的 backward 會變成 forward 8−k、掉一個 pulse）。(2) 架構 2 可以，但 PMUX 在 8 GHz，MUX 的 delay noise 每 125 ps 累積一次；(3) 架構 3 的 MUX 在 2 GHz，且 backward 直接 N − 1/8，代價是 8 個 retiming flop——它們的 tCQ noise 直接進輸出，但 flop 的雜訊通常比大型 8:1 MUX tree 小、也容易做對稱。傾向架構 3；若面積/功耗不允許 8 個 fVCO flop，退回架構 2 + retimed MUX。
          </Callout>
          <Callout kind="note" title="情境 B：DSM 調變的 fractional-N synthesizer">
            需求：N = 60 ～ 120、mod 每個 output 週期由 ΔΣ 決定、phase step 用來抵消量化誤差（每週期 −3 ～ +3 步）、控制 latency 可以 pipeline。分析：mod 每週期都變 ⇒ 架構 1 出局；步進 ±3 ⇒ combinational MUX 的 window 只剩 1/8 T ⇒ 一定要 retimed MUX；architecture 3 的 phase generator 在 N 這麼大時，divided phase 的週期很長、窗很寬，但 8 個 retiming flop 仍在 fVCO edge 上工作，功耗與架構 2 差不多。兩者都可行；若 DTC（Lesson 6-3）會接在後面做更細的步進，架構 2 讓 PMUX 與 DTC 都在 divider 前面、carry 邏輯集中在一個 FSM，較常見。
          </Callout>
        </ModeContent>
      </Section>

      <Section title="這個架構的 critical path（架構 2）" en="Critical paths">
        <p>
          架構 2 有四種不同性質的 path，每一種的 launch / capture / 可用時間都不同。用 Explorer 切換 mode（/2、/3）看哪些 path 被 sensitize：
        </p>
        <CriticalPathExplorer scenario={arch2Timing} initialPath="q0-nor-d0" guided />
        <Steps
          items={[
            <>
              <b>Fmax path：FF0.Q → NOR → FF0.D</b>（兩種 mode 都有）與 <b>FF1.Q → NOR → FF0.D</b>、<b>FF0.Q → AND → FF1.D</b>（只在 mod = 1 被 sensitize）。launch、capture 都在 pclk 的 rising edge，可用時間一個 Tvco。
            </>,
            <>
              <b>mod reg → AND → FF1.D</b>：launch 在 div_out 的 rising edge（比 pclk 晚 tCQ + NOR = 18 ～ 28 ps），capture 是<b>第二個</b> pclk edge ⇒ multicycle 2，可用 2 Tvco。它限制的是「mod 最晚何時要決定好」，不是 Fmax。
            </>,
            <>
              <b>phase_sel → decode → PMUX（window）</b>：在架構 2 裡 div_out 來自 NOR 輸出，比 ph_old 的 rising edge 晚得多，select 最晚 70 ps 才到，而 forward +1 的第一個窗在 62.5 ps 就關了 ⇒ combinational PMUX 在這裡幾乎不可行，必須用 retimed MUX（然後換成 half-cycle + handoff 兩條 path）。
            </>,
            <>
              <b>ph_i → PMUX → FF0.clk</b>：clock path。它不限制 Fmax，但 8 路 mismatch 是固定 phase error、PVT 變化是 jitter。
            </>,
          ]}
        />
        <p>架構 1 的路徑集合是架構 2 的子集（沒有 mod path），可直接用 Lesson 5-2 的 scenario：</p>
        <CriticalPathExplorer scenario={pmuxSwitchTiming} initialPath="div-internal" compact showEnvControls={false} />
        <ModeContent level="engineer" title="架構 3 的 retiming path 怎麼算">
          <p>
            dph<sub>i</sub> 由 FF(ph<sub>i</sub>) 取樣 div_N。launch = ph0 的 rising edge（divider 的 FF0），capture = ph<sub>i</sub> 的 rising edge，可用時間 <Math>{'\\tfrac{i}{8}T_{vco}'}</Math>（i = 1 時 15.6 ps）：
          </p>
          <Math block>{'t_{CQ,div} + t_{logic} + t_{setup} + t_{jitter} + t_{margin} \\le \\frac{i}{M}T_{vco}'}</Math>
          <p>
            以 tCQ 12 + NOR 16 + tsetup 8 + 6 = 42 ps 來看，i 必須 ≥ 3（46.9 ps）。所以直接用 ph1、ph2 取樣不可行；改成樹狀：ph0 → ph4（62.5 ps 可用）、ph4 → ph6 → ph7、ph0 → ph2 → ph3 …，每段 2/8 T = 31.25 ps 仍不夠，實務上會把 div_N 先用 ph0 的 falling edge 或 ph4 retime 一次、並讓 divider 的輸出 flop 直接驅動、不經 NOR。這條 path 是架構 3 獨有的，且它的失敗模式是 metastability（真正的 setup violation），不是 glitch。
          </p>
        </ModeContent>
        <ModeContent level="deep" title="jitter、mismatch 與 power 的細節">
          <ul>
            <li>
              <b>MUX 在 fVCO（架構 1/2）</b>：pclk 的每一個 edge 都經過 MUX。MUX 的 delay noise（supply、thermal）是 white-ish 的，每個 edge 獨立抽樣一次；divider 只是把第 N 個 edge 送到輸出，所以輸出 jitter ≈ 一次 MUX delay noise + divider flop 的 tCQ noise——<b>並不會累積 N 次</b>（divider 是 edge-selecting，不是 edge-accumulating）。但 MUX 在 8 GHz 工作，supply 上的高頻雜訊更難濾。
            </li>
            <li>
              <b>MUX 在 fVCO/N（架構 3）</b>：輸出 edge 直接是 MUX 輸出，jitter = retiming flop 的 tCQ noise + MUX delay noise。retiming flop 由 VCO phase 驅動，它的 clock 路徑短、對稱，通常比 8:1 MUX tree 乾淨。
            </li>
            <li>
              <b>phase mismatch</b>：架構 1/2 的 mismatch 來自 VCO phase + MUX 8 路 delay 差；架構 3 多了 8 個 retiming flop 的 tCQ 差，但 MUX 8 路差變成低速、可以用大尺寸元件做對稱。兩者都需要校正（DTC 的 gain calibration 常一併處理）。
            </li>
            <li>
              <b>power</b>：架構 1/2 要把 8 條 fVCO phase 走線拉到 MUX（wire + MUX 輸入電容 × fVCO）；架構 3 只到 flop 的 clk pin，而 MUX、decode、select flop 都在 fVCO/N。N 越大差距越大。
            </li>
            <li>
              <b>pclk 週期變短的那一個 cycle</b>：架構 1/2 用 combinational MUX 做 backward 時，pclk 有一個週期只有 1 − k/8 T，divider 內部 loop 那一個 cycle 的 slack 被吃掉 k/8 T。retimed MUX 沒有這個問題（它不做 backward）。架構 3 的 divider 永遠看到完整的 Tvco。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>「MUX 放前面放後面只是畫法不同」</b>：不是。fVCO 與 fVCO/N 的 MUX 有不同的 window 寬度、雜訊路徑與功耗；backward step 在架構 1（用 retimed MUX 時）會掉 pulse、在架構 3 不會。
            </li>
            <li>
              <b>把 forward 的 carry 邏輯化</b>：forward wrap（7 → 0）的 +1 T 是 retimed MUX 物理上自動給的；再在 FSM 裡加一次就會多走兩個 T。只有 backward 需要 modulus 補償。
            </li>
            <li>
              <b>忘記 mod 是 multicycle path</b>：在 /2 /3 cell 裡 mod 要到 state 01 的 edge 才被用到；把它當 single-cycle 會過度保守，當成「隨時可改」則會在 state 01 之後才改、晚一個 output 週期生效。
            </li>
            <li>
              <b>用 combinational PMUX 直接接 /N /N+1</b>：div_out 比 pclk 晚 tCQ + logic，select 幾乎一定錯過第一個窗。
            </li>
            <li>
              <b>架構 3 忘了 retiming flop 的 setup path</b>：divided phase 不是免費的；用 ph1 直接取樣 div_N 只有 1/8 T。
            </li>
            <li>
              <b>把 PMUX 的 carry 與 DTC 的 overflow 畫等號</b>：兩者都是「跨過一個 Tvco」，但 DTC 的 range 與 PMUX 的 M 是不同的量；Lesson 6-3 會分開定義。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="SystemVerilog：架構 2 的 phase + modulus FSM（carry 併入 mod）">
          <CodeBlock
            title="pmux_dm_fsm.sv"
            code={`
// 每個 output 週期：phase_acc += step（step 可負）；wrap 的 carry 併入 mod。
// 假設 divider 為 /N /N+1 cell 且 N_base 對應 mod = 0；carry = -1 需要 /N-1 —— 這裡用「上一個週期少走一步」的方式：
// 實作上常把 divider 做成 /N-1 /N /N+1（三 modulus），或把 step 限制為非負並用 DSM 只產生 0/+1。
module pmux_dm_fsm #(parameter M = 8) (
  input  logic              clk,        // = div_out（output 週期）
  input  logic              rst_n,
  input  logic signed [3:0] step,       // 這個週期要前進的 phase 數（-3..+3）
  input  logic              mod_dsm,    // ΔΣ 給的基本 modulus（0: /N, 1: /N+1）
  output logic [2:0]        phase_sel,  // 給 glitch-free PMUX（會再被 decode 成 one-hot）
  output logic signed [1:0] mod_adj     // -1 / 0 / +1：要加到 mod_dsm 上的 integer carry
);
  logic signed [4:0] sum;
  assign sum = $signed({2'b0, phase_sel}) + step;      // 可能落在 -3..10
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      phase_sel <= '0; mod_adj <= '0;
    end else begin
      phase_sel <= sum[2:0];                              // (index + step) mod 8
      mod_adj   <= (sum >= M) ? 2'sd1 : (sum < 0) ? -2'sd1 : 2'sd0;   // floor((index+step)/8)
    end
  end
endmodule
`}
            note="mod_adj = +1 時：retimed MUX 已經自動多等一個 T，divider 不可再多走——FSM 要把它「吃掉」而不是加上去；mod_adj = −1 時 divider 必須少走一個 cycle。這兩個方向不對稱，正是本課的重點。"
          />
        </ModeContent>
      </Section>
    </>
  )
}

function ExerciseComponent() {
  return <ArchDecisionWorksheet />
}

const lesson: LessonDef = {
  id: 'm5-l3-pmux-arch',
  module: 5,
  order: 3,
  title: 'PMUX + /N/N+1 Divider',
  titleEn: 'PMUX + /N/N+1 architectures',
  summary: 'PMUX→fixed、PMUX→/N/N+1、/N/N+1→PMUX 三種架構：逐 output edge 列出時間表（架構 2 由 engine 模擬），比較 phase continuity、control latency、critical path、jitter、glitch risk、功耗與適用情境。',
  goals: [
    '畫出三種 PMUX + divider 架構的方塊圖，說出 PMUX 各在什麼頻率工作。',
    '逐 output edge 推導每種架構的 edge 時間，解釋 forward wrap 的 carry 為什麼是自動的、backward 為什麼需要 modulus 補償。',
    '用 engine 模擬架構 2，讀出 phase step 與 mod 一起切換時每個間隔 = N + Δphase/8，並解釋 real delay 模式多出來的一個 T。',
    '為架構 2 列出四種性質不同的 timing path（Fmax、multicycle mod、switching window、clock path），並說出各自的 launch / capture。',
    '依需求（步進方向、latency、jitter、功耗）論證架構選擇，而不是背「哪個最好」。',
  ],
  readingMinutes: 40,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'single',
      prompt: '哪一種架構的 PMUX 在 fVCO/N 而不是 fVCO 工作？',
      options: ['架構 1：PMUX → fixed /N', '架構 2：PMUX → /N /N+1', '架構 3：/N /N+1 → phase generator → PMUX', '三種都在 fVCO'],
      answer: 2,
      explanation: '架構 3 先除頻，再用 8 個 retiming flop 產生 divided phase，PMUX 選的是週期 N·Tvco 的訊號。代價是 8 個 retiming flop 在 VCO phase 的 edge 上工作。',
    },
    {
      id: 'q2',
      type: 'numeric',
      prompt: '架構 2 使用 /3 mode，每個 output 週期 phase forward +2（8-phase）。平均除數是多少？',
      answer: 3.25,
      tolerance: 0.001,
      explanation: 'N + k/M = 3 + 2/8 = 3.25。每個間隔本身就是 3.25 Tvco（不是整數週期的平均）。',
    },
    {
      id: 'q3',
      type: 'numeric',
      prompt: '架構 3：這個週期 N = 3，output edge 的 divided phase 從 dph2 改成 dph0。與上一個 output edge 的間隔是多少 Tvco？',
      answer: 2.75,
      tolerance: 0.001,
      explanation: 't_{j+1} − t_j = N + (sel_{j+1} − sel_j)/8 = 3 + (0 − 2)/8 = 2.75。架構 3 的 backward 直接可行；同樣的決策在架構 2 的 retimed MUX 會變成 3 + 6/8 = 3.75。',
    },
    {
      id: 'q4',
      type: 'state',
      prompt: '/2 /3 cell 目前 state = 01（q1 q0），mod = 1。下一個 pclk edge 之後 state 是？',
      answer: '10',
      width: 2,
      bitNames: ['q1', 'q0'],
      explanation: 'd0 = NOT(q1 OR q0) = 0，d1 = q0 AND mod = 1 ⇒ 10。這正是 mod 被「用到」的那個 edge：mod 必須在它之前穩定，前一個 edge（00 → 01）不看 mod。',
    },
    {
      id: 'q5',
      type: 'critical-path',
      prompt: '架構 2 在 mod = 0（/2）時，限制 Fmax 的 critical path 是哪一條？',
      schematic: arch2TimingSchematic,
      options: [
        { label: 'FF0.Q → NOR → FF0.D', highlight: { style: 'setup', wires: ['w_q0_nor', 'w_d0'], elements: ['ff0', 'nor'], tags: [{ elementOrWire: 'ff0', text: 'launch = capture（pclk）' }] }, description: '兩種 mode 都被 sensitize' },
        { label: 'FF1.Q → NOR → FF0.D', highlight: { style: 'setup', wires: ['w_q1_nor', 'w_d0'], elements: ['ff1', 'nor', 'ff0'], tags: [{ elementOrWire: 'ff1', text: 'launch' }, { elementOrWire: 'ff0', text: 'capture' }] }, description: 'q1 在 mod = 0 恆為 0' },
        { label: 'ph0 → PMUX → FF0.clk', highlight: { style: 'async', wires: ['w_ph0', 'w_pclk0'], elements: ['mux', 'ff0'], tags: [{ elementOrWire: 'mux', text: 'clock path' }] }, description: '最長的走線' },
        { label: 'phase_sel → decode → PMUX select', highlight: { style: 'async', wires: ['w_sel_q', 'w_dec', 'w_pclk0'], elements: ['ffsel', 'dec', 'mux'], tags: [{ elementOrWire: 'ffsel', text: 'launch（div_out）' }] }, description: 'select 路徑' },
      ],
      answer: 0,
      explanation: 'mod = 0 時 q1 恆為 0，FF1 → NOR 的路徑沒有 transition、不被 sensitize。ph0 → PMUX 是 clock path，沒有 capture flop 的 setup 要求；select 路徑限制的是 switching window。只有 FF0.Q → NOR → FF0.D 有 launch（edge k）與 capture（edge k+1）且必須在一個 Tvco 內完成。',
    },
    {
      id: 'q6',
      type: 'multiple',
      prompt: '下列關於 integer carry 的敘述，哪些正確？',
      options: ['forward 7 → 0 時，retimed PMUX 會自動讓第一個 ph0 edge 落在下一個 Tvco，不需要額外邏輯', 'backward 0 → 7 時，使用 retimed（glitch-free）MUX 的架構 1 會多走一個 Tvco（掉一個 pulse）', '架構 2 可以把 backward 的 carry −1 併入 modulus（該週期少走一個 cycle）', '架構 3 的 backward 也需要 modulus 補償'],
      answers: [0, 1, 2],
      explanation: 'forward 的 carry 是物理自動的；backward 才需要補。架構 1 的 fixed /N 沒有地方補，所以 retimed MUX 只能往後切 ⇒ 多一個 Tvco（第 2 項成立的前提就是 retimed MUX；改用 combinational MUX 切在都 low 的窗內，backward 是乾淨的 N − k/8，不需要補償，但要承擔 window / runt 風險）。架構 2 用 mod 補；架構 3 因為 8 個 divided phase 同時存在，直接選較早的那個，不需要補償。',
    },
    {
      id: 'q7',
      type: 'single',
      prompt: '為什麼架構 2 幾乎一定要用 retimed（glitch-free）PMUX，而不是 combinational PMUX？',
      options: ['因為 /N /N+1 cell 的 flop 比較多', '因為 FSM 的 clock 是 div_out（NOR 之後），select 到達 MUX 時第一個安全窗已經關閉', '因為 combinational MUX 的 delay 比較大', '因為 mod 是 multicycle path'],
      answer: 1,
      explanation: 'div_out 比 pclk 的 rising edge 晚 tCQ + NOR（18 ～ 28 ps），再加 FSM tCQ、decode、MUX，select 最晚約 70 ps 才到，而 forward +1 的「都 high」窗在 62.5 ps（Tvco/2）就關了。retimed MUX 把「窗」換成 falling-edge flop 的 edge，問題消失。',
    },
  ],
  exercise: {
    title: '給需求選架構，並說出它的 critical path',
    prompt: (
      <p>
        下面的工作紙列出一組需求。先自己推：哪些需求直接淘汰某個架構？剩下的架構裡，限制 Fmax 的是哪條 path、限制切換的是哪條 path？選好之後按「對照參考推理」。再把需求改成「phase 每週期可動 ±3 步」或「不能接受 8 個 fVCO flop」，看結論會不會變。
      </p>
    ),
    Component: ExerciseComponent,
    checklist: ['指出「backward 不掉 pulse」淘汰了用 retimed MUX 的架構 1', '比較架構 2 與 3 在功耗、jitter、window 三項的差異', '說出 Fmax critical path 是在 fVCO 工作的 divider 內部 loop', '說出所選架構「切換」相關的第二條 path（window / handoff / retiming setup）'],
    answer: (
      <>
        <p>
          <b>淘汰</b>：backward 一步不能掉 pulse ⇒ 架構 1 出局——前提是它用 retimed（glitch-free）MUX：fixed /N 無法少走一個 cycle，retimed MUX 又只能往後切，0 → 7 就變成 +7、多一個 Tvco。（若改用 combinational MUX，架構 1 其實做得到 backward N − k/8——Lesson 5-2 的模擬就示範過；但那要把 select 精準壓進 (1/2 − k/8) T 寬的窗內，在 jitter 預算 &lt; 300 fs rms 的需求下沒人會拿 runt 去賭，所以一樣出局。）
        </p>
        <p>
          <b>架構 2 vs 3</b>：兩者都能做 ±1 步進。功耗優先與 jitter 敏感都偏向架構 3（PMUX 在 fVCO/4 ～ /6，MUX delay noise 只在輸出 edge 出現一次；8 條 fVCO phase 只到 flop clk pin）。架構 2 的 PMUX 在 8 GHz，而且 div_out 較晚，combinational select 趕不上窗 ⇒ 必須 retimed，再加 carry 併入 mod 的 FSM——邏輯較多。允許 1 個 output 週期 latency 兩者都夠。
        </p>
        <p>
          <b>critical path</b>：不論選哪個，Fmax 由 <b>在 fVCO 工作的 divider 內部 Q → logic → D</b> 決定（tCQ + logic + setup ≤ 125 ps）。架構 3 的第二條緊路徑是 <b>retiming flop 的 setup path</b>（div_N → FF(ph_i)，只有 i/8 T），要用樹狀 retiming 或先用 ph4 取樣來放寬；它的失敗是 metastability。架構 2 的第二條是 <b>glitch-free MUX 的 handoff path</b>（k = 1 時只有 1/8 T），失敗是多等一個 T 或 EN flop metastable。
        </p>
        <p>
          <b>需求改變</b>：若步進變成 ±3，架構 3 的 window 仍然寬（divided clock 週期長），架構 2 的 handoff 反而變寬鬆（3/8 T）但 combinational window 只剩 1/8 T——結論不變但理由變了。若不允許 8 個 fVCO flop，架構 3 的 phase generator 做不出來，只剩架構 2 + retimed MUX + carry FSM。
        </p>
      </>
    ),
  },
}
export default lesson
