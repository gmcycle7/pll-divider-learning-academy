import type { ComponentType } from 'react'
import type { Netlist, SimOptions } from '@/models/divider/types'
import type { Schematic } from '@/components/circuit/schematic'
import type { TimingScenario } from '@/models/timing/types'

export interface LabExercise {
  id: string
  order: number
  title: string
  /** 1（最簡單）～5 */
  difficulty: 1 | 2 | 3 | 4 | 5
  summary: string
  /** 可模擬的 netlist（題目頁面提供互動模擬，但不顯示 equations） */
  netlist: Netlist
  /** 題目電路圖（不標 critical path） */
  schematic: Schematic
  simOptions?: SimOptions
  /** 15 題工作紙的參考答案 */
  reference: Record<string, string>
  /** 三級提示 */
  hints: [string, string, string]
  /** 完整解答（可含互動元件） */
  Solution: ComponentType
  /** 解答用的 critical path scenario */
  criticalPath?: TimingScenario
  /** 題目說明（給使用者的題幹） */
  Prompt?: ComponentType
}
