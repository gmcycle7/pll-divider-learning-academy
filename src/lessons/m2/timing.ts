import type { TimingScenario } from '@/models/timing/types'
import { div3Schematic, div3Duty50TimingSchematic } from './schematics'

/**
 * Lesson 2-1：/3 state machine 的 timing path。
 * 兩個 flop 共用一條 clock；register-to-register path 有三條：
 *   FF0.Q → NOR → FF0.D、FF1.Q → NOR → FF0.D（setup critical，有 logic delay）
 *   FF0.Q → FF1.D（直連，沒有 logic delay → hold 最危險）
 */
export const div3Timing: TimingScenario = {
  id: 'div3',
  name: '/3 state machine：NOR 回授與直連路徑',
  description: '和 /2 不同，這裡有兩個 flop、三條 register-to-register path。setup 由經過 NOR 的路徑決定；hold 由沒有任何 gate 的直連路徑決定。',
  schematic: div3Schematic,
  env: { period: 40, skew: 0, jitter: 2, margin: 2 },
  paths: [
    {
      id: 'q0-nor-d0',
      name: 'FF0.Q → NOR → FF0.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'FF0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'], note: 'clock edge 到 q0 穩定' },
        { id: 'nor', label: 'NOR', from: 'FF0.Q', to: 'FF0.D', kind: 'logic', min: 8, max: 12, wires: ['w_q0_nor', 'w_nor_d0'], elements: ['nor'], note: '2-input NOR propagation delay' },
      ],
      description: 'q0 在 edge k 改變後，NOR 重新算出 d0，必須在 edge k+1 的 tsetup 之前穩定。launch 與 capture 都是 FF0，但用相鄰兩個 edge。',
      notes: [
        'launch edge = 第 k 個 clk↑；capture edge = 第 k+1 個 clk↑ ⇒ 可用時間 = 一個 Tclk。',
        '這條路徑與 FF1.Q → NOR → FF0.D 的 delay 完全相同，兩條並列為 setup critical path。',
        'NOR 比 inverter 慢（兩個 PMOS 串疊），所以 /3 的 Fmax 天生低於 /2。',
      ],
      limits: 'Fmax（最高輸入時脈頻率）',
    },
    {
      id: 'q1-nor-d0',
      name: 'FF1.Q → NOR → FF0.D',
      type: 'setup',
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF1.clk', to: 'FF1.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff1'], note: 'clock edge 到 q1 穩定' },
        { id: 'nor', label: 'NOR', from: 'FF1.Q', to: 'FF0.D', kind: 'logic', min: 8, max: 12, wires: ['w_q1_nor', 'w_nor_d0'], elements: ['nor'], note: '2-input NOR propagation delay' },
      ],
      description: 'launch 在 FF1、capture 在 FF0：兩個不同的 flop。clock 到 FF1 與 FF0 的到達時間差（skew）從這裡開始有意義。',
      notes: [
        '若 clock 先到 FF1、後到 FF0（skew > 0），FF0 的 capture edge 較晚 ⇒ setup 變寬鬆、hold 變嚴格。',
        'skew 的符號不要死背：畫出 launch edge（FF1）與 capture edge（FF0）的相對位置再判斷。',
      ],
      limits: 'Fmax，並且對 FF1 → FF0 的 clock skew 敏感',
    },
    {
      id: 'q0-d1',
      name: 'FF0.Q → FF1.D（直連）',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'FF0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'wire', label: 'wire', from: 'FF0.Q', to: 'FF1.D', kind: 'wire', min: 1, max: 2, wires: ['w_q0_d1'], note: '沒有任何 gate，只有走線' },
      ],
      description: 'd1 = q0：FF0 的 Q 直接接到 FF1 的 D。setup 非常寬鬆，但 hold 只剩 tCQ,min + wire,min 可以撐——這是整個電路 hold slack 最小的路徑。',
      notes: [
        'setup check：arrival 只有 tCQ + wire，slack 很大，不會限制 Fmax。',
        'hold check：edge k 抓完舊的 q0 之後，新的 q0 只要 tCQ,min + wire,min = 6 ps 就到了 FF1.D；thold = 3 ps，slack 只有 3 ps。',
        '如果 clock 到 FF1 比到 FF0 晚 3 ps 以上（skew > 3 ps），FF1 在同一個 edge 會抓到「新的」q0 ⇒ hold violation，state 序列整個錯掉。',
        '解法不是降低頻率（hold 與 Tclk 無關），而是縮小 skew、或在 q0 → d1 之間加 buffer（增加 min delay）。',
      ],
      limits: 'hold（min-delay），與 Fmax 無關',
    },
    {
      id: 'out',
      name: 'FF1.Q → div_out（output path）',
      type: 'output',
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'out', edge: 'rising', clock: 'clk' },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF1.clk', to: 'FF1.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff1'] },
        { id: 'wire', label: 'output wire', from: 'FF1.Q', to: 'div_out', kind: 'wire', min: 2, max: 3, wires: ['w_q1_out'] },
      ],
      description: '輸出延遲（latency）：div_out 的每個 edge 都比對應的 clk↑ 晚 tCQ + wire。沒有 capture flop，所以不是 setup critical path——除非後面接了 register。',
      limits: 'output latency，不限制 Fmax',
    },
    {
      id: 'rst-recovery',
      name: 'rst_n → FF0 / FF1（reset recovery / removal）',
      type: 'recovery',
      launch: { element: 'rst', edge: 'rising', clock: 'rst_n' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 10, hold: 5 },
      segments: [{ id: 'rst', label: 'rst_n wire', from: 'rst_n', to: 'FF0.rstn', kind: 'wire', min: 2, max: 4, wires: ['w_rst0', 'w_rst1'] }],
      description: '非同步 reset 釋放相對 clock edge 的時間要求（recovery 像 setup、removal 像 hold）。它不是 data path，不影響 Fmax，但決定 reset 釋放後第一個 edge 是否可靠。',
      notes: [
        '⚠︎ explorer 顯示的 recovery / removal slack，是把「rst_n 剛好在 capture clock edge 上釋放」當成 arrival 的結果——arrival 只有這條線的 wire delay（max 4 / min 2 ps），所以 removal slack 必然是負的（2 − 5 = −3 ps）。那不是這條線的特性，是模型的假設。',
        '真實的 removal margin =（rst_n 實際釋放的時刻）−（clock edge）− t_removal，由你什麼時候放開 reset 決定，不是由 rst_n 走線的 delay 決定；recovery 同理。要讓它有意義，通常的做法是把 reset release 先用 clk 同步一次（reset synchronizer），讓釋放時刻被綁在 edge 之後、離下一個 edge 差不多一整個 cycle。',
        '兩個 flop 的 reset 若不在同一個 cycle 釋放，state 可能從 01 或 10 起跑而不是 00——/3 三個合法 state 都能正常除頻，只是輸出相位不同。',
      ],
      limits: 'reset release 的安全時間窗，不是 Fmax',
    },
  ],
}

/**
 * Lesson 2-2：/3 with 50% duty 的 timing path。
 * 多了 falling-edge FF2 之後，出現「半週期路徑」：launch 在 clk↑、capture 在 clk↓，可用時間只有 T/2（輸入 duty 50% 時）。
 * 輸入 duty 偏離 50% 時，rising → falling 與 falling → rising 兩種半週期路徑的可用時間往相反方向變。
 */
export const div3Duty50Timing: TimingScenario = {
  id: 'div3-duty50',
  name: '/3 with 50% duty：full-cycle、half-cycle 與 output path',
  description: '切換「輸入 duty」mode，看 rising → falling 的半週期路徑（q1 → FF2.D）與 falling → rising 的 interface path（FF2 → OR → 下一級 FF）可用時間如何變化。',
  schematic: div3Duty50TimingSchematic,
  env: { period: 60, skew: 0, jitter: 2, margin: 2 },
  modes: [
    { id: 'd50', label: '輸入 duty 50%', description: 'clk↓ 在 clk↑ 之後 0.5T' },
    { id: 'd40', label: '輸入 duty 40%', description: 'clk↓ 在 clk↑ 之後 0.4T：high 變短、low 變長' },
  ],
  paths: [
    {
      id: 'q0-nor-d0',
      name: 'FF0.Q → NOR → FF0.D（full cycle）',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'FF0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'nor', label: 'NOR', from: 'FF0.Q', to: 'FF0.D', kind: 'logic', min: 8, max: 12, wires: ['w_q0_nor', 'w_nor_d0'], elements: ['nor'] },
      ],
      description: '/3 core 本來的 critical path：clk↑ launch、下一個 clk↑ capture，可用時間一個 Tclk。加了 duty 電路之後它沒有變。',
      notes: ['Lesson 2-1 的結論不變：這條路徑決定 /3 core 自己的 Fmax。', '但它現在不一定是整個電路最緊的路徑——看下面兩條半週期路徑。'],
      limits: '/3 core 的 Fmax',
    },
    {
      id: 'q1-ff2-half-50',
      name: 'FF1.Q → FF2.D（clk↑ → clk↓，half cycle）',
      type: 'setup',
      modes: ['d50'],
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff2', edge: 'falling', clock: 'clk', setup: 7, hold: 3 },
      periodFraction: 0.5,
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF1.clk', to: 'FF1.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff1'], note: 'q1 在 clk↑ 之後 tCQ 才穩定' },
        { id: 'wire', label: 'wire', from: 'FF1.Q', to: 'FF2.D', kind: 'wire', min: 1, max: 2, wires: ['w_q1_d2'] },
      ],
      description: 'q1 在 clk↑ 之後 tCQ 才變，而 FF2 在同一個 cycle 的 clk↓（T/2 之後）就要抓它。可用時間只有 T/2：沒有任何 logic，卻可能比 NOR 回授更緊。',
      notes: [
        'available = T × 0.5。與 full-cycle 路徑相比，同樣的 tCQ + tsetup + jitter + margin 要塞進一半的時間。',
        'Tclk,min = (tCQ + wire + tsetup + jitter + margin) / 0.5：同樣的 delay 數字，對 Tclk 的要求直接乘以 2。',
        'hold：這條路徑真正的 hold capture edge 是 launch 之前 T/2 的那個 clk↓，所以 hold 幾乎不可能違反；explorer 顯示的是保守的「同一時刻」檢查。',
      ],
      limits: 'Fmax：在這個數字下，它比 NOR 回授先撞到極限',
    },
    {
      id: 'q1-ff2-half-40',
      name: 'FF1.Q → FF2.D（clk↑ → clk↓，輸入 duty 40%）',
      type: 'setup',
      modes: ['d40'],
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff2', edge: 'falling', clock: 'clk', setup: 7, hold: 3 },
      periodFraction: 0.4,
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF1.clk', to: 'FF1.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff1'] },
        { id: 'wire', label: 'wire', from: 'FF1.Q', to: 'FF2.D', kind: 'wire', min: 1, max: 2, wires: ['w_q1_d2'] },
      ],
      description: '輸入 duty 40%：clk↓ 提早到 0.4T，這條 rising → falling 路徑的可用時間只剩 0.4T。',
      notes: ['available = T × 0.4。同一個電路、同一個 Tclk，只因為輸入 duty 偏了 10%，slack 就少了 0.1T。', '這就是為什麼 half-cycle path 的 timing constraint 必須把 clock duty 的最壞情況寫進去。'],
      limits: 'Fmax，且對輸入 duty 敏感',
    },
    {
      id: 'ff1-or-out',
      name: 'FF1.Q → OR → div_out（output，rising edge 端）',
      type: 'output',
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'out', edge: 'rising', clock: 'clk' },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF1.clk', to: 'FF1.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff1'] },
        { id: 'or', label: 'OR', from: 'FF1.Q', to: 'div_out', kind: 'logic', min: 4, max: 8, wires: ['w_q1_or', 'w_or_out'], elements: ['or'] },
      ],
      description: 'div_out 的 rising edge 由 q1↑ 決定：clk↑ + tCQ(FF1) + tOR。這是 latency，不是 setup path。',
      limits: 'output latency（rising edge）',
    },
    {
      id: 'ff2-or-out',
      name: 'FF2.Q → OR → div_out（output，falling edge 端）',
      type: 'output',
      launch: { element: 'ff2', edge: 'falling', clock: 'clk' },
      capture: { element: 'out', edge: 'rising', clock: 'clk' },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF2.clk', to: 'FF2.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff2'] },
        { id: 'or', label: 'OR', from: 'FF2.Q', to: 'div_out', kind: 'logic', min: 4, max: 8, wires: ['w_q1f_or', 'w_or_out'], elements: ['or'] },
      ],
      description: 'div_out 的 falling edge 由 q1_f↓ 決定：clk↓ + tCQ(FF2) + tOR。rising 與 falling 兩個 edge 由不同的 flop 決定，兩者 tCQ 的差就直接變成輸出 duty 的誤差。',
      notes: ['若 FF2 的 tCQ 比 FF1 慢 2 ps，輸出 high 就多 2 ps；在 Tclk = 60 ps 的 /3 上這是 2/180 ≈ 1.1% 的 duty 誤差。'],
      limits: 'output latency（falling edge）與 duty 精準度',
    },
    {
      id: 'ff2-or-ext-50',
      name: 'FF2.Q → OR → 下一級 FF.D（clk↓ → clk↑，interface）',
      type: 'interface',
      modes: ['d50'],
      launch: { element: 'ff2', edge: 'falling', clock: 'clk' },
      capture: { element: 'ext', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      periodFraction: 0.5,
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF2.clk', to: 'FF2.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff2'] },
        { id: 'or', label: 'OR', from: 'FF2.Q', to: 'OR.out', kind: 'logic', min: 4, max: 8, wires: ['w_q1f_or'], elements: ['or'] },
        { id: 'wire', label: 'wire', from: 'OR.out', to: 'ext.D', kind: 'wire', min: 1, max: 2, wires: ['w_or_ext'] },
      ],
      description: '只要 div_out 後面接了一個 rising-edge register，output path 就變成 setup path：FF2 在 clk↓ launch，下一級在下一個 clk↑ capture，可用時間也只有 T/2。',
      notes: [
        '這條路徑的 delay 最多（tCQ + OR + wire），可用時間卻只有半個 cycle，所以在這組數字裡它是整個電路最緊的 setup path。',
        '解法：下一級改用 falling-edge register 抓、或宣告 multicycle、或把 OR 之後再加一級 register（增加 latency 換 timing）。',
      ],
      limits: 'interface timing（divider → downstream），不是 divider 自己的 Fmax',
    },
    {
      id: 'ff2-or-ext-40',
      name: 'FF2.Q → OR → 下一級 FF.D（clk↓ → clk↑，輸入 duty 40%）',
      type: 'interface',
      modes: ['d40'],
      launch: { element: 'ff2', edge: 'falling', clock: 'clk' },
      capture: { element: 'ext', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      periodFraction: 0.6,
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF2.clk', to: 'FF2.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff2'] },
        { id: 'or', label: 'OR', from: 'FF2.Q', to: 'OR.out', kind: 'logic', min: 4, max: 8, wires: ['w_q1f_or'], elements: ['or'] },
        { id: 'wire', label: 'wire', from: 'OR.out', to: 'ext.D', kind: 'wire', min: 1, max: 2, wires: ['w_or_ext'] },
      ],
      description: '輸入 duty 40% 時 clk↓ 提早，falling → rising 這段反而變長為 0.6T：這條路徑變鬆，但 q1 → FF2 那條變緊。duty 偏移對兩種半週期路徑的影響方向相反。',
      notes: ['available = T × 0.6。', '結論：half-cycle path 不能只算 T/2，必須用 duty 的最壞情況：rising → falling 用 duty,min，falling → rising 用 (1 − duty,max)。'],
      limits: 'interface timing，對輸入 duty 敏感',
    },
  ],
}
