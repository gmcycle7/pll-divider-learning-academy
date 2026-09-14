/**
 * /verilog：Verilog 教學與 Bug Lab
 *
 * 1. 頁首「RTL 與電路的對應」：always_ff / always_comb / assign / case 各對應到哪一個電路元件與哪一條 next-state equation。
 * 2. 主要 divider 的 SystemVerilog（Tabs）：每段 RTL 搭配同一個 netlist 的逐 edge 模擬、state equation 與常見 bug。
 * 3. Bug Lab：八個經典 bug，先預測再看模擬證據與修正（bugs.tsx）。
 * 4. 陌生電路練習（mystery.sv）與小測驗。
 * 進度：useProgress key 'verilog'（quizScore = 已完成的 bug 案例數、quizTotal = 8、read、exerciseDone）。
 */
import { useCallback, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Callout, CodeBlock, CompareTable, Math as Tex, ModeContent, Section, Steps, Tabs, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { StateDiagram, graphToDiagram } from '@/components/circuit/StateDiagram'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { QuizEngine } from '@/components/quiz/QuizEngine'
import type { QuizQuestion } from '@/components/quiz/types'
import { useProgress } from '@/hooks/useProgress'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, detectRuntPulses, measureDivide } from '@/models/divider/analysis'
import { div2, div3, dualMod23, mmd2 } from '@/models/divider/examples'
import * as R from './verilog/rtl'
import * as M from './verilog/bug-models'
import * as S from './verilog/schematics'
import { BUG_CASES, BugLab, Rtl } from './verilog/bugs'

const T = 100
const PROGRESS_KEY = 'verilog'

/* ------------------------------------------------------------------ 模組載入時算好的靜態證據 */
const div3Graph = buildStateGraph(div3, {})
const johnsonGraph = buildStateGraph(M.johnson6, {})
const johnsonFixedGraph = buildStateGraph(M.johnson6Fixed, {})

const PMUX_EDGES = 18
const PMUX_VIEW = ['ph0', 'ph1', 'ph2', 'ph5', 'ph7', 'div_out']
const pmuxNaiveRun = simulate(M.pmuxNaive, PMUX_EDGES, { period: T, ...M.PMUX_OPTIONS }, M.pmuxInputAt())
const pmuxGfRun = simulate(M.pmuxGlitchFree, PMUX_EDGES, { period: T, ...M.PMUX_OPTIONS }, M.pmuxInputAt())
const pmuxNaiveTraces = pmuxNaiveRun.sim.getTraces(PMUX_VIEW)
const pmuxGfTraces = pmuxGfRun.sim.getTraces(PMUX_VIEW)
const pmuxNaiveRunts = detectRuntPulses(pmuxNaiveTraces.filter((t) => t.name === 'div_out'), M.RUNT_MIN)
const pmuxGfRunts = detectRuntPulses(pmuxGfTraces.filter((t) => t.name === 'div_out'), M.RUNT_MIN)
const pmuxGfIntervals = measureDivide(pmuxGfTraces.find((t) => t.name === 'div_out')!, T, 0).intervals
const pmuxSelMarks = M.PMUX_SEL_SCHEDULE.map((s) => ({ t: (s.edge - (M.PMUX_OPTIONS.inputLead ?? 0.35)) * T, label: `phase_sel=${s.sel}`, kind: 'input' as const }))

/* ------------------------------------------------------------------ 頁首：RTL 與電路的對應 */
function RtlMapping() {
  return (
    <Section title="RTL 與電路的對應" en="How RTL maps onto the circuit">
      <p>
        看 divider 的 RTL 時，不要把它當程式讀，要把它當<b>電路圖的文字版</b>。每一個 always_ff 是一排 flop，每一個 <span className="mono">&lt;=</span> 右邊的算式是那個 flop 的 D 前面的組合邏輯，每一個 case 的列就是 state table 的一列。前面課程用的 netlist（flops / gates / equations）就是這個對應的資料版本。
      </p>
      <CompareTable
        head={['SystemVerilog 寫法', '電路裡是什麼', '本站 netlist 的欄位', '看到它時要問的問題']}
        rows={[
          [<span className="mono">always_ff @(posedge clk or negedge rst_n)</span>, 'rising-edge DFF（含 async active-low reset）', 'flops[].clk = clk、edge = rising、rstn = rst_n', '這個 block 裡有幾個 <= 的左邊？就有幾個 state bit。'],
          [<span className="mono">q &lt;= expr;</span>, 'expr 是這個 flop 的 D：next-state logic', 'flops[].d 指向某個 gate 的 out', 'expr 用到哪些 q 與 input？那就是 feedback path。'],
          [<span className="mono">if (!rst_n) q &lt;= 1'b0;</span>, 'reset state（起始 state / 起始相位）', 'flops[].resetValue', 'reset 決定除數嗎？通常不；它決定起始相位與「能不能離開 illegal state」。'],
          [
            <>
              <span className="mono">always_comb</span> / <span className="mono">assign</span>
            </>,
            '純組合邏輯：NOR、AND、XOR、MUX…',
            'gates[]', '每個輸出在每種輸入下都被指定了嗎？沒有就是 latch（Bug #2）。有沒有用到自己？有就是迴圈（Bug #4）。'],
          [<span className="mono">case (state) … endcase</span>, 'state table：一列一個 transition', 'equations[]、nextStateOf()', 'default 指向哪裡？指向自己就是 lock-up（Bug #3）。'],
          [<span className="mono">assign div_out = f(state);</span>, 'Moore output decode', 'netlist.output', 'decode 會 glitch。要給下一級當 clock 就先過一個 flop（Bug #8）。'],
          [<span className="mono">always_ff @(negedge q0)</span>, 'falling-edge flop，而且 clock 是另一個 flop 的 Q：ripple', 'flops[].clk = q0、edge = falling', '這不是同步路徑；STA 要定義 generated clock，delay 會一級一級累積。'],
          [<span className="mono">assign out = clk &amp; en;</span>, '組合邏輯在 clock 路徑上', 'gates[] 的 inputs 含 clk', 'en 會不會在 clk = 1 期間改變？會就是 runt（Bug #5）。'],
        ]}
      />
      <LogicDiagram schematic={S.fsmBlocksSch} showValues={false} caption="任何 state machine 型 divider 的 RTL 都是這三個方塊：always_comb 算 next、always_ff 在 edge 抓 next 進 state、assign 從 state decode 輸出。" />
      <Callout kind="idea" title="讀 RTL 的固定順序">
        <ol style={{ margin: 0 }}>
          <li>先找所有 always_ff：列出 state bit、各自的 clock 與 edge、reset 值。</li>
          <li>把每個 <span className="mono">&lt;=</span> 的右邊寫成 d = f(q…, input…)：這就是 next-state equation。</li>
          <li>從 reset state 逐 edge 代入，得到 state 序列與 output edge，算除數。</li>
          <li>最後才看 timing：每條 d 的算式有多長？control input 最晚要何時到？</li>
        </ol>
      </Callout>
      <ModeContent level="engineer" title="synthesizable 與 behavioral、<= 與 =">
        <ul>
          <li>
            <b>synthesizable</b>：能被合成工具一對一變成 flop 與 gate 的寫法（always_ff + always_comb + assign，沒有 delay、沒有 initial、沒有 event control 以外的等待）。本頁標成綠色的 RTL 都是。
          </li>
          <li>
            <b>behavioral</b>：只描述行為、用來說明或當 testbench 參考模型的寫法（例如用 generate 迴圈描述可參數化的 MMD、或用 8 個 negedge always_ff 描述 phase select）。它們「可能」也能合成，但真正的高速電路會用客製 cell。
          </li>
          <li>
            always_ff 裡一律用 <Term zh="非阻塞指定" en="non-blocking assignment, <=" />：所有右邊在 edge 前一瞬間取值、所有左邊在 edge 後一起更新，這正是「一排 flop 同時抓 D」的語意。用阻塞的 = 寫 flop，多個 always block 之間會有 race，模擬結果取決於模擬器的執行順序。
          </li>
          <li>always_comb 裡一律用 =：它描述的是「立刻」的組合邏輯。</li>
        </ul>
      </ModeContent>
      <ModeContent level="deep" title="RTL 看不到、但矽上有的東西">
        <p>
          RTL 的模擬語意是 zero-delay：每個 &lt;= 在 edge 後「立刻」完成。tCQ、gate delay、setup / hold、pulse width 都不在 RTL 裡。所以 RTL 模擬會過、矽上會壞的 bug 全部是 timing 型的：mod 到得太晚（Bug #6）、clock gating 的 runt（Bug #5）、decode glitch（Bug #8）。本頁每個模擬面板都有「理想 / 實際 delay」切換，建議每段 RTL 都兩種模式各跑一次，看哪些行為只有實際 delay 才會出現。
        </p>
      </ModeContent>
    </Section>
  )
}

/* ------------------------------------------------------------------ RTL 分頁 */
function Pitfalls({ code, items }: { code: string; items: ReactNode[] }) {
  return (
    <Callout kind="pitfall" title="常見 bug">
      <CodeBlock code={code} />
      <ul style={{ margin: 0 }}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </Callout>
  )
}

function TabDiv2() {
  return (
    <>
      <Rtl block={R.RTL_DIV2} />
      <p>
        對照電路：always_ff 是 FF0，<span className="mono">~q0</span> 是 inverter，<span className="mono">if (!rst_n)</span> 是 FF0 底下的 rst_n pin。state 只有一個 bit。逐 edge 推：reset 後 q0 = 0，d0 = NOT 0 = 1；edge 1 之後 q0 = 1，d0 = 0；edge 2 之後 q0 = 0——回到起點，週期 2T。
      </p>
      <Tex block>{'d_0 = \\overline{q_0},\\qquad q_0[k+1] = \\overline{q_0[k]},\\qquad T_{out} = 2\\,T_{in}'}</Tex>
      <p className="small muted">變數：q0[k] = 第 k 個 rising edge 之後的 state；T_in = clk 週期（ps）；T_out = div_out 週期（ps）。</p>
      <DividerSimPanel netlist={div2} schematic={S.div2Sch} title="div2.sv 的模擬：state 序列 1, 0, 1, 0 …" showDelayMode showPulseWidths />
      <Pitfalls
        code={R.SNIPPET_DIV2_BUGS}
        items={[
          <>(a) 沒有 reset：除數還是 2，但相位不定；兩個 /2 並排就會互相反相（Bug Lab #1）。</>,
          <>(b) 用 assign 寫 toggle：沒有 flop，是組合迴圈，會自我振盪（Bug Lab #4）。</>,
          <>(c) 把 negedge 寫到 clock 上：只是改成 falling-edge 觸發，除數不變，輸出 edge 對齊到 clk 的 falling edge。</>,
        ]}
      />
      <ModeContent level="engineer" title="合成後長什麼樣">
        <p>
          合成工具會把 <span className="mono">q0 &lt;= ~q0</span> 變成「FF0 的 Q 經一個 inverter 回到 D」，或直接用 FF0 的 Q̄ 接 D（省掉 inverter）。兩者的差別只在 timing：前者的 critical path 是 tCQ + tINV + tsetup，後者是 tCQ + tsetup。Lesson 1-1 的 CriticalPathExplorer 用的就是前者。
        </p>
      </ModeContent>
    </>
  )
}

function TabSync4() {
  return (
    <>
      <Rtl block={R.RTL_SYNC4} />
      <p>
        <span className="mono">cnt &lt;= cnt + 1</span> 看起來像算術，合成後就是兩條 next-state equation：最低位每次反相，次高位在最低位為 1 時反相（進位）。
      </p>
      <Tex block>{'d_0 = \\overline{q_0},\\qquad d_1 = q_1 \\oplus q_0'}</Tex>
      <p>逐 edge：00 → 01 → 10 → 11 → 00。q1 在 edge 2 升、edge 4 降 ⇒ 週期 4T、high 2T ⇒ duty 50%。兩個 flop 用同一條 clk，所以 q0 與 q1 同時改變——這是 synchronous 與 ripple 的差別。</p>
      <DividerSimPanel netlist={M.sync4} schematic={S.sync4Sch} title="div4_sync.sv 的模擬：state 序列 01, 10, 11, 00 …" showDelayMode showPulseWidths />
      <Pitfalls
        code={R.SNIPPET_SYNC4_BUGS}
        items={[
          <>(a) 用 q0 當 q1 的 clock「省一個 XOR」：功能還是 /4，但 q1 比 q0 晚 tCQ 才變；decode 會有 glitch（Bug Lab #8），STA 也要多定義一個 generated clock。</>,
          <>(b) 用阻塞的 = 寫 flop：功能常常「看起來對」，但同一個 edge 的兩個 always block 誰先執行沒有定義。</>,
        ]}
      />
      <ModeContent level="engineer" title="critical path 在哪">
        <p>
          最長的 register-to-register 路徑是 FF0.Q → XOR → FF1.D：launch = FF0（edge k）、capture = FF1（edge k+1），arrival = tCQ + tXOR。因為 q0 與 q1 由同一條 clk 驅動，skew ≈ 0。Lesson 1-3 有完整的推導。
        </p>
      </ModeContent>
    </>
  )
}

function TabDiv3() {
  return (
    <>
      <Rtl block={R.RTL_DIV3} />
      <p>
        這是最標準的「三段式」寫法：always_ff 只負責 state ← next；always_comb 用 case 把 state table 抄進去；assign 從 state decode 輸出。case 的每一列就是 state diagram 的一條箭頭。
      </p>
      <div className="two-col">
        <StateDiagram {...graphToDiagram(div3Graph, 'clk↑')} title="div3_fsm.sv 的 state graph（11 → 10）" width={300} height={230} />
        <div>
          <p className="small">
            主循環：{div3Graph.mainCycle.join(' → ')}。11 unreachable 但一個 edge 回到主循環（default: next = S2）。
          </p>
          <p className="small">合成後：d0 = NOR(q1, q0)、d1 = q0。注意 default 選 10 而不是 00 是因為 d1 = q0 不需要任何 gate——最省的寫法。</p>
        </div>
      </div>
      <Tex block>{'d_0 = \\overline{q_1 + q_0},\\qquad d_1 = q_0,\\qquad div\\_out = q_1'}</Tex>
      <p>逐 edge：00 → 01 → 10 → 00。q1 只在 state 10 為 1 ⇒ high 1T、low 2T ⇒ duty = 1/3，<b>不是 50%</b>。要 50% 得再加一個 falling-edge flop（Lesson 2-2）。</p>
      <DividerSimPanel netlist={div3} schematic={S.div3Sch} title="div3_fsm.sv 的模擬（可從 11 啟動看它回到主循環）" allowInitialState showDelayMode showPulseWidths />
      <Pitfalls
        code={R.SNIPPET_DIV3_BUGS}
        items={[
          <>(a) 沒有 default 也沒寫 11：next 在 11 時「保持」⇒ 推斷出 latch（Bug Lab #2）。</>,
          <>(b) default: next = state：11 → 11 永遠鎖死（Bug Lab #3）。</>,
        ]}
      />
      <ModeContent level="deep" title="state encoding 與 timing">
        <p>
          binary encoding（本例）用最少 flop，但 next-state logic 是多輸入 gate；one-hot 用 3 個 flop，每個 d 只是上一個 q（shift），critical path 只有 tCQ + tsetup，高速 divider 常用。Johnson（twisted-ring）介於兩者之間，本頁最後的練習就是一個。
        </p>
      </ModeContent>
    </>
  )
}

function TabDm23() {
  return (
    <>
      <Rtl block={R.RTL_DM23} />
      <p>
        與 /3 相比只多了一個 AND：<span className="mono">q1 &lt;= q0 &amp; mod</span>。mod = 0 時 q1 永遠是 0，電路退化成 00 → 01 → 00 的 /2；mod = 1 時多走一個 state 10，變成 /3。
      </p>
      <Tex block>{'d_0 = \\overline{q_1 + q_0},\\qquad d_1 = q_0 \\cdot mod,\\qquad div\\_out = \\overline{q_1 + q_0}'}</Tex>
      <Steps
        items={[
          <>
            <b>mod = 0</b>：00 → 01 → 00 → …，div_out 在 state 00 為 1 ⇒ 週期 2T。
          </>,
          <>
            <b>mod = 1</b>：00 → 01 → 10 → 00 → …，週期 3T。
          </>,
          <>
            <b>切換</b>：兩種週期都從 state 00 開始、都在 state 00 輸出 high。所以不管何時把 mod 從 0 切到 1，下一個輸出週期就是 3T，沒有 phase jump——這叫 <Term zh="相位連續" en="phase-continuous" />。
          </>,
          <>
            <b>mod 什麼時候被看</b>：d1 = q0 AND mod 只在 q0 = 1（state 01）的那個 edge 有意義。mod 必須在那個 edge 之前 tsetup + tAND 就穩定，之後怎麼變都沒關係，直到下一個 state 01。
          </>,
        ]}
      />
      <DividerSimPanel netlist={dualMod23} schematic={S.dm23Sch} title="dm23_cell.sv 的模擬：切換 mod 觀察週期 2T 與 3T 交錯" showDelayMode showPulseWidths />
      <Pitfalls
        code={R.SNIPPET_DM23_BUGS}
        items={[
          <>(a) 兩個獨立 divider 再用 MUX 選輸出：不是 dual-modulus。兩個 divider 相位各自獨立，切換時輸出會跳相位、甚至出 runt（Lesson 3-1 的 A / B 比較）。</>,
          <>(b) 把 mod 加到 d0 而不是 d1：/2 的循環被打斷，除數不再是 2 或 3。</>,
        ]}
      />
      <ModeContent level="engineer" title="mod 的 deadline">
        <Tex block>{'t_{mod,arrive} \\le T - t_{setup} - t_{AND}'}</Tex>
        <p>
          變數：t_mod,arrive = mod 相對於「state 01 進入」那個 edge 的到達時間（ps）；T = clk 週期；t_setup = FF1 的 setup；t_AND = AND 的延遲。mod 通常來自另一個 flop（例如 MMD 的下一級或 DSM 的輸出），所以這是一條 register-to-register 的 control path，Bug Lab #6 就是它被拉太長的例子。
        </p>
      </ModeContent>
    </>
  )
}

function TabProg46() {
  return (
    <>
      <Rtl block={R.RTL_PROG46} />
      <p>
        terminal-count counter：cnt 從 0 數到 n_max 就歸零，n_max = N − 1。sel = 0 ⇒ n_max = 3 ⇒ 四個 state（/4）；sel = 1 ⇒ n_max = 5 ⇒ 六個 state（/6）。輸出 decode cnt == 0，每個週期 high 一個 T ⇒ duty = 1/N。
      </p>
      <Tex block>{'tc = [\\,cnt = n_{max}\\,],\\qquad cnt[k+1] = tc\\,?\\,0 : cnt[k] + 1,\\qquad N = n_{max} + 1'}</Tex>
      <p>逐 edge（sel = 1）：000 → 001 → 010 → 011 → 100 → 101 → 000。數一數：六個 state，週期 6T。</p>
      <DividerSimPanel netlist={M.prog46} schematic={S.prog46Sch} title="div_prog46.sv 的模擬：切換 sel 看 /4 與 /6" showDelayMode />
      <Pitfalls
        code={R.SNIPPET_PROG_BUGS}
        items={[
          <>(a) off-by-one：cnt == 4 ⇒ 五個 state ⇒ /5（Bug Lab #7）。</>,
          <>(b) sel 在 cnt 已經超過新 n_max 時改變：== 永遠不成立，數到 7 溢位才繞回，出現一個 8T 的長週期（engine 驗證：第一個 rising edge 在 8T）。用 &gt;= 或只在 cnt == 0 時更新 n_max。</>,
        ]}
      />
      <ModeContent level="deep" title="為什麼高速 divider 不用這種寫法">
        <p>
          cnt == n_max 是一個多位元比較器，再加上 +1 的進位鏈，critical path 隨位元數變長；而且 sel 直接進比較器，是一條每個 cycle 都會被檢查的 control path。高速的 programmable divider 改用 MMD（下一個分頁）：每一級只是 /2 /3 cell，比較與進位都被拆散到各級，而且各級的 clock 越後面越慢。
        </p>
      </ModeContent>
    </>
  )
}

function TabMmd() {
  return (
    <>
      <Rtl block={R.RTL_MMD} />
      <p>
        兩級串接時 STAGES = 2：stage 1 的 clock 是 clk，stage 2 的 clock 是 stage 1 的 f_out（<b>ripple</b>，不是同一條 clock）。mod 往反方向走：stage 2 在自己的 state 00 那個 f1 週期把 mod_out 送回 stage 1，允許 stage 1 走一次 /3。
      </p>
      <Tex block>{'N = 2^{STAGES} + \\sum_{i=0}^{STAGES-1} p_i\\,2^{i} \\;=\\; 4 + 2\\,p_1 + p_0 \\quad (STAGES = 2)'}</Tex>
      <p className="small muted">變數：p_i = 第 i 級的 programming bit（bit 0 對應最快的第一級）；N = 每個 div_out 週期內的 clk 週期數（無單位）。</p>
      <Steps
        items={[
          <>stage 2 每個週期用 (2 + p1) 個 f1 週期；其中恰好一個（mod_out2 = 1 的那個）允許 stage 1 吞。</>,
          <>stage 1 在那個 f1 週期走 /3（若 p0 = 1），其餘走 /2。</>,
          <>所以 N = 2·(2 + p1) + p0 = 4 + 2p1 + p0：p1p0 = 00 → 4、01 → 5、10 → 6、11 → 7。</>,
        ]}
      />
      <DividerSimPanel netlist={mmd2} schematic={S.mmdSch} title="mmd.sv（STAGES = 2）的模擬：切換 p0、p1 觀察 N = 4 ～ 7" showDelayMode windowCycles={16} />
      <Pitfalls
        code={R.SNIPPET_MMD_BUGS}
        items={[
          <>(a) 少了 mod_in：每級各自獨立 /2 或 /3，N = (2 + p0)(2 + p1) ∈ {'{4, 6, 6, 9}'}，不再是連續的 4 ～ 7。</>,
          <>(b) 把所有級都接同一條 clk：那已經不是 MMD，state equation 全部改變；要「同步化」請在輸出端 retime，不要改 cell 的 clock。</>,
        ]}
      />
      <ModeContent level="engineer" title="mod_in 是 MMD 的 critical path">
        <p>
          stage 1 在自己的 state 01 那個 clk edge 需要 mod_in（= stage 2 的 mod_out）已經穩定；而 mod_out2 是 stage 2 的 NOR，由 f1 觸發、又要繞回最快的 stage 1。所以這條 control path 是「慢級 launch、快級 capture」，可用時間卻只有一個（快的）clk 週期扣掉 stage 2 的 tCQ 與 NOR。Lesson 4-2 專門分析這條路徑。
        </p>
      </ModeContent>
    </>
  )
}

function TabPmux() {
  return (
    <>
      <p>
        8 個相位（相鄰差 T/8）、一個 3-bit phase_sel。先看最直覺的寫法：
      </p>
      <Rtl block={R.RTL_PMUX_NAIVE} />
      <LogicDiagram schematic={S.pmuxNaiveSch} showValues={false} maxWidth={360} />
      <p>
        問題只發生在 phase_sel 改變的<b>那一瞬間</b>：輸出從「舊相位目前的值」直接跳到「新相位目前的值」。如果舊相位還在 high、新相位已經 low（或反過來），就切出一個半截的 pulse。下面用 engine 跑同一組 select 序列（{M.PMUX_SEL_SCHEDULE.map((s) => `edge ${s.edge}: ${s.sel}`).join('、')}）：
      </p>
      <ClockWaveform signals={pmuxNaiveTraces} tStart={0} tEnd={PMUX_EDGES * T} period={T} markers={pmuxSelMarks} highlight={['div_out']} showPulseWidths={['div_out']} pxPerPeriod={64} rowHeight={26} title={`pmux8_naive：${pmuxNaiveRunts.length} 個比 ${M.RUNT_MIN} ps 窄的 runt（寬度 ${[...new Set(pmuxNaiveRunts.map((r) => r.width))].sort((a, b) => a - b).join(' / ')} ps）`} />
      <p>
        修正的原則與 Bug Lab #5 相同：每一相各有一個 enable flop，用「該相自己的 negedge」取樣。舊相只會在自己為 0 時關閉、新相只會在自己為 0 時打開，而且新相要等所有舊 enable 都是 0 才能打開（先關再開）。
      </p>
      <Rtl block={R.RTL_PMUX_GF} />
      <ClockWaveform signals={pmuxGfTraces} tStart={0} tEnd={PMUX_EDGES * T} period={T} markers={pmuxSelMarks} highlight={['div_out']} showPulseWidths={['div_out']} pxPerPeriod={64} rowHeight={26} title={`pmux8_gf：${pmuxGfRunts.length} 個 runt；rising edge 間隔 = ${pmuxGfIntervals.map((x) => `${x}T`).join(', ')}`} />
      <Steps
        items={[
          <>phase_sel 從 2 變 5：den2 = 0，en2 在下一個 ph2 negedge 關閉（此時 ph2 = 0，輸出本來就是 0，沒有半截）。</>,
          <>en2 = 0 之後 others_off 對 en5 成立，en5 在下一個 ph5 negedge 打開（此時 ph5 = 0）。</>,
          <>輸出的下一個 rising edge 落在 ph5 的 rising edge 上：這一個週期被拉長 3/8 T，之後每個週期都是 1T。切換到「更早」的相位時也一樣是拉長（等下一個新相位的 rising edge），不會縮短——engine 量到的間隔全部 ≥ 1T。</>,
        ]}
      />
      <DividerSimPanel netlist={M.pmuxGlitchFree} options={M.PMUX_OPTIONS} title="pmux8_gf 互動：切換 sel0 / sel1 / sel2（phase_sel = sel2 sel1 sel0）" signals={['ph0', 'ph1', 'ph2', 'ph3', 'ph4', 'ph5', 'ph6', 'ph7', 'sel0', 'sel1', 'sel2', 'div_out']} showEquations={false} showTable={false} showMeasure={false} showPulseWidths compact windowCycles={8} />
      <Pitfalls
        code={R.SNIPPET_PMUX_BUGS}
        items={[
          <>(a) 用 posedge ph[i] 取樣 enable：新相在自己為 1 的瞬間打開 ⇒ 輸出出現半個 pulse。</>,
          <>
            (b) 只用一條共同 clk 同步 phase_sel：切換發生在 posedge clk 之後 tCQ 的那一瞬間，此時 ph0 與 ph5～ph7 是 high、ph1～ph4 是 low（ph<sub>i</sub> 在 i/8 T
            升起、duty 50%）。所以從 ph0 切到 ph5～ph7 剛好兩相同 level，輸出不會斷；切到 ph1～ph4 則是 high → low，輸出立刻被截成 runt。判準是<b>舊相與新相在切換瞬間必須同
            level</b>，不是「新相是不是 high」——一條共同 clk 給不了這個保證，換一個 sel 組合就破功。（ph4 更是邊界：它的 falling edge 幾乎和 clk edge 重合，只差一個 buffer delay。）
          </>,
        ]}
      />
      <ModeContent level="deep" title="PMUX glitch 是 pulse-width 問題，不是 data setup 問題">
        <p>
          naive 的 8:1 MUX 沒有任何 capture flop，所以不存在 setup / hold 可以算。壞掉的是輸出 pulse 的<b>寬度</b>：半截 pulse 給下游 divider 當 clock，下游可能數到、可能沒數到、也可能 metastable。glitch-free 版本把「切換」變成 8 個 enable flop 的 register-to-register 問題（den_i → en_i 的 setup，相對於 ph_i 的 negedge），這才是可以用 STA 檢查的東西。Lesson 5-2 有 select 時間拖曳的互動版本。
        </p>
      </ModeContent>
    </>
  )
}

export const RTL_TABS: { label: string; content: ReactNode }[] = [
  { label: '/2', content: <TabDiv2 /> },
  { label: 'synchronous /4', content: <TabSync4 /> },
  { label: '/3 FSM', content: <TabDiv3 /> },
  { label: '/2 /3 dual-modulus', content: <TabDm23 /> },
  { label: 'programmable /4 /6', content: <TabProg46 /> },
  { label: 'MMD（behavioral）', content: <TabMmd /> },
  { label: 'phase selection（behavioral）', content: <TabPmux /> },
]

/* ------------------------------------------------------------------ 陌生電路練習：mystery.sv */
export function MysteryExercise() {
  return (
    <div className="panel">
      <p>
        下面這段 RTL 沒有註解、沒有說它除幾。先不要按模擬，自己做一次：state bit 有幾個？三條 next-state equation 是什麼？從 reset 000 逐 edge 推，state 序列與週期是多少？div_out = q2 的 duty 是多少？8 個 state 裡沒走到的那些會怎樣？
      </p>
      <Rtl block={R.RTL_JOHNSON} />
      <LogicDiagram schematic={S.johnsonSch} showValues={false} />
      <ul>
        <li>寫出 d0、d1、d2。</li>
        <li>從 000 逐 edge 列出 state，找出週期。</li>
        <li>div_out = q2 的除數與 duty。</li>
        <li>用「從任意 state 啟動」載入 010，看會發生什麼。這個電路需要 reset 嗎？為什麼？</li>
        <li>只改一行 RTL，讓所有 illegal state 都能回到主循環。</li>
      </ul>
      <DividerSimPanel netlist={M.johnson6} schematic={S.johnsonSch} title="mystery.sv（可從任意 state 啟動）" allowInitialState showDelayMode showPulseWidths windowCycles={12} />
      <details>
        <summary>顯示參考答案</summary>
        <div className="solution-box">
          <p>
            三個 flop、同一條 clk：d0 = NOT q2、d1 = q0、d2 = q1。這是一個 3-bit <Term zh="扭環計數器" en="Johnson / twisted-ring counter" />：每個 edge 把 q 往右移一格，最後一級反相回到第一級。
          </p>
          <p>
            從 000：d = (d2 d1 d0) = (0 0 1) → 001 → (0 1 1) → 011 → (1 1 1) → 111 → (1 1 0) → 110 → (1 0 0) → 100 → (0 0 0) → 000。六個 state，週期 <b>6T</b>。q2 在 111、110、100 三個 state 為 1 ⇒ high 3T、low 3T ⇒ <b>/6、duty 50%</b>——奇數個 flop 的 Johnson counter 天生 50% duty，這是它常用在 I/Q 產生的原因。
          </p>
          <p>
            主循環：{johnsonGraph.mainCycle.join(' → ')}。沒走到的 state：{johnsonGraph.nodes.filter((n) => !n.reachable).map((n) => n.state).join('、')}。代入方程式：010 → (1 0 1) = 101；101 → (0 1 0) = 010。<b>它們兩個互相循環，永遠回不到主循環</b>（lockup = {johnsonGraph.lockup.join('、')}）。所以這個電路的 reset 不只是決定相位——沒有 reset（或 reset 釋放太靠近 edge 落進 010），輸出會變成一個 /2 的錯誤波形（q2 在 010 / 101 之間 0、1 交錯）。
          </p>
          <div className="two-col">
            <StateDiagram {...graphToDiagram(johnsonGraph, 'clk↑')} title="mystery.sv：010 ↔ 101 是獨立的循環" width={320} height={260} />
            <StateDiagram {...graphToDiagram(johnsonFixedGraph, 'clk↑')} title="修正後：010 → 100、101 → 010 → 100" width={320} height={260} />
          </div>
          <p>修正只改 d0：</p>
          <Rtl block={R.RTL_JOHNSON_FIXED} title="mystery_fixed.sv（只改 d0）" />
          <p>
            怎麼想出來的：主循環六個 state 裡，(q1, q0) = (1, 0) 只出現在 110，而那時 q2 = 1、d0 本來就是 0，所以多加的 NOT(q1 AND NOT q0) 對主循環完全沒有影響；但 010 的 (q1, q0) 也是 (1, 0)，d0 被壓成 0 ⇒ 010 → 100，回到主循環。101 → 010 → 100 最多兩個 edge。engine 驗證：lockup = {johnsonFixedGraph.lockup.length ? johnsonFixedGraph.lockup.join('、') : '（空）'}。
          </p>
          <DividerSimPanel netlist={M.johnson6Fixed} options={{ initialState: { q2: 0, q1: 1, q0: 0 } }} title="mystery_fixed.sv：從 010 出發" allowInitialState showEquations={false} showMeasure={false} compact windowCycles={8} />
          <ModeContent level="engineer" title="timing：修正的代價">
            <p>
              原本每條 d 都只有 wire 或一個 inverter，critical path ≈ tCQ + tsetup（+ tINV）。修正後 d0 變成三輸入的 AND-NOT，多了約一個 complex gate 的延遲。若這是最高速的那一級，Fmax 會掉；另一個做法是保留原本的 d0，改用 reset synchronizer 保證永遠從 000 出發，把「self-recovering」的責任交給 reset。兩種都合理，取決於這一級的 slack。
            </p>
          </ModeContent>
        </div>
      </details>
    </div>
  )
}

/* ------------------------------------------------------------------ 小測驗 */
export const VERILOG_QUIZ: QuizQuestion[] = [
  {
    id: 'v1',
    type: 'single',
    prompt: '下列哪一行會產生一個 flop？',
    options: ['assign q0 = ~q0;', 'always_comb q0 = ~q0;', 'always_ff @(posedge clk) q0 <= ~q0;', 'wire q0 = ~q0;'],
    answer: 2,
    explanation: '只有 always_ff 裡的 <= 描述「在 edge 時把右邊抓進左邊」。其他三行都是組合邏輯，而且輸出用到自己，是組合迴圈（Bug Lab #4）。',
  },
  {
    id: 'v2',
    type: 'state',
    prompt: 'div3_fsm.sv 從 reset（state = 00）開始，經過 4 個 rising edge 之後 state（q1 q0）是多少？',
    answer: '01',
    width: 2,
    bitNames: ['q1', 'q0'],
    explanation: '00 → 01 → 10 → 00 → 01：週期 3，第 4 個 edge 之後回到 01。',
  },
  {
    id: 'v3',
    type: 'numeric',
    prompt: 'div_prog46.sv 在 sel = 1 時的除數 N 是多少？',
    answer: 6,
    explanation: 'n_max = 5，cnt 從 0 數到 5 共六個 state ⇒ N = n_max + 1 = 6。',
  },
  {
    id: 'v4',
    type: 'multiple',
    prompt: '下列哪些寫法會讓 RTL 模擬「看起來正常」但矽上出問題（timing 型 bug）？',
    options: ['assign div_out = clk & en;（en 由組合邏輯產生）', 'case 沒有 default 也沒寫 2\'b11', 'mod 從 flop 出來後經過 90 ps 的邏輯才到 cell（T = 100 ps）', 'if (cnt == 3\'d4) cnt <= 0;（想做 /4）'],
    answers: [0, 2],
    explanation: '組合 clock gating 的 runt 與 mod 到得太晚都是 zero-delay 模擬看不到的 timing 問題。缺 default 的 latch 與 off-by-one 是功能 / 結構問題，RTL 模擬（從 11 出發、或數 state）就能看到。',
  },
  {
    id: 'v5',
    type: 'single',
    prompt: 'Bug Lab #6（mod 到得太晚）在 STA 裡屬於哪一種檢查？',
    options: ['pulse-width check', 'hold check', 'setup check：launch = FF_SW、capture = FF1，可用時間一個 T', 'recovery / removal check'],
    answer: 2,
    explanation: '這是一條 register-to-register 的 control path：sw_r 在 edge k launch、FF1 在 edge k+1 capture d1 = q0 AND mod，arrival 108 ps > required 93 ps ⇒ setup violation。',
  },
  {
    id: 'v6',
    type: 'numeric',
    prompt: 'mmd.sv（STAGES = 2）在 p = 2\'b10（p1 = 1、p0 = 0）時的除數 N 是多少？',
    answer: 6,
    explanation: 'N = 4 + 2·p1 + p0 = 4 + 2 + 0 = 6。',
  },
  {
    id: 'v7',
    type: 'state',
    prompt: 'mystery.sv（Johnson counter，d0 = ~q2、d1 = q0、d2 = q1）從 000 開始，3 個 rising edge 之後 state（q2 q1 q0）是多少？',
    answer: '111',
    width: 3,
    bitNames: ['q2', 'q1', 'q0'],
    explanation: '000 → 001 → 011 → 111：每個 edge 把 1 往左推一格。',
  },
  {
    id: 'v8',
    type: 'single',
    prompt: 'ripple /4 用 assign div_out = q1 & ~q0 decode 出 pulse 再給下一級當 clock，為什麼下一級會多數一個 edge？',
    options: ['因為 AND 比 flop 慢', '因為 11 → 00 時 q0 先變、q1 後變，途中出現短暫的 10，decode 出一個 tCQ 寬的 runt', '因為 ripple counter 的除數本來就是 4', '因為 decode 少了 reset'],
    answer: 1,
    explanation: 'q1 的 clock 是 q0，所以 q1 一定比 q0 晚一個 tCQ；decode 邏輯忠實地把「路過」的 10 變成一個 8 ps 的 pulse，FF2 把它當成一個 rising edge。',
  },
]

/* ------------------------------------------------------------------ 頁面 */
export function VerilogPage() {
  const { progress, update } = useProgress()
  const p = progress[PROGRESS_KEY]
  const [labDone, setLabDone] = useState<{ done: number; correct: number; total: number }>({ done: p?.quizScore ?? 0, correct: 0, total: BUG_CASES.length })
  const onLabProgress = useCallback(
    (done: number, correct: number, total: number) => {
      setLabDone({ done, correct, total })
      update(PROGRESS_KEY, { quizScore: done, quizTotal: total })
    },
    [update],
  )
  const percent = Math.round((labDone.done / Math.max(1, labDone.total)) * 100)

  return (
    <article>
      <header className="lesson-head">
        <div className="eyebrow">Verilog 教學與 Bug Lab</div>
        <h1>從 RTL 讀出電路：Divider 的 SystemVerilog 與 Bug Lab</h1>
        <div className="en">Reading dividers as RTL, and a lab of eight classic bugs</div>
        <p className="muted">
          前面的課程用電路圖與 netlist 講 divider；這一頁用 SystemVerilog 再講一次同樣的電路。目標不是學語法，而是能在 RTL 裡看見 flop、next-state equation、state table 與 timing path——並且在八個「看起來很合理」的 bug 裡，先預測、再用逐 edge 模擬證明自己對或錯。
        </p>
        <div className="lesson-goals">
          <h3>這一頁要解決什麼問題</h3>
          <ul style={{ margin: 0 }}>
            <li>把 always_ff / always_comb / assign / case 一對一對應到 DFF、gate、state table 與 output decode。</li>
            <li>看懂 /2、synchronous /4、/3 FSM、/2 /3 dual-modulus、programmable /4 /6、MMD、8-phase selection 的 RTL，並能逐 edge 推出 state 序列與除數。</li>
            <li>分辨 synthesizable 與 behavioral 寫法、reset 的角色、以及 RTL 模擬看得到 / 看不到的 bug。</li>
            <li>對八個經典 bug（missing reset、incomplete case、lock-up、combinational loop、glitchy gating、MOD 太晚、off-by-one、runt pulse）能先預測、再驗證、再修正。</li>
          </ul>
          <div className="control-row" style={{ marginTop: '0.5em' }}>
            <span className="chip chip-ok">
              Bug Lab {labDone.done} / {labDone.total} 已完成
            </span>
            {p?.read ? <span className="chip chip-accent">已讀</span> : null}
            {p?.exerciseDone ? <span className="chip chip-accent">練習已完成</span> : null}
          </div>
          <div className="progress-bar">
            <span style={{ width: `${percent}%` }} />
          </div>
        </div>
      </header>

      <RtlMapping />

      <Section title="主要 divider 的 SystemVerilog" en="The main dividers in SystemVerilog">
        <p>
          七段 RTL，每段都用同一個 netlist 做逐 edge 模擬，讓你對照「這一行 RTL」與「這一條波形」。綠色標籤 = synthesizable，黃色 = behavioral。每一段的最後是這種寫法最常見的 bug；完整的案例在下面的 Bug Lab。
        </p>
        <Tabs tabs={RTL_TABS} />
      </Section>

      <Section title="Bug Lab：八個經典 bug" en="Bug Lab: eight classic bugs">
        <p>
          每個案例先給你設計者的意圖與有 bug 的 RTL。<b>先按一個預測</b>，才會看到模擬證據（bug-models.ts 的 netlist，都有 vitest 驗證）與修正後的版本。預測錯了沒關係——錯的那一題才是你要逐 edge 重推一次的那一題。
        </p>
        <Callout kind="method" title="每一題的推法">
          <ol style={{ margin: 0 }}>
            <li>找 always_ff：哪些是 state bit？reset 值是什麼？</li>
            <li>把每個 &lt;= 與 assign 寫成方程式；注意有沒有「沒指定」（latch）或「用到自己」（迴圈）。</li>
            <li>從 reset 逐 edge 推，再故意從 illegal state 推一次。</li>
            <li>最後問 timing：哪個訊號在 clock = 1 期間改變？哪條 control path 太長？</li>
          </ol>
        </Callout>
        <BugLab onProgress={onLabProgress} />
      </Section>

      <Section title="陌生電路分析練習：mystery.sv" en="Exercise: an unfamiliar RTL">
        <MysteryExercise />
        <div className="control-row">
          <label className="toggle">
            <input type="checkbox" checked={!!p?.exerciseDone} onChange={(e) => update(PROGRESS_KEY, { exerciseDone: e.target.checked })} />
            我已完成這個練習
          </label>
        </div>
      </Section>

      <section id="quiz" data-section="quiz">
        <h2>小測驗</h2>
        <QuizEngine questions={VERILOG_QUIZ} storageKey="verilog-quiz" onComplete={(score, total) => update('verilog-quiz', { quizScore: score, quizTotal: total })} />
        {progress['verilog-quiz']?.quizTotal ? (
          <div className="small muted">
            上次成績：{progress['verilog-quiz'].quizScore}/{progress['verilog-quiz'].quizTotal}
          </div>
        ) : null}
      </section>

      <div className="control-row" style={{ marginTop: '2em' }}>
        <label className="toggle">
          <input type="checkbox" checked={!!p?.read} onChange={(e) => update(PROGRESS_KEY, { read: e.target.checked })} />
          標記這一頁為已讀
        </label>
      </div>
      <nav className="lesson-nav">
        <Link to="/analyze" className="btn">
          ◀ 我有一個陌生 Divider（分析流程）
        </Link>
        <Link to="/lab" className="btn btn-primary">
          Reverse Engineering Lab ▶
        </Link>
      </nav>
    </article>
  )
}
