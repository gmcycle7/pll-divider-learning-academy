import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { simulate } from '@/models/divider/engine'
import { div2NoReset, div3, div3Lockup } from '@/models/divider/examples'
import type { Netlist, Values } from '@/models/divider/types'
import { div3AsyncRst, div3SyncRst, div5Lockup, mystery3 } from './models'
import { div2NoResetSch, div3AsyncRstSch, div3LockupSch, div3Sch, div3SyncRstSch, div5LockupSch, mystery3Sch } from './schematics'
import { asyncResetTiming, syncResetTiming } from './timing'
import { ResetReleaseDemo, ResetSkewDemo, StateGraphExplorer, StateGraphTable, XStartDemo } from './Widgets'

/* ------------------------------------------------------------------------------------------------
 * 模擬器選項（放在 module scope，避免每次 render 產生新的物件讓 useSimulation 重建）
 * ---------------------------------------------------------------------------------------------- */
const START_11: Values = { q1: 1, q0: 1 }
const ASYNC_OPTS = { period: 100, initialState: START_11 }
const SYNC_OPTS = { period: 100, initialState: START_11 }

/* ------------------------------------------------------------------------------------------------
 * Quiz 用波形：全部由 engine 產生（與課文的模擬器一致）
 *   rst 在 edge 3 之前 0.35T 生效（assert），edge 4 之前 0.35T 釋放
 * ---------------------------------------------------------------------------------------------- */
const QT = 100
function resetWave(nl: Netlist, rstName: string, assertVal: 0 | 1, releaseVal: 0 | 1, init?: Values) {
  const { sim } = simulate(nl, 6, { period: QT, initialState: init }, (e) => (e === 3 ? { [rstName]: assertVal } : e === 4 ? { [rstName]: releaseVal } : {}))
  return sim.getTraces(['clk', rstName, 'q0', 'q1'])
}
const waveAsync = resetWave(div3AsyncRst, 'rst_n', 0, 1)
const waveSync = resetWave(div3SyncRst, 'rst', 1, 0)
const waveNoReset = simulate(div3Lockup, 6, { period: QT, initialState: START_11 }).sim.getTraces(['clk', 'rst_n', 'q0', 'q1'])

function Content() {
  return (
    <>
      <Section title="先用直覺想：上電那一瞬間，flop 裡面是什麼？" en="Intuition: what is inside a flop at power-up?">
        <p>
          Lesson 0-3 說過，flop 的核心是兩個 inverter 互相咬住的 latch。電源剛打開、電壓從 0 V 慢慢爬上來的那幾百 ns，這個 latch 像一枝<b>立在桌上的筆</b>：它一定會倒向某一邊（0 或 1），但倒向哪一邊，由三件事決定：
        </p>
        <ul>
          <li>
            <b>Transistor mismatch</b>：兩個 inverter 的臨界電壓差個幾 mV，就足以讓它每次都偏向同一邊——這是「系統性」的，同一顆晶片每次上電常常一樣，但<b>不同晶片不一樣</b>。
          </li>
          <li>
            <b>雜訊</b>：熱雜訊、供電雜訊、基板耦合——這是隨機的，mismatch 越小，雜訊的影響越大。
          </li>
          <li>
            <b>供電上升的斜率與順序</b>：VDD 爬得快或慢、core 與 IO 誰先來，會改變 latch 開始 regeneration 的瞬間各個節點的電壓。
          </li>
        </ul>
        <p>
          所以一個 n-bit 的 divider 上電之後，state 是 <Math>{'2^n'}</Math> 種可能之中的一種，而且<b>你不知道是哪一種</b>。一個 2-bit 的 /3 有 4 種起點，3-bit 的 /5 有 8 種。
        </p>
        <Callout kind="idea" title="reset 不是為了「讓它會除頻」，而是為了「讓它從我們知道的地方開始」">
          這一課要回答三個問題，順序很重要：
          <ol style={{ margin: '0.3em 0 0' }}>
            <li>從<b>任何</b>起點出發，divider 會不會自己走回合法循環？（會 → self-starting；不會 → 有 lock-up）</li>
            <li>如果會，要幾個 clock edge？回來之後落在循環的哪一個相位？</li>
            <li>如果要加 reset，reset 什麼時候「放開」才安全？多級 divider 的 reset 要怎麼一起放開？</li>
          </ol>
        </Callout>
      </Section>

      <Section title="模擬器看到的上電：X" en="What the simulator sees: X">
        <p>
          RTL 模擬器沒有辦法擲骰子，所以它把「不知道是 0 還是 1」記成第三種值：<Term zh="未知值" en="X, unknown" />。下面是 Lesson 2-1 那個 /3（d0 = NOR(q1, q0)、d1 = q0）在兩種情況下的 RTL 波形。先看「沒有 reset」，再切到「有 reset」。
        </p>
        <XStartDemo />
        <Steps
          items={[
            <>
              <b>t = 0</b>：q0 = X、q1 = X。inverter / NOR 不用等 clock，馬上算：d0 = NOR(X, X)。X 表示「可能是 0 也可能是 1」，NOR 的兩個輸入都不確定，輸出當然也不確定 → d0 = X。d1 = q0 = X。
            </>,
            <>
              <b>edge 1</b>：FF0 把 d0 = X 抓進 q0，FF1 把 d1 = X 抓進 q1。state 還是 XX。
            </>,
            <>
              <b>edge 2、3、…</b>：同樣的事情重複。沒有任何一個 edge 能把 X 變成 0 或 1——因為 next-state 的每個輸入都是 X。輸出 q1 從頭到尾都是 X。
            </>,
            <>
              <b>有 reset</b>：rst_n 在 t = 0 為 0，強制 q0 = q1 = 0。這時 d0 = NOR(0, 0) = 1 是確定的。0.5T 釋放 reset 之後，edge 1 抓到 d0 = 1 → state 01。從此每一個值都確定。
            </>,
          ]}
        />
        <Callout kind="warning" title="X 有兩層意思，不要混在一起">
          <ul style={{ margin: 0 }}>
            <li>
              <b>在模擬器裡</b>：X 是一個「值」，會沿著 logic 傳播。只有<b>controlling value</b> 能消掉它：NOR(1, X) = 0、AND(0, X) = 0；但 NOR(0, X) = X。
            </li>
            <li>
              <b>在矽片上</b>：沒有 X 這種電壓。flop 上電後<b>一定</b>是 0 或 1，只是你不知道是哪一個、也不保證每顆晶片一樣。所以「RTL 全是 X」不代表晶片壞了；反過來，「RTL 有 reset 所以沒問題」也不代表晶片從每一個起點都能活。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="X 的 pessimism 與 optimism">
          <p>
            Gate-level 模擬對 X 是 <b>pessimistic</b> 的：只要有一個輸入是 X 而且沒有 controlling value，輸出就是 X，即使實際電路的兩種可能結果都相同（例如 XOR(X, X) 在矽片上一定是 0，模擬器仍給 X）。RTL 模擬反而可能 <b>optimistic</b>：<span className="mono">if (q1)</span> 在 q1 = X 時會走 else 分支、<span className="mono">case</span> 沒有 match 時不動作，X 就這樣被「吃掉」，波形看起來乾乾淨淨——這是 RTL 與 gate-level 上電模擬結果不一致最常見的原因。divider 這種「每個 bit 都從自己算回來」的電路特別容易踩到：只要有一個 bit 沒有 reset，X 就會繞著回授圈永遠轉下去。
          </p>
        </ModeContent>
      </Section>

      <Section title="真實矽片：從四個起點出發" en="Real silicon: starting from all four states">
        <p>
          矽片不會給你 X，它會給你四個起點之一。我們就把四個都試一遍。先看電路：Lesson 2-1 的 /3，兩個 flop、一個 NOR，有 rst_n。
        </p>
        <LogicDiagram schematic={div3Sch} showValues={false} />
        <p>
          下面的工具可以<b>點 state diagram 上的任何一個圓</b>（或直接輸入 bit-string）當作上電時的初始 state，然後逐 edge 走。先自己推，再按：
        </p>
        <StateGraphExplorer netlist={div3} schematic={div3Sch} title="/3（NOR 版）：從任意 state 啟動" />
        <Steps
          items={[
            <>
              <b>從 00 出發（這也是 reset state）</b>：d0 = NOR(0,0) = 1、d1 = q0 = 0 → edge 後 01。再算：d0 = NOR(0,1) = 0、d1 = 1 → 10。再算：d0 = NOR(1,0) = 0、d1 = 0 → 00。三個 edge 一圈：00 → 01 → 10 → 00，這是<Term zh="主循環" en="main cycle" />。
            </>,
            <>
              <b>從 01 或 10 出發</b>：它們本來就在主循環上，只是起始相位不同。輸出 q1 的 rising edge 會早或晚一兩個 T。
            </>,
            <>
              <b>從 11 出發</b>：這個 state 從 reset 永遠走不到——它是<Term zh="未使用狀態" en="unused / illegal state" />。但矽片可能就從這裡開始。算：d0 = NOR(1,1) = 0、d1 = q0 = 1 → edge 後 10。10 在主循環上！所以 11 只需要 <b>1 個 edge</b> 就回到合法循環。
            </>,
            <>
              <b>結論</b>：四個起點全部會回到主循環，最多 1 個 edge。這個 /3 是<Term zh="自啟動" en="self-starting" />的——就算沒有 reset，它也一定會除 3。
            </>,
          ]}
        />
        <Callout kind="method" title="四個名詞，用 state graph 一次分清楚">
          <ul style={{ margin: 0 }}>
            <li>
              <Term zh="可達狀態" en="reachable state" />：從 reset state 出發走得到的 state。工具用<b>實線圓</b>畫。
            </li>
            <li>
              <b>Unused / illegal state</b>：從 reset 走不到的 state（虛線圓）。它們不是「不存在」，而是「正常運作時不會出現」——上電、supply glitch、粒子撞擊（SEU）都可能把你丟進去。
            </li>
            <li>
              <b>Transient state</b>：unused，但走幾步會回到主循環（黃色 chip，工具會顯示步數）。
            </li>
            <li>
              <Term zh="鎖死狀態" en="lock-up state" />：進去之後<b>永遠</b>回不到主循環（紅色）。可能是自己跳回自己（self-loop），也可能是幾個 unused state 互相繞圈（lock-up loop）。
            </li>
          </ul>
        </Callout>
      </Section>

      <Section title="/2 為什麼不需要 reset：每個 state 都合法" en="Why a /2 needs no reset">
        <p>
          最極端的例子是 /2。它只有一個 bit，兩個 state 都在主循環上——根本沒有 unused state。下面這個 /2 <b>沒有 reset pin</b>，從 0 或 1 開始都試試看。
        </p>
        <StateGraphExplorer netlist={div2NoReset} schematic={div2NoResetSch} title="/2（無 reset）：兩個起點都合法" windowCycles={6} showTable={false} />
        <p>
          從 0 開始：0 → 1 → 0 → 1…。從 1 開始：1 → 0 → 1 → 0…。除頻比都是 2，duty 都是 50%。<b>唯一的差別是相位</b>：兩條輸出波形剛好差 180°（一個輸入週期）。單獨一個 /2 沒人在乎這件事；但如果你有兩個 /2 並排（I/Q 產生器）、或者 /2 後面接的是一個需要知道「哪一個 edge 是第一個」的 MMD，這個 180° 就是 bug。這是 reset 的第二個用途，下面會再回來談。
        </p>
      </Section>

      <Section title="換一個 /3：11 再也回不來" en="Another /3: 11 never comes back">
        <p>
          現在把 NOR 換成 XNOR（d0 = XNOR(q1, q0)），其他都不變。在合法 state 上，XNOR 與 NOR 給的 d0 一模一樣（00 → 1、01 → 0、10 → 0），所以從 reset 開始你<b>完全看不出差別</b>：一樣 00 → 01 → 10 → 00，一樣除 3。
        </p>
        <LogicDiagram schematic={div3LockupSch} showValues={false} />
        <StateGraphExplorer netlist={div3Lockup} schematic={div3LockupSch} title="/3（XNOR 版）：從 11 啟動看看" initialStart="11" />
        <Steps
          items={[
            <>
              <b>從 11 出發</b>：d0 = XNOR(1,1) = 1（兩個輸入相同 → 1），d1 = q0 = 1。edge 後 state = 11。
            </>,
            <>
              <b>再一個 edge</b>：還是 11。再一個：還是 11。輸出 q1 固定為 1——divider 沒有輸出 edge，下游的 PLL 相位偵測器看到的是「反饋 clock 消失」，VCO 會被推到軌道邊緣。
            </>,
            <>
              <b>唯一的出路</b>：拉 rst_n。11 是 lock-up state，state graph 上畫成紅色、箭頭指回自己。
            </>,
            <>
              <b>RTL 為什麼抓不到</b>：有 reset 的 RTL 模擬永遠從 00 開始，11 不可達，你跑一百萬個 cycle 也看不到它。這個 bug 只會在<b>矽片上、某些晶片、某些溫度下</b>出現——而且症狀是「有時候開機起不來」。
            </>,
          ]}
        />
        <Callout kind="pitfall" title="「合法 state 的行為一樣」不代表「電路一樣」">
          NOR 版與 XNOR 版在 3 個合法 state 上的 truth table 完全相同，差別只在第 4 個 state——就是你在 K-map 上填 <b>don't care</b> 的那一格。Lesson 8-2 會回頭把這一格一格填清楚；這一課先記住：<b>don't care 不是「不管」，它會被化簡工具悄悄指定成 0 或 1，然後決定 unused state 往哪裡走。</b>
        </Callout>
      </Section>

      <Section title="3 個 flop 的 /5：lock-up loop" en="A 3-flop /5 with a lock-up loop">
        <p>
          bit 越多，unused state 越多，lock-up 的形狀也越多樣。下面是一個 3-flop 的 twisted-ring /5：d2 = q1、d1 = q0、d0 = NOR(q2, q1·q0)。8 個 state，5 個合法，3 個 unused。先從 reset 走一圈確認它是 /5，再點 010、101、111 三個虛線圓。
        </p>
        <LogicDiagram schematic={div5LockupSch} showValues={false} />
        <StateGraphExplorer netlist={div5Lockup} schematic={div5LockupSch} title="Twisted-ring /5：三個 unused state 各自往哪裡走？" windowCycles={10} />
        <Steps
          items={[
            <>
              <b>主循環（q2q1q0）</b>：000 → 001 → 011 → 110 → 100 → 000，5 個 state。輸出 q2 在 110、100 為 1（2 個 cycle）、其餘 3 個 cycle 為 0 → duty = 2/5 = 40%。這是 /5，但<b>不是</b> 50% duty（Lesson 2-2 說過奇數除頻沒有免費的 50%）。
            </>,
            <>
              <b>從 111 出發</b>：d2 = q1 = 1、d1 = q0 = 1、d0 = NOR(1, 1·1) = NOR(1,1) = 0 → 110。110 在主循環上，1 個 edge 就回來。這是 transient state。
            </>,
            <>
              <b>從 010 出發</b>：d2 = q1 = 1、d1 = q0 = 0、d0 = NOR(q2 = 0, q1·q0 = 1·0 = 0) = NOR(0,0) = 1 → 101。
            </>,
            <>
              <b>接著從 101</b>：d2 = q1 = 0、d1 = q0 = 1、d0 = NOR(1, 0·1) = NOR(1,0) = 0 → 010。回到 010！010 ↔ 101 互相跳，永遠碰不到主循環。這是一個 <b>2-state 的 lock-up loop</b>。
            </>,
            <>
              <b>最危險的部分</b>：看輸出。010 時 q2 = 0，101 時 q2 = 1，所以輸出是 0、1、0、1…——一個<b>乾淨漂亮的 /2 clock</b>。工具下方的量測會告訴你 ratio = 2、duty = 50%。PLL 不會發現反饋 clock 消失，它會安安穩穩地 lock 到錯的頻率（VCO 只跑到目標的 2/5），lock detector 還說 OK。
            </>,
          ]}
        />
        <Callout kind="warning" title="lock-up 不一定是「卡住不動」">
          <ul style={{ margin: 0 }}>
            <li>self-loop（11 → 11）：輸出停住，症狀明顯。</li>
            <li>lock-up loop（010 ↔ 101）：輸出還在跳，但週期錯了。這種在系統層面更難抓，因為每一個 block 各自看起來都「活著」。</li>
            <li>loop 的長度可以是 2、3、…，輸出可能是任何奇怪的 pattern；只有 state graph 能一次把它們全部找出來。</li>
          </ul>
        </Callout>
      </Section>

      <Section title="把它寫成數學" en="The arithmetic of unused states">
        <p>
          設 divider 有 <Math>{'n'}</Math> 個 state bit，主循環有 <Math>{'N'}</Math> 個 state（<Math>{'N'}</Math> 就是除頻比）。那麼：
        </p>
        <Math block>{'S_{total} = 2^n,\\qquad S_{unused} = 2^n - N'}</Math>
        <p>
          變數：<Math>{'S_{total}'}</Math> = 所有可能的 state 數；<Math>{'S_{unused}'}</Math> = 正常運作不會出現的 state 數（無單位）。/3 用 2 bit：<Math>{'4 - 3 = 1'}</Math> 個 unused；/5 用 3 bit：<Math>{'8 - 5 = 3'}</Math> 個；一個 8-bit 的 /200 有 56 個。<b>N 不是 2 的冪次時一定有 unused state</b>，每一個都要問「它往哪裡走」。
        </p>
        <p>
          如果上電時每個 state 出現的機率是 <Math>{'p(s)'}</Math>，而 lock-up state 的集合是 <Math>{'L'}</Math>，那麼「這次開機起不來」的機率是
        </p>
        <Math block>{'P_{lockup} = \\sum_{s \\in L} p(s)\\quad\\xrightarrow{\\text{若均勻}}\\quad \\frac{|L|}{2^n}'}</Math>
        <p>
          XNOR 版 /3：<Math>{'|L| = 1'}</Math>，均勻假設下 25%。/5：<Math>{'|L| = 2'}</Math>，25%。但<b>均勻假設幾乎一定是錯的</b>：mismatch 讓某些晶片每次都落在同一個 state，可能是 0%，也可能是 100%——這就是為什麼這種 bug 會表現成「某幾顆晶片在低溫下開不了機」。
        </p>
        <p>
          回復時間：若最壞的 transient state 需要 <Math>{'k_{max}'}</Math> 個 edge 回到主循環，divider 從上電到輸出正確的時間是
        </p>
        <Math block>{'t_{recover} = k_{max}\\,T_{in}'}</Math>
        <p>
          <Math>{'T_{in}'}</Math> 是輸入 clock 週期（ps）。<Math>{'k_{max}'}</Math> = 工具裡「到主循環的步數」那一欄的最大值；lock-up 的 <Math>{'k = \\infty'}</Math>。
        </p>
        <StateGraphTable netlist={div5Lockup} />
      </Section>

      <Section title="Reset 怎麼運作：非同步 vs 同步" en="How reset works: asynchronous vs synchronous">
        <p>
          知道 lock-up 存在之後，最直接的解法就是給每個 flop 一個 reset。reset 有兩種接法，行為與 timing 檢查完全不同。先看<Term zh="非同步重置" en="asynchronous reset" />：rst_n 直接接到 flop 的 reset pin，<b>不經過 clock</b>。下面的模擬器已經把 XNOR 版 /3 放在 lock-up state 11。先按幾個 edge 確認它卡住，然後把 rst_n 按成 0，再按一個 edge；最後把 rst_n 放回 1。
        </p>
        <DividerSimPanel netlist={div3AsyncRst} schematic={div3AsyncRstSch} options={ASYNC_OPTS} title="非同步 reset：rst_n 一拉低，Q 立刻歸零（不等 edge）" showDelayMode allowInitialState windowCycles={8} showEquations={false} />
        <Steps
          items={[
            <>
              <b>rst_n = 1、state = 11</b>：edge 1、2、3… state 都是 11。d0 = XNOR(1,1) = 1、d1 = 1，每個 edge 抓進來的都是 11。
            </>,
            <>
              <b>把 rst_n 按成 0，按下一個 edge</b>：注意波形——q0、q1 在 rst_n 下降的<b>那一瞬間</b>就變 0（模擬器把 input 放在 edge 前 0.35T），不是在 edge 上。這就是「非同步」的意思：reset 不聽 clock。那個 edge 來的時候，flop 還在 reset 中，什麼都不抓。
            </>,
            <>
              <b>把 rst_n 放回 1，再按一個 edge</b>：現在 state = 00，d0 = XNOR(0,0) = 1，edge 抓到 01。從這裡開始 00 → 01 → 10 → 00 正常除 3。
            </>,
          ]}
        />
        <p>
          再看<Term zh="同步重置" en="synchronous reset" />：rst 不接 reset pin，而是變成 next-state logic 的一個輸入——d = (原本的 next state) AND NOT rst。它<b>要等到下一個 clock edge</b> 才生效。
        </p>
        <DividerSimPanel netlist={div3SyncRst} schematic={div3SyncRstSch} options={SYNC_OPTS} title="同步 reset：rst 拉高後，要等下一個 edge 才清成 00" showDelayMode allowInitialState windowCycles={8} />
        <Steps
          items={[
            <>
              <b>rst = 0、state = 11</b>：rst_b = 1，d0 = XNOR(1,1)·1 = 1、d1 = q0·1 = 1 → 卡在 11。
            </>,
            <>
              <b>把 rst 按成 1，按一個 edge</b>：rst 改變後 rst_b = 0，兩個 AND 把 d0、d1 都壓成 0——但 q0、q1 <b>還是 11</b>，要等 edge 來把 00 抓進去。波形上 q 在 edge 那一刻才變，不是在 rst 改變的瞬間。
            </>,
            <>
              <b>rst 放回 0，再按 edge</b>：state 00，d0 = 1 → 01，恢復正常。
            </>,
            <>
              <b>如果 clock 沒有在跑</b>：同步 reset 永遠不會生效。這是它最大的限制——divider 的 clock 來自 VCO，VCO 還沒起振時，同步 reset 什麼都做不了。
            </>,
          ]}
        />
        <CompareTable
          head={['', '非同步 reset（rst_n → flop reset pin）', '同步 reset（rst → AND → D）']}
          rows={[
            ['生效時機', 'assert 的瞬間（不等 clock）', '下一個 active clock edge'],
            ['clock 沒在跑時', '仍然有效——VCO 還沒起振也能把 divider 清乾淨', '無效'],
            ['在 data path 上嗎？', '否：不影響 Fmax', '是：回授路徑多一個 AND（下面用 Critical Path Explorer 算）'],
            ['timing 檢查', 'de-assert：recovery / removal（下一節）', '普通的 setup / hold'],
            ['對 reset 訊號上的 glitch', '敏感：幾十 ps 的毛刺就會清掉 state', '不敏感：只在 edge 取樣'],
            ['flop 面積', '略大（reset pin 多兩顆電晶體，tCQ 略慢）', '標準 flop + 一個 AND'],
            ['高速 divider 常見做法', 'assert 非同步、de-assert 經 synchronizer 對齊 clock', '只用在低速的控制邏輯（例如 MMD 的 program 載入）'],
          ]}
        />
      </Section>

      <Section title="Reset 什麼時候「放開」：recovery 與 removal" en="Reset release timing: recovery and removal">
        <p>
          非同步 reset 的 assert 沒什麼好擔心的：拉低就清掉。麻煩在<b>放開（de-assert）</b>。flop 離開 reset 的那一瞬間如果剛好碰到 clock edge，它會不知道該「維持 reset 值」還是「抓 D」。這跟 D 在 edge 附近變化的 setup/hold 問題一模一樣，只是換了名字：
        </p>
        <ul>
          <li>
            <Term zh="恢復時間" en="recovery time, t_recovery" />：像 setup——reset 必須在 edge 之前至少 t_recovery 就放開，這個 edge 才保證會正常抓 D。
          </li>
          <li>
            <Term zh="移除時間" en="removal time, t_removal" />：像 hold——reset 放開不能在 edge 之後太快（至少要等 t_removal），否則這個 edge 可能被半路殺出的 de-assert 弄成「半 reset 半 capture」。
          </li>
        </ul>
        <p>拖曳滑桿，把 rst_n 的釋放時間相對 edge 2 前後移動，看三種結果：</p>
        <ResetReleaseDemo />
        <Steps
          items={[
            <>
              <b>早（釋放在 edge 2 之前 ≥ t_recovery）</b>：flop 在 edge 2 之前就確定離開 reset，edge 2 正常抓 D，q0 從 edge 2 開始 toggle。結果確定。
            </>,
            <>
              <b>晚（釋放在 edge 2 之後 ≥ t_removal）</b>：edge 2 那一刻 flop 確定還在 reset，q0 被壓在 0；第一個有效 edge 是 edge 3。結果也確定，只是晚一拍——對單一 divider 無所謂，對多個 divider 就是相位差。
            </>,
            <>
              <b>window 內（−t_recovery … +t_removal）</b>：矽片可能走 A、可能走 B、甚至 metastable 很久才決定。RTL 只能給 X。這不是 bug 機率問題，是<b>設計沒有定義</b>。
            </>,
            <>
              <b>切到同步 reset</b>：window 變成 D pin 的 setup/hold window，往前平移一個 AND delay。名字不叫 recovery/removal，就叫 setup/hold——因為 rst 就是 data。
            </>,
          ]}
        />
        <Math block>{'t_{release} \\le t_{edge} - t_{recovery}\\quad\\text{或}\\quad t_{release} \\ge t_{edge} + t_{removal}'}</Math>
        <p>
          <Math>{'t_{release}'}</Math> = rst_n 的 de-assert 到達 flop reset pin 的時間；<Math>{'t_{edge}'}</Math> = 該 flop 的 clock edge 到達時間；單位皆為 ps。兩個不等式之間的區間就是禁區。
        </p>
        <ModeContent level="deep" title="矽片裡發生了什麼；為什麼要 reset synchronizer">
          <ul>
            <li>
              <b>reset pin 的實作</b>：master-slave flop 的 async reset 通常是 master 與 slave latch 各加一顆 pull-down（或 pull-up）電晶體，直接把 storage node 拉到 reset 值。de-assert 時這顆電晶體關掉，latch 恢復 regeneration；如果同一瞬間 clock 讓 master 進入 transparent 去抓 D，storage node 同時被「reset 值」與「D 值」拉——誰贏取決於幾 ps 的差距與 transistor 強度。這就是 recovery/removal window 的物理來源，也是它與 setup/hold 一樣會 metastable 的原因。
            </li>
            <li>
              <b>Reset synchronizer（assert async、de-assert sync）</b>：外部 reset 經過兩級 flop（clock 用 divider 自己的 clock，async reset 也接外部 reset）。assert 時兩級 flop 立刻被清成 0，divider 立刻進 reset；de-assert 時外部訊號要先被第一級在 edge 取樣、第二級再取樣，divider 看到的 rst_n 上升沿因此<b>對齊 clock edge 之後 tCQ</b>——它有了 launch edge，STA 就能檢查 recovery/removal，而不是靠運氣。第二級 flop 的存在是為了讓第一級的 metastability 有一整個 cycle 可以 resolve。
            </li>
            <li>
              <b>PVT</b>：t_recovery、t_removal 隨 PVT 變化的方式與 setup/hold 類似（慢角落 recovery 變大、快角落 removal 風險變大）。reset tree 的 buffer delay 也隨 PVT 走，所以 reset 到各 flop 的 skew 要像 clock skew 一樣在所有角落檢查。
            </li>
            <li>
              <b>Reset pulse width</b>：assert 太窄（比 flop 內部 reset transistor 拉低 storage node 的時間還短）flop 可能只被「碰一下」就回原值。這是 reset 的 pulse-width 檢查，不要跟 recovery（時間點）混為一談。
            </li>
            <li>
              <b>CML / 高速 divider 常常沒有 reset</b>：reset transistor 加在 CML latch 的輸出節點上會增加電容、拖慢 tCQ，所以 20 GHz 以上的 prescaler 幾乎都不接 reset，完全靠 self-starting（Lesson 8-2 的主題）。reset 只在後面較慢的 CMOS 級才出現。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="Reset 路徑的 timing：它不是 Fmax critical path，但一樣有 launch 與 capture" en="Timing of the reset path">
        <p>
          下面的 scenario 把 /3（NOR 版）的 reset 接成「reset synchronizer RS → BUF → 各 flop 的 rst_n」。先用逐步模式走一遍：launch point 是誰？launch edge 是哪一個？capture point 與 capture edge 呢？可用時間多少？然後跟真正的 data path（FF1.Q → NOR → FF0.D）比較。
        </p>
        <CriticalPathExplorer scenario={asyncResetTiming} guided initialPath="rst-rec-ff0" />
        <Steps
          items={[
            <>
              <b>Launch</b>：RS（synchronizer 的最後一級）在 edge k 的 rising edge 把 rst_n 的 de-assert 送出。tCQ,max = 8 ps。
            </>,
            <>
              <b>經過</b>：BUF（4–6 ps）、reset 走線（到 FF0 2–4 ps；到 FF1 4–7 ps，比較長）。到 FF0 的 arrival = 8 + 6 + 4 = 18 ps。
            </>,
            <>
              <b>Capture</b>：FF0 的 rst_n pin，在 edge k+1。要求 de-assert 在 edge k+1 之前 t_recovery = 10 ps 到達。required = 100 − 10 − 2（jitter）− 2（margin）= 86 ps。recovery slack = 86 − 18 = <b>68 ps</b>。
            </>,
            <>
              <b>切到 Hold（min delay）分頁看 removal</b>：arrival(min) = 5 + 4 + 2 = 11 ps，必須 ≥ t_removal = 5 ps。removal slack = <b>6 ps</b>。removal 與 period 無關——它問的是「同一個 edge 之後」有沒有太快。
            </>,
            <>
              <b>對照 data path</b>：FF1.Q → NOR → FF0.D 的 setup slack 是 69 ps，Tclk,min = 8 + 12 + 7 + 2 + 2 = 31 ps。reset path 的 slack 跟它差不多大，而且<b>reset path 不會因為 clock 變快而先撞到牆</b>——它不是 Fmax critical path。它限制的是「reset 放開後第一個 edge 可不可靠」與「多級能不能在同一個 edge 一起離開 reset」。
            </>,
          ]}
        />
        <Callout kind="method" title="這條路徑為什麼不算 Fmax critical path？">
          Fmax critical path 的定義是「每個 cycle 都會被 sensitize、launch 與 capture 相隔一個 T 的 register-to-register path」。reset de-assert 一輩子只發生一次（或幾次），而且 recovery 的 slack 隨 period 縮短的速度與 data path 相同——只要 data path 過得了，recovery 通常也過得了。所以工程上把它獨立成 recovery/removal check，不混進 Fmax 報告。不要把「reset 走線很長」直接翻譯成「reset 是 critical path」：長走線影響的是<b>到各 flop 的 skew</b>，那是下一節的問題。
        </Callout>
        <p>
          同步 reset 就完全不同了：rst 進了 data path，AND 串在回授圈上。看同一個 /3（XNOR 版）加上同步 reset 之後 critical path 變成什麼：
        </p>
        <CriticalPathExplorer scenario={syncResetTiming} initialPath="q1-xnor-and0-d0" />
        <p>
          FF1.Q → XNOR → AND0 → FF0.D：arrival = 8 + 14 + 14 = 36 ps，Tclk,min = 36 + 7 + 2 + 2 = <b>47 ps</b>。沒有同步 reset 時（XNOR 版）Tclk,min 是 33 ps；同步 reset 讓每一個 cycle 都多付 14 ps 的 AND——Fmax 從 30 GHz 掉到 21 GHz。這就是高速 divider 幾乎不用同步 reset 的原因。
        </p>
        <ModeContent level="engineer" title="Timing equation 整理">
          <p>Recovery check（像 setup）：</p>
          <Math block>{'t_{CQ,max}(RS) + t_{buf,max} + t_{wire,max} \\le T_{clk} - t_{recovery} - t_{jitter} - t_{margin} + t_{skew}'}</Math>
          <p>Removal check（像 hold）：</p>
          <Math block>{'t_{CQ,min}(RS) + t_{buf,min} + t_{wire,min} \\ge t_{removal} + t_{skew}'}</Math>
          <p>
            <Math>{'t_{skew}'}</Math> = capture flop 的 clock 到達 − launch flop（RS）的 clock 到達（ps），本專案的定義。同步 reset 沒有這兩條，它的 rst → INV → AND → D 就是普通 setup/hold：
          </p>
          <Math block>{'T_{clk,min} = t_{CQ,max} + t_{XNOR,max} + t_{AND,max} + t_{setup} + t_{jitter} + t_{margin} = 8 + 14 + 14 + 7 + 2 + 2 = 47\\ \\text{ps}'}</Math>
        </ModeContent>
      </Section>

      <Section title="多級 divider：reset 要「同時」放開" en="Multi-stage dividers: release reset together">
        <p>
          前面說 /2 從 0 或 1 開始都能除頻，只差相位。現在把兩個 /2 並排（例如產生 I/Q 的兩個 /2，或 MMD 裡串在一起的多個 /2/3 cell），reset 由同一條線送過去，但走線長度不同：
        </p>
        <ResetSkewDemo />
        <Steps
          items={[
            <>
              <b>skew = 0</b>：兩個 flop 都在 edge 2 之前離開 reset，都從 edge 2 開始 toggle，輸出相位對齊。
            </>,
            <>
              <b>skew 拉大到 B 落進 recovery/removal window</b>：B 的第一個 edge 是 2 還是 3，沒人知道——相位未知，而且每次上電可能不同。
            </>,
            <>
              <b>skew 再大，B 確定晚一拍</b>：B 從 edge 3 開始。兩個 /2 的除頻比都對，輸出卻差一個輸入週期 = /2 輸出的 180°。對 I/Q 來說 I 與 Q 互換；對 MMD 來說第一個 cell 的 modulus 控制與第二個 cell 的計數對不上，divide ratio 直接錯。
            </>,
            <>
              <b>結論</b>：多級 divider 的 reset tree 必須像 clock tree 一樣做 balance——目標是所有 flop 的 reset 釋放都落在<b>同一個</b> edge 的安全區內。這正是 timing scenario 裡「到 FF1 走線較長」那條路徑存在的原因。
            </>,
          ]}
        />
        <Callout kind="note" title="reset 的三個用途——每一個都對應這一課的一個實驗">
          <ol style={{ margin: 0 }}>
            <li>
              <b>啟動</b>：把 divider 從任何 unused / lock-up state 拉回已知 state（XNOR 版 /3 與 /5 的實驗）。如果電路是 self-starting 的，這個用途可以省。
            </li>
            <li>
              <b>定義輸出相位</b>：讓多個 divider 從同一個 edge 開始（兩個 /2 的實驗）。self-starting 幫不上忙——每個 state 都合法正是相位不確定的原因。
            </li>
            <li>
              <b>載入初始 state</b>：MMD 的 program counter、dual-modulus cell 的 mode bit、fractional-N 的 DSM 累加器都需要一個已知起點，否則第一個 modulus cycle 的除數不對（Lesson 4-1、6-2 會用到）。
            </li>
          </ol>
        </Callout>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>只在有 reset 的 RTL 模擬裡驗證 divider</b>：unused state 永遠不會出現，lock-up 永遠抓不到。至少要用 state graph 或從每一個 initial state 各跑一次。
            </li>
            <li>
              <b>以為 /2 需要 reset 才會除頻</b>：/2 沒有 unused state，reset 只決定相位。反過來，以為「有 reset 的 divider 就一定不會 lock-up」也是錯的——reset 只保護上電那一刻，supply glitch 或 SEU 把它打進 lock-up 之後，沒有第二次 reset 它就死了。
            </li>
            <li>
              <b>用外部非同步訊號直接釋放 reset</b>：沒有 launch edge，STA 無法檢查 recovery/removal，每次上電都在賭。assert 可以非同步，de-assert 一定要經過 synchronizer。
            </li>
            <li>
              <b>reset tree 沒 balance</b>：單一 divider 沒事；多級或多相 divider 會出現隨機的相位/除數錯誤，而且與溫度有關。
            </li>
            <li>
              <b>用同步 reset 卻沒把 AND 算進 critical path</b>：Tclk,min 從 33 ps 變 47 ps 這種事，在 timing 報告出來之前很容易被忽略。
            </li>
            <li>
              <b>把 recovery violation 報成 setup violation、removal 報成 hold</b>：物理機制類似，但檢查的 pin 不同（reset pin vs D pin）、library 的數值不同、修法也不同（reset tree vs data path）。
            </li>
            <li>
              <b>reset pulse 太窄</b>：那是 pulse-width 問題，不是 recovery/removal 問題；synchronizer 會把 assert 拉長到至少一個 cycle，順便解決它。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="SystemVerilog：async reset、sync reset 與 reset synchronizer">
          <CodeBlock
            title="div3_async_rst.sv"
            code={`
module div3_async_rst (
  input  logic clk,
  input  logic rst_n,      // async active-low；de-assert 必須已經同步到 clk
  output logic div_out
);
  logic q0, q1;
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
      q0 <= 1'b0;          // reset state 00：定義起點與輸出相位
      q1 <= 1'b0;
    end else begin
      q0 <= ~(q1 | q0);    // d0 = NOR(q1, q0)
      q1 <= q0;            // d1 = q0
    end
  end
  assign div_out = q1;
endmodule
`}
            note="敏感列表裡的 negedge rst_n 就是「非同步」：reset 不等 clock。STA 會對 rst_n 做 recovery / removal check。"
          />
          <CodeBlock
            title="div3_sync_rst.sv"
            code={`
always_ff @(posedge clk) begin
  if (rst) begin            // 同步：rst 只是 D 的一個輸入，等 posedge 才生效
    q0 <= 1'b0; q1 <= 1'b0;
  end else begin
    q0 <= ~(q1 | q0);
    q1 <= q0;
  end
end
`}
            note="合成出來就是 d = next AND NOT rst：多一個 AND 在回授路徑上，rst 走普通 setup/hold check。"
          />
          <CodeBlock
            title="reset_sync.sv（assert async、de-assert sync）"
            code={`
module reset_sync (
  input  logic clk,
  input  logic rst_n_async,   // 外部、非同步
  output logic rst_n          // 給 divider：assert 立即、de-assert 對齊 clk
);
  logic s1;
  always_ff @(posedge clk or negedge rst_n_async) begin
    if (!rst_n_async) begin s1 <= 1'b0; rst_n <= 1'b0; end   // 立即 assert
    else              begin s1 <= 1'b1; rst_n <= s1;   end   // 兩個 edge 後才 de-assert
  end
endmodule
`}
            note="第二級 flop 讓第一級可能的 metastability 有一整個 cycle 可以 resolve。rst_n 的上升沿現在由 flop 在 clk edge launch，recovery / removal 才有辦法用 STA 檢查。"
          />
        </ModeContent>
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------------------------------------
 * 練習：陌生的 3-bit counter，找出所有 lock-up state
 * ---------------------------------------------------------------------------------------------- */
const EX_OPTS = { period: 100 }
function ExerciseComponent() {
  return <DividerSimPanel netlist={mystery3} schematic={mystery3Sch} options={EX_OPTS} title="練習電路：從任意 state 載入，逐 edge 觀察" allowInitialState compact showMeasure windowCycles={10} />
}

const lesson: LessonDef = {
  id: 'm8-l1-reset',
  module: 8,
  order: 1,
  title: 'Divider 為什麼需要 Reset',
  titleEn: 'Why dividers need reset',
  summary: '上電時 flop 的值由雜訊與 mismatch 決定；從任意 state 啟動看 divider 會不會回到合法循環；lock-up state 與 lock-up loop；非同步 / 同步 reset；reset 釋放的 recovery / removal；多級 divider 的 reset 要同時放開。',
  goals: [
    '解釋為什麼 RTL 模擬上電是 X，而矽片是「0 或 1 但不知道哪一個」，以及兩者為什麼都不能直接相信。',
    '用 state graph 把 reachable、unused、transient、lock-up 四種 state 分清楚，並從任意 state 逐 edge 驗證。',
    '判斷一個 divider 是不是 self-starting：/2 是、NOR 版 /3 是、XNOR 版 /3 與 twisted-ring /5 不是。',
    '分辨非同步與同步 reset 的生效時機、timing 檢查名稱與對 Fmax 的影響。',
    '用 launch / capture 的觀點做 recovery（像 setup）與 removal（像 hold）check，並說明多級 divider 為什麼要 balance reset tree。',
  ],
  readingMinutes: 45,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'single',
      prompt: '沒有 reset 的 /3（d0 = NOR(q1, q0)、d1 = q0）在 RTL 模擬裡輸出永遠是 X。最根本的原因是？',
      options: ['模擬器有 bug，矽片不會這樣', 'NOR(X, X) = X，而 next-state 的每個輸入都來自 X 的 flop，沒有任何 controlling value 可以把 X 消掉', 'NOR gate 在 RTL 裡不能處理 0 以外的值', 'clock 也是 X'],
      answer: 1,
      explanation: 'X 只能被 controlling value 消掉（NOR(1, X) = 0）。回授圈裡每個輸入都是 X，所以每個 edge 抓進來的還是 X。矽片上不會是 X，而是 0 或 1 之一——但你不知道是哪一個。',
    },
    {
      id: 'q2',
      type: 'state',
      prompt: 'NOR 版 /3（d0 = NOR(q1, q0)、d1 = q0）從 unused state q1q0 = 11 上電。經過 1 個 rising edge 之後 state 是？',
      answer: '10',
      width: 2,
      bitNames: ['q1', 'q0'],
      explanation: 'd0 = NOR(1, 1) = 0、d1 = q0 = 1 → 10。10 在主循環上，所以這個版本從 11 只要 1 個 edge 就回來：它是 self-starting 的。',
    },
    {
      id: 'q3',
      type: 'state',
      prompt: 'Twisted-ring /5（d2 = q1、d1 = q0、d0 = NOR(q2, q1·q0)）從 q2q1q0 = 010 上電。經過 3 個 rising edge 之後 state 是？',
      answer: '101',
      width: 3,
      bitNames: ['q2', 'q1', 'q0'],
      explanation: '010 → 101 → 010 → 101。010 與 101 互相跳，是一個 2-state 的 lock-up loop；輸出 q2 = 0,1,0,1 看起來像 /2。',
    },
    {
      id: 'q4',
      type: 'multiple',
      prompt: '下列哪些電路是 self-starting（從任何初始 state 都會回到合法循環，不需要 reset）？',
      options: ['/2（D = Q̄），沒有 reset', '/3：d0 = NOR(q1, q0)、d1 = q0', '/3：d0 = XNOR(q1, q0)、d1 = q0', 'Twisted-ring /5：d2 = q1、d1 = q0、d0 = NOR(q2, q1·q0)'],
      answers: [0, 1],
      explanation: '/2 沒有 unused state；NOR 版 /3 的 11 一步回到 10。XNOR 版 /3 的 11 自己跳回 11；/5 的 010 ↔ 101 互相跳。後兩者都需要 reset（或改 next-state logic，見 Lesson 8-2）。',
    },
    {
      id: 'q5',
      type: 'numeric',
      prompt: 'reset synchronizer RS 在 clk edge 送出 rst_n 的 de-assert：tCQ,max = 8 ps、BUF max = 6 ps、走線 max = 4 ps。FF0 的 t_recovery = 10 ps，Tclk = 100 ps，jitter = 2 ps，margin = 2 ps，skew = 0。recovery slack 是多少 ps？',
      answer: 68,
      unit: 'ps',
      explanation: 'arrival = 8 + 6 + 4 = 18 ps；required = 100 − 10 − 2 − 2 = 86 ps；slack = 86 − 18 = 68 ps。這條路徑 slack 很大，不是 Fmax 的瓶頸。',
    },
    {
      id: 'q6',
      type: 'single',
      prompt: 'rst_n 的 de-assert 在 clock edge 之後 2 ps 就到達 flop 的 reset pin，而 library 標示 t_removal = 5 ps。這是哪一種 violation？',
      options: ['setup violation', 'hold violation', 'recovery violation', 'removal violation'],
      answer: 3,
      explanation: 'de-assert 在 edge 之後太快到達 reset pin，是 removal（像 hold，但檢查的是 reset pin 不是 D pin）。recovery 是 de-assert 在 edge 之前來不及；setup / hold 是 D pin 的檢查。',
    },
    {
      id: 'q7',
      type: 'waveform',
      prompt: '三組波形都在 edge 3 之前把 reset assert、edge 4 之前釋放（或完全沒接 reset）。哪一組是「非同步 reset」的行為？',
      options: [
        { label: 'A', traces: waveSync },
        { label: 'B', traces: waveAsync },
        { label: 'C', traces: waveNoReset },
      ],
      answer: 1,
      tEnd: 650,
      period: QT,
      explanation: 'B：edge 2 之後 state = 10（q1 = 1）；rst_n 一拉低（edge 3 之前 0.35T），q1 立刻歸零，不等 clock edge——這就是非同步。A 是同步 reset：rst 拉高後 q1 要等到 edge 3 才變 0。C 的 reset 根本沒動，state 卡在 11。（q0 在 edge 2 之後本來就是 0，所以差別要看 q1。）',
    },
    {
      id: 'q8',
      type: 'single',
      prompt: '兩個並排的 /2 共用一條 rst_n，但到 B 的走線比到 A 長，使 B 的 reset 在 edge 2 之後 t_removal 以後才放開、A 在 edge 2 之前 t_recovery 以前就放開。上電後兩個輸出的關係是？',
      options: ['完全相同', '除頻比不同', '相位差一個輸入週期（/2 輸出的 180°），而且每次上電都一樣', '相位差隨機'],
      answer: 2,
      explanation: 'A 從 edge 2 開始 toggle，B 從 edge 3 開始。兩者都是 /2，但差一個 Tin。因為兩邊都在安全區內（不在 window 裡），結果是確定的、每次一樣——這反而讓 bug 更難被當成 timing 問題發現。',
    },
  ],
  exercise: {
    title: '陌生的 3-bit counter：找出所有 lock-up state',
    prompt: (
      <>
        <p>
          下面是一個沒看過的 3-flop 電路：d2 = q̄2·q1、d1 = q2 ⊕ q0、d0 = q̄0，輸出 q2。<b>先不要按模擬</b>，自己做：
        </p>
        <ol>
          <li>從 reset（000）逐 edge 走，找出主循環與除頻比、輸出 duty。</li>
          <li>把 8 個 state 全部列成 next-state table。</li>
          <li>從每一個 unused state 出發，追到它進主循環為止——或發現它永遠進不去。</li>
          <li>這個電路需要 reset 嗎？如果需要，reset 之後從哪個 state 開始、輸出第一個 rising edge 在第幾個 clock edge？</li>
        </ol>
        <p>做完再用下面的模擬器，從任意 state 載入驗證。</p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: ['寫出主循環（4 個 state）與除頻比', '列出 8 個 state 的 next-state', '找出所有 lock-up state，並說明它們是 self-loop 還是 loop', '指出哪一個 unused state 是 transient、要幾個 edge 回來'],
    answer: (
      <>
        <p>
          <b>主循環</b>：000 → 001 → 010 → 101 → 000，4 個 state，所以是 /4。輸出 q2 只在 101 為 1 → duty = 1/4 = 25%（注意：/4 用 3 個 flop，比必要的多一個 bit，所以 unused state 有 8 − 4 = 4 個）。
        </p>
        <p>
          <b>逐 state 追</b>：111 → (d2 = 0·1 = 0, d1 = 1⊕1 = 0, d0 = 0) = 000 → 1 個 edge 回到主循環，transient。100 → (d2 = 0·0 = 0, d1 = 1⊕0 = 1, d0 = 1) = 011；011 → (d2 = 1·1 = 1, d1 = 0⊕1 = 1, d0 = 0) = 110；110 → (d2 = 0·1 = 0, d1 = 1⊕0 = 1, d0 = 1) = 011。所以 011 ↔ 110 是 2-state lock-up loop，100 掉進這個 loop——<b>lock-up state = {'{011, 100, 110}'}</b>，其中 011、110 是 loop 本體，100 是「一步掉進 loop」的入口。
        </p>
        <p>
          在 loop 裡輸出 q2 = 0, 1, 0, 1…——又是一個假的 /2。這個電路<b>需要 reset</b>（或 Lesson 8-2 的改法）。reset 後從 000 開始，q2 第一次變 1 是 edge 3（state 101），所以第一個輸出 rising edge 在 edge 3。
        </p>
        <StateGraphTable netlist={mystery3} />
      </>
    ),
  },
}
export default lesson
