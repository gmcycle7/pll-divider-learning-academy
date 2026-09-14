import type { Bit, Values } from '@/models/divider/types'

export const not = (b: Bit): Bit => (b ? 0 : 1)
export const and = (...bs: Bit[]): Bit => (bs.every((b) => b === 1) ? 1 : 0)
export const or = (...bs: Bit[]): Bit => (bs.some((b) => b === 1) ? 1 : 0)
export const xor = (a: Bit, b: Bit): Bit => (a !== b ? 1 : 0)
export const nand = (...bs: Bit[]): Bit => not(and(...bs))
export const nor = (...bs: Bit[]): Bit => not(or(...bs))
export const mux = (sel: Bit, in0: Bit, in1: Bit): Bit => (sel ? in1 : in0)
export const bit = (x: number | boolean): Bit => (x ? 1 : 0)

/** 依照 order 把 values 轉成 bit-string（order[0] 為 MSB） */
export function toBitString(values: Values, order: string[]): string {
  return order.map((n) => String(values[n] ?? 0)).join('')
}

/** bit-string → values，order[0] 為 MSB */
export function fromBitString(s: string, order: string[]): Values {
  const v: Values = {}
  order.forEach((n, i) => {
    v[n] = s[i] === '1' ? 1 : 0
  })
  return v
}

export function bitStringToInt(s: string): number {
  return parseInt(s, 2)
}

export function intToBitString(n: number, width: number): string {
  return n.toString(2).padStart(width, '0')
}

export function allStates(width: number): string[] {
  const out: string[] = []
  for (let i = 0; i < 1 << width; i++) out.push(intToBitString(i, width))
  return out
}
