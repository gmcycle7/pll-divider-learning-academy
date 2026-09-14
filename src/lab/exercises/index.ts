import type { LabExercise } from '@/lab/types'
import ex1 from './ex1-div2'
import ex2 from './ex2-ripple4'
import ex3 from './ex3-sync4'
import ex4 from './ex4-div3'
import ex5 from './ex5-dm23'
import ex6 from './ex6-mmd2'
import ex7 from './ex7-pmux8'
import ex8 from './ex8-pmux-nn1-dtc'

/** Module 9：8 題陌生 divider reverse engineering，依 order 由淺入深 */
export const exercises: LabExercise[] = [ex1, ex2, ex3, ex4, ex5, ex6, ex7, ex8].sort((a, b) => a.order - b.order)

export function findExercise(id: string): LabExercise | undefined {
  return exercises.find((e) => e.id === id)
}

export function prevNextExercise(id: string): { prev?: LabExercise; next?: LabExercise } {
  const i = exercises.findIndex((e) => e.id === id)
  if (i < 0) return {}
  return { prev: exercises[i - 1], next: exercises[i + 1] }
}
