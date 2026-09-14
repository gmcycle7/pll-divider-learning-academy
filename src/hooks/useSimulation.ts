import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DividerSim } from '@/models/divider/engine'
import type { Bit, Netlist, SimOptions, StepRecord, Values } from '@/models/divider/types'

export interface UseSimulationOptions extends SimOptions {
  /** 初始自動推進的 edge 數 */
  prerun?: number
}

/**
 * 互動式模擬：Next / Prev / Reset / AutoPlay。
 * Prev 以「重新從 reset 跑 n−1 步」實作（deterministic），input 歷史保留。
 */
export function useSimulation(netlist: Netlist, opts: UseSimulationOptions = {}) {
  const optKey = JSON.stringify({ ...opts, id: netlist.id })
  const [, force] = useState(0)
  const simRef = useRef<DividerSim | null>(null)
  const historyRef = useRef<Values[]>([]) // inputs used for each step
  const [pendingInputs, setPendingInputs] = useState<Values>({})
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1) // steps per second
  const [initialState, setInitialState] = useState<Values | undefined>(opts.initialState)

  const build = useCallback(
    (steps: Values[], init?: Values) => {
      const sim = new DividerSim(netlist, { ...opts, initialState: init })
      for (const inp of steps) {
        for (const [k, v] of Object.entries(inp)) sim.setInput(k, v)
        sim.stepEdge()
      }
      return sim
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [optKey],
  )

  // (re)initialize when netlist/opts change
  useEffect(() => {
    historyRef.current = []
    simRef.current = build([], initialState)
    const pre = opts.prerun ?? 0
    for (let i = 0; i < pre; i++) {
      const inp: Values = {}
      historyRef.current.push(inp)
      simRef.current.stepEdge()
    }
    setPendingInputs({})
    force((x) => x + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build, initialState])

  const sim = simRef.current ?? build([], initialState)
  if (!simRef.current) simRef.current = sim

  const next = useCallback(() => {
    const s = simRef.current!
    const inp = { ...pendingInputs }
    for (const [k, v] of Object.entries(inp)) s.setInput(k, v)
    historyRef.current.push(inp)
    s.stepEdge()
    force((x) => x + 1)
  }, [pendingInputs])

  const prev = useCallback(() => {
    if (historyRef.current.length === 0) return
    historyRef.current = historyRef.current.slice(0, -1)
    simRef.current = build(historyRef.current, initialState)
    force((x) => x + 1)
  }, [build, initialState])

  const reset = useCallback(
    (init?: Values) => {
      historyRef.current = []
      setInitialState(init)
      simRef.current = build([], init)
      setPendingInputs({})
      setPlaying(false)
      force((x) => x + 1)
    },
    [build],
  )

  const setInput = useCallback((name: string, v: Bit) => {
    setPendingInputs((p) => ({ ...p, [name]: v }))
  }, [])

  const runTo = useCallback(
    (n: number) => {
      const s = simRef.current!
      while (s.edgeIndex < n) {
        const inp = { ...pendingInputs }
        for (const [k, v] of Object.entries(inp)) s.setInput(k, v)
        historyRef.current.push(inp)
        s.stepEdge()
      }
      force((x) => x + 1)
    },
    [pendingInputs],
  )

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => next(), Math.max(80, 1000 / speed))
    return () => clearInterval(id)
  }, [playing, speed, next])

  const records: StepRecord[] = sim.records
  const current = records[records.length - 1]
  const effectiveInputs = useMemo(() => sim.getEffectiveInputs(), [sim, pendingInputs, records.length])

  return {
    sim,
    records,
    current,
    edgeIndex: sim.edgeIndex,
    values: sim.getValues(),
    state: sim.getState(),
    stateString: sim.getStateString(),
    traces: sim.getTraces(),
    period: sim.period,
    time: sim.time,
    next,
    prev,
    reset,
    runTo,
    setInput,
    pendingInputs,
    effectiveInputs,
    playing,
    setPlaying,
    speed,
    setSpeed,
    canPrev: records.length > 0,
  }
}

export type Simulation = ReturnType<typeof useSimulation>
