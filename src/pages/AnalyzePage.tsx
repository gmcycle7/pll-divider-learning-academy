import { Link } from 'react-router-dom'
import { Callout, Section, Steps, Term } from '@/components/content'
import { DividerAnalysisWorksheet } from '@/components/lab/DividerAnalysisWorksheet'
import { WORKSHEET_QUESTIONS } from '@/components/lab/worksheet'
import { findLesson } from '@/lessons/registry'
import { useLocalState } from '@/hooks/useProgress'

export interface AnalysisStep {
  /** 步驟標題（與 worksheet 15 題一一對應的分析動作） */
  title: string
  /** 這一步的結論要填進工作紙的哪一題（WORKSHEET_QUESTIONS 的 key，順序必須一致） */
  worksheetKey: string
  /** 一句「怎麼做」 */
  how: string
  /** 對應課程的 lesson id（registry.ts 內的 id），可能不只一個 */
  lessonIds: string[]
}

/**
 * 固定 15 步：與 `WORKSHEET_QUESTIONS`（src/components/lab/worksheet.ts）的 15 題一一對應，
 * 第 n 步的結論就填在工作紙第 n 題。順序：clock → sequential element → state bit → reset →
 * next-state equation → reachable state → state sequence → output edge → divide ratio → duty →
 * control deadline → launch → capture → 中間的 logic → glitch / illegal state。
 */
export const ANALYSIS_STEPS: AnalysisStep[] = [
  {
    title: '1. 找 clock input',
    worksheetKey: 'q1',
    how: '從每個 flop / latch 的 clk（或 latch 的 en）pin 出發往回追，看是哪個訊號在驅動它；ripple 結構裡後面級的 clk 常常是前一級的 Q，要一級一級寫下來，不能只看最上層那條 clk。順手把「哪些訊號只是 data / control，不是 clock」也標出來。',
    lessonIds: ['m0-l1-clock'],
  },
  {
    title: '2. 找所有 memory element，並判斷各自的觸發行為',
    worksheetKey: 'q2',
    how: '圈出電路裡所有「不是純組合邏輯」的節點：DFF、TFF、level-sensitive latch、靠寄生電容暫存的 dynamic node、以及任何被叫做 counter 的區塊。接著把每一個標成三類之一：rising-edge、falling-edge，或 level-sensitive（latch 在 enable 高／低整段期間都是 transparent）——這決定了它「什麼時候」會抓新值，之後畫 timing diagram 才不會抓錯 edge。',
    lessonIds: ['m0-l2-comb-seq', 'm0-l3-dff'],
  },
  {
    title: '3. 列出 state bits 與它們的順序',
    worksheetKey: 'q3',
    how: '上一步找到的每一個 memory element 的輸出就是一個 state bit；把它們排成一個固定順序（習慣上 MSB 在前）並寫下來，例如 state = q1q0。之後的 state table、state sequence、模擬器輸出都用這個順序，不要中途換邊，否則自己會對不起來。',
    lessonIds: ['m0-l2-comb-seq', 'm1-l3-sync'],
  },
  {
    title: '4. 找 reset state，並判斷這個 reset 的用途',
    worksheetKey: 'q4',
    how: '看每個 flop 的 rstn / set pin 接到哪裡、是 async 還是 sync、reset 後的值是 0 還是 1，寫出 reset 釋放後完整的起始 state。再判斷這個 reset 在這顆電路裡的角色：有些只是決定起始相位（例如 /2，不 reset 也能除頻，只是相位不定），有些是唯一能把電路帶離 illegal state、避免 lock-up 的手段——兩者的「必要程度」完全不同。',
    lessonIds: ['m8-l1-reset'],
  },
  {
    title: '5. 為每個 state bit 寫 next-state equation D0 = f(Q0,Q1,MOD…)',
    worksheetKey: 'q5',
    how: '先從每個元件的 Q（或 latch 的輸出）出發，順著 wire 與 gate 往下游走，看它最後繞回哪一個 D——這條 feedback path 就是 next state 的來源。然後把每一個 D 表成目前所有 state bit 與 control input（例如 mod、sel）的布林函數；有幾個 state bit 就要有幾條方程式，任何一個 gate 都不能漏。',
    lessonIds: ['m1-l1-div2', 'm2-l1-div3'],
  },
  {
    title: '6. 找 reachable / unreachable states',
    worksheetKey: 'q6',
    how: '把 5. 的方程式對每一種 (Q0,Q1,…,control) 組合算一次 next state（state bit 多時照固定順序窮舉，不要只挑看起來會出現的幾列），就得到完整的 state transition table。從 reset state 走得到的那些是 reachable，其餘是 unreachable——並且要另外檢查：萬一電路（例如上電雜訊）落進 unreachable state，它能不能自己走回來。',
    lessonIds: ['m8-l2-self-recover'],
  },
  {
    title: '7. 從 reset state 逐 edge 推出 state sequence',
    worksheetKey: 'q7',
    how: '從 reset 釋放後的合法 state 開始，一次只推進一個 edge：查 6. 的表得到 next state，寫成 00 → 01 → 10 → 00 這樣的一圈，並用 DividerSimPanel 按一次「下一個 Clock Edge」核對。有 mode（mod / sel）的電路，每一個 mode 各寫一組——不要用「看起來像除幾」跳著猜答案。',
    lessonIds: ['m1-l3-sync', 'm8-l1-reset'],
  },
  {
    title: '8. 找 output 在哪些 edge transition',
    worksheetKey: 'q8',
    how: 'output 不一定就是某一個 state bit，也可能是幾個 bit 組合 decode 出來的；對照 7. 的 state sequence，逐個 edge 標出 output 從 0→1 或 1→0 發生在哪一步。從 decode 邏輯出來的 output 還要記一筆：它可能在兩個 state bit 同時改變的瞬間出現 hazard。',
    lessonIds: ['m2-l1-div3'],
  },
  {
    title: '9. 從 output edge interval 推 divide ratio',
    worksheetKey: 'q9',
    how: '量出相鄰兩個「同方向」output edge（例如兩個 rising edge）之間經過幾個輸入 clock 週期，那就是 divide ratio；如果每次量到的間隔不固定，代表這是 fractional 或有 mode switching，要分開記錄每一種間隔並算平均值，不能只取一次就當結論——瞬時值與平均值是兩件事。',
    lessonIds: ['m1-l1-div2'],
  },
  {
    title: '10. 判斷 duty cycle',
    worksheetKey: 'q10',
    how: '用「output 維持 high 的時間 ÷ output 完整週期」實際從波形量出來；不要假設任何電路（尤其奇數除頻）一定是 50% duty，很多架構天生就不是。若題目要求 50%，記下要多付出什麼代價（例如多一個 falling-edge flop）。',
    lessonIds: ['m2-l2-odd-50'],
  },
  {
    title: '11. 判斷 MOD / select 的 timing deadline，以及切換是否 phase-continuous',
    worksheetKey: 'q11',
    how: 'control 訊號（mod、sel…）通常也要走過一段 combinational logic 才影響 next state：先找出它「在哪一個 capture edge 被取樣」，再往前留出「tsetup ＋ 它所經過的 logic delay」，那就是它最晚必須穩定的時刻。接著看切換之後 output 的下一個 edge 相對「如果沒有切換」是提早、延後、還是不變（phase-continuous）；state-continuous 架構與「先跑好兩個 divider 再用 MUX 選 output」在切換瞬間的行為並不一樣，不能直接畫等號。',
    lessonIds: ['m3-l2-dm-cell', 'm3-l1-dm-concept'],
  },
  {
    title: '12. 找 critical path 的 launch point',
    worksheetKey: 'q12',
    how: '挑一個 capture flop 的 D，往回追 combinational cone，直到碰到某個 flop 的 Q（或 primary input）——那個 Q 與它的那一個 clock edge 就是 launch point。注意 launch 的是「哪一個 edge」而不只是「哪一顆 flop」；ripple 結構裡 launch flop 的 clock 本身還有延遲，要一併記下來。',
    lessonIds: ['m7-l1-cp-basics', 'm7-l2-cp-method'],
  },
  {
    title: '13. 找 capture point 與 capture edge',
    worksheetKey: 'q13',
    how: '寫下這條路徑在哪一個 flop 的 D、用哪個 clock 的哪一個 edge 被抓進去，並確認 launch 與 capture 之間隔了幾個 cycle：同一個 flop 的下一個 edge（1 T）、rising → falling（半個 T）、或是被某個訊號擋住而真正取樣在 k+2（multicycle，宣告前一定要用模擬證明）。',
    lessonIds: ['m7-l2-cp-method', 'm7-l4-setup-hold-pw'],
  },
  {
    title: '14. 列出中間經過哪些 logic 並加總 delay',
    worksheetKey: 'q14',
    how: '依序寫出 tCQ → gate1 → gate2 → … → 走線 → tsetup，把 max delay 加起來得到 arrival time，再與 required time 相減得到 slack。同時用 min delay 做一次 hold 檢查，並確認這條 cone 在目前的 mode / state 下真的會被 sensitize——不會被 sensitize 的路徑再長也不是 critical path。',
    lessonIds: ['m7-l2-cp-method', 'm7-l3-divider-paths'],
  },
  {
    title: '15. 判斷可能的 glitch / runt / illegal state / lock-up',
    worksheetKey: 'q15',
    how: '檢查 6. 找到的 unreachable state 會不會造成 lock-up；再檢查任何「用組合邏輯切 clock、select 或 enable」的地方，切換時間點是否可能切在訊號已經是高電位的中間，因而產生比正常脈衝短的 runt pulse，或漏掉／多出一個 edge。這一題要的是「什麼情況下這顆電路會壞」，不是「它正常時做什麼」。',
    lessonIds: ['m5-l2-pmux-glitch', 'm8-l2-self-recover'],
  },
]

/** 找 critical path 的十步流程摘要（完整版見 m7-l2-cp-method） */
export const CP_METHOD_STEPS: string[] = [
  '列出電路裡所有 sequential elements——它們都是 launch／capture 的候選者，不要只看你直覺覺得「重要」的那幾個。',
  '選定要分析的 capture flop，找到它的 D pin（或 latch 的 D）。',
  '從 D 往回追 combinational cone，直到碰到某個 flop 的 Q（或 primary input）——那就是這條 path 的 launch element。',
  '確認 launch 與 capture 各自用哪個 clock、哪個 edge：可能是不同 clock（例如跨 clock domain），也可能是同一個 flop 的「下一個」edge（像 /2 那樣）。',
  '檢查這條 cone 是不是真的會被 sensitize：在某些輸入組合下，這條路徑上的變化會不會被別的訊號（例如 MUX 的另一個輸入固定住）擋下來、根本傳不到輸出？',
  '把 cone 上每一段的 delay 加總，算出 arrival time = tCQ(launch) + Σ 每段 logic／wire delay。',
  '算 required time：若是 setup 檢查，required = Tclk + skew − tsetup − jitter − margin。skew 的定義是「capture clock 到達 − launch clock 到達」，所以 capture clock 晚到（skew > 0）會讓 setup 變寬鬆、hold 變嚴格；不要死背正負號，從兩個 edge 的相對位置推。',
  'slack = required − arrival；slack ≥ 0 才安全。若這是目前最小的 slack，它就是限制整個電路 Fmax 的 setup critical path。',
  '對同一個 capture flop 另外做 hold 檢查（arrival_min ≥ thold + skew）與 pulse-width 檢查（clock 本身 high／low 是否夠寬）——這三種是不同的違反類型，不要用同一條算式套用。',
  '確認這條路徑是不是只在特定 mode 才存在（mode-dependent path）或屬於 multicycle path；不同 mode 要重新跑一次第 1–9 步，不能只分析一次就當作整顆電路的結論。',
]

function LessonLink({ id }: { id: string }) {
  const lesson = findLesson(id)
  return (
    <Link to={`/lesson/${id}`} className="chip chip-accent">
      對應課程：{lesson ? `M${lesson.module}-${lesson.order} ${lesson.title}` : id}
    </Link>
  )
}

export function AnalyzePage() {
  const [circuitName, setCircuitName] = useLocalState<string>('pdla.worksheet.analyze-free.circuitName', '')

  return (
    <div>
      <div className="lesson-head">
        <div className="eyebrow">路徑 B　Path B</div>
        <h1>我有一個陌生的 Divider，帶我分析</h1>
        <div className="en">A fixed method for reverse-engineering any unfamiliar divider</div>
      </div>

      <p>
        你手上可能有一份陌生的 divider schematic 或 netlist：可能是同事留下的、可能是舊 IP 的 datasheet 附圖、也可能是你自己畫到一半、已經看不出邏輯的電路。這一頁不教你「某一個」divider 怎麼運作，而是給你一套<b>不管電路長什麼樣子都能用</b>的固定流程——15 個步驟看懂它的功能，再用另外 10 個步驟找出它真正的
        <Term zh="臨界路徑" en="critical path" />。每一步都附一句「怎麼做」與一堂完整說明它的課程；不確定某一步在說什麼時，點進對應課程從頭看一次。
      </p>

      <div className="lesson-goals">
        <h3>這一頁能幫你做什麼</h3>
        <ul style={{ margin: 0 }}>
          <li>把「看懂一個陌生 divider」拆成 15 個具體、可以逐一核對的動作，而不是憑感覺猜除幾。</li>
          <li>把「找 critical path」拆成 10 個步驟，強調 launch／capture／sensitization，不是「找最長的那條線」。</li>
          <li>提供一張可以直接填、可以匯出 Markdown 的分析工作紙，讓你記錄自己手上那顆電路的答案。</li>
          <li>最後帶你用 Lab 第 1 題與 Assessment A，把整套流程在一個已知答案的電路上完整跑一次。</li>
        </ul>
      </div>

      <Section title="固定流程：15 個步驟" en="The 15-step analysis method">
        <Callout kind="method" title="使用方式">
          不要跳著做，而且<b>第 n 步的結論就填在下面工作紙的第 n 題</b>。前 5 步（clock → memory element 與觸發行為 → state bit → reset state 與 reset 的用途 → next-state
          equation）決定你是否真的看懂這顆電路的結構；第 6～10 步從 state table 逐 edge 推進到 divide ratio 與 duty；第 11～15 步處理 control deadline 與 mode
          switching、critical path 的 launch / capture / logic，以及 glitch 與 illegal state——這些常常就是「電路能不能用」的關鍵，而不只是「除幾」。
        </Callout>
        <Steps
          items={ANALYSIS_STEPS.map((s, i) => (
            <div key={s.title}>
              <div>
                <b>{s.title}</b>
                <span className="chip chip-info" style={{ marginLeft: '0.5em' }}>
                  工作紙 {WORKSHEET_QUESTIONS[i].label}
                </span>
              </div>
              <p className="small" style={{ margin: '0.25em 0 0.5em' }}>
                {s.how}
              </p>
              <div className="control-row" style={{ margin: 0 }}>
                {s.lessonIds.map((id) => (
                  <LessonLink key={id} id={id} />
                ))}
              </div>
            </div>
          ))}
        />
      </Section>

      <Section title="找 Critical Path 的十步（摘要）" en="Ten steps to find the critical path">
        <p>
          分析完「這顆電路做什麼」之後，下一個問題是「它能跑多快、什麼情況下會壞」。這需要另一套流程，因為
          <Term zh="臨界路徑" en="critical path" />
          永遠是相對於一個 launch point 與一個 capture point 而言，不是電路圖上看起來最長的那條線。完整版（含每一步的例子與陷阱）見下方連結；這裡先給十步摘要：
        </p>
        <Callout kind="method" title="十步流程摘要">
          <ol style={{ margin: 0 }}>
            {CP_METHOD_STEPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </Callout>
        <Link to="/lesson/m7-l2-cp-method" className="btn btn-primary">
          前往完整課程：如何從陌生電路找 Critical Path ▶
        </Link>
      </Section>

      <Section title="動手：分析你自己手上的 Divider" en="Analyze your own circuit">
        <p>
          下面是一張空白的 15 題分析工作紙，第 n 題就是上面第 n 步的結論（步驟標題後面也標了對應的 q 編號）。先幫這顆電路取個名字，然後照著上面每一步的「怎麼做」，把你自己推導出的答案填進同一個編號的題目——不確定就先點回對應課程看一次範例，再回來填。填完可以匯出成 Markdown，留給自己或同事對照。
        </p>
        <div className="control-row">
          <label>
            電路名稱
            <input
              type="text"
              value={circuitName}
              onChange={(e) => setCircuitName(e.target.value)}
              placeholder="例如：pll_top_u_div_n"
              style={{ padding: '0.3em 0.6em', border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--bg-elev)', minWidth: '16em' }}
            />
          </label>
        </div>
        <DividerAnalysisWorksheet storageKey="analyze-free" title="陌生 Divider 分析工作紙" circuitName={circuitName} />
      </Section>

      <Section title="帶著做一次" en="Try the full method once, with a known answer">
        <p>
          在拿真正陌生的電路練習之前，先在一個「有標準答案」的電路上完整跑一次這 15 步，確認自己每一步都做對，比較不會在真正陌生的電路上卡住。
        </p>
        <div className="grid-2">
          <Link to="/lab/ex1-div2" className="path-card">
            <h3>Lab 第 1 題：從最簡單的電路開始</h3>
            <p>Reverse Engineering Lab 的第一題附完整電路圖、工作紙、三級提示與解答——用它核對你剛剛 15 步流程的答案是否正確。</p>
          </Link>
          <Link to="/assessment/a" className="path-card">
            <h3>Assessment A：分析陌生 Divider 的能力評估</h3>
            <p>準備好之後，用 Assessment A 檢核自己是否能在有時間壓力、沒有提示的情況下，獨立完成整套分析流程。</p>
          </Link>
        </div>
      </Section>
    </div>
  )
}
