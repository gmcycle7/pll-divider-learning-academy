import { useMemo } from 'react'
import type { LabExercise } from '@/lab/types'
import type { QuizQuestion } from '@/components/quiz/types'
import type { Bit } from '@/models/divider/types'
import { Callout, CodeBlock, CompareTable, Math as M, ModeContent, Section, Steps, Term } from '@/components/content'
import { StateTable } from '@/components/sim/StateTable'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { QuizEngine } from '@/components/quiz/QuizEngine'
import { simulate } from '@/models/divider/engine'
import { detectRuntPulses, measureDivide } from '@/models/divider/analysis'
import { fmtNum } from '@/utils/format'
import { ex7SimOptions, pmux8Div4 } from './advanced-models'
import { ex7Schematic } from './advanced-schematics'
import { ex7Timing } from './advanced-timing'

const T = ex7SimOptions.period ?? 100
const STEP = T / 8

/** sel 的三個 bit */
export function selBits(sel: number): { s0: Bit; s1: Bit; s2: Bit } {
  return { s0: sel & 1 ? 1 : 0, s1: sel & 2 ? 1 : 0, s2: sel & 4 ? 1 : 0 }
}

/** 從 reset 就固定 sel */
function simFixed(sel: number, edges: number, delayMode: 'ideal' | 'real' = 'ideal') {
  return simulate(pmux8Div4, edges, { ...ex7SimOptions, delayMode }, (k) => (k === 1 ? selBits(sel) : {}))
}

/** sel 在第 atEdge 步之前由 0 切到 target（模擬器在 ph0 edge 前 0.55 T 套用） */
function simSwitch(target: number, atEdge: number, edges: number) {
  return simulate(pmux8Div4, edges, ex7SimOptions, (k) => (k === atEdge ? selBits(target) : {}))
}

function Prompt() {
  return (
    <>
      <p>
        左邊有 8 個輸入 ph0～ph7：它們是同一個 VCO 的 8 個相位，頻率相同、rising edge 各差 T/8（duty 50%）。它們全部進到 U1（8:1 MUX），select 是外部的 s2 s1 s0。<b>U2 與 U3 的 clk pin 接的是 n1——MUX 的輸出</b>，不是任何一個 ph。右半邊 U4、U5 你在題目 3 看過。
      </p>
      <p>
        模擬器的「下一個 Clock Edge」以 ph0 為基準推進（edge k 在 t = k·T）；被選中的 phase 的 rising edge 會在同一步稍後發生，state 的變化反映在那一步的「edge 後 state」。輸入（s2 s1 s0）在每一步的 ph0 edge 前 0.55 T 生效。
      </p>
      <p>
        請回答：sel 改變的是<b>除數、duty，還是輸出 edge 的位置</b>？固定 sel = 0 與 sel = 3 各推一次，比較 out 第一個 rising edge 的時間。然後在第 5 步之前把 sel 從 0 切到 4，看 n1 的波形——工作紙第 11 與 15 題就從這裡來。
      </p>
    </>
  )
}

const quiz: QuizQuestion[] = [
  {
    id: 'q1',
    type: 'numeric',
    prompt: 'T = 100 ps。sel 從 0 改成 3（在安全窗內切換），out 的 rising edge 會晚多少 ps？',
    answer: 37.5,
    tolerance: 0.01,
    unit: 'ps',
    explanation: 'n1 從 ph0 換成 ph3，每一個 edge 都晚 3/8 T = 37.5 ps；state 序列不變，所以 out 的每個 edge 也晚 37.5 ps。',
  },
  {
    id: 'q2',
    type: 'single',
    prompt: '固定 sel 之後，sel 的值影響什麼？',
    options: ['除數（sel 越大除得越多）', '只有輸出 edge 的位置（相位），除數固定 4、duty 固定 50%', 'duty cycle', '什麼都不影響'],
    answer: 1,
    explanation: 'n1 永遠是某一個 phase，週期都是 T；U2、U3 每 4 個 n1 edge 一圈。sel 只決定 n1（因此 out）的 edge 在哪個 1/8 T 上。',
  },
  {
    id: 'q3',
    type: 'single',
    prompt: 'sel 從 0 直接切到 4（ph4 = ph0 的反相）時，安全切換窗的寬度是多少？',
    options: ['3/8 T', '1/2 T', '1/8 T', '0——任何時刻兩者 level 都不同'],
    answer: 3,
    explanation: 'ph4 與 ph0 互為反相，沒有任何時刻同 level。往前 k 格的窗寬 (4 − k)/8 T，k = 4 時為 0。這是結構問題，改 delay 救不了。',
  },
  {
    id: 'q4',
    type: 'multiple',
    prompt: '下列哪些敘述正確？',
    options: ['n1 是 generated clock，U2、U3 由它觸發，不是由 ph0', 'sel → U1 → n1 是一條到 U2.D 的 setup path', 'select 在窗外切換造成的 runt 可能比 T/8 還窄，flop 會多數 / 少數一個 edge 或進入 metastable', 'select 應該在舊 phase 與新 phase 同 level 的時候切換'],
    answers: [0, 2, 3],
    explanation: 'sel 路徑的終點是 MUX 輸出（一個 clock），沒有 flop 在等資料——它是 pulse-width / 額外 edge 的問題，不是 data setup。',
  },
  {
    id: 'q5',
    type: 'state',
    prompt: 'sel 固定，從 reset 經過 6 個 n1 rising edge 之後 state（q1q0）是多少？',
    answer: '10',
    width: 2,
    bitNames: ['n4(q1)', 'n2(q0)'],
    explanation: '00 → 01 → 10 → 11 → 00 → 01 → 10。與 sel 無關。',
  },
]

function Solution() {
  const sim0 = useMemo(() => simFixed(0, 10), [])
  const sim3 = useMemo(() => simFixed(3, 10), [])
  const real3 = useMemo(() => simFixed(3, 10, 'real'), [])
  const sw3 = useMemo(() => simSwitch(3, 5, 10), [])
  const sw4 = useMemo(() => simSwitch(4, 5, 10), [])
  const rows = useMemo(
    () =>
      [0, 1, 3, 4, 7].map((sel) => {
        const m = measureDivide(simFixed(sel, 12).traces.find((t) => t.name === 'div_out')!, T)
        return { sel, first: m.risingTimes[0], ratio: m.ratio, duty: m.duty }
      }),
    [],
  )
  const traces3 = useMemo(() => sim3.traces.filter((t) => ['ph0', 'ph3', 'pclk', 'q0', 'q1', 'div_out'].includes(t.name)), [sim3])
  const tracesSw3 = useMemo(() => sw3.traces.filter((t) => ['ph0', 'ph3', 's0', 'pclk', 'div_out'].includes(t.name)), [sw3])
  const tracesSw4 = useMemo(() => sw4.traces.filter((t) => ['ph0', 'ph4', 's2', 'pclk', 'div_out'].includes(t.name)), [sw4])
  const runts4 = useMemo(() => detectRuntPulses([sw4.traces.find((t) => t.name === 'pclk')!], STEP), [sw4])
  const out0 = useMemo(() => measureDivide(sim0.traces.find((t) => t.name === 'div_out')!, T), [sim0])
  const out3 = useMemo(() => measureDivide(sim3.traces.find((t) => t.name === 'div_out')!, T), [sim3])
  const outReal3 = useMemo(() => measureDivide(real3.traces.find((t) => t.name === 'div_out')!, T), [real3])
  const outSw3 = useMemo(() => measureDivide(sw3.traces.find((t) => t.name === 'div_out')!, T), [sw3])
  const outSw4 = useMemo(() => measureDivide(sw4.traces.find((t) => t.name === 'div_out')!, T), [sw4])
  const tSwitch = 5 * T - (ex7SimOptions.inputLead ?? 0.35) * T

  return (
    <>
      <Section title="第一步：8 個候選 clock，真正的 clock 只有一個" en="Which clock?">
        <p>
          工作紙第 1 題的陷阱：8 個 ph 都是 clock 波形，但<b>沒有任何一個直接接到 flop</b>。U2、U3 的 clk pin 接 n1 = U1 的輸出 = ph[sel]。所以 flop 的 clock 是「被選出來的那一個相位」——一個由 MUX 產生的 <Term zh="衍生時脈" en="generated clock" />。s2 s1 s0 只是 MUX 的 select，是 data，沒有接到任何 clk pin，也不是 state（沒有 flop 記住它）。
        </p>
        <p>右半邊：U4 INV 把 n2 反相回 U2.D、U5 XOR 把 n2 與 n4 做 XOR 回 U3.D、out = n4。這就是題目 3 的同步 /4，只是 clock 換成了 n1。</p>
        <Callout kind="idea" title="讀法">
          把 MUX 想成一個「clock 選台器」。8 個台的節目一樣（同頻率、同 duty），只是開播時間各差 T/8。divider 不在乎它收哪一台——它每收到 4 個 rising edge 就輸出一個週期——但 <b>它輸出的 edge 會跟著那一台的時間表走</b>。所以 select 改的是相位，不是除數。
        </Callout>
      </Section>

      <Section title="第二步：sel = 0 逐 edge，再換成 sel = 3" en="Edge by edge, then move the phase">
        <Steps
          items={[
            <>
              <b>Reset</b>：q1q0 = 00，d0 = NOT 0 = 1、d1 = 0 XOR 0 = 0，out = q1 = 0。sel = 0 ⇒ n1 = ph0，第一個 rising edge 在 t = T。
            </>,
            <>
              <b>n1 edge 1（t = T）</b>：q0 ← 1、q1 ← 0 ⇒ <span className="mono">01</span>。新的 d0 = 0、d1 = 0 XOR 1 = 1。
            </>,
            <>
              <b>n1 edge 2（t = 2T）</b>：q0 ← 0、q1 ← 1 ⇒ <span className="mono">10</span>。out 由 0 → 1（t = {out0.risingTimes[0]} ps）。
            </>,
            <>
              <b>edge 3、4</b>：11、00。四個 edge 一圈：/4，out 每 4 T 一個 rising edge（{out0.risingTimes.slice(0, 3).join('、')} ps），high 2 T、duty 50%。
            </>,
            <>
              <b>sel = 3</b>：n1 = ph3，每個 rising edge 在 k·T + 3/8 T。state 序列<b>一模一樣</b>（00 → 01 → 10 → 11），只是每一步都晚 37.5 ps：out 第一個 rising edge 在 {out3.risingTimes[0]} ps，之後 {out3.risingTimes.slice(1, 3).join('、')} ps——間隔仍是 4 T。
            </>,
            <>
              <b>實際 delay</b>：MUX 8 ps 讓 n1 比 ph3 再晚 8 ps，tCQ 8 ps 讓 out 再晚 8 ps ⇒ out rising 在 {outReal3.risingTimes[0]} ps。這 16 ps 是 latency，不是相位控制的一部分——但 8 個輸入若 latency 不同，就變成相位誤差。
            </>,
          ]}
        />
        <p className="small muted">sel = 3（模擬器）：pclk = n1 跟著 ph3 走；state 在 pclk 的 rising edge 改變，模擬器的 edge 編號仍以 ph0 為準。</p>
        <ClockWaveform signals={traces3} tEnd={8 * T} period={T} showEdgeTimes={['div_out']} highlight={['pclk', 'div_out']} deltaBetween={{ a: 'ph0', b: 'pclk', label: 'sel·T/8' }} markers={sim3.records.slice(0, 8).map((r) => ({ t: r.t, label: String(r.edgeIndex), kind: 'edge' as const }))} />
        <StateTable netlist={pmux8Div4} records={sim3.records} period={T} maxRows={6} combSignals={['pclk', 'd0', 'd1']} />
      </Section>

      <Section title="第三步：除數固定、相位可調" en="Fixed ratio, adjustable phase">
        <CompareTable head={['sel', 'out 第一個 rising edge（ps）', '除數', 'duty']} rows={rows.map((r) => [String(r.sel), `${r.first}（= 2T + ${r.sel}·T/8）`, String(r.ratio), r.duty !== null ? `${fmtNum(r.duty * 100)}%` : '—'])} />
        <M block>{'t_{out,k} = 4k\\,T + sel \\cdot \\frac{T}{8} + t_{MUX} + t_{CQ}, \\qquad N = 4,\\qquad \\Delta t_{out} = \\Delta sel \\cdot \\frac{T}{8} = \\Delta sel \\cdot 12.5\\ \\text{ps}'}</M>
        <p>
          <M>{'T'}</M> 為 VCO 週期（ps）、<M>{'k'}</M> 為第幾個輸出週期、<M>{'t_{MUX}'}</M>、<M>{'t_{CQ}'}</M> 為 MUX 與 flop 的固定延遲（ps）。除數永遠是 4，因為不管選哪一台，n1 的週期都是 T。sel 提供的是 8 個等距的相位——這正是 <Term zh="相位選擇除頻器" en="phase-selecting divider, PMUX divider" /> 的用途：<b>用整數 divider 產生 1/8 T 解析度的輸出相位</b>。如果每個輸出週期把 sel 往前轉一格，輸出週期就變成 4 T + T/8，平均除數 4.125——那是題目 8。
        </p>
      </Section>

      <Section title="第四步：換台的瞬間——安全窗、runt 與多出來的 edge" en="Switching window">
        <p>
          切換 sel 的那一瞬間，n1 從「舊 phase 的目前值」跳到「新 phase 的目前值」。如果兩者 level 相同，n1 沒有任何變化，只是之後跟著新 phase 走；如果不同，n1 就<b>當場多出一個 edge</b>（或把正在進行的 pulse 截短）。所以 select 只能在「兩者同 level」的時間切——這叫 <Term zh="安全切換窗" en="safe switching window" />。
        </p>
        <ul>
          <li>
            以 ph_old 的 rising edge 為 t = 0、往前走 k 格：ph_new 在 k/8 T 升起、ph_old 在 1/2 T 落下。<b>兩者都 high 的窗 = [k/8 T, 1/2 T]，寬 (4 − k)/8 T</b>；兩者都 low 的窗 = [1/2 T + k/8 T, T]，同寬。k = 1：37.5 ps；k = 3：12.5 ps；<b>k = 4：0</b>（ph4 是 ph0 的反相）。
          </li>
          <li>
            模擬器在 ph0 edge 前 0.55 T 套用輸入，也就是 ph0 rising 之後 0.45 T：此時 ph0～ph3 為 high、ph4～ph7 為 low。
          </li>
        </ul>
        <div className="two-col">
          <div>
            <p className="small muted">
              <b>0 → 3（在窗內）</b>：t = {tSwitch} ps 時 ph0 = 1、ph3 = 1 ⇒ n1 維持 high，只是 falling edge 從 450 延到 487.5。之後 out rising 在 {outSw3.risingTimes.slice(1, 3).join('、')} ps——比不切換晚 37.5 ps，沒有多餘的 edge。
            </p>
            <ClockWaveform signals={tracesSw3} tStart={3 * T} tEnd={8 * T} period={T} highlight={['pclk']} markers={[{ t: tSwitch, label: 'sel 0→3', kind: 'input' }]} shades={[{ t0: 4 * T + STEP * 3, t1: 4.5 * T, kind: 'safe', label: '都 high', signal: 'pclk' }]} />
          </div>
          <div>
            <p className="small muted">
              <b>0 → 4（沒有窗）</b>：t = {tSwitch} ps 時 ph0 = 1、ph4 = 0 ⇒ n1 立刻落下，450 ps 又被 ph4 拉起：{runts4.length ? `一個 ${runts4[0].width} ps 的 runt low pulse` : '一個 runt'}，而且多出一個 rising edge。U2 / U3 多數了一個 edge，out rising 提前到 {outSw4.risingTimes[1]} ps（應該是 650）。
            </p>
            <ClockWaveform signals={tracesSw4} tStart={3 * T} tEnd={8 * T} period={T} highlight={['pclk']} markers={[{ t: tSwitch, label: 'sel 0→4', kind: 'input' }]} shades={runts4.map((r) => ({ t0: r.t0, t1: r.t1, kind: 'danger' as const, label: 'runt', signal: 'pclk' }))} showPulseWidths={['pclk']} />
          </div>
        </div>
        <Callout kind="warning" title="這不是 setup 問題">
          sel → U1 → n1 這條路徑的終點是一個 clock，不是 flop 的 D。切早、切晚的後果不是「抓到舊資料」，而是 n1 上出現寬度小於 T/8 的 pulse（flop 可能不認、或進入 metastable）或多一個 rising edge（divider 多數一次，輸出相位跳 −T）。工作紙第 15 題要寫的是 <Term zh="脈寬" en="pulse width" /> 與額外 edge，不是 setup / hold。
        </Callout>
        <p>
          <b>control deadline（第 11 題）</b>：select 必須在窗打開（ph_new 升起）之後、窗關閉（ph_old 落下）之前切完，含 wire + MUX select→out 的 16 ps。本題 sel 是外部輸入，所以 launch edge 由上游決定；正確的做法是用 n1 或 ph_old 的 falling edge 重新取樣 sel（把切換固定在「都 low」的窗中央），或改用 glitch-free MUX（先關舊的、再開新的）。
        </p>
      </Section>

      <Section title="第五步：三種完全不同的 path" en="Critical path">
        <Callout kind="method" title="候選路徑（tCQ 8、XOR 12、INV 6、MUX 8 / 12、wire 4、tsetup 7、jitter 2、margin 2）">
          <ol style={{ margin: 0 }}>
            <li>
              <b>divider 的 Fmax</b>：U2.Q → U5 XOR → U3.D（與 U3.Q → U5 → U3.D 並列），launch 與 capture 都是 n1 的 rising edge，可用 1 T。8 + 12 = 20 ps ⇒ Tclk,min = 20 + 7 + 2 + 2 = <b>31 ps</b>。MUX 的 delay 不在這條 path 裡：它同時延後 launch edge 與 capture edge，互相抵消。
            </li>
            <li>
              <b>select 的安全窗</b>：sel → U1（select → out）→ n1，wire 4 + MUX 12 = 16 ps，必須落在 3/8 T = 37.5 ps 的窗內（扣掉 jitter + margin 剩 33.5 ps）。這條限制的是「能安全換台的最小 T」= 16 + 4 ÷ (3/8) ≈ 53 ps，<b>不是 divider 的 Fmax</b>。
            </li>
            <li>
              <b>clock path</b>：ph_k → U1（data → out）→ U2.clk，wire 4 + MUX 8 = 12 ps。它是 latency：8 個輸入的 latency 若不一致，每次換台就帶進固定相位誤差。
            </li>
          </ol>
        </Callout>
        <ModeContent level="engineer" title="Timing equation、generated clock 與 RTL">
          <M block>{'T_{clk,min} \\ge t_{CQ} + t_{XOR} + t_{setup} - t_{skew} + t_{jitter} + t_{margin} = 8 + 12 + 7 - 0 + 2 + 2 = 31\\ \\text{ps}'}</M>
          <M block>{'\\text{window（forward } k\\text{）}:\\; t_{wire} + t_{MUX,sel\\to out} + t_{jitter} + t_{margin} \\le \\frac{4 - k}{8}\\,T \\quad\\Rightarrow\\quad T \\ge \\frac{16 + 4}{3/8} \\approx 53\\ \\text{ps}\\ (k = 1)'}</M>
          <p>
            <M>{'t_{skew}'}</M> = n1 到達 U3 − 到達 U2（ps）。STA 裡 n1 必須被宣告成 8 個 phase 的 generated clock（或用 case analysis 對每個 sel 值各跑一次）；否則工具會把 U2、U3 當成沒有 clock，什麼都不檢查。sel 的 window 檢查 STA 做不到，要用模擬或 clock-gating check 的方式手動加。
          </p>
          <CodeBlock
            title="等效 RTL"
            code={`
module lab_ex7 (
  input  logic [7:0] ph,        // 8 phases, ph[i] rising at k*T + i*T/8
  input  logic [2:0] sel,
  input  logic       rst_n,
  output logic       out
);
  logic n1, q0, q1;
  assign n1 = ph[sel];           // U1：generated clock（combinational MUX）
  always_ff @(posedge n1 or negedge rst_n)
    if (!rst_n) {q1, q0} <= 2'b00;
    else begin
      q0 <= ~q0;                 // U4
      q1 <= q1 ^ q0;             // U5
    end
  assign out = q1;               // /4, 50% duty
endmodule
`}
            note="assign n1 = ph[sel] 合成出來就是 8:1 MUX。sel 若在錯的時間改變，n1 會 glitch——RTL 模擬（zero delay）看不到，要用 SDF 或類比模擬。"
          />
        </ModeContent>
        <ModeContent level="deep" title="MUX 的實作、phase mismatch 與 glitch-free 做法">
          <ul>
            <li>
              <b>MUX tree 的 phase-dependent delay</b>：8:1 MUX 常用兩級 4:1 + 2:1 或 transmission-gate tree。每個輸入到輸出的路徑不同（走過的 gate、寄生電容不同），delay 差幾 ps 是常態。對 divider 而言 12.5 ps 的一格若實際是 10～15 ps，就是 DNL；每次換台這個誤差都出現一次，變成輸出的 spur。修法：對稱的 layout、one-hot select 的 wired-OR 結構、或在 MUX 後面加一級 retiming flop（用另一個乾淨的 clock 重新取樣——但那個 clock 又從哪來？這是 PMUX 設計的核心矛盾）。
            </li>
            <li>
              <b>MUX 是 clock path 的一部分</b>：它的 delay 隨電源、溫度變化與雜訊直接變成 n1 的 jitter。CML MUX 的雜訊通常比 CMOS 好但功耗高；VCO 8 個 phase 的 buffer tree 也要對稱，否則 mismatch 早在 MUX 之前就存在。
            </li>
            <li>
              <b>Glitch-free MUX</b>：把 select 拆成 8 個 enable，各由對應 phase 的 falling edge 重新取樣：舊的 enable 先在 ph_old 落下時關掉，新的 enable 在 ph_new 落下時打開，中間 n1 保持 low。代價是切換 latency（半個到一個 T）與 8 個在 fVCO 工作的 flop。往前走 k 格時 en_old 關 → en_new 開的 handoff path 可用時間是 k/8 T——與 combinational MUX 的窗剛好相反（k 越大越鬆）。
            </li>
            <li>
              <b>Runt 對 flop 的影響</b>：寬度小於 flop 的 min pulse width 時，master latch 可能只部分翻轉——結果是 Q 在很久之後才決定（metastable），比「多數一個 edge」更難 debug，因為它不是每次都發生。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>把 ph0 當成 flop 的 clock</b>：flop 的 clock 是 n1 = ph[sel]。工作紙第 1 題要寫「MUX 輸出」。
            </li>
            <li>
              <b>以為 sel 改變除數</b>：除數固定 4；sel 只移動相位（每格 T/8）。
            </li>
            <li>
              <b>把 select 路徑當 setup path</b>：終點是 clock，不是 D；後果是 runt / 多一個 edge，不是抓錯資料。
            </li>
            <li>
              <b>把 MUX delay 加進 Fmax path</b>：launch 與 capture 都經過同一個 MUX，抵消。它只影響 latency 與 jitter。
            </li>
            <li>
              <b>認為任何兩個 phase 之間都能安全切換</b>：往前 k 格的窗寬 (4 − k)/8 T，k = 4 為 0；往後走要看「都 low」的窗。
            </li>
          </ul>
        </Callout>
      </Section>

      <Section title="解答後自我檢查" en="Self-check">
        <QuizEngine questions={quiz} title="題目 7 自我檢查" storageKey="lab-ex7-pmux8-check" />
      </Section>
    </>
  )
}

const exercise: LabExercise = {
  id: 'ex7-pmux8',
  order: 7,
  title: '八個 clock 進一個 MUX：flop 的 clock 是「被選出來的那一個」',
  difficulty: 4,
  summary: '8-phase PMUX + /4：練習辨認 generated clock、理解 select 只改相位不改除數、看見 select 在窗外切換造成的 runt 與多餘 edge，並分清「divider 的 Fmax」與「安全切換窗」是兩件事。',
  netlist: pmux8Div4,
  schematic: ex7Schematic,
  simOptions: ex7SimOptions,
  reference: {
    q1: '有 8 個候選 clock ph0～ph7（同頻率，rising edge 各差 T/8），但真正接到 U2、U3 clk pin 的是 n1 = U1（8:1 MUX）的輸出 = ph[sel]——一個由 MUX 產生的 generated clock。s2 s1 s0 是 MUX 的 select，不是 clock',
    q2: 'U2（n2 = q0）、U3（n4 = q1）兩個 rising-edge DFF，clock = n1，共用 rst_n。U1 8:1 MUX、U4 INV、U5 XOR 是 combinational',
    q3: 'q1 = Q(U3) = n4（MSB）、q0 = Q(U2) = n2（LSB）；state = q1q0。sel 不是 state（外部輸入，沒有 flop 記住它）',
    q4: '00（reset 後 q1q0 = 00；要等 n1 = ph[sel] 的第一個 rising edge 才開始計數，sel = 0 時在 t = T、sel = 3 時在 1.375 T）',
    q5: 'n1 = ph[sel]，sel = 4·s2 + 2·s1 + s0；d0 = n3 = NOT q0（U4）；d1 = n5 = q1 XOR q0（U5）；out = n4 = q1',
    q6: '00、01、10、11 全部 reachable（2-bit 同步計數器），沒有 unused state、沒有 lock-up；與 sel 無關',
    q7: '00 → 01 → 10 → 11 → 00，每 4 個 n1 rising edge 一圈，與 sel 無關',
    q8: 'out = q1：第 2 個 n1 rising edge 0 → 1、第 4 個 1 → 0、第 6 個再 0 → 1…；n1 的第 k 個 rising edge 在 t = k·T + sel·T/8（實際再加 MUX delay），所以 sel = 0 時 out 在 200、600 ps 升起，sel = 3 時在 237.5、637.5 ps',
    q9: '4（與 sel 無關）：sel 固定時 n1 的週期就是 T，每 4 個 n1 edge 一個 out 週期。sel 改變的是輸出 edge 的位置（每格 T/8 = 12.5 ps），不是除數',
    q10: '50%（q1 high 2 個 n1 週期、low 2 個），與 sel 無關',
    q11: 'sel 必須在「舊 phase 與新 phase 同 level」的安全窗內切換完成。往前 k 格：兩者都 high 的窗從 ph_new 升起（k/8 T）到 ph_old 落下（1/2 T），寬 (4 − k)/8 T（k = 1：37.5 ps；k = 4：0）；都 low 的窗在後半週期同寬。含 wire + MUX 16 ps。切早：n1 被截成短 pulse；切晚：n1 多一個 rising edge。模擬器在 ph0 rising 後 0.45 T 套用輸入，此時 ph0～ph3 high、ph4～ph7 low：0 → 3 乾淨，0 → 4 出現 5 ps runt 並多一個 edge。rst_n 的 recovery / removal 要對 n1（所有 8 個 phase）檢查',
    q12: 'divider 的 Fmax path launch 在 U2.Q（n2）與 U3.Q（n4），launch edge = n1 的 rising edge。select 路徑沒有 launch flop（sel 是外部輸入），它的「t = 0」是窗打開 = ph_new 升起。clock path 的起點是被選中的 ph_k',
    q13: 'U3.D（n5）在下一個 n1 rising edge capture（可用 1 T）。select 路徑沒有 capture flop——「capture」是安全窗關閉（ph_old 落下）。clock path 的終點是 U2 / U3 的 clk pin（latency，不是 capture）',
    q14: 'Fmax：tCQ(8) → U5 XOR(12) → tsetup(7)，Tclk,min = 20 + 7 + 2 + 2 = 31 ps（MUX delay 不在裡面：launch 與 capture 都經過同一個 MUX，抵消）；hold 5 + 8 = 13 ≥ 3。select window：wire(4) + MUX select→out(12) = 16 ps 必須 < 3/8 T − 4 = 33.5 ps ⇒ 能安全換台的 Tmin ≈ 53 ps。clock path：wire(4) + MUX data→out(8) = 12 ps latency',
    q15: '沒有 illegal state。風險全在 n1：select 在窗外切換會讓 n1 出現比 T/8 窄的 runt 或多一個 rising edge——flop 多數 / 少數一個 edge（輸出相位跳 −T），或因 runt 進入 metastable。這是 pulse-width / 額外 edge 的問題，不是 data setup 問題。k = 4（ph4 = ph0 反相）沒有任何安全窗。8 個 phase 經 MUX 的 delay 不一致 → 每次換台帶進固定相位誤差（DNL / spur）；MUX delay 隨 PVT 與電源雜訊變化 → 輸出 jitter',
  },
  hints: [
    '8 個 ph 全部接進 U1（MUX）；U2、U3 的 clk pin 接的是 n1 = MUX 的輸出。所以「clock 是什麼」取決於 s2 s1 s0 選了誰——先把 sel 固定為 0（n1 = ph0），右半邊剩 U4 INV 回 U2.D、U5 XOR 回 U3.D，這和題目 3 一模一樣。推完之後想：sel 換成 3，n1 的每個 edge 搬到哪裡？state 序列會不會變？out 會不會變？',
    'n1 = ph[sel]；d0 = NOT q0；d1 = q1 XOR q0；out = q1。sel = 0 從 00 開始：n1 edge 1（t = T）後 01，edge 2（2T）後 10 ⇒ out 升起在 200 ps，edge 3 後 11，edge 4 後 00。sel = 3：n1 的 rising edge 在 k·T + 3/8 T（模擬器 edge k 的視窗內稍晚發生），state 序列完全相同，只是每個 edge 都晚 37.5 ps ⇒ out 第一次升起在 237.5 ps。sel = 7 呢？相鄰兩次 out rising 的間隔還是 4 T 嗎？',
    '下表是 sel = 000（模擬器預設，n1 = ph0）逐 edge 產生的結果。請把 s0、s1 切成 1（sel = 3）再跑一次，切到「實際 delay」並看 out 的 edge time——比較兩次 rising edge 差多少。然後從 reset 重跑，在第 5 步之前把 s2 切成 1（sel 0 → 4），看 pclk（n1）的波形在 445～450 ps 之間多了什麼、out 的 rising edge 為什麼提前。',
  ],
  Solution,
  criticalPath: ex7Timing,
  Prompt,
}
export default exercise
