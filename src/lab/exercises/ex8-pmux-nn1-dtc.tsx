import { useMemo } from 'react'
import type { LabExercise } from '@/lab/types'
import type { QuizQuestion } from '@/components/quiz/types'
import type { Bit } from '@/models/divider/types'
import { Callout, CodeBlock, CompareTable, Math as M, ModeContent, Section, Steps, Term } from '@/components/content'
import { StateTable } from '@/components/sim/StateTable'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { QuizEngine } from '@/components/quiz/QuizEngine'
import { simulate } from '@/models/divider/engine'
import { measureDivide, stateSequence, valueAt } from '@/models/divider/analysis'
import { rotatingEdges } from '@/models/phase/pmux'
import { accumulate, type DtcConfig } from '@/models/phase/dtc'
import { fmtNum, pct } from '@/utils/format'
import { ex8SimOptions, pmuxWalkerDm23, WALKER_T } from './advanced-models'
import { ex8Schematic } from './advanced-schematics'
import { ex8Timing } from './advanced-timing'

const T = WALKER_T

/** mod / step 的 input 組合 */
export function walkerInputs(mod: Bit, step: number): { mod: Bit; k0: Bit; k1: Bit } {
  return { mod, k0: step & 1 ? 1 : 0, k1: step & 2 ? 1 : 0 }
}

/** 從 reset 固定 mod / step 跑 edges 個 ph0 edge */
export function simWalker(mod: Bit, step: number, edges: number, delayMode: 'ideal' | 'real' = 'ideal') {
  return simulate(pmuxWalkerDm23, edges, { ...ex8SimOptions, delayMode }, (k) => (k === 1 ? walkerInputs(mod, step) : {}))
}

/** 時間 t 的 phase index s（由 s0 s1 s2 三條 trace 讀出） */
export function phaseIndexAt(traces: { name: string; events: { t: number; v: Bit }[] }[], t: number): number {
  const bit = (name: string) => valueAt(traces.find((x) => x.name === name)!, t)
  return bit('s0') + 2 * bit('s1') + 4 * bit('s2')
}

/** 題目 8 Solution 用的 DTC 設定：3 個 coarse bit（PMUX）+ 3 個 fine bit（DTC，每格 T/64） */
export const EX8_DTC_CFG: DtcConfig = { coarseBits: 3, fineBits: 3 }
/** 每個 output 週期加 11/64 T：fine 每次進位、coarse 每 ~6 個週期 wrap 一次 */
export const EX8_DTC_INCREMENT = 11

function Prompt() {
  return (
    <>
      <p>
        這一題只給 block diagram。8-phase VCO 的相位進入 PMUX，PMUX 的輸出 pclk 是 <b>/N /N+1 cell 與 control FSM 的 clock</b>（cell 與題目 5 相同，mod 是外部輸入：0 → /2、1 → /3）。FSM 裡有 6 個 flop：phase index（s2 s1 s0，決定 PMUX 選誰）與 control word（t2 t1 t0）；外部輸入 k1 k0 = step。FSM 也看得到 8 個相位，因為它內部還有一個 8:1 MUX 用來產生 phase index flop 的 clock。cell 的輸出經過 DTC（把 edge 再延後一點點）才是最終的 out；DTC 在模擬 netlist 裡沒有（behavioral），模擬器看到的 output 是 div_out。
      </p>
      <p>
        模擬器的 state 欄位有 8 個 bit：t2 t1 t0 | s2 s1 s0 | q1 q0。先把 k1 k0 = 00 推一遍（mod = 0 與 1），再把 k0 切成 1：注意 s 什麼時候變、pclk 的 high 有沒有被拉長、div_out 相鄰兩次升起差幾個 T。工作紙第 9 題請寫「平均除數」的公式；第 11 題要找出<b>三種</b>不同的 control deadline；第 12～14 題請至少列出<b>三條不同性質</b>的路徑，並指出哪一條最緊——答案可能不在 cell 裡。
      </p>
    </>
  )
}

const quiz: QuizQuestion[] = [
  {
    id: 'q1',
    type: 'numeric',
    prompt: 'mod = 1、step = 3（k1 k0 = 11）時的平均除數是多少？',
    answer: 3.375,
    tolerance: 0.001,
    explanation: 'N + step/8 = 3 + 3/8 = 3.375。每個 output 週期 cell 走 3 個 pclk 週期，其中在 00 的那個 pclk high 被 walker 拉長 3 格 T/8。',
  },
  {
    id: 'q2',
    type: 'single',
    prompt: '哪一條路徑決定這個架構的 fVCO 上限？',
    options: ['cell 的 FF0.Q → NOR → FF0.D（可用 1 T）', 'walker 每走一格：pclk / cclk edge → NOR 或 NEQ → AND3 → INC → NMUX select，必須在 T/8 內完成', 'mod → AND → FF1.D', 'div_out → DTC → out'],
    answer: 1,
    explanation: 'walker 的 select 必須在下一個 phase 的 rising edge 之前換好，可用時間只有 T/8 = 60 ps；48 ps 的邏輯 ⇒ Tvco,min = 416 ps。cell loop 有整整 1 T，鬆得多。',
  },
  {
    id: 'q3',
    type: 'multiple',
    prompt: '關於 phase index 的 wrap（7 → 0）與 carry，下列哪些正確？',
    options: ['若 select 是「一次跳到新的 index」，7 → 0 那一個週期 divider 必須走 N+1，否則輸出 edge 會倒退', '在本題的 walker 架構裡，7 → 0 只是再往前走一格 T/8，不需要額外的 N+1', 'DTC 的 fine code 溢位進 coarse 時，coarse（PMUX index）要多走一格', '平均除數 N + step/8 表示每個週期的瞬時除數都是 N + step/8——在 DSM 型的 fractional divider 也是如此'],
    answers: [0, 1, 2],
    explanation: 'jump-select 從 7/8 T 跳到 0/8 T 等於 edge 往前搬 7/8 T，需要多一個整數 T 補回來（carry → N+1）。walker 每一格都是實體的 +T/8，wrap 沒有特別之處。fine 溢位就是 coarse +1。本題每個週期確實都是 N·T + step·T/8；但 DSM 型的每個週期是整數（N 或 N+1），只有平均才是分數。',
  },
  {
    id: 'q4',
    type: 'state',
    prompt: 'mod = 0、step = 1，從 reset 開始，walker 第一次走完一格之後（約 t = 850 ps）phase index s2 s1 s0 是多少？',
    answer: '001',
    width: 3,
    bitNames: ['s2', 's1', 's0'],
    explanation: 'edge 1 後 t = 1；edge 2 後 cell 回到 00，rot_en = 1、n = 1，ph1 升起時 s ← 1。',
  },
  {
    id: 'q5',
    type: 'numeric',
    prompt: 'walk-start 路徑：PMUX 8 + tCQ 8 + NOR 12 + AND3 6 + INC 6 + NMUX 8 = 48 ps，jitter 2、margin 2，可用時間 T/8。Tvco,min 是多少 ps？',
    answer: 416,
    unit: 'ps',
    explanation: '(48 + 2 + 2) / (1/8) = 416 ps ⇒ fVCO ≤ 2.4 GHz。模擬用的 400 ps 沒有 jitter 才剛好過。',
  },
]

const COMBOS: { mod: Bit; step: number }[] = [
  { mod: 0, step: 0 },
  { mod: 1, step: 0 },
  { mod: 0, step: 1 },
  { mod: 0, step: 2 },
  { mod: 0, step: 3 },
  { mod: 1, step: 1 },
  { mod: 1, step: 3 },
]

function Solution() {
  const simS0 = useMemo(() => simWalker(0, 0, 6), [])
  const simS1 = useMemo(() => simWalker(1, 0, 7), [])
  const simW1 = useMemo(() => simWalker(0, 1, 14), [])
  const realW1 = useMemo(() => simWalker(0, 1, 6, 'real'), [])
  const combos = useMemo(
    () =>
      COMBOS.map(({ mod, step }) => {
        const { traces } = simWalker(mod, step, 40)
        const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T)
        return { mod, step, ratio: m.ratio, duty: m.duty, expected: 2 + mod + step / 8 }
      }),
    [],
  )
  const walk3 = useMemo(() => {
    const { traces } = simWalker(0, 3, 40)
    const m = measureDivide(traces.find((t) => t.name === 'div_out')!, T)
    const rot = rotatingEdges(2, 3, 8, 9)
    // 每個 output rising edge 當下的 phase index（walker 在 edge 之後才開始走）
    const sUsed = m.risingTimes.slice(0, 9).map((t) => phaseIndexAt(traces, t))
    return { m, rot, sUsed }
  }, [])
  const reach = useMemo(() => {
    const { records } = simWalker(0, 1, 160)
    return new Set(stateSequence(pmuxWalkerDm23, records)).size
  }, [])
  const dtc = useMemo(() => accumulate(EX8_DTC_INCREMENT, EX8_DTC_CFG, 8), [])
  const tracesW1 = useMemo(() => simW1.traces.filter((t) => ['ph0', 'ph1', 'ph2', 'pclk', 'cclk', 'rot_en', 'q0', 'div_out'].includes(t.name)), [simW1])
  const outW1 = useMemo(() => measureDivide(simW1.traces.find((t) => t.name === 'div_out')!, T), [simW1])
  const pclkReal = useMemo(() => realW1.traces.find((t) => t.name === 'pclk')!, [realW1])
  const firstLongHigh = useMemo(() => {
    const ev = pclkReal.events
    for (let i = 1; i < ev.length; i++) if (ev[i - 1].v === 1 && ev[i].v === 0 && ev[i].t - ev[i - 1].t > T / 2 + 1) return { t0: ev[i - 1].t, t1: ev[i].t }
    return null
  }, [pclkReal])

  return (
    <>
      <Section title="第一步：三個問題——clock 是誰、state 有幾組、DTC 有沒有 state" en="Clocks, state, and the DTC">
        <ul>
          <li>
            <b>clock</b>：沒有任何 flop 直接吃 ph0～ph7。cell（q1 q0）與 control word（t2 t1 t0）的 clock 是 <b>pclk = ph[s]</b>——PMUX 的輸出，generated clock，週期 T（或被拉長）。phase index（s2 s1 s0）的 clock 是 FSM 內部第二個 MUX 的輸出 <b>cclk = ph[n]</b>，n = s + 1：也就是「下一個 phase」的 rising edge。
          </li>
          <li>
            <b>state</b>：8 個 flop、三組——cell 的 q1q0（題目 5）、目前 phase s、目標 phase t。模擬器把它們排成 t2 t1 t0 s2 s1 s0 q1 q0。
          </li>
          <li>
            <b>DTC</b>：沒有 flop，是純延遲（code 決定延多少）。它不改變 state、不改變除數，只把 out 的 edge 往後搬不到一格 T/8。所以它不在模擬 netlist 裡，但它的 code 有自己的更新 deadline（第六步）。
          </li>
        </ul>
        <p>方程式（模擬器的 equations 面板同樣列出）：</p>
        <ul>
          <li>pclk = ph[s]；d0 = NOR(q1, q0) = div_out；d1 = q0 AND mod（cell 與題目 5 完全相同）</li>
          <li>u = d0 ? (t + step) mod 8 : t，step = 2·k1 + k0——cell 離開 00 的那個 pclk edge 把目標 phase 加 step</li>
          <li>neq = (s ≠ t)；rot_en = d0 AND pclk AND neq；n = (s + rot_en) mod 8；cclk = ph[n]——s 在 ph[n] 的 rising edge 變成 n</li>
        </ul>
        <Callout kind="idea" title="walker 在做什麼">
          題目 7 告訴你：換 phase 要在「新舊 phase 同 level」的窗內切，而且一次跳 4 格沒有窗。這個 FSM 的解法是<b>永遠只跳一格，而且只在舊 phase 為 high、新 phase剛升起的時候跳</b>（兩者都 high）。cell 每回到 00（div_out = 1），walker 就把 s 一格一格往目標 t 走；每走一格，pclk 這個 high pulse 就被拉長 T/8。走 step 格，這個 output 週期就變長 step·T/8。這就是 <Term zh="相位旋轉" en="phase rotation" /> 型 fractional divider 的硬體。
        </Callout>
      </Section>

      <Section title="第二步：step = 0，電路退化成題目 5" en="Static mode">
        <p>k1 k0 = 00 ⇒ step = 0 ⇒ t 永遠是 0 ⇒ s = t ⇒ neq = 0 ⇒ walker 從不啟動，pclk = ph0 固定。cell 的行為完全是題目 5：</p>
        <div className="two-col">
          <div>
            <p className="small muted">mod = 0：q 走 00 → 01 → 00，div_out 每 2 T 升一次（{measureDivide(simS0.traces.find((t) => t.name === 'div_out')!, T).risingTimes.slice(0, 3).map((x) => `${x / T}T`).join('、')}）。</p>
            <StateTable netlist={pmuxWalkerDm23} records={simS0.records} period={T} maxRows={6} combSignals={['pclk', 'd0', 'd1', 'rot_en']} showTime={false} />
          </div>
          <div>
            <p className="small muted">mod = 1：00 → 01 → 10 → 00，每 3 T 升一次。</p>
            <StateTable netlist={pmuxWalkerDm23} records={simS1.records} period={T} maxRows={7} combSignals={['pclk', 'd0', 'd1', 'rot_en']} showTime={false} />
          </div>
        </div>
      </Section>

      <Section title="第三步：step = 1，逐 edge 看 walker 走一格" en="Walker, edge by edge">
        <Steps
          items={[
            <>
              <b>Reset</b>：t = 0、s = 0、q = 00。pclk = ph0，div_out = d0 = 1，neq = 0。k0 切成 1 ⇒ step = 1。
            </>,
            <>
              <b>Edge 1（t = 400，ph0 ↑ = pclk ↑）</b>：cell 00 → 01（div_out 落下）。同一個 edge control word 取樣 u = t + step（因為 edge 前 d0 = 1）⇒ <b>t ← 1</b>。現在 s = 0 ≠ t = 1，neq = 1，但 d0 = 0（cell 在 01），rot_en = 0：walker 等著。
            </>,
            <>
              <b>Edge 2（t = 800，pclk ↑）</b>：cell 01 → 00，div_out 升起（第一個 output 週期 = 2 T）。d0 = 1、pclk = 1、neq = 1 ⇒ <b>rot_en = 1</b> ⇒ n = 1 ⇒ cclk = ph1（此刻 ph1 還是 low）。
            </>,
            <>
              <b>t = 850（ph1 ↑）</b>：cclk 升起 ⇒ <b>s ← 1</b> ⇒ pclk 改跟 ph1。此時 ph0 仍是 high（到 1000）、ph1 剛升起：pclk high → high，<b>沒有多餘的 edge</b>，只是這個 high 會一直到 ph1 落下（1050）才結束——被拉長了 T/8 = 50 ps。s = t ⇒ neq = 0 ⇒ rot_en = 0，walker 停。
            </>,
            <>
              <b>Edge 3（模擬器 t = 1200；pclk ↑ 其實在 1250 = ph1 ↑）</b>：cell 00 → 01，t ← 2。div_out 落下。
            </>,
            <>
              <b>Edge 4（pclk ↑ 在 1650）</b>：cell → 00，div_out 升起：第二個 output 週期 = 1650 − 800 = 850 ps = <b>2.125 T</b>。walker 再走一格（s ← 2，在 1700 = ph2 ↑）。之後每個週期都是 2.125 T，s = 0, 1, 2, …, 7, 0, 1…——7 → 0 只是再走一格，沒有任何特別的事。
            </>,
          ]}
        />
        <p className="small muted">
          模擬器 step = 1、mod = 0 的前 12 個 edge（state = t2t1t0 s2s1s0 q1q0）。rot_en 那一欄為 1 的下一步，s 就前進一格；div_out 相鄰升起的間隔：{outW1.intervals.slice(0, 4).map((x) => `${x}T`).join('、')}。
        </p>
        <StateTable netlist={pmuxWalkerDm23} records={simW1.records} period={T} maxRows={12} combSignals={['pclk', 'd0', 'rot_en', 'cclk']} />
        <p className="small muted">
          波形：pclk 在 rot_en = 1 之後從 ph[s] 換到 ph[s+1]（都 high 時切換），high 被拉長一格。實際 delay 模式下第一個被拉長的 pclk high 從 {firstLongHigh?.t0} 到 {firstLongHigh?.t1} ps（{firstLongHigh ? firstLongHigh.t1 - firstLongHigh.t0 : 0} ps，而不是 200）。
        </p>
        <ClockWaveform signals={tracesW1} tEnd={10 * T} period={T} highlight={['pclk', 'div_out']} showEdgeTimes={['div_out']} showPulseWidths={['pclk']} markers={simW1.records.slice(0, 10).map((r) => ({ t: r.t, label: String(r.edgeIndex), kind: 'edge' as const }))} />
      </Section>

      <Section title="第四步：平均除數 = N + step/8，reachable state 是 (t, s, q) 的組合" en="Average ratio and reachable states">
        <CompareTable head={['mod', 'step', '量測除數', 'N + step/8', 'duty']} rows={combos.map((c) => [String(c.mod), String(c.step), String(c.ratio), fmtNum(c.expected, 3), c.duty !== null ? pct(c.duty) : '—'])} />
        <M block>{'T_{out} = N\\,T + step \\cdot \\frac{T}{8},\\qquad N = 2 + mod,\\qquad \\bar{N} = \\frac{T_{out}}{T} = N + \\frac{step}{8}'}</M>
        <M block>{'D = \\frac{t_{high}}{T_{out}} = \\frac{(1 + step/8)\\,T}{(N + step/8)\\,T} \\quad\\Rightarrow\\quad step = 0:\\ \\tfrac{1}{2},\\ \\tfrac{1}{3};\\qquad mod = 0,\\ step = 1:\\ \\tfrac{1.125}{2.125} \\approx 53\\%'}</M>
        <p>
          <M>{'T'}</M> 為 VCO 週期（ps）、<M>{'\\bar{N}'}</M> 為平均除數（無單位）。div_out high 的長度是 cell 在 00 的那個 pclk 週期——正是被 walker 拉長的那一個，所以 duty 也隨 step 變。
        </p>
        <Callout kind="method" title="瞬時 vs 平均：這個架構和 DSM 型不一樣">
          在題目 5 交替 mod 得到 2.5 時，每個週期是 2 T 或 3 T（整數），<b>平均</b>才是 2.5。這裡每個週期都<b>恰好</b>是 N·T + step·T/8——瞬時值就等於平均值，輸出是等間隔的。代價是需要 8 個 phase 與 T/8 精度的切換；好處是沒有 DSM 的量化雜訊（只剩 phase mismatch）。工作紙第 9 題要寫清楚你算的是哪一種。
        </Callout>
        <p>
          <b>reachable state</b>：step = 0 時 s = t = 0 固定，只剩 cell 的 2～3 個 state。step ≠ 0 時 t 每個週期加 step、s 在 00 期間逐格追上 t，所以 s 只會落後 t 0～step 格，而 t、s 各自走遍 0～7。模擬 step = 1、mod = 0 共 160 個 edge，看到 <b>{reach} 個</b>不同的 8-bit state——遠少於 256。「s 領先 t」、「s 落後超過 step」這類編碼永遠到不了；但 walker 只會往 t 走，任何非法組合最多幾格就追上，沒有 lock-up。
        </p>
      </Section>

      <Section title="第五步：DTC、carry 與「什麼時候必須走 N+1」" en="DTC carry and the modulus">
        <p>
          完整的 fractional 架構是：phase control word 每個 output 週期加 increment（單位 T/64），高 3 bit 是 coarse（PMUX index，每格 T/8），低 3 bit 是 fine（DTC code，每格 T/64）。用 <span className="mono">accumulate</span> 做表，increment = {EX8_DTC_INCREMENT}/64 T：
        </p>
        <div className="scroll-x">
          <table className="state-table">
            <thead>
              <tr>
                <th>週期 k</th>
                <th>accumulator</th>
                <th>coarse（PMUX index）</th>
                <th>fine（DTC code）</th>
                <th>fine → coarse carry</th>
                <th>coarse wrap（7 → 0）</th>
                <th>理想相位（T）</th>
              </tr>
            </thead>
            <tbody>
              {dtc.map((s) => (
                <tr key={s.k} className={s.coarseCarry ? 'current' : ''}>
                  <td>{s.k}</td>
                  <td>{s.accumulator}</td>
                  <td>{s.coarse}</td>
                  <td>{s.fine}</td>
                  <td>{s.fineCarry}</td>
                  <td>{s.coarseCarry ? '1（+1 T）' : '0'}</td>
                  <td>{fmtNum(s.idealPhaseT, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul>
          <li>
            <b>fine 溢位 → coarse +1</b>：DTC 的 code 從 7 回到 0 時，PMUX 要多走一格。這只是數字表示的進位——走一格就是 +T/8，與 fine 的 8 格 × T/64 相同。
          </li>
          <li>
            <b>coarse wrap（7 → 0）→ 整數 carry</b>：index 從 7 變成 0 代表相位「多繞了一整圈」= +1 T。這一個 T <b>必須由某個東西實際產生</b>。在本題的 walker 裡它自動發生（7 → 0 只是再走一格，每格都是實體的 +T/8）。但如果 PMUX 的 select 是「一次跳到新 index」（jump-select），從 7/8 T 跳到 0/8 T 的 edge 反而會<b>倒退 7/8 T</b>——除非那一個週期讓 /N /N+1 cell 走 N+1，用一個整數 T 補回來。這就是「carry 進 modulus」的意思：<M>{'mod_{eff} = mod + carry'}</M>，而且只在這種架構下成立。
          </li>
        </ul>
        <p className="small muted">
          驗證：把「jump-select + carry 併入 modulus」的模型（<span className="mono">rotatingEdges</span>，N = 2、step = 3）算出的 edge 時間，和本題 walker 模擬（mod = 0、step = 3）量到的 div_out rising 時間並排：
        </p>
        <CompareTable
          head={['k', 'jump-select 的 index', 'carry（走 N+1）', 'jump 模型 edge 時間（T）', 'walker 模擬 rising（T，相對第一個）', 'walker 模擬：這個 edge 用的 s']}
          rows={walk3.rot.times.map((tm, i) => [String(i), String(walk3.rot.indices[i]), String(walk3.rot.carries[i]), fmtNum(tm, 3), fmtNum((walk3.m.risingTimes[i] - walk3.m.risingTimes[0]) / T, 3), String(walk3.sUsed[i])])}
        />
        <p>
          兩者完全一致：jump 模型在 index 6 → 1、4 → 7 → 2… 等 wrap 的週期多走一個 T（carry = 1），walker 則是每個週期都實體地多走 3 格。<b>edge 時間單調遞增</b>是唯一的要求；兩種實作用不同的方法達成，DTC / accumulator 的 carry 與 divider 的 modulus 之間<b>沒有</b>脫離架構的固定關係。
        </p>
        <Callout kind="warning" title="coarse 與 fine 必須在同一個週期更新">
          若 PMUX 的 index 已經 +1 但 DTC 的 code 還沒從 7 回到 0（或反過來），那個週期的 edge 就差了整整 T/8——遠大於 DTC 的 LSB。這種「coarse / fine 交接」的錯位是 PMUX + DTC 架構最常見的 spur 來源，也是第六步第三個 deadline 的由來。
        </Callout>
      </Section>

      <Section title="第六步：三種 control deadline" en="Three control deadlines">
        <ol>
          <li>
            <b>mod（整數部分）</b>：與題目 5 相同，只在 cell 處於 01 的 pclk rising edge 被 d1 = q0·mod 取樣，前 tsetup + AND + wire = 21 ps 要穩定。注意這個 edge 的位置隨 s 移動（pclk = ph[s]）。
          </li>
          <li>
            <b>step / phase select（分數部分）</b>：k1 k0 只在 cell 離開 00 的 pclk edge（d0 = 1）被加進 control word，前 21 ps 要穩定；之後 walker 在同一個週期把 s 走到新的 t。walker 每走一格還有一個<b>結構性</b>的 deadline：NMUX 的 select 必須在下一個 phase 升起前換好——只有 T/8（第七步）。
          </li>
          <li>
            <b>DTC code</b>：只能在「上一個 edge 已經走出 DTC、下一個 div_out edge 還沒進來」的空檔更新，大約 N·T − t_DTC,max = N·T − 80 ps；在 edge 穿過 DTC 時改 code，延遲既不是舊值也不是新值。而且它要與 PMUX index 的更新對齊同一個 output 週期。
          </li>
        </ol>
        <p>
          三者都適合用 div_out（或它的 DTC 輸出）的 rising edge 重新取樣：那一刻 cell 剛進入 00，離「取樣 mod 的 01 edge」有 1 T、離「取樣 step 的下一個 edge」也有 1 T（被拉長的那個週期甚至更長），離下一個進 DTC 的 edge 有一整個 N·T。
        </p>
      </Section>

      <Section title="第七步：多條不同類型的 critical path——最緊的在 walker" en="Critical paths">
        <Callout kind="method" title="候選路徑（Tvco = 480 ps、T/8 = 60 ps；tCQ 8、NOR 12、NEQ 10、AND 10、AND3 6、INC 6、MUX 8、tsetup 7、jitter 2、margin 2）">
          <ol style={{ margin: 0 }}>
            <li>
              <b>walk-start（setup-like，可用 T/8）</b>：ph[s] ↑ → PMUX 8 → pclk ↑ → FF0 tCQ 8 → NOR 12（d0）→ AND3 6（rot_en）→ INC 6（n）→ NMUX 8 = <b>48 ps</b>，必須在 ph[s+1] ↑（T/8 後）之前完成。Tvco,min = (48 + 2 + 2) × 8 = <b>416 ps ⇒ fVCO ≤ 2.4 GHz</b>。超過的後果不是 glitch，而是 cclk 沒有 rising edge、這一格走不到、輸出相位少 T/8。
            </li>
            <li>
              <b>walk-loop（setup-like，可用 T/8）</b>：cclk ↑（= ph[s+1] ↑ + NMUX 8）→ PS tCQ 8 → NEQ 10 → AND3 6 → INC 6 → NMUX 8 = 46 ps，必須在 ph[s+2] ↑ 之前完成 ⇒ 400 ps。只有 step ≥ 2 才會用到。
            </li>
            <li>
              <b>PMUX safe window（async）</b>：s 在 ph[s+1] ↑ 之後 8 + 8 ps 更新、PMUX 再 8 ps 切換，此時 ph[s] 還要 3/8 T 才落下：24 ps vs 180 ps 的窗，非常安全——walker 架構的主要好處。
            </li>
            <li>
              <b>cell loop（setup，可用 ≥ 1 T）</b>：tCQ 8 + NOR 12 = 20 ps ⇒ 31 ps。pclk 只會被拉長、不會被縮短，所以 1 T 是最壞情況。cell 完全不是瓶頸。
            </li>
            <li>
              <b>mod / step control（async）</b>：wire 4 + AND 或 ADD 10 = 14 ps 的 deadline，各在特定的 pclk edge 前。
            </li>
            <li>
              <b>DTC latency（output）</b>：20 + 0～60 ps，code-dependent；限制的是 code 的更新窗，不是 Fmax。
            </li>
          </ol>
          <p style={{ margin: '0.4em 0 0' }}>
            step = 0（static mode）時 walker 路徑永遠不被 sensitize，最緊的只剩 cell loop（31 ps）；step ≠ 0 時最緊的是 walk-start（416 ps）。<b>同一個電路，換一個 mode，Tclk,min 差了 13 倍</b>——這就是為什麼 fractional PMUX divider 的 fVCO 上限與整數 divider 完全不同量級。
          </p>
        </Callout>
        <ModeContent level="engineer" title="Timing equation、為什麼 MUX delay 要算兩次、RTL">
          <M block>{'\\frac{T}{8} \\ge t_{PMUX} + t_{CQ} + t_{NOR} + t_{AND3} + t_{INC} + t_{NMUX} + t_{jitter} + t_{margin} \\quad\\Rightarrow\\quad T \\ge 8 \\times (48 + 4) = 416\\ \\text{ps}'}</M>
          <p>
            launch clock（pclk）比 VCO phase 晚 t_PMUX，但 capture 端（ph[s+1] 在 NMUX 的輸入）沒有這段延遲——所以 PMUX 的 delay 算在 path 裡（相當於 −8 ps 的 skew）。NMUX 的 delay 則是「select 換好之後輸出才跟到新 phase」，也算進去。這與題目 7 的 Fmax path 相反：那裡 launch 與 capture 都經過同一個 MUX，抵消。
          </p>
          <M block>{'\\text{cell loop}:\\; T_{pclk,min} = T \\ge t_{CQ} + t_{NOR} + t_{setup} + t_{jitter} + t_{margin} = 31\\ \\text{ps}'}</M>
          <CodeBlock
            title="等效 RTL（walker 部分）"
            code={`
// pclk = ph[s]：cell 與 control word 的 clock；cclk = ph[n]：phase index 的 clock
assign pclk   = ph[s];
assign d0     = ~(q1 | q0);               // cell state 00 ⇒ div_out
assign step   = {k1, k0};
assign neq    = (s != t);
assign rot_en = d0 & pclk & neq;          // 只在舊 phase 為 high 時走
assign n      = s + rot_en;               // 3-bit，7 + 1 wraps to 0
assign cclk   = ph[n];

always_ff @(posedge pclk or negedge rst_n)
  if (!rst_n) begin {q1, q0} <= 2'b00; t <= 3'd0; end
  else begin
    q0 <= d0;  q1 <= q0 & mod;            // /2 /3 cell
    if (d0) t <= t + step;                // 離開 00 時把目標 phase 加 step
  end

always_ff @(posedge cclk or negedge rst_n)
  if (!rst_n) s <= 3'd0;
  else        s <= n;                     // 在新 phase 的 rising edge 才 commit

assign div_out = d0;
`}
            note="兩個 generated clock（pclk、cclk）都由 combinational MUX 產生，STA 要對每個 s 值宣告，並手動加上 T/8 的 select deadline——工具不會自動看到 walker 的約束。"
          />
        </ModeContent>
        <ModeContent level="deep" title="T/8 在真實頻率下有多可怕、以及實際設計怎麼閃">
          <ul>
            <li>
              <b>T/8 的現實</b>：fVCO = 10 GHz 時 T/8 = 12.5 ps，一個 flop 的 tCQ 都不夠。本題 2.4 GHz 的上限是教學用的寬鬆數字。真實設計的做法：(a) 把 walker 的判斷提前——rot_en 與 n 在<b>上一個</b> output 週期就算好（pipeline），select 只剩 MUX 本身；(b) 每個 output 週期只走一格（step ≤ 1，用更多 output 週期累積），deadline 從 T/8 變成 N·T；(c) 改用架構 3（先除再選 8 個 divided phase），MUX 在 fVCO/N 工作，安全窗寬 N 倍。
            </li>
            <li>
              <b>NEQ 的 hazard</b>：t 在 pclk edge 更新、s 在 cclk edge 更新，兩者不同 clock。當 t 由 3 → 4（011 → 100）三個 bit 同時變，比較器可能短暫輸出 0 或 1；rot_en 若因此產生短 pulse、又剛好落在 ph[n] 的 rising edge 附近，s 可能多走或少走一格。本模型用 4-input 的單一 gate 避免 chain hazard；實際設計會把 neq 用 pclk 重新取樣。
            </li>
            <li>
              <b>pclk 被拉長的 high</b>：cell 只看 rising edge，拉長 high 對它無害；但若 cell 是 CML 的 master-slave（slave 在 high 期間透明），拉長的 high 讓 slave 透明更久——q 在這段時間不能有 glitch。這是 walker 架構對 cell 實作的隱含要求。
            </li>
            <li>
              <b>雜訊與 spur</b>：8 個 phase 經 PMUX 的 delay mismatch 直接變成每格的 DNL；DTC 的 INL 決定 fine 的線性度；coarse / fine 交接的 T/8 錯位是最大的 spur；cclk 與 pclk 兩個 MUX 的 delay 隨電源變動是 jitter。相對地，這個架構沒有 DSM 的量化雜訊——它把「雜訊整形」換成了「類比精度」。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>只算 cell 的 loop 就宣布 Fmax</b>：cell 有 1 T，walker 只有 T/8。fractional mode 的上限低了一個量級。
            </li>
            <li>
              <b>把 DTC 的 carry 直接等於 modulus 控制</b>：這只在 jump-select 架構成立；walker 架構的 wrap 只是再走一格。先問「這一個 T 由誰實際產生」。
            </li>
            <li>
              <b>把平均除數當成瞬時除數（或反過來）</b>：本架構每週期都是 N + step/8；DSM 型每週期是整數。工作紙要說清楚。
            </li>
            <li>
              <b>忘記 pclk 的 edge 位置會動</b>：mod 的取樣 edge = ph[s] 的 rising edge，s 每個週期都不同；控制訊號要跟著 pclk 或 div_out 走，不能對 ph0 對齊。
            </li>
            <li>
              <b>把 state 只寫成 q1q0</b>：phase index 與 control word 都是 flop，都是 state；reachable state 是三組的組合。
            </li>
            <li>
              <b>把 walker 超時當成 glitch</b>：後果是「少走一格」（相位誤差 T/8），pclk 本身仍然乾淨；glitch 是題目 7 那種一次跳好幾格的問題。
            </li>
          </ul>
        </Callout>
      </Section>

      <Section title="解答後自我檢查" en="Self-check">
        <QuizEngine questions={quiz} title="題目 8 自我檢查" storageKey="lab-ex8-pmux-nn1-dtc-check" />
      </Section>
    </>
  )
}

const exercise: LabExercise = {
  id: 'ex8-pmux-nn1-dtc',
  order: 8,
  title: 'PMUX + /N /N+1 + DTC：state 有三組、除數是平均值、最緊的路徑只有 T/8',
  difficulty: 5,
  summary: '8-phase PMUX 驅動 /2 /3 cell，FSM 用 walker 每個 output 週期把 phase 往前走 step 格：練習拆解多組 state 與 generated clock、推平均除數 N + step/8、看懂 accumulator / DTC 的 carry 與 modulus 的關係，並在多條不同類型的路徑中找出真正的 fVCO 上限。',
  netlist: pmuxWalkerDm23,
  schematic: ex8Schematic,
  simOptions: ex8SimOptions,
  reference: {
    q1: '8 個 VCO phase 都是候選 clock，但沒有 flop 直接吃它們。cell（q1 q0）與 control word（t2 t1 t0）的 clock 是 pclk = ph[s]（PMUX 輸出，generated clock，週期 T 或被 walker 拉長為 T + step·T/8）；phase index（s2 s1 s0）的 clock 是 cclk = ph[n]（FSM 內部第二個 MUX，n = s + 1，即「下一個 phase」的 rising edge）',
    q2: '8 個 flop：cell 2 個（q1 q0，clock pclk）、control word 3 個（t2 t1 t0，clock pclk）、phase index 3 個（s2 s1 s0，clock cclk）。PMUX、NMUX、NOR、AND、ADD、NEQ、INC 是 combinational；DTC 是純延遲，沒有 state',
    q3: 'state = t2 t1 t0 s2 s1 s0 q1 q0（8 bit）：目標 phase t、目前 phase s、cell state q1q0 三組',
    q4: '00000000（t = 0、s = 0、q = 00）；此時 pclk = ph0、div_out = 1',
    q5: 'pclk = ph[s]；d0 = NOR(q1, q0) = div_out；d1 = q0 AND mod；u = d0 ? (t + step) mod 8 : t，step = 2·k1 + k0；neq = (s ≠ t)；rot_en = d0 AND pclk AND neq；n = (s + rot_en) mod 8；cclk = ph[n]，s ← n 在 cclk rising',
    q6: 'step = 0：s = t = 0 固定，只剩 cell 的 00、01（mod = 0）或 00、01、10（mod = 1）。step ≠ 0：reachable 是 (t, s, q) 的組合——t 每個週期加 step、s 在 cell 處於 00 期間逐格追上 t，所以 s 只落後 t 0～step 格，t、s 各走遍 0～7（含 wrap）。256 個編碼大多 unreachable（例如 s 領先 t），但 walker 只會往 t 走，沒有 lock-up；模擬 step = 1 共 160 個 edge、在 edge 後取樣只看到 17 個 state（walker 中途的組合再多也遠少於 256）',
    q7: 'step = 0：q 走 00 → 01 → 00（mod = 0）或 00 → 01 → 10 → 00（mod = 1），s、t 不動。step = 1、mod = 0（t, s, q）：(0,0,00) → (1,0,01) → (1,0,00) → walker → (1,1,00) → (2,1,01) → (2,1,00) → (2,2,00) → …，s 依序 0,1,2,…,7,0；step = 3：s = 0,3,6,1,4,7,2,5,0…（wrap 7 → 0 只是再走一格）',
    q8: 'div_out = NOR(q1, q0)：cell 進入 00 的 pclk rising edge 由 0 → 1，離開 00 的下一個 pclk rising 由 1 → 0。walker 在 00 期間把 pclk 的 high 拉長 step·T/8，所以相鄰 rising edge 間隔 = N·T + step·T/8（mod = 0、step = 1：2T、4.125T、6.25T…）。經 DTC 再延後 code × T/64',
    q9: '2 或 3（step = 0 時：mod=0 → 2，mod=1 → 3）；step ≠ 0 時平均除數 = N + step/8（N = 2 + mod）：mod=0、step=1 → 2.125，mod=0、step=3 → 2.375，mod=1、step=3 → 3.375。這個架構每個 output 週期都恰好是 N·T + step·T/8，瞬時值等於平均值；DSM 型的每週期是整數、只有平均才是分數',
    q10: 'duty = (1 + step/8) / (N + step/8)：div_out high 的長度是 cell 在 00 的那個 pclk 週期（被拉長的那一個）。mod=0、step=0 → 50%；mod=1、step=0 → 1/3；mod=0、step=1 → 1.125/2.125 ≈ 53%；mod=1、step=3 → 1.375/3.375 ≈ 41%',
    q11: '三種 deadline：① mod 只在 cell 處於 01 的 pclk rising edge 被取樣（d1 = q0·mod），前 tsetup + AND + wire = 21 ps 穩定，而且這個 edge 的位置隨 s 移動；② step（k1 k0）只在 cell 離開 00（d0 = 1）的 pclk edge 被加進 control word，前 21 ps 穩定；③ DTC code 只能在「上一個 edge 已走出 DTC、下一個 div_out edge 還沒到」的空檔更新（約 N·T − 80 ps），並與 PMUX index 的更新對齊同一個週期。另外 walker 每走一格有結構性的 T/8 deadline（見 q14）。三者都適合用 div_out 的 rising edge 重新取樣',
    q12: '最緊的路徑（walk-start）launch 在 cell 的 FF0（q0），launch edge = pclk rising = ph[s] ↑ + PMUX 8 ps；之後每一格（walk-loop）launch 在 phase index flop（s），launch edge = cclk rising = ph[s+1] ↑ + NMUX 8 ps。cell 自己的 loop launch 在 FF0.Q（pclk ↑）；PMUX window 的 launch 是 s 更新（cclk ↑）；mod / step 的 launch 由上游決定',
    q13: 'walker 的「capture」不是 flop 的 D，而是 NMUX 的 select 必須在下一個 phase（ph[s+1] 或 ph[s+2]）的 rising edge 之前換好——可用時間 T/8；超過就是少走一格。cell loop 的 capture 在 FF0.D，下一個 pclk rising（≥ 1 T，pclk 只會被拉長）。PMUX 的 select 要在 ph[s] 落下前換好（3/8 T 的窗）。mod 的 capture 在 FF1.D（state 01 的 pclk edge）、step 的 capture 在 control word flop（d0 = 1 的 pclk edge）',
    q14: 'walk-start：PMUX(8) → tCQ(8) → NOR(12) → AND3(6) → INC(6) → NMUX(8) = 48 ps ≤ T/8 − jitter(2) − margin(2) ⇒ Tvco,min = 52 × 8 = 416 ps（fVCO ≤ 2.4 GHz）。walk-loop：NMUX(8) → tCQ(8) → NEQ(10) → AND3(6) → INC(6) → NMUX(8) = 46 ps ⇒ 400 ps。cell loop：tCQ(8) → NOR(12) → tsetup(7) ⇒ 31 ps（1 T 可用）。PMUX window：NMUX(8) + tCQ(8) + PMUX(8) = 24 ps ≪ 3/8 T = 180 ps。mod / step：wire(4) + AND 或 ADD(10) = 14 ps 的 deadline。DTC：20 + 0～60 ps latency（output path）。step = 0 時只剩 cell loop（31 ps），step ≠ 0 時 walk-start（416 ps）最緊',
    q15: '沒有 lock-up；walker 只在舊、新 phase 都 high 時切換，pclk 沒有 runt、只會被拉長。風險：(1) walker 超過 T/8 deadline → cclk 沒有 rising edge、少走一格（相位少 T/8，不是 glitch）；(2) 若改成「select 一次跳到 t」：跳 4 格沒有安全窗，且 wrap 7 → 0 會讓 edge 倒退 (8 − step)/8 T，必須讓 cell 走 N+1 補一個 T（carry → modulus，只在該架構成立）；(3) coarse（PMUX）與 fine（DTC）更新不同步 → T/8 的 spur；(4) 8 個 phase 經 MUX 的 delay mismatch → DNL、DTC INL、MUX delay 的電源雜訊 → jitter；(5) NEQ 在 t 多個 bit 同時變時的 hazard 可能讓 rot_en 出現短 pulse，若落在 cclk edge 附近會多走或少走一格；(6) DTC code 在 edge 穿過時改變 → 延遲既非舊值也非新值',
  },
  hints: [
    'block 圖上四個方塊，先問每一個「它的 clock 是什麼」：PMUX 沒有 clock（combinational）；/N /N+1 的 clock 是 pclk（PMUX 輸出）；FSM 的 clock 也是 pclk（它另外還看得到 8 個 phase，因為 walker 內部有第二個 MUX 產生 phase index flop 的 clock）；DTC 沒有 clock、沒有 state。再問「誰是 state」：cell 的 q1q0（題目 5）、FSM 裡的 phase index s2s1s0 與 control word t2t1t0——模擬器的 state 欄位就是這三組。先把 k1 k0 = 00（step = 0）：這時 FSM 不動，電路退化成題目 5 加一個固定的 PMUX（題目 7 的一半）。',
    'pclk = ph[s]；cell 與題目 5 相同：d0 = NOR(q1,q0)、d1 = q0·mod、div_out = d0。control word：cell 離開 00 的那個 pclk edge 把 t ← t + step。walker：cell 在 00、pclk 為 high、且 s ≠ t 時，n = s + 1、cclk = ph[n]，在 ph[n] 的 rising edge 把 s ← n；此時舊 phase 仍是 high，pclk 從 high 切到 high——沒有多餘 edge，只是這個 high 被拉長 T/8。step = 1、mod = 0：edge 1（t = 400，ph0↑）cell 00 → 01、t ← 1；edge 2（800）cell → 00、div_out 升、rot_en = 1、n = 1；850 ps ph1 升起 ⇒ s ← 1 ⇒ pclk 改跟 ph1（high 到 1050 而不是 1000）；下一次 pclk 升起在 1250（ph1）而不是 1200。算算 div_out 相鄰兩次升起差多少 T。',
    '下表是 mod = 0、k1 k0 = 00（模擬器預設，step = 0 → 純 /2）的結果，s 與 t 都不動。請把 k0 切成 1（step = 1）再跑：看 s 那三欄每兩個 edge 前進一格、rot_en = 1 的那一步之後 pclk 被拉長；切到「實際 delay」並開 pulse width，量 pclk 的 high 寬度（250 ps 而不是 200）。再把 mod 切成 1、k1 k0 = 11，量 div_out 相鄰 rising edge 的間隔是不是 3.375 T。',
  ],
  Solution,
  criticalPath: ex8Timing,
  Prompt,
}
export default exercise
