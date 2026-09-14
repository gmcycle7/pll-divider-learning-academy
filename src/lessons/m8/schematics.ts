import type { SchElement, SchElementKind, Schematic, SchWire } from '@/components/circuit/schematic'
import { DFF_W, GATE_W, INV_W } from '@/components/circuit/schematic'

/* ------------------------------------------------------------------------------------------------
 * Module 8 的電路圖全部由 rowSchematic() 產生：
 *   - 所有 flop 排成一列（FF0 在左），共用 clk；
 *   - 每個 flop 的 D 由「slot gate」（畫在該 flop 左上方）或直接由另一個訊號驅動；
 *   - flop 的 Q / Q̄ 回授走圖上方的 channel（每個訊號一條水平線），再垂直落到 gate 的輸入 pin；
 *   - 中間 gate（aux）放在左側，輸出也走 channel 往右送；
 *   - clk bus 與 rst_n bus 走圖下方。
 * 交叉點若是真的接在一起，會畫一個 dot；沒有 dot 的交叉只是走線交錯。
 *
 * 元件 / 走線 id 規則（timing.ts 的 highlight 會用到）：
 *   flop：`ff${i}`；gate：spec 的 id；port：'clk' | 'rst' | 'out' | input 名稱
 *   wire：`w_${source}_${gateId}_in${m}`（回授進 gate）、`w_d${i}`（gate → FF D）、`w_${signal}_ff${i}`（直接 wire → D）、
 *         `w_clk${i}`、`w_rst${i}`、`w_out`
 * ---------------------------------------------------------------------------------------------- */

export interface RowGateSpec {
  id: string
  kind: Exclude<SchElementKind, 'dff' | 'tff' | 'latch' | 'mux2' | 'mux4' | 'mux8' | 'port' | 'box' | 'text' | 'dot'>
  label?: string
  /** 輸入來源：flop 的 q / qb 訊號名、其他 gate 的輸出訊號名、或 input port 名稱 */
  inputs: string[]
  /** 輸出訊號名 */
  out: string
  description?: string
  /** 中間 gate（不直接接 D）的手動位置；省略時視為 slot gate（由 flops[].from 指到） */
  x?: number
  y?: number
}

export interface RowFlopSpec {
  label: string
  q: string
  qb?: string
  d: string
  /** D 的來源：gate 的 out 訊號名（會畫成 slot gate）或直接的訊號名（畫成一條 wire） */
  from: string
  description?: string
}

export interface RowSpec {
  title?: string
  flops: RowFlopSpec[]
  gates: RowGateSpec[]
  /** 輸出訊號（必須是某個 flop 的 q） */
  output: string
  /** 是否畫 rst_n port 與非同步 reset 走線 */
  asyncReset?: boolean
  /** 額外的 input port（例如同步 reset 的 rst），會從左側以 channel 送到 gate */
  inputs?: string[]
  /** 第一個 flop 的 x（左側需要放 aux gate 時加大） */
  x0?: number
}

const GY = 64 // slot gate 的 y
const FY = 140 // flop 的 y
const DX = 230 // flop 間距
const CH0 = 6 // 第一條 channel 的 y
const CHS = 11 // channel 間距
const RSTY = FY + DFF_W + 8 + 4 // 224：rst_n bus（DFF_H = 72 → rstn pin 在 FY+72 = 212）
const CLKY = RSTY + 20 // 244：clk bus

export function rowSchematic(spec: RowSpec): Schematic {
  const X0 = spec.x0 ?? 170
  const n = spec.flops.length
  const fx = (i: number) => X0 + i * DX
  const elements: SchElement[] = []
  const wires: SchWire[] = []
  const dots: [number, number][] = []

  // ---- flops
  spec.flops.forEach((f, i) => {
    elements.push({ id: `ff${i}`, kind: 'dff', x: fx(i), y: FY, label: f.label, edge: 'rising', signal: f.q, description: f.description ?? `rising-edge DFF；state bit ${f.q}` })
  })
  const outFlop = spec.flops.findIndex((f) => f.q === spec.output)
  const lastX = fx(n - 1) + DFF_W
  const outPortX = lastX + 96
  elements.push({ id: 'out', kind: 'port', x: outPortX, y: FY + 20, text: 'div_out', dir: 'out', description: `output = ${spec.output}` })
  wires.push({ id: 'w_out', from: `ff${outFlop}.q`, to: 'out.p', signal: spec.output, kind: 'output', points: [[outPortX - 20, FY + 20]] })

  // ---- clock
  elements.push({ id: 'clk', kind: 'port', x: 40, y: FY + 52, text: 'clk', dir: 'in', description: 'input clock' })
  wires.push({ id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' })
  if (n > 1) dots.push([X0 - 30, FY + 52])
  for (let i = 1; i < n; i++) {
    wires.push({ id: `w_clk${i}`, from: 'clk.p', to: `ff${i}.clk`, signal: 'clk', kind: 'clock', noArrow: false, points: [[X0 - 30, FY + 52], [X0 - 30, CLKY], [fx(i) - 24, CLKY], [fx(i) - 24, FY + 52]], labelAt: 0.55 })
    if (i < n - 1) dots.push([fx(i) - 24, CLKY])
  }

  // ---- async reset
  if (spec.asyncReset) {
    elements.push({ id: 'rst', kind: 'port', x: 40, y: RSTY, text: 'rst_n', dir: 'in', description: 'async reset（active low）：拉低時所有 flop 立即清成 reset value' })
    for (let i = 0; i < n; i++) {
      wires.push({ id: `w_rst${i}`, from: 'rst.p', to: `ff${i}.rstn`, signal: 'rst_n', kind: 'reset', points: [[fx(i) + DFF_W / 2, RSTY]], labelAt: i === n - 1 ? 0.3 : 0.9 })
      if (i < n - 1) dots.push([fx(i) + DFF_W / 2, RSTY])
    }
  }

  // ---- gate placement
  const slotOfOut = new Map<string, number>() // gate out → flop index（slot gate）
  spec.flops.forEach((f, i) => {
    if (spec.gates.some((g) => g.out === f.from)) slotOfOut.set(f.from, i)
  })
  const gatePos = new Map<string, { x: number; y: number; w: number; h: number }>()
  for (const g of spec.gates) {
    const isInv = g.kind === 'inv' || g.kind === 'buf'
    const w = isInv ? INV_W : GATE_W
    const h = isInv ? 24 : 40
    const slot = slotOfOut.get(g.out)
    let x: number
    let y: number
    if (slot !== undefined && g.x === undefined) {
      x = fx(slot) - 120
      y = isInv ? GY + 8 : GY
    } else {
      x = g.x ?? 30
      y = g.y ?? GY
    }
    gatePos.set(g.id, { x, y, w, h })
    elements.push({ id: g.id, kind: g.kind, x, y, label: g.label ?? g.kind.toUpperCase(), description: g.description })
  }
  const outToGate = new Map(spec.gates.map((g) => [g.out, g]))

  // ---- D inputs
  spec.flops.forEach((f, i) => {
    const g = outToGate.get(f.from)
    const dPin = `ff${i}.d`
    if (g && slotOfOut.get(f.from) === i) {
      const p = gatePos.get(g.id)!
      const oy = p.y + p.h / 2
      wires.push({ id: `w_d${i}`, from: `${g.id}.out`, to: dPin, signal: f.d, kind: 'feedback', points: [[fx(i) - 44, oy], [fx(i) - 44, FY + 20]], labelAt: 0.5 })
    } else {
      // 直接由某個 flop 的 q 驅動
      const src = spec.flops.findIndex((ff) => ff.q === f.from || ff.qb === f.from)
      if (src >= 0) {
        const pin = spec.flops[src].q === f.from ? 'q' : 'qb'
        wires.push({ id: `w_${f.from}_ff${i}`, from: `ff${src}.${pin}`, to: dPin, signal: f.from, kind: 'feedback', route: 'hv', labelAt: 0.5 })
      }
    }
  })

  // ---- channel sources：flop q/qb（從右側往左送）、aux gate 輸出與 input port（從左側往右送）
  const chY = new Map<string, number>()
  const nextCh = () => CH0 + chY.size * CHS
  type Consumer = { gateId: string; m: number; pinX: number; pinY: number; dropX: number }
  const consumers = new Map<string, Consumer[]>()
  for (const g of spec.gates) {
    const p = gatePos.get(g.id)!
    const cnt = g.inputs.length
    g.inputs.forEach((src, m) => {
      const isInv = g.kind === 'inv' || g.kind === 'buf'
      const pinY = isInv ? p.y + p.h / 2 : p.y + (p.h * (m + 1)) / (cnt + 1)
      const c: Consumer = { gateId: g.id, m, pinX: p.x, pinY, dropX: p.x - 8 - 8 * m }
      const arr = consumers.get(src) ?? []
      arr.push(c)
      consumers.set(src, arr)
    })
  }
  const inputPorts = spec.inputs ?? []
  const order = [
    ...spec.flops.flatMap((f) => [f.q, ...(f.qb ? [f.qb] : [])]),
    ...inputPorts,
    ...spec.gates.filter((g) => !slotOfOut.has(g.out)).map((g) => g.out),
  ]
  for (const src of order) {
    const cs = consumers.get(src)
    if (!cs || cs.length === 0) continue
    const y = nextCh()
    chY.set(src, y)
    const flopIdx = spec.flops.findIndex((f) => f.q === src || f.qb === src)
    if (flopIdx >= 0) {
      // 從右側：riser 由 pin 往上到 channel，再往左
      const f = spec.flops[flopIdx]
      const isQ = f.q === src
      const pinY = FY + (isQ ? 20 : 52)
      const riserX = fx(flopIdx) + DFF_W + (isQ ? 14 : 26)
      const sorted = [...cs].sort((a, b) => b.dropX - a.dropX) // 右→左
      // q 若同時直接接下一級 D 或輸出，riser 底部是 junction
      const qUsedStraight = isQ && (spec.flops.some((ff) => ff.from === src) || spec.output === src)
      if (qUsedStraight) dots.push([riserX, pinY])
      sorted.forEach((c, k) => {
        wires.push({
          id: `w_${src}_${c.gateId}_in${c.m}`,
          from: `ff${flopIdx}.${isQ ? 'q' : 'qb'}`,
          to: `${c.gateId}.in${c.m}`,
          signal: src,
          kind: 'feedback',
          points: [[riserX, pinY], [riserX, y], [c.dropX, y], [c.dropX, c.pinY]],
          labelAt: k === sorted.length - 1 ? 0.62 : 0.3,
        })
        if (k < sorted.length - 1) dots.push([c.dropX, y])
      })
    } else if (inputPorts.includes(src)) {
      // input port：放在左上，沿 channel 往右
      elements.push({ id: src, kind: 'port', x: 40, y, text: src, dir: 'in', description: `input ${src}` })
      const sorted = [...cs].sort((a, b) => a.dropX - b.dropX) // 左→右
      sorted.forEach((c, k) => {
        wires.push({ id: `w_${src}_${c.gateId}_in${c.m}`, from: `${src}.p`, to: `${c.gateId}.in${c.m}`, signal: src, kind: 'control', points: [[c.dropX, y], [c.dropX, c.pinY]], labelAt: k === sorted.length - 1 ? 0.5 : 0.2 })
        if (k < sorted.length - 1) dots.push([c.dropX, y])
      })
    } else {
      // aux gate 輸出：從 gate 右邊出來，往上到 channel，沿 channel 往右
      const g = outToGate.get(src)!
      const p = gatePos.get(g.id)!
      const ox = p.x + p.w
      const oy = p.y + p.h / 2
      const upX = ox + 10
      const sorted = [...cs].sort((a, b) => a.dropX - b.dropX)
      sorted.forEach((c, k) => {
        const direct = c.dropX > upX && c.pinY > oy - 1 && Math.abs(c.pinY - oy) < 30
        const pts: [number, number][] = direct ? [[upX, oy], [upX, c.pinY]] : [[upX, oy], [upX, y], [c.dropX, y], [c.dropX, c.pinY]]
        wires.push({ id: `w_${src}_${c.gateId}_in${c.m}`, from: `${g.id}.out`, to: `${c.gateId}.in${c.m}`, signal: src, kind: 'feedback', points: pts, labelAt: 0.5 })
        if (k < sorted.length - 1) dots.push([c.dropX, y])
      })
    }
  }

  dots.forEach(([x, y], i) => elements.push({ id: `dot${i}`, kind: 'dot', x, y }))
  return { width: outPortX + 40, height: CLKY + 18, title: spec.title, elements, wires }
}

/* ------------------------------------------------------------------------------------------------
 * 具體電路
 * ---------------------------------------------------------------------------------------------- */

/** div2NoReset（examples）：Q̄ 直接接回 D，沒有 rst_n。每一個 state 都合法，只有相位不確定。 */
export const div2NoResetSch: Schematic = {
  width: 380,
  height: 170,
  title: '/2（無 reset）：d0 = q̄0',
  elements: [
    { id: 'clk', kind: 'port', x: 40, y: 92, text: 'clk', dir: 'in', description: 'input clock' },
    { id: 'ff0', kind: 'dff', x: 140, y: 40, label: 'FF0', edge: 'rising', signal: 'q0', description: 'rising-edge DFF；state bit q0。沒有 reset pin：上電值由雜訊決定' },
    { id: 'out', kind: 'port', x: 340, y: 60, text: 'div_out', dir: 'out', description: 'output = q0' },
  ],
  wires: [
    { id: 'w_clk', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
    { id: 'w_q', from: 'ff0.q', to: 'out.p', signal: 'q0', kind: 'output' },
    { id: 'w_qb_d', from: 'ff0.qb', to: 'ff0.d', signal: 'q0_b', kind: 'feedback', points: [[232, 92], [232, 140], [116, 140], [116, 60]], labelAt: 0.55 },
  ],
}

/** div3（examples）：d0 = NOR(q1, q0)，d1 = q0；含 rst_n */
export const div3Sch = rowSchematic({
  title: '/3：d0 = NOR(q1, q0)，d1 = q0',
  flops: [
    { label: 'FF0', q: 'q0', d: 'd0', from: 'd0' },
    { label: 'FF1', q: 'q1', d: 'd1', from: 'q0' },
  ],
  gates: [{ id: 'nor', kind: 'nor', label: 'NOR', inputs: ['q0', 'q1'], out: 'd0', description: 'd0 = NOT(q1 OR q0)' }],
  output: 'q1',
  asyncReset: true,
})

/** div3Lockup（examples）：d0 = XNOR(q1, q0)，d1 = q0；11 → 11 */
export const div3LockupSch = rowSchematic({
  title: '/3（lock-up）：d0 = XNOR(q1, q0)，d1 = q0',
  flops: [
    { label: 'FF0', q: 'q0', d: 'd0', from: 'd0' },
    { label: 'FF1', q: 'q1', d: 'd1', from: 'q0' },
  ],
  gates: [{ id: 'xnor', kind: 'xnor', label: 'XNOR', inputs: ['q0', 'q1'], out: 'd0', description: 'd0 = XNOR(q1, q0)：11 時 d0 = 1' }],
  output: 'q1',
  asyncReset: true,
})

/** div3RecoverQb：d0 = NOR(q1, q0)，d1 = q0 AND q1_b（用 FF1 的 Q̄） */
export const div3RecoverSch = rowSchematic({
  title: '/3（self-recovering）：d0 = NOR(q1, q0)，d1 = q0 AND q̄1',
  flops: [
    { label: 'FF0', q: 'q0', d: 'd0', from: 'd0' },
    { label: 'FF1', q: 'q1', qb: 'q1_b', d: 'd1', from: 'd1' },
  ],
  gates: [
    { id: 'nor', kind: 'nor', label: 'NOR', inputs: ['q0', 'q1'], out: 'd0', description: 'd0 = NOT(q1 OR q0)' },
    { id: 'and', kind: 'and', label: 'AND', inputs: ['q1_b', 'q0'], out: 'd1', description: 'd1 = q0 AND q̄1：新增的 gate，讓 11 → 00' },
  ],
  output: 'q1',
  asyncReset: true,
})

/** div3AsyncRst：與 div3Lockup 相同的邏輯，rst_n 可手動控制 */
export const div3AsyncRstSch = rowSchematic({
  title: '/3（lock-up）＋ 非同步 reset',
  flops: [
    { label: 'FF0', q: 'q0', d: 'd0', from: 'd0' },
    { label: 'FF1', q: 'q1', d: 'd1', from: 'q0' },
  ],
  gates: [{ id: 'xnor', kind: 'xnor', label: 'XNOR', inputs: ['q0', 'q1'], out: 'd0' }],
  output: 'q1',
  asyncReset: true,
})

/** div3SyncRst：rst 走 data path（INV → AND） */
export const div3SyncRstSch = rowSchematic({
  title: '/3（lock-up）＋ 同步 reset：d = next AND NOT rst',
  x0: 250,
  flops: [
    { label: 'FF0', q: 'q0', d: 'd0', from: 'd0' },
    { label: 'FF1', q: 'q1', d: 'd1', from: 'd1' },
  ],
  gates: [
    { id: 'inv', kind: 'inv', label: 'INV', inputs: ['rst'], out: 'rst_b', x: 40, y: 92, description: 'rst_b = NOT rst' },
    { id: 'xnor', kind: 'xnor', label: 'XNOR', inputs: ['q0', 'q1'], out: 'n0', x: 24, y: 128, description: 'n0 = XNOR(q1, q0)：原本的 next-state' },
    { id: 'and0', kind: 'and', label: 'AND0', inputs: ['n0', 'rst_b'], out: 'd0', description: 'd0 = n0 AND rst_b' },
    { id: 'and1', kind: 'and', label: 'AND1', inputs: ['q0', 'rst_b'], out: 'd1', description: 'd1 = q0 AND rst_b' },
  ],
  output: 'q1',
  inputs: ['rst'],
})

/** div5Lockup：d0 = NOR(q2, q1 AND q0)，d1 = q0，d2 = q1 */
export const div5LockupSch = rowSchematic({
  title: 'Twisted-ring /5：d0 = NOR(q2, q1·q0)，d1 = q0，d2 = q1',
  x0: 250,
  flops: [
    { label: 'FF0', q: 'q0', d: 'd0', from: 'd0' },
    { label: 'FF1', q: 'q1', d: 'd1', from: 'q0' },
    { label: 'FF2', q: 'q2', qb: 'q2_b', d: 'd2', from: 'q1' },
  ],
  gates: [
    { id: 'and10', kind: 'and', label: 'AND', inputs: ['q1', 'q0'], out: 'a10', x: 24, y: 128, description: 'a10 = q1 AND q0：偵測 011，擋住 011 → 111' },
    { id: 'nor', kind: 'nor', label: 'NOR', inputs: ['q2', 'a10'], out: 'd0', description: 'd0 = NOR(q2, a10)' },
  ],
  output: 'q2',
  asyncReset: true,
})

/** div5Recover：多一個 AND2：d1 = q0 AND q̄2 */
export const div5RecoverSch = rowSchematic({
  title: 'Twisted-ring /5（self-recovering）：d1 = q0 AND q̄2',
  x0: 250,
  flops: [
    { label: 'FF0', q: 'q0', d: 'd0', from: 'd0' },
    { label: 'FF1', q: 'q1', d: 'd1', from: 'd1' },
    { label: 'FF2', q: 'q2', qb: 'q2_b', d: 'd2', from: 'q1' },
  ],
  gates: [
    { id: 'and10', kind: 'and', label: 'AND', inputs: ['q1', 'q0'], out: 'a10', x: 24, y: 128, description: 'a10 = q1 AND q0' },
    { id: 'nor', kind: 'nor', label: 'NOR', inputs: ['q2', 'a10'], out: 'd0', description: 'd0 = NOR(q2, a10)' },
    { id: 'and2', kind: 'and', label: 'AND2', inputs: ['q2_b', 'q0'], out: 'd1', description: 'd1 = q0 AND q̄2：新增的 gate，把 101 送回 000' },
  ],
  output: 'q2',
  asyncReset: true,
})

/** div5RecoverAlt：d0 = NOR(q2, q1) */
export const div5RecoverAltSch = rowSchematic({
  title: 'Twisted-ring /5（重新化簡）：d0 = NOR(q2, q1)',
  flops: [
    { label: 'FF0', q: 'q0', d: 'd0', from: 'd0' },
    { label: 'FF1', q: 'q1', d: 'd1', from: 'q0' },
    { label: 'FF2', q: 'q2', d: 'd2', from: 'q1' },
  ],
  gates: [{ id: 'nor', kind: 'nor', label: 'NOR', inputs: ['q2', 'q1'], out: 'd0', description: 'd0 = NOR(q2, q1)' }],
  output: 'q2',
  asyncReset: true,
})

/** mystery3：d2 = AND(q̄2, q1)（用 FF2 的 Q̄），d1 = XOR(q2, q0)，d0 = NOT q0 */
export const mystery3Sch = rowSchematic({
  title: '陌生 3-bit counter',
  flops: [
    { label: 'FF0', q: 'q0', d: 'd0', from: 'd0' },
    { label: 'FF1', q: 'q1', d: 'd1', from: 'd1' },
    { label: 'FF2', q: 'q2', qb: 'q2_b', d: 'd2', from: 'd2' },
  ],
  gates: [
    { id: 'inv', kind: 'inv', label: 'INV', inputs: ['q0'], out: 'd0', description: 'd0 = NOT q0' },
    { id: 'xor', kind: 'xor', label: 'XOR', inputs: ['q2', 'q0'], out: 'd1', description: 'd1 = q2 XOR q0' },
    { id: 'and', kind: 'and', label: 'AND', inputs: ['q2_b', 'q1'], out: 'd2', description: 'd2 = q̄2 AND q1' },
  ],
  output: 'q2',
  asyncReset: true,
})

/** Gray /3 練習：用 box 表示可替換的 next-state logic（equation 由使用者選） */
export function grayDiv3BoxSchematic(d1Text: string, d0Text: string): Schematic {
  return {
    width: 560,
    height: 250,
    title: 'Gray-code /3：next-state logic 可替換',
    elements: [
      { id: 'clk', kind: 'port', x: 40, y: 192, text: 'clk', dir: 'in' },
      { id: 'rst', kind: 'port', x: 40, y: 224, text: 'rst_n', dir: 'in' },
      { id: 'logic', kind: 'box', x: 60, y: 30, w: 150, h: 70, text: `d1 = ${d1Text}\nd0 = ${d0Text}`, label: 'next-state logic', pins: [{ name: 'q0', side: 'left', pos: 0.3 }, { name: 'q1', side: 'left', pos: 0.7 }, { name: 'd1', side: 'right', pos: 0.3 }, { name: 'd0', side: 'right', pos: 0.7 }] },
      { id: 'ff0', kind: 'dff', x: 260, y: 140, label: 'FF0', edge: 'rising', signal: 'q0' },
      { id: 'ff1', kind: 'dff', x: 420, y: 140, label: 'FF1', edge: 'rising', signal: 'q1' },
      { id: 'out', kind: 'port', x: 540, y: 160, text: 'div_out', dir: 'out' },
    ],
    wires: [
      { id: 'w_clk0', from: 'clk.p', to: 'ff0.clk', signal: 'clk', kind: 'clock' },
      { id: 'w_clk1', from: 'clk.p', to: 'ff1.clk', signal: 'clk', kind: 'clock', points: [[236, 192], [236, 244], [400, 244], [400, 192]] },
      { id: 'w_rst0', from: 'rst.p', to: 'ff0.rstn', kind: 'reset', points: [[292, 224]] },
      { id: 'w_rst1', from: 'rst.p', to: 'ff1.rstn', kind: 'reset', points: [[452, 224]] },
      { id: 'w_d0', from: 'logic.d0', to: 'ff0.d', signal: 'd0', kind: 'feedback', points: [[240, 79], [240, 160]] },
      { id: 'w_d1', from: 'logic.d1', to: 'ff1.d', signal: 'd1', kind: 'feedback', points: [[380, 51], [380, 160]] },
      { id: 'w_q0', from: 'ff0.q', to: 'logic.q0', signal: 'q0', kind: 'feedback', points: [[344, 160], [344, 14], [40, 14], [40, 51]] },
      { id: 'w_q1', from: 'ff1.q', to: 'logic.q1', signal: 'q1', kind: 'feedback', points: [[504, 160], [504, 4], [28, 4], [28, 79]] },
      { id: 'w_out', from: 'ff1.q', to: 'out.p', signal: 'q1', kind: 'output' },
    ],
  }
}

/* ------------------------------------------------------------------------------------------------
 * Timing 用：async reset 加上 reset synchronizer（RS），reset 的 de-assert 由 RS 在 clk edge 送出
 * ---------------------------------------------------------------------------------------------- */
export const asyncResetTimingSch: Schematic = (() => {
  const base = rowSchematic({
    title: '/3 + 非同步 reset（reset de-assert 由 synchronizer RS 送出）',
    flops: [
      { label: 'FF0', q: 'q0', d: 'd0', from: 'd0' },
      { label: 'FF1', q: 'q1', d: 'd1', from: 'q0' },
    ],
    gates: [{ id: 'nor', kind: 'nor', label: 'NOR', inputs: ['q0', 'q1'], out: 'd0', description: 'd0 = NOT(q1 OR q0)' }],
    output: 'q1',
    asyncReset: false,
  })
  const rsX = base.width - 20
  const rsY = RSTY + 30
  const elements: SchElement[] = [
    ...base.elements,
    { id: 'rst_in', kind: 'port', x: rsX + 150, y: rsY + 20, text: 'rst_n_async', dir: 'in', description: '外部非同步 reset（assert 立即、de-assert 經 RS 同步）' },
    { id: 'rs', kind: 'dff', x: rsX + 40, y: rsY, label: 'RS（reset synchronizer）', edge: 'rising', description: 'reset synchronizer：clk edge 時把 rst_n_async 抓進來，de-assert 因此對齊 clk' },
    { id: 'buf', kind: 'buf', x: rsX - 60, y: rsY + 8, label: 'BUF', description: 'reset tree buffer' },
  ]
  const wires: SchWire[] = [
    ...base.wires,
    { id: 'w_rst_in', from: 'rst_in.p', to: 'rs.d', signal: 'rst_n_async', kind: 'reset', route: 'direct' },
    { id: 'w_rs_clk', from: 'clk.p', to: 'rs.clk', signal: 'clk', kind: 'clock', points: [[170 - 30, FY + 52], [170 - 30, CLKY], [rsX + 20, CLKY], [rsX + 20, rsY + 52]] },
    // RS.q 從右邊出來，繞到 BUF 的左邊
    { id: 'w_rs_q', from: 'rs.q', to: 'buf.in0', signal: 'rst_n', kind: 'reset', points: [[rsX + 120, rsY + 20], [rsX + 120, rsY + 90], [rsX - 80, rsY + 90], [rsX - 80, rsY + 20]] },
    { id: 'w_rst0', from: 'buf.out', to: 'ff0.rstn', signal: 'rst_n', kind: 'reset', points: [[rsX - 12, rsY + 20], [rsX - 12, RSTY], [170 + DFF_W / 2, RSTY]] },
    { id: 'w_rst1', from: 'buf.out', to: 'ff1.rstn', signal: 'rst_n', kind: 'reset', points: [[rsX - 12, rsY + 20], [rsX - 12, RSTY], [170 + DX + DFF_W / 2, RSTY]] },
  ]
  return { ...base, width: rsX + 250, height: rsY + 110, elements: [...elements, { id: 'dot_rst', kind: 'dot', x: 170 + DX + DFF_W / 2, y: RSTY }], wires }
})()

export { GY as ROW_GATE_Y, FY as ROW_FLOP_Y }
