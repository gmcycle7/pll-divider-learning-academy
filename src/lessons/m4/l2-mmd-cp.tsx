import type { LessonDef } from '@/lessons/types'
import { Callout, CodeBlock, CompareTable, Math, ModeContent, Section, Steps, Tabs, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { CriticalPathExplorer } from '@/components/timing/CriticalPathExplorer'
import { LogicDiagram } from '@/components/circuit/LogicDiagram'
import { analyzeSetup } from '@/models/timing/sta'
import { TIMING as K, mmd2P0First } from './models'
import { hlF1Clock, hlHoldA0And, hlPath1Local, hlPath2ModOut, hlPath3Control, hlPath4Output, hlPath5Reset, mmd2P0FirstSchematic, mmd2Schematic } from './schematics'
import { mmd2P0FirstTiming, mmd2Timing, mmd3ModChainPath } from './timing'
import { CriticalPathHighlighter, F1PulseWidthDemo, ModOut2DeadlineDemo, SwitchP0Table } from './Widgets'

// 這一課用的數字（ps）：與 timing.ts / models.ts 的 TIMING 一致
const REQ = K.T - K.setup - K.jitter - K.margin // 87
const ARR1 = K.tcq + K.nor // 20
const ARR2 = K.tcq + K.nor + K.tcq + K.nor + K.and + K.and // 60
/** 三級版 modulus-out 鏈：直接用 timing.ts 的 path 資料算（arrival 90、slack −3） */
const MMD3_CHAIN = analyzeSetup(mmd3ModChainPath, mmd2Timing.env)
const ARR2_MMD3 = MMD3_CHAIN.arrival // 90
const TMIN1 = ARR1 + K.setup + K.jitter + K.margin // 33
const TMIN2 = ARR2 + K.setup + K.jitter + K.margin // 73
const TMIN6 = K.norAsym + K.minPulse + K.jitter + K.margin // 40
const LAT4 = K.tcq + K.nor + K.tcq + K.nor + K.wire // 43

function Content() {
  return (
    <>
      <Section title="先用直覺想" en="Intuition">
        <p>
          Lesson 1-1 的 /2 只有一條路徑：Q → INV → D。Lesson 3-2 的 /2 /3 cell 多了 mod 這個 control input。到了 MMD，事情突然變多：兩個 clock（clk 與由 state 算出來的 f1）、一條從後級繞回前級的長回授、兩個 control bit、一個共用的 reset，還有一個只有一個 T 寬的 generated clock pulse。
        </p>
        <p>
          不要被線的數量嚇到。每一條 timing path 都在問同一個問題：<b>誰在哪一個 edge 把資料送出（launch）？誰在哪一個 edge 把它抓住（capture）？中間有多少時間？</b>只是 MMD 裡這個問題有六種不同的答案。這一課把六種都拆開，最後用一張圖同時把「最差 setup、最差 hold、async / control」三組畫在一起。
        </p>
        <Callout kind="idea">
          <Term zh="臨界路徑" en="critical path" /> 不是「最長的那條線」。它是所有<b>有 launch 又有 capture、而且會被 sensitize</b> 的路徑裡，slack 最小的那一條。同一個電路，換一個 mode（p1p0），critical path 可能換成另一條。
        </Callout>
      </Section>

      <Section title="六類路徑一覽" en="The six kinds of paths">
        <p>先看全圖，再逐一放大。六類路徑各自的 launch、capture、檢查種類與它限制的東西：</p>
        <CompareTable
          head={['#', '路徑', 'launch（edge）', 'capture（edge）', '檢查種類', '限制什麼']}
          rows={[
            ['①', 'local：C1.FF0.Q → NOR1 → C1.FF0.D', 'C1.FF0，clk↑ (k)', 'C1.FF0，clk↑ (k+1)', 'setup（max）+ hold（min）', 'Fmax（每個 mode 都在）'],
            ['②', 'downstream modulus-out → upstream MOD：C2.FF0 → NOR2 → AND_P0 → AND_A1 → C1.FF1.D', 'C2.FF0，f1↑（clk edge k 之後 20 ps）', 'C1.FF1，clk↑ (k+1)；功能上是 a = 01 的 edge (k+2)', 'setup（跨兩級、跨 clock）', 'Fmax（p0 = 1）與 divide sequence 是否正確'],
            ['③', 'MOD decode → D：p0 → AND_P0 → AND_A1 → C1.FF1.D；p1 → AND_B1 → C2.FF1.D', 'controller flop', 'C1.FF1（a = 01 且 mod_out2 = 1 的 clk↑）；C2.FF1（b0 = 1 的 f1↑）', 'setup / hold，但只在換除數時', 'mode switching 的 deadline，不是 Fmax'],
            ['④', 'output decode：C2.FF0 → NOR2 → div_out', 'C2.FF0，f1↑', '（沒有 capture flop）', '不是 setup check', 'output latency 與輸出 jitter'],
            ['⑤', 'reset / initialization：rst_n → 四個 flop 的 rstn', 'rst_n 釋放', 'C1.FF0/FF1（clk↑）；C2.FF0/FF1（f1↑）', 'recovery（像 setup）/ removal（像 hold）', 'reset 釋放後第一個 edge 是否可靠'],
            ['⑥', 'minimum pulse width：f1 的 high pulse', 'a → 00 的 clk↑（f1↑）', '下一個 clk↑（f1↓）', 'pulse width：檢查 clock 的形狀', '極高速時的 Fmax（generated clock 只有 1T 寬）'],
          ]}
        />
        <Tabs
          tabs={[
            { label: '① local', content: <LogicDiagram schematic={mmd2Schematic} highlights={[hlPath1Local]} showValues={false} caption="① C1.FF0.Q → NOR1 → C1.FF0.D：launch 與 capture 是同一個 flop、相鄰兩個 clk edge。" /> },
            { label: '② mod-out → MOD', content: <LogicDiagram schematic={mmd2Schematic} highlights={[hlPath2ModOut]} showValues={false} caption="② launch 在 cell 2（f1↑），capture 在 cell 1（clk↑）：跨兩級、跨 clock。" /> },
            { label: '③ MOD decode', content: <LogicDiagram schematic={mmd2Schematic} highlights={[hlPath3Control]} showValues={false} caption="③ p0 → AND_P0 → AND_A1 → C1.FF1.D：只在 a = 01 且 mod_out2 = 1 的那個 edge 有意義。" /> },
            { label: '④ output decode', content: <LogicDiagram schematic={mmd2Schematic} highlights={[hlPath4Output]} showValues={false} caption="④ NOR2 → div_out：沒有 capture flop，是 latency 不是 setup。" /> },
            { label: '⑤ reset', content: <LogicDiagram schematic={mmd2Schematic} highlights={[hlPath5Reset]} showValues={false} caption="⑤ rst_n 到四個 flop：recovery / removal，cell 2 的 clock 是 f1。" /> },
            { label: '⑥ f1 pulse', content: <LogicDiagram schematic={mmd2Schematic} highlights={[hlF1Clock]} showValues={false} caption="⑥ f1 是 generated clock：圖上最長的線，但它是 clock，不是 data path；要檢查的是它的 pulse 寬度。" /> },
          ]}
        />
        <p className="small muted">這一課全部用同一組數字（ps）：T = {K.T}、tCQ = {K.tcq}（min {K.tcqMin}）、NOR = {K.nor}（min {K.norMin}）、AND = {K.and}（min {K.andMin}）、tsetup = {K.setup}、thold = {K.hold}、jitter = {K.jitter}、margin = {K.margin}、skew = 0。</p>
      </Section>

      <Section title="① Local path：每個 cell 自己的回授" en="Path 1: local Q → comb → D">
        <p>
          和 Lesson 3-2 完全一樣：a0 在 edge k 的 clk↑ 送出，經 NOR1 算出 da0，必須在 edge k+1 之前 tsetup 就穩定。先自己算：available time 是多少？arrival？required？slack？
        </p>
        <Steps
          items={[
            <>
              <b>Launch</b>：C1.FF0，clk edge k。arrival 從 0 開始加：tCQ = {K.tcq}。
            </>,
            <>
              <b>Logic</b>：NOR1，{K.nor} ps。arrival = {ARR1} ps。
            </>,
            <>
              <b>Capture</b>：還是 C1.FF0，clk edge k+1，距離 launch 一個 T = {K.T} ps。required = T − tsetup − jitter − margin = {K.T} − {K.setup} − {K.jitter} − {K.margin} = {REQ} ps。
            </>,
            <>
              <b>Slack</b> = {REQ} − {ARR1} = <b>{REQ - ARR1} ps</b>。單獨看這條，Tclk,min = {ARR1} + {K.setup} + {K.jitter} + {K.margin} = {TMIN1} ps。
            </>,
            <>
              <b>Hold</b>（同一個 edge）：min delay = tCQ,min + NOR,min = {K.tcqMin} + {K.norMin} = {K.tcqMin + K.norMin} ps ≥ thold {K.hold} ps，safe。cell 1 還有一條 a0 → AND_A1 → C1.FF1.D，min delay 只有 {K.tcqMin} + {K.andMin} = {K.tcqMin + K.andMin} ps——它是 cell 1 的 <b>hold critical path</b>（雖然 setup 完全不緊）。
            </>,
          ]}
        />
        <p>
          cell 2 的 local path（b0 → NOR2 → db0）長得一模一樣，但它的 clock 是 f1。相鄰兩個 f1↑ 最短相隔 2T（cell 1 走 /2 時），所以它的 available time 是 2T = {2 * K.T} ps，slack 多一整個 T。<b>級數越後面，local path 越寬鬆</b>——這是 cascade 架構省電的來源，也是為什麼只有第一級需要最快的 flop。
        </p>
        <CriticalPathExplorer scenario={mmd2Timing} initialPath="p1-a0-nor-da0" guided showEnvControls={false} compact />
      </Section>

      <Section title="② Downstream modulus-out → upstream MOD：跨兩級的路徑" en="Path 2: modulus-out back to the upstream cell">
        <p>
          這是 MMD 特有、也最容易被算錯的一條。把它一段一段寫出來，從 clk edge k（a 回到 00 的那個 edge）開始計時：
        </p>
        <Steps
          items={[
            <>
              <b>clk↑（edge k）→ a0 / a1</b>：tCQ = {K.tcq} ps。a 由 01 或 10 變成 00。
            </>,
            <>
              <b>NOR1 → f1↑</b>：{K.nor} ps。累計 {K.tcq + K.nor} ps。這 20 ps 是 f1 這個 generated clock 的 <Term zh="時脈來源延遲" en="clock source latency" />：cell 2 的 edge 比 clk edge 晚 20 ps 才到。
            </>,
            <>
              <b>f1↑ → b0</b>：C2.FF0 的 tCQ = {K.tcq} ps。累計 {K.tcq * 2 + K.nor} ps。這裡才是 path ② 真正的 <b>launch point</b>：C2.FF0，被 f1↑ 觸發。
            </>,
            <>
              <b>NOR2 → mod_out2</b>：{K.nor} ps。累計 {K.tcq * 2 + K.nor * 2} ps。mod_out2 沿長線回到 cell 1。
            </>,
            <>
              <b>AND_P0 → mod1_eff</b>：{K.and} ps。累計 {K.tcq * 2 + K.nor * 2 + K.and} ps。
            </>,
            <>
              <b>AND_A1 → da1</b>：{K.and} ps。<b>arrival = {ARR2} ps</b>，到達 C1.FF1 的 D。
            </>,
            <>
              <b>Capture</b>：C1.FF1，clk↑。STA 預設用 launch 之後的<b>第一個</b> capture edge，也就是 edge k+1（t = {K.T}）。required = {REQ} ps ⇒ <b>slack = {REQ} − {ARR2} = {REQ - ARR2} ps</b>；Tclk,min = {ARR2} + {K.setup} + {K.jitter} + {K.margin} = <b>{TMIN2} ps</b>。
            </>,
          ]}
        />
        <Math block>{`t_{arr,2} = t_{CQ} + t_{NOR1} + t_{CQ} + t_{NOR2} + t_{AND,P0} + t_{AND,A1} = ${K.tcq} + ${K.nor} + ${K.tcq} + ${K.nor} + ${K.and} + ${K.and} = ${ARR2}\\ \\text{ps}`}</Math>
        <Math block>{`T_{clk,min,2} = t_{arr,2} + t_{setup} + t_{jitter} + t_{margin} = ${ARR2} + ${K.setup} + ${K.jitter} + ${K.margin} = ${TMIN2}\\ \\text{ps}`}</Math>
        <p>
          變數：<Math>{'t_{CQ}'}</Math> 各 flop 的 clock-to-Q（ps）；<Math>{'t_{NOR}, t_{AND}'}</Math> gate 的最大傳播延遲（ps）；<Math>{'t_{setup}'}</Math> capture flop 的建立時間；<Math>{'t_{jitter}'}</Math> 相鄰 clk edge 間隔的不確定量；<Math>{'t_{margin}'}</Math> 設計裕度。skew 這裡取 0，因為 launch 與 capture 的 clock 來源都是同一條 clk（f1 的 20 ps latency 已經算在 data 的 arrival 裡）。
        </p>
        <p>
          比較：local path 的 Tclk,min 只有 {TMIN1} ps，path ② 是 {TMIN2} ps。<b>p0 = 1 時 path ② 才是 Fmax 的 critical path</b>，而且它每多一級就多一個 tCQ + NOR + AND（三級版 arrival = {ARR2_MMD3} ps，已經超過 required {MMD3_CHAIN.required} ps，slack {MMD3_CHAIN.slack} ps）。p0 = 0 時 AND_P0 把這條線鎖死，mod_out2 的變化傳不到 da1，STA 的 case analysis 會把它剪掉，critical path 退回 path ①。
        </p>
        <Callout kind="method" title="用 simulate 看 da1 真正在哪一個 edge 被用到">
          STA 說 capture 在 edge k+1，但 AND_A1 的另一個輸入是 a0。edge k 之後 a = 00（a0 = 0），edge k+1 之後 a 才變 01。所以 da1 = a0 · mod1_eff 要到 <b>edge k+2</b>（a = 01 的那個 edge）才會是 1、才會被 C1.FF1 抓成有意義的值。下面用 real-delay 模擬證明：每次 f1↑（edge k）之後 mod_out2 在 k·T + 40 ps 改變，而 cell 1 在 edge k+2 才依它決定 /2 或 /3。把 AND_P0 的延遲拉長，看功能什麼時候才真的壞。
        </Callout>
        <ModOut2DeadlineDemo />
        <p>
          三個階段的結果（models.test.ts 全部用 simulate 驗證）：
        </p>
        <ul>
          <li>
            <b>arrival ≤ 200 ps（2T）</b>：state 序列、duty、N 全對，雖然 arrival 150 ps 時單週期 STA 已報 slack −63。這是 <Term zh="多週期路徑" en="multicycle path" /> 的候選：功能上的 deadline 是 a = 01 的 edge，多了一整個 T。
          </li>
          <li>
            <b>arrival 210–225 ps（&gt; 2T）</b>：da1 在 a = 01 的 edge 還是舊值，cell 1 在錯的 f1 週期走 /3——主循環變成 0001 → 0100 → 0101 → 0110 → 0000，duty 由 3/5 變 2/5，output edge 整個搬位。<b>平均 N 仍是 5</b>：這是 divide sequence 錯誤，不是 N 錯誤，量平均頻率看不出來。
          </li>
          <li>
            <b>arrival 260 ps</b>：mod_out2 那個 2T 寬的 pulse 比 AND_P0 的延遲還短，被 inertial delay 吞掉，cell 1 再也收不到請求：N 掉成 4 / 6。
          </li>
        </ul>
        <ModeContent level="engineer" title="要不要宣告 multicycle？">
          <p>
            可以宣告 <span className="mono">set_multicycle_path 2</span>，但必須附上 sequential 的證明：「f1↑ 只發生在 a → 00 的 edge，而 a0 要到下一個 edge 才變 1」。這個性質綁在 cell 1 的 state encoding 上；只要有人把 cell 1 改成別的 encoding（例如 f1 在 a = 11 產生），證明就失效。hold 也要跟著改：multicycle setup 2 之後 hold 的 capture edge 預設變成 edge k+1，要用 <span className="mono">set_multicycle_path 1 -hold</span> 拉回 edge k，否則 STA 會要求 min delay ≥ 1T。保守做法是照單週期設計（Tclk,min = {TMIN2} ps），把多出來的 1T 當成 PVT 與 aging 的隱性裕度。
          </p>
          <p>
            對於 hold：path ② 的 min delay = {K.tcqMin} + {K.norMin} + {K.tcqMin} + {K.norMin} + {K.andMin} + {K.andMin} = {K.tcqMin * 2 + K.norMin * 2 + K.andMin * 2} ps，遠大於 thold {K.hold} ps；跨級路徑天生 hold 安全。
          </p>
        </ModeContent>
        <ModeContent level="deep" title="這條路徑為什麼是 MMD 的 Fmax 瓶頸，以及三種縮短法">
          <ul>
            <li>
              <b>級數不會幫它</b>：local path 的可用時間每級翻倍，但 modulus-out 鏈的 capture 永遠在 cell 1 的 clk domain，可用時間固定 1T（或證明後的 2T），而鏈的長度隨級數線性增加。n 級 MMD 的 Fmax 由這條鏈決定，不是由第一級的 /2 /3 cell。
            </li>
            <li>
              <b>合併 gate</b>：把 AND_P0 併進 NOR2 做成 AOI（mod1_eff = NOT(b1 + b0) · p0 一個複合 gate ≈ 12 ps）省一個 AND：arrival 50 ps。
            </li>
            <li>
              <b>逐級 retime</b>：每一級用自己的 clock 把 mod_out 重新取樣，鏈被切成一級一段 local path。代價：請求晚一個 f<sub>i</sub> 週期到，必須改成在 b = 01 提出（Lesson 4-1 的練習變體），duty 也跟著變。
            </li>
            <li>
              <b>只讓第一級高速</b>：第一級用 CML /2 /3（tCQ 4、gate 5），path ② ≈ 4 + 5 + 8 + 12 + 5 + 5 = 39 ps；此時 f1 的 pulse width（⑥）也差不多 40 ps，兩個限制一起到。
            </li>
          </ul>
        </ModeContent>
      </Section>

      <Section title="③ MOD decode → D：p0 與 p1 的 control path" en="Path 3: modulus control into D">
        <p>
          p0、p1 在正常運作時是常數，線上沒有 transition，STA 的 case analysis 會把它們剪掉——它們<b>不限制 Fmax</b>。但換除數時它們會動，而且各有各的 deadline（Lesson 4-1 已經找到是哪一個 edge）：
        </p>
        <ul>
          <li>
            <b>p0</b>：controller flop（tCQ {K.tcq}）→ routing（{12} ps，controller 通常離高速級很遠）→ AND_P0（{K.and}）→ AND_A1（{K.and}）→ C1.FF1.D。arrival = {K.tcq + 12 + K.and * 2} ps，capture 是「a = 01 且 mod_out2 = 1」的 clk↑，slack = {REQ - (K.tcq + 12 + K.and * 2)} ps（單週期）。
          </li>
          <li>
            <b>p1</b>：controller flop → routing → AND_B1 → C2.FF1.D。arrival = {K.tcq + 12 + K.and} ps，capture 是「b0 = 1」的 f1↑，slack = {REQ - (K.tcq + 12 + K.and)} ps。注意 capture clock 是 f1，比對應的 clk↑ 晚 20 ps 到；保守起見不把這 20 ps 算進可用時間。
          </li>
        </ul>
        <p>違反 path ③ 的後果不是 Fmax 掉下來，而是「換除數晚一個週期生效」或「C1.FF1 metastable」。用模擬看 p0 何時改變、哪一個週期才變 5T：</p>
        <SwitchP0Table />
        <Callout kind="warning" title="這條路徑的三個陷阱">
          <ul style={{ margin: 0 }}>
            <li>
              <b>不是 Fmax 路徑，但也不是 false path</b>：它有 launch（controller flop）、有 capture（C1.FF1）、會被 sensitize（換除數的那個 edge）。要 constrain，只是可以依 controller 的行為放寬（例如 controller 保證只在 div_out rising edge 之後那一個 T 內更新 p，離 p0 的 edge 還有 2T）。
            </li>
            <li>
              <b>p0 與 p1 的 deadline 是不同的 edge</b>：兩個 bit 若不在同一個安全窗內改變，會出現一個「p1 新、p0 舊」的中間除數——不是 glitch，平均 N 差 1。
            </li>
            <li>
              <b>跨 clock domain</b>：p 若來自更慢的 SDM clock，要先在 clk domain 同步，否則 path ③ 的 setup/hold 無法保證，metastability 會直接進入 state machine。
            </li>
          </ul>
        </Callout>
      </Section>

      <Section title="④ Output decode：latency，不是 setup" en="Path 4: output decode">
        <p>
          div_out = NOR(b1, b0)。從 clk edge k 到 div_out 翻轉：f1 latency {K.tcq + K.nor} + tCQ(b0) {K.tcq} + NOR2 {K.nor} + output wire {K.wire} = <b>{LAT4} ps</b>。這條路徑沒有 capture flop，所以<b>不是 setup check</b>——它決定的是輸出 edge 相對 clk edge 的固定延遲（latency）。
        </p>
        <p>
          latency 本身無害；有害的是它的<b>變動</b>：這 {LAT4} ps 隨 PVT 與 supply noise 改變，而 div_out 的 edge 是由這條路徑「產生」的，所以它的變動直接變成 divider 貢獻給 PLL 的 jitter。如果 div_out 後面接一個以 clk 取樣的 retimer flop（PFD 前常見），這條路徑才變成一條 interface setup path：arrival {LAT4} ps 對 required {REQ} ps，slack {REQ - LAT4} ps——而且 retime 之後 jitter 只剩最後那個 flop 的 tCQ 變動。
        </p>
        <Callout kind="pitfall" title="不要把所有 output delay 都叫 setup critical path">
          「NOR2 → div_out 很慢」和「NOR2 → div_out 會 setup violation」是兩件事。前者是 latency / jitter 問題，後者要先有一個 capture flop 才成立。同理，NOR2 的 decode glitch（b 由 01 → 10 之間短暫經過的中間值）是 pulse / glitch 問題，不是 setup 問題。
        </Callout>
      </Section>

      <Section title="⑤ Reset / initialization：recovery 與 removal" en="Path 5: reset release">
        <p>
          四個 flop 共用 async reset。reset 釋放（rst_n 由 0 變 1）相對 clock edge 的要求：<b>recovery</b>（釋放要在 edge 之前至少 trecovery = {K.recovery} ps，像 setup）與 <b>removal</b>（釋放要在 edge 之後至少 tremoval = {K.removal} ps，像 hold）。它不是 data path——launch 不是 flop，是 rst_n 的驅動者。
        </p>
        <Steps
          items={[
            <>
              <b>cell 1（clk domain）</b>：rst_n → C1.FF0 / FF1 的 rstn。釋放落在 clk edge 附近，a0 可能一半 reset 一半 capture，metastable。更糟：a0 metastable ⇒ NOR1 的輸出 f1 出現 glitch ⇒ cell 2 吃到一個 runt clock。所以 cell 1 的 reset 品質決定整個 MMD 的初始 state。
            </>,
            <>
              <b>cell 2（f1 domain）</b>：reset 期間 a = 00，所以 f1 = 1 被拉高不動。釋放後第一個 f1↑ 要等 a 走完 01 → 00：模擬證明是 edge 2（p0 = 0）或 edge 3（p0 = 1）之後 20 ps。cell 2 的 recovery 因此幾乎自動滿足——前提是 cell 1 乾淨地離開 reset。
            </>,
            <>
              <b>初始 state</b>：reset 後 (b, a) = (00, 00)，mod_out2 = 1，所以第一個輸出週期就依 p0 決定 /4 或 /5，沒有 transient（Lesson 4-1 的表從 edge 1 就在主循環上）。
            </>,
          ]}
        />
        <p className="small muted">這條路徑不影響 Fmax，只影響「reset 釋放後第一個 edge 是否可靠」。不要把 recovery violation 和 setup violation 混為一談：前者的修法是同步 reset 的釋放（reset synchronizer），不是縮短 data path。</p>
      </Section>

      <Section title="⑥ Minimum pulse width：f1 只有一個 T 寬" en="Path 6: the generated clock's pulse width">
        <p>
          f1 = NOR(a1, a0) 只在 a = 00 那一個 clk 週期為 1，所以它的 high pulse 恰好一個 T（模擬量到 {K.T} ps）；low pulse 是 1T（/2）或 2T（/3）。cell 2 的 flop 需要最小 clock pulse width tpw,min = {K.minPulse} ps 才能正確 capture；NOR 的 rise / fall 不對稱（PMOS 串疊，上升較慢）再吃掉約 {K.norAsym} ps。這不是 setup、也不是 hold：<b>沒有 data 在被抓，被檢查的是 clock 本身的形狀</b>。
        </p>
        <Math block>{`T_{clk,min,6} = t_{asym} + t_{pw,min} + t_{jitter} + t_{margin} = ${K.norAsym} + ${K.minPulse} + ${K.jitter} + ${K.margin} = ${TMIN6}\\ \\text{ps}`}</Math>
        <p>
          變數：<Math>{'t_{asym}'}</Math> 是 NOR1 上升與下降延遲的差（ps），它讓 f1 的 high pulse 比一個 T 短；<Math>{'t_{pw,min}'}</Math> 是 cell 2 flop 的最小 clock pulse width（ps）。拖曳 T 看 f1 的 high pulse 什麼時候小於 tpw,min：
        </p>
        <F1PulseWidthDemo />
        <CompareTable head={['限制來源', 'Tclk,min（ps）', 'Fmax（GHz）', '在哪些 mode 有效']} rows={[['① local path（tCQ + NOR + setup + jitter + margin）', String(TMIN1), (1000 / TMIN1).toFixed(1), '全部'], ['⑥ f1 pulse width', String(TMIN6), (1000 / TMIN6).toFixed(1), '全部'], ['② modulus-out 鏈（單週期）', String(TMIN2), (1000 / TMIN2).toFixed(1), 'p0 = 1'], ['② 三級版（單週期）', String(ARR2_MMD3 + K.setup + K.jitter + K.margin), (1000 / (ARR2_MMD3 + K.setup + K.jitter + K.margin)).toFixed(1), 'p0 = 1']]} />
        <p>
          用這組 CMOS 數字，Fmax 由 path ② 決定（{TMIN2} ps ⇒ {(1000 / TMIN2).toFixed(1)} GHz）；p0 = 0 的 mode 則由 ⑥ 決定（{TMIN6} ps）而不是 ①（{TMIN1} ps）——<b>pulse width 比 local setup 更早撞到</b>。換成 CML 高速級時 path ② 縮到約 39 ps，三個限制擠在一起，f1 的形狀成為真正的瓶頸。
        </p>
      </Section>

      <Section title="Critical Path Highlighter：三組路徑同時看" en="Critical path highlighter">
        <p>
          下面把同一張圖上三組路徑同時畫出來：<b>紅實線</b>是這個 mode 下 setup slack 最小的路徑（max-delay），<b>藍虛線</b>是 hold slack 最小的路徑（min-delay），<b>灰點線</b>是 async / control 路徑（reset、p0 / p1）。三張表並列：launch、capture、每一段 delay、總 delay（arrival）、budget（required）、slack。切換 mode 觀察紅線怎麼換：
        </p>
        <CriticalPathHighlighter scenario={mmd2Timing} title="兩級 MMD：最差 setup / 最差 hold / async 與 control" />
        <Steps
          items={[
            <>
              <b>p1p0 = 00 / 10</b>：p0 = 0，path ② 沒有 transition，紅線是 ① C1.FF0 → NOR1 → C1.FF0（slack {REQ - ARR1}）。藍線是 ① 的同一條（min delay {K.tcqMin + K.norMin}，hold slack {K.tcqMin + K.norMin - K.hold}）；a0 → AND_A1 那條在 p0 = 0 時也沒有 transition。
            </>,
            <>
              <b>p1p0 = 01 / 11</b>：紅線跳到 ② C2.FF0 → NOR2 → AND_P0 → AND_A1 → C1.FF1（slack {REQ - ARR2}）。藍線變成 a0 → AND_A1 → C1.FF1（min delay {K.tcqMin + K.andMin}，hold slack {K.tcqMin + K.andMin - K.hold}，全部路徑中最小）。
            </>,
            <>
              <b>換除數中</b>：多出 ③ 的兩條 control path（灰點線）。它們的 slack（{REQ - (K.tcq + 12 + K.and * 2)}、{REQ - (K.tcq + 12 + K.and)}）都比 ② 大，所以紅線還是 ②——但它們限制的是「換除數什麼時候生效」，不是 Fmax。
            </>,
            <>
              <b>reset</b>（⑤）永遠在灰組：它的 budget 是 T − trecovery − jitter − margin，與 data path 的 setup 無關。
            </>,
          ]}
        />
        <p>想自己一條一條點、改 T / jitter / margin 看 slack 怎麼變，用完整的 explorer：</p>
        <CriticalPathExplorer scenario={mmd2Timing} initialPath="p2-modout2-da1" />
      </Section>

      <Section title="哪一條限制什麼：總整理" en="What each path limits">
        <CompareTable
          head={['問題', '由哪條路徑決定', '檢查種類', '違反時的症狀']}
          rows={[
            ['Fmax（p0 = 1）', '② modulus-out 鏈', 'setup（跨級）', 'cell 1 在錯的 f1 週期走 /3：sequence / duty 錯，平均 N 可能仍對；再慢則 /3 消失'],
            ['Fmax（p0 = 0）', '⑥ f1 pulse width，其次 ① local', 'pulse width / setup', 'cell 2 漏抓 edge（runt clock）；或 da0 來不及'],
            ['mode switching 何時生效', '③ p0 / p1 control path', 'setup / hold（只在切換 edge）', '晚一個輸出週期生效、中間除數、或 metastable'],
            ['output latency / jitter', '④ output decode', '不是 setup（除非後接 retimer）', 'div_out edge 的延遲隨 PVT 抖動'],
            ['reset 後第一個週期是否可靠', '⑤ recovery / removal', 'recovery / removal', 'a0 metastable ⇒ f1 glitch ⇒ cell 2 吃到 runt clock'],
            ['hold（任何 T）', '① a0 → AND_A1 → C1.FF1（p0 = 1）', 'hold（min-delay）', 'C1.FF1 在同一個 edge 抓到新值：a 跳過 state'],
          ]}
        />
        <Callout kind="note" title="setup、hold、非 reg-to-reg，三種問法">
          setup 問「來不來得及」（與 T 有關）；hold 問「會不會太早」（與 T 無關）；④⑤⑥ 都不是 flop 到 flop 的 data path——④ 沒有 capture、⑤ 的 launch 不是 flop、⑥ 檢查的是 clock 而不是 data。把它們硬塞進 setup 的公式會得到沒有意義的 slack。
        </Callout>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>把 f1 那條長線當 critical path</b>：它是 clock。它的延遲進入 path ② 與 ④ 的 arrival（source latency），本身沒有 setup 要求；要檢查的是它的 pulse width（⑥）。
            </li>
            <li>
              <b>只在 p1p0 = 00 做 timing sign-off</b>：path ② 只在 p0 = 1 被 sensitize；worst case 是 p0 = 1 的 mode。反過來，只在 p1p0 = 11 sign-off 也會漏掉 ③（只在切換時存在）。
            </li>
            <li>
              <b>看到單週期 slack 為負就直接宣告 multicycle</b>：要先有 sequential 證明（f1↑ ⇔ a → 00、a0 下一個 edge 才變 1），並同步調整 hold 的 multicycle。
            </li>
            <li>
              <b>把 path ② 違反當成 metastability 問題</b>：模擬顯示第一個症狀是 divide sequence 錯（duty 3/5 → 2/5），平均 N 不變；量平均頻率看不出來，要看 edge 位置。
            </li>
            <li>
              <b>把 ripple 觀點套到 cell 2</b>：cell 2 的兩個 flop 共用同一個 f1，它們之間是同步的 local path（可用時間 2T）；ripple 是「每個 flop 各自的 clock 逐級延遲」，這裡只有 clk → f1 這一層是 generated clock 關係。
            </li>
            <li>
              <b>忽略 reset release</b>：a0 metastable 會透過 NOR1 變成 cell 2 的 runt clock——reset 的 recovery/removal 不是「數位小事」。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="SDC 骨架（對應六類路徑）">
          <CodeBlock
            lang="tcl"
            title="mmd2.sdc"
            code={`
# 主 clock：T = 100 ps
create_clock -name clk -period 0.100 [get_ports clk]
set_clock_uncertainty 0.003 [get_clocks clk]          ;# jitter 3 ps（margin 另加）

# ⑥ f1 是 generated clock：來自 NOR1 輸出。實際週期是 2T 或 3T，用最短的 2T 宣告
create_generated_clock -name f1 -source [get_ports clk] -divide_by 2 [get_pins nor1/Y]
set_min_pulse_width 0.030 [get_clocks f1]             ;# cell 2 flop 的 tpw,min

# ① local path 由 clk / f1 自動涵蓋；cell 2 的 local path 可用時間自動是 2T

# ② modulus-out 鏈：launch 在 f1 domain、capture 在 clk domain
#    預設單週期（k+1）。若要放寬到 a = 01 的 edge，必須附 sequential 證明：
# set_multicycle_path 2 -setup -from [get_clocks f1] -to [get_pins ff_a1/D]
# set_multicycle_path 1 -hold  -from [get_clocks f1] -to [get_pins ff_a1/D]

# ③ control path：p0 / p1 來自 controller flop（同 clk domain）。不是 false path。
#    若 controller 保證只在 div_out 上升後 1T 內更新，可依證明放寬；否則保持單週期。
# set_case_analysis 0 [get_ports p0]  ;# 只在「p0 = 0 的 mode」sign-off 時用，會剪掉 path ②

# ④ output：只設 output delay 給後級 retimer 用；沒有 retimer 時不是 setup path
set_output_delay -clock clk 0.020 [get_ports div_out]

# ⑤ reset：recovery / removal 由 async reset pin 自動檢查；reset 釋放要經 synchronizer
`}
            note="每一行都對應課文的一類路徑。最容易出錯的是 ②：generated clock 的 latency 由工具自動算進 arrival，不要再手動加 20 ps。"
          />
        </ModeContent>
      </Section>
    </>
  )
}

// ---------------------------------------------------------------- 練習：p0 的 AND 移到 mod_out2 之前
function ExerciseComponent() {
  return (
    <Tabs
      tabs={[
        { label: '功能驗證（DividerSimPanel）', content: <DividerSimPanel netlist={mmd2P0First} schematic={mmd2P0FirstSchematic} title="mod_out2 = f2 · p0；da1 = a0 · mod_out2" signals={['clk', 'a0', 'a1', 'f1', 'b0', 'b1', 'mod_out2', 'div_out']} windowCycles={12} showEquations={false} compact /> },
        { label: 'Critical Path Highlighter', content: <CriticalPathHighlighter scenario={mmd2P0FirstTiming} title="變體：AND_P0 搬到 cell 2" initialMode="m01" /> },
      ]}
    />
  )
}

const lesson: LessonDef = {
  id: 'm4-l2-mmd-cp',
  module: 4,
  order: 2,
  title: 'MMD 的 Critical Path',
  titleEn: 'Critical paths inside an MMD',
  summary: '把兩級 MMD 的六類 timing path 逐一拆開：local Q→D、downstream modulus-out → upstream MOD（跨兩級、跨 clock）、MOD decode → D、output decode、reset recovery/removal、generated clock 的 pulse width。用同一組數字算 arrival / required / slack，用 simulate 證明 path ② 的真正 deadline，並用 Critical Path Highlighter 同時看最差 setup、最差 hold 與 async 路徑。',
  goals: [
    '對六類路徑各自說出 launch element / edge、capture element / edge、檢查種類（setup / hold / recovery / pulse width / latency）。',
    '把 path ② 一段一段加出 arrival 60 ps、required 87 ps、slack 27 ps、Tclk,min 73 ps，並解釋 f1 的 source latency 為什麼算在 data 那一邊。',
    '用模擬說出 path ② 的功能 deadline 其實是 a = 01 的 edge（k+2），以及違反時的三種症狀（sequence 錯、duty 錯、/3 消失）。',
    '分辨哪些路徑限制 Fmax、哪些只在 mode switching 時存在、哪些是 latency、哪些根本不是 reg-to-reg。',
    '從 Critical Path Highlighter 讀出三組路徑（紅 setup、藍 hold、灰 async / control）在四種 mode 下如何改變。',
  ],
  readingMinutes: 50,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'critical-path',
      prompt: 'p1p0 = 01（/5）固定運作時，哪一條是決定 Fmax 的 setup critical path？',
      schematic: mmd2Schematic,
      options: [
        { label: 'C1.FF0.Q → NOR1 → C1.FF0.D', highlight: hlPath1Local, description: 'cell 1 的 local 回授，arrival 20 ps' },
        { label: 'C2.FF0（f1↑）→ NOR2 → AND_P0 → AND_A1 → C1.FF1.D', highlight: hlPath2ModOut, description: '跨兩級的 modulus-out 路徑，arrival 60 ps' },
        { label: 'NOR1 → cell 2 的 clock pin（f1 走線）', highlight: hlF1Clock, description: '圖上最長的線' },
        { label: 'NOR2 → div_out', highlight: hlPath4Output, description: '輸出 decode' },
      ],
      answer: 1,
      explanation: 'p0 = 1 時 AND_P0 打開，mod_out2 的變化會傳到 da1：這條路徑有 launch（C2.FF0，f1↑）、有 capture（C1.FF1，clk↑），arrival 60 對 required 87，slack 27——比 local 的 67 小。f1 走線是 clock，沒有 setup 要求；div_out 沒有 capture flop。',
    },
    {
      id: 'q2',
      type: 'critical-path',
      prompt: '同一個電路，改成 p1p0 = 10（/6）固定運作。現在的 setup critical path 是？',
      schematic: mmd2Schematic,
      options: [
        { label: 'C2.FF0（f1↑）→ NOR2 → AND_P0 → AND_A1 → C1.FF1.D', highlight: hlPath2ModOut, description: '跨級路徑' },
        { label: 'C1.FF0.Q → NOR1 → C1.FF0.D', highlight: hlPath1Local, description: 'cell 1 local' },
        { label: 'C1.FF0.Q → AND_A1 → C1.FF1.D', highlight: hlHoldA0And, description: 'a0 經 AND 到 a1' },
        { label: 'rst_n → 四個 flop', highlight: hlPath5Reset, description: 'reset' },
      ],
      answer: 1,
      explanation: 'p0 = 0 ⇒ mod1_eff ≡ 0：AND_P0 與 AND_A1 的輸出鎖死，跨級路徑與 a0 → AND_A1 路徑上都沒有 transition，STA 的 case analysis 會剪掉它們。剩下的 setup 路徑只有兩個 cell 的 local 回授，cell 1 那條可用時間 1T（cell 2 是 2T），所以 C1.FF0 → NOR1 → C1.FF0 是 critical path。reset 是 recovery / removal。',
    },
    {
      id: 'q3',
      type: 'numeric',
      prompt: 'T = 100、tCQ = 8、NOR = 12、AND = 10、tsetup = 7、jitter = 3、margin = 3、skew = 0（ps）。path ②（C2.FF0 經 NOR2、AND_P0、AND_A1 到 C1.FF1.D，capture 在 launch 後第一個 clk edge，f1 的 source latency 算在 arrival 內）的 setup slack 是多少 ps？',
      answer: 27,
      unit: 'ps',
      explanation: 'arrival = 8 + 12（f1↑）+ 8 + 12 + 10 + 10 = 60；required = 100 − 7 − 3 − 3 = 87；slack = 27 ps。',
    },
    {
      id: 'q4',
      type: 'numeric',
      prompt: '同一組數字，三級 MMD 的 modulus-out 鏈多了 tCQ(c0) + NOR3 + AND(mod_out2) 三段。單週期檢查的 slack 是多少 ps？（負值表示 violation）',
      answer: -3,
      unit: 'ps',
      explanation: 'arrival = 60 + 8 + 12 + 10 = 90；required 仍是 87；slack = −3 ps。每多一級就多 30 ps，而 capture 仍在 cell 1 的 clk domain，可用時間不變。',
    },
    {
      id: 'q5',
      type: 'single',
      prompt: 'path ② 的 arrival 被拉長到 225 ps（> 2T），p1p0 = 01。模擬會看到什麼？',
      options: ['C1.FF1 metastable，輸出隨機', '平均 N 仍是 5，但 /3 落到 b = 01 的 f1 週期：state 序列出現 0110，duty 由 3/5 變 2/5', 'N 掉成 4，因為 /3 消失', 'N 變成 6，因為多了一個 /3'],
      answer: 1,
      explanation: 'a = 01 的 edge 抓到的 da1 還是舊值，這一輪走 /2；下一輪（b 已經是 01）才走 /3。每個輸出週期仍然恰好一次 /3，所以 N = 5 不變，但 sequence 與 duty 錯了。要再慢到 260 ps（mod_out2 的 2T pulse 被 AND 吞掉），/3 才會消失、N 掉成 4。',
    },
    {
      id: 'q6',
      type: 'multiple',
      prompt: '下列哪些路徑不是 register-to-register 的 setup check？',
      options: ['NOR2 → div_out（output decode）', 'rst_n → C1.FF0 的 rstn（reset release）', 'f1 的 high pulse width', 'C2.FF0 → NOR2 → C2.FF0.D（cell 2 local）', 'p0 → AND_P0 → AND_A1 → C1.FF1.D'],
      answers: [0, 1, 2],
      explanation: 'output decode 沒有 capture flop（latency）；reset 的 launch 不是 flop、檢查的是 recovery / removal；pulse width 檢查 clock 的形狀，沒有 data 在被抓。cell 2 local 是 f1 domain 的 reg-to-reg setup（可用 2T）；p0 的 control path 有 launch（controller flop）與 capture（C1.FF1），是 setup check，只是只在切換時被 sensitize。',
    },
    {
      id: 'q7',
      type: 'single',
      prompt: 'p1p0 = 11 時，哪一條是 hold critical path（min-delay 最短）？它的 hold slack 是多少？（tCQ,min = 5、AND,min = 7、NOR,min = 8、thold = 3）',
      options: ['C1.FF0 → AND_A1 → C1.FF1：min 12，slack 9 ps', 'C1.FF0 → NOR1 → C1.FF0：min 13，slack 10 ps', 'C2.FF0 → NOR2 → AND_P0 → AND_A1 → C1.FF1：min 40，slack 37 ps', 'hold 與 T 有關，要先知道 T 才能算'],
      answer: 0,
      explanation: 'hold 看同一個 edge 之後資料多快改變：min delay 最短的是 tCQ,min + tAND,min = 12 ps，減 thold 3 得 slack 9 ps。NOR 路徑 13 − 3 = 10；跨級路徑 40 − 3 = 37。hold 與 T 無關。',
    },
    {
      id: 'q8',
      type: 'single',
      prompt: '三級版 path ② 單週期 slack −3 ps。下列哪一個做法能在不改變 N 公式、不加 flop 的前提下縮短這條路徑？',
      options: ['把 AND_P0 併進 NOR2 做成 AOI 複合 gate（省一個 AND 的延遲）', '把 f1 走線加 buffer 讓它更快', '要求 controller 提早一個週期送出 p0', '把 cell 2 的 flop 換成 tCQ 更大的省電 flop'],
      answer: 0,
      explanation: 'path ② 的 gate 數決定 arrival；AOI 合併省下約 10 ps（arrival 80 ⇒ slack 7）。f1 走線加 buffer 會讓 f1 更晚到，arrival 變大。p0 是 control path（③），不在 path ② 上。tCQ 變大直接惡化 path ②。逐級 retime 也能解，但要加 flop 並改成 b = 01 提出請求。',
    },
  ],
  exercise: {
    title: 'p0 的 AND 移到 mod_out2 之前，critical path 有沒有變？',
    prompt: (
      <>
        <p>
          有人建議把 AND_P0 搬到 cell 2 那一側：先算 <span className="mono">mod_out2 = f2 · p0</span>，再沿長線送回 cell 1，cell 1 只剩 <span className="mono">da1 = a0 · mod_out2</span>。邏輯上完全等價（AND 有結合律）。先不要看答案，自己推：
        </p>
        <ol>
          <li>path ② 的 launch / capture 有沒有變？經過的 gate 數呢？arrival 與 slack 呢？</li>
          <li>path ③（p0 的 control path）的 capture 沒變，但 routing 的終點變了——這對 deadline 有什麼影響？</li>
          <li>p0 = 0 時，長走線上的訊號有沒有在 toggle？這和原版有什麼不同？（想想 substrate / supply noise 耦合到 VCO）</li>
          <li>如果真的要縮短 path ②，這個搬法夠不夠？還能做什麼？</li>
        </ol>
        <p>用左邊的模擬器確認四種 mode 的 N 與 state 序列都沒變，再用右邊的 highlighter 比較 slack。</p>
      </>
    ),
    Component: ExerciseComponent,
    checklist: ['寫出新的 mod_out2 與 da1 式子，確認四種 mode 的 N 不變', 'path ② 的 arrival（應為 60 ps）與 slack（27 ps）', 'p0 = 0 時 mod_out2 長線是否靜止', '真正縮短 path ② 的兩種做法'],
    answer: (
      <>
        <p>
          <b>critical path 沒有變短</b>。path ② 仍然是 C2.FF0（f1↑）→ NOR2 → AND_P0 → AND_A1 → C1.FF1.D，三個 gate 一個都沒少，arrival 仍是 60 ps、slack 仍是 27 ps（models.test.ts 用 mmd2P0FirstTiming 驗證）；差別只是 AND_P0 那 10 ps 現在落在長走線之前而不是之後。功能上四種 mode 的 state 序列與 N 都與原版逐 edge 相同（ideal 與 real delay 都驗過）。
        </p>
        <p>
          <b>改變的是兩件事</b>：(1) path ③ 的 routing：p0 現在要送到 cell 2，而 cell 2 通常離 controller 比 cell 1 近（都是低速側），routing 可能更短；但 p0 之後要跟著 mod_out2 走整條長線回 cell 1，deadline 仍是 a = 01 且 mod_out2 = 1 的 edge。(2) p0 = 0 時 mod_out2 長線恆為 0，不再每個輸出週期 toggle（原版 NOR2 的輸出照樣在 toggle，因為它同時是 div_out）——少一條在高速級旁邊每 N·T 翻一次的長線，對 VCO 的 spur 耦合有幫助。
        </p>
        <p>
          <b>要真的縮短 path ②</b>：把 AND_P0 併進 NOR2 做 AOI（arrival 50 ps），或在 cell 2 用 f1 把 mod_out2 retime 一次、改成 b = 01 提出請求（Lesson 4-1 練習的變體），讓跨級路徑變成「f1 domain 的 local path + 一條 2T 可用時間的跨級路徑」。搬 AND 的位置本身只是把延遲換個地方放。
        </p>
      </>
    ),
  },
}
export default lesson
