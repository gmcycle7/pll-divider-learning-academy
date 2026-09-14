import { useCallback, useEffect, useState } from 'react'

export type ExplainMode = 'beginner' | 'engineer' | 'deep'
export const MODE_LABEL: Record<ExplainMode, string> = { beginner: '初學者', engineer: '工程師', deep: '深入' }
export const MODE_DESC: Record<ExplainMode, string> = {
  beginner: '只講直覺、逐 edge 行為與簡單波形',
  engineer: '加上 state equation、timing equation、RTL 與電路路徑',
  deep: '再加上高速實作、glitch、clock-to-Q、setup/hold、pulse width、PVT、jitter margin',
}
export function modeRank(m: ExplainMode) {
  return m === 'beginner' ? 0 : m === 'engineer' ? 1 : 2
}
const KEY = 'pdla.mode'
const listeners = new Set<() => void>()
function read(): ExplainMode {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'beginner' || v === 'engineer' || v === 'deep') return v
  } catch {
    /* ignore */
  }
  return 'engineer'
}

export function useExplainMode() {
  const [mode, setModeState] = useState<ExplainMode>(read)
  useEffect(() => {
    const fn = () => setModeState(read())
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }, [])
  const setMode = useCallback((m: ExplainMode) => {
    try {
      localStorage.setItem(KEY, m)
    } catch {
      /* ignore */
    }
    listeners.forEach((l) => l())
  }, [])
  return { mode, setMode }
}
