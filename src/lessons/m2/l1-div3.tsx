import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { StateDiagram, graphToDiagram } from '@/components/circuit/StateDiagram'
import { div2, div3, div3Lockup, sync4 } from '@/models/divider/examples'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph } from '@/models/divider/analysis'
import type { Netlist, SignalTrace } from '@/models/divider/types'
import { div3Alt } from './models'
import { div3AltSchematic, div3Schematic } from './schematics'
import { div3Timing } from './timing'

// ---------------------------------------------------------------- 預先算好的 state graph（課文與 quiz 共用）
const div3Graph = buildStateGraph(div3, {})
const div3LockupGraph = buildStateGraph(div3Lockup, {})
const div3AltGraph = buildStateGraph(div3Alt, {})

/** 由 engine 產生 quiz 用的波形：clk + 指定訊號（改名為 div_out，避免洩漏答案） */
function wave(nl: Netlist, sig: string, edges = 8): SignalTrace[] {
  const { traces } = simulate(nl, edges, { period: 100 })
  const clk = traces.find((t) => t.name === 'clk')!
  const s = traces.find((t) => t.name === sig)!
  return [clk, { ...s, name: 'div_out', kind: 'output' }]
}

/** 2 變數 K-map：列 = q1，欄 = q0 */
function KMap2({ title, cells, shade }: { title: string; cells: Record<'00' | '01' | '10' | '11', '0' | '1' | 'x'>; shade: ('00' | '01' | '10' | '11')[] }) {
  const cell = (k: '00' | '01' | '10' | '11') => (
    <td
      key={k}
      style={{
        textAlign: 'center',
        width: '3em',
        background: shade.includes(k) ? 'var(--ok-soft)' : undefined,
        fontWeight: cells[k] === 'x' ? 400 : 700,
        color: cells[k] === 'x' ? 'var(--fg-muted)' : undefined,
      }}
    >
      {cells[k]}
    </td>
  )
  return (
    <div>
      <div className="small muted" style={{ marginBottom: '0.2em' }}>
        {title}
      </div>
      <table className="state-table">
        <thead>
          <tr>
            <th>q1 \ q0</th>
            <th>0</th>
            <th>1</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>0</th>
            {cell('00')}
            {cell('01')}
          </tr>
          <tr>
            <th>1</th>
            {cell('10')}
            {cell('11')}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Content() {
  return (
    <>
      <Section title="先用直覺想" en="Intuition">
        <p>
          /2 只需要一個會「翻」的開關：翻兩次回到原點。/3 不能靠翻，因為翻來翻去只有兩種樣子。要每三個 edge 回到原點，電路必須<b>記得自己數到第幾個</b>。
        </p>
        <p>
          想像一個只有三個燈號的交通號誌：綠 → 黃 → 紅 → 綠。每次 clock edge 換一個燈。它有三個「樣子」，走三步回到原點。若把「紅燈亮」當輸出，輸出每三個 edge 出現一次，這就是 divide-by-3。
        </p>
        <Callout kind="idea">
          divider 的「樣子」叫做 <Term zh="狀態" en="state" />。分析或設計任何 divider，第一個問題永遠是：<b>它有幾個 state？每個 edge 從哪個 state 走到哪個 state？</b>divide ratio 就是「走一圈要幾個 edge」。
        </Callout>
      </Section>

      <Section title="需要幾個 state bit？" en="How many state bits">
        <p>
          state 是用 flop 的 Q 存的，每個 flop 一個 bit。n 個 bit 最多能表示 <Math>{'2^n'}</Math> 個 state。/3 需要 3 個 state：
        </p>
        <Math block>{'2^1 = 2 < 3 \\le 2^2 = 4 \\quad\\Rightarrow\\quad n = \\lceil \\log_2 3 \\rceil = 2'}</Math>
        <p>
          一個 flop 只有 2 個 state（那就是 /2），不夠；兩個 flop 有 4 個 state，夠用，但會<b>多出一個</b>。這個多出來的 state 叫 <Term zh="未使用狀態" en="unused state" />（也叫 illegal state）。
        </p>
        <Callout kind="note" title="一般式">
          除數 N 至少需要 <Math>{'n = \\lceil \\log_2 N \\rceil'}</Math> 個 state bit，其中有 <Math>{'2^n - N'}</Math> 個 state 是 unused。N 是 2 的次方時（/2、/4、/8）剛好沒有 unused state，這是 binary counter 那麼「乾淨」的原因；N = 3、5、6、7 就一定有 unused state 要處理。
        </Callout>
      </Section>

      <Section title="先決定 state 序列，再填 next-state table" en="State sequence and next-state table">
        <p>
          兩個 bit 記作 <span className="mono">q1 q0</span>（q1 是 MSB）。最直覺的走法是照二進位數：<span className="mono">00 → 01 → 10 → 00</span>，數 0、1、2 然後歸零。<span className="mono">11</span> 不在序列裡。
        </p>
        <p>
          把「現在 state → 下一個 state」寫成表。下一個 state 就是每個 flop 的 D 在 edge 前必須準備好的值，所以「next q1」欄就是 <span className="mono">d1</span>、「next q0」欄就是 <span className="mono">d0</span>：
        </p>
        <div className="scroll-x">
          <table className="state-table">
            <thead>
              <tr>
                <th>現在 q1</th>
                <th>現在 q0</th>
                <th>state</th>
                <th>d1（next q1）</th>
                <th>d0（next q0）</th>
                <th>next state</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>0</td>
                <td>0</td>
                <td>
                  <b>00</b>
                </td>
                <td>0</td>
                <td>1</td>
                <td>
                  <b>01</b>
                </td>
                <td>reset state</td>
              </tr>
              <tr>
                <td>0</td>
                <td>1</td>
                <td>
                  <b>01</b>
                </td>
                <td>1</td>
                <td>0</td>
                <td>
                  <b>10</b>
                </td>
                <td></td>
              </tr>
              <tr>
                <td>1</td>
                <td>0</td>
                <td>
                  <b>10</b>
                </td>
                <td>0</td>
                <td>0</td>
                <td>
                  <b>00</b>
                </td>
                <td>回到起點</td>
              </tr>
              <tr style={{ opacity: 0.7 }}>
                <td>1</td>
                <td>1</td>
                <td>
                  <b>11</b>
                </td>
                <td>x</td>
                <td>x</td>
                <td>xx</td>
                <td>unused：正常運作不會進來，先填 don't care</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Callout kind="method" title="設計 divider 的固定順序">
          <ol style={{ margin: 0 }}>
            <li>決定除數 N → 需要 N 個 state 的循環。</li>
            <li>決定 state bit 數與每個 state 的編碼。</li>
            <li>填 next-state table；unused state 先填 don't care（x）。</li>
            <li>從 table 推每個 D 的 Boolean equation（用 K-map 或直接觀察）。</li>
            <li>把 don't care 的實際落點<b>反推回來</b>，確認 unused state 進去之後會怎樣。</li>
            <li>決定 output decode。</li>
          </ol>
          分析陌生電路時就反過來走：從 gate 讀出 equation → 填 table → 找循環。
        </Callout>
      </Section>

      <Section title="從 table 推 d1 與 d0" en="Deriving the next-state equations">
        <p>
          先看 <span className="mono">d1</span> 那一欄：00 → 0、01 → 1、10 → 0、11 → x。有沒有一個訊號剛好在 01 時是 1、在 00 與 10 時是 0？就是 <span className="mono">q0</span> 本身。這個選擇等於把 11 那格的 x 填成 1（因為 q0 = 1）。
        </p>
        <p>
          再看 <span className="mono">d0</span>：00 → 1、01 → 0、10 → 0、11 → x。只有 q1 = 0 且 q0 = 0 時是 1。這是 NOR：<span className="mono">d0 = NOT(q1 OR q0)</span>。這個選擇把 11 那格的 x 填成 0。
        </p>
        <div className="two-col">
          <KMap2 title="d1 的 K-map：圈起 q0 = 1 那一欄（含 don't care）" cells={{ '00': '0', '01': '1', '10': '0', '11': 'x' }} shade={['01', '11']} />
          <KMap2 title="d0 的 K-map：只有 00 那格是 1（11 的 x 填 0）" cells={{ '00': '1', '01': '0', '10': '0', '11': 'x' }} shade={['00']} />
        </div>
        <Math block>{'d_1 = q_0, \\qquad d_0 = \\overline{q_1 + q_0} = \\overline{q_1}\\,\\overline{q_0}'}</Math>
        <p>
          現在把 don't care 的實際落點反推回來（設計順序的第 5 步）：state 11 時，<span className="mono">d1 = q0 = 1</span>、<span className="mono">d0 = NOR(1,1) = 0</span>，所以 <span className="mono">11 → 10</span>。10 在主循環上，因此這個設計<b>剛好</b>是自復原的——但這是 K-map 選擇的副產品，不是我們刻意設計的。下面會看到另一種填法會 lock-up。
        </p>
        <ModeContent level="engineer" title="為什麼選最簡單的 cover 就好">
          <p>
            兩個 don't care 都選「讓 equation 最簡」的值：d1 完全不需要 gate（直接接線），d0 只要一個 2-input NOR。next-state logic 越淺，Q → logic → D 的 delay 越小，Fmax 越高。Lesson 8 會討論：如果為了保證所有 unused state 都在 1 個 cycle 內回主循環而多加 gate，代價就是 critical path 變長。
          </p>
        </ModeContent>
      </Section>

      <Section title="Gate-level 電路" en="The circuit">
        <p>兩個 rising-edge DFF 加一個 NOR，就是完整的 /3：</p>
        <LogicDiagram schematic={div3Schematic} showValues={false} />
        <p>先像 Lesson 1-1 一樣找三樣東西：</p>
        <ul>
          <li>
            <b>Clock input</b>：<span className="mono">clk</span> 同時接到 FF0 與 FF1 的 clk pin，兩個 flop 在<b>同一個</b> rising edge 更新（synchronous）。
          </li>
          <li>
            <b>Memory elements</b>：FF0（q0）與 FF1（q1），合起來是 2-bit state。
          </li>
          <li>
            <b>Feedback cone</b>：<span className="mono">q0, q1 → NOR → d0</span>，以及 <span className="mono">q0 → d1</span>（直連）。這兩條決定下一個 state。
          </li>
        </ul>
      </Section>

      <Section title="逐一個 clock edge 操作" en="Edge by edge">
        <p>
          從 reset state 00 開始。每按一次「下一個 Clock Edge」之前，先自己回答：<b>現在 state 是什麼？NOR 已經算好的 d0 是什麼？d1（= q0）是什麼？edge 之後 state 會變成什麼？</b>然後再按，對答案。
        </p>
        <DividerSimPanel netlist={div3} schematic={div3Schematic} title="Divide-by-3 state machine" showDelayMode showPulseWidths />
        <Steps
          items={[
            <>
              <b>初始（reset）</b>：state = 00。NOR 看到 q1 = 0、q0 = 0，算出 d0 = 1；d1 = q0 = 0。兩個 D 已經在 pin 前等著。
            </>,
            <>
              <b>Edge 1（t = 1T）</b>：FF0 抓 d0 = 1、FF1 抓 d1 = 0 ⇒ state = <b>01</b>。edge 過後 NOR 重算：q0 = 1 ⇒ d0 = 0；d1 = q0 = 1。
            </>,
            <>
              <b>Edge 2（t = 2T）</b>：FF0 抓 0、FF1 抓 1 ⇒ state = <b>10</b>。此時 q1 = 1，<b>輸出 div_out 變成 1</b>。NOR 重算：q1 = 1 ⇒ d0 = 0；d1 = q0 = 0。
            </>,
            <>
              <b>Edge 3（t = 3T）</b>：FF0 抓 0、FF1 抓 0 ⇒ state = <b>00</b>。回到起點，div_out 回到 0。
            </>,
            <>
              <b>結論</b>：state 序列 00 → 01 → 10 → 00 → …，每 3 個 edge 重複。div_out 的 rising edge 在 edge 2、edge 5、edge 8 …，間隔 <b>3T</b>。div_out 在 edge 2 變 1、edge 3 變 0：high 1T、low 2T。
            </>,
          ]}
        />
        <p>
          切到「實際 delay」模式再看一次：q0、q1 在 edge 後 tCQ = 8 ps 才變；d0 再晚 12 ps（NOR delay）才變。d1 = q0 沒有 gate，所以 d1 和 q0 同時變。這兩個時間差就是下面 critical path 要算的東西。
        </p>
      </Section>

      <Section title="State diagram 與 unused state 的去向" en="State diagram and the unused state">
        <p>
          把 table 畫成圖，四個 state 都要畫出來，包括不在主循環裡的 11。虛線圓表示「從 reset 出發到不了」的 state。
        </p>
        <div className="two-col">
          <StateDiagram {...graphToDiagram(div3Graph, 'clk↑')} width={320} height={250} title="div3：11 → 10，一個 edge 回到主循環" />
          <div>
            <p>
              從 11 出發會怎樣？用上面推出來的 equation：d1 = q0 = 1、d0 = NOR(1,1) = 0 ⇒ 下一個 state 是 10。10 在主循環上，所以再下一個 edge 就是 00，之後正常除頻。
            </p>
            <p>
              自己驗證：在下面的模擬器輸入初始 state <span className="mono">11</span> 並載入，按兩個 edge。第一個 edge 之後應該看到 10，第二個之後 00。
            </p>
            <p className="small muted">上電之後 flop 的值是不保證的（Lesson 8）。如果剛好是 11，這個電路會自己回到主循環，只是輸出多了一個亂掉的 cycle。</p>
          </div>
        </div>
        <DividerSimPanel netlist={div3} schematic={div3Schematic} title="從任意 state 啟動（試試 11）" allowInitialState compact showEquations={false} showMeasure={false} />
        <h3>對照：一個會 lock-up 的 /3</h3>
        <p>
          同樣的序列 00 → 01 → 10，但 d0 改用 XNOR：<span className="mono">d0 = XNOR(q1, q0)</span>。在三個合法 state 上它和 NOR 給的值一模一樣（00 → 1、01 → 0、10 → 0），所以正常運作完全看不出差別。差別只在 11 那格：XNOR(1,1) = 1。
        </p>
        <div className="two-col">
          <StateDiagram {...graphToDiagram(div3LockupGraph, 'clk↑')} width={320} height={250} title="div3Lockup：11 → 11，永遠出不來" />
          <div>
            <p>
              state 11 時 d1 = q0 = 1、d0 = 1 ⇒ 下一個 state 還是 11。這叫 <Term zh="鎖死狀態" en="lock-up state" />：一旦進去（上電、雜訊、reset 沒接好），輸出永遠停在 1，只有 reset 能救。
            </p>
            <p>下面的模擬器直接從 11 啟動。不管按幾個 edge，state 都不會動。</p>
          </div>
        </div>
        <DividerSimPanel netlist={div3Lockup} title="div3Lockup 從 11 啟動" options={{ initialState: { q0: 1, q1: 1 } }} compact showEquations={false} showMeasure={false} allowInitialState />
        <CompareTable
          head={['', 'd0 = NOR(q1, q0)', 'd0 = XNOR(q1, q0)']}
          rows={[
            ['合法 state 的行為', '00 → 01 → 10 → 00', '00 → 01 → 10 → 00（完全相同）'],
            ['11 的下一個 state', '10（1 個 edge 回主循環）', '11（lock-up）'],
            ['需要 reset 才能除頻？', '不需要（但輸出相位不定）', '需要，且 reset 後不能再被干擾'],
            ['gate', '2-input NOR', 'XNOR（較慢、較大）'],
          ]}
        />
        <Callout kind="warning" title="怎麼把 unused state 拉回主循環">
          填 don't care 的時候不要只看「equation 最簡」，要把每個 unused state 代進 equation，確認它的下一個 state 在主循環上或能在幾步內到達主循環。例如把 d1 改成 <span className="mono">q0 AND NOT q1</span>，11 就會直接走到 00（examples 裡的 div3Recover）。Lesson 8-2 會系統性地做這件事並比較速度與面積的代價；這一課先記住：<b>每一個 2^n − N 的 unused state 都要問一次「進去之後出得來嗎」</b>。
        </Callout>
      </Section>

      <Section title="Output decode 與 duty cycle" en="Output decode and duty cycle">
        <p>
          三個 state 各自的輸出是什麼？我們選 <span className="mono">div_out = q1</span>，直接用一個 state bit 當輸出，不需要額外 gate：
        </p>
        <div className="scroll-x">
          <table className="state-table">
            <thead>
              <tr>
                <th>state</th>
                <th>停留時間</th>
                <th>div_out = q1</th>
                <th>另一種：q0</th>
                <th>另一種：q1 OR q0</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>00</td>
                <td>1T</td>
                <td>0</td>
                <td>0</td>
                <td>0</td>
              </tr>
              <tr>
                <td>01</td>
                <td>1T</td>
                <td>0</td>
                <td>1</td>
                <td>1</td>
              </tr>
              <tr>
                <td>10</td>
                <td>1T</td>
                <td>1</td>
                <td>0</td>
                <td>1</td>
              </tr>
              <tr>
                <th>high 時間 / 週期</th>
                <th>3T</th>
                <th>1T / 3T = 33%</th>
                <th>1T / 3T = 33%</th>
                <th>2T / 3T = 67%</th>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          每個 state 停留剛好 1T（因為 state 只在 rising edge 換）。輸出在哪些 state 是 1，high 時間就是幾個 T。3 個 state 裡不管挑幾個當 1，high 時間只能是 1T 或 2T，<b>永遠不會是 1.5T</b>。
        </p>
        <Math block>{'D = \\frac{t_{high}}{T_{out}} = \\frac{k\\,T_{in}}{3\\,T_{in}} = \\frac{k}{3},\\quad k \\in \\{1, 2\\} \\;\\Rightarrow\\; D \\ne 50\\%'}</Math>
        <p>
          其中 <Math>{'t_{high}'}</Math> 是輸出 high 的時間（ps），<Math>{'T_{out}'}</Math> 是輸出週期（ps），<Math>{'T_{in}'}</Math> 是輸入 clock 週期（ps），k 是輸出為 1 的 state 個數。
        </p>
        <Callout kind="pitfall" title="最簡單的 /3 沒有 50% duty">
          只用 rising edge 做的奇數除頻器，輸出的 edge 都對齊輸入的 rising edge，high 時間一定是整數個 T，duty 一定是 k/N，N 為奇數時不可能等於 1/2。要 50% 就必須用到輸入 clock 的 falling edge——這是 Lesson 2-2 的主題。
        </Callout>
      </Section>

      <Section title="Divide ratio 的數學推導" en="Deriving the divide ratio">
        <p>
          設輸入週期 <Math>{'T_{in}'}</Math>。state 每個 rising edge 走一步，主循環有 3 個 state，所以回到同一個 state 需要 3 個 edge。div_out = q1 只在 state 10 為 1，每圈出現一次 rising edge：
        </p>
        <Math block>{'T_{out} = 3\\,T_{in},\\qquad f_{out} = \\frac{f_{in}}{3},\\qquad N = \\frac{T_{out}}{T_{in}} = 3'}</Math>
        <p>
          一般式：一個 synchronous state machine 的主循環有 N 個 state、輸出在每圈只有一次 0 → 1，除數就是 N。<b>除數 = 主循環長度</b>，與 state bit 數無關（2 個 bit 可以做 /3，也可以做 /4）。
        </p>
        <ModeContent level="engineer" title="用 measureDivide 驗證">
          <p>
            上面模擬器下方的量測列會顯示「output rising edge 間隔 = 3T, 3T, …⇒ 平均 divide ratio = 3，duty ≈ 33.3%」。它是直接從 engine 產生的 event 量的，不是預先寫死的數字——你改了電路（例如練習題），它會跟著變。
          </p>
        </ModeContent>
      </Section>

      <Section title="這個架構的 critical path" en="Critical path">
        <p>
          /2 只有一條 register-to-register path。/3 有兩個 flop，先把所有「從某個 Q 出發、經過（或不經過）logic、到某個 D」的路徑列出來：
        </p>
        <ol>
          <li>
            <span className="mono">FF0.Q → NOR → FF0.D</span>：q0 變 → d0 變。
          </li>
          <li>
            <span className="mono">FF1.Q → NOR → FF0.D</span>：q1 變 → d0 變。
          </li>
          <li>
            <span className="mono">FF0.Q → FF1.D</span>：q0 直接接 d1，沒有 gate。
          </li>
        </ol>
        <p>
          每一條都問同樣的問題：launch 在哪個 flop 的哪個 edge？經過哪些 gate？capture 在哪個 flop的哪個 edge？可用時間多少？在下面的 explorer 逐步走一次，然後切到 Hold 分頁看第 3 條。
        </p>
        <CriticalPathExplorer scenario={div3Timing} guided />
        <Callout kind="method" title="讀 explorer 的結果">
          <ul style={{ margin: 0 }}>
            <li>
              <b>Setup 最緊</b>：兩條經過 NOR 的路徑（arrival = tCQ + tNOR = 20 ps）。它們決定 Fmax：T<sub>clk,min</sub> = 20 + 7 + 2 + 2 = 31 ps。
            </li>
            <li>
              <b>Hold 最緊</b>：FF0.Q → FF1.D 直連。min delay 只有 tCQ,min + wire = 6 ps，thold = 3 ps，slack 3 ps。它不限制 Fmax，但只要 FF1 的 clock 比 FF0 晚到 3 ps 以上就會出錯——而且降頻救不了。
            </li>
            <li>
              <b>不要把最長的線當 critical path</b>：q1 → NOR 那條回授線在圖上最長，但它的 delay 和 q0 → NOR 一樣；真正決定 slack 的是 tCQ + gate delay，不是線的長度。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="Timing equation">
          <p>Setup（經過 NOR 的路徑，launch edge k、capture edge k+1）：</p>
          <Math block>{'T_{clk,min} \\ge t_{CQ,max} + t_{NOR,max} + t_{setup} - t_{skew} + t_{jitter} + t_{margin} = 8 + 12 + 7 - 0 + 2 + 2 = 31\\ \\text{ps}'}</Math>
          <p>Hold（直連路徑，launch 與 capture 同一個 edge）：</p>
          <Math block>{'t_{CQ,min} + t_{wire,min} \\ge t_{hold} + t_{skew} \\quad\\Rightarrow\\quad 5 + 1 = 6 \\ge 3 + t_{skew}'}</Math>
          <p>
            變數：<Math>{'t_{CQ}'}</Math> = clock edge 到 Q 穩定；<Math>{'t_{NOR}'}</Math> = NOR propagation delay；<Math>{'t_{setup}, t_{hold}'}</Math> = capture flop 的 setup / hold；<Math>{'t_{skew}'}</Math> = capture clock 到達 − launch clock 到達；<Math>{'t_{jitter}'}</Math> = 相鄰 edge 間隔的不確定量；<Math>{'t_{margin}'}</Math> = 設計裕度。單位皆為 ps。hold 條件告訴我們：FF0 → FF1 的 skew 最多 3 ps。
          </p>
          <p>
            skew 的方向這樣想：capture（FF1）的 clock 晚到，等於 FF1 看到的 edge 往後移；launch（FF0）已經在原來的 edge 把新 q0 送出，FF1 就有機會在「移後的 edge」抓到新值——hold 變嚴格。反過來，晚到的 capture edge 給 setup 更多時間。
          </p>
        </ModeContent>
        <ModeContent level="deep" title="高速實作會遇到的事">
          <ul>
            <li>
              <b>NOR 還是 NAND</b>：靜態 CMOS 的 2-input NOR 有兩個串疊 PMOS，上拉慢；同樣功能改用 NAND + 反相 state 編碼（例如 q̄ 輸出）常常更快。CML 實作則直接用 differential OR/NOR，兩者對稱。
            </li>
            <li>
              <b>直連路徑的 hold</b>：d1 = q0 沒有 gate，hold margin 完全靠 flop 的 tCQ,min。master-slave 結構天生有 tCQ,min &gt; thold，但 clock tree 的 skew 會吃掉它；兩個 flop 要放近、共用同一段 clock buffer。
            </li>
            <li>
              <b>編碼換不掉「一定有一次兩個 bit 同時翻」</b>：N 為奇數時，2 個 bit 的循環<b>至少有一次</b>兩個 bit 同時翻轉。理由是 parity：每翻一個 bit，state 的 parity（兩個 bit 的 XOR）就改變一次，要繞一圈回到起點必須翻偶數次；3 個 transition 不可能全部都是單 bit。實際上 div3 的 2-bit 轉換在 <b>01 → 10</b>，練習題那個 00 → 01 → 11 的編碼（div3Alt）在 <b>11 → 00</b>——換編碼只是把它搬家，不會讓它消失。能做的是：<b>不要在那一步取 output decode</b>，或直接把輸出 register 起來。
            </li>
            <li>
              <b>而且換編碼是有代價的</b>：div3 的 next-state logic 是一級 NOR（d1 = q0 直連），arrival = tCQ + tNOR = 8 + 12 = <b>20 ps</b>；div3Alt 是 d0 = NOT q1、d1 = q0 · d0，關鍵路徑變成 FF1.Q → INV → AND → FF1.D = 8 + 6 + 10 = <b>24 ps</b>，多了一級 gate。它換到的好處是沒有 Q → D 直連（hold 比較寬鬆），不是「比較簡單」。
            </li>
            <li>
              <b>Jitter</b>：/3 的每個輸出 edge 對應一個輸入 edge（edge 2、5、8 …），不放大輸入 jitter；但 output 的 rising 與 falling 由不同 edge 的 tCQ 決定，供電雜訊會直接變成 duty 抖動。
            </li>
            <li>
              <b>PVT</b>：NOR 在低溫慢 corner 的 delay 可能是 typical 的 1.5 倍以上；Fmax 要用 slow corner 的 tCQ + tNOR 算，hold 要用 fast corner 的 tCQ,min 算——兩個 check 用的是不同 corner。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>假設 /3 的輸出是 50% duty</b>：只用 rising edge 的 /3，duty 是 1/3 或 2/3。
            </li>
            <li>
              <b>忘記 unused state</b>：2 個 bit 有 4 個 state，只寫 3 列 table 就開始畫電路，結果 11 的行為是碰運氣。
            </li>
            <li>
              <b>用 ripple 的方式接 /3</b>：把 q0 當 FF1 的 clock 做不出 /3——ripple 每級只能 /2，除數是 2 的次方。奇數除頻一定要 synchronous state machine。
            </li>
            <li>
              <b>把 q0 → d1 直連當作「沒有 timing 問題」</b>：它 setup 最鬆，卻是 hold 最緊的路徑。
            </li>
            <li>
              <b>output decode 用多個 bit 組合</b>：例如 div_out = q1 OR q0，兩個 bit 在同一個 edge 翻轉時（01 → 10）tCQ 不一致會產生 glitch。直接用單一 state bit 當輸出最安全。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="SystemVerilog（synthesizable）">
          <CodeBlock
            title="div3.sv"
            code={`
module div3 (
  input  logic clk,
  input  logic rst_n,      // async active-low reset → state 00
  output logic div_out
);
  logic q1, q0;
  // next-state equations: d1 = q0, d0 = ~(q1 | q0)
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) {q1, q0} <= 2'b00;
    else        {q1, q0} <= {q0, ~(q1 | q0)};
  end
  assign div_out = q1;   // high 1 cycle, low 2 cycles (duty 1/3)
endmodule
`}
            note="每個 posedge clk：{q1,q0} ← {q0, NOR(q1,q0)}。state 11 會走到 10（自復原）。合成器不會替你檢查 unused state，要自己代進去算。"
          />
        </ModeContent>
      </Section>

      <Section title="接下來" en="Next">
        <p>
          你現在會：決定 state 數與 bit 數、填 table、推 equation、反查 unused state、量 divide ratio 與 duty、找出 setup 與 hold 各自的 critical path。下一課解決這一課留下的問題：<b>奇數除頻怎麼做出 50% duty</b>。
        </p>
      </Section>
    </>
  )
}

/** 練習：00 → 01 → 11 → 00 編碼的 /3 */
function ExerciseComponent() {
  return (
    <>
      <DividerSimPanel netlist={div3Alt} schematic={div3AltSchematic} title="練習電路" showEquations={false} showDelayMode showPulseWidths allowInitialState compact />
      <div className="two-col" style={{ marginTop: '0.8em' }}>
        <StateDiagram {...graphToDiagram(div3AltGraph, 'clk↑')} width={300} height={240} title="engine 算出的 state graph（先自己推，再對照）" />
        <DividerSimPanel netlist={div3Alt} title="同一個電路，改看 q0 的 duty" signals={['clk', 'q0', 'q1']} showEquations={false} showTable={false} showNarration={false} compact showPulseWidths />
      </div>
    </>
  )
}

const lesson: LessonDef = {
  id: 'm2-l1-div3',
  module: 2,
  order: 1,
  title: '用 State Machine 做 Divide-by-3',
  titleEn: 'Divide-by-3 as a state machine',
  summary: '從「需要三個 state」出發：決定 bit 數、填 next-state table、用 K-map 推出 d0 = NOR(q1,q0)、d1 = q0，逐 edge 驗證 00→01→10 的循環，處理 unused state 11，並找出 setup 與 hold 各自的 critical path。',
  goals: [
    '解釋為什麼 /3 需要 2 個 state bit，以及為什麼一定會多出一個 unused state。',
    '從 state 序列填出 next-state table，用 K-map（含 don\'t care）推出 d1、d0 的 Boolean equation。',
    '逐 edge 追蹤 00 → 01 → 10 → 00，推導 Tout = 3 Tin 與 duty = 1/3，並說出為什麼不是 50%。',
    '用 state graph 判斷 unused state 11 進去之後會回到主循環還是 lock-up。',
    '在兩個 flop 的電路裡分辨 setup critical path（經過 NOR）與 hold critical path（Q → D 直連）。',
  ],
  readingMinutes: 35,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'single',
      prompt: '做一個 /3 divider 最少需要幾個 state bit（flop）？',
      options: ['1 個', '2 個', '3 個', '取決於 duty cycle'],
      answer: 1,
      explanation: '3 個 state 需要 ⌈log2 3⌉ = 2 個 bit。1 個 bit 只有 2 個 state。3 個 flop 也做得到（例如 one-hot 或 Johnson），但不是最少。',
    },
    {
      id: 'q2',
      type: 'state',
      prompt: 'div3（d0 = NOR(q1,q0)、d1 = q0）從 state 11 啟動，經過 2 個 rising edge 之後 state（q1 q0）是多少？',
      answer: '00',
      width: 2,
      bitNames: ['q1', 'q0'],
      explanation: '11 時 d1 = q0 = 1、d0 = NOR(1,1) = 0 ⇒ 第一個 edge 後 10；10 時 d1 = 0、d0 = NOR(1,0) = 0 ⇒ 第二個 edge 後 00。',
    },
    {
      id: 'q3',
      type: 'numeric',
      prompt: 'div_out = q1 的 /3，輸出 duty cycle 是多少 %？（輸入 clock duty 50%）',
      answer: 33.3,
      tolerance: 0.5,
      unit: '%',
      explanation: 'q1 只在 state 10 為 1，每個 state 停留 1T，週期 3T ⇒ duty = 1/3 ≈ 33.3%。輸入 duty 不影響，因為輸出只在 rising edge 改變。',
    },
    {
      id: 'q4',
      type: 'critical-path',
      prompt: '哪一條是這個 /3 的 setup critical path（決定 Fmax 的路徑）？',
      schematic: div3Schematic,
      options: [
        { label: 'FF0.Q → NOR → FF0.D', highlight: { style: 'setup', wires: ['w_q0_nor', 'w_nor_d0'], elements: ['ff0', 'nor'] }, description: 'launch edge k，capture edge k+1，經過 NOR' },
        { label: 'FF0.Q → FF1.D 直連', highlight: { style: 'setup', wires: ['w_q0_d1'], elements: ['ff0', 'ff1'] }, description: '沒有 gate' },
        { label: 'clk → FF1.clk 的 clock 走線', highlight: { style: 'setup', wires: ['w_clk1'], elements: ['ff1'] }, description: '圖上最長的線之一' },
        { label: 'FF1.Q → div_out', highlight: { style: 'setup', wires: ['w_q1_out'], elements: ['ff1'] }, description: '輸出走線' },
      ],
      answer: 0,
      explanation: '只有經過 NOR 的路徑 arrival = tCQ + tNOR 最大，且有 launch（edge k）與 capture（edge k+1）。直連路徑 setup 很鬆；clock 走線沒有 capture flop 的 setup 要求；輸出走線是 latency。',
    },
    {
      id: 'q5',
      type: 'single',
      prompt: '哪一條路徑的 hold slack 最小？',
      options: ['FF0.Q → NOR → FF0.D', 'FF1.Q → NOR → FF0.D', 'FF0.Q → FF1.D（直連）', 'rst_n → FF0'],
      answer: 2,
      explanation: 'hold 看的是 min delay。直連路徑只有 tCQ,min + wire = 6 ps，沒有 gate 幫忙撐時間；經過 NOR 的路徑多了 8 ps。rst_n 是 recovery/removal 檢查，不是 hold。',
    },
    {
      id: 'q6',
      type: 'multiple',
      prompt: '下列哪些敘述正確？',
      options: [
        'div3 的 state 11 從 reset 出發到不了，但進去之後一個 edge 就回到主循環',
        '所有 /3 divider 的輸出 duty 都是 50%',
        'n 個 state bit 做 /N 時，unused state 的數量是 2^n − N',
        '把 d0 改成 XNOR(q1,q0) 之後，三個合法 state 的行為不變，但 11 會 lock-up',
      ],
      answers: [0, 2, 3],
      explanation: '11 → 10 是 K-map 選 don\'t care 的副產品。XNOR 版在 00/01/10 上與 NOR 給的值相同，只在 11 那格不同（→ 11）。只用 rising edge 的 /3 duty 是 1/3 或 2/3，不是 50%。',
    },
    {
      id: 'q7',
      type: 'state',
      prompt: 'div3 從 reset（00）開始，經過 4 個 rising edge 之後 state（q1 q0）是多少？',
      answer: '01',
      width: 2,
      bitNames: ['q1', 'q0'],
      explanation: '00 → 01 → 10 → 00 → 01：4 個 edge = 一圈（3）再加 1 步。',
    },
    {
      id: 'q8',
      type: 'waveform',
      prompt: '哪一個波形是 div3（div_out = q1）的輸出？',
      options: [
        { label: 'A', traces: wave(div2, 'q0') },
        { label: 'B', traces: wave(div3, 'q1') },
        { label: 'C', traces: wave(div3Alt, 'q0') },
        { label: 'D', traces: wave(sync4, 'q1') },
      ],
      answer: 1,
      tEnd: 800,
      period: 100,
      explanation: 'B：rising edge 間隔 3T、high 1T、low 2T。A 是 /2；C 也是 /3 但 high 2T（duty 2/3，是練習電路的 q0）；D 是 /4、50% duty。',
    },
  ],
  exercise: {
    title: '另一種編碼的 /3：00 → 01 → 11 → 00',
    prompt: (
      <>
        <p>
          下面的電路也是兩個 DFF，但 next-state logic 換成一個 inverter 與一個 AND。<b>先不要按模擬</b>，照這一課的方法自己走一次：
        </p>
        <ol>
          <li>從 gate 讀出 d0 與 d1 的 equation（注意 AND 的其中一個輸入接的是 inverter 的輸出 d0，不是 q1）。</li>
          <li>從 reset 00 開始填 next-state table，找出主循環與 unused state。</li>
          <li>unused state 進去之後會到哪裡？幾個 edge 回到主循環？</li>
          <li>div_out = q1 的 duty 是多少？如果改用 q0 當輸出呢？</li>
          <li>如果設計者「省掉」AND、直接把 d1 接到 q0，序列會變成什麼？除數還是 3 嗎？</li>
        </ol>
        <p>推完再按「下一個 Clock Edge」逐 edge 對答案，並用「從任意 state 啟動」載入 unused state 驗證第 3 題。</p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: ['寫出 d0、d1 的 next-state equation', '列出主循環的 state 序列與 unused state', '寫出 unused state 的下一個 state', '算出 q1 與 q0 兩種輸出的 duty', '指出 setup critical path 經過哪些 gate，hold 最緊的路徑是哪一條'],
    answer: (
      <>
        <p>
          <b>Equations</b>：d0 = NOT q1；d1 = q0 AND d0 = q0 AND NOT q1。
        </p>
        <p>
          <b>序列</b>：00（d1=0, d0=1）→ 01（d1=1, d0=1）→ 11（d1=0, d0=0）→ 00。主循環 3 個 state ⇒ 除數 3。unused state 是 <b>10</b>：d0 = NOT 1 = 0、d1 = 0 AND 0 = 0 ⇒ 10 → 00，一個 edge 回到主循環（engine 的 state graph 也標示 10 為 unreachable、stepsToCycle = 1）。
        </p>
        <p>
          <b>Duty</b>：q1 只在 11 為 1 ⇒ high 1T / 3T = 33%。q0 在 01 與 11 為 1 ⇒ high 2T / 3T = 67%。同一個電路換一個 bit 當輸出，duty 就從 1/3 變 2/3——但仍然不是 50%。
        </p>
        <p>
          <b>省掉 AND 會怎樣</b>：d1 = q0 時，11 的下一個 state 是（d1 = 1, d0 = 0）= 10，而不是 00；序列變成 00 → 01 → 11 → 10 → 00，這是 4 個 state 的 Johnson counter，除數變成 4。那個 AND 的 NOT q1 項就是把第四個 state 砍掉的關鍵。
        </p>
        <p>
          <b>Critical path</b>：setup 最緊是 FF1.Q → INV → AND → FF1.D（tCQ + tINV + tAND，兩級 gate，比 div3 的單一 NOR 深）；FF1.Q → INV → FF0.D 與 FF0.Q → AND → FF1.D 各只有一級。hold 最緊是 min delay 最小的那條：FF1.Q → INV → FF0.D（tCQ,min + tINV,min，inverter 是最快的 gate）。這個編碼沒有完全直連的 Q → D，所以 hold 比 div3 的 q0 → d1 直連寬鬆——代價是 setup 路徑多了一級 gate。
        </p>
        <p>
          <b>Real delay 模式可以看到</b>：q0、q1 在 edge 後 8 ps 變；d0 = NOT q1 在 q1 變後 6 ps（edge + 14 ps）變；d1 經過 AND 再晚 10 ps。這三個時間就是上面三條路徑的 arrival time。
        </p>
      </>
    ),
  },
}
export default lesson
