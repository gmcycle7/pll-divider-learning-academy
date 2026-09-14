import type { TimingEnv, TimingPath, TimingScenario, TimingSegment } from '@/models/timing/types'
import { asyncResetTimingSch, div3LockupSch, div3RecoverSch, div3Sch, div3SyncRstSch, div5LockupSch, div5RecoverAltSch, div5RecoverSch } from './schematics'

/* ------------------------------------------------------------------------------------------------
 * Module 8 的 timing scenario。delay（ps）沿用 examples 的慣例：
 *   tCQ 5..8、INV 3..6、NOR 8..12、AND 9..14、XNOR 9..14、wire 1..2（同一列相鄰 flop）、BUF 4..6
 *   flop：tsetup 7、thold 3；reset pin：t_recovery 10、t_removal 5
 * ---------------------------------------------------------------------------------------------- */

export const M8_ENV: TimingEnv = { period: 100, skew: 0, jitter: 2, margin: 2 }

const tcq = (ff: string, note = 'clock edge 到 Q 穩定'): TimingSegment => ({ id: `tcq-${ff}`, label: 'tCQ', from: `${ff}.clk`, to: `${ff}.Q`, kind: 'tcq', min: 5, max: 8, elements: [ff], note })
const seg = (id: string, label: string, from: string, to: string, kind: TimingSegment['kind'], min: number, max: number, wires: string[], elements: string[] = [], note?: string): TimingSegment => ({ id, label, from, to, kind, min, max, wires, elements, note })

/* ------------------------------------------------------------------------------------------------
 * A. 非同步 reset：recovery / removal 與 data path 對照
 * ---------------------------------------------------------------------------------------------- */
export const asyncResetTiming: TimingScenario = {
  id: 'm8-async-reset',
  name: '/3 + 非同步 reset：recovery / removal',
  description: 'reset de-assert 由 synchronizer RS 在 clk edge 送出（launch），經 BUF 與 reset tree 到各 flop 的 rst_n pin（capture）。它不是 data path，但一樣有 launch edge 與 capture edge。',
  schematic: asyncResetTimingSch,
  env: M8_ENV,
  paths: [
    {
      id: 'q1-nor-d0',
      name: 'FF1.Q → NOR → FF0.D（data path）',
      type: 'setup',
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [tcq('ff1'), seg('nor', 'NOR', 'FF1.Q', 'FF0.D', 'logic', 8, 12, ['w_q1_nor_in1', 'w_d0'], ['nor'], 'NOR propagation delay')],
      description: '對照組：正常的 register-to-register path。reset 路徑沒有碰到它，所以 async reset 不影響 Fmax。',
      limits: 'Fmax',
    },
    {
      id: 'rst-rec-ff0',
      name: 'RS.Q → BUF → FF0.rst_n（recovery）',
      type: 'recovery',
      launch: { element: 'rs', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 10, hold: 5 },
      segments: [
        tcq('rs', 'RS 在 edge k 把 rst_n 的 de-assert 送出'),
        seg('buf', 'BUF', 'RS.Q', 'BUF.out', 'logic', 4, 6, ['w_rs_q'], ['buf'], 'reset tree buffer'),
        seg('wire0', 'reset wire', 'BUF.out', 'FF0.rst_n', 'wire', 2, 4, ['w_rst0'], [], '到 FF0 的走線'),
      ],
      description: 'recovery check 像 setup：rst_n 的 de-assert 必須在 capture edge（edge k+1）之前至少 t_recovery = 10 ps 就到達 FF0 的 rst_n pin，否則那個 edge 到底有沒有抓 D，沒人知道。',
      notes: [
        'launch = RS（edge k），capture = FF0（edge k+1）：可用時間一個 Tclk，扣掉 t_recovery、jitter、margin。',
        '這條 path 的 slack 很大——它幾乎永遠不是 Fmax 的瓶頸；它限制的是「reset 釋放後第一個 edge 是否可靠」。',
        '若 reset 沒有經過 synchronizer（直接由外部非同步訊號釋放），就沒有 launch edge，STA 無法檢查——只能靠 removal/recovery 的機率分析或 double-flop synchronizer。',
      ],
      limits: 'reset 釋放後第一個 edge 的可靠性，不是 Fmax',
    },
    {
      id: 'rst-rec-ff1',
      name: 'RS.Q → BUF → FF1.rst_n（recovery，走線較長）',
      type: 'recovery',
      launch: { element: 'rs', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 10, hold: 5 },
      segments: [tcq('rs'), seg('buf', 'BUF', 'RS.Q', 'BUF.out', 'logic', 4, 6, ['w_rs_q'], ['buf']), seg('wire1', 'reset wire', 'BUF.out', 'FF1.rst_n', 'wire', 4, 7, ['w_rst1'], [], '到 FF1 的走線比較長')],
      description: '同一個 reset 訊號到不同 flop 的到達時間不同。只要兩者都在同一個 edge 之前 t_recovery 到達，兩級就會在同一個 edge 一起離開 reset；否則 FF0 先跑、FF1 晚一拍——相位就對不上。',
      notes: ['兩條 recovery path 的 arrival 差（skew）= 走線差 ≈ 3 ps；要保證它們落在同一個 recovery window 內，reset tree 必須像 clock tree 一樣做 balance。'],
      limits: '多級 divider reset 釋放的同時性（phase alignment）',
    },
    {
      id: 'rst-rem-ff0',
      name: 'RS.Q → BUF → FF0.rst_n（removal）',
      type: 'removal',
      launch: { element: 'rs', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 10, hold: 5 },
      segments: [tcq('rs'), seg('buf', 'BUF', 'RS.Q', 'BUF.out', 'logic', 4, 6, ['w_rs_q'], ['buf']), seg('wire0', 'reset wire', 'BUF.out', 'FF0.rst_n', 'wire', 2, 4, ['w_rst0'])],
      description: 'removal check 像 hold：reset 的 de-assert 不能在 edge k 之後太快到達（至少要等 t_removal = 5 ps），否則 flop 可能在 edge k 就「半 reset 半 capture」。看 Hold（min delay）分頁：arrival(min) = tCQ,min + BUF,min + wire,min 必須 ≥ t_removal + skew。',
      notes: ['removal 與 clock period 無關：它比較的是同一個 edge 之後的 min delay。', 'tCQ,min 5 + BUF 4 + wire 2 = 11 ps ≥ t_removal 5 ps：安全。若 reset 直接由 RS.Q 接（沒有 BUF），min delay 只剩 tCQ,min + wire = 7 ps。'],
      limits: 'reset 釋放後同一個 edge 是否被誤抓；與 Fmax 無關',
    },
  ],
}

/* ------------------------------------------------------------------------------------------------
 * B. 同步 reset：rst 進了 data path
 * ---------------------------------------------------------------------------------------------- */
export const syncResetTiming: TimingScenario = {
  id: 'm8-sync-reset',
  name: '/3 + 同步 reset：rst → INV → AND → D',
  description: '同步 reset 是 next-state logic 的一部分：d = next AND NOT rst。它走一般的 setup/hold check，代價是回授路徑上多了一個 AND。',
  schematic: div3SyncRstSch,
  env: M8_ENV,
  paths: [
    {
      id: 'q1-xnor-and0-d0',
      name: 'FF1.Q → XNOR → AND0 → FF0.D',
      type: 'setup',
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        tcq('ff1'),
        seg('xnor', 'XNOR', 'FF1.Q', 'n0', 'logic', 9, 14, ['w_q1_xnor_in1'], ['xnor'], '原本的 next-state logic'),
        seg('and0', 'AND0', 'n0', 'FF0.D', 'logic', 9, 14, ['w_n0_and0_in0', 'w_d0'], ['and0'], '同步 reset 加進來的 AND'),
      ],
      description: 'Fmax critical path：同步 reset 的 AND 串在回授路徑上，每個 cycle 都要付這段 delay。',
      limits: 'Fmax（比非同步 reset 版本多一個 AND）',
    },
    {
      id: 'rst-inv-and0-d0',
      name: 'rst → INV → AND0 → FF0.D（reset 本身的 setup path）',
      type: 'setup',
      launch: { element: 'rst', edge: 'rising', clock: 'clk', label: '上游產生 rst 的 flop' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq-src', label: 'tCQ（rst 來源 flop）', from: 'clk', to: 'rst', kind: 'tcq', min: 5, max: 8, note: 'rst 由同一個 clock domain 的 flop 產生' },
        seg('inv', 'INV', 'rst', 'rst_b', 'logic', 3, 6, ['w_rst_inv_in0'], ['inv']),
        seg('and0', 'AND0', 'rst_b', 'FF0.D', 'logic', 9, 14, ['w_rst_b_and0_in1', 'w_d0'], ['and0']),
      ],
      description: '同步 reset 的 assert / de-assert 都只是 D 的一個輸入：一樣的 setup check，沒有 recovery/removal 這種特別的名字。',
      limits: 'rst 改變後下一個 edge 是否被正確抓到',
    },
    {
      id: 'q0-and1-d1',
      name: 'FF0.Q → AND1 → FF1.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [tcq('ff0'), seg('and1', 'AND1', 'FF0.Q', 'FF1.D', 'logic', 9, 14, ['w_q0_and1_in0', 'w_d1'], ['and1'])],
      description: '原本 d1 = q0 是一條 wire，現在也多了一個 AND。',
      limits: 'Fmax',
    },
  ],
}

/* ------------------------------------------------------------------------------------------------
 * C. Lesson 8-2：修正前 / 修正後（/3）
 * ---------------------------------------------------------------------------------------------- */
export const div3MinimalTiming: TimingScenario = {
  id: 'm8-div3-minimal',
  name: '/3 最簡版：NOR + wire',
  description: 'd0 = NOR(q1, q0)、d1 = q0。11 → 10 剛好會回來（靠運氣的 self-starting）。',
  schematic: div3Sch,
  env: M8_ENV,
  paths: [
    {
      id: 'q1-nor-d0',
      name: 'FF1.Q → NOR → FF0.D',
      type: 'setup',
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [tcq('ff1'), seg('nor', 'NOR', 'FF1.Q', 'FF0.D', 'logic', 8, 12, ['w_q1_nor_in1', 'w_d0'], ['nor'])],
      limits: 'Fmax',
    },
    {
      id: 'q0-d1',
      name: 'FF0.Q → wire → FF1.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [tcq('ff0'), seg('wire', 'wire', 'FF0.Q', 'FF1.D', 'wire', 1, 2, ['w_q0_ff1'])],
      description: '沒有 logic，只有走線：hold 要小心（min delay 只有 tCQ,min + 1 ps）。',
      limits: 'hold（不是 Fmax）',
    },
  ],
}

export const div3LockupTiming: TimingScenario = {
  id: 'm8-div3-lockup',
  name: '/3 壞版：XNOR + wire（11 → 11）',
  description: 'd0 = XNOR(q1, q0)、d1 = q0。XNOR 比 NOR 慢，而且 11 會 lock-up。',
  schematic: div3LockupSch,
  env: M8_ENV,
  paths: [
    {
      id: 'q1-xnor-d0',
      name: 'FF1.Q → XNOR → FF0.D',
      type: 'setup',
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [tcq('ff1'), seg('xnor', 'XNOR', 'FF1.Q', 'FF0.D', 'logic', 9, 14, ['w_q1_xnor_in1', 'w_d0'], ['xnor'], 'XNOR：兩級 transistor stack，比 NOR 慢')],
      limits: 'Fmax',
    },
    {
      id: 'q0-d1',
      name: 'FF0.Q → wire → FF1.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [tcq('ff0'), seg('wire', 'wire', 'FF0.Q', 'FF1.D', 'wire', 1, 2, ['w_q0_ff1'])],
      limits: 'hold',
    },
  ],
}

export const div3RecoverTiming: TimingScenario = {
  id: 'm8-div3-recover',
  name: '/3 修正版：NOR + AND（11 → 00）',
  description: 'd0 = NOR(q1, q0)、d1 = q0 AND q̄1。多了一個 AND；問題是：它有沒有變成新的 critical path？',
  schematic: div3RecoverSch,
  env: M8_ENV,
  paths: [
    {
      id: 'q1-nor-d0',
      name: 'FF1.Q → NOR → FF0.D',
      type: 'setup',
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [tcq('ff1'), seg('nor', 'NOR', 'FF1.Q', 'FF0.D', 'logic', 8, 12, ['w_q1_nor_in1', 'w_d0'], ['nor'])],
      limits: 'Fmax',
    },
    {
      id: 'q1b-and-d1',
      name: 'FF1.Q̄ → AND → FF1.D（新增）',
      type: 'setup',
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [tcq('ff1', 'Q̄ 與 Q 同時穩定'), seg('and', 'AND', 'FF1.Q̄', 'FF1.D', 'logic', 9, 14, ['w_q1_b_and_in0', 'w_d1'], ['and'], '修正 lock-up 新增的 AND')],
      description: '原本 d1 = q0 只是一條 wire（tCQ + 2 ps）。現在 launch 與 capture 都是 FF1，中間多了 AND：tCQ + 14 ps。',
      limits: 'Fmax（若它比 NOR 路徑慢）',
    },
    {
      id: 'q0-and-d1',
      name: 'FF0.Q → AND → FF1.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [tcq('ff0'), seg('and', 'AND', 'FF0.Q', 'FF1.D', 'logic', 9, 14, ['w_q0_and_in1', 'w_d1'], ['and'])],
      description: '同一個 AND 的另一個輸入。delay 相同，只是 launch flop 不同。',
      limits: 'Fmax',
    },
  ],
}

/* ------------------------------------------------------------------------------------------------
 * D. Lesson 8-2：修正前 / 修正後（/5）
 * ---------------------------------------------------------------------------------------------- */
/**
 * /5 壞版與修法 A 共用的三條 path。
 *
 * a10 = q1 AND q0：同一個 AND 的兩個輸入來自不同的 launch flop，所以經過它的 path 有兩條
 * （Lesson 7-2 Step 4 的窮舉原則、Lesson 8-2 quiz q5 的正解）。兩條的 delay 完全相同
 * （tCQ 8 + AND 14 + NOR 12 = 34 ps，Tclk,min 45 ps），並列最差——少列一條會讓讀者照 Explorer
 * 數出來的 path 數與課文的方法論對不起來。
 */
const div5Common = (): TimingPath[] => [
  {
    id: 'q0-and-nor-d0',
    name: 'FF0.Q → AND → NOR → FF0.D',
    type: 'setup',
    launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
    capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
    segments: [tcq('ff0'), seg('and10', 'AND', 'FF0.Q', 'a10', 'logic', 9, 14, ['w_q0_and10_in1'], ['and10']), seg('nor', 'NOR', 'a10', 'FF0.D', 'logic', 8, 12, ['w_a10_nor_in1', 'w_d0'], ['nor'])],
    description: '兩級 logic：AND 偵測 011，再進 NOR。這是 /5 的 Fmax critical path（與下面的 q1 那條並列）。',
    limits: 'Fmax',
  },
  {
    id: 'q1-and-nor-d0',
    name: 'FF1.Q → AND → NOR → FF0.D',
    type: 'setup',
    launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
    capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
    segments: [tcq('ff1'), seg('and10', 'AND', 'FF1.Q', 'a10', 'logic', 9, 14, ['w_q1_and10_in0'], ['and10']), seg('nor', 'NOR', 'a10', 'FF0.D', 'logic', 8, 12, ['w_a10_nor_in1', 'w_d0'], ['nor'])],
    description: '同一個 AND 的另一個輸入（a10 = q1 AND q0）。launch flop 換成 FF1，delay 與上面那條完全相同：8 + 14 + 12 = 34 ps ⇒ 兩條並列最差。',
    limits: 'Fmax（與 q0 那條並列）',
  },
  {
    id: 'q2-nor-d0',
    name: 'FF2.Q → NOR → FF0.D',
    type: 'setup',
    launch: { element: 'ff2', edge: 'rising', clock: 'clk' },
    capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
    segments: [tcq('ff2'), seg('nor', 'NOR', 'FF2.Q', 'FF0.D', 'logic', 8, 12, ['w_q2_nor_in0', 'w_d0'], ['nor'])],
    limits: 'Fmax',
  },
  {
    id: 'q1-d2',
    name: 'FF1.Q → wire → FF2.D',
    type: 'setup',
    launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
    capture: { element: 'ff2', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
    segments: [tcq('ff1'), seg('wire', 'wire', 'FF1.Q', 'FF2.D', 'wire', 1, 2, ['w_q1_ff2'])],
    description: 'shift register 的 wire：hold 是它唯一的風險。',
    limits: 'hold',
  },
]

export const div5LockupTiming: TimingScenario = {
  id: 'm8-div5-lockup',
  name: 'Twisted-ring /5 壞版',
  description: 'd0 = NOR(q2, q1·q0)、d1 = q0、d2 = q1。',
  schematic: div5LockupSch,
  env: M8_ENV,
  paths: [
    ...div5Common(),
    {
      id: 'q0-d1',
      name: 'FF0.Q → wire → FF1.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [tcq('ff0'), seg('wire', 'wire', 'FF0.Q', 'FF1.D', 'wire', 1, 2, ['w_q0_ff1'])],
      limits: 'hold',
    },
  ],
}

export const div5RecoverTiming: TimingScenario = {
  id: 'm8-div5-recover',
  name: 'Twisted-ring /5 修正版（d1 = q0 AND q̄2）',
  description: '新增 AND2：launch = FF2（Q̄）或 FF0，capture = FF1。它比原本的 AND → NOR 兩級路徑短，所以不會變成 critical path。',
  schematic: div5RecoverSch,
  env: M8_ENV,
  paths: [
    ...div5Common(),
    {
      id: 'q2b-and2-d1',
      name: 'FF2.Q̄ → AND2 → FF1.D（新增）',
      type: 'setup',
      launch: { element: 'ff2', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [tcq('ff2'), seg('and2', 'AND2', 'FF2.Q̄', 'FF1.D', 'logic', 9, 14, ['w_q2_b_and2_in0', 'w_d1'], ['and2'], '修正 lock-up 新增的 AND')],
      description: '原本 d1 = q0 是 wire。現在多了一級 AND，但仍然比 AND → NOR 兩級短。',
      limits: 'Fmax（但不是最差的那一條）',
    },
    {
      id: 'q0-and2-d1',
      name: 'FF0.Q → AND2 → FF1.D（新增 AND 的另一個輸入）',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [tcq('ff0'), seg('and2', 'AND2', 'FF0.Q', 'FF1.D', 'logic', 9, 14, ['w_q0_and2_in1', 'w_d1'], ['and2'], 'd1 = q0 AND q̄2 的 q0 那一側')],
      description: 'AND2 有兩個輸入 ⇒ 兩條 path。delay 與 FF2.Q̄ 那條相同（8 + 14 = 22 ps），一樣不是 critical path；但它順便把原本只是 wire 的 d1 路徑 min delay 從 6 ps 拉到 14 ps，hold slack 從 3 變 11。',
      limits: 'Fmax（不是最差）；順便改善 hold',
    },
  ],
}

export const div5RecoverAltTiming: TimingScenario = {
  id: 'm8-div5-recover-alt',
  name: 'Twisted-ring /5 重新化簡版（d0 = NOR(q2, q1)）',
  description: '把 don\'t care 填成對的值之後重新化簡：AND 消失了，d0 只剩一個 NOR。critical path 從兩級 logic 變成一級。',
  schematic: div5RecoverAltSch,
  env: M8_ENV,
  paths: [
    {
      id: 'q1-nor-d0',
      name: 'FF1.Q → NOR → FF0.D',
      type: 'setup',
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [tcq('ff1'), seg('nor', 'NOR', 'FF1.Q', 'FF0.D', 'logic', 8, 12, ['w_q1_nor_in1', 'w_d0'], ['nor'], '原本的 AND → NOR 兩級變成一級 NOR')],
      description: '原本 q1 要先經過 AND 再進 NOR（34 ps）；現在直接進 NOR（20 ps）。',
      limits: 'Fmax',
    },
    {
      id: 'q2-nor-d0',
      name: 'FF2.Q → NOR → FF0.D',
      type: 'setup',
      launch: { element: 'ff2', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [tcq('ff2'), seg('nor', 'NOR', 'FF2.Q', 'FF0.D', 'logic', 8, 12, ['w_q2_nor_in0', 'w_d0'], ['nor'])],
      limits: 'Fmax',
    },
    {
      id: 'q0-d1',
      name: 'FF0.Q → wire → FF1.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [tcq('ff0'), seg('wire', 'wire', 'FF0.Q', 'FF1.D', 'wire', 1, 2, ['w_q0_ff1'])],
      limits: 'hold',
    },
    {
      id: 'q1-d2',
      name: 'FF1.Q → wire → FF2.D',
      type: 'setup',
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff2', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [tcq('ff1'), seg('wire', 'wire', 'FF1.Q', 'FF2.D', 'wire', 1, 2, ['w_q1_ff2'])],
      limits: 'hold',
    },
  ],
}
