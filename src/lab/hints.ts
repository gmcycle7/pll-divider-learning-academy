import type { Netlist, SimOptions } from '@/models/divider/types'
import { simulate } from '@/models/divider/engine'
import { measureDivide } from '@/models/divider/analysis'
import { WORKSHEET_QUESTIONS } from '@/components/lab/worksheet'

/** 已解鎖的提示層級：0 = 尚未用提示，3 = 三個提示都看過 */
export type HintLevel = 0 | 1 | 2 | 3

export const HINT_TITLES: [string, string, string] = [
  'Hint 1：先看哪一個 block',
  'Hint 2：部分 next-state equation',
  'Hint 3：模擬器逐 edge 產生的前兩個 output 週期',
]

export const HINT_DESC: [string, string, string] = [
  '只告訴你從哪裡下手，不告訴你答案。',
  '給你一部分 D input 方程式與前一、兩個 edge 的代入示範。',
  '直接把 state table 攤開：對照你手推的結果，找出哪一個 edge 推錯了。',
]

/** progress 的 key：`lab-<exerciseId>` */
export function labProgressKey(exerciseId: string): string {
  return `lab-${exerciseId}`
}

export function clampHint(n: number | undefined): HintLevel {
  if (!n || n <= 0) return 0
  if (n >= 3) return 3
  return n as HintLevel
}

/**
 * Hint 3 需要跑幾個 edge，才涵蓋「第一個 output rising edge」之後兩個完整的 output 週期。
 * 先跑一段長度足夠的模擬量測 divide ratio，再算 k = (第一個 rising edge 的 edge index) + 2 × ratio。
 * 量不到 ratio（例如 output 恆定）時退回 12。
 */
export function edgesForTwoOutputPeriods(netlist: Netlist, opts?: SimOptions, probeEdges = 48): number {
  const period = opts?.period ?? 100
  const { traces } = simulate(netlist, probeEdges, { ...opts, period })
  const out = traces.find((t) => t.name === netlist.output)
  if (!out) return 12
  const m = measureDivide(out, period)
  if (m.ratio === null || m.risingTimes.length === 0) return 12
  const firstRisingEdge = Math.ceil(m.risingTimes[0] / period - 1e-9)
  const k = Math.ceil(firstRisingEdge + 2 * m.ratio)
  return Math.max(4, Math.min(k, probeEdges))
}

/** 工作紙已填幾題（讀 DividerAnalysisWorksheet 存在 localStorage 的內容） */
export function worksheetFilledCount(storageKey: string): number {
  try {
    const raw = localStorage.getItem(`pdla.worksheet.${storageKey}`)
    if (!raw) return 0
    const obj = JSON.parse(raw) as Record<string, string>
    return WORKSHEET_QUESTIONS.filter((q) => (obj[q.key] ?? '').trim().length > 0).length
  } catch {
    return 0
  }
}

export const WORKSHEET_TOTAL = WORKSHEET_QUESTIONS.length

export function difficultyStars(d: number): string {
  return '★'.repeat(d) + '☆'.repeat(Math.max(0, 5 - d))
}
