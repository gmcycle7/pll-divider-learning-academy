import type { TimingScenario } from '@/models/timing/types'
import { ex5Schematic, ex6Schematic, ex7Schematic, ex8Schematic } from './advanced-schematics'

/**
 * 題目 5～8 的 critical path scenario。所有數字單位 ps。
 * 通用 library 數字（與題目 1～4 相同）：tCQ 5/8、INV 4/6、AND 8/10、NOR / XOR 8/12、MUX 6/8、tsetup 7、thold 3。
 */

// ---------------------------------------------------------------- 題目 5：/2 /3 cell
/**
 * 兩個 mode：mod = 0（/2）時 q1 永遠是 0，U2.Q → NOR 與 U1.Q → AND 這兩條路徑都不會被 sensitize；
 * mod = 1（/3）時四條 data path 全部活著。ctrl（mod）→ AND → U2.D 是 control deadline，不是 Fmax path。
 */
export const ex5Timing: TimingScenario = {
  id: 'lab-ex5',
  name: '題目 5：/2 /3 dual-modulus，mode 決定哪些路徑活著',
  description: '同步兩 flop。mod = 0 時只有 U1.Q → NOR → U1.D 這一條會動；mod = 1 時 NOR 的兩個輸入都會變，而且 AND 把 q0 送進 U2.D。Tclk,min 兩個 mode 一樣（31 ps），但「誰是 critical path」的名單不同。',
  schematic: ex5Schematic,
  env: { period: 40, skew: 0, jitter: 2, margin: 2 },
  modes: [
    { id: 'div2', label: 'ctrl = 0（/2）', description: 'q1 恆為 0：U2.Q → NOR 與 U1.Q → AND 不會被 sensitize' },
    { id: 'div3', label: 'ctrl = 1（/3）', description: 'state 00 → 01 → 10：四條 data path 都會被用到' },
  ],
  paths: [
    {
      id: 'q0-nor-d0',
      name: 'U1.Q → U3（NOR）→ U1.D',
      type: 'setup',
      launch: { element: 'u1', edge: 'rising', clock: 'clk' },
      capture: { element: 'u1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(U1)', from: 'U1.clk', to: 'n1', kind: 'tcq', min: 5, max: 8, elements: ['u1'] },
        { id: 'nor', label: 'U3 NOR', from: 'n1', to: 'n3', kind: 'logic', min: 8, max: 12, wires: ['w_q0_nor', 'w_d0'], elements: ['u3'] },
      ],
      description: 'n1 每個 output 週期至少變兩次（00 → 01、01 → 00 或 10）。兩個 mode 都被 sensitize，arrival 20 ps。',
      notes: ['Tclk,min = 8 + 12 + 7 + 2 + 2 = 31 ps；T = 40 ps 時 slack 9 ps。', 'hold：5 + 8 = 13 ps ≥ 3 ps。'],
      limits: 'Fmax（兩個 mode）',
    },
    {
      id: 'q1-nor-d0',
      name: 'U2.Q → U3（NOR）→ U1.D',
      type: 'setup',
      modes: ['div3'],
      launch: { element: 'u2', edge: 'rising', clock: 'clk' },
      capture: { element: 'u1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(U2)', from: 'U2.clk', to: 'n2', kind: 'tcq', min: 5, max: 8, elements: ['u2'] },
        { id: 'nor', label: 'U3 NOR', from: 'n2', to: 'n3', kind: 'logic', min: 8, max: 12, wires: ['w_q1_nor', 'w_d0'], elements: ['u3'] },
      ],
      sensitizedWhen: 'ctrl = 1（n2 才會 0 → 1 → 0）',
      description: 'NOR 的另一個輸入。ctrl = 0 時 n2 永遠是 0，這條路徑存在但沒有 transition——STA 仍然會算它，只是它不會是功能上的瓶頸。',
      limits: 'Fmax（/3 mode，與 U1 → NOR 並列）',
    },
    {
      id: 'q0-and-d1',
      name: 'U1.Q → U4（AND）→ U2.D',
      type: 'setup',
      modes: ['div3'],
      launch: { element: 'u1', edge: 'rising', clock: 'clk' },
      capture: { element: 'u2', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(U1)', from: 'U1.clk', to: 'n1', kind: 'tcq', min: 5, max: 8, elements: ['u1'] },
        { id: 'and', label: 'U4 AND', from: 'n1', to: 'n4', kind: 'logic', min: 8, max: 10, wires: ['w_q0_and', 'w_d1'], elements: ['u4'] },
      ],
      sensitizedWhen: 'ctrl = 1（AND 的另一個輸入為 1 時 n1 才會傳到 n4）',
      description: 'AND 比 NOR 快 2 ps，arrival 18 ps。ctrl = 0 時 AND 被關掉，n4 恆為 0。',
      limits: 'Fmax（/3 mode，次要）',
    },
    {
      id: 'ctrl-and-d1',
      name: 'ctrl → U4（AND）→ U2.D（control deadline）',
      type: 'async',
      launch: { element: 'ctrl', edge: 'rising', clock: 'ctrl 改變的時刻（由上游 register 送出）' },
      capture: { element: 'u2', edge: 'rising', clock: 'clk（state = 01 那一個 rising edge）', setup: 7, hold: 3 },
      segments: [
        { id: 'wire', label: 'ctrl wire', from: 'ctrl', to: 'U4.in1', kind: 'wire', min: 2, max: 4, wires: ['w_ctrl'] },
        { id: 'and', label: 'U4 AND', from: 'U4.in1', to: 'n4', kind: 'logic', min: 8, max: 10, wires: ['w_d1'], elements: ['u4'] },
      ],
      description: '這條不是 Fmax path，是「ctrl 最晚什麼時候要穩定」：ctrl 只在 state = 01 的那個 rising edge 被 AND 送進 U2（其他 edge n1 = 0，AND 輸出恆 0）。所以 ctrl 必須在那個 edge 前 tsetup + AND + wire = 21 ps 穩定；在其他時間改變 ctrl 不會被看到，也不會造成 glitch。',
      notes: ['上游若用 out 的 rising edge（state 進入 00）當 clock 更新 ctrl，離 state 01 那個 edge 有整整 1 T 可用——這就是 dual-modulus 常見的「用 output 重新取樣 modulus」做法。'],
      limits: 'ctrl 的 setup deadline（mode switching），不是 Fmax',
    },
    {
      id: 'rst-recovery',
      name: 'rst_n → U1 / U2（reset recovery / removal）',
      type: 'recovery',
      launch: { element: 'rst', edge: 'rising', clock: 'clk（第 k 個 rising edge：rst_n 的 de-assert 由 reset synchronizer 在這個 edge 釋放）' },
      capture: { element: 'u1', edge: 'rising', clock: 'clk（第 k+1 個 rising edge）', setup: 10, hold: 5 },
      segments: [
        { id: 'sync', label: 'reset synchronizer tCQ', from: 'clk edge k', to: 'rst_n ↑', kind: 'tcq', min: 5, max: 8 },
        { id: 'rst', label: 'rst_n 走線', from: 'rst_n', to: 'U1.rstn / U2.rstn', kind: 'wire', min: 2, max: 4, wires: ['w_rst1', 'w_rst2'] },
      ],
      description: 'async reset 的釋放相對 clk edge 的 recovery / removal 要求（釋放已用 clk 同步）。兩段 delay 量的是「釋放到達 rstn pin 的時刻相對 clk edge k」：min 7 ps ≥ removal 5 ps（slack +2）、max 12 ps ≤ 40 − 10 − 2 − 2 = 26 ps（recovery slack +14）。reset 決定起始 state 00 與起始相位。',
      limits: 'reset release 的安全時間窗，不是 Fmax',
    },
  ],
}

// ---------------------------------------------------------------- 題目 6：兩級 MMD
/**
 * 三種不同性質的 path：
 *   (1) block A 自己的 loop（clk → clk，1 T）
 *   (2) block B 自己的 loop（n3 → n3，n3 的週期最短 2 T）
 *   (3) mod chain：U6.Q（n3 domain）→ U8 → U5 → U4 → U2.D（clk domain）——launch 在 edge k，
 *       但 U4 在 edge k+1 被 n1 = 0 擋住，真正 capture 在 edge k+2 ⇒ 2 個 clk cycle。
 *       n3 本身是 generated clock，比 clk 晚 tCQ + NOR = 20 ps；這 20 ps 也算在 path 裡。
 */
export const ex6Timing: TimingScenario = {
  id: 'lab-ex6',
  name: '題目 6：兩級 MMD，mod chain 穿過兩個 clock domain',
  description: 'block A 在 clk domain、block B 在 n3 domain（n3 = block A 的 NOR 輸出，是 generated clock）。最長的路徑不是任何一個 block 內部的 loop，而是從 block B 回到 block A 的 modulus 請求鏈；它有 2 個 clk cycle 可用，但六段 delay 加起來仍然是全電路最緊的。',
  schematic: ex6Schematic,
  env: { period: 38, skew: 0, jitter: 2, margin: 2 },
  modes: [
    { id: 'even', label: 'c0 = 0（N = 4 或 6）', description: 'U5 被 c0 = 0 關掉：block B 的請求到不了 U4，mod chain 與 U2.Q 路徑都不被 sensitize' },
    { id: 'odd', label: 'c0 = 1（N = 5 或 7）', description: 'block B 每個 output 週期送一次請求回 block A，mod chain 活著' },
  ],
  paths: [
    {
      id: 'a-loop',
      name: 'U1.Q → U3（NOR）→ U1.D（block A 自己的 loop）',
      type: 'setup',
      launch: { element: 'u1', edge: 'rising', clock: 'clk' },
      capture: { element: 'u1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(U1)', from: 'U1.clk', to: 'n1', kind: 'tcq', min: 5, max: 8, elements: ['u1'] },
        { id: 'nor', label: 'U3 NOR', from: 'n1', to: 'n3', kind: 'logic', min: 8, max: 12, wires: ['w_a0_nor1', 'w_f1_da0'], elements: ['u3'] },
      ],
      description: '與題目 5 相同的 /2 /3 cell loop：arrival 20 ps，Tclk,min = 31 ps（T = 38 ps 時 slack 7 ps）。每個 mode 都被 sensitize。',
      limits: 'block A 的 Fmax（但不是全電路的 critical path）',
    },
    {
      id: 'a1-loop',
      name: 'U2.Q → U3（NOR）→ U1.D',
      type: 'setup',
      modes: ['odd'],
      launch: { element: 'u2', edge: 'rising', clock: 'clk' },
      capture: { element: 'u1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(U2)', from: 'U2.clk', to: 'n2', kind: 'tcq', min: 5, max: 8, elements: ['u2'] },
        { id: 'nor', label: 'U3 NOR', from: 'n2', to: 'n3', kind: 'logic', min: 8, max: 12, wires: ['w_a1_nor1', 'w_f1_da0'], elements: ['u3'] },
      ],
      sensitizedWhen: 'c0 = 1（n2 才會變 1）',
      description: 'c0 = 0 時 n2 恆為 0，這條路徑沒有 transition。',
      limits: 'block A 的 Fmax（與 U1 → NOR 並列）',
    },
    {
      id: 'mod-chain',
      name: 'U6.Q → U8（NOR）→ U5（AND c0）→ U4（AND）→ U2.D（mod chain，2 cycles）',
      type: 'multicycle',
      cycles: 2,
      modes: ['odd'],
      launch: { element: 'u6', edge: 'rising', clock: 'n3（= clk edge k + tCQ + NOR）' },
      capture: { element: 'u2', edge: 'rising', clock: 'clk（edge k+2：block A 在 state 01）', setup: 7, hold: 3 },
      segments: [
        { id: 'clkpath', label: 'n3 source latency（U1 tCQ + U3 NOR）', from: 'clk edge k', to: 'n3 ↑', kind: 'tcq', min: 13, max: 20, elements: ['u1', 'u3'], wires: ['w_f1_b0clk'], note: 'n3 是 generated clock：block B 的 launch edge 比 clk edge 晚這麼多' },
        { id: 'tcq', label: 'tCQ(U6)', from: 'n3 ↑', to: 'n6', kind: 'tcq', min: 5, max: 8, elements: ['u6'] },
        { id: 'nor2', label: 'U8 NOR', from: 'n6', to: 'n8', kind: 'logic', min: 8, max: 12, wires: ['w_b0_nor2'], elements: ['u8'] },
        { id: 'and5', label: 'U5 AND（c0 gating）', from: 'n8', to: 'n5', kind: 'logic', min: 8, max: 10, wires: ['w_nor2_modp0', 'w_andp0_and'], elements: ['u5'] },
        { id: 'and4', label: 'U4 AND', from: 'n5', to: 'n4', kind: 'logic', min: 8, max: 10, wires: ['w_and_da1'], elements: ['u4'] },
      ],
      sensitizedWhen: 'c0 = 1；而且只在 block A 進入 00 → 01 → 01 被取樣的那兩個 edge 之間',
      description: 'block A 在 edge k 回到 00 ⇒ n3 升起 ⇒ block B 更新（U6.Q 變）⇒ n8 變 ⇒ 經 U5、U4 到 U2.D。edge k+1 時 block A 的 n1 = 0，U4 = n1 AND n5 = 0，不管 n5 是什麼都一樣（路徑被 n1 擋住）；真正取樣 n5 的是 edge k+2（block A 在 01）。所以 launch edge k、capture edge k+2：2 個 clk cycle。arrival 60 ps，available 2 T = 76 ps（T = 38 ps 時 slack 5 ps，比 block A loop 的 7 ps 更緊）。',
      notes: [
        'Tclk,min = (60 + 7 + 2 + 2) / 2 = 35.5 ps > block A loop 的 31 ps：這條 mod chain 才是全電路的 critical path。',
        '如果 STA 沒有宣告這條 multicycle exception，工具會用 edge k+1 當 capture：可用時間只有 1 T = 38 ps，required = 38 − 7（tsetup）− 2（jitter）− 2（margin）= 27 ps，而 arrival = 60 ps ⇒ 報 −33 ps 的 violation——這是「假的」violation；但宣告之前必須先用模擬證明 edge k+1 真的被 n1 = 0 擋住（本題成立，因為 block A 每次進入 00 之後下一個 state 一定是 01）。',
        'hold：0-cycle 檢查用 min delay 13 + 5 + 8 + 8 + 8 = 42 ps ≥ 3 ps，很鬆。',
      ],
      limits: '全電路的 Fmax（c0 = 1 時）',
    },
    {
      id: 'b-loop',
      name: 'U6.Q → U8（NOR）→ U6.D（block B 自己的 loop，clock = n3）',
      type: 'setup',
      cycles: 2,
      launch: { element: 'u6', edge: 'rising', clock: 'n3' },
      capture: { element: 'u6', edge: 'rising', clock: 'n3（下一個 rising edge，最快 2 T 後）', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(U6)', from: 'n3 ↑', to: 'n6', kind: 'tcq', min: 5, max: 8, elements: ['u6'] },
        { id: 'nor2', label: 'U8 NOR', from: 'n6', to: 'n8', kind: 'logic', min: 8, max: 12, wires: ['w_b0_nor2', 'w_nor2_db0'], elements: ['u8'] },
      ],
      description: 'launch 與 capture 都是 n3 的 rising edge。n3 的週期是 2 T 或 3 T（block A 走 /2 或 /3），這裡用最短的 2 T 當可用時間（cycles = 2 只是表示 n3 的週期，不是 multicycle exception）。arrival 20 ps，slack 非常寬。',
      limits: 'block B 的 Fmax（在 n3 domain，永遠比 block A 鬆）',
    },
    {
      id: 'c0-ctrl',
      name: 'c0 → U5 → U4 → U2.D（control deadline）',
      type: 'async',
      launch: { element: 'c0', edge: 'rising', clock: 'c0 改變的時刻' },
      capture: { element: 'u2', edge: 'rising', clock: 'clk（block A 在 state 01 且 n8 = 1 的那個 edge）', setup: 7, hold: 3 },
      segments: [
        { id: 'wire', label: 'c0 wire', from: 'c0', to: 'U5.in0', kind: 'wire', min: 2, max: 4, wires: ['w_c0'] },
        { id: 'and5', label: 'U5 AND', from: 'U5.in0', to: 'n5', kind: 'logic', min: 8, max: 10, wires: ['w_andp0_and'], elements: ['u5'] },
        { id: 'and4', label: 'U4 AND', from: 'n5', to: 'n4', kind: 'logic', min: 8, max: 10, wires: ['w_and_da1'], elements: ['u4'] },
      ],
      description: 'c0 只在「block A 在 01 而且 block B 正在請求（n8 = 1）」的那一個 clk edge 被看到，每個 output 週期一次。它必須在那個 edge 前 tsetup + 24 = 31 ps 穩定；在週期其他時間改變都無害。',
      limits: 'c0 的更新 deadline（每個 output 週期一次），不是 Fmax',
    },
    {
      id: 'c1-ctrl',
      name: 'c1 → U9 → U7.D（control deadline，n3 domain）',
      type: 'async',
      launch: { element: 'c1', edge: 'rising', clock: 'c1 改變的時刻' },
      capture: { element: 'u7', edge: 'rising', clock: 'n3（block B 在 state 01 的那個 edge）', setup: 7, hold: 3 },
      segments: [
        { id: 'wire', label: 'c1 wire', from: 'c1', to: 'U9.in1', kind: 'wire', min: 2, max: 4, wires: ['w_c1'] },
        { id: 'and9', label: 'U9 AND', from: 'U9.in1', to: 'n9', kind: 'logic', min: 8, max: 10, wires: ['w_and_db1'], elements: ['u9'] },
      ],
      description: 'c1 只在 block B 處於 01 的 n3 rising edge 被 U9 送進 U7。n3 的 edge 比 clk 晚 20 ps，所以以 clk 為基準時 c1 的 deadline 反而寬了 20 ps。',
      limits: 'c1 的更新 deadline，不是 Fmax',
    },
    {
      id: 'rst-recovery',
      name: 'rst_n → 四個 flop（reset recovery / removal）',
      type: 'recovery',
      launch: { element: 'rst', edge: 'rising', clock: 'clk（第 k 個 rising edge：rst_n 的 de-assert 由 reset synchronizer 在這個 edge 釋放）' },
      capture: { element: 'u1', edge: 'rising', clock: 'clk（第 k+1 個 rising edge）', setup: 10, hold: 5 },
      segments: [
        { id: 'sync', label: 'reset synchronizer tCQ', from: 'clk edge k', to: 'rst_n ↑', kind: 'tcq', min: 5, max: 8 },
        { id: 'rst', label: 'rst_n 走線', from: 'rst_n', to: 'U1 / U2 / U6 / U7 rstn', kind: 'wire', min: 2, max: 4, wires: ['w_rst_a0', 'w_rst_a1', 'w_rst_b0', 'w_rst_b1'] },
      ],
      description: 'block B 的 flop 是由 n3 觸發的，reset 釋放時 n3 = 1（a = 00）而且不會有 edge，所以只需要對 clk 檢查 recovery / removal。釋放已用 clk 同步，兩段 delay 量的是「釋放到達 rstn pin 的時刻相對 clk edge k」：min 7 ps ≥ removal 5 ps（slack +2）、max 12 ps ≤ 38 − 10 − 2 − 2 = 24 ps（recovery slack +12）。',
      limits: 'reset release 的安全時間窗，不是 Fmax',
    },
  ],
}

// ---------------------------------------------------------------- 題目 7：8-phase PMUX + /4
/**
 * Tvco = 100 ps（phase 間距 12.5 ps）。
 * 三種完全不同的 path：divider 自己的 loop（在 pclk domain，1 T）、select 的 safe window（不是 setup path）、
 * phase → MUX → pclk 的 clock path（latency / mismatch，不限制 Fmax）。
 */
export const ex7Timing: TimingScenario = {
  id: 'lab-ex7',
  name: '題目 7：PMUX 的 select window 與 /4 的 loop 是兩件事',
  description: 'Tvco = 100 ps，8 個 phase 間距 12.5 ps。U2 / U3 的 clock 是 n1（MUX 輸出，generated clock）。divider 的 Fmax 由 U2.Q → XOR → U3.D 決定；select 的限制是 safe window（新舊 phase 同 level 的時間），不是任何 flop 的 setup。',
  schematic: ex7Schematic,
  env: { period: 100, skew: 0, jitter: 2, margin: 2 },
  paths: [
    {
      id: 'q0-xor-d1',
      name: 'U2.Q → U5（XOR）→ U3.D（clock = n1）',
      type: 'setup',
      launch: { element: 'u2', edge: 'rising', clock: 'n1（pclk）' },
      capture: { element: 'u3', edge: 'rising', clock: 'n1（pclk）', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(U2)', from: 'n1 ↑', to: 'n2', kind: 'tcq', min: 5, max: 8, elements: ['u2'] },
        { id: 'xor', label: 'U5 XOR', from: 'n2', to: 'n5', kind: 'logic', min: 8, max: 12, wires: ['w_q0_xor', 'w_d1'], elements: ['u5'] },
      ],
      description: 'launch 與 capture 都在 n1 上，可用時間 = n1 的週期 = 1 Tvco（select 固定時）。arrival 20 ps，Tclk,min = 31 ps。MUX 的 delay 不在這條 path 裡：它同時延後 launch edge 與 capture edge，互相抵消。',
      notes: ['n2 每個 n1 edge 都變，所以每個 cycle 都被 sensitize。', 'hold：5 + 8 = 13 ≥ 3。'],
      limits: 'divider 的 Fmax',
    },
    {
      id: 'q1-xor-d1',
      name: 'U3.Q → U5（XOR）→ U3.D',
      type: 'setup',
      launch: { element: 'u3', edge: 'rising', clock: 'n1（pclk）' },
      capture: { element: 'u3', edge: 'rising', clock: 'n1（pclk）', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(U3)', from: 'n1 ↑', to: 'n4', kind: 'tcq', min: 5, max: 8, elements: ['u3'] },
        { id: 'xor', label: 'U5 XOR', from: 'n4', to: 'n5', kind: 'logic', min: 8, max: 12, wires: ['w_q1_xor', 'w_d1'], elements: ['u5'] },
      ],
      description: 'XOR 的另一個輸入，延遲相同，並列 critical。',
      limits: 'divider 的 Fmax（並列）',
    },
    {
      id: 'q0-inv-d0',
      name: 'U2.Q → U4（INV）→ U2.D',
      type: 'setup',
      launch: { element: 'u2', edge: 'rising', clock: 'n1（pclk）' },
      capture: { element: 'u2', edge: 'rising', clock: 'n1（pclk）', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(U2)', from: 'n1 ↑', to: 'n2', kind: 'tcq', min: 5, max: 8, elements: ['u2'] },
        { id: 'inv', label: 'U4 INV', from: 'n2', to: 'n3', kind: 'logic', min: 4, max: 6, wires: ['w_q0_inv', 'w_d0'], elements: ['u4'] },
      ],
      description: 'toggle loop，arrival 14 ps，不是 critical。',
      limits: 'Fmax（次要）',
    },
    {
      id: 'sel-window',
      name: 'sel → U1（MUX select）→ n1（safe switching window，forward +1）',
      type: 'async',
      periodFraction: 3 / 8,
      launch: { element: 'sel', edge: 'rising', clock: 'ph_new ↑（window 打開）' },
      capture: { element: 'u1', edge: 'falling', clock: 'ph_old ↓（window 關閉，3/8 T 後）', setup: 0, hold: 0 },
      segments: [
        { id: 'wire', label: 'sel wire', from: 'sel', to: 'U1.sel', kind: 'wire', min: 2, max: 4, wires: ['w_sel'] },
        { id: 'mux', label: 'U1 select → out', from: 'U1.sel', to: 'n1', kind: 'mux', min: 8, max: 12, elements: ['u1'], wires: ['w_pclk0', 'w_pclk1'], note: 'select 改變後 n1 跟到新 phase 的 level' },
      ],
      description: '這不是 setup path：終點是 MUX 的輸出，沒有 flop 在等資料。要求是「n1 從舊 phase 切到新 phase 的瞬間，兩者 level 相同」。往前走一格（sel k → k+1）時，第一個安全窗是兩者都 high：ph_new 在 1/8 T 升起後打開、ph_old 在 1/2 T 落下時關閉，寬 3/8 T = 37.5 ps。select 從 window 打開算起最晚要在 37.5 − 4（jitter + margin）= 33.5 ps 內切完；arrival 16 ps，slack 17.5 ps。',
      notes: [
        '往前走 k 格，window = (4 − k)/8 T：k = 3 只剩 12.5 ps，k = 4（ph4 = ph0 的反相）window = 0，沒有任何時刻可以安全切換。',
        '切早了（ph_new 還 low）：n1 被截成短 pulse；切晚了（ph_old 已 low、ph_new 還 high）：n1 多一個 rising edge。兩者都是 pulse-width / 額外 edge 的問題，flop 會多數或少數一個 edge，或因 runt 進入 metastable。',
        '本題 sel 是外部輸入，所以「launch edge」其實由上游 FSM 決定：正確做法是用 n1 或 ph_old 的 falling edge 重新取樣 sel，把切換時刻固定在 window 中央。',
      ],
      limits: 'safe switching window（切換時的 Tvco,min = 20 / (3/8) ≈ 53 ps），不是 divider 的 Fmax',
    },
    {
      id: 'phase-clk',
      name: 'ph_k → U1（MUX data → out）→ U2.clk / U3.clk（clock path）',
      type: 'output',
      launch: { element: 'ph0', edge: 'rising', clock: 'ph_k' },
      capture: { element: 'u2', edge: 'rising', clock: 'n1' },
      segments: [
        { id: 'wire', label: 'phase wire', from: 'ph_k', to: 'U1.in_k', kind: 'wire', min: 2, max: 4, wires: ['w_ph0'] },
        { id: 'mux', label: 'U1 data → out', from: 'U1.in_k', to: 'n1', kind: 'mux', min: 6, max: 8, elements: ['u1'], wires: ['w_pclk0'] },
      ],
      description: '這是 clock path，不是 data path：它決定 n1（generated clock）相對 VCO 的 latency（模擬 real 模式看到的 8 ps）。8 個輸入到輸出的 delay 若不一致（phase-dependent delay），每次換 phase 就帶進固定的相位誤差；delay 隨 PVT / 電源變動則是 jitter。',
      limits: 'output latency 與 phase mismatch，不是 Fmax',
    },
    {
      id: 'rst-recovery',
      name: 'rst_n → U2 / U3（reset recovery / removal，相對 n1）',
      type: 'recovery',
      launch: { element: 'rst', edge: 'rising', clock: 'n1（第 k 個 rising edge：rst_n 的 de-assert 由 n1 自己的 reset synchronizer 釋放）' },
      capture: { element: 'u2', edge: 'rising', clock: 'n1（第 k+1 個 rising edge）', setup: 10, hold: 5 },
      segments: [
        { id: 'sync', label: 'reset synchronizer tCQ', from: 'n1 edge k', to: 'rst_n ↑', kind: 'tcq', min: 5, max: 8 },
        { id: 'rst', label: 'rst_n 走線', from: 'rst_n', to: 'U2.rstn / U3.rstn', kind: 'wire', min: 2, max: 4, wires: ['w_rst1', 'w_rst2'] },
      ],
      description: 'recovery / removal 要對 n1（不是 ph0）檢查：n1 的 edge 位置隨 sel 移動，最保守是對所有 8 個 phase 都檢查。釋放必須用 n1 自己同步，兩段 delay 量的是「釋放到達 rstn pin 的時刻相對 n1 edge k」：min 7 ps ≥ removal 5 ps（slack +2）、max 12 ps ≤ 100 − 10 − 2 − 2 = 86 ps（recovery slack +74）。注意 sel 切換的那一個 n1 週期可能被截短或拉長，這時 recovery 的可用時間不是整個 T——切換期間不要釋放 reset。',
      limits: 'reset release 的安全時間窗，不是 Fmax',
    },
  ],
}

// ---------------------------------------------------------------- 題目 8：PMUX + /N /N+1 + walker + DTC
/**
 * Tvco = 480 ps（phase 間距 60 ps）用來畫 budget；模擬用 400 ps（間距 50 ps）剛好是 walker 的極限。
 * 多種不同類型的 path：
 *   walk-start / walk-loop：walker 每走一格必須在 T/8 內把 NMUX 的 select 換好（setup-like，periodFraction 1/8）
 *   pmux-window：phase index 改變時 PMUX 的 safe window（async）
 *   cell-loop：/N /N+1 cell 自己的 loop（pclk domain，1 T，且 pclk 只會被拉長不會被縮短）
 *   mod-ctrl / step-ctrl：兩個外部控制的 deadline（async）
 *   dtc-latency：DTC 的 code-dependent latency（output）
 */
export const ex8Timing: TimingScenario = {
  id: 'lab-ex8',
  name: '題目 8：walker 的 T/8 deadline 才是 fVCO 的上限',
  description: 'Tvco = 480 ps（phase 間距 60 ps）。/N /N+1 cell 有整整 1 T 可用，非常鬆；真正緊的是 walker：每走一格，從 pclk 或 cclk 的 edge 出發、經過 NOR / NEQ → AND3 → INC → NMUX，必須在「下一個 phase 的 rising edge」之前把 NMUX 選好，可用時間只有 T/8。',
  schematic: ex8Schematic,
  env: { period: 480, skew: 0, jitter: 2, margin: 2 },
  modes: [
    { id: 'static', label: 'step = 0（整數除頻）', description: 'phase index 不動：walker 路徑永遠不被 sensitize，只剩 cell loop 與 mod / step deadline' },
    { id: 'walk', label: 'step ≠ 0（fractional）', description: '每個 output 週期 walker 走 step 格：T/8 的 deadline 出現' },
  ],
  paths: [
    {
      id: 'walk-start',
      name: 'FF0（cell）→ NOR → AND3 → INC → NMUX select（第一格，可用 T/8）',
      type: 'setup',
      modes: ['walk'],
      periodFraction: 1 / 8,
      launch: { element: 'div', edge: 'rising', clock: 'pclk（= ph[s] ↑ + PMUX）' },
      capture: { element: 'fsm', edge: 'rising', clock: 'ph[s+1] ↑（NMUX 必須已經選好）', setup: 0, hold: 0 },
      segments: [
        { id: 'pmux', label: 'PMUX（clock path）', from: 'ph[s] ↑', to: 'pclk ↑', kind: 'mux', min: 6, max: 8, elements: ['pmux'], wires: ['w_pclk_div'], note: 'pclk 比 VCO phase 晚這麼多；capture 端的 ph[s+1] 沒有這段延遲，所以要算進去' },
        { id: 'tcq', label: 'tCQ(FF0)', from: 'pclk ↑', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['div'] },
        { id: 'nor', label: 'NOR（d0 = state 00）', from: 'q0', to: 'd0', kind: 'logic', min: 8, max: 12, elements: ['div'], wires: ['w_st'] },
        { id: 'and3', label: 'AND3（rot_en）', from: 'd0', to: 'rot_en', kind: 'logic', min: 4, max: 6, elements: ['fsm'] },
        { id: 'inc', label: 'INC（n = s + 1）', from: 'rot_en', to: 'n', kind: 'logic', min: 4, max: 6, elements: ['fsm'] },
        { id: 'nmux', label: 'NMUX select → cclk', from: 'n', to: 'cclk', kind: 'mux', min: 6, max: 8, elements: ['fsm'] },
      ],
      sensitizedWhen: 'step ≠ 0 且 cell 剛回到 00（s ≠ t）',
      description: 'cell 在 ph[s] 的 rising edge 回到 00 ⇒ d0 = 1 ⇒ rot_en = 1 ⇒ n = s + 1 ⇒ NMUX 切到 ph[s+1]。如果 NMUX 在 ph[s+1] 已經升起之後才切過去，cclk 不會有 rising edge，這一格就走不到；等下一次機會時 cell 已經離開 00，walker 被關掉 ⇒ 少走一格，輸出相位少 T/8。arrival 48 ps，available 60 ps。',
      notes: ['Tvco,min = (48 + 0 + 2 + 2) / (1/8) = 416 ps ⇒ fVCO,max ≈ 2.4 GHz：整個架構的速度上限來自這條路徑，不是 cell。', '模擬用的 T = 400 ps（T/8 = 50）只剩 2 ps，沒有 jitter 就剛好過——這就是為什麼 real 模式的模擬能走，但實際設計不能這樣做。'],
      limits: 'fVCO 上限（fractional mode）',
    },
    {
      id: 'walk-loop',
      name: 'PS（phase index）→ NEQ → AND3 → INC → NMUX select（之後每一格，可用 T/8）',
      type: 'setup',
      modes: ['walk'],
      periodFraction: 1 / 8,
      launch: { element: 'fsm', edge: 'rising', clock: 'cclk（= ph[s+1] ↑ + NMUX）' },
      capture: { element: 'fsm', edge: 'rising', clock: 'ph[s+2] ↑', setup: 0, hold: 0 },
      segments: [
        { id: 'nmux-clk', label: 'NMUX（clock path）', from: 'ph[s+1] ↑', to: 'cclk ↑', kind: 'mux', min: 6, max: 8, elements: ['fsm'] },
        { id: 'tcq', label: 'tCQ(PS)', from: 'cclk ↑', to: 's', kind: 'tcq', min: 5, max: 8, elements: ['fsm'] },
        { id: 'neq', label: 'NEQ（s ≠ t）', from: 's', to: 'neq', kind: 'logic', min: 8, max: 10, elements: ['fsm'] },
        { id: 'and3', label: 'AND3（rot_en）', from: 'neq', to: 'rot_en', kind: 'logic', min: 4, max: 6, elements: ['fsm'] },
        { id: 'inc', label: 'INC（n = s + 1）', from: 'rot_en', to: 'n', kind: 'logic', min: 4, max: 6, elements: ['fsm'] },
        { id: 'nmux', label: 'NMUX select → cclk', from: 'n', to: 'cclk', kind: 'mux', min: 6, max: 8, elements: ['fsm'] },
      ],
      sensitizedWhen: 'step ≥ 2（同一個 output 週期要連續走兩格以上）',
      description: 's 在 cclk rising 更新後，NEQ 決定還要不要再走；若要，n = s + 1 必須在 ph[s+2] 升起前送到 NMUX。arrival 46 ps。',
      notes: ['這條與 walk-start 同樣是 T/8 的 deadline；兩者哪一條較慢取決於 NOR + PMUX 與 NEQ + NMUX 的相對 delay。', 'hold（0-cycle）：min 6 + 5 + 8 + 4 + 4 + 6 = 33 ps，NMUX 不會在 cclk edge 後太快換掉——否則同一個 edge 被截短。'],
      limits: 'fVCO 上限（step ≥ 2）',
    },
    {
      id: 'pmux-window',
      name: 'PS（phase index）→ PMUX select → pclk（safe window，forward +1）',
      type: 'async',
      modes: ['walk'],
      periodFraction: 3 / 8,
      launch: { element: 'fsm', edge: 'rising', clock: 'cclk = ph[s+1] ↑ + NMUX（window 打開）' },
      capture: { element: 'pmux', edge: 'falling', clock: 'ph[s] ↓（window 關閉，3/8 T 後）', setup: 0, hold: 0 },
      segments: [
        { id: 'nmux-clk', label: 'NMUX（clock path）', from: 'ph[s+1] ↑', to: 'cclk ↑', kind: 'mux', min: 6, max: 8, elements: ['fsm'] },
        { id: 'tcq', label: 'tCQ(PS)', from: 'cclk ↑', to: 's', kind: 'tcq', min: 5, max: 8, elements: ['fsm'], wires: ['w_sel'] },
        { id: 'pmux', label: 'PMUX select → out', from: 's', to: 'pclk', kind: 'mux', min: 6, max: 8, elements: ['pmux'], wires: ['w_pclk_div', 'w_pclk_fsm'] },
      ],
      description: 'walker 的設計保證 s 只在「ph[s] 與 ph[s+1] 都 high」時改變：s 在 ph[s+1] 升起後 8 + 8 ps 才更新，PMUX 再 8 ps 切過去，此時 ph[s] 仍為 high（要到 1/2 T 才落下）。所以 pclk 只是被拉長 T/8，沒有多餘 edge、沒有 runt。arrival 24 ps、window 180 ps，非常安全——這是 walker 架構的主要優點。',
      notes: ['若 s 一次跳好幾格（不用 walker），window = (4 − k)/8 T，k = 4 時為 0：這就是題目 7 的問題。'],
      limits: 'glitch-free switching（walker 架構下幾乎不會是問題）',
    },
    {
      id: 'cell-loop',
      name: 'FF0.Q → NOR → FF0.D（/N /N+1 cell 自己的 loop，clock = pclk）',
      type: 'setup',
      launch: { element: 'div', edge: 'rising', clock: 'pclk' },
      capture: { element: 'div', edge: 'rising', clock: 'pclk（下一個 rising edge，最短 1 T 後）', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(FF0)', from: 'pclk ↑', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['div'] },
        { id: 'nor', label: 'NOR', from: 'q0', to: 'd0', kind: 'logic', min: 8, max: 12, elements: ['div'] },
      ],
      description: 'launch 與 capture 都在 pclk 上。walker 只會把 pclk 的 high 拉長（每格 + T/8），永遠不會縮短，所以可用時間最短就是 1 T = 480 ps；arrival 20 ps，slack 449 ps。cell 不是瓶頸。',
      limits: 'divider 本身的 Fmax（遠高於 walker 的限制）',
    },
    {
      id: 'cw-loop',
      name: 'CW（control word）→ ADD → CW.D（clock = pclk）',
      type: 'setup',
      launch: { element: 'fsm', edge: 'rising', clock: 'pclk' },
      capture: { element: 'fsm', edge: 'rising', clock: 'pclk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ(CW)', from: 'pclk ↑', to: 't', kind: 'tcq', min: 5, max: 8, elements: ['fsm'] },
        { id: 'add', label: 'ADD（t + step）', from: 't', to: 'u', kind: 'logic', min: 8, max: 10, elements: ['fsm'] },
      ],
      description: 'control word 的累加器：每個 pclk edge 都取樣（只有 d0 = 1 時才真的加 step）。可用 1 T，arrival 18 ps。',
      limits: 'Fmax（次要）',
    },
    {
      id: 'mod-ctrl',
      name: 'mod → AND → FF1.D（control deadline ①）',
      type: 'async',
      launch: { element: 'mod', edge: 'rising', clock: 'mod 改變的時刻' },
      capture: { element: 'div', edge: 'rising', clock: 'pclk（cell 在 state 01 的那個 rising edge）', setup: 7, hold: 3 },
      segments: [
        { id: 'wire', label: 'mod wire', from: 'mod', to: 'AND.in1', kind: 'wire', min: 2, max: 4, wires: ['w_mod'] },
        { id: 'and', label: 'AND（d1 = q0 · mod）', from: 'AND.in1', to: 'd1', kind: 'logic', min: 8, max: 10, elements: ['div'] },
      ],
      description: '與題目 5 相同：mod 只在 cell 處於 01 的 pclk rising edge 被取樣，之前 21 ps 要穩定。注意這個 edge 的位置隨 phase index 移動（pclk = ph[s]），所以 mod 的產生器最好也用 pclk 或 div_out 當 clock。',
      limits: 'mod 的 setup deadline（每個 output 週期一次）',
    },
    {
      id: 'step-ctrl',
      name: 'k1 k0（step）→ ADD → CW.D（control deadline ②）',
      type: 'async',
      launch: { element: 'step', edge: 'rising', clock: 'step 改變的時刻' },
      capture: { element: 'fsm', edge: 'rising', clock: 'pclk（cell 離開 00、d0 = 1 的那個 rising edge）', setup: 7, hold: 3 },
      segments: [
        { id: 'wire', label: 'step wire', from: 'k1 k0', to: 'ADD', kind: 'wire', min: 2, max: 4, wires: ['w_step'] },
        { id: 'add', label: 'ADD（t + step）', from: 'ADD', to: 'u', kind: 'logic', min: 8, max: 10, elements: ['fsm'] },
      ],
      description: 'step 只在 cell 從 00 離開的那個 pclk edge 被加進 control word（u = t + step 若 d0 = 1）。它決定「這個 output 週期要走幾格」，必須在那個 edge 前 21 ps 穩定；之後 walker 會在同一個週期把 s 走到新的 t。',
      limits: 'step 的 setup deadline（每個 output 週期一次）',
    },
    {
      id: 'dtc-latency',
      name: 'div_out → DTC → out（control deadline ③：code 只能在 edge 之間更新）',
      type: 'output',
      launch: { element: 'div', edge: 'rising', clock: 'pclk' },
      capture: { element: 'dtc', edge: 'rising', clock: 'out' },
      segments: [
        { id: 'tcq', label: 'tCQ(FF0) + NOR（div_out）', from: 'pclk ↑', to: 'div_out ↑', kind: 'tcq', min: 13, max: 20, elements: ['div'], wires: ['w_div_out'] },
        { id: 'dtc', label: 'DTC（fixed + code × LSB）', from: 'div_out', to: 'out', kind: 'logic', min: 20, max: 80, elements: ['dtc'], wires: ['w_out'], note: 'code = 0 時 20 ps、code 最大時 20 + T/8 = 80 ps' },
      ],
      description: '這不是 setup path：DTC 把 div_out 的 edge 再延後 0～T/8（fine 部分）。latency 隨 code 改變是設計的目的，但 code 只能在「上一個 edge 已經走出 DTC、下一個 edge 還沒進來」的空檔更新——也就是 out 的 rising edge 之後、下一個 div_out rising 之前，可用時間約 N·T − 80 ps。code 若在 edge 穿過 DTC 時改變，會得到既不是舊值也不是新值的 delay（甚至 glitch）。',
      notes: ['DTC 的 code 來自 accumulator 的 fine bits；coarse bits 走 PMUX。兩者的更新時刻必須對齊同一個 output 週期，否則會出現「coarse 已經跳、fine 還沒跳」的 T/8 誤差 spur。'],
      limits: 'DTC code 的更新 window 與 latency，不是 Fmax',
    },
  ],
}
