import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, Math, ModeContent, Section, Steps, Tabs, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { StateDiagram, graphToDiagram } from '@/components/circuit/StateDiagram'
import { buildStateGraph } from '@/models/divider/analysis'
import { dualMod23 } from '@/models/divider/examples'
import { T, T_AND, T_AND_MIN, T_CQ, T_HOLD, T_NOR, T_SETUP, dm23ModOnD0, dm23OutQ0, dm23OutQ1 } from './models'
import { dm23HlAndPath, dm23HlClock, dm23HlNorPath, dm23HlOut, dm23ModOnD0Schematic, dm23OutQ0Schematic, dm23OutQ1Schematic, dm23Schematic } from './schematics'
import { dm23Timing } from './timing'
import { ModTimingScan } from './Widgets'

// ---------------------------------------------------------------- 預先算好的 state graph（課文用；engine 產生，與波形一致）
const graphMod0 = buildStateGraph(dualMod23, { mod: 0 })
const graphMod1 = buildStateGraph(dualMod23, { mod: 1 })

/** 8 列真值表：由 engine 的 nextStateOf 驗證（見 models.test.ts） */
const truthRows: { mod: 0 | 1; state: string; d1: 0 | 1; d0: 0 | 1; next: string; out: 0 | 1; note: string }[] = [
  { mod: 0, state: '00', d1: 0, d0: 1, next: '01', out: 1, note: '主循環' },
  { mod: 0, state: '01', d1: 0, d0: 0, next: '00', out: 0, note: 'mod = 0 ⇒ d1 被 AND 鎖成 0，直接回 00' },
  { mod: 0, state: '10', d1: 0, d0: 0, next: '00', out: 0, note: '/2 mode 到不了；從 /3 切回來時會經過一次' },
  { mod: 0, state: '11', d1: 0, d0: 0, next: '00', out: 0, note: 'unused，一個 edge 回主循環' },
  { mod: 1, state: '00', d1: 0, d0: 1, next: '01', out: 1, note: '主循環' },
  { mod: 1, state: '01', d1: 1, d0: 0, next: '10', out: 0, note: 'mod = 1 ⇒ d1 = q0 = 1，繞路' },
  { mod: 1, state: '10', d1: 0, d0: 0, next: '00', out: 0, note: '主循環' },
  { mod: 1, state: '11', d1: 1, d0: 0, next: '10', out: 0, note: 'unused，一個 edge 回主循環' },
]

function Content() {
  return (
    <>
      <Section title="先用直覺想" en="Intuition">
        <p>
          上一課說 A 架構「共用 state」。這一課把它拆開看：這個 cell 本質上是 Lesson 2-1 的 /3 state machine（00 → 01 → 10 → 00），只是在 <b>state 01</b> 這個地方裝了一個叉路口——mod = 1 走原路繞經 10，mod = 0 抄捷徑直接回 00。
        </p>
        <p>
          想像一條跑道，中途有一段可選的繞路。你只在<b>叉路口</b>那一刻看路牌（mod）；跑在其他地方時，路牌上寫什麼都沒有差。所以「mod 什麼時候換」的問題，其實是「mod 在我到叉路口之前有沒有換好」。
        </p>
        <Callout kind="idea">
          state machine 的 control input 不是「隨時都在被看」。它只在某些 state 進入 next-state equation。找出<b>哪個 state、哪個 gate</b>用到它，就找到了它的 timing deadline。
        </Callout>
      </Section>

      <Section title="Gate-level 電路與 state bits" en="The circuit">
        <LogicDiagram schematic={dm23Schematic} showValues={false} />
        <ul>
          <li>
            <b>Clock</b>：<span className="mono">clk</span>，兩個 flop 共用，rising edge 觸發。
          </li>
          <li>
            <b>Memory elements</b>：FF0 的 Q 是 <span className="mono">q0</span>（LSB），FF1 的 Q 是 <span className="mono">q1</span>（MSB）。state 寫成 q1 q0。
          </li>
          <li>
            <b>Feedback paths</b>：q0 → NOR → d0；q1 → NOR → d0；q0 → AND → d1。
          </li>
          <li>
            <b>Control input</b>：<span className="mono">mod</span> → AND → d1。它不經過 NOR，也不進 FF0。
          </li>
          <li>
            <b>Output decode</b>：div_out = NOR(q1, q0)，與 d0 是同一個 gate 的輸出：state 00 時為 1。
          </li>
        </ul>
        <Math block>{'d_0 = \\overline{q_1 + q_0},\\qquad d_1 = q_0 \\cdot mod,\\qquad div\\_out = \\overline{q_1 + q_0} = d_0'}</Math>
        <p>
          先只看 d1 = q0·mod 這一條。q0 = 0 時，不管 mod 是什麼，d1 = 0。q0 = 1（state 01 或 11）時，d1 = mod。所以 mod <b>只在 q0 = 1 的那個 cycle 有作用</b>——這就是叉路口。
        </p>
      </Section>

      <Section title="真值表：8 列" en="Truth table">
        <p>
          把 mod 當成第三個輸入，state 只有 2 個 bit，總共 2 × 4 = 8 列。這張 <Term zh="真值表" en="truth table" /> 是 gate-level 電路與 state diagram 之間的橋：自己先填 d1、d0，再對答案：
        </p>
        <div className="scroll-x">
          <table className="state-table">
            <thead>
              <tr>
                <th>mod</th>
                <th>q1 q0</th>
                <th>d1 = q0·mod</th>
                <th>d0 = NOR(q1, q0)</th>
                <th>next（q1 q0）′</th>
                <th>div_out</th>
                <th style={{ fontFamily: 'var(--font)' }}>備註</th>
              </tr>
            </thead>
            <tbody>
              {truthRows.map((r) => (
                <tr key={`${r.mod}-${r.state}`}>
                  <td>{r.mod}</td>
                  <td>
                    <b>{r.state}</b>
                  </td>
                  <td>{r.d1}</td>
                  <td>{r.d0}</td>
                  <td>
                    <b>{r.next}</b>
                  </td>
                  <td className={r.out ? 'value-1' : 'value-0'}>{r.out}</td>
                  <td style={{ fontFamily: 'var(--font)' }} className="small muted">
                    {r.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          兩張表只有<b>一列不同</b>：state 01。mod = 0 時 01 → 00，mod = 1 時 01 → 10。其他六列（含 unused 的 11）與 mod 無關。
        </p>
      </Section>

      <Section title="逐一個 clock edge 操作" en="Edge by edge">
        <p>
          先 mod = 0 按 4 次，觀察 00 ↔ 01；Reset 後把 mod 切成 1 再按 6 次，觀察 00 → 01 → 10。每一步在按之前先說出 d1、d0。切到「實際 delay」可以看到 q0、q1 在 edge 後 {T_CQ} ps 才變，d0 再晚 {T_NOR} ps、d1 再晚 {T_AND} ps。
        </p>
        <DividerSimPanel netlist={dualMod23} schematic={dm23Schematic} title="/2 /3 cell：逐 edge" showDelayMode showPulseWidths />
        <Steps
          items={[
            <>
              <b>mod = 0</b>：00（d1 d0 = 01）→ 01（d1 d0 = 00）→ 00 → 01 → 00。週期 2 個 edge。div_out 只在 00 為 1：rising edge 在 2T、4T、6T，<b>interval 2T</b>，high 1T / low 1T ⇒ duty 50%。
            </>,
            <>
              <b>mod = 1</b>：00（01）→ 01（<b>10</b>）→ 10（00）→ 00。週期 3 個 edge。rising edge 在 3T、6T、9T，<b>interval 3T</b>，high 1T / low 2T ⇒ duty 1/3。
            </>,
            <>
              <b>在 state 00 或 10 時切 mod</b>：這一步的 d1 = q0·mod = 0·mod = 0，next state 與 mod 無關——切了等於沒切，要等下一次到 01 才算數。
            </>,
            <>
              <b>在 state 01 時切 mod</b>：這一步的 d1 直接跟著 mod，下一個 edge 就決定走 10 還是 00。這是唯一「有感」的時刻。
            </>,
          ]}
        />
      </Section>

      <Section title="State diagram 與 unused state" en="State diagrams">
        <p>
          兩種 mode 各畫一張（由 engine 的 buildStateGraph 產生）。留意 11 在兩張圖裡都是 unreachable，但都會在一個 edge 內回到主循環——沒有 <Term zh="鎖死狀態" en="lock-up state" />（進得去、出不來的 state；變體 3 的練習就會遇到一個）：
        </p>
        <div className="two-col">
          <StateDiagram {...graphToDiagram(graphMod0, 'clk↑')} title="mod = 0：主循環 00 → 01（/2）" width={300} height={230} />
          <StateDiagram {...graphToDiagram(graphMod1, 'clk↑')} title="mod = 1：主循環 00 → 01 → 10（/3）" width={300} height={230} />
        </div>
        <p>
          mod = 0 的圖裡 10 也是 unreachable——但它不是 unused：從 /3 切回 /2 時，state 可能正好在 10，下一個 edge 走 10 → 00，仍在主循環上。這就是為什麼 1 → 0 的切換永遠不會出問題：10 的下一個 state 不看 mod。
        </p>
      </Section>

      <Section title="Output edge interval 與 duty" en="Interval and duty">
        <p>
          設輸入週期 <Math>{'T_{in}'}</Math>（ps），mode 的瞬時除數 <Math>{'N \\in \\{2, 3\\}'}</Math>。每個 state 停留一個 <Math>{'T_{in}'}</Math>，主循環有 N 個 state，div_out 只在其中一個（00）為 1：
        </p>
        <Math block>{'T_{out} = N\\,T_{in},\\qquad t_{high} = T_{in},\\qquad D = \\frac{t_{high}}{T_{out}} = \\frac{1}{N} = \\begin{cases} 50\\% & N = 2 \\\\ 33.3\\% & N = 3 \\end{cases}'}</Math>
        <p>
          <Math>{'T_{out}'}</Math>：輸出週期（ps）；<Math>{'t_{high}'}</Math>：輸出 high 時間（ps）；<Math>{'D'}</Math>：duty cycle。與輸入 duty 無關（輸出只在 rising edge 改變）。
        </p>
        <Callout kind="warning" title="duty 會隨 mode 改變">
          /3 mode 不是 50%，而且 /2 與 /3 的 duty 不一樣。後面接的東西（PFD、下一級 divider、retimer）只能用 <b>rising edge</b>，不能依賴 high / low 的寬度。若一定要 50%，要在後面再加 /2（Lesson 2-2）。
        </Callout>
      </Section>

      <Section title="MOD 什麼時候被用到、最晚何時要穩定" en="When MOD is sampled: the control-path deadline">
        <p>
          回到叉路口。mod 不是 data path 上的訊號，而是一條 <Term zh="控制路徑" en="control path" />：它只透過 d1 = q0·mod 進入 flop，而 q0 = 1 只發生在 state 01 的那個 cycle。所以：<b>結束 state-01 cycle 的那個 rising edge，就是 mod 的 capture edge</b>。它前面的 <Term zh="設定窗（禁區）" en="setup window" /> 就是 mod 的 deadline。
        </p>
        <p>
          用具體數字（T = {T} ps、tCQ = {T_CQ}、tAND = {T_AND_MIN}–{T_AND}、tsetup = {T_SETUP}、thold = {T_HOLD} ps）：假設 state 在 edge 3 之後是 01，capture edge 是 edge 4（t = 400 ps）。設 mod 在 <Math>{'t_{mod}'}</Math> 改變，d1 在 <Math>{'t_{mod} + t_{AND}'}</Math> 到達 FF1.D：
        </p>
        <Math block>{'t_{mod} + t_{AND,max} \\le t_{cap} - t_{setup} \\quad\\Rightarrow\\quad t_{mod} \\le t_{cap} - t_{setup} - t_{AND,max} = 400 - 7 - 10 = 383\\ \\text{ps}'}</Math>
        <Math block>{'t_{mod} + t_{AND,min} \\ge t_{cap} + t_{hold} \\quad\\Rightarrow\\quad t_{mod} \\ge t_{cap} + t_{hold} - t_{AND,min} = 400 + 3 - 7 = 396\\ \\text{ps}'}</Math>
        <p>
          <Math>{'t_{cap}'}</Math>：capture edge 時間（ps）；<Math>{'t_{setup}, t_{hold}'}</Math>：FF1 的 setup / hold（ps）；<Math>{'t_{AND,max/min}'}</Math>：AND 的最大 / 最小延遲（ps）。第一條是「趕上這一班」的條件，第二條是「確定搭下一班、而且不會在門縫被夾到」的條件。383 到 396 ps 之間是禁區。
        </p>
        <p>拖曳下面的 τ（相對 edge 4 的切換時間），看三種結果：</p>
        <ModTimingScan />
        <Steps
          items={[
            <>
              <b>很早切（τ = −40：t = 360）</b>：d1 在 370 ps 到達，比 deadline 383 早。edge 4 抓到 1 ⇒ 01 → 10 ⇒ edge 5 回到 00。output edge 220 → 520：<b>這一段就是 3T</b>。
            </>,
            <>
              <b>剛好趕上（τ = −17：t = 383）</b>：d1 在 393 到達，距離 edge 4 正好 7 ps = tsetup。理論上趕上，但 margin 是 0——jitter 一來就掉進禁區。真正的設計要再扣 jitter 與 margin。
            </>,
            <>
              <b>太晚（τ = +10：t = 410）</b>：d1 在 420 才變，edge 4 早就過了（而且超過 hold window，所以不是 violation，只是沒趕上）。edge 4 抓到舊的 0 ⇒ 01 → 00 ⇒ 這一段仍是 2T（220 → 420）；mod 已經是 1，下一次到 01（edge 5 → 6）才繞路：<b>420 → 720 是 3T</b>。整體序列 2T, 3T——比預期少了一個 3T。在 fractional-N 裡這是一次除數錯誤，會直接變成 phase error。
            </>,
            <>
              <b>禁區（τ = −10：t = 390）</b>：d1 在 397–400 之間變，落在 setup window（393–400）裡。FF1 可能抓到 0、抓到 1、或進入 <Term zh="亞穩態" en="metastability" />（波形上 q1 與 div_out 畫成虛線）。q1 一旦不確定，NOR 算出的 d0 也不確定，整個 state 可能跑進 11 或亂掉一個 cycle。
            </>,
          ]}
        />
        <Callout kind="method" title="找任何 control input 的 deadline：固定四步">
          <ol style={{ margin: 0 }}>
            <li>找出 control input 進入哪個 gate、最後到哪個 flop 的 D（這裡：mod → AND → FF1.D）。</li>
            <li>找出哪個 state 讓那個 gate 對 control 敏感（這裡：q0 = 1，即 state 01）。</li>
            <li>結束那個 state 的 rising edge 就是 capture edge。</li>
            <li>deadline = capture edge − tsetup − Σ(gate delay) − jitter − margin；若 control 來自另一個 flop，再減掉它的 tCQ 與 routing。</li>
          </ol>
        </Callout>
        <ModeContent level="engineer" title="把它寫成一條 setup path">
          <p>
            mod 若由同一個 clk 的前級 flop（controller）送出，這條路徑就是普通的 register-to-register setup path，只是 launch 與 capture 在不同的 flop：
          </p>
          <Math block>{'t_{CQ,ctrl} + t_{route} + t_{AND,max} + t_{setup} + t_{jitter} + t_{margin} \\le T_{in}'}</Math>
          <p>
            代入 tCQ,ctrl = 8、routing = 12、AND = 10、tsetup = 7、jitter = 2、margin = 2：arrival = 30 ps，required = 100 − 11 = 89 ps，<b>slack = 59 ps</b>。controller 離 cell 越遠（routing 越長），slack 越少；這是 MMD 裡 modulus control 常成為瓶頸的原因（Lesson 4-2）。
          </p>
          <p>
            <b>multicycle 的機會</b>：如果 controller 保證只在 state 00 的 cycle 改變 mod（例如它看著 div_out 的 rising edge 才更新），那 mod 到 FF1.D 實際上有 2 個 cycle 可以用（00 → 01 → capture）。STA 要另外宣告 multicycle path，否則會用 1 個 cycle 檢查而報假 violation——或反過來，你以為有 2 個 cycle 但 controller 其實在 01 才更新，那就真的少一個 3T。
          </p>
        </ModeContent>
        <ModeContent level="deep" title="高速實作會遇到的事">
          <ul>
            <li>
              <b>mod 跨 clock domain</b>：fractional-N 的 DSM 通常跑在 divider 輸出（慢很多）的 domain，mod 回到高速 cell 時是跨 domain 訊號。它的改變時刻相對 clk 是任意的，一定會有某些 cycle 落在禁區——必須先用 clk 重新 retime（一個 flop，代價是 mod 晚一個 cycle 才生效，controller 要提早一個 interval 發出），或保證 mod 只在 div_out 的某個 edge 之後改變（讓 divider 自己的輸出當 controller 的 clock，等於把 deadline 綁在 state 00 的 cycle 上）。
            </li>
            <li>
              <b>Metastable 的傳播</b>：FF1 metastable 時 q1 停在中間電位；NOR 的另一個輸入 q0 也在變，d0 可能在下一個 edge 前還沒穩定 ⇒ FF0 也 metastable。兩個 bit 同時不確定，state 可能落在 11（這裡一個 edge 就回來）或多跳一個 state。在 CML 裡 regeneration time constant 小，這個窗口只有幾 ps，但在 20 GHz 幾 ps 就是 10% 的 period。
            </li>
            <li>
              <b>AND 合併進 latch</b>：CML 實作常把 d1 = q0·mod 做成 FF1 master latch 的 current-steering 輸入（mod 控制尾電流的分配），沒有獨立的 AND；此時 tAND ≈ 0，但 mod 的 input capacitance 直接掛在 latch 上，routing 的 RC 成為主要延遲。
            </li>
            <li>
              <b>Hold 那一側</b>：mod 若在 capture edge 後太快改變（396 ps 之前），FF1 可能抓到新值的一部分。這在「mod 由前級 flop 送出、routing 很短」時反而容易發生——min delay 太小。hold 與 period 無關，提高頻率不會讓它變好。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="這個架構的 critical path：隨 mode 改變" en="Critical paths, per mode">
        <p>
          兩個 flop、兩個 gate，候選路徑不多，但<b>哪些路徑「存在」取決於 mode</b>。把某個訊號固定成 0 或 1、再把不會有 transition 的路徑剪掉，這個做法叫 <Term zh="情況分析" en="case analysis" />（在 STA 工具裡就是 <span className="mono">set_case_analysis</span>）。用 explorer 的 Mode 按鈕切換，逐步走過每一條：
        </p>
        <CriticalPathExplorer scenario={dm23Timing} guided />
        <Callout kind="method" title="讀 explorer 的結果（T = 100 ps）">
          <ul style={{ margin: 0 }}>
            <li>
              <b>mod = 0</b>：只有 FF0.Q → NOR → FF0.D。q1 永遠是 0，FF1 永遠不 toggle，q1 → NOR 與 q0 → AND → FF1.D 這兩條線上沒有任何 transition——STA 的 case analysis 會把它們剪掉。arrival = 8 + 12 = 20 ps；T<sub>clk,min</sub> = 20 + 7 + 2 + 2 = <b>31 ps</b>。
            </li>
            <li>
              <b>mod = 1</b>：多出 FF1.Q → NOR → FF0.D（同樣 20 ps）與 FF0.Q → AND → FF1.D（8 + 10 = 18 ps，T<sub>clk,min</sub> = 29 ps）。最差的仍是 NOR 那兩條，但現在有兩個 launch point。
            </li>
            <li>
              <b>mod 切換中</b>：多出 mod → AND → FF1.D 的 control path。它不限制 Fmax（slack 59 ps），限制的是「mod 最晚何時要穩定」。
            </li>
            <li>
              <b>hold</b>：FF1.Q → NOR → FF0.D 的 min delay = 5 + 8 = 13 ps ≥ thold = 3 ps。安全，但如果為了省 gate 把 NOR 拿掉、用 Q̄ 直接接，min delay 只剩 5 ps。
            </li>
            <li>
              <b>output decode</b>：FF.Q → NOR → div_out 沒有 capture flop，是 latency（20 ps），不是 setup path。
            </li>
          </ul>
        </Callout>
        <Callout kind="warning" title="critical path 隨 mode 改變，timing 報告也要分 mode 看">
          在 mod = 0 下 sign-off，AND 那條路徑根本沒被檢查；在 mod = 1 下 sign-off，又看不到 mod 本身的 deadline。divider 的 timing 一定要對每一種 mode（含切換中）各跑一次 case analysis，而不是拿最長的那條 wire 當 critical path。
        </Callout>
        <ModeContent level="engineer" title="Timing equations">
          <Math block>{'T_{clk,min}\\big|_{NOR} = t_{CQ,max} + t_{NOR,max} + t_{setup} + t_{jitter} + t_{margin} = 8 + 12 + 7 + 2 + 2 = 31\\ \\text{ps}'}</Math>
          <Math block>{'T_{clk,min}\\big|_{AND} = t_{CQ,max} + t_{AND,max} + t_{setup} + t_{jitter} + t_{margin} = 8 + 10 + 7 + 2 + 2 = 29\\ \\text{ps}\\ (\\text{只在 } mod = 1)'}</Math>
          <Math block>{'t_{CQ,min} + t_{NOR,min} = 5 + 8 = 13\\ \\text{ps} \\ge t_{hold} = 3\\ \\text{ps}'}</Math>
          <p>
            變數：<Math>{'t_{CQ}'}</Math> clock edge 到 Q 穩定；<Math>{'t_{NOR}, t_{AND}'}</Math> gate 傳播延遲；<Math>{'t_{setup}, t_{hold}'}</Math> capture flop 的要求；<Math>{'t_{jitter}'}</Math> 相鄰 edge 間隔的不確定量；<Math>{'t_{margin}'}</Math> 設計裕度。單位皆為 ps。skew 在這裡 ≈ 0（兩個 flop 用同一條 clock 線，同一個 buffer）。
          </p>
        </ModeContent>
        <ModeContent level="deep" title="Decode glitch：NOR 同時是 d0 也是輸出">
          <p>
            01 → 10 這一步，q0 落下、q1 升起發生在同一個 edge 之後。若 FF0 的 tCQ 比 FF1 短一點，NOR 會先看到 00 幾 ps，輸出冒出一個窄 pulse，然後才看到 10 回到 0。對 d0 來說這沒關係（下一個 edge 前會穩定），但 div_out 直接送出去就是 glitch。高速設計通常把輸出再用一個 flop register 起來（多一個 cycle latency，但 edge 只由 tCQ 決定），或直接拿某個 flop 的 Q 當輸出——練習題就是這個選擇的後果。
          </p>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>以為 mod 是同步訊號就可以隨時換</b>：它有 capture edge（state-01 cycle 的結束）與 deadline。晚了就少一個 3T；落在禁區就 metastable。
            </li>
            <li>
              <b>以為切了 mod 這一段就立刻變 3T</b>：在 00 或 10 時切，要等下一次到 01 才生效。預測 interval 時要先找 state。
            </li>
            <li>
              <b>假設 /3 mode 有 50% duty</b>：這裡是 1/3；而且 /2 與 /3 的 duty 不同，下游只能用 edge。
            </li>
            <li>
              <b>把 output decode 當成 setup critical path</b>：NOR → div_out 沒有 capture flop，它是 latency 與 glitch 的問題。
            </li>
            <li>
              <b>只在一種 mode 做 timing sign-off</b>：AND 路徑只在 mod = 1 被 sensitize，mod 的 deadline 只在切換時存在。
            </li>
            <li>
              <b>忽略 unused state</b>：這個 cell 的 11 會回來；但只要把 NOR 換成別的 decode（例如 XNOR），11 就可能 lock-up（Lesson 2-1）。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="SystemVerilog（synthesizable，含 mod 的 retime 選項）">
          <CodeBlock
            title="dm23_cell.sv"
            code={`
module dm23_cell #(parameter bit RETIME_MOD = 1'b0) (
  input  logic clk,
  input  logic rst_n,
  input  logic mod_in,      // 0: /2, 1: /3（可能來自較慢的 controller）
  output logic div_out
);
  logic q0, q1, mod;

  // 選配：先用 clk 重新取樣 mod，把 routing 從 deadline 裡拿掉（代價：晚一個 cycle 生效）
  generate
    if (RETIME_MOD) begin : g_retime
      always_ff @(posedge clk or negedge rst_n)
        if (!rst_n) mod <= 1'b0; else mod <= mod_in;
    end else begin : g_direct
      assign mod = mod_in;
    end
  endgenerate

  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) {q1, q0} <= 2'b00;
    else begin
      q0 <= ~(q1 | q0);         // d0 = NOR(q1, q0)
      q1 <= q0 & mod;           // d1 = q0 AND mod：只在 state 01 看 mod
    end
  end
  assign div_out = ~(q1 | q0);  // state 00 時為 1；若要避免 decode glitch 可再 register 一次
endmodule
`}
            note="RETIME_MOD = 1 時 mod → AND → FF1.D 變成 local 的 flop-to-flop path（slack 由 tCQ + tAND 決定），但 controller 必須提早一個 cycle 送出 mod。"
          />
        </ModeContent>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------- 練習：改輸出 decode 的變體
function ExerciseComponent() {
  return (
    <Tabs
      tabs={[
        {
          label: '變體 1：div_out = q1',
          content: <DividerSimPanel netlist={dm23OutQ1} schematic={dm23OutQ1Schematic} title="div_out = q1" showEquations={false} showPulseWidths compact />,
        },
        {
          label: '變體 2：div_out = q0',
          content: <DividerSimPanel netlist={dm23OutQ0} schematic={dm23OutQ0Schematic} title="div_out = q0" showEquations={false} showPulseWidths compact />,
        },
        {
          label: '變體 3（深入）：mod 改控制 d0',
          content: <DividerSimPanel netlist={dm23ModOnD0} schematic={dm23ModOnD0Schematic} title="d1 = q0，mod 進入 d0 的邏輯" showEquations={false} showPulseWidths allowInitialState compact />,
        },
      ]}
    />
  )
}

const lesson: LessonDef = {
  id: 'm3-l2-dm-cell',
  module: 3,
  order: 2,
  title: '/2 /3 Cell 的 State Analysis',
  titleEn: 'State analysis of the /2 /3 cell',
  summary: 'gate-level 電路、q1 q0 兩個 state bit、d1 = q0·mod 的叉路口、8 列真值表、兩種 mode 的 state diagram；MOD 只在 state 01 被用到，所以它的 deadline 是那個 cycle 的 capture edge − tsetup − tAND；critical path 隨 mode 改變。',
  goals: [
    '從 gate-level 電路寫出 d0 = NOR(q1, q0)、d1 = q0·mod，填出 8 列真值表，指出兩種 mode 只差一列。',
    '逐 edge 驗證 mod = 0 的 00 → 01 與 mod = 1 的 00 → 01 → 10，推導 interval 2T / 3T 與 duty 50% / 33%。',
    '說出 mod 只在 state 01 的 cycle 被用到，並算出 deadline = capture edge − tsetup − tAND 與 hold 邊界。',
    '分辨「很早切」「太晚切」「落在禁區」三種結果各自對 interval 序列的影響。',
    '用 mode 切換看 critical path 如何改變：NOR 回授、AND 路徑（只在 mod = 1）、mod 的 control path、hold path。',
  ],
  readingMinutes: 40,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'state',
      prompt: '從 reset（00）開始，mod = 1 維持到 edge 3 結束，之後 mod = 0（在 edge 4 之前生效）。經過 5 個 rising edge 之後 state（q1 q0）是多少？',
      answer: '00',
      width: 2,
      bitNames: ['q1', 'q0'],
      explanation: 'mod = 1：00 → 01 → 10 → 00（edge 1–3）。edge 4 時 state 00，d1 d0 = 01 ⇒ 01。edge 5 時 state 01 且 mod = 0 ⇒ d1 = 0，回 00。序列 01, 10, 00, 01, 00。',
    },
    {
      id: 'q2',
      type: 'critical-path',
      prompt: 'mod 固定為 0（/2 mode）時，哪一條是決定 Fmax 的 setup critical path？',
      schematic: dm23Schematic,
      options: [
        { label: 'FF0.Q → NOR → FF0.D', highlight: dm23HlNorPath, description: 'launch edge k、capture edge k+1，經過 NOR' },
        { label: 'FF0.Q → AND → FF1.D', highlight: dm23HlAndPath, description: '經過 AND 到 FF1' },
        { label: 'clk → FF0 / FF1 的 clock 走線', highlight: dm23HlClock, description: '圖上最長的線' },
        { label: 'NOR → div_out 輸出走線', highlight: dm23HlOut, description: '輸出 decode' },
      ],
      answer: 0,
      explanation: 'mod = 0 時 AND 輸出恆 0，q0 的變化傳不到 FF1.D：那條路徑沒有被 sensitize，STA 的 case analysis 會剪掉它。clock 走線沒有 capture flop 的 setup 要求；輸出走線是 latency。只剩 FF0.Q → NOR → FF0.D，arrival 20 ps。',
    },
    {
      id: 'q3',
      type: 'numeric',
      prompt: 'state 01 的 cycle 由 t = 400 ps 的 rising edge 結束。tsetup = 7 ps、tAND,max = 10 ps（先不計 jitter 與 margin）。mod 最晚必須在 t = ? ps 穩定，這一段才會是 3T？',
      answer: 383,
      unit: 'ps',
      explanation: 'deadline = capture edge − tsetup − tAND = 400 − 7 − 10 = 383 ps。d1 要在 393 ps 前到達 FF1.D。再扣 jitter 2 與 margin 2，實務上是 379 ps。',
    },
    {
      id: 'q4',
      type: 'single',
      prompt: '同樣的情境（capture edge 400 ps、thold = 3 ps、tAND = 7–10 ps），mod 在 t = 410 ps 才由 0 變 1。會發生什麼事？',
      options: [
        'edge 4 仍抓到 1，這一段是 3T',
        'hold violation，FF1 進入 metastable',
        'edge 4 抓到舊的 0，這一段仍是 2T；下一次到 state 01 的 cycle 才變 3T',
        'mod 被忽略，直到下一次 reset',
      ],
      answer: 2,
      explanation: 'd1 在 417–420 ps 才變，比 capture edge 晚超過 thold（403 ps），所以 edge 4 乾淨地抓到 0：01 → 00，這一段 2T。mod 現在是 1，下一次進入 01（edge 5 → 6）就會繞路：序列 2T, 3T。少了一個 3T，不是 metastable。',
    },
    {
      id: 'q5',
      type: 'multiple',
      prompt: '哪些路徑只有在 mod = 1 時才會被 sensitize（mod = 0 時線上沒有 transition）？',
      options: ['FF1.Q → NOR → FF0.D', 'FF0.Q → AND → FF1.D', 'FF0.Q → NOR → FF0.D', 'clk → FF1.clk'],
      answers: [0, 1],
      explanation: 'mod = 0 時 d1 恆 0、q1 恆 0：FF1 不 toggle，q1 那條線沒有 transition；AND 輸出被鎖住，q0 的變化傳不過去。FF0.Q → NOR → FF0.D 兩種 mode 都在動；clock 走線不是 data path。',
    },
    {
      id: 'q6',
      type: 'single',
      prompt: 'mod = 1 時 div_out（= NOR(q1, q0)）的 duty cycle 是多少？',
      options: ['50%', '33.3%', '66.7%', '取決於輸入 clock 的 duty'],
      answer: 1,
      explanation: '主循環 00 → 01 → 10，只有 00 時輸出為 1：high 1T / 週期 3T = 1/3。輸出只在 rising edge 改變，與輸入 duty 無關。',
    },
    {
      id: 'q7',
      type: 'state',
      prompt: '若 state 因為 metastable 跑進 11，而 mod = 1。下一個 rising edge 之後 state（q1 q0）是多少？',
      answer: '10',
      width: 2,
      bitNames: ['q1', 'q0'],
      explanation: '11 時 d1 = q0·mod = 1·1 = 1，d0 = NOR(1, 1) = 0 ⇒ 10，已回到 /3 的主循環。mod = 0 時則是 00。兩種 mode 都沒有 lock-up。',
    },
    {
      id: 'q8',
      type: 'single',
      prompt: 'mod 在 t = 390 ps 由 0 變 1（capture edge 400 ps、tAND = 7–10 ps、tsetup = 7 ps）。這屬於哪一種情況？',
      options: ['安全，這一段是 3T', 'setup window 內改變，FF1 可能 metastable', 'hold violation', '確定抓到 0，這一段是 2T'],
      answer: 1,
      explanation: 'd1 在 397–400 ps 到達，落在 setup window（393–400 ps）之內。結果可能是 0、1 或 metastable；後者會讓 q1、進而 d0 與整個 state 不確定。這是 control path 的 setup 問題，不是 hold。',
    },
  ],
  exercise: {
    title: '改輸出 decode 的變體：phase continuity 與 duty',
    prompt: (
      <>
        <p>
          下面三個變體都保留 d0 = NOR(q1, q0)、d1 = q0·mod 的 next-state logic（變體 3 例外），只改輸出的取法。<b>先不要按模擬</b>，用這一課的方法推：
        </p>
        <ol>
          <li>
            <b>變體 1：div_out = q1。</b>mod = 1 時輸出在哪個 state 為 1？rising edge 的 interval 與 duty？mod = 0 時呢——q1 會不會變 1？這個變體還能當 /2 /3 用嗎？
          </li>
          <li>
            <b>變體 2：div_out = q0。</b>兩種 mode 各自的 interval 與 duty？mod 在 edge 4 之前變 1、edge 10 之前變回 0，interval 序列是什麼？和原版（NOR decode）比，output edge 早或晚多少？phase 還連續嗎？它有沒有 decode glitch 的風險？
          </li>
          <li>
            <b>變體 3（深入）：d1 = q0，mod 改成進 d0 的邏輯：d0 = NOR(q1, q0) + mod̄·q1。</b>兩種 mode 的主循環各是什麼？mod 現在在哪個 state 被用到？有沒有 lock-up state（用「從任意 state 啟動」載入 11 試試）？
          </li>
        </ol>
        <p>推完再按模擬對答案。變體 1 與 2 的 interval 序列都在 models.test.ts 用 simulate() 驗證過。</p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: ['變體 1：寫出兩種 mode 的輸出序列，說明為什麼 /2 mode 沒有輸出', '變體 2：寫出切換時的 interval 序列（2, 3, 3, 2, 2, 2）與 duty', '說出 output decode 應取自哪些 state 才能兩種 mode 都有 edge', '變體 3：畫出 mod = 0 的 state graph，標出 transient 與 lock-up', '變體 3：指出 mod 的 capture edge 換到了哪個 state 的 cycle'],
    answer: (
      <>
        <p>
          <b>變體 1（div_out = q1）</b>：mod = 1 時 q1 只在 state 10 為 1 ⇒ rising edge 在 2T、5T、8T，interval 3T，duty 1/3——/3 正常。但 mod = 0 時 state 只在 00 ↔ 01 之間，<b>q1 永遠是 0，輸出一個 edge 都沒有</b>（量測列顯示沒有 rising edge）。切換序列（mod = 1 於 edge 4–9）只有 4T、7T 兩個 edge，其餘時間輸出是平的。結論：output decode 必須取自<b>兩種 mode 都會經過的 state</b>（00 或 01），不能取只有 /3 才到的 10。
        </p>
        <p>
          <b>變體 2（div_out = q0）</b>：q0 在 state 01 為 1。mod = 0：rising edge 1T、3T、5T（interval 2T，duty 50%）；mod = 1：1T、4T、7T（interval 3T，duty 1/3）。切換序列（mod = 1 於 edge 4–9）：rising edge 在 <b>1T, 3T, 6T, 9T, 11T, 13T, 15T</b>——7 個 edge 才數得出 6 個 interval ⇒ <b>2, 3, 3, 2, 2, 2</b>。phase 仍然連續，因為 01 是兩條迴圈共用的 state。而且 q0 是 flop 的 Q 直接輸出，沒有 NOR decode 的 01 → 10 glitch 風險——代價是輸出不再「reset 時為 1」。
        </p>
        <p>
          <b>和原版對照時會看到的差異</b>：原版（div_out = NOR(q1, q0)）在 reset 的 state 00 當下就已經是 high，而 <span className="mono">measureDivide</span> 只數 rising edge，<b>t = 0 的那個 high 不算</b>。所以同一組 mod 序列下，原版量到的 rising edge 是 2T, 5T, 8T, 10T, 12T, 14T, 16T，chip 列顯示 <b>3, 3, 2, 2, 2, 2</b>：開頭那一段 2T（0T → 2T）沒有被算進去。把 reset 當下那個 high 補回來（0T, 2T, 5T, 8T, …），兩者其實是<b>同一串</b> 2, 3, 3, 2, 2, 2，只是變體 2 的每個 edge 整體晚一個 T<sub>in</sub>（原版在進入 00 時升起、這裡在進入 01 時升起）。對照模擬器時看到兩邊 chip 列不一樣，是這個量測慣例造成的，不是你推錯。
        </p>
        <p>
          <b>變體 3（mod 進 d0）</b>：mod = 1 時 d0 = NOR(q1, q0) ⇒ 00 → 01 → 10 → 00，/3 不變。mod = 0 時 d0 = NOR(q1, q0) + q1：00 → 01 → 10 → <b>01</b> → 10 …主循環變成 01 ↔ 10（/2，q0 輸出 50%），00 只是從 reset 出發的 transient。mod 現在只在 q1 = 1（state 10）時被用到，所以它的 capture edge 換成 state-10 cycle 的結束；而且 AOI 有三個輸入、delay 14 ps，deadline 比原版緊 4 ps。最嚴重的是 <b>11 變成 lock-up</b>：d1 = q0 = 1，d0 = NOR(1, 1) + 1·1 = 1 ⇒ 11 → 11，永遠出不來（engine 的 state graph 標成 lock-up）。切換時 interval 仍只有 2T / 3T，但一次 metastable 就可能把整個 divider 鎖死——這就是「換一個 next-state 實作，unused state 的命運也跟著換」。
        </p>
      </>
    ),
  },
}
export default lesson
