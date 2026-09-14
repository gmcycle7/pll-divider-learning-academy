/** 把時間格式化成相對於 T 的倍數，例如 2.5T；period 未給則顯示原始數字 */
export function fmtT(t: number, period?: number, digits = 2): string {
  if (!period) return fmtNum(t)
  const r = t / period
  const rounded = Math.round(r * 1000) / 1000
  if (Number.isInteger(rounded)) return `${rounded}T`
  return `${trimZeros(rounded.toFixed(digits))}T`
}

export function fmtNum(x: number, digits = 2): string {
  if (Number.isInteger(x)) return String(x)
  return trimZeros(x.toFixed(digits))
}

export function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s
}

export function fmtPs(x: number, digits = 1): string {
  return `${fmtNum(x, digits)} ps`
}

export function pct(x: number, digits = 1): string {
  return `${fmtNum(x * 100, digits)}%`
}
