import type { TimingMode, TimingPath, TimingScenario, TimingSegment } from '@/models/timing/types'
import { mmd2P0FirstSchematic, mmd2Schematic } from './schematics'
import { TIMING as K } from './models'

/**
 * Lesson 4-2：兩級 MMD 的六類 timing path。
 *
 * 數字（ps）：T 100、tCQ 8（min 5）、NOR 12（min 8）、AND 10（min 7）、tsetup 7、thold 3、jitter 3、margin 3。
 * 四種 mode 對應 p1p0 = 00 / 01 / 10 / 11 的 case analysis：
 *   p0 = 0 ⇒ mod1_eff ≡ 0 ⇒ da1 ≡ 0 ⇒ a1 永遠 0：所有經過 AND_P0 / AND_A1 到 a1 的路徑都沒有 transition
 *   p1 = 0 ⇒ db1 ≡ 0 ⇒ b1 永遠 0：b1 出發的路徑沒有 transition
 */
export const MMD_MODES: TimingMode[] = [
  { id: 'm00', label: 'p1p0 = 00（/4）', description: 'a1、b1 都不動：只剩 a0 → NOR1 與 b0 → NOR2 兩條 local path' },
  { id: 'm01', label: 'p1p0 = 01（/5）', description: 'cell 1 每個輸出週期走一次 /3：mod_out2 → cell 1 的跨級路徑被 sensitize' },
  { id: 'm10', label: 'p1p0 = 10（/6）', description: 'cell 2 走 /3，cell 1 永遠 /2：b1 會動，但 mod_out2 對 cell 1 沒有作用' },
  { id: 'm11', label: 'p1p0 = 11（/7）', description: '所有 flop 都在動：路徑最多' },
  { id: 'sw', label: '換除數中（p0 / p1 改變）', description: 'p0、p1 不再是常數：多出 controller → AND → D 的 control path；其他路徑以最壞情況（p1p0 = 11）計' },
]

// 共用的 segment 片段
const segTcq = (id: string, elem: string, from: string, note?: string): TimingSegment => ({
  id,
  label: `tCQ（${elem}）`,
  from,
  to: `${elem}.Q`,
  kind: 'tcq',
  min: K.tcqMin,
  max: K.tcq,
  elements: [idOf(elem)],
  note,
})
function idOf(label: string) {
  return { 'C1.FF0': 'ff_a0', 'C1.FF1': 'ff_a1', 'C2.FF0': 'ff_b0', 'C2.FF1': 'ff_b1' }[label] ?? label
}

/** f1 是 generated clock：從 clk edge 到 f1↑ 要先付 tCQ(a) + NOR1 */
const f1LatencySegs: TimingSegment[] = [
  { id: 'lat_tcq', label: 'tCQ（C1.FF0/FF1）', from: 'clk↑（edge k）', to: 'a0 / a1', kind: 'tcq', min: K.tcqMin, max: K.tcq, elements: ['ff_a0'], note: 'f1 的 source latency 第一段：a 進入 00 之前 a0 或 a1 必須先變 0' },
  { id: 'lat_nor', label: 'NOR1 → f1↑', from: 'a0 / a1', to: 'f1（C2 clock pin）', kind: 'logic', min: K.norMin, max: K.nor, wires: ['w_f1_b0clk'], elements: ['nor1'], note: 'f1 的 source latency 第二段：a = 00 時 NOR1 輸出 1，cell 2 才被 clock 到' },
]

const path2Segs: TimingSegment[] = [
  ...f1LatencySegs,
  segTcq('tcq_b0', 'C2.FF0', 'f1↑', 'b0 在 f1↑ 之後 tCQ 才改變'),
  { id: 'nor2', label: 'NOR2 → mod_out2', from: 'b0', to: 'mod_out2', kind: 'logic', min: K.norMin, max: K.nor, wires: ['w_b0_nor2', 'w_nor2_modp0'], elements: ['nor2'], note: 'cell 2 的 end-of-cycle decode；輸出經長走線回 cell 1' },
  { id: 'and_p0', label: 'AND_P0 → mod1_eff', from: 'mod_out2', to: 'mod1_eff', kind: 'logic', min: K.andMin, max: K.and, wires: ['w_andp0_and'], elements: ['and_p0'], note: 'p0 gating' },
  { id: 'and_a1', label: 'AND_A1 → da1', from: 'mod1_eff', to: 'C1.FF1.D', kind: 'logic', min: K.andMin, max: K.and, wires: ['w_and_da1'], elements: ['and_a1'], note: '另一個輸入是 a0' },
]

export const mmd2Paths: TimingPath[] = [
  // ---------------------------------------------------------- 1. local Q → comb → D（cell 1）
  {
    id: 'p1-a0-nor-da0',
    name: '① C1.FF0.Q → NOR1 → C1.FF0.D（cell 1 local）',
    type: 'setup',
    launch: { element: 'ff_a0', edge: 'rising', clock: 'clk' },
    capture: { element: 'ff_a0', edge: 'rising', clock: 'clk', setup: K.setup, hold: K.hold },
    segments: [segTcq('tcq', 'C1.FF0', 'clk↑（edge k）'), { id: 'nor1', label: 'NOR1', from: 'a0', to: 'C1.FF0.D', kind: 'logic', min: K.norMin, max: K.nor, wires: ['w_a0_nor1', 'w_f1_da0'], elements: ['nor1'], note: '2-input NOR：da0 = NOR(a1, a0)' }],
    description: 'cell 1 最基本的 register-to-register 回授：每個 clk edge 都在用。launch = edge k 的 C1.FF0，capture = edge k+1 的同一個 flop。',
    notes: [
      `arrival = tCQ + tNOR = ${K.tcq + K.nor} ps；required = T − tsetup − jitter − margin = ${K.T - K.setup - K.jitter - K.margin} ps ⇒ slack = ${K.T - K.setup - K.jitter - K.margin - K.tcq - K.nor} ps。`,
      `單獨看這條路徑，Tclk,min = ${K.tcq + K.nor + K.setup + K.jitter + K.margin} ps。p0 = 0 的兩個 mode 只有這類 local path，所以它就是 /4、/6 mode 的 Fmax critical path。`,
      `hold：tCQ,min + tNOR,min = ${K.tcqMin + K.norMin} ps ≥ thold = ${K.hold} ps，安全。`,
    ],
    limits: 'Fmax（所有 mode）',
  },
  {
    id: 'p1-a1-nor-da0',
    name: '① C1.FF1.Q → NOR1 → C1.FF0.D（cell 1 local，只在 p0 = 1）',
    type: 'setup',
    modes: ['m01', 'm11', 'sw'],
    launch: { element: 'ff_a1', edge: 'rising', clock: 'clk' },
    capture: { element: 'ff_a0', edge: 'rising', clock: 'clk', setup: K.setup, hold: K.hold },
    segments: [segTcq('tcq', 'C1.FF1', 'clk↑（edge k）'), { id: 'nor1', label: 'NOR1', from: 'a1', to: 'C1.FF0.D', kind: 'logic', min: K.norMin, max: K.nor, wires: ['w_a1_nor1', 'w_f1_da0'], elements: ['nor1'] }],
    sensitizedWhen: 'p0 = 1：a1 才會 toggle（state 10 那一輪）',
    description: '與上一條同長；p0 = 0 時 a1 恆 0，這條線上沒有 transition，STA case analysis 會把它剪掉。',
    limits: 'Fmax（p0 = 1 的 mode）',
  },
  {
    id: 'p1-a0-and-da1',
    name: '① C1.FF0.Q → AND_A1 → C1.FF1.D（cell 1 local，只在 p0 = 1）',
    type: 'setup',
    modes: ['m01', 'm11', 'sw'],
    launch: { element: 'ff_a0', edge: 'rising', clock: 'clk' },
    capture: { element: 'ff_a1', edge: 'rising', clock: 'clk', setup: K.setup, hold: K.hold },
    segments: [segTcq('tcq', 'C1.FF0', 'clk↑（edge k）'), { id: 'and', label: 'AND_A1', from: 'a0', to: 'C1.FF1.D', kind: 'logic', min: K.andMin, max: K.and, wires: ['w_a0_and', 'w_and_da1'], elements: ['and_a1'], note: 'mod1_eff = 0 時輸出鎖死在 0' }],
    sensitizedWhen: 'mod1_eff = 1（p0 = 1 且 mod_out2 = 1）的那個 cycle',
    description: 'AND 比 NOR 快，setup 不會贏過 NOR path；但它的 min delay 最短，是 cell 1 的 hold critical path。',
    notes: [`hold：tCQ,min + tAND,min = ${K.tcqMin + K.andMin} ps ≥ thold ${K.hold} ps ⇒ hold slack ${K.tcqMin + K.andMin - K.hold} ps（所有 setup 型路徑中最小）。`],
    limits: 'hold（min-delay）：不限制 Fmax',
  },
  {
    id: 'p1-b0-nor2-db0',
    name: '① C2.FF0.Q → NOR2 → C2.FF0.D（cell 2 local，f1 domain）',
    type: 'setup',
    launch: { element: 'ff_b0', edge: 'rising', clock: 'f1' },
    capture: { element: 'ff_b0', edge: 'rising', clock: 'f1', setup: K.setup, hold: K.hold },
    cycles: 2,
    segments: [segTcq('tcq', 'C2.FF0', 'f1↑'), { id: 'nor2', label: 'NOR2', from: 'b0', to: 'C2.FF0.D', kind: 'logic', min: K.norMin, max: K.nor, wires: ['w_b0_nor2', 'w_nor2_db0'], elements: ['nor2'] }],
    description: 'cell 2 的 local path 與 cell 1 長得一樣，但它的 clock 是 f1：相鄰兩個 f1↑ 至少相隔 2T（cell 1 走 /2 時）。這裡用 cycles = 2 表示可用時間 = 2T。',
    notes: ['這就是 cascade 的好處：越後面的 cell，可用時間越長，可以用更慢、更省電的 gate / flop。', '注意 f1 的週期不是固定的（2T 或 3T）；STA 要用最短的 2T 來檢查。'],
    limits: '不限制 Fmax（可用時間 ≥ 2T）',
  },
  // ---------------------------------------------------------- 2. downstream modulus-out → upstream MOD
  {
    id: 'p2-modout2-da1',
    name: '② C2.FF0（f1↑）→ NOR2 → AND_P0 → AND_A1 → C1.FF1.D（modulus-out 回傳）',
    type: 'setup',
    modes: ['m01', 'm11', 'sw'],
    launch: { element: 'ff_b0', edge: 'rising', clock: 'f1', label: 'C2.FF0 在 f1↑（f1↑ 本身在 clk edge k 之後 tCQ + tNOR）' },
    capture: { element: 'ff_a1', edge: 'rising', clock: 'clk', setup: K.setup, hold: K.hold, label: 'C1.FF1 在 clk edge k+1' },
    segments: path2Segs,
    sensitizedWhen: 'p0 = 1；mod_out2 在 f1↑ 之後改變，而 da1 = a0 · p0 · mod_out2',
    description:
      '跨兩級的路徑：launch 是 cell 2 的 flop（被 generated clock f1 觸發），capture 是 cell 1 的 flop（被 clk 觸發）。STA 把 f1 的 source latency（tCQ + NOR1 = 20 ps）算進 arrival，capture edge 預設放在 launch 之後的第一個 clk edge（k+1）：arrival 60、required 87、slack 27。',
    notes: [
      `arrival = ${K.tcq} + ${K.nor} + ${K.tcq} + ${K.nor} + ${K.and} + ${K.and} = ${K.tcq * 2 + K.nor * 2 + K.and * 2} ps；required = ${K.T} − ${K.setup} − ${K.jitter} − ${K.margin} = ${K.T - K.setup - K.jitter - K.margin} ps；slack = ${K.T - K.setup - K.jitter - K.margin - (K.tcq * 2 + K.nor * 2 + K.and * 2)} ps。`,
      `slack = 0 時 Tclk,min = ${K.tcq * 2 + K.nor * 2 + K.and * 2 + K.setup + K.jitter + K.margin} ps：這是 p0 = 1 mode 的 Fmax critical path（比 local path 的 33 ps 差很多）。`,
      '每多一級 cell，這條鏈就多一個 tCQ + 一個 NOR + 一個 AND（三級版 90 ps，單週期檢查已經 fail）。',
      '若這條路徑來不及：cell 1 在錯的 f1 週期執行 /3——state 序列變成 0001 → 0100 → 0101 → 0110 → 0000，div_out 的 duty 由 3/5 變 2/5、edge 位置整個搬走；再慢一點，2T 寬的 mod_out2 pulse 會被比它還慢的 gate 吞掉，/3 消失，N 掉成 4。這就是「divide sequence 錯誤」，而且它是 sequence 錯，不只是 metastable。',
      'p1 = 1 時 b1 也會 toggle：C2.FF1 → NOR2 → … 這條與本條等長，同樣算在 path ②。',
    ],
    limits: 'Fmax（p0 = 1 的 mode）與 divide sequence 正確性',
  },
  {
    id: 'p2-modout2-da1-mc2',
    name: '②′ 同一條路徑，capture 放在 a = 01 的 edge（k+2，multicycle 2）',
    type: 'multicycle',
    modes: ['m01', 'm11', 'sw'],
    cycles: 2,
    launch: { element: 'ff_b0', edge: 'rising', clock: 'f1' },
    capture: { element: 'ff_a1', edge: 'rising', clock: 'clk', setup: K.setup, hold: K.hold, label: 'C1.FF1 在 clk edge k+2' },
    segments: path2Segs,
    sensitizedWhen: 'AND_A1 的另一個輸入 a0：edge k+1 時 a0 = 0（a 剛回到 00），要到 edge k+2 才是 1',
    description:
      '用 simulate 看 state 序列會發現：f1↑ 發生在 a 進入 00 的那個 edge（k）；下一個 edge（k+1）a 才變 01；再下一個 edge（k+2）a1 才抓 da1。所以 mod_out2 真正的 deadline 是 edge k+2，多了一整個 T。這是 multicycle exception 的候選——但只在「f1↑ ⇔ a → 00」這個 sequential 性質成立時才對。',
    notes: ['functional deadline = 2T − tsetup：模擬證明 arrival 150 ps 仍除得正確（state 序列、duty 都對），225 ps 就把 /3 搬到錯的 f1 週期。', '要不要真的放 multicycle exception？要看 cell 1 的結構會不會改、以及驗證是否涵蓋所有 mode。保守做法是照單週期設計。'],
    limits: 'divide sequence 正確性（放寬後的真正邊界）',
  },
  // ---------------------------------------------------------- 3. MOD decode → D（p0 / p1 control）
  {
    id: 'p3-p0-da1',
    name: '③ p0（controller flop）→ AND_P0 → AND_A1 → C1.FF1.D（MOD decode）',
    type: 'setup',
    modes: ['sw'],
    launch: { element: 'p0', edge: 'rising', clock: 'clk', label: 'controller flop 送出 p0' },
    capture: { element: 'ff_a1', edge: 'rising', clock: 'clk', setup: K.setup, hold: K.hold },
    segments: [
      { id: 'tcq_ctrl', label: 'tCQ（controller）', from: 'ctrl.clk', to: 'p0', kind: 'tcq', min: K.tcqMin, max: K.tcq, note: 'p0 若由 flop 送出，先付一次 tCQ' },
      { id: 'route', label: 'routing', from: 'p0', to: 'AND_P0.in0', kind: 'wire', min: 6, max: 12, wires: ['w_p0'], note: 'controller 通常離 cell 1 很遠' },
      { id: 'and_p0', label: 'AND_P0', from: 'AND_P0.in0', to: 'mod1_eff', kind: 'logic', min: K.andMin, max: K.and, wires: ['w_andp0_and'], elements: ['and_p0'] },
      { id: 'and_a1', label: 'AND_A1', from: 'mod1_eff', to: 'C1.FF1.D', kind: 'logic', min: K.andMin, max: K.and, wires: ['w_and_da1'], elements: ['and_a1'] },
    ],
    sensitizedWhen: 'a = 01 且 mod_out2 = 1 的那個 clk edge（每個輸出週期只有一次）',
    description: 'p0 在正常運作時是靜態的，只有換除數時才改變。它的 deadline 不是「每個 edge」，而是「下一次 a = 01 且 mod_out2 = 1 的 edge」。若 p0 在那個 edge 的 setup window 內改變，a1 可能 metastable，或這一輪的 /3 晚一個輸出週期才出現。',
    notes: [
      `arrival = ${K.tcq} + 12 + ${K.and} + ${K.and} = ${K.tcq + 12 + K.and * 2} ps；slack = ${K.T - K.setup - K.jitter - K.margin - (K.tcq + 12 + K.and * 2)} ps（單週期）。`,
      '如果 controller 保證 p0 只在 output rising edge 之後那一個 T 內改變（a = 01 & mod_out2 = 1 的 edge 距離至少 2T），這條可以宣告 multicycle——但必須有 sequence 上的證明。',
      '若 p0 跨 clock domain（來自更慢的 SDM / controller），要先同步，否則 metastability。',
    ],
    limits: 'mode switching 的 deadline（不是 Fmax；違反時換除數晚一個週期或 metastable）',
  },
  {
    id: 'p3-p1-db1',
    name: '③ p1（controller flop）→ AND_B1 → C2.FF1.D（MOD decode，f1 domain）',
    type: 'setup',
    modes: ['sw'],
    launch: { element: 'p1', edge: 'rising', clock: 'clk', label: 'controller flop 送出 p1' },
    capture: { element: 'ff_b1', edge: 'rising', clock: 'f1', setup: K.setup, hold: K.hold, label: 'C2.FF1 在 f1↑' },
    segments: [
      { id: 'tcq_ctrl', label: 'tCQ（controller）', from: 'ctrl.clk', to: 'p1', kind: 'tcq', min: K.tcqMin, max: K.tcq },
      { id: 'route', label: 'routing', from: 'p1', to: 'AND_B1.in1', kind: 'wire', min: 6, max: 12, wires: ['w_p1'] },
      { id: 'and_b1', label: 'AND_B1', from: 'AND_B1.in1', to: 'C2.FF1.D', kind: 'logic', min: K.andMin, max: K.and, wires: ['w_and_db1'], elements: ['and_b1'] },
    ],
    sensitizedWhen: 'b0 = 1 的那個 f1↑（每個輸出週期只有一次）',
    description: 'p1 被 cell 2 用到的時機是「b0 = 1 時的 f1↑」。capture clock 是 generated clock f1（比 clk edge 晚 20 ps 到），這裡保守地不把那 20 ps 算進可用時間。',
    notes: [`arrival = ${K.tcq + 12 + K.and} ps；slack = ${K.T - K.setup - K.jitter - K.margin - (K.tcq + 12 + K.and)} ps。`, 'p1 與 p0 的 deadline 是不同的 edge：換除數時兩個 bit 若不在同一個安全窗內改變，會出現一個「p1 新 p0 舊」的中間除數。'],
    limits: 'mode switching 的 deadline',
  },
  // ---------------------------------------------------------- 4. output decode
  {
    id: 'p4-f2-out',
    name: '④ C2.FF0（f1↑）→ NOR2 → div_out（output decode）',
    type: 'output',
    launch: { element: 'ff_b0', edge: 'rising', clock: 'f1' },
    capture: { element: 'out', edge: 'rising', clock: 'clk', setup: K.setup },
    segments: [...f1LatencySegs, segTcq('tcq_b0', 'C2.FF0', 'f1↑'), { id: 'nor2', label: 'NOR2', from: 'b0', to: 'f2', kind: 'logic', min: K.norMin, max: K.nor, wires: ['w_b0_nor2'], elements: ['nor2'] }, { id: 'wire', label: 'output wire', from: 'f2', to: 'div_out', kind: 'wire', min: K.wireMin, max: K.wire, wires: ['w_out'] }],
    description: '從 clk edge 到 div_out 翻轉的 latency：f1 latency 20 + tCQ 8 + NOR 12 + wire 3 = 43 ps。沒有 capture flop，所以不是 setup check；它只決定輸出 edge 相對 clk edge 的固定延遲。',
    notes: [
      'latency 本身無害；有害的是 latency 的變動（PVT、supply noise）——它直接變成輸出 jitter，因為 div_out 的 edge 是由這條路徑「產生」的。',
      `如果 div_out 後面接了一個以 clk 取樣的 flop（例如 PFD 前的 retimer），這條才變成 interface setup path：arrival ${K.tcq + K.nor + K.tcq + K.nor + K.wire} ps 對 required ${K.T - K.setup - K.jitter - K.margin} ps ⇒ slack ${K.T - K.setup - K.jitter - K.margin - (K.tcq + K.nor + K.tcq + K.nor + K.wire)} ps。`,
      `⚠ 下表的 Required / Slack / T_clk,min / F_max 只是「假設真的接了那個 retimer」（tsetup = ${K.setup} ps）之後把同一組數字套進 setup 公式的結果。這條 path 本身沒有 capture flop，單獨看時唯一有意義的數字是 arrival = latency = ${K.tcq + K.nor + K.tcq + K.nor + K.wire} ps；把它寫進報告的 setup critical path 清單會誤導下一個工程師。`,
    ],
    limits: 'output latency 與輸出 jitter，不限制 Fmax',
  },
  // ---------------------------------------------------------- 5. reset / initialization
  {
    id: 'p5-rst-a',
    name: '⑤ rst_n → C1.FF0 / FF1（recovery / removal，clk domain）',
    type: 'recovery',
    launch: { element: 'rst', edge: 'rising', clock: 'rst_n' },
    capture: { element: 'ff_a0', edge: 'rising', clock: 'clk', setup: K.recovery, hold: K.removal },
    segments: [{ id: 'rst', label: 'rst_n wire', from: 'rst_n', to: 'C1.FF0.rstn', kind: 'wire', min: K.wireMin, max: 4, wires: ['w_rst_a0', 'w_rst_a1'] }],
    description: 'reset 釋放（de-assert）相對 clk edge 的時間要求：recovery 像 setup、removal 像 hold，但它不是 data path，launch 也不是 flop。',
    notes: ['reset 釋放落在 clk edge 附近：a0 可能一半 reset 一半 capture，metastable。更糟的是 a0 metastable 會讓 NOR1（f1）產生 glitch，等於給 cell 2 一個 runt clock。', '這條路徑不影響 Fmax，只影響「reset 釋放後第一個 edge 是否可靠」。'],
    limits: 'reset release 的安全時間窗，不是 Fmax',
  },
  {
    id: 'p5-rst-b',
    name: '⑤ rst_n → C2.FF0 / FF1（recovery / removal，f1 domain）',
    type: 'recovery',
    launch: { element: 'rst', edge: 'rising', clock: 'rst_n' },
    capture: { element: 'ff_b0', edge: 'rising', clock: 'f1', setup: K.recovery, hold: K.removal },
    segments: [{ id: 'rst', label: 'rst_n wire', from: 'rst_n', to: 'C2.FF0.rstn', kind: 'wire', min: K.wireMin, max: 4, wires: ['w_rst_b0', 'w_rst_b1'] }],
    description: 'cell 2 的 clock 是 f1。reset 期間 a = 00，所以 f1 = 1 被拉高不動；釋放後第一個 f1↑ 要等 a 走完 01 → 00（兩個 clk edge）才出現。',
    notes: ['因此 cell 2 的 recovery 幾乎自動滿足——前提是 cell 1 本身乾淨地離開 reset（見上一條）。', 'reset 的第一個 f1↑ 在 edge 2（p0 = 0）或 edge 3（p0 = 1）之後 20 ps——reset 後 a = 00、mod_out2 = 1，edge 1 把 a 帶到 01，edge 2 取樣 da1 = a0·p0·mod_out2 = p0：p0 = 0 走 00（f1↑ 在 edge 2），p0 = 1 走 10、要到 edge 3 才回 00。也就是說 reset 後的第一個 cell 1 週期就已經依 p0 決定 /2 或 /3（模擬可以驗證）。'],
    limits: '初始 state 是否確定，不是 Fmax',
  },
  // ---------------------------------------------------------- 6. minimum pulse width（f1 是 generated clock）
  {
    id: 'p6-f1-pulse',
    name: '⑥ f1 的 high pulse width（generated clock，只有一個 T 寬）',
    type: 'pulse-width',
    launch: { element: 'ff_a0', edge: 'rising', clock: 'clk', label: 'a → 00 的 clk edge（f1↑）' },
    capture: { element: 'ff_b0', edge: 'falling', clock: 'f1', setup: K.minPulse, minPulse: K.minPulse, label: '下一個 clk edge（a → 01，f1↓）' },
    segments: [{ id: 'asym', label: 'NOR1 rise/fall 不對稱', from: 'f1↑', to: 'f1↓', kind: 'logic', min: 0, max: K.norAsym, wires: ['w_f1_b0clk'], elements: ['nor1'], note: 'NOR 的上升（PMOS 串疊）比下降慢，high pulse 被吃掉 t_rise − t_fall' }],
    description: 'f1 只在 a = 00 那一個 clk 週期為 1，所以它的 high pulse 寬度 ≈ 一個 T（減去 NOR 的 rise/fall 不對稱）。cell 2 的 flop 需要最小 pulse width 才能正確 capture。這裡的「tsetup」欄位代表 min pulse width（30 ps）：slack = T − asym − minPulse − jitter − margin。capture 標成 f1 的 falling edge：pulse-width 檢查的終點是 pulse 的結束（a → 01 那個 clk edge 讓 f1 落下），不是 ff_b0 真正 capture 資料的 f1↑。',
    notes: [`Tclk,min（由 pulse width 決定）= ${K.norAsym} + ${K.minPulse} + ${K.jitter} + ${K.margin} = ${K.norAsym + K.minPulse + K.jitter + K.margin} ps。`, '這條不是 setup、也不是 hold：沒有 data 在被 capture，被檢查的是 clock 本身的形狀。', 'low pulse 是 1T（/2）或 2T（/3），比 high pulse 寬鬆。'],
    limits: 'cell 2 的 clock pulse width（高速時可能比 setup 更早撞到）',
  },
]

export const mmd2Timing: TimingScenario = {
  id: 'mmd2-cp',
  name: '兩級 MMD：六類 timing path',
  description: '先選 mode（p1p0 固定，或「換除數中」），再點路徑。注意每條路徑的 launch / capture 各是哪個 flop、哪個 clock；p0 = 0 時跨級路徑整個消失；p0 / p1 固定不變時 control path 沒有 transition，只在「換除數中」才列出。',
  schematic: mmd2Schematic,
  env: { period: K.T, skew: 0, jitter: K.jitter, margin: K.margin },
  modes: MMD_MODES,
  paths: mmd2Paths,
}

/** 三級 MMD 的 modulus-out 鏈：clk → a → NOR1 → b → NOR2 → c → NOR3 → AND(mod_out2) → AND_P0 → AND_A1 → da1 */
export const mmd3ModChainPath: TimingPath = {
  id: 'p2-mmd3',
  name: '② 三級版：C3.FF0（f2↑）→ NOR3 → AND → AND_P0 → AND_A1 → C1.FF1.D',
  type: 'setup',
  launch: { element: 'ff_c0', edge: 'rising', clock: 'f2' },
  capture: { element: 'ff_a1', edge: 'rising', clock: 'clk', setup: K.setup, hold: K.hold },
  segments: [
    ...f1LatencySegs,
    segTcq('tcq_b0', 'C2.FF0', 'f1↑'),
    { id: 'nor2_f2', label: 'NOR2 → f2↑', from: 'b0', to: 'f2（C3 clock pin）', kind: 'logic', min: K.norMin, max: K.nor },
    { id: 'tcq_c0', label: 'tCQ（C3.FF0）', from: 'f2↑', to: 'c0', kind: 'tcq', min: K.tcqMin, max: K.tcq },
    { id: 'nor3', label: 'NOR3 → mod_out3', from: 'c0', to: 'mod_out3', kind: 'logic', min: K.norMin, max: K.nor },
    { id: 'and_mod2', label: 'AND(f2, mod_out3) → mod_out2', from: 'mod_out3', to: 'mod_out2', kind: 'logic', min: K.andMin, max: K.and },
    { id: 'and_p0', label: 'AND_P0', from: 'mod_out2', to: 'mod1_eff', kind: 'logic', min: K.andMin, max: K.and },
    { id: 'and_a1', label: 'AND_A1', from: 'mod1_eff', to: 'C1.FF1.D', kind: 'logic', min: K.andMin, max: K.and },
  ],
  description: '每多一級就多一個 tCQ + NOR + AND。三級版單週期檢查：arrival 90 > required 87 ⇒ slack −3。',
  limits: 'Fmax：級數越多越差',
}

// ---------------------------------------------------------------- 練習：p0 的 AND 移到 mod_out2 之前
/**
 * 變體 B（mmd2P0First）：mod_out2 = f2 · p0（AND_P0 在 cell 2），cell 1 的 da1 = a0 · mod_out2。
 * path ② 的 gate 數不變：NOR2 → AND_P0 → 長走線 → AND_A1，arrival 仍是 60。
 * 改變的是：p0 的 routing 終點（cell 2）、以及長走線在 p0 = 0 時不再 toggle。
 */
const path2SegsP0First: TimingSegment[] = [
  ...f1LatencySegs,
  segTcq('tcq_b0', 'C2.FF0', 'f1↑'),
  { id: 'nor2', label: 'NOR2 → f2', from: 'b0', to: 'f2', kind: 'logic', min: K.norMin, max: K.nor, wires: ['w_b0_nor2', 'w_f2_andp0'], elements: ['nor2'] },
  { id: 'and_p0', label: 'AND_P0 → mod_out2（在 cell 2）', from: 'f2', to: 'mod_out2', kind: 'logic', min: K.andMin, max: K.and, wires: ['w_andp0_and'], elements: ['and_p0'], note: '現在長走線上跑的是 mod_out2 = f2 · p0' },
  { id: 'and_a1', label: 'AND_A1 → da1', from: 'mod_out2', to: 'C1.FF1.D', kind: 'logic', min: K.andMin, max: K.and, wires: ['w_and_da1'], elements: ['and_a1'] },
]

export const mmd2P0FirstTiming: TimingScenario = {
  id: 'mmd2-p0-first-cp',
  name: '練習：p0 的 AND 移到 mod_out2 之前',
  description: '同樣的六類路徑，只是 AND_P0 搬到 cell 2。比較 path ② 與 path ③ 的 arrival 有沒有變。',
  schematic: mmd2P0FirstSchematic,
  env: { period: K.T, skew: 0, jitter: K.jitter, margin: K.margin },
  modes: MMD_MODES,
  paths: [
    ...mmd2Paths.filter((p) => !p.id.startsWith('p2-') && p.id !== 'p3-p0-da1'),
    {
      ...mmd2Paths.find((p) => p.id === 'p2-modout2-da1')!,
      segments: path2SegsP0First,
      description: 'gate 數與原版相同（NOR2、AND_P0、AND_A1 各一個），arrival 仍是 60 ps、slack 仍是 27 ps：critical path 沒有變短。差別只是哪一段延遲落在長走線之前。',
      notes: ['要真的縮短，得把 AND_P0 併進 NOR2（做成 AOI：mod_out2 = NOT(b1 + b0) · p0，一個複合 gate ≈ 12 ps）⇒ arrival 50 ps；或在 cell 2 用 f1 重新 retime mod_out2（把跨級路徑切成兩段 local path）。', 'p0 = 0 時長走線上的 mod_out2 恆 0，不再每個輸出週期 toggle：少一點 switching noise 耦合到 VCO / 高速級。'],
    },
    {
      ...mmd2Paths.find((p) => p.id === 'p2-modout2-da1-mc2')!,
      segments: path2SegsP0First,
    },
    {
      ...mmd2Paths.find((p) => p.id === 'p3-p0-da1')!,
      segments: [
        { id: 'tcq_ctrl', label: 'tCQ（controller）', from: 'ctrl.clk', to: 'p0', kind: 'tcq', min: K.tcqMin, max: K.tcq },
        { id: 'route', label: 'routing（到 cell 2）', from: 'p0', to: 'AND_P0.in1', kind: 'wire', min: 6, max: 12, wires: ['w_p0'], note: 'p0 現在要送到 cell 2；距離可能更遠或更近' },
        { id: 'and_p0', label: 'AND_P0', from: 'AND_P0.in1', to: 'mod_out2', kind: 'logic', min: K.andMin, max: K.and, wires: ['w_andp0_and'], elements: ['and_p0'] },
        { id: 'and_a1', label: 'AND_A1', from: 'mod_out2', to: 'C1.FF1.D', kind: 'logic', min: K.andMin, max: K.and, wires: ['w_and_da1'], elements: ['and_a1'] },
      ],
      description: 'p0 的 control path 也還是兩個 AND：arrival 40 ps 不變。但 p0 現在必須先跑到 cell 2、再跟著長走線回 cell 1，routing 的實際長度會改變。',
    },
  ],
}
