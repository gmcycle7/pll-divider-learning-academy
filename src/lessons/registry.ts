import type { LessonMeta, ModuleMeta } from './types'

const L = (id: string, module: number, order: number, title: string, titleEn: string, summary: string, load: LessonMeta['load']): LessonMeta => ({ id, module, order, title, titleEn, summary, load })

export const modules: ModuleMeta[] = [
  {
    id: 0,
    title: '進入 Divider 世界前的必要觀念',
    titleEn: 'Digital foundations for divider analysis',
    description: 'Clock edge、combinational vs sequential、DFF 與 clock-to-Q：建立追蹤 edge 與 state 的直覺。',
    lessons: [
      L('m0-l1-clock', 0, 1, 'Clock 到底是什麼', 'What is a clock, really?', 'level 與 edge、period、duty、phase、edge interval；為什麼 divider 要追蹤 edge。', () => import('./m0/l1-clock')),
      L('m0-l2-comb-seq', 0, 2, 'Combinational 與 Sequential Logic', 'Combinational vs sequential logic', '沒有記憶 vs 有 state；propagation delay；為什麼 feedback 要配 memory element。', () => import('./m0/l2-comb-seq')),
      L('m0-l3-dff', 0, 3, 'DFF、TFF 與 Clock-to-Q', 'DFF, TFF and clock-to-Q', 'clock edge 時 DFF 做什麼、tCQ、setup、hold、metastability 直覺、D = Q̄ 為什麼會 toggle。', () => import('./m0/l3-dff')),
    ],
  },
  {
    id: 1,
    title: '最基本的 Divider',
    titleEn: 'Basic dividers',
    description: '/2、ripple counter、synchronous counter：第一次完整走過 state → waveform → divide ratio → critical path。',
    lessons: [
      L('m1-l1-div2', 1, 1, 'DFF Divide-by-2', 'The DFF divide-by-2', 'D = Q̄ 逐 edge 分析、state table、divide ratio、duty cycle 與第一條 critical path。', () => import('./m1/l1-div2')),
      L('m1-l2-ripple', 1, 2, 'Ripple Counter Divider', 'Ripple counter dividers', '兩級 /4、三級 /8；propagation delay 逐級累積、temporary state、為什麼不適合高速同步 decode。', () => import('./m1/l2-ripple')),
      L('m1-l3-sync', 1, 3, 'Synchronous Counter Divider', 'Synchronous counter dividers', '同一個 clock、combinational next-state、state 同時更新；critical path 由 counter logic 決定。', () => import('./m1/l3-sync')),
    ],
  },
  {
    id: 2,
    title: 'Divide-by-3 與非 2 次方 Divider',
    titleEn: 'Divide-by-3 and non-power-of-two dividers',
    description: '用 state machine 設計 /3；unused state、illegal state 復原、odd divider 的 50% duty。',
    lessons: [
      L('m2-l1-div3', 2, 1, '用 State Machine 做 Divide-by-3', 'Divide-by-3 as a state machine', '00→01→10→00；為什麼要兩個 bit、unused state 會怎樣、output decode、duty cycle 不是 50%。', () => import('./m2/l1-div3')),
      L('m2-l2-odd-50', 2, 2, 'Odd Divider 與 50% Duty Cycle', 'Odd dividers and 50% duty', '為什麼奇數除頻的 50% duty 比較難、rising + falling edge 方法、隨之而來的 timing 與 glitch 風險。', () => import('./m2/l2-odd-50')),
    ],
  },
  {
    id: 3,
    title: 'Dual-Modulus Divider',
    titleEn: 'Dual-modulus dividers',
    description: '/2 /3 cell：同一個 output edge 起點連續執行 2T 或 3T；MOD timing deadline；/1 /2 的 edge scheduling。',
    lessons: [
      L('m3-l1-dm-concept', 3, 1, '什麼是 /2 /3 Dual-Modulus Divider', 'What a /2 /3 dual-modulus divider really is', '不是「跑兩個 divider 再 MUX」：state-continuous 與 MUX-select 兩種架構的波形比較。', () => import('./m3/l1-dm-concept')),
      L('m3-l2-dm-cell', 3, 2, '/2 /3 Cell 的 State Analysis', 'State analysis of the /2 /3 cell', 'gate-level、next-state equations、MOD=0/1 的 sequence、逐 edge 切換 MOD、MOD 最晚何時穩定。', () => import('./m3/l2-dm-cell')),
      L('m3-l3-div12', 3, 3, '/1 /2 Dual-Modulus Concept', 'The /1 /2 dual-modulus concept', 'edge pass-through 與 skip 一個 edge；output pulse ≠ output edge；避免 combinational clock gating glitch。', () => import('./m3/l3-div12')),
    ],
  },
  {
    id: 4,
    title: 'Multi-Modulus Divider',
    titleEn: 'Multi-modulus dividers (MMD)',
    description: '兩級 /2 /3 cell 串接；modulus-out 回傳；N = 4 + 2p1 + p0；MMD 的各類 critical path。',
    lessons: [
      L('m4-l1-mmd', 4, 1, '兩級 /2 /3 Cell 可以產生什麼除數', 'What two cascaded /2 /3 cells can divide by', '用波形與數學推導 divide range 與 resolution；modulus-out 如何回頭影響前級；control 的 timing deadline。', () => import('./m4/l1-mmd')),
      L('m4-l2-mmd-cp', 4, 2, 'MMD 的 Critical Path', 'Critical paths inside an MMD', '六類路徑：local Q→D、modulus-out→MOD、MOD decode→D、output decode、reset、pulse width；Critical Path Highlighter。', () => import('./m4/l2-mmd-cp')),
    ],
  },
  {
    id: 5,
    title: 'Phase MUX Divider',
    titleEn: 'Phase-MUX dividers',
    description: '8-phase VCO 的 phase selection、wrap-around carry、PMUX glitch 與 safe switching window、PMUX + /N/N+1 架構比較。',
    lessons: [
      L('m5-l1-phase', 5, 1, '多相 Clock 與 Phase Selection', 'Multi-phase clocks and phase selection', 'phase spacing = Tvco/8；forward / backward rotation；7→0 的 integer carry；phase rotation 與 divide ratio。', () => import('./m5/l1-phase')),
      L('m5-l2-pmux-glitch', 5, 2, 'PMUX 的 Glitch 與 Safe Switching Window', 'PMUX glitches and the safe switching window', '為什麼不能任意切 select；short pulse、missing pulse、double edge；拖曳 select 時間看 runt。', () => import('./m5/l2-pmux-glitch')),
      L('m5-l3-pmux-arch', 5, 3, 'PMUX + /N/N+1 Divider', 'PMUX + /N/N+1 architectures', 'PMUX→fixed、PMUX→/N/N+1、/N/N+1→PMUX 三種架構的 phase continuity、latency、critical path、jitter、glitch trade-off。', () => import('./m5/l3-pmux-arch')),
    ],
  },
  {
    id: 6,
    title: 'Fractional Divider、DSM 與 DTC',
    titleEn: 'Fractional division, DSM and DTC',
    description: '平均除數、edge error、fractional spur；DSM 重新分布 quantization noise；PMUX + DTC 的 coarse/fine 與 carry。',
    lessons: [
      L('m6-l1-frac', 6, 1, 'Fractional Divide Ratio 的基本概念', 'Fractional divide ratio basics', '2,3,3,3 序列的平均除數、instantaneous vs average、periodic pattern → spur、edge error 與 phase error。', () => import('./m6/l1-frac')),
      L('m6-l2-dsm', 6, 2, 'DSM 的角色', 'The role of the delta-sigma modulator', 'DSM 讓長期平均正確而非每 cycle 正確；noise shaping；tone 與 dither；peak-to-peak 與 RMS 不一定同時改善。', () => import('./m6/l2-dsm')),
      L('m6-l3-dtc', 6, 3, 'DTC、PHOS 與 Residual Phase', 'DTC, phase-offset selection and residual phase', '粗調 PMUX、中調 divider、細調 DTC；3-bit + 6-bit control word；overflow carry vs divider interval 不能直接畫等號。', () => import('./m6/l3-dtc')),
    ],
  },
  {
    id: 7,
    title: 'Critical Path 專題',
    titleEn: 'Critical path deep dive',
    description: 'launch / capture、arrival / required / slack、從陌生電路找 critical path 的十步流程、divider 特有路徑、setup/hold/pulse width、transistor-level speed。',
    lessons: [
      L('m7-l1-cp-basics', 7, 1, '什麼是 Critical Path', 'What a critical path is', 'launch FF → logic → capture FF；tCQ、setup、skew、jitter、margin、slack；用 50 ps 的具體數字算一次。', () => import('./m7/l1-cp-basics')),
      L('m7-l2-cp-method', 7, 2, '如何從陌生電路找 Critical Path', 'Finding the critical path in an unfamiliar circuit', '十步流程：sequential elements → launch → capture → cone → sensitization → delay → slack → hold → pulse width / recovery / removal。', () => import('./m7/l2-cp-method')),
      L('m7-l3-divider-paths', 7, 3, 'Divider 特有的 Timing Path', 'Divider-specific timing paths', '案例 A–F：/2 inverter、programmable MUX、MOD path、MMD carry、PMUX select、divider → downstream；區分 Fmax / interface / loop latency / multicycle / generated clock。', () => import('./m7/l3-divider-paths')),
      L('m7-l4-setup-hold-pw', 7, 4, 'Setup、Hold 與 Pulse Width', 'Setup, hold and pulse width', '三個互動 demo；setup 是來不及、hold 是太早、pulse width 是 clock 太窄；PMUX 與 clock gating 要查 runt。', () => import('./m7/l4-setup-hold-pw')),
      L('m7-l5-transistor', 7, 5, 'Critical Path 與 Transistor-Level Speed', 'Critical path at the transistor level', 'drive strength、stack、fanout、寄生電容、dynamic / CML / TSPC；區分 gate-level STA 與 analog regeneration / metastability。', () => import('./m7/l5-transistor')),
    ],
  },
  {
    id: 8,
    title: 'Reset、Startup 與 Illegal State',
    titleEn: 'Reset, startup and illegal states',
    description: '上電初值不保證、X state、reachable / illegal / lock-up、self-starting、reset release 的 recovery/removal、self-recovering 設計。',
    lessons: [
      L('m8-l1-reset', 8, 1, 'Divider 為什麼需要 Reset', 'Why dividers need reset', '從任意 state 啟動看會不會回到合法循環；lock-up state；reset release timing 與 recovery/removal check。', () => import('./m8/l1-reset')),
      L('m8-l2-self-recover', 8, 2, '如何設計 Self-Recovering State Machine', 'Designing a self-recovering state machine', '先讓有 illegal state 的 divider 失敗，再改 next-state logic 讓它 1–2 cycle 回到主循環；比較邏輯、速度、面積、功耗。', () => import('./m8/l2-self-recover')),
    ],
  },
]

export const allLessons: LessonMeta[] = modules.flatMap((m) => m.lessons)

export function findLesson(id: string): LessonMeta | undefined {
  return allLessons.find((l) => l.id === id)
}
export function findModule(id: number): ModuleMeta | undefined {
  return modules.find((m) => m.id === id)
}
export function lessonIndex(id: string): number {
  return allLessons.findIndex((l) => l.id === id)
}
export function prevNext(id: string): { prev?: LessonMeta; next?: LessonMeta } {
  const i = lessonIndex(id)
  return { prev: i > 0 ? allLessons[i - 1] : undefined, next: i >= 0 && i < allLessons.length - 1 ? allLessons[i + 1] : undefined }
}
