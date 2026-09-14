/** PMUX（coarse）+ DTC（fine）的 phase control word 模型 */

export interface DtcConfig {
  coarseBits: number // 3 → 8 phases
  fineBits: number // 6 → 64 DTC codes per phase step
}

export interface DtcSplit {
  total: number
  coarse: number
  fine: number
  /** total 超過 (2^(coarse+fine) − 1) 時的 overflow（wrap 次數） */
  overflow: number
  /** 以 Tvco 為單位的 edge 位置（不含 integer cycles） */
  phaseT: number
}

export function splitCode(total: number, cfg: DtcConfig): DtcSplit {
  const fineMod = 1 << cfg.fineBits
  const coarseMod = 1 << cfg.coarseBits
  const full = fineMod * coarseMod
  const overflow = Math.floor(total / full)
  const wrapped = ((total % full) + full) % full
  const coarse = Math.floor(wrapped / fineMod)
  const fine = wrapped % fineMod
  return { total, coarse, fine, overflow, phaseT: wrapped / full }
}

/**
 * 累加式 phase control：每個 output 週期加上 increment（9-bit 單位），
 * 回傳每步的 coarse / fine / carry-from-fine / wrap carry。
 */
export interface DtcStep {
  k: number
  accumulator: number
  coarse: number
  fine: number
  /** fine 累加溢位進入 coarse */
  fineCarry: number
  /** coarse 累加溢位（phase index wrap）→ integer carry */
  coarseCarry: number
  /** 理想 phase（連續值，Tvco 單位） */
  idealPhaseT: number
  /** 量化 phase（Tvco 單位） */
  quantizedPhaseT: number
  /** residual = quantized − ideal */
  residualT: number
}

export function accumulate(increment: number, cfg: DtcConfig, steps: number, fractionalIdeal?: number): DtcStep[] {
  const fineMod = 1 << cfg.fineBits
  const coarseMod = 1 << cfg.coarseBits
  const full = fineMod * coarseMod
  const out: DtcStep[] = []
  let acc = 0
  let coarse = 0
  let fine = 0
  for (let k = 0; k < steps; k++) {
    const nextAcc = acc + increment
    // 數位進位：fine 先加，溢位進 coarse；coarse 溢位成 integer carry
    const fineSum = fine + increment
    const fineCarry = Math.floor(fineSum / fineMod)
    fine = ((fineSum % fineMod) + fineMod) % fineMod
    const coarseSum = coarse + fineCarry
    const coarseCarry = Math.floor(coarseSum / coarseMod)
    coarse = ((coarseSum % coarseMod) + coarseMod) % coarseMod
    const wrapped = coarse * fineMod + fine
    const ideal = fractionalIdeal !== undefined ? ((k + 1) * fractionalIdeal) % 1 : nextAcc / full - Math.floor(nextAcc / full)
    const quant = wrapped / full
    out.push({
      k: k + 1,
      accumulator: nextAcc,
      coarse,
      fine,
      fineCarry,
      coarseCarry,
      idealPhaseT: ideal,
      quantizedPhaseT: quant,
      residualT: quant - ideal,
    })
    acc = nextAcc
  }
  return out
}

/** DTC 的 quantization step（Tvco 單位） */
export function dtcStep(cfg: DtcConfig): number {
  return 1 / ((1 << cfg.coarseBits) * (1 << cfg.fineBits))
}
