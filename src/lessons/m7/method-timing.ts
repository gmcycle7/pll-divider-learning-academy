import type { TimingScenario } from '@/models/timing/types'
import { gateCountTrapSchematic, modeAndSchematic, progDiv34Schematic } from './method-schematics'

/**
 * Lesson 7-2 練習電路的 timing scenario（三種 mode）
 *   tCQ 5/8；INV 4/7；AND 7/11；MUX data→out 9/14、sel→out 10/16；NOR 8/12；tsetup 7；thold 3
 *   env：Tclk 55、skew 0、jitter 3、margin 2 ⇒ required = 55 − 12 = 43
 *
 *   sel = 0（/3）：p2 = 40（slack 3，critical）、p3 = 33、p5 = 20、p1 = 15；Tclk,min = 52
 *   sel = 1（/4）：p4 = 22（slack 21，critical）、p5 = 20、p1 = 15；Tclk,min = 34
 *   hold（兩種 mode）：p1 min = 9 ⇒ slack 6（最差）；skew = +8 時變 −2
 */
export const progDiv34Timing: TimingScenario = {
  id: 'prog-div34',
  name: 'Programmable /3 /4',
  description: '同一個電路，sel 不同時被 sensitize 的 path 不同，critical path 與 Fmax 也跟著變。先選 mode，再看哪條 path 的 slack 最小。',
  schematic: progDiv34Schematic,
  env: { period: 55, skew: 0, jitter: 3, margin: 2 },
  modes: [
    { id: 'div3', label: 'sel = 0（/3）', description: 'MUX 選 in0：AND 那條被 sensitize' },
    { id: 'div4', label: 'sel = 1（/4）', description: 'MUX 選 in1：q0 直通，AND 那條不算' },
    { id: 'switch', label: 'sel 切換中', description: 'sel 不再是常數：sel → MUX → FF1.D 也要算' },
  ],
  paths: [
    {
      id: 'p1',
      name: 'FF1.Q → INV → FF0.D',
      type: 'setup',
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF1.clk', to: 'FF1.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff1'] },
        { id: 'inv', label: 'INV', from: 'q1', to: 'd0', kind: 'logic', min: 4, max: 7, wires: ['w_q1_inv', 'w_inv_d0'], elements: ['inv'], note: 'fanout 2' },
      ],
      description: '兩種 mode 都會被 sensitize（d0 = NOT q1 與 sel 無關）。它是最短的 path：hold check 要看它。',
      notes: ['setup arrival 15 ps，離 critical 很遠。', 'hold：min = 5 + 4 = 9 ps；required = thold + skew = 3 ⇒ slack 6。把 skew 改成 +8 就 violation。'],
      limits: 'hold（min-delay）',
    },
    {
      id: 'p2',
      name: 'FF1.Q → INV → AND → MUX(in0) → FF1.D',
      type: 'setup',
      modes: ['div3', 'switch'],
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF1.clk', to: 'FF1.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff1'] },
        { id: 'inv', label: 'INV', from: 'q1', to: 'd0', kind: 'logic', min: 4, max: 7, wires: ['w_q1_inv', 'w_d0_and'], elements: ['inv'] },
        { id: 'and', label: 'AND', from: 'd0', to: 'a', kind: 'logic', min: 7, max: 11, wires: ['w_and_mux'], elements: ['and'] },
        { id: 'mux', label: 'MUX in0→out', from: 'a', to: 'd1', kind: 'mux', min: 9, max: 14, wires: ['w_mux_d1'], elements: ['mux'] },
      ],
      sensitizedWhen: 'sel = 0（MUX 選 in0）',
      description: 'sel = 0 時的 critical path：三級 gate，arrival = 8 + 7 + 11 + 14 = 40 ps。',
      notes: ['sel = 1 時 MUX 不看 in0，這條 path 不管多慢都不影響 Fmax。', 'launch 與 capture 都是 FF1：edge k 送出，edge k+1 抓回。'],
      limits: 'Fmax（sel = 0）',
    },
    {
      id: 'p3',
      name: 'FF0.Q → AND → MUX(in0) → FF1.D',
      type: 'setup',
      modes: ['div3', 'switch'],
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'FF0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'and', label: 'AND', from: 'q0', to: 'a', kind: 'logic', min: 7, max: 11, wires: ['w_q0_and', 'w_and_mux'], elements: ['and'] },
        { id: 'mux', label: 'MUX in0→out', from: 'a', to: 'd1', kind: 'mux', min: 9, max: 14, wires: ['w_mux_d1'], elements: ['mux'] },
      ],
      sensitizedWhen: 'sel = 0',
      description: '同樣經過 AND 與 MUX，但少了 INV：arrival = 33 ps。',
      limits: 'Fmax（sel = 0，次要）',
    },
    {
      id: 'p4',
      name: 'FF0.Q → MUX(in1) → FF1.D',
      type: 'setup',
      modes: ['div4', 'switch'],
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'FF0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'mux', label: 'MUX in1→out', from: 'q0', to: 'd1', kind: 'mux', min: 9, max: 14, wires: ['w_q0_mux', 'w_mux_d1'], elements: ['mux'] },
      ],
      sensitizedWhen: 'sel = 1（MUX 選 in1）',
      description: 'sel = 1 時的 critical path：只有一個 MUX，arrival = 22 ps。',
      notes: ['sel = 1 時 Tclk,min = 22 + 7 + 3 + 2 = 34 ps；比 sel = 0 的 52 ps 快很多。'],
      limits: 'Fmax（sel = 1）',
    },
    {
      id: 'p5a',
      name: 'FF1.Q → NOR → FF2.D',
      type: 'setup',
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff2', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF1.clk', to: 'FF1.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff1'] },
        { id: 'nor', label: 'NOR', from: 'q1', to: 'd2', kind: 'logic', min: 8, max: 12, wires: ['w_q1_nor', 'w_nor_d2'], elements: ['nor'] },
      ],
      description: '輸出 retiming flop 的 D：兩種 mode 都會被 sensitize，arrival = 20 ps。',
      limits: 'Fmax（次要）',
    },
    {
      id: 'p5b',
      name: 'FF0.Q → NOR → FF2.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff2', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'FF0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'nor', label: 'NOR', from: 'q0', to: 'd2', kind: 'logic', min: 8, max: 12, wires: ['w_q0_nor', 'w_nor_d2'], elements: ['nor'] },
      ],
      description: '同一個 NOR 的另一個輸入：數字相同，但 launch point 不同，是另一條 path。',
      limits: 'Fmax（次要）',
    },
    {
      id: 'p6',
      name: 'sel → MUX(sel) → FF1.D',
      type: 'interface',
      modes: ['switch'],
      launch: { element: 'sel', edge: 'rising', clock: 'clk', label: 'mode register（外部）' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'in', label: 'input delay', from: 'mode reg', to: 'sel', kind: 'wire', min: 12, max: 20, wires: ['w_sel'], note: 'sel 從外部 mode register 出來的 tCQ + 走線（假設）' },
        { id: 'mux', label: 'MUX sel→out', from: 'sel', to: 'd1', kind: 'mux', min: 10, max: 16, wires: ['w_mux_d1'], elements: ['mux'], note: 'sel→out 通常比 data→out 慢' },
      ],
      sensitizedWhen: 'sel 在這個 cycle 改變',
      description: 'sel 靜態時這條 path 不會被 sensitize（case analysis）；只有在切換 mode 的那個 cycle 才算。arrival = 36 ps。',
      notes: ['Module 3 的 phase continuity 就是在問：sel 改變的那個 edge，d1 抓到的是新值還是舊值？'],
      limits: 'mode switching 的時序，不是穩態 Fmax',
    },
    {
      id: 'rst',
      name: 'rst_n → FF0/FF1/FF2（recovery / removal）',
      type: 'recovery',
      launch: { element: 'rst', edge: 'rising', clock: 'rst_n' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 10, hold: 5 },
      segments: [{ id: 'rst', label: 'rst_n wire', from: 'rst_n', to: 'FFx.rstn', kind: 'wire', min: 6, max: 8, note: 'reset 是全域網路，經過 buffer 樹' }],
      description: 'reset 釋放相對 clock edge 的要求：recovery 像 setup（rst_n 最晚要在 edge 前 t_recovery 到達）、removal 像 hold（最早也要在 edge 後 t_removal 才到）。不影響 Fmax，但影響 reset 後第一個 edge 是否可靠。',
      notes: ['這裡把 rst_n 的釋放時刻當作 launch edge：走線 max 8 ps 決定 recovery、min 6 ps 決定 removal。', '真實設計會用 reset synchronizer 讓釋放對齊 clk，把這條 path 從 async 變成同步。'],
      limits: 'reset release 的安全時間窗（Step 10）',
    },
    {
      id: 'out',
      name: 'FF2.Q → div_out（output）',
      type: 'output',
      launch: { element: 'ff2', edge: 'rising', clock: 'clk' },
      capture: { element: 'out', edge: 'rising', clock: 'clk' },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF2.clk', to: 'FF2.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff2'] },
        { id: 'wire', label: 'wire', from: 'q2', to: 'div_out', kind: 'wire', min: 2, max: 3, wires: ['w_out'] },
      ],
      description: '沒有 capture flop，只是 output latency；下一級是誰決定它會不會變成 interface path。',
      limits: 'output latency',
    },
  ],
}

/**
 * 反例一：gate 數最多 ≠ 最慢
 *   inverter 鏈 3 × 8 = 24 ps；NAND4（fanout 4）= 30 ps
 *   env Tclk 50、jitter 3、margin 2、setup 7 ⇒ required 38；inv chain slack 6、NAND4 slack 0
 */
export const gateCountTrapTiming: TimingScenario = {
  id: 'gate-count-trap',
  name: '3 個 inverter vs 1 個 NAND4',
  description: '三級 gate 的 path 24 ps，一級 gate 的 path 30 ps。數 gate 沒有用，要看每一級的實際 delay。',
  schematic: gateCountTrapSchematic,
  env: { period: 50, skew: 0, jitter: 3, margin: 2 },
  paths: [
    {
      id: 'inv-chain',
      name: 'FF_A.Q → INV → INV → INV → FF_B.D',
      type: 'setup',
      launch: { element: 'ffa', edge: 'rising', clock: 'clk' },
      capture: { element: 'ffb', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF_A.clk', to: 'FF_A.Q', kind: 'tcq', min: 5, max: 8, elements: ['ffa'] },
        { id: 'inv1', label: 'INV1', from: 'qa', to: 'n1', kind: 'logic', min: 5, max: 8, wires: ['w_q_inv1', 'w_inv12'], elements: ['inv1'], note: 'fanout 1' },
        { id: 'inv2', label: 'INV2', from: 'n1', to: 'n2', kind: 'logic', min: 5, max: 8, wires: ['w_inv23'], elements: ['inv2'], note: 'fanout 1' },
        { id: 'inv3', label: 'INV3', from: 'n2', to: 'FF_B.D', kind: 'logic', min: 5, max: 8, wires: ['w_inv3_d'], elements: ['inv3'], note: 'fanout 1' },
      ],
      description: '三個 gate，但每個都小又只推一個負載：logic 總和 24 ps。',
      limits: 'Fmax（次要）',
    },
    {
      id: 'nand4',
      name: 'FF_A.Q → NAND4 (fanout 4) → FF_C.D',
      type: 'setup',
      launch: { element: 'ffa', edge: 'rising', clock: 'clk' },
      capture: { element: 'ffc', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF_A.clk', to: 'FF_A.Q', kind: 'tcq', min: 5, max: 8, elements: ['ffa'] },
        { id: 'nand', label: 'NAND4', from: 'qa', to: 'FF_C.D', kind: 'logic', min: 18, max: 30, wires: ['w_q_nand', 'w_nand_d'], elements: ['nand'], note: '4 個 NMOS 疊起來 + 推 4 個負載' },
      ],
      description: '只有一個 gate，但 4-input NAND 的 pull-down 是 4 個 transistor 串聯，輸出又要推 4 個負載：30 ps。',
      limits: 'Fmax（這才是 critical path）',
    },
  ],
}

/**
 * 反例二：sensitization 由 mode 決定
 *   NOR path 8 + 12 = 20；AND path 8 + 18 = 26
 *   env Tclk 40、jitter 2、margin 2、setup 7 ⇒ required 29
 *   mod = 1：AND path critical（slack 3，Tclk,min 37）；mod = 0：只剩 NOR path（slack 9，Tclk,min 31）
 */
export const modeAndTiming: TimingScenario = {
  id: 'mode-and',
  name: '/2 /3 cell：AND 路徑只有 mod = 1 才算',
  description: 'mod = 0 時 d1 = q0 AND 0 = 0，AND 的輸出不會跟著 q0 變——這條 path 不被 sensitize。',
  schematic: modeAndSchematic,
  env: { period: 40, skew: 0, jitter: 2, margin: 2 },
  modes: [
    { id: 'mod0', label: 'mod = 0（/2）', description: 'd1 恆 0；q1 不動' },
    { id: 'mod1', label: 'mod = 1（/3）', description: 'AND 路徑被 sensitize' },
  ],
  paths: [
    {
      id: 'nor',
      name: 'FF0.Q → NOR → FF0.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'FF0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'nor', label: 'NOR', from: 'q0', to: 'd0', kind: 'logic', min: 8, max: 12, wires: ['w_q0_nor', 'w_nor_d0'], elements: ['nor'] },
      ],
      description: '兩種 mode 都會被 sensitize：q0 每個 cycle 都在變。',
      limits: 'Fmax（mod = 0）',
    },
    {
      id: 'nor1',
      name: 'FF1.Q → NOR → FF0.D',
      type: 'setup',
      modes: ['mod1'],
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF1.clk', to: 'FF1.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff1'] },
        { id: 'nor', label: 'NOR', from: 'q1', to: 'd0', kind: 'logic', min: 8, max: 12, wires: ['w_q1_nor', 'w_nor_d0'], elements: ['nor'] },
      ],
      sensitizedWhen: 'mod = 1（q1 才會動）',
      description: 'mod = 0 時 q1 永遠是 0，這個 launch point 根本沒有 launch 任何東西。',
      limits: 'Fmax（mod = 1，次要）',
    },
    {
      id: 'and',
      name: 'FF0.Q → AND (slow) → FF1.D',
      type: 'setup',
      modes: ['mod1'],
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'FF0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'and', label: 'AND (slow)', from: 'q0', to: 'd1', kind: 'logic', min: 12, max: 18, wires: ['w_q0_and', 'w_and_d1'], elements: ['and'] },
      ],
      sensitizedWhen: 'mod = 1',
      description: 'mod = 1 時的 critical path：arrival = 26 ps。mod = 0 時 AND 輸出被 mod = 0 鎖死，q0 怎麼變都無所謂。',
      limits: 'Fmax（mod = 1）',
    },
  ],
}

/**
 * 練習用 scenario：同一組 path，但 mode 順序改成 sel = 1 優先，
 * 讓 CriticalPathExplorer 一開始就顯示 /4 mode（元件預設選第一個 mode）。
 */
export const progDiv34ExerciseTiming: TimingScenario = {
  ...progDiv34Timing,
  id: 'prog-div34-exercise',
  name: 'Programmable /3 /4（練習：sel = 1）',
  description: '先在紙上把 sel = 1 的 Step 5～8 做完，再用這個面板核對；切到「sel 切換中」看 sel → MUX 那條 path 何時才算。',
  modes: [
    { id: 'div4', label: 'sel = 1（/4）', description: 'MUX 選 in1：q0 直通，AND 那條不算' },
    { id: 'switch', label: 'sel 切換中', description: 'sel 不再是常數：sel → MUX → FF1.D 也要算' },
    { id: 'div3', label: 'sel = 0（/3）', description: '課文走過的 mode，拿來對照' },
  ],
}

/* ------------------------------------------------------------------ */
/* 反例三：critical path 隨 PVT corner 改變                               */
/* 兩條 path 在 TT 幾乎一樣長；gate-heavy 的在 SS 最慢，wire-heavy 的在   */
/* FF-hot（電晶體快、金屬熱）反而變成 critical。                           */
/* ------------------------------------------------------------------ */
export interface CornerDef {
  id: string
  label: string
  /** transistor（tCQ + gate）delay 相對 TT 的倍率 */
  gate: number
  /** wire RC delay 相對 TT 的倍率（隨溫度變、幾乎不隨電壓變） */
  wire: number
  note: string
}
export interface CornerPathDef {
  id: string
  name: string
  /** TT corner 的 tCQ（ps） */
  tcq: number
  /** TT corner 的 gate delay 總和（ps） */
  gate: number
  /** TT corner 的 wire RC delay（ps） */
  wire: number
}
export const CORNERS: CornerDef[] = [
  { id: 'tt', label: 'TT・0.90 V・25 °C', gate: 1.0, wire: 1.0, note: 'typical：兩條差不多' },
  { id: 'ss-cold', label: 'SS・0.81 V・−40 °C', gate: 1.45, wire: 0.85, note: '低壓 + 冷：先進製程 temperature inversion，電晶體最慢；金屬冷、電阻小' },
  { id: 'ss-hot', label: 'SS・0.81 V・125 °C', gate: 1.35, wire: 1.3, note: '電晶體慢、金屬電阻大（Cu 約 +0.4 %/°C）' },
  { id: 'ff-hot', label: 'FF・0.99 V・125 °C', gate: 0.85, wire: 1.3, note: '電晶體快，但金屬還是熱的：wire 佔比放大' },
]
export const CORNER_PATHS: CornerPathDef[] = [
  { id: 'G', name: 'Path G：tCQ + 3 gates（gate-heavy，短走線）', tcq: 8, gate: 32, wire: 0 },
  { id: 'W', name: 'Path W：tCQ + 1 gate + 300 µm 走線（wire-heavy）', tcq: 8, gate: 10, wire: 20 },
]
/** 某 corner 下一條 path 的 max delay（ps）：transistor 部分乘 gate 倍率，wire 部分乘 wire 倍率 */
export function cornerDelay(p: CornerPathDef, c: CornerDef): number {
  return Math.round(((p.tcq + p.gate) * c.gate + p.wire * c.wire) * 10) / 10
}
/** 每個 corner 哪條 path 最慢 */
export function cornerCritical(paths: CornerPathDef[], c: CornerDef): CornerPathDef {
  return paths.reduce((worst, p) => (cornerDelay(p, c) > cornerDelay(worst, c) ? p : worst), paths[0])
}
