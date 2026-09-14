import type { TimingScenario } from '@/models/timing/types'
import { ripple8DecodeSchematic } from './ripple-schematics'

/**
 * Lesson 1-2 的 timing scenario（三級 ripple + NOR3 decode + 同步 capture flop）。
 *
 * 重點：ripple divider 的限制不是「register-to-register setup path」：
 *  (a) 第一級 FF0.Q → INV0 → FF0.D 決定 Fmax（它是唯一以 clk 為 launch/capture 的 feedback loop）；
 *  (b) q0 → FF1.clk → q1 → FF2.clk 是 clock path，延遲逐級累積（N × tCQ），再加上 q2 → div_out 的走線，決定輸出延遲；
 *  (c) 一旦後面有以 clk 同步的 decode / capture flop，(b) 的累積延遲就變成那個 capture flop 的 setup path（interface path）。
 *
 * 數值（ps）：tCQ 5/8，INV 4/6，NOR3 6/10，tsetup 7，thold 3，T = 40，jitter 2，margin 2。
 *  (a) arrival 14，required 29 ⇒ slack +15；Tclk,min = 25。
 *  (c) arrival 8+8+8+10 = 34，required 29 ⇒ slack −5；Tclk,min = 45（比 (a) 差 20 ps）。
 *  (b) output latency = 3×tCQ + t_wire = 8+8+8+3 = 27（max）、5+5+5+2 = 17（min）。
 */
export const rippleTiming: TimingScenario = {
  id: 'ripple8-decode',
  name: 'Ripple /8 + 同步 decode',
  description: 'ripple 每一級的 clock 都不一樣：只有 FF0 的 feedback loop 是真正以 clk 為 launch / capture 的 setup path；後級 Q 的延遲是 clock path 累積出來的，直到有人用 clk 去抓它。',
  schematic: ripple8DecodeSchematic,
  env: { period: 40, skew: 0, jitter: 2, margin: 2 },
  paths: [
    {
      id: 'ff0-loop',
      name: '(a) FF0.Q → INV0 → FF0.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq0', label: 'tCQ(FF0)', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'], note: 'clk rising edge 到 q0 穩定' },
        { id: 'inv0', label: 'INV0', from: 'q0', to: 'd0', kind: 'logic', min: 4, max: 6, wires: ['w_q0_inv', 'w_d0'], elements: ['inv0'], note: 'inverter propagation delay' },
      ],
      description: '第一級就是一個 /2：launch 在 clk 的 edge k，capture 在 edge k+1，可用時間一個 Tclk。這是 ripple divider 唯一以輸入 clock 為 launch / capture 的 register-to-register path，因此它決定 Fmax。',
      notes: [
        '與 Lesson 1-1 的 /2 完全相同：Tclk,min = tCQ,max + tINV,max + tsetup + jitter + margin = 8 + 6 + 7 + 2 + 2 = 25 ps。',
        'hold：tCQ,min + tINV,min = 9 ps ≥ thold = 3 ps，安全。',
        '後面幾級不會讓這條路徑變慢：FF1、FF2 對 FF0 而言只是 q0 的負載（fan-out），影響的是 tCQ(FF0) 的數值，不是路徑結構。',
      ],
      limits: 'Fmax（divider 本身能跑多快）',
    },
    {
      id: 'ff1-loop',
      name: 'FF1.Q → INV1 → FF1.D（clock = q0，週期 2T）',
      type: 'setup',
      launch: { element: 'ff1', edge: 'falling', clock: 'q0' },
      capture: { element: 'ff1', edge: 'falling', clock: 'q0', setup: 7, hold: 3 },
      cycles: 2,
      segments: [
        { id: 'tcq1', label: 'tCQ(FF1)', from: 'FF1.clk(q0↓)', to: 'q1', kind: 'tcq', min: 5, max: 8, elements: ['ff1'] },
        { id: 'inv1', label: 'INV1', from: 'q1', to: 'd1', kind: 'logic', min: 4, max: 6, wires: ['w_q1_inv', 'w_d1'], elements: ['inv1'] },
      ],
      description: 'FF1 的 clock 是 q0，q0 的週期是 2T。launch 在某個 q0 falling edge，capture 在下一個 q0 falling edge，所以可用時間是 2T（表格中以 T×2 表示）。同樣的路徑結構，可用時間卻是第一級的兩倍，永遠不會是 Fmax 的瓶頸。',
      notes: ['第 k 級的可用時間是 2^k × T：越後面越寬鬆。這就是 ripple 省功耗、容易做高速的原因——只有第一級在全速工作。', '注意 launch 與 capture 的 clock 是 q0，不是 clk：STA 工具需要 create_generated_clock 才會分析這條路徑。'],
      limits: '不限制 Fmax（可用時間 2T）',
    },
    {
      id: 'chain-decode',
      name: '(c) FF0.clk → q0 → q1 → q2 → NOR3 → FFS.D（interface path）',
      type: 'interface',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ffs', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      sensitizedWhen: '011→100、111→000 這類 q2 最後才改變的 transition',
      segments: [
        { id: 'tcq0', label: 'tCQ(FF0)', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'], note: 'clk edge k：q0 改變' },
        { id: 'tcq1', label: 'tCQ(FF1)', from: 'q0↓ (=FF1.clk)', to: 'q1', kind: 'tcq', min: 5, max: 8, wires: ['w_clk1'], elements: ['ff1'], note: 'q0 是 FF1 的 clock：這一段是 clock path，不是 data path' },
        { id: 'tcq2', label: 'tCQ(FF2)', from: 'q1↓ (=FF2.clk)', to: 'q2', kind: 'tcq', min: 5, max: 8, wires: ['w_clk2'], elements: ['ff2'], note: 'q1 是 FF2 的 clock：延遲再累積一級' },
        { id: 'nor', label: 'NOR3', from: 'q2', to: 'dec000', kind: 'logic', min: 6, max: 10, wires: ['w_q2_nor', 'w_q0_nor', 'w_q1_nor', 'w_dec'], elements: ['nor'], note: 'decode gate' },
      ],
      description:
        '這條路徑對 ripple 本身無關緊要，但只要有人在 clk 的下一個 edge（FFS）去抓 decode 結果，累積的 3 × tCQ + tNOR 就必須在一個 Tclk 內完成。它限制的是「同步 decode 可以跑多快」，不是 divider 的 Fmax。',
      notes: [
        'arrival = 8 + 8 + 8 + 10 = 34 ps；required = 40 − 7 − 2 − 2 = 29 ps ⇒ slack = −5 ps：divider 自己在 40 ps 沒問題，但同步 decode 已經失敗。',
        '解法不是改 divider：可以（1）降低 decode 的 clock 頻率、（2）用較晚的 edge 抓（multicycle）、（3）改用 synchronous counter、（4）只 resync q2（不加 decode gate）——arrival 變 24 ps，slack +5。',
        '若累積延遲剛好落在 FFS 的 setup / hold window 內，FFS 可能 metastable；若超過一個 cycle，decode 結果晚一拍，而且 temporary state 造成的 glitch 可能剛好被抓進去。',
        'hold 檢查要看最短路徑：q0 直接到 NOR3 只有 tCQ,min + tNOR,min = 11 ps（見下一條路徑），不是這條 34 ps 的長路徑。',
      ],
      limits: '同步 decode / resynchronizer 的最高 clock 頻率（不是 divider 的 Fmax）',
    },
    {
      id: 'q0-decode',
      name: 'FF0.Q → NOR3 → FFS.D（最短路徑：hold 看這條）',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ffs', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq0', label: 'tCQ(FF0)', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'nor', label: 'NOR3', from: 'q0', to: 'dec000', kind: 'logic', min: 6, max: 10, wires: ['w_q0_nor', 'w_dec'], elements: ['nor'] },
      ],
      description: '同一個 capture flop（FFS），但 launch 之後只經過一個 NOR3。setup 很寬鬆（arrival 18），可是 hold 就要看它：tCQ,min + tNOR,min = 11 ps ≥ thold + skew = 3 ps。',
      notes: ['setup 看最長路徑，hold 看最短路徑——兩者常常不是同一條。', 'q0 每個 edge 都變，所以這條路徑每個 cycle 都會被 sensitize；它是 FFS 的 hold-critical path。'],
      limits: 'FFS 的 hold margin',
    },
    {
      id: 'output-latency',
      name: '(b) FF0.clk → q0 → q1 → q2 → div_out（output latency）',
      type: 'output',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'out', edge: 'rising', clock: 'clk' },
      segments: [
        { id: 'tcq0', label: 'tCQ(FF0)', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'tcq1', label: 'tCQ(FF1)', from: 'q0↓', to: 'q1', kind: 'tcq', min: 5, max: 8, wires: ['w_clk1'], elements: ['ff1'] },
        { id: 'tcq2', label: 'tCQ(FF2)', from: 'q1↓', to: 'q2', kind: 'tcq', min: 5, max: 8, wires: ['w_clk2'], elements: ['ff2'] },
        { id: 'wire', label: 'output wire', from: 'q2', to: 'div_out', kind: 'wire', min: 2, max: 3, wires: ['w_out'] },
      ],
      description: '沒有 capture flop，所以不是 setup path；它告訴你 div_out 的 edge 相對於 clk edge 晚了多少：3 級的 tCQ 累積 3 × 8 = 24 ps，再加上 q2 → div_out 的走線 3 ps，合計 27 ps（max）；min 是 3 × 5 + 2 = 17 ps。隨級數線性長大的是 N × tCQ 那一項，走線只是固定的尾巴。每一級的 tCQ 都會隨 PVT、供電雜訊變化，所以這 27 ps 也帶著三級的 jitter。',
      notes: [
        '這條路徑不限制 Fmax；但若 div_out 要餵給 PFD 之類對 phase 敏感的電路，N × tCQ 的變化量就是 divider 貢獻的 phase noise / delay variation。',
        'Explorer 上的 latency 27 ps 是 max corner（3 × tCQ,max + t_wire,max）；min corner 是 17 ps。兩者的差 10 ps 就是這條輸出路徑的 delay variation 範圍。',
      ],
      limits: 'output latency 與 jitter，不限制 Fmax',
    },
  ],
}
