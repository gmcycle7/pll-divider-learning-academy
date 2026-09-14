import type { BudgetItem, HoldResult, PulseWidthResult, SetupResult, TimingEnv, TimingPath } from './types'

/**
 * Setup check（launch edge → capture edge）
 *
 * arrival  = launch clock arrival (0) + Σ max delay（tCQ + logic + wire + mux）
 * required = capture clock arrival (skew) + period·cycles·fraction − tsetup − jitter − margin
 * slack    = required − arrival
 *
 * skew 定義：capture clock 到達時間 − launch clock 到達時間（正值 = capture 較晚到，setup 變寬鬆、hold 變嚴格）
 */
export function analyzeSetup(path: TimingPath, env: TimingEnv): SetupResult {
  const cycles = path.cycles ?? 1
  const fraction = path.periodFraction ?? 1
  const tsetup = path.capture.setup ?? 0
  const dataSegs = path.segments.filter((s) => s.kind !== 'setup' && s.kind !== 'hold')
  const dataDelay = dataSegs.reduce((a, s) => a + s.max, 0)
  const arrival = dataDelay
  const available = env.period * cycles * fraction
  const required = env.skew + available - tsetup - env.jitter - env.margin
  const slack = required - arrival
  const breakdown: BudgetItem[] = [
    ...dataSegs.map<BudgetItem>((s) => ({ key: s.id, label: s.label, value: s.max, kind: s.kind })),
    { key: 'setup', label: 'tsetup', value: tsetup, kind: 'setup' },
    { key: 'jitter', label: 'jitter', value: env.jitter, kind: 'jitter' },
    { key: 'margin', label: 'margin', value: env.margin, kind: 'margin' },
  ]
  if (env.skew !== 0) breakdown.push({ key: 'skew', label: 'skew', value: -env.skew, kind: 'skew' })
  breakdown.push({ key: 'slack', label: 'slack', value: slack, kind: 'slack' })
  const tclkMin = (arrival + tsetup + env.jitter + env.margin - env.skew) / (cycles * fraction)
  return {
    type: 'setup',
    arrival,
    required,
    slack,
    available,
    dataDelay,
    breakdown,
    tclkMin,
    fmax: tclkMin > 0 ? 1 / tclkMin : Infinity,
  }
}

/**
 * Hold check（同一個 edge：launch 之後資料不能太快改變）
 *
 * arrival  = Σ min delay
 * required = skew + thold（capture clock 到得越晚，資料必須撐得越久）
 * slack    = arrival − required
 */
export function analyzeHold(path: TimingPath, env: TimingEnv): HoldResult {
  const thold = path.capture.hold ?? 0
  const dataSegs = path.segments.filter((s) => s.kind !== 'setup' && s.kind !== 'hold')
  const arrival = dataSegs.reduce((a, s) => a + s.min, 0)
  const required = env.skew + thold
  const slack = arrival - required
  const breakdown: BudgetItem[] = [
    ...dataSegs.map<BudgetItem>((s) => ({ key: s.id, label: `${s.label} (min)`, value: s.min, kind: s.kind })),
    { key: 'hold', label: 'thold + skew', value: required, kind: 'hold-req' },
    { key: 'slack', label: 'hold slack', value: slack, kind: 'slack' },
  ]
  return { type: 'hold', arrival, required, slack, breakdown }
}

export function analyzePulseWidth(width: number, minPulse: number): PulseWidthResult {
  return { type: 'pulse-width', width, required: minPulse, slack: width - minPulse }
}

/** 找出一組 path 中 setup slack 最小者（setup / multicycle / interface；hold 與 async 不在此列） */
export function worstSetup(paths: TimingPath[], env: TimingEnv, mode?: string) {
  const candidates = paths.filter((p) => (p.type === 'setup' || p.type === 'multicycle' || p.type === 'interface') && (!p.modes || !mode || p.modes.includes(mode)))
  let worst: { path: TimingPath; result: SetupResult } | null = null
  for (const p of candidates) {
    const r = analyzeSetup(p, env)
    if (!worst || r.slack < worst.result.slack) worst = { path: p, result: r }
  }
  return worst
}

/**
 * 找出一組 path 中 hold slack 最小者。
 *
 * 候選必須與 worstSetup 對稱（setup / multicycle / interface 都要算）：multicycle 與 interface
 * 只是「setup 的可用時間被重新宣告」，hold 檢查完全不受影響——hold 仍然是同一個 edge 的 0-cycle
 * 檢查。把它們排除掉會把「最差 hold」標錯人（例如案例 F 的 iface 15 ps 被 int-fmax 20 ps 蓋過）。
 * recovery / removal 的 required time 是 t_removal 而不是 t_hold，語意不同，仍然另外計算。
 */
export function worstHold(paths: TimingPath[], env: TimingEnv, mode?: string) {
  const candidates = paths.filter(
    (p) => (p.type === 'hold' || p.type === 'setup' || p.type === 'multicycle' || p.type === 'interface') && (!p.modes || !mode || p.modes.includes(mode)),
  )
  let worst: { path: TimingPath; result: HoldResult } | null = null
  for (const p of candidates) {
    const r = analyzeHold(p, env)
    if (!worst || r.slack < worst.result.slack) worst = { path: p, result: r }
  }
  return worst
}

/** 最簡 timing equation：Tclk,min = tCQ + tlogic + tsetup + skew_term + jitter + margin */
export function tclkMin(parts: { tcq: number; logic: number; setup: number; skew?: number; jitter?: number; margin?: number }): number {
  return parts.tcq + parts.logic + parts.setup - (parts.skew ?? 0) + (parts.jitter ?? 0) + (parts.margin ?? 0)
}
