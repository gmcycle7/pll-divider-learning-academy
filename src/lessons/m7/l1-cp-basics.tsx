import type { LessonDef } from '@/lessons/types'
import { Callout, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { TimingBudgetBar } from '@/components/timing/TimingBudgetBar'
import type { BudgetItem } from '@/models/timing/types'
import { basicsQuizHighlights, launchCaptureHighlight, launchCaptureSchematic } from './basics-schematics'
import { basicsExerciseTiming, basicsTiming } from './basics-timing'
import { HoldPathWaveform, SetupPathWaveform, SkewCompare, TimingCalculator } from './BasicsWidgets'

/** 課文範例的固定數字（與 sta.test.ts 一致） */
const EX = { period: 50, tcq: 8, logic: 25, tsetup: 7, uncertainty: 4, skew: 0 }
const EX_HOLD = { period: 50, tcqMin: 5, logicMin: 12, thold: 3, skew: 0 }
const EX_BUDGET: BudgetItem[] = [
  { key: 'tcq', label: 'tCQ', value: 8, kind: 'tcq' },
  { key: 'logic', label: 'logic', value: 25, kind: 'logic' },
  { key: 'setup', label: 'tsetup', value: 7, kind: 'setup' },
  { key: 'unc', label: 'uncertainty', value: 4, kind: 'jitter' },
  { key: 'slack', label: 'slack', value: 6, kind: 'slack' },
]

function Content() {
  return (
    <>
      <Section title="先用直覺想" en="Intuition">
        <p>
          想像一場接力賽。發令槍響（<b>launch edge</b>），第一棒選手聽到槍聲後要先反應一下才起跑（<b>tCQ</b>），然後跑完自己那段跑道（<b>combinational delay</b>），把棒子交給第二棒。規則是：第二棒在<b>下一次槍響</b>（<b>capture edge</b>）那一刻會把手裡有的東西「定格」；而且他需要在槍響前一小段時間就握穩棒子（<b>setup time</b>），不然會掉棒。
        </p>
        <p>
          如果第一棒提早到了，多出來的時間就是 <b>slack</b>；如果來不及，第二棒在槍響時握到的是「一半的棒子」——這就是 setup violation，在電路裡叫 metastability（Lesson 0-3）。
        </p>
        <Callout kind="idea">
          <Term zh="臨界路徑" en="critical path" /> 不是「最長的那條線」，而是<b>從一個 clock edge 出發、必須在另一個 clock edge 之前到達</b>的那條路徑中，剩餘時間（slack）最少的一條。所以分析永遠從兩個問題開始：<b>資料是在哪個 edge 送出的？又是在哪個 edge 被抓的？</b>
        </Callout>
      </Section>

      <Section title="最簡單的 synchronous path" en="The simplest synchronous path">
        <p>
          兩個 D flip-flop 中間夾一塊組合邏輯。左邊的 flop 在 clock edge 把新值送出，右邊的 flop 在下一個 clock edge 把結果抓進來：
        </p>
        <LogicDiagram schematic={launchCaptureSchematic} highlights={[launchCaptureHighlight]} showValues={false} />
        <p>先把三樣東西指出來：</p>
        <ul>
          <li>
            <Term zh="發射點" en="launch point" />：Launch FF。它的 clock pin 收到 rising edge 的那一刻叫 <Term zh="發射邊緣" en="launch edge" />，我們把它當作時間零點。
          </li>
          <li>
            <Term zh="擷取點" en="capture point" />：Capture FF。它的 D pin 會在 <Term zh="擷取邊緣" en="capture edge" /> 被抓走。注意：capture edge 是<b>下一個</b> rising edge（edge k+1），不是同一個。
          </li>
          <li>
            <b>中間的路徑</b>：Launch FF.Q → combinational logic → Capture FF.D。這就是一條 <Term zh="暫存器到暫存器路徑" en="register-to-register path" />。
          </li>
        </ul>
        <Callout kind="note" title="為什麼畫了兩條 clock tree？">
          真實晶片裡 clk 從 PLL 出來後要經過 buffer 才到每個 flop，兩個 flop 走的 buffer 鏈不一定一樣長。兩條 clock 到達時間的差就是 <Term zh="時脈偏移" en="clock skew" />，等一下會用波形解釋它的方向。
        </Callout>
      </Section>

      <Section title="每個名詞在波形上的位置" en="Each term on the waveform">
        <p>
          下面這張波形用課文範例的數字畫成：T<sub>clk</sub> = 50 ps、t<sub>CQ</sub> = 8、logic = 25、t<sub>setup</sub> = 7、uncertainty = 4、skew = 0。先不要算，只看<b>每個名詞對應到哪一段</b>。
        </p>
        <SetupPathWaveform params={EX} title="Launch edge 設為 0 ps" />
        <CompareTable
          head={['名詞', '英文', '在波形上是哪一段', '進到哪個式子']}
          rows={[
            ['發射邊緣', 'launch edge', 'launch clk 的 rising edge，t = 0', 'arrival 的起點'],
            ['時脈到輸出延遲', 'clock-to-Q delay, tCQ', 'launch edge 到 q 改變：0 → 8 ps', 'arrival（加）'],
            ['組合邏輯延遲', 'combinational delay, tlogic', 'q 改變到 d 改變：8 → 33 ps', 'arrival（加）'],
            ['到達時間', 'arrival time', 'd 穩定的時刻：33 ps', 'slack = required − arrival'],
            ['擷取邊緣', 'capture edge', 'capture clk 的下一個 rising edge：50 ps', 'required 的起點'],
            ['建立時間', 'setup time, tsetup', 'capture edge 之前 d 必須已穩定的區間：43 → 50 ps', 'required（減）'],
            ['時脈偏移', 'clock skew', 'capture edge − launch edge 的到達差；這裡 0', 'required（加）'],
            ['時脈抖動', 'clock jitter', 'capture edge 可能提早或延後的量', 'uncertainty 的一部分'],
            ['不確定量', 'uncertainty', 'jitter + 設計裕度 margin，一起從 capture edge 扣掉：39 → 43 ps', 'required（減）'],
            ['裕度', 'margin', '你自己多留的保險（PVT、老化、IR drop）', 'uncertainty 的一部分'],
            ['要求時間', 'required time', 'd 最晚必須穩定的時刻：39 ps', 'slack = required − arrival'],
            ['餘裕', 'slack', 'required − arrival = 6 ps（綠色）', '正 = 安全，負 = violation'],
          ]}
        />
      </Section>

      <Section title="用具體數字走一遍" en="Walk it through with numbers">
        <p>把 launch edge 當 t = 0。每一步都先問「這個事件什麼時候發生？」再寫數字：</p>
        <Steps
          items={[
            <>
              <b>Launch edge（t = 0）</b>：Launch FF 收到 rising edge。Q 什麼時候變？要等 t<sub>CQ</sub> = 8 ps → q 在 <b>8 ps</b> 穩定。
            </>,
            <>
              <b>經過 logic</b>：d 什麼時候變？q 穩定後再等 25 ps → d 在 8 + 25 = <b>33 ps</b> 穩定。這就是 <Term zh="到達時間" en="arrival time" />。
            </>,
            <>
              <b>Capture edge</b>：理想上在 T<sub>clk</sub> = 50 ps。但 Capture FF 要求 d 提前 t<sub>setup</sub> = 7 ps 就穩定 → 最晚 43 ps。
            </>,
            <>
              <b>Uncertainty</b>：capture edge 可能因 jitter 提早來（最壞情況）。把 4 ps 也扣掉 → d 最晚必須在 43 − 4 = <b>39 ps</b> 穩定。這就是 <Term zh="要求時間" en="required time" />。
            </>,
            <>
              <b>Slack</b> = required − arrival = 39 − 33 = <b>+6 ps</b>。正的，安全；這 6 ps 就是「第一棒提早到的時間」。
            </>,
          ]}
        />
        <TimingBudgetBar items={EX_BUDGET} total={50} title="一個 Tclk = 50 ps 如何被消耗：8 + 25 + 7 + 4 = 44，剩 6" />
        <Callout kind="formula" title="Setup check 的三條式子">
          <Math block>{'t_{arrival} = t_{launch} + t_{CQ,max} + t_{logic,max}'}</Math>
          <Math block>{'t_{required} = t_{capture} - t_{setup} - t_{unc},\\qquad t_{capture} = t_{launch} + T_{clk} + t_{skew}'}</Math>
          <Math block>{'\\text{slack}_{setup} = t_{required} - t_{arrival}'}</Math>
          <p className="small">
            變數：<Math>{'t_{launch}'}</Math> = launch clock 到達 launch FF 的時間（取 0）；<Math>{'t_{CQ,max}'}</Math> = launch FF 的最大 clock-to-Q；<Math>{'t_{logic,max}'}</Math> = 組合邏輯最大延遲（含走線）；<Math>{'T_{clk}'}</Math> = clock 週期；<Math>{'t_{skew}'}</Math> = capture clock 到達 − launch clock 到達；<Math>{'t_{setup}'}</Math> = capture FF 的 setup time；<Math>{'t_{unc}'}</Math> = jitter + margin。單位全部是 ps。
          </p>
        </Callout>
        <p>
          <b>再問一個問題：T<sub>clk</sub> 可以縮到多短？</b> 把上面代進去：slack = (T<sub>clk</sub> − 7 − 4) − 33 = T<sub>clk</sub> − 44。slack = 0 時 T<sub>clk</sub> = <b>44 ps</b>，這就是 <Term zh="最小時脈週期" en="Tclk,min" />；對應 F<sub>max</sub> = 1 / 44 ps ≈ 22.7 GHz。
        </p>
        <Math block>{'T_{clk,min} = t_{CQ,max} + t_{logic,max} + t_{setup} + t_{unc} - t_{skew} = 8 + 25 + 7 + 4 - 0 = 44\\ \\text{ps}'}</Math>
      </Section>

      <Section title="動手改 Tclk、skew、jitter" en="Try it: change Tclk, skew, jitter">
        <p>
          下面的 Critical Path Explorer 載入同一組數字。請依序做這三件事，每次改完先<b>自己預測</b> slack，再看面板：
        </p>
        <ol>
          <li>
            把 T<sub>clk</sub> 改成 44 → slack 應該剛好 0。改成 43 → −1（violation）。
          </li>
          <li>
            T<sub>clk</sub> 改回 50，把 jitter 改成 8 → required 少 4，slack 變 2。
          </li>
          <li>
            jitter 改回 4，把 skew 改成 +5 → setup slack 變 11；切到 Hold 分頁，hold slack 從 14 掉到 9。為什麼是反方向？下一節解釋。
          </li>
        </ol>
        <CriticalPathExplorer scenario={basicsTiming} guided />
      </Section>

      <Section title="Timing 計算機" en="Timing calculator">
        <p>換成你自己的數字。這個計算機用的公式與上面完全相同，波形上的每個 edge 都會跟著 T<sub>clk</sub> 與 skew 移動：</p>
        <TimingCalculator />
      </Section>

      <Section title="Skew 的方向：從兩個 edge 的相對位置看" en="Skew direction">
        <p>
          本站對 skew 的定義固定為：<b>t<sub>skew</sub> = capture clock 到達時間 − launch clock 到達時間</b>。正 skew = capture edge 比 launch edge 晚到。不要背「正 skew 對 setup 好」，而是每次都畫出兩個 edge，問：
        </p>
        <ul>
          <li>
            <b>Setup 看的是 edge k → edge k+1</b>：capture edge 晚到，第二棒的「下一次槍響」延後，第一棒有更多時間 → setup 變寬鬆。
          </li>
          <li>
            <b>Hold 看的是同一個 edge k</b>：capture edge 晚到，表示 Capture FF 還在等這一次的槍響時，Launch FF 已經開始送出新資料——新資料如果到得太快，會在 capture edge 之前就把上一筆蓋掉 → hold 變嚴格。
          </li>
        </ul>
        <p>同一組數字（T<sub>clk</sub> = 50、t<sub>CQ</sub> = 8 / 5、logic = 25 / 12、t<sub>setup</sub> = 7、t<sub>hold</sub> = 3、uncertainty = 4），只改 skew：</p>
        <SkewCompare />
        <Callout kind="warning" title="看到了嗎：負 skew 把一條原本安全的 path 變成 violation">
          skew = −8 時 capture edge 提早到，required 從 39 變成 31，比 arrival 33 還早，slack = −2。反過來，正 skew 讓 setup 多了 8 ps，但 hold slack 從 14 掉到 6——如果 skew 再大一點（&gt; 14），hold 就會壞掉。<b>skew 只是把時間從 setup 搬到 hold，或從 hold 搬到 setup，不會憑空製造餘裕。</b>
        </Callout>
      </Section>

      <Section title="Hold check：同一個 edge，資料不能太快變" en="Hold check">
        <p>
          Setup 問「來不來得及」，hold 問「會不會太早」。Launch FF 在 edge k 送出新資料後，最快在 t<sub>CQ,min</sub> + t<sub>logic,min</sub> 就會讓 d 改變；而 Capture FF 在<b>同一個 edge k</b>（到達時間 = skew）抓的是上一筆資料，它要求 d 在 edge 之後 t<sub>hold</sub> 內不能變：
        </p>
        <Callout kind="formula" title="Hold check">
          <Math block>{'t_{arrival,min} = t_{CQ,min} + t_{logic,min}'}</Math>
          <Math block>{'t_{required,hold} = t_{skew} + t_{hold}'}</Math>
          <Math block>{'\\text{slack}_{hold} = t_{arrival,min} - t_{required,hold}'}</Math>
          <p className="small">
            <Math>{'t_{CQ,min}'}</Math>、<Math>{'t_{logic,min}'}</Math> 是<b>最小</b>延遲（fast corner）；<Math>{'t_{hold}'}</Math> 是 capture FF 的 hold time。注意式子裡<b>沒有 T<sub>clk</sub></b>：hold violation 不能靠降頻解決。
          </p>
        </Callout>
        <p>用課文數字：arrival<sub>min</sub> = 5 + 12 = 17 ps；required = 0 + 3 = 3 ps；hold slack = 14 ps。</p>
        <HoldPathWaveform params={EX_HOLD} title="Hold path：d 最早在 17 ps 才變，離 hold window 的邊界 3 ps 還有 14 ps" />
        <Callout kind="warning" title="三種 violation 不要混在一起">
          <ul style={{ margin: 0 }}>
            <li>
              <b>Setup violation</b>：資料<b>來不及</b>在 capture edge 前穩定。看 max delay，與 T<sub>clk</sub> 有關，降頻可救。
            </li>
            <li>
              <b>Hold violation</b>：資料在 capture edge 後<b>太快</b>改變。看 min delay，與 T<sub>clk</sub> 無關，降頻救不了，只能加 delay 或修 skew。
            </li>
            <li>
              <b>Pulse-width violation</b>：clock 本身的 high 或 low 太窄，flop 內部 latch 來不及動作。這與 data path 無關，是 clock 波形的問題（Lesson 7-4）。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="STA 工具怎麼報這條 path">
          <p>
            工具的 timing report 就是把上面三條式子排成表：先列 launch clock 的到達（clock network delay）、tCQ、每個 cell 的 delay，加總成 <b>data arrival time</b>；再列 capture clock 的到達、加一個 period、減 uncertainty、減 setup，得到 <b>data required time</b>；最後一行 slack (MET / VIOLATED)。讀 report 的順序也應該是這樣：先找 launch/capture 是誰、用哪個 edge，再看數字。
          </p>
          <p>本課的 path 是最單純的 single-cycle path。之後會遇到三種變形：</p>
          <ul>
            <li>
              <b>Half-cycle path</b>：launch 用 rising、capture 用 falling（或反過來），可用時間 = T<sub>clk</sub> / 2（<Math>{'\\text{periodFraction} = 0.5'}</Math>）。
            </li>
            <li>
              <b>Multicycle path</b>：設計上保證資料每 N 個 cycle 才用一次，可用時間 = N·T<sub>clk</sub>；但 hold 通常仍要按單 cycle 檢查。
            </li>
            <li>
              <b>Interface path</b>：launch 或 capture 在別的 block，用 input / output delay 代替看不見的那一半。
            </li>
          </ul>
          <Math block>{'\\text{slack}_{setup} = \\big(t_{skew} + N \\cdot T_{clk} \\cdot f - t_{setup} - t_{jitter} - t_{margin}\\big) - \\big(t_{CQ,max} + \\textstyle\\sum t_{cell,max}\\big)'}</Math>
          <p className="small">
            <Math>{'N'}</Math> = multicycle 倍數（預設 1）；<Math>{'f'}</Math> = period fraction（rising → rising 為 1，rising → falling 為 0.5）；<Math>{'\\sum t_{cell,max}'}</Math> = 路徑上每個 gate 與 wire 的最大延遲總和。
          </p>
        </ModeContent>
        <ModeContent level="deep" title="uncertainty 裡面到底裝了什麼">
          <ul>
            <li>
              <b>Jitter</b>：對 divider 而言重要的是 <b>cycle-to-cycle jitter</b>——相鄰兩個 edge 的間隔比 T<sub>clk</sub> 短了多少。launch edge 與 capture edge 是相鄰的兩個 edge，所以 setup 只需要扣一次 cycle-to-cycle jitter，不是扣 period jitter 的兩倍。VCO 直接驅動的 prescaler 看到的是 VCO 的原始 jitter；經過 PLL loop 濾波後的 clock 則是 long-term jitter 小、cycle-to-cycle jitter 由 VCO 相位雜訊的高頻部分決定。
            </li>
            <li>
              <b>Margin</b>：留給模型不準的部分——OCV（同一顆晶片上不同位置的 PVT 差異）、電源 IR drop 讓 tCQ 變慢、老化（NBTI / HCI）、以及 flop 特性化時 slew 與量測條件跟實際不同。高速 CML divider 的 tCQ 對供電特別敏感，margin 常常比 jitter 還大。
            </li>
            <li>
              <b>Skew 不是 uncertainty</b>：skew 是確定的（可以量、可以設計），所以它有正負號；uncertainty 是不確定的，所以永遠往壞的方向扣。工具裡 <code>set_clock_uncertainty</code> 就是這裡的 t<sub>unc</sub>，而 skew 來自 clock tree 的實際延遲差。
            </li>
            <li>
              <b>為什麼高速 divider 的 budget 常被 tCQ 吃掉</b>：在 20 GHz（T<sub>clk</sub> = 50 ps）的 prescaler，一個 CML flop 的 tCQ 就要 10–15 ps，setup 再 5–8 ps；剩給 logic 的只有 20 多 ps，也就是一兩級 gate。這就是為什麼 /2 /3 cell 的 next-state logic 要盡可能合併到 flop 裡（Lesson 7-5）。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>把 setup 加到 arrival 那一邊</b>：setup 是 capture FF 的要求，從 required 減；加到 arrival 雖然 slack 數字一樣，但 T<sub>clk,min</sub> 的推導會在 skew 的符號上出錯。固定一個寫法：arrival 只加 launch 側的東西，required 只處理 capture 側的東西。
            </li>
            <li>
              <b>把 skew 當成 uncertainty</b>：skew 是有號數，正 skew 讓 setup 變鬆；uncertainty 永遠讓 setup 變緊。兩者不能互相抵消。
            </li>
            <li>
              <b>hold 也去看 T<sub>clk</sub></b>：hold 是同一個 edge 的事，把頻率降到 1 MHz hold violation 還是在。
            </li>
            <li>
              <b>slack 為負就去砍 logic</b>：先看 breakdown。如果 tCQ + setup 已經占掉 70%，砍 logic 幫助有限，該換更快的 flop 或改架構。
            </li>
            <li>
              <b>把 output path 當 setup path</b>：Capture FF.Q → q_out 沒有 capture flop，不能算 slack；它只是 latency。要等知道下一級是誰、用什麼 clock，才能變成 interface path。
            </li>
          </ul>
        </Callout>
      </Section>
    </>
  )
}

function ExerciseComponent() {
  return <CriticalPathExplorer scenario={basicsExerciseTiming} showEnvControls={false} />
}

const lesson: LessonDef = {
  id: 'm7-l1-cp-basics',
  module: 7,
  order: 1,
  title: '什麼是 Critical Path',
  titleEn: 'What a critical path is',
  summary: '從 launch FF → logic → capture FF 這條最簡單的路徑出發，用波形定義 launch edge、tCQ、setup、capture edge、skew、jitter、uncertainty、margin、slack，並用 50 ps 的具體數字算出 arrival / required / slack 與 Tclk,min。',
  goals: [
    '指出一條 register-to-register path 的 launch point、launch edge、capture point、capture edge。',
    '在波形上標出 tCQ、combinational delay、setup、uncertainty 各占哪一段，並算出 arrival、required、slack。',
    '從 slack = 0 推出 Tclk,min 與 Fmax。',
    '用 launch edge 與 capture edge 的相對位置解釋 skew 的正負對 setup 與 hold 的相反影響。',
    '做 hold check，並說出它為什麼與 clock period 無關。',
  ],
  readingMinutes: 35,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'numeric',
      prompt: 'Tclk = 40 ps、tCQ,max = 6 ps、tlogic,max = 20 ps、tsetup = 5 ps、uncertainty = 3 ps、skew = 0。setup slack 是多少 ps？',
      answer: 6,
      unit: 'ps',
      explanation: 'arrival = 6 + 20 = 26；required = 0 + 40 − 5 − 3 = 32；slack = 32 − 26 = 6 ps。',
    },
    {
      id: 'q2',
      type: 'numeric',
      prompt: 'tCQ,max = 10 ps、tlogic,max = 30 ps、tsetup = 6 ps、jitter = 3 ps、margin = 1 ps、skew = +2 ps。Tclk,min 是多少 ps？',
      answer: 48,
      unit: 'ps',
      explanation: 'Tclk,min = tCQ + tlogic + tsetup + jitter + margin − skew = 10 + 30 + 6 + 3 + 1 − 2 = 48 ps。正 skew 讓 setup 多 2 ps 可用時間，所以是減。',
    },
    {
      id: 'q3',
      type: 'single',
      prompt: 'capture clock 比 launch clock 晚到 6 ps（skew = +6）。這對 hold check 的影響是？',
      options: ['hold slack 增加 6 ps', 'hold slack 減少 6 ps', 'hold 不受 skew 影響，只有 setup 受影響', '取決於 Tclk'],
      answer: 1,
      explanation: 'hold required = skew + thold。capture edge 晚到 6 ps，表示 Launch FF 送出的新資料必須多撐 6 ps 才能讓 Capture FF 先抓到舊資料，所以 hold slack 少 6 ps。setup 則多 6 ps。',
    },
    {
      id: 'q4',
      type: 'multiple',
      prompt: '下列哪些敘述正確？',
      options: ['arrival time 從 launch clock 到達 launch FF 的那一刻開始累加', 'hold check 的結果與 Tclk 無關', 'uncertainty 是從 required time 扣掉的', 'slack 為負表示還有裕度', 'skew 為正時 setup 會變嚴格'],
      answers: [0, 1, 2],
      explanation: 'arrival = launch 到達 + tCQ + logic；hold 只看同一個 edge；uncertainty 讓 capture edge 「可能提早」所以從 required 減。slack 負 = violation；正 skew 讓 capture edge 晚到，setup 變寬鬆。',
    },
    {
      id: 'q5',
      type: 'critical-path',
      prompt: '在這個電路裡，哪一條才是 setup（max-delay）check 的路徑？點選後圖上會高亮。',
      schematic: launchCaptureSchematic,
      options: [
        { label: 'clk → clock tree (launch) → Launch FF.clk', highlight: basicsQuizHighlights.clockLaunch, description: 'clock path' },
        { label: 'Launch FF.Q → combinational logic → Capture FF.D', highlight: basicsQuizHighlights.setupPath, description: 'register-to-register' },
        { label: 'Capture FF.Q → q_out', highlight: basicsQuizHighlights.outputPath, description: 'output' },
        { label: 'clk → clock tree (capture) → Capture FF.clk', highlight: basicsQuizHighlights.clockCapture, description: 'clock path' },
      ],
      answer: 1,
      explanation: '只有 Launch FF.Q → logic → Capture FF.D 有 launch point（edge k）與 capture point（edge k+1）。兩條 clock path 決定 skew，本身不是 data path；q_out 沒有 capture flop，只是 latency。',
    },
    {
      id: 'q6',
      type: 'numeric',
      prompt: 'tCQ,min = 4 ps、tlogic,min = 6 ps、thold = 5 ps、skew = +3 ps。hold slack 是多少 ps？',
      answer: 2,
      unit: 'ps',
      explanation: 'arrival,min = 4 + 6 = 10；required = skew + thold = 3 + 5 = 8；hold slack = 10 − 8 = 2 ps。',
    },
    {
      id: 'q7',
      type: 'single',
      prompt: '下列哪一個改變「不會」影響 setup slack？',
      options: ['把 Tclk 拉長', '把 skew 從 0 改成 +3', '把 jitter 從 2 改成 5', '把 thold 從 3 改成 6'],
      answer: 3,
      explanation: 'thold 只出現在 hold check 的式子裡。Tclk、skew、jitter 都在 required time 裡。',
    },
    {
      id: 'q8',
      type: 'single',
      prompt: 'STA report 顯示某條 path 的 setup slack = −3 ps。以下哪個說法正確？',
      options: ['資料比 required time 晚了 3 ps；把 Tclk 至少拉長 3 ps 可以救', '資料比 required time 早了 3 ps；沒有問題', 'clock pulse 太窄了 3 ps', '這是 hold violation，加 3 ps 的 delay buffer 可以救'],
      answer: 0,
      explanation: 'slack = required − arrival = −3 表示 arrival 晚 3 ps。setup 與 Tclk 有關，拉長 Tclk 3 ps（或砍掉 3 ps 的 delay）即可；加 delay 只會更糟。',
    },
  ],
  exercise: {
    title: '負 skew 的 path：手算 setup 與 hold',
    prompt: (
      <p>
        同一個電路換一組數字：T<sub>clk</sub> = 60 ps、t<sub>CQ</sub> = 6（min）/ 10（max）ps、t<sub>logic</sub> = 15（min）/ 30（max）ps、t<sub>setup</sub> = 8 ps、t<sub>hold</sub> = 4 ps、jitter = 3 ps、margin = 2 ps、<b>skew = −5 ps</b>（capture clock 比 launch clock 早到）。先在紙上把 arrival、required、setup slack、T<sub>clk,min</sub>、hold arrival、hold required、hold slack 全部算出來，再用下面的面板核對。
      </p>
    ),
    Component: ExerciseComponent,
    checklist: [
      '先畫 launch edge（0）與 capture edge（60 − 5 = 55）的相對位置',
      'setup：arrival = ？required = ？slack = ？',
      'Tclk,min = ？（提示：負 skew 是「減負數」）',
      'hold：arrival,min = ？required = ？slack = ？',
      '如果 skew 改成 +5，setup 與 hold 各變多少？',
    ],
    answer: (
      <>
        <p>
          <b>Setup</b>：arrival = 10 + 30 = 40 ps。capture edge 在 60 + (−5) = 55 ps，required = 55 − 8 − 3 − 2 = 42 ps。slack = 42 − 40 = <b>+2 ps</b>，勉強過。T<sub>clk,min</sub> = 10 + 30 + 8 + 3 + 2 − (−5) = <b>58 ps</b>：負 skew 把需要的週期拉長了 5 ps。
        </p>
        <p>
          <b>Hold</b>：arrival<sub>min</sub> = 6 + 15 = 21 ps。required = skew + t<sub>hold</sub> = −5 + 4 = −1 ps（capture edge 提早到，hold window 在 launch edge 之前就結束了）。slack = 21 − (−1) = <b>22 ps</b>，非常安全。
        </p>
        <p>
          <b>skew 改成 +5</b>：setup required 變 65 − 13 = 52，slack = 12；hold required = 5 + 4 = 9，slack = 12。同樣 10 ps 的 skew 變化，setup 多 10、hold 少 10——時間只是被搬動，不會憑空多出來。
        </p>
      </>
    ),
  },
}
export default lesson
