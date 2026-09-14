import type { TimingScenario } from '@/models/timing/types'
import { launchCaptureSchematic } from './basics-schematics'

/**
 * Lesson 7-1 的教科書範例（與 src/models/timing/sta.test.ts 同一組數字）：
 *   Tclk = 50 ps, tCQ = 8, logic = 25, tsetup = 7, uncertainty(jitter) = 4, margin = 0, skew = 0
 *   ⇒ arrival = 33, required = 39, slack = 6, Tclk,min = 44
 */
export const basicsTiming: TimingScenario = {
  id: 'cp-basics',
  name: 'Launch FF → logic → Capture FF',
  description: '最簡單的 register-to-register path。改 Tclk、skew、jitter，看 arrival / required / slack 怎麼變；找出 slack = 0 的 Tclk,min。',
  schematic: launchCaptureSchematic,
  env: { period: 50, skew: 0, jitter: 4, margin: 0 },
  paths: [
    {
      id: 'main',
      name: 'Launch FF.Q → logic → Capture FF.D',
      type: 'setup',
      launch: { element: 'ffl', edge: 'rising', clock: 'clk' },
      capture: { element: 'ffc', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'Launch FF.clk', to: 'Launch FF.Q', kind: 'tcq', min: 5, max: 8, elements: ['ffl'], note: 'launch edge 到 Q 穩定' },
        { id: 'logic', label: 'logic', from: 'Launch FF.Q', to: 'Capture FF.D', kind: 'logic', min: 12, max: 25, wires: ['w_q_logic', 'w_logic_d'], elements: ['logic'], note: 'combinational delay（max 用於 setup，min 用於 hold）' },
      ],
      description: 'launch edge = 第 k 個 rising edge；capture edge = 第 k+1 個 rising edge。可用時間 = 一個 Tclk（加上 skew）。',
      notes: [
        'Arrival = 0 + 8 + 25 = 33 ps；Required = 0 + 50 − 7 − 4 − 0 = 39 ps；Slack = 6 ps。',
        '把 Tclk 改成 44 ps：slack 剛好 0，這就是 Tclk,min（Fmax ≈ 22.7 GHz）。',
        'skew 改成 +5：capture edge 晚到 5 ps，setup slack 變 11；但 hold slack 從 14 掉到 9。',
      ],
      limits: 'Fmax（最高 clock 頻率）',
    },
    {
      id: 'out',
      name: 'Capture FF.Q → q_out（output path）',
      type: 'output',
      launch: { element: 'ffc', edge: 'rising', clock: 'clk' },
      capture: { element: 'qout', edge: 'rising', clock: 'clk' },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'Capture FF.clk', to: 'Capture FF.Q', kind: 'tcq', min: 5, max: 8, elements: ['ffc'] },
        { id: 'wire', label: 'wire', from: 'Capture FF.Q', to: 'q_out', kind: 'wire', min: 2, max: 3, wires: ['w_qout'] },
      ],
      description: '這不是 setup path：它沒有 capture flop（下一級在哪、用什麼 clock 都還不知道）。只能說它是 output latency。',
      limits: 'output latency；要等知道下一級是誰才能變成 interface path',
    },
  ],
}

/**
 * 練習用：另一組數字，含負 skew。
 *   Tclk = 60, tCQ = 6/10, logic = 15/30, tsetup = 8, thold = 4, jitter = 3, margin = 2, skew = −5
 *   setup：arrival = 40；required = −5 + 60 − 8 − 3 − 2 = 42；slack = 2；Tclk,min = 58
 *   hold：arrival_min = 21；required = −5 + 4 = −1；slack = 22
 */
export const basicsExerciseTiming: TimingScenario = {
  id: 'cp-basics-exercise',
  name: '練習：負 skew 的 path',
  description: '先手算，再用這個面板核對。注意 skew = −5 表示 capture clock 比 launch clock 早到 5 ps。',
  schematic: launchCaptureSchematic,
  env: { period: 60, skew: -5, jitter: 3, margin: 2 },
  paths: [
    {
      id: 'main',
      name: 'Launch FF.Q → logic → Capture FF.D',
      type: 'setup',
      launch: { element: 'ffl', edge: 'rising', clock: 'clk' },
      capture: { element: 'ffc', edge: 'rising', clock: 'clk', setup: 8, hold: 4 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'Launch FF.clk', to: 'Launch FF.Q', kind: 'tcq', min: 6, max: 10, elements: ['ffl'] },
        { id: 'logic', label: 'logic', from: 'Launch FF.Q', to: 'Capture FF.D', kind: 'logic', min: 15, max: 30, wires: ['w_q_logic', 'w_logic_d'], elements: ['logic'] },
      ],
      description: '負 skew：capture edge 提早到，setup 可用時間變少、hold 反而更安全。',
      limits: 'Fmax',
    },
  ],
}
