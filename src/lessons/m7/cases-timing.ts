import type { TimingScenario } from '@/models/timing/types'
import { div2Timing } from '@/lessons/m1/div2-timing'
import { clockGateLatchSchematic, dm23ModSchematic, downstreamSchematic, mmd2Schematic, pmuxSchematic, progDiv57Schematic, progDivSchematic } from './cases-schematics'

/* ------------------------------------------------------------------ 案例 A：Q → INV → D */
/**
 * 直接沿用 Lesson 1-1 的 scenario：單一 flop 的 feedback loop。
 *
 * 唯一的加工：rst_n 那條 recovery / removal path 在 Lesson 1-1 只寫了「這是什麼檢查」，
 * 沒有解釋 Explorer 上那個紅色的 removal slack。這裡把數字講清楚，不改動 m1 的模型：
 *   rst_n 走線 min 2 / max 4 ps，t_recovery = 10 ps、t_removal = 5 ps。
 *   removal arrival(min) = 2 ps、required = t_removal = 5 ps ⇒ removal slack = −3 ps。
 * 這是真的 violation，而且是「把 reset 直接接到 flop 的非同步 pin」最典型的下場。
 */
export const caseATiming: TimingScenario = {
  ...div2Timing,
  id: 'case-a-div2',
  name: '案例 A：/2 divider，Q → INV → D',
  paths: div2Timing.paths.map((p) =>
    p.id !== 'rst-recovery'
      ? p
      : {
          ...p,
          description:
            '非同步 reset 釋放（de-assert）相對 clock edge 的時間要求：recovery 像 setup（釋放要夠早）、removal 像 hold（釋放要夠晚），中間那段是禁區。這裡把「rst_n 在源頭剛好於 clock edge 當下釋放」當成分析的原點，所以 arrival 就是走線延遲本身。',
          notes: [
            'recovery：走線 max 4 ps ⇒ 訊號最晚在 edge 後 4 ps 到 flop；要滿足 t_recovery = 10 ps，源頭必須提早到 edge 前 10 + 4 = 14 ps 以上釋放。',
            'removal：走線 min 2 ps ⇒ 訊號最早在 edge 後 2 ps 到 flop，但 t_removal = 5 ps ⇒ removal slack = 2 − 5 = −3 ps，是真的 violation（面板上那個紅色的 −3 不是 bug）。',
            '為什麼會 violation：這個模型的 rst_n 直接從 pad 接到 flop 的 async pin，走線只有 2–4 ps，而 t_removal = 5 ps 比它還長——也就是「釋放時刻落在 edge 前 10 ps 到 edge 後 5 ps 之間」這個禁區，光靠走線延遲跨不過去。',
            '修法不是把線拉長，而是加 reset synchronizer：assert 保持非同步（立刻生效），de-assert 用兩級 flop 對齊 clk，釋放時刻就永遠落在 edge 之後一整個 tCQ，recovery / removal 兩邊都有餘裕。Lesson 7-2 Step 10 的 progDiv34 就是已經加了 buffer 樹的版本（走線 min 6 ⇒ removal slack = +1）。',
            '這條 path 不影響 Fmax：它決定的是「reset 釋放後的第一個 edge 可不可靠」。',
          ],
        },
  ),
}

/* ------------------------------------------------------------------ 案例 B：Q → decode → MUX → D */
export const caseBTiming: TimingScenario = {
  id: 'case-b-progdiv',
  name: '案例 B：programmable /4 /6，Q → decode → MUX → D',
  description: 'sel 決定哪一個 decode 被 sensitize：/4 模式走 DEC4 → MUX，/6 模式走 DEC6 → MUX。INC 路徑在兩種模式都存在。',
  schematic: progDivSchematic,
  env: { period: 60, skew: 0, jitter: 3, margin: 2 },
  modes: [
    { id: 'div4', label: 'sel = 0（/4）', description: 'terminal count = 011，只有 DEC4 會影響 tc' },
    { id: 'div6', label: 'sel = 1（/6）', description: 'terminal count = 101，只有 DEC6 會影響 tc' },
  ],
  paths: [
    {
      id: 'dec4-mux',
      name: 'FF0.Q → DEC4 → MUX2 → CLR → FF1.D',
      type: 'setup',
      modes: ['div4'],
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'dec', label: 'DEC4', from: 'q[2:0]', to: 'tc4', kind: 'logic', min: 9, max: 14, wires: ['w_q0', 'w_bus_dec4'], elements: ['dec4'], note: '3-input AND（一個反相輸入）' },
        { id: 'mux', label: 'MUX2 (in0→out)', from: 'tc4', to: 'tc', kind: 'mux', min: 6, max: 10, wires: ['w_tc4', 'w_tc'], elements: ['mux'], note: 'sel = 0 時 in0 → out 這條 data arc 被 sensitize' },
        { id: 'clr', label: 'CLR (AND ¬tc)', from: 'tc', to: 'd1', kind: 'logic', min: 6, max: 10, wires: ['w_d1'], elements: ['clr'] },
      ],
      sensitizedWhen: 'sel = 0',
      description: '/4 模式的 Fmax critical path：terminal count 的 decode 經過 MUX 再把 next state 清零。',
      notes: [
        'launch：三個 flop 在 edge k 同時更新，decode 的輸入全部來自 edge k。',
        'capture：CLR 的輸出 d0/d1/d2 fan-out 到三個 flop，任一個都在 edge k+1 capture；這裡挑 FF1。',
        'MUX 的 data arc（in0 → out）算在 path 上；sel → out 的 arc 是另一條 control path（見 sel 路徑）。',
      ],
      limits: 'sel = 0 時的 Fmax',
    },
    {
      id: 'dec6-mux',
      name: 'FF0.Q → DEC6 → MUX2 → CLR → FF1.D',
      type: 'setup',
      modes: ['div6'],
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'dec', label: 'DEC6', from: 'q[2:0]', to: 'tc6', kind: 'logic', min: 9, max: 14, wires: ['w_q0', 'w_bus_dec6'], elements: ['dec6'], note: '3-input AND（一個反相輸入）' },
        { id: 'mux', label: 'MUX2 (in1→out)', from: 'tc6', to: 'tc', kind: 'mux', min: 6, max: 10, wires: ['w_tc6', 'w_tc'], elements: ['mux'], note: 'sel = 1 時 in1 → out 被 sensitize' },
        { id: 'clr', label: 'CLR (AND ¬tc)', from: 'tc', to: 'd1', kind: 'logic', min: 6, max: 10, wires: ['w_d1'], elements: ['clr'] },
      ],
      sensitizedWhen: 'sel = 1',
      description: '/6 模式的 Fmax critical path：結構與 /4 相同，只是換成另一個 decode。',
      notes: ['兩個 decode 在這個模型裡 delay 相同，所以兩種 mode 的 Fmax 一樣；練習裡把 decode 換成 /5、/7 之後就不一樣了。'],
      limits: 'sel = 1 時的 Fmax',
    },
    {
      id: 'inc',
      name: 'FF0.Q → INC(+1) → CLR → FF2.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff2', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'inc', label: 'INC (AND + XOR)', from: 'q0', to: 'inc2', kind: 'logic', min: 14, max: 22, wires: ['w_q0', 'w_bus_inc', 'w_inc2'], elements: ['inc'], note: 'inc2 = q2 XOR (q1 AND q0)：兩級 gate' },
        { id: 'clr', label: 'CLR (AND ¬tc)', from: 'inc2', to: 'd2', kind: 'logic', min: 6, max: 10, wires: ['w_d2'], elements: ['clr'] },
      ],
      description: '遞增邏輯的路徑：所有 mode 都被 sensitize，但比 decode → MUX 那條短 2 ps。',
      notes: ['如果把 MUX 拿掉（固定除數），decode 路徑變短，這條 INC 路徑就可能變成 critical path——critical path 會隨架構改變而換人。'],
      limits: 'Fmax（次要）',
    },
    {
      id: 'sel-ctrl',
      name: 'sel → MUX2 (sel→out) → CLR → FF1.D',
      type: 'async',
      launch: { element: 'sel', edge: 'rising', clock: 'sel source' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'wire', label: 'sel wire', from: 'sel', to: 'MUX2.sel', kind: 'wire', min: 3, max: 5, wires: ['w_sel'] },
        { id: 'mux', label: 'MUX2 (sel→out)', from: 'MUX2.sel', to: 'tc', kind: 'mux', min: 7, max: 12, wires: ['w_tc'], elements: ['mux'], note: 'select-to-output arc 通常比 data arc 慢' },
        { id: 'clr', label: 'CLR (AND ¬tc)', from: 'tc', to: 'd1', kind: 'logic', min: 6, max: 10, wires: ['w_d1'], elements: ['clr'] },
      ],
      description: 'sel 是 control path：若 sel 來自靜態 configuration register，它不是每個 cycle 都要檢查的 setup path；若要動態切換除數，sel 必須由同步 flop 送出，並且只能在 tc 不可能被 assert 的 state 切換。',
      notes: [
        '這條路徑沒有固定的 launch edge（sel 不是由 clk 的 flop 送出），所以 STA 無法自動算 slack——除非你把它宣告成同步路徑或 false path。',
        '動態切換的正確做法：sel 由 clk 同步 flop 送出（變成一般 setup path），並在 state 000 附近切換，避免 decode 正在 asserted 時改變 tc。',
      ],
      limits: '除數切換的安全時間點，不是 Fmax',
    },
    {
      id: 'out',
      name: 'FF1.Q → div_out',
      type: 'output',
      launch: { element: 'ff1', edge: 'rising', clock: 'clk' },
      capture: { element: 'out', edge: 'rising', clock: 'clk' },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF1.clk', to: 'q1', kind: 'tcq', min: 5, max: 8, elements: ['ff1'] },
        { id: 'wire', label: 'output wire', from: 'q1', to: 'div_out', kind: 'wire', min: 2, max: 3, wires: ['w_out'] },
      ],
      description: 'div_out 直接取自 flop Q，沒有 decode：output latency 只有 tCQ + wire，也不會有 decode glitch。',
      limits: 'output latency，不限制 Fmax',
    },
  ],
}

/* ------------------------------------------------------------------ 案例 C：MOD → logic → D */
export const caseCTiming: TimingScenario = {
  id: 'case-c-dm23-mod',
  name: '案例 C：/2 /3 cell 的 mod → AND → FF1.D',
  description: 'state path（q → NOR/AND → D）在三種 mode 都一樣；差別在 mod 的來源決定 mod → AND → D 這條 control path 要怎麼檢查。',
  schematic: dm23ModSchematic,
  env: { period: 50, skew: 0, jitter: 2, margin: 2 },
  modes: [
    { id: 'static', label: '(i) 靜態 register', description: 'mod 由 cfg_clk 寫入，divider 運作期間不變' },
    { id: 'sync', label: '(ii) 同步 flop', description: 'mod 由與 divider 同 clk 的 flop 送出，每個 edge 都可能改變' },
    { id: 'async', label: '(iii) 非同步來源', description: 'mod 與 clk 沒有已知的相位關係' },
  ],
  paths: [
    {
      id: 'state-nor',
      name: 'FF0.Q → NOR → FF0.D（state path）',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'nor', label: 'NOR', from: 'q0', to: 'd0', kind: 'logic', min: 8, max: 12, wires: ['w_q0_nor', 'w_d0'], elements: ['nor'] },
      ],
      description: 'cell 本身的 Fmax path：與 mod 來源無關，三種 mode 都一樣。',
      limits: 'cell 的 Fmax',
    },
    {
      id: 'state-and',
      name: 'FF0.Q → AND → FF1.D（state path）',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'and', label: 'AND (q0 arc)', from: 'q0', to: 'd1', kind: 'logic', min: 6, max: 10, wires: ['w_q0_and', 'w_d1'], elements: ['and'] },
      ],
      description: 'AND 的 q0 輸入這一側是 state path；mod 那一側才是 control path。同一個 gate、兩條不同的 timing arc。',
      limits: 'cell 的 Fmax（次要）',
    },
    {
      id: 'mod-static',
      name: '(i) MOD_REG → AND → FF1.D',
      type: 'async',
      modes: ['static'],
      launch: { element: 'modreg', edge: 'rising', clock: 'cfg_clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ (MOD_REG)', from: 'cfg_clk', to: 'mod', kind: 'tcq', min: 6, max: 10, elements: ['modreg'] },
        { id: 'wire', label: 'mod wire', from: 'MOD_REG.Q', to: 'AND.in1', kind: 'wire', min: 3, max: 6, wires: ['w_modreg_q', 'w_mod'] },
        { id: 'and', label: 'AND (mod arc)', from: 'mod', to: 'd1', kind: 'logic', min: 6, max: 10, wires: ['w_d1'], elements: ['and'] },
      ],
      description: 'launch clock 是 cfg_clk，與 clk 沒有整數倍關係。STA 若照 default 用兩個 clock 的最近 edge 去算，會得到毫無意義的 slack。正確做法：宣告 false path（或 case analysis），並用「mod 只在 divider 停止 / reset 期間改寫」這條系統規則保證安全。',
      notes: [
        '這條 path 不限制 Fmax；它限制的是「什麼時候允許改寫 configuration」。',
        '若 firmware 在 divider 運作中改寫 MOD_REG，它就退化成 (iii) 非同步來源：可能剛好落在 FF1 的 setup/hold window。',
      ],
      limits: 'configuration 改寫的時機（系統規則），不是 Fmax',
    },
    {
      id: 'mod-sync',
      name: '(ii) MOD_SYNC → AND → FF1.D',
      type: 'setup',
      modes: ['sync'],
      launch: { element: 'modsync', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ (MOD_SYNC)', from: 'clk', to: 'mod', kind: 'tcq', min: 5, max: 8, elements: ['modsync'] },
        { id: 'wire', label: 'mod wire', from: 'MOD_SYNC.Q', to: 'AND.in1', kind: 'wire', min: 3, max: 6, wires: ['w_modsync_q', 'w_mod'] },
        { id: 'and', label: 'AND (mod arc)', from: 'mod', to: 'd1', kind: 'logic', min: 6, max: 10, wires: ['w_d1'], elements: ['and'] },
      ],
      description: 'launch 與 capture 用同一個 clk：這是一條正常的 register-to-register setup path，每個 edge 都被檢查（STA 保守但正確）。功能上只有「離開 state 01 的那個 edge」真的用到 mod，其他 edge 抓到什麼都沒差——但 STA 不知道這件事，也不需要知道。',
      notes: [
        'MOD timing deadline（Lesson 3-2）就是這條 path：mod 最晚要在 capture edge 之前 tAND + tsetup 穩定。',
        'hold：tCQ,min + wire,min + AND,min = 14 ps ≥ thold 3 ps，安全。',
      ],
      limits: 'Fmax（與 state path 一起比較 slack）與 mod 的更新時機',
    },
    {
      id: 'mod-async',
      name: '(iii) mod_async → AND → FF1.D',
      type: 'async',
      modes: ['async'],
      launch: { element: 'modasync', edge: 'rising', clock: '（無）' },
      capture: { element: 'ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'wire', label: 'mod wire', from: 'mod_async', to: 'AND.in1', kind: 'wire', min: 4, max: 8, wires: ['w_modasync', 'w_mod'] },
        { id: 'and', label: 'AND (mod arc)', from: 'mod', to: 'd1', kind: 'logic', min: 6, max: 10, wires: ['w_d1'], elements: ['and'] },
      ],
      description: '沒有 launch edge，所以沒有 arrival time 可算——這裡顯示的 slack 只是「若 mod 剛好在 edge 前改變」的極端情況。正確做法：先用 synchronizer 把 mod 對齊到 clk（變成 (ii)），或由系統保證 mod 只在 q0 = 0 的期間（state 00 / 10）改變。',
      notes: [
        '在 state 00 與 10 時 q0 = 0，AND 輸出 = 0 與 mod 無關 ⇒ mod 在這段時間改變是安全的（safe window）。',
        'safe window 長度：/2 模式 ≈ 2T − (tAND + tsetup) − (thold − tAND,min)；/3 模式 ≈ 3T − 同樣兩項。',
        '若 mod 在離開 state 01 的 edge 附近改變，FF1 可能 metastable ⇒ 除數既不是 2 也不是 3。',
      ],
      limits: 'mod 改變的安全時間窗；需要 synchronizer 或系統規則',
    },
  ],
}

/* ------------------------------------------------------------------ 案例 D：MMD 的跨級 carry path */
export const caseDTiming: TimingScenario = {
  id: 'case-d-mmd2',
  name: '案例 D：MMD 的 mod_out2 → cell 1 carry path',
  description: 'f1 是 cell 2 的 generated clock。mod_out2 在 f1 rising 之後才出來，再經兩個 AND 回到 cell 1 的 da1。STA 預設當成 single-cycle，功能上其實是 2-cycle。',
  schematic: mmd2Schematic,
  env: { period: 70, skew: 0, jitter: 3, margin: 2 },
  paths: [
    {
      id: 'carry-sta',
      name: 'clk → a0 → NOR(f1) → b0/b1 → NOR → AND(p0) → AND → da1（STA 預設 single-cycle）',
      type: 'setup',
      launch: { element: 'c1ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'c1ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq_a', label: 'tCQ (a0)', from: 'clk', to: 'a0', kind: 'tcq', min: 5, max: 8, elements: ['c1ff0'], note: 'f1 source latency 的第一段' },
        { id: 'nor1', label: 'C1 NOR (f1)', from: 'a0', to: 'f1', kind: 'logic', min: 8, max: 12, wires: ['w_a0_nor', 'w_f1_c2clk0'], elements: ['c1nor'], note: 'f1 = generated clock，source latency 的第二段' },
        {
          id: 'tcq_b',
          label: 'tCQ (b0/b1)',
          from: 'f1',
          to: 'b0/b1',
          kind: 'tcq',
          min: 5,
          max: 8,
          elements: ['c2ff0', 'c2ff1'],
          note: 'cell 2 的 state flop 被 f1 rising launch：mod_out2 = NOR(b1, b0) 在「進入 state 00」那一拍升起，p1 = 1（cell 2 走 /3，10 → 00）時是 b1 落下、p1 = 0（走 /2，01 → 00）時是 b0 落下，兩條 arc 的 delay 相同',
        },
        { id: 'nor2', label: 'C2 NOR', from: 'b0/b1', to: 'mod_out2', kind: 'logic', min: 8, max: 12, wires: ['w_b0_nor', 'w_b1_nor', 'w_mo2_andp0'], elements: ['c2nor'] },
        { id: 'andp0', label: 'C1 AND(p0)', from: 'mod_out2', to: 'mod1_eff', kind: 'logic', min: 6, max: 10, wires: ['w_mod1eff'], elements: ['c1andp0'] },
        { id: 'and1', label: 'C1 AND', from: 'mod1_eff', to: 'da1', kind: 'logic', min: 6, max: 10, wires: ['w_da1'], elements: ['c1and'] },
      ],
      description: 'STA 把 f1 定義成 clk 的 generated clock，cell 2 的 state flop（p1 = 1 時是 b1、p1 = 0 時是 b0）在 f1 rising launch，capture 取最近的下一個 clk edge ⇒ 可用時間只有 1 T（扣掉 source latency 20 ps）。在 T = 70 ps 時 slack 為負。',
      notes: [
        '這是「跨兩級」的 register-to-register path：launch 在 cell 2 的 state flop（b1 或 b0，看 p1），capture 在 cell 1（a1），中間經過 generated clock 的 source latency。兩顆 flop 到 C2 NOR 的 delay 相同，所以不管走哪一顆，arrival 都是 60 ps。',
        '不是 ripple 當 synchronous 分析：f1 的 latency 有被算進 arrival，capture edge 仍然是 clk 的 edge。',
        '請用下面的模擬器逐 edge 驗證：mod1_eff 在 f1 rising 之後改變時，a0 剛好 = 0，AND 把它擋住 ⇒ 下一個 edge 根本沒用到它。',
      ],
      limits: 'STA 報出的 Fmax（保守；若不加 exception 會被誤判為 violation）',
    },
    {
      id: 'carry-mc',
      name: '同一條 path，功能上真正的 requirement：2-cycle',
      type: 'multicycle',
      cycles: 2,
      launch: { element: 'c1ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'c1ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq_a', label: 'tCQ (a0)', from: 'clk', to: 'a0', kind: 'tcq', min: 5, max: 8, elements: ['c1ff0'] },
        { id: 'nor1', label: 'C1 NOR (f1)', from: 'a0', to: 'f1', kind: 'logic', min: 8, max: 12, wires: ['w_a0_nor', 'w_f1_c2clk0'], elements: ['c1nor'] },
        { id: 'tcq_b', label: 'tCQ (b0/b1)', from: 'f1', to: 'b0/b1', kind: 'tcq', min: 5, max: 8, elements: ['c2ff0', 'c2ff1'], note: 'p1 = 1 時 launch flop 是 C2.FF1（b1），p1 = 0 時是 C2.FF0（b0）' },
        { id: 'nor2', label: 'C2 NOR', from: 'b0/b1', to: 'mod_out2', kind: 'logic', min: 8, max: 12, wires: ['w_b0_nor', 'w_b1_nor', 'w_mo2_andp0'], elements: ['c2nor'] },
        { id: 'andp0', label: 'C1 AND(p0)', from: 'mod_out2', to: 'mod1_eff', kind: 'logic', min: 6, max: 10, wires: ['w_mod1eff'], elements: ['c1andp0'] },
        { id: 'and1', label: 'C1 AND', from: 'mod1_eff', to: 'da1', kind: 'logic', min: 6, max: 10, wires: ['w_da1'], elements: ['c1and'] },
      ],
      sensitizedWhen: 'a0 = 1（f1 rising 之後的第二個 clk edge 才會發生）',
      description: 'f1 rising 發生在 a = 00 的那個 cycle，此時 a0 = 0，C1 AND 的輸出被鎖在 0；a0 要到下一個 edge 才變 1，da1 才會跟著 mod1_eff。所以 mod1_eff 真正的 deadline 是 f1 rising 後的第二個 clk edge ⇒ multicycle = 2。',
      notes: [
        '宣告 multicycle exception 之前，必須對所有 p0/p1 組合、所有 state 都證明「a0 在 f1 rising 後的第一個 cycle 一定是 0」——這個模型裡永遠成立（a = 00 ⇒ f1 = 1 ⇒ 下一個 edge a0 ← 1）。',
        '這是為什麼 MMD 的 modulus-out 通常設計成「在 cell 進入 state 00 那一刻就送出」：把跨級 carry 變成有整個 cell 週期可用的 path。',
      ],
      limits: '真正的 Fmax 限制（比 STA 預設寬鬆一倍）',
    },
    {
      id: 'local-c1',
      name: 'cell 1 內部：a0 → NOR → da0',
      type: 'setup',
      launch: { element: 'c1ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'c1ff0', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ (a0)', from: 'clk', to: 'a0', kind: 'tcq', min: 5, max: 8, elements: ['c1ff0'] },
        { id: 'nor', label: 'C1 NOR', from: 'a0', to: 'da0', kind: 'logic', min: 8, max: 12, wires: ['w_a0_nor', 'w_f1_da0'], elements: ['c1nor'] },
      ],
      description: '高速級（cell 1）自己的 state path：這才是 MMD 真正的 Fmax critical path（在 carry path 正確宣告 multicycle 之後）。',
      limits: 'MMD 的 Fmax',
    },
    {
      id: 'local-c2',
      name: 'cell 2 內部：b0 → NOR → db0（clock = f1，週期 ≥ 2 T）',
      type: 'setup',
      cycles: 2,
      launch: { element: 'c2ff0', edge: 'rising', clock: 'f1' },
      capture: { element: 'c2ff0', edge: 'rising', clock: 'f1', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ (b0)', from: 'f1', to: 'b0', kind: 'tcq', min: 5, max: 8, elements: ['c2ff0'] },
        { id: 'nor', label: 'C2 NOR', from: 'b0', to: 'db0', kind: 'logic', min: 8, max: 12, wires: ['w_b0_nor', 'w_mo2_db0'], elements: ['c2nor'] },
      ],
      description: 'cell 2 的 clock 是 f1，週期最短是 2 T（cell 1 在 /2 時）。這裡用 cycles = 2 表示「可用時間 = 2 T」；它是低速級，幾乎不可能是 critical path。',
      notes: ['低速級可以用較小、較省電的 flop——這是 MMD 架構省功耗的來源。'],
      limits: 'cell 2 的 Fmax（寬鬆）',
    },
    {
      id: 'p-ctrl',
      name: 'p0 → AND(p0) → AND → da1（靜態 programming）',
      type: 'async',
      launch: { element: 'p0', edge: 'rising', clock: 'programming' },
      capture: { element: 'c1ff1', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'wire', label: 'p0 wire', from: 'p0', to: 'AND(p0)', kind: 'wire', min: 3, max: 5, wires: ['w_p0'] },
        { id: 'andp0', label: 'C1 AND(p0)', from: 'p0', to: 'mod1_eff', kind: 'logic', min: 6, max: 10, wires: ['w_mod1eff'], elements: ['c1andp0'] },
        { id: 'and1', label: 'C1 AND', from: 'mod1_eff', to: 'da1', kind: 'logic', min: 6, max: 10, wires: ['w_da1'], elements: ['c1and'] },
      ],
      description: 'p0 / p1 是除數 programming bit：與案例 C 的 (i) 相同，靜態時是 false path；若 fractional-N 每個 output 週期都要換 N，就要由同步 register 送出並在 safe window 內更新（案例 F 的 control loop）。',
      limits: 'N 更新時機，不是 Fmax',
    },
  ],
}

/* ------------------------------------------------------------------ 案例 E：PMUX select path */
export const caseETiming: TimingScenario = {
  id: 'case-e-pmux',
  name: '案例 E：phase control → decode → PMUX select',
  description: 'Tvco = 125 ps（8 GHz）、8 個 phase 間距 Δ = 15.6 ps。跳一個 phase 時，舊 phase 與新 phase 同時為 low 的 safe window 是 Tvco/2 − Δ = 3/8 Tvco ≈ 47 ps（同時為 high 的那一個窗一樣寬）。select 必須在這個 window 內完成切換。',
  schematic: pmuxSchematic,
  env: { period: 125, skew: 0, jitter: 3, margin: 2 },
  paths: [
    {
      id: 'sel-window',
      name: 'phase_sel reg → decode → MUX select（safe window = Tvco/2 − |k|Δ，k = ±1 時 3/8 Tvco）',
      type: 'async',
      periodFraction: 3 / 8,
      launch: { element: 'ctrl', edge: 'rising', clock: 'div_out' },
      capture: { element: 'mux', edge: 'rising', clock: '被選 phase 的下一個 edge', setup: 0, hold: 0 },
      segments: [
        { id: 'tcq', label: 'tCQ (phase_sel reg)', from: 'div_out', to: 'phase_sel', kind: 'tcq', min: 6, max: 10, elements: ['ctrl'] },
        { id: 'wire', label: 'wire', from: 'phase_sel', to: 'decode', kind: 'wire', min: 2, max: 3, wires: ['w_phase_sel'] },
        { id: 'dec', label: '3→8 decode', from: 'phase_sel', to: 'one-hot', kind: 'logic', min: 9, max: 14, elements: ['dec'], note: 'one-hot 切換時可能短暫兩個都為 1 或都為 0' },
        { id: 'mux', label: 'MUX select→out', from: 'one-hot', to: 'sel_phase', kind: 'mux', min: 8, max: 12, wires: ['w_dec_sel'], elements: ['mux'], note: 'select 改變後 output 切到新 phase 的時間' },
      ],
      description: '這不是 setup path：capture 端沒有 flop 在等資料，而是「MUX 輸出在切換期間不可以產生 runt pulse」。可用時間 = 舊/新 phase 同時為 low 的 window（k = ±1 時 Tvco/2 − Tvco/8 = 3/8 Tvco），launch edge 是對齊 window 起點的 div_out edge。算出來的 T_min 是「能安全切換的最小 Tvco」，不是 divider 的 Fmax。',
      notes: [
        'window 的定義是「兩個 phase 同時是同一個 level」：起點 = 兩者之中較晚的那個 falling edge，終點 = 兩者之中較早的那個 rising edge ⇒ 寬度 = Tvco/2 − |k|·Tvco/8。k = ±1 ⇒ 3/8 Tvco；|k| = 4（差半個週期）⇒ 0。',
        '這個寬度對 k 的正負完全對稱（都是 Tvco/2 − |k|Δ）：往後跳（k < 0）window 並不會變寬。把「新 phase falling → 舊 phase 下一個 rising」當 window 才會算出 5/8 Tvco，但那段區間裡舊 phase 還是 high，在那裡切換會把正在輸出的 pulse 截短。',
        '真正不對稱的是切換後那半個週期的寬度：往前跳（k > 0，選較晚的相位）把它拉長 |k|Δ；往後跳（k < 0，選較早的相位）把它縮短 |k|Δ，而且切在 window 內也躲不掉（把 edge 提前 |k|Δ 本來就等於壓掉一個半週期 |k|Δ）。壓縮後的寬度 = Tvco/2 − |k|Δ，與 window 寬度剛好是同一個式子；|k| 一大就會撞到 flop 的 min pulse width。這才是很多 PMUX 只允許往一個方向旋轉的原因——Lesson 7-3 / 7-4 的波形（Tvco = 80、Δ = 10、k = −1）量到 30 ps，正常 40 ps，就是這個式子。',
        '若 select 落在 window 外（兩個 phase level 不同）：切換當下就多出一個 edge，輸出可能出現比 Tvco/8 還窄的 runt（見 Lesson 5-2 與 7-4）。這是 pulse-width 問題，不是 data setup 問題。',
        '修法不是把 divider 做快，而是把 select 的 launch edge 對到 window 起點（retime），或用 glitch-free MUX（先切到共同 low 再切換）。',
      ],
      limits: 'glitch-free switching window（能安全切換的最小 Tvco），不是 divider Fmax',
    },
    {
      id: 'div-fmax',
      name: '/N counter 內部 state path（clock = 被選 phase）',
      type: 'setup',
      launch: { element: 'div', edge: 'rising', clock: 'sel_phase' },
      capture: { element: 'div', edge: 'rising', clock: 'sel_phase', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'sel_phase', to: 'q', kind: 'tcq', min: 5, max: 8, elements: ['div'] },
        { id: 'logic', label: 'counter logic', from: 'q', to: 'd', kind: 'logic', min: 14, max: 22, elements: ['div'] },
      ],
      description: 'counter 自己的 Fmax path：launch 與 capture 都在被選中的 phase 上。這才是「divider 的 critical path」，與 select window 是兩件事。',
      limits: 'divider（counter）的 Fmax',
    },
    {
      id: 'phase-clk',
      name: 'VCO phase → MUX → counter clock（clock path）',
      type: 'output',
      launch: { element: 'vco', edge: 'rising', clock: 'ph_k' },
      capture: { element: 'div', edge: 'rising', clock: 'sel_phase' },
      segments: [
        { id: 'wire', label: 'phase wire', from: 'ph_k', to: 'MUX.in_k', kind: 'wire', min: 2, max: 4, wires: ['w_ph0'] },
        { id: 'mux', label: 'MUX data→out', from: 'MUX.in_k', to: 'sel_phase', kind: 'mux', min: 7, max: 11, wires: ['w_mux_out'], elements: ['mux'] },
      ],
      description: '這是 clock path，不是 data path：它的 delay 決定 output edge 的 latency；八個 phase 經過 MUX 的 delay 若不一致（phase-dependent delay），會直接變成 output 的 DNL / spur。',
      limits: 'output edge latency 與 phase mismatch，不是 Fmax',
    },
  ],
}

/* ------------------------------------------------------------------ 案例 F：divider → downstream DSM */
const N_DIV = 8
export const caseFTiming: TimingScenario = {
  id: 'case-f-downstream',
  name: '案例 F：divider 輸出 → downstream DSM / control logic（N = 8）',
  description: 'Tin = 125 ps，N = 8 ⇒ div_out 週期 = 1000 ps。五條完全不同性質的 path：內部 Fmax、interface、control loop、combinational feedback、generated clock。',
  schematic: downstreamSchematic,
  env: { period: 125, skew: 0, jitter: 3, margin: 2 },
  paths: [
    {
      id: 'int-fmax',
      name: 'FF_a → core logic → FF_b（divider 內部 Fmax path）',
      type: 'setup',
      launch: { element: 'ffa', edge: 'rising', clock: 'clk_in' },
      capture: { element: 'ffb', edge: 'rising', clock: 'clk_in', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'clk_in', to: 'q_a', kind: 'tcq', min: 5, max: 8, elements: ['ffa'] },
        { id: 'logic', label: 'core logic', from: 'q_a', to: 'd_b', kind: 'logic', min: 18, max: 30, wires: ['w_qa', 'w_core_d'], elements: ['core'] },
      ],
      description: 'launch 與 capture 都在 clk_in：可用時間 1 Tin。這是唯一一條真正決定「divider 能跑多快」的 path。',
      limits: 'divider 的 Fmax',
    },
    {
      id: 'iface',
      name: 'FF_last → DSM_REG（interface path，同一個 div_out clock）',
      type: 'interface',
      cycles: N_DIV,
      launch: { element: 'fflast', edge: 'rising', clock: 'div_out' },
      capture: { element: 'dsmreg', edge: 'rising', clock: 'div_out', setup: 20, hold: 8 },
      segments: [
        { id: 'tcq', label: 'tCQ (FF_last)', from: 'div_out', to: 'status_q', kind: 'tcq', min: 15, max: 25, elements: ['fflast'], note: 'standard-cell flop，比 divider 內部的高速 flop 慢' },
        { id: 'wire', label: 'wire / buffer', from: 'FF_last.Q', to: 'DSM_REG.D', kind: 'wire', min: 8, max: 15, wires: ['w_iface'] },
      ],
      description: 'launch 與 capture 都由 div_out 觸發：在 div_out domain 裡這是單一 cycle 的 path，可用時間 = N × Tin = 1000 ps。slack 非常寬鬆——前提是 STA 裡有正確定義 div_out 為 generated clock（否則工具看不到這條 path）。',
      notes: ['兩個 flop 的 clock 都來自同一個 div_out buffer tree，skew 小；但若 DSM 在另一個 power domain 或距離很遠，clock tree 的 skew 要另外算。', '這條 path 常被誤稱為「divider 的 critical path」——它根本不在 divider 裡，也不限制 Fmax。'],
      limits: 'divider ↔ downstream 的 interface（在 div_out domain 幾乎不會是問題）',
    },
    {
      id: 'loop',
      name: 'DSM_REG → DSM comb → mod → core logic → FF_b（control loop，multicycle）',
      type: 'multicycle',
      cycles: N_DIV,
      launch: { element: 'dsmreg', edge: 'rising', clock: 'div_out' },
      capture: { element: 'ffb', edge: 'rising', clock: 'clk_in', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ (DSM_REG)', from: 'div_out', to: 'n_in', kind: 'tcq', min: 15, max: 25, elements: ['dsmreg'] },
        { id: 'dsm', label: 'DSM comb (accumulator)', from: 'n_in', to: 'mod', kind: 'logic', min: 120, max: 200, wires: ['w_dsm_in'], elements: ['dsm'], note: '多 bit 加法器與 carry，遠比 divider 的 gate 慢' },
        { id: 'wire', label: 'mod wire', from: 'DSM.mod', to: 'core.in1', kind: 'wire', min: 10, max: 20, wires: ['w_mod'] },
        { id: 'logic', label: 'core logic (mod arc)', from: 'mod', to: 'd_b', kind: 'logic', min: 18, max: 30, wires: ['w_core_d'], elements: ['core'] },
      ],
      description: 'DSM 在 output edge k 算出下一個 N，必須在 divider 開始下一個週期用到 N 之前送回——launch 在 div_out domain，capture 在 clk_in domain。若 STA 照預設用最近的 clk_in edge 當 capture，可用時間只有 1 Tin，一定 fail；正確的 exception 是 multicycle，cycles 由架構決定。',
      notes: [
        '這裡用 cycles = N（整個 output 週期）是「MMD 在 output edge 才 latch 新 N」的情況；若某些 cell 在週期一開始就消耗 modulus bit（像案例 D），cycles 可能只剩 2 或 3。宣告 exception 之前要用模擬確認，方法與案例 D 相同。',
        'hold 檢查在 multicycle path 上要特別小心：預設 hold 仍以 launch edge 對到同一個 capture edge 檢查（0-cycle），通常不用放寬。',
      ],
      limits: 'control loop latency：DSM 能多慢、N 能多晚更新',
    },
    {
      id: 'comb-fb',
      name: 'div_out → DSM comb（無 register）→ mod → core → FF_b（combinational feedback）',
      type: 'setup',
      launch: { element: 'ffb', edge: 'rising', clock: 'clk_in' },
      capture: { element: 'ffb', edge: 'rising', clock: 'clk_in', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ (FF_b)', from: 'clk_in', to: 'q_b', kind: 'tcq', min: 5, max: 8, elements: ['ffb'] },
        { id: 'obuf', label: 'out decode / buffer', from: 'q_b', to: 'div_out', kind: 'logic', min: 8, max: 12, wires: ['w_qb_obuf', 'w_comb_fb'], elements: ['obuf'] },
        { id: 'dsm', label: 'DSM comb (accumulator)', from: 'div_out', to: 'mod', kind: 'logic', min: 120, max: 200, elements: ['dsm'] },
        { id: 'wire', label: 'mod wire', from: 'DSM.mod', to: 'core.in1', kind: 'wire', min: 10, max: 20, wires: ['w_mod'] },
        { id: 'logic', label: 'core logic (mod arc)', from: 'mod', to: 'd_b', kind: 'logic', min: 18, max: 30, wires: ['w_core_d'], elements: ['core'] },
      ],
      description: '如果 DSM 是純組合邏輯、直接從 div_out 算出 mod 再接回 divider：launch 與 capture 都是 FF_b，而且是相鄰兩個 clk_in edge ⇒ 可用時間 1 Tin，270 ps 的邏輯根本塞不進去。更糟的是功能面：mod 會在 divider 週期中途改變，除數變成「不知道是 N 還是 N+1」。',
      notes: ['這就是為什麼 DSM 與 divider 之間一定要有 register：不是為了 speed，而是為了讓 loop 有明確的 launch edge。', '合成工具看到這種 loop 會報 combinational loop 或極大的負 slack；不要用 false path 把它藏起來。'],
      limits: '危險：既不滿足 timing 也沒有明確的 divide ratio',
    },
    {
      id: 'gen-clk',
      name: 'FF_b → out decode / buffer → DSM_REG.clk（generated clock 的 source latency）',
      type: 'output',
      launch: { element: 'ffb', edge: 'rising', clock: 'clk_in' },
      capture: { element: 'dsmreg', edge: 'rising', clock: 'div_out' },
      segments: [
        { id: 'tcq', label: 'tCQ (FF_b)', from: 'clk_in', to: 'q_b', kind: 'tcq', min: 5, max: 8, elements: ['ffb'] },
        { id: 'obuf', label: 'out decode', from: 'q_b', to: 'div_out', kind: 'logic', min: 8, max: 12, wires: ['w_qb_obuf'], elements: ['obuf'] },
        { id: 'cbuf', label: 'clock buffer tree', from: 'div_out', to: 'DSM_REG.clk', kind: 'wire', min: 18, max: 25, wires: ['w_gclk_last', 'w_gclk_dsm'] },
      ],
      description: '這不是 setup check。div_out 被當成 clock 用，STA 必須把它定義成 clk_in 的 generated clock（divide-by-N），而它相對 clk_in edge 的 source latency = tCQ + decode + buffer = 45 ps。這個 latency 會平移 DSM domain 每一條 path 的 capture edge：interface path 不受影響（launch 也一樣平移），但 control loop 的可用時間會少掉這 45 ps。',
      notes: ['若 div_out 是由 decode（多個 flop 的 AND/NOR）產生而不是直接取 flop Q，decode 的 glitch 會直接變成 clock glitch ⇒ 下游 flop 被多觸發一次。輸出當 clock 用時，一定要從 flop Q 直接出去。'],
      limits: 'generated clock 的 latency 與 glitch，不是 Fmax',
    },
  ],
}

/* ------------------------------------------------------------------ 案例 B 練習：decode 換成 /5 /7 */
/**
 * DEC5 = q2 · q̄1 · q̄0 有兩個反相輸入 ⇒ 多一級 inverter（或更深的 PMOS stack），delay 14 → 18 ps。
 * DEC7 = q2 · q1 · q̄0 只有一個反相輸入，與原本的 DEC4 / DEC6 相同（14 ps）。
 * 結果：/5 模式的 critical path 變成 46 ps（slack 2，Tclk,min 58）；/7 模式維持 42 ps。
 */
export const caseBExerciseTiming: TimingScenario = {
  id: 'case-b-progdiv57',
  name: '練習：programmable /5 /7，decode 換成 =100 / =110',
  description: '同一個 counter、同一個 MUX、同一個 CLR，只換 decode。先自己算：哪一個 mode 變慢？慢在哪一段？慢多少 ps？再點選路徑驗證。',
  schematic: progDiv57Schematic,
  env: { period: 60, skew: 0, jitter: 3, margin: 2 },
  modes: [
    { id: 'div5', label: 'sel = 0（/5）', description: 'terminal count = 100，走 DEC5' },
    { id: 'div7', label: 'sel = 1（/7）', description: 'terminal count = 110，走 DEC7' },
  ],
  paths: [
    {
      id: 'dec5-mux',
      name: 'FF0.Q → DEC5 → MUX2 → CLR → FF2.D',
      type: 'setup',
      modes: ['div5'],
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff2', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'dec', label: 'DEC5', from: 'q[2:0]', to: 'tc5', kind: 'logic', min: 11, max: 18, wires: ['w_q0', 'w_bus_dec4'], elements: ['dec4'], note: '3-input AND，兩個反相輸入：多一級 inverter，14 → 18 ps' },
        { id: 'mux', label: 'MUX2 (in0→out)', from: 'tc5', to: 'tc', kind: 'mux', min: 6, max: 10, wires: ['w_tc4', 'w_tc'], elements: ['mux'] },
        { id: 'clr', label: 'CLR (AND ¬tc)', from: 'tc', to: 'd2', kind: 'logic', min: 6, max: 10, wires: ['w_d2'], elements: ['clr'] },
      ],
      sensitizedWhen: 'sel = 0',
      description: '/5 模式的 Fmax critical path：變慢的段只有 decode（+4 ps），其他三段與案例 B 完全相同。',
      limits: 'sel = 0 時的 Fmax（比案例 B 的 /4 慢 4 ps）',
    },
    {
      id: 'dec7-mux',
      name: 'FF0.Q → DEC7 → MUX2 → CLR → FF2.D',
      type: 'setup',
      modes: ['div7'],
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff2', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'dec', label: 'DEC7', from: 'q[2:0]', to: 'tc7', kind: 'logic', min: 9, max: 14, wires: ['w_q0', 'w_bus_dec6'], elements: ['dec6'], note: '3-input AND，一個反相輸入：與 DEC4 / DEC6 相同' },
        { id: 'mux', label: 'MUX2 (in1→out)', from: 'tc7', to: 'tc', kind: 'mux', min: 6, max: 10, wires: ['w_tc6', 'w_tc'], elements: ['mux'] },
        { id: 'clr', label: 'CLR (AND ¬tc)', from: 'tc', to: 'd2', kind: 'logic', min: 6, max: 10, wires: ['w_d2'], elements: ['clr'] },
      ],
      sensitizedWhen: 'sel = 1',
      description: '/7 模式：decode 的 delay 沒變，critical path 與案例 B 相同（42 ps）。',
      limits: 'sel = 1 時的 Fmax（與案例 B 相同）',
    },
    {
      id: 'inc',
      name: 'FF0.Q → INC(+1) → CLR → FF2.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff2', edge: 'rising', clock: 'clk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'inc', label: 'INC (AND + XOR)', from: 'q0', to: 'inc2', kind: 'logic', min: 14, max: 22, wires: ['w_q0', 'w_bus_inc', 'w_inc2'], elements: ['inc'] },
        { id: 'clr', label: 'CLR (AND ¬tc)', from: 'inc2', to: 'd2', kind: 'logic', min: 6, max: 10, wires: ['w_d2'], elements: ['clr'] },
      ],
      description: '遞增邏輯不受 decode 改動影響：兩種 mode 都是 40 ps。',
      limits: 'Fmax（次要）',
    },
    {
      id: 'out',
      name: 'FF2.Q → div_out',
      type: 'output',
      launch: { element: 'ff2', edge: 'rising', clock: 'clk' },
      capture: { element: 'out', edge: 'rising', clock: 'clk' },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF2.clk', to: 'q2', kind: 'tcq', min: 5, max: 8, elements: ['ff2'] },
        { id: 'wire', label: 'output wire', from: 'q2', to: 'div_out', kind: 'wire', min: 2, max: 3, wires: ['w_out'] },
      ],
      description: '輸出改取 q2：/5 時 q2 = 0,0,0,0,1（duty 1/5）；/7 時 q2 = 0,0,0,0,1,1,1（duty 3/7）。',
      limits: 'output latency，不限制 Fmax',
    },
  ],
}

/* ------------------------------------------------------------------ Lesson 7-4：clock gating cell 的三種 check */
/**
 * clockGateLatch：
 *   en-latch：上游 flop（clk edge k）→ en → latch D；latch 在 clk edge k+1 關閉 ⇒ 普通 setup path，可用時間 1 T
 *   q-inv-d：FF0 自己的 /2 feedback，clock = gclk（enable 時週期 = T）
 *   clk-gclk：clock path（AND 的 insertion delay）：決定 gclk 相對 clk 的 skew，不是 data path
 * pulse width 不是「path」：gclk 的 high 寬度 = clk 的 high 寬度（因為 en_l 只在 clk = 0 時改變），用 RuntPulseTable 檢查。
 */
export const clockGateTiming: TimingScenario = {
  id: 'clock-gate-latch',
  name: 'Latch-based clock gating：三條 path、三種 check',
  description: 'en 由上游 flop 在 clk rising 送出，經 latch（clk = 0 時 transparent）再與 clk AND。setup / hold 檢查 en → latch 與 q0 → INV → d0；gclk 的 pulse width 另外查。',
  schematic: clockGateLatchSchematic,
  env: { period: 100, skew: 0, jitter: 3, margin: 2 },
  paths: [
    {
      id: 'en-latch',
      name: '上游 flop → en → EN latch.D（setup / hold 至 latch 關閉的 edge）',
      type: 'setup',
      launch: { element: 'en', edge: 'rising', clock: 'clk（上游 flop）' },
      capture: { element: 'latch', edge: 'rising', clock: 'clk', setup: 6, hold: 4 },
      segments: [
        { id: 'tcq', label: 'tCQ (上游 flop)', from: 'clk', to: 'en', kind: 'tcq', min: 5, max: 8, elements: ['en'] },
        { id: 'wire', label: 'en wire', from: 'en', to: 'latch.D', kind: 'wire', min: 2, max: 4, wires: ['w_en'] },
      ],
      description: 'latch 在 clk rising 關閉（進入 hold），所以 en 必須在 rising edge 前 tsetup 穩定：這是一條普通的 setup path，可用時間 1 T。en 在 clk = 1 期間改變也沒關係——latch 正在保持，en_l 不動。',
      notes: [
        'hold：en 在 rising edge 之後至少要撐 thold = 4 ps 不變（tCQ,min + wire,min = 7 ps，安全）。',
        '因為 latch 在 clk = 0 期間 transparent，en 可以「借時間」：即使 en 在 falling edge 之後才到，只要在 rising edge 前穩定就行——這是 latch-based ICG 比 flop-based 寬鬆的地方。',
      ],
      limits: 'enable 的 setup / hold（相對 latch 關閉的 edge），不是 pulse width',
    },
    {
      id: 'q-inv-d',
      name: 'FF0.Q → INV → FF0.D（clock = gclk）',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'gclk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'gclk', setup: 7, hold: 3 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'gclk', to: 'q0', kind: 'tcq', min: 5, max: 8, elements: ['ff0'] },
        { id: 'inv', label: 'INV', from: 'q0', to: 'd0', kind: 'logic', min: 4, max: 6, wires: ['w_q_inv', 'w_d'], elements: ['inv'] },
      ],
      description: '被 gate 的 /2 自己的 state path。gclk 被 enable 時週期 = T；被 gate 掉的 cycle 沒有 edge，反而讓這條 path 更寬鬆——setup 只看相鄰兩個真正出現的 edge。',
      limits: '/2 的 Fmax',
    },
    {
      id: 'clk-gclk',
      name: 'clk → AND → gclk（clock path：insertion delay）',
      type: 'output',
      launch: { element: 'clk', edge: 'rising', clock: 'clk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'gclk' },
      segments: [{ id: 'and', label: 'AND (clk arc)', from: 'clk', to: 'gclk', kind: 'logic', min: 4, max: 6, wires: ['w_clk_and', 'w_gclk'], elements: ['and'] }],
      description: '這不是 data path：AND 的 delay 讓 gclk 比 clk 晚 4–6 ps 到達 FF0。對「clk domain flop → FF0」的 path 來說這是正 skew（setup 寬鬆、hold 嚴格）；對「FF0 → clk domain flop」則相反。',
      notes: ['pulse width 也在這條路上決定：gclk 的 high 寬度 = clk 的 high 寬度（en_l 不會在 clk = 1 時改變），所以只要 clk 本身合格，gclk 就合格。若 en 不經 latch 直接進 AND，這個保證就消失——見 RuntPulseTable。'],
      limits: 'gated clock 的 latency / skew 與 pulse width，不是 Fmax',
    },
  ],
}
