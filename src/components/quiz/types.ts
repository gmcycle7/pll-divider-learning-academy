import type { SignalTrace } from '@/models/divider/types'
import type { Schematic, SchematicHighlight } from '@/components/circuit/schematic'

interface QuizBase {
  id: string
  prompt: string
  explanation: string
  /** 顯示在題目前的補充（例如波形或電路） */
  context?: { traces?: SignalTrace[]; tEnd?: number; period?: number; schematic?: Schematic }
}

export interface SingleChoice extends QuizBase {
  type: 'single'
  options: string[]
  answer: number
}
export interface MultipleChoice extends QuizBase {
  type: 'multiple'
  options: string[]
  answers: number[]
}
export interface NumericQ extends QuizBase {
  type: 'numeric'
  answer: number
  tolerance?: number
  unit?: string
}
export interface StatePrediction extends QuizBase {
  type: 'state'
  /** 期望的 bit-string，例如 '10' */
  answer: string
  width: number
  bitNames?: string[]
}
export interface WaveformPrediction extends QuizBase {
  type: 'waveform'
  /** 每個選項是一組 traces */
  options: { label: string; traces: SignalTrace[] }[]
  answer: number
  tEnd: number
  period?: number
}
export interface CriticalPathSelect extends QuizBase {
  type: 'critical-path'
  schematic: Schematic
  options: { label: string; highlight: SchematicHighlight; description?: string }[]
  answer: number
}

export type QuizQuestion = SingleChoice | MultipleChoice | NumericQ | StatePrediction | WaveformPrediction | CriticalPathSelect
