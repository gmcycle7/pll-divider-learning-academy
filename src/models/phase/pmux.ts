/** 多相 clock phase selection 模型 */

export interface PhaseState {
  /** 目前 phase index 0..M-1 */
  index: number
  /** 累積的 integer carry（跨過 wrap-around 的次數，forward +1 / backward −1） */
  carry: number
}

export interface PhaseStep {
  from: number
  to: number
  direction: 'forward' | 'backward'
  /** 是否跨過 boundary（7→0 或 0→7） */
  wrapped: boolean
  carry: number
  /** 這一步造成的 edge 時間位移（以 Tvco 為單位） */
  deltaT: number
}

export function rotate(state: PhaseState, phases: number, steps: number): { state: PhaseState; step: PhaseStep } {
  const dir: PhaseStep['direction'] = steps >= 0 ? 'forward' : 'backward'
  const raw = state.index + steps
  const to = ((raw % phases) + phases) % phases
  const carry = Math.floor(raw / phases)
  return {
    state: { index: to, carry: state.carry + carry },
    step: { from: state.index, to, direction: dir, wrapped: carry !== 0, carry, deltaT: steps / phases },
  }
}

/** 第 k 個 output edge 時間（Tvco 單位）：integer part（divider 累積）+ phase index / M */
export function edgeTime(k: number, integerCycles: number, phaseIndex: number, phases: number): number {
  return k * integerCycles + phaseIndex / phases
}

/**
 * 產生 phase-rotating 輸出 edge 序列：每個 output 週期 divider 走 N 個 Tvco，
 * 再把 phase 往前轉 step 個 phase。等效平均除數 N + step/M。
 */
export function rotatingEdges(N: number, step: number, phases: number, count: number): { times: number[]; indices: number[]; carries: number[] } {
  const times: number[] = []
  const indices: number[] = []
  const carries: number[] = []
  let st: PhaseState = { index: 0, carry: 0 }
  let base = 0
  for (let k = 0; k < count; k++) {
    times.push(base + st.index / phases)
    indices.push(st.index)
    const r = rotate(st, phases, step)
    carries.push(r.step.carry)
    // divider 每個 output 週期走 N cycle；wrap 時 integer carry 併入
    base += N + r.step.carry
    st = r.state
  }
  return { times, indices, carries }
}

/** 產生多相 clock 的 rising edge 時間（Tvco 單位）給波形 */
export function phaseClockEvents(phases: number, cycles: number, phaseIndex: number): { t: number; v: 0 | 1 }[] {
  const ev: { t: number; v: 0 | 1 }[] = [{ t: 0, v: 0 }]
  const off = phaseIndex / phases
  for (let n = 0; n < cycles; n++) {
    ev.push({ t: n + off, v: 1 })
    ev.push({ t: n + off + 0.5, v: 0 })
  }
  return ev
}

/**
 * MUX 切換 select 時的輸出：在切換時刻前用 phase a，之後用 phase b；回傳輸出 events 與第一個 runt。
 * runt 的掃描會跳過 t = 0 起算的第一段（那只是起始殘段，不是 pulse），與 lessons/m5 的 firstRunt 一致。
 */
export function muxSwitchOutput(
  phases: number,
  a: number,
  b: number,
  tSwitch: number,
  cycles: number,
  minPulse: number,
): { events: { t: number; v: 0 | 1 }[]; runt: { t0: number; t1: number; width: number } | null } {
  const evA = phaseClockEvents(phases, cycles, a)
  const evB = phaseClockEvents(phases, cycles, b)
  const valueAt = (ev: { t: number; v: 0 | 1 }[], t: number) => {
    let v: 0 | 1 = 0
    for (const e of ev) if (e.t <= t + 1e-12) v = e.v
    return v
  }
  const out: { t: number; v: 0 | 1 }[] = [{ t: 0, v: 0 }]
  let cur: 0 | 1 = 0
  const push = (t: number, v: 0 | 1) => {
    if (v !== cur) {
      out.push({ t, v })
      cur = v
    }
  }
  const all = [...evA.filter((e) => e.t < tSwitch), { t: tSwitch, v: valueAt(evB, tSwitch) }, ...evB.filter((e) => e.t > tSwitch)].sort((x, y) => x.t - y.t)
  for (const e of all) push(e.t, e.v)
  let runt: { t0: number; t1: number; width: number } | null = null
  for (let i = 1; i < out.length; i++) {
    // 略過從 t = 0 開始的那一段：波形起點到第一個 edge 只是「ph_a 這個週期還沒升起」的殘段，
    // 不是切換造成的 pulse。a > 0 時它寬 a/M（< minPulse 很常見），算進去會是假陽性。
    if (out[i - 1].t <= 1e-12) continue
    const w = out[i].t - out[i - 1].t
    if (w > 1e-12 && w < minPulse - 1e-12) {
      runt = { t0: out[i - 1].t, t1: out[i].t, width: w }
      break
    }
  }
  return { events: out, runt }
}
