import type { TimingScenario } from '@/models/timing/types'
import { div2Schematic } from './div2-schematic'

/** Lesson 1-1 的 critical path scenario：Q → INV → D */
export const div2Timing: TimingScenario = {
  id: 'div2',
  name: 'DFF /2：Q → INV → D',
  description: '單一 flop 的 feedback loop：launch 與 capture 是同一個 flop，但 launch edge 是第 k 個 edge，capture edge 是第 k+1 個。',
  schematic: div2Schematic,
  env: { period: 40, skew: 0, jitter: 2, margin: 2 },
  paths: [
    {
      id: 'q-inv-d',
      name: 'FF0.Q → INV → FF0.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'FF0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'], note: 'clock edge 到 Q 穩定' },
        { id: 'inv', label: 'INV', from: 'FF0.Q', to: 'FF0.D', kind: 'logic', min: 4, max: 6, wires: ['w_q_inv', 'w_d'], elements: ['inv'], note: 'inverter propagation delay' },
      ],
      description: '這是 /2 divider 唯一的 register-to-register path，也是它的 Fmax critical path。',
      notes: [
        'launch edge = 第 k 個 rising edge；capture edge = 第 k+1 個 rising edge ⇒ 可用時間 = 一個 Tclk。',
        '同一個 flop 既是 launch 也是 capture，所以 clock skew 幾乎為 0（同一條 clock 線）。',
        'hold check：tCQ,min + tINV,min = 9 ps ≥ thold = 3 ps，安全——但如果 inverter 被拿掉直接接 Q̄，min delay 只剩 tCQ,min。',
      ],
      limits: 'Fmax（最高輸入時脈頻率）',
    },
    {
      id: 'rst-recovery',
      name: 'rst_n → FF0（reset recovery / removal）',
      type: 'recovery',
      launch: { element: 'rst', edge: 'rising', clock: 'rst_n' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 10, hold: 5 },
      segments: [{ id: 'rst', label: 'rst_n wire', from: 'rst_n', to: 'FF0.rstn', kind: 'wire', min: 2, max: 4, wires: ['w_rst'] }],
      description: '非同步 reset 釋放（de-assert）相對 clock edge 的時間要求：recovery 像 setup、removal 像 hold，但它不是 data path。',
      notes: [
        'reset 釋放太靠近 clock edge，flop 可能一半 reset 一半 capture，進入 metastable。',
        '這條路徑不影響 Fmax，但影響「reset 釋放後第一個 edge 是否可靠」。',
        '這個模型把 rst_n 直接接到 async pin（走線 2–4 ps），Hold 分頁的 removal 檢查會是 arrival 2 ps < t_removal 5 ps ⇒ slack −3 ps。這是預期中的結果：reset 釋放沒有與 clk 同步，就一定有 removal 風險。真正的做法是 reset synchronizer（Lesson 8-1、Lesson 7-3 案例 A 有完整說明）。',
      ],
      limits: 'reset release 的安全時間窗，不是 Fmax',
    },
    {
      id: 'out',
      name: 'FF0.Q → div_out（output path）',
      type: 'output',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'out', edge: 'rising', clock: 'clk' },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'FF0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'wire', label: 'output wire', from: 'FF0.Q', to: 'div_out', kind: 'wire', min: 2, max: 3, wires: ['w_q'] },
      ],
      description: '輸出延遲（latency）：不是 setup critical path，因為它沒有 capture flop——除非後面接了另一個 register。',
      limits: 'output latency，不限制 Fmax',
    },
  ],
}
