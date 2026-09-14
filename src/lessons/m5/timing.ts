import type { TimingPath, TimingScenario } from '@/models/timing/types'
import { arch2TimingSchematic, glitchFreeMuxSchematic, pmuxCtrlSchematic } from './schematics'

/**
 * Module 5 的 timing scenario。單位 ps；Tvco = 125 ps（8 GHz VCO），phase spacing = 15.625 ps。
 *
 * 重點：PMUX 的 select 路徑不是傳統 DFF-to-DFF setup path。它的「capture」不是 flop 的 edge，
 * 而是「新舊 phase 同 level」的時間窗（safe switching window）。
 * 以 ph_old 的 rising edge 為 t = 0、forward k 步為例，第一個安全窗是「兩者都 high」：
 *   打開 = ph_new 的 rising edge（k/8 T）、關閉 = ph_old 的 falling edge（1/2 T）。
 * 所以 max-delay 對應「window 關閉」（setup-like，periodFraction = 0.5），
 * min-delay 對應「window 打開」（hold-like，hold = k/8 T）。太早、太晚都會產生 runt。
 */

const T = 125
const SPACING = T / 8 // 15.625 ps

/** combinational PMUX 的 select 路徑：從 divider 輸出（FSM clock）到 pmux_out */
function selWindowPath(k: 1 | 2 | 3 | 4, opts: { id: string; modes?: string[]; clkpath?: { min: number; max: number; note: string; elements?: string[] }; wires: { fb: string; q: string; dec: string; mux: string; out?: string }; elements: { div?: string; sel: string; dec: string; mux: string } }): TimingPath {
  const hold = k * SPACING
  const width = 0.5 * T - hold
  const segs: TimingPath['segments'] = []
  if (opts.clkpath) {
    segs.push({ id: 'clkpath', label: 'div_out 晚到', from: 'ph_old ↑（pclk）', to: 'div_out', kind: 'tcq', min: opts.clkpath.min, max: opts.clkpath.max, elements: opts.clkpath.elements ?? (opts.elements.div ? [opts.elements.div] : []), wires: opts.wires.out ? [opts.wires.out] : [], note: opts.clkpath.note })
  }
  segs.push(
    { id: 'fb', label: 'div_out wire', from: 'div_out', to: 'phase_sel.clk', kind: 'wire', min: 2, max: 4, wires: [opts.wires.fb] },
    { id: 'tcq_sel', label: 'phase_sel tCQ', from: 'phase_sel.clk', to: 'phase_sel.Q', kind: 'tcq', min: 8, max: 12, elements: [opts.elements.sel], wires: [opts.wires.q] },
    { id: 'dec', label: 'decode', from: 'phase_sel', to: 'sel[7:0]', kind: 'logic', min: 6, max: 12, elements: [opts.elements.dec], wires: [opts.wires.dec] },
    { id: 'mux', label: 'PMUX sel→out', from: 'sel', to: 'pmux_out', kind: 'mux', min: 10, max: 14, elements: [opts.elements.mux], wires: [opts.wires.mux], note: 'select 改變後 pmux_out 跟到新 phase 的 level（若 level 不同就是一個 edge）' },
  )
  return {
    id: opts.id,
    name: `phase_sel → decode → PMUX select（forward +${k}：window [${k}/8 T, 1/2 T]）`,
    type: 'async',
    modes: opts.modes,
    launch: { element: opts.elements.div ?? opts.elements.sel, edge: 'rising', clock: 'ph_old ↑（經 pmux_out → divider → div_out）', label: 'ph_old rising = window 的 t = 0' },
    capture: { element: opts.elements.mux, edge: 'falling', clock: `ph_old ↓（window 關閉，1/2 T = ${0.5 * T} ps）`, setup: 0, hold, label: `window 打開 = ph_new ↑（${k}/8 T = ${hold.toFixed(1)} ps）` },
    segments: segs,
    periodFraction: 0.5,
    description:
      width > 0
        ? `這不是 DFF-to-DFF path：終點是 combinational MUX 的輸出，沒有 flop 在等資料。真正的要求是 select 改變的瞬間 ph_old 與 ph_new 同 level。forward +${k} 的第一個安全窗是「都 high」：ph_new 在 ${k}/8 T 升起後打開、ph_old 在 1/2 T 落下時關閉，寬 ${width.toFixed(1)} ps。Setup 視圖 = 不能晚於 window 關閉；Hold 視圖 = 不能早於 window 打開（thold = ${hold.toFixed(1)} ps 就是「window 尚未打開」）。`
        : `forward +4：ph_new 是 ph_old 的反相，任何時刻兩者 level 都不同——安全窗寬度為 0（打開時刻 = 關閉時刻 = 1/2 T）。這條 path 不可能 timing clean：不是延遲多少的問題，是結構上沒有窗。`,
    notes:
      width > 0
        ? [
            `⚠ 這條 path 的 type 是 async：下表的 Required / Slack / T_clk,min / F_max 只是把同一組數字套進 setup 公式的結果，對它沒有物理意義——它沒有 capture flop，限制的是 window 的上下界（${(k * SPACING).toFixed(1)} ps ～ ${(0.5 * T).toFixed(1)} ps），失敗模式是 runt / pulse-width violation 而不是「資料來不及」。要看的是 arrival 有沒有落在這兩個界線之間。`,
            `Setup（max-delay）：select 最晚必須在 ph_old 的 falling edge（62.5 ps）之前到；晚了就落進「ph_old 已 low、ph_new 還 high」的 danger zone（1/2 T ～ 1/2 + ${k}/8 T），pmux_out 會多一個 rising edge，再在 ph_new 落下時結束 ⇒ 寬度 ≤ ${k}/8 T 的 runt。`,
            `Hold（min-delay）：select 最早也只能在 ph_new 升起（${hold.toFixed(1)} ps）之後才到；太早會落進「ph_old 已 high、ph_new 還 low」的 danger zone（0 ～ ${k}/8 T），pmux_out 被截成一個寬 < ${k}/8 T 的短 pulse。與傳統 hold 檢查同樣的精神：不是越快越好。`,
            `第二個安全窗是「都 low」：[1/2 + ${k}/8 T, 1 T]，同樣寬 ${width.toFixed(1)} ps。若 select 註定會晚到，就把它刻意延到這個窗（例如用 ph_old 的 falling edge 重新取樣）——這正是 glitch-free MUX 的做法。`,
            'k 越大 window 越窄（每步少 15.6 ps）；k = 4 時為 0。所以 combinational PMUX 只適合小步數、而且要搭配 retiming。',
          ]
        : [
            `⚠ 這條 path 的 type 是 async：下表的 Required / Slack / T_clk,min / F_max 只是把同一組數字套進 setup 公式的結果，對它沒有物理意義——window 寬度是 0，不論 arrival 多小都沒有合法的切換時刻。`,
            '要走 4 步，只能拆成兩次 +2（各自在安全窗內切），或改用 glitch-free MUX（舊的先關、新的後開，中間允許短暫沒有 clock）。',
            '這是結構問題：改 delay、加 buffer 都救不了。',
          ],
    limits: 'safe switching window（不是 Fmax）',
  }
}

/** Lesson 5-1 / 5-2：combinational PMUX 的控制路徑 + divider 內部路徑 + clock path */
export const pmuxSwitchTiming: TimingScenario = {
  id: 'pmux-switch',
  name: 'PMUX select 的 switching window',
  description: 'launch 是 divider 輸出（div_out）驅動的 FSM flop；「capture」是 pmux_out 上「ph_old 與 ph_new 同 level」的時間窗。切換 mode 看 forward 步數 k 對 window 的影響。',
  schematic: pmuxCtrlSchematic,
  env: { period: T, skew: 0, jitter: 3, margin: 3 },
  modes: [
    { id: 'k1', label: 'forward +1', description: 'window 寬 3/8 T' },
    { id: 'k2', label: 'forward +2', description: 'window 寬 1/4 T' },
    { id: 'k3', label: 'forward +3', description: 'window 寬 1/8 T' },
    { id: 'k4', label: 'forward +4', description: '沒有 window' },
  ],
  paths: [
    ...([1, 2, 3, 4] as const).map((k) =>
      selWindowPath(k, {
        id: `sel-window-k${k}`,
        modes: [`k${k}`],
        clkpath: { min: 8, max: 12, note: 'FSM 的 clock 是 div_out，本身就比 ph_old 的 rising edge 晚 divider 的 tCQ' },
        wires: { fb: 'w_fb', q: 'w_q', dec: 'w_dec', mux: 'w_pclk', out: 'w_out' },
        elements: { div: 'div', sel: 'ffsel', dec: 'dec', mux: 'mux' },
      }),
    ),
    {
      id: 'div-internal',
      name: 'divider 內部 Q → logic → D（在 fVCO 工作）',
      type: 'setup',
      launch: { element: 'div', edge: 'rising', clock: 'pmux_out' },
      capture: { element: 'div', edge: 'rising', clock: 'pmux_out', setup: 8, hold: 4 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'div.clk', to: 'div.Q', kind: 'tcq', min: 8, max: 12, elements: ['div'] },
        { id: 'logic', label: 'next-state logic', from: 'div.Q', to: 'div.D', kind: 'logic', min: 10, max: 18, elements: ['div'] },
      ],
      description: 'PMUX 後面的 divider 在 fVCO 工作，它自己的 register-to-register path 決定 Fmax。注意：backward phase step 會讓某一個 pclk 週期短於 Tvco（例如 7/8 T），這條 path 的可用時間那一個 cycle 也跟著變短。',
      notes: ['launch 與 capture 都在 pclk 上，skew ≈ 0。', 'phase step 造成的 pclk 週期變化：forward 變長（安全）、backward 變短（吃掉 slack）。'],
      limits: 'Fmax（divider 本身）',
    },
    {
      id: 'clk-path',
      name: 'ph_i → PMUX → divider clk（clock path latency）',
      type: 'output',
      launch: { element: 'ph0', edge: 'rising', clock: 'ph0' },
      capture: { element: 'div', edge: 'rising', clock: 'pmux_out' },
      segments: [{ id: 'mux_d', label: 'PMUX in→out', from: 'ph_i', to: 'pmux_out', kind: 'mux', min: 12, max: 18, elements: ['mux'], wires: ['w_ph0', 'w_pclk'] }],
      description: '這是 clock path，不是 setup path：延遲本身不限制 Fmax。但 8 個輸入到輸出的延遲若不一致（phase mismatch），每次切換 phase 就會帶進固定的 phase error；延遲隨 PVT / 電源雜訊變化則是 jitter 來源。',
      notes: ['⚠ 這條 path 的 type 是 output：下表的 Required / Slack / T_clk,min / F_max 沒有物理意義（沒有 capture flop 在等資料）。唯一該看的是 arrival = clock latency，以及它的 8 路 mismatch 與 PVT 變動。'],
      limits: 'phase mismatch / jitter（不是 Fmax）',
    },
  ],
}

/** glitch-free MUX 的 enable handoff path：en_old（↓ph_old）→ sel logic → EN_new.D（↓ph_new），可用時間 k/8 T */
function handoffPath(k: 1 | 2 | 3): TimingPath {
  return {
    id: `handoff-k${k}`,
    name: `EN_a.Q → sel logic → EN_b.D（handoff，forward +${k}：可用 ${k}/8 T）`,
    type: 'setup',
    modes: [`k${k}`],
    launch: { element: 'ffa', edge: 'falling', clock: 'ph_a', label: 'en_a 在 ph_a ↓ 關掉' },
    capture: { element: 'ffb', edge: 'falling', clock: 'ph_b', setup: 8, hold: 4, label: `ph_b ↓ 比 ph_a ↓ 晚 ${k}/8 T` },
    segments: [
      { id: 'tcq_en', label: 'EN_a tCQ', from: 'EN_a.clk', to: 'en_a', kind: 'tcq', min: 8, max: 12, elements: ['ffa'], wires: ['w_ena_fb'] },
      { id: 'logic', label: 'd_b = sel·¬en_a', from: 'en_a', to: 'EN_b.D', kind: 'logic', min: 6, max: 10, elements: ['ctl'], wires: ['w_db'] },
    ],
    periodFraction: k / 8,
    sensitizedWhen: `切換 ph_a → ph_b（forward +${k}）時`,
    description: `新的 enable 要等舊的關掉才能開（d_b = sel AND NOT en_a）。en_a 在 ph_a 的 falling edge 關掉，EN_b 在 ph_b 的 falling edge 取樣——兩個 edge 只差 ${k}/8 T = ${(k * SPACING).toFixed(1)} ps。這是 glitch-free MUX 自己的 register-to-register path，launch clock 與 capture clock 是兩個不同的 phase。`,
    notes: [
      'slack < 0 的後果不是 glitch：EN_b 抓不到這一次 falling edge，就等下一次（多一個 Tvco 的 latency）；pmux_out 仍然乾淨。engine 的 real delay 模式正是這樣（forward +1 多等一個 T）。',
      '真正的危險是 d_b 剛好落在 EN_b 的 setup/hold window 裡 ⇒ metastable。保守做法：EN_b 前再加一級 flop（2-stage synchronizer，latency +1 T），或限制最小步數，或由 FSM 提前一個 output 週期送出 select。',
      '步數越大這條 path 越寬鬆（k/8 T）——與 combinational MUX 的 safe window 剛好相反（k 越大越窄）。',
    ],
    limits: '切換 latency（是否多等一個 T）與 EN flop 的 metastability',
  }
}

/** Lesson 5-2：glitch-free MUX 的 half-cycle path 與 handoff path */
export const glitchFreeTiming: TimingScenario = {
  id: 'pmux-glitch-free',
  name: 'Glitch-free MUX：enable 重同步的 timing path',
  description: 'select 由 FSM（clock = div_out，與 ph_a rising 對齊再加 divider tCQ）送出，先在 ph_a 的 falling edge 被 EN_a 抓到（half-cycle path）；舊 enable 關掉之後，新 enable 才在 ph_b 的 falling edge 打開（handoff path，可用時間 = phase 差）。',
  schematic: glitchFreeMuxSchematic,
  env: { period: T, skew: 0, jitter: 3, margin: 3 },
  modes: [
    { id: 'k1', label: 'forward +1', description: 'handoff 只有 1/8 T' },
    { id: 'k2', label: 'forward +2', description: 'handoff 2/8 T' },
    { id: 'k3', label: 'forward +3', description: 'handoff 3/8 T' },
  ],
  paths: [
    {
      id: 'half-cycle',
      name: 'phase_sel → sel logic → EN_a.D（rising → falling，half cycle）',
      type: 'setup',
      launch: { element: 'ffsel', edge: 'rising', clock: 'div_out（≈ ph_a ↑ + divider tCQ）' },
      capture: { element: 'ffa', edge: 'falling', clock: 'ph_a', setup: 8, hold: 4 },
      segments: [
        { id: 'clkpath', label: 'div_out 晚到', from: 'ph_a ↑', to: 'phase_sel.clk', kind: 'wire', min: 8, max: 12, wires: ['w_clkfsm'], note: 'FSM clock 由 divider 產生，相對 ph_a rising 晚了 divider tCQ；當成 launch clock 的額外延遲計入' },
        { id: 'tcq', label: 'phase_sel tCQ', from: 'phase_sel.clk', to: 'phase_sel.Q', kind: 'tcq', min: 8, max: 12, elements: ['ffsel'], wires: ['w_sel'] },
        { id: 'logic', label: 'sel logic', from: 'sel', to: 'EN_a.D', kind: 'logic', min: 6, max: 10, elements: ['ctl'], wires: ['w_da'] },
      ],
      periodFraction: 0.5,
      description: 'launch 在 ph_a 的 rising（經 div_out），capture 在 ph_a 的 falling：可用時間只有半個 Tvco（62.5 ps）。EN_a 在 clock 為 low 的半週期內改變 en_a，所以 AND 輸出不會跳。',
      notes: [
        '如果 slack 不夠：讓 FSM 提前一個 output 週期算好 phase_sel（pipeline），這條 path 就變成 multicycle，可用時間 = N·T + 0.5 T。',
        'hold：min arrival = 8 + 8 + 6 = 22 ps ≥ thold 4 ps，安全。',
        '這條 path 決定「select 送出後多快能開始切」；它不是 divider 的 Fmax path。',
      ],
      limits: 'select 更新率 / FSM 的 Fmax',
    },
    handoffPath(1),
    handoffPath(2),
    handoffPath(3),
    {
      id: 'en-gate',
      name: 'EN_a.Q → AND（en 必須在 ph_a 再度 rising 前穩定）',
      type: 'async',
      launch: { element: 'ffa', edge: 'falling', clock: 'ph_a' },
      capture: { element: 'anda', edge: 'rising', clock: 'ph_a', setup: 0, hold: 0 },
      segments: [
        { id: 'tcq_en', label: 'EN_a tCQ', from: 'EN_a.clk', to: 'en_a', kind: 'tcq', min: 8, max: 12, elements: ['ffa'], wires: ['w_ena'] },
        { id: 'and', label: 'AND', from: 'en_a', to: 'ph_a·en_a', kind: 'logic', min: 6, max: 10, elements: ['anda'] },
      ],
      periodFraction: 0.5,
      description: 'en_a 在 ph_a falling 之後改變（此時 ph_a = 0，AND 輸出不會跳）。它必須在 ph_a 的下一個 rising edge 之前穩定，否則 AND 會送出 partial pulse。capture 不是 flop，是 AND gate 的 clock 輸入。',
      notes: [
        '⚠ 這條 path 的 type 是 async：下表的 Required / Slack / T_clk,min / F_max 只是套公式的結果。它的 capture 不是 flop 而是 AND gate 的 clock 輸入，失敗模式是 AND 送出 partial pulse（pulse-width），不是 setup violation。',
        '這就是為什麼 enable 要在 falling edge 取樣：讓 en 的改變落在 clock 為 low 的半週期內。',
        'hold = 0：en 在 falling edge 之後才變本來就沒問題。',
      ],
      limits: 'AND gating 的 pulse 完整性',
    },
  ],
}

/** Lesson 5-3：架構 2（PMUX → /2 /3）的完整 timing scenario，含 mode */
export const arch2Timing: TimingScenario = {
  id: 'pmux-arch2',
  name: '架構 2：PMUX → /2 /3 cell',
  description: 'PMUX 在 fVCO 工作。divider 內部路徑、mod 控制路徑、phase select window 三種路徑各有不同的 launch / capture 與可用時間。',
  schematic: arch2TimingSchematic,
  env: { period: T, skew: 0, jitter: 3, margin: 3 },
  modes: [
    { id: 'mod0', label: 'mod = 0（/2）', description: 'q1 恆為 0，只有 FF0 的 loop 被 sensitize' },
    { id: 'mod1', label: 'mod = 1（/3）', description: 'AND 傳遞 q0，FF1 進入 loop' },
  ],
  paths: [
    {
      id: 'q0-nor-d0',
      name: 'FF0.Q → NOR → FF0.D',
      type: 'setup',
      launch: { element: 'ff0', edge: 'rising', clock: 'pclk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'pclk', setup: 8, hold: 4 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 8, max: 12, elements: ['ff0'] },
        { id: 'nor', label: 'NOR', from: 'q0', to: 'd0', kind: 'logic', min: 10, max: 16, elements: ['nor'], wires: ['w_q0_nor', 'w_d0'] },
      ],
      description: '兩種 mode 都存在的 register-to-register path，在 fVCO 工作。',
      limits: 'Fmax',
    },
    {
      id: 'q1-nor-d0',
      name: 'FF1.Q → NOR → FF0.D',
      type: 'setup',
      modes: ['mod1'],
      launch: { element: 'ff1', edge: 'rising', clock: 'pclk' },
      capture: { element: 'ff0', edge: 'rising', clock: 'pclk', setup: 8, hold: 4 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF1.clk', to: 'q1', kind: 'tcq', min: 8, max: 12, elements: ['ff1'] },
        { id: 'nor', label: 'NOR', from: 'q1', to: 'd0', kind: 'logic', min: 10, max: 16, elements: ['nor'], wires: ['w_q1_nor', 'w_d0'] },
      ],
      sensitizedWhen: 'mod = 1（q1 才會翻轉）',
      description: 'mod = 0 時 q1 恆為 0：這條路徑存在於電路圖上，但沒有 transition，不算 critical path。',
      limits: 'Fmax（/3 mode）',
    },
    {
      id: 'q0-and-d1',
      name: 'FF0.Q → AND → FF1.D',
      type: 'setup',
      modes: ['mod1'],
      launch: { element: 'ff0', edge: 'rising', clock: 'pclk' },
      capture: { element: 'ff1', edge: 'rising', clock: 'pclk', setup: 8, hold: 4 },
      segments: [
        { id: 'tcq', label: 'tCQ', from: 'FF0.clk', to: 'q0', kind: 'tcq', min: 8, max: 12, elements: ['ff0'] },
        { id: 'and', label: 'AND', from: 'q0', to: 'd1', kind: 'logic', min: 8, max: 12, elements: ['and'], wires: ['w_q0_and', 'w_d1'] },
      ],
      sensitizedWhen: 'mod = 1（AND 才會傳遞 q0）',
      description: 'mod = 0 時 AND 被 mod = 0 擋住，d1 恆為 0，不被 sensitize。',
      limits: 'Fmax（/3 mode）',
    },
    {
      id: 'mod-ctl',
      name: 'mod reg → AND → FF1.D（multicycle 2）',
      type: 'setup',
      launch: { element: 'ffmod', edge: 'rising', clock: 'div_out' },
      capture: { element: 'ff1', edge: 'rising', clock: 'pclk', setup: 8, hold: 4 },
      segments: [
        { id: 'clkpath', label: 'div_out 晚到', from: 'pclk ↑', to: 'mod reg.clk', kind: 'tcq', min: 18, max: 28, elements: ['nor'], wires: ['w_out', 'w_fb_mod'], note: 'div_out = NOR 輸出：比 pclk rising 晚 tCQ（8–12）+ NOR（10–16）' },
        { id: 'tcq', label: 'mod reg tCQ', from: 'mod reg.clk', to: 'mod', kind: 'tcq', min: 8, max: 12, elements: ['ffmod'], wires: ['w_mod'] },
        { id: 'and', label: 'AND', from: 'mod', to: 'd1', kind: 'logic', min: 8, max: 12, elements: ['and'], wires: ['w_d1'] },
      ],
      cycles: 2,
      sensitizedWhen: 'mod 在 state 00（div_out = 1）時改變；第一個 pclk edge 後 state = 01，第二個 edge 才用 d1 = q0·mod',
      description: 'mod 由 div_out 的 rising edge launch（state 剛進 00）。第一個 pclk edge 把 state 帶到 01（此時 q0 = 0，d1 = q0·mod = 0，與 mod 無關），第二個 edge 才真正取樣 d1 = 1·mod。所以是 2-cycle path。',
      notes: ['如果 FSM 把 mod 放在別的 state 改變，cycle 數會不同——要重新逐 edge 推導。', '在 /3 mode 中，state 10 之後回到 00 的那個 edge 也不用 mod（d1 = q0·mod = 0·mod = 0）。', 'engine 的示範腳本把 mod 與 sel 一起在 ph0 falling edge 改（state 01 期間），仍趕得上第二個 edge——所以切換後的第一個 output 週期就已經是新的 N。'],
      limits: 'modulus 控制的 timing deadline',
    },
    selWindowPath(1, {
      id: 'sel-window',
      clkpath: { min: 18, max: 28, note: 'div_out = NOR 輸出：比 pclk rising 晚 tCQ（8–12）+ NOR（10–16）', elements: ['ff0', 'nor'] },
      wires: { fb: 'w_fb_sel', q: 'w_sel_q', dec: 'w_dec', mux: 'w_pclk0', out: 'w_out' },
      elements: { div: 'ff0', sel: 'ffsel', dec: 'dec', mux: 'mux' },
    }),
    {
      id: 'clk-path',
      name: 'ph_i → PMUX → FF0.clk（clock path）',
      type: 'output',
      launch: { element: 'ph0', edge: 'rising', clock: 'ph0' },
      capture: { element: 'ff0', edge: 'rising', clock: 'pclk' },
      segments: [{ id: 'mux_d', label: 'PMUX in→out', from: 'ph_i', to: 'pclk', kind: 'mux', min: 12, max: 18, elements: ['mux'], wires: ['w_ph0', 'w_pclk0'] }],
      description: 'clock path latency：不限制 Fmax，但 8 路 delay mismatch = phase error，PVT 變化 = jitter。',
      notes: ['⚠ 這條 path 的 type 是 output：下表的 Required / Slack / T_clk,min / F_max 沒有物理意義（沒有 capture flop 在等資料）。唯一該看的是 arrival = clock latency。'],
      limits: 'phase mismatch / jitter',
    },
  ],
}
