import type { Netlist } from '@/models/divider/types'
import { div2 } from '@/models/divider/examples'
import { not, and, xor } from '@/utils/bits'
import { clockTrace, traceFrom } from '@/components/waveform/ClockWaveform'
import type { SignalTrace } from '@/models/divider/types'

// ============================================================ Lesson 0-1：Clock 到底是什麼 ============================================================

/**
 * 同一個 /2 divider，只把輸入 clock 的 duty cycle 改成 30% / 70%。
 * 目的：讓使用者親眼確認 q0 的序列、divide ratio、輸出 duty 完全不變──
 * 因為 FF0 只在 rising edge 動作，falling edge 在哪裡完全不影響結果。
 */
export const div2Duty30: Netlist = {
  ...div2,
  id: 'div2-duty30',
  name: 'DFF Divide-by-2（clk duty = 30%）',
  clocks: [{ name: 'clk', duty: 0.3 }],
}
export const div2Duty70: Netlist = {
  ...div2,
  id: 'div2-duty70',
  name: 'DFF Divide-by-2（clk duty = 70%）',
  clocks: [{ name: 'clk', duty: 0.7 }],
}

/** 由 clk 的 event 資料，逐一取出 rising / falling edge 的時間（給表格 / 練習用，不手寫座標） */
export function edgesOf(trace: SignalTrace): { t: number; type: 'rising' | 'falling' }[] {
  const out: { t: number; type: 'rising' | 'falling' }[] = []
  let prev: 0 | 1 | undefined
  for (const e of trace.events) {
    if (prev === 0 && e.v === 1) out.push({ t: e.t, type: 'rising' })
    if (prev === 1 && e.v === 0) out.push({ t: e.t, type: 'falling' })
    prev = e.v
  }
  return out
}

/**
 * 陌生波形練習：clk 為一般 50% duty 的 clock；
 * a 在 clk 的每一個 falling edge 翻轉一次 ⇒ a 的週期 = 2T，且只對齊 falling edge；
 * b 在 clk 每隔一個 rising edge 才翻轉一次 ⇒ b 的週期 = 4T，且只對齊 rising edge。
 * 兩個訊號都用「event 資料」逐點算出來，不是手畫座標。
 */
export function buildEdgeExerciseTraces(T: number, cycles = 6): { clk: SignalTrace; a: SignalTrace; b: SignalTrace } {
  const clk = clockTrace('clk', T, cycles)
  const aEvents: { t: number; v: 0 | 1 }[] = [{ t: 0, v: 0 }]
  let aVal: 0 | 1 = 0
  for (let n = 0; n < cycles; n++) {
    const tFall = T + n * T + 0.5 * T
    aVal = aVal ? 0 : 1
    aEvents.push({ t: tFall, v: aVal })
  }
  const bEvents: { t: number; v: 0 | 1 }[] = [{ t: 0, v: 0 }]
  let bVal: 0 | 1 = 0
  for (let n = 0; n < cycles; n += 2) {
    const tRise = T + n * T
    bVal = bVal ? 0 : 1
    bEvents.push({ t: tRise, v: bVal })
  }
  return { clk, a: traceFrom('a', aEvents, 'data'), b: traceFrom('b', bEvents, 'data') }
}

/** Quiz 用：兩個不同 duty 的 clock waveform（給 waveform 選擇題），由 clockTrace 產生 */
export function dutyWaveformOption(dutyPct: number): SignalTrace[] {
  return [clockTrace('clk', 100, 3, { duty: dutyPct / 100 })]
}

// ============================================================ Lesson 0-2：Combinational 與 Sequential Logic ============================================================

/** 單一 inverter：y = NOT a。沒有 clk、沒有 memory，a 一變 y 就跟著變（差一個 propagation delay）。 */
export const singleInv: Netlist = {
  id: 'single-inv',
  name: 'Inverter：y = NOT a',
  description: '純組合邏輯，沒有任何 memory element；clk 只是用來當時間刻度尺，電路本身不需要它。',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'a', initial: 0, description: '輸入（可隨時改變，不必等 edge）' }],
  flops: [],
  gates: [{ out: 'y', inputs: ['a'], fn: (v) => not(v.a), delay: 8, label: 'INV', kind: 'inv' }],
  stateOrder: [],
  output: 'y',
  equations: [{ target: 'y', text: 'y = NOT a', latex: 'y = \\overline{a}' }],
  defaultDelays: { tcq: 8, gate: 8 },
}

/** 3 級 inverter chain：a → b → c → out。沒有回授，純粹看 real delay 模式下延遲怎麼累積。 */
export const invChain3: Netlist = {
  id: 'inv-chain-3',
  name: '3 級 Inverter Chain',
  description: '三個 inverter 首尾相接、沒有回授路徑；real delay 模式下，變化要經過 3 個 tpd 才會走到輸出。',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'a', initial: 0, description: '輸入' }],
  flops: [],
  gates: [
    { out: 'b', inputs: ['a'], fn: (v) => not(v.a), delay: 10, label: 'INV1', kind: 'inv' },
    { out: 'c', inputs: ['b'], fn: (v) => not(v.b), delay: 10, label: 'INV2', kind: 'inv' },
    { out: 'out', inputs: ['c'], fn: (v) => not(v.c), delay: 10, label: 'INV3', kind: 'inv' },
  ],
  stateOrder: [],
  output: 'out',
  watch: ['a', 'b', 'c'],
  equations: [
    { target: 'b', text: 'b = NOT a', latex: 'b = \\overline{a}' },
    { target: 'c', text: 'c = NOT b', latex: 'c = \\overline{b}' },
    { target: 'out', text: 'out = NOT c', latex: 'out = \\overline{c}' },
  ],
  defaultDelays: { tcq: 8, gate: 10 },
}

/**
 * Latch 版本的「/2」：D = NOT Q，EN = clk（active high transparent latch）。
 * 這不是一個能正常工作的 divider──clk = 1 期間 latch transparent，
 * 形成「單一反相」的組合回授（Q = NOT Q 無解），real delay 模式下會在 clk 高電位期間反覆振盪。
 * 刻意鎖定在 real delay 模式：ideal（zero-delay）模型對這個回授沒有不動點解，
 * 事件驅動模拟器會在同一個時間點無窮次觸發、永遠跑不完，所以本課故意不提供 ideal/real 切換。
 */
export const latchDiv: Netlist = {
  id: 'latch-div',
  name: 'Latch feedback（D = NOT Q，EN = clk）',
  description: 'clk = 1 時 latch transparent，Q 跟著 NOT Q 跑；clk = 0 時鎖住最後的值。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [],
  latches: [{ q: 'q0', d: 'd0', en: 'clk', activeHigh: true, delay: 5, label: 'L0' }],
  gates: [{ out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV', kind: 'inv' }],
  stateOrder: ['q0'],
  output: 'q0',
  watch: ['d0'],
  equations: [
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
    { target: 'q0', text: 'q0 ← d0，僅當 clk = 1（transparent）；clk = 0 時 q0 保持', latex: 'q_0 \\leftarrow d_0 \\ \\text{if clk=1，否則 hold}' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * 3 級 inverter ring：a = kick ? 1 : NOT c，b = NOT a，c = NOT b，a → ... → c → a 回授。
 * 這是奇數（3）級反相的組合回授，Q = NOT...NOT Q 無解，real delay 模式下會自由振盪，
 * 頻率完全由 3 個 gate delay 決定，跟任何 clock 都沒有對齊關係——這正是它「不是 divider」的原因。
 * 同樣鎖定在 real delay 模式（理由同 latchDiv：ideal 模式沒有不動點解，會無窮觸發）。
 * kick 只在啟動時把 a 強制拉高，讓起始狀態確定；放開（kick = 0）之後才開始真正的自由振盪。
 */
export const ringOsc3: Netlist = {
  id: 'ring-osc-3',
  name: '3 級 Inverter Ring（純組合回授，沒有 memory element）',
  description: '沒有 flop、沒有 latch，只有 3 個 inverter 首尾相接；real delay 模式下會自由振盪。',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'kick', initial: 1, description: '拉高鎖定 a = 1（啟動用）；放開（=0）後開始自由振盪' }],
  flops: [],
  gates: [
    { out: 'a', inputs: ['c', 'kick'], fn: (v) => (v.kick ? 1 : not(v.c)), delay: 15, label: 'INV1', kind: 'inv' },
    { out: 'b', inputs: ['a'], fn: (v) => not(v.a), delay: 15, label: 'INV2', kind: 'inv' },
    { out: 'c', inputs: ['b'], fn: (v) => not(v.b), delay: 15, label: 'INV3', kind: 'inv' },
  ],
  stateOrder: [],
  output: 'a',
  watch: ['b', 'c'],
  equations: [
    { target: 'a', text: 'a = kick ? 1 : NOT c', latex: 'a = kick \\,?\\, 1 : \\overline{c}' },
    { target: 'b', text: 'b = NOT a', latex: 'b = \\overline{a}' },
    { target: 'c', text: 'c = NOT b', latex: 'c = \\overline{b}' },
  ],
  defaultDelays: { tcq: 8, gate: 15 },
}

/**
 * 混合 combinational + sequential 的小電路，給「陌生電路分析練習」用：
 * FF0：q0 ← q1（直接接前一級的 Q，沒有額外 gate）
 * FF1：q1 ← NOT(q0) AND en
 * flag = q0 XOR q1　　←　純組合訊號，不是 state bit，只是拿 q0/q1 做出來的輸出
 * state = (q1,q0)，reset 從 00 開始，會走遍 4 個 state 才回到 00（見 models.test.ts 驗證）。
 */
export const mixedFsm: Netlist = {
  id: 'mixed-fsm',
  name: '混合 comb + DFF 練習電路',
  description: '兩個 DFF 加三個 gate；找出哪些訊號是 memory element、哪些只是組合輸出。',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'en', initial: 1, description: '控制 FF1 是否可以被設為 1' }],
  flops: [
    { q: 'q0', d: 'q1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
  ],
  gates: [
    { out: 'q0n', inputs: ['q0'], fn: (v) => not(v.q0), delay: 5, label: 'INV', kind: 'inv' },
    { out: 'd1', inputs: ['q0n', 'en'], fn: (v) => and(v.q0n, v.en), delay: 6, label: 'AND', kind: 'and' },
    { out: 'flag', inputs: ['q0', 'q1'], fn: (v) => xor(v.q0, v.q1), delay: 5, label: 'XOR', kind: 'xor' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'flag',
  watch: ['q0n', 'd1'],
  equations: [
    { target: 'd0', text: 'd0 = q1（FF0 的 D 直接接 FF1 的 Q）', latex: 'd_0 = q_1' },
    { target: 'd1', text: 'd1 = NOT(q0) AND en', latex: 'd_1 = \\overline{q_0} \\cdot en' },
    { target: 'flag', text: 'flag = q0 XOR q1（純組合，不是 state bit）', latex: 'flag = q_0 \\oplus q_1' },
  ],
}
