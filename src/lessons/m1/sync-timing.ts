import type { TimingScenario } from '@/models/timing/types'
import { sync4Schematic, sync8Schematic } from './sync-schematics'

/**
 * Lesson 1-3：同步 /4 counter 的 critical path。
 * 數值（ps）：tCQ 5/8，INV 4/6，XOR 8/12，tsetup 7，thold 3，T = 40，jitter 2，margin 2。
 *  FF0.Q → INV → FF0.D：arrival 14，required 29 ⇒ slack +15
 *  FF0.Q → XOR → FF1.D：arrival 20，required 29 ⇒ slack +9 ← setup critical
 *  FF1.Q → XOR → FF1.D：arrival 20 ⇒ slack +9（同分）
 */
export const sync4Timing: TimingScenario = {
  id: 'sync4',
  name: '同步 /4：INV path vs XOR path',
  description: '所有 flop 共用 clk，所以每一條 register-to-register path 的可用時間都是一個 Tclk；哪一條 slack 最小，就由 next-state logic 的 delay 數字決定。',
  schematic: sync4Schematic,
  env: { period: 40, skew: 0, jitter: 2, margin: 2 },
  paths: [
    {
      id: 'q0-inv-d0',
      name: 'FF0.Q → INV → FF0.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(FF0)', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'inv', label: 'INV', from: 'q0', to: 'd0', kind: 'logic', min: 4, max: 6, wires: ['w_q0_inv', 'w_d0'], elements: ['inv0'], note: 'inverter：最快的 gate' },
      ],
      description: '與 /2 一模一樣的 loop：launch 在 edge k、capture 在 edge k+1。arrival = 8 + 6 = 14 ps。',
      notes: ['slack = 29 − 14 = +15 ps。這條不是 critical path，但它是 hold 最緊的候選之一（min delay 9 ps）。'],
      limits: '不是 Fmax 的瓶頸（slack 較大）',
    },
    {
      id: 'q0-xor-d1',
      name: 'FF0.Q → XOR → FF1.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(FF0)', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'xor', label: 'XOR', from: 'q0', to: 'd1', kind: 'logic', min: 8, max: 12, wires: ['w_q0_xor', 'w_d1'], elements: ['xor'], note: 'XOR 比 inverter 慢一倍' },
      ],
      description: 'launch = FF0（edge k），capture = FF1（edge k+1）。同樣只有一個 gate，但 XOR 的 delay 是 12 ps，arrival = 20 ps。',
      notes: [
        'slack = 29 − 20 = +9 ps：這是整個 counter 的 setup critical path。Tclk,min = 8 + 12 + 7 + 2 + 2 = 31 ps。',
        'gate 數量一樣（都是一個），慢的是 XOR 本身：critical path 看的是 Σ delay，不是 gate 個數。',
        'launch 與 capture 是不同的 flop：clock skew（FF1 的 clk 到達 − FF0 的 clk 到達）會直接加減這條路徑的 slack。',
      ],
      limits: 'Fmax',
    },
    {
      id: 'q1-xor-d1',
      name: 'FF1.Q → XOR → FF1.D',
      type: 'setup',
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(FF1)', from: 'FF1.clk', to: 'q1', kind: 'tcq', min: 5, max: 8, elements: ['ff1'] },
        { id: 'xor', label: 'XOR', from: 'q1', to: 'd1', kind: 'logic', min: 8, max: 12, wires: ['w_q1_xor', 'w_d1'], elements: ['xor'] },
      ],
      description: 'XOR 的另一個輸入。arrival 同樣是 20 ps——critical path 不一定只有一條，同分的都要列出來。',
      notes: ['q1 每兩個 edge 才變一次，但 STA 不管它多久變一次：只要這條路徑會被 sensitize，就要在一個 Tclk 內完成。'],
      limits: 'Fmax（與 FF0.Q → XOR → FF1.D 同分）',
    },
    {
      id: 'hold-q0-inv',
      name: 'hold：FF0.Q → INV → FF0.D（最短路徑）',
      type: 'hold',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(FF0)', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'inv', label: 'INV', from: 'q0', to: 'd0', kind: 'logic', min: 4, max: 6, wires: ['w_q0_inv', 'w_d0'], elements: ['inv0'] },
      ],
      description: 'hold 檢查用 min delay：同一個 edge 之後，d0 最快 5 + 4 = 9 ps 才會改變，必須 ≥ thold + skew = 3 ps。與 clock period 無關。',
      notes: ['最短的路徑決定 hold；最長的路徑決定 setup。這裡 INV path 兩邊都要看：setup 不緊，hold 也安全。', '若把 inverter 拿掉直接用 Q̄ 接 D，min delay 只剩 tCQ,min = 5 ps——還是安全，但 margin 更小。'],
      limits: 'hold margin（與 Fmax 無關）',
    },
  ],
}

/**
 * 練習：同步 /8 counter。d2 = q2 XOR (q1 AND q0)。
 * 數值（ps）：tCQ 5/8，INV 4/6，AND 6/10，XOR 8/12，tsetup 7，thold 3，T = 50，jitter 2，margin 2。
 *  FF0.Q → AND → XOR2 → FF2.D：arrival 30，required 39 ⇒ slack +9 ← critical
 */
export const sync8Timing: TimingScenario = {
  id: 'sync8',
  name: '同步 /8：找出 AND → XOR 兩級的 critical path',
  description: '三個 flop 共用 clk。第三級的 next-state logic 有兩級 gate（AND → XOR2），請先自己算 slack，再對照下面的數字。',
  schematic: sync8Schematic,
  env: { period: 50, skew: 0, jitter: 2, margin: 2 },
  paths: [
    {
      id: 'q0-inv-d0',
      name: 'FF0.Q → INV → FF0.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(FF0)', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'inv', label: 'INV', from: 'q0', to: 'd0', kind: 'logic', min: 4, max: 6, wires: ['w_q0_inv', 'w_d0'], elements: ['inv0'] },
      ],
      description: '一個 inverter：arrival 14 ps。',
      limits: '不是瓶頸',
    },
    {
      id: 'q0-xor1-d1',
      name: 'FF0.Q → XOR1 → FF1.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(FF0)', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'xor1', label: 'XOR1', from: 'q0', to: 'd1', kind: 'logic', min: 8, max: 12, wires: ['w_q0_xor1', 'w_d1'], elements: ['xor1'] },
      ],
      description: '一個 XOR：arrival 20 ps。與 /4 的 critical path 相同，但在 /8 裡它已經不是最慢的。',
      limits: '不是瓶頸',
    },
    {
      id: 'q0-and-xor2-d2',
      name: 'FF0.Q → AND → XOR2 → FF2.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff2', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(FF0)', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'and', label: 'AND', from: 'q0', to: 'c1', kind: 'logic', min: 6, max: 10, wires: ['w_q0_and', 'w_c1'], elements: ['and'], note: 'carry：q1 AND q0' },
        { id: 'xor2', label: 'XOR2', from: 'c1', to: 'd2', kind: 'logic', min: 8, max: 12, wires: ['w_d2'], elements: ['xor2'], note: 'q2 XOR c1' },
      ],
      description: '兩級 gate：arrival = 8 + 10 + 12 = 30 ps；required = 50 − 7 − 2 − 2 = 39 ps ⇒ slack = +9 ps。這是 /8 的 setup critical path。',
      notes: [
        'q1 → AND → XOR2 → FF2.D 的 delay 完全相同（launch 換成 FF1），也是 critical。',
        '每加一級 binary counter，carry chain 就多一個 AND：/16 的 d3 = q3 XOR (q2 q1 q0)，critical path 變 AND3 → XOR。這就是 synchronous counter 的 Fmax 隨位元數下降的原因（ripple 則不會）。',
        'hold：min = 5 + 6 + 8 = 19 ps ≥ 3 ps，安全。',
      ],
      limits: 'Fmax',
    },
    {
      id: 'q2-xor2-d2',
      name: 'FF2.Q → XOR2 → FF2.D',
      type: 'setup',
      launch: { element: 'ff2', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff2', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(FF2)', from: 'FF2.clk', to: 'q2', kind: 'tcq', min: 5, max: 8, elements: ['ff2'] },
        { id: 'xor2', label: 'XOR2', from: 'q2', to: 'd2', kind: 'logic', min: 8, max: 12, wires: ['w_q2_xor2', 'w_d2'], elements: ['xor2'] },
      ],
      description: '同樣到 FF2.D，但 q2 只經過 XOR2 一個 gate：arrival 20 ps。同一個 capture pin，不同 launch，slack 不同——要逐條算。',
      limits: '不是瓶頸',
    },
  ],
}
