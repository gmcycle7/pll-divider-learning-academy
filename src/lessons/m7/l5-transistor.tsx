import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { div2 } from '@/models/divider/examples'
import { div2Schematic } from '@/lessons/m1/div2-schematic'
import { caseATiming } from './cases-timing'
import { CmlLatchFigure, LogicalEffortCalculator, RegenerationCalculator, SensitivityCurve, StackSizingWidget, TspcTimingDiagram } from './TransistorWidgets'

function Content() {
  return (
    <>
      <Section title="先用直覺想" en="Intuition">
        <p>
          前四課的 timing path 都是把幾個數字加起來：tCQ 8、inverter 6、setup 7。這些數字從哪裡來？每一個都是「把一個節點的電容充放電到某個電位要多久」：
        </p>
        <Math block>{'t \\approx \\frac{C\\,\\Delta V}{I} = R_{eq}\\,C'}</Math>
        <p className="small muted">
          <Math>{'C'}</Math> = 節點總電容（fF）；<Math>{'\\Delta V'}</Math> = 需要移動的電壓（V）；<Math>{'I'}</Math> = transistor 提供的電流（mA）；<Math>{'R_{eq}'}</Math> = transistor 的等效電阻（Ω）。1 fF × 1 kΩ = 1 ps。
        </p>
        <Callout kind="idea" title="兩個把手：電流與電容">
          想讓一個 gate 快，只有兩件事可做：<b>給更多電流</b>（transistor 加寬、少串聯、tail current 加大）或<b>減少電容</b>（fanout 小、寄生小、wire 短）。所有 transistor-level 的技巧——drive strength、logical effort、stack sizing、dynamic logic、CML——都是在這兩個把手上做文章。而且有一種 timing 根本不是「加法」：latch 的 regeneration 是指數的，這一課最後會講為什麼 STA 不能套到 CML divider。
        </Callout>
      </Section>

      <Section title="最簡單的電路：/2 的 8 ps 與 6 ps" en="The circuit: where 8 ps and 6 ps come from">
        <p>
          還是 Lesson 1-1 的 /2。切到 real delay，q0 在 edge 後 8 ps 改變、d0 在 14 ps 穩定。這一課的問題是：這個 8 與 6 是怎麼決定的？如果 inverter 要驅動三個 flop 而不是一個，6 會變幾？
        </p>
        <LogicDiagram schematic={div2Schematic} showValues={false} />
        <DividerSimPanel netlist={div2} schematic={div2Schematic} title="/2（real delay：tCQ 8 ps、INV 6 ps）" options={{ delayMode: 'real' }} showDelayMode showEquations={false} compact />
        <Steps
          items={[
            <>
              <b>edge k</b>：clock 到 FF0 的 master 關、slave 開；slave 的輸出要把 q0 節點（接著 inverter 的 gate 電容 + 輸出走線）充放電。這段是 tCQ = 8 ps。
            </>,
            <>
              <b>inverter</b>：q0 到了之後，inverter 的 NMOS 或 PMOS 把 d0 節點（FF0 的 D pin 電容 + inverter 自己的 drain 寄生）拉到另一端。6 ps。
            </>,
            <>
              <b>setup 7 ps</b>：D 到了之後，master latch 內部還要再把值推到「clock 關上也不會彈回」的程度——這也是一段充放電，而且是 latch 的 regeneration，下面會再回來看它。
            </>,
          ]}
        />
      </Section>

      <Section title="Drive strength、fanout 與 logical effort" en="Drive strength, fanout and logical effort">
        <p>
          最有用的 gate-level 模型是 <Term zh="邏輯努力" en="logical effort" />：把一個 gate 的 delay 拆成「自己的寄生」加上「驅動負載的努力」：
        </p>
        <Math block>{'d = \\tau\\,(p + g\\,h),\\qquad h = \\frac{C_{out}}{C_{in}}'}</Math>
        <p className="small muted">
          <Math>{'\\tau'}</Math> = 該製程一個無寄生、fanout 1 的 inverter delay（ps）；<Math>{'p'}</Math> = parasitic delay（gate 自己 drain 電容造成，以 τ 為單位）；<Math>{'g'}</Math> = logical effort（同樣輸出電流下，這種 gate 的輸入電容是 inverter 的幾倍）；<Math>{'h'}</Math> = electrical effort（fanout）= 輸出負載電容 / 自己輸入電容。
        </p>
        <LogicalEffortCalculator />
        <Steps
          items={[
            <>
              <b>τ = 8、h = 4</b>（一個 FO4 inverter）：INV = 8 × (1 + 4) = 40 ps。NAND2 = 8 × (2 + 4/3 × 4) = 58.7 ps。NOR2 = 8 × (2 + 5/3 × 4) = 69.3 ps。NAND3 = 8 × (3 + 5/3 × 4) = 77.3 ps。
            </>,
            <>
              <b>把 h 拉到 1</b>：effort delay 幾乎消失，剩下 parasitic p 主導。多輸入 gate 光是自己的 drain 電容就比 inverter 慢 2–3 倍。divider 的 feedback logic 常常就是這種 fanout 小、gate 數少的情況——所以 tCQ 與 parasitic 占了 arrival 的大半。
            </>,
            <>
              <b>把 h 拉到 12</b>：g 主導，NOR 被 NAND 甩開——effort delay 裡 g 的差異被 h 放大，多輸入 gate 在重負載下特別吃虧。
            </>,
            <>
              <b>小算一次</b>：把滑桿的 h 從 1 拉到 3（inverter 從驅動一個 flop 變成三個）。inverter 的 <Math>{'g = 1'}</Math>、<Math>{'p = 1'}</Math>，所以
              <Math block>{'\\frac{d_{new}}{d_{old}} = \\frac{p + g\\,h_{new}}{p + g\\,h_{old}} = \\frac{1 + 3}{1 + 1} = 2 \\quad\\Rightarrow\\quad 6\\ \\text{ps} \\to 12\\ \\text{ps}'}</Math>
              <span className="muted">
                注意 <Math>{'\\tau'}</Math> 在分子分母抵消了：比值只看 <Math>{'(p + gh)'}</Math>。所以「多驅動兩個 flop」讓這個 inverter 從 6 ps 變 12 ps——arrival 直接多 6 ps。
              </span>
            </>,
          ]}
        />
        <Callout kind="method" title="為什麼高速 divider 寧可用 NAND 也不用 NOR">
          NOR 的 pull-up 是 PMOS 串聯——PMOS 本來就弱（γ ≈ 2），串聯後每個都要加寬到 2n 倍，輸入電容跟著變大，g = 5/3（NOR2）對 4/3（NAND2）。同樣是 3 個輸入，NAND3 的 g = 5/3、NOR3 的 g = 7/3；decode 電路若非用 NOR 不可，通常拆成 NAND + INV 兩級反而更快。Lesson 7-3 的 DEC5（兩個反相輸入）就是這種情況。
        </Callout>
      </Section>

      <Section title="Series stack、parasitic 與 internal node" en="Series stack and internal nodes">
        <p>
          n 個 transistor 串聯，等效電阻是 n 倍；要維持同樣的電流，每一個都要加寬 n 倍，於是每個輸入看到 n 倍的 gate 電容——這是 g 隨 stack 深度上升的來源。拉動下面的 n：
        </p>
        <StackSizingWidget />
        <p>
          stack 還有兩個 gate-level 模型看不到的效應：
        </p>
        <ul>
          <li>
            <b>Internal node 的寄生</b>：串聯 transistor 之間的節點各自帶有 drain / source 電容。輸出要放電之前，這些內部節點要先放電（charge sharing）——這就是 p 隨 n 增加、而且<b>依輸入順序不同而不同</b>的原因：最靠近輸出的那個輸入最後到時最快（其他內部節點已經放完），最靠近 GND 的輸入最後到時最慢。
          </li>
          <li>
            <b>Body effect</b>：stack 上層 transistor 的 source 不在 GND，V<sub>SB</sub> &gt; 0 讓它的 threshold 升高、電流變小。3-stack 的最上層可能比單顆弱 20–30%。
          </li>
        </ul>
        <p className="small muted">
          divider 裡 stack 最深的地方通常是 decode（tc = q2 · q1 · q0）與 MUX（pass gate 串聯）。critical path 上的 gate，把「最晚到的那個訊號」接到最靠近輸出的輸入，是免費的 5–10% speed。
        </p>
      </Section>

      <Section title="Dynamic logic 與 TSPC：precharge / evaluate" en="Dynamic logic and TSPC">
        <p>
          static CMOS 每個輸入都要接 NMOS 與 PMOS 兩顆，PMOS 又大又慢。<Term zh="動態邏輯" en="dynamic logic" /> 把 PMOS 換成一顆 precharge transistor：clk = 0 時把內部節點 X 拉到 1（precharge），clk = 1 時 NMOS 網路決定要不要把 X 放電（evaluate）。輸入電容只剩 NMOS，快了將近一倍——代價是 <b>clock 的兩個相位都在工作</b>。
        </p>
        <TspcTimingDiagram />
        <Steps
          items={[
            <>
              <b>precharge 需要 t_low ≥ t_pre</b>：clock low 太窄，X 沒拉回 1，下一次 evaluate 從錯的起點開始。這是 pulse-width 問題（low 寬度）。
            </>,
            <>
              <b>evaluate 需要 t_high ≥ t_eval</b>：clock high 太窄，X 沒放到底，輸出級讀到半途的值。這也是 pulse-width 問題（high 寬度）。
            </>,
            <>
              <b>feedback 需要 t_low ≥ t_q + t_inv + t_su</b>：輸出在 falling edge 更新、d 反相回來，要在下一個 rising edge 前穩定。這才是加法模型能算的 setup path——但可用時間是 t_low，不是整個 T。
            </>,
            <>
              <b>把 duty 拉到 30% 或 70%</b>：先 fail 的是 pulse width，不是 setup。這就是 TSPC divider 對 clock duty 敏感的原因，也是它常常前面接一個 /2 把 duty 整成 50% 的原因。
            </>,
          ]}
        />
        <Callout kind="warning" title="dynamic logic 有最低頻率">
          evaluate 期間若 d = 0，X 是浮接的——靠自己的電容保持 1。leakage 與 charge sharing 會讓它慢慢掉；掉過輸出級的 threshold 就翻錯。所以 TSPC divider 有一個<b>最低</b>工作頻率（通常幾百 MHz），這在 static CMOS 裡不存在。測試時「把 clock 放慢看看」對 dynamic divider 不一定成立。
        </Callout>
      </Section>

      <Section title="CML divider：regeneration、swing 與 tail current" en="CML dividers: regeneration, swing and tail current">
        <p>
          最高速的 /2 不用 CMOS flop，用兩個 <Term zh="電流模式邏輯" en="current-mode logic, CML" /> latch 串成 master-slave。每個 latch：一對 track transistor 在 CK = 1 時把輸入差值送到輸出；一對 cross-coupled latch transistor 在 CK = 0 時把輸出差值<b>放大</b>到 full swing。關鍵是這個「放大」不是充放電到某個電位，而是正回授：
        </p>
        <Math block>{'\\Delta V(t) = \\Delta V_0\\,e^{t/\\tau},\\qquad \\tau = \\frac{C_L}{g_m},\\qquad t_{res} = \\tau\\,\\ln\\frac{V_{swing}}{\\Delta V_0}'}</Math>
        <p className="small muted">
          <Math>{'\\Delta V_0'}</Math> = latch 關上那一瞬間輸出的差值（mV）；<Math>{'g_m'}</Math> = cross-coupled pair 的 transconductance（mS）；<Math>{'C_L'}</Math> = 輸出節點電容（fF）；<Math>{'V_{swing}'}</Math> = 要達到的 full swing（mV）；<Math>{'t_{res}'}</Math> = 放大到 full swing 所需時間（ps）。1 fF / 1 mS = 1 ps。
        </p>
        <CmlLatchFigure />
        <Steps
          items={[
            <>
              <b>每個 latch 只有半個週期</b>可以 regenerate：T/2 ≥ t<sub>res</sub>。τ = 12 ps、ΔV₀ = 20 mV、swing 400 mV ⇒ t<sub>res</sub> = 12 × ln 20 = 36 ps ⇒ T ≥ 72 ps ⇒ f ≤ 13.9 GHz。
            </>,
            <>
              <b>ΔV₀ 從哪來</b>：track 期間輸入差值透過 track pair 送到輸出的量。輸入 swing 小、clock edge 附近輸入還沒分開、或 track 期間太短，ΔV₀ 就小；ln(V<sub>swing</sub>/ΔV₀) 變大，t<sub>res</sub> 變長。這是 analog 版的 setup window——連續的、對數的，不是一個固定的 7 ps。
            </>,
            <>
              <b>tail current</b>：g<sub>m</sub> ∝ √I<sub>SS</sub>（強反轉）；tail current 加倍，τ 只減 √2 倍，但功耗加倍。swing = I<sub>SS</sub> × R<sub>L</sub>：swing 要大（下一級的 ΔV₀ 才大），但 R<sub>L</sub> 大 τ 也大——所以高速 CML 用小 R<sub>L</sub>、大 I<sub>SS</sub>、小 swing（200–300 mV）。
            </>,
            <>
              <b>沒 regenerate 完會怎樣</b>：輸出只到 250 mV 而不是 400，下一級的 ΔV₀ 跟著變小、t<sub>res</sub> 更長、輸出更小……幾個週期後 divider 掉拍。這種失敗方式沒有任何一個 gate「來不及」——它是整個 loop 的增益不夠。
            </>,
          ]}
        />
        <p>
          從輸入端看，CML /2 的行為像一個 injection-locked oscillator：兩個 latch 首尾相接本身就是一個 ring，有自振頻率 f<sub>so</sub>；輸入 clock 把它拉到 f<sub>in</sub>/2。離 f<sub>so</sub> 越遠需要的輸入振幅越大：
        </p>
        <SensitivityCurve />
        <CompareTable
          head={['因素', '影響什麼', '為什麼', 'gate-level STA 有沒有這一項']}
          rows={[
            ['clock slope（edge 太慢）', 'ΔV₀ 變小、track / latch 交接期間兩對 transistor 同時半開', 'clock pair 切換不乾脆，tail current 分給兩邊，等效 gm 下降', '沒有（STA 只有 clock 的到達時間，沒有它的斜率）'],
            ['input swing 不足', 'ΔV₀ 變小 ⇒ t_res 變長', 'track pair 是差動放大器，輸入差值小輸出差值就小', '沒有（STA 假設輸入是滿幅的 0 / 1）'],
            ['common-mode 偏移', 'track pair 或 clock pair 進入 triode，gm 崩掉', 'CML 每一級的輸出 CM = VDD − I·R/2，前一級的 R 或 I 偏了，下一級就偏', '沒有'],
            ['PVT', 'τ 隨溫度 / 製程變 ±30%，swing 隨 R_L 變', 'gm、C、R 都是製程參數', '有（corner library），但只對 CMOS gate'],
            ['mismatch', 'latch pair 的 offset 吃掉 ΔV₀', 'ΔV₀,eff = ΔV₀ − V_os；offset 20 mV 時 20 mV 的 ΔV₀ 直接歸零', '沒有'],
          ]}
        />
      </Section>

      <Section title="四種「變慢 / 失敗」的模型" en="Four failure models">
        <p>
          到這裡可以把整個 Module 7 的 timing 分成四類。它們用的數學不同、失敗的方式不同、修法也不同：
        </p>
        <CompareTable
          head={['', '模型', '數學', '失敗長什麼樣', '修法', '工具']}
          rows={[
            ['gate-level STA', 'tCQ + Σ logic + setup ≤ T', '加法（線性）', 'slack 為負；抓到舊值', '縮短 path、拉長 T、pipeline', 'STA（PrimeTime 類）'],
            ['transistor regeneration', 'ΔV(t) = ΔV₀ e^{t/τ}', '指數（gm / C）', '輸出 swing 逐週期縮小、掉拍', '加 gm（tail current）、減 C、加 swing', 'transient / PSS 模擬'],
            ['analog metastability', '落在 window 內 resolve 時間服從 e^{−t/τ}', '機率（MTBF）', '偶發、無法重現、與資料相位有關', 'synchronizer 級數、避開 window', '模擬 + 統計'],
            ['clock amplitude / slew induced', 'ΔV₀(slew, swing, CM)', '半經驗（sensitivity curve）', '某個頻率 / 振幅組合下不鎖、自振', '重做 clock buffer、AC coupling + bias、加 swing', 'sensitivity 掃描'],
          ]}
        />
        <Callout kind="pitfall" title="不能把 STA 套到所有 analog divider">
          CML /2 沒有 tCQ、沒有 tsetup、沒有 gate delay 可以加。它的「Fmax」是 T/2 ≥ τ ln(V<sub>swing</sub>/ΔV₀) 加上 track 期間的 settling，而 ΔV₀ 又取決於輸入振幅、clock slope、共模、offset。你可以為它寫一個等效的 .lib（很多 flow 這樣做，給 chip-level STA 看），但那只是把「在某個振幅、某個 slope 下量到的數字」包裝成 tCQ + tsetup——換一個 clock buffer 就不準了。真正的驗證是 transient 模擬掃振幅與頻率，畫出 sensitivity curve。
        </Callout>
      </Section>

      <Section title="回頭看 /2 的 critical path" en="Back to the /2 critical path">
        <p>
          用 explorer 再看一次案例 A。這次不看 slack，看每一段數字背後的 transistor：
        </p>
        <CriticalPathExplorer scenario={caseATiming} showEnvControls={false} compact />
        <ul>
          <li>
            <b>tCQ 8 ps</b>：slave latch 驅動 q0 節點 = inverter 的 g × C<sub>in,inv</sub> + wire。inverter 若加寬（提高 drive strength）以驅動更多負載，tCQ 反而變長——因為 q0 的負載變大了。
          </li>
          <li>
            <b>INV 6 ps</b>：τ (p + g h)，h = FF0 D pin 電容 / inverter 輸入電容。用 flop 的 Q̄ 直接接 D 可以把這段拿掉，但 hold 只剩 tCQ,min。
          </li>
          <li>
            <b>setup 7 ps</b>：master latch 的 regeneration——D 到了之後 master 要把差值放大到 clock 關上也不會彈回。這其實就是 τ ln(V<sub>swing</sub>/ΔV₀) 的 CMOS 版；library 把它量成一個固定數字，前提是 D 是滿幅、乾淨的 0 / 1。
          </li>
          <li>
            <b>jitter、margin</b>：clock buffer 的 slew 越慢，供電雜訊轉成 timing jitter 的比例越高（ΔT = ΔV / slew）。這一項也是 transistor-level 的。
          </li>
        </ul>
        <Math block>{'T_{clk,min} = \\underbrace{t_{CQ} + t_{INV}}_{\\text{加法：}\\tau(p+gh)} + \\underbrace{t_{setup}}_{\\text{其實是 }\\tau_{latch}\\ln(\\cdot)} + t_{jitter} + t_{margin}'}</Math>
        <ModeContent level="engineer" title=".lib 裡的數字是怎麼來的">
          <p>
            standard cell 的 tCQ、setup、hold、min pulse width 都是 characterization 用 SPICE 掃出來的：tCQ 是 input slew × output load 的二維表（NLDM）或波形（CCS）；setup 是「D 相對 clock 提早多少時 tCQ 惡化 10%」的那個點——所以 setup 本身就是一個 regeneration 的截斷值。STA 之所以能用加法，是因為每個 cell 的輸入都被假設是滿幅的 rail-to-rail 訊號；一旦訊號是小 swing（CML）、或 clock 是正弦波，這個假設就破了。
          </p>
          <CodeBlock
            lang="text"
            title="NLDM 節錄（示意）"
            code={`
cell_rise(delay_template_5x5) {
  index_1 ("0.01, 0.03, 0.06, 0.12, 0.24");   /* input slew (ns) */
  index_2 ("0.001, 0.004, 0.008, 0.016, 0.032"); /* output load (pF) */
  values ("0.008, 0.010, 0.013, 0.019, 0.031", ...);
}
timing_type : setup_rising;   /* D → CK：constraint 表，同樣 slew × slew */
`}
            note="tCQ 隨 output load 線性上升（h 變大）、隨 input slew 上升（clock edge 慢 ⇒ 切換點晚）。setup 隨 D 的 slew 上升。"
          />
        </ModeContent>
        <ModeContent level="deep" title="高速實作會遇到的事">
          <ul>
            <li>
              <b>CML /2 的 self-oscillation</b>：兩個 latch 串成 ring，沒有輸入時會在 f<sub>so</sub> 自振。輸入頻率在 2f<sub>so</sub> 附近時幾乎不需要振幅（injection locking 最容易）；設計時把 f<sub>so</sub> 放在目標頻率的一半附近，但要留 PVT 餘裕——f<sub>so</sub> 隨 τ 變 ±30%。
            </li>
            <li>
              <b>offset 的影響是非線性的</b>：ΔV₀,eff = ΔV₀ − V<sub>os</sub>。ΔV₀ = 40 mV、V<sub>os</sub> = 10 mV 只多花 τ ln(4/3) = 0.29τ；ΔV₀ = 15 mV 時就多花 τ ln 3 = 1.1τ。所以 CML latch 的 transistor 不能為了速度縮到最小——mismatch 會吃掉 regeneration 的起點。
            </li>
            <li>
              <b>clock slope 與 tail current 的交接</b>：CK / CK̄ 交叉時兩對 clock transistor 都半開，tail current 分流，track 與 latch 同時進行——這段時間輸出既不 track 也不 regenerate。clock swing 只有 200 mV、slope 30 ps 時，這段可能占掉 T/2 的三分之一。
            </li>
            <li>
              <b>TSPC 的 clock 負載</b>：dynamic stage 每個都有 clock transistor，clock 的 fanout 大、slew 慢。慢 slew 讓 precharge / evaluate 的邊界模糊，等效 pulse width 縮小。TSPC divider 的 Fmax 很大一部分是 clock buffer 決定的。
            </li>
            <li>
              <b>PVT 下的 sensitivity curve</b>：slow corner 時 τ 變大、曲線整體往低頻移；fast corner 時 f<sub>so</sub> 升高，低頻端的 lock range 反而變差（latch 太想自振）。兩個 corner 都要掃。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>用 gate 數量估 delay</b>：一個 NOR3（g = 7/3、p = 3）比兩個 inverter 慢。要看 g、p、h，不是看幾個 gate。
            </li>
            <li>
              <b>把 transistor 加寬就以為會變快</b>：加寬提高電流，也提高前一級的負載（h）與自己的 parasitic（p）。只有在 h 大的時候加寬才有幫助；critical path 上 fanout 小的 gate，加寬反而變慢。
            </li>
            <li>
              <b>把 STA 的 tCQ + tsetup 套到 CML</b>：CML latch 沒有這兩個數字，它有 τ 與 ΔV₀。用 .lib 包裝的數字只在特定振幅與 slope 下有效。
            </li>
            <li>
              <b>忘記 dynamic logic 有最低頻率</b>：TSPC divider 在低頻會因為 leakage 掉值；「放慢 clock 看看」對它不成立。
            </li>
            <li>
              <b>把 duty 問題當 setup 問題</b>：TSPC 與 CML 的 Fmax 都受 clock 的兩個相位各自限制，duty 偏離 50% 時先撞到的是 pulse width（或 T/2 ≥ t<sub>res</sub>），不是 setup。
            </li>
          </ul>
        </Callout>
      </Section>
    </>
  )
}

function ExerciseComponent() {
  return <RegenerationCalculator />
}

const lesson: LessonDef = {
  id: 'm7-l5-transistor',
  module: 7,
  order: 5,
  title: 'Critical Path 與 Transistor-Level Speed',
  titleEn: 'Critical path at the transistor level',
  summary: 'tCQ、gate delay、setup 從哪裡來：drive strength、series stack、fanout（logical effort）、parasitic、dynamic logic 的 precharge / evaluate、CML latch 的 regeneration。分清 gate-level STA 的加法模型與 transistor regeneration 的指數模型，知道為什麼 STA 不能套到所有 analog divider。',
  goals: [
    '用 delay = τ(p + g·h) 算出 INV / NAND2 / NOR2 / NAND3 在不同 fanout 下的 delay，並解釋為什麼 NOR 慢。',
    '知道 series stack 為什麼要加寬、internal node 與 body effect 怎麼拖慢它。',
    '看懂 TSPC 的三個限制（precharge、evaluate、feedback）各是 pulse width 還是 setup，以及 dynamic logic 為什麼有最低頻率。',
    '用 τ = C/gm 與 t_res = τ ln(V_swing/ΔV₀) 算 CML latch 的 regeneration 時間與 /2 的 Fmax，並說出 clock slope、input swing、common-mode、PVT、mismatch 各影響哪一項。',
    '區分四種模型：gate-level STA（加法）、transistor regeneration（指數）、analog metastability（機率）、clock amplitude / slew induced failure。',
  ],
  readingMinutes: 40,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'numeric',
      prompt: 'τ = 8 ps、fanout h = 4。用 logical effort（NAND2：g = 4/3、p = 2）算 NAND2 的 delay（ps，取到小數一位）。',
      answer: 58.7,
      tolerance: 0.5,
      unit: 'ps',
      explanation: 'd = τ(p + g·h) = 8 × (2 + 4/3 × 4) = 8 × 7.33 = 58.7 ps。同條件 INV = 40、NOR2 = 69.3、NAND3 = 77.3 ps。',
    },
    {
      id: 'q2',
      type: 'single',
      prompt: '為什麼同樣兩個輸入，NOR2 的 logical effort（5/3）比 NAND2（4/3）大？',
      options: ['NOR 的輸出電容比較大', 'NOR 的 pull-up 是 PMOS 串聯，PMOS 本來就弱，串聯後每顆都要加寬 2γ 倍，輸入電容變大', 'NOR 需要額外的 inverter', 'NOR 的 parasitic delay 比較小，所以 g 要補償'],
      answer: 1,
      explanation: 'NAND 串聯的是 NMOS（強），加寬 2 倍；NOR 串聯的是 PMOS（弱，γ ≈ 2），加寬 2γ = 4 倍。輸入電容 NAND2 = 2 + 2 = 4、NOR2 = 1 + 4 = 5，除以 inverter 的 3 就是 4/3 與 5/3。',
    },
    {
      id: 'q3',
      type: 'numeric',
      prompt: 'CML latch 的 cross-coupled pair gm = 6 mS，輸出節點電容 C_L = 60 fF。regeneration time constant τ 是多少 ps？',
      answer: 10,
      unit: 'ps',
      explanation: 'τ = C_L / gm = 60 fF / 6 mS = 10 ps（1 fF / 1 mS = 1 ps）。',
    },
    {
      id: 'q4',
      type: 'numeric',
      prompt: '接上題（τ = 10 ps），latch 關上時輸出差值 ΔV₀ = 25 mV，要放大到 V_swing = 400 mV。t_res 是多少 ps？（取到小數一位）',
      answer: 27.7,
      tolerance: 0.3,
      unit: 'ps',
      explanation: 't_res = τ ln(400 / 25) = 10 × ln 16 = 10 × 2.77 = 27.7 ps。每個 latch 只有半個週期 ⇒ T ≥ 55.5 ps ⇒ f ≤ 18 GHz（只算 regeneration）。',
    },
    {
      id: 'q5',
      type: 'multiple',
      prompt: 'TSPC / dynamic stage 的三個 timing 限制中，哪些屬於 pulse-width 類型（而不是 setup）？',
      options: ['t_low ≥ t_pre（precharge 要完成）', 't_high ≥ t_eval（evaluate 要完成）', 't_low ≥ t_q + t_inv + t_su（feedback 的 d 要在下一個 rising 前穩定）', '最低工作頻率（leakage 讓浮接節點掉值）'],
      answers: [0, 1],
      explanation: 'precharge 與 evaluate 各自要求 clock 的一個相位夠寬，是 pulse-width 限制。feedback 那條是資料相對 edge 的到達時間，是 setup（可用時間 t_low）。最低頻率是 dynamic node 的 charge retention 問題，三者皆非。',
    },
    {
      id: 'q6',
      type: 'single',
      prompt: 'CML /2 divider 的最高工作頻率主要由什麼決定？',
      options: ['兩個 latch 的 tCQ 加起來', 'latch 的 regeneration time constant τ = C_L / gm，以及輸入能提供的 ΔV₀', 'inverter 的 logical effort', 'clock 走線的 RC delay'],
      answer: 1,
      explanation: 'CML latch 沒有 tCQ / tsetup；每個 latch 要在半個週期內把 ΔV₀ 放大到 full swing，T/2 ≥ τ ln(V_swing/ΔV₀)。τ 由 gm 與 C 決定，ΔV₀ 由輸入振幅、clock slope、共模與 offset 決定。',
    },
    {
      id: 'q7',
      type: 'multiple',
      prompt: '下列哪些效應是 gate-level STA（加法模型）「沒有」的？',
      options: ['clock edge 的斜率影響 latch 的 ΔV₀', 'input swing 不足讓 regeneration 變慢', 'output load 變大讓 tCQ 變長', 'latch pair 的 offset 吃掉 ΔV₀', 'PVT corner 讓 gate delay 變 ±30%'],
      answers: [0, 1, 3],
      explanation: 'STA 有 output load（NLDM 表的一維）與 PVT corner library；它沒有 clock slew 對 regeneration 的影響（只有到達時間）、沒有小 swing 輸入、沒有 offset。這三項都需要 transistor-level 模擬。',
    },
    {
      id: 'q8',
      type: 'single',
      prompt: '一個 TSPC divider 在 3 GHz 正常，把 clock 放慢到 100 MHz 反而出錯。最可能的原因是？',
      options: ['setup violation', 'hold violation', 'dynamic node 在 evaluate 期間浮接，leakage 讓它掉過 threshold（最低頻率限制）', 'clock pulse 太窄'],
      answer: 2,
      explanation: '放慢 clock 讓 setup 更寬鬆、pulse 更寬，hold 與頻率無關。只有 dynamic logic 的 charge retention 會在低頻失效——evaluate 期間長達 5 ns，浮接的 X 節點靠 leakage 就掉下來了。',
    },
  ],
  exercise: {
    title: '給 gm 與 C，算 τ 與 resolve 時間',
    prompt: (
      <>
        <p>
          一個 CML latch：cross-coupled pair 每顆 gm = 6 mS（差動等效也取 6 mS），輸出節點總電容 C_L = 60 fF，目標 swing 400 mV。track 期間結束時輸出差值 ΔV₀ = 25 mV。
        </p>
        <p>
          先用手算：τ 是多少？t_res 是多少？若兩個 latch 串成 /2、每個只有半個週期可以 regenerate，最高輸入頻率是多少？然後改變條件：(a) tail current 加倍讓 gm 變 6√2 ≈ 8.5 mS；(b) 輸入振幅減半讓 ΔV₀ 變 12.5 mV；(c) latch pair 有 10 mV offset（ΔV₀,eff = 15 mV）。哪一個改變影響最大？用下面的計算機驗證。
        </p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: ['算出 τ = C_L / gm', '算出 t_res = τ ln(V_swing / ΔV₀)', '算出 T ≥ 2 t_res 對應的 Fmax', '分別算 (a) (b) (c) 三種改變後的 t_res', '說明為什麼 STA 的 tCQ + tsetup 沒有辦法表達這些改變'],
    answer: (
      <>
        <p>
          τ = 60 fF / 6 mS = <b>10 ps</b>。t_res = 10 × ln(400 / 25) = 10 × 2.77 = <b>27.7 ps</b>。T ≥ 2 × 27.7 = 55.5 ps ⇒ <b>f ≤ 18.0 GHz</b>（只算 regeneration，未含 track 期間的 settling 與 clock 交接）。
        </p>
        <p>
          (a) gm = 8.5 mS ⇒ τ = 7.07 ps ⇒ t_res = 19.6 ps ⇒ 25.5 GHz：功耗加倍只換到 √2 倍的速度。(b) ΔV₀ = 12.5 mV ⇒ t_res = 10 × ln 32 = 34.7 ps ⇒ 14.4 GHz：振幅減半只多花 τ ln 2 = 6.9 ps，因為是對數。(c) ΔV₀,eff = 15 mV ⇒ t_res = 10 × ln 26.7 = 32.8 ps ⇒ 15.2 GHz。
        </p>
        <p>
          影響最大的是 (a)——但代價也最大。(b) 與 (c) 的影響都在對數裡，所以 CML 對輸入振幅相對不敏感，直到 ΔV₀ 接近 offset 才急速惡化（ΔV₀ = 10 mV 時 t_res 已經是 36.9 ps，若 offset 也是 10 mV 則 ΔV₀,eff = 0，永遠 resolve 不了）。STA 的 tCQ + tsetup 是兩個固定數字，沒有 gm、沒有 ΔV₀、沒有 offset——這三種改變它一個都看不見。
        </p>
      </>
    ),
  },
}
export default lesson
