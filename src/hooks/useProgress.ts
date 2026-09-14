import { useCallback, useEffect, useState } from 'react'

export interface LessonProgress {
  read?: boolean
  quizScore?: number
  quizTotal?: number
  exerciseDone?: boolean
  hintsUsed?: number
  lastSection?: string
  updatedAt?: number
}
export type ProgressMap = Record<string, LessonProgress>

const KEY = 'pdla.progress.v1'
const listeners = new Set<() => void>()

function read(): ProgressMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as ProgressMap
  } catch {
    /* ignore */
  }
  return {}
}
function write(p: ProgressMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l())
}

export function useProgress() {
  const [progress, setProgress] = useState<ProgressMap>(read)
  useEffect(() => {
    const fn = () => setProgress(read())
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  const update = useCallback((lessonId: string, patch: Partial<LessonProgress>) => {
    const cur = read()
    const next = { ...cur, [lessonId]: { ...(cur[lessonId] ?? {}), ...patch, updatedAt: Date.now() } }
    write(next)
  }, [])
  const reset = useCallback(() => write({}), [])
  return { progress, update, reset }
}

export function lessonStatus(p?: LessonProgress): 'none' | 'partial' | 'done' {
  if (!p) return 'none'
  const quizOk = p.quizTotal ? (p.quizScore ?? 0) >= Math.ceil(p.quizTotal * 0.6) : false
  if (p.read && quizOk) return 'done'
  if (p.read || p.quizTotal || p.exerciseDone) return 'partial'
  return 'none'
}

/** 通用 localStorage state hook */
export function useLocalState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [val, setVal] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) return JSON.parse(raw) as T
    } catch {
      /* ignore */
    }
    return initial
  })
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setVal((prev) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
        try {
          localStorage.setItem(key, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    [key],
  )
  return [val, set]
}
