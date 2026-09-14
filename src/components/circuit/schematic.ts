/** LogicDiagram 的資料模型：以資料描述電路圖，由渲染器畫成 SVG */

export type SchElementKind =
  | 'dff'
  | 'tff'
  | 'latch'
  | 'inv'
  | 'buf'
  | 'and'
  | 'nand'
  | 'or'
  | 'nor'
  | 'xor'
  | 'xnor'
  | 'mux2'
  | 'mux4'
  | 'mux8'
  | 'port'
  | 'box'
  | 'text'
  | 'dot'

export interface SchPin {
  name: string
  side: 'left' | 'right' | 'top' | 'bottom'
  /** 0..1 沿該邊的位置 */
  pos: number
  label?: string
}

export interface SchElement {
  id: string
  kind: SchElementKind
  x: number
  y: number
  /** 顯示在符號上方/內部的名稱，如 FF0 */
  label?: string
  /** 內部文字（box 用），或 port 的訊號名 */
  text?: string
  /** gate 輸入數（and/or/… 預設 2） */
  inputs?: number
  /** port 方向 */
  dir?: 'in' | 'out'
  /** box 尺寸 */
  w?: number
  h?: number
  /** box 自訂 pin */
  pins?: SchPin[]
  /** hover 說明 */
  description?: string
  /** 若為 sequential，標示 clock edge */
  edge?: 'rising' | 'falling'
  /** 對應 netlist 中的訊號（顯示 live value 用，例如 flop 的 q） */
  signal?: string
  /** 額外樣式類別 */
  className?: string
  /** 是否畫成 negative-edge（clk pin 加 bubble） */
  negEdge?: boolean
}

export type WireKind = 'clock' | 'data' | 'control' | 'reset' | 'output' | 'feedback'

export interface SchWire {
  id: string
  /** 'elemId.pin' */
  from: string
  to: string
  signal?: string
  kind?: WireKind
  /** 手動指定中間折點（絕對座標） */
  points?: [number, number][]
  label?: string
  /** 標籤放置比例 0..1（沿線） */
  labelAt?: number
  /** 不畫箭頭 */
  noArrow?: boolean
  /** 走線策略：'hv'（先水平後垂直）、'vh'、'auto'（預設）、'direct' */
  route?: 'hv' | 'vh' | 'auto' | 'direct'
}

export interface Schematic {
  width: number
  height: number
  elements: SchElement[]
  wires: SchWire[]
  /** 標題 */
  title?: string
}

export interface SchematicHighlight {
  wires?: string[]
  elements?: string[]
  style: 'setup' | 'hold' | 'async' | 'info'
  /** 在起點/終點顯示的標籤 */
  tags?: { elementOrWire: string; text: string; dx?: number; dy?: number }[]
}

// ---------------------------------------------------------------- geometry
export interface PinPoint {
  x: number
  y: number
  side: 'left' | 'right' | 'top' | 'bottom'
}

export const DFF_W = 64
export const DFF_H = 72
export const GATE_W = 52
export const GATE_H = 40
export const INV_W = 36
export const INV_H = 24
export const MUX_W = 40

export function elementSize(e: SchElement): { w: number; h: number } {
  switch (e.kind) {
    case 'dff':
    case 'tff':
    case 'latch':
      return { w: DFF_W, h: DFF_H }
    case 'inv':
    case 'buf':
      return { w: INV_W, h: INV_H }
    case 'and':
    case 'nand':
    case 'or':
    case 'nor':
    case 'xor':
    case 'xnor':
      return { w: GATE_W, h: Math.max(GATE_H, 14 * (e.inputs ?? 2) + 12) }
    case 'mux2':
      return { w: MUX_W, h: 60 }
    case 'mux4':
      return { w: MUX_W, h: 100 }
    case 'mux8':
      return { w: MUX_W, h: 170 }
    case 'port':
      return { w: 0, h: 0 }
    case 'box':
      return { w: e.w ?? 100, h: e.h ?? 60 }
    case 'text':
      return { w: 0, h: 0 }
    case 'dot':
      return { w: 0, h: 0 }
  }
}

export function pinPoint(e: SchElement, pin: string): PinPoint {
  const { w, h } = elementSize(e)
  const x = e.x
  const y = e.y
  switch (e.kind) {
    case 'dff':
    case 'tff':
    case 'latch': {
      if (pin === 'd' || pin === 't') return { x, y: y + 20, side: 'left' }
      if (pin === 'clk' || pin === 'en') return { x, y: y + 52, side: 'left' }
      if (pin === 'q') return { x: x + w, y: y + 20, side: 'right' }
      if (pin === 'qb') return { x: x + w, y: y + 52, side: 'right' }
      if (pin === 'rstn' || pin === 'rst') return { x: x + w / 2, y: y + h, side: 'bottom' }
      if (pin === 'set') return { x: x + w / 2, y, side: 'top' }
      break
    }
    case 'inv':
    case 'buf': {
      if (pin === 'in0' || pin === 'in') return { x, y: y + h / 2, side: 'left' }
      if (pin === 'out') return { x: x + w, y: y + h / 2, side: 'right' }
      break
    }
    case 'and':
    case 'nand':
    case 'or':
    case 'nor':
    case 'xor':
    case 'xnor': {
      const n = e.inputs ?? 2
      const m = /^in(\d+)$/.exec(pin)
      if (m) {
        const i = Number(m[1])
        const yy = y + (h * (i + 1)) / (n + 1)
        return { x, y: yy, side: 'left' }
      }
      if (pin === 'out') return { x: x + w, y: y + h / 2, side: 'right' }
      break
    }
    case 'mux2':
    case 'mux4':
    case 'mux8': {
      const n = e.kind === 'mux2' ? 2 : e.kind === 'mux4' ? 4 : 8
      const m = /^in(\d+)$/.exec(pin)
      if (m) {
        const i = Number(m[1])
        return { x, y: y + (h * (i + 1)) / (n + 1), side: 'left' }
      }
      if (pin === 'sel') return { x: x + w / 2, y: y + h - (h * 0.15), side: 'bottom' }
      if (pin === 'out') return { x: x + w, y: y + h / 2, side: 'right' }
      break
    }
    case 'port':
    case 'dot':
    case 'text':
      return { x, y, side: e.dir === 'out' ? 'left' : 'right' }
    case 'box': {
      const p = (e.pins ?? []).find((pp) => pp.name === pin)
      if (p) {
        if (p.side === 'left') return { x, y: y + h * p.pos, side: 'left' }
        if (p.side === 'right') return { x: x + w, y: y + h * p.pos, side: 'right' }
        if (p.side === 'top') return { x: x + w * p.pos, y, side: 'top' }
        return { x: x + w * p.pos, y: y + h, side: 'bottom' }
      }
      break
    }
  }
  return { x, y: y + h / 2, side: 'right' }
}

export function parseRef(ref: string): { elem: string; pin: string } {
  const i = ref.lastIndexOf('.')
  if (i < 0) return { elem: ref, pin: 'p' }
  return { elem: ref.slice(0, i), pin: ref.slice(i + 1) }
}

/** 自動正交走線 */
export function routeWire(w: SchWire, a: PinPoint, b: PinPoint, elems: SchElement[]): [number, number][] {
  if (w.points && w.points.length) return [[a.x, a.y], ...w.points, [b.x, b.y]]
  const route = w.route ?? 'auto'
  if (route === 'direct') return [[a.x, a.y], [b.x, b.y]]
  const stub = 12
  // 出 pin 的第一段方向
  const ax = a.side === 'left' ? a.x - stub : a.side === 'right' ? a.x + stub : a.x
  const ay = a.side === 'top' ? a.y - stub : a.side === 'bottom' ? a.y + stub : a.y
  const bx = b.side === 'left' ? b.x - stub : b.side === 'right' ? b.x + stub : b.x
  const by = b.side === 'top' ? b.y - stub : b.side === 'bottom' ? b.y + stub : b.y
  const pts: [number, number][] = [[a.x, a.y]]
  if (a.side === 'left' || a.side === 'right') pts.push([ax, a.y])
  else pts.push([a.x, ay])
  const start = pts[pts.length - 1]
  const end: [number, number] = b.side === 'left' || b.side === 'right' ? [bx, b.y] : [b.x, by]
  const forward = (a.side === 'right' && end[0] >= start[0]) || (a.side === 'left' && end[0] <= start[0])
  if (route === 'hv') {
    pts.push([end[0], start[1]])
  } else if (route === 'vh') {
    pts.push([start[0], end[1]])
  } else if (a.side === 'top' || a.side === 'bottom' || b.side === 'top' || b.side === 'bottom') {
    // 垂直出發或垂直進入：走 V-H-V
    if (a.side === 'top' || a.side === 'bottom') {
      pts.push([start[0], end[1]])
    } else {
      pts.push([end[0], start[1]])
    }
  } else if (forward) {
    const midX = (start[0] + end[0]) / 2
    pts.push([midX, start[1]], [midX, end[1]])
  } else {
    // feedback：從右邊繞到下方 channel 再回左邊
    const bottom = Math.max(...elems.map((e) => e.y + elementSize(e).h)) + 22
    const chanY = Math.max(start[1], end[1], bottom)
    pts.push([start[0], chanY], [end[0], chanY])
  }
  pts.push(end, [b.x, b.y])
  // 去除重複點
  const out: [number, number][] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p)
  }
  return out
}
