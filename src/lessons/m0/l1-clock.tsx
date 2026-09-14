import type { LessonDef } from '@/lessons/types'
import { Callout, Math, ModeContent, Section, Steps, Term } from '@/components/content'
import { DividerSimPanel } from '@/components/sim/DividerSimPanel'
import { ClockWaveform } from '@/components/waveform/ClockWaveform'
import { ClockPlayground } from './ClockPlayground'
import { div2Duty30, div2Duty70, buildEdgeExerciseTraces, dutyWaveformOption } from './models'
import { div2FeedbackSchematic } from './schematics'

function Content() {
  return (
    <>
      <Section title="Level 與 Edge：兩種完全不同的東西" en="Level vs. edge">
        <p>
          你已經很熟悉「clock」這個詞——VCO 出來的就是 clock，PLL 鎖的也是 clock 的頻率跟相位。但在數位電路裡，我們要把一個 clock 波形拆成兩種完全不同的觀察角度：
        </p>
        <ul>
          <li>
            <Term zh="電位" en="level" />：<b>某一個時間點</b>，訊號是高（1）還是低（0）。這是一個「狀態」的描述，本身不會告訴你任何時間資訊。
          </li>
          <li>
            <Term zh="邊緣" en="edge" />：訊號<b>從一個電位變到另一個電位的那一瞬間</b>。上升緣（<Term zh="上升緣" en="rising edge" />）是 0→1，下降緣（<Term zh="下降緣" en="falling edge" />）是 1→0。edge 是一個「事件」，發生在某一個精確的時間點。
          </li>
        </ul>
        <Callout kind="idea">
          問自己：如果只給你「現在 clk = 1」這一個資訊，你能不能知道現在是不是剛好要觸發一個 DFF？答案是不能——你還需要知道<b>它是不是剛從 0 變成 1 的那一瞬間</b>。這就是為什麼後面每一課分析 divider，第一件事永遠是<b>找 edge</b>，而不是看某一瞬間的電位。
        </Callout>
      </Section>

      <Section title="基本定義：period、frequency、duty、phase" en="Basic definitions">
        <p>
          設一個 clock 每隔固定時間重複一次，這個固定時間叫 <Term zh="週期" en="period" />
          {' '}<Math>{'T'}</Math>（單位：秒，電路裡常用 ps、ns）。<Term zh="頻率" en="frequency" />
          {' '}<Math>{'f'}</Math> 是週期的倒數：
        </p>
        <Math block>{'f = \\dfrac{1}{T}\\qquad (T\\ \\text{的單位是秒，}f\\ \\text{的單位是 Hz})'}</Math>
        <p>
          <Term zh="工作週期" en="duty cycle" /> <Math>{'D'}</Math> 是「高電位時間」占整個週期的比例：
        </p>
        <Math block>{'D = \\dfrac{t_{high}}{T}\\times 100\\%'}</Math>
        <p>
          <Term zh="相位" en="phase" /> 描述一個週期性訊號「現在走到這一圈的哪個位置」，通常用角度（0°–360°）或用週期的分數（0–1 個 T）表示。
          <Term zh="相位差" en="phase difference" /> 則是兩個<b>同頻率</b>訊號之間，對應 edge 的時間差 <Math>{'\\Delta t'}</Math>，換算成角度是：
        </p>
        <Math block>{'\\Delta\\phi = \\dfrac{\\Delta t}{T}\\times 360^\\circ'}</Math>
        <p>
          最後，<Term zh="邊緣間隔" en="edge interval" /> 就是字面上的意思：兩個 edge 之間差多少時間。相鄰兩個同類型 edge（rising→rising，或 falling→falling）的間隔固定等於 <Math>{'T'}</Math>；rising→falling 的間隔是 <Math>{'D\\times T'}</Math>；falling→下一個 rising 的間隔是 <Math>{'(1-D)\\times T'}</Math>。
        </p>
      </Section>

      <Section title="動手玩：Clock Playground" en="Interactive playground">
        <p>
          拖動下面三個滑桿，觀察 <span className="mono">clk</span> 與 <span className="mono">clk_ref</span> 兩個波形、Δφ 標示、以及每一個 edge 的實際時間如何跟著變化。表格是<b>從波形的 event 資料直接算出來的</b>，不是先射好的數字。
        </p>
        <ClockPlayground />
        <Steps
          items={[
            <>
              把 <b>period</b> 從 100 拉大到 200：注意 edge 時間表裡，每一個 edge 的絕對時間都往後移，但表格最右欄「與上一個同型 edge 的間隔」欄位<b>永遠等於目前的 T</b>——這就是「相鄰同型 edge 間隔 = 週期」的定義本身。
            </>,
            <>
              把 <b>duty</b> 從 50% 改成 20%：T_high（rising→falling）明顯變短，T_low（falling→下一個 rising）變長，但兩者加起來永遠是一個 T。
            </>,
            <>
              把 <b>clk_ref phase</b> 從 0 拉到 90%：Δφ 從幾乎 0 一路逼近一整個 T——注意這裡的 Δφ 量的是「clk 的 rising edge 到<b>它之後</b>最近一個 clk_ref 的 rising edge」，所以永遠落在 0 到 T 之間，不會是負的。
            </>,
          ]}
        />
      </Section>

      <Section title="一個會讓你意外的例子：改變輸入 duty，輸出完全不變" en="Same /2 output, different input duty">
        <p>
          下面是同一個 <Term zh="除頻器" en="divider" /> 電路（這個系列後面會詳細拆解它，這裡你不需要看懂內部怎麼運作，只需要盯著<b>輸出</b>）：一個 DFF 把自己的 Q 反相接回 D，每個輸入 clock 的 <b>rising edge</b> 都會讓輸出翻轉一次。左邊輸入 clock 的 duty 是 30%，右邊是 70%——波形長得完全不一樣：
        </p>
        <div className="two-col">
          <DividerSimPanel netlist={div2Duty30} schematic={div2FeedbackSchematic} title="輸入 clk duty = 30%" compact showEquations={false} showEdgeTimes={false} />
          <DividerSimPanel netlist={div2Duty70} schematic={div2FeedbackSchematic} title="輸入 clk duty = 70%" compact showEquations={false} showEdgeTimes={false} />
        </div>
        <Callout kind="idea" title="為什麼輸出（q0）完全一樣？">
          因為這個電路只在 clk 的 <b>rising edge</b> 動作——falling edge 發生在哪裡，它根本不在乎。兩個波形的 rising edge 時間點完全相同（都在 <Math>{'t = T, 2T, 3T, \\dots'}</Math>），falling edge 在哪裡只影響「肉眼看到 clk 長什麼樣子」，不影響任何 memory element 的行為。這正是「divider 要追蹤 edge，不是追蹤 level」這句話最直接的證明。
        </Callout>
        <Callout kind="note" title="但不要過度推廣">
          這個結論只對「只用 rising edge 觸發、且沒有用到 pulse width 的電路」成立。後面 Lesson 2-2、5-2、7-4 會看到：odd divider 的 50% duty 修正、PMUX 的 glitch、以及任何用到 clock pulse width 的電路，duty 就會直接影響行為，不能隨便套用「duty 不重要」這個結論。
        </Callout>
      </Section>

      <Section title="常見錯誤" en="Common mistakes">
        <Callout kind="pitfall">
          <ul style={{ margin: 0 }}>
            <li>
              <b>把「頻率變高」講成「週期變大」</b>：<Math>{'f = 1/T'}</Math> 是反比，T 變小 f 才變大。
            </li>
            <li>
              <b>把 duty cycle 當成「訊號有一半時間是 1」的口語說法就結束</b>：duty 是<b>比例</b>，50% duty 的 100 ps 週期，高電位是 50 ps；50% duty 的 40 ps 週期，高電位是 20 ps——duty 本身不含絕對時間資訊。
            </li>
            <li>
              <b>相位差算成任意兩個 edge 的時間差</b>：一定要先講清楚是哪一種 edge 對哪一種 edge（rising 對 rising，或明確定義的對應關係），不然「Δt」沒有意義。
            </li>
            <li>
              <b>只看『現在是不是 1』就以為觸發了 edge-triggered 電路</b>：edge-triggered 元件（DFF）只在<b>電位剛好翻轉的那一瞬間</b>動作；電位維持在 1 的整段時間裡，DFF 不會被反覆觸發。這跟 level-sensitive 的 latch（下一課會看到）完全不同。
            </li>
          </ul>
        </Callout>
        <ModeContent level="engineer" title="這跟你已經知道的 PLL/VCO 概念怎麼對起來">
          <p>
            你在 PLL 裡談的「相位雜訊」「jitter」都是圍繞著 <b>edge 的時間不確定性</b>定義的——jitter 就是「同一個理論上應該固定間隔的 edge，實際到達時間的抖動量」。相位（phase）則是「長時間平均」下 edge 相對於參考的位置。這一課先建立最乾淨的理想波形觀念，Deep 模式會補上真實世界的偏差。
          </p>
        </ModeContent>
        <ModeContent level="deep" title="理想 edge 只是一個數學抽象">
          <ul>
            <li>
              真實的 clock buffer 有<Term zh="上升時間" en="rise time" />與<Term zh="下降時間" en="fall time" />（訊號從 10% 爬到 90% 電位所花的時間），不是真的「瞬間」翻轉；「edge 發生的時間」在實務上定義成訊號穿過 50% 電位的那一刻。
            </li>
            <li>
              rise time 與 fall time 如果不對稱，經過長長的 clock buffer chain 之後 duty cycle 會被扭曲——這正是為什麼有些設計需要 <Term zh="工作週期校正電路" en="duty cycle correction, DCC" />。
            </li>
            <li>
              <Term zh="抖動" en="jitter" /> 是「edge 到 edge」尺度的時間不確定性（cycle-to-cycle 或 period jitter），phase 則是長時間平均下的偏移量；兩者單位一樣（時間或角度），但描述的時間尺度完全不同，分析 divider 的 timing margin 時要分開處理，不能混在一起除以同一個安全裕度。
            </li>
          </ul>
        </ModeContent>
      </Section>
    </>
  )
}

function EdgeExerciseWave() {
  const T = 100
  const { clk, a, b } = buildEdgeExerciseTraces(T)
  return (
    <ClockWaveform
      signals={[clk, a, b]}
      tEnd={T * 6.5}
      period={T}
      showEdgeTimes={['a', 'b']}
      highlight={['a', 'b']}
    />
  )
}

const lesson: LessonDef = {
  id: 'm0-l1-clock',
  module: 0,
  order: 1,
  title: 'Clock 到底是什麼',
  titleEn: 'What is a clock, really?',
  summary: 'level 與 edge 的差異、period / frequency / duty / phase / edge interval 的精確定義，以及為什麼所有 divider 分析都要從追蹤 edge 開始。',
  goals: [
    '清楚分辨「電位（level）」與「邊緣（edge）」，並說出為什麼 edge-triggered 電路只在乎後者。',
    '給定 period 能算出 frequency，給定 phase 能算出兩個 clock 的時間差。',
    '解釋為什麼同一個只用 rising edge 的電路，輸入 duty cycle 改變時輸出可以完全不變。',
    '看一組陌生的波形，能判斷某訊號對齊 clk 的哪一種 edge、週期是 clk 的幾倍。',
  ],
  readingMinutes: 18,
  Content,
  quiz: [
    {
      id: 'q1',
      type: 'single',
      prompt: '下列何者正確描述「edge」？',
      options: ['某一個時間點訊號是高或低的狀態', '訊號從一個電位變到另一個電位的瞬間', '訊號維持在高電位的整段時間', '訊號的平均電壓'],
      answer: 1,
      explanation: 'edge 是一個事件（訊號翻轉的瞬間），跟「level（某一瞬間是 0 還是 1）」是完全不同的概念。',
    },
    {
      id: 'q2',
      type: 'numeric',
      prompt: '一個 clock 的週期 T = 50 ps，它的頻率是多少 GHz？',
      answer: 20,
      unit: 'GHz',
      explanation: 'f = 1/T = 1/(50 ps) = 20 GHz（1 GHz = 1/(1000 ps)，所以 1/50ps = 1000/50 GHz = 20 GHz）。',
    },
    {
      id: 'q3',
      type: 'numeric',
      prompt: 'clk 的週期是 100 ps，clk_ref 相位落後 clk 0.25 個週期（25%）。兩者最近的一組 rising edge 相差多少 ps？',
      answer: 25,
      unit: 'ps',
      explanation: 'Δt = phase × T = 0.25 × 100 ps = 25 ps。',
    },
    {
      id: 'q4',
      type: 'numeric',
      prompt: '一個週期 100 ps 的 clock，高電位維持 30 ps。它的 duty cycle 是多少 %？',
      answer: 30,
      unit: '%',
      explanation: 'D = t_high / T × 100% = 30/100 × 100% = 30%。',
    },
    {
      id: 'q5',
      type: 'multiple',
      prompt: '下列敘述哪些正確？（可能不只一個）',
      options: [
        'Divider 分析應該優先追蹤 edge，而不是只看某一瞬間的 level',
        '只用 rising edge 觸發、且不依賴 pulse width 的電路，輸出的行為不受輸入 duty cycle 影響',
        '頻率跟週期成正比，週期越長頻率越高',
        '兩個同頻率訊號的 phase difference，指的是對應 edge 之間的時間差',
      ],
      answers: [0, 1, 3],
      explanation: '頻率與週期成反比（f=1/T），選項 3 是錯的；其餘三項都正確——這也是本課最核心的三個結論。',
    },
    {
      id: 'q6',
      type: 'waveform',
      prompt: '下面哪一個波形正確畫出了 period = 100 ps、duty = 25% 的 clock？',
      options: [
        { label: 'A：高電位維持 25 ps', traces: dutyWaveformOption(25) },
        { label: 'B：高電位維持 60 ps', traces: dutyWaveformOption(60) },
      ],
      answer: 0,
      tEnd: 350,
      period: 100,
      explanation: 'duty = 25% 表示高電位只占週期的 25%，也就是 25 ps；選項 B 的高電位維持 60 ps，duty 是 60%，不符合題目。',
    },
  ],
  exercise: {
    title: '陌生波形分析：a、b 各自對齊 clk 的哪一種 edge？',
    prompt: (
      <p>
        下面畫出三個訊號：<span className="mono">clk</span>（週期 T，50% duty）、<span className="mono">a</span>、<span className="mono">b</span>。
        在看答案之前，先自己回答：<b>a 只在 clk 的哪一種 edge 改變？它的週期是 T 的幾倍？</b>接著回答 <span className="mono">b</span> 的同樣兩個問題。提示：不要看「a、b 什麼時候是 1」，要看「a、b 什麼時候<b>改變</b>，那個時間點 clk 剛好在做什麼」。
      </p>
    ),
    Component: EdgeExerciseWave,
    checklist: ['寫出 a 改變的時間點，對照 clk 在那些時間點是 rising 還是 falling edge', '寫出 a 的週期是 T 的幾倍', '對 b 重複同樣的兩個問題', '確認你的答案：a、b 是否都只在同一種 edge 改變（沒有混合 rising 和 falling）'],
    answer: (
      <>
        <p>
          <b>a</b>：改變的時間點是 1.5T、2.5T、3.5T…，剛好都是 clk 的 <b>falling edge</b>（這張圖的 clk 在 t = 0 到 T 之間維持 0，第一個 rising edge 在 t = T，所以 falling edge 落在 1.5T、2.5T、3.5T…；t = 0 只是初始電位，不是 edge）。a 從一次改變到下一次相同方向的改變（例如兩次上升之間）相隔 2T，所以 a 的週期 = <b>2T</b>，對齊 falling edge。
        </p>
        <p>
          <b>b</b>：改變的時間點是 T、3T、5T…，都剛好是 clk 的 <b>rising edge</b>，但不是每一個 rising edge 都會讓 b 改變——只有每隔一個才會。b 的週期 = <b>4T</b>，對齊 rising edge。
        </p>
        <p>
          這正是後面幾課要做的事：先確認一個陌生訊號改變的時間點對應到參考 clock 的哪一種 edge，再數「幾個 edge 之後它才會重複」，就能得到它相對 clk 的除頻比。
        </p>
      </>
    ),
  },
}
export default lesson
