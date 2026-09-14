import type { QuizQuestion } from '@/components/quiz/types'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { Callout, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { johnson56SysSchematic, pathHighlights } from './schematics'
import { DELAYS, ENV_B, EXPECTED_B, johnson56Timing } from './timing'

export const ASSESSMENT_B_META = {
  title: '找出 Divider 的 Critical Path',
  titleEn: 'Assessment B: find the critical path',
  summary: '同一個 /5 /6 divider，現在放進系統：mod 由 register FF_M 驅動，div_out 送到 downstream 的 FF_R。給你完整的 delay 表，三種 mode，找出每一種 mode 的 critical path、算 slack、判斷 hold / recovery / interface path。',
  passLine: 0.7,
}

/** critical-path 題型共用的選項（順序固定，題目用 index 指答案） */
const cpOptions = [
  { label: 'FF2.Q → INV → FF0.D', highlight: pathHighlights.q2InvD0, description: 'tCQ + INV' },
  { label: 'FF1.Q → AND → FF2.D', highlight: pathHighlights.q1AndD2, description: 'tCQ + AND' },
  { label: 'FF0.Q → OR → AND → FF2.D', highlight: pathHighlights.q0OrAndD2, description: 'tCQ + OR + AND' },
  { label: 'FF_M.Q → 走線 → OR → AND → FF2.D', highlight: pathHighlights.modOrAndD2, description: 'tCQ + wire + OR + AND' },
  { label: 'FF2.Q → 走線 → FF_R.D', highlight: pathHighlights.outFfr, description: 'tCQ + wire（interface）' },
]

export const quizB: QuizQuestion[] = [
  {
    id: 'b1',
    type: 'critical-path',
    prompt: 'Mode「/5 固定」（mod 接常數 0）：哪一條是 setup critical path？',
    schematic: johnson56SysSchematic,
    options: cpOptions,
    answer: 2,
    explanation: 'mod 是常數 ⇒ FF_M 那條不會被 sensitize（STA 用 case analysis 拿掉）。剩下的 register-to-register path 中，q0 要經過 OR 與 AND 兩級：10 + 11 + 10 = 31 ps，比 q1 → AND（20）、q2 → INV（15）、FF2 → FF_R（19）都長。slack = 47 − 31 = 16 ps。',
  },
  {
    id: 'b2',
    type: 'critical-path',
    prompt: 'Mode「/6 固定」（mod 接常數 1）：哪一條是 setup critical path？',
    schematic: johnson56SysSchematic,
    options: cpOptions,
    answer: 1,
    explanation: 'mod = 1 ⇒ OR 的輸出恆為 1，q0 的變化根本到不了 d2——q0 → OR → AND 這條不被 sensitize，不能算。FF_M 也是常數。剩下 q1 → AND（arrival 20，slack 27）、FF2 → FF_R（19，slack 28）、q2 → INV（15）。最差的是 q1 → AND。注意 interface path 只差 1 ps。',
  },
  {
    id: 'b3',
    type: 'critical-path',
    prompt: 'Mode「dual-modulus」（mod 每個 cycle 由 FF_M 更新）：哪一條是 setup critical path？',
    schematic: johnson56SysSchematic,
    options: cpOptions,
    answer: 3,
    explanation: 'FF_M 每個 edge 都可能送出新的 mod，它必須在下一個 edge 前經過 8 ps 走線、OR、AND 到 FF2.D：10 + 8 + 11 + 10 = 39 ps，slack 只有 47 − 39 = 8 ps。這才是這顆 divider 真正的 Fmax 限制：Tclk,min = 52 ps。',
  },
  {
    id: 'b4',
    type: 'numeric',
    prompt: '用 max delay 算：FF0.Q → OR → AND → FF2.D 這條 path 的 arrival time（相對 launch edge）是多少 ps？',
    answer: EXPECTED_B.arrival.q0OrAndD2,
    unit: 'ps',
    explanation: 'arrival = tCQ,max(FF0) + tOR,max + tAND,max = 10 + 11 + 10 = 31 ps。setup 用 max delay；hold 才用 min delay。',
  },
  {
    id: 'b5',
    type: 'numeric',
    prompt: 'T = 60 ps、skew = 0、jitter = 3 ps、margin = 2 ps、tsetup = 8 ps：FF2.D 的 required time 是多少 ps？',
    answer: EXPECTED_B.required,
    unit: 'ps',
    explanation: 'required = T + skew − tsetup − jitter − margin = 60 + 0 − 8 − 3 − 2 = 47 ps。這是「資料最晚幾 ps 要到」，與哪一條 path 無關。',
  },
  {
    id: 'b6',
    type: 'numeric',
    prompt: 'dual-modulus mode 下，FF_M.Q → 走線 → OR → AND → FF2.D 的 setup slack 是多少 ps？',
    answer: EXPECTED_B.slack.modOrAndD2,
    unit: 'ps',
    explanation: 'arrival = 10 + 8 + 11 + 10 = 39 ps；required = 47 ps；slack = 47 − 39 = 8 ps。正的，所以 60 ps 的 clock 還能跑，但只剩 8 ps。',
  },
  {
    id: 'b7',
    type: 'numeric',
    prompt: '「/5 固定」mode 的 Tclk,min 是多少 ps？（slack = 0 時的 clock period）',
    answer: EXPECTED_B.tclkMin.fix5,
    unit: 'ps',
    explanation: 'Tclk,min = arrival + tsetup − skew + jitter + margin = 31 + 8 − 0 + 3 + 2 = 44 ps ⇒ Fmax ≈ 22.7 GHz。/6 固定是 33 ps，dual-modulus 是 52 ps：同一顆電路，三種 mode 三個 Fmax。',
  },
  {
    id: 'b8',
    type: 'single',
    prompt: '哪一條 path 的 hold slack 最小？',
    options: ['FF0.Q → 走線 → FF1.D', 'FF2.Q → INV → FF0.D', 'FF_M.Q → 走線 → OR → AND → FF2.D', 'FF2.Q → 走線 → FF_R.D'],
    answer: 0,
    explanation: 'hold 看 min delay：q0 → d1 只有 tCQ,min 6 + 走線 1 = 7 ps，required = thold + skew = 4 ⇒ slack 3 ps。其他路徑有 gate 擋著：q2 → INV 是 9 − 4 = 5，mod path 是 23 − 4 = 19，interface 是 11 − 4 = 7。最長的 setup path 從來不是 hold 最差的那條。',
  },
  {
    id: 'b9',
    type: 'single',
    prompt: '哪一條路徑要做的是 recovery / removal check，而不是 setup / hold check？',
    options: ['clk → FF0.clk 的 clock 走線', 'rst_n → FF0 / FF1 / FF2 的 rstn pin', 'FF_M.Q → OR', 'FF2.Q → FF_R.D'],
    answer: 1,
    explanation: 'rst_n 是非同步輸入，它「釋放」的時間點相對 clock edge 要滿足 recovery（像 setup，12 ps）與 removal（像 hold，6 ps）。它不是 data path、不影響 Fmax，但釋放時間不對會讓 flop metastable，或讓三個 flop 不同時離開 reset 而進入 010 這種 lock-up state。clock 走線本身沒有 launch / capture，不是 timing path。',
  },
  {
    id: 'b10',
    type: 'multiple',
    prompt: '關於 FF2.Q → 走線 → FF_R.D 這條路徑，下列何者正確？',
    options: [
      '它的 launch 是 FF2、capture 是 FF_R，是 divider 與 downstream block 之間的 interface path，不是 divider 自己的 Fmax loop',
      'skew = 0 時它的 setup slack = 28 ps，只比「/6 固定」mode 的 q1 → AND 多 1 ps',
      '若 FF_R 的 clock 比 FF2 晚到 10 ps（skew = +10），它的 hold slack 變成 (6 + 5) − (4 + 10) = −3 ps，hold violation',
      '它的 setup slack 與 clock period 無關',
    ],
    answers: [0, 1, 2],
    explanation: 'arrival = 10 + 9 = 19，slack = 47 − 19 = 28 ps。skew 定義為 capture clock 到達 − launch clock 到達：FF_R 晚到 ⇒ setup 變寬鬆（slack 38）、hold 變嚴格（arrival,min 11 < required 14 ⇒ −3 ps）。setup slack 當然與 period 有關（required = T + skew − …）；與 period 無關的是 hold。',
  },
]

/* ------------------------------------------------------------------ 頁面內容：任務說明 + delay 表 */
export function AssessmentBIntro() {
  return (
    <>
      <Section title="任務" en="Your task">
        <p>
          Assessment A 的電路現在放進系統裡：mod 由 register <b>FF_M</b>（同一條 clk）驅動，div_out 經過一段走線送到 downstream 的 retiming flop <b>FF_R</b>。所有 delay 都給你。你要做的是 Lesson 7-2 的十步流程：找 sequential element → 對每一條 path 找 launch / capture → 判斷它在哪個 mode 會被 sensitize → 加 max delay 算 arrival → 算 required → slack → 再用 min delay 檢查 hold → 最後把 recovery / removal、interface path 分開處理。
        </p>
        <Callout kind="warning" title="這次的重點：三種 mode">
          <ul style={{ margin: 0 }}>
            <li>
              <b>/5 固定</b>：mod 接常數 0。常數不會變 ⇒ 從 FF_M 出發的 path 不存在。
            </li>
            <li>
              <b>/6 固定</b>：mod 接常數 1。想一想 OR gate 的輸出還會不會動？如果不會，q0 經過 OR 的那條 path 還算不算 critical path？
            </li>
            <li>
              <b>dual-modulus</b>：FF_M 每個 clk edge 都可能更新 mod。
            </li>
          </ul>
          <p style={{ margin: '0.5em 0 0' }}>
            提醒：最長的 wire 不等於 critical path；<Term zh="臨界路徑" en="critical path" /> 一定要有 launch point、capture point，而且要在那個 mode 下真的會被 <Term zh="致敏" en="sensitized" />。
          </p>
        </Callout>
      </Section>

      <Section title="電路與 delay 表" en="Circuit and delay table">
        <LogicDiagram schematic={johnson56SysSchematic} showValues={false} />
        <div className="two-col">
          <div>
            <div className="panel-title">Gate / flop delay（ps）</div>
            <CompareTable
              head={['元件', 'min', 'max', '說明']}
              rows={[
                ['tCQ（FF0/FF1/FF2/FF_M/FF_R）', String(DELAYS.tcq.min), String(DELAYS.tcq.max), 'clock edge → Q 穩定'],
                ['tsetup（所有 flop）', '—', String(DELAYS.tsetup), 'D 必須在 edge 前穩定'],
                ['thold（所有 flop）', '—', String(DELAYS.thold), 'D 在 edge 後不能改變'],
                ['INV', String(DELAYS.inv.min), String(DELAYS.inv.max), 'q2 → d0'],
                ['OR2', String(DELAYS.or2.min), String(DELAYS.or2.max), '兩個輸入 pin 相同'],
                ['AND2', String(DELAYS.and2.min), String(DELAYS.and2.max), '兩個輸入 pin 相同'],
                ['走線 FF0.Q → FF1.D', String(DELAYS.wireQ0D1.min), String(DELAYS.wireQ0D1.max), '相鄰 flop'],
                ['走線 FF_M.Q → OR', String(DELAYS.wireMod.min), String(DELAYS.wireMod.max), 'modulus register 較遠'],
                ['走線 FF2.Q → FF_R.D', String(DELAYS.wireOut.min), String(DELAYS.wireOut.max), '跨 block（含 buffer）'],
                ['走線 rst_n → rstn', String(DELAYS.wireRst.min), String(DELAYS.wireRst.max), 'reset 樹'],
                ['recovery / removal', String(DELAYS.removal), String(DELAYS.recovery), 'rst_n 釋放相對 clk edge（removal / recovery）'],
              ]}
            />
          </div>
          <div>
            <div className="panel-title">Clock 環境</div>
            <CompareTable
              head={['參數', '值', '意義']}
              rows={[
                ['Tclk', `${ENV_B.period} ps`, '輸入 clock 週期（≈ 16.7 GHz）'],
                ['skew', `${ENV_B.skew} ps`, 'capture clock 到達 − launch clock 到達（題目未特別說明時為 0）'],
                ['jitter', `${ENV_B.jitter} ps`, '相鄰 edge 間隔的不確定量'],
                ['margin', `${ENV_B.margin} ps`, '設計裕度'],
                ['clk 最小 pulse width', `${DELAYS.minPulse} ps`, 'high / low 各自的下限'],
              ]}
            />
            <Callout kind="formula" title="要用到的公式（單位 ps）">
              <Math block>{'t_{arrival} = \\sum t_{max}\\ (t_{CQ} + t_{logic} + t_{wire})'}</Math>
              <Math block>{'t_{required} = T_{clk} + t_{skew} - t_{setup} - t_{jitter} - t_{margin}'}</Math>
              <Math block>{'slack_{setup} = t_{required} - t_{arrival},\\qquad T_{clk,min} = t_{arrival} + t_{setup} - t_{skew} + t_{jitter} + t_{margin}'}</Math>
              <Math block>{'slack_{hold} = \\sum t_{min} - (t_{hold} + t_{skew})'}</Math>
              <p className="small muted" style={{ margin: 0 }}>
                <Math>{'t_{skew}'}</Math> 為 capture clock 到達時間減 launch clock 到達時間（正值 = capture 較晚）。
              </p>
            </Callout>
          </div>
        </div>
      </Section>

      <Section title="作答前先列出候選 path" en="Enumerate the candidates first">
        <Steps
          items={[
            <>
              列出所有 sequential element：FF_M、FF0、FF1、FF2、FF_R。每一條 timing path 都從其中一個的 Q 出發（launch），在其中一個的 D 結束（capture）。
            </>,
            <>
              從每個 D pin 往回追到 Q：FF0.D ← INV ← FF2.Q；FF1.D ← FF0.Q；FF2.D ← AND ← {'{FF1.Q, OR ← {FF0.Q, FF_M.Q}}'}；FF_R.D ← FF2.Q。
            </>,
            <>
              對每一條問：在這個 mode 下，這個輸入的變化真的能傳到 D 嗎？（常數輸入 ⇒ 不算；OR 有一個輸入是 1 ⇒ 另一個輸入被擋住）
            </>,
            <>把 max delay 加起來，比大小；再把 min delay 加起來，找 hold 最差的。</>,
          ]}
        />
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------ 頁面內容：完整解答 */
export function AssessmentBSolution() {
  const R = EXPECTED_B
  return (
    <>
      <Section title="解答 1：用 Critical Path Explorer 逐 mode 看" en="Explore by mode">
        <p>切換 mode，注意候選 path 的清單會變（不被 sensitize 的 path 直接消失），「最差 setup slack」的標記也跟著換。</p>
        <CriticalPathExplorer scenario={johnson56Timing} initialPath="p-q0-or-and-d2" />
      </Section>

      <Section title="解答 2：每一條 path 的數字" en="Numbers for every path">
        <CompareTable
          head={['Path', 'launch → capture', 'arrival (Σ max)', 'setup slack', 'hold slack (Σ min − thold)', '在哪些 mode 有效']}
          rows={[
            ['FF2.Q → INV → FF0.D', 'FF2 (k) → FF0 (k+1)', `10 + 5 = ${R.arrival.q2InvD0}`, String(R.slack.q2InvD0), `9 − 4 = ${R.holdSlack.q2InvD0}`, '全部'],
            ['FF1.Q → AND → FF2.D', 'FF1 (k) → FF2 (k+1)', `10 + 10 = ${R.arrival.q1AndD2}`, String(R.slack.q1AndD2), `12 − 4 = ${R.holdSlack.q1AndD2}`, '全部（/6 固定的 critical path）'],
            ['FF0.Q → OR → AND → FF2.D', 'FF0 (k) → FF2 (k+1)', `10 + 11 + 10 = ${R.arrival.q0OrAndD2}`, String(R.slack.q0OrAndD2), `19 − 4 = ${R.holdSlack.q0OrAndD2}`, '/5 固定、dual-modulus（/6 固定時被 OR 擋住）'],
            ['FF_M.Q → 走線 → OR → AND → FF2.D', 'FF_M (k) → FF2 (k+1)', `10 + 8 + 11 + 10 = ${R.arrival.modOrAndD2}`, String(R.slack.modOrAndD2), `23 − 4 = ${R.holdSlack.modOrAndD2}`, '只有 dual-modulus（critical path）'],
            ['FF0.Q → 走線 → FF1.D', 'FF0 (k) → FF1 (k+1)', `10 + 2 = ${R.arrival.q0D1}`, String(R.slack.q0D1), `7 − 4 = ${R.holdSlack.q0D1}（最差）`, '全部'],
            ['FF2.Q → 走線 → FF_R.D（interface）', 'FF2 (k) → FF_R (k+1)', `10 + 9 = ${R.arrival.outFfr}`, String(R.slack.outFfr), `11 − 4 = ${R.holdSlack.outFfr}`, '全部'],
            ['rst_n → rstn（recovery / removal）', 'clk edge k（synchronizer 釋放）→ clk edge k+1', `tCQ 6～10 + 走線 3～5 = ${R.rstRelease.min}～${R.rstRelease.max}`, `recovery ${R.rstRelease.recoverySlack}（= ${R.rstRelease.required} − ${R.rstRelease.max}）`, `removal ${R.rstRelease.min} − ${DELAYS.removal} = ${R.rstRelease.removalSlack}`, '不是 data path'],
          ]}
        />
        <p className="small muted">required time 對所有 capture flop 都是 T + skew − tsetup − jitter − margin = 60 − 8 − 3 − 2 = {R.required} ps（skew = 0）。</p>
      </Section>

      <Section title="解答 3：為什麼三種 mode 的 critical path 不同" en="Sensitization by mode">
        <Steps
          items={[
            <>
              <b>/5 固定（mod = 0）</b>：OR 的 mod 輸入是常數 0，OR 輸出 = q0，q0 的變化會傳過 OR、AND 到 d2。FF_M 不會動，它那條 path 不存在。最長：q0 → OR → AND，31 ps，slack 16，<Math>{`T_{clk,min} = 31 + 8 + 3 + 2 = ${R.tclkMin.fix5}`}</Math> ps。
            </>,
            <>
              <b>/6 固定（mod = 1）</b>：OR 有一個輸入恆為 1 ⇒ OR 輸出恆為 1 ⇒ q0 怎麼變都到不了 d2。這條 path 在 STA 裡會被 case analysis 拿掉——它有 launch、有 capture，但<b>不會被 sensitize</b>，所以不是 critical path。剩下最長的是 q1 → AND，20 ps，slack 27，<Math>{`T_{clk,min} = ${R.tclkMin.fix6}`}</Math> ps。interface path 是 19 ps、slack 28，只差 1 ps。
            </>,
            <>
              <b>dual-modulus</b>：FF_M 每個 edge 都可能送出新值。launch = FF_M（edge k），經 8 ps 走線、OR、AND，capture = FF2（edge k+1）：39 ps，slack 8，<Math>{`T_{clk,min} = ${R.tclkMin.dyn}`}</Math> ps。這才是這顆 divider 真正能跑多快的答案——divider 內部的 loop 反而不是瓶頸，<b>modulus control 才是</b>。這與 Lesson 4-2 的結論一致：MMD 的 mod / carry path 常比 local Q → D 更關鍵。
            </>,
          ]}
        />
      </Section>

      <Section title="解答 4：hold、recovery、interface 分開看" en="Hold, recovery, interface">
        <ul>
          <li>
            <b>Hold 最差</b>：q0 → 走線 → d1。min arrival 7 ps、required 4 ps、slack 3 ps。它與 clock period 完全無關——把 clock 放慢救不了 hold。若 FF1 的 clock 比 FF0 晚到超過 3 ps，就 hold violation。修法是加 delay buffer，不是改 period。
          </li>
          <li>
            <b>Recovery / removal</b>：rst_n → 三個 rstn pin。rst_n 釋放要在 clk edge 前 12 ps（recovery）之前、或 edge 後 6 ps（removal）之後——中間這段 [−12, +6] ps 是禁止窗。把釋放用同一條 clk 同步之後，它到達 rstn pin 的時刻相對 edge k 是 tCQ + 走線 = 9～15 ps：≥ removal 6 ps（slack 3 ps，min-delay）、也 ≤ 60 − 12 − 3 − 2 = 43 ps（recovery slack 28 ps）。沒有同步的話這兩個數字都不存在，釋放隨時可能落進禁止窗而 metastable；三個 flop 的 rst_n 走線若差太多，還可能有的已釋放、有的還在 reset，第一個 edge 抓到 010 這種 state——在 /6 模式下那是 lock-up。
          </li>
          <li>
            <b>Interface path</b>：FF2 → FF_R。launch 在 divider 裡，capture 在 downstream block。skew 通常不為 0：FF_R 的 clock 晚到 10 ps ⇒ setup slack 從 28 變 38（更寬鬆），hold slack 從 7 變 −3（violation）。所以「downstream clock 晚一點比較安全」是錯的——setup 與 hold 的方向相反。
          </li>
          <li>
            <b>Pulse width</b>：clk 最小 high / low 各 20 ps。T = 60 ps 時 duty 必須在 33%～67% 之間；這是 clock 本身的限制，與 setup / hold 是三件不同的事。
          </li>
        </ul>
        <ModeContent level="engineer" title="Timing equation 完整寫法與 STA 的 mode 處理">
          <Math block>{'T_{clk} \\ge t_{CQ,max} + t_{logic,max} + t_{wire,max} + t_{setup} - t_{skew} + t_{jitter} + t_{margin}'}</Math>
          <Math block>{'t_{CQ,min} + t_{logic,min} + t_{wire,min} \\ge t_{hold} + t_{skew}'}</Math>
          <p>
            變數：<Math>{'t_{CQ}'}</Math> clock-to-Q、<Math>{'t_{logic}'}</Math> gate 延遲總和、<Math>{'t_{wire}'}</Math> 走線延遲、<Math>{'t_{setup}/t_{hold}'}</Math> capture flop 的 setup / hold、<Math>{'t_{skew}'}</Math> = capture clock 到達 − launch clock 到達、<Math>{'t_{jitter}'}</Math> edge 間隔不確定量、<Math>{'t_{margin}'}</Math> 設計裕度，單位皆為 ps。
          </p>
          <p>
            在 STA 工具裡，「/5 固定」「/6 固定」對應 <span className="mono">set_case_analysis 0/1 [get_pins FF_M/Q]</span>：工具會把常數傳播進去，OR 被鎖住之後 q0 → OR → AND 的 arc 自動消失。「dual-modulus」則是不下 case analysis 的 functional mode。三種 mode 各跑一次 STA，取最差——這就是 multi-mode STA 的由來。
          </p>
        </ModeContent>
        <ModeContent level="deep" title="如果 mod 只在每個 output 週期更新一次？">
          <p>
            很多 fractional-N 架構的 modulus controller / DSM 跑在 divider 輸出的頻率，也就是 FF_M 的 clock 是 div_out（或它的 retimed 版本），不是 clk。這時 FF_M → OR → AND → FF2.D 變成 <Term zh="產生時脈" en="generated clock" /> path：launch clock 是 q2 的 rising edge（本身就晚了一個 tCQ），mod 新值在 011 → 111 那個 edge 之後才出來，而它被消費的 edge 是離開 110 的那個 edge，中間隔了 2 個 clk edge ⇒ 可用時間 ≈ 2T − tCQ(FF2)，屬於 multicycle path。可用時間變寬，但代價是：
          </p>
          <ul className="small">
            <li>STA 要正確宣告 generated clock 與 multicycle constraint，否則工具會用 1T 去檢查而誤報 violation，或（更糟）宣告錯 cycle 數而漏掉真的 violation。</li>
            <li>hold 仍然要用 launch edge 那一個 edge 來檢查，multicycle 不會放寬 hold。</li>
            <li>OCV / derating：launch 與 capture 用不同的 clock（clk vs div_out），clock 路徑的 PVT 變異不再互相抵消，skew 項要放大。</li>
            <li>每個 gate 的 delay 其實依輸入 pin 與轉換方向而不同（OR 的 mod pin 與 q0 pin 不一定一樣快）；本題把它們設成相同只是為了讓數字乾淨。</li>
          </ul>
        </ModeContent>
      </Section>
    </>
  )
}
