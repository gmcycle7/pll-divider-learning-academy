/** 一階 (MASH-1) 與二階 (MASH-1-1) delta-sigma modulator 的簡單整數實作 */

export interface DsmOptions {
  /** 分數輸入 K / M（0 ≤ K < M） */
  k: number
  m: number
  order: 1 | 2
  length: number
  /** dither：在 LSB 加 ±1 的 pseudo-random 值（deterministic LCG，seed 固定） */
  dither?: boolean
  seed?: number
}

export interface DsmResult {
  /** 每個 cycle 的 carry / 除數增量（一階為 0/1；二階為 −1..2） */
  deltas: number[]
  average: number
  /** 一階 accumulator 殘值（顯示 quantization error） */
  residues: number[]
}

function lcg(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function runDsm(opts: DsmOptions): DsmResult {
  const { k, m, order, length } = opts
  const rnd = lcg(opts.seed ?? 12345)
  const deltas: number[] = []
  const residues: number[] = []
  let acc1 = 0
  let acc2 = 0
  let c2prev = 0
  for (let i = 0; i < length; i++) {
    let x = k
    if (opts.dither) x += rnd() < 0.5 ? -1 : 1
    x = Math.max(0, Math.min(m - 1, x))
    acc1 += x
    let c1 = 0
    if (acc1 >= m) {
      acc1 -= m
      c1 = 1
    }
    residues.push(acc1)
    if (order === 1) {
      deltas.push(c1)
      continue
    }
    acc2 += acc1
    let c2 = 0
    if (acc2 >= m) {
      acc2 -= m
      c2 = 1
    }
    // MASH-1-1：y = c1 + c2 − c2(z^-1)
    deltas.push(c1 + c2 - c2prev)
    c2prev = c2
  }
  const average = deltas.reduce((a, b) => a + b, 0) / (deltas.length || 1)
  return { deltas, average, residues }
}
