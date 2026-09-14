import type { TimingScenario } from '@/models/timing/types'
import { dm12Schematic, dm23Schematic, muxSelect23Schematic } from './schematics'

/**
 * Lesson 3-2：/2 /3 cell 的 timing scenario。
 * 三種 mode 對應 STA 的 case analysis：
 *   mod0    ：mod 固定 0 ⇒ AND 輸出恆 0，FF1 不會 toggle，q1 恆 0 ⇒ 只剩 q0 → NOR → d0
 *   mod1    ：mod 固定 1 ⇒ q0/q1 → NOR → d0、q0 → AND → d1 都會被 sensitize；mod 本身不變
 *   switch  ：mod 會切換 ⇒ 多出 mod → AND → FF1.D 這條 control path（只在 state 01 的 cycle 真正有作用）
 */
export const dm23Timing: TimingScenario = {
  id: 'dm23',
  name: '/2 /3 cell：哪條路徑在哪個 mode 才算數',
  description: 'critical path 不是最長的那條線，而是「這個 mode 下會被 sensitize、而且有 launch 與 capture」的路徑。用 mode 按鈕切換 case analysis，看候選路徑如何增減。',
  schematic: dm23Schematic,
  env: { period: 100, skew: 0, jitter: 2, margin: 2 },
  modes: [
    { id: 'mod0', label: 'mod = 0（/2）', description: 'mod 固定 0：d1 恆 0，q1 恆 0' },
    { id: 'mod1', label: 'mod = 1（/3）', description: 'mod 固定 1：兩個 flop 都在動' },
    { id: 'switch', label: 'mod 切換中', description: 'mod 由前級 flop 送出並且會改變' },
  ],
  paths: [
    {
      id: 'q0-nor-d0',
      name: 'FF0.Q → NOR → FF0.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'FF0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'], note: 'edge k 之後 q0 才穩定' },
        { id: 'nor', label: 'NOR', from: 'FF0.Q', to: 'FF0.D', kind: 'logic', min: 8, max: 12, wires: ['w_q0_nor', 'w_nor_d0'], elements: ['nor'], note: '2-input NOR（比 AND 慢：PMOS 串疊）' },
      ],
      description: '兩種 mode 都存在的 register-to-register path：q0 每個 edge 都可能改變，NOR 每個 cycle 都要重新算 d0。',
      notes: ['launch = edge k 的 FF0，capture = edge k+1 的 FF0，可用時間 = 一個 Tclk。', 'mod = 0 時它是唯一會動的路徑，所以就是 /2 mode 的 Fmax critical path。', 'hold：tCQ,min + tNOR,min = 13 ps ≥ thold = 3 ps，安全。'],
      limits: 'Fmax（兩種 mode 都適用）',
    },
    {
      id: 'q1-nor-d0',
      name: 'FF1.Q → NOR → FF0.D',
      type: 'setup',
      modes: ['mod1', 'switch'],
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF1.clk', to: 'FF1.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff1'] },
        { id: 'nor', label: 'NOR', from: 'FF1.Q', to: 'FF0.D', kind: 'logic', min: 8, max: 12, wires: ['w_q1_nor', 'w_nor_d0'], elements: ['nor'] },
      ],
      sensitizedWhen: 'mod = 1（q1 才會 toggle）',
      description: 'mod = 0 時 q1 永遠是 0，這條線上根本沒有 transition，STA 的 case analysis 會把它剪掉；mod = 1 時它與 q0 → NOR 的延遲相同。',
      notes: ['同樣的 NOR、同樣的 delay，但只有 /3 mode 才「存在」。', '這就是為什麼 divider 的 timing 報告要分 mode 看。'],
      limits: 'Fmax（只在 /3 mode）',
    },
    {
      id: 'q0-and-d1',
      name: 'FF0.Q → AND → FF1.D',
      type: 'setup',
      modes: ['mod1', 'switch'],
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'FF0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'and', label: 'AND', from: 'FF0.Q', to: 'FF1.D', kind: 'logic', min: 7, max: 10, wires: ['w_q0_and', 'w_and_d1'], elements: ['and'], note: 'mod = 0 時 AND 輸出被鎖死在 0，q0 的變化傳不過去' },
      ],
      sensitizedWhen: 'mod = 1',
      description: 'AND 的另一個輸入是 mod。mod = 0 時 d1 恆 0，這條 path 沒有被 sensitize；mod = 1 時它才成為 FF1 的 setup path。',
      notes: ['AND（10 ps）比 NOR（12 ps）快，所以在這個 cell 裡它不會贏過 NOR path；但在多級 MMD 裡 mod 會經過更多 gate（Lesson 4-2）。'],
      limits: 'Fmax（只在 /3 mode）',
    },
    {
      id: 'mod-and-d1',
      name: 'mod → AND → FF1.D（control path）',
      type: 'setup',
      modes: ['switch'],
      launch: { element: 'mod', edge: 'rising', clock: 'clk', label: '前級 controller flop' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq_src', label: 'tCQ（前級 flop）', from: 'ctrl.clk', to: 'mod', kind: 'tcq', min: 5, max: 8, note: 'mod 如果由 flop 送出，先付一次 tCQ' },
        { id: 'route', label: 'routing', from: 'mod', to: 'AND.in1', kind: 'wire', min: 6, max: 12, wires: ['w_mod'], note: 'controller 通常離 cell 很遠' },
        { id: 'and', label: 'AND', from: 'AND.in1', to: 'FF1.D', kind: 'logic', min: 7, max: 10, wires: ['w_and_d1'], elements: ['and'] },
      ],
      sensitizedWhen: 'state = 01（q0 = 1）的那個 cycle：只有這時 AND 會把 mod 傳到 d1',
      description: '不是 Q → D 的 feedback，而是 control path：mod 必須在「state 01 的 capture edge」前 tsetup + tAND 就穩定。它一樣有 setup 與 hold，只是 launch 在別的 flop。',
      notes: ['mod 必須在 capture edge 前 tsetup + tAND,max = 7 + 10 = 17 ps 穩定（jitter、margin 再各留 2 ps）；前級 flop 的 tCQ + routing = 20 ps ⇒ slack = 100 − 17 − 4 − 20 = 59 ps。','mod 在其他 state 改變不會立刻影響 state，但下一次進入 01 時就會被用到——所以「什麼時候換 mod」決定了哪一個 interval 變成 3T。', 'mod 若跨越 clock domain（例如來自更慢的 controller），要先同步，否則這裡會 metastable。'],
      limits: 'mode switching 的 deadline（不是 Fmax，但 slack 為負時切換會晚一個 interval 或 metastable）',
    },
    {
      id: 'q1-nor-d0-hold',
      name: 'FF1.Q → NOR → FF0.D（hold）',
      type: 'hold',
      modes: ['mod1', 'switch'],
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF1.clk', to: 'FF1.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff1'] },
        { id: 'nor', label: 'NOR', from: 'FF1.Q', to: 'FF0.D', kind: 'logic', min: 8, max: 12, wires: ['w_q1_nor', 'w_nor_d0'], elements: ['nor'] },
      ],
      description: '同一個 edge：q1 改變之後，d0 不能太快跟著變，否則 FF0 在同一個 edge 就抓到新值。min delay = 5 + 8 = 13 ps ≥ thold。',
      notes: ['hold 與 clock period 無關；提高頻率不會讓它變好或變壞。', '若 NOR 被拿掉、q1 直接接 D（例如用 Q̄ 技巧），min delay 只剩 tCQ,min，hold margin 會縮小。'],
      limits: '最低 min-delay（與 Fmax 無關）',
    },
    {
      id: 'out',
      name: 'FF0/FF1.Q → NOR → div_out（output decode）',
      type: 'output',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'out', edge: 'rising', clock: 'clk' },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'FF0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'nor', label: 'NOR', from: 'FF0.Q', to: 'div_out', kind: 'logic', min: 8, max: 12, wires: ['w_q0_nor'], elements: ['nor'] },
        { id: 'wire', label: 'output wire', from: 'NOR.out', to: 'div_out', kind: 'wire', min: 2, max: 3, wires: ['w_out'] },
      ],
      description: 'div_out 是 combinational decode（state 00），沒有 capture flop，所以不是 setup critical path；它決定的是 output latency，以及 01 → 10 轉換時的 decode glitch 風險。',
      notes: ['01 → 10：q0 落下、q1 升起在同一個 edge。若 q0 先落、q1 後升，NOR 會短暫看到 00 ⇒ 輸出冒出一個窄 pulse。高速設計通常再加一個 flop 把輸出 register 起來。'],
      limits: 'output latency 與 decode glitch，不是 Fmax',
    },
  ],
}

/**
 * Lesson 3-1：架構 B（MUX 選輸出）的 timing。重點：mod → MUX → div_out 沒有 capture flop，
 * 任何時間切換都「合法」，所以 STA 不會抱怨——問題出在 pulse width 與 phase，而不是 setup。
 */
export const muxSelect23Timing: TimingScenario = {
  id: 'mux23',
  name: 'B：MUX 選輸出——STA 找不到的問題',
  description: '兩個 divider 各自有正常的 Q → D path；真正的問題（mod → MUX → div_out）沒有 capture flop，不會被 setup 檢查抓到。',
  schematic: muxSelect23Schematic,
  env: { period: 100, skew: 0, jitter: 2, margin: 2 },
  paths: [
    {
      id: 'a0-inv',
      name: 'FFa.Q → INV → FFa.D（/2 loop）',
      type: 'setup',
      launch: { element: 'ffa', edge: 'rising', clock: 'clk' },
      capture: { element: 'ffa', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FFa.clk', to: 'FFa.Q', kind: 'tcq', min: 5, max: 8, elements: ['ffa'] },
        { id: 'inv', label: 'INV', from: 'FFa.Q', to: 'FFa.D', kind: 'logic', min: 4, max: 6, wires: ['w_a_inv', 'w_inv_da'], elements: ['inv'] },
      ],
      description: '/2 divider 自己的 loop，與 mod 無關。',
      limits: 'Fmax（/2 部分）',
    },
    {
      id: 'b0-nor',
      name: 'FFb0.Q → NOR → FFb0.D（/3 loop）',
      type: 'setup',
      launch: { element: 'ffb0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ffb0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FFb0.clk', to: 'FFb0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ffb0'] },
        { id: 'nor', label: 'NOR', from: 'FFb0.Q', to: 'FFb0.D', kind: 'logic', min: 8, max: 12, wires: ['w_b0_nor', 'w_nor_db0'], elements: ['nor'] },
      ],
      description: '/3 divider 自己的 loop，同樣與 mod 無關。',
      limits: 'Fmax（/3 部分）',
    },
    {
      id: 'mod-mux',
      name: 'mod → MUX → div_out（沒有 capture flop）',
      type: 'output',
      launch: { element: 'mod', edge: 'rising', clock: 'clk', label: 'controller' },
      capture: { element: 'out', edge: 'rising', clock: 'clk' },
      segments: [
        { id: 'route', label: 'routing', from: 'mod', to: 'MUX.sel', kind: 'wire', min: 6, max: 12, wires: ['w_mod'] },
        { id: 'mux', label: 'MUX', from: 'MUX.sel', to: 'div_out', kind: 'mux', min: 6, max: 8, wires: ['w_out'], elements: ['mux'] },
      ],
      description: '這條路徑的終點是輸出 port，沒有任何 flop 在某個 edge 檢查它。所以 mod 什麼時候換都「不會 violate」——但輸出會在那一瞬間直接從 out2 跳到 out3，產生任意寬度的 pulse 與任意的 phase jump。',
      notes: [
        '⚠︎ 這條 path 的終點是輸出 port，沒有 capture flop：它只有 latency（routing + MUX = 20 ps），沒有 required time、沒有 slack、也不決定 Fmax。面板上若出現 Required / Tclk,min / Fmax，那只是把同一組數字套進 setup 公式的結果，對它沒有意義。',
        'STA 沒有報錯不代表電路正確：pulse width 與 phase continuity 不是 setup/hold 檢查的範圍。',
        '要修好它，就得讓切換只在某個 edge 發生、而且兩個來源在那個 edge 對齊——做到這件事之後，它就變成 A 架構了。',
      ],
      limits: 'pulse width / phase continuity（STA 不檢查）',
    },
    {
      id: 'out2-lat',
      name: 'FFa.Q → MUX → div_out（/2 輸出 latency）',
      type: 'output',
      launch: { element: 'ffa', edge: 'rising', clock: 'clk' },
      capture: { element: 'out', edge: 'rising', clock: 'clk' },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FFa.clk', to: 'FFa.Q', kind: 'tcq', min: 5, max: 8, elements: ['ffa'] },
        { id: 'mux', label: 'MUX', from: 'out2', to: 'div_out', kind: 'mux', min: 6, max: 8, wires: ['w_out2', 'w_out'], elements: ['mux'] },
      ],
      description: '/2 的 output edge 在 clock edge 後 16 ps 出現。',
      limits: 'latency',
    },
    {
      id: 'out3-lat',
      name: 'FFb.Q → NOR → MUX → div_out（/3 輸出 latency）',
      type: 'output',
      launch: { element: 'ffb0', edge: 'rising', clock: 'clk' },
      capture: { element: 'out', edge: 'rising', clock: 'clk' },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FFb0.clk', to: 'FFb0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ffb0'] },
        { id: 'nor', label: 'NOR', from: 'FFb0.Q', to: 'out3', kind: 'logic', min: 8, max: 12, wires: ['w_b0_nor', 'w_out3'], elements: ['nor'] },
        { id: 'mux', label: 'MUX', from: 'out3', to: 'div_out', kind: 'mux', min: 6, max: 8, wires: ['w_out'], elements: ['mux'] },
      ],
      description: '/3 的 output edge 在 clock edge 後 28 ps 出現——比 /2 晚 12 ps。就算 mod 切換得再準，從 out2 換到 out3 也會多出 12 ps 的 phase jump。',
      limits: 'latency（兩條輸出 latency 不同 ⇒ 切換時必有 phase step）',
    },
  ],
}

/**
 * Lesson 3-3：/1 /2 的 timing scenario。
 *   div1   ：sel = 0 ⇒ d_en = 1 恆定，FF_EN 不動；只剩 FF0 的 toggle loop
 *   div2   ：sel = 1 ⇒ d_en = q0：FF0 → OR → FF_EN 的 half-cycle path 出現；en → AND 的 gating path 出現
 *   switch ：sel 會改變 ⇒ 多出 sel → INV → OR → FF_EN.D（half-cycle）
 */
export const dm12Timing: TimingScenario = {
  id: 'dm12',
  name: '/1 /2 clock gating：half-cycle path 與 pulse width',
  description: 'FF_EN 在 falling edge 抓資料，所以送資料給它的路徑只有半個 cycle；FF_EN 之後的 AND 沒有 capture flop，它要檢查的是 pulse width。',
  schematic: dm12Schematic,
  env: { period: 100, skew: 0, jitter: 2, margin: 2 },
  modes: [
    { id: 'div1', label: 'sel = 0（/1）', description: 'en 恆 1，clock 直接通過' },
    { id: 'div2', label: 'sel = 1（/2）', description: 'en 跟著 q0，每兩個 pulse 放一個' },
    { id: 'switch', label: 'sel 切換中', description: 'sel 由 controller 改變' },
  ],
  paths: [
    {
      id: 'q0-inv-d0',
      name: 'FF0.Q → INV → FF0.D（toggle loop）',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'FF0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'inv', label: 'INV', from: 'FF0.Q', to: 'FF0.D', kind: 'logic', min: 4, max: 6, wires: ['w_q0_inv', 'w_inv_d0'], elements: ['inv'] },
      ],
      description: '普通的 full-cycle path：與 Lesson 1-1 的 /2 完全相同。',
      limits: 'Fmax（但通常不是最緊的）',
    },
    {
      id: 'q0-or-den',
      name: 'FF0.Q → OR → FF_EN.D（half-cycle）',
      type: 'setup',
      modes: ['div2', 'switch'],
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff_en', edge: 'falling', clock: 'clk', setup: 7, hold: 3 },
      periodFraction: 0.5,
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'FF0.Q', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'or', label: 'OR', from: 'FF0.Q', to: 'FF_EN.D', kind: 'logic', min: 7, max: 10, wires: ['w_q0_or', 'w_den'], elements: ['or'] },
      ],
      sensitizedWhen: 'sel = 1（sel = 0 時 OR 輸出恆 1）',
      description: 'launch 在 rising edge、capture 在同一個 cycle 的 falling edge：可用時間只有 T/2（duty 50% 時）。這通常才是這個電路的 Fmax critical path。',
      notes: ['required = 0.5·T − tsetup − jitter − margin = 50 − 7 − 2 − 2 = 39 ps；arrival = 8 + 10 = 18 ps ⇒ slack 21 ps。', '輸入 clock 的 duty 若不是 50%，half-cycle 的可用時間也跟著變——這是 duty-sensitive path。', 'Tclk,min = (18 + 7 + 2 + 2) / 0.5 = 58 ps，比 toggle loop 的 25 ps 緊得多。'],
      limits: 'Fmax（half-cycle，duty-sensitive）',
    },
    {
      id: 'sel-or-den',
      name: 'sel → INV → OR → FF_EN.D（control，half-cycle）',
      type: 'setup',
      modes: ['switch'],
      launch: { element: 'sel', edge: 'rising', clock: 'clk', label: 'controller flop（rising）' },
      capture: { element: 'ff_en', edge: 'falling', clock: 'clk', setup: 7, hold: 3 },
      periodFraction: 0.5,
      segments: [
        { id: 'tcq_src', label: 'tCQ（controller）', from: 'ctrl.clk', to: 'sel', kind: 'tcq', min: 5, max: 8 },
        { id: 'inv', label: 'INV', from: 'sel', to: 'sel̄', kind: 'logic', min: 3, max: 4, wires: ['w_sel'], elements: ['inv_sel'] },
        { id: 'or', label: 'OR', from: 'sel̄', to: 'FF_EN.D', kind: 'logic', min: 7, max: 10, wires: ['w_selb', 'w_den'], elements: ['or'] },
      ],
      sensitizedWhen: 'sel 改變的那個 cycle',
      description: 'sel 若由同一個 clk 的 rising-edge flop 送出，它也只有半個 cycle 可以到達 FF_EN。sel 的 deadline = falling edge − tsetup − tOR − tINV。',
      notes: ['如果 controller 在 falling edge 送 sel（與 FF_EN 同相），就變成 full-cycle path——這是常見的設計選擇。'],
      limits: 'mode switching 的 deadline',
    },
    {
      id: 'en-and-out',
      name: 'FF_EN.Q → AND → div_out（clock gating）',
      type: 'pulse-width',
      modes: ['div2', 'switch'],
      launch: { element: 'ff_en', edge: 'falling', clock: 'clk' },
      capture: { element: 'and', edge: 'rising', clock: 'clk', label: 'clk 的下一個 rising edge（AND 的另一個輸入）', minPulse: 30 },
      periodFraction: 0.5,
      segments: [
        { id: 'tcq', label: 'tCQ (FF_EN)', from: 'FF_EN.clk↓', to: 'en', kind: 'tcq', min: 5, max: 8, elements: ['ff_en'] },
        { id: 'and', label: 'AND', from: 'en', to: 'div_out', kind: 'logic', min: 4, max: 6, wires: ['w_en', 'w_out'], elements: ['and'] },
      ],
      description: '這裡沒有 flop 在抓 div_out，所以不是 setup check。要求是：en 在 clk 的下一個 rising edge 之前就穩定，AND 才能輸出一個完整的 0.5T pulse。若 en 遲到 x ps（x = tCQ + tAND − 0.5T > 0）：該放行的那個 cycle pulse 起點晚 x ⇒ 寬度剩 0.5T − x；該擋掉的那個 cycle 則會冒出一個寬度約 x 的 runt。兩種結果都可能低於下游 flop 的最小 pulse width。',
      notes: [
        '⚠︎ 這條 path 沒有 capture flop：下面那張表是「借用」setup 版面來呈現「en 比下一個 clk↑ 早多久穩定」。只有 arrival（tCQ + tAND = 14 ps）與 slack 這兩列有意義；Required time、Tclk,min、Fmax 幾欄對它沒有意義，也不要拿去跟真正的 setup path 比。',
        '表中的「slack」= 0.5T − (tCQ + tAND) − jitter − margin = 50 − 14 − 2 − 2 = 32 ps：它量的是「AND 對 en 的反應完成」比下一個 clk↑ 早多久（模型保守地把 tAND 也算進去）。只要它是正的，輸出就是完整的 0.5T = 50 ps pulse，遠大於下游要求的 30 ps；一旦變負，才會出現上面 description 說的截短或 runt。',
        '若 en 改用 rising-edge FF（練習），en 在 clk↑ + tCQ = 8 ps 就改變（仍在 clk = 1 期間）：已經升起的 pulse 被切成只剩 tCQ = 8 ps ⇒ runt。注意 AND 的 tAND 在 rising（clk↑ + tAND 升起）與 falling（clk↑ + tCQ + tAND 落下）兩端各出現一次，相減之後不進入寬度——runt 寬度是 8 ps，不是 tCQ + tAND = 14 ps（14 ps 是那個 pulse 的「落下時刻」）。模型裡 AND 的 clk→out 與 en→out 兩條 arc 都是 6 ps 所以剛好抵消；真實 gate 兩條 arc 不相等，殘差 = t(en→out) − t(clk→out)，runt 寬度會在 8 ps 上下幾 ps。',
        '這條路徑限制的是 pulse width / glitch，不是 Fmax；它與 setup、hold 都不同。',
      ],
      limits: 'output pulse width（runt 風險），不是 setup',
    },
    {
      id: 'clk-and-out',
      name: 'clk → AND → div_out（output latency）',
      type: 'output',
      launch: { element: 'clk', edge: 'rising', clock: 'clk' },
      capture: { element: 'out', edge: 'rising', clock: 'clk' },
      segments: [
        { id: 'wire', label: 'clock wire', from: 'clk', to: 'AND.in0', kind: 'wire', min: 2, max: 3, wires: ['w_clk_and'] },
        { id: 'and', label: 'AND', from: 'AND.in0', to: 'div_out', kind: 'logic', min: 4, max: 6, wires: ['w_out'], elements: ['and'] },
      ],
      description: '輸出 edge 直接來自 clk edge：latency 只有一個 AND。這也是 /1 /2 gating 的優點——輸出 jitter 幾乎等於輸入 jitter。',
      limits: 'output latency',
    },
  ],
}
