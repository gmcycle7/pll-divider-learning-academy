import { describe, expect, it } from 'vitest'
import type { Schematic } from '@/components/circuit/schematic'
import type { TimingScenario } from '@/models/timing/types'

/**
 * 只收資料模組。必須用 glob 的負向樣式排除測試檔：
 * eager glob 會被編譯成靜態 import，執行期再過濾也已經把別的 suite 跑進來了。
 */
const modules = {
  ...import.meta.glob(['../lessons/**/*.ts', '../lessons/**/*.tsx', '!**/*.test.*'], { eager: true }),
  ...import.meta.glob(['../lab/**/*.ts', '../lab/**/*.tsx', '!**/*.test.*'], { eager: true }),
  ...import.meta.glob(['../pages/**/*.ts', '../pages/**/*.tsx', '!**/*.test.*'], { eager: true }),
  ...import.meta.glob(['../components/**/*.ts', '../components/**/*.tsx', '!**/*.test.*'], { eager: true }),
  ...import.meta.glob(['../models/**/*.ts', '!**/*.test.*'], { eager: true }),
}

function isSchematic(v: unknown): v is Schematic {
  const s = v as Schematic
  return !!s && typeof s === 'object' && typeof s.width === 'number' && typeof s.height === 'number' && Array.isArray(s.elements) && Array.isArray(s.wires)
}
function isScenario(v: unknown): v is TimingScenario {
  const s = v as TimingScenario
  return !!s && typeof s === 'object' && Array.isArray(s.paths) && isSchematic(s.schematic) && !!s.env
}

describe('schematic integrity', () => {
  it('actually discovers the project schematics and scenarios（避免空集合假通過）', () => {
    let schematics = 0
    let scenarios = 0
    for (const m of Object.values(modules)) {
      for (const val of Object.values(m as Record<string, unknown>)) {
        if (isScenario(val)) scenarios++
        else if (isSchematic(val)) schematics++
      }
    }
    // 實測 103 張電路圖 / 48 個 timing scenario（含定義在 .tsx 裡的）。
    // 門檻設在稍低處：glob 若再漏掉某一類檔案會立刻被抓到。
    expect(schematics).toBeGreaterThan(90)
    expect(scenarios).toBeGreaterThan(40)
  })

  it('every wire endpoint names an element that exists', () => {
    const bad: string[] = []
    for (const [path, m] of Object.entries(modules)) {
      for (const [name, val] of Object.entries(m as Record<string, unknown>)) {
        if (!isSchematic(val)) continue
        const ids = new Set(val.elements.map((e) => e.id))
        for (const w of val.wires) {
          for (const key of ['from', 'to'] as const) {
            const ref = w[key]
            const el = typeof ref === 'string' ? ref.slice(0, ref.lastIndexOf('.')) : ''
            if (!el || !ids.has(el)) bad.push(`${path} → ${name}: wire "${w.id}" ${key}="${String(ref)}"`)
          }
        }
      }
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([])
  })

  it('every element id is unique within a schematic', () => {
    const bad: string[] = []
    for (const [path, m] of Object.entries(modules)) {
      for (const [name, val] of Object.entries(m as Record<string, unknown>)) {
        if (!isSchematic(val)) continue
        const seen = new Set<string>()
        for (const e of val.elements) {
          if (seen.has(e.id)) bad.push(`${path} → ${name}: duplicate element id "${e.id}"`)
          seen.add(e.id)
        }
      }
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([])
  })

  it('timing-path segments reference wires/elements that exist in their own schematic', () => {
    const bad: string[] = []
    for (const [path, m] of Object.entries(modules)) {
      for (const [name, val] of Object.entries(m as Record<string, unknown>)) {
        if (!isScenario(val)) continue
        const wireIds = new Set(val.schematic.wires.map((w) => w.id))
        const elemIds = new Set(val.schematic.elements.map((e) => e.id))
        for (const p of val.paths) {
          for (const s of p.segments) {
            for (const w of s.wires ?? []) if (!wireIds.has(w)) bad.push(`${path} → ${name} / path "${p.id}" / seg "${s.id}": no wire "${w}"`)
            for (const e of s.elements ?? []) if (!elemIds.has(e)) bad.push(`${path} → ${name} / path "${p.id}" / seg "${s.id}": no element "${e}"`)
          }
          for (const ref of [p.launch.element, p.capture.element]) {
            if (!elemIds.has(ref)) bad.push(`${path} → ${name} / path "${p.id}": launch/capture element "${ref}" not in schematic`)
          }
        }
      }
    }
    expect(bad, `\n${bad.join('\n')}`).toEqual([])
  })
})
