/**
 * Bug Lab：八個 divider RTL 的經典 bug。
 *
 * 每個案例的流程固定：設計者想做什麼 → 有 bug 的 RTL → 先預測（按下選項之後才揭曉）→
 * 模擬證據（bug-models 的 netlist，逐 edge 可操作）→ 修正後的 RTL 與模擬 → 深入。
 * 所有數字（除數、runt 寬度、到達時間）都由 engine 算出來，並在 bug-models.test.ts 驗證。
 */
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Callout, CodeBlock, Math as Tex, ModeContent, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { StateDiagram, graphToDiagram } from '@/components/circuit/StateDiagram'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph, detectRuntPulses, measureDivide } from '@/models/divider/analysis'
import { useLocalState } from '@/hooks/useProgress'
import { BUG_RTL, type RtlBlock } from './rtl'
import * as M from './bug-models'
import * as S from './schematics'

const T = 100

// ---------------------------------------------------------------- RTL 區塊（含 synthesizable / behavioral 標示）
export function Rtl({ block, title, note }: { block: RtlBlock; title?: string; note?: ReactNode }) {
  const synth = block.kind === 'synthesizable'
  return (
    <div>
      <div className="control-row small" style={{ marginBottom: '-0.5em' }}>
        <span className={`chip ${synth ? 'chip-ok' : 'chip-warn'}`}>{synth ? 'synthesizable：可直接合成' : 'behavioral：只用來說明行為 / 驗證'}</span>
      </div>
      <CodeBlock title={title ?? block.file} code={block.code} note={note} />
    </div>
  )
}

// ---------------------------------------------------------------- 模組載入時先用 engine 算好的「證據數字」
const combRun = simulate(M.combToggleBug, 8, { period: T, ...M.COMB_LOOP_OPTIONS })
const combRunts = detectRuntPulses(combRun.traces.filter((t) => t.name === 'div_out'), M.RUNT_MIN)
const combTcRise = combRun.traces.find((t) => t.name === 'tc')!.events.find((e) => e.v === 1)!.t

const gateBad = simulate(M.dm12GlitchySel1, 12, { period: T, delayMode: 'real' })
const gateRunts = detectRuntPulses(gateBad.traces.filter((t) => t.name === 'div_out'), M.RUNT_MIN)

const modLateIdeal = measureDivide(simulate(M.dm23ModLate, 15, { period: T, delayMode: 'ideal' }).traces.find((t) => t.name === 'div_out')!, T)
const modLateReal = measureDivide(simulate(M.dm23ModLate, 15, { period: T, ...M.MOD_PATH_OPTIONS }).traces.find((t) => t.name === 'div_out')!, T)
const modRetimedReal = measureDivide(simulate(M.dm23ModRetimed, 18, { period: T, ...M.MOD_PATH_OPTIONS }).traces.find((t) => t.name === 'div_out')!, T)

const off5 = measureDivide(simulate(M.offByOneDiv5, 20, { period: T }).traces.find((t) => t.name === 'div_out')!, T)
const off4 = measureDivide(simulate(M.offByOneFixed, 20, { period: T }).traces.find((t) => t.name === 'div_out')!, T)

const decodeBad = simulate(M.decodeGlitchRipple, 24, { period: T, delayMode: 'real' })
const decodeRunts = detectRuntPulses(decodeBad.traces.filter((t) => t.name === 'div_out'), M.RUNT_MIN)
const decodeBadQ2 = measureDivide(decodeBad.traces.find((t) => t.name === 'q2')!, T)
const decodeGood = simulate(M.decodeRegisteredSync, 32, { period: T, delayMode: 'real' })
const decodeGoodQ2 = measureDivide(decodeGood.traces.find((t) => t.name === 'q2')!, T)
const decodeGoodOut = measureDivide(decodeGood.traces.find((t) => t.name === 'div_out')!, T)

const lockupGraph = buildStateGraph(M.div3Lockup, {})
const recoverGraph = buildStateGraph(M.div3Recover, {})

// ---------------------------------------------------------------- 案例定義
export interface BugCase {
  /** BUG_RTL 的 key */
  id: keyof typeof BUG_RTL
  n: number
  title: string
  titleEn: string
  category: string
  /** 設計者想做什麼 */
  intent: ReactNode
  /** 先預測 */
  question: string
  options: string[]
  answer: number
  /** 揭曉後的解釋（帶著推） */
  explanation: ReactNode
  /** 模擬證據（bug 版） */
  evidence: ReactNode
  /** 修正後的說明與模擬 */
  fix: ReactNode
  /** 工程師 / 深入模式的補充 */
  more?: ReactNode
  lesson?: { id: string; label: string }
}

const LETTERS = ['A', 'B', 'C', 'D', 'E']

export const BUG_CASES: BugCase[] = [
  // ---------------------------------------------------------------- 1
  {
    id: 'noReset',
    n: 1,
    title: '忘記 reset：兩路 /2 的相位',
    titleEn: 'Missing reset',
    category: 'reset',
    intent: (
      <>
        設計者要兩個一模一樣的 /2（例如給 I/Q 兩條 slice 用），希望它們<b>同相</b>。RTL 很短：兩個 always_ff、各自 toggle。少了什麼？兩個 always_ff 都沒有 reset 分支。
      </>
    ),
    question: '沒有 reset 的兩路 /2，上電之後會怎樣？',
    options: [
      '兩路都不會除頻：沒有 reset 的 flop 不會 toggle',
      '兩路各自都是 /2，但相位可能同相也可能反相，而且每次上電不一定一樣',
      'RTL 模擬會看到正常的 /2 波形，所以矽上也一定正常',
      '兩路一定反相（差半個輸出週期）',
    ],
    answer: 1,
    explanation: (
      <>
        <p>
          先問 /2 需不需要 reset 才能除頻：d = NOT q，不管 q 一開始是 0 還是 1，下一個 edge 都會 toggle。所以<b>兩個 state 都合法</b>，沒有 reset 也會除頻。那 reset 決定什麼？決定<b>起始 state</b>，也就是輸出的相位。
        </p>
        <p>
          矽上每個 flop 上電時的值是隨機的（由 mismatch 與雜訊決定）。FFa 從 0 開始、FFb 從 1 開始，兩路就永遠差半個輸出週期（1T）；剛好一樣時才同相。RTL 模擬更慘：q 的初值是 X，~X 還是 X，波形上永遠是紅色的 X——<b>模擬「看起來壞掉」，矽上「時好時壞」</b>，兩邊都不是你要的。
        </p>
      </>
    ),
    evidence: (
      <>
        <p>
          下面用「上電剛好反相」（qa = 0、qb = 1）當初始 state 模擬：兩路都是 /2，但 phase_err = qa XOR qb 永遠是 1。用「從任意 state 啟動」載入 <span className="mono">00</span> 再跑一次，phase_err 會變 0——同一個電路、兩種結果，這就是「時好時壞」。
        </p>
        <DividerSimPanel netlist={M.noResetPair} schematic={S.pairNoResetSch} options={{ initialState: M.NO_RESET_ANTIPHASE }} title="兩個沒有 reset 的 /2（初始 state：qb qa = 10）" allowInitialState showEquations={false} showMeasure={false} compact />
        <Steps
          items={[
            <>初始 qa = 0、qb = 1。兩個 inverter 各自算好 da = 1、db = 0。</>,
            <>edge 1：qa ← 1、qb ← 0。edge 2：qa ← 0、qb ← 1。兩路都在 toggle，都是 /2。</>,
            <>但 qa 與 qb 永遠相反：phase_err = 1。沒有任何一個 edge 能把它們「拉回同相」，因為電路裡沒有任何路徑讓 FFa 知道 FFb 的值。</>,
          ]}
        />
      </>
    ),
    fix: (
      <>
        <p>
          修正很簡單：兩個 flop 共用同一個 rst_n，reset 期間都被清成 0。reset 釋放後的第一個 edge 兩路一起 toggle，之後永遠同相（phase_err = 0）。注意 reset 沒有改變除數（還是 2），只改變了起始相位。
        </p>
        <DividerSimPanel netlist={M.resetPair} schematic={S.pairResetSch} title="共用 rst_n 之後：從 00 出發，永遠同相" showEquations={false} showMeasure={false} compact />
      </>
    ),
    more: (
      <ModeContent level="deep" title="reset 釋放的時間：recovery / removal">
        <p>
          共用 rst_n 之後還有一個問題：rst_n 釋放（0 → 1）的瞬間如果太靠近 clk 的 rising edge，兩個 flop 可能一個「已經離開 reset、抓到 d」、另一個「還在 reset」，第一個 edge 之後又變成反相。這不是 setup / hold（rst_n 不是 data），而是 <Term zh="恢復時間" en="recovery time" />（像 setup：釋放要比 edge 早）與 <Term zh="移除時間" en="removal time" />（像 hold：釋放不能太靠近 edge 之後）。工程上通常把 rst_n 用同一條 clk 的 flop 重新同步（reset synchronizer），讓釋放時間相對 edge 是確定的。
        </p>
      </ModeContent>
    ),
    lesson: { id: 'm8-l1-reset', label: 'Lesson 8-1 Divider 為什麼需要 Reset' },
  },

  // ---------------------------------------------------------------- 2
  {
    id: 'incompleteCase',
    n: 2,
    title: 'case 沒寫完：next 變成 latch',
    titleEn: 'Incomplete case → inferred latch',
    category: 'synthesis',
    intent: (
      <>
        /3 state machine：00 → 01 → 10 → 00。設計者在 always_comb 裡用 case 把三列 state table 抄進去，覺得「11 反正不會出現」，所以沒寫 2'b11，也沒寫 default。
      </>
    ),
    question: '合成工具會把這段 always_comb 變成什麼？',
    options: [
      '純組合邏輯；state = 11 時 next 自動變成 00',
      '純組合邏輯；state = 11 時 next 是隨機值',
      'next[1:0] 前面多出兩個 latch：state = 11 時 next「保持上一次的值」',
      '合成失敗，工具會報 error',
    ],
    answer: 2,
    explanation: (
      <>
        <p>
          always_comb 的意思是「輸出永遠是輸入的函數」。可是 state = 11 時，程式碼<b>沒有任何一行</b>指定 next——那 next 是多少？Verilog 的語意是「保持上一次的值」。組合邏輯沒有記憶，要「保持」就得加 <Term zh="閂鎖器" en="latch" />：合成工具會乖乖幫你加兩個 latch（通常只給 warning，不會 error）。
        </p>
        <p>
          結果是一個「有時是組合邏輯、有時是記憶元件」的怪東西：從 reset 出發看起來完全正常（11 不會出現），但只要 11 出現一次（上電雜訊、SEU、reset 釋放太靠近 edge），下一個 state 取決於 latch「上次記得什麼」，而不是取決於現在的 state。
        </p>
      </>
    ),
    evidence: (
      <>
        <p>
          下面兩個面板<b>同樣</b>從 state 11 出發，唯一的差別是 latch 記得的舊值：左邊 next = 10、右邊 next = 01。按一個 edge，兩邊走到不同的地方——同一個 state 有兩種 next，這在真正的 state machine 裡不可能發生。（case_hit = 0 表示 case 沒有任何一列匹配，latch 關閉。）
        </p>
        <div className="two-col">
          <DividerSimPanel netlist={M.div3IncompleteCase} options={{ initialState: M.LATCH_HISTORY_A }} title="從 11 出發，latch 記得 next = 10" signals={['clk', 'q1', 'q0', 'case_hit', 'n1', 'n0']} showEquations={false} showMeasure={false} showTable={false} compact windowCycles={6} />
          <DividerSimPanel netlist={M.div3IncompleteCase} options={{ initialState: M.LATCH_HISTORY_B }} title="從 11 出發，latch 記得 next = 01" signals={['clk', 'q1', 'q0', 'case_hit', 'n1', 'n0']} showEquations={false} showMeasure={false} showTable={false} compact windowCycles={6} />
        </div>
        <DividerSimPanel netlist={M.div3IncompleteCase} schematic={S.latchBlocksSch} title="從 reset 出發：看起來就是正常的 /3（01 → 10 → 00）" showTable={false} showMeasure compact windowCycles={8} />
      </>
    ),
    fix: (
      <>
        <p>
          規則：<b>always_comb 裡每一個輸出、在每一種輸入組合下都要被指定</b>。最省事的兩個習慣：(1) case 一定寫 default；(2) 在 case 之前先給預設值（next = 2'b00;），再讓 case 覆寫。下面是 default: next = 00 合成出來的電路：d0 = NOR(q1, q0)、d1 = q0 AND NOT q1，沒有 latch，11 一個 edge 就回到 00。
        </p>
        <DividerSimPanel netlist={M.div3Recover} schematic={S.div3RecoverSch} options={{ initialState: { q1: 1, q0: 1 } }} title="default: next = 00：從 11 出發，一個 edge 回到主循環" allowInitialState showMeasure={false} compact windowCycles={8} />
      </>
    ),
    more: (
      <ModeContent level="engineer" title="怎麼在合成報告裡抓到它">
        <ul>
          <li>合成 log 搜尋 <span className="mono">Latch</span>、<span className="mono">inferred latch</span>、<span className="mono">incomplete case</span>；lint 工具（例如 SpyGlass）會直接標出來。</li>
          <li>SystemVerilog 的 <span className="mono">always_comb</span> 比舊的 <span className="mono">always @(*)</span> 好：多數工具對 always_comb 裡推斷出 latch 會給更明顯的 warning，有的可以設成 error。</li>
          <li>用 <span className="mono">unique case</span> / <span className="mono">priority case</span> 可以讓模擬器在「沒有任何一列匹配」時報 runtime warning。</li>
        </ul>
      </ModeContent>
    ),
    lesson: { id: 'm2-l1-div3', label: 'Lesson 2-1 State Machine Divide-by-3' },
  },

  // ---------------------------------------------------------------- 3
  {
    id: 'lockup',
    n: 3,
    title: 'illegal state 鎖死：default 寫成「保持」',
    titleEn: 'Illegal-state lock-up',
    category: 'state',
    intent: (
      <>
        同樣的 /3。這次設計者記得寫 default，但寫成 <span className="mono">default: next = state;</span>——「其他 state 就保持不動」，看起來很保守、很安全。
      </>
    ),
    question: '如果電路因為上電雜訊落到 state 11，之後會發生什麼？',
    options: ['一個 edge 後回到 00', '一個 edge 後回到 10', '永遠停在 11，div_out 固定為 1，直到下一次 reset', '在 11 與 10 之間來回'],
    answer: 2,
    explanation: (
      <>
        <p>
          帶著推一次：state = 11，走 default，next = state = 11。edge 來，state ← 11。再下一個 edge：還是 default、還是 11。每個 edge 都回到自己——這叫 <Term zh="鎖死狀態" en="lock-up state" />。div_out = state[1] = 1 永遠不變，PLL 的 feedback clock 停住，loop 直接失鎖。
        </p>
        <p>
          「保持」在資料暫存器裡是安全的預設值，在 state machine 裡卻是最危險的：它把每一個 illegal state 都變成一個獨立的 lock-up state。
        </p>
      </>
    ),
    evidence: (
      <>
        <div className="two-col">
          <StateDiagram {...graphToDiagram(lockupGraph, 'clk↑')} title="state graph（default: next = state）" width={300} height={230} />
          <div>
            <p className="small">
              主循環：{lockupGraph.mainCycle.join(' → ')}。lock-up state：<b>{lockupGraph.lockup.join(', ') || '（無）'}</b>。
            </p>
            <p className="small">合成後 d0 = XNOR(q1, q0)：00 與 11 時都是 1，所以 11 → (d1 = q0 = 1, d0 = 1) = 11。從電路看得更清楚：XNOR 對 11 的回答跟對 00 一樣。</p>
          </div>
        </div>
        <DividerSimPanel netlist={M.div3Lockup} schematic={S.div3LockupSch} options={{ initialState: { q1: 1, q0: 1 } }} title="從 11 出發：每個 edge 都回到 11" allowInitialState showMeasure={false} compact windowCycles={8} />
      </>
    ),
    fix: (
      <>
        <p>
          default 要指向<b>主循環裡的某個 state</b>（通常是 reset state 00）。這樣 11 → 00 只要一個 edge；更省 gate 的寫法是 11 → 10（d1 = q0，見 RTL 分頁的 div3_fsm.sv），也是一個 edge 回到主循環。兩種都可以，重點是 lockup 集合必須是空的。
        </p>
        <div className="two-col">
          <StateDiagram {...graphToDiagram(recoverGraph, 'clk↑')} title="state graph（default: next = 00）" width={300} height={230} />
          <DividerSimPanel netlist={M.div3Recover} options={{ initialState: { q1: 1, q0: 1 } }} title="從 11 出發：一個 edge 回到 00" showEquations={false} showMeasure={false} showTable={false} compact windowCycles={6} />
        </div>
      </>
    ),
    more: (
      <ModeContent level="deep" title="MMD 與 PMUX 裡的 lock-up 更隱蔽">
        <p>
          兩級 /2 /3 cell 有 16 個 state，其中主循環只用到 6 ～ 7 個；如果每個 cell 的 11 都是「保持」，任何一級鎖死就會讓整個 MMD 的 mod 鏈停住。PMUX 的 enable 鏈也一樣：如果兩個 en 同時為 1（或全部為 0）而沒有回復路徑，輸出會永遠是兩相的 OR（或永遠 0）。分析陌生電路時一律用 buildStateGraph 把整個 state space 列出來，而不是只看主循環。
        </p>
      </ModeContent>
    ),
    lesson: { id: 'm8-l2-self-recover', label: 'Lesson 8-2 Self-Recovering State Machine' },
  },

  // ---------------------------------------------------------------- 4
  {
    id: 'combLoop',
    n: 4,
    title: '組合迴圈：用 assign 做 toggle',
    titleEn: 'Combinational feedback loop',
    category: 'comb loop',
    intent: (
      <>
        有一個 /4 counter（cnt），設計者想在 terminal count（cnt == 3）時把 div_out 反相，得到 /8、50% duty。他寫了一行 <span className="mono">assign div_out = tc ? ~div_out : div_out;</span>——「tc 的時候反相，否則保持」。
      </>
    ),
    question: '這一行 assign 合成 / 模擬之後會怎樣？',
    options: [
      '/8、50% duty，正常',
      'tc = 1 的那段時間 div_out 以 gate delay 自我振盪（ring oscillator）；zero-delay 模擬則卡在無限的 delta cycle',
      'div_out 永遠是 0',
      'tc 每次為 1 時 div_out 只反相一次，跟 flop 一樣',
    ],
    answer: 1,
    explanation: (
      <>
        <p>
          「保持」需要記憶，assign 沒有記憶。assign 的右邊出現了自己（div_out），這是一條<b>沒有 flop 擋住的迴圈</b>。tc = 0 時 div_out = div_out（自己等於自己：模擬器算得出來，但合成後是一條沒有驅動源的 wire，值不確定）。tc = 1 時 div_out = NOT div_out：每過一個 gate delay 就反相一次——這就是 Lesson 0-2 的 ring oscillator。
        </p>
        <p>
          zero-delay 的 RTL 模擬更糟：反相在同一個時間點無限次發生，模擬器會報 iteration limit 或直接 hang。「模擬 hang 住」常常就是組合迴圈的第一個徵兆。
        </p>
      </>
    ),
    evidence: (
      <>
        <p>
          這個面板固定用實際 delay 模擬（zero-delay 的迴圈沒有 fixed point）。engine 在 t = {combTcRise} ps（edge 3 之後 tCQ 8 + AND 6 = 14 ps，state 進入 11）看到 tc 升起，之後 div_out 每 15 ps（always_comb 的 delay）反相一次，直到 edge 4 之後 tc 落下：8 個 edge 內共 <b>{combRunts.length} 個</b>比 {M.RUNT_MIN} ps 窄的 runt pulse，每個寬 {combRunts[0]?.width} ps。
        </p>
        <DividerSimPanel netlist={M.combToggleBug} schematic={S.combLoopSch} options={M.COMB_LOOP_OPTIONS} title="assign div_out = tc ? ~div_out : div_out（實際 delay）" showEquations={false} showTable={false} showMeasure={false} showPulseWidths compact windowCycles={6} />
        <Steps
          items={[
            <>edge 1、2：state 01、10，tc = 0。div_out = div_out：保持初值 0。</>,
            <>edge 3：state ← 11。tCQ + AND 之後 tc = 1。always_comb：div_out = NOT 0 = 1（15 ps 後）。</>,
            <>但 div_out 變了，always_comb 又要重算：div_out = NOT 1 = 0（再 15 ps）。如此反覆，直到 tc 落下。</>,
            <>edge 4：state ← 00，tc = 0。div_out 停在「最後一次反相」的值——是 0 還是 1 取決於 100 ps 裡塞了幾個 15 ps，這個值不是設計出來的。</>,
          ]}
        />
      </>
    ),
    fix: (
      <>
        <p>
          要「在某個條件下反相、否則保持」，就是一個 T flip-flop：把它寫進 always_ff（q2 ← tc ? ~q2 : q2，合成後 d2 = q2 XOR tc）。q2 只在 tc = 1 的那個 edge 反相一次；cnt 每 4 個 edge 產生一次 tc，所以 q2 每 4T 反相一次 ⇒ 週期 8T、duty 50%。
        </p>
        <DividerSimPanel netlist={M.combToggleFixed} schematic={S.combFixedSch} options={{ delayMode: 'real' }} title="toggle 放進 always_ff：q2 = /8、50% duty" showDelayMode showPulseWidths compact windowCycles={10} />
      </>
    ),
    more: (
      <ModeContent level="engineer" title="判斷一段 RTL 有沒有組合迴圈">
        <ul>
          <li>assign 或 always_comb 的<b>左邊訊號</b>出現在自己的右邊（直接或繞過幾個 assign）⇒ 迴圈。</li>
          <li>always_comb 裡「if 沒有 else」「case 沒有 default」是 latch（Bug #2）；「輸出用到自己」是迴圈（本題）。兩者都是「想要記憶卻沒有寫 flop」。</li>
          <li>合成工具會報 <span className="mono">combinational loop</span> / <span className="mono">timing loop</span>；STA 會把迴圈切斷（set_disable_timing），所以 timing report 看起來「沒有 violation」——這是最容易被騙的地方。</li>
        </ul>
      </ModeContent>
    ),
    lesson: { id: 'm0-l2-comb-seq', label: 'Lesson 0-2 Combinational 與 Sequential Logic' },
  },

  // ---------------------------------------------------------------- 5
  {
    id: 'glitchyGate',
    n: 5,
    title: '組合邏輯直接切 clock：glitchy gating',
    titleEn: 'Glitchy clock gating / clock MUX',
    category: 'clock',
    intent: (
      <>
        /1 /2 dual-modulus：sel = 0 時每個 clk pulse 都放行，sel = 1 時每兩個放行一個。設計者用一個 toggle flop（q0）加 <span className="mono">assign en = ~sel | q0;</span> 再 <span className="mono">assign div_out = clk &amp; en;</span>。
      </>
    ),
    question: 'sel = 1 時，div_out = clk & en 的輸出長什麼樣？',
    options: [
      '乾淨的 /2：每兩個 clk 一個完整的 high pulse',
      '每個週期都出現一個比半週期窄很多的 runt pulse，因為 en 在 clk = 1 的期間改變',
      'div_out 永遠是 0',
      '跟 sel = 0 一樣是 /1',
    ],
    answer: 1,
    explanation: (
      <>
        <p>
          追時間（T = 100 ps、tCQ 8 ps、tOR 10 ps、tAND 6 ps）：clk rising edge → q0 在 tCQ（8 ps）後 toggle → en 在再 tOR（10 ps）後改變。也就是說 <b>en 在 clk 已經是 1 的時候才改變</b>（edge 後 18 ps）。AND 的兩個輸入不會同時變，於是兩種 edge 各壞一次：<b>clk 先升、en 後降</b> ⇒ 輸出在 edge 後 6 ps（tAND）升起、在 edge 後 18 + 6 = 24 ps 被切掉 ⇒ 這個 pulse 只有 24 − 6 = <b>18 ps 寬</b>（engine 量到 206 ↑、224 ↓）；<b>clk 先升、en 後升</b> ⇒ 輸出晚 24 ps 才升（124 ↑），直到 clk 自己落下後 6 ps 才落（156 ↓），變成一個只有 32 ps 的窄 pulse。兩種都遠短於應有的 T/2 = 50 ps。
        </p>
        <p>
          這不是 setup / hold 問題（AND 沒有 capture flop），而是 <Term zh="脈波寬度" en="pulse width" /> 問題：後面吃這個 clock 的電路會看到比 T/2 窄很多的 pulse，可能把它當一個 edge、也可能不當——沒有人保證。
        </p>
      </>
    ),
    evidence: (
      <>
        <p>
          實際 delay 模式下，12 個 edge 內 div_out 出現 <b>{gateRunts.length} 個</b> runt（寬度 {gateRunts.length ? [...new Set(gateRunts.map((r) => r.width))].join(' / ') : '—'} ps）。把 Delay 模式切成「理想」，runt 全部消失——這正是為什麼 zero-delay 的 RTL 模擬抓不到這種 bug。
        </p>
        <DividerSimPanel netlist={M.dm12GlitchySel1} schematic={S.dm12GlitchySch} options={{ delayMode: 'real' }} highlights={[S.gatingHighlight]} title="assign div_out = clk & en（sel = 1，實際 delay）" showDelayMode showPulseWidths showEquations={false} showTable={false} showMeasure={false} compact windowCycles={6} />
      </>
    ),
    fix: (
      <>
        <p>
          原則：<b>切 clock 的 enable 只能在 clock 為 0 的期間改變</b>。把 en 用 negedge clk 的 flop 重新取樣：en 在 clk 落下之後才更新，等 clk 再升起時 en 已經穩定，AND 的輸出不是完整的 pulse 就是完全沒有 pulse——沒有半截。（真正的 cell 用 latch-based integrated clock gating cell，原理相同：latch 在 clk = 1 期間不透明。）
        </p>
        <DividerSimPanel netlist={M.dm12FixedSel1} schematic={S.dm12FixedSch} options={{ delayMode: 'real' }} title="en 由 negedge flop 取樣（sel = 1）：乾淨的 /2" showDelayMode showPulseWidths showEquations={false} showTable={false} compact windowCycles={6} />
      </>
    ),
    more: (
      <ModeContent level="deep" title="clock MUX 也是同一件事">
        <p>
          在兩個 clock 之間用組合 MUX 切換（sel 直接接 MUX 的 select），切換瞬間輸出從舊 clock 的目前值跳到新 clock 的目前值：只要兩者不同就是一個 glitch。glitch-free clock MUX 的做法與這裡完全一樣——每一路各有一個用「自己那條 clock 的 negedge」取樣的 enable，先關舊的、再開新的。RTL 分頁 7 的 8-phase select 就是這個結構的 8 路版本。
        </p>
      </ModeContent>
    ),
    lesson: { id: 'm3-l3-div12', label: 'Lesson 3-3 /1 /2 Dual-Modulus Concept' },
  },

  // ---------------------------------------------------------------- 6
  {
    id: 'modLate',
    n: 6,
    title: 'MOD 到得太晚：RTL 對、矽上錯',
    titleEn: 'Modulus control arrives too late',
    category: 'timing',
    intent: (
      <>
        /2 /3 cell 的 mod 來自一段「swallow 決定」邏輯。設計者知道要 retime，所以把決定打進了 sw_r。但 sw_r 之後還要經過一大塊慢的比較 / 選擇邏輯（約 90 ps）才變成 mod。tCQ = 8 ps、AND = 10 ps、T = 100 ps。
      </>
    ),
    question: 'zero-delay 模擬是 /3。加上實際 delay（8 + 90 + 10 = 108 ps > 100 ps）之後，矽上會？',
    options: [
      '還是 /3：多出來的 8 ps 會被下一個 cycle 吸收',
      '變成 /2：d1 在 capture edge 之後 8 ps 才變 1，那個 edge 抓到的是舊的 0，cycle 沒有被吞',
      '變成 /4',
      '輸出出現 runt pulse',
    ],
    answer: 1,
    explanation: (
      <>
        <p>
          這是一條 <Term zh="控制路徑" en="control path" /> 的 setup check。launch：FF_SW 在 edge k（state 剛回到 00 的下一個 edge）送出 sw_r。capture：FF1 在 edge k+1 抓 d1 = q0 AND mod——只有這一個 edge 會用到 mod（state 01 → 10 的那個 edge）。arrival = tCQ + 90 + tAND = 108 ps；required = T − tsetup ≈ 100 − 7 = 93 ps。slack = −15 ps。
        </p>
        <p>
          edge k+1 抓到 d1 = 0 ⇒ state 01 → 00 而不是 → 10。每個週期都是這樣 ⇒ 永遠 /2。RTL 模擬（zero-delay）看不到這件事，因為它把 108 ps 當 0。
        </p>
      </>
    ),
    evidence: (
      <>
        <p>
          engine 的量測：理想模式 ratio = <b>{modLateIdeal.ratio}</b>；實際 delay 模式 ratio = <b>{modLateReal.ratio}</b>。切換下面的 Delay 模式親自比較。實際模式的波形：mod 在 edge 1 之後 98 ps 才升起（1T + 98），d1 在 1T + 108 才升起——比 edge 2（2T）晚 8 ps，而 FF1 在 edge 2 抓到的 d1 是 0。
        </p>
        <DividerSimPanel netlist={M.dm23ModLate} schematic={S.modLateSch} options={M.MOD_PATH_OPTIONS} highlights={[S.modLateHighlight]} title="mod 走 90 ps 的慢邏輯（切換 Delay 模式：理想 = /3，實際 = /2）" showDelayMode showEdgeTimes signals={['clk', 'rst_n', 'q0', 'q1', 'sw_r', 'mod', 'div_out']} compact windowCycles={8} />
        <Steps
          items={[
            <>edge 1（1T）：state 00 → 01；sw_r ← 1（因為 edge 前 div_out = 1）。</>,
            <>1T + 8：sw_r = 1。1T + 98：mod = 1（慢邏輯 90 ps）。1T + 108：d1 = q0 AND mod = 1。</>,
            <>edge 2（2T）：FF1 抓 d1——此時 d1 還是 0（要到 2T + 8 才變 1）⇒ q1 ← 0。q0 抓 d0 = NOR(1, 0) = 0 ⇒ state 00。</>,
            <>state 00 又輸出 div_out = 1，週期 2T。永遠沒有走到 10。</>,
          ]}
        />
      </>
    ),
    fix: (
      <>
        <p>
          慢邏輯的輸入（cfg）是靜態設定，不需要每個 cycle 重算：先打進 ok_r（它的路徑是 multicycle / 靜態的），再讓「緊鄰 cell」的 flop 產生 mod_r = (state == 00) AND ok_r。這樣每 cycle 的路徑只剩 tCQ + 1 個 AND + tsetup ≈ 25 ps，slack 充足。engine 量測：實際 delay 模式 ratio = <b>{modRetimedReal.ratio}</b>（第一個週期因為 ok_r 的 reset 值是 0 而走 /2，之後穩定 /3）。
        </p>
        <DividerSimPanel netlist={M.dm23ModRetimed} options={M.MOD_PATH_OPTIONS} title="mod_r 由緊鄰 cell 的 flop 直接驅動：理想與實際都是 /3" showDelayMode signals={['clk', 'rst_n', 'q0', 'q1', 'ok_r', 'mod_r', 'div_out']} compact windowCycles={10} />
      </>
    ),
    more: (
      <ModeContent level="engineer" title="Timing equation">
        <Tex block>{'t_{arrival} = t_{CQ} + t_{logic} = 8 + 90 + 10 = 108\\ \\text{ps}, \\qquad t_{required} = T - t_{setup} = 100 - 7 = 93\\ \\text{ps}'}</Tex>
        <Tex block>{'slack = t_{required} - t_{arrival} = -15\\ \\text{ps} < 0'}</Tex>
        <p>
          變數：<Tex>{'t_{CQ}'}</Tex> = FF_SW 的 clock-to-Q（ps）；<Tex>{'t_{logic}'}</Tex> = 慢邏輯 + AND 的最大延遲（ps）；<Tex>{'T'}</Tex> = clk 週期（ps）；<Tex>{'t_{setup}'}</Tex> = FF1 的 setup time（ps）。這條 path 只在「state 01 的那個 edge」被 sensitize，但 STA 不知道這件事——它每個 cycle 都會檢查，而且應該檢查，因為 mod 錯一次就是一整個週期的除數錯。
        </p>
      </ModeContent>
    ),
    lesson: { id: 'm3-l2-dm-cell', label: 'Lesson 3-2 /2 /3 Cell State Analysis' },
  },

  // ---------------------------------------------------------------- 7
  {
    id: 'offByOne',
    n: 7,
    title: 'off-by-one：數到 N 才歸零',
    titleEn: 'Off-by-one terminal count',
    category: 'counter',
    intent: (
      <>
        目標 /4。設計者用 3-bit counter，寫 <span className="mono">if (cnt == 3'd4) cnt &lt;= 0;</span>：「數到 4 就歸零」。
      </>
    ),
    question: '這個 counter 的實際除數是？',
    options: ['/3', '/4', '/5', '/8'],
    answer: 2,
    explanation: (
      <>
        <p>
          逐 edge 數：reset 後 cnt = 0。edge 1 → 1、edge 2 → 2、edge 3 → 3。edge 4 之前 cnt = 3，「3 == 4」不成立，所以 +1 → 4。edge 5 之前 cnt = 4，「4 == 4」成立 → 歸零。所以 state 走 0, 1, 2, 3, 4 共 <b>五個</b>，週期 5T。
        </p>
        <p>
          規則：從 0 數到 n_max 再歸零，總共有 n_max + 1 個 state。要 /N，wrap 條件必須是 cnt == N − 1。
        </p>
      </>
    ),
    evidence: (
      <>
        <p>
          engine 量測：ratio = <b>{off5.ratio}</b>、duty = {off5.duty !== null ? `${off5.duty * 100}%` : '—'}（div_out = (cnt == 0) 每個週期只 high 一個 T）。state table 裡可以直接數出 000 → 001 → 010 → 011 → 100 → 000。
        </p>
        <DividerSimPanel netlist={M.offByOneDiv5} schematic={S.offByOneSch} title="cnt == 4 才歸零：五個 state" showEquations={false} compact windowCycles={12} />
      </>
    ),
    fix: (
      <>
        <p>
          改成 cnt == N − 1（= 3）：state 走 0, 1, 2, 3 四個，ratio = <b>{off4.ratio}</b>、duty = {off4.duty !== null ? `${off4.duty * 100}%` : '—'}。習慣上用 localparam N 並寫成 <span className="mono">cnt == N − 1</span>，讓 N 與除數字面上一致。
        </p>
        <DividerSimPanel netlist={M.offByOneFixed} schematic={S.offByOneFixedSch} title="cnt == N − 1 = 3 歸零：四個 state" showEquations={false} compact windowCycles={12} />
      </>
    ),
    more: (
      <ModeContent level="engineer" title="同一家族的 bug：sel 切換時 cnt 已經超過新的 n_max">
        <p>
          programmable divider 用 cnt == n_max 判斷 wrap。若 sel 從 /6 切到 /4 時 cnt 已經是 4 或 5，cnt == 3 永遠不會成立，counter 會一路數到 7 才因 3-bit 溢位繞回 0——engine 上量到第一個 rising edge 在 8T（見 bug-models.test.ts）。防禦寫法：用 <span className="mono">cnt &gt;= n_max</span>，或只在 cnt == 0 時更新 n_max。這也是 Lesson 3-2「mod 什麼時候可以改」的同一個問題：<b>控制訊號只能在 state machine 用得到它之前的安全窗口內改變</b>。
        </p>
      </ModeContent>
    ),
    lesson: { id: 'm1-l3-sync', label: 'Lesson 1-3 Synchronous Counter Divider' },
  },

  // ---------------------------------------------------------------- 8
  {
    id: 'shortPulse',
    n: 8,
    title: 'output pulse 太短：decode 出來的 runt 被下一級數進去',
    titleEn: 'Runt decode pulse feeding the next stage',
    category: 'pulse',
    intent: (
      <>
        ripple /4（q1 用 q0 的 negedge 當 clock），設計者用 <span className="mono">assign div_out = q1 &amp; ~q0;</span> decode state 10，想得到一個 1T 寬的 pulse，再把 div_out 直接當下一級 FF2 的 clock，期待 q2 = /8。
      </>
    ),
    question: 'q2 實際上是？',
    options: [
      '/8，正常',
      '/4：11 → 00 的途中 q0 先降、q1 後降，中間出現 8 ps 的 10 ⇒ decode 出一個 runt，FF2 把它當成一個 edge',
      'q2 永遠是 0',
      '/16',
    ],
    answer: 1,
    explanation: (
      <>
        <p>
          ripple 的本質：q1 的 clock 是 q0，所以 q1 一定比 q0 晚一個 tCQ 才變。看 11 → 00 這個 transition：edge 4 之後 8 ps q0 落下（state 暫時變成 <b>10</b>），再 8 ps 之後 q1 才落下（00）。decode 邏輯 q1 AND NOT q0 在那 8 ps 裡看到的是 10——它不知道那是「路過」，忠實地輸出一個 8 ps 的 pulse。
        </p>
        <p>
          真正的 state 10（edge 2 之後）也產生一個約 1T 的 pulse。所以 div_out 每 4T 有兩個 rising edge：一個真的、一個 runt。FF2 用 div_out 當 clock，兩個都數 ⇒ q2 每 4T toggle 兩次 ⇒ 週期 4T，/4 而不是 /8。
        </p>
      </>
    ),
    evidence: (
      <>
        <p>
          engine（實際 delay）：div_out 出現 <b>{decodeRunts.length} 個</b> runt，寬度 {decodeRunts[0]?.width} ps（= 一個 tCQ）；q2 的量測 ratio = <b>{decodeBadQ2.ratio}</b>。在理想模式下 glitch 寬度是 0、波形上看不見，但 posedge 事件仍然會觸發 FF2——RTL 模擬也會得到 /4，只是很難看出原因。
        </p>
        <DividerSimPanel netlist={M.decodeGlitchRipple} schematic={S.rippleDecodeSch} options={{ delayMode: 'real' }} title="ripple /4 + decode（q1 & ~q0）+ FF2 用 div_out 當 clock" showDelayMode showPulseWidths showEquations={false} showTable={false} showMeasure={false} signals={['clk', 'q0', 'q1', 'div_out', 'q2']} compact windowCycles={9} />
      </>
    ),
    fix: (
      <>
        <p>
          兩件事一起改：(1) 用同步 counter，q0、q1 同一條 clk，state bit 幾乎同時變（仍有 tCQ mismatch，decode 還是可能有小 glitch）；(2) 把 decode 結果先打進一個 flop：div_out 由 FF_OUT 直接驅動，寬度剛好 1T、沒有任何 glitch。代價是輸出晚一個 cycle（latency），這對 divider 通常無所謂。engine：div_out 的 ratio = {decodeGoodOut.ratio}、duty = {decodeGoodOut.duty !== null ? `${decodeGoodOut.duty * 100}%` : '—'}；q2 的 ratio = <b>{decodeGoodQ2.ratio}</b>。
        </p>
        <DividerSimPanel netlist={M.decodeRegisteredSync} schematic={S.syncDecodeRegSch} options={{ delayMode: 'real' }} title="同步 counter + registered decode：q2 = /8" showDelayMode showPulseWidths showEquations={false} showTable={false} signals={['clk', 'q0', 'q1', 'dec', 'div_out', 'q2']} compact windowCycles={12} />
      </>
    ),
    more: (
      <ModeContent level="deep" title="規則：任何要當 clock 用的訊號，必須由 flop 直接驅動">
        <p>
          decode（AND / OR / MUX）的輸出天生會有 glitch，因為多個輸入不會同時變。這對 data path 沒關係——下一個 flop 只在 edge 看值；但對 clock path 是致命的，因為每一個 glitch 都是一個 edge。所以 divider 的輸出如果要給下一級當 clock（MMD 的 f_out、PMUX 的 pclk、PLL 的 feedback），一律「registered output」。順帶一提，這條規則在 STA 裡對應到「generated clock 的 source 必須是 register output」。
        </p>
      </ModeContent>
    ),
    lesson: { id: 'm1-l2-ripple', label: 'Lesson 1-2 Ripple Counter Divider' },
  },
]

// ---------------------------------------------------------------- 單一案例卡片（controlled：prediction 由外部保存）
export function BugCard({ bug, prediction, onPredict, onRetry }: { bug: BugCase; prediction: number | null; onPredict: (i: number) => void; onRetry: () => void }) {
  const revealed = prediction !== null
  const correct = prediction === bug.answer
  const pair = BUG_RTL[bug.id]
  return (
    <div className="panel" id={`bug-${bug.n}`}>
      <div className="panel-title">
        Bug #{bug.n}　{bug.title}
        <span className="muted" style={{ fontWeight: 400, fontSize: '0.85em', marginLeft: '0.5em' }}>{bug.titleEn}</span>
        <span className="chip chip-info" style={{ marginLeft: '0.6em' }}>{bug.category}</span>
        {revealed ? <span className={`chip ${correct ? 'chip-ok' : 'chip-danger'}`}>{correct ? '預測正確' : '預測錯誤'}</span> : <span className="chip">尚未預測</span>}
      </div>
      <p>{bug.intent}</p>
      <Rtl block={pair.buggy} />
      <div className="hint-box">
        <div>
          <b>先預測，再看模擬：</b>
          {bug.question}
        </div>
        <ul className="quiz-opts" style={{ marginTop: '0.4em' }}>
          {bug.options.map((o, i) => {
            const cls = ['quiz-opt', prediction === i ? 'selected' : '', revealed && i === bug.answer ? 'correct' : '', revealed && prediction === i && i !== bug.answer ? 'wrong' : ''].filter(Boolean).join(' ')
            return (
              <li key={i} className={cls} onClick={() => !revealed && onPredict(i)}>
                <input type="radio" checked={prediction === i} readOnly />
                <span>
                  ({LETTERS[i]}) {o}
                </span>
              </li>
            )
          })}
        </ul>
        {!revealed ? <div className="small muted">按一個選項就會揭曉答案並顯示模擬證據。先自己逐 edge 推一次再按。</div> : null}
      </div>
      {revealed ? (
        <>
          <Callout kind={correct ? 'note' : 'warning'} title={correct ? `正確：(${LETTERS[bug.answer]})` : `不對——正確答案是 (${LETTERS[bug.answer]})`}>
            {bug.explanation}
          </Callout>
          <h4>模擬證據（有 bug 的版本）</h4>
          {bug.evidence}
          <h4>修正</h4>
          <Rtl block={pair.fixed} />
          {bug.fix}
          {bug.more}
          <div className="control-row" style={{ marginTop: '0.6em' }}>
            {bug.lesson ? (
              <Link to={`/lesson/${bug.lesson.id}`} className="chip chip-accent">
                對應課程：{bug.lesson.label}
              </Link>
            ) : null}
            <button className="btn btn-sm" onClick={onRetry}>
              重新預測
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------- Bug Lab（八個案例 + 進度）
export const BUG_LAB_STORAGE_KEY = 'pdla.verilog.buglab.v1'
type Predictions = Record<string, number | null>

export function BugLab({ onProgress }: { onProgress?: (done: number, correct: number, total: number) => void }) {
  const [preds, setPreds] = useLocalState<Predictions>(BUG_LAB_STORAGE_KEY, {})
  const done = BUG_CASES.filter((b) => preds[b.id] !== null && preds[b.id] !== undefined).length
  const correct = BUG_CASES.filter((b) => preds[b.id] === b.answer).length
  useEffect(() => {
    onProgress?.(done, correct, BUG_CASES.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, correct])
  return (
    <div>
      <div className="control-row" style={{ marginBottom: '0.6em' }}>
        <span className="chip chip-ok">
          已完成 {done} / {BUG_CASES.length}
        </span>
        <span className="chip">預測正確 {correct}</span>
        <span className="small muted">完成 = 先預測、看過模擬證據與修正。進度存在瀏覽器（key：verilog）。</span>
        {done ? (
          <button className="btn btn-sm" onClick={() => setPreds({})}>
            全部重來
          </button>
        ) : null}
      </div>
      <ul className="small" style={{ columns: 2, marginTop: 0 }}>
        {BUG_CASES.map((b) => (
          <li key={b.id}>
            <a href={`#bug-${b.n}`}>
              #{b.n} {b.title}
            </a>
            {preds[b.id] !== null && preds[b.id] !== undefined ? <span className={`chip ${preds[b.id] === b.answer ? 'chip-ok' : 'chip-danger'}`} style={{ marginLeft: '0.4em' }}>{preds[b.id] === b.answer ? '✓' : '✗'}</span> : null}
          </li>
        ))}
      </ul>
      {BUG_CASES.map((b) => (
        <BugCard key={b.id} bug={b} prediction={preds[b.id] ?? null} onPredict={(i) => setPreds((p) => ({ ...p, [b.id]: i }))} onRetry={() => setPreds((p) => ({ ...p, [b.id]: null }))} />
      ))}
    </div>
  )
}
