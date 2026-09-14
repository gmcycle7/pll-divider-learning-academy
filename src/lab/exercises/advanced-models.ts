import type { Bit, Netlist, SimOptions, Values } from '@/models/divider/types'
import { and, nor, not, xor } from '@/utils/bits'

/**
 * 題目 7、8 的 simulate 選項。
 *
 * inputLead = 0.55：input 在「下一個 ph0 rising edge」前 0.55 T 生效（也就是前一個 edge 後 0.45 T）。
 * 這個值有兩個用途：
 *   1. engine 以 ph0 為主 clock 推進，每一步只處理 (k·T − 0.55 T, k·T + 0.45 T] 這段時間；
 *      每個 phase 的 falling edge 都必須落在某一步的處理視窗內才會被排進事件佇列。
 *      預設 0.35 時 ph4 / ph5 的 falling edge（k·T + 0.5 T、k·T + 0.625 T）剛好落在視窗之間，
 *      pclk 會卡在 high、divider 停住；0.55 讓 8 個 phase 的 rising / falling edge 都被完整處理。
 *   2. 對 select 而言，切換發生在 ph0 rising 之後 0.45 T：此時 ph0..ph3 為 high、ph4..ph7 為 low。
 *      所以 sel 0 → 3 是乾淨的（新舊 phase 都 high），sel 0 → 4 會在 pclk 上留下 0.05 T 的 runt low pulse
 *      再多出一個 rising edge——這正是題目 7 要讓學生看到的 PMUX glitch。
 */
export const PMUX_INPUT_LEAD = 0.55

/** 8-phase clock 名稱：ph0..ph7，phase i 的 rising edge 比 ph0 晚 i/8 T */
export const PHASES = ['ph0', 'ph1', 'ph2', 'ph3', 'ph4', 'ph5', 'ph6', 'ph7'] as const

/** 8-phase 的 phase 數 */
export const N_PHASES = 8

/** 以 T 為單位的 phase 間距 */
export const PHASE_STEP_T = 1 / N_PHASES

const phaseClocks = PHASES.map((name, i) => ({ name, phase: i / 8, description: `VCO phase ${i}（rising edge 比 ph0 晚 ${i}/8 T）` }))

/** 由三個 select bit 算出 index（b2 是 MSB） */
export function selIndex(v: Values, b0: string, b1: string, b2: string): number {
  return (v[b0] ?? 0) + 2 * (v[b1] ?? 0) + 4 * (v[b2] ?? 0)
}

/** 8:1 MUX：依 index 選出對應 phase 的目前值 */
function mux8(v: Values, b0: string, b1: string, b2: string): Bit {
  return v[PHASES[selIndex(v, b0, b1, b2)]] ?? 0
}

/** 3-bit 加法（mod 8）的第 i 個 bit */
function add3Bit(a: number, b: number, i: number): Bit {
  return (((a + b) & 7) >> i) & 1 ? 1 : 0
}

/**
 * 題目 7：8-phase PMUX divider
 *
 * - 8 個 VCO phase（ph0..ph7）進入一個 8:1 MUX，select = s2 s1 s0
 * - MUX 輸出 pclk 是「產生出來的 clock（generated clock）」，驅動一個同步 /4（兩個 DFF）
 * - 除數固定為 4，但輸出 edge 的位置隨 select 移動：sel = k 時輸出 edge 比 sel = 0 晚 k/8 T
 *
 * state (q1 q0)：00 → 01 → 10 → 11 → 00（在 pclk rising edge 前進）
 *   d0 = NOT q0
 *   d1 = q1 XOR q0
 *   div_out = q1（rising edge 在 pclk 的第 2、6、10… 個 edge，duty 50%）
 *
 * 用 simulate 驗證（T = 100，inputLead 0.55）：
 *   sel = 0：div_out rising 在 200, 600, 1000…；sel = 3：237.5, 637.5, …（晚 3/8 T = 37.5 ps）
 *   sel = 4：250, 650, …；sel = 7：287.5, 687.5, …（每一格 12.5 ps；除數永遠是 4、duty 50%）
 *   real delay：MUX8 8 ps 讓 pclk 比 ph[sel] 晚 8 ps，div_out 再晚 tCQ 8 ps（216, 616, …）
 *   sel 在 edge 5 前由 0 切到 4（t = 445）：ph0 = 1、ph4 = 0 ⇒ pclk 在 445 落下、450 又被 ph4 拉起：
 *     5 ps 的 runt low pulse + 一個多出來的 rising edge，/4 多數一個 edge ⇒ 輸出 edge 提前 1 T = −100 ps
 *     （div_out rising 量到 200 / 550 / 950；乾淨切到 sel = 4 應該是 250 / 650 / 1050，所以 550 而不是 650）。
 *   同一時刻切到 3：ph0 與 ph3 都是 high ⇒ pclk 維持 high，沒有多餘 edge，只是 falling edge 由 450 延到 487.5。
 */
export const pmux8Div4: Netlist = {
  id: 'pmux8-div4',
  name: '8-phase PMUX + /4',
  description: '8:1 MUX 從 8 個 VCO phase 選一個當 clock（pclk），pclk 驅動同步 /4。select 改變的是輸出相位，不是除數。',
  clocks: phaseClocks,
  inputs: [
    { name: 's0', initial: 0, description: 'select bit 0（LSB）' },
    { name: 's1', initial: 0, description: 'select bit 1' },
    { name: 's2', initial: 0, description: 'select bit 2（MSB）；sel = 4·s2 + 2·s1 + s0' },
  ],
  flops: [
    { q: 'q0', d: 'd0', clk: 'pclk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0', description: '由 pclk（MUX 輸出）觸發，不是由任何一個 ph 直接觸發' },
    { q: 'q1', d: 'd1', clk: 'pclk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
  ],
  gates: [
    { out: 'pclk', inputs: [...PHASES, 's0', 's1', 's2'], fn: (v) => mux8(v, 's0', 's1', 's2'), delay: 8, label: 'MUX8', kind: 'mux', description: 'pclk = ph[sel]' },
    { out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV', kind: 'inv' },
    { out: 'd1', inputs: ['q1', 'q0'], fn: (v) => xor(v.q1, v.q0), delay: 12, label: 'XOR', kind: 'xor' },
    { out: 'div_out', inputs: ['q1'], fn: (v) => v.q1, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'div_out',
  watch: ['pclk'],
  equations: [
    { target: 'pclk', text: 'pclk = ph[sel]，sel = 4·s2 + 2·s1 + s0', latex: 'pclk = ph_{sel},\\quad sel = 4s_2 + 2s_1 + s_0' },
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
    { target: 'd1', text: 'd1 = q1 XOR q0', latex: 'd_1 = q_1 \\oplus q_0' },
    { target: 'div_out', text: 'div_out = q1', latex: 'div\\_out = q_1' },
  ],
  defaultDelays: { tcq: 8, gate: 8 },
}

/** 題目 7 的模擬選項：T = 100 ps（fVCO = 10 GHz 只是為了讓 T/8 = 12.5 ps 好算） */
export const ex7SimOptions: SimOptions = { period: 100, inputLead: PMUX_INPUT_LEAD }

/** 題目 8 的模擬週期（ps）：8-phase ring VCO 2.5 GHz，phase 間距 T/8 = 50 ps */
export const WALKER_T = 400

/** 題目 8 的模擬選項 */
export const ex8SimOptions: SimOptions = { period: WALKER_T, inputLead: PMUX_INPUT_LEAD }

/** 由 3 個 select bit 的值算 index（給 Solution 與測試用） */
export function phaseIndexOf(v: Values, prefix: 's' | 't' | 'n' = 's'): number {
  return selIndex(v, `${prefix}0`, `${prefix}1`, `${prefix}2`)
}

/**
 * 題目 8：PMUX + /2 /3 + phase walker（DTC 的 coarse 部分）
 *
 * 架構
 *   pclk = ph[s]，s = s2 s1 s0 是三個 flop（phase index，這是 state 的一部分），驅動 /2 /3 cell（q1 q0，與題目 5 相同）
 *   control word t = t2 t1 t0（三個 flop，累加器的 coarse bits）：在 cell 離開 state 00 的那個 pclk edge 載入 t + step，
 *     step = 2·k1 + k0（0..3）——這就是「每個 output 週期把 control word 加 increment」的 coarse 部分
 *   walker：當 cell 在 state 00、pclk 為 high、而且 s ≠ t 時，把 s 往前走一格
 *     - n = s + 1（mod 8），cclk = ph[n]：walker 的 flop 在「新 phase 的 rising edge」把 s ← n
 *     - 此刻舊 phase 仍為 high（rising 之後 1/8 T），新 phase 剛 rising ⇒ pclk 從 high 切到 high，不產生額外 edge
 *     - 每走一格，pclk 的這個 high pulse 被拉長 1/8 T；走到 s = t 停下（一個 output 週期最多 7 格）
 *   pclk 為 high 的條件保證 select 只在「舊、新 phase 都是 high」的安全窗內切換；wrap 7 → 0 也只是再走一格
 *
 * 平均除數 = N + step/8，N = 2 + mod（每個 output 週期 pclk 被拉長 step 個 1/8 T）
 *
 * 用 simulate 驗證（T = 400、inputLead 0.55，ideal 與 real 兩種 delay 模式結果相同）：
 *   step = 0：mod = 0 → /2（rising 800, 1600, …）、mod = 1 → /3；s 永遠是 0
 *   step = 1、mod = 0：output rising 2T, 4.125T, 6.25T, …（每個週期 2.125 T）；s 依序 0,1,2,…,7,0（wrap 只是再走一格）
 *   step = 3、mod = 0：2.375 T；s = 0,3,6,1,4,7,2,5,0…（wrap 7 → 0 時間仍然單調遞增）
 *   step = 3、mod = 1：3.375 T；step = 2、mod = 1：3.25 T；step = 1、mod = 1：3.125 T
 *   pclk 上沒有任何比 T/8 窄的 pulse（walker 只在新舊 phase 都 high 時切換）
 *
 * real 模式的兩條 walker deadline（以 ph[s] rising = E 為 0）：
 *   第一步：PMUX 8 → tCQ 8 → NOR 12 → AND3 6 → INC 6 → NMUX 8 = 48 ps，必須在 ph[s+1] rising（E + T/8 = 50）之前選好
 *   之後每一步：NMUX 8 → tCQ 8 → NEQ 10 → AND3 6 → INC 6 → NMUX 8 = 46 ps，必須在下一個 phase rising 前選好
 *   T = 400 只剩 2～4 ps margin：這兩條是本題最緊的 timing deadline，也是 fVCO 的上限來源。
 */
export const pmuxWalkerDm23: Netlist = {
  id: 'pmux-nn1-dtc',
  name: 'PMUX + /2 /3 + phase walker',
  description: '8-phase MUX 產生 pclk 驅動 /2 /3 cell；control word t 每個 output 週期加 step；phase index s 在 state 00 期間往 t 逐格前進，每格把 pclk 拉長 1/8 T。',
  clocks: phaseClocks,
  inputs: [
    { name: 'mod', initial: 0, description: 'mod=0：/2；mod=1：/3（整數部分 N）' },
    { name: 'k0', initial: 0, description: 'step bit 0：每個 output 週期 control word 加 step = 2·k1 + k0' },
    { name: 'k1', initial: 0, description: 'step bit 1' },
  ],
  flops: [
    { q: 'q0', d: 'd0', clk: 'pclk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0', description: '/2 /3 cell 的 LSB，由 pclk 觸發' },
    { q: 'q1', d: 'd1', clk: 'pclk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1', description: '/2 /3 cell 的 MSB，由 pclk 觸發' },
    { q: 's0', d: 'n0', clk: 'cclk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'PS0', description: 'phase index bit 0，由 cclk（下一個 phase）觸發' },
    { q: 's1', d: 'n1', clk: 'cclk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'PS1', description: 'phase index bit 1' },
    { q: 's2', d: 'n2', clk: 'cclk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'PS2', description: 'phase index bit 2' },
    { q: 't0', d: 'u0', clk: 'pclk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'CW0', description: 'control word bit 0（累加器 coarse bit 0），由 pclk 觸發' },
    { q: 't1', d: 'u1', clk: 'pclk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'CW1', description: 'control word bit 1' },
    { q: 't2', d: 'u2', clk: 'pclk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'CW2', description: 'control word bit 2（MSB）' },
  ],
  gates: [
    { out: 'pclk', inputs: [...PHASES, 's0', 's1', 's2'], fn: (v) => mux8(v, 's0', 's1', 's2'), delay: 8, label: 'PMUX', kind: 'mux', description: 'pclk = ph[s]' },
    { out: 'd0', inputs: ['q1', 'q0'], fn: (v) => nor(v.q1, v.q0), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'd1', inputs: ['q0', 'mod'], fn: (v) => and(v.q0, v.mod), delay: 10, label: 'AND', kind: 'and' },
    { out: 'div_out', inputs: ['d0'], fn: (v) => v.d0, delay: 0, label: 'wire', kind: 'buf', description: 'state 00 時為 1' },
    // control word：t ← t + step，只在 cell 離開 state 00 的 edge（d0 = 1 時）載入
    { out: 'u0', inputs: ['t0', 't1', 't2', 'k0', 'k1', 'd0'], fn: (v) => add3Bit(selIndex(v, 't0', 't1', 't2'), v.d0 ? v.k0 + 2 * v.k1 : 0, 0), delay: 10, label: 'ADD0', kind: 'custom', description: 'u = t + (d0 ? step : 0)，bit 0' },
    { out: 'u1', inputs: ['t0', 't1', 't2', 'k0', 'k1', 'd0'], fn: (v) => add3Bit(selIndex(v, 't0', 't1', 't2'), v.d0 ? v.k0 + 2 * v.k1 : 0, 1), delay: 10, label: 'ADD1', kind: 'custom', description: 'bit 1' },
    { out: 'u2', inputs: ['t0', 't1', 't2', 'k0', 'k1', 'd0'], fn: (v) => add3Bit(selIndex(v, 't0', 't1', 't2'), v.d0 ? v.k0 + 2 * v.k1 : 0, 2), delay: 10, label: 'ADD2', kind: 'custom', description: 'bit 2（mod 8，超過 7 就 wrap）' },
    // walker
    { out: 'neq', inputs: ['s0', 's1', 's2', 't0', 't1', 't2'], fn: (v) => (selIndex(v, 's0', 's1', 's2') !== selIndex(v, 't0', 't1', 't2') ? 1 : 0), delay: 10, label: 'NEQ', kind: 'custom', description: 'neq = (s ≠ t)' },
    { out: 'rot_en', inputs: ['d0', 'pclk', 'neq'], fn: (v) => and(v.d0, v.pclk, v.neq), delay: 6, label: 'AND3', kind: 'and', description: 'rot_en = (state == 00) AND (pclk == 1) AND (s ≠ t)：只在舊 phase 為 high 的安全窗內走' },
    { out: 'n0', inputs: ['s0', 'rot_en'], fn: (v) => xor(v.s0, v.rot_en), delay: 6, label: 'INC0', kind: 'xor', description: 'n = s + rot_en（3-bit，mod 8）' },
    { out: 'n1', inputs: ['s1', 's0', 'rot_en'], fn: (v) => xor(v.s1, and(v.s0, v.rot_en)), delay: 6, label: 'INC1', kind: 'custom' },
    { out: 'n2', inputs: ['s2', 's1', 's0', 'rot_en'], fn: (v) => xor(v.s2, and(v.s1, v.s0, v.rot_en)), delay: 6, label: 'INC2', kind: 'custom' },
    { out: 'cclk', inputs: [...PHASES, 'n0', 'n1', 'n2'], fn: (v) => mux8(v, 'n0', 'n1', 'n2'), delay: 8, label: 'NMUX', kind: 'mux', description: 'cclk = ph[n]：新 phase 的 rising edge 才 commit s ← n' },
  ],
  stateOrder: ['t2', 't1', 't0', 's2', 's1', 's0', 'q1', 'q0'],
  output: 'div_out',
  watch: ['pclk', 'rot_en', 'cclk'],
  equations: [
    { target: 'pclk', text: 'pclk = ph[s]，s = 4·s2 + 2·s1 + s0', latex: 'pclk = ph_{s},\\quad s = 4s_2 + 2s_1 + s_0' },
    { target: 'd0', text: 'd0 = NOT(q1 OR q0)', latex: 'd_0 = \\overline{q_1 + q_0}' },
    { target: 'd1', text: 'd1 = q0 AND mod', latex: 'd_1 = q_0 \\cdot mod' },
    { target: 'div_out', text: 'div_out = NOT(q1 OR q0)（state 00 時為 1）', latex: 'div\\_out = \\overline{q_1 + q_0}' },
    { target: 'u', text: 'u = (t + step) mod 8 若 d0 = 1，否則 u = t；step = 2·k1 + k0', latex: 'u = d_0\\,?\\,(t + step) \\bmod 8 : t' },
    { target: 'rot_en', text: 'rot_en = (q1 q0 == 00) AND pclk AND (s ≠ t)', latex: 'rot\\_en = \\overline{q_1 + q_0} \\cdot pclk \\cdot [s \\ne t]' },
    { target: 'n', text: 'n = (s + rot_en) mod 8', latex: 'n = (s + rot\\_en) \\bmod 8' },
    { target: 'cclk', text: 'cclk = ph[n]；s ← n 在 cclk rising edge', latex: 'cclk = ph_{n}' },
  ],
  defaultDelays: { tcq: 8, gate: 8 },
}
