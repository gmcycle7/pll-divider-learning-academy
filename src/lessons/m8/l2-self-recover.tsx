import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Tabs, Term } from '@/components/content'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import type { SchematicHighlight } from '@/components/circuit/schematic'
import { div3, div3Lockup } from '@/models/divider/examples'
import { div3RecoverQb, div5Lockup, div5Recover, div5RecoverAlt, grayDiv3Fixed, grayDiv3FixedAlt, grayDiv3Lockup } from './models'
import { div3LockupSch, div3RecoverSch, div5LockupSch, div5RecoverAltSch, div5RecoverSch } from './schematics'
import { div3LockupTiming, div3MinimalTiming, div3RecoverTiming, div5LockupTiming, div5RecoverAltTiming, div5RecoverTiming } from './timing'
import { KMap, RecoverDesigner, RobustnessCostTable, StateGraphExplorer, StateGraphTable } from './Widgets'

/* ------------------------------------------------------------------------------------------------
 * 課文與 quiz 用的常數（module scope，避免 re-render 重建）
 * ---------------------------------------------------------------------------------------------- */
const COST_DIV3 = [
  { label: '/3 最簡版（NOR + wire）', netlist: div3, timing: div3MinimalTiming },
  { label: '/3 壞版（XNOR + wire）', netlist: div3Lockup, timing: div3LockupTiming },
  { label: '/3 修正版（NOR + AND）', netlist: div3RecoverQb, timing: div3RecoverTiming },
]
const COST_DIV5 = [
  { label: '/5 壞版（AND + NOR）', netlist: div5Lockup, timing: div5LockupTiming },
  { label: '/5 修法 A：多一個 AND（d1 = q0·q̄2）', netlist: div5Recover, timing: div5RecoverTiming },
  { label: '/5 修法 B：重新化簡（d0 = NOR(q2, q1)）', netlist: div5RecoverAlt, timing: div5RecoverAltTiming },
]

/** Quiz：/5 修正版 A 的四條候選路徑（highlight 用 div5RecoverSch 的 wire / element id） */
/** a10 = q1·q0：兩個輸入來自不同的 flop，所以這是兩條並列的 path，一起高亮 */
const CP_AND_NOR: SchematicHighlight = {
  style: 'setup',
  wires: ['w_q0_and10_in1', 'w_q1_and10_in0', 'w_a10_nor_in1', 'w_d0'],
  elements: ['and10', 'nor'],
  tags: [{ elementOrWire: 'ff0', text: 'launch = capture（edge k → k+1）' }, { elementOrWire: 'ff1', text: '同一個 AND 的另一個 launch（delay 相同）' }],
}
const CP_AND2: SchematicHighlight = { style: 'setup', wires: ['w_q2_b_and2_in0', 'w_d1'], elements: ['and2'], tags: [{ elementOrWire: 'ff2', text: 'launch（Q̄）' }, { elementOrWire: 'ff1', text: 'capture' }] }
const CP_Q2_NOR: SchematicHighlight = { style: 'setup', wires: ['w_q2_nor_in0', 'w_d0'], elements: ['nor'], tags: [{ elementOrWire: 'ff2', text: 'launch' }, { elementOrWire: 'ff0', text: 'capture' }] }
const CP_WIRE: SchematicHighlight = { style: 'setup', wires: ['w_q1_ff2'], tags: [{ elementOrWire: 'ff1', text: 'launch' }, { elementOrWire: 'ff2', text: 'capture' }] }

function Content() {
  return (
    <>
      <Section title="先用直覺想：迷路的人需要路標" en="Intuition: every side street needs a signpost">
        <p>
          把 divider 的 state 想成一座城市。主循環是一條環狀大道，正常運作時你永遠在大道上繞圈。unused state 是旁邊的小巷——正常不會進去，但上電、supply glitch、粒子撞擊都可能把你丟進去。Lesson 8-1 看過三種小巷：
        </p>
        <ul>
          <li>有路標，一兩個路口就回到大道（transient state，NOR 版 /3 的 11）。</li>
          <li>死巷，原地打轉（self-loop，XNOR 版 /3 的 11）。</li>
          <li>兩條小巷互通，繞圈永遠回不到大道（lock-up loop，/5 的 010 ↔ 101）。</li>
        </ul>
        <p>
          <Term zh="自我回復狀態機" en="self-recovering state machine" /> 的定義很簡單：<b>每一條小巷都有路標，而且最多 1–2 個路口就回到大道</b>。這一課要做的事就是替每一個 unused state 立路標——也就是替 K-map 上每一格 don&apos;t care 決定它的值——然後算清楚代價：多幾個 gate、慢幾 ps、多多少面積與功耗。
        </p>
        <Callout kind="idea" title="don't care 不是「不管」">
          在 K-map 上寫 x 的意思是「我把這一格交給化簡工具，它要填 0 或 1 都可以」。工具一定會填——填成讓 gate 最少的那個值——而那個值就決定了 unused state 的 next state。<b>你沒有決定，不代表沒有人決定。</b>self-recovering 設計的第一步就是把決定權拿回來。
        </Callout>
      </Section>

      <Section title="先讓它失敗：/3 的 11" en="Make it fail first: the /3 stuck at 11">
        <p>Lesson 8-1 的 XNOR 版 /3。合法 state 上它跟 NOR 版一模一樣，只有 11 不同。從 11 出發：</p>
        <LogicDiagram schematic={div3LockupSch} showValues={false} />
        <StateGraphExplorer netlist={div3Lockup} schematic={div3LockupSch} title="壞版 /3：從 11 啟動" initialStart="11" windowCycles={6} />
        <Steps
          items={[
            <>
              <b>state = 11</b>：d0 = XNOR(q1 = 1, q0 = 1) = 1（兩個輸入相同），d1 = q0 = 1。
            </>,
            <>
              <b>edge 1</b>：FF0 抓 1、FF1 抓 1 → 11。跟 edge 前一樣。
            </>,
            <>
              <b>edge 2、3、4…</b>：每次都算出 d1d0 = 11，每次都抓回 11。輸出 q1 = 1 固定不動：這不是 /3，是「/∞」。走過的 state 那一列會一直是紅色。
            </>,
            <>
              <b>用 state graph 講</b>：11 的箭頭指回自己。只要沒有外力（reset）介入，它永遠不會踏上 00 → 01 → 10 這條大道。
            </>,
          ]}
        />
      </Section>

      <Section title="State table 與 K-map：那一格 x 到底填了什麼" en="State table and K-map: what did that x become?">
        <p>
          把 /3 的 next-state 完整寫出來。合法 state 三個，第四個 11 是 unused，所以 d1、d0 在 11 那一格都是 don&apos;t care：
        </p>
        <div className="scroll-x">
          <table className="state-table">
            <thead>
              <tr>
                <th>q1 q0</th>
                <th>合法？</th>
                <th>d1（下一個 q1）</th>
                <th>d0（下一個 q0）</th>
                <th>next</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>00</td>
                <td>是</td>
                <td>0</td>
                <td>1</td>
                <td>01</td>
              </tr>
              <tr>
                <td>01</td>
                <td>是</td>
                <td>1</td>
                <td>0</td>
                <td>10</td>
              </tr>
              <tr>
                <td>10</td>
                <td>是</td>
                <td>0</td>
                <td>0</td>
                <td>00</td>
              </tr>
              <tr>
                <td>11</td>
                <td>unused</td>
                <td>x₁</td>
                <td>x₀</td>
                <td>由 x₁x₀ 決定</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em 1.5em', alignItems: 'flex-start' }}>
          <KMap vars={['q1', 'q0']} cells={{ '00': '0', '01': '1', '10': '0', '11': 'x' }} title="K-map：d1" marks={{ '11': 'x₁' }} />
          <KMap vars={['q1', 'q0']} cells={{ '00': '1', '01': '0', '10': '0', '11': 'x' }} title="K-map：d0" marks={{ '11': 'x₀' }} />
        </div>
        <p>
          兩格 x，四種填法。每一種都是一個「不同的電路」，在合法 state 上行為完全相同，只有 11 往哪走不同：
        </p>
        <CompareTable
          head={['x₁（d1@11）', 'x₀（d0@11）', 'd1 化簡結果', 'd0 化簡結果', '11 →', '結果', '代價']}
          rows={[
            ['1', '0', 'd1 = q0（一條 wire）', 'd0 = q̄1·q̄0 = NOR(q1, q0)', '10', <span key="a" className="chip chip-ok">1 個 edge 回到主循環</span>, '0 個 AND：最便宜。Lesson 2-1 的版本——它 self-starting 是「剛好」，不是設計出來的'],
            ['1', '1', 'd1 = q0', 'd0 = XNOR(q1, q0)', '11', <span key="b" className="chip chip-danger">lock-up</span>, 'XNOR 比 NOR 慢又大，而且壞掉。這是壞版'],
            ['0', '0', 'd1 = q0·q̄1（一個 AND）', 'd0 = NOR(q1, q0)', '00', <span key="c" className="chip chip-ok">1 個 edge，直接回 reset state</span>, '+1 AND（用 FF1 的 Q̄ 就不必再加 inverter）。這是 div3Recover'],
            ['0', '1', 'd1 = q0·q̄1', 'd0 = XNOR(q1, q0)', '01', <span key="d" className="chip chip-ok">1 個 edge</span>, '+1 AND，而且用了較慢的 XNOR：沒有理由選它'],
          ]}
        />
        <Callout kind="method" title="填 x 的固定流程（每一個 divider 都這樣做）">
          <ol style={{ margin: 0 }}>
            <li>列出全部 <Math>{'2^n'}</Math> 個 state，標出主循環。</li>
            <li>
              替每一個 unused state <b>指定</b> next state：直接指到主循環上的某個 state（1 步），或指到另一個「已經會回去」的 unused state（2 步）。指到 reset state 最直覺，但不一定最便宜。
            </li>
            <li>把指定的值填回 K-map（x 變成 0 或 1），重新化簡 d 的 equation。</li>
            <li>用 state graph 驗證：lock-up 集合為空、最壞步數 ≤ 目標（通常 1–2）。</li>
            <li>把新 equation 的 gate 放進 timing scenario，看 critical path 有沒有變。</li>
          </ol>
        </Callout>
      </Section>

      <Section title="修正版逐 edge：11 → 00 → 01 → 10" en="The fixed /3 edge by edge">
        <p>
          選第三種填法：d1 = q0·q̄1、d0 = NOR(q1, q0)。q̄1 直接用 FF1 的 Q̄ 輸出，所以只多一個 2-input AND。電路與從 11 啟動的結果：
        </p>
        <LogicDiagram schematic={div3RecoverSch} showValues={false} />
        <StateGraphExplorer netlist={div3RecoverQb} schematic={div3RecoverSch} title="修正版 /3：從 11 啟動" initialStart="11" windowCycles={6} />
        <Steps
          items={[
            <>
              <b>state = 11</b>：d0 = NOR(1, 1) = 0；d1 = q0·q̄1 = 1·0 = 0。edge 前 D 已經是 00。
            </>,
            <>
              <b>edge 1</b>：抓進 00。<b>1 個 edge</b> 就回到主循環，而且回到的是 reset state。
            </>,
            <>
              <b>edge 2、3、4</b>：00 → 01 → 10 → 00，除 3，與從 reset 開始完全相同。點「用 reset 啟動」再走一遍確認主循環沒被動到。
            </>,
            <>
              <b>合法 state 為什麼不受影響</b>：在 00、01、10 三個 state 裡，q0 = 1 的只有 01，而 01 的 q1 = 0，所以 q0·q̄1 = q0。新的 AND 只在 11 這一格「有感」。
            </>,
          ]}
        />
      </Section>

      <Section title="/5：兩種修法，代價差很多" en="The /5: two fixes with very different costs">
        <p>
          回到 Lesson 8-1 的 twisted-ring /5（d2 = q1、d1 = q0、d0 = NOR(q2, q1·q0)）。它有 3 個 unused state：111 一步回來，010 ↔ 101 是 lock-up loop。先從 010 啟動確認失敗，順便看它輸出假的 /2：
        </p>
        <StateGraphExplorer netlist={div5Lockup} schematic={div5LockupSch} title="壞版 /5：從 010 啟動" initialStart="010" windowCycles={8} />
        <p>
          現在畫 d0 的 3 變數 K-map。合法 state 五個，unused 三格是 x：
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em 1.5em', alignItems: 'flex-start' }}>
          <KMap vars={['q2', 'q1', 'q0']} cells={{ '000': '1', '001': '1', '011': '0', '010': 'x', '100': '0', '101': 'x', '111': 'x', '110': '0' }} title="K-map：d0（原始，三格 x）" marks={{ '010': '壞版填 1', '101': '填 0', '111': '填 0' }} />
          <KMap vars={['q2', 'q1', 'q0']} cells={{ '000': '0', '001': '1', '011': '1', '010': 'x', '100': '0', '101': 'x', '111': 'x', '110': '0' }} title="K-map：d1（原始 d1 = q0）" marks={{ '101': '壞版填 1', '111': '填 1', '010': '填 0' }} />
        </div>
        <Steps
          items={[
            <>
              <b>壞版怎麼來的</b>：設計者從 Johnson /6（d0 = q̄2）出發，加了一項「q1·q0 = 1 時擋住」把 011 → 111 改成 011 → 110。d0 = q̄2·(q̄1 + q̄0)。這個式子在 010 那一格算出 <b>1</b>（q2 = 0、q0 = 0）——沒有人決定，是化簡「順便」填的。於是 010 → d2d1d0 = 1,0,1 = 101。
            </>,
            <>
              <b>101 為什麼又回 010</b>：d1 = q0 在 101 那一格是 1（也是順便填的），d2 = q1 = 0，d0 = NOR(1, ·) = 0 → 010。兩格「順便」湊在一起，就成了 loop。
            </>,
            <>
              <b>修法 A（局部修補）</b>：保留 d0，只把 d1 在 101 那格改成 0：d1 = q0·q̄2。合法 state 裡 q0 = 1 的（001、011）q2 都是 0，所以主循環不變。101 → 000（1 步）、010 → 101 → 000（2 步）、111 → 100（1 步）。多一個 AND。
            </>,
            <>
              <b>修法 B（重新化簡）</b>：看 d0 的 K-map，1 只在 000、001 兩格。最大的 group 是 q̄2·q̄1（覆蓋 000、001，並把 010 填成 0）。d0 = NOR(q2, q1)——比原本<b>少一個 AND</b>。010 → 100（1 步）、101 → 010 → 100（2 步）、111 → 110（1 步）。
            </>,
            <>
              <b>為什麼 B 合法</b>：合法 state 裡「q2 = 0 且 q1 = 1」只有 011，此時 q0 = 1，所以 q1·q0 與 q1 在所有合法 state 上相等——原本的 AND 從頭到尾都是多餘的，只是它剛好把 010 填成了會出事的值。
            </>,
          ]}
        />
        <Tabs
          tabs={[
            {
              label: '修法 A：d1 = q0·q̄2（從 010 啟動）',
              content: <StateGraphExplorer netlist={div5Recover} schematic={div5RecoverSch} title="修法 A：010 → 101 → 000，2 個 edge" initialStart="010" windowCycles={8} />,
            },
            {
              label: '修法 B：d0 = NOR(q2, q1)（從 101 啟動）',
              content: <StateGraphExplorer netlist={div5RecoverAlt} schematic={div5RecoverAltSch} title="修法 B：101 → 010 → 100，2 個 edge" initialStart="101" windowCycles={8} />,
            },
          ]}
        />
        <Steps
          items={[
            <>
              <b>修法 A，從 010</b>：d2 = q1 = 1、d1 = q0·q̄2 = 0·1 = 0、d0 = NOR(0, 1·0) = 1 → edge 1 後 101。再算：d2 = 0、d1 = q0·q̄2 = 1·0 = <b>0</b>（這裡跟壞版不同）、d0 = NOR(1, 0) = 0 → edge 2 後 000。回到 reset state。
            </>,
            <>
              <b>修法 B，從 101</b>：d2 = q1 = 0、d1 = q0 = 1、d0 = NOR(q2 = 1, q1 = 0) = 0 → edge 1 後 010。再算：d2 = 1、d1 = 0、d0 = NOR(0, 1) = <b>0</b>（壞版這裡是 1）→ edge 2 後 100。100 在主循環上。
            </>,
            <>
              <b>兩種都是 2 個 edge 內回來、都沒有 lock-up</b>。差別在下面的 critical path 與代價表。
            </>,
          ]}
        />
      </Section>

      <Section title="把回復寫成數學" en="Recovery, quantified">
        <p>
          設 unused state 的集合為 <Math>{'U'}</Math>（<Math>{'|U| = 2^n - N'}</Math>），每個 <Math>{'s \\in U'}</Math> 走到主循環的步數為 <Math>{'k(s)'}</Math>。self-recovering 的條件與回復時間：
        </p>
        <Math block>{'\\forall s \\in U:\\ k(s) < \\infty,\\qquad k_{max} = \\max_{s \\in U} k(s),\\qquad t_{recover} = k_{max}\\, T_{in}'}</Math>
        <p>
          變數：<Math>{'n'}</Math> = state bit 數、<Math>{'N'}</Math> = 除頻比（主循環長度）、<Math>{'T_{in}'}</Math> = 輸入 clock 週期（ps）。<Math>{'k_{max}'}</Math> 的理論上限是 <Math>{'|U|'}</Math>（所有 unused state 排成一條鏈才會這麼長），實務目標是 <Math>{'k_{max} \\le 2'}</Math>：修正版 /3 是 1，兩種 /5 修法都是 2。
        </p>
        <p>新 gate 對速度的影響只有兩種情況：</p>
        <Math block>{'T_{clk,min}^{\\prime} = \\begin{cases} T_{clk,min} & \\text{新 gate 所在路徑的 arrival} \\le \\text{原 critical path 的 arrival} \\\\ T_{clk,min} + \\Delta t & \\text{否則（}\\Delta t = \\text{新路徑 arrival} - \\text{原 arrival）} \\end{cases}'}</Math>
        <p>
          <Math>{'T_{clk,min}'}</Math> 是最小 clock 週期（ps），<Math>{'\\Delta t'}</Math> 是新路徑比原 critical path 多出的 delay（ps）。要判斷落在哪一種情況，不能只看「多了一個 gate」——要看那個 gate 的 launch 是誰、capture 是誰、跟原本最慢那條比誰長。
        </p>
        <StateGraphTable netlist={div5RecoverAlt} />
      </Section>

      <Section title="Critical path：新增的 gate 有沒有變成瓶頸？" en="Did the new gate become the critical path?">
        <p>
          先看 /3。三個版本並排：最簡版（NOR + wire）、壞版（XNOR + wire）、修正版（NOR + AND）。每一個 tab 都先問：launch 在哪？經過什麼？capture 在哪？arrival 幾 ps？
        </p>
        <Tabs
          tabs={[
            { label: '/3 最簡版（NOR + wire）', content: <CriticalPathExplorer scenario={div3MinimalTiming} initialPath="q1-nor-d0" compact /> },
            { label: '/3 壞版（XNOR + wire）', content: <CriticalPathExplorer scenario={div3LockupTiming} initialPath="q1-xnor-d0" compact /> },
            { label: '/3 修正版（NOR + AND）', content: <CriticalPathExplorer scenario={div3RecoverTiming} initialPath="q1b-and-d1" compact /> },
          ]}
        />
        <Steps
          items={[
            <>
              <b>最簡版</b>：FF1.Q → NOR → FF0.D，arrival = 8 + 12 = 20 ps，Tclk,min = 20 + 7 + 2 + 2 = <b>31 ps</b>。另一條 FF0.Q → wire → FF1.D 只有 10 ps，它的問題是 hold：min delay 5 + 1 = 6 ps，hold slack 只剩 3 ps。
            </>,
            <>
              <b>壞版</b>：XNOR 14 ps，arrival 22 ps，Tclk,min = <b>33 ps</b>。慢 2 ps，而且會 lock-up——沒有任何好處。
            </>,
            <>
              <b>修正版</b>：FF1.Q̄ → AND → FF1.D 與 FF0.Q → AND → FF1.D 都是 8 + 14 = 22 ps，<b>超過</b>原本 NOR 路徑的 20 ps。新的 AND <b>變成了 critical path</b>，Tclk,min 從 31 變 <b>33 ps</b>（+6.5%）。這是「情況二」：Δt = 2 ps。
            </>,
            <>
              <b>順便得到的好處</b>：d1 那條原本只是 wire 的路徑現在多了 AND，min delay 從 6 ps 變 14 ps，hold slack 從 3 變 11 ps。self-recovery 的 AND 同時解掉了 hold 的隱憂。
            </>,
          ]}
        />
        <p>再看 /5，三個版本：</p>
        <Tabs
          tabs={[
            { label: '/5 壞版', content: <CriticalPathExplorer scenario={div5LockupTiming} initialPath="q0-and-nor-d0" compact /> },
            { label: '/5 修法 A（+AND2）', content: <CriticalPathExplorer scenario={div5RecoverTiming} initialPath="q2b-and2-d1" compact /> },
            { label: '/5 修法 B（重新化簡）', content: <CriticalPathExplorer scenario={div5RecoverAltTiming} initialPath="q1-nor-d0" compact /> },
          ]}
        />
        <Steps
          items={[
            <>
              <b>壞版</b>：FF0.Q → AND → NOR → FF0.D 兩級 logic，arrival = 8 + 14 + 12 = 34 ps，Tclk,min = <b>45 ps</b>。注意 AND 的另一個輸入是 q1，所以 <b>FF1.Q → AND → NOR → FF0.D 也是一條 path</b>，delay 一模一樣（34 ps）——同一個 gate 有兩個來自不同 flop 的輸入，就有兩條並列最差的 path（Lesson 7-2 Step 4 的窮舉原則）。Explorer 的清單裡兩條都在。
            </>,
            <>
              <b>修法 A</b>：新的 AND2 也是兩輸入（q̄2 與 q0），所以一樣是兩條：FF2.Q̄ → AND2 → FF1.D 與 FF0.Q → AND2 → FF1.D，都只有 22 ps，比 34 ps 短——它們<b>沒有</b>變成 critical path。Tclk,min 仍是 45 ps，Δt = 0。這是「情況一」：多一個 gate、不多一 ps。
            </>,
            <>
              <b>修法 B</b>：AND 消失，最長路徑變成 FF1.Q → NOR → FF0.D = 20 ps，Tclk,min = <b>31 ps</b>。修 lock-up 的同時 Fmax 從 22 GHz 升到 32 GHz。
            </>,
            <>
              <b>教訓</b>：「修 lock-up 一定會變慢」是錯的。修補式（A）常常不進 critical path；重新化簡式（B）甚至可能更快——因為原本的 lock-up 本來就是「多餘的 gate 順便填錯 x」造成的。
            </>,
          ]}
        />
      </Section>

      <Section title="代價總表：gate、速度、面積、功耗、robustness" en="The full bill: logic, speed, area, power, robustness">
        <p>下面兩張表的每一個數字都由 netlist 與 timing scenario 直接算出來（gate 數、電晶體估計、最差 setup/hold、real-delay 模擬下的 gate 翻轉次數、state graph）。</p>
        <RobustnessCostTable rows={COST_DIV3} title="/3：三個版本" />
        <RobustnessCostTable rows={COST_DIV5} title="/5：壞版與兩種修法" />
        <Callout kind="note" title="怎麼讀這兩張表">
          <ul style={{ margin: 0 }}>
            <li>
              <b>面積</b>：只算 next-state logic。/3 修正版多 6 顆電晶體（一個 static AND）；相對兩個 flop（各 ≈ 24 顆）是 +12%。/5 修法 B 反而少 6 顆。
            </li>
            <li>
              <b>功耗</b>：flop 的翻轉三個版本相同（同樣的 state 序列），差別只在 gate 輸出的翻轉次數。多一個 gate 通常多幾次翻轉；但 XNOR 這種內部節點多的 gate 每次翻轉的 C·V² 也比 NOR 大，表裡沒算進去。
            </li>
            <li>
              <b>Robustness</b>：lock-up 那一列是紅的就是不及格，其餘再談。self-recovering 的價值不只在上電——它也是 supply glitch 與 SEU 之後<b>不需要 reset</b> 就能自己活過來的唯一保證。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="RTL 怎麼寫才會真的合成出 self-recovering">
          <CodeBlock
            title="div3_recover.sv"
            code={`
module div3_recover (
  input  logic clk,
  input  logic rst_n,
  output logic div_out
);
  logic q0, q1;
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) {q1, q0} <= 2'b00;
    else begin
      // 明確寫出 4 個 state 的 next-state：11 這一格不是 don't care
      case ({q1, q0})
        2'b00:   {q1, q0} <= 2'b01;
        2'b01:   {q1, q0} <= 2'b10;
        2'b10:   {q1, q0} <= 2'b00;
        default: {q1, q0} <= 2'b00;   // 11 → 00：self-recovery
      endcase
    end
  end
  assign div_out = q1;
endmodule
`}
            note="合成器看到完整的 case 會得到 d1 = q0·q̄1、d0 = NOR(q1, q0)。若你寫 default: {q1,q0} <= 2'bxx（或加 full_case / unique 讓工具把 11 當 don't care），它就會回到最便宜的 d1 = q0——self-recovery 被優化掉了，而且 RTL 模擬看不出來。"
          />
          <p>
            驗證不能只靠 reset 後的模擬。至少做一件事：用 formal（或簡單的 script）從每一個 <Math>{'2^n'}</Math> state 各跑 <Math>{'|U| + 1'}</Math> 個 cycle，檢查都進了主循環——這一課的工具做的就是這件事；gate-level 網表合成之後再做一次，因為工具可能已經把你的 default 分支「化簡」掉了。
          </p>
        </ModeContent>
      </Section>

      <Section title="替代方案：只靠 reset、watchdog、one-hot" en="Alternatives: reset only, watchdog, one-hot">
        <CompareTable
          head={['方案', '額外硬體', '回復時間', '覆蓋上電以外的事件（glitch / SEU）？', '對 Fmax 的影響', '什麼時候用']}
          rows={[
            ['只靠 reset', 'reset pin（flop 略大）+ reset tree + synchronizer', '需要外部再 assert 一次 reset；沒有人 assert 就永遠不回來', <span key="r" className="chip chip-danger">否</span>, '非同步：無；同步：回授路徑多一個 AND', '低速控制邏輯；或者 divider 本身已經 self-starting、reset 只用來定相位'],
            ['Watchdog（illegal-state detector → 內部 clear）', '解碼所有 illegal state 的 gate（/5 需要偵測 010、101、111：2–3 個 gate + OR）+ 一個 clear 路徑', '1–2 cycle（偵測到之後同步 clear）', <span key="w" className="chip chip-ok">是</span>, 'clear 進 D path：多一個 AND，常常進 critical path；若改成 async clear 則有 glitch 風險', '狀態機很大、無法逐格重新化簡時。對 2–3 bit 的 divider，偵測器的 gate 數常比直接修 equation 還多'],
            ['One-hot（/N 用 N 個 flop）', 'flop 數從 ⌈log₂N⌉ 變成 N；next-state 幾乎沒有 logic（ring）', '需要 self-correcting ring（例如 d0 = NOR(q1…q_{N−1})）才會回復，否則 illegal state 有 2^N − N 個', '要看有沒有加 correction logic', 'next-state 只有 wire 或一個 NOR：最快；但 flop 多、clock 負載大', '高速、N 小（2–4）；例如 CML prescaler 的 Johnson / ring 結構'],
            ['Self-recovering next-state logic（本課）', '0–1 個 gate；重新化簡時可能是負的', '1–2 cycle，設計時就定死', <span key="s" className="chip chip-ok">是</span>, '要算：可能不變（/5 修法 A）、可能 +Δt（/3）、可能更快（/5 修法 B）', '一律建議；reset 仍然保留給「定相位」與「載入初始 state」'],
          ]}
        />
        <ModeContent level="deep" title="高速實作：為什麼 self-recovery 在 CML / TSPC divider 裡是必修">
          <ul>
            <li>
              <b>沒有 reset 可用</b>：CML latch 的輸出節點每多一顆 reset 電晶體就多幾 fF；在 20–40 GHz 的 prescaler 裡這直接吃掉 tCQ 預算，所以前級幾乎都不接 reset。self-starting 是唯一的啟動保證——設計時就要用 state graph 把每一個 unused state 檢查完。
            </li>
            <li>
              <b>SEU 與 supply glitch</b>：運作中一個 state bit 被翻掉，等於瞬間跳到任意 state。有 reset 也沒用（沒有人會再拉一次）；self-recovering 的 <Math>{'k_{max}'}</Math> 就是 PLL 失鎖後的最大恢復時間，直接進 lock-time 規格。
            </li>
            <li>
              <b>用 Q̄ 而不是 inverter</b>：CML 與大多數 master-slave flop 天生有差動 / 互補輸出。d1 = q0·q̄1 的 q̄1 直接取 FF1 的 Q̄，logic delay 只多一個 AND，不多 inverter；在 CML 裡甚至可以把 AND 摺進 latch 的輸入 differential pair（merged logic），Δt 接近 0。
            </li>
            <li>
              <b>Glitch</b>：新增的 AND 有兩個輸入來自不同 flop（q0 與 q̄1），tCQ 的差異會讓 AND 輸出在 edge 後出現幾 ps 的 runt。它接的是 D pin，只要在下一個 edge 前穩定就無妨；但如果同樣的手法用在 clock gating 或 modulus 控制上（Lesson 3-2、5-2），runt 會直接變成 pulse-width violation。
            </li>
            <li>
              <b>PVT 與 jitter margin</b>：/3 修正版把 Tclk,min 從 31 推到 33 ps，看似只有 2 ps，但在 slow corner logic delay 放大 1.3–1.5 倍時，Δt 也跟著放大；jitter margin 是固定的 ps 數，不會跟著長。所以要在 slow corner 重新確認新 gate 是否仍不在 critical path。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>以為 case 的 default 分支就等於 self-recovery</b>：合成 pragma（full_case、unique、default 給 x）會讓工具把 unused state 當 don&apos;t care 重新化簡，default 分支形同虛設。要在 gate-level 網表上再驗一次。
            </li>
            <li>
              <b>只檢查 self-loop</b>：11 → 11 很好找，010 ↔ 101 這種 2-state loop 或更長的 loop 要靠 state graph 的「到主循環的步數」才看得到。
            </li>
            <li>
              <b>修完不重跑 timing</b>：/3 的 AND 進了 critical path（+2 ps），/5 的 AND2 沒有——不算不知道。
            </li>
            <li>
              <b>改 output decode 而不是 next-state</b>：把輸出用 gate「遮掉」illegal state 的值，state 還是在 loop 裡，divider 還是死的。
            </li>
            <li>
              <b>讓 unused state 回到主循環的「任意」相位</b>：對單一 divider 無所謂；對 I/Q 或多相輸出，回復後相位可能與另一路對不上，需要再一次 reset 才能對齊。若相位重要，把所有 unused state 都指到同一個 state（例如 reset state）。
            </li>
            <li>
              <b>一次填太多 x 成 1</b>：填 1 通常需要多一項乘積（多 gate），填 0 通常是「少覆蓋一格」（少 gate）。先試把 x 填成讓 group 更大的值，往往既沒有 lock-up 又更省——/5 修法 B 就是這樣來的。
            </li>
          </ul>
        </Callout>
      </Section>
    </>
  )
}

/* ------------------------------------------------------------------------------------------------
 * 練習：Gray-code /3（00 → 01 → 11），state 10 自己跳回自己。改 equation 讓它 self-recovering。
 * ---------------------------------------------------------------------------------------------- */
function ExerciseComponent() {
  return <RecoverDesigner />
}

const lesson: LessonDef = {
  id: 'm8-l2-self-recover',
  module: 8,
  order: 2,
  title: '如何設計 Self-Recovering State Machine',
  titleEn: 'Designing a self-recovering state machine',
  summary: '先讓有 lock-up 的 /3 與 /5 從 illegal state 啟動失敗，再用 K-map 把 don\'t care 一格一格填回去，改 next-state logic 讓每個 unused state 1–2 個 edge 回到主循環；用 Critical Path Explorer 與代價表比較 gate、速度、面積、功耗與 robustness；替代方案：只靠 reset、watchdog、one-hot。',
  goals: [
    '從 illegal state 逐 edge 走，親眼看到 lock-up（self-loop 與 2-state loop）與它對輸出的影響。',
    '把 K-map 上的 don\'t care 填回 0 / 1，說出每一種填法對應的電路與 unused state 的去向。',
    '設計出 stepsToCycle ≤ 2、無 lock-up 的 /3 與 /5，並用 state graph 驗證。',
    '判斷新增的 gate 有沒有進 critical path（launch / capture / arrival 比較），算出 Tclk,min 的變化。',
    '用數字比較修正前後的 gate 數、面積、功耗代理與 robustness，並說明何時該用 reset、watchdog 或 one-hot。',
  ],
  readingMinutes: 45,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'single',
      prompt: 'XNOR 版 /3（d0 = XNOR(q1, q0)、d1 = q0）從 q1q0 = 11 上電。輸出 q1 會是什麼樣子？',
      options: ['正常的 /3，只是相位不同', '/2', '固定為 1，沒有任何 edge', '固定為 0'],
      answer: 2,
      explanation: '11 → d1d0 = 1,1 → 11，永遠不變。q1 = 1 固定，輸出沒有 edge。PLL 的相位偵測器會看到反饋 clock 消失。',
    },
    {
      id: 'q2',
      type: 'state',
      prompt: '壞版 /5（d2 = q1、d1 = q0、d0 = NOR(q2, q1·q0)）從 q2q1q0 = 101 上電。2 個 rising edge 之後 state 是？',
      answer: '101',
      width: 3,
      bitNames: ['q2', 'q1', 'q0'],
      explanation: '101 → (d2 = 0, d1 = 1, d0 = NOR(1, 0) = 0) = 010 → (d2 = 1, d1 = 0, d0 = NOR(0, 0) = 1) = 101。兩步回到自己，是 lock-up loop。',
    },
    {
      id: 'q3',
      type: 'critical-path',
      prompt: '/5 修法 A 新增了 AND2（d1 = q0·q̄2）。修正後哪一條是 Fmax 的 setup critical path？',
      schematic: div5RecoverSch,
      options: [
        { label: 'FF0.Q → AND → NOR → FF0.D（兩級 logic）', highlight: CP_AND_NOR, description: 'arrival = 8 + 14 + 12 = 34 ps' },
        { label: 'FF2.Q̄ → AND2 → FF1.D（新增的 AND）', highlight: CP_AND2, description: 'arrival = 8 + 14 = 22 ps' },
        { label: 'FF2.Q → NOR → FF0.D', highlight: CP_Q2_NOR, description: 'arrival = 8 + 12 = 20 ps' },
        { label: 'FF1.Q → wire → FF2.D', highlight: CP_WIRE, description: 'arrival = 8 + 2 = 10 ps' },
      ],
      answer: 0,
      explanation:
        '新增的 AND2 路徑（FF2.Q̄ 與 FF0.Q 兩條，各 22 ps）都比原本的兩級 AND → NOR（34 ps）短，所以 critical path 不變，Tclk,min 仍是 45 ps。注意兩級那條也是兩條並列：a10 = q1·q0，FF0.Q 與 FF1.Q 各走一條，delay 相同。「多一個 gate」不等於「變慢」——要比 arrival。',
    },
    {
      id: 'q4',
      type: 'numeric',
      prompt: '/3 修正版：FF1.Q̄ → AND → FF1.D，tCQ,max = 8 ps、AND max = 14 ps、tsetup = 7 ps、jitter = 2 ps、margin = 2 ps、skew = 0。Tclk,min 是多少 ps？',
      answer: 33,
      unit: 'ps',
      explanation: '8 + 14 + 7 + 2 + 2 = 33 ps。原本最簡版是 NOR 路徑的 8 + 12 + 7 + 2 + 2 = 31 ps：self-recovery 在這個 /3 上多付 2 ps。',
    },
    {
      id: 'q5',
      type: 'multiple',
      prompt: '/3 修正版（d0 = NOR(q1, q0)、d1 = q0·q̄1）裡，哪些路徑的 setup arrival = 22 ps（並列最差）？',
      options: ['FF1.Q → NOR → FF0.D', 'FF1.Q̄ → AND → FF1.D', 'FF0.Q → AND → FF1.D', 'FF0.Q → NOR → FF0.D'],
      answers: [1, 2],
      explanation: '兩條經過 AND 的路徑都是 tCQ 8 + AND 14 = 22 ps；經過 NOR 的是 8 + 12 = 20 ps。同一個 AND 的兩個輸入來自不同的 launch flop，所以有兩條並列的 critical path。',
    },
    {
      id: 'q6',
      type: 'single',
      prompt: '關於 K-map 上的 don\'t care（x），下列哪一句是對的？',
      options: ['x 代表這個 state 永遠不會發生，所以不影響電路', '化簡工具會把每一個 x 填成 0 或 1，而那個值就決定了 unused state 的 next state；設計者必須事後驗證或事前指定', 'x 一定會被填成 0', '有 reset 的電路可以放心用 x'],
      answer: 1,
      explanation: 'x 只是把決定權交給工具。壞版 /5 的 lock-up 就是化簡「順便」把 010 那格的 d0 填成 1 造成的。reset 只保護上電那一刻，glitch / SEU 之後就沒有人來救。',
    },
    {
      id: 'q7',
      type: 'single',
      prompt: '/5 修法 B 把 d0 從 NOR(q2, q1·q0) 改成 NOR(q2, q1)。為什麼主循環不會被改壞？',
      options: ['因為 q1·q0 在所有 state 都等於 q1', '因為合法 state 裡「q2 = 0 且 q1 = 1」只有 011，此時 q0 = 1，所以在所有合法 state 上 q1·q0 = q1', '因為 NOR 的第二個輸入不重要', '因為 reset 會把它拉回來'],
      answer: 1,
      explanation: '兩個式子只在 q2 = 0、q1 = 1、q0 = 0（即 010）不同——而 010 是 unused state。所以主循環五個 state 的 d0 完全一樣，只有 010 的去向從 101 改成 100。',
    },
    {
      id: 'q8',
      type: 'multiple',
      prompt: '在「沒有外部 reset 可用」的情況下（例如 CML prescaler、或運作中被 SEU 打進 illegal state），哪些方案能讓 divider 自己回到主循環？',
      options: ['Self-recovering next-state logic', 'Illegal-state detector（watchdog）加內部 clear', '只靠上電時的一次 reset', '在 RTL 把 illegal state 標成 don\'t care'],
      answers: [0, 1],
      explanation: '前兩者在偵測到或算到 illegal state 時會自己把 state 送回主循環。上電 reset 只發生一次；把 illegal state 標成 don\'t care 正是製造 lock-up 的方法，不是解法。',
    },
  ],
  exercise: {
    title: '另一個會 lock-up 的 /3：改 equation 並驗證',
    prompt: (
      <>
        <p>
          下面是一個 Gray-code 的 /3：主循環 00 → 01 → 11 → 00（q1q0），輸出 q1。原始設計 d1 = q1 ⊕ q0、d0 = q̄1。<b>先不要動選單</b>，自己做：
        </p>
        <ol>
          <li>把 4 個 state 的 next-state 列出來。state 10 往哪裡走？</li>
          <li>畫 d1、d0 的 K-map，標出 10 那一格的 x。原始設計把兩個 x 各填成什麼？</li>
          <li>改其中一個（或兩個）equation，讓 10 在 1 個 edge 內回到主循環，同時 00 → 01 → 11 不變。至少找出兩種修法。</li>
          <li>比較兩種修法的 gate 數與最慢 gate 的 delay：哪一種比較便宜？哪一種比較快？</li>
        </ol>
        <p>然後用下面的設計台選 equation，看 state graph 與從 10 啟動的模擬有沒有印證你的推導。</p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: ['寫出原始設計 10 的 next state，並說明它為什麼是 lock-up', '至少兩組 equation 讓 10 在 1 個 edge 回到主循環且主循環不變', '每一組都用 state graph 確認 lock-up 為空', '比較 gate 數與 delay，選一組並說明理由'],
    answer: (
      <>
        <p>
          <b>原始設計</b>：10 → d1 = 1 ⊕ 0 = 1、d0 = q̄1 = 0 → 10。self-loop，lock-up；輸出 q1 固定為 1。K-map：d1 在 00、01、11、10 分別是 0、1、0、x；d0 是 1、1、0、x。原始設計把 d1 的 x 填成 1（得到 XOR）、d0 的 x 填成 0（得到 q̄1）——兩個「順便」湊出 10 → 10。
        </p>
        <p>
          <b>修法一</b>：把 d1 的 x 改填 0 → d1 = q0·q̄1（AND，用 FF1 的 Q̄）。10 → (0, 0) = 00，1 個 edge。主循環：00 → (0,1) = 01 → (1,1) = 11 → (0,0) = 00 ✓。代價：AND 14 ps（原本 XOR 12 ps），gate 數 1.5 → 1.5（AND 1 + INV 0.5），差不多但慢 2 ps。
        </p>
        <p>
          <b>修法二</b>：保留 d1 = q1 ⊕ q0，把 d0 的 x 改填 1 → d0 = NAND(q1, q0)（在合法 state 上 q̄1 與 NAND(q1,q0) 相同：00 → 1、01 → 1、11 → 0）。10 → (1, 1) = 11，1 個 edge。代價：gate 數 1.5 → 2（NAND 取代 INV），NAND 10 ps 比 INV 6 ps 慢，但整條路徑最慢仍是 XOR 12 ps，所以 critical path 不變——速度上這一組免費，面積上多半個 gate。
        </p>
        <p>
          設計台裡還有其他組合會「修好」但改變主循環（例如 d1 = q0 會讓循環變成 00 → 01 → 11 → 10 → 00 的 /4）：那不是修好，是換了一個 divider。self-recovery 的驗證永遠是兩件事一起看：<b>lock-up 為空</b>，而且<b>主循環一模一樣</b>。
        </p>
        <div className="two-col">
          <StateGraphTable netlist={grayDiv3Lockup} compact />
          <StateGraphTable netlist={grayDiv3Fixed} compact />
          <StateGraphTable netlist={grayDiv3FixedAlt} compact />
        </div>
      </>
    ),
  },
}
export default lesson
