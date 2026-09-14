import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { StateDiagram, graphToDiagram } from '@/components/circuit/StateDiagram'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { div3, div3Duty50 } from '@/models/divider/examples'
import { simulate } from '@/models/divider/engine'
import { buildStateGraph } from '@/models/divider/analysis'
import type { Netlist, SignalTrace } from '@/models/divider/types'
import { div3And, div3Duty50In40, div5DecodeGlitch, div5Duty50 } from './models'
import { div3AndSchematic, div3Duty50Schematic, div5Duty50Schematic } from './schematics'
import { div3Duty50Timing } from './timing'

// ---------------------------------------------------------------- 由 engine 產生的靜態波形（課文用）
const T = 100
const duty50Run = simulate(div3Duty50, 8, { period: T })
const duty50Traces = duty50Run.traces.filter((t) => ['clk', 'q1', 'q1_f', 'div_out'].includes(t.name))
const div5Graph = buildStateGraph(div5Duty50, {})

/** quiz 用波形：clk + 指定訊號（改名為 div_out） */
function wave(nl: Netlist, sig: string, edges: number): SignalTrace[] {
  const { traces } = simulate(nl, edges, { period: T })
  const clk = traces.find((t) => t.name === 'clk')!
  const s = traces.find((t) => t.name === sig)!
  return [clk, { ...s, name: 'div_out', kind: 'output' }]
}

function Content() {
  return (
    <>
      <Section title="先用直覺想" en="Intuition">
        <p>
          上一課的 /3 輸出 high 1T、low 2T。要 50% duty，high 必須是 1.5T。可是 state 只在 rising edge 換，輸出也只在 rising edge 翻，翻轉的時間點只能是 1T、2T、3T……<b>1.5T 這個時間點根本不存在</b>。
        </p>
        <p>
          想像走一段 3 階的樓梯，想在「正中間」停下來——正中間是 1.5 階，沒有這一階。除非樓梯有「半階」可以踩。在 divider 裡，這個半階就是輸入 clock 的 <Term zh="下降緣" en="falling edge" />：輸入 duty 50% 時，它剛好落在兩個 rising edge 的正中間。
        </p>
        <Callout kind="idea">
          偶數除頻（/2、/4、/6）天生可以 50%，因為 N/2 是整數，high N/2 個 T 就好。奇數除頻要 50%，一定要借用 falling edge 來做出「半個 T」的時間點。
        </Callout>
      </Section>

      <Section title="為什麼只用 rising edge 做不到" en="Why rising edges alone cannot do it">
        <p>
          設輸出在每圈 N 個 state 裡有 k 個 state 為 1，每個 state 停留 <Math>{'T_{in}'}</Math>：
        </p>
        <Math block>{'D = \\frac{t_{high}}{T_{out}} = \\frac{k\\,T_{in}}{N\\,T_{in}} = \\frac{k}{N}'}</Math>
        <p>
          要 <Math>{'D = 1/2'}</Math> 就要 <Math>{'2k = N'}</Math>。N 是奇數時沒有整數 k 滿足它。這不是 logic 設計得不夠好，是<b>edge 的時間點不夠用</b>：只用 rising edge，輸出所有 edge 都對齊 <Math>{'m \\cdot T_{in}'}</Math>（m 為整數），high 時間必然是整數個 <Math>{'T_{in}'}</Math>。
        </p>
        <p>
          用 falling edge 之後，多了一組時間點 <Math>{'(m + \\tfrac{1}{2})\\,T_{in}'}</Math>。讓輸出在 rising edge 上升、在 falling edge 下降，high 時間就可以是 <Math>{'(m + \\tfrac{1}{2})\\,T_{in}'}</Math>。N = 3 時取 1.5T，N = 5 時取 2.5T。
        </p>
      </Section>

      <Section title="方法：原訊號 OR 延遲半個 cycle 的複本" en="The rising + falling method">
        <p>
          從 /3 的 q1 出發（high 1T，從 edge k 到 edge k+1）。加一個 <b>falling-edge</b> DFF（FF2），D 接 q1、clock 接同一條 clk：它在每個 clk↓ 抓 q1，輸出 q1_f 就是 q1 <b>延遲 T/2 的複本</b>（high 從 k+0.5 到 k+1.5）。最後 <span className="mono">div_out = q1 OR q1_f</span>：
        </p>
        <LogicDiagram schematic={div3Duty50Schematic} showValues={false} />
        <ul>
          <li>
            <b>q1</b>：k → k+1 為 high（rising-edge 定義的 1T）。
          </li>
          <li>
            <b>q1_f</b>：k+0.5 → k+1.5 為 high（同一個 pulse，晚半個 cycle）。
          </li>
          <li>
            <b>OR</b>：只要其中一個是 1 就是 1 ⇒ k → k+1.5，<b>1.5T</b>。
          </li>
        </ul>
        <Callout kind="note" title="FF2 的 clock 是同一條 clk，只是用另一個 edge">
          電路圖上 FF2 的 clk pin 有一個小圓圈（bubble），表示 negative-edge triggered。實作上常用 clock 反相（inverter）再接一般 DFF，或在 CML 裡直接接 differential clock 的另一相。兩者的 timing 意涵不同——下面 critical path 會談。
        </Callout>
      </Section>

      <Section title="逐一個 clock edge 操作" en="Edge by edge">
        <p>
          模擬器每按一次推進一個 <b>rising</b> edge；夾在中間的 falling edge（k+0.5）發生的事會出現在同一步的事件裡（看 q1_f 那一列）。從 reset 開始，每一步先自己回答：q1 是什麼？下一個 clk↓ 時 FF2 會抓到什麼？div_out 現在是 1 還是 0？
        </p>
        <DividerSimPanel netlist={div3Duty50} schematic={div3Duty50Schematic} title="Divide-by-3 with 50% duty" signals={['clk', 'rst_n', 'q0', 'q1', 'q1_f', 'div_out']} showDelayMode showPulseWidths />
        <Steps
          items={[
            <>
              <b>Edge 1（t = 1T）</b>：state 00 → 01。q1 = 0，div_out = 0。clk↓ 在 1.5T：FF2 抓到 q1 = 0，q1_f 維持 0。
            </>,
            <>
              <b>Edge 2（t = 2T）</b>：state 01 → 10，<b>q1 = 1</b> ⇒ OR 立刻變 1，<b>div_out 的 high 從 2T 開始</b>。clk↓ 在 2.5T：FF2 抓到 q1 = 1 ⇒ <b>q1_f = 1</b>（從 2.5T 起）。
            </>,
            <>
              <b>Edge 3（t = 3T）</b>：state 10 → 00，q1 回到 0。但 q1_f 還是 1，所以 OR 仍是 1，<b>div_out 沒有掉下來</b>。clk↓ 在 3.5T：FF2 抓到 q1 = 0 ⇒ q1_f = 0 ⇒ OR 變 0，<b>high 在 3.5T 結束</b>。
            </>,
            <>
              <b>Edge 4（t = 4T）</b>：state 00 → 01，一切為 0。下一個 rising edge（5T）q1 又會變 1，開始下一個 pulse。
            </>,
            <>
              <b>結論</b>：div_out high 從 2T 到 3.5T = <b>1.5T</b>；rising edge 在 2T、5T、8T，週期 <b>3T</b>；duty = 1.5 / 3 = <b>50%</b>。模擬器下方的量測列會顯示同樣的數字。
            </>,
          ]}
        />
      </Section>

      <Section title="把波形攤開看" en="Reading the waveform">
        <p>
          下面是 engine 跑 8 個 edge 的波形，把「high 何時開始、何時結束」標出來。注意 div_out 的 rising edge 跟著 q1（rising edge 定義），falling edge 跟著 q1_f（falling edge 定義）：
        </p>
        <ClockWaveform
          signals={duty50Traces}
          tEnd={7 * T}
          period={T}
          showPulseWidths={['q1', 'q1_f', 'div_out']}
          highlight={['div_out']}
          zoomable={false}
          shades={[{ t0: 2 * T, t1: 3.5 * T, kind: 'info', label: 'high 1.5T', signal: 'div_out' }, { t0: 5 * T, t1: 6.5 * T, kind: 'info', label: 'high 1.5T', signal: 'div_out' }]}
          annotations={[
            { t: 2 * T, signal: 'q1', text: 'clk↑：q1 變 1 → high 開始' },
            { t: 2.5 * T, signal: 'q1_f', text: 'clk↓：FF2 抓到 1' },
            { t: 3 * T, signal: 'q1', text: 'clk↑：q1 變 0，但 q1_f 撐著' },
            { t: 3.5 * T, signal: 'q1_f', text: 'clk↓：q1_f 變 0 → high 結束' },
          ]}
          title="div3Duty50：q1、q1_f 與 OR 的結果"
        />
        <p className="small muted">把游標移到波形上可以讀每個時間點的值；點兩下可量 Δt。</p>
      </Section>

      <Section title="Divide ratio 與 duty 的數學推導" en="Deriving ratio and duty">
        <Math block>{'t_{high} = T_{in} + \\tfrac{1}{2}T_{in} = 1.5\\,T_{in},\\qquad T_{out} = 3\\,T_{in},\\qquad D = \\frac{1.5\\,T_{in}}{3\\,T_{in}} = 50\\%'}</Math>
        <p>
          <Math>{'t_{high}'}</Math>：輸出 high 時間（ps）；<Math>{'T_{in}'}</Math>：輸入週期（ps）；<Math>{'T_{out}'}</Math>：輸出週期（ps）。除頻比沒有變（rising edge 仍然每 3T 一次），只有 falling edge 被往後推了半個 cycle。
        </p>
        <p>
          一般奇數 N：先用 rising-edge state machine 做一個 high <Math>{'\\tfrac{N-1}{2}'}</Math> 個 cycle 的訊號，再 OR 上它延遲 T/2 的複本：
        </p>
        <Math block>{'t_{high} = \\left(\\frac{N-1}{2} + \\frac{1}{2}\\right) T_{in} = \\frac{N}{2}\\,T_{in} \\quad\\Rightarrow\\quad D = \\frac{N/2}{N} = 50\\%'}</Math>
        <CompareTable
          head={['N', '原訊號 high（rising edge 定義）', '延遲 T/2 後 OR 的 high', 'duty']}
          rows={[
            ['3', '1T', '1.5T', '50%'],
            ['5', '2T', '2.5T', '50%'],
            ['7', '3T', '3.5T', '50%'],
          ]}
        />
      </Section>

      <Section title="輸入 duty 不是 50% 會怎樣" en="When the input duty is not 50%">
        <p>
          「半個 cycle」是借 falling edge 來的。若輸入 clock 的 duty 是 d（high 佔 d·T），falling edge 在 k + d 而不是 k + 0.5，q1_f 的 high 就變成 k+d → k+1+d，OR 之後：
        </p>
        <Math block>{'t_{high} = (1 + d)\\,T_{in},\\qquad D_{out} = \\frac{1 + d}{3}'}</Math>
        <p>
          d = 0.5 時 50%；d = 0.4 時 1.4 / 3 ≈ 46.7%。輸入 duty 的誤差會<b>直接</b>變成輸出 duty 的誤差（除以 N 之後縮小了，但不會消失）。下面是同一個電路、輸入 duty 改成 40% 的模擬：
        </p>
        <DividerSimPanel netlist={div3Duty50In40} title="輸入 duty 40%：q1_f 提早 0.1T，high 變成 1.4T" signals={['clk', 'q1', 'q1_f', 'div_out']} showPulseWidths showEquations={false} showTable={false} compact options={{ prerun: 4 }} />
        <p>
          一般式：<Math>{'D_{out} = \\dfrac{(N-1)/2 + d}{N}'}</Math>。這和 Lesson 1-1 的 /2 形成對比：/2 只用 rising edge，輸出 duty 與輸入 duty 無關。
        </p>
        <Callout kind="note" title="如果後面還可以再 /2">
          很多 PLL 的 feedback divider 是「奇數 /N 再 /2」，或輸出 buffer 前有一級 /2。只要後面有 /2，就不必在奇數級做 50%——/2 會把任何 duty 整形成 50%。做 50% 奇數除頻是為了<b>直接用</b>那個輸出（例如 I/Q 產生、或需要兩個 edge 都準的 clock）。
        </Callout>
      </Section>

      <Section title="Timing：多了半週期路徑" en="Timing: the half-cycle paths">
        <p>
          加一個 falling-edge FF 之後，電路裡出現了 launch 與 capture 在<b>不同 edge</b> 的路徑。逐條列出：
        </p>
        <ol>
          <li>
            <span className="mono">FF0/FF1.Q → NOR → FF0.D</span>：clk↑ launch、下一個 clk↑ capture。可用時間 T（full cycle）。這是 /3 core 原本的路徑，沒有變。
          </li>
          <li>
            <span className="mono">FF1.Q → FF2.D</span>：clk↑ launch（q1 在 tCQ 之後才穩定）、<b>同一個 cycle 的 clk↓</b> capture。這叫 <Term zh="半週期路徑" en="half-cycle path" />：可用時間只有 <b>T/2</b>（輸入 duty 50% 時）；輸入 duty 偏小時更少。沒有任何 gate，卻可能是最緊的 setup path。
          </li>
          <li>
            <span className="mono">FF1.Q → OR → div_out</span> 與 <span className="mono">FF2.Q → OR → div_out</span>：output latency。div_out 的 rising edge 由 FF1 + OR 決定，falling edge 由 FF2 + OR 決定。這不是 setup path——<b>除非</b> div_out 後面接了 register。
          </li>
          <li>
            <span className="mono">FF2.Q → OR → 下一級 FF.D</span>：一旦 div_out 被 rising-edge register 抓，這條 clk↓ launch、clk↑ capture 的路徑就成了 interface setup path，可用時間也只有 T/2，而且 delay 最多（tCQ + OR + wire）。
          </li>
        </ol>
        <p>用下面的 explorer 逐步走一次，然後切換「輸入 duty」mode，看第 2 條與第 4 條的 slack 往哪個方向變：</p>
        <CriticalPathExplorer scenario={div3Duty50Timing} guided />
        <Callout kind="method" title="讀 explorer 的結果（T = 60 ps）">
          <ul style={{ margin: 0 }}>
            <li>
              <b>NOR 回授</b>：arrival 20 ps，可用 60 ps，slack 29 ps。T<sub>clk,min</sub> = 31 ps。
            </li>
            <li>
              <b>q1 → FF2.D（半週期）</b>：arrival 只有 10 ps，可用時間卻只有 30 ps，slack 9 ps。T<sub>clk,min</sub> = (8 + 2 + 7 + 2 + 2) / 0.5 = <b>42 ps</b>——比 NOR 回授的 31 ps 更早撞到極限。加了 50% duty 電路，Fmax 從 32 GHz 掉到 24 GHz。
            </li>
            <li>
              <b>輸入 duty 40%</b>：同一條路徑可用時間變 24 ps，slack 剩 3 ps；T<sub>clk,min</sub> = 21 / 0.4 = 52.5 ps。
            </li>
            <li>
              <b>FF2 → OR → 下一級 FF</b>：duty 50% 時 slack 只有 1 ps，是整個電路最緊的 setup path；duty 40% 時這段（clk↓ → clk↑）反而變長為 0.6T，slack 變 7 ps。兩種半週期路徑對 duty 的敏感方向相反。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="半週期路徑的 timing equation">
          <p>launch 在 clk↑（t = 0）、capture 在 clk↓（t = d·T，d 為輸入 duty）：</p>
          <Math block>{'d \\cdot T_{clk} \\ge t_{CQ,max} + t_{wire,max} + t_{setup} - t_{skew} + t_{jitter} + t_{margin}'}</Math>
          <Math block>{'T_{clk,min} = \\frac{t_{CQ,max} + t_{wire,max} + t_{setup} - t_{skew} + t_{jitter} + t_{margin}}{d_{min}} = \\frac{8 + 2 + 7 + 2 + 2}{0.5} = 42\\ \\text{ps}'}</Math>
          <p>
            <Math>{'d_{min}'}</Math> 是輸入 duty 的最小值（無單位）；其餘變數與 Lesson 2-1 相同，單位 ps。分母 d 是重點：同樣的 delay，對 T<sub>clk</sub> 的要求變成 1/d 倍。反過來，clk↓ launch、clk↑ capture 的路徑分母是 <Math>{'1 - d_{max}'}</Math>。
          </p>
          <p>
            這裡的 <Math>{'t_{skew}'}</Math> 要特別小心：如果 FF2 的「falling edge」是用 inverter 反相 clock 做出來的，inverter 的 delay 就是 capture clock 晚到的 skew（正值，對 setup 有利、對 hold 不利）；而且它同時把 q1_f 的所有 edge 往後推，直接變成輸出 duty 的誤差。
          </p>
          <p>
            <b>hold</b>：半週期路徑的 hold capture edge 是 launch 之前 T/2 的那個 clk↓，資料在 launch 之後才變，離那個 edge 已經隔了半個 cycle，所以 hold 幾乎不可能違反。Explorer 的 hold 數字是保守的「同一時刻」檢查。
          </p>
          <p>STA 工具會自動把 posedge → negedge 的路徑當作 half-cycle path；但 clock 的 duty 假設要自己給對（constraint 的 waveform 定義），否則工具算的是 0.5T 而不是 d<sub>min</sub>·T。</p>
        </ModeContent>
        <ModeContent level="deep" title="高速實作會遇到的事">
          <ul>
            <li>
              <b>用哪個 clock 做 falling edge</b>：CML / differential 設計直接用 clk̄ 接 FF2，skew 幾乎為 0；單端 CMOS 用 inverter 反相，inverter delay（幾 ps 到十幾 ps）會同時出現在 q1 → FF2 的 setup 計算與輸出 duty 上。
            </li>
            <li>
              <b>T/2 與 tCQ + tsetup 的比較</b>：當 T/2 逼近 tCQ + tsetup（例如 20 GHz 時 T/2 = 25 ps），這個結構就到極限了。更高速的做法是<b>避開 falling-edge FF</b>，有三條路：(a) 讓 divider 吃<b>兩倍頻</b>的輸入再做 /6——偶數除頻只用 rising edge 就天生 50%，而且 /6 對 2f<sub>in</sub> 正好等於 /3 對 f<sub>in</sub>；(b) 在奇數級<b>後面</b>再串一級 /2 由它整形（輸出頻率再減半，變成 f<sub>in</sub>/6，用途是後級整形而不是取代 /3）；(c) 改用 latch-based 的 half-cycle 結構（master / slave latch 本來就一個看 clk = 1、一個看 clk = 0）。<b>注意 (a) 與 (b) 不一樣</b>：直接把 /3 換成 /6 而輸入頻率不變，輸出就變成 f<sub>in</sub>/6，除頻比錯了。
            </li>
            <li>
              <b>duty distortion 的來源</b>：clock 分佈網路本身的 rise/fall 不對稱、PVT 下 PMOS/NMOS 強度變化，都會讓 d 偏離 0.5。高精度應用會在輸入端加 duty-cycle corrector，或在輸出端量測後回授。
            </li>
            <li>
              <b>Jitter</b>：div_out 的 rising edge 帶 FF1 + OR 的雜訊，falling edge 帶 FF2 + OR 的雜訊；兩個 edge 的 jitter 不相關，對 I/Q 或 DDR 應用是兩個獨立的誤差源。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="Glitch 風險：哪裡會、哪裡不會" en="Glitch risks">
        <p>
          「用 OR 把兩個在不同 edge 改變的訊號合起來」聽起來就會有 glitch。先精確地看這個 OR 的兩個輸入什麼時候切換：q1↑ 在 k、q1_f↑ 在 k+0.5、q1↓ 在 k+1、q1_f↓ 在 k+1.5。關鍵是<b>這四個切換點彼此相隔 T/2，從來不會同時發生</b>——<Term zh="靜態突波" en="static hazard" /> 要的是「兩個輸入幾乎同時往相反方向動」，這裡根本湊不出來。把四個切換點分成兩類看（模擬值 T = 100 ps：q1 high 在 200–300、q1_f high 在 250–350、div_out high 在 200–350）：
        </p>
        <ul>
          <li>
            <b>k（q1↑）與 k+1.5（q1_f↓）</b>：此時另一個輸入是 0，OR 的輸出<b>本來就該跟著動</b>——這兩個切換點就是 div_out 的 rising edge（200）與 falling edge（350）本身，不是 glitch。
          </li>
          <li>
            <b>k+0.5（q1_f↑）與 k+1（q1↓）</b>：此時另一個輸入是 1（q1_f↑ 時 q1 = 1、q1↓ 時 q1_f = 1），把 OR 撐住，輸出不動。這兩個切換點被「遮」起來，正是 1T 的 high 被延長成 1.5T 的機制。
          </li>
        </ul>
        <p>
          所以這個 OR 沒有 static hazard——但這個結論有一個前提：<b>FF1 與 FF2 的 tCQ 差距遠小於 T/2</b>。一旦 k+1 附近 q1↓ 比 q1_f↑ 早太多（或 q1_f 整個晚一個 cycle，見下面第 1 種情況），遮擋就失效，輸出會斷成兩段。
        </p>
        <p>真正會出問題的是下面三種情況：</p>
        <h3>1. 半週期路徑 setup 違反：輸出多出一個 pulse</h3>
        <p>
          如果 q1 在 clk↓ 之前來不及穩定（tCQ + wire + tsetup &gt; T/2），FF2 在 k+0.5 抓到的是<b>舊的</b> q1 = 0，要等到 k+1.5 才抓到 1。q1_f 整整晚了一個 cycle，OR 的兩段 high 不再相連。下面用模擬示範：把 tCQ 拉大到 60 ps（T = 100 ps，T/2 = 50 ps）：
        </p>
        <DividerSimPanel
          netlist={div3Duty50}
          title="tCQ = 60 ps > T/2：q1_f 晚一個 cycle，輸出斷成兩段"
          signals={['clk', 'q1', 'q1_f', 'div_out']}
          options={{ delayMode: 'real', tcqOverride: 60, prerun: 6 }}
          showPulseWidths
          showEquations={false}
          showTable={false}
          compact
        />
        <p>
          看量測列：output rising edge 間隔變成 1.5T、1.5T、…，「平均 divide ratio」變成 <b>1.5</b>——每 3T 出現兩個 pulse。這不是小 glitch，是整個輸出波形錯掉；在 PLL 裡 PFD 會看到兩倍的 feedback edge，loop 直接鎖錯。
        </p>
        <h3>2. 輸入 duty 偏移：輸出 duty 跟著偏</h3>
        <p>前一節已經算過：<Math>{'D_{out} = ((N-1)/2 + d)/N'}</Math>。這不是 glitch，但同樣是「借 falling edge」付出的代價。</p>
        <ModeContent level="deep" title="3. 用 decode 訊號當 OR 的輸入：多 bit 同時翻轉的 hazard">
          <p>
            這一課的例子都直接用單一 state bit（q1）當「原訊號」，所以每個 edge 只有這個 bit 翻轉，沒有 hazard。如果原訊號是多個 state bit decode 出來的（例如 /5 時用 <span className="mono">p = (q1 AND q0) OR q2</span> 來標記 state 011 與 100），只要兩個 bit 在同一個 edge 翻轉而 tCQ 不一致，decode 就可能閃一下。
          </p>
          <p>
            下面的 /5 電路把 FF0 的 tCQ 設成 14 ps、FF1 設成 6 ps。在 001 → 010 這個 edge，q1 先變 1（6 ps）、q0 才變 0（14 ps），中間 8 ps 兩個都是 1，<span className="mono">q1 AND q0</span> 短暫輸出 1 ⇒ p 出現 8 ps 的 runt ⇒ div_out 跟著 runt（此時 p_f = 0，遮不住）。切到理想模式就完全看不到。
          </p>
          <DividerSimPanel
            netlist={div5DecodeGlitch}
            title="decode 版 /5：real delay 模式下 div_out 有 runt pulse"
            signals={['clk', 'q2', 'q1', 'q0', 'p', 'p_f', 'div_out']}
            options={{ delayMode: 'real', prerun: 2 }}
            showDelayMode
            showEquations={false}
            showTable={false}
            windowCycles={8}
            compact
          />
          <p>
            解法：(a) 選一個編碼讓「原訊號」就是單一 state bit（div5Duty50 用 q1）；(b) 把 decode 先過一級 register 再用；(c) 挑一個 state 序列，讓那幾次「多個 bit 同時翻」的 edge <b>不落在 decode 會變化的地方</b>。注意 (c) 不可能做到「每個 edge 只翻一個 bit」：奇數長度的循環一定至少有一次多 bit 同時翻（parity 論證見 Lesson 2-1），Gray code 只存在於偶數長度的循環。<b>不要</b>用「加一個小 RC 濾掉」這種方法——高速 divider 沒有這種餘裕。
          </p>
        </ModeContent>
      </Section>

      <Section title="/5 的 50% duty" en="Divide-by-5 with 50% duty">
        <p>
          同樣的方法推廣到 /5：需要一個 high <b>2T</b> 的 rising-edge 訊號，延遲 T/2 之後 OR，得到 2.5T。用 3 個 bit 做 mod-5 counter：000 → 001 → 010 → 011 → 100 → 000。看 q1 那個 bit：它在 010 與 011 連續兩個 state 為 1，剛好是 2T。
        </p>
        <div className="two-col">
          <StateDiagram {...graphToDiagram(div5Graph, 'clk↑')} width={360} height={300} title="mod-5 counter：8 個 state，3 個 unused，都在 1 個 edge 內回到主循環" />
          <div>
            <Math block>{'d_0 = \\overline{q_0 + q_2},\\quad d_1 = q_1 \\oplus q_0,\\quad d_2 = q_1 q_0'}</Math>
            <p>
              自己代一次 unused state：101 → d2 = 0、d1 = 0⊕1 = 1、d0 = NOR(1,1) = 0 ⇒ 010；110 ⇒ 010；111 ⇒ 100。三個都在一個 edge 內回到主循環——這次是刻意挑過 don't care 的結果。
            </p>
            <p>
              然後 q1（high 2T：edge k 到 k+2）→ falling-edge FF → q1_f（k+0.5 到 k+2.5）→ OR ⇒ high k 到 k+2.5 = <b>2.5T</b>，週期 5T，duty 50%。
            </p>
          </div>
        </div>
        <LogicDiagram schematic={div5Duty50Schematic} showValues={false} />
        <DividerSimPanel netlist={div5Duty50} schematic={div5Duty50Schematic} title="Divide-by-5 with 50% duty" signals={['clk', 'q2', 'q1', 'q0', 'q1_f', 'div_out']} showPulseWidths windowCycles={12} showDelayMode />
        <p>
          逐 edge 看：edge 2 進入 010，q1↑，div_out↑；edge 4 進入 100，q1↓，但 q1_f 撐到 4.5T 才↓。high = 4.5T − 2T = 2.5T。rising edge 在 2T、7T、12T，週期 5T。
        </p>
        <Math block>{'t_{high} = 2\\,T_{in} + \\tfrac{1}{2}T_{in} = 2.5\\,T_{in},\\qquad T_{out} = 5\\,T_{in},\\qquad D = 50\\%'}</Math>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>以為奇數除頻的 50% duty 可以只靠 logic 做出來</b>：沒有 falling edge 就沒有 (m + ½)T 的時間點，任何 rising-edge-only 的 logic 都做不到。
            </li>
            <li>
              <b>把 q1 → FF2.D 當成「沒有 logic 所以沒有 timing 問題」</b>：它的可用時間只有 d·T，在這一課的數字裡它比 NOR 回授先限制 Fmax。
            </li>
            <li>
              <b>假設輸入 duty 是 50%</b>：輸出 duty 誤差 = 輸入 duty 誤差 / N；constraint 也要用 d<sub>min</sub>、1 − d<sub>max</sub> 算半週期路徑。
            </li>
            <li>
              <b>用反相 clock 做 falling edge 卻忽略 inverter delay</b>：它是 skew，也是輸出 duty 的固定偏移。
            </li>
            <li>
              <b>把 OR 的輸出直接當下一級的 clock</b>：div_out 是 combinational 輸出，任何 runt 都會變成多餘的 clock edge。要當 clock 用，先過一級 register 或確保沒有 decode hazard。
            </li>
            <li>
              <b>用多 bit decode 當原訊號</b>：同一個 edge 多個 bit 翻轉，tCQ 不一致就會閃。用單一 state bit。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="SystemVerilog（synthesizable）">
          <CodeBlock
            title="div3_duty50.sv"
            code={`
module div3_duty50 (
  input  logic clk,
  input  logic rst_n,
  output logic div_out
);
  logic q1, q0, q1_f;
  // /3 core：00 → 01 → 10 → 00
  always_ff @(posedge clk or negedge rst_n) begin
    if (!rst_n) {q1, q0} <= 2'b00;
    else        {q1, q0} <= {q0, ~(q1 | q0)};
  end
  // q1 延遲半個 cycle：negative-edge flop
  always_ff @(negedge clk or negedge rst_n) begin
    if (!rst_n) q1_f <= 1'b0;
    else        q1_f <= q1;          // half-cycle path: posedge → negedge
  end
  assign div_out = q1 | q1_f;        // high 1.5T, period 3T
endmodule
`}
            note="posedge → negedge 的路徑會被 STA 當作 half-cycle path。constraint 裡的 clock waveform 要寫成實際的 duty（例如 create_clock -waveform {0 0.4T}）才會算對。"
          />
        </ModeContent>
      </Section>
    </>
  )
}

/** 練習：OR 換成 AND */
function ExerciseComponent() {
  return <DividerSimPanel netlist={div3And} schematic={div3AndSchematic} title="練習電路：q1 AND q1_f" signals={['clk', 'q0', 'q1', 'q1_f', 'div_out']} showEquations={false} showDelayMode showPulseWidths compact />
}

const lesson: LessonDef = {
  id: 'm2-l2-odd-50',
  module: 2,
  order: 2,
  title: 'Odd Divider 與 50% Duty Cycle',
  titleEn: 'Odd dividers and 50% duty',
  summary: '為什麼奇數除頻只用 rising edge 做不出 50% duty；用 falling-edge DFF 做出延遲 T/2 的複本再 OR 起來；逐 edge 看 high 從哪裡開始、哪裡結束；隨之而來的半週期 timing path、輸入 duty 敏感度與 glitch 風險；推廣到 /5。',
  goals: [
    '用 D = k/N 說明為什麼 N 為奇數時只用 rising edge 不可能得到 50% duty。',
    '看懂 q1 OR q1_f 的結構：falling-edge DFF 如何做出延遲 T/2 的複本，high 為什麼是 1.5T。',
    '逐 edge 追蹤 q1、q1_f、div_out，指出 high 在哪個 edge 開始、哪個 edge 結束。',
    '找出半週期路徑（clk↑ → clk↓）與 interface 路徑（clk↓ → clk↑），算出它們的可用時間如何隨輸入 duty 改變。',
    '分辨這個 OR 為什麼沒有 static hazard，以及真正會出問題的三種情況（半週期 setup 違反、輸入 duty 偏移、decode hazard）。',
    '把方法推廣到 /5：high 2T 的 state bit 加 T/2 得到 2.5T。',
  ],
  readingMinutes: 40,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'single',
      prompt: '為什麼只用 rising edge 的 /3 做不出 50% duty？',
      options: ['因為 NOR gate 太慢', '因為 high 時間只能是整數個 Tin，而 50% 需要 1.5 Tin', '因為 state 11 是 unused', '因為 duty 只能是 1/3'],
      answer: 1,
      explanation: '輸出只在 rising edge 翻轉，high 時間 = k·Tin（k 為整數）；N = 3 時 k/3 = 1/2 無整數解。要 1.5T 就要 falling edge 提供 (m + ½)T 的時間點。',
    },
    {
      id: 'q2',
      type: 'waveform',
      prompt: '哪一個波形是 50% duty 的 /3 輸出（div_out = q1 OR q1_f）？',
      options: [
        { label: 'A', traces: wave(div3, 'q1', 10) },
        { label: 'B', traces: wave(div3Duty50, 'div_out', 10) },
        { label: 'C', traces: wave(div3And, 'div_out', 10) },
        { label: 'D', traces: wave(div5Duty50, 'div_out', 12) },
      ],
      answer: 1,
      tEnd: 1000,
      period: 100,
      explanation: 'B：rising edge 間隔 3T、high 1.5T（在 clk 的 falling edge 結束）。A 是 /3 但 high 只有 1T；C 是 AND 版，high 0.5T；D 是 50% duty 但週期 5T（/5）。',
    },
    {
      id: 'q3',
      type: 'numeric',
      prompt: '同樣的 q1 OR q1_f 電路，輸入 clock duty = 40%。輸出 duty 是多少 %？',
      answer: 46.7,
      tolerance: 0.3,
      unit: '%',
      explanation: 'falling edge 在 k + 0.4，q1_f high 從 k+0.4 到 k+1.4，OR 之後 high = 1.4T；1.4 / 3 ≈ 46.7%。',
    },
    {
      id: 'q4',
      type: 'numeric',
      prompt: 'T = 50 ps、輸入 duty 50%。路徑 FF1.Q → FF2.D（clk↑ launch、clk↓ capture）：tCQ,max = 8 ps、wire = 2 ps、tsetup = 7 ps、jitter = 2 ps、margin = 2 ps、skew = 0。setup slack 是多少 ps？',
      answer: 4,
      unit: 'ps',
      explanation: '可用時間 = 0.5 × 50 = 25 ps；required = 25 − 7 − 2 − 2 = 14 ps；arrival = 8 + 2 = 10 ps；slack = 14 − 10 = 4 ps。',
    },
    {
      id: 'q5',
      type: 'multiple',
      prompt: '關於 q1 OR q1_f 這個結構，下列哪些正確？',
      options: [
        'OR 的兩個輸入切換時間相隔 T/2，OR 本身沒有 static hazard',
        '輸出 duty 會受輸入 clock duty 影響',
        'q1 → FF2.D 這條路徑有一整個 Tclk 可用',
        '在這一課的數字下，q1 → FF2.D 比 NOR 回授更早限制 Fmax',
      ],
      answers: [0, 1, 3],
      explanation: 'q1 → FF2.D 是 clk↑ 到 clk↓ 的半週期路徑，可用時間只有 d·T；Tclk,min = 21 / 0.5 = 42 ps，大於 NOR 回授的 31 ps。OR 的輸入從不同時切換，且切換時另一個輸入撐住輸出。',
    },
    {
      id: 'q6',
      type: 'state',
      prompt: 'mod-5 counter（d0 = NOR(q0,q2)、d1 = q1 XOR q0、d2 = q1 AND q0）從 011 開始，經過 3 個 rising edge 之後 state（q2 q1 q0）是多少？',
      answer: '001',
      width: 3,
      bitNames: ['q2', 'q1', 'q0'],
      explanation: '011 → 100 → 000 → 001。',
    },
    {
      id: 'q7',
      type: 'single',
      prompt: '把 div_out = q1 OR q1_f 改成 q1 AND q1_f，輸出的 high 時間與 duty 變成多少？',
      options: ['1.5T，50%', '1T，33.3%', '0.5T，16.7%', '2T，66.7%'],
      answer: 2,
      explanation: 'q1 high k → k+1，q1_f high k+0.5 → k+1.5，兩者都是 1 的區間只有 k+0.5 → k+1 = 0.5T；週期仍是 3T，duty = 1/6。',
    },
    {
      id: 'q8',
      type: 'single',
      prompt: '輸入 duty 從 50% 降到 40% 時，下列哪個敘述正確？',
      options: [
        'clk↑ → clk↓ 的路徑可用時間變少，clk↓ → clk↑ 的路徑可用時間變多',
        '兩種半週期路徑的可用時間都變少',
        '兩種半週期路徑的可用時間都不變，只有輸出 duty 改變',
        'NOR 回授路徑的可用時間變少',
      ],
      answer: 0,
      explanation: 'falling edge 提早到 0.4T：rising → falling 只剩 0.4T，falling → rising 變成 0.6T。full-cycle 路徑（NOR 回授）仍是一整個 T。',
    },
  ],
  exercise: {
    title: '把 OR 換成 AND',
    prompt: (
      <>
        <p>
          下面的電路與課文的 50% duty /3 完全相同，只是輸出的 OR 換成了 AND：<span className="mono">div_out = q1 AND q1_f</span>。<b>先不要按模擬</b>，自己推：
        </p>
        <ol>
          <li>q1 在哪段時間是 1？q1_f 在哪段時間是 1？（用 edge k 當基準寫出區間）</li>
          <li>兩者同時為 1 的區間是哪一段？high 時間多長？從哪一種 edge 開始、哪一種 edge 結束？</li>
          <li>除頻比有沒有變？duty 是多少？</li>
          <li>這個版本的 div_out rising edge 是由 FF1 還是 FF2 決定的？它的 output latency 路徑是哪一條？</li>
          <li>有沒有辦法只改 OR / AND 這個 gate 就得到 50%？</li>
        </ol>
        <p>推完再逐 edge 模擬對答案，並切到「實際 delay」模式看 div_out 的 edge 相對 clk 的位置。</p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: ['寫出 q1、q1_f、div_out 各自為 1 的區間', '算出 high 時間與 duty', '指出 div_out 的 rising / falling edge 各由哪個 flop 決定', '說明為什麼換 gate 無法得到 50%'],
    answer: (
      <>
        <p>
          <b>區間</b>：q1 = 1 於 [k, k+1)；q1_f = 1 於 [k+0.5, k+1.5)。AND ⇒ 兩者都為 1 只有 [k+0.5, k+1)：high 從 <b>clk↓</b>（q1_f↑）開始、在 <b>clk↑</b>（q1↓）結束，長度 <b>0.5T</b>。
        </p>
        <p>
          <b>除頻比與 duty</b>：rising edge 仍每 3T 一次（2.5T、5.5T、8.5T …），除數 3 不變；duty = 0.5 / 3 ≈ <b>16.7%</b>。模擬器量測列會顯示 duty ≈ 16.7%。
        </p>
        <p>
          <b>Latency 路徑</b>：div_out 的 rising edge 由 q1_f↑ 決定 ⇒ FF2（clk↓ launch）→ AND；falling edge 由 q1↓ 決定 ⇒ FF1（clk↑ launch）→ AND。與 OR 版剛好對調。
        </p>
        <p>
          <b>只改 gate 得不到 50%</b>：q1 與 q1_f 兩個訊號能組合出的 high 區間只有：OR = 1.5T、AND = 0.5T、XOR = 兩段各 0.5T（k 到 k+0.5 與 k+1 到 k+1.5，變成每 3T 兩個 pulse）、q1 或 q1_f 單獨 = 1T。要 50% 就必須是 OR；要不同的 duty 要改「原訊號」的 high 長度（改編碼或 decode），不是改這個 gate。
        </p>
      </>
    ),
  },
}
export default lesson
