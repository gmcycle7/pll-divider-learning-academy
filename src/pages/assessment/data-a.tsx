import type { QuizQuestion } from '@/components/quiz/types'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, nextStateOf } from '@/models/divider/analysis'
import { ClockWaveform, traceFrom } from '@/components/waveform/ClockWaveform'
import { StateDiagram, graphToDiagram } from '@/components/circuit/StateDiagram'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { JOHNSON56_CYCLE, johnson56, johnson56SelfRecover } from './models'
import { johnson56Schematic } from './schematics'

/* ------------------------------------------------------------------ 波形題的資料：全部由 engine 產生 */
const T = 100
const WF_EDGES = 13
const WF_END = (WF_EDGES + 1) * T
function simOut(mod: 0 | 1) {
  const { traces } = simulate(johnson56, WF_EDGES, { period: T }, () => ({ mod }))
  return traces.filter((t) => t.name === 'clk' || t.name === 'div_out')
}
const wfDiv5 = simOut(0)
const wfDiv6 = simOut(1)
/** 假的「/5 但 50% duty」：rising edge 間隔對，但 high 寬度 2.5T——單一 flop 輸出做不到 */
const wfImpostor = [
  wfDiv5[0],
  traceFrom(
    'div_out',
    [
      { t: 0, v: 0 },
      { t: 3 * T, v: 1 },
      { t: 5.5 * T, v: 0 },
      { t: 8 * T, v: 1 },
      { t: 10.5 * T, v: 0 },
      { t: 13 * T, v: 1 },
    ],
    'output',
  ),
]

export const ASSESSMENT_A_META = {
  title: '分析一個陌生的 Divider',
  titleEn: 'Assessment A: analyze an unfamiliar divider',
  summary: '三個 DFF、一個 INV、一個 OR、一個 AND、一個 control input mod。課程裡沒有出現過這個結構。用你在 Module 1–8 學到的固定流程，自己把它的功能推出來。',
  passLine: 0.7,
}

/* ------------------------------------------------------------------ 題目 */
export const quizA: QuizQuestion[] = [
  {
    id: 'a1',
    type: 'state',
    prompt: '從 reset（q2 q1 q0 = 000）開始，mod 固定為 0，經過 3 個 rising edge 之後 state 是多少？',
    answer: '111',
    width: 3,
    bitNames: ['q2', 'q1', 'q0'],
    explanation: '逐 edge 推：000 時 d0 = NOT q2 = 1、d1 = q0 = 0、d2 = q1·(q0+mod) = 0 ⇒ edge 1 後 001；001 時 d = (d2 d1 d0) = (0 1 1) ⇒ 011；011 時 d2 = 1·(1+0) = 1 ⇒ 111。1 從 q0 往 q1、q2 一格一格移。',
  },
  {
    id: 'a2',
    type: 'state',
    prompt: 'mod 固定為 1，從 reset 經過 5 個 rising edge 之後 state 是多少？',
    answer: '100',
    width: 3,
    bitNames: ['q2', 'q1', 'q0'],
    explanation: '000 → 001 → 011 → 111 → 110（4 個 edge）。第 5 個 edge 前 state = 110：d2 = q1·(q0+mod) = 1·(0+1) = 1，d1 = q0 = 0，d0 = NOT q2 = 0 ⇒ 100。若 mod = 0 這一步會是 000。',
  },
  {
    id: 'a3',
    type: 'single',
    prompt: 'mod = 0 時，這個電路的 divide ratio 是多少？',
    options: ['4', '5', '6', '10'],
    answer: 1,
    explanation: 'mod = 0 的 state 循環是 000 → 001 → 011 → 111 → 110 → 000，共 5 個 state，每 5 個 rising edge 回到同一個 state。div_out = q2 的相鄰 rising edge 相隔 5 個 clock 週期 ⇒ N = 5。',
  },
  {
    id: 'a4',
    type: 'numeric',
    prompt: 'mod = 0 時，div_out 的 duty cycle 是多少 %？',
    answer: 40,
    tolerance: 0.5,
    unit: '%',
    explanation: 'div_out = q2，只在 111 與 110 兩個 state 為 1 ⇒ high = 2T，週期 = 5T ⇒ 2/5 = 40%。單一 flop 輸出的奇數除頻不可能是 50%（要 50% 必須用 falling edge 再合成，見 Lesson 2-2）。',
  },
  {
    id: 'a5',
    type: 'multiple',
    prompt: 'mod = 1 時，從 reset 出發，下列哪些 state 永遠不會出現（unreachable）？',
    options: ['010', '101', '100', '110', '000'],
    answers: [0, 1],
    explanation: 'mod = 1 的主循環是 000, 001, 011, 111, 110, 100 共 6 個 state；010 與 101 不在其中。注意 100 在 mod = 0 時是 unused state，但在 mod = 1 時是合法 state——unused 與否要看 mode。',
  },
  {
    id: 'a6',
    type: 'single',
    prompt: '假設沒有 reset，上電時 state 剛好是 010 而 mod = 1。接下來會發生什麼事？',
    options: ['1～2 個 edge 後自己回到主循環，功能不受影響', '永遠在 010 ↔ 101 之間來回，div_out 看起來像 /2', 'state 停在 010 不動，div_out 固定為 0', '立刻跳回 000 重新開始'],
    answer: 1,
    explanation: '010 時 d2 = q1·(q0+mod) = 1·(0+1) = 1、d1 = q0 = 0、d0 = NOT q2 = 1 ⇒ 101；101 時 d2 = 0·(…) = 0、d1 = 1、d0 = 0 ⇒ 010。兩個 state 互相跳、永遠回不到主循環，這就是 lock-up。q2 每個 edge 翻一次，輸出像 /2 但完全錯誤——這種錯誤在示波器上不容易一眼看出來。mod = 0 時 010 → 001 一步就回到主循環，所以 lock-up 只發生在 /6 模式。',
  },
  {
    id: 'a7',
    type: 'single',
    prompt: 'mod 最晚必須在什麼時候穩定，才能決定「這一個」output 週期是 5T 還是 6T？',
    options: ['在進入 111 的那個 rising edge 之前', '在離開 110 的那個 rising edge 之前 tOR + tAND + tsetup（每個週期的第 5 個 edge）', '在 div_out 上升的那個 edge 之前', '任何時候都可以，因為 mod 直接接在 OR gate 上'],
    answer: 1,
    explanation: 'd2 = q1·(q0 + mod)：只有 q1 = 1 且 q0 = 0 時 mod 才會出現在 d2 上，主循環上就只有 state 110。其他 4 個 state 的 next state 與 mod 無關。所以 mod 只要在「離開 110 的 edge」之前，經過 OR、AND 抵達 FF2.D 並滿足 setup 就可以；在那之前的 4 個 edge 內隨時改都沒關係——這就是這顆 divider 的 MOD timing deadline。',
  },
  {
    id: 'a8',
    type: 'single',
    prompt: 'divider 正在 state 001 時，mod 從 0 改成 1。div_out 會怎樣？',
    options: ['目前這個 output 週期直接變成 6T；output rising edge 之間永遠只有 5T 或 6T，沒有 runt pulse', 'div_out 出現一個 1T 寬的窄 pulse', 'divider 重新從 000 開始，輸出相位跳掉', '這個週期還是 5T，要等下一個週期 mod 才生效'],
    answer: 0,
    explanation: '兩種 mode 共用 000 → 001 → 011 → 111 → 110 這一段，分岔點只在 110。在 001 改 mod，還沒走到 110，所以這個週期就會走 110 → 100 → 000（6T）。整個 state machine 是連續的，不是兩個 divider 各跑各的再用 MUX 選（Lesson 3-1 的錯誤示範），所以 phase continuous、沒有 runt。',
  },
  {
    id: 'a9',
    type: 'single',
    prompt: '為什麼這個電路的 div_out 不會有 decode glitch？',
    options: ['因為 mod 是同步訊號', '因為 div_out 直接是 FF2 的 Q，只在 clock edge 後 tCQ 改變一次', '因為 OR 與 AND 的 delay 相等', '因為 /5 與 /6 的 duty cycle 都接近 50%'],
    answer: 1,
    explanation: 'decode glitch 來自「多個 state bit 經過 combinational logic 合成輸出，而各 bit 的 tCQ 不同時抵達」。這裡輸出直接取自 flop Q，沒有 decode，也就沒有 glitch。如果有人把輸出改成 q2·NOT q1 之類的組合，就要檢查 111 → 110 那個 edge 兩個 bit 的 tCQ 差。',
  },
  {
    id: 'a10',
    type: 'waveform',
    prompt: 'mod = 0 時，哪一組是正確的 div_out 波形？（clk 週期 T = 100；從 reset 開始）',
    options: [
      { label: 'A', traces: wfDiv6 },
      { label: 'B', traces: wfImpostor },
      { label: 'C', traces: wfDiv5 },
    ],
    answer: 2,
    tEnd: WF_END,
    period: T,
    explanation: '正確波形的 rising edge 在 edge 3、8、13（相鄰間隔 5T），high 寬度 2T（40%）。A 的間隔是 6T（那是 mod = 1）；B 的間隔對，但 high 寬度 2.5T（50%）——q2 只在 rising edge 改變，high 寬度一定是整數個 T。',
  },
]

/* ------------------------------------------------------------------ 工作紙參考答案 */
export const worksheetReferenceA: Record<string, string> = {
  q1: 'clk（唯一的 clock；FF0、FF1、FF2 的 clk pin 都接 clk，rising edge 觸發）。這是 synchronous 結構，不是 ripple。',
  q2: 'FF0、FF1、FF2 三個 rising-edge DFF（都有 async active-low rst_n）。沒有 latch、沒有 dynamic node。',
  q3: 'q2 q1 q0（MSB → LSB）。三個 bit ⇒ 最多 8 個 state。',
  q4: '000（三個 flop 的 resetValue 都是 0）。',
  q5: 'd0 = NOT q2；d1 = q0；d2 = q1 AND (q0 OR mod)。div_out = q2。',
  q6: 'mod=0：000, 001, 011, 111, 110（unused：010, 101, 100，皆在 1～2 個 edge 內回到主循環）。mod=1：000, 001, 011, 111, 110, 100（unused：010, 101，兩者互相跳 ⇒ lock-up）。',
  q7: 'mod=0：000 → 001 → 011 → 111 → 110 → 000。mod=1：000 → 001 → 011 → 111 → 110 → 100 → 000。兩種 mode 共用前 5 個 state，只在離開 110 時分岔。',
  q8: 'div_out = q2：在 011 → 111 的 edge 0→1；mod=0 在 110 → 000 的 edge 1→0；mod=1 在 100 → 000 的 edge 1→0。',
  q9: 'mod=0：5；mod=1：6。output rising edge 間隔 5T 或 6T；切換 mod 時每個週期仍是 5T 或 6T（phase-continuous）。',
  q10: 'mod=0：2T / 5T = 40%。mod=1：3T / 6T = 50%。',
  q11: 'mod 只在 q1=1、q0=0（主循環上就是 state 110）時進入 d2。必須在「離開 110 的那個 rising edge」之前 tOR + tAND + tsetup 就穩定；在那之前的 4 個 edge 內任何時候改都可以。',
  q12: 'FF0.Q（q0）在 edge k 的 rising edge launch——最長的 data path 是 q0 → OR → AND → FF2.D（兩級 logic）。若 mod 由 register 驅動，launch 是那顆 register。',
  q13: 'FF2.D 在 edge k+1 的 rising edge capture（同一條 clk，可用時間 = 一個 Tclk）。',
  q14: 'tCQ(FF0) → OR → AND → tsetup(FF2)。mod path：tCQ(FF_M) → mod 走線 → OR → AND → tsetup(FF2)（更長）。最短的是 q0 → wire → d1（hold 最差）。',
  q15: 'div_out 直接取自 FF2.Q，沒有 decode glitch。mod=1 時 010 ↔ 101 lock-up：上電若無 reset 可能永遠卡住，輸出像 /2。mod 若在 setup window 內改變，FF2 可能 metastable。三個 FF 的 rst_n 釋放時間不同時，可能進入 010。',
}

/* ------------------------------------------------------------------ 頁面內容：任務說明 */
export function AssessmentAIntro() {
  return (
    <>
      <Section title="任務" en="Your task">
        <p>
          下面是一個你沒看過的 divider。<b>不要先猜它是除幾</b>。照 Lesson 7-2 與 Lab 的固定流程走一遍：找 clock 與 memory element → 寫 next-state equation → 從 reset 逐 edge 推進 → 建 state table → 算 divide ratio 與 duty → 判斷 mod 的 deadline、phase continuity、glitch 與 illegal state。
        </p>
        <Steps
          items={[
            <>
              <b>讀電路</b>：找出 clock input、三個 flop、每個 D pin 往回追會碰到哪些 gate。不給 equation，你要自己從圖上讀出來。
            </>,
            <>
              <b>逐 edge 推導</b>：先在紙上推 mod = 0 的前 6 個 edge，再用下面的模擬器對答案。模擬器刻意關掉 equation 顯示。
            </>,
            <>
              <b>填工作紙</b>：15 題全部填完（存在瀏覽器裡，可以隨時回來）。這是你的分析紀錄，也是最終報告的一部分。
            </>,
            <>
              <b>評量測驗</b>：10 題，交卷後給分並解鎖完整解答。及格線 70%。
            </>,
          ]}
        />
        <Callout kind="method" title="分析任何 divider 的第一個問題">
          <b>下一個 rising edge 來的時候，每個 flop 會抓到什麼？</b>把現在的 state 代進每個 D 的 equation，就有下一個 state。做五、六次，循環就出來了。
        </Callout>
      </Section>

      <Section title="電路" en="The circuit">
        <LogicDiagram schematic={johnson56Schematic} showValues={false} />
        <p className="small muted">
          三個 DFF 都接同一條 clk（rising edge）與同一條 rst_n（active low，reset 值皆為 0）。mod 是外部 control input。輸出 div_out 直接接在 FF2 的 Q。滑鼠移到元件上可以看到它是什麼 gate。
        </p>
        <Callout kind="idea" title="從哪裡開始讀">
          從每個 flop 的 <b>D pin 往回追</b>：FF0.D 來自哪個 gate？那個 gate 的輸入是哪個訊號？FF1.D 呢？FF2.D 呢？追完三條，你就有三條 next-state equation——這比從輸入往前推快得多。
        </Callout>
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ 頁面內容：完整解答 */
const g0 = buildStateGraph(johnson56, { mod: 0 })
const g1 = buildStateGraph(johnson56, { mod: 1 })

function cycleRows(mod: 0 | 1) {
  return JOHNSON56_CYCLE[mod].map((s) => {
    const r = nextStateOf(johnson56, s, { mod })
    return [s, `q1·(q0+${mod}) = ${r.d.d2}`, `q0 = ${r.d.d1}`, `NOT q2 = ${r.d.d0}`, r.next, s[0]]
  })
}

export function AssessmentASolution() {
  return (
    <>
      <Section title="解答 1：clock、memory element、state、reset" en="Steps 1–4">
        <Steps
          items={[
            <>
              <b>Clock input</b>：只有一條 clk，三個 flop 的 clk pin 都接它、都是 rising edge ⇒ 這是 <Term zh="同步" en="synchronous" /> 結構。三個 Q 在同一個 edge 後 tCQ 一起更新，沒有 ripple 的逐級延遲。
            </>,
            <>
              <b>Memory element</b>：FF0、FF1、FF2。沒有 latch、沒有 dynamic node。
            </>,
            <>
              <b>State bits</b>：q2 q1 q0（MSB → LSB），三個 bit ⇒ 最多 2³ = 8 個 state。
            </>,
            <>
              <b>Reset state</b>：rst_n 為 0 時三個 Q 都被拉到 0 ⇒ 000。
            </>,
          ]}
        />
      </Section>

      <Section title="解答 2：next-state equations" en="Step 5">
        <p>從每個 D pin 往回追：</p>
        <ul>
          <li>
            FF0.D ← INV ← FF2.Q：<Math>{'d_0 = \\overline{q_2}'}</Math>
          </li>
          <li>
            FF1.D ← FF0.Q（純走線）：<Math>{'d_1 = q_0'}</Math>
          </li>
          <li>
            FF2.D ← AND ← (FF1.Q, OR(FF0.Q, mod))：<Math>{'d_2 = q_1 \\cdot (q_0 + mod)'}</Math>
          </li>
        </ul>
        <p>
          d1 = q0、d2 ≈ q1、d0 = NOT q2：這是一個「把最後一級<b>反相</b>後餵回第一級」的 shift register，也就是 <Term zh="扭環計數器" en="twisted-ring / Johnson counter" />。純 Johnson counter 三級的週期是 2×3 = 6；這裡 AND gate 用 (q0 + mod) 在 mod = 0 時把其中一個 state 跳過，變成 5。
        </p>
      </Section>

      <Section title="解答 3：逐 edge 推導與 state table" en="Steps 6–7">
        <p>把每個 state 代進三條 equation。mod = 0：</p>
        <CompareTable head={['現在 state (q2q1q0)', 'd2', 'd1', 'd0', '下一個 state', 'div_out = q2']} rows={cycleRows(0)} />
        <p>mod = 1：</p>
        <CompareTable head={['現在 state (q2q1q0)', 'd2', 'd1', 'd0', '下一個 state', 'div_out = q2']} rows={cycleRows(1)} />
        <p>
          注意兩張表的前四列完全一樣：<b>mod 只在 110 這一列出現在 d2 上</b>（因為 d2 = q1·(q0+mod)，要 q1 = 1 且 q0 = 0 mod 才有影響）。mod = 0 時 110 → 000，循環長度 5；mod = 1 時 110 → 100 → 000，循環長度 6。
        </p>
        <div className="two-col">
          <StateDiagram {...graphToDiagram(g0, 'clk↑')} title="mod = 0：主循環 5 個 state；010、101、100 都會回到主循環" width={340} height={300} />
          <StateDiagram {...graphToDiagram(g1, 'clk↑')} title="mod = 1：主循環 6 個 state；010 ↔ 101 互鎖（lock-up）" width={340} height={300} />
        </div>
        <p className="small muted">state diagram 由 buildStateGraph 從 netlist 直接算出；虛線／標記的 state 是 unreachable 或 lock-up。</p>
        <DividerSimPanel netlist={johnson56} schematic={johnson56Schematic} title="解答用模擬器（現在顯示 equations；可從任意 state 啟動）" showDelayMode allowInitialState showPulseWidths />
      </Section>

      <Section title="解答 4：output、divide ratio、duty cycle" en="Steps 8–10">
        <p>
          div_out = q2。q2 在 011 → 111 那個 edge 變 1；mod = 0 時在 110 → 000 變 0，mod = 1 時在 100 → 000 變 0。設輸入週期為 <Math>{'T_{in}'}</Math>（ps）：
        </p>
        <Math block>{'mod = 0:\\quad T_{out} = 5\\,T_{in},\\quad N = 5,\\quad D = \\frac{t_{high}}{T_{out}} = \\frac{2T_{in}}{5T_{in}} = 40\\%'}</Math>
        <Math block>{'mod = 1:\\quad T_{out} = 6\\,T_{in},\\quad N = 6,\\quad D = \\frac{3T_{in}}{6T_{in}} = 50\\%'}</Math>
        <p>
          其中 <Math>{'N = T_{out}/T_{in}'}</Math> 是 divide ratio，<Math>{'D'}</Math> 是 duty cycle，<Math>{'t_{high}'}</Math> 是 output 為 1 的時間。/5 的 40% 不是 bug——單一 flop 輸出的奇數除頻，high 一定是整數個 T，不可能剛好一半。
        </p>
        <ClockWaveform signals={wfDiv5} tEnd={WF_END} period={T} showEdgeTimes showPulseWidths highlight={['div_out']} title="mod = 0：rising edge 間隔 5T，high = 2T" zoomable={false} />
        <ClockWaveform signals={wfDiv6} tEnd={WF_END} period={T} showEdgeTimes showPulseWidths highlight={['div_out']} title="mod = 1：rising edge 間隔 6T，high = 3T" zoomable={false} />
      </Section>

      <Section title="解答 5：mod 的 timing deadline 與 phase continuity" en="Step 11">
        <p>
          mod 只在 state 110 被「消費」。從 000 算起，110 是每個週期的第 4 個 edge 之後的 state，離開 110 的是第 5 個 edge。所以 mod 必須在<b>第 5 個 edge 之前</b> <Math>{'t_{OR} + t_{AND} + t_{setup}'}</Math> 就穩定；在第 1～4 個 edge 之間任何時候改都可以。這就是 <Term zh="MOD 期限" en="MOD timing deadline" />。
        </p>
        <p>
          因為兩種 mode 共用 000 → 001 → 011 → 111 → 110，切換 mod 不會讓 state 跳到別的地方，只會決定這個週期在 110 之後是「直接回 000」還是「多待一個 100」。output edge 之間永遠是 5T 或 6T，沒有 runt、沒有 phase jump ⇒ <Term zh="相位連續" en="phase-continuous" />。這正是 dual-modulus divider 與「兩個 divider + MUX」的差別。
        </p>
        <Callout kind="warning" title="mod 在 setup window 內改變會怎樣？">
          若 mod 在離開 110 的那個 edge 前 <Math>{'t_{OR} + t_{AND} + t_{setup}'}</Math> 內才改變，FF2 抓到的 d2 可能是 0、1、或 metastable。結果不是「錯一個 cycle」而已：若 FF2 進入 metastable 而其他兩個 flop 正常，下一個 state 可能是 000 或 100 以外的東西。
        </Callout>
      </Section>

      <Section title="解答 6：critical path（預告 Assessment B）" en="Steps 12–14">
        <p>
          三條 register-to-register path：q2 → INV → d0（一級）、q1 → AND → d2（一級）、q0 → OR → AND → d2（兩級）。最長的是 <b>FF0.Q（launch，edge k）→ OR → AND → FF2.D（capture，edge k+1）</b>。若 mod 由一顆 register 驅動，mod → OR → AND → d2 還會再多一段走線。最短的是 q0 → 走線 → d1，它是 hold 最差的一條。Assessment B 會把數字放進去算。
        </p>
      </Section>

      <Section title="解答 7：illegal state 與 glitch" en="Step 15">
        <Callout kind="pitfall" title="這個電路的三個陷阱">
          <ul style={{ margin: 0 }}>
            <li>
              <b>Lock-up（mod = 1）</b>：010 → 101 → 010 → …。q2 每個 edge 翻一次，輸出像 /2。上電沒有 reset、或 reset 釋放時三個 flop 沒有同時離開 reset，就可能掉進去。mod = 0 時所有 unused state 都會在 1～2 個 edge 內回到主循環，所以「/5 模式沒問題」不代表「/6 模式也沒問題」。
            </li>
            <li>
              <b>Decode glitch</b>：沒有。div_out 直接是 FF2.Q。但若有人為了 50% duty 把輸出改成 combinational decode，就要重新檢查。
            </li>
            <li>
              <b>Reset release</b>：rst_n 釋放太靠近 clock edge 會有 recovery / removal 問題；三個 flop 的 rst_n 若到達時間不同，第一個 edge 可能抓到混合的 state。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="RTL 與 unused state 的處理">
          <CodeBlock
            title="div56.sv"
            code={`
module div56 (
  input  logic clk,
  input  logic rst_n,     // async active-low
  input  logic mod,       // 0: /5, 1: /6 (sampled when state == 3'b110)
  output logic div_out
);
  logic q0, q1, q2;
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) {q2, q1, q0} <= 3'b000;
    else begin
      q0 <= ~q2;                 // d0 = NOT q2
      q1 <= q0;                  // d1 = q0
      q2 <= q1 & (q0 | mod);     // d2 = q1 AND (q0 OR mod)
    end
  end
  assign div_out = q2;           // output straight from a flop: no decode glitch
endmodule
`}
            note="synthesizable；注意 q2 那一行就是全部的 modulus control。沒有 default / else 分支處理 010、101——所以 lock-up 是這份 RTL 的真實行為，不是模擬器的假象。"
          />
          <p>
            State 分析的公式化寫法：設 <Math>{'S_k = (q_2 q_1 q_0)_k'}</Math> 為第 k 個 edge 之後的 state，則 <Math>{'S_{k+1} = (q_1 (q_0 + mod),\\ q_0,\\ \\overline{q_2})_k'}</Math>。從 <Math>{'S_0 = 000'}</Math> 迭代到第一次重複，重複前的長度就是 N。
          </p>
        </ModeContent>
        <ModeContent level="deep" title="修成 self-recovering，以及要付出的 timing 代價">
          <p>
            要讓 010 不再跳到 101，只需要在 010 時把 d2 壓成 0。010 與 110 的差別在 q2，所以把 mod 的作用加上 q2 條件：
          </p>
          <Math block>{'d_2 = q_1 \\cdot (q_0 + mod \\cdot q_2)'}</Math>
          <p>
            主循環上 mod 只在 110 被看（q2 = 1），功能完全不變；010（q2 = 0）時 d2 = 0 ⇒ 010 → 001，101 → 010 → 001，兩個 edge 內回到主循環。代價：mod path 多了一級 AND（mod → AND → OR → AND → d2），dual-modulus 模式的 critical path 變長；而且多了一個 gate 的功耗與面積。高速 CML 實作常常選擇「保留 lock-up、靠可靠的 reset」而不是加 correction logic——但那必須在 reset release timing 上付出對應的謹慎。
          </p>
          <DividerSimPanel netlist={johnson56SelfRecover} title="Self-recovering 版本：從 010 或 101 啟動試試看" allowInitialState showEquations compact showMeasure={false} />
          <ul className="small">
            <li>
              <b>tCQ mismatch 與 metastability</b>：三個 flop 同時翻轉時，AND / OR 的輸入會在 tCQ 附近短暫出現中間組合（例如 111 → 110 時 d2 可能先看到 (q1, or_m) = (1, 1) 再變 (1, 0)）。這不影響功能——d2 在下一個 edge 前會穩定——但它決定了 setup 要用「最晚穩定」的那條 path 來算。
            </li>
            <li>
              <b>Johnson 結構的高速優點</b>：每一級的 next-state 幾乎就是前一級的 Q（d1 = q0），logic depth 淺；輸出直接來自 flop，duty 與 edge 品質好。缺點就是 2^n − 2n 個 unused state。
            </li>
          </ul>
        </ModeContent>
      </Section>
    </>
  )
}
