# Agent Brief — PLL Divider Learning Academy

你正在為一個「互動式 divider 教學網站」撰寫課程內容與元件。專案是 React 19 + TypeScript + Vite + react-router（HashRouter）+ KaTeX + Vitest。
先讀：`docs/implementation-plan.md`，再讀範本課程 `src/lessons/m1/l1-div2.tsx`、`src/lessons/m0/l3-dff.tsx`、`src/lessons/m1/div2-schematic.ts`、`src/lessons/m1/div2-timing.ts`。所有課程必須遵守範本的結構與品質。

## 目標使用者
熟悉類比 IC / PLL / SerDes、但數位基礎較弱的工程師。知道 clock、frequency、VCO；看得懂 inverter/AND/OR/MUX/DFF 符號；但對 state、setup/hold、critical path 沒有直覺。**所有內容從直覺、波形、電路行為開始，再引入數學與 timing equation。**

## 語言與術語
繁體中文為主，重要術語第一次出現時用 `<Term zh="臨界路徑" en="critical path" />` 中英並列。訊號命名一律：`clk, rst_n, mod, sel, q0, q1, q2, d0, d1, d2, div_out, carry, phase_sel, dtc_code`。

## 每一課的固定順序（缺一不可）
1. `goals`（這一課要解決什麼問題）→ 由 LessonPage 顯示。
2. 生活化 / 直覺說明（`<Section>` + `<Callout kind="idea">`）。
3. 最簡單的電路（`<LogicDiagram schematic=...>`，資料寫在同資料夾 `*-schematic.ts`）。
4. 逐 edge 操作：`<DividerSimPanel netlist=... schematic=... />`（使用者按「下一個 Clock Edge」，看 current state / comb result / next state / output）。
5. 波形、state table、next-state equation（DividerSimPanel 內建；也可用 `<StateTable>`、`<StateDiagram>`、`<ClockWaveform>` 單獨呈現）。
6. divide ratio 的數學推導（`<Math block>` KaTeX，**所有公式要定義變數與單位**）。
7. 這個架構的 critical path（`<CriticalPathExplorer scenario=...>`，scenario 資料寫在 `*-timing.ts`）。
8. 常見錯誤（`<Callout kind="pitfall">`）。
9. 小測驗（`quiz` 陣列，每課 **至少 4 題**，型別見 `src/components/quiz/types.ts`；種類盡量混合 single / multiple / numeric / state / waveform / critical-path）。
10. 陌生電路分析練習（`exercise`：給一個變形電路，先讓使用者自己推，再提供 `Component`（DividerSimPanel）與 `answer`）。
11. 至少三種解說模式：初學者內容直接寫；工程師內容包在 `<ModeContent level="engineer">`（state/timing equation、RTL、電路路徑）；深入內容包在 `<ModeContent level="deep">`（高速實作、glitch、tCQ、setup/hold、pulse width、PVT、jitter margin）。

## 教學語氣（最重要）
不要直接給答案。不要說「這是一個除 3」，而是帶著做：初始 state？第一個 edge 後？第二個 edge 後？output 何時翻轉？下一次相同 state 何時出現？所以週期是多少？所以 divide ratio 是多少？critical path 也一樣：launch element 在哪？launch edge 是哪個？經過哪些 gate？capture element / edge？available time？tCQ、logic、setup、jitter、skew 各占多少？slack？換 mode 後會不會變？

## 可用的元件與模型（讀原始碼確認 props）
- `@/components/content`：`Section, Callout, Math, Term, Steps, CodeBlock, ModeContent, Tabs, BitVal, CompareTable, EquationList`
- `@/components/sim/DividerSimPanel`：`netlist, schematic?, options?({period, delayMode, initialState, prerun}), title, signals?, windowCycles?, showTable/showEquations/showNarration/showMeasure/showDelayMode/showInputs, highlights?, narrate?, allowInitialState?, compact?, showEdgeTimes?, showPulseWidths?`
- `@/components/sim/StateTable`, `@/components/sim/EdgeStepper`, `@/hooks/useSimulation`（自訂互動時用）
- `@/components/waveform/ClockWaveform`：吃 `SignalTrace[]`（`{name, events:[{t,v}], kind}`）+ `tEnd, period, markers, shades, annotations, showEdgeTimes, showPulseWidths, highlight, xSignals, deltaBetween`；另有 helper `clockTrace(name, period, cycles, {phase, duty})`、`traceFrom`。**波形一律由 event 資料產生，不可寫死座標。**
- `@/components/circuit/LogicDiagram` + `@/components/circuit/schematic`（`Schematic` 資料：elements 有 kind `dff|tff|latch|inv|buf|and|nand|or|nor|xor|xnor|mux2|mux4|mux8|port|box|text|dot`，pin 名稱：dff `d, clk, q, qb, rstn`；gate `in0..inN, out`；mux `in0.., sel, out`；port `p`；box 自訂 `pins`。wire `kind: clock|data|control|reset|output|feedback`，可用 `points` 指定折點。高亮用 `SchematicHighlight {style:'setup'|'hold'|'async'|'info', wires, elements, tags}`。）
- `@/components/circuit/StateDiagram`（`states, transitions, current, unreachable, lockup, outputs`；`graphToDiagram(buildStateGraph(...))`）
- `@/components/timing/CriticalPathExplorer`（`scenario: TimingScenario`，見 `src/models/timing/types.ts`；支援 `modes` 讓不同 mode 有不同 path；`guided` 逐步模式）、`TimingBudgetBar`、`SetupHoldDemo`、`PulseWidthDemo`
- `@/components/quiz/QuizEngine`、`@/components/lab/DividerAnalysisWorksheet`（15 題固定工作紙，`storageKey`、`reference`、`showReference`）
- `@/models/divider/engine`（`createSim`, `simulate(netlist, n, opts, inputAt)`）、`@/models/divider/analysis`（`nextStateOf, buildStateGraph, measureDivide, detectRuntPulses, stateSequence, findPeriod, valueAt`）、既有 netlist：`@/models/divider/examples`（`div2, div2NoReset, ripple4, ripple8, sync4, sync8, div3, div3Lockup, div3Recover, div3Duty50, dualMod23, muxSelect23, dualMod12, dualMod12Glitchy, mmd2, mmdRatio, dffFollow, tff, ringOsc`）
- `@/models/timing/sta`（`analyzeSetup, analyzeHold, analyzePulseWidth, tclkMin`）、`@/models/fractional/sequence`、`@/models/fractional/dsm`、`@/models/phase/pmux`、`@/models/phase/dtc`
- `@/utils/bits`（`not, and, or, xor, nand, nor, mux, toBitString…`）、`@/utils/format`（`fmtT, fmtNum, pct`）

Netlist 格式見 `src/models/divider/types.ts`：`clocks, inputs, flops({q, qb?, d, clk, edge, rstn?, resetValue, tcq}), latches?, gates({out, inputs, fn, delay, label, kind}), stateOrder(MSB first), output, watch, equations({target, text, latex}), legalStates?, stepEdge?`。engine 為 event-driven，flop 的 clk 可以是任何訊號（ripple），可多個 clock（多相），支援 async reset 與 latch，`delayMode: 'ideal' | 'real'`。

## 檔案規則（避免衝突）
- 只建立 / 修改你被指派的檔案。**不要修改** `src/lessons/registry.ts`、`src/App.tsx`、`src/styles/global.css`、`src/models/divider/examples/index.ts`、任何其他 agent 的 lesson 檔。
- 你需要的新 netlist / schematic / timing scenario / 小元件，放在你的 lesson 資料夾（例如 `src/lessons/m3/models.ts`、`src/lessons/m3/schematics.ts`、`src/lessons/m3/timing.ts`、`src/lessons/m3/Widgets.tsx`）。需要 CSS 就建 `src/lessons/mX/style.css` 並在 lesson tsx `import './style.css'`。
- 你新增的每一個 netlist 都必須有 Vitest 單元測試（`src/lessons/mX/models.test.ts`）：驗證 state sequence、divide ratio、duty cycle、reachable / lock-up state（用 `simulate` + `measureDivide` + `buildStateGraph`）。
- lesson 檔以 `export default lesson`（型別 `LessonDef`，`id/module/order/title/titleEn/summary/goals/Content/quiz/exercise`）匯出；`id` 必須與 registry 內一致（見檔案內原本的 stub 值）。
- 刪除檔案內的 `PDLA_STUB` 標記——成品不能有任何 placeholder、TODO、Lorem Ipsum、「之後再補」。

## 內容正確性（違反者視為失敗）
1. 不要把最長的 wire 直接稱為 critical path；critical path 必須有 launch point 與 capture point，且只有會被 sensitize 的路徑才算。
2. 不要把所有 output delay 都叫 setup critical path。
3. 不要混淆 setup violation、hold violation 與 pulse-width violation。
4. 不要把 ripple divider 當作 synchronous timing path 分析（ripple 每級 clock 不同，是 clock-path 累積延遲問題）。
5. 不要假設所有 /3 都有 50% duty。
6. 不要把「/2 與 /3 output 經 MUX 選擇」等同 dual-modulus divider。
7. 不要忽略 mode switching 的 phase continuity。
8. 不要忽略 reset release 的 recovery/removal。
9. average divide ratio 與每 cycle instantaneous divide value 要分清楚。
10. DTC overflow carry 與 divider modulus control 在沒有架構定義時不能直接畫等號。
11. PMUX glitch 不能只解釋成普通 data setup problem（是 pulse width / runt 問題）。
12. 不要只給 RTL 而沒有波形與 state 說明。
13. 公式都要定義變數與單位。
14. 波形必須和 state table 一致（用 engine 產生就自然一致）。
15. 每個電路解說都要能從初始 state 逐 edge 驗證（你自己先用 `simulate` 跑一次，把結果寫進課文與測試）。
16. clock skew 的正負方向不要死背，從 launch edge 與 capture edge 的相對位置解釋（本專案定義 skew = capture clock 到達 − launch clock 到達）。

## 完成前自我驗證
- `npx tsc -b 2>&1 | grep -E "src/lessons/mX|你的檔案"` 必須沒有錯誤（其他 agent 的檔案可能暫時有錯，忽略不屬於你的）。
- `npx vitest run src/lessons/mX` 全綠。
- 在回覆中列出：你建立/修改的檔案、每課的 quiz 題數、互動 demo 清單、你用 simulate 驗證過的 state sequence 與 divide ratio。
