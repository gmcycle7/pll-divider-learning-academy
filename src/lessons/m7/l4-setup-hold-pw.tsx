import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { PulseWidthDemo } from '@/components/timing/SetupHoldDemo'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { clockGateLatch } from './cases-models'
import { cgEnPathHighlight, cgGclkHighlight, cgStatePathHighlight, clockGateLatchSchematic } from './cases-schematics'
import { clockGateTiming } from './cases-timing'
import { ClockGatingExercise, HoldViolationDemo, RecoveryRemovalDemo, RuntPulseTable, SetupViolationDemo, pmuxRuntTraces, violationTraces } from './CaseWidgets'

function Content() {
  const pmuxTraces = pmuxRuntTraces()
  return (
    <>
      <Section title="先用直覺想" en="Intuition">
        <p>
          一個 flop 在 clock edge 抓資料，可以出錯的方式只有三種。想像你在關門：
        </p>
        <ul>
          <li>
            <b>來不及</b>：東西還沒送到，門已經關了。這是 <Term zh="建立時間" en="setup" /> 問題——資料太<b>慢</b>。
          </li>
          <li>
            <b>太早改變</b>：東西送到了、門也關了，但門還沒完全關緊，東西就被換掉。這是 <Term zh="保持時間" en="hold" /> 問題——資料太<b>快</b>。
          </li>
          <li>
            <b>門本身有問題</b>：門開了一下就關，開的時間短到東西根本進不來。這是 <Term zh="脈波寬度" en="pulse width" /> 問題——clock 太<b>窄</b>。
          </li>
        </ul>
        <Callout kind="idea" title="三個問題，三個不同的主角">
          setup 與 hold 都在講「資料相對 clock edge 的時間」，但一個看 edge <b>之前</b>、一個看 edge <b>之後</b>。pulse width 完全不看資料，它只看 <b>clock 自己</b>的形狀。分不清這三件事，就會用錯修法——拉長 period 對 hold 沒用，改 D 路徑對 pulse width 沒用。
        </Callout>
      </Section>

      <Section title="最簡單的電路：一個 clock gating cell 加 /2" en="The circuit: a clock gating cell and a /2">
        <p>
          這一課用一個 <Term zh="時脈閘控" en="clock gating" /> cell 當主角，因為三種 check 都在這一張圖上：en → latch 是 setup / hold；q0 → INV → d0 也是 setup / hold；gclk 的 high 寬度是 pulse width。
        </p>
        <LogicDiagram schematic={clockGateLatchSchematic} showValues={false} highlights={[cgEnPathHighlight, cgStatePathHighlight, cgGclkHighlight]} />
        <ul>
          <li>
            <b>EN latch</b>：clk = 0 時 transparent（en_l 跟著 en），clk = 1 時保持。所以 en_l 只會在 clk 為 low 的期間改變。
          </li>
          <li>
            <b>AND</b>：gclk = clk AND en_l。因為 en_l 在 clk = 1 時不動，gclk 的每個 high pulse 要嘛完整出現、要嘛完全不出現——不會被切成半截。
          </li>
          <li>
            <b>FF0</b>：用 gclk 當 clock 的 /2。
          </li>
        </ul>
      </Section>

      <Section title="逐一個 clock edge 操作" en="Edge by edge">
        <p>
          模擬器預設 real delay，而且 input 在「前一個 cycle 的 clk = 1 期間」生效（inputLead = 0.75）——刻意讓 en 在最糟的時間改變。先讓 en = 1 走幾個 edge，再把 en 改成 0：
        </p>
        <DividerSimPanel netlist={clockGateLatch} schematic={clockGateLatchSchematic} title="Latch-based clock gating + /2（real delay）" options={{ delayMode: 'real', inputLead: 0.75 }} showDelayMode showInputs showPulseWidths signals={['clk', 'en', 'en_l', 'gclk', 'q0']} />
        <Steps
          items={[
            <>
              <b>en = 1</b>：en_l = 1，gclk 跟著 clk（AND delay 6 ps）。FF0 每個 gclk rising 後 8 ps toggle：q0 = 1, 0, 1, 0 …，/2。
            </>,
            <>
              <b>把 en 改成 0</b>：en 在 clk = 1 期間（t = kT + 25）落下。看 en_l——它<b>沒有</b>跟著動，因為 latch 正在保持。gclk 的這個 high pulse 完整走完（50 ps）。
            </>,
            <>
              <b>clk 落下（kT + 50）</b>：latch 變 transparent，en_l 在 6 ps 後落下（kT + 56）。下一個 clk rising 時 en_l = 0，gclk 沒有 pulse，FF0 不動。
            </>,
            <>
              <b>把 en 改回 1</b>：同樣要等 clk 落下，en_l 才升起；下一個 clk rising 的 pulse 完整放行。gclk 的每個 pulse 都是 50 ps——沒有 runt。
            </>,
          ]}
        />
      </Section>

      <Section title="Demo 1：Setup violation——資料來不及" en="Demo 1: setup violation">
        <p>
          滑桿預設就放在 violation 區。D 的到達時間 t<sub>D</sub> 就是 arrival time，edge − t<sub>setup</sub> 是 required time；slack = required − arrival。把滑桿往左拉，看 slack 何時變正：
        </p>
        <SetupViolationDemo />
        <p>
          setup 的本質：flop 內部的 master latch 需要一段時間把 D 推到穩定點；D 在 edge 前 tsetup 內才變，master 被關上時還沒推到底，slave 拿到的是一個半途的值——可能對、可能錯、可能 metastable。
        </p>
        <Math block>{'t_{launch} + t_{CQ,max} + t_{logic,max} \\le t_{capture} - t_{setup} - t_{jitter} - t_{margin}'}</Math>
        <p className="small muted">
          <Math>{'t_{launch}, t_{capture}'}</Math> = launch / capture edge 的到達時間（ps）；<Math>{'t_{capture} - t_{launch} = T_{clk} + t_{skew}'}</Math>。setup 的修法一定落在這條式子的某一項：資料早一點到（減 tCQ、logic），或 capture edge 晚一點來（加 T<sub>clk</sub>、正 skew）。
        </p>
      </Section>

      <Section title="Demo 2：Hold violation——資料太早改變" en="Demo 2: hold violation">
        <p>
          這裡的情境不同：D 在 edge 之前已經是 1（前一級在更早的 edge 送出），edge 之後太快又變回 0。滑桿預設也在 violation 區。試著把 T<sub>clk</sub> 拉長——你會發現<b>沒有任何一個滑桿代表 T<sub>clk</sub></b>，因為 hold 跟 period 無關：
        </p>
        <HoldViolationDemo />
        <Math block>{'t_{launch} + t_{CQ,min} + t_{logic,min} \\ge t_{capture} + t_{hold}\\quad\\Longleftrightarrow\\quad t_{CQ,min} + t_{logic,min} \\ge t_{hold} + t_{skew}'}</Math>
        <p className="small muted">
          hold 檢查的 launch edge 與 capture edge 是<b>同一個</b> edge（<Math>{'t_{capture} - t_{launch} = t_{skew}'}</Math>）。T<sub>clk</sub> 不在式子裡。修法只有：讓資料晚一點改變（加 buffer、選 tCQ,min 大的 flop），或讓 capture clock 早一點（負 skew）。
        </p>
        <Callout kind="warning" title="hold 比 setup 可怕的地方">
          setup violation 可以靠降頻救回來（測試時把 clock 放慢就能跑）；hold violation 在任何頻率都存在，晶片回來就是壞的。divider 裡 Q̄ 直接接 D 的 /2、兩個 flop 之間沒有 gate 的 shift register，都是 hold 的高風險區——min delay 只剩 tCQ,min。
        </Callout>
      </Section>

      <Section title="Demo 3：Pulse width——clock 本身太窄" en="Demo 3: pulse width">
        <p>
          第三個 demo 完全不動 D。把 clock 的 high pulse 拉窄到比 flop 的最小 pulse width 還小：
        </p>
        <PulseWidthDemo minPulse={25} />
        <Math block>{'t_{high} \\ge t_{pw,min,high},\\qquad t_{low} \\ge t_{pw,min,low}'}</Math>
        <p className="small muted">
          <Math>{'t_{high}, t_{low}'}</Math> = clock high / low 的寬度（ps）；<Math>{'t_{pw,min}'}</Math> = flop 的最小 pulse width（library 給，通常 20–40% 的 FO4 × 幾個）。它與 D 無關、與 period 只有間接關係（period 大但 duty 極端一樣會 fail）。
        </p>
        <p>
          在 divider 裡 pulse width 問題有三個常見來源：<b>clock gating</b>（enable 在 clk = 1 期間改變）、<b>clock MUX</b>（phase MUX 切換時舊新相位交接）、<b>ripple 中間節點</b>（decode 出來的 clock 有 glitch）。下面用 engine 的 real-delay 波形加 detectRuntPulses，把 clock gating 的三種做法比一比：
        </p>
        <RuntPulseTable minWidth={30} />
        <Steps
          items={[
            <>
              <b>combinational gating（錯）</b>：en = q0 直接 AND clk。q0 在 rising edge 後 tCQ 8 ps 改變，en 再經 OR 10 ps ⇒ en 在 edge 後 18 ps 才落下；AND 又 6 ps ⇒ div_out 在 edge 後 6 ps 升起、24 ps 落下。這就是表裡每一個 <b>18 ps</b> 的 runt。把最小 pulse width 拉到 35 ps，還會抓到另一種：en 升起那次 div_out 在 24 ps 才開始、56 ps 隨 clk 落下，被截成 32 ps。
            </>,
            <>
              <b>falling-edge 重同步</b>：en 只在 clk 落下時更新，所以 AND 的兩個輸入不會同時在 clk = 1 期間改變。表格空的。
            </>,
            <>
              <b>latch-based ICG</b>：en 在任何時間改變都行，latch 把它擋到 clk = 0 才放出來。表格也是空的。這是 standard cell library 裡 ICG cell 的做法。
            </>,
          ]}
        />
      </Section>

      <Section title="PMUX 常常是 pulse width，不只是 setup" en="PMUX: usually a pulse-width problem">
        <p>
          phase-MUX divider 的 select 切錯時間，輸出不是「抓到錯的值」，而是「clock 被切短」。下面 Tvco = 80 ps、ph1 落後 ph0 一個相位 Δ = 10 ps，sel 在 t = 215 從 ph1 切回 ph0——這是往後跳（換到較早的相位），此刻兩個 phase 都還是 high（不會多生 edge），但輸出這個 pulse 的結尾改由較早落下的 ph0 決定：
        </p>
        <ClockWaveform signals={pmuxTraces} tEnd={330} unit=" ps" pxPerPeriod={2} showPulseWidths={['pmux_out']} highlight={['pmux_out']} markers={[{ t: 215, label: 'sel 切換', kind: 'input', signal: 'sel' }]} shades={[{ t0: 190, t1: 220, kind: 'danger', label: '30 ps（正常 40）', signal: 'pmux_out' }]} zoomable={false} />
        <Callout kind="pitfall" title="為什麼不能把它當成 data setup 問題">
          setup 問題的修法是「讓資料早點到、或 edge 晚點來」——但這裡 counter 的 D 完全沒有問題，你把 counter 做得再快，這個 30 ps 的 pulse 還是會出現。它要用 pulse-width 的方法檢查（min pulse width check 或 runt 偵測）、用 clock-path 的方法修（select 對齊 safe window、glitch-free MUX、或乾脆只允許往前跳）。Lesson 7-3 案例 E 算過那個 window：跳一個 phase 時是 Tvco/2 − Δ = 3/8 Tvco，往前往後一樣寬；差別在往後跳會把輸出的半週期縮短 Δ（這裡 40 → 30 ps），往前跳則是拉長 Δ。
        </Callout>
      </Section>

      <Section title="對照表" en="Side-by-side">
        <CompareTable
          head={['', '症狀', '原因', '與 period 的關係', '看哪兩個 edge', '修法']}
          rows={[
            ['Setup', 'edge 抓到舊值 / metastable；降頻後消失', '資料到得太慢：tCQ + logic 太長，或 capture edge 太早', '直接相關：T 越長越寬鬆 ⇒ 決定 Fmax', 'launch edge k → capture edge k+1', '縮短 tCQ / logic、拉長 T、正 skew、pipeline'],
            ['Hold', 'edge 抓到「下一個」值；任何頻率都壞', '資料改得太快：tCQ,min + logic,min 太短，或 capture edge 太晚（正 skew）', '無關：T 不在式子裡', '同一個 edge（launch k = capture k）', '加 delay buffer、選 tCQ,min 大的 flop、負 skew；不能靠降頻'],
            ['Pulse width', 'flop 不觸發 / 部分觸發 / metastable；D 完全正確', 'clock pulse 比 flop 能反應的最小寬度窄：gating、clock MUX、decode glitch', '間接：period 短會壓縮 pulse；duty 極端時 period 再長也 fail', '同一個 clock 的 rising → falling（或反之）', '修 clock path：ICG、glitch-free MUX、輸出從 flop Q 直接出；不是修 D'],
            ['Recovery', 'reset 放開後第一個 edge 抓到不確定值', 'reset 釋放太靠近 edge 之前', '無關（一次性事件）', 'reset 釋放 → 下一個 clock edge', '同步 reset 釋放（reset synchronizer）'],
            ['Removal', 'edge 「一半被 reset、一半 capture」', 'reset 釋放太靠近 edge 之後', '無關', 'clock edge → reset 釋放', '同上'],
          ]}
        />
      </Section>

      <Section title="Recovery / removal：reset 的 setup 與 hold" en="Recovery and removal">
        <p>
          非同步 reset 在<b>拉下去</b>的時候不需要對 clock（它本來就是 async）；但在<b>放開</b>的時候，flop 要從「被 reset 壓住」切換到「聽 clock」——這個切換相對 clock edge 也有一個 window。放開得太靠近 edge 之前叫 recovery violation（像 setup），太靠近 edge 之後叫 removal violation（像 hold）：
        </p>
        <RecoveryRemovalDemo />
        <CompareTable
          head={['', '類比', '相同的地方', '不同的地方']}
          rows={[
            ['Recovery', 'setup', '都要求「訊號在 edge 前 t 就穩定」；violation 都會 metastable', '主角是 reset 不是 data；違反後壞掉的不是這個 cycle 的值，而是 divider 的<b>起始相位</b>（早一個 cycle 或晚一個 cycle）'],
            ['Removal', 'hold', '都要求「訊號在 edge 後 t 內不能變」', '同上；而且 reset 通常是多個 flop 共用——每個 flop 各自決定要不要吃這個 edge，可能進入 illegal state（Lesson 8）'],
          ]}
        />
        <p className="small muted">
          對 divider 來說 recovery / removal 不影響 Fmax，影響的是「reset 放開後輸出相位是否確定」。多個 divider 要對齊相位（例如 I/Q 兩路 /2）時，reset 釋放必須同步到 clock，而且要對每一個 flop 都滿足 recovery / removal。
        </p>
      </Section>

      <Section title="這個電路的 timing path" en="Timing paths in the clock gating cell">
        <p>
          回到一開始的 clock gating cell。用 explorer 切換 Setup / Hold 兩個 tab，三條 path 各自在問什麼：
        </p>
        <CriticalPathExplorer scenario={clockGateTiming} guided />
        <Steps
          items={[
            <>
              <b>en → EN latch</b>：上游 flop 在 clk edge k 送出 en（tCQ 8 + wire 4 = 12 ps）；latch 在 clk edge k+1 關閉，所以 en 要在那之前 tsetup 穩定。setup slack 77，hold slack 3（tCQ,min 5 + wire,min 2 = 7 ≥ thold 4）。這是普通的 setup / hold path——即使 en 在 clk = 1 期間改變也沒事。
            </>,
            <>
              <b>q0 → INV → d0</b>：/2 自己的 state path，clock 是 gclk。被 gate 掉的 cycle 沒有 edge，setup 只看相鄰兩個真正出現的 edge，所以 gating 反而讓它更寬鬆。Tclk,min = 26 ps。
            </>,
            <>
              <b>clk → AND → gclk</b>：clock path，AND 的 4–6 ps 是 gclk 相對 clk 的 insertion delay。它不是 setup path，但它決定兩件事：FF0 相對 clk domain 其他 flop 的 skew，以及 gclk 的 pulse width（= clk 的 pulse width，因為 en_l 不會在 clk = 1 時動）。
            </>,
          ]}
        />
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>用降頻去修 hold</b>：hold 與 period 無關。降頻之後 hold violation 一個都不會少。
            </li>
            <li>
              <b>把 runt 當 setup</b>：看到 flop 抓錯值就去查 D 的 arrival——先看 clock 的波形有沒有比 pulse width 窄的 pulse（clock gating、clock MUX、decode 出來的 clock 都要查）。
            </li>
            <li>
              <b>用 AND 直接 gate clock</b>：enable 由 comb logic 或同 edge 的 flop 送出，一定會在 clk = 1 期間改變，產生 runt。要用 latch-based ICG 或 falling-edge 重同步。
            </li>
            <li>
              <b>忘記 reset 也有 window</b>：reset 放開的時間隨便選，divider 的起始相位就隨便變；多個 flop 共用 reset 時甚至進入 illegal state。
            </li>
            <li>
              <b>把 setup 與 hold 用同一組 delay 算</b>：setup 用 max delay、hold 用 min delay；同一條 path 在 fast corner 可能 hold fail、slow corner 可能 setup fail。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="STA 報告裡怎麼認出這三種 check">
          <CodeBlock
            lang="text"
            title="report_timing 節錄（示意）"
            code={`
Path Type: max            <- setup（max delay）：required = capture edge − tsetup − uncertainty
Path Type: min            <- hold（min delay）：required = capture edge + thold
Check: min_pulse_width    <- pulse width：只列 clock pin，沒有 startpoint/endpoint
Check: recovery / removal <- reset 釋放相對 clock edge
`}
            note="pulse-width 與 recovery/removal 的報告沒有 data path，只有 clock pin 與 reset pin——看到 startpoint 是 reset 或 clock 本身，就知道不是 setup/hold。"
          />
          <CodeBlock
            lang="tcl"
            title="SDC：與 clock gating 有關的 constraint"
            code={`
# flop 與 ICG 的最小 pulse width（通常 library 已有，這裡是額外加嚴）
set_min_pulse_width -high 0.030 [get_clocks gclk]
set_min_pulse_width -low  0.030 [get_clocks gclk]

# 對「用 AND/OR 直接 gate clock」的 cell 做 clock gating check：enable 必須在 clk 的 inactive 期間穩定
set_clock_gating_check -setup 0.005 -hold 0.002 [get_pins AND_gate/B]
`}
          />
        </ModeContent>
        <ModeContent level="deep" title="高速實作會遇到的事">
          <ul>
            <li>
              <b>Metastability 不是 0 / 1 的問題</b>：落在 setup / hold window 內時，輸出 resolve 的時間服從指數分佈，<Math>{'\\text{MTBF} = e^{t_r/\\tau} / (T_0 f_{clk} f_{data})'}</Math>，<Math>{'\\tau'}</Math> 是 flop 內部 latch 的 regeneration time constant（Lesson 7-5）。divider 的 mod / sel 從非同步來源進來時，synchronizer 的級數就是由這個算的。
            </li>
            <li>
              <b>ICG 也有自己的 timing</b>：enable → latch 的 setup 在 clk rising；若上游 flop 在 clk 的 falling edge 送出 enable，可用時間只有半個 period。而且 latch 的 transparent 期間 = clk low 的寬度，clk duty 偏離 50% 時，ICG 的 enable 路徑比 flop 的 setup 更先撞到。
            </li>
            <li>
              <b>glitch-free clock MUX</b>：切換 select 時先把舊 clock 的 gate 在它的 low 期間關掉，再在新 clock 的 low 期間把新的打開——本質上是兩個 ICG 串成 handshake。代價是切換 latency 幾個 cycle。
            </li>
            <li>
              <b>ripple divider 的中間節點</b>：q0 → q1 → q2 每一級都是 clock。任何一級的輸出若由 decode 產生（例如 q1 AND q0 當下一級 clock），decode 的 glitch 就是 clock glitch。Lesson 2 講過：輸出當 clock 用，一定直接取 flop Q。
            </li>
            <li>
              <b>PVT 下三種 check 的走向</b>：slow corner setup 差、fast corner hold 差；pulse width 在 slow corner 差（flop 反應慢、需要更寬的 pulse），同時 clock buffer 的 duty distortion 也在 slow corner 最大。
            </li>
          </ul>
        </ModeContent>
      </Section>
    </>
  )
}

/** 練習：判斷 clock gating cell 的 violation 類型 */
function ExerciseComponent() {
  return (
    <>
      <ClockGatingExercise />
      <DividerSimPanel netlist={clockGateLatch} schematic={clockGateLatchSchematic} title="對照：latch-based ICG（real delay，en 在 clk = 1 期間改變）" options={{ delayMode: 'real', inputLead: 0.75 }} showInputs showPulseWidths showEquations={false} signals={['clk', 'en', 'en_l', 'gclk', 'q0']} compact />
    </>
  )
}

const lesson: LessonDef = {
  id: 'm7-l4-setup-hold-pw',
  module: 7,
  order: 4,
  title: 'Setup、Hold 與 Pulse Width',
  titleEn: 'Setup, hold and pulse width',
  summary: '三個獨立的互動 demo：setup 是資料來不及、hold 是資料太早改變、pulse width 是 clock 本身太窄。PMUX 與 clock gating 要查 runt；recovery / removal 是 reset 的 setup / hold。',
  goals: [
    '看到一張出錯的波形，能說出它是 setup、hold 還是 pulse-width violation，以及為什麼。',
    '知道 hold 與 period 無關、降頻救不了；知道 pulse width 與 D 無關、修 D 路徑救不了。',
    '用 engine 的 real-delay 波形與 detectRuntPulses 找出 clock gating / clock MUX 的 runt，並算出它的寬度從哪來。',
    '把 recovery / removal 對應到 setup / hold，並說出差別（主角是 reset、壞掉的是起始相位）。',
  ],
  readingMinutes: 35,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'waveform',
      prompt: '下面四組波形（clk / d / q，capture edge 在 100 ps，tsetup = 15、thold = 10、tCQ = 12），哪一組是 hold violation？',
      options: [
        { label: 'A', traces: violationTraces('setup') },
        { label: 'B', traces: violationTraces('ok') },
        { label: 'C', traces: violationTraces('hold') },
        { label: 'D', traces: violationTraces('pw') },
      ],
      answer: 2,
      tEnd: 300,
      explanation: 'C 的 d 在 edge 之前已經是 1，edge 後 3 ps 就變 0——在 hold window 內改變，q 變成不確定。A 是 d 在 edge 前 6 ps 才變（setup）；B 正常；D 的 clock pulse 只有 8 ps（pulse width）。',
    },
    {
      id: 'q2',
      type: 'waveform',
      prompt: '同樣四組波形，哪一組是 pulse-width violation？',
      options: [
        { label: 'A', traces: violationTraces('hold') },
        { label: 'B', traces: violationTraces('pw') },
        { label: 'C', traces: violationTraces('setup') },
        { label: 'D', traces: violationTraces('ok') },
      ],
      answer: 1,
      tEnd: 300,
      explanation: 'B 的 d 在 edge 前 60 ps 就穩定，setup / hold 都沒問題，但 clock 的 high pulse 只有 8 ps——flop 部分觸發後彈回。看 clock 的形狀，不是看 d。',
    },
    {
      id: 'q3',
      type: 'single',
      prompt: '一顆晶片在 2 GHz 時 divider 的除數偶爾錯、降到 1 GHz 就正常。最可能是哪一種 violation？',
      options: ['hold violation', 'setup violation', 'pulse-width violation（clock gating runt）', 'removal violation'],
      answer: 1,
      explanation: '降頻後消失是 setup 的特徵：period 變長，資料就來得及。hold 與 period 無關，任何頻率都會壞；clock gating 的 runt 寬度由 gate delay 決定，與 period 也無關；removal 是 reset 釋放的一次性事件。',
    },
    {
      id: 'q4',
      type: 'multiple',
      prompt: '下列哪些敘述正確？',
      options: ['hold check 的 launch edge 與 capture edge 是同一個 edge', '拉長 clock period 可以修 hold violation', 'pulse-width check 不看 D 的時間，只看 clock 本身', 'latch-based ICG 的 enable 可以在 clk = 1 期間改變而不產生 runt', 'setup 用 max delay 算，hold 用 min delay 算'],
      answers: [0, 2, 3, 4],
      explanation: 'hold 看的是同一個 edge 之後資料是否太快改變，period 不在式子裡，所以拉長 period 沒用。pulse width 只看 clock。latch-based ICG 的 latch 在 clk = 1 時保持，enable 的改變被擋到 clk = 0 才放出來。setup 與 hold 分別用 max / min delay。',
    },
    {
      id: 'q5',
      type: 'numeric',
      prompt: 'Tclk = 100 ps、tCQ,max = 8、logic,max = 60、tsetup = 15、jitter = 5、margin = 2、skew = 0。setup slack 是多少 ps？',
      answer: 10,
      unit: 'ps',
      explanation: 'arrival = 8 + 60 = 68；required = 100 − 15 − 5 − 2 = 78；slack = 78 − 68 = 10 ps。',
    },
    {
      id: 'q6',
      type: 'numeric',
      prompt: 'combinational clock gating：gclk = clk AND en，en 由 q0 經一個 OR gate 產生。q0 在 clk rising 後 tCQ = 8 ps 改變，OR = 10 ps，AND = 6 ps。en 從 1 變 0 那個 cycle，gclk 的 runt pulse 寬度是多少 ps？',
      answer: 18,
      unit: 'ps',
      explanation: 'gclk 在 rising 後 6 ps（AND）升起；en 在 8 + 10 = 18 ps 落下，gclk 再經 AND 6 ps 在 24 ps 落下。寬度 = 24 − 6 = 18 ps。這就是 RuntPulseTable 裡每一個 18 ps 的 runt。',
    },
    {
      id: 'q7',
      type: 'single',
      prompt: 'phase-MUX divider 的 select 在 safe window 外切換，counter 的 clock 出現一個被截短的 pulse。要用哪一種方法檢查、哪一種方法修？',
      options: ['setup check；把 counter 的 next-state logic 做快', 'hold check；在 select 路徑加 delay', 'pulse-width（runt）check；把 select 對齊 window 或用 glitch-free MUX', 'recovery check；把 reset 釋放時間往後移'],
      answer: 2,
      explanation: 'counter 的 D 沒有問題，是 clock 被切短。修 counter 沒用；要修 clock path：select 對齊 safe window、或 glitch-free MUX。',
    },
    {
      id: 'q8',
      type: 'single',
      prompt: 'recovery violation 與 setup violation 最主要的差別是什麼？',
      options: ['recovery 與 period 有關，setup 無關', 'recovery 的主角是 reset 的釋放，壞掉的是 divider 的起始相位，而不是某個 cycle 的資料值', 'recovery 只發生在 falling-edge flop', 'recovery 可以靠降頻修好，setup 不行'],
      answer: 1,
      explanation: '兩者都要求訊號在 edge 前一段時間穩定，但 recovery 的主角是 reset；違反後 flop 可能早一個或晚一個 cycle 開始，多個 flop 共用 reset 時甚至各自決定，進入 illegal state。',
    },
  ],
  exercise: {
    title: '這個 clock gating cell 的波形出了什麼問題？',
    prompt: (
      <>
        <p>
          上面是一個 clock gating cell 的 real-delay 波形：gclk（叫 div_out）= clk AND en，en 由 q0 經 OR gate 產生，q0 在 clk rising 後 8 ps 改變。先不要看答案：
        </p>
        <p>
          gclk 有幾種寬度的 pulse？最窄的是幾 ps、怎麼算出來的？它是 setup、hold 還是 pulse-width violation？為什麼降頻救不了？下面的對照電路（latch-based ICG）做了什麼改變，讓同樣的 en 改變不會產生 runt？
        </p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: ['用量測工具量出 gclk 每種 pulse 的寬度', '把最窄那個 pulse 的寬度用 tCQ、OR、AND 的 delay 算出來', '指出 violation 類型並說明為什麼不是 setup / hold', '說明 latch-based ICG 的 en_l 為什麼只在 clk = 0 時改變', '寫出 gclk 的 pulse width 與哪一個 clock 的 pulse width 相同'],
    answer: (
      <>
        <p>
          gclk 有三種寬度：正常的 50 ps（en 整個 cycle 都是 1）、<b>18 ps 的 runt</b>（en 在 cycle 中途落下：gclk 在 +6 升起、en 在 +8 + 10 = 18 落下、gclk 在 +24 落下）、以及被截短的 32 ps（en 在 cycle 中途升起：gclk 在 +24 才開始、+56 隨 clk 落下）。
        </p>
        <p>
          這是 <b>pulse-width violation</b>。FF0 的 D 是 NOT q0，到達時間完全沒問題——壞的是 clock 本身。降頻沒有用：runt 的寬度 = (tCQ + tOR + tAND) − tAND = tCQ + tOR = 18 ps，只由 gate delay 決定，與 period 無關——period 再長 runt 還是 18 ps。
        </p>
        <p>
          latch-based ICG 把 en 先送進一個 clk = 0 時 transparent 的 latch：en 在 clk = 1 期間改變時，latch 正在保持，en_l 不動；要等 clk 落下（+50）、latch 打開（+56）en_l 才跟上。於是 AND 的兩個輸入永遠不會在 clk = 1 期間同時改變，gclk 的每個 pulse 要嘛完整的 50 ps（= clk 的 high 寬度）、要嘛不出現。en → latch 本身變成一條普通的 setup / hold path（相對 latch 關閉的 clk rising edge），用一般方法檢查即可。
        </p>
      </>
    ),
  },
}
export default lesson
