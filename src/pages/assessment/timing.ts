import type { TimingEnv, TimingPath, TimingScenario } from '@/models/timing/types'
import { johnson56SysSchematic } from './schematics'

/**
 * Assessment B 的 delay 表（單位 ps）。所有題目都用這一張表。
 *
 * 三種 mode：
 *   fix5：mod 接 0（固定 /5）——OR 的 mod 輸入是常數，FF_M → OR 這條 path 不會被 sensitize（case analysis）
 *   fix6：mod 接 1（固定 /6）——OR 輸出恆為 1，q0 → OR → AND 這條 path 被 block；FF_M path 也是常數
 *   dyn ：mod 每個 cycle 由 FF_M 更新——mod=0 時 q0 path 有效，且 FF_M → wire → OR → AND 這條最長的 path 也有效
 */
export const DELAYS = {
  tcq: { min: 6, max: 10 },
  tsetup: 8,
  thold: 4,
  inv: { min: 3, max: 5 },
  or2: { min: 7, max: 11 },
  and2: { min: 6, max: 10 },
  wireQ0D1: { min: 1, max: 2 },
  wireMod: { min: 4, max: 8 },
  wireOut: { min: 5, max: 9 },
  wireRst: { min: 3, max: 5 },
  recovery: 12,
  removal: 6,
  /** clk 的最小 high / low 寬度（pulse-width 限制） */
  minPulse: 20,
} as const

export const ENV_B: TimingEnv = { period: 60, skew: 0, jitter: 3, margin: 2 }

const flopCapture = (element: string) => ({ element, edge: 'rising' as const, clock: 'clk', setup: DELAYS.tsetup, hold: DELAYS.thold })
const seg = (id: string, label: string, from: string, to: string, kind: TimingPath['segments'][number]['kind'], d: { min: number; max: number }, extra: Partial<TimingPath['segments'][number]> = {}) => ({ id, label, from, to, kind, min: d.min, max: d.max, ...extra })

export const pathsB: TimingPath[] = [
  {
    id: 'p-q2-inv-d0',
    name: 'FF2.Q → INV → FF0.D',
    type: 'setup',
    launch: { element: 'ff2', edge: 'rising', clock: 'clk' },
    capture: flopCapture('ff0'),
    segments: [seg('tcq', 'tCQ(FF2)', 'FF2.clk', 'FF2.Q', 'tcq', DELAYS.tcq, { elements: ['ff2'] }), seg('inv', 'INV', 'FF2.Q', 'FF0.D', 'logic', DELAYS.inv, { wires: ['w_q2_inv', 'w_inv_d0'], elements: ['inv'] })],
    sensitizedWhen: '永遠（d0 = NOT q2，q2 每次改變都會傳到 d0）',
    description: 'twisted-ring 的回授：q2 反相回到 d0。每個 mode 都會被 sensitize，但只有一個 inverter，不是最慢的。',
    notes: ['launch = FF2 在 edge k；capture = FF0 在 edge k+1；可用時間 = 一個 Tclk。', 'hold：tCQ,min + tINV,min = 9 ps ≥ thold 4 ps，安全。'],
    limits: '不是 Fmax bottleneck（但若 INV 被拿掉直接用 Q̄，hold margin 會變小）',
  },
  {
    id: 'p-q1-and-d2',
    name: 'FF1.Q → AND → FF2.D',
    type: 'setup',
    launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
    capture: flopCapture('ff2'),
    segments: [seg('tcq', 'tCQ(FF1)', 'FF1.clk', 'FF1.Q', 'tcq', DELAYS.tcq, { elements: ['ff1'] }), seg('and', 'AND', 'FF1.Q', 'FF2.D', 'logic', DELAYS.and2, { wires: ['w_q1_and', 'w_and_d2'], elements: ['and'] })],
    sensitizedWhen: 'or_m = 1 時（mod = 1，或 q0 = 1）',
    description: 'q1 經過一個 AND 到 d2。/6 固定模式下 OR 恆為 1，這條變成 d2 唯一會動的路徑，也就是 /6 固定模式的 critical path。',
    notes: ['fix6 mode：OR 輸出恆為 1，AND 只剩 q1 這一個會變的輸入 ⇒ 這條路徑決定 Fmax。', 'fix5 / dyn mode：它仍然存在，但比 q0 → OR → AND 短，所以不是最差的。'],
    limits: '/6 固定模式的 Fmax',
  },
  {
    id: 'p-q0-or-and-d2',
    name: 'FF0.Q → OR → AND → FF2.D',
    type: 'setup',
    modes: ['fix5', 'dyn'],
    launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
    capture: flopCapture('ff2'),
    segments: [
      seg('tcq', 'tCQ(FF0)', 'FF0.clk', 'FF0.Q', 'tcq', DELAYS.tcq, { elements: ['ff0'] }),
      seg('or', 'OR', 'FF0.Q', 'or_m', 'logic', DELAYS.or2, { wires: ['w_q0_or'], elements: ['or'] }),
      seg('and', 'AND', 'or_m', 'FF2.D', 'logic', DELAYS.and2, { wires: ['w_or_and', 'w_and_d2'], elements: ['and'] }),
    ],
    sensitizedWhen: 'mod = 0 且 q1 = 1（OR 才會把 q0 傳出去，AND 才會把 or_m 傳出去）',
    description: 'q0 要穿過 OR 再穿過 AND 才到 d2：兩級 logic。只有在 mod = 0 時 OR 才會讓 q0 的變化通過——mod = 1 時 OR 輸出被鎖在 1，這條路徑不存在（不被 sensitize）。',
    notes: ['fix5 mode 的 critical path：tCQ 10 + OR 11 + AND 10 = 31 ps。', 'fix6 mode：mod = 1 ⇒ or_m 恆為 1 ⇒ q0 的變化到不了 d2 ⇒ 這條 path 不算 critical path（STA 會用 case analysis 把它拿掉）。', 'dyn mode：仍然有效，但 FF_M 那條更長。'],
    limits: '/5 固定模式的 Fmax',
  },
  {
    id: 'p-mod-or-and-d2',
    name: 'FF_M.Q → wire → OR → AND → FF2.D（mod path）',
    type: 'setup',
    modes: ['dyn'],
    launch: { element: 'ffm', edge: 'rising', clock: 'clk' },
    capture: flopCapture('ff2'),
    segments: [
      seg('tcq', 'tCQ(FF_M)', 'FF_M.clk', 'FF_M.Q', 'tcq', DELAYS.tcq, { elements: ['ffm'] }),
      seg('wire', 'mod 走線', 'FF_M.Q', 'OR.in0', 'wire', DELAYS.wireMod, { wires: ['w_mod'], note: 'modulus register 離 divider 較遠' }),
      seg('or', 'OR', 'OR.in0', 'or_m', 'logic', DELAYS.or2, { elements: ['or'] }),
      seg('and', 'AND', 'or_m', 'FF2.D', 'logic', DELAYS.and2, { wires: ['w_or_and', 'w_and_d2'], elements: ['and'] }),
    ],
    sensitizedWhen: 'q0 = 0 且 q1 = 1（也就是 state 110 那個 cycle）——但 STA 不管 state，只要 mod 會變就檢查',
    description: 'mod 每個 cycle 都可能由 FF_M 更新，所以 FF_M 的 Q 在 edge k 改變、必須在 edge k+1 前經過走線、OR、AND 到達 FF2.D。這是 dual-modulus 模式下最長的一條。',
    notes: ['dyn mode 的 critical path：10 + 8 + 11 + 10 = 39 ps ⇒ slack = 47 − 39 = 8 ps。', '如果 mod 只在每個 output cycle 更新一次（FF_M 由 div_out 觸發），這條就變成 multicycle / generated-clock path，分析方法不同——見解答的深入模式。', 'fix5 / fix6 mode：mod 是常數，這條 path 不存在。'],
    limits: 'dual-modulus 模式的 Fmax（也就是這顆 divider 真正能跑多快）',
  },
  {
    id: 'p-q0-d1',
    name: 'FF0.Q → wire → FF1.D',
    type: 'setup',
    launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
    capture: flopCapture('ff1'),
    segments: [seg('tcq', 'tCQ(FF0)', 'FF0.clk', 'FF0.Q', 'tcq', DELAYS.tcq, { elements: ['ff0'] }), seg('wire', '走線', 'FF0.Q', 'FF1.D', 'wire', DELAYS.wireQ0D1, { wires: ['w_q0_d1'] })],
    sensitizedWhen: '永遠（d1 = q0）',
    description: 'shift-register 式的連接：Q 直接接下一級的 D，中間沒有 logic。setup 一定過，但 hold 是全電路最差的。',
    notes: ['setup slack 很大（arrival 只有 12 ps）。', 'hold：arrival,min = tCQ,min 6 + wire 1 = 7 ps；required = thold 4 + skew 0 = 4 ps ⇒ hold slack = 3 ps，是全電路最小的。', '若 FF1 的 clock 比 FF0 晚到 3 ps 以上（skew > +3），這條就會 hold violation——與 clock period 無關。'],
    limits: 'hold margin（min-delay）；不限制 Fmax',
  },
  {
    id: 'p-out-ffr',
    name: 'FF2.Q → 走線 → FF_R.D（interface path）',
    type: 'interface',
    launch: { element: 'ff2', edge: 'rising', clock: 'clk' },
    capture: flopCapture('ffr'),
    segments: [seg('tcq', 'tCQ(FF2)', 'FF2.clk', 'FF2.Q', 'tcq', DELAYS.tcq, { elements: ['ff2'] }), seg('wire', 'div_out 走線', 'FF2.Q', 'FF_R.D', 'wire', DELAYS.wireOut, { wires: ['w_out'], note: '跨 block 的走線（含 buffer）' })],
    sensitizedWhen: '永遠',
    description: 'divider 輸出到 downstream register 的 interface path：launch 是 FF2，capture 是別的 block 裡的 FF_R。它不是 divider 內部的 loop，但一樣要做 setup / hold check，而且 skew 通常不是 0。',
    notes: ['arrival = 10 + 9 = 19 ps，slack = 47 − 19 = 28 ps（skew = 0 時）——只比 /6 固定模式的 q1 → AND（27 ps）多 1 ps。', 'FF_R 的 clock 若比 FF2 早到 2 ps 以上（skew ≤ −2），這條就會變成 /6 模式的最差 setup path；若晚到（skew > 0）：setup 變寬鬆、hold 變嚴格，hold slack = (6 + 5) − (4 + skew)。', '把它跟 output latency 分清楚：latency 是「多久之後輸出才改變」，interface path 是「downstream flop 抓不抓得到」。'],
    limits: 'divider 與 downstream block 之間的 interface timing，不是 divider 自己的 Fmax',
  },
  {
    id: 'p-rst-recovery',
    name: 'rst_n → FF0/FF1/FF2（reset recovery / removal）',
    type: 'recovery',
    launch: { element: 'rst0', edge: 'rising', clock: 'clk（edge k：rst_n 的 de-assert 由 reset synchronizer 在這個 edge 釋放）' },
    capture: { element: 'ff0', edge: 'rising', clock: 'clk（edge k+1）', setup: DELAYS.recovery, hold: DELAYS.removal },
    segments: [
      seg('sync', 'reset synchronizer tCQ', 'clk edge k', 'rst_n ↑', 'tcq', DELAYS.tcq, { note: '釋放時刻由 synchronizer 最後一級 flop 決定，所以相對 clk edge 是確定的' }),
      seg('rst', 'rst_n 走線', 'rst_n', 'FF.rstn', 'wire', DELAYS.wireRst, { wires: ['w_rst0', 'w_rst1', 'w_rst2'], note: '兩段加起來 = 釋放「到達 rstn pin」的時刻，基準是 clk edge k' }),
    ],
    description: '非同步 reset 釋放（de-assert）相對 clock edge 的時間要求：recovery 像 setup（釋放要在下一個 edge 前 12 ps 到）、removal 像 hold（釋放不能在剛過去的 edge 後 6 ps 內到）。它不是 data path，不影響 Fmax。這裡假設釋放已用同一條 clk 同步（reset synchronizer），否則釋放時刻相對 clk edge 是任意的，沒有 slack 可算。',
    notes: [
      '兩段 delay 量的是「釋放到達 rstn pin 的時刻相對 clk edge k」：min = 6 + 3 = 9 ps、max = 10 + 5 = 15 ps。',
      'removal slack = 9 − 6 = +3 ps（min-delay，與 T 無關）；recovery slack = (60 − 12 − 3 − 2) − 15 = 43 − 15 = +28 ps。',
      '三個 FF 若 rst_n 到達時間不同，可能有的 FF 在這個 edge 已釋放、有的還在 reset ⇒ 進入非預期 state（例如 010）。',
      '在 /6 模式下 010 是 lock-up state ⇒ reset release timing 不只是 metastability 問題，還可能讓 divider 永遠卡住。',
    ],
    limits: 'reset release 的安全時間窗；不是 Fmax',
  },
]

export const johnson56Timing: TimingScenario = {
  id: 'assess-b',
  name: 'Assessment B：/5 /6 divider in system',
  description: '同一個電路，三種 mode 的 critical path 不同：fix5 ⇒ q0 → OR → AND；fix6 ⇒ q1 → AND；dyn ⇒ FF_M → wire → OR → AND。hold 最差的永遠是 q0 → wire → d1。',
  schematic: johnson56SysSchematic,
  env: ENV_B,
  modes: [
    { id: 'fix5', label: '/5 固定（mod = 0）', description: 'mod 接常數 0：FF_M path 不存在' },
    { id: 'fix6', label: '/6 固定（mod = 1）', description: 'mod 接常數 1：OR 恆為 1，q0 path 被 block' },
    { id: 'dyn', label: 'dual-modulus（mod 每 cycle 更新）', description: 'FF_M 每個 clk 更新 mod：mod path 有效' },
  ],
  paths: pathsB,
}

/** 解答與題目共用的手算數字（在 timing.test 中與 analyzeSetup / analyzeHold 對照） */
export const EXPECTED_B = {
  required: ENV_B.period - DELAYS.tsetup - ENV_B.jitter - ENV_B.margin, // 47
  arrival: { q2InvD0: 15, q1AndD2: 20, q0OrAndD2: 31, modOrAndD2: 39, q0D1: 12, outFfr: 19 },
  slack: { q2InvD0: 32, q1AndD2: 27, q0OrAndD2: 16, modOrAndD2: 8, q0D1: 35, outFfr: 28 },
  tclkMin: { fix5: 44, fix6: 33, dyn: 52 },
  holdSlack: { q0D1: 3, q2InvD0: 5, q1AndD2: 8, q0OrAndD2: 15, modOrAndD2: 19, outFfr: 7 },
  worst: { fix5: 'p-q0-or-and-d2', fix6: 'p-q1-and-d2', dyn: 'p-mod-or-and-d2', hold: 'p-q0-d1' },
  /**
   * reset 釋放（已用同一條 clk 同步）到達 rstn pin 的時刻，基準是 clk edge k：
   * min = tCQ,min 6 + 走線 min 3 = 9 ps、max = tCQ,max 10 + 走線 max 5 = 15 ps。
   * recovery required = 60 − 12 − 3 − 2 = 43 ps ⇒ slack 43 − 15 = 28；removal slack = 9 − 6 = 3。
   */
  rstRelease: { min: 9, max: 15, required: ENV_B.period - DELAYS.recovery - ENV_B.jitter - ENV_B.margin, recoverySlack: 28, removalSlack: 3 },
}
