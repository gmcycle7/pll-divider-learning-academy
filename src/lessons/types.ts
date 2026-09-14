import type { ComponentType, ReactNode } from 'react'
import type { QuizQuestion } from '@/components/quiz/types'

export interface LessonExercise {
  title: string
  /** 練習說明（Markdown-like 純文字或 JSX） */
  prompt: ReactNode
  /** 練習互動元件（例如一個未標示的電路 + worksheet） */
  Component?: ComponentType
  /** 自我檢查清單 */
  checklist?: string[]
  /** 參考答案 */
  answer?: ReactNode
}

export interface LessonDef {
  id: string
  module: number
  order: number
  title: string
  titleEn: string
  summary: string
  /** 這一課要解決什麼問題 */
  goals: string[]
  readingMinutes?: number
  Content: ComponentType
  quiz: QuizQuestion[]
  exercise?: LessonExercise
}

export interface LessonMeta {
  id: string
  module: number
  order: number
  title: string
  titleEn: string
  summary: string
  load: () => Promise<{ default: LessonDef }>
}

export interface ModuleMeta {
  id: number
  title: string
  titleEn: string
  description: string
  lessons: LessonMeta[]
}
