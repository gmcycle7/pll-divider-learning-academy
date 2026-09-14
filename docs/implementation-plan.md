# PLL Divider Learning Academy — Implementation Plan

## 0. 目標與主線

兩條主線貫穿所有課程：

1. **看懂陌生 divider**：clock → memory elements → next-state equation → state table → 逐 edge 推進 → reachable states → output edge → divide ratio / duty → mode switching phase continuity → glitch / illegal state → reset → control timing deadline。
2. **找到真正的 critical path**：launch point → combinational cone → capture point → sensitization → arrival / required / slack → setup vs hold vs pulse-width vs recovery/removal → mode-dependent path。

每一課都以「逐 clock edge 操作」為核心，理論從波形與 state 推出來，而不是先給結論。

## 1. Information Architecture

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
/analyze                「我有一個陌生 Divider」路徑入口：分析流程 + worksheet
*                       NotFound（導回首頁）
```

Router 使用 `HashRouter`，靜態部署不需 server rewrite，不會出現 broken route。

版面：左側課程導覽（module → lesson，含完成標記）、上方 breadcrumb（module / lesson）＋解說模式切換＋主題切換、主內容區最大寬度 1100px，平板單欄，手機可讀課文與 waveform（waveform 可橫向捲動）。

## 2. Curriculum Map

| Module | Lesson id | 標題 | 核心互動 |
|---|---|---|---|
| 0 基礎 | `m0-l1-clock` | Clock 到底是什麼 | ClockPlayground（frequency / duty / phase / edge time） |
| | `m0-l2-comb-seq` | Combinational 與 Sequential Logic | inverter chain vs DFF feedback、latch 透明性 demo |
| | `m0-l3-dff` | DFF、TFF 與 Clock-to-Q | SetupHoldDemo（拖曳 D transition 時間） |
| 1 基本 divider | `m1-l1-div2` | DFF Divide-by-2 | DividerSimPanel(div2) + CriticalPathExplorer |
| | `m1-l2-ripple` | Ripple Counter Divider | ripple /4、/8，可調 tCQ，ideal vs real 波形 |
| | `m1-l3-sync` | Synchronous Counter Divider | sync /4 與 ripple 比較 |
| 2 非 2 次方 | `m2-l1-div3` | State Machine Divide-by-3 | StateDiagram、unused state、gate-level |
| | `m2-l2-odd-50` | Odd Divider 與 50% Duty | rising+falling 合成、glitch 風險 |
| 3 dual-modulus | `m3-l1-dm-concept` | /2 /3 Dual-Modulus 是什麼 | A（state-continuous）vs B（MUX 選輸出）波形比較 |
| | `m3-l2-dm-cell` | /2 /3 Cell State Analysis | 逐 edge 切 MOD，MOD 時間點掃描 |
| | `m3-l3-div12` | /1 /2 Dual-Modulus Concept | edge timeline、safe switching window |
| 4 MMD | `m4-l1-mmd` | 兩級 /2 /3 Cell 的除數 | 兩級 MMD 互動 |
| | `m4-l2-mmd-cp` | MMD 的 Critical Path | Critical Path Highlighter |
| 5 PMUX | `m5-l1-phase` | 多相 Clock 與 Phase Selection | PhaseMuxVisualizer 8-phase wheel |
| | `m5-l2-pmux-glitch` | PMUX Glitch 與 Safe Window | select 時間拖曳、runt 判定 |
| | `m5-l3-pmux-arch` | PMUX + /N/N+1 | 三種架構 trade-off |
| 6 fractional | `m6-l1-frac` | Fractional Divide Ratio | DividerSequenceSimulator |
| | `m6-l2-dsm` | DSM 的角色 | MASH-1 sequence、dither、PSD 概念圖 |
| | `m6-l3-dtc` | DTC、PHOS 與 Residual Phase | DtcCarryVisualizer（3+6 bit） |
| 7 critical path | `m7-l1-cp-basics` | 什麼是 Critical Path | TimingBudgetBar 數值範例 |
| | `m7-l2-cp-method` | 從陌生電路找 Critical Path | 十步流程、sensitization |
| | `m7-l3-divider-paths` | Divider 特有 Timing Path | 案例 A–F |
| | `m7-l4-setup-hold-pw` | Setup、Hold 與 Pulse Width | 三個 violation demo |
| | `m7-l5-transistor` | Critical Path 與 Transistor-Level Speed | CML/TSPC/dynamic 討論 |
| 8 reset | `m8-l1-reset` | Divider 為什麼需要 Reset | 任意 state 啟動 state graph |
| | `m8-l2-self-recover` | Self-Recovering State Machine | 壞版 vs 修正版比較 |
| 9 Lab | `/lab/*` | 8 題 reverse engineering | worksheet + 3 hints + 解答 |

## 3. Component Architecture

```
src/
  components/
    layout/      AppShell, Sidebar, TopBar, ModeSwitch, ThemeToggle, ProgressBar
    content/     Section, Callout, Math (KaTeX), CodeBlock, ModeContent, Term, Steps
    waveform/    ClockWaveform（event → SVG step waveform；zoom / cursor / edge time / pulse width / phase Δ）
    sim/         EdgeStepper, StateTable, DividerSimPanel（model + stepper + waveform + table + equations）
    circuit/     LogicDiagram（Schematic data → SVG；hover/click/highlight/live values）, StateDiagram
    timing/      CriticalPathExplorer, TimingBudgetBar, SetupHoldDemo, PulseWidthDemo
    phase/       PhaseMuxVisualizer
    dtc/         DtcCarryVisualizer
    fractional/  DividerSequenceSimulator
    quiz/        QuizEngine（single / multiple / numeric / state-prediction / waveform-prediction / critical-path）
    lab/         DividerAnalysisWorksheet（15 題、進度、匯出 Markdown）
  models/
    divider/     types.ts（Netlist）, engine.ts（event-driven sim）, analysis.ts（state graph, divide ratio, duty, reachable/lock-up）, examples/*.ts
    timing/      types.ts, sta.ts（arrival / required / slack, hold, pulse width）
                 ※ 各課的 TimingScenario 與 Schematic 就近放在該課資料夾（mX/*-timing.ts、*-schematics.ts），
                   由 src/tests/schematic-integrity.test.ts 驗證 segment 參照的 wire / element 真的存在
    fractional/  sequence.ts（average ratio, edge error, phase error, DFT）, dsm.ts（MASH-1）
    phase/       pmux.ts（phase rotation, wrap, carry）, dtc.ts（coarse/fine split, overflow）
  lessons/       registry.ts（modules → lessons）, types.ts, m0/…m8/ 每課一個 tsx（metadata + Content + quiz）
  lab/           types.ts, exercises/ex1…ex8（8 題資料，各自 default export LabExercise）
  pages/         Home, LessonPage, ModuleQuizPage, LabPage, LabExercisePage, AssessmentPage, ReportPage, VerilogPage, AnalyzePage, NotFound
  hooks/         useProgress, useTheme, useExplainMode, useSimulation
  utils/         bits.ts, format.ts
  styles/        tokens.css, global.css
```

## 4. Divider Simulation Model（Netlist）

所有 divider 用同一個資料結構描述，engine 為 event-driven（支援 delay、ripple clock、多相 clock、async reset、latch）：

```ts
type Bit = 0 | 1
interface Netlist {
  id: string; name: string
  clocks: { name: 'clk' | string; period?: number; phase?: number; duty?: number }[]
  inputs: { name: string; initial: Bit; description?: string }[]     // mod, sel, rst_n...
  flops: { q: string; d: string; clk: string; edge: 'rising'|'falling'; rstn?: string; resetValue: Bit; tcq?: number; label?: string }[]
  latches?: { q: string; d: string; en: string; activeHigh: boolean; delay?: number }[]
  gates: { out: string; inputs: string[]; fn: (v: Record<string,Bit>) => Bit; delay?: number; label?: string; kind?: GateKind }[]
  stateOrder: string[]        // 顯示 state 時的 bit 順序（MSB first）
  output: string              // 主要輸出 (div_out)
  watch?: string[]            // 波形額外顯示的訊號
  equations: { target: string; text: string; latex?: string }[]
  legalStates?: string[]      // 可省略：由 analysis 從 reset 推導
}
```

* **State**：所有 flop `q` 的值（依 `stateOrder` 排成 bit-string，如 `q1q0 = "01"`）。
* **Next-state**：以 zero-delay 迭代求 comb fixed point 後讀取每個 flop 的 `d`。
* **Engine**：`createSim(netlist, opts)` → `sim.stepEdge()` 逐主 clock edge 推進，回傳 `StepRecord { edgeIndex, t, inputs, stateBefore, combBefore, stateAfter, outputs, events }`；`sim.setInput(name, v)` 在下一個 edge 前 `tInputLead` 時間生效；`sim.trace` 為所有訊號的 `{t, v}[]` events，直接餵給 ClockWaveform。
* **Delay 模式**：`ideal`（delta cycle）與 `real`（tcq / gate delay，單位 ps，可由 UI 調整）。
* **Analysis**：`buildStateGraph(netlist, fixedInputs)` → 所有 2^n state 的 transition、reachable set、cycle、lock-up；`measureDivide(trace, outputName, clockPeriod)` → ratio、duty、edge interval；`detectGlitches(trace, minPulse)`。

## 5. Waveform Data Model

`SignalTrace = { name: string; events: { t: number; v: Bit }[]; kind?: 'clock'|'data'|'control'|'output'|'reset' }`。
ClockWaveform 只吃 events，不接受硬編座標。所有課程波形皆由 engine 或 `models/*` 的純函數產生（fractional / PMUX / DTC 亦以 event 產生）。

## 6. Critical Path Data Model

```ts
interface TimingSegment { id: string; label: string; from: string; to: string; kind: 'tcq'|'logic'|'wire'|'mux'|'setup'; min: number; max: number; wires?: string[]; elements?: string[] }
interface TimingPath   { id: string; name: string; type: 'setup'|'hold'|'pulse-width'|'recovery'|'async'|'output'|'interface'; mode?: string;
                         launch: { element: string; edge: 'rising'|'falling'; clock: string }; capture: { element: string; edge: ...; clock: string; setup?: number; hold?: number };
                         segments: TimingSegment[]; multicycle?: number; sensitizedWhen?: string; notes?: string[] }
interface TimingScenario { id: string; schematic: Schematic; clockPeriod: number; skew: number; jitter: number; margin: number; paths: TimingPath[]; modes?: { id, label, activePaths: string[] }[] }
```
`sta.ts` 提供 `analyzeSetup(path, env)`、`analyzeHold(path, env)`、`analyzePulseWidth(...)` → `{ arrival, required, slack, breakdown[] }`；CriticalPathExplorer 用 TimingBudgetBar 顯示 breakdown，並把 `segments[].wires / elements` 交給 LogicDiagram 高亮（紅粗實線＋箭頭＋標籤 = setup；藍虛點線 = hold；灰虛線 = async）。

## 7. Schematic Data Model（LogicDiagram）

```ts
interface Schematic { width: number; height: number; elements: SchElement[]; wires: SchWire[] }
SchElement = { id; kind: 'dff'|'tff'|'latch'|'inv'|'buf'|'and'|'nand'|'or'|'nor'|'xor'|'xnor'|'mux2'|'mux4'|'port'|'box'|'text'; x; y; label?; inputs?: number; dir?: 'in'|'out'; flip?: boolean; w?; h?; sub?: string }
SchWire   = { id; from: 'elem.pin'; to: 'elem.pin'; signal?: string; kind?: 'clock'|'data'|'control'|'reset'|'output'|'feedback'; points?: [number,number][]; label?: string }
```
Pin 名稱：dff `d, clk, q, qb, rstn`；gate `in0..inN, out`；mux `in0, in1, sel, out`；port `p`。渲染器自動做正交走線（可用 `points` 覆寫），顯示 live value、箭頭方向、hover 說明、click 顯示該元件 timing arc。

## 8. 學習進度

`localStorage['pdla.progress.v1']`：`{ [lessonId]: { read, quizScore, quizTotal, exerciseDone, hintsUsed, lastSection, updatedAt } }`；另存 `pdla.theme`、`pdla.mode`（beginner/engineer/deep）、`pdla.worksheet.*`、`pdla.assessment.*`。

## 9. Testing Strategy

* `models/divider/*.test.ts`：每個 example netlist 的 state sequence、divide ratio、duty cycle、reachable / lock-up states（div2、ripple4、ripple8、sync4、div3、div3-recover、dm23 MOD=0/1、div12、mmd2 各組合、pmux）。
* `models/timing/sta.test.ts`：Lesson 7-1 數值範例（50/8/25/7/4 → slack 6 ps）、hold、pulse width。
* `models/fractional/*.test.ts`：sequence 平均除數、phase error 累積、MASH-1 平均值。
* `models/phase/*.test.ts`：phase rotation wrap-around carry、DTC overflow carry。
* `lessons/registry.test.ts`：所有 lesson id 唯一、quiz 至少 30 題、8 題 lab、每題 3 個 hint。
* CI：`npm run check` = typecheck + vitest + build。

## 10. Implementation Sequence

1. 骨架：tokens / global CSS、AppShell、Router、registry、progress hook、Math。
2. 模型：Netlist engine、analysis、div2 + dff examples、sta。
3. 核心元件：ClockWaveform、EdgeStepper、StateTable、LogicDiagram、DividerSimPanel、CriticalPathExplorer、TimingBudgetBar、QuizEngine、Worksheet。
4. Vertical slice：Home、Lesson 0-3、Lesson 1-1，含 quiz 與進度。
5. 其餘 example models + tests（ripple、sync4、div3、dm23、div12、mmd2、pmux、dtc、fractional）。
6. 其餘 lessons（依優先序：基礎 → /2 /3 → critical path → dual-modulus → MMD → PMUX → DSM/DTC → Lab）。
7. Verilog 頁 + Bug Lab、Assessment A/B、Report、README。
8. 驗證：typecheck、unit tests、build、route check（headless browser 走訪所有 route）、responsive check。
