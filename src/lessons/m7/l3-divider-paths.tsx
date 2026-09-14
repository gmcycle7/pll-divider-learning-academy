import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { div2, dualMod23, mmd2 } from '@/models/divider/examples'
import { div2Schematic } from '@/lessons/m1/div2-schematic'
import { progDiv46, progDiv57 } from './cases-models'
import {
  dm23ModSchematic,
  downstreamGenClkHighlight,
  downstreamIfaceHighlight,
  downstreamInternalHighlight,
  downstreamLoopHighlight,
  downstreamSchematic,
  mmd2Schematic,
  mmdCarryHighlight,
  mmdLocalHighlight,
  mmdOutputHighlight,
  mmdRippleClockHighlight,
  pmuxSchematic,
  progDiv57Schematic,
  progDivClockHighlight,
  progDivDecodeHighlight,
  progDivIncHighlight,
  progDivOutHighlight,
  progDivSchematic,
  progDivSelHighlight,
} from './cases-schematics'
import { caseATiming, caseBExerciseTiming, caseBTiming, caseCTiming, caseDTiming, caseETiming, caseFTiming } from './cases-timing'
import { pmuxRuntTraces } from './CaseWidgets'

function Content() {
  const pmuxTraces = pmuxRuntTraces()
  return (
    <>
      <Section title="先用直覺想" en="Intuition">
        <p>
          前兩課的 critical path 都長得一樣：一個 flop 送出、一段邏輯、另一個 flop 在下一個 edge 抓進去。divider 裡當然也有這種 path——但 divider 還有很多「看起來像 path、其實在問完全不同問題」的東西：控制訊號 mod 什麼時候可以改？下一級的 carry 回來要多久？phase MUX 的 select 什麼時候切才不會出 glitch？divider 的輸出接到 DSM 之後，誰在等誰？
        </p>
        <p>
          這一課用六個案例，把這些 path 一條一條拆開。每一條都問同樣四個問題：
        </p>
        <Callout kind="idea" title="每一條 path 都先問四件事">
          <ol style={{ margin: 0 }}>
            <li>
              <b>Launch</b>：資料是被哪一個 element、在哪一個 edge 送出的？（沒有 launch edge 的訊號，STA 算不出 arrival time。）
            </li>
            <li>
              <b>Capture</b>：誰在等這個資料？在哪一個 edge 抓？（沒有 capture element 的 path 只有 latency，沒有 slack。）
            </li>
            <li>
              <b>可用時間</b>：launch edge 到 capture edge 之間有多久？一個 <Math>{'T_{in}'}</Math>？<Math>{'N\\,T_{in}'}</Math>？半個 <Math>{'T_{vco}'}</Math>？
            </li>
            <li>
              <b>限制什麼</b>：slack 為負時壞掉的是 Fmax、是 mode 切換的時機、是 latency、還是 glitch？
            </li>
          </ol>
        </Callout>
        <p>
          六個案例：A 是純 feedback（/2）、B 是 decode + MUX 的 programmable divider、C 是 dual-modulus 的 mod 控制路徑、D 是 MMD 跨兩級的 carry、E 是 phase-MUX 的 select、F 是 divider 輸出接到 downstream。你會發現只有 A、B、C 的 state path 和 F 的內部 path 真的在限制 <Term zh="最高工作頻率" en="Fmax" />；其他的都在限制別的東西。
        </p>
      </Section>

      {/* ------------------------------------------------------------------ 案例 A */}
      <Section title="案例 A：Q → inverter → D（/2）" en="Case A: the /2 feedback loop">
        <p>
          從最熟悉的開始。Lesson 1-1 已經逐 edge 走過 /2，這裡只把 timing 的四個問題再問一次，當作後面五個案例的對照組。
        </p>
        <LogicDiagram schematic={div2Schematic} showValues={false} />
        <DividerSimPanel netlist={div2} schematic={div2Schematic} title="案例 A：/2（切到 real delay 看 tCQ 與 INV 的時間）" options={{ delayMode: 'real' }} showDelayMode showEquations={false} compact />
        <Steps
          items={[
            <>
              <b>Launch</b>：FF0，在 rising edge k。切到 real delay 模式，你會看到 q0 在 edge 後 8 ps 才改變——這就是 <Math>{'t_{CQ}'}</Math>。
            </>,
            <>
              <b>Logic</b>：只有一個 inverter，6 ps。d0 在 edge 後 8 + 6 = 14 ps 穩定。
            </>,
            <>
              <b>Capture</b>：還是 FF0，但是 edge k+1。同一個 flop、不同的 edge。
            </>,
            <>
              <b>可用時間</b>：edge k 到 edge k+1 = 一個 <Math>{'T_{in}'}</Math>。扣掉 tsetup 7、jitter 2、margin 2，資料最晚要在 <Math>{'T_{in} - 11'}</Math> ps 到。
            </>,
            <>
              <b>限制什麼</b>：<Math>{'T_{in,min} = 14 + 11 = 25'}</Math> ps ⇒ Fmax = 40 GHz。這條 path 限制的是 Fmax，而且它是這個電路<b>唯一</b>的 register-to-register path。
            </>,
          ]}
        />
        <CriticalPathExplorer scenario={caseATiming} showEnvControls={false} compact />
        <p>
          注意 explorer 裡另外兩條：rst_n → FF0 是 <Term zh="重置恢復 / 移除" en="recovery / removal" /> 檢查，決定 reset 何時可以放開，不影響 Fmax；FF0.Q → div_out 是 output latency，沒有 capture flop，只有一個數字（11 ps），沒有 required time、沒有 slack、也不限制 Fmax。三條 path、三種問題——這個模式會在後面每個案例重複出現。
        </p>
        <Callout kind="pitfall" title="rst_n 那條為什麼是紅的：removal slack = −3 ps">
          <p>
            把 rst_n 那條點開、切到 Hold 分頁：<b>removal slack = 2 − 5 = −3 ps</b>，是真的 violation，不是面板算錯。這個模型把「rst_n 在源頭剛好於 clock edge 當下釋放」當分析原點：走線 min 2 ps ⇒ 訊號最早在 edge 後 2 ps 才到 flop 的 async pin，但 <Math>{'t_{removal}'}</Math> = 5 ps 要求它在 edge 後至少 5 ps 都還維持 asserted。差 3 ps ⇒ flop 可能一半 reset、一半 capture。
          </p>
          <p>
            另一邊的 recovery 則很寬鬆：走線 max 4 ps，只要源頭在 edge 前 <Math>{'10 + 4 = 14'}</Math> ps 以上釋放就安全（slack 22 ps）。所以問題只出在「釋放時刻太靠近 edge」那一段禁區（edge 前 10 ps 到 edge 後 5 ps）——走線只有 2–4 ps，跨不過去。
          </p>
          <p>
            修法不是把線拉長，而是加 <Term zh="重置同步器" en="reset synchronizer" />：assert 維持非同步（立刻生效），de-assert 用兩級 flop 對齊 clk，釋放時刻就永遠落在 edge 之後一整個 tCQ。Lesson 7-2 Step 10 的 progDiv34 是已經加了 buffer 樹的版本（走線 min 6 ps ⇒ removal slack = <b>+1</b>），拿來對照就看得出差別在哪。
          </p>
        </Callout>
      </Section>

      {/* ------------------------------------------------------------------ 案例 B */}
      <Section title="案例 B：Q → decode → MUX → D（programmable divider）" en="Case B: decode + MUX in the feedback">
        <p>
          一個 3-bit 同步 counter，每個 edge 加一；兩個 decode 各自偵測一個 <Term zh="終止計數" en="terminal count, tc" />（011 與 101），MUX 依 sel 選一個當 tc；tc = 1 時把下一個 state 清成 000。
        </p>
        <LogicDiagram schematic={progDivSchematic} showValues={false} />
        <p>先不要看 timing，先把功能走一遍。從 reset（000）開始，sel = 0：</p>
        <DividerSimPanel netlist={progDiv46} schematic={progDivSchematic} title="案例 B：programmable /4 /6" showDelayMode showInputs signals={['clk', 'q2', 'q1', 'q0', 'tc', 'div_out']} />
        <Steps
          items={[
            <>
              <b>初始 000</b>：INC 算出 001；DEC4 看到的不是 011，tc4 = 0；MUX 選 tc4 ⇒ tc = 0；CLR 不清 ⇒ d = 001。
            </>,
            <>
              <b>edge 1 → 001，edge 2 → 010</b>：同樣的邏輯，tc 一直是 0。
            </>,
            <>
              <b>edge 3 → 011</b>：現在 DEC4 亮了，tc = 1。CLR 把 INC 算出來的 100 蓋掉 ⇒ d = 000。（波形上的 tc 在這個 cycle 為 1。）
            </>,
            <>
              <b>edge 4 → 000</b>：回到起點。state 序列 000 → 001 → 010 → 011 → 000，週期 4。q1 = 0, 0, 1, 1 ⇒ div_out 是 /4、duty 50%。
            </>,
            <>
              <b>把 sel 改成 1</b>：tc 改看 DEC6（101）。自己走一次：000 → 001 → 010 → 011 → 100 → 101 → 000，週期 6；q1 = 0, 0, 1, 1, 0, 0 ⇒ /6、duty 1/3。（注意 /6 的 duty 不是 50%。）
            </>,
          ]}
        />
        <Math block>{'N = (\\text{terminal count}) + 1,\\qquad T_{out} = N\\,T_{in},\\qquad D = \\frac{\\#\\{\\text{states with } q_1 = 1\\}}{N}'}</Math>
        <p className="small muted">
          <Math>{'N'}</Math> = 除數；<Math>{'T_{in}'}</Math> = 輸入 clock 週期（ps）；<Math>{'D'}</Math> = 輸出 duty cycle。/4：D = 2/4；/6：D = 2/6。
        </p>
        <p>
          <b>現在問 timing</b>。三個 flop 在同一個 edge 一起 launch，所以候選路徑的起點都是「edge k 的 q[2:0]」，終點都是「edge k+1 的某個 D」。中間有幾條不同的邏輯：
        </p>
        <ul>
          <li>
            <b>INC 路徑</b>：q → AND(q1,q0) → XOR → CLR → d2。tCQ 8 + (10 + 12) + 10 = <b>40 ps</b>。兩種 mode 都存在。
          </li>
          <li>
            <b>Decode 路徑</b>：q → DEC → MUX（data arc）→ CLR → d。tCQ 8 + 14 + 10 + 10 = <b>42 ps</b>。sel = 0 時只有 DEC4 那條會影響 tc（DEC6 的輸出被 MUX 擋在 in1）；sel = 1 時相反。
          </li>
          <li>
            <b>sel 路徑</b>：sel → MUX（select arc）→ CLR → d。5 + 12 + 10 = 27 ps。但 sel 不是由 clk 的 flop 送出的——它有 launch edge 嗎？
          </li>
          <li>
            <b>輸出</b>：q1 → div_out，11 ps，沒有 capture。
          </li>
        </ul>
        <Callout kind="method" title="用 real delay 波形抓到 arrival time">
          把模擬器切到 real delay、sel = 1，走到 edge 5（state 進入 101）。看 d1：它先在 edge 後 30 ps 變 1（INC 路徑：inc1 = q1 XOR q0 = 1），然後在 <b>42 ps</b> 被 tc 拉回 0（decode 路徑：tc6 → MUX → CLR）。D 最後一次改變的時間才是 arrival time——不是第一次。
        </Callout>
        <CriticalPathExplorer scenario={caseBTiming} guided />
        <p>
          切換 explorer 的 mode：/4 時候選清單裡沒有 DEC6 那條，/6 時沒有 DEC4 那條——這就是 <Term zh="致能" en="sensitization" />。兩種 mode 的 critical path 在這個模型裡剛好一樣長（42 ps，slack 6，<Math>{'T_{clk,min}'}</Math> = 54 ps），但這是巧合：練習裡把 decode 換成 /5、/7 之後就不一樣了。
        </p>
        <ModeContent level="engineer" title="sel 路徑要怎麼檢查？">
          <p>
            sel 路徑的 type 標成 async，因為 sel 沒有 clk 的 launch edge。實務上有兩種情況：
          </p>
          <ul>
            <li>
              <b>sel 是靜態 configuration</b>（開機設定一次）：宣告 false path 或用 case analysis 把 sel 固定，只跑兩次 STA（sel = 0 / sel = 1），各自找 critical path。
            </li>
            <li>
              <b>sel 要動態切換</b>：sel 必須由與 divider 同 clk 的 flop 送出，它就變成一條普通的 setup path（27 + 8 = 35 ps，比 decode 路徑短）。而且要只在 tc 不可能被 assert 的 state（例如 000）切換，否則 tc 可能在 CLR 正要用它的那一刻改變，divider 這一圈的除數不是 4 也不是 6。
            </li>
          </ul>
        </ModeContent>
        <ModeContent level="deep" title="MUX 的兩種 arc">
          <p>
            MUX 有 data → out 與 select → out 兩種 timing arc，select arc 通常慢（要經過 decode 再 gate 兩個 pass gate）。STA 會分別報。案例 B 的 decode 路徑走 data arc（10 ps），sel 路徑走 select arc（12 ps）。另外 decode 的輸出在 state 切換時可能出現短暫 glitch（例如 010 → 011 時 q0 先變、q1 後變），tc 跟著 glitch——但 tc 只在 edge 被 CLR 用到，只要在 tsetup 之前穩定就沒事。tc 若被拿去當 clock（案例 F 的 generated clock），這個 glitch 就致命了。
          </p>
        </ModeContent>
      </Section>

      {/* ------------------------------------------------------------------ 案例 C */}
      <Section title="案例 C：MOD → logic → D（dual-modulus 的控制路徑）" en="Case C: the modulus control path">
        <p>
          Lesson 3 的 /2 /3 cell：d0 = NOR(q1, q0)，d1 = q0 AND mod。state path（q → NOR / AND → D）跟案例 A、B 沒有兩樣；新的東西是 <span className="mono">mod</span>——它從哪裡來，決定了要用哪一種方法檢查它。
        </p>
        <LogicDiagram schematic={dm23ModSchematic} showValues={false} />
        <DividerSimPanel netlist={dualMod23} title="案例 C：/2 /3 cell（把 mod 切成 1 看 /3）" showDelayMode showInputs compact />
        <Steps
          items={[
            <>
              <b>mod = 1，從 00 開始</b>：d0 = NOR(0,0) = 1，d1 = q0 AND mod = 0 ⇒ edge 1 後 01。
            </>,
            <>
              <b>state 01</b>：d0 = 0，d1 = 1 AND 1 = 1 ⇒ edge 2 後 10。<b>這是唯一一個 mod 真的被用到的 edge</b>：只有 q0 = 1 時 AND 的輸出才跟 mod 有關。
            </>,
            <>
              <b>state 10</b>：d0 = 0，d1 = 0 AND mod = 0 ⇒ edge 3 後 00。週期 3。若 mod = 0，state 01 的 d1 = 0，直接回 00，週期 2。
            </>,
            <>
              <b>所以</b>：mod 在 state 00 與 10 期間（q0 = 0）改變完全沒影響——這是 mod 的 safe window；只有在「離開 01 的那個 edge」前後改變才危險。
            </>,
          ]}
        />
        <p>三種 mod 來源，三種檢查方式。用 explorer 的 mode 切換：</p>
        <CriticalPathExplorer scenario={caseCTiming} />
        <CompareTable
          head={['mod 來源', 'launch edge', 'STA 怎麼看', '正確的檢查方法', '限制什麼']}
          rows={[
            ['(i) 靜態 register（cfg_clk 寫入）', 'cfg_clk 的 edge，與 clk 無關', '若不加 exception，會用兩個 clock 最近的 edge 硬算，得到無意義的 slack', 'false path（或 case analysis）＋系統規則：只在 divider 停止 / reset 時改寫', 'configuration 改寫時機，不是 Fmax'],
            ['(ii) 同步 flop（同一個 clk）', 'clk edge k', '普通 register-to-register setup path：tCQ 8 + wire 6 + AND 10 = 24 ps，slack 15', '照一般 setup / hold 檢查；每個 edge 都檢查（保守但正確）', 'Fmax（與 state path 一起比）與 mod 的更新時機'],
            ['(iii) 非同步來源', '沒有', '沒有 arrival time 可算', '加 synchronizer 變成 (ii)，或系統保證只在 q0 = 0 的 window 內改變', 'mod 改變的安全時間窗；違反 ⇒ FF1 metastable'],
          ]}
        />
        <Math block>{'t_{mod,deadline} = T_{in} - t_{AND,max} - t_{setup} - t_{jitter} - t_{margin}'}</Math>
        <p className="small muted">
          <Math>{'t_{mod,deadline}'}</Math> = mod 相對 launch edge 最晚穩定的時間（ps）；只對 (ii) 有意義。以 T = 50 為例：50 − 10 − 7 − 2 − 2 = 29 ps，而 mod 的 arrival 是 8 + 6 = 14 ps。
        </p>
        <Callout kind="pitfall" title="兩條 arc 走同一個 AND gate">
          q0 → AND → d1 是 state path（launch 在 FF0），mod → AND → d1 是 control path（launch 在 mod 的來源）。同一個 gate、兩條不同的 path、兩種不同的 launch。把它們混成一條「AND 的路徑」就找不到問題在哪裡。
        </Callout>
        <ModeContent level="engineer" title="(ii) 的 safe window 有多長？">
          <p>
            以 /3 為例，mod 只在離開 01 的 edge 被取樣。從「進入 01 的 edge」算起，mod 可以改變的區間是：上一次取樣的 hold 結束之後，到下一次取樣的 setup 開始之前。
          </p>
          <Math block>{'W_{safe} \\approx 3\\,T_{in} - (t_{AND,max} + t_{setup}) - (t_{hold} - t_{AND,min})'}</Math>
          <p className="small muted">
            <Math>{'W_{safe}'}</Math> = mod 可以安全改變的時間窗（ps）；/2 模式把 3 換成 2。同步 flop 送出的 mod 自動落在這個 window 裡（tCQ 之後、下一個 edge 之前），這就是為什麼 (ii) 只要照一般 setup / hold 檢查。
          </p>
        </ModeContent>
      </Section>

      {/* ------------------------------------------------------------------ 案例 D */}
      <Section title="案例 D：downstream carry → upstream MOD（MMD 跨兩級）" en="Case D: the MMD carry path across two cells">
        <p>
          Lesson 4 的兩級 /2 /3 MMD：cell 1 用 clk，cell 2 用 cell 1 的輸出 f1 當 clock。cell 2 的 mod_out2 回頭經過兩個 AND 變成 cell 1 的 da1。這條 path 從 cell 2 的 flop（clock = f1）出發，在 cell 1 的 flop（clock = clk）被抓——launch 與 capture 用的是<b>不同的 clock</b>。
        </p>
        <LogicDiagram schematic={mmd2Schematic} showValues={false} />
        <DividerSimPanel netlist={mmd2} title="案例 D：兩級 MMD（把 p0 = p1 = 1 設成 /7，切 real delay）" showDelayMode showInputs signals={['clk', 'a1', 'a0', 'f1', 'b1', 'b0', 'mod_out2', 'mod1_eff', 'da1', 'div_out']} windowCycles={12} />
        <p>p1 = p0 = 1，real delay，state 寫成 (b1 b0 a1 a0)：</p>
        <Steps
          items={[
            <>
              <b>edge 1–3</b>：0000 → 0001 → 0010 → 0100。edge 3 時 cell 1 回到 00，f1 = NOR(a1, a0) 在 edge 後 8 + 12 = 20 ps 升起，cell 2 被這個 rising edge 觸發。
            </>,
            <>
              <b>edge 7（t = 700）</b>：cell 1 又回到 00 ⇒ f1 在 720 rising ⇒ cell 2 被觸發、進入 state 00（b1b0：10 → 00，所以在 728 改變的是 <b>b1</b>，不是 b0）⇒ mod_out2 = NOR(b1, b0) 在 740 升起 ⇒ mod1_eff = p0 AND mod_out2 在 750。從 clk edge 7 算起，這個訊號花了 <b>50 ps</b>（tCQ 8 + NOR 12 + tCQ 8 + NOR 12 + AND 10）。
              <span className="muted">
                （p1 = 1 時 cell 2 走 /3，b1b0 = 00 → 01 → 10 → 00，進入 00 的那一拍是 b1 落下；p1 = 0 時 cell 2 走 /2，00 → 01 → 00，換成 b0 落下。兩條 arc 的 delay 相同，所以 50 ps 這個數字不變——把模擬器的 p1 切成 0 自己驗一次。）
              </span>
            </>,
            <>
              <b>但 a0 在 708 已經變 0</b>：da1 = a0 AND mod1_eff 被 a0 擋住，750 前後 da1 完全不動。edge 8（800）根本沒有用到 mod1_eff。
            </>,
            <>
              <b>edge 8 → a0 = 1（808）</b>：da1 在 818 才變 1；<b>edge 9（900）</b> 把它抓進去，a1 在 908 變 1。從 launch（edge 7）到 capture（edge 9）中間隔了<b>兩個</b> clk edge。
            </>,
          ]}
        />
        <Callout kind="warning" title="這不是 ripple 當 synchronous 分析">
          f1 是 clk 的 <Term zh="衍生時脈" en="generated clock" />，它相對 clk edge 的 source latency（20 ps）有被算進 arrival time；capture edge 仍然是 clk 的 edge。這跟 Lesson 2 的 ripple counter「每級 clock 各自累積延遲」是兩回事——這裡 cell 2 的 flop 只是 launch element，不是被分析的 capture。
        </Callout>
        <CriticalPathExplorer scenario={caseDTiming} />
        <p>
          STA 預設會把 f1 rising 之後最近的 clk edge 當 capture：可用時間只有一個 T，扣掉 source latency 之後 60 ps 的 arrival 在 T = 70 時 slack = <b>−2</b>。功能上真正的 requirement 是兩個 cycle（140 ps，slack +68）。宣告 multicycle 之後，MMD 真正的 Fmax path 變成 cell 1 自己的 a0 → NOR → da0（20 ps，<Math>{'T_{clk,min}'}</Math> = 32 ps）。
        </p>
        <Math block>{'T_{avail,carry} = M\\,T_{in},\\quad M = 2 \\quad\\text{（f1 rising 後第一個 cycle a}_0 = 0\\text{，AND 必擋）}'}</Math>
        <p className="small muted">
          <Math>{'M'}</Math> = multicycle 的 cycle 數。宣告之前必須對所有 p0 / p1 與所有 state 證明「f1 rising 後的第一個 clk edge，a0 一定是 0」——在這個模型裡永遠成立（a = 00 ⇒ f1 = 1 ⇒ 下一個 edge a0 ← 1）。用模擬器把 p 的四種組合都跑一遍確認。
        </p>
        <ModeContent level="deep" title="為什麼 MMD 把 modulus-out 設計成「進入 00 那一刻就送出」">
          <p>
            如果 cell 2 的 mod_out 是在它的 state 走到一半才 decode 出來（例如用 b1 AND b0），carry 回到 cell 1 的可用時間會少掉半個 cell 週期，而且 M 會隨 p1 改變——每種 modulus 要分開宣告 exception。用 NOR(b1, b0) = state 00 做 mod_out，讓 carry 在 cell 2 週期一開始就出發，整個 cell 週期都是它的。低速級（cell 2，週期 ≥ 2T）也因此可以用小、省電的 flop：它自己的 state path slack 是 108 ps。
          </p>
        </ModeContent>
      </Section>

      {/* ------------------------------------------------------------------ 案例 E */}
      <Section title="案例 E：phase control → decode → PMUX select → output edge" en="Case E: the phase-MUX select path">
        <p>
          Lesson 5 的 phase-MUX divider：8 個 VCO 相位、一個 8:1 MUX、一個用被選相位當 clock 的 /N counter，還有一個由 div_out 觸發的 FSM 決定下一個 phase_sel。這裡 MUX 與 FSM 用 box 表示——內部細節不影響 timing 的結構。
        </p>
        <LogicDiagram schematic={pmuxSchematic} showValues={false} />
        <p>
          先看壞掉長什麼樣。下面用 event 產生的波形：Tvco = 80 ps，ph1 落後 ph0 一個相位（Δ = 10 ps）。select 在 t = 215 從 ph1 切回 ph0——這是<b>往後跳</b>（k = −1，換到比較<b>早</b>的相位）。t = 215 時兩個 phase 都還是 high，所以切換當下不會多生一個 edge；但這個 pulse 的結尾從此改由 ph0 決定，而 ph0 比 ph1 早 10 ps 落下：
        </p>
        <ClockWaveform signals={pmuxTraces} tEnd={330} unit=" ps" pxPerPeriod={2} showPulseWidths={['pmux_out']} highlight={['pmux_out']} markers={[{ t: 215, label: 'sel 切換', kind: 'input', signal: 'sel' }]} shades={[{ t0: 190, t1: 220, kind: 'danger', label: '被截短', signal: 'pmux_out' }]} zoomable={false} />
        <p>
          輸出 190–220 這個 pulse 只有 30 ps，正常是 40 ps——正好被縮短 Δ = 10 ps。counter 的 flop 看到一個比平常窄的 clock pulse——這是 <Term zh="脈波寬度" en="pulse width" /> 問題，不是 data setup 問題：counter 的 D 完全沒動，是 clock 本身被切壞了。（如果切換時刻落在兩個 phase level <b>不同</b>的區間，情況更糟：切換當下就多出一個 edge，寬度可以窄到任意值。）
        </p>
        <Callout kind="method" title="這條 path 的四個問題">
          <ol style={{ margin: 0 }}>
            <li>
              <b>Launch</b>：phase_sel register，在 div_out 的 edge 送出。
            </li>
            <li>
              <b>Capture</b>：沒有 flop 在等它。「capture」是 MUX 的輸出——select 必須在舊 phase 與新 phase <b>都為 low 的 window 內</b>完成切換。
            </li>
            <li>
              <b>可用時間</b>：兩個 phase 同時是同一個 level 的那段。跳一個 phase（間距 Δ = Tvco/8）時，window = Tvco/2 − Δ = <b>3/8 Tvco</b>（Tvco = 125 ⇒ 46.9 ps）；同時為 high 的那個窗一樣寬，所以每個 Tvco 其實有 2 × 3/8 = 3/4 Tvco 可以切。
            </li>
            <li>
              <b>限制什麼</b>：能安全切換的最小 Tvco（tCQ 10 + wire 3 + decode 14 + MUX 12 = 39 ps，加 jitter 3、margin 2，⇒ <Math>{'T_{vco,min} = 44 / (3/8) \\approx 117'}</Math> ps）。這<b>不是</b> divider 的 Fmax：counter 自己的 state path 允許到 42 ps。
            </li>
          </ol>
        </Callout>
        <CriticalPathExplorer scenario={caseETiming} />
        <Math block>{'W_{switch} = T_{vco}\\left(\\frac{1}{2} - \\frac{|k|}{8}\\right) = \\frac{T_{vco}}{2} - |k|\\,\\Delta,\\qquad \\Delta = \\frac{T_{vco}}{8}'}</Math>
        <p className="small muted">
          <Math>{'W_{switch}'}</Math> = select 可以安全改變的 window（ps）；<Math>{'k'}</Math> = 跳的 phase 數，正 = 往前跳（forward，選<b>較晚</b>的相位、輸出 edge 延後），負 = 往後跳（backward，選<b>較早</b>的相位）；<Math>{'\\Delta'}</Math> = 相鄰 phase 間距。|k| = 1 時 3/8 Tvco，|k| 越大越窄，|k| = 4（差半個週期）時為 0。
        </p>
        <p className="small muted">
          <b>window 寬度對方向是對稱的</b>（兩邊都是 <Math>{'T_{vco}/2 - |k|\\Delta'}</Math>）：往後跳不會比較寬。會算出「往後跳 5/8 Tvco」是因為把 window 定義成「新 phase 的 falling edge → 舊 phase 的下一個 rising edge」；往後跳時這段區間的前半舊 phase 還是 high，在那裡切換會把正在輸出的 pulse 截短，後半新 phase 已經 high，會提早生出一個 edge。正確的定義是「兩個 phase 同時是同一個 level」。
        </p>
        <p className="small muted">
          <b>真正不對稱的是輸出本身</b>：切換之後，這半個週期的結尾改由新 phase 決定。往前跳（k &gt; 0）把它<b>拉長</b> <Math>{'|k|\\Delta'}</Math>；往後跳（k &lt; 0）把它<b>縮短</b> <Math>{'|k|\\Delta'}</Math>，而且<b>不管切在哪裡都躲不掉</b>——把輸出 edge 提前 |k|Δ，本來就等於把某一個半週期壓掉 |k|Δ。所以往後跳很容易撞到 flop 的 min pulse width，<b>這才是很多 PMUX 只允許往一個方向旋轉的原因</b>。
        </p>
        <Math block>{'\\text{往後跳後被壓縮的半週期} = \\frac{T_{vco}}{2} - |k|\\,\\Delta = W_{switch}'}</Math>
        <p className="small muted">
          兩者剛好是同一個式子。上面那段波形就是這樣：<Math>{'T_{vco} = 80'}</Math> ps、<Math>{'\\Delta = 10'}</Math> ps、從 ph1 切回 ph0 是 k = −1 ⇒ 40 − 10 = <b>30 ps</b>，正是波形上量到的寬度。t = 215 時兩個 phase 其實都還是 high（在 window 內，沒有多生 edge），pulse 照樣被壓短——往後跳就是這樣。若切在 window 外（兩者 level 不同），還會<b>額外</b>多一個 edge，寬度可以窄到任意值，那更糟。
        </p>
        <Callout kind="pitfall" title="修法不在 divider">
          slack 不夠時，把 counter 做快沒有用。要做的是：把 select 的 launch edge 對到 window 的起點（retime 到適當的 VCO 相位），或用 glitch-free MUX（先切到共同的 low、再切換 select）。這是 Lesson 5 的主題；這一課只要記得它的 timing 類型是 async / pulse width，不是 setup。
        </Callout>
      </Section>

      {/* ------------------------------------------------------------------ 案例 F */}
      <Section title="案例 F：divider output → downstream DSM / control logic" en="Case F: divider output into the downstream logic">
        <p>
          divider 的輸出 div_out 是一個週期 <Math>{'N\\,T_{in}'}</Math> 的 clock，接到 fractional-N 的 DSM 與控制邏輯；DSM 算出下一個 N 再送回 divider。很多人把「divider → DSM」這整塊叫做「divider 的 critical path」，其實裡面有<b>五條</b>性質完全不同的 path。N = 8，Tin = 125 ps：
        </p>
        <LogicDiagram schematic={downstreamSchematic} showValues={false} />
        <CriticalPathExplorer scenario={caseFTiming} />
        <CompareTable
          head={['path', 'launch → capture', '可用時間', 'arrival', 'slack', '限制什麼']}
          rows={[
            ['① divider 內部 Fmax', 'FF_a (clk_in) → FF_b (clk_in)', '1 Tin = 125', '8 + 30 = 38', '+75（Tclk,min 50）', 'divider 能跑多快：唯一一條決定 Fmax 的 path'],
            ['② interface', 'FF_last (div_out) → DSM_REG (div_out)', 'N·Tin = 1000', '25 + 15 = 40', '+935', 'divider ↔ downstream；在 div_out domain 幾乎不會出問題'],
            ['③ control loop（multicycle）', 'DSM_REG (div_out) → DSM comb → FF_b (clk_in)', 'N·Tin = 1000（cycles = N）', '25 + 200 + 20 + 30 = 275', '+713', 'DSM 能多慢、N 最晚何時更新'],
            ['④ combinational feedback', 'FF_b (clk_in) → buffer → DSM comb → FF_b (clk_in)', '1 Tin = 125', '8 + 12 + 200 + 20 + 30 = 270', '−157', '危險：沒有明確的 launch edge，除數也不明確'],
            ['⑤ generated clock', 'FF_b → decode / buffer → DSM_REG.clk', '（無 capture，latency）', '8 + 12 + 25 = 45', '—', 'div_out 相對 clk_in 的 source latency 與 glitch'],
          ]}
        />
        <Math block>{'T_{avail,iface} = N\\,T_{in},\\qquad T_{avail,loop} = N\\,T_{in} - t_{src},\\qquad t_{src} = t_{CQ} + t_{decode} + t_{buf}'}</Math>
        <p className="small muted">
          <Math>{'t_{src}'}</Math> = generated clock 的 source latency（ps）= 45。interface path 的 launch 與 capture 都晚 45 ps，互相抵銷；control loop 的 capture 是 clk_in 的 edge，不會等 div_out，所以可用時間要扣掉它（explorer 的 loop path 沒有扣：713 − 45 = 668 ps，仍然非常寬鬆）。
        </p>
        <Steps
          items={[
            <>
              <b>① 內部 Fmax</b>：跟案例 A 一模一樣的問題，只是 logic 比較長。只有這條的 slack 會告訴你 divider 能跑多快。
            </>,
            <>
              <b>② interface</b>：launch 與 capture 都由 div_out 觸發，在 div_out domain 裡是單一 cycle 的 path，可用時間是 1000 ps。前提是 STA 裡有把 div_out 定義成 generated clock——否則工具根本看不到這條 path，也不會檢查它。
            </>,
            <>
              <b>③ control loop</b>：DSM 在 output edge 算出下一個 N，必須在 divider 下一個週期用到 N 之前送回。launch 在 div_out domain、capture 在 clk_in domain：STA 預設用最近的 clk_in edge，可用時間 125 ps，275 ps 的 arrival 一定 fail。正確的 exception 是 multicycle，cycles 由架構決定——像案例 D 一樣，要先用模擬證明 divider 在哪個 edge 才真的消耗 N。
            </>,
            <>
              <b>④ combinational feedback</b>：把 DSM_REG 拿掉、DSM 直接從 div_out 算 mod 接回 divider。launch 與 capture 都是 FF_b 的相鄰兩個 clk_in edge，270 ps 的邏輯塞不進 125 ps；更糟的是功能：mod 會在 divider 週期中途改變，這一圈的除數不知道是 N 還是 N+1。register 不是為了 speed，是為了讓 loop 有明確的 launch edge。
            </>,
            <>
              <b>⑤ generated clock</b>：這不是 setup check。div_out 被當 clock 用，STA 要用 create_generated_clock 定義它，它的 source latency 會平移 DSM domain 每一條 path 的 edge。若 div_out 是由多個 flop decode 出來的（不是直接取 Q），decode glitch 會變成 clock glitch，下游 flop 被多觸發一次——輸出當 clock 用時，一定從 flop Q 直接出去。
            </>,
          ]}
        />
      </Section>

      {/* ------------------------------------------------------------------ 總結 */}
      <Section title="六個案例：各自限制什麼" en="What each case actually limits">
        <CompareTable
          head={['案例', '結構', 'launch → capture', '可用時間', 'STA type', '限制什麼', '搞錯會怎樣']}
          rows={[
            ['A', 'Q → INV → D', 'FF0 edge k → FF0 edge k+1', '1 Tin', 'setup / hold', 'Fmax', '—（最單純的 reg-to-reg）'],
            ['B', 'Q → decode → MUX → D', 'FFx edge k → FFy edge k+1（依 sel 選 decode）', '1 Tin', 'setup / hold（分 mode）', '每個 mode 各自的 Fmax；sel 路徑限制切換時機', '沒分 mode 會把不會被 sensitize 的 decode 算進去，Fmax 太悲觀'],
            ['C', 'MOD → AND → D', '看 mod 來源：cfg_clk / clk edge k / 無', '1 Tin（同步）或系統規則', 'false path / setup / async', 'mod 的更新時機；(ii) 也算 Fmax', '(i)(iii) 硬套 setup 得到無意義 slack；(iii) 不加 synchronizer 會 metastable'],
            ['D', 'cell 2 carry → cell 1 D', 'b0（f1 edge）→ a1（clk edge k+2）', '2 Tin（multicycle）', 'multicycle', '真正的 Fmax 在 cell 1 內部', '預設 single-cycle 報 −2 slack，誤判 violation；或當 ripple 忽略 f1 latency'],
            ['E', 'phase_sel → decode → MUX select', 'phase_sel reg（div_out edge）→ MUX 輸出的 safe window', '3/8 Tvco', 'async / pulse width', '能安全切換的最小 Tvco，不是 Fmax', '當成 data setup 去修 counter，runt 照樣出現'],
            ['F', 'divider → DSM → divider', '五條：內部 / interface / loop / comb-fb / gen-clk', '1 Tin / N·Tin / N·Tin / 1 Tin / latency', 'setup / interface / multicycle / setup / output', '只有內部那條是 Fmax', '把 interface 或 loop 叫做「divider 的 critical path」，然後去優化錯的東西'],
          ]}
        />
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>把最長的 wire 當 critical path</b>：案例 F 的 mod wire 從 DSM 拉回 divider 最長，但它屬於 multicycle 的 loop path，slack 有 700 多 ps；真正緊的是 38 ps 的內部 path。
            </li>
            <li>
              <b>把所有 output delay 都叫 setup critical path</b>：案例 A、B、E、F 的 output / clock path 只有 latency，沒有 capture flop，沒有 slack。
            </li>
            <li>
              <b>沒分 mode 就找 critical path</b>：案例 B 的 DEC6 在 sel = 0 時根本不會影響 D；案例 C 的 mod path 依來源不同，檢查方法完全不同。
            </li>
            <li>
              <b>把 MMD 的 generated clock 當 ripple 忽略</b>：f1 的 20 ps source latency 要算進 carry path 的 arrival；但 capture edge 還是 clk 的 edge。
            </li>
            <li>
              <b>用 false path 把 combinational feedback 藏起來</b>：案例 F 的 ④ 不是 timing 問題而已，是功能問題——除數不明確。要加 register，不是加 exception。
            </li>
            <li>
              <b>PMUX select 當 data setup 修</b>：它是 pulse-width / runt 問題，修 counter 沒用（案例 E）。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="SDC：這六個案例各需要什麼 constraint">
          <CodeBlock
            lang="tcl"
            title="divider_paths.sdc（節錄）"
            code={`
# 案例 A / B：一般 setup / hold，由 create_clock 自動涵蓋
create_clock -name clk_in -period 0.125 [get_ports clk_in]

# 案例 B：sel 是靜態 configuration → 兩種 mode 各跑一次
set_case_analysis 0 [get_ports sel]        ;# run 1：/4
# set_case_analysis 1 [get_ports sel]      ;# run 2：/6

# 案例 C (i)：靜態 register，與 clk 無關 → false path
set_false_path -from [get_clocks cfg_clk] -to [get_clocks clk_in]

# 案例 D：跨兩級 carry，功能上是 2-cycle（先用模擬證明）
set_multicycle_path 2 -setup -from [get_pins C2_FF0/CK] -to [get_pins C1_FF1/D]
set_multicycle_path 1 -hold  -from [get_pins C2_FF0/CK] -to [get_pins C1_FF1/D]

# 案例 F ⑤：div_out 是 generated clock（divide-by-8，從 FF_b/Q 出去）
create_generated_clock -name div_out -source [get_pins FF_b/CK] -divide_by 8 [get_pins FF_b/Q]

# 案例 F ③：control loop 是 multicycle，cycles = N（同樣先用模擬證明）
set_multicycle_path 8 -setup -from [get_clocks div_out] -to [get_pins FF_b/D]
set_multicycle_path 7 -hold  -from [get_clocks div_out] -to [get_pins FF_b/D]
`}
            note="案例 E 的 select window 不是 STA 能表達的 check（它沒有 capture flop），要用 min pulse width check 或電路級模擬驗證。"
          />
        </ModeContent>
        <ModeContent level="deep" title="PVT 與 OCV 下這些 path 的行為">
          <ul>
            <li>
              <b>案例 D 的 multicycle</b>：宣告 2-cycle 後 hold 仍以 0-cycle 檢查（launch 與 capture 同一個 edge）。f1 的 source latency 在 fast corner 變短，hold 反而更容易出問題——multicycle 只放寬 setup，不要順手放寬 hold。
            </li>
            <li>
              <b>案例 E 的 window</b>：3/8 Tvco 是 nominal；VCO 相位間距有 mismatch（例如 ±3 ps），MUX 八個輸入的 delay 也不一致，window 兩端都要再扣。slow corner 的 decode 慢、fast corner 的 phase 快，兩個 corner 都要看。
            </li>
            <li>
              <b>案例 F 的 generated clock latency</b>：45 ps 在 OCV 下 launch 與 capture 走不同的 buffer tree，CRPR 只能抵銷共同的部分。interface path 的 skew 若 DSM 在另一個 power domain，可能比它的 setup 還大。
            </li>
            <li>
              <b>案例 B 的 MUX select arc</b>：select arc 的 delay 對 PVT 比 data arc 敏感（pass gate 的 VT）；動態切換除數時，sel 路徑在 slow corner 可能反過來變成 critical。
            </li>
          </ul>
        </ModeContent>
      </Section>
    </>
  )
}

/** 練習：案例 B 換 /5 /7 decode */
function ExerciseComponent() {
  return (
    <>
      <DividerSimPanel netlist={progDiv57} schematic={progDiv57Schematic} title="練習電路：programmable /5 /7" showDelayMode showInputs signals={['clk', 'q2', 'q1', 'q0', 'tc', 'div_out']} compact />
      <CriticalPathExplorer scenario={caseBExerciseTiming} />
    </>
  )
}

const lesson: LessonDef = {
  id: 'm7-l3-divider-paths',
  module: 7,
  order: 3,
  title: 'Divider 特有的 Timing Path',
  titleEn: 'Divider-specific timing paths',
  summary: '六個案例：/2 feedback、decode + MUX、mod 控制路徑、MMD 跨級 carry、PMUX select、divider → downstream。每條都問 launch、capture、可用時間、限制什麼，分清 Fmax、interface、loop latency、multicycle 與 generated clock。',
  goals: [
    '對任何一條 divider 裡的 path，先回答 launch / capture / 可用時間 / 限制什麼，再談 slack。',
    '在 programmable divider 裡分 mode 找 critical path，並用 real-delay 波形確認 arrival time 是 D 最後一次改變的時間。',
    '依 mod 的來源（靜態 register / 同步 flop / 非同步）選擇正確的檢查方法。',
    '看懂 MMD 跨級 carry 為什麼是 multicycle，以及 generated clock 的 latency 要算在哪裡。',
    '把 PMUX select 的 window 與 divider Fmax 分開；把 divider → downstream 拆成內部 / interface / loop / combinational feedback / generated clock 五條 path。',
  ],
  readingMinutes: 45,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'critical-path',
      prompt: '案例 B 的 programmable divider，sel = 0（/4）時限制 Fmax 的 critical path 是哪一條？',
      schematic: progDivSchematic,
      options: [
        { label: 'clk 走線到三個 flop 的 clock pin', highlight: progDivClockHighlight, description: 'clock path 只有 latency / skew，沒有 capture 的 setup' },
        { label: 'FF0.Q → DEC4 → MUX2 → CLR → FF1.D', highlight: progDivDecodeHighlight, description: 'tCQ 8 + DEC 14 + MUX 10 + CLR 10 = 42 ps' },
        { label: 'FF0.Q → INC → CLR → FF2.D', highlight: progDivIncHighlight, description: 'tCQ 8 + 22 + 10 = 40 ps' },
        { label: 'sel → MUX2 → CLR → FF1.D', highlight: progDivSelHighlight, description: 'control path，沒有 clk 的 launch edge' },
        { label: 'FF1.Q → div_out', highlight: progDivOutHighlight, description: 'output latency 11 ps' },
      ],
      answer: 1,
      explanation: 'decode → MUX → CLR 是 42 ps，比 INC 路徑的 40 ps 長 2 ps，而且在 sel = 0 時 DEC4 那條會被 sensitize。clock 走線沒有 capture setup；sel 是 control path（靜態時 false path，動態時要由同步 flop 送出）；output 只有 latency。',
    },
    {
      id: 'q2',
      type: 'critical-path',
      prompt: '案例 D 的兩級 MMD，把跨級 carry 正確宣告成 multicycle 之後，真正限制 Fmax 的 path 是哪一條？',
      schematic: mmd2Schematic,
      options: [
        { label: 'C2.FF0 → C2 NOR → AND(p0) → C1 AND → C1.FF1.D（跨級 carry）', highlight: mmdCarryHighlight, description: '60 ps，但可用時間是 2 T' },
        { label: 'C1.FF0 → C1 NOR → C1.FF0.D（cell 1 內部）', highlight: mmdLocalHighlight, description: 'tCQ 8 + NOR 12 = 20 ps，可用時間 1 T' },
        { label: 'clk → cell 1 → f1 → cell 2 的 clock 走線', highlight: mmdRippleClockHighlight, description: 'generated clock 的 source latency' },
        { label: 'C2 NOR → div_out', highlight: mmdOutputHighlight, description: 'output latency' },
      ],
      answer: 1,
      explanation: 'carry path 宣告 2-cycle 後 slack 是 +68；cell 1 內部的 a0 → NOR → da0 只有 1 T 可用，Tclk,min = 20 + 7 + 3 + 2 = 32 ps，是 MMD 真正的 Fmax path。clock 走線是 latency 不是 setup path；output 沒有 capture。',
    },
    {
      id: 'q3',
      type: 'critical-path',
      prompt: '案例 F（divider 輸出接到 DSM）：哪一條 path 決定 divider 本身能跑多快？',
      schematic: downstreamSchematic,
      options: [
        { label: 'FF_last → DSM_REG（interface，div_out domain）', highlight: downstreamIfaceHighlight, description: '可用時間 N·Tin = 1000 ps' },
        { label: 'DSM_REG → DSM comb → mod → core → FF_b（control loop）', highlight: downstreamLoopHighlight, description: 'multicycle，cycles = N' },
        { label: 'FF_a → core logic → FF_b（divider 內部）', highlight: downstreamInternalHighlight, description: '可用時間 1 Tin = 125 ps' },
        { label: 'FF_b → decode / buffer → DSM_REG.clk（generated clock）', highlight: downstreamGenClkHighlight, description: 'source latency 45 ps' },
      ],
      answer: 2,
      explanation: '只有內部 path 的 launch 與 capture 都在 clk_in、可用時間 1 Tin（slack 75，Tclk,min 50 ps）。interface 與 loop 的可用時間是 N·Tin，slack 都在 700 ps 以上；generated clock 是 latency，不是 setup check。',
    },
    {
      id: 'q4',
      type: 'numeric',
      prompt: '案例 B：tCQ,max = 8、DEC = 14、MUX data arc = 10、CLR = 10、tsetup = 7、jitter = 3、margin = 2、skew = 0。sel = 0 時 Tclk,min 是多少 ps？',
      answer: 54,
      unit: 'ps',
      explanation: 'arrival = 8 + 14 + 10 + 10 = 42；Tclk,min = 42 + 7 + 3 + 2 = 54 ps。INC 路徑是 40 + 12 = 52 ps，不是最差的。',
    },
    {
      id: 'q5',
      type: 'single',
      prompt: '案例 C：mod 由一個用 cfg_clk 寫入的靜態 register 送出，divider 運作期間不會改寫。這條 mod → AND → FF1.D 的 path 應該怎麼處理？',
      options: ['當一般 setup path 檢查，用 cfg_clk 與 clk 最近的兩個 edge 算 slack', '宣告 false path（或 case analysis），並以系統規則保證只在 divider 停止時改寫', '加一級 synchronizer 之後當一般 setup path', '它是 hold path，只檢查 hold'],
      answer: 1,
      explanation: 'cfg_clk 與 clk 沒有整數倍關係，用最近的 edge 算 slack 毫無意義。靜態 configuration 的正確做法是 false path + 系統規則。若 firmware 會在運作中改寫，它就退化成非同步來源，才需要 synchronizer 或 safe window。',
    },
    {
      id: 'q6',
      type: 'multiple',
      prompt: '下列哪些 path 在正確分析下「不會」限制 divider 的 Fmax？',
      options: ['案例 F 的 FF_last → DSM_REG（interface path）', '案例 E 的 phase_sel → decode → MUX select', '案例 A 的 FF0.Q → INV → FF0.D', '案例 F 的 FF_b → buffer → DSM_REG.clk（generated clock）', '案例 F 的 FF_a → core logic → FF_b（divider 內部）'],
      answers: [0, 1, 3],
      explanation: 'interface path 的可用時間是 N·Tin（slack 935）；PMUX select 限制的是能安全切換的最小 Tvco；generated clock 只有 latency、沒有 capture。案例 A 的 Q → INV → D 與案例 F 的內部 path 都是 launch 與 capture 在同一個高速 clock、可用時間 1 Tin 的 reg-to-reg path——它們才限制 Fmax。',
    },
    {
      id: 'q7',
      type: 'single',
      prompt: '案例 E：PMUX 的 select 在 safe window 外切換，counter 的 clock 出現一個比正常窄的 pulse。這屬於哪一種 timing violation？修法是什麼？',
      options: ['setup violation；把 counter 的 next-state logic 做快', 'hold violation；在 select 路徑加 delay', 'pulse-width（runt）；把 select 的 launch edge 對到 window 起點或用 glitch-free MUX', 'recovery violation；把 reset 放開的時間往後移'],
      answer: 2,
      explanation: 'counter 的 D 沒有變，是 clock 本身被截短——pulse-width 問題。修 counter 沒有用；要 retime select 或用 glitch-free MUX（Lesson 5）。',
    },
    {
      id: 'q8',
      type: 'numeric',
      prompt: '案例 F：Tin = 125 ps、N = 8。FF_last → DSM_REG 這條 interface path（launch 與 capture 都由 div_out 觸發）的可用時間是多少 ps？',
      answer: 1000,
      unit: 'ps',
      explanation: '在 div_out domain 裡這是單一 cycle 的 path，可用時間 = N·Tin = 8 × 125 = 1000 ps。generated clock 的 source latency 對 launch 與 capture 一樣，互相抵銷。',
    },
    {
      id: 'q9',
      type: 'state',
      prompt: '案例 B 的 programmable divider，sel = 1（/6），從 reset（000）開始經過 4 個 rising edge 之後 state (q2 q1 q0) 是多少？',
      answer: '100',
      width: 3,
      bitNames: ['q2', 'q1', 'q0'],
      explanation: '000 → 001 → 010 → 011 → 100。sel = 1 時 terminal count 是 101，011 不會被清零，繼續遞增到 100。',
    },
  ],
  exercise: {
    title: '案例 B 換 decode：/5 與 /7',
    prompt: (
      <>
        <p>
          同一個 counter、同一個 MUX、同一個 CLR，只把兩個 decode 換掉：DEC5 偵測 100（q2 · q̄1 · q̄0），DEC7 偵測 110（q2 · q1 · q̄0）。DEC5 有兩個反相輸入，多一級 inverter，delay 從 14 變 18 ps；DEC7 仍是 14 ps。輸出改取 q2。
        </p>
        <p>
          先不要點 explorer：哪一個 mode 的 critical path 變慢？慢在哪一段？slack 與 Tclk,min 各變成多少？為什麼輸出不能繼續用 q1？然後再用模擬器與 explorer 驗證。
        </p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: ['sel = 0 與 sel = 1 各列出 state 序列與除數', '列出兩種 mode 各自被 sensitize 的 decode 路徑與 arrival time', '指出變慢的那一段與變慢的 ps 數', '算出兩種 mode 的 slack 與 Tclk,min', '說明為什麼 /7 時 q1 不能當 div_out'],
    answer: (
      <>
        <p>
          sel = 0：000 → 001 → 010 → 011 → 100 → 000，/5；q2 = 0, 0, 0, 0, 1，duty 1/5。sel = 1：000 → … → 110 → 000，/7；q2 = 0, 0, 0, 0, 1, 1, 1，duty 3/7。q1 在 /7 時是 0, 0, 1, 1, 0, 0, 1——一個週期內 rising 兩次（010 與 110），不是 /7。
        </p>
        <p>
          變慢的只有 /5 模式的 decode 段：tCQ 8 + <b>DEC5 18</b> + MUX 10 + CLR 10 = 46 ps（原本 42）。T = 60 時 slack 從 6 掉到 <b>2</b>，Tclk,min 從 54 變 <b>58</b> ps。/7 模式走 DEC7，仍是 42 ps、slack 6。INC 路徑兩種 mode 都是 40 ps，沒變。用 real delay 模擬可以看到 tc 在 terminal-count edge 後 36 ps（/5）與 32 ps（/7）出現，差 4 ps，正是 decode 的差。
        </p>
        <p>
          結論：critical path 會隨 mode 換人，而且改動一個 decode 只影響那個 mode。若要救回 /5 的 4 ps，可以把 DEC5 改用 NOR 型（q̄2 + q1 + q0 的反相）讓反相輸入變成非反相，或把 reset state 重新編碼讓 terminal count 沒有兩個 0。
        </p>
      </>
    ),
  },
}
export default lesson
