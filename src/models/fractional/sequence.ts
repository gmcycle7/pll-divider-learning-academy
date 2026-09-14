/** Fractional divider 序列分析（數學正確、非 RF simulator 精度） */

export interface SequenceAnalysis {
  sequence: number[]
  average: number
  /** 每個 output edge 的實際時間（以 Tin 為單位） */
  edgeTimes: number[]
  /** 理想（平均除數）edge 時間 */
  idealTimes: number[]
  /** edge time error（Tin）= actual − ideal */
  edgeError: number[]
  /** 相位誤差（以 output 週期為單位的 2π 比例）：error / average */
  phaseErrorCycles: number[]
  /** accumulated quantization error（Tin）：Σ (N_k − N_avg) */
  accumulated: number[]
  peakToPeak: number
  rms: number
}

export function analyzeSequence(seq: number[]): SequenceAnalysis {
  const n = seq.length
  const average = n ? seq.reduce((a, b) => a + b, 0) / n : 0
  const edgeTimes: number[] = [0]
  for (const k of seq) edgeTimes.push(edgeTimes[edgeTimes.length - 1] + k)
  const idealTimes = edgeTimes.map((_, i) => i * average)
  const edgeError = edgeTimes.map((t, i) => t - idealTimes[i])
  const phaseErrorCycles = edgeError.map((e) => (average ? e / average : 0))
  const accumulated: number[] = []
  let acc = 0
  for (const k of seq) {
    acc += k - average
    accumulated.push(acc)
  }
  const errs = edgeError.slice(1)
  const peakToPeak = errs.length ? Math.max(...errs) - Math.min(...errs) : 0
  const rms = errs.length ? Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / errs.length) : 0
  return { sequence: seq, average, edgeTimes, idealTimes, edgeError, phaseErrorCycles, accumulated, peakToPeak, rms }
}

/** 簡單 DFT（magnitude）用於 spur 概念圖；輸入為 edge error 序列 */
export function dftMagnitude(x: number[], bins?: number): { freq: number[]; mag: number[] } {
  const N = x.length
  const B = bins ?? Math.floor(N / 2) + 1
  const freq: number[] = []
  const mag: number[] = []
  const mean = N ? x.reduce((a, b) => a + b, 0) / N : 0
  for (let k = 0; k < B; k++) {
    let re = 0
    let im = 0
    for (let n = 0; n < N; n++) {
      const ang = (-2 * Math.PI * k * n) / N
      re += (x[n] - mean) * Math.cos(ang)
      im += (x[n] - mean) * Math.sin(ang)
    }
    freq.push(k / N)
    mag.push(Math.sqrt(re * re + im * im) / N)
  }
  return { freq, mag }
}

/** 由平均除數（N + f）產生最簡週期序列：例如 2.75 → 2,3,3,3 */
export function simplePatternFor(nInt: number, num: number, den: number): number[] {
  // Bresenham-like accumulator（等效一階 DSM 無 dither）
  const seq: number[] = []
  let acc = 0
  for (let i = 0; i < den; i++) {
    acc += num
    if (acc >= den) {
      acc -= den
      seq.push(nInt + 1)
    } else seq.push(nInt)
  }
  return seq
}

export function parseSequence(text: string): number[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((x) => Number.isFinite(x) && x > 0)
}
