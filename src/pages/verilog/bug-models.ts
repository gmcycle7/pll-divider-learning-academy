/**
 * Verilog 頁與 Bug Lab 用的 netlist 模型。
 *
 * 每個 bug 案例都用 engine 可以模擬的 netlist 建模，讓「有 bug 的 RTL」與「修正後的 RTL」
 * 都能逐 clock edge 驗證（見 bug-models.test.ts）。
 *
 * 命名慣例：clk, rst_n, mod, sel, q0…, d0…, div_out。
 */
import type { Bit, Netlist, SimOptions, Values } from '@/models/divider/types'
import { and, nand, nor, not, or, xor } from '@/utils/bits'
import { div3Lockup, div3Recover, dualMod12, dualMod12Glitchy, sync4 } from '@/models/divider/examples'

/** 比這個寬度（ps，T = 100 時為 0.3T）窄的 pulse 視為 runt / glitch */
export const RUNT_MIN = 30

// ---------------------------------------------------------------------------
// Bug 1：missing reset —— 兩個沒有 reset 的 /2，power-up 相位各自獨立
// ---------------------------------------------------------------------------
const pairGates: Netlist['gates'] = [
  { out: 'da', inputs: ['qa'], fn: (v) => not(v.qa), delay: 6, label: 'INVa', kind: 'inv' },
  { out: 'db', inputs: ['qb'], fn: (v) => not(v.qb), delay: 6, label: 'INVb', kind: 'inv' },
  { out: 'phase_err', inputs: ['qa', 'qb'], fn: (v) => xor(v.qa, v.qb), delay: 0, label: 'XOR（qa ≠ qb）', kind: 'xor' },
]
const pairEquations: Netlist['equations'] = [
  { target: 'da', text: 'da = NOT qa', latex: 'd_a = \\overline{q_a}' },
  { target: 'db', text: 'db = NOT qb', latex: 'd_b = \\overline{q_b}' },
  { target: 'phase_err', text: 'phase_err = qa XOR qb（兩路相位是否一致）', latex: 'phase\\_err = q_a \\oplus q_b' },
]

/** 有 bug：兩個 /2 都沒有 reset。RTL 模擬時 q 永遠是 X；矽上則是隨機相位。 */
export const noResetPair: Netlist = {
  id: 'v-noreset-pair',
  name: '兩個沒有 reset 的 /2（相位不確定）',
  description: 'FFa 與 FFb 各自從 power-up 的隨機值開始 toggle，兩者可能同相也可能反相。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'qa', d: 'da', clk: 'clk', edge: 'rising', tcq: 8, label: 'FFa' },
    { q: 'qb', d: 'db', clk: 'clk', edge: 'rising', tcq: 8, label: 'FFb' },
  ],
  gates: pairGates,
  stateOrder: ['qb', 'qa'],
  output: 'qa',
  watch: ['qb', 'phase_err'],
  equations: pairEquations,
  defaultDelays: { tcq: 8, gate: 6 },
}

/** 修正：兩個 /2 共用 rst_n，reset 釋放後從同一個 state 出發。 */
export const resetPair: Netlist = {
  ...noResetPair,
  id: 'v-reset-pair',
  name: '兩個有共同 reset 的 /2（相位一致）',
  description: 'rst_n 把兩個 flop 都清成 0，之後每個 edge 同時 toggle。',
  flops: [
    { q: 'qa', d: 'da', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FFa' },
    { q: 'qb', d: 'db', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FFb' },
  ],
}

/** bug 版本用來展示「power-up 剛好反相」的初始 state */
export const NO_RESET_ANTIPHASE: Values = { qa: 0, qb: 1 }
/** bug 版本用來展示「power-up 剛好同相」的初始 state（運氣好的那一次） */
export const NO_RESET_INPHASE: Values = { qa: 0, qb: 0 }

// ---------------------------------------------------------------------------
// Bug 2：incomplete case —— /3 FSM 的 case 沒寫 2'b11 ⇒ next 被推斷成 latch
// ---------------------------------------------------------------------------
/**
 * always_comb 裡 case 只寫了 00/01/10：state = 11 時 next 沒有被指定 ⇒ 保持上一次的值（latch）。
 * 這裡用 engine 的 latch 建模：case_hit = state ≠ 11 當作 latch enable。
 */
export const div3IncompleteCase: Netlist = {
  id: 'v-div3-latch',
  name: '/3 FSM，case 沒有 default（next 變成 latch）',
  description: 'state = 11 時 case 沒有任何一列匹配，next[1:0] 保持舊值。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'n0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'n1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
  ],
  latches: [
    { q: 'n0', d: 'c0', en: 'case_hit', activeHigh: true, delay: 4, label: 'LAT0（推斷出的 latch）' },
    { q: 'n1', d: 'c1', en: 'case_hit', activeHigh: true, delay: 4, label: 'LAT1（推斷出的 latch）' },
  ],
  gates: [
    { out: 'c0', inputs: ['q0', 'q1'], fn: (v) => nor(v.q0, v.q1), delay: 10, label: 'case → next[0]', kind: 'nor' },
    { out: 'c1', inputs: ['q0', 'q1'], fn: (v) => and(v.q0, not(v.q1)), delay: 10, label: 'case → next[1]', kind: 'and' },
    { out: 'case_hit', inputs: ['q0', 'q1'], fn: (v) => nand(v.q0, v.q1), delay: 6, label: 'case 有匹配（state ≠ 11）', kind: 'nand' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'q1',
  watch: ['case_hit', 'n1', 'n0'],
  equations: [
    { target: 'c1c0', text: 'case: 00→01, 01→10, 10→00（11 沒有寫）', latex: '\\text{next} = \\begin{cases}01 & s=00\\\\10 & s=01\\\\00 & s=10\\\\ \\text{(hold)} & s=11\\end{cases}' },
    { target: 'case_hit', text: 'case_hit = NOT(q1 AND q0)  → latch enable', latex: 'case\\_hit = \\overline{q_1 q_0}' },
    { target: 'n', text: 'n = case_hit ? c : n(舊值)   ← latch', latex: 'n \\leftarrow c \\text{ while } case\\_hit = 1' },
  ],
  legalStates: ['00', '01', '10'],
  defaultDelays: { tcq: 8, gate: 6 },
}

/** 用來示範「11 的去向取決於 latch 記得的舊值」的兩組初始條件 */
export const LATCH_HISTORY_A: Values = { q1: 1, q0: 1, n1: 1, n0: 0 } // latch 記得 next = 10
export const LATCH_HISTORY_B: Values = { q1: 1, q0: 1, n1: 0, n0: 1 } // latch 記得 next = 01

// ---------------------------------------------------------------------------
// Bug 3：illegal state lock-up —— 使用 examples 的 div3Lockup（default: next = state）
//        修正版為 div3Recover（default: next = 2'b00）。在檔尾 re-export 給頁面使用。
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Bug 4：combinational feedback —— always_comb 裡把輸出反相接回自己
// ---------------------------------------------------------------------------
/**
 * 設計者想「在 terminal count 時 toggle div_out」（/4 counter → /8，50% duty），
 * 卻寫成 assign div_out = tc ? ~div_out : div_out; ⇒ tc=1 期間形成 ring oscillator。
 *
 * ⚠ 只能用 delayMode: 'real' 模擬（zero-delay 的 comb loop 沒有 fixed point）。
 */
export const combToggleBug: Netlist = {
  id: 'v-comb-toggle',
  name: 'always_comb 把 div_out 接回自己（combinational loop）',
  description: 'tc = 1 時 div_out = NOT div_out，沒有 flop 擋住 ⇒ 以 gate delay 自我振盪。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV', kind: 'inv' },
    { out: 'd1', inputs: ['q0', 'q1'], fn: (v) => xor(v.q0, v.q1), delay: 12, label: 'XOR', kind: 'xor' },
    { out: 'tc', inputs: ['q0', 'q1'], fn: (v) => and(v.q0, v.q1), delay: 6, label: 'AND（tc = cnt==3）', kind: 'and' },
    { out: 'div_out', inputs: ['tc', 'div_out'], fn: (v) => (v.tc ? not(v.div_out) : v.div_out), delay: 15, label: 'always_comb（loop）', kind: 'custom' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'div_out',
  watch: ['tc'],
  equations: [
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
    { target: 'd1', text: 'd1 = q1 XOR q0', latex: 'd_1 = q_1 \\oplus q_0' },
    { target: 'tc', text: 'tc = q1 AND q0', latex: 'tc = q_1 q_0' },
    { target: 'div_out', text: 'div_out = tc ? NOT div_out : div_out   ← 自己接自己', latex: 'div\\_out = tc\\,?\\,\\overline{div\\_out} : div\\_out' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}
/** combToggleBug 只能用 real delay 模擬 */
export const COMB_LOOP_OPTIONS: SimOptions = { delayMode: 'real' }

/** 修正：toggle 放進 always_ff（q2 <= tc ? ~q2 : q2）⇒ /8、50% duty */
export const combToggleFixed: Netlist = {
  id: 'v-comb-toggle-fixed',
  name: 'toggle 改放在 always_ff（q2）',
  description: 'q2 在 tc = 1 的那個 edge toggle 一次 ⇒ /8、50% duty。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
    { q: 'q2', d: 'd2', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF2' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV', kind: 'inv' },
    { out: 'd1', inputs: ['q0', 'q1'], fn: (v) => xor(v.q0, v.q1), delay: 12, label: 'XOR', kind: 'xor' },
    { out: 'tc', inputs: ['q0', 'q1'], fn: (v) => and(v.q0, v.q1), delay: 6, label: 'AND（tc）', kind: 'and' },
    { out: 'd2', inputs: ['tc', 'q2'], fn: (v) => xor(v.tc, v.q2), delay: 12, label: 'XOR2', kind: 'xor' },
    { out: 'div_out', inputs: ['q2'], fn: (v) => v.q2, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['q2', 'q1', 'q0'],
  output: 'div_out',
  watch: ['tc'],
  equations: [
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
    { target: 'd1', text: 'd1 = q1 XOR q0', latex: 'd_1 = q_1 \\oplus q_0' },
    { target: 'tc', text: 'tc = q1 AND q0', latex: 'tc = q_1 q_0' },
    { target: 'd2', text: 'd2 = q2 XOR tc', latex: 'd_2 = q_2 \\oplus tc' },
    { target: 'div_out', text: 'div_out = q2', latex: 'div\\_out = q_2' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

// ---------------------------------------------------------------------------
// Bug 5：glitchy clock MUX / combinational clock gating —— 使用 examples 的
//        dualMod12Glitchy（bug）與 dualMod12（修正）。
//        Bug Lab 的面板用 sel 預設為 1 的版本，打開就處在會出 runt 的 /2 模式。
// ---------------------------------------------------------------------------
const SEL_DEFAULT_1: Netlist['inputs'] = [{ name: 'sel', initial: 1, description: 'sel=0：/1；sel=1：/2（預設 1）' }]
/** 有 bug：en = ~sel | q0 是純組合邏輯，直接 AND clk（sel 預設 1） */
export const dm12GlitchySel1: Netlist = { ...dualMod12Glitchy, id: 'v-dm12-glitchy-sel1', name: '/1 /2（combinational gating，sel = 1）', inputs: SEL_DEFAULT_1 }
/** 修正：en 由 negedge clk 的 flop 重新取樣（sel 預設 1） */
export const dm12FixedSel1: Netlist = { ...dualMod12, id: 'v-dm12-fixed-sel1', name: '/1 /2（en 由 negedge flop 取樣，sel = 1）', inputs: SEL_DEFAULT_1 }

// ---------------------------------------------------------------------------
// Bug 6：MOD 到達太晚 —— swallow 的決定雖然有打進 flop，但 flop 之後還經過一大塊
//        慢的比較 / 選擇邏輯（90 ps）才到 cell ⇒ mod 在 cycle 中途才改變，AND 來不及
// ---------------------------------------------------------------------------
const dm23CellFlops: Netlist['flops'] = [
  { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
  { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
]

/**
 * 有 bug：sw_r <= (state == 00) 是 flop，但 mod = sw_r & (慢的比較) 這段 combinational 有 90 ps，
 * 加上 AND(q0, mod) 10 ps ⇒ 108 ps > T = 100 ps ⇒ edge 抓到舊的 d1 ⇒ 該 cycle 沒有吞 ⇒ /2。
 * zero-delay（RTL 模擬）看不到這個問題：ideal 模式除 3、real 模式除 2。
 */
export const dm23ModLate: Netlist = {
  id: 'v-dm23-mod-late',
  name: '/2 /3 cell，mod 經過 90 ps 的慢邏輯才到',
  description: 'swallow 決定在 edge 後 8 ps 送出，再走 90 ps 的比較器 / MUX，AND 需要 10 ps：總共 108 ps > 100 ps。',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'en_frac', initial: 1, description: '允許吞 cycle（靜態設定，模擬時不要動）' }],
  flops: [...dm23CellFlops, { q: 'sw_r', d: 'div_out', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF_SW（swallow_r <= state==00）' }],
  gates: [
    { out: 'd0', inputs: ['q0', 'q1'], fn: (v) => nor(v.q0, v.q1), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'div_out', inputs: ['d0'], fn: (v) => v.d0, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'mod', inputs: ['sw_r', 'en_frac'], fn: (v) => and(v.sw_r, v.en_frac), delay: 90, label: '比較 / MUX（慢：90 ps）', kind: 'custom' },
    { out: 'd1', inputs: ['q0', 'mod'], fn: (v) => and(v.q0, v.mod), delay: 10, label: 'AND', kind: 'and' },
  ],
  stateOrder: ['sw_r', 'q1', 'q0'],
  output: 'div_out',
  watch: ['mod'],
  equations: [
    { target: 'd0', text: 'd0 = NOT(q1 OR q0)', latex: 'd_0 = \\overline{q_1 + q_0}' },
    { target: 'sw_r', text: 'sw_r ← (state == 00) @ clk rising', latex: 'sw_r \\leftarrow [\\,state = 00\\,]\\ @\\ clk\\uparrow' },
    { target: 'mod', text: 'mod = sw_r AND (慢的比較 / MUX)  → 90 ps', latex: 'mod = sw_r \\cdot ok \\quad (t_{logic} = 90\\,\\text{ps})' },
    { target: 'd1', text: 'd1 = q0 AND mod', latex: 'd_1 = q_0 \\cdot mod' },
    { target: 'div_out', text: 'div_out = NOT(q1 OR q0)', latex: 'div\\_out = \\overline{q_1 + q_0}' },
  ],
  legalStates: ['00', '01', '10'],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * 修正：慢的比較邏輯的輸入是靜態的，先算好打進 ok_r；swallow 決定與 ok_r 只用一個 AND 就打進 mod_r；
 * cell 直接看 mod_r（flop 輸出）⇒ mod path = tCQ + AND + setup，遠小於 T。
 */
export const dm23ModRetimed: Netlist = {
  id: 'v-dm23-mod-retimed',
  name: '/2 /3 cell，mod 由緊鄰 cell 的 flop 直接驅動',
  description: 'mod_r <= (state == 00) & ok_r；慢邏輯移到 ok_r 前面（輸入靜態，不在每 cycle 的路徑上）。',
  clocks: [{ name: 'clk' }],
  inputs: [{ name: 'en_frac', initial: 1, description: '允許吞 cycle（靜態設定）' }],
  flops: [
    ...dm23CellFlops,
    { q: 'ok_r', d: 'ok', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF_OK（慢邏輯先打進 flop）' },
    { q: 'mod_r', d: 'm_pre', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF_MOD（緊鄰 cell）' },
  ],
  gates: [
    { out: 'ok', inputs: ['en_frac'], fn: (v) => v.en_frac, delay: 90, label: '比較 / MUX（慢，但輸入靜態）', kind: 'custom' },
    { out: 'd0', inputs: ['q0', 'q1'], fn: (v) => nor(v.q0, v.q1), delay: 12, label: 'NOR', kind: 'nor' },
    { out: 'div_out', inputs: ['d0'], fn: (v) => v.d0, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'm_pre', inputs: ['div_out', 'ok_r'], fn: (v) => and(v.div_out, v.ok_r), delay: 10, label: 'AND（state==00 & ok_r）', kind: 'and' },
    { out: 'd1', inputs: ['q0', 'mod_r'], fn: (v) => and(v.q0, v.mod_r), delay: 10, label: 'AND', kind: 'and' },
  ],
  stateOrder: ['mod_r', 'ok_r', 'q1', 'q0'],
  output: 'div_out',
  watch: ['m_pre'],
  equations: [
    { target: 'ok_r', text: 'ok_r ← (慢的比較 / MUX) @ clk rising（靜態輸入）', latex: 'ok_r \\leftarrow ok\\ @\\ clk\\uparrow' },
    { target: 'mod_r', text: 'mod_r ← (state == 00) AND ok_r @ clk rising', latex: 'mod_r \\leftarrow [\\,state = 00\\,]\\cdot ok_r\\ @\\ clk\\uparrow' },
    { target: 'd0', text: 'd0 = NOT(q1 OR q0)', latex: 'd_0 = \\overline{q_1 + q_0}' },
    { target: 'd1', text: 'd1 = q0 AND mod_r', latex: 'd_1 = q_0 \\cdot mod_r' },
    { target: 'div_out', text: 'div_out = NOT(q1 OR q0)', latex: 'div\\_out = \\overline{q_1 + q_0}' },
  ],
  legalStates: ['00', '01', '10'],
  defaultDelays: { tcq: 8, gate: 6 },
}
/** mod-path 案例預設用 real delay（zero-delay 看不到問題） */
export const MOD_PATH_OPTIONS: SimOptions = { delayMode: 'real' }

// ---------------------------------------------------------------------------
// Bug 7：off-by-one —— 3-bit counter，wrap 條件寫成 cnt == N 而不是 N−1
// 也是 programmable /4 //6 divider 的模型
// ---------------------------------------------------------------------------
interface CounterSpec {
  id: string
  name: string
  description: string
  /** 由 sel 決定的 wrap 值（cnt == nmax 時下一個 cnt = 0） */
  nmaxOf: (sel: Bit) => number
  withSel: boolean
  /** wrap 條件用 == 還是 >= */
  wrapOp?: '==' | '>='
}
function cntOf(v: Values): number {
  return (v.q2 ?? 0) * 4 + (v.q1 ?? 0) * 2 + (v.q0 ?? 0)
}
function makeCounter(spec: CounterSpec): Netlist {
  const op = spec.wrapOp ?? '=='
  const wrap = (v: Values) => {
    const n = spec.nmaxOf(v.sel ?? 0)
    const c = cntOf(v)
    return op === '==' ? c === n : c >= n
  }
  const next = (v: Values): number => (wrap(v) ? 0 : (cntOf(v) + 1) & 7)
  const inputs = spec.withSel ? ['q0', 'q1', 'q2', 'sel'] : ['q0', 'q1', 'q2']
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    clocks: [{ name: 'clk' }],
    inputs: spec.withSel ? [{ name: 'sel', initial: 0, description: 'sel=0：/4；sel=1：/6' }] : [],
    flops: [
      { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
      { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
      { q: 'q2', d: 'd2', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF2' },
    ],
    gates: [
      { out: 'tc', inputs, fn: (v) => (wrap(v) ? 1 : 0), delay: 14, label: `tc = (cnt ${op} n_max)`, kind: 'custom' },
      { out: 'd0', inputs, fn: (v) => (next(v) & 1) as Bit, delay: 16, label: 'next[0]', kind: 'custom' },
      { out: 'd1', inputs, fn: (v) => ((next(v) >> 1) & 1) as Bit, delay: 16, label: 'next[1]', kind: 'custom' },
      { out: 'd2', inputs, fn: (v) => ((next(v) >> 2) & 1) as Bit, delay: 16, label: 'next[2]', kind: 'custom' },
      { out: 'div_out', inputs: ['q0', 'q1', 'q2'], fn: (v) => (cntOf(v) === 0 ? 1 : 0), delay: 10, label: 'decode (cnt == 0)', kind: 'custom' },
    ],
    stateOrder: ['q2', 'q1', 'q0'],
    output: 'div_out',
    watch: ['tc'],
    equations: [
      { target: 'n_max', text: spec.withSel ? 'n_max = sel ? 5 : 3' : `n_max = ${spec.nmaxOf(0)}`, latex: spec.withSel ? 'n_{max} = sel\\,?\\,5 : 3' : `n_{max} = ${spec.nmaxOf(0)}` },
      { target: 'tc', text: `tc = (cnt ${op} n_max)`, latex: `tc = [\\,cnt ${op === '==' ? '=' : '\\ge'} n_{max}\\,]` },
      { target: 'next', text: 'next = tc ? 0 : cnt + 1', latex: 'cnt^{+} = tc\\,?\\,0 : cnt + 1' },
      { target: 'div_out', text: 'div_out = (cnt == 0)', latex: 'div\\_out = [\\,cnt = 0\\,]' },
    ],
    defaultDelays: { tcq: 8, gate: 6 },
  }
}

/** Programmable divider：sel=0 → /4（cnt 0..3），sel=1 → /6（cnt 0..5） */
export const prog46: Netlist = makeCounter({
  id: 'v-prog46',
  name: 'Programmable /4 或 /6（sel）',
  description: '3-bit counter 從 0 數到 n_max 後歸零；n_max = sel ? 5 : 3。',
  nmaxOf: (sel) => (sel ? 5 : 3),
  withSel: true,
})

/** 有 bug：想做 /4，卻寫 if (cnt == 3'd4) cnt <= 0 ⇒ 數 0,1,2,3,4 五個 state ⇒ /5 */
export const offByOneDiv5: Netlist = makeCounter({
  id: 'v-offbyone',
  name: 'Counter，wrap 條件寫成 cnt == 4（想要 /4）',
  description: 'cnt 走 0→1→2→3→4→0，共 5 個 state。',
  nmaxOf: () => 4,
  withSel: false,
})

/** 修正：cnt == N−1 = 3 */
export const offByOneFixed: Netlist = makeCounter({
  id: 'v-offbyone-fixed',
  name: 'Counter，wrap 條件改成 cnt == 3（N−1）',
  description: 'cnt 走 0→1→2→3→0，共 4 個 state。',
  nmaxOf: () => 3,
  withSel: false,
})

// ---------------------------------------------------------------------------
// Bug 8：output pulse 太短 —— ripple counter 的 state bit 到達時間不同，decode 出 runt；
//        runt 又被下一級當成一個 edge 數進去
// ---------------------------------------------------------------------------
/**
 * ripple /4（q1 由 q0 的 falling edge 觸發）+ div_out = q1 AND NOT q0（decode state 10）
 * + 下一級 /2（FF2 由 div_out 的 rising edge 觸發）。
 * 11 → 00 時 q0 先降（+8 ps）、q1 後降（+16 ps）⇒ 中間出現 8 ps 的 state 10 ⇒ decode 出 runt。
 */
export const decodeGlitchRipple: Netlist = {
  id: 'v-decode-glitch',
  name: 'Ripple /4 + decode pulse（有 glitch）',
  description: 'q1 比 q0 晚 tCQ 才變，decode 在 state 轉換途中看到暫時的 10。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'q0', edge: 'falling', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1（clk = q0↓）' },
    { q: 'q2', d: 'd2', clk: 'div_out', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF2（下一級，clk = div_out↑）' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV0', kind: 'inv' },
    { out: 'd1', inputs: ['q1'], fn: (v) => not(v.q1), delay: 6, label: 'INV1', kind: 'inv' },
    { out: 'div_out', inputs: ['q0', 'q1'], fn: (v) => and(v.q1, not(v.q0)), delay: 4, label: 'decode（q1 & ~q0）', kind: 'and' },
    { out: 'd2', inputs: ['q2'], fn: (v) => not(v.q2), delay: 6, label: 'INV2', kind: 'inv' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'div_out',
  watch: ['q2'],
  equations: [
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
    { target: 'd1', text: 'd1 = NOT q1  (clk1 = q0 falling)', latex: 'd_1 = \\overline{q_1}\\quad(clk_1 = q_0\\downarrow)' },
    { target: 'div_out', text: 'div_out = q1 AND NOT q0  (decode state 10)', latex: 'div\\_out = q_1\\overline{q_0}' },
    { target: 'q2', text: 'q2 toggles on div_out rising', latex: 'q_2 \\leftarrow \\overline{q_2}\\ @\\ div\\_out\\uparrow' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/** 修正：同步 counter + 把 decode 結果先打進一個 flop 再輸出 */
export const decodeRegisteredSync: Netlist = {
  id: 'v-decode-registered',
  name: 'Sync /4 + registered decode pulse',
  description: 'div_out <= (state == 10)：輸出由 flop 直接驅動，寬度剛好 1 T。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
    { q: 'div_out', d: 'dec', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF_OUT（registered decode）' },
    { q: 'q2', d: 'd2', clk: 'div_out', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF2（下一級）' },
  ],
  gates: [
    { out: 'd0', inputs: ['q0'], fn: (v) => not(v.q0), delay: 6, label: 'INV', kind: 'inv' },
    { out: 'd1', inputs: ['q0', 'q1'], fn: (v) => xor(v.q0, v.q1), delay: 12, label: 'XOR', kind: 'xor' },
    { out: 'dec', inputs: ['q0', 'q1'], fn: (v) => and(v.q1, not(v.q0)), delay: 8, label: 'decode（q1 & ~q0）', kind: 'and' },
    { out: 'd2', inputs: ['q2'], fn: (v) => not(v.q2), delay: 6, label: 'INV2', kind: 'inv' },
  ],
  stateOrder: ['q1', 'q0'],
  output: 'div_out',
  watch: ['dec', 'q2'],
  equations: [
    { target: 'd0', text: 'd0 = NOT q0', latex: 'd_0 = \\overline{q_0}' },
    { target: 'd1', text: 'd1 = q1 XOR q0', latex: 'd_1 = q_1 \\oplus q_0' },
    { target: 'dec', text: 'dec = q1 AND NOT q0', latex: 'dec = q_1\\overline{q_0}' },
    { target: 'div_out', text: 'div_out ← dec @ clk rising', latex: 'div\\_out \\leftarrow dec\\ @\\ clk\\uparrow' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

// ---------------------------------------------------------------------------
// Phase selection：8-phase MUX（naive）與 glitch-free enable 同步版
// ---------------------------------------------------------------------------
export const PHASES = 8
export const PH = Array.from({ length: PHASES }, (_, i) => `ph${i}`)
const ENS = Array.from({ length: PHASES }, (_, i) => `en${i}`)
export const SEL_BITS = ['sel0', 'sel1', 'sel2']
export function selOf(v: Values): number {
  return (v.sel0 ?? 0) + 2 * (v.sel1 ?? 0) + 4 * (v.sel2 ?? 0)
}
/** 把 0..7 拆成三個 sel bit */
export function selBits(n: number): Values {
  return { sel0: (n & 1) as Bit, sel1: ((n >> 1) & 1) as Bit, sel2: ((n >> 2) & 1) as Bit }
}
/**
 * 8 個相位以外另外放一個主 clock（clk = phase 0，只用來當「一步」的基準）。
 * 相位加上 PH_DELTA（2% T，相當於 buffer delay）：避免某一相的 falling edge 與主 clock 的
 * rising edge 完全重合——engine 在 step 邊界上會把這種 falling edge 當成尚未發生而漏掉。
 * 搭配 PMUX_OPTIONS.inputLead = 0.5（每 50 ps 一個 step 邊界）即可保證每個 falling edge 都被排入。
 */
export const PH_DELTA = 0.02
const phaseClocks: Netlist['clocks'] = [
  { name: 'clk', description: 'VCO 參考相位（僅作為 step 基準）' },
  ...PH.map((n, i) => ({ name: n, phase: i / PHASES + PH_DELTA, description: `phase ${i}：落後 clk ${i}/8 T + buffer` })),
]
/** pmux 模型必須用這組 option 模擬（見 PH_DELTA 的說明） */
export const PMUX_OPTIONS: SimOptions = { inputLead: 0.5, delayMode: 'real' }
const selInputs: Netlist['inputs'] = SEL_BITS.map((n, i) => ({ name: n, initial: 0, description: `phase_sel bit ${i}` }))

/** Naive：div_out = ph[phase_sel]，phase_sel 任意時刻改變 ⇒ runt */
export const pmuxNaive: Netlist = {
  id: 'v-pmux-naive',
  name: '8:1 phase MUX（select 沒有同步）',
  description: 'phase_sel 改變的瞬間，MUX 輸出直接從舊 phase 跳到新 phase 的目前值。',
  clocks: phaseClocks,
  inputs: selInputs,
  flops: [],
  gates: [{ out: 'div_out', inputs: [...PH, ...SEL_BITS], fn: (v) => v[PH[selOf(v)]] ?? 0, delay: 6, label: '8:1 MUX', kind: 'mux' }],
  stateOrder: [],
  output: 'div_out',
  equations: [{ target: 'div_out', text: 'div_out = ph[phase_sel]', latex: 'div\\_out = ph[phase\\_sel]' }],
  defaultDelays: { tcq: 8, gate: 6 },
}

/**
 * Glitch-free：每一相有自己的 enable flop，用「該相的 falling edge」取樣
 * en[i] <= (phase_sel == i) AND 其他 en 都是 0；div_out = OR(ph[i] AND en[i])。
 * 舊相在自己為 0 時關閉、新相在自己為 0 時打開 ⇒ 輸出不會出現 runt。
 */
export const pmuxGlitchFree: Netlist = {
  id: 'v-pmux-gf',
  name: '8-phase select（glitch-free enable 同步）',
  description: 'en[i] 由 ph[i] 的 falling edge 取樣；切換時先關舊相、再開新相。',
  clocks: phaseClocks,
  inputs: selInputs,
  flops: PH.map((n, i) => ({ q: ENS[i], d: `den${i}`, clk: n, edge: 'falling' as const, rstn: 'rst_n', resetValue: (i === 0 ? 1 : 0) as Bit, tcq: 8, label: `EN${i}（negedge ph${i}）` })),
  gates: [
    ...PH.map((_, i) => ({
      out: `den${i}`,
      inputs: [...SEL_BITS, ...ENS],
      fn: (v: Values): Bit => (selOf(v) === i && ENS.every((e, j) => j === i || (v[e] ?? 0) === 0) ? 1 : 0),
      delay: 10,
      label: `sel==${i} & others off`,
      kind: 'custom' as const,
    })),
    { out: 'div_out', inputs: [...PH, ...ENS], fn: (v) => or(...PH.map((p, i) => and(v[p] ?? 0, v[ENS[i]] ?? 0))), delay: 6, label: 'AND-OR（8:1 MUX）', kind: 'mux' },
  ],
  stateOrder: [...ENS].reverse(),
  output: 'div_out',
  equations: [
    { target: 'en[i]', text: 'en[i] <= (phase_sel == i) AND NOR(en[j≠i])   @ ph[i] falling', latex: 'en_i \\leftarrow [phase\\_sel = i]\\cdot\\overline{\\sum_{j\\ne i} en_j}\\ @\\ ph_i\\downarrow' },
    { target: 'div_out', text: 'div_out = OR_i (ph[i] AND en[i])', latex: 'div\\_out = \\sum_i ph_i\\cdot en_i' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/** 測試與示範用的 select 序列：edge k 之前把 phase_sel 改成 ... */
export const PMUX_SEL_SCHEDULE: { edge: number; sel: number }[] = [
  { edge: 1, sel: 0 },
  { edge: 4, sel: 2 },
  { edge: 8, sel: 5 },
  { edge: 12, sel: 1 },
  { edge: 16, sel: 7 },
]
export function pmuxInputAt(schedule = PMUX_SEL_SCHEDULE) {
  return (edge: number): Partial<Values> => {
    let cur = 0
    for (const s of schedule) if (edge >= s.edge) cur = s.sel
    return selBits(cur)
  }
}

// ---------------------------------------------------------------------------
// 陌生電路練習：3-bit Johnson（twisted-ring）counter /6
// ---------------------------------------------------------------------------
export const johnson6: Netlist = {
  id: 'v-johnson6',
  name: '3-bit Johnson counter',
  description: 'q0 <= ~q2; q1 <= q0; q2 <= q1。',
  clocks: [{ name: 'clk' }],
  inputs: [],
  flops: [
    { q: 'q0', d: 'd0', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF0' },
    { q: 'q1', d: 'd1', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF1' },
    { q: 'q2', d: 'd2', clk: 'clk', edge: 'rising', rstn: 'rst_n', resetValue: 0, tcq: 8, label: 'FF2' },
  ],
  gates: [
    { out: 'd0', inputs: ['q2'], fn: (v) => not(v.q2), delay: 6, label: 'INV', kind: 'inv' },
    { out: 'd1', inputs: ['q0'], fn: (v) => v.q0, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'd2', inputs: ['q1'], fn: (v) => v.q1, delay: 0, label: 'wire', kind: 'buf' },
  ],
  stateOrder: ['q2', 'q1', 'q0'],
  output: 'q2',
  equations: [
    { target: 'd0', text: 'd0 = NOT q2', latex: 'd_0 = \\overline{q_2}' },
    { target: 'd1', text: 'd1 = q0', latex: 'd_1 = q_0' },
    { target: 'd2', text: 'd2 = q1', latex: 'd_2 = q_1' },
  ],
  defaultDelays: { tcq: 8, gate: 6 },
}

/** Johnson counter 的主循環（從 reset 000 出發） */
export const JOHNSON6_CYCLE = ['000', '001', '011', '111', '110', '100']

/**
 * 修正版 Johnson：d0 = NOT q2 AND NOT(q1 AND NOT q0)。
 * 主循環六個 state 中 (q1, q0) = (1, 0) 只出現在 110（此時 q2 = 1，d0 本來就是 0），所以主循環不受影響；
 * 010 → 100、101 → 010 → 100：兩個 illegal state 最多 2 個 edge 回到主循環。
 */
export const johnson6Fixed: Netlist = {
  ...johnson6,
  id: 'v-johnson6-fixed',
  name: '3-bit Johnson counter（self-correcting）',
  description: 'q0 <= ~q2 & ~(q1 & ~q0)；010 與 101 會自己回到主循環。',
  gates: [
    { out: 'd0', inputs: ['q0', 'q1', 'q2'], fn: (v) => and(not(v.q2), not(and(v.q1, not(v.q0)))), delay: 14, label: 'AND-NOT', kind: 'custom' },
    { out: 'd1', inputs: ['q0'], fn: (v) => v.q0, delay: 0, label: 'wire', kind: 'buf' },
    { out: 'd2', inputs: ['q1'], fn: (v) => v.q1, delay: 0, label: 'wire', kind: 'buf' },
  ],
  equations: [
    { target: 'd0', text: 'd0 = NOT q2 AND NOT(q1 AND NOT q0)', latex: 'd_0 = \\overline{q_2}\\cdot\\overline{q_1\\overline{q_0}}' },
    { target: 'd1', text: 'd1 = q0', latex: 'd_1 = q_0' },
    { target: 'd2', text: 'd2 = q1', latex: 'd_2 = q_1' },
  ],
  legalStates: JOHNSON6_CYCLE,
}

// 讓 examples 裡直接拿來當 bug / 修正版的模型也能從這裡取得（頁面統一從這裡拿模型）
export { sync4, div3Lockup, div3Recover }
