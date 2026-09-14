# PLL Divider Learning Academy

> Interactive divider &amp; critical-path teaching platform — 一個互動式的 PLL Divider 教學網站

一個給「熟悉類比 IC / PLL / SerDes，但數位基礎較弱」的工程師使用的互動式教學網站。目標不是背誦「這是一個除 3」，而是建立兩種可以套用在**任何**陌生電路上的能力：

1. **看懂一個陌生 divider**：clock input → memory element（DFF / TFF / latch / dynamic node / counter）→ 每個元件的 rising / falling / level-sensitive 行為 → feedback path → next-state equation → state transition table → 從 reset 逐 clock edge 推進 → reachable / unreachable / lock-up state → output edge → divide ratio / duty cycle → mode switching 是否 phase-continuous → glitch / runt / illegal state → reset 的用途 → control signal 的 timing deadline。
2. **找到真正的 critical path**：launch point → capture point → combinational cone → sensitization → arrival / required time → slack → setup 與 hold 與 pulse-width 是三種不同的違反類型 → 不同 mode 的 path 可能不同。

全站每一課都以「逐 clock edge 操作」為核心：理論從波形與 state 推導出來，不直接給答案。內容繁體中文為主，重要術語中英並列（例如「臨界路徑（critical path）」）。

網站有兩條主線入口：

- **路徑 A（`/`，從 Lesson 0-1 開始）**：從 clock edge、DFF 開始循序漸進學到 dual-modulus、MMD、PMUX、fractional/DTC。
- **路徑 B（`/analyze`）**：已經有分析基礎、手上有一顆陌生 divider 的人，直接套用固定的 15 步分析流程 + 10 步 critical path 流程，並用一張可匯出 Markdown 的工作紙記錄答案。

---

## 需求（Requirements）

- **Node.js ≥ 20**（本專案使用 Vite 6 / React 19 / TypeScript 5.8，建議搭配 Node 20 LTS 以上版本）
- npm（隨 Node.js 附帶即可；未特別要求版本）

## 安裝（Install）

```bash
npm install
```

## 開發模式（Dev server）

```bash
npm run dev
```

啟動 Vite dev server（預設 `http://localhost:5173`），有 HMR。路由使用 `HashRouter`（例如 `http://localhost:5173/#/analyze`），所以靜態部署不需要 server-side rewrite。

## Build

```bash
npm run build
```

等同 `tsc -b && vite build`：先做完整型別檢查，再輸出到 `dist/`。

## 預覽 Build 結果（Preview）

```bash
npm run preview
```

在本機用靜態伺服器預覽 `npm run build` 的輸出，用來確認 production build 沒有問題。

## 測試（Test）

```bash
npm run test        # vitest run，跑一次全部測試後結束（CI 用）
npm run test:watch  # vitest，watch 模式
```

測試分成四類：

| 檔案 | 驗證什麼 |
|---|---|
| `src/models/**/*.test.ts` | divider engine、state graph、STA、fractional sequence / DSM、phase / DTC 的數學與模擬行為。 |
| `src/lessons/**/models.test.ts`、`src/lab/exercises/*.test.ts` | 每一課與每一題自訂 netlist 的 state sequence、divide ratio、duty cycle、reachable / lock-up state，以及課文引用的 timing 數字。 |
| `src/lessons/registry.test.ts`、`src/lab/exercises/lab-registry.test.ts` | 課程與 Lab 的結構：id 唯一、每課有 goals / quiz / exercise、quiz 答案落在選項範圍內、8 題 Lab 各有 3 級提示與 15 題參考答案。 |
| `src/tests/render-lessons.test.tsx`、`src/tests/schematic-integrity.test.ts` | 每一課的 Content 與練習元件都能 render、沒有 placeholder、也沒有 KaTeX 解析錯誤；每張電路圖（不論定義在 `.ts` 或 `.tsx`，實測 103 張）的接線都指向存在的元件，每條 timing path（48 個 scenario）的 segment 都指向該圖真的有的 wire / element，critical-path 高亮不會畫空。 |

## Typecheck

```bash
npm run typecheck   # tsc -b --noEmit
```

## 一次跑完全部檢查

```bash
npm run check       # typecheck + test + build
```

---

## 目錄結構（Project structure）

```
src/
  components/
    layout/      AppShell, Sidebar, TopBar, ModeSwitch, ThemeToggle, ProgressBar
    content/     Section, Callout, Math (KaTeX), CodeBlock, ModeContent, Term, Steps
    waveform/    ClockWaveform（event → SVG step waveform；zoom / cursor / edge time / pulse width / phase Δ）
    sim/         EdgeStepper, StateTable, DividerSimPanel（model + stepper + waveform + table + equations）
    circuit/     LogicDiagram（Schematic data → SVG；hover/click/highlight/live values）, StateDiagram
    timing/      CriticalPathExplorer, TimingBudgetBar, SetupHoldDemo, PulseWidthDemo
    phase/       PhaseMuxVisualizer, DtcCarryVisualizer
    fractional/  DividerSequenceSimulator
    quiz/        QuizEngine（single / multiple / numeric / state-prediction / waveform-prediction / critical-path）
    lab/         DividerAnalysisWorksheet（15 題、進度、匯出 Markdown）
  models/
    divider/     types.ts（Netlist）, engine.ts（event-driven sim）, analysis.ts（state graph, divide ratio, duty, reachable/lock-up）, examples/*.ts
    timing/      types.ts, sta.ts（arrival / required / slack, hold, pulse width）, scenarios/*.ts
    fractional/  sequence.ts（average ratio, edge error, phase error, DFT）, dsm.ts（MASH-1）
    phase/       pmux.ts（phase rotation, wrap, carry）, dtc.ts（coarse/fine split, overflow）
  lessons/       registry.ts（modules → lessons）, types.ts, m0/…m8/ 每課一個 tsx（metadata + Content + quiz）
  lab/           exercises/*.ts（8 題資料）, types.ts（LabExercise）
  pages/         Home, LessonPage, ModuleQuizPage, LabPage, LabExercisePage, AssessmentPage, ReportPage, VerilogPage, AnalyzePage, NotFound
  hooks/         useProgress, useTheme, useExplainMode, useSimulation
  utils/         bits.ts, format.ts
  styles/        tokens.css, global.css
docs/
  agent-brief.md          給撰寫課程內容者的規則、可用元件、正確性要求
  implementation-plan.md  完整的 information architecture、資料模型、curriculum map
```

完整的資訊架構與資料模型定義（Netlist、TimingScenario、Schematic…）請見 [`docs/implementation-plan.md`](docs/implementation-plan.md)；撰寫新課程內容時務必先讀 [`docs/agent-brief.md`](docs/agent-brief.md)（語氣、正確性規則、檔案規則）。

### 路由（Routes）

```
/                       首頁（互動 /2 divider、兩條學習路徑、進度總覽）
/lesson/:lessonId       課程頁（三種解說模式、互動 demo、state table、quiz、練習）
/module/:moduleId/quiz  Module 總測驗
/lab                    陌生 Divider Reverse Engineering Lab 總覽
/lab/:exerciseId        單題（schematic、worksheet、三級 hint、解答）
/assessment/a           能力評估 A：分析陌生 divider 功能
/assessment/b           能力評估 B：找出 critical path
/report                 最終報告（七項能力）
/verilog                Verilog 教學與 Bug Lab
/analyze                路徑 B：「我有一個陌生 Divider」分析流程 + worksheet
*                       NotFound（導回首頁）
```

---

## 課程地圖（Curriculum map）

九個 Module，共 26 課（不含 Module 9 Lab）。Lesson id 即 `src/lessons/registry.ts` 內每一課的 `id`，也是路由 `/lesson/:lessonId` 的參數。

| Module | 標題 | Lesson id（順序） |
|---|---|---|
| 0　進入 Divider 世界前的必要觀念 | Digital foundations for divider analysis | `m0-l1-clock`, `m0-l2-comb-seq`, `m0-l3-dff` |
| 1　最基本的 Divider | Basic dividers | `m1-l1-div2`, `m1-l2-ripple`, `m1-l3-sync` |
| 2　Divide-by-3 與非 2 次方 Divider | Divide-by-3 and non-power-of-two dividers | `m2-l1-div3`, `m2-l2-odd-50` |
| 3　Dual-Modulus Divider | Dual-modulus dividers | `m3-l1-dm-concept`, `m3-l2-dm-cell`, `m3-l3-div12` |
| 4　Multi-Modulus Divider | Multi-modulus dividers (MMD) | `m4-l1-mmd`, `m4-l2-mmd-cp` |
| 5　Phase MUX Divider | Phase-MUX dividers | `m5-l1-phase`, `m5-l2-pmux-glitch`, `m5-l3-pmux-arch` |
| 6　Fractional Divider、DSM 與 DTC | Fractional division, DSM and DTC | `m6-l1-frac`, `m6-l2-dsm`, `m6-l3-dtc` |
| 7　Critical Path 專題 | Critical path deep dive | `m7-l1-cp-basics`, `m7-l2-cp-method`, `m7-l3-divider-paths`, `m7-l4-setup-hold-pw`, `m7-l5-transistor` |
| 8　Reset、Startup 與 Illegal State | Reset, startup and illegal states | `m8-l1-reset`, `m8-l2-self-recover` |
| 9　Reverse Engineering Lab | `/lab/*` | 8 題（`src/lab/exercises/*.ts`），各自有獨立的 `LabExercise.id` |

`src/lessons/registry.ts` 是唯一的 module/lesson 清單來源（`modules`、`allLessons`、`findLesson(id)`），新增課程時只需要在這個檔案裡加一行，不需要另外維護路由。

---

## 如何新增一個新的 divider lesson

以 `src/lessons/m1/l1-div2.tsx` 為範本，步驟如下：

1. **建立課程檔** `src/lessons/mX/lN-name.tsx`，`default export` 一個型別為 `LessonDef`（見 `src/lessons/types.ts`）的物件：

   ```ts
   interface LessonDef {
     id: string          // 必須與 registry.ts 內對應的 id 完全一致
     module: number
     order: number
     title: string
     titleEn: string
     summary: string
     goals: string[]     // 這一課要解決什麼問題，由 LessonPage 顯示在最上方
     readingMinutes?: number
     Content: ComponentType
     quiz: QuizQuestion[] // 至少 4 題，型別混合 single/multiple/numeric/state/waveform/critical-path
     exercise?: LessonExercise // 陌生電路分析練習
   }
   ```

2. **在 `src/lessons/registry.ts` 對應的 module 裡加入一行 `L(...)`**（`L` 是檔案開頭的小工廠函式）：

   ```ts
   L('mX-lN-name', X, N, '標題', 'Title (English)', '一句摘要', () => import('./mX/lN-name')),
   ```

   `load` 用動態 `import()`，課程內容是 lazy-loaded 的（`LessonPage` 會呼叫 `meta.load()`）。

3. **內容固定順序**（缺一不可，詳見 `docs/agent-brief.md`）：直覺說明 → 最簡單的電路（`LogicDiagram` + 同資料夾 `*-schematic.ts`）→ 逐 edge 操作（`DividerSimPanel`）→ 波形/state table/next-state equation → divide ratio 數學推導（`Math` KaTeX，公式要定義變數與單位）→ 這個架構的 critical path（`CriticalPathExplorer` + 同資料夾 `*-timing.ts`）→ 常見錯誤（`Callout kind="pitfall"`）→ quiz → 陌生電路分析練習 → 三種解說模式（初學者內容直接寫、`<ModeContent level="engineer">`、`<ModeContent level="deep">`）。

4. **這一課用到的資料放在同資料夾**：`mX/lN-name-schematic.ts`（`Schematic`）、`mX/lN-name-timing.ts`（`TimingScenario`）、需要的話也可以放 `mX/models.ts`（新 netlist）、`mX/Widgets.tsx`（小元件）；需要 CSS 就建 `mX/style.css` 並在 `.tsx` 內 `import './style.css'`。

5. **每一個新增的 netlist 都要有對應的 Vitest 測試**：`src/lessons/mX/models.test.ts`，用 `simulate` + `measureDivide` + `buildStateGraph` 驗證 state sequence、divide ratio、duty cycle、reachable / lock-up state（見下一節的範例程式碼）。

6. 完成後跑 `npx tsc -b 2>&1 | grep src/lessons/mX` 與 `npx vitest run src/lessons/mX`，兩者都要乾淨。

**檔案規則**：只建立 / 修改自己負責的課程檔；不要修改 `src/lessons/registry.ts` 以外的其他共用檔案（`App.tsx`、`src/styles/global.css`、`src/models/divider/examples/index.ts`）與別人的 lesson 檔。成品不能有 `PDLA_STUB`、TODO、Lorem Ipsum 或「之後再補」。

---

## 如何新增一個新的 state-machine model

所有 divider 都用同一個資料結構 `Netlist`（`src/models/divider/types.ts`）描述，由 `src/models/divider/engine.ts` 的 event-driven 模擬器執行。欄位說明：

| 欄位 | 說明 |
|---|---|
| `id`, `name`, `description?` | netlist 的識別碼與說明文字。 |
| `clocks: ClockDef[]` | 每個 clock 的 `name`、可選的 `period`（省略＝base period）、`phase`（0..1，以自身週期為單位）、`duty`（0..1，預設 0.5）。多相 clock（例如 8-phase PMUX）就是多個 `ClockDef`。 |
| `inputs: InputDef[]` | 除了 clock 以外的輸入訊號，例如 `mod`、`sel`：`name`、`initial`（初始值）、`description?`。 |
| `flops: FlopDef[]` | 每個 DFF/TFF：`q`（Q 訊號名）、`qb?`（Q̄，省略則不產生）、`d`（D 訊號名）、`clk`（**可以是任何訊號**，包含另一個 flop 的 `q`，用來描述 ripple）、`edge: 'rising'\|'falling'`、`rstn?`（非同步 active-low reset）、`resetValue?`（reset 後的值）、`tcq?`（real delay 模式用的 clock-to-Q，單位與 UI 顯示一致，習慣用 ps）、`label?`。 |
| `latches?: LatchDef[]` | level-sensitive latch：`q`、`d`、`en`、`activeHigh?`（預設 true）、`delay?`。 |
| `gates: GateDef[]` | combinational 元件：`out`（輸出訊號名）、`inputs: string[]`、`fn: (v: Values) => Bit`（純函數，`Values = Record<string, Bit>`）、`delay?`（real delay 模式用）、`label?`、`kind?`（`'inv'\|'buf'\|'and'\|'nand'\|'or'\|'nor'\|'xor'\|'xnor'\|'mux'\|'custom'`，只影響 `LogicDiagram` 怎麼畫）。可以用 `@/utils/bits` 的 `not/and/or/xor/nand/nor/mux` 組出 `fn`。 |
| `stateOrder: string[]` | 顯示 / 比對 state 用的 bit 順序，**MSB 在前**（例如 `['q1', 'q0']`）。 |
| `output: string` | 主要輸出訊號（例如 `div_out`）。 |
| `watch?: string[]` | 波形額外要顯示的訊號（例如中間的 `d0`、`carry`）。 |
| `equations: EquationDef[]` | 每個 D 的 next-state equation：`target`（訊號名）、`text`（純文字，例如 `d0 = NOT q0`）、`latex?`（KaTeX，例如 `d_0 = \overline{q_0}`）。 |
| `legalStates?: string[]` | 合法 state 清單；省略時由 `buildStateGraph` 從 reset state 自動推導 reachable set。 |
| `stepEdge?: 'rising'\|'falling'\|'both'` | 模擬器「一步」對應主 clock 的哪一種 edge；省略時用第一個 flop 的 `edge`。 |
| `defaultDelays?: { tcq?, gate? }` | real delay 模式沒有individually 指定 `tcq` / `delay` 時的預設值。 |

新增一個 netlist 的建議流程：

1. 在你負責的資料夾（lesson 用 `mX/models.ts`，或共用範例走 `src/models/divider/examples/<name>.ts`，但共用 `examples/index.ts` 由專案共同維護，個別 agent 不要自行修改）用上表欄位寫出 `Netlist`。
2. 先手動（在紙上或心裡）從 reset state 逐 edge 推進兩三步，寫下預期的 state sequence，再用 `simulate` 實際跑一次核對：

   ```ts
   import { describe, expect, it } from 'vitest'
   import { simulate } from '@/models/divider/engine'
   import { buildStateGraph, measureDivide, stateSequence } from '@/models/divider/analysis'
   import { myDivider } from './models'

   describe('myDivider', () => {
     it('state sequence 與 divide ratio 符合預期', () => {
       const { records, traces, period } = simulate(myDivider, 12, { period: 100 })

       // 1) state sequence：從 reset 逐 edge 推進的結果
       expect(stateSequence(myDivider, records)).toEqual(['1', '0', '1', '0', '1', '0', '1', '0', '1', '0', '1', '0'])

       // 2) divide ratio 與 duty：traces 是陣列，要用 find 取出單一訊號
       const out = traces.find((t) => t.name === myDivider.output)!
       const m = measureDivide(out, period)
       expect(m.ratio).toBe(2)
       expect(m.duty).toBeCloseTo(0.5)
       expect(m.periodic).toBe(true)

       // 3) reachable / unreachable / lock-up state：固定 input 下的完整 state graph
       const g = buildStateGraph(myDivider, { mod: 1 })
       expect(g.lockup).toEqual([])          // 沒有進不去主循環的 state
       expect(g.mainCycle.length).toBe(2)     // 主循環長度 = state 數
     })
   })
   ```

3. `simulate(netlist, n, opts?, inputAt?)` 是最方便的入口：內部建立 `DividerSim`、跑 `n` 個主 clock edge，回傳 `{ sim, records, traces, period }`；`records` 是每個 edge 的 `StepRecord`（`stateBefore` / `combBefore` / `stateAfter` / `output` / `events`），`traces` 是 `SignalTrace[]`（`sim.getTraces()` 的回傳值），可以直接餵給 `ClockWaveform`；要取單一訊號用 `traces.find((t) => t.name === '…')`（用字串 index 陣列只會拿到 `undefined`）。需要更細的控制（例如中途改變 input）時用 `createSim(netlist, opts)` 拿到 `DividerSim`，呼叫 `sim.stepEdge()` / `sim.setInput(name, v)` / `sim.run(n, inputAt)`。
4. `buildStateGraph(netlist, fixedInputs, resetState?)` 對固定的 input 組合窮舉所有 `2^stateBits` 個 state，回傳每個 state 的 `next` / `reachable` / `onCycle` / `lockup` / `stepsToCycle`，以及從 reset 出發的 `mainCycle`——這是驗證「有沒有 illegal state 會 lock-up」最直接的方法，也可以用 `graphToDiagram(g)`（`@/components/circuit/StateDiagram`）畫成圖。
5. `measureDivide(trace, clockPeriod, skipFirst?)` 從一段 output trace 量測 rising/falling edge 時間、`intervals`（相鄰 rising edge 間隔，以 clock period 為單位）、平均 `ratio`、`duty`、以及 `periodic`（是否每個 interval 都相同——不是的話代表 fractional 或有 mode switching，要另外分析）。`detectRuntPulses(traces, minWidth)` 可以抓出比 `minWidth` 窄的 pulse（runt / glitch）。
6. 在課程或 Lab 頁面用 `DividerSimPanel` 顯示這個 netlist：

   ```tsx
   <DividerSimPanel netlist={myDivider} schematic={mySchematic} title="我的新電路" />
   ```

   `DividerSimPanel` 內建 stepper、波形、state table、equations 與 measure；常用選配 props：`options={{ period, delayMode, initialState, prerun }}`、`showTable` / `showEquations` / `showNarration` / `showMeasure` / `showDelayMode` / `showInputs`、`highlights`、`narrate`、`allowInitialState`、`compact`、`showEdgeTimes`、`showPulseWidths`。

7. 波形一律由 engine（或 `models/*` 內的純函數）產生的 event 資料畫出來，**不可以手寫死座標**；`ClockWaveform` 只吃 `SignalTrace[]`。

---

## 如何新增 Lab 題目

Reverse Engineering Lab（`/lab`、`/lab/:exerciseId`）固定是 8 題，每題的型別是 `LabExercise`（`src/lab/types.ts`）：

```ts
interface LabExercise {
  id: string
  order: number
  title: string
  difficulty: 1 | 2 | 3 | 4 | 5
  summary: string
  netlist: Netlist            // 可模擬，但題目頁面不顯示 equations
  schematic: Schematic        // 題目電路圖（不標 critical path）
  simOptions?: SimOptions
  reference: Record<string, string> // 15 題工作紙（WORKSHEET_QUESTIONS）的參考答案，每一題的 key 都要有值
  hints: [string, string, string]   // 固定三級提示
  Solution: ComponentType     // 完整解答（可以是互動元件）
  criticalPath?: TimingScenario
  Prompt?: ComponentType      // 題目說明
}
```

新增一題的步驟：

1. 在 `src/lab/exercises/` 建立這題的資料檔（例如 `ex9-myname.tsx`——副檔名是 `.tsx`，因為 `Solution` / `Prompt` 是 React 元件），比照上面「新增 state-machine model」的方式先寫好 `netlist`、`schematic`，並用 `simulate` / `buildStateGraph` / `measureDivide` 驗證過一次。
2. 把 `reference` 填滿：`src/components/lab/worksheet.ts` 的 `WORKSHEET_QUESTIONS` 定義了固定 15 題（`q1`…`q15`），`reference` 物件的每一個 key 都要對到一題、都要有非空字串的參考答案。
3. 寫 `hints`：固定三個字串，由淺到深（例如「先找 clock 與 memory element」→「寫出 next-state equation」→「直接提示 divide ratio 是多少」）。
4. 寫 `Solution`（與可選的 `Prompt`）元件，通常是用 `DividerAnalysisWorksheet`（`showReference` + `reference`）加上 `DividerSimPanel` / `CriticalPathExplorer`。
5. 在 `src/lab/exercises/index.ts` 匯出所有題目。每個題目檔都是 `export default exercise`，所以這裡用 **default import**：

   ```ts
   import ex1 from './ex1-div2'
   // ... ex2 ～ ex7
   import ex8 from './ex8-pmux-nn1-dtc'

   export const exercises: LabExercise[] = [ex1, /* ... */, ex8].sort((a, b) => a.order - b.order)
   ```

   （真的要變成 9 題時，`lab-registry.test.ts` 裡「剛好 8 題」的斷言也要一起改。）

   `src/lab/exercises/lab-registry.test.ts` 會驗證：剛好 8 題、`id` 唯一、`hints` 長度為 3、`reference` 涵蓋全部 15 個 `WORKSHEET_QUESTIONS`、每題至少有一個 flop 或 latch、schematic 至少有一個 element、`order` 遞增排序。新增或調整題目後記得跑這個測試。

---

## 學習進度儲存位置（localStorage）

全部存在瀏覽器的 `localStorage`（前綴 `pdla.`），純前端、不會送到任何伺服器：

| Key | 內容 |
|---|---|
| `pdla.progress.v1` | 每一課的學習進度：`{ [lessonId]: { read, quizScore, quizTotal, exerciseDone, hintsUsed, lastSection, updatedAt } }`，由 `useProgress()` 讀寫。 |
| `pdla.theme` | 淺色 / 深色主題（`useTheme()`）。 |
| `pdla.mode` | 目前的解說模式：`beginner` / `engineer` / `deep`（`useExplainMode()`）。 |
| `pdla.worksheet.<storageKey>` | `DividerAnalysisWorksheet` 每一份工作紙的填答內容；`/analyze` 頁面用的空白工作紙 `storageKey` 是 `analyze-free`，實際 key 是 `pdla.worksheet.analyze-free`（另外還有 `pdla.worksheet.analyze-free.circuitName` 存使用者填的電路名稱）；Lab 各題各自有獨立的 `storageKey`（通常等於 `exercise.id`）。 |
| `pdla.assessment.*` | Assessment A / B 的作答與結果。 |
| `pdla.quiz.<storageKey>` | `QuizEngine` 暫存的作答內容；lesson 的 `storageKey` 等於 lesson id，Module 總測驗是 `module-<n>`。 |
| `pdla.moduleQuiz` | 每個 Module 總測驗的最佳成績：`{ [moduleId]: { score, total, at } }`。 |
| `pdla.lab.*` | Lab 各題的作答狀態（提示解鎖、是否已看解答）。 |
| `pdla.verilog.buglab.v1` | Verilog 頁 Bug Lab 已完成的案例。 |
| `pdla.m7.cp-checklist` | Lesson 7-2 的十步 critical-path checklist 勾選狀態。 |

想要重置學習狀態，直接清除瀏覽器該網站的 `localStorage` 即可（或在瀏覽器開發工具執行 `localStorage.clear()`）。

---

## 授權（License）

MIT License.
